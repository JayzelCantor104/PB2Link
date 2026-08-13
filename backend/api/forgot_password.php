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