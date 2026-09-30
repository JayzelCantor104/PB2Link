<?php
// Admin: move an amenity booking through its workflow.
//   POST JSON { request_id, status: Approved|Declined|Completed|Cancelled, remarks? }
// Allowed changes are PB2_AMENITY_TRANSITIONS (amenity_common.php). Approving
// re-checks the slot/stock and auto-declines Pending bookings it now blocks.
header("Content-Type: application/json");
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
$admin = pb2_require_admin();
$admin_id = (int)$admin['admin_id'];

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/amenity_common.php';
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$request_id = (int)($data['request_id'] ?? 0);
$status = (string)($data['status'] ?? '');
$remarks = trim((string)($data['remarks'] ?? ''));
$fail = function ($msg) { echo json_encode(['success' => false, 'message' => $msg]); exit(); };

if (!$request_id) $fail('Missing booking.');
if (!in_array($status, ['Approved', 'Declined', 'Completed', 'Cancelled'], true)) $fail('Invalid status.');
if (mb_strlen($remarks) > 1000) $fail('Remarks are too long.');

$conn->begin_transaction();
try {
    $booking = pb2_amenity_load($conn, $request_id);
    if (!$booking) { $conn->rollback(); $fail('Booking not found.'); }

    // Lock the amenity so a concurrent approval can't double-book it.
    $lock = $conn->prepare("SELECT amenity_id FROM amenities WHERE amenity_id = ? FOR UPDATE");
    $lock->bind_param("i", $booking['amenity_id']);
    $lock->execute();
    $lock->close();

    $old = $booking['status'];
    if (!in_array($status, PB2_AMENITY_TRANSITIONS[$old] ?? [], true)) {
        $conn->rollback();
        $fail("This booking is already $old, so it can't be changed to $status.");
    }

    $auto_declined = [];
    if ($status === 'Approved') {
        if ($booking['category'] === 'Equipment') {
            if ($booking['total_quantity'] !== null) {
                $approved = pb2_amenity_reserved_qty($conn, $booking['amenity_id'], $booking['reservation_date'], $request_id, ['Approved']);
                if ($approved + (int)$booking['quantity'] > (int)$booking['total_quantity']) {
                    $conn->rollback();
                    $fail('Not enough units left for that date to approve this booking.');
                }
            }
        } elseif ($booking['start_time'] && $booking['end_time']) {
            $clashes = pb2_amenity_overlaps($conn, $booking['amenity_id'], $booking['reservation_date'], $booking['start_time'], $booking['end_time'], $request_id);
            foreach ($clashes as $c) {
                if ($c['status'] === 'Approved') {
                    $conn->rollback();
                    $fail('This time overlaps an already approved booking (' . $c['tracking_code'] . ').');
                }
            }
            // Pending bookings this approval now blocks are declined automatically.
            foreach ($clashes as $c) {
                $auto_declined[] = (int)$c['request_id'];
            }
        }
    }

    $upd = $conn->prepare("UPDATE req_amenity_reservation
        SET status = ?, remarks = COALESCE(NULLIF(?, ''), remarks), processed_by = ?, processed_at = NOW(),
            date_claimed = IF(? = 'Completed', NOW(), date_claimed)
        WHERE request_id = ?");
    $upd->bind_param("ssisi", $status, $remarks, $admin_id, $status, $request_id);
    $upd->execute();
    $upd->close();

    if ($auto_declined) {
        $ids = implode(',', $auto_declined);
        $note = "[Auto-declined: time was given to " . $conn->real_escape_string($booking['tracking_code']) . "]";
        $conn->query("UPDATE req_amenity_reservation
            SET status = 'Declined', processed_by = $admin_id, processed_at = NOW(),
                remarks = CONCAT_WS(' ', NULLIF(remarks, ''), '$note')
            WHERE request_id IN ($ids) AND status = 'Pending'");
    }
    $conn->commit();
} catch (Throwable $ex) {
    $conn->rollback();
    error_log('update_reservation_status.php: ' . $ex->getMessage());
    $fail('Unable to update the booking.');
}

$changed = [['field' => 'status', 'old_value' => $old, 'new_value' => $status]];
if ($auto_declined) $changed[] = ['field' => 'auto_declined_bookings', 'old_value' => null, 'new_value' => implode(',', $auto_declined)];
pb2_log_admin_action('amenity_reservation.status.update', 'amenity_reservation', (string)$request_id,
    "Changed amenity booking [{$booking['tracking_code']}] from $old to $status", $changed);

// Notify the resident (and anyone auto-declined).
$fresh = pb2_amenity_load($conn, $request_id);
$e = function ($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); };
$note = $remarks !== '' ? "<br><br><em>Message from the barangay:</em> " . $e($remarks) : '';
$copy = [
    'Approved'  => ['Booking Approved', 'Your booking has been <strong>approved</strong>. Please bring a valid ID on the day.', '#059669'],
    'Declined'  => ['Booking Declined', 'Unfortunately your booking was <strong>declined</strong>.', '#dc2626'],
    'Completed' => ['Booking Completed', 'Your booking has been marked as <strong>completed</strong>. Thank you!', '#0369a1'],
    'Cancelled' => ['Booking Cancelled', 'Your booking has been <strong>cancelled</strong> by the barangay.', '#64748b'],
][$status];
if ($fresh) pb2_amenity_email($fresh, $copy[0], $copy[0], $copy[1] . $note, $copy[2]);
foreach ($auto_declined as $id) {
    $other = pb2_amenity_load($conn, $id);
    if ($other) pb2_amenity_email($other, 'Booking Declined', 'Booking Declined',
        'Unfortunately your booking was <strong>declined</strong> because the time was given to another approved booking. Please book a different time.', '#dc2626');
}

echo json_encode([
    'success' => true,
    'message' => "Booking marked as $status." . ($auto_declined ? ' ' . count($auto_declined) . ' overlapping pending request(s) were declined.' : ''),
    'auto_declined' => count($auto_declined),
]);
