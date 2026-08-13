<?php
/**
 * OFFICIAL BIMS SYSTEM - OTP VALIDATION GATEWAY
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    include "../db_connection.php";
    $response = ["success" => false, "message" => ""];

    $data = json_decode(file_get_contents("php://input"), true);
    $email = strtolower(trim($data['email'] ?? ''));
    $user_code = trim($data['otp'] ?? '');

    if (empty($email) || empty($user_code)) {
        throw new Exception("Access Denied: Missing mandatory confirmation tokens.");
    }

    $stmtFetch = mysqli_prepare($conn, "SELECT otp_hash, expires_at FROM email_verifications WHERE email = ?");
    mysqli_stmt_bind_param($stmtFetch, "s", $email);
    mysqli_stmt_execute($stmtFetch);
    $result = mysqli_stmt_get_result($stmtFetch);

    if ($row = mysqli_fetch_assoc($result)) {
        // Validate timeline limits first
        if (time() > strtotime($row['expires_at'])) {
            throw new Exception("Token Expired: The 10-minute validity period has elapsed. Please request a new code.");
        }
        
        // Cryptographic match execution
        if (password_verify($user_code, $row['otp_hash'])) {
            // We REMOVED the early deletion of the OTP. 
            // register.php will handle deleting it once the profile is fully saved!

            $response["success"] = true;
            $response["message"] = "Identity token verified successfully.";
        } else {
            throw new Exception("Verification Failure: Input token value does not match current record state.");
        }
    } else {
        throw new Exception("Invalid Session: No registration handshake found for this identity.");
    }
    mysqli_stmt_close($stmtFetch);

} catch (Exception $e) {
    $response["message"] = $e->getMessage();
}

echo json_encode($response);
?>