<?php
// Admin: one amenity booking's full case file (src/Admin/AmenityDetail.jsx).
//   GET ?id=<request_id>
header("Content-Type: application/json");

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

$id = (int)($_GET['id'] ?? 0);
if (!$id) {
    echo json_encode(['success' => false, 'message' => 'No booking selected.']);
    exit();
}

$stmt = $conn->prepare("SELECT
        ar.request_id, ar.tracking_code, ar.amenity_id, a.name AS amenity_name, a.category, a.icon_class,
        a.total_quantity, TIME_FORMAT(a.open_time, '%H:%i') AS open_time, TIME_FORMAT(a.close_time, '%H:%i') AS close_time,
        ar.reservation_date, ar.time_slot,
        TIME_FORMAT(ar.start_time, '%H:%i') AS start_time, TIME_FORMAT(ar.end_time, '%H:%i') AS end_time,
        ar.quantity, ar.destination, ar.purpose, ar.contact_name, ar.contact_number,
        ar.id_front, ar.id_holding, ar.status, ar.remarks,
        ar.date_requested, ar.date_claimed, ar.processed_at, pa.fullname AS processed_by_name,
        r.control_num, TRIM(CONCAT_WS(' ', r.fName, r.mName, r.lName, r.suffix)) AS resident_name,
        r.house_no, r.street, r.subdivision, u.email AS resident_email
    FROM req_amenity_reservation ar
    JOIN amenities a ON a.amenity_id = ar.amenity_id
    JOIN residents r ON r.resident_id = ar.resident_id
    LEFT JOIN users u ON u.user_id = r.user_id
    LEFT JOIN admins pa ON pa.admin_id = ar.processed_by
    WHERE ar.request_id = ? LIMIT 1");
if (!$stmt) {
    error_log('get_amenity_details.php: ' . $conn->error);
    echo json_encode(['success' => false, 'message' => 'Unable to load the booking.']);
    exit();
}
$stmt->bind_param("i", $id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();

if (!$row) {
    echo json_encode(['success' => false, 'message' => 'Booking not found.']);
    exit();
}
echo json_encode(['success' => true, 'data' => $row]);
