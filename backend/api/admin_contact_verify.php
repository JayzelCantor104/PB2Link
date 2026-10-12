<?php
// Admin email + mobile verification (migration 015, verification_common.php).
// Two codes, in order: an email code to the admin's email, then an SMS code
// to their mobile number.
//
// Activation (src/Admin/SetupPassword.jsx) — identified by the invite token,
// no session yet; admin_setup_password.php then requires both codes:
//   POST { token, action: 'status' }
//   POST { token, action: 'send',   channel: 'email' | 'sms', mobile? }
//   POST { token, action: 'verify', channel, otp }
//
// Signed-in admin (src/Admin/AdminContactVerify.jsx, prompted by AdminLayout)
// — e.g. accounts created before mobile numbers existed:
//   POST { action: 'status' }
//   POST { action: 'send',   channel, mobile? }   mobile = add / change own number
//   POST { action: 'verify', channel, otp }       saves email_verified_at /
//                                                  mobile_num + mobile_verified_at
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
require_once '../db_connection.php';
require_once __DIR__ . '/verification_common.php';

$respond = function (bool $success, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
};

if (!$conn) $respond(false, 'Database connection failed.');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') $respond(false, 'Invalid request method.');

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$action = (string)($data['action'] ?? 'status');
$channel = ($data['channel'] ?? '') === 'sms' ? 'sms' : 'email';
$token = trim((string)($data['token'] ?? ''));

// ---- Who is this? --------------------------------------------------------------
if ($token !== '') {
    $purpose = 'admin_setup';
    $stmt = $conn->prepare("SELECT admin_id, email, mobile_num, email_verified_at, mobile_verified_at FROM admins WHERE reset_token = ? AND reset_expiry > NOW() AND status <> 'active'");
    $stmt->bind_param('s', $token);
    $stmt->execute();
    $admin = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$admin) $respond(false, 'This setup link is invalid or has expired. Ask a Super Admin to resend the invitation.', ['invalid_link' => true]);
} else {
    $purpose = 'admin_contact';
    $session = pb2_require_admin();
    $aid = (int)$session['admin_id'];
    $admin = $conn->query("SELECT admin_id, email, mobile_num, email_verified_at, mobile_verified_at FROM admins WHERE admin_id = $aid")->fetch_assoc();
    if (!$admin) $respond(false, 'Administrator account not found.');
}
$admin_id = (int)$admin['admin_id'];
$key = (string)$admin_id;

// Verified now = a code entered in this flow (setup), or recorded on the account (signed in).
$status = function () use ($conn, $purpose, $key, $admin_id) {
    $row = $conn->query("SELECT email, mobile_num, email_verified_at, mobile_verified_at FROM admins WHERE admin_id = $admin_id")->fetch_assoc();
    $email_ok = $purpose === 'admin_setup'
        ? pb2_vc_is_verified($conn, $purpose, $key, 'email', (string)$row['email'])
        : $row['email_verified_at'] !== null;
    $pending_mobile = pb2_vc_row($conn, $purpose, $key, 'sms');
    $mobile_ok = $purpose === 'admin_setup'
        ? ($pending_mobile && pb2_vc_is_verified($conn, $purpose, $key, 'sms', $pending_mobile['destination']))
        : ($row['mobile_verified_at'] !== null && pb2_sms_normalize($row['mobile_num'] ?? '') !== null);
    return [
        'email'          => pb2_vc_mask('email', (string)$row['email']),
        'mobile'         => pb2_sms_mask($row['mobile_num'] ?? ''),
        'email_verified' => $email_ok,
        'mobile_verified'=> (bool)$mobile_ok,
        'sms_available'  => pb2_sms_configured(),
    ];
};

if ($action === 'status') {
    $respond(true, 'OK', ['status' => $status()]);
}

// ---- Send a code -----------------------------------------------------------------
if ($action === 'send') {
    if ($channel === 'email') {
        $r = pb2_vc_send($conn, $purpose, $key, 'email', (string)$admin['email'], ['what' => 'verify your administrator email', 'admin_id' => $admin_id]);
    } else {
        $st = $status();
        if (!$st['email_verified']) $respond(false, 'Please verify your email address first.', ['status' => $st]);
        $mobile = preg_replace('/\D/', '', (string)($data['mobile'] ?? ''));
        if ($mobile === '') $mobile = (string)($admin['mobile_num'] ?? '');
        if (!preg_match('/^09\d{9}$/', $mobile) && pb2_sms_normalize($mobile) === null) {
            $respond(false, 'Enter your mobile number (11 digits starting with 09).', ['status' => $st]);
        }
        $r = pb2_vc_send($conn, $purpose, $key, 'sms', $mobile, ['what' => 'verify your administrator mobile number', 'admin_id' => $admin_id]);
    }
    $respond($r['ok'], $r['message'], ['resend_in' => $r['resend_in'] ?? 0, 'sent_to' => $r['sent_to'] ?? null, 'status' => $status()]);
}

// ---- Verify a code ----------------------------------------------------------------
if ($action === 'verify') {
    $r = pb2_vc_check($conn, $purpose, $key, $channel, (string)($data['otp'] ?? ''));
    if (!$r['ok']) $respond(false, $r['message'], ['locked' => !empty($r['locked']), 'status' => $status()]);

    if ($purpose === 'admin_contact') {
        // Signed in: record it on the account now.
        if ($channel === 'email') {
            $conn->query("UPDATE admins SET email_verified_at = NOW() WHERE admin_id = $admin_id");
        } else {
            $row = pb2_vc_row($conn, $purpose, $key, 'sms');
            $local = '0' . substr((string)$row['destination'], 2);
            $upd = $conn->prepare("UPDATE admins SET mobile_num = ?, mobile_verified_at = NOW() WHERE admin_id = ?");
            $upd->bind_param('si', $local, $admin_id);
            $upd->execute();
            require_once __DIR__ . '/audit_log.php';
            pb2_log_admin_action('admin.contact.verify', 'admin', $key, 'Verified own mobile number by SMS code',
                [['field' => 'mobile_num', 'old_value' => $admin['mobile_num'], 'new_value' => $local]]);
        }
        pb2_vc_clear($conn, $purpose, $key, $channel);
    }
    $respond(true, $channel === 'email' ? 'Email address verified.' : 'Mobile number verified.', ['status' => $status()]);
}

$respond(false, 'Unknown action.');
