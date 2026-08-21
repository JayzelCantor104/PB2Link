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

// Full paginated history behind "Past Announcements". Same visibility rule as
// the home feed, no result cap — public/unguarded on purpose.
require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/announcements_common.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$page = max(1, (int) ($_GET['page'] ?? 1));
$pageSize = (int) ($_GET['page_size'] ?? 12);
$pageSize = max(1, min(50, $pageSize));
$offset = ($page - 1) * $pageSize;

$userId = isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
$visibility = pb2_announcement_visibility($conn, $userId);

$countSql = "SELECT COUNT(*) AS total FROM announcements a WHERE {$visibility['where']}";
$countStmt = $conn->prepare($countSql);
if ($visibility['types'] !== '') {
    $countStmt->bind_param($visibility['types'], ...$visibility['params']);
}
$countStmt->execute();
$total = (int) ($countStmt->get_result()->fetch_assoc()['total'] ?? 0);
$countStmt->close();

$dataSql = "SELECT a.announcement_id, a.caption, a.audience_type, a.created_at, a.updated_at
            FROM announcements a
            WHERE {$visibility['where']}
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?";

$dataParams = $visibility['params'];
$dataParams[] = $pageSize;
$dataParams[] = $offset;
$dataTypes = $visibility['types'] . 'ii';

$dataStmt = $conn->prepare($dataSql);
$dataStmt->bind_param($dataTypes, ...$dataParams);
$dataStmt->execute();
$result = $dataStmt->get_result();

$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}
$dataStmt->close();

$rows = pb2_attach_announcement_details($conn, $rows);

echo json_encode([
    'success' => true,
    'data' => $rows,
    'pagination' => [
        'page' => $page,
        'page_size' => $pageSize,
        'total' => $total,
        'total_pages' => (int) ceil($total / $pageSize),
    ],
]);
$conn->close();
