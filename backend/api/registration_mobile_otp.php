<?php
// Registration, step 2 of 2: the SMS code for the mobile number
// (src/pages/Register.jsx, migration 015). The email is verified first
// (send_otp.php / email_verification_otp.php); only then may a text be sent,
// so this public endpoint can't be used to send texts to arbitrary numbers.
//
// POST JSON { action: 'send',   email, email_otp, mobile }
// POST JSON { action: 'verify', email, email_otp, mobile, otp }
//
// register.php re-checks both codes on the server before saving.
ini_set('display_errors', 0);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../db_connection.php';
require_once __DIR__ . '/verification_common.php';

$respond = function (bool $success, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
};

if (!$conn) $respond(false, 'Database connection failed.');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') $respond(false, 'Invalid request method.');

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $data['action'] ?? '';
$email = strtolower(trim((string)($data['email'] ?? '')));
$email_otp = (string)($data['email_otp'] ?? '');
$mobile = preg_replace('/\D/', '', (string)($data['mobile'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $respond(false, 'A valid email address is required.');
if (!preg_match('/^09\d{9}$/', $mobile)) $respond(false, 'Mobile number must be 11 digits starting with 09.');
if (!pb2_registration_email_ok($conn, $email, $email_otp)) {
    $respond(false, 'Please verify your email address first.', ['email_unverified' => true]);
}

if ($action === 'send') {
    $r = pb2_vc_send($conn, 'register', $email, 'sms', $mobile, ['what' => 'verify your mobile number']);
    $respond($r['ok'], $r['message'], ['resend_in' => $r['resend_in'] ?? 0, 'sent_to' => $r['sent_to'] ?? null]);
}

if ($action === 'verify') {
    $row = pb2_vc_row($conn, 'register', $email, 'sms');
    if (!$row || $row['destination'] !== pb2_sms_normalize($mobile)) {
        $respond(false, 'No code was sent to this number. Please request a new one.');
    }
    $r = pb2_vc_check($conn, 'register', $email, 'sms', (string)($data['otp'] ?? ''));
    $respond($r['ok'], $r['ok'] ? 'Mobile number verified.' : $r['message'], ['locked' => !empty($r['locked'])]);
}

$respond(false, 'Unknown action.');
