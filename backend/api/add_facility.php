<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$db_host = "localhost";
$db_user = "root";
$db_pass = "";
$db_name = "barangay_bims";

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);

if ($conn->connect_error) {
    echo json_encode(["success" => false, "message" => "Database connection failed"]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

$name = $data['facility_name'] ?? '';
$category = $data['category'] ?? 'Venue';
$description = $data['description'] ?? '';
$icon_class = $data['icon_class'] ?? 'bi-building';
$max_quantity = $data['max_quantity'] ?? 1;
$hotline_number = $data['hotline_number'] ?? null;

if (empty($name)) {
    echo json_encode(["success" => false, "message" => "Facility name is required."]);
    exit();
}

// Append extra dynamic details into description or form metadata if needed
$stmt = $conn->prepare("INSERT INTO amenities (name, category, description, icon_class, status) VALUES (?, ?, ?, ?, 'Available')");
$stmt->bind_param("ssss", $name, $category, $description, $icon_class);

if ($stmt->execute()) {
    echo json_encode(["success" => true, "message" => "Amenity added successfully!"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to insert record: " . $conn->error]);
}

$stmt->close();
$conn->close();
?>