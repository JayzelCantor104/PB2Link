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
require_once __DIR__ . '/verification_common.php';

$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Extract and sanitize inputs
$token = mysqli_real_escape_string($conn, $data['token'] ?? '');
$password = $data['password'] ?? '';

if (empty($token) || empty($password)) {
    echo json_encode(["success" => false, "message" => "Invalid token or password metadata."]);
    exit;
}
if (strlen($password) < 8) {
    echo json_encode(["success" => false, "message" => "Password must be at least 8 characters long."]);
    exit;
}

// 1. Verify token and expiry
$query = "SELECT admin_id, email FROM admins WHERE reset_token = '$token' AND reset_expiry > NOW()";
$result = mysqli_query($conn, $query);

if ($result && $row = mysqli_fetch_assoc($result)) {
    $admin_id = (int)$row['admin_id'];
    $key = (string)$admin_id;

    // 2. Both codes first (migration 015): the email code, then the SMS code
    //    (admin_contact_verify.php). The number that received the SMS code is
    //    the one saved on the account.
    if (!pb2_vc_is_verified($conn, 'admin_setup', $key, 'email', (string)$row['email'])) {
        echo json_encode(["success" => false, "message" => "Please verify your email address with the code we sent first.", "needs" => "email"]);
        exit;
    }
    $sms = pb2_vc_row($conn, 'admin_setup', $key, 'sms');
    if (!$sms || !pb2_vc_is_verified($conn, 'admin_setup', $key, 'sms', $sms['destination'])) {
        echo json_encode(["success" => false, "message" => "Please verify your mobile number with the code we texted you.", "needs" => "sms"]);
        exit;
    }
    $mobile = '0' . substr((string)$sms['destination'], 2);

    $new_hash = password_hash($password, PASSWORD_DEFAULT);

    // 3. Update and clear tokens
    $stmt = $conn->prepare("UPDATE admins SET 
                    password_hash = ?, 
                    status = 'active', 
                    mobile_num = ?,
                    email_verified_at = NOW(),
                    mobile_verified_at = NOW(),
                    reset_token = NULL, 
                    reset_expiry = NULL 
                    WHERE admin_id = ?");
    $stmt->bind_param("ssi", $new_hash, $mobile, $admin_id);

    if ($stmt->execute()) {
        pb2_vc_clear($conn, 'admin_setup', $key);
        echo json_encode(["success" => true, "message" => "Account configured successfully."]);
    } else {
        error_log("admin_setup_password.php: " . $stmt->error);
        echo json_encode(["success" => false, "message" => "We could not activate the account. Please try again."]);
    }
} else {
    echo json_encode(["success" => false, "message" => "This link is invalid or has expired."]);
}
?>
