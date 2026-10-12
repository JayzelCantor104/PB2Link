<?php
// Barangay Community Issue Map: staff side (migration 019, rules in
// issue_map_common.php). Every action needs an admin session; every write is
// audit-logged.
//
//   GET  ?action=list[&status=open|closed|all|<status>][&category=]   all pins + counts
//   GET  ?action=detail&issue_id=N   pin, every report WITH the resident's name,
//                                    hidden comments, timeline with staff names
//   GET  ?action=summary             open counts by status + top 3 (dashboard)
//   POST { action:'status', issue_id, status, remarks }   status change (remark
//                                    is public); notifies the reporters
//   POST { action:'hide' | 'unhide', report_id, reason? }  moderate a comment
//                                    (the report still counts as a vote)
//   POST { action:'merge', issue_id, into_id, remarks }   duplicate pin: its
//                                    reports move to into_id (one per resident)
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
$admin = pb2_require_admin();
$admin_id = (int)$admin['admin_id'];

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/issue_map_common.php';

$respond = function (bool $success, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
};
if (!$conn) $respond(false, 'Database connection failed.');
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$tiers = pb2_issue_tiers($conn);
$data = $_SERVER['REQUEST_METHOD'] === 'POST' ? (json_decode(file_get_contents('php://input'), true) ?: []) : [];
$action = $_GET['action'] ?? ($data['action'] ?? '');

$loadIssue = function (int $id) use ($conn) {
    $stmt = $conn->prepare("SELECT * FROM community_issues WHERE issue_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
};
$addUpdate = function (int $issueId, ?string $old, string $new, string $remarks) use ($conn, $admin_id) {
    $stmt = $conn->prepare("INSERT INTO community_issue_updates (issue_id, admin_id, old_status, new_status, remarks) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param('iisss', $issueId, $admin_id, $old, $new, $remarks);
    $stmt->execute();
    $stmt->close();
};
$base = ['categories' => PB2_ISSUE_CATEGORIES, 'tiers' => $tiers, 'transitions' => PB2_ISSUE_TRANSITIONS];

// ---------------------------------------------------------------- list
if ($action === 'list') {
    $where = [];
    $types = '';
    $params = [];
    $status = (string)($_GET['status'] ?? 'open');
    if ($status === 'open') {
        $where[] = "i.status IN ('" . implode("','", PB2_ISSUE_OPEN_STATUSES) . "')";
    } elseif ($status === 'closed') {
        $where[] = "i.status IN ('Resolved','Rejected')";
    } elseif (isset(PB2_ISSUE_TRANSITIONS[$status])) {
        $where[] = "i.status = ?";
        $types .= 's';
        $params[] = $status;
    } else {
        $where[] = "i.status <> 'Merged'"; // 'all'
    }
    $category = (string)($_GET['category'] ?? '');
    if (isset(PB2_ISSUE_CATEGORIES[$category])) {
        $where[] = "i.category = ?";
        $types .= 's';
        $params[] = $category;
    }
    $sql = "SELECT i.*,
                   (SELECT COUNT(*) FROM community_issue_reports r WHERE r.issue_id = i.issue_id AND r.hidden_at IS NOT NULL) AS hidden_count,
                   (SELECT COUNT(*) FROM community_issue_reports r WHERE r.issue_id = i.issue_id AND r.photo_path IS NOT NULL) AS photo_count
              FROM community_issues i
             WHERE " . implode(' AND ', $where) . "
             ORDER BY i.report_count DESC, i.last_reported_at DESC LIMIT 2000";
    $stmt = $conn->prepare($sql);
    if ($params) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $issues = array_map(function ($r) use ($tiers) {
        $out = pb2_issue_public_row($r, $tiers);
        $out['hidden_count'] = (int)$r['hidden_count'];
        $out['photo_count'] = (int)$r['photo_count'];
        return $out;
    }, $rows);
    $respond(true, 'OK', $base + ['issues' => $issues]);
}

// ---------------------------------------------------------------- summary
if ($action === 'summary') {
    $open = "'" . implode("','", PB2_ISSUE_OPEN_STATUSES) . "'";
    $byStatus = [];
    foreach ($conn->query("SELECT status, COUNT(*) n FROM community_issues WHERE status IN ($open) GROUP BY status")->fetch_all(MYSQLI_ASSOC) as $r) {
        $byStatus[$r['status']] = (int)$r['n'];
    }
    $top = array_map(function ($r) use ($tiers) { return pb2_issue_public_row($r, $tiers); },
        $conn->query("SELECT * FROM community_issues WHERE status IN ($open) ORDER BY report_count DESC, last_reported_at DESC LIMIT 3")->fetch_all(MYSQLI_ASSOC));
    $respond(true, 'OK', $base + ['open_total' => array_sum($byStatus), 'by_status' => $byStatus, 'top' => $top]);
}

// ---------------------------------------------------------------- detail
if ($action === 'detail') {
    $issue = $loadIssue((int)($_GET['issue_id'] ?? 0));
    if (!$issue) $respond(false, 'Issue not found.');
    $iid = (int)$issue['issue_id'];
    $out = pb2_issue_public_row($issue, $tiers);
    $out['timeline'] = pb2_issue_timeline($conn, $iid, true);
    $out['allowed_next'] = PB2_ISSUE_TRANSITIONS[$issue['status']] ?? [];

    $stmt = $conn->prepare("SELECT cr.report_id, cr.comment, cr.photo_path, cr.created_at, cr.hidden_at, cr.hidden_reason,
                                   r.resident_id, r.control_num, r.fName, r.mName, r.lName, r.suffix, r.contact_num,
                                   a.fullname AS hidden_by_name,
                                   cr.resident_id = i.created_by AS is_first
                              FROM community_issue_reports cr
                              JOIN residents r ON r.resident_id = cr.resident_id
                              JOIN community_issues i ON i.issue_id = cr.issue_id
                              LEFT JOIN admins a ON a.admin_id = cr.hidden_by
                             WHERE cr.issue_id = ?
                             ORDER BY cr.created_at, cr.report_id");
    $stmt->bind_param('i', $iid);
    $stmt->execute();
    $out['reports'] = array_map(function ($r) {
        return [
            'report_id'      => (int)$r['report_id'],
            'resident_id'    => (int)$r['resident_id'],
            'control_num'    => $r['control_num'],
            'name'           => trim(preg_replace('/\s+/', ' ', "{$r['fName']} {$r['mName']} {$r['lName']} {$r['suffix']}")),
            'contact_num'    => $r['contact_num'],
            'comment'        => $r['comment'],
            'photo_url'      => $r['photo_path'] ? '/uploads_backend/' . $r['photo_path'] : null,
            'created_at'     => $r['created_at'],
            'hidden'         => $r['hidden_at'] !== null,
            'hidden_reason'  => $r['hidden_reason'],
            'hidden_by_name' => $r['hidden_by_name'],
            'is_first'       => (bool)$r['is_first'],
        ];
    }, $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    $stmt->close();
    $respond(true, 'OK', $base + ['issue' => $out]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') $respond(false, 'Unknown action.');

// ---------------------------------------------------------------- status
if ($action === 'status') {
    $issue = $loadIssue((int)($data['issue_id'] ?? 0));
    if (!$issue) $respond(false, 'Issue not found.');
    $new = (string)($data['status'] ?? '');
    $remarks = trim((string)($data['remarks'] ?? ''));
    if (!in_array($new, PB2_ISSUE_TRANSITIONS[$issue['status']] ?? [], true)) {
        $respond(false, "An issue that is {$issue['status']} can't be moved to $new.");
    }
    if ($remarks === '') $respond(false, 'Please add a remark. Residents see it on the map.');
    if (mb_strlen($remarks) > 500) $respond(false, 'Please keep the remark under 500 characters.');
    $remarks = pb2_caps($remarks);
    $iid = (int)$issue['issue_id'];

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("UPDATE community_issues SET status = ?, status_updated_at = NOW() WHERE issue_id = ?");
        $stmt->bind_param('si', $new, $iid);
        $stmt->execute();
        $stmt->close();
        $addUpdate($iid, $issue['status'], $new, $remarks);
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('admin_issue_map status: ' . $e->getMessage());
        $respond(false, 'Could not save the status.');
    }
    pb2_log_admin_action('issue.status', 'community_issue', (string)$iid,
        "Issue #$iid ({$issue['category']}) {$issue['status']} -> $new",
        [['field' => 'status', 'old_value' => $issue['status'], 'new_value' => $new]]);
    $sent = pb2_issue_notify_reporters($conn, $iid, $issue['category'], $new, $remarks);
    $respond(true, "Status set to $new. Reporters notified ({$sent['email']} email, {$sent['sms']} SMS).", ['notified' => $sent]);
}

// ---------------------------------------------------------------- hide / unhide
if ($action === 'hide' || $action === 'unhide') {
    $reportId = (int)($data['report_id'] ?? 0);
    $stmt = $conn->prepare("SELECT issue_id, hidden_at FROM community_issue_reports WHERE report_id = ?");
    $stmt->bind_param('i', $reportId);
    $stmt->execute();
    $rep = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$rep) $respond(false, 'Report not found.');

    if ($action === 'hide') {
        $reason = trim((string)($data['reason'] ?? ''));
        if ($reason === '') $respond(false, 'Please give a reason for hiding this comment.');
        $reason = mb_substr(pb2_caps($reason), 0, 255);
        $stmt = $conn->prepare("UPDATE community_issue_reports SET hidden_at = NOW(), hidden_by = ?, hidden_reason = ? WHERE report_id = ?");
        $stmt->bind_param('isi', $admin_id, $reason, $reportId);
    } else {
        $reason = null;
        $stmt = $conn->prepare("UPDATE community_issue_reports SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL WHERE report_id = ?");
        $stmt->bind_param('i', $reportId);
    }
    $stmt->execute();
    $stmt->close();
    pb2_log_admin_action('issue.comment.' . $action, 'community_issue_report', (string)$reportId,
        ($action === 'hide' ? 'Hid' : 'Unhid') . " a comment on issue #{$rep['issue_id']}" . ($reason ? ": $reason" : ''));
    $respond(true, $action === 'hide' ? 'Comment hidden from residents. The report still counts.' : 'Comment visible again.');
}

// ---------------------------------------------------------------- merge
if ($action === 'merge') {
    $from = $loadIssue((int)($data['issue_id'] ?? 0));
    $into = $loadIssue((int)($data['into_id'] ?? 0));
    $remarks = trim((string)($data['remarks'] ?? ''));
    if (!$from || !$into) $respond(false, 'Both issues must exist.');
    if ((int)$from['issue_id'] === (int)$into['issue_id']) $respond(false, 'Choose a different issue to merge into.');
    if ($from['status'] === 'Merged' || !in_array($into['status'], PB2_ISSUE_OPEN_STATUSES, true)) {
        $respond(false, 'Only an unmerged issue can be merged, and only into an open issue.');
    }
    if ($remarks === '') $remarks = "Same problem as issue #{$into['issue_id']}.";
    $remarks = pb2_caps($remarks);
    $fromId = (int)$from['issue_id'];
    $intoId = (int)$into['issue_id'];
    // Who to tell afterwards, taken before reports move.
    $fromReporters = pb2_issue_reporter_users($conn, $fromId);
    $intoReporters = pb2_issue_reporter_users($conn, $intoId);

    $conn->begin_transaction();
    try {
        // Residents who reported both keep one report (on the target).
        $stmt = $conn->prepare("UPDATE community_issue_reports SET issue_id = ?
                                 WHERE issue_id = ? AND resident_id NOT IN
                                       (SELECT resident_id FROM (SELECT resident_id FROM community_issue_reports WHERE issue_id = ?) t)");
        $stmt->bind_param('iii', $intoId, $fromId, $intoId);
        $stmt->execute();
        $moved = $stmt->affected_rows;
        $stmt->close();
        $stmt = $conn->prepare("UPDATE community_issues SET status = 'Merged', merged_into = ?, status_updated_at = NOW() WHERE issue_id = ?");
        $stmt->bind_param('ii', $intoId, $fromId);
        $stmt->execute();
        $stmt->close();
        $stmt = $conn->prepare("UPDATE community_issues SET last_reported_at = GREATEST(last_reported_at, ?) WHERE issue_id = ?");
        $stmt->bind_param('si', $from['last_reported_at'], $intoId);
        $stmt->execute();
        $stmt->close();
        $addUpdate($fromId, $from['status'], 'Merged', $remarks);
        $addUpdate($intoId, $into['status'], $into['status'], "ISSUE #$fromId WAS MERGED INTO THIS ONE.");
        pb2_issue_recount($conn, $intoId);
        pb2_issue_recount($conn, $fromId);
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('admin_issue_map merge: ' . $e->getMessage());
        $respond(false, 'Could not merge the issues.');
    }
    pb2_log_admin_action('issue.merge', 'community_issue', (string)$fromId,
        "Merged issue #$fromId into #$intoId ($moved report(s) moved)",
        [['field' => 'merged_into', 'old_value' => null, 'new_value' => (string)$intoId]]);
    $sent = pb2_issue_notify_merged($conn, $fromReporters, $intoReporters, $fromId, $intoId,
        $from['category'], $into['status'], $remarks);
    $respond(true, "Merged into issue #$intoId. $moved report(s) moved; duplicates by the same resident were kept once. "
        . "Reporters notified ({$sent['email']} email).", ['notified' => $sent]);
}

$respond(false, 'Unknown action.');
