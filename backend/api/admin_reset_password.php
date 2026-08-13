<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

include "../db_connection.php";

$data = json_decode(file_get_contents('php://input'), true);

if (!$data || !isset($data['token']) || !isset($data['password'])) {
    echo json_encode(['success' => false, 'message' => 'Token and password are required']);
    exit;
}

$token = mysqli_real_escape_string($conn, $data['token']);
$password = $data['password'];

if (strlen($password) < 8) {
    echo json_encode(['success' => false, 'message' => 'Admin password must be at least 8 characters long']);
    exit;
}

$query = "SELECT admin_id, reset_expiry FROM admins WHERE reset_token = '$token'";
$result = mysqli_query($conn, $query);

if (!$result || mysqli_num_rows($result) == 0) {
    echo json_encode(['success' => false, 'message' => 'Invalid or expired reset token.']);
    exit;
}

$row = mysqli_fetch_assoc($result);
$admin_id = $row['admin_id'];
$reset_expiry = $row['reset_expiry'];

if (date('Y-m-d H:i:s') > $reset_expiry) {
    echo json_encode(['success' => false, 'message' => 'Reset token has expired. Please request a new link.']);
    exit;
}

$hashed_password = password_hash($password, PASSWORD_DEFAULT);

$query = "UPDATE admins SET password_hash = '$hashed_password', reset_token = NULL, reset_expiry = NULL WHERE admin_id = '$admin_id'";
if (mysqli_query($conn, $query)) {
    echo json_encode(['success' => true, 'message' => 'Admin password reset successfully']);
} else {
    echo json_encode(['success' => false, 'message' => 'Failed to update password.']);
}
?>