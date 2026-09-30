<?php
// Shared amenity-booking rules, used by submit_amenity_reservation.php,
// get_amenity_availability.php, update_reservation_status.php,
// update_amenity.php (overtime) and cancel_amenity_reservation.php, so every
// path enforces the same overlap / stock / status logic.
// Schema: backend/migrations/009_amenity_booking.sql

// Bookings that hold a slot or stock.
const PB2_AMENITY_HOLDING = ['Pending', 'Approved'];

// Allowed status changes. Cancelled is also reachable by the resident
// (cancel_amenity_reservation.php) while a booking is still Pending.
const PB2_AMENITY_TRANSITIONS = [
    'Pending'  => ['Approved', 'Declined', 'Cancelled'],
    'Approved' => ['Completed', 'Cancelled'],
];

// "8:00" / "08:00" / "08:00:00" -> "08:00:00", or null when not a valid time.
function pb2_amenity_time($value) {
    $value = trim((string)$value);
    if (!preg_match('/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/', $value, $m)) return null;
    return sprintf('%02d:%02d:00', (int)$m[1], (int)$m[2]);
}

function pb2_amenity_label($start, $end) {
    return ($start && $end) ? substr($start, 0, 5) . ' - ' . substr($end, 0, 5) : 'Whole Day';
}

// Holding bookings of this amenity/date whose time range overlaps [start, end).
function pb2_amenity_overlaps($conn, $amenity_id, $date, $start, $end, $exclude_id = 0) {
    $stmt = $conn->prepare("SELECT request_id, tracking_code, start_time, end_time, status
        FROM req_amenity_reservation
        WHERE amenity_id = ? AND reservation_date = ? AND request_id <> ?
          AND status IN ('Pending','Approved')
          AND start_time IS NOT NULL AND end_time IS NOT NULL
          AND start_time < ? AND end_time > ?");
    $stmt->bind_param("isiss", $amenity_id, $date, $exclude_id, $end, $start);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}

// Units of an equipment amenity already held for a date.
function pb2_amenity_reserved_qty($conn, $amenity_id, $date, $exclude_id = 0, $statuses = PB2_AMENITY_HOLDING) {
    $in = "'" . implode("','", $statuses) . "'";
    $stmt = $conn->prepare("SELECT COALESCE(SUM(quantity), 0) AS qty FROM req_amenity_reservation
        WHERE amenity_id = ? AND reservation_date = ? AND request_id <> ? AND status IN ($in)");
    $stmt->bind_param("isi", $amenity_id, $date, $exclude_id);
    $stmt->execute();
    $qty = (int)$stmt->get_result()->fetch_assoc()['qty'];
    $stmt->close();
    return $qty;
}

// Booking + amenity + resident email in one row.
function pb2_amenity_load($conn, $request_id) {
    $stmt = $conn->prepare("SELECT ar.*, a.name AS amenity_name, a.category, a.total_quantity, a.open_time, a.close_time,
               u.email AS resident_email
        FROM req_amenity_reservation ar
        JOIN amenities a ON a.amenity_id = ar.amenity_id
        JOIN residents r ON r.resident_id = ar.resident_id
        LEFT JOIN users u ON u.user_id = r.user_id
        WHERE ar.request_id = ?");
    $stmt->bind_param("i", $request_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

// Best-effort email to the resident about their booking.
function pb2_amenity_email($booking, $subject_suffix, $headline, $message_html, $color = '#059669') {
    if (empty($booking['resident_email']) || !defined('SMTP_USER')) return;
    $autoload = __DIR__ . '/vendor/autoload.php';
    if (!file_exists($autoload)) return;
    require_once $autoload;
    $e = function ($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); };
    $details = $e($booking['amenity_name']) . ' · ' . $e($booking['reservation_date']) . ' · ' . $e($booking['time_slot']);
    if ((int)($booking['quantity'] ?? 1) > 1) $details .= ' · ' . (int)$booking['quantity'] . ' unit(s)';
    try {
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = 'smtp.gmail.com';
        $mail->SMTPAuth = true;
        $mail->Username = SMTP_USER;
        $mail->Password = SMTP_PASS;
        $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        $mail->Port = 465;
        $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
        $mail->addAddress($booking['resident_email']);
        $mail->isHTML(true);
        $mail->Subject = "$subject_suffix [" . $booking['tracking_code'] . "]";
        $mail->Body = "
            <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                <h2 style='color: $color; border-bottom: 2px solid $color; padding-bottom: 10px;'>" . $e($headline) . "</h2>
                <p>" . $message_html . "</p>
                <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                    <p><strong>Tracking Code:</strong> <span style='color: #059669; font-weight: bold;'>" . $e($booking['tracking_code']) . "</span></p>
                    <p><strong>Booking:</strong> $details</p>
                </div>
                <p>Thank you,<br>Barangay Pasong Buaya II Administration</p>
            </div>";
        $mail->send();
    } catch (Exception $ex) {
        error_log('Amenity email failed: ' . $ex->getMessage());
    }
}
