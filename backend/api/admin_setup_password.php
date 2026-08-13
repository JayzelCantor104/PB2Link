<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

include_once "../db_connection.php"; 

$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Extract and sanitize inputs
$token = mysqli_real_escape_string($conn, $data['token'] ?? '');
$password = $data['password'] ?? '';

if (empty($token) || empty($password)) {
    echo json_encode(["success" => false, "message" => "Invalid token or password metadata."]);
    exit;
}

// 1. Verify token and expiry
$query = "SELECT admin_id FROM admins WHERE reset_token = '$token' AND reset_expiry > NOW()";
$result = mysqli_query($conn, $query);

if ($result && $row = mysqli_fetch_assoc($result)) {
    $admin_id = $row['admin_id'];
    $new_hash = password_hash($password, PASSWORD_DEFAULT);

    // 2. Update and clear tokens
    $updateQuery = "UPDATE admins SET 
                    password_hash = '$new_hash', 
                    status = 'active', 
                    reset_token = NULL, 
                    reset_expiry = NULL 
                    WHERE admin_id = '$admin_id'";

    if (mysqli_query($conn, $updateQuery)) {
        echo json_encode(["success" => true, "message" => "Account configured successfully."]);
    } else {
        echo json_encode(["success" => false, "message" => "Database error: " . mysqli_error($conn)]);
    }
} else {
    echo json_encode(["success" => false, "message" => "This link is invalid or has expired."]);
}
?>