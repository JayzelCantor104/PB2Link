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

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/announcements_common.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$page = max(1, (int) ($_GET['page'] ?? 1));
$pageSize = (int) ($_GET['page_size'] ?? 10);
$pageSize = max(1, min(50, $pageSize));
$offset = ($page - 1) * $pageSize;

$total = (int) ($conn->query('SELECT COUNT(*) AS total FROM announcements')->fetch_assoc()['total'] ?? 0);

$stmt = $conn->prepare(
    "SELECT a.announcement_id, a.caption, a.audience_type, a.created_at, a.updated_at,
            ad.fullname AS posted_by
     FROM announcements a
     JOIN admins ad ON ad.admin_id = a.admin_id
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?"
);
$stmt->bind_param('ii', $pageSize, $offset);
$stmt->execute();
$result = $stmt->get_result();

$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = $row;
}
$stmt->close();

$rows = pb2_attach_announcement_details($conn, $rows);

// Recipient names, admin-only detail (never exposed on the public endpoints).
if (!empty($rows)) {
    $ids = array_column($rows, 'announcement_id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));

    $recipientsByAnnouncement = [];
    $stmt = $conn->prepare(
        "SELECT r.announcement_id, res.fName, res.lName
         FROM announcement_recipients r
         JOIN residents res ON res.user_id = r.user_id
         WHERE r.announcement_id IN ($placeholders)"
    );
    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $recipientsByAnnouncement[$row['announcement_id']][] = trim($row['fName'] . ' ' . $row['lName']);
    }
    $stmt->close();

    foreach ($rows as &$row) {
        $row['target_recipients'] = $recipientsByAnnouncement[$row['announcement_id']] ?? [];
    }
    unset($row);
}

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
