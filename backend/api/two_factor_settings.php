<?php
// A resident's two-step sign-in settings (migration 052, Edit Profile's
// "Two-step sign-in" card, src/components/TwoFactorSettings.jsx).
// Needs a full (Active) resident session.
//
//   GET                                  { enabled, channel, channels, trusted_devices }
//   POST { action: 'send', channel }     a code to the chosen email / confirmed mobile
//   POST { action: 'enable', channel, code }   turns it on with that channel
//   POST { action: 'set_channel', channel }    changes where codes go (no code needed:
//                                              both are already confirmed)
//   POST { action: 'disable', password } turns it off (needs the current password)
//   POST { action: 'forget_devices' }    asks for a code again on every device
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/two_factor.php';

$respond = function (bool $ok, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $ok, 'message' => $message], $extra));
    exit;
};
if (!$conn) $respond(false, 'Database connection failed.');
$uid = isset($_SESSION['user_id']) ? (string)$_SESSION['user_id'] : '';
if ($uid === '') {
    http_response_code(401);
    $respond(false, 'Please log in again.', ['auth_error' => true]);
}

$acct = pb2_2fa_account($conn, 'resident', $uid);
if (!$acct) $respond(false, 'Account not found.');
$channels = $acct['_channels'];

$state = function () use ($conn, $uid) {
    $a = pb2_2fa_account($conn, 'resident', $uid);
    $s = $conn->prepare("SELECT COUNT(*) FROM trusted_devices WHERE tier = 'resident' AND subject_id = ? AND expires_at > NOW()");
    $s->bind_param('s', $uid);
    $s->execute();
    $n = (int)$s->get_result()->fetch_row()[0];
    $s->close();
    return [
        'enabled' => (bool)$a['two_factor_enabled'],
        'channel' => $a['two_factor_channel'],
        'channels' => $a['_channels'],
        'trusted_devices' => $n,
    ];
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') $respond(true, 'OK', $state());

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$action = (string)($data['action'] ?? '');
$channel = ($data['channel'] ?? '') === 'sms' ? 'sms' : 'email';
$needChannel = function () use ($channels, $channel, $respond) {
    if (!isset($channels[$channel])) {
        $respond(false, $channel === 'sms'
            ? 'Confirm your mobile number in Edit Profile first, then choose SMS.'
            : 'Add an email address to your profile first, then choose email.');
    }
};

if ($action === 'send') {
    $needChannel();
    $dest = $channel === 'sms' ? (string)$acct['contact_num'] : (string)$acct['email'];
    $r = pb2_vc_send($conn, 'enable_2fa', $uid, $channel, $dest, ['what' => 'turn on two-step sign-in', 'user_id' => $uid]);
    $respond($r['ok'], $r['message'], ['sent_to' => $r['sent_to'] ?? null, 'resend_in' => $r['resend_in'] ?? 0]);
}

if ($action === 'enable') {
    $needChannel();
    $check = pb2_vc_check($conn, 'enable_2fa', $uid, $channel, preg_replace('/\D/', '', (string)($data['code'] ?? '')));
    if (!$check['ok']) $respond(false, $check['message'], ['locked' => !empty($check['locked'])]);
    pb2_vc_clear($conn, 'enable_2fa', $uid);
    $s = $conn->prepare("UPDATE residents SET two_factor_enabled = 1, two_factor_channel = ? WHERE user_id = ?");
    $s->bind_param('ss', $channel, $uid);
    $s->execute();
    $s->close();
    $respond(true, 'Two-step sign-in is on. From now on we will ask for a code when you sign in.', $state());
}

if ($action === 'set_channel') {
    $needChannel();
    $s = $conn->prepare("UPDATE residents SET two_factor_channel = ? WHERE user_id = ?");
    $s->bind_param('ss', $channel, $uid);
    $s->execute();
    $s->close();
    $respond(true, $channel === 'sms' ? 'Sign-in codes will come by text message.' : 'Sign-in codes will come by email.', $state());
}

if ($action === 'disable') {
    $s = $conn->prepare("SELECT password_hash FROM users WHERE user_id = ?");
    $s->bind_param('s', $uid);
    $s->execute();
    $hash = (string)($s->get_result()->fetch_row()[0] ?? '');
    $s->close();
    if (!password_verify((string)($data['password'] ?? ''), $hash)) $respond(false, 'Your current password is incorrect.');
    $s = $conn->prepare("UPDATE residents SET two_factor_enabled = 0 WHERE user_id = ?");
    $s->bind_param('s', $uid);
    $s->execute();
    $s->close();
    pb2_2fa_forget_devices($conn, 'resident', $uid);
    $respond(true, 'Two-step sign-in is off. You will sign in with your password only.', $state());
}

if ($action === 'forget_devices') {
    $n = pb2_2fa_forget_devices($conn, 'resident', $uid);
    $respond(true, $n ? "We'll ask for a code again on every device ($n forgotten)." : 'No devices were remembered.', $state());
}

$respond(false, 'Unknown action.');
