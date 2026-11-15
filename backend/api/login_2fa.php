<?php
// Two-step sign-in, the code step (migration 052, rules in two_factor.php).
// login.php / admin_login.php check the password first and, when a code is
// needed, mark the session as waiting; this endpoint finishes the sign-in.
//
// POST JSON { tier: 'resident' | 'admin', action: 'send', channel: 'email' | 'sms' }
// POST JSON { tier, action: 'verify', channel, code, trust: bool }
//   trust = "Don't ask again on this device for 30 days"
// The verify response is the same as a normal sign-in's.
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/two_factor.php';

$respond = function (array $body) { echo json_encode($body); exit; };
if (!$conn) $respond(['success' => false, 'message' => 'Database connection failed.']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') $respond(['success' => false, 'message' => 'Invalid request method.']);

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$tier = ($data['tier'] ?? '') === 'admin' ? 'admin' : 'resident';
$action = (string)($data['action'] ?? '');
$channel = ($data['channel'] ?? '') === 'sms' ? 'sms' : 'email';

$subject = pb2_2fa_pending($tier);
if ($subject === null) {
    $respond(['success' => false, 'code' => 'EXPIRED', 'message' => 'Your sign-in timed out. Please enter your password again.']);
}
$acct = pb2_2fa_account($conn, $tier, $subject);
if (!$acct || !isset($acct['_channels'][$channel])) {
    $respond(['success' => false, 'message' => 'Choose where to receive the code.']);
}
$purpose = 'login_' . $tier;

if ($action === 'send') {
    $dest = $channel === 'sms'
        ? (string)($tier === 'admin' ? $acct['mobile_num'] : $acct['contact_num'])
        : (string)$acct['email'];
    $ctx = ['what' => 'sign in'] + ($tier === 'admin' ? ['admin_id' => (int)$subject] : ['user_id' => $subject]);
    $r = pb2_vc_send($conn, $purpose, $subject, $channel, $dest, $ctx);
    $respond(['success' => $r['ok'], 'message' => $r['message'], 'sent_to' => $r['sent_to'] ?? null, 'resend_in' => $r['resend_in'] ?? 0]);
}

if ($action === 'verify') {
    $check = pb2_vc_check($conn, $purpose, $subject, $channel, preg_replace('/\D/', '', (string)($data['code'] ?? '')));
    if (!$check['ok']) {
        if ($tier === 'admin') {
            require_once __DIR__ . '/audit_log.php';
            pb2_log_admin_action('admin.login.2fa_failure', 'admin', (int)$subject, "Wrong sign-in code for '{$acct['username']}'", null, 'failure',
                ['admin_id' => (int)$subject, 'username' => $acct['username'], 'role' => $acct['role']]);
        }
        $respond(['success' => false, 'message' => $check['message'], 'locked' => !empty($check['locked'])]);
    }
    pb2_vc_clear($conn, $purpose, $subject);
    pb2_2fa_end($tier);
    if (!empty($data['trust'])) pb2_2fa_trust_device($conn, $tier, $subject);

    if ($tier === 'admin') {
        $respond(pb2_finish_admin_login($conn, $acct, ' (code by ' . ($channel === 'sms' ? 'SMS' : 'email') . ')'));
    }
    // A resident must still be Active (staff may have changed it meanwhile).
    if (strtoupper((string)$acct['status']) !== 'ACTIVE') {
        $respond(['success' => false, 'message' => 'This account cannot sign in right now. Please contact the barangay office.']);
    }
    $respond(pb2_finish_resident_login($conn, $acct));
}

$respond(['success' => false, 'message' => 'Unknown action.']);
