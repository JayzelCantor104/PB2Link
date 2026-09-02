<?php
ini_set('display_errors', 0);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
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
    echo json_encode(["success" => false, "message" => "Database connection failed: " . $conn->connect_error]);
    exit();
}

// Fetch category along with amenity details
$sql = "SELECT 
            amenity_id AS facility_id, 
            name AS facility_name, 
            category,
            description, 
            icon_class 
        FROM amenities 
        WHERE status = 'Available'";

$result = $conn->query($sql);

$facilities = [];
if ($result && $result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        $facilities[] = $row;
    }
    echo json_encode(["success" => true, "data" => $facilities]);
} else {
    echo json_encode(["success" => true, "data" => [], "message" => "No available amenities found"]);
}

$conn->close();
?>