<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include "../db_connection.php";
require __DIR__ . '/vendor/autoload.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!$data || !isset($data['email'])) {
    echo json_encode(['success' => false, 'message' => 'Email is required']);
    exit;
}

$email = mysqli_real_escape_string($conn, trim($data['email']));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

$query = "SELECT user_id FROM users WHERE email = '$email'";
$result = mysqli_query($conn, $query);

if (!$result || mysqli_num_rows($result) == 0) {
    echo json_encode(['success' => false, 'message' => 'Email not found']);
    exit;
}

$row = mysqli_fetch_assoc($result);
$user_id = $row['user_id'];

// --- Reset by SMS (migration 015) ----------------------------------------------
// { email, channel: 'sms' }              -> texts a 6-digit code to the mobile
//                                           number on file
// { email, action: 'verify_sms', otp }   -> a correct code returns a short-lived
//                                           reset token for /reset-password
$channel = ($data['channel'] ?? 'email') === 'sms' ? 'sms' : 'email';
$action = $data['action'] ?? 'send';
if ($channel === 'sms' || $action === 'verify_sms') {
    require_once __DIR__ . '/verification_common.php';
    $key = (string)$user_id;

    if ($action === 'verify_sms') {
        $check = pb2_vc_check($conn, 'password_reset', $key, 'sms', (string)($data['otp'] ?? ''));
        if (!$check['ok']) {
            echo json_encode(['success' => false, 'message' => $check['message'], 'locked' => !empty($check['locked'])]);
            exit;
        }
        pb2_vc_clear($conn, 'password_reset', $key);
        $reset_token = bin2hex(random_bytes(32));
        $reset_expiry = date('Y-m-d H:i:s', strtotime('+15 minutes'));
        $upd = $conn->prepare("UPDATE users SET reset_token = ?, reset_expiry = ? WHERE user_id = ?");
        $upd->bind_param('sss', $reset_token, $reset_expiry, $key);
        $upd->execute();
        echo json_encode(['success' => true, 'message' => 'Code verified. You can now set a new password.', 'reset_token' => $reset_token]);
        exit;
    }

    $stmt = $conn->prepare("SELECT contact_num FROM residents WHERE user_id = ?");
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $mobile = (string)($stmt->get_result()->fetch_row()[0] ?? '');
    if (pb2_sms_normalize($mobile) === null) {
        echo json_encode(['success' => false, 'message' => 'There is no valid mobile number on this account. Please use the email option instead.']);
        exit;
    }
    $sent = pb2_vc_send($conn, 'password_reset', $key, 'sms', $mobile, ['what' => 'reset your password', 'user_id' => $user_id]);
    echo json_encode([
        'success' => $sent['ok'],
        'message' => $sent['ok'] ? 'We texted a 6-digit code to ' . $sent['sent_to'] . '.' : $sent['message'],
        'sent_to' => $sent['sent_to'] ?? null,
        'resend_in' => $sent['resend_in'] ?? 0,
    ]);
    exit;
}

$reset_token = bin2hex(random_bytes(32));
$reset_expiry = date('Y-m-d H:i:s', strtotime('+24 hours'));

$query = "UPDATE users SET reset_token = '$reset_token', reset_expiry = '$reset_expiry' WHERE user_id = '$user_id'";
if (mysqli_query($conn, $query)) {
    
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    $frontUrl = $origin ? rtrim($origin, '/') : 'http://localhost:5174';
    $reset_link = "$frontUrl/reset-password?token=$reset_token";

    // ==========================================
    // EMAIL SENDING LOGIC (Using GMAIL SMTP)
    // ==========================================
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    
    try {
        $mail->isSMTP();
        $mail->Host       = 'smtp.gmail.com';
        $mail->SMTPAuth   = true;
        
      
        $mail->Username   = SMTP_USER; 
        $mail->Password   = SMTP_PASS; 
        // ------------------------------
        
        $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        $mail->Port       = 465;

        // Change 'your.email@gmail.com' here as well
        $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
        $mail->addAddress($email);

        $mail->isHTML(true);
        $mail->Subject = 'Password Reset Request';
        
        $mail->Body    = "
            <h2>Password Reset Request</h2>
            <p>We received a request to reset your password for Barangay Pasong Buaya II.</p>
            <p>Click the link below to securely reset your password:</p>
            <p><a href='$reset_link' style='display:inline-block; padding:10px 20px; background-color:#059669; color:white; text-decoration:none; border-radius:5px;'>Reset Password</a></p>
            <p>Or copy and paste this link into your browser:</p>
            <p>$reset_link</p>
            <br>
            <p><small>If you did not request a password reset, please ignore this email. This link will expire in 24 hours.</small></p>
        ";
        
        $mail->AltBody = "You requested a password reset. Please copy and paste this link into your browser to reset your password: $reset_link \n\nIf you did not request this, please ignore this email.";

        $mail->send();
        
        echo json_encode([
            'success' => true,
            'message' => 'Password reset link has been sent to your email.'
        ]);
        
    } catch (Exception $e) {
        error_log("Message could not be sent. Mailer Error: {$mail->ErrorInfo}");
        echo json_encode([
            'success' => false,
            'message' => 'Failed to send the reset email. Please try again later.'
        ]);
    }

} else {
    echo json_encode(['success' => false, 'message' => 'Failed to generate reset token.']);
}
?>