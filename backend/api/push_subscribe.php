<?php
// Advisory alerts on a device (Web Push, migration 032; advisory_push.php).
//   GET  ?action=key                          { enabled, public_key }
//   POST { action: 'subscribe', subscription: { endpoint, keys: { p256dh, auth } }, language }
//   POST { action: 'unsubscribe', endpoint }
// Public: anyone may get advisories on their phone, signed in or not. A
// signed-in resident's subscription follows their advisory language; a device
// subscribed while a staff member is signed in also gets practice advisories.
// Only push-service addresses over HTTPS are accepted (http only for localhost
// testing), so this can't be used to make the server call arbitrary sites.
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/advisory_push.php';

$respond = function (bool $ok, string $message, array $extra = []) {
    echo json_encode(['success' => $ok, 'message' => $message] + $extra);
    exit;
};
if (!$conn) $respond(false, 'Database connection failed.');

$action = $_GET['action'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action !== 'key') $respond(false, 'Invalid request.');
    session_write_close();
    $respond(true, 'OK', ['enabled' => pb2_push_enabled(), 'public_key' => pb2_push_enabled() ? PUSH_VAPID_PUBLIC_KEY : null]);
}

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$action = (string)($data['action'] ?? '');

/** Push services are HTTPS; http is allowed only for local testing. */
$validEndpoint = function (string $url): bool {
    $u = parse_url($url);
    if (!$u || empty($u['host']) || strlen($url) > 1000) return false;
    if (($u['scheme'] ?? '') === 'https') return true;
    return ($u['scheme'] ?? '') === 'http' && in_array($u['host'], ['localhost', '127.0.0.1'], true);
};

if ($action === 'subscribe') {
    if (!pb2_push_enabled()) $respond(false, 'Alerts on this device are not set up on this server yet.');
    $sub = $data['subscription'] ?? [];
    $endpoint = (string)($sub['endpoint'] ?? '');
    $p256dh = (string)($sub['keys']['p256dh'] ?? '');
    $auth = (string)($sub['keys']['auth'] ?? '');
    if (!$validEndpoint($endpoint) || strlen(pb2_b64url_decode($p256dh)) !== 65 || strlen(pb2_b64url_decode($auth)) < 16) {
        $respond(false, 'This browser sent an invalid subscription.');
    }
    $userId = !empty($_SESSION['user_id']) ? (string)$_SESSION['user_id'] : null;
    $admin = pb2_current_admin();
    $adminId = $admin ? (int)$admin['admin_id'] : null;
    $lang = ($data['language'] ?? '') === 'fil' ? 'fil' : 'en';
    if ($userId) {
        // A signed-in resident's own language choice wins.
        $q = $conn->prepare("SELECT preferred_language FROM residents WHERE user_id = ?");
        $q->bind_param('s', $userId);
        $q->execute();
        $lang = ($q->get_result()->fetch_row()[0] ?? $lang) === 'fil' ? 'fil' : 'en';
    }
    $hash = hash('sha256', $endpoint);
    $st = $conn->prepare("INSERT INTO push_subscriptions (endpoint_hash, endpoint, p256dh, auth, language, user_id, admin_id)
                          VALUES (?, ?, ?, ?, ?, ?, ?)
                          ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), language = VALUES(language),
                              user_id = COALESCE(VALUES(user_id), user_id), admin_id = COALESCE(VALUES(admin_id), admin_id), failures = 0");
    $st->bind_param('ssssssi', $hash, $endpoint, $p256dh, $auth, $lang, $userId, $adminId);
    if (!$st->execute()) $respond(false, 'Alerts could not be turned on. Please try again.');
    $respond(true, $adminId
        ? 'Alerts are on for this device, including practice advisories for staff.'
        : 'Alerts are on. This device will get barangay emergency advisories.', ['language' => $lang, 'staff' => (bool)$adminId]);
}

if ($action === 'unsubscribe') {
    $endpoint = (string)($data['endpoint'] ?? '');
    $hash = hash('sha256', $endpoint);
    $st = $conn->prepare("DELETE FROM push_subscriptions WHERE endpoint_hash = ?");
    $st->bind_param('s', $hash);
    $st->execute();
    $respond(true, 'Alerts are off for this device.');
}

$respond(false, 'Invalid request.');
