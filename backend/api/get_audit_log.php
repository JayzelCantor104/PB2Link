<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Read-only, Super-Admin-only access to the admin activity audit log.
// There is deliberately no POST/PUT/DELETE handler anywhere in this file —
// the audit log has no mutating endpoint on the API surface at all.
require_once __DIR__ . '/auth_guard.php';
pb2_require_super_admin();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

include_once __DIR__ . '/../db_connection.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$page = max(1, (int)($_GET['page'] ?? 1));
$pageSize = (int)($_GET['page_size'] ?? 25);
$pageSize = max(1, min(100, $pageSize));
$offset = ($page - 1) * $pageSize;

$adminId = isset($_GET['admin_id']) && $_GET['admin_id'] !== '' ? (int)$_GET['admin_id'] : null;
$eventType = trim($_GET['event_type'] ?? '');
$targetEntityType = trim($_GET['target_entity_type'] ?? '');
$dateFrom = trim($_GET['date_from'] ?? '');
$dateTo = trim($_GET['date_to'] ?? '');

$where = [];
$params = [];
$types = '';

if ($adminId !== null) {
    $where[] = 'actor_admin_id = ?';
    $params[] = $adminId;
    $types .= 'i';
}
if ($eventType !== '') {
    $where[] = 'event_type = ?';
    $params[] = $eventType;
    $types .= 's';
}
if ($targetEntityType !== '') {
    $where[] = 'target_entity_type = ?';
    $params[] = $targetEntityType;
    $types .= 's';
}
if ($dateFrom !== '') {
    $where[] = 'created_at >= ?';
    $params[] = $dateFrom . ' 00:00:00';
    $types .= 's';
}
if ($dateTo !== '') {
    $where[] = 'created_at <= ?';
    $params[] = $dateTo . ' 23:59:59';
    $types .= 's';
}

$whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

// Total count, for pagination metadata.
$countSql = "SELECT COUNT(*) AS total FROM admin_audit_log $whereSql";
$countStmt = mysqli_prepare($conn, $countSql);
if (!$countStmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Query preparation failed.']);
    exit;
}
if ($types !== '') {
    mysqli_stmt_bind_param($countStmt, $types, ...$params);
}
mysqli_stmt_execute($countStmt);
$total = (int) (mysqli_fetch_assoc(mysqli_stmt_get_result($countStmt))['total'] ?? 0);
mysqli_stmt_close($countStmt);

// Page of results.
$dataSql = "SELECT log_id, event_type, actor_admin_id, actor_username, actor_role,
                   target_entity_type, target_entity_id, description, changed_fields,
                   outcome, ip_address, user_agent, created_at
            FROM admin_audit_log
            $whereSql
            ORDER BY log_id DESC
            LIMIT ? OFFSET ?";

$dataParams = $params;
$dataParams[] = $pageSize;
$dataParams[] = $offset;
$dataTypes = $types . 'ii';

$dataStmt = mysqli_prepare($conn, $dataSql);
if (!$dataStmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Query preparation failed.']);
    exit;
}
mysqli_stmt_bind_param($dataStmt, $dataTypes, ...$dataParams);
mysqli_stmt_execute($dataStmt);
$result = mysqli_stmt_get_result($dataStmt);

$rows = [];
while ($row = mysqli_fetch_assoc($result)) {
    $row['changed_fields'] = $row['changed_fields'] !== null ? json_decode($row['changed_fields'], true) : null;
    $rows[] = $row;
}
mysqli_stmt_close($dataStmt);

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
