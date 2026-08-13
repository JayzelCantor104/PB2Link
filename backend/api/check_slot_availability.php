<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS, GET");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
include '../db_connection.php';
if (!$conn) {
    echo json_encode(["available" => false, "message" => "Database connection failed."]);
    exit;
}

// 2. READ JSON INPUT INSTEAD OF $_POST
// Since React sends JSON stringified data, we must read php://input
$inputData = json_decode(file_get_contents("php://input"), true);

// Extract the variables sent from React
$venue = $inputData['venue'] ?? '';
$date = $inputData['date'] ?? '';
$time_slot = $inputData['time_slot'] ?? '';

// Check if variables are valid
if (empty($venue) || empty($date) || empty($time_slot)) {
    echo json_encode(["available" => false, "message" => "Missing required fields."]);
    exit;
}

// 3. CHECK THE DATABASE
$check = $conn->prepare("SELECT request_id FROM req_amenity_reservation WHERE venue = ? AND reservation_date = ? AND time_slot = ? AND status IN ('Approved', 'Pending', 'Processing')");
$check->bind_param("sss", $venue, $date, $time_slot);
$check->execute();
$result = $check->get_result();

// Return 'available' boolean based on whether rows were found
if ($result->num_rows > 0) {
    echo json_encode(["available" => false]);
} else {
    echo json_encode(["available" => true]);
}

$check->close();
$conn->close();
?>