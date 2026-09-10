<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../db_connection.php';

if (!isset($conn) || $conn->connect_error) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

$user_id = $_POST['user_id'] ?? null;
$service_id = $_POST['service_id'] ?? null;
$tracking_code = $_POST['tracking_code'] ?? '';
$request_mode = $_POST['request_mode'] ?? 'Self';
$beneficiary_name = $_POST['beneficiary_name'] ?? '';
$contact_num = $_POST['contact_num'] ?? '';
$dynamic_fields_json = $_POST['dynamic_fields'] ?? '{}';

if (!$user_id || !$service_id || empty($tracking_code)) {
    echo json_encode(['success' => false, 'message' => 'Missing essential submission parameters.']);
    exit();
}

// Handle owner_id file upload
$owner_id_path = null;
if (isset($_FILES['owner_id']) && $_FILES['owner_id']['error'] === UPLOAD_ERR_OK) {
    $uploadDir = '../uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
    $fileName = time() . '_' . basename($_FILES['owner_id']['name']);
    $targetPath = $uploadDir . $fileName;
    if (move_uploaded_file($_FILES['owner_id']['tmp_name'], $targetPath)) {
        $owner_id_path = 'uploads/' . $fileName;
    }
}

// Insert into service_submissions table
$stmt = $conn->prepare("INSERT INTO service_submissions (service_id, user_id, tracking_code, request_mode, beneficiary_name, contact_num, form_data, owner_id_file, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')");
$stmt->bind_param("iissssss", $service_id, $user_id, $tracking_code, $request_mode, $beneficiary_name, $contact_num, $dynamic_fields_json, $owner_id_path);

if ($stmt->execute()) {
    echo json_encode([
        'success' => true,
        'message' => 'Your request has been filed successfully!',
        'tracking_code' => $tracking_code
    ]);
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $stmt->error
    ]);
}
?>