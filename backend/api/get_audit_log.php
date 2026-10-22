<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Read-only, Super-Admin-only access to the admin activity audit log.
//   GET ?page&page_size&<filters>        JSON page of entries
//   GET ?export=csv&<filters>            the same filters as a CSV download
//                                        (newest first, up to 50,000 rows;
//                                        the export itself is audit-logged)
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

// Tabs / areas of the system, by the first part of event_type. Mirrored in
// src/Admin/AuditLog.jsx (AUDIT_MODULES).
const PB2_AUDIT_MODULES = [
    'accounts'      => ['admin'],
    'settings'      => ['settings'],
    'residents'     => ['resident', 'profile_change'],
    'address'       => ['address'],
    'documents'     => ['document_request'],
    'services'      => ['service'],
    'payments'      => ['payment', 'payments'],
    'incidents'     => ['incident_report'],
    'amenities'     => ['amenity', 'amenity_reservation'],
    'announcements' => ['announcement', 'about'],
    'waste'         => ['waste'],
    'disaster'      => ['disaster'],
    'issues'        => ['issue'],
];

// 'system' = actions the system took on its own (no admin behind them).
$adminParam = (string)($_GET['admin_id'] ?? '');
$systemOnly = $adminParam === 'system';
$adminId = !$systemOnly && $adminParam !== '' ? (int)$adminParam : null;
$module = (string)($_GET['module'] ?? '');
$outcome = (string)($_GET['outcome'] ?? '');
$search = trim((string)($_GET['q'] ?? ''));
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
if ($systemOnly) {
    $where[] = 'actor_admin_id IS NULL';
}
if (isset(PB2_AUDIT_MODULES[$module])) {
    $likes = [];
    foreach (PB2_AUDIT_MODULES[$module] as $prefix) {
        $likes[] = 'event_type LIKE ?';
        $params[] = $prefix . '.%';
        $types .= 's';
    }
    $where[] = '(' . implode(' OR ', $likes) . ')';
}
if ($outcome === 'success' || $outcome === 'failure') {
    $where[] = 'outcome = ?';
    $params[] = $outcome;
    $types .= 's';
}
if ($search !== '') {
    // Description, who, the target's id, or a value in the change details.
    $where[] = '(description LIKE ? OR actor_username LIKE ? OR target_entity_id = ? OR changed_fields LIKE ?)';
    $like = '%' . $search . '%';
    array_push($params, $like, $like, $search, $like);
    $types .= 'ssss';
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

// ---- CSV export (same filters) -----------------------------------------------
if (($_GET['export'] ?? '') === 'csv') {
    require_once __DIR__ . '/csv_export.php';
    require_once __DIR__ . '/audit_log.php';
    $areaNames = [
        'accounts' => 'Admin accounts & sign-in', 'settings' => 'System settings', 'residents' => 'Residents & profile approvals',
        'address' => 'Address list', 'documents' => 'Document requests', 'services' => 'Services', 'payments' => 'Payments',
        'incidents' => 'Incident reports', 'amenities' => 'Amenities', 'announcements' => 'Announcements & About page',
        'waste' => 'Waste management', 'disaster' => 'Disaster risk & SMS', 'issues' => 'Issue map',
    ];
    $areaOf = function (string $eventType) use ($areaNames): string {
        $prefix = explode('.', $eventType)[0];
        foreach (PB2_AUDIT_MODULES as $key => $prefixes) {
            if (in_array($prefix, $prefixes, true)) return $areaNames[$key];
        }
        return '';
    };
    $limit = 50000;
    $sql = "SELECT log_id, created_at, actor_username, actor_role, actor_admin_id, event_type, target_entity_type, target_entity_id,
                   description, changed_fields, outcome, ip_address, user_agent
            FROM admin_audit_log $whereSql ORDER BY log_id DESC LIMIT $limit";
    $st = mysqli_prepare($conn, $sql);
    if ($types !== '') mysqli_stmt_bind_param($st, $types, ...$params);
    mysqli_stmt_execute($st);
    $res = mysqli_stmt_get_result($st);
    $rows = [];
    while ($r = mysqli_fetch_assoc($res)) {
        // "field: old -> new" for each change, on one line.
        $changes = [];
        foreach ((array)json_decode((string)$r['changed_fields'], true) as $cf) {
            if (!is_array($cf)) continue;
            $old = $cf['old_value'] ?? null;
            $new = $cf['new_value'] ?? null;
            $changes[] = ($cf['field'] ?? '?') . ': ' . ($old === null ? '(empty)' : (string)$old) . ' -> ' . ($new === null ? '(empty)' : (string)$new);
        }
        $rows[] = [
            $r['log_id'], $r['created_at'], $r['actor_username'],
            $r['actor_admin_id'] === null ? 'System' : $r['actor_role'],
            $areaOf((string)$r['event_type']), $r['event_type'],
            $r['target_entity_type'], $r['target_entity_id'], $r['description'],
            implode(' | ', $changes), $r['outcome'], $r['ip_address'], $r['user_agent'],
        ];
    }
    $filterNote = [];
    foreach (['admin_id' => $adminParam, 'module' => $module, 'event_type' => $eventType, 'target' => $targetEntityType,
              'outcome' => $outcome, 'search' => $search, 'from' => $dateFrom, 'to' => $dateTo] as $k => $v) {
        if ($v !== '' && $v !== null) $filterNote[] = "$k=$v";
    }
    pb2_log_admin_action('admin.audit.export', 'audit_log', null,
        'Exported ' . count($rows) . ' audit log entr' . (count($rows) === 1 ? 'y' : 'ies') . ' to CSV'
        . ($filterNote ? ' (' . implode(', ', $filterNote) . ')' : ' (no filters)')
        . (count($rows) >= $limit ? " - capped at $limit, narrow the filters for older entries" : ''));
    pb2_csv_send('pb2-audit-log', ['Entry #', 'Date & time', 'Who', 'Role', 'Area', 'Action', 'Target type', 'Target ID',
        'What happened', 'Changes (field: old -> new)', 'Outcome', 'IP address', 'Browser'], $rows);
}

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

// Every action and target type recorded so far, for the filters.
$eventTypes = [];
$r = mysqli_query($conn, "SELECT event_type, COUNT(*) AS n FROM admin_audit_log GROUP BY event_type ORDER BY event_type");
while ($r && ($e = mysqli_fetch_assoc($r))) $eventTypes[] = ['value' => $e['event_type'], 'count' => (int)$e['n']];
$targetTypes = [];
$r = mysqli_query($conn, "SELECT DISTINCT target_entity_type FROM admin_audit_log WHERE target_entity_type IS NOT NULL ORDER BY target_entity_type");
while ($r && ($e = mysqli_fetch_row($r))) $targetTypes[] = $e[0];

echo json_encode([
    'success' => true,
    'data' => $rows,
    'event_types' => $eventTypes,
    'target_types' => $targetTypes,
    'pagination' => [
        'page' => $page,
        'page_size' => $pageSize,
        'total' => $total,
        'total_pages' => (int) ceil($total / $pageSize),
    ],
]);

$conn->close();
