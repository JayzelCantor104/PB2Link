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
//
// Safeguards (migration 048):
//   GET  ?action=counts              new / held / flagged (sidebar badge, dashboard)
//   GET  ?action=suspensions         residents whose posting is paused
//   POST { action:'approve', report_id }        publish a report held for a check
//   POST { action:'remove', report_id, reason, suspend?: '7'|'30'|'permanent' }
//                                    take a post down (abuse, or a held report not
//                                    posted); the resident is emailed the reason
//   POST { action:'restore', report_id }        undo a removal
//   POST { action:'suspend', resident_id, length, reason }   pause posting
//   POST { action:'lift', suspension_id, reason }            end a pause early
// Opening an issue's detail marks its reports as seen by staff.
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
require_once __DIR__ . '/admin_permissions.php';
pb2_require_any_permission(['module.issues']); // tab access
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
$base = [
    'categories'      => PB2_ISSUE_CATEGORIES,
    'tiers'           => $tiers,
    'transitions'     => PB2_ISSUE_TRANSITIONS,
    'flag_reasons'    => PB2_ISSUE_FLAG_REASONS,
    'suspend_options' => array_keys(PB2_ISSUE_SUSPEND_OPTIONS),
    'review_mode'     => pb2_issue_review_mode($conn),
];
// Reports waiting for staff: never opened by staff, held for a check, or hidden by residents' reports.
const PB2_ISSUE_ATTENTION_SQL = "(r.staff_seen_at IS NULL OR (r.held_at IS NOT NULL AND r.removed_at IS NULL)
                                  OR (r.hidden_at IS NOT NULL AND r.hidden_by IS NULL AND r.removed_at IS NULL AND r.reviewed_at IS NULL))";
$loadReport = function (int $id) use ($conn) {
    $stmt = $conn->prepare("SELECT cr.*, i.category, i.status AS issue_status
                              FROM community_issue_reports cr JOIN community_issues i ON i.issue_id = cr.issue_id
                             WHERE cr.report_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
};
$excerpt = function (string $text): string {
    return mb_strlen($text) > 160 ? mb_substr($text, 0, 157) . '...' : $text;
};

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
    } elseif ($status === 'attention') {
        $where[] = "EXISTS (SELECT 1 FROM community_issue_reports r WHERE r.issue_id = i.issue_id AND " . PB2_ISSUE_ATTENTION_SQL . ")";
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
                   (SELECT COUNT(*) FROM community_issue_reports r WHERE r.issue_id = i.issue_id AND r.photo_path IS NOT NULL) AS photo_count,
                   (SELECT COUNT(*) FROM community_issue_reports r WHERE r.issue_id = i.issue_id AND r.staff_seen_at IS NULL) AS new_count,
                   (SELECT COUNT(*) FROM community_issue_reports r WHERE r.issue_id = i.issue_id AND r.held_at IS NOT NULL AND r.removed_at IS NULL) AS held_count,
                   (SELECT COUNT(*) FROM community_issue_reports r WHERE r.issue_id = i.issue_id AND r.flag_count > 0 AND r.removed_at IS NULL AND r.reviewed_at IS NULL) AS flagged_count
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
        $out['new_count'] = (int)$r['new_count'];
        $out['held_count'] = (int)$r['held_count'];
        $out['flagged_count'] = (int)$r['flagged_count'];
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

// ---------------------------------------------------------------- counts
if ($action === 'counts') {
    $row = $conn->query("SELECT COALESCE(SUM(r.staff_seen_at IS NULL), 0),
                                COALESCE(SUM(r.held_at IS NOT NULL AND r.removed_at IS NULL), 0),
                                COALESCE(SUM(r.flag_count > 0 AND r.removed_at IS NULL AND r.reviewed_at IS NULL AND r.staff_seen_at IS NULL), 0),
                                COUNT(DISTINCT CASE WHEN " . PB2_ISSUE_ATTENTION_SQL . " THEN r.issue_id END)
                           FROM community_issue_reports r")->fetch_row();
    $susp = (int)$conn->query("SELECT COUNT(*) FROM issue_map_suspensions WHERE lifted_at IS NULL AND (ends_at IS NULL OR ends_at > NOW())")->fetch_row()[0];
    $respond(true, 'OK', ['counts' => [
        'new' => (int)$row[0], 'held' => (int)$row[1], 'flagged' => (int)$row[2], 'issues' => (int)$row[3], 'suspended' => $susp,
    ], 'review_mode' => pb2_issue_review_mode($conn)]);
}

// ---------------------------------------------------------------- suspensions
if ($action === 'suspensions') {
    $rows = $conn->query("SELECT s.suspension_id, s.resident_id, s.reason, s.starts_at, s.ends_at, s.report_id,
                                 r.control_num, r.fName, r.mName, r.lName, r.suffix, a.fullname AS created_by_name
                            FROM issue_map_suspensions s
                            JOIN residents r ON r.resident_id = s.resident_id
                            LEFT JOIN admins a ON a.admin_id = s.created_by
                           WHERE s.lifted_at IS NULL AND (s.ends_at IS NULL OR s.ends_at > NOW())
                           ORDER BY s.starts_at DESC")->fetch_all(MYSQLI_ASSOC);
    $respond(true, 'OK', $base + ['suspensions' => array_map(function ($s) {
        return [
            'suspension_id'   => (int)$s['suspension_id'],
            'resident_id'     => (int)$s['resident_id'],
            'name'            => trim(preg_replace('/\s+/', ' ', "{$s['fName']} {$s['mName']} {$s['lName']} {$s['suffix']}")),
            'control_num'     => $s['control_num'],
            'reason'          => $s['reason'],
            'starts_at'       => $s['starts_at'],
            'ends_at'         => $s['ends_at'],
            'created_by_name' => $s['created_by_name'],
        ];
    }, $rows)]);
}

// ---------------------------------------------------------------- detail
if ($action === 'detail') {
    $issue = $loadIssue((int)($_GET['issue_id'] ?? 0));
    if (!$issue) $respond(false, 'Issue not found.');
    $iid = (int)$issue['issue_id'];
    $out = pb2_issue_public_row($issue, $tiers);
    $out['timeline'] = pb2_issue_timeline($conn, $iid, true);
    $out['allowed_next'] = PB2_ISSUE_TRANSITIONS[$issue['status']] ?? [];

    $stmt = $conn->prepare("SELECT cr.report_id, cr.comment, cr.photo_path, cr.created_at, cr.hidden_at, cr.hidden_reason, cr.hidden_by,
                                   cr.held_at, cr.held_reason, cr.reviewed_at, cr.removed_at, cr.removed_reason, cr.staff_seen_at, cr.flag_count,
                                   r.resident_id, r.control_num, r.fName, r.mName, r.lName, r.suffix, r.contact_num,
                                   a.fullname AS hidden_by_name, rv.fullname AS reviewed_by_name, rm.fullname AS removed_by_name,
                                   cr.resident_id = i.created_by AS is_first
                              FROM community_issue_reports cr
                              JOIN residents r ON r.resident_id = cr.resident_id
                              JOIN community_issues i ON i.issue_id = cr.issue_id
                              LEFT JOIN admins a ON a.admin_id = cr.hidden_by
                              LEFT JOIN admins rv ON rv.admin_id = cr.reviewed_by
                              LEFT JOIN admins rm ON rm.admin_id = cr.removed_by
                             WHERE cr.issue_id = ?
                             ORDER BY cr.created_at, cr.report_id");
    $stmt->bind_param('i', $iid);
    $stmt->execute();
    $rawReports = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    // Why residents reported each comment, and each reporter's record on the map.
    $flagsBy = [];
    if ($rawReports) {
        $ids = implode(',', array_map('intval', array_column($rawReports, 'report_id')));
        foreach ($conn->query("SELECT report_id, reason, COUNT(*) n FROM community_issue_flags WHERE report_id IN ($ids) GROUP BY report_id, reason")->fetch_all(MYSQLI_ASSOC) as $f) {
            $flagsBy[(int)$f['report_id']][] = ['reason' => $f['reason'], 'label' => PB2_ISSUE_FLAG_REASONS[$f['reason']] ?? $f['reason'], 'count' => (int)$f['n']];
        }
    }
    $conduct = [];
    foreach (array_unique(array_map('intval', array_column($rawReports, 'resident_id'))) as $rid) {
        $conduct[$rid] = pb2_issue_conduct($conn, $rid);
    }
    $out['reports'] = array_map(function ($r) use ($flagsBy, $conduct) {
        $rid = (int)$r['resident_id'];
        return [
            'held'             => $r['held_at'] !== null && $r['removed_at'] === null,
            'held_at'          => $r['held_at'],
            'held_reason'      => $r['held_reason'],
            'reviewed_at'      => $r['reviewed_at'],
            'reviewed_by_name' => $r['reviewed_by_name'],
            'removed'          => $r['removed_at'] !== null,
            'removed_at'       => $r['removed_at'],
            'removed_reason'   => $r['removed_reason'],
            'removed_by_name'  => $r['removed_by_name'],
            'auto_hidden'      => $r['hidden_at'] !== null && $r['hidden_by'] === null,
            'is_new'           => $r['staff_seen_at'] === null,
            'flag_count'       => (int)$r['flag_count'],
            'flags'            => $flagsBy[(int)$r['report_id']] ?? [],
            'conduct'          => $conduct[$rid] ?? null,
            'report_id'      => (int)$r['report_id'],
            'resident_id'    => (int)$r['resident_id'],
            'control_num'    => $r['control_num'],
            'name'           => trim(preg_replace('/\s+/', ' ', "{$r['fName']} {$r['mName']} {$r['lName']} {$r['suffix']}")),
            'contact_num'    => $r['contact_num'],
            'comment'        => $r['comment'],
            'photo_url'      => $r['photo_path'] ? '/api_backend/' . $r['photo_path'] : null,
            'created_at'     => $r['created_at'],
            'hidden'         => $r['hidden_at'] !== null,
            'hidden_reason'  => $r['hidden_reason'],
            'hidden_by_name' => $r['hidden_by_name'],
            'is_first'       => (bool)$r['is_first'],
        ];
    }, $rawReports);
    // Opening the issue counts as staff having seen its reports.
    $seen = $conn->prepare("UPDATE community_issue_reports SET staff_seen_at = NOW() WHERE issue_id = ? AND staff_seen_at IS NULL");
    $seen->bind_param('i', $iid);
    $seen->execute();
    $seen->close();
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
        $reason = mb_substr($reason, 0, 255);
        $stmt = $conn->prepare("UPDATE community_issue_reports SET hidden_at = NOW(), hidden_by = ?, hidden_reason = ? WHERE report_id = ?");
        $stmt->bind_param('isi', $admin_id, $reason, $reportId);
    } else {
        $reason = null;
        // Staff checked it: residents' reports won't hide it again on their own.
        $stmt = $conn->prepare("UPDATE community_issue_reports SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL,
                                       reviewed_at = NOW(), reviewed_by = ?, staff_seen_at = COALESCE(staff_seen_at, NOW())
                                 WHERE report_id = ?");
        $stmt->bind_param('ii', $admin_id, $reportId);
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

// ---------------------------------------------------------------- approve (held -> live)
if ($action === 'approve') {
    $rep = $loadReport((int)($data['report_id'] ?? 0));
    if (!$rep || $rep['held_at'] === null || $rep['removed_at'] !== null) $respond(false, 'This report is not waiting for a check.');
    $rid = (int)$rep['report_id'];
    $iid = (int)$rep['issue_id'];
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("UPDATE community_issue_reports SET held_at = NULL, reviewed_at = NOW(), reviewed_by = ?,
                                       staff_seen_at = COALESCE(staff_seen_at, NOW()) WHERE report_id = ?");
        $stmt->bind_param('ii', $admin_id, $rid);
        $stmt->execute();
        $stmt->close();
        $stmt = $conn->prepare("UPDATE community_issues SET last_reported_at = GREATEST(last_reported_at, ?) WHERE issue_id = ?");
        $stmt->bind_param('si', $rep['created_at'], $iid);
        $stmt->execute();
        $stmt->close();
        $count = pb2_issue_recount($conn, $iid);
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('admin_issue_map approve: ' . $e->getMessage());
        $respond(false, 'Could not publish the report.');
    }
    pb2_log_admin_action('issue.report.approve', 'community_issue_report', (string)$rid,
        "Published a held report on issue #$iid" . ($rep['held_reason'] ? " (held: {$rep['held_reason']})" : ''));
    $respond(true, "Published. Issue #$iid now has $count report" . ($count === 1 ? '' : 's') . ' on the map.');
}

// ---------------------------------------------------------------- remove (abuse / not posted)
if ($action === 'remove') {
    $rep = $loadReport((int)($data['report_id'] ?? 0));
    if (!$rep || $rep['removed_at'] !== null) $respond(false, 'This report was already removed.');
    $reason = trim((string)($data['reason'] ?? ''));
    if ($reason === '') $respond(false, 'Please give the reason. The resident is emailed it.');
    if (mb_strlen($reason) > 255) $respond(false, 'Please keep the reason under 255 characters.');
    $length = (string)($data['suspend'] ?? '');
    if ($length !== '' && !array_key_exists($length, PB2_ISSUE_SUSPEND_OPTIONS)) $respond(false, 'Choose 7 days, 30 days or until lifted.');
    $rid = (int)$rep['report_id'];
    $iid = (int)$rep['issue_id'];
    $residentId = (int)$rep['resident_id'];
    $wasHeld = $rep['held_at'] !== null;
    $closedPin = false;
    $susp = null;

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("UPDATE community_issue_reports SET removed_at = NOW(), removed_by = ?, removed_reason = ?, held_at = NULL,
                                       staff_seen_at = COALESCE(staff_seen_at, NOW()) WHERE report_id = ?");
        $stmt->bind_param('isi', $admin_id, $reason, $rid);
        $stmt->execute();
        $stmt->close();
        $count = pb2_issue_recount($conn, $iid);
        // Nothing real left on an open pin (no counted or held report): close it.
        $stmt = $conn->prepare("SELECT COUNT(*) FROM community_issue_reports WHERE issue_id = ? AND removed_at IS NULL");
        $stmt->bind_param('i', $iid);
        $stmt->execute();
        $alive = (int)$stmt->get_result()->fetch_row()[0];
        $stmt->close();
        if ($alive === 0 && in_array($rep['issue_status'], PB2_ISSUE_OPEN_STATUSES, true)) {
            $stmt = $conn->prepare("UPDATE community_issues SET status = 'Rejected', status_updated_at = NOW() WHERE issue_id = ?");
            $stmt->bind_param('i', $iid);
            $stmt->execute();
            $stmt->close();
            $addUpdate($iid, $rep['issue_status'], 'Rejected', 'Removed by barangay staff.');
            $closedPin = true;
        }
        if ($length !== '') {
            $susp = pb2_issue_suspend($conn, $residentId, $length, $reason, $admin_id, $rid);
        }
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('admin_issue_map remove: ' . $e->getMessage());
        $respond(false, 'Could not remove the report.');
    }
    pb2_log_admin_action('issue.report.remove', 'community_issue_report', (string)$rid,
        ($wasHeld ? 'Did not post' : 'Removed') . " a report on issue #$iid: $reason" . ($closedPin ? ' (pin closed)' : ''),
        [['field' => 'removed_reason', 'old_value' => null, 'new_value' => $reason]]);
    if ($susp) {
        pb2_log_admin_action('issue.suspend', 'resident', (string)$residentId,
            'Paused Issue Map posting ' . pb2_issue_suspension_until($susp['ends_at']) . ": $reason",
            [['field' => 'issue_map_suspension', 'old_value' => null, 'new_value' => $susp['ends_at'] ?? 'until lifted']]);
    }

    // The resident always gets an email explaining it.
    $label = PB2_ISSUE_CATEGORIES[$rep['category']] ?? 'Community issue';
    $safeComment = htmlspecialchars($excerpt((string)$rep['comment']), ENT_QUOTES, 'UTF-8');
    $safeReason = htmlspecialchars($reason, ENT_QUOTES, 'UTF-8');
    $subject = $wasHeld ? 'Your Issue Map report was not posted' : 'Your Issue Map post was removed';
    $what = $wasHeld
        ? "Barangay staff checked your report on the PB2Link Issue Map (<strong>#$iid, $label</strong>) and did not post it."
        : "Barangay staff removed your post on the PB2Link Issue Map (<strong>#$iid, $label</strong>).";
    $html = "<p>$what</p><p><strong>Your post:</strong> \"$safeComment\"</p><p><strong>Reason:</strong> $safeReason</p>";
    $plain = strip_tags(str_replace('<strong>', '', $what)) . "\nYour post: \"" . $excerpt((string)$rep['comment']) . "\"\nReason: $reason";
    if ($susp) {
        $until = pb2_issue_suspension_until($susp['ends_at']);
        $html .= "<p>Your access to post on the Issue Map is <strong>paused $until</strong>. You can still view the map.</p>";
        $plain .= "\nYour access to post on the Issue Map is paused $until. You can still view the map.";
    }
    $html .= '<p>Please describe the problem, not people: no names, accusations, insults or contact details. '
           . 'For private complaints, use Report Incident, which goes only to barangay staff.</p>';
    $plain .= "\nPlease describe the problem, not people: no names, accusations, insults or contact details.";
    $mailed = pb2_issue_mail_resident($conn, $residentId, $subject, $html, $plain);

    $msg = ($wasHeld ? 'Not posted.' : 'Post removed.')
         . ($susp ? ' Posting paused ' . pb2_issue_suspension_until($susp['ends_at']) . '.' : '')
         . ($closedPin ? ' The pin had no other reports, so it was closed.' : '')
         . ($mailed ? ' The resident was emailed the reason.' : ' The email to the resident could not be sent.');
    $respond(true, $msg, ['mailed' => $mailed]);
}

// ---------------------------------------------------------------- restore
if ($action === 'restore') {
    $rep = $loadReport((int)($data['report_id'] ?? 0));
    if (!$rep || $rep['removed_at'] === null) $respond(false, 'This report is not removed.');
    $rid = (int)$rep['report_id'];
    $iid = (int)$rep['issue_id'];
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("UPDATE community_issue_reports SET removed_at = NULL, removed_by = NULL, removed_reason = NULL,
                                       reviewed_at = NOW(), reviewed_by = ? WHERE report_id = ?");
        $stmt->bind_param('ii', $admin_id, $rid);
        $stmt->execute();
        $stmt->close();
        $count = pb2_issue_recount($conn, $iid);
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('admin_issue_map restore: ' . $e->getMessage());
        $respond(false, 'Could not restore the report.');
    }
    pb2_log_admin_action('issue.report.restore', 'community_issue_report', (string)$rid, "Restored a removed report on issue #$iid",
        [['field' => 'removed_reason', 'old_value' => $rep['removed_reason'], 'new_value' => null]]);
    $respond(true, 'Report restored.' . ($rep['issue_status'] === 'Rejected' ? ' The issue is still Rejected; reopen it if needed.' : '')
        . ' A suspension, if any, stays until you lift it.');
}

// ---------------------------------------------------------------- suspend
if ($action === 'suspend') {
    $residentId = (int)($data['resident_id'] ?? 0);
    $length = (string)($data['length'] ?? '');
    $reason = trim((string)($data['reason'] ?? ''));
    if (!array_key_exists($length, PB2_ISSUE_SUSPEND_OPTIONS)) $respond(false, 'Choose 7 days, 30 days or until lifted.');
    if ($reason === '') $respond(false, 'Please give the reason. The resident is emailed it.');
    if (mb_strlen($reason) > 500) $respond(false, 'Please keep the reason under 500 characters.');
    $stmt = $conn->prepare("SELECT resident_id FROM residents WHERE resident_id = ?");
    $stmt->bind_param('i', $residentId);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    if (!$exists) $respond(false, 'Resident not found.');
    try {
        $susp = pb2_issue_suspend($conn, $residentId, $length, $reason, $admin_id);
    } catch (Throwable $e) {
        error_log('admin_issue_map suspend: ' . $e->getMessage());
        $respond(false, 'Could not save the suspension.');
    }
    $until = pb2_issue_suspension_until($susp['ends_at']);
    pb2_log_admin_action('issue.suspend', 'resident', (string)$residentId, "Paused Issue Map posting $until: $reason",
        [['field' => 'issue_map_suspension', 'old_value' => null, 'new_value' => $susp['ends_at'] ?? 'until lifted']]);
    $safeReason = htmlspecialchars($reason, ENT_QUOTES, 'UTF-8');
    $mailed = pb2_issue_mail_resident($conn, $residentId, 'Your Issue Map posting is paused',
        "<p>Your access to post on the PB2Link Issue Map is <strong>paused $until</strong>. You can still view the map.</p>"
        . "<p><strong>Reason:</strong> $safeReason</p>",
        "Your access to post on the PB2Link Issue Map is paused $until. You can still view the map.\nReason: $reason");
    $respond(true, "Posting paused $until." . ($mailed ? ' The resident was emailed the reason.' : ' The email to the resident could not be sent.'));
}

// ---------------------------------------------------------------- lift
if ($action === 'lift') {
    $sid = (int)($data['suspension_id'] ?? 0);
    $reason = mb_substr(trim((string)($data['reason'] ?? '')), 0, 255);
    $stmt = $conn->prepare("SELECT resident_id FROM issue_map_suspensions WHERE suspension_id = ? AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at > NOW())");
    $stmt->bind_param('i', $sid);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) $respond(false, 'This suspension has already ended.');
    $lr = $reason === '' ? null : $reason;
    $stmt = $conn->prepare("UPDATE issue_map_suspensions SET lifted_at = NOW(), lifted_by = ?, lift_reason = ? WHERE suspension_id = ?");
    $stmt->bind_param('isi', $admin_id, $lr, $sid);
    $stmt->execute();
    $stmt->close();
    pb2_log_admin_action('issue.suspend.lift', 'resident', (string)$row['resident_id'],
        'Lifted an Issue Map posting pause' . ($reason !== '' ? ": $reason" : ''));
    $mailed = pb2_issue_mail_resident($conn, (int)$row['resident_id'], 'You can post on the Issue Map again',
        '<p>Barangay staff lifted the pause on your PB2Link Issue Map posting. You can report community issues again.</p>'
        . '<p>Please describe the problem, not people: no names, accusations, insults or contact details.</p>',
        "Barangay staff lifted the pause on your PB2Link Issue Map posting. You can report community issues again.");
    $respond(true, 'Suspension lifted.' . ($mailed ? ' The resident was emailed.' : ''));
}

$respond(false, 'Unknown action.');
