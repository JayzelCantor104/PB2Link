<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include "../db_connection.php";

$data = json_decode(file_get_contents('php://input'), true);

if (!$data || !isset($data['token']) || !isset($data['password'])) {
    echo json_encode(['success' => false, 'message' => 'Token and password are required']);
    exit;
}

$token = mysqli_real_escape_string($conn, $data['token']);
$password = $data['password'];

// Debug: log the received token
error_log("Reset password attempt with token: $token");

// Validate password strength
if (strlen($password) < 6) {
    echo json_encode(['success' => false, 'message' => 'Password must be at least 6 characters long']);
    exit;
}

// Check if the reset columns exist on the shared users table
$check_columns = mysqli_query($conn, "SHOW COLUMNS FROM users LIKE 'reset_token'");
if (mysqli_num_rows($check_columns) == 0) {
    echo json_encode(['success' => false, 'message' => 'Password reset is not configured for the users table.']);
    exit;
}
$check_columns = mysqli_query($conn, "SHOW COLUMNS FROM users LIKE 'reset_expiry'");
if (mysqli_num_rows($check_columns) == 0) {
    echo json_encode(['success' => false, 'message' => 'Password reset is not configured for the users table.']);
    exit;
}

// Find user with valid reset token
$query = "SELECT user_id, reset_expiry FROM users WHERE reset_token = '$token'";
$result = mysqli_query($conn, $query);

if (!$result) {
    error_log("Database error in reset password: " . mysqli_error($conn));
    echo json_encode(['success' => false, 'message' => 'Database error']);
    exit;
}

if (mysqli_num_rows($result) == 0) {
    error_log("Token not found in database: $token");
    // Check if token exists at all (even expired)
    $check_query = "SELECT user_id FROM users WHERE reset_token = '$token'";
    $check_result = mysqli_query($conn, $check_query);
    if (mysqli_num_rows($check_result) > 0) {
        error_log("Token exists but may be expired");
        echo json_encode(['success' => false, 'message' => 'Reset token has expired. Please request a new password reset.']);
    } else {
        error_log("Token does not exist at all");
        echo json_encode(['success' => false, 'message' => 'Invalid reset token. Please request a new password reset.']);
    }
    exit;
}

$row = mysqli_fetch_assoc($result);
$user_id = $row['user_id'];
$reset_expiry = $row['reset_expiry'];

error_log("Found token for user $user_id, expires: $reset_expiry, current time: " . date('Y-m-d H:i:s'));

// Check if token is expired
$current_time = date('Y-m-d H:i:s');
if ($reset_expiry <= $current_time) {
    error_log("Token expired: $reset_expiry <= $current_time");
    echo json_encode(['success' => false, 'message' => 'Reset token has expired. Please request a new password reset.']);
    exit;
}

// Hash the new password
$hashed_password = password_hash($password, PASSWORD_DEFAULT);

// Update password and clear reset token
$query = "UPDATE users SET password_hash = '$hashed_password', reset_token = NULL, reset_expiry = NULL WHERE user_id = '$user_id'";
if (mysqli_query($conn, $query)) {
    echo json_encode(['success' => true, 'message' => 'Password reset successfully']);
} else {
    echo json_encode(['success' => false, 'message' => 'Failed to update password: ' . mysqli_error($conn)]);
}
?>