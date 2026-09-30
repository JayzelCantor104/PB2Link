<?php
// What's already taken for one amenity on one date, so the booking page can
// show it before the resident picks a time / quantity.
//   GET ?amenity_id=N&date=YYYY-MM-DD
// Returns only times / unit counts — no names or other personal details.
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/amenity_common.php';
if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit();
}

$amenity_id = (int)($_GET['amenity_id'] ?? 0);
$date = (string)($_GET['date'] ?? '');
$d = DateTime::createFromFormat('Y-m-d', $date);
if (!$amenity_id || !$d || $d->format('Y-m-d') !== $date) {
    echo json_encode(["success" => false, "message" => "Amenity and date are required."]);
    exit();
}

$stmt = $conn->prepare("SELECT category, total_quantity, TIME_FORMAT(open_time, '%H:%i') AS open_time, TIME_FORMAT(close_time, '%H:%i') AS close_time
                        FROM amenities WHERE amenity_id = ? AND status = 'Available'");
$stmt->bind_param("i", $amenity_id);
$stmt->execute();
$amenity = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$amenity) {
    echo json_encode(["success" => false, "message" => "This amenity is not available for booking."]);
    exit();
}

$out = ["success" => true, "category" => $amenity['category'], "open_time" => $amenity['open_time'], "close_time" => $amenity['close_time']];

if ($amenity['category'] === 'Equipment') {
    $reserved = pb2_amenity_reserved_qty($conn, $amenity_id, $date);
    $total = $amenity['total_quantity'] !== null ? (int)$amenity['total_quantity'] : null;
    $out['total_quantity'] = $total;
    $out['reserved_quantity'] = $reserved;
    $out['remaining_quantity'] = $total !== null ? max(0, $total - $reserved) : null;
} else {
    $stmt = $conn->prepare("SELECT TIME_FORMAT(start_time, '%H:%i') AS start_time, TIME_FORMAT(end_time, '%H:%i') AS end_time, status
                            FROM req_amenity_reservation
                            WHERE amenity_id = ? AND reservation_date = ? AND status IN ('Pending','Approved') AND start_time IS NOT NULL
                            ORDER BY start_time");
    $stmt->bind_param("is", $amenity_id, $date);
    $stmt->execute();
    $out['taken'] = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
}

echo json_encode($out);
