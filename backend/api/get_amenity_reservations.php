<?php
// Admin: all amenity bookings for the Amenities dashboard (src/Admin/AmenityDashboard.jsx).
// Replaces get_amenities.php, keeping its two housekeeping rules.
header("Content-Type: application/json");

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();
require_once __DIR__ . '/admin_permissions.php';
pb2_require_any_permission(['module.amenities']); // tab access

include_once __DIR__ . '/../db_connection.php';
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

// Housekeeping (unchanged behaviour from get_amenities.php):
// pending requests whose date has passed can no longer be approved;
// approved bookings are closed out 3 days after the date.
// Each run that changes something is recorded as the system, with the bookings.
require_once __DIR__ . '/audit_log.php';
$pb2System = ['admin_id' => null, 'username' => 'system (booking clean-up)', 'role' => 'Admin'];
$pb2Sweep = function (string $where, string $to, string $why) use ($conn, $pb2System) {
    $ids = [];
    $r = $conn->query("SELECT request_id, tracking_code FROM req_amenity_reservation WHERE $where");
    while ($r && ($row = $r->fetch_assoc())) $ids[(int)$row['request_id']] = $row['tracking_code'];
    if (!$ids) return;
    $list = implode(',', array_keys($ids));
    $set = $to === 'Declined'
        ? "status = 'Declined', remarks = CONCAT_WS(' ', NULLIF(remarks, ''), '[Auto-declined: date passed without approval]')"
        : "status = 'Completed'";
    $conn->query("UPDATE req_amenity_reservation SET $set WHERE request_id IN ($list) AND $where");
    pb2_log_admin_action('amenity_reservation.auto_' . strtolower($to), 'amenity_reservation', null,
        count($ids) . " booking(s) set to $to automatically: $why",
        [['field' => 'bookings', 'old_value' => null, 'new_value' => implode(', ', $ids)]], 'success', $pb2System);
};
$pb2Sweep("status = 'Pending' AND reservation_date < CURDATE()", 'Declined', 'the date passed without approval');
$pb2Sweep("status = 'Approved' AND reservation_date < DATE_SUB(CURDATE(), INTERVAL 3 DAY)", 'Completed', 'more than 3 days after the booking date');

$result = $conn->query("SELECT
        ar.request_id, ar.tracking_code, ar.amenity_id, a.name AS amenity_name, a.category, a.icon_class,
        ar.reservation_date, ar.time_slot,
        TIME_FORMAT(ar.start_time, '%H:%i') AS start_time, TIME_FORMAT(ar.end_time, '%H:%i') AS end_time,
        ar.quantity, a.total_quantity, ar.destination, ar.purpose,
        ar.contact_name, ar.contact_number, ar.id_front, ar.id_holding,
        ar.status, ar.remarks, ar.date_requested, ar.processed_at,
        pa.fullname AS processed_by_name,
        TRIM(CONCAT_WS(' ', r.fName, r.mName, r.lName, r.suffix)) AS resident_name, r.control_num, ar.extra_answers
    FROM req_amenity_reservation ar
    JOIN amenities a ON a.amenity_id = ar.amenity_id
    JOIN residents r ON r.resident_id = ar.resident_id
    LEFT JOIN admins pa ON pa.admin_id = ar.processed_by
    ORDER BY ar.reservation_date DESC, ar.start_time ASC");

if (!$result) {
    error_log('get_amenity_reservations.php: ' . $conn->error);
    echo json_encode(['success' => false, 'message' => 'Unable to load reservations.']);
    exit();
}

$rows = [];
while ($row = $result->fetch_assoc()) {
    $row['request_id'] = (int)$row['request_id'];
    $row['amenity_id'] = (int)$row['amenity_id'];
    $row['quantity'] = (int)$row['quantity'];
    $rows[] = $row;
}
echo json_encode(['success' => true, 'data' => $rows]);
