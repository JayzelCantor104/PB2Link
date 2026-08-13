<?php
/**
 * OFFICIAL BIMS SYSTEM - SECURE EMAIL OTP GENERATOR & DISPATCHER
 * Version 3.2 - Parameterized Gateway with PHPMailer Integration
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
    require __DIR__ . '/vendor/autoload.php';

    $response = ["success" => false, "message" => ""];

    if (!$conn) {
        throw new Exception("Security Gateway Failure: Connection reference is missing.");
    }

    // Capture and decode incoming JSON payloads
    $data = json_decode(file_get_contents("php://input"), true);
    $email = strtolower(trim($data['email'] ?? ''));

    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new Exception("Validation Error: A valid email address is required.");
    }

    // 1. Check if email already exists in main users registry (Injection-Proof Prepared Statement)
    $stmtCheck = mysqli_prepare($conn, "SELECT user_id FROM users WHERE email = ?");
    mysqli_stmt_bind_param($stmtCheck, "s", $email);
    mysqli_stmt_execute($stmtCheck);
    $resultCheck = mysqli_stmt_get_result($stmtCheck);
    
    if (mysqli_num_rows($resultCheck) > 0) {
        mysqli_stmt_close($stmtCheck);
        throw new Exception("Conflict Error: This email address is already tied to a registered account.");
    }
    mysqli_stmt_close($stmtCheck);

    // 2. Enforce the 2-Minute Cooldown Throttle Rule
    $stmtThrottle = mysqli_prepare($conn, "SELECT cooldown_until FROM email_verifications WHERE email = ?");
    mysqli_stmt_bind_param($stmtThrottle, "s", $email);
    mysqli_stmt_execute($stmtThrottle);
    $resThrottle = mysqli_stmt_get_result($stmtThrottle);
    
    if ($row = mysqli_fetch_assoc($resThrottle)) {
        $cooldownTime = strtotime($row['cooldown_until']);
        $currentTime = time();
        if ($currentTime < $cooldownTime) {
            $timeLeft = $cooldownTime - $currentTime;
            mysqli_stmt_close($stmtThrottle);
            throw new Exception("Rate Limit Exceeded: Please wait " . $timeLeft . " seconds before requesting another code.");
        }
    }
    mysqli_stmt_close($stmtThrottle);

    // 3. Cryptographically Secure 6-Digit OTP Generation
    $raw_otp = sprintf("%06d", random_int(100000, 999999));
    $otp_hash = password_hash($raw_otp, PASSWORD_DEFAULT);
    
    // Set explicit verification milestones (+10m expiration, +2m resend lock)
    $expires_at = date('Y-m-d H:i:s', strtotime('+10 minutes'));
    $cooldown_until = date('Y-m-d H:i:s', strtotime('+2 minutes'));

    // 4. Save to email_verifications table using a secure Upsert Statement
    $stmtSave = mysqli_prepare($conn, "INSERT INTO email_verifications (email, otp_hash, expires_at, cooldown_until) VALUES (?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE otp_hash = ?, expires_at = ?, cooldown_until = ?");
    mysqli_stmt_bind_param($stmtSave, "sssssss", $email, $otp_hash, $expires_at, $cooldown_until, $otp_hash, $expires_at, $cooldown_until);
    mysqli_stmt_execute($stmtSave);
    mysqli_stmt_close($stmtSave);

    // 5. EMAIL DISPATCH LOGIC (Using your official Gmail SMTP infrastructure)
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    
    try {
        $mail->isSMTP();
        $mail->Host       = 'smtp.gmail.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = SMTP_USER; 
        $mail->Password   = SMTP_PASS; 
        $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        $mail->Port       = 465;

        $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
        $mail->addAddress($email);

        $mail->isHTML(true);
        $mail->Subject = 'Official Account Registration OTP';
        
        $mail->Body = "
            <div style='font-family: Arial, sans-serif; padding: 20px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;'>
                <h2 style='color: #064e3b; text-transform: uppercase; border-bottom: 2px solid #064e3b; padding-bottom: 10px; margin-top: 0;'>Account Verification</h2>
                <p>Mabuhay! You are registering an account on the official <strong>Barangay Pasong Buaya II Digital Resident Portal (BIMS)</strong>.</p>
                <p>Please enter the following 6-digit One-Time Password (OTP) to complete your registration security handshake:</p>
                
                <div style='text-align: center; margin: 30px 0;'>
                    <span style='display: inline-block; font-size: 2.5rem; font-weight: bold; letter-spacing: 6px; background-color: #f1f5f9; padding: 15px 30px; border: 2px dashed #059669; color: #064e3b; border-radius: 4px;'>
                        $raw_otp
                    </span>
                </div>
                
                <p style='color: #dc2626; font-weight: bold;'>⚠️ Security Notice:</p>
                <ul style='padding-left: 20px; margin-top: 5px; line-height: 1.6;'>
                    <li>This verification code is strictly valid for only <strong>10 minutes</strong>.</li>
                    <li>Never share this code with anyone, including barangay staff or administrators.</li>
                </ul>
                <br>
                <p style='font-size: 0.8rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-bottom: 0;'>
                    If you did not initiate this registration process, please disregard this automated notification message.
                </p>
            </div>
        ";
        
        $mail->AltBody = "Mabuhay!\n\nYour 6-digit validation verification token for the Barangay Pasong Buaya II Portal is: $raw_otp\n\nThis token is valid for 10 minutes. If you did not request this, please disregard this notice.";

        $mail->send();
        
        $response["success"] = true;
        $response["message"] = "Verification token dispatched to your designated email safely.";

    } catch (Exception $mailException) {
        // Fallback rollback: Clear tracking row if the mail system breaks so they can re-try without getting stuck
        error_log("PHPMailer System Alert: {$mail->ErrorInfo}");
        $stmtRollback = mysqli_prepare($conn, "DELETE FROM email_verifications WHERE email = ?");
        mysqli_stmt_bind_param($stmtRollback, "s", $email);
        mysqli_stmt_execute($stmtRollback);
        mysqli_stmt_close($stmtRollback);
        
        throw new Exception("Mail Gateway Failure: Unable to deliver email code smoothly. Please verify your connection.");
    }

} catch (Exception $e) {
    $response["message"] = $e->getMessage();
}

echo json_encode($response);
?>