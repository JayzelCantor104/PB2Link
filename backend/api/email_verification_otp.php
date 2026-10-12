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

    $stmtFetch = mysqli_prepare($conn, "SELECT verification_id, otp_hash, expires_at, attempts, verified_at FROM email_verifications WHERE email = ?");
    mysqli_stmt_bind_param($stmtFetch, "s", $email);
    mysqli_stmt_execute($stmtFetch);
    $result = mysqli_stmt_get_result($stmtFetch);

    if ($row = mysqli_fetch_assoc($result)) {
        // Already confirmed (e.g. the page re-checks after the SMS step).
        if ($row['verified_at'] !== null && strtotime($row['verified_at']) > time() - 30 * 60 && password_verify($user_code, $row['otp_hash'])) {
            echo json_encode(["success" => true, "message" => "Email already verified."]);
            exit;
        }
        // 5 wrong tries lock the code (migration 015).
        if ((int)$row['attempts'] >= 5) {
            throw new Exception("Too many wrong tries. Please request a new code.");
        }
        // Validate timeline limits first
        if (time() > strtotime($row['expires_at'])) {
            throw new Exception("Token Expired: The 10-minute validity period has elapsed. Please request a new code.");
        }

        // Cryptographic match execution
        if (password_verify($user_code, $row['otp_hash'])) {
            // The code is kept (register.php deletes it once the profile is
            // saved); verified_at lets register.php accept it after the
            // mobile-number step even if its 10 minutes ran out meanwhile.
            $vid = (int)$row['verification_id'];
            mysqli_query($conn, "UPDATE email_verifications SET verified_at = NOW() WHERE verification_id = $vid");

            $response["success"] = true;
            $response["message"] = "Identity token verified successfully.";
        } else {
            $vid = (int)$row['verification_id'];
            mysqli_query($conn, "UPDATE email_verifications SET attempts = attempts + 1 WHERE verification_id = $vid");
            $left = 5 - ((int)$row['attempts'] + 1);
            throw new Exception($left > 0
                ? "Incorrect code. You have $left " . ($left === 1 ? 'try' : 'tries') . " left."
                : "Incorrect code. Too many wrong tries — please request a new code.");
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