<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

include "../db_connection.php";
require __DIR__ . '/vendor/autoload.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!$data || !isset($data['email'])) {
    echo json_encode(['success' => false, 'message' => 'Email is required']);
    exit;
}

$email = mysqli_real_escape_string($conn, trim($data['email']));

$query = "SELECT admin_id FROM admins WHERE email = '$email' AND status = 'active'";
$result = mysqli_query($conn, $query);

if (!$result || mysqli_num_rows($result) == 0) {
    echo json_encode(['success' => false, 'message' => 'Admin email not found or account is inactive']);
    exit;
}

$row = mysqli_fetch_assoc($result);
$admin_id = $row['admin_id'];

$reset_token = bin2hex(random_bytes(32));
$reset_expiry = date('Y-m-d H:i:s', strtotime('+24 hours'));

$query = "UPDATE admins SET reset_token = '$reset_token', reset_expiry = '$reset_expiry' WHERE admin_id = '$admin_id'";
if (mysqli_query($conn, $query)) {
    
    $origin = $_SERVER['HTTP_ORIGIN'] ?? 'http://localhost:5173';
    // IMPORTANT: This points to the Admin reset route, not the user one
    $reset_link = "$origin/admin/reset-password?token=$reset_token";

    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    
    try {
        $mail->isSMTP();
        $mail->Host       = 'smtp.gmail.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = SMTP_USER; 
        $mail->Password   = SMTP_PASS; 
        $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        $mail->Port       = 465;

        $mail->setFrom(SMTP_FROM_EMAIL, 'PB2 Admin Security');
        $mail->addAddress($email);
        $mail->isHTML(true);
        $mail->Subject = 'Admin Portal - Password Reset Request';
        
        $mail->Body    = "
            <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>
                <h2 style='color: #064e3b; border-bottom: 2px solid #064e3b; padding-bottom: 10px;'>Admin Password Reset</h2>
                <p>We received a request to reset your Administrator password for the Barangay Pasong Buaya II Portal.</p>
                <p>Click the secure link below to reset your credentials:</p>
                <p style='text-align: center; margin: 30px 0;'>
                    <a href='$reset_link' style='display:inline-block; padding:12px 25px; background-color:#059669; color:white; text-decoration:none; border-radius:5px; font-weight: bold;'>Reset Admin Password</a>
                </p>
                <p style='font-size: 0.85rem; color: #64748b;'>If you did not request this reset, your account is safe. You can ignore this email. This link expires in 24 hours.</p>
            </div>
        ";
        
        $mail->send();
        echo json_encode(['success' => true, 'message' => 'Password reset link sent to your administrator email.']);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to send reset email.']);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'Failed to generate reset token.']);
}
?>