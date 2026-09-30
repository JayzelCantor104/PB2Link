<?php
// Public list of bookable amenities for the resident booking page
// (src/pages/Booking.jsx). Only 'Available' amenities are listed.
// Schema: backend/migrations/009_amenity_booking.sql
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Credentials come from backend/config.php via db_connection.php — never hard-coded here.
include_once __DIR__ . '/../db_connection.php';
if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit();
}

$result = $conn->query("SELECT
        amenity_id AS facility_id,
        name AS facility_name,
        category,
        booking_mode,
        hotline_number,
        total_quantity,
        TIME_FORMAT(open_time, '%H:%i') AS open_time,
        TIME_FORMAT(close_time, '%H:%i') AS close_time,
        description,
        icon_class
    FROM amenities
    WHERE status = 'Available'
    ORDER BY FIELD(category, 'Venue', 'Equipment', 'Vehicle'), name");

if (!$result) {
    error_log('get_facilities.php: ' . $conn->error);
    echo json_encode(["success" => false, "message" => "Unable to load amenities."]);
    exit();
}

$facilities = [];
while ($row = $result->fetch_assoc()) {
    $row['facility_id'] = (int)$row['facility_id'];
    $row['total_quantity'] = $row['total_quantity'] !== null ? (int)$row['total_quantity'] : null;
    $facilities[] = $row;
}
echo json_encode(["success" => true, "data" => $facilities]);
