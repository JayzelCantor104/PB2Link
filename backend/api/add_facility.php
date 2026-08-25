<?php
// Force clean error reporting into JSON
error_reporting(E_ALL);
ini_set('display_errors', 0);

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

try {
    // 1. Correct Path to backend/db_connection.php from backend/api/add_facility.php
    $db_path = dirname(__DIR__) . '/db_connection.php';
    if (!file_exists($db_path)) {
        echo json_encode(['success' => false, 'message' => 'db_connection.php missing at: ' . $db_path]);
        exit();
    }

    require_once $db_path;

    // 2. Verify MySQLi $conn instance
    if (!isset($conn) || !$conn) {
        echo json_encode(['success' => false, 'message' => 'Database connection failed ($conn variable invalid).']);
        exit();
    }

    // 3. Decode JSON Payload
    $raw_input = file_get_contents("php://input");
    $data = json_decode($raw_input, true);

    if (!$data) {
        echo json_encode(['success' => false, 'message' => 'Invalid JSON input received.']);
        exit();
    }

    $name        = trim($data['facility_name'] ?? '');
    $description = trim($data['description'] ?? '');
    $icon_class  = trim($data['icon_class'] ?? 'bi-building');

    if (empty($name)) {
        echo json_encode(['success' => false, 'message' => 'Facility/Amenity name is required.']);
        exit();
    }

    // 4. Insert into `amenities` table
    $sql = "INSERT INTO amenities (name, category, description, status, icon_class) VALUES (?, 'Venue', ?, 'Available', ?)";
    
    $stmt = mysqli_prepare($conn, $sql);
    if (!$stmt) {
        throw new Exception("Prepare failed: " . mysqli_error($conn));
    }

    mysqli_stmt_bind_param($stmt, "sss", $name, $description, $icon_class);

    if (mysqli_stmt_execute($stmt)) {
        echo json_encode([
            'success' => true,
            'message' => 'Amenity added successfully!',
            'amenity_id' => mysqli_insert_id($conn)
        ]);
    } else {
        throw new Exception("Execution failed: " . mysqli_stmt_error($stmt));
    }

    mysqli_stmt_close($stmt);

} catch (Throwable $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Server Error: ' . $e->getMessage()
    ]);
}
?>