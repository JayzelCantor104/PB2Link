<?php
// Admin: extend an approved Venue/Vehicle booking (overtime) — src/Admin/AmenityDetail.jsx.
//   POST JSON { request_id, extend_hours: 1-6 }
// Moves end_time later for real (so the extra time blocks other bookings),
// refusing when it would run past closing time or into another booking.
// Status changes go through update_reservation_status.php.
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

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/amenity_common.php';
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$request_id = (int)($data['request_id'] ?? 0);
$hours = (int)($data['extend_hours'] ?? 0);
$in_tx = false;
$fail = function ($msg) use ($conn, &$in_tx) {
    if ($in_tx) $conn->rollback();
    echo json_encode(['success' => false, 'message' => $msg]);
    exit();
};

if (!$request_id) $fail('Missing booking.');
if ($hours < 1 || $hours > 6) $fail('Overtime must be between 1 and 6 hours.');

$conn->begin_transaction();
$in_tx = true;
$booking = pb2_amenity_load($conn, $request_id);
if (!$booking) $fail('Booking not found.');

$lock = $conn->prepare("SELECT amenity_id FROM amenities WHERE amenity_id = ? FOR UPDATE");
$lock->bind_param("i", $booking['amenity_id']);
$lock->execute();
$lock->close();

if ($booking['status'] !== 'Approved') $fail('Only approved bookings can be extended.');
if ($booking['category'] === 'Equipment' || !$booking['start_time'] || !$booking['end_time']) {
    $fail('Overtime applies to timed bookings (venues and vehicles) only.');
}

$old_end = $booking['end_time'];
$end_secs = strtotime("1970-01-01 $old_end UTC") + $hours * 3600;
$close_secs = strtotime("1970-01-01 {$booking['close_time']} UTC");
$new_end = gmdate('H:i:s', $end_secs);
if ($end_secs > $close_secs) {
    $fail('Overtime would run past closing time (' . substr($booking['close_time'], 0, 5) . ').');
}

$clashes = pb2_amenity_overlaps($conn, $booking['amenity_id'], $booking['reservation_date'], $old_end, $new_end, $request_id);
if ($clashes) {
    $list = implode(', ', array_map(function ($c) {
        return $c['tracking_code'] . ' (' . substr($c['start_time'], 0, 5) . '–' . substr($c['end_time'], 0, 5) . ', ' . $c['status'] . ')';
    }, $clashes));
    $fail("The extra time overlaps another booking: $list.");
}

$old_slot = $booking['time_slot'];
$new_slot = pb2_amenity_label($booking['start_time'], $new_end);
$upd = $conn->prepare("UPDATE req_amenity_reservation SET end_time = ?, time_slot = ? WHERE request_id = ?");
$upd->bind_param("ssi", $new_end, $new_slot, $request_id);
if (!$upd->execute()) {
    error_log('update_amenity.php: ' . $upd->error);
    $fail('Unable to extend the booking.');
}
$upd->close();
$conn->commit();
$in_tx = false;

pb2_log_admin_action('amenity_reservation.overtime', 'amenity_reservation', (string)$request_id,
    "Extended amenity booking [{$booking['tracking_code']}] by $hours hour(s)",
    [['field' => 'time_slot', 'old_value' => $old_slot, 'new_value' => $new_slot]]);

echo json_encode([
    'success' => true,
    'message' => "Extended by $hours hour(s). New time: $new_slot.",
    'time_slot' => $new_slot,
    'end_time' => substr($new_end, 0, 5),
]);
