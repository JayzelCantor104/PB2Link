<?php
header('Content-Type: application/json');
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Public feed for the Home page: works for anonymous visitors too, so this
// reads the session directly instead of going through pb2_require_admin() /
// any citizen-only guard.
require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/announcements_common.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$userId = isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
$visibility = pb2_announcement_visibility($conn, $userId);

$sql = "SELECT a.announcement_id, a.caption, a.audience_type, a.created_at, a.updated_at
        FROM announcements a
        WHERE {$visibility['where']}
        ORDER BY a.created_at DESC
        LIMIT 5";

$stmt = $conn->prepare($sql);
if ($visibility['types'] !== '') {
    $stmt->bind_param($visibility['types'], ...$visibility['params']);
}
$stmt->execute();
$result = $stmt->get_result();

$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}
$stmt->close();

$rows = pb2_attach_announcement_details($conn, $rows);

echo json_encode(['success' => true, 'data' => $rows]);
$conn->close();
