<?php
// Pin or unpin an announcement (migration 025). Pinned posts come first on the
// Home page, the Announcements page and the admin list, newest pin first.
//   POST JSON { announcement_id, pinned: true|false }
// At most PB2_ANNOUNCEMENT_MAX_PINNED posts are pinned at once; the admin
// unpins one before pinning another. Audit-logged.
header('Content-Type: application/json');
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
$admin = pb2_require_admin();

require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/announcements_common.php';
require_once __DIR__ . '/audit_log.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Use POST.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$id = (int) ($data['announcement_id'] ?? 0);
$pin = filter_var($data['pinned'] ?? false, FILTER_VALIDATE_BOOLEAN);

$stmt = $conn->prepare('SELECT announcement_id, title, caption, is_pinned FROM announcements WHERE announcement_id = ?');
$stmt->bind_param('i', $id);
$stmt->execute();
$post = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$post) {
    echo json_encode(['success' => false, 'message' => 'Announcement not found.']);
    exit;
}

$label = $post['title'] ?: mb_substr(preg_replace('/\s+/u', ' ', (string) $post['caption']), 0, 60);
if ((int) $post['is_pinned'] === ($pin ? 1 : 0)) {
    echo json_encode(['success' => true, 'message' => $pin ? 'Already pinned.' : 'Already unpinned.']);
    exit;
}

if ($pin) {
    $count = (int) $conn->query('SELECT COUNT(*) FROM announcements WHERE is_pinned = 1')->fetch_row()[0];
    if ($count >= PB2_ANNOUNCEMENT_MAX_PINNED) {
        echo json_encode([
            'success' => false,
            'code' => 'PIN_LIMIT',
            'message' => 'Up to ' . PB2_ANNOUNCEMENT_MAX_PINNED . ' announcements can be pinned. Unpin one first.',
        ]);
        exit;
    }
    $stmt = $conn->prepare('UPDATE announcements SET is_pinned = 1, pinned_at = NOW() WHERE announcement_id = ?');
} else {
    $stmt = $conn->prepare('UPDATE announcements SET is_pinned = 0, pinned_at = NULL WHERE announcement_id = ?');
}
$stmt->bind_param('i', $id);
$stmt->execute();
$stmt->close();

pb2_log_admin_action(
    $pin ? 'announcement.pin' : 'announcement.unpin',
    'announcement',
    (string) $id,
    ($pin ? 'Pinned' : 'Unpinned') . " announcement: $label"
);
echo json_encode(['success' => true, 'message' => $pin ? 'Pinned to the top.' : 'Unpinned.']);
