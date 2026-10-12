<?php
// Barangay Community Issue Map: public map + resident reports (migration 019,
// rules in issue_map_common.php).
//
// Public (no login):
//   GET ?action=list[&include_closed=1]   flags: category, position, status,
//                                         report_count, tier. Never identities.
//   GET ?action=detail&issue_id=N         one flag + staff timeline. Comments
//                                         only for a signed-in Active resident,
//                                         without names ("mine" marks your own).
// Signed-in Active resident:
//   GET  ?action=nearby&lat=&lng=&category=  open issues of that category within
//                                            PB2_ISSUE_NEARBY_M (duplicate check)
//   POST action=report (multipart)        new pin: category, lat, lng, landmark?,
//                                         comment, photo?, confirm_new?
//                                         or add to a pin: issue_id, comment, photo?
//   POST action=withdraw { issue_id }     remove your own report while open
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/issue_map_common.php';

$respond = function (bool $success, string $message, array $extra = [], int $code = 200) {
    if ($code !== 200) http_response_code($code);
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
};

if (!$conn) $respond(false, 'Database connection failed.');
// db_connection.php turns error reporting off; failed writes must throw so the
// transaction below rolls back (and a duplicate vote is caught as 1062).
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// The signed-in resident, or null. Only Active residents may report or read comments.
$me = null;
if (!empty($_SESSION['user_id'])) {
    $uid = (string)$_SESSION['user_id'];
    $stmt = $conn->prepare("SELECT resident_id, status FROM residents WHERE user_id = ? LIMIT 1");
    $stmt->bind_param('s', $uid);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($row && strtoupper((string)$row['status']) === 'ACTIVE') $me = (int)$row['resident_id'];
}
$requireResident = function () use ($me, $respond) {
    if (!$me) $respond(false, 'Please log in with an active resident account to do this.', ['auth_error' => true], 401);
    return $me;
};

$tiers = pb2_issue_tiers($conn);
$action = $_GET['action'] ?? ($_POST['action'] ?? '');
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === '') {
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $body['action'] ?? '';
}
$in = function ($key) use ($body) {
    return array_key_exists($key, $_POST) ? $_POST[$key] : ($body[$key] ?? null);
};

$loadIssue = function (int $id) use ($conn) {
    $stmt = $conn->prepare("SELECT * FROM community_issues WHERE issue_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
};

$mineSet = function (array $ids) use ($conn, $me) {
    if (!$me || !$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $conn->prepare("SELECT issue_id FROM community_issue_reports WHERE resident_id = ? AND issue_id IN ($ph)");
    $types = 'i' . str_repeat('i', count($ids));
    $stmt->bind_param($types, $me, ...$ids);
    $stmt->execute();
    $set = array_flip(array_map('intval', array_column($stmt->get_result()->fetch_all(MYSQLI_ASSOC), 'issue_id')));
    $stmt->close();
    return $set;
};

$base = [
    'categories' => PB2_ISSUE_CATEGORIES,
    'tiers'      => $tiers,
    'signed_in'  => (bool)$me,
];

// ---------------------------------------------------------------- list
if ($action === 'list') {
    $includeClosed = !empty($_GET['include_closed']);
    $open = "'" . implode("','", PB2_ISSUE_OPEN_STATUSES) . "'";
    $sql = "SELECT * FROM community_issues WHERE status IN ($open)";
    if ($includeClosed) {
        $sql .= " OR (status IN ('Resolved','Rejected') AND status_updated_at >= NOW() - INTERVAL " . (int)PB2_ISSUE_CLOSED_VISIBLE_DAYS . " DAY)";
    }
    $sql .= " ORDER BY report_count DESC, last_reported_at DESC LIMIT 1000";
    $rows = $conn->query($sql)->fetch_all(MYSQLI_ASSOC);
    $mine = $mineSet(array_map(function ($r) { return (int)$r['issue_id']; }, $rows));
    $issues = array_map(function ($r) use ($tiers, $mine) {
        $out = pb2_issue_public_row($r, $tiers);
        $out['mine'] = isset($mine[(int)$r['issue_id']]);
        return $out;
    }, $rows);
    $respond(true, 'OK', $base + ['issues' => $issues]);
}

// ---------------------------------------------------------------- detail
if ($action === 'detail') {
    $issue = $loadIssue((int)($_GET['issue_id'] ?? 0));
    if (!$issue) $respond(false, 'This issue no longer exists.', [], 404);
    $out = pb2_issue_public_row($issue, $tiers);
    $out['mine'] = isset($mineSet([(int)$issue['issue_id']])[(int)$issue['issue_id']]);
    $out['open'] = in_array($issue['status'], PB2_ISSUE_OPEN_STATUSES, true);
    $out['timeline'] = pb2_issue_timeline($conn, (int)$issue['issue_id']);

    $stmt = $conn->prepare("SELECT COUNT(*) FROM community_issue_reports WHERE issue_id = ? AND hidden_at IS NULL");
    $iid = (int)$issue['issue_id'];
    $stmt->bind_param('i', $iid);
    $stmt->execute();
    $out['comment_count'] = (int)$stmt->get_result()->fetch_row()[0];
    $stmt->close();

    if ($me) {
        // Anonymous to residents: no name, no resident id — only "mine".
        $stmt = $conn->prepare("SELECT comment, photo_path, created_at, resident_id = ? AS mine
                                  FROM community_issue_reports
                                 WHERE issue_id = ? AND hidden_at IS NULL
                                 ORDER BY created_at, report_id");
        $stmt->bind_param('ii', $me, $iid);
        $stmt->execute();
        $out['comments'] = array_map(function ($c) {
            return [
                'comment'    => $c['comment'],
                'photo_url'  => $c['photo_path'] ? '/uploads_backend/' . $c['photo_path'] : null,
                'created_at' => $c['created_at'],
                'mine'       => (bool)$c['mine'],
            ];
        }, $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        $stmt->close();
    } else {
        $out['comments'] = null; // log in to see comments
    }
    $respond(true, 'OK', $base + ['issue' => $out]);
}

// ---------------------------------------------------------------- nearby
if ($action === 'nearby') {
    $requireResident();
    $lat = (float)($_GET['lat'] ?? 0);
    $lng = (float)($_GET['lng'] ?? 0);
    $category = (string)($_GET['category'] ?? '');
    $respond(true, 'OK', $base + ['issues' => pb2_issue_find_nearby($conn, $lat, $lng, $category, $tiers, $mineSet)]);
}

// ---------------------------------------------------------------- report
if ($action === 'report' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $resident_id = $requireResident();

    $comment = trim(preg_replace('/\s+/u', ' ', (string)$in('comment')));
    if ($comment === '') $respond(false, 'Please describe the problem in your comment.');
    if (mb_strlen($comment) > PB2_ISSUE_COMMENT_MAX) $respond(false, 'Please keep your comment under ' . PB2_ISSUE_COMMENT_MAX . ' characters.');
    $comment = pb2_caps($comment);

    $issueId = (int)$in('issue_id');
    $conn->begin_transaction();
    $photo = null;
    try {
        if ($issueId) {
            // Add my report (vote) to an existing pin.
            $issue = $loadIssue($issueId);
            if (!$issue || $issue['status'] === 'Merged' && !$issue['merged_into']) $respond(false, 'This issue no longer exists.');
            if ($issue['status'] === 'Merged') {
                $issueId = (int)$issue['merged_into'];
                $issue = $loadIssue($issueId);
            }
            if (!$issue || !in_array($issue['status'], PB2_ISSUE_OPEN_STATUSES, true)) {
                $conn->rollback();
                $respond(false, 'This issue is already closed. If the problem is back, report it as a new issue.');
            }
            $chk = $conn->prepare("SELECT 1 FROM community_issue_reports WHERE issue_id = ? AND resident_id = ?");
            $chk->bind_param('ii', $issueId, $resident_id);
            $chk->execute();
            $already = (bool)$chk->get_result()->fetch_row();
            $chk->close();
            if ($already) {
                $conn->rollback();
                $respond(false, 'You have already reported this issue.');
            }
        } else {
            // A new pin.
            $category = (string)$in('category');
            $lat = filter_var($in('lat'), FILTER_VALIDATE_FLOAT);
            $lng = filter_var($in('lng'), FILTER_VALIDATE_FLOAT);
            if (!isset(PB2_ISSUE_CATEGORIES[$category])) $respond(false, 'Please choose what kind of problem this is.');
            if ($lat === false || $lng === false || !pb2_point_in_pb2($lat, $lng)) {
                $respond(false, 'Please place the pin inside Barangay Pasong Buaya II.');
            }
            $landmark = trim(preg_replace('/\s+/u', ' ', (string)$in('landmark')));
            if (mb_strlen($landmark) > PB2_ISSUE_LANDMARK_MAX) $respond(false, 'The landmark is too long.');
            $landmark = $landmark === '' ? null : pb2_caps($landmark);

            $cnt = $conn->prepare("SELECT COUNT(*) FROM community_issues WHERE created_by = ? AND created_at >= NOW() - INTERVAL 1 DAY");
            $cnt->bind_param('i', $resident_id);
            $cnt->execute();
            $today = (int)$cnt->get_result()->fetch_row()[0];
            $cnt->close();
            if ($today >= PB2_ISSUE_DAILY_NEW_LIMIT) {
                $conn->rollback();
                $respond(false, 'You can pin up to ' . PB2_ISSUE_DAILY_NEW_LIMIT . ' new issues a day. You can still add your report to existing ones.');
            }

            // Same problem already pinned nearby? Offer it first.
            if (!$in('confirm_new')) {
                $near = pb2_issue_find_nearby($conn, $lat, $lng, $category, $tiers, $mineSet);
                if ($near) {
                    $conn->rollback();
                    $respond(false, 'This problem may already be reported nearby.', ['code' => 'NEARBY_EXISTS', 'issues' => $near]);
                }
            }

            $ins = $conn->prepare("INSERT INTO community_issues (category, latitude, longitude, landmark, created_by) VALUES (?, ?, ?, ?, ?)");
            $ins->bind_param('sddsi', $category, $lat, $lng, $landmark, $resident_id);
            $ins->execute();
            $issueId = (int)$ins->insert_id;
            $ins->close();
        }

        $photo = pb2_issue_store_photo($_FILES['photo'] ?? null, $issueId);
        if ($photo === false) {
            $conn->rollback();
            $respond(false, 'The photo could not be read. Please use a JPEG, PNG or WebP image up to 8 MB.');
        }

        $rep = $conn->prepare("INSERT INTO community_issue_reports (issue_id, resident_id, comment, photo_path) VALUES (?, ?, ?, ?)");
        $rep->bind_param('iiss', $issueId, $resident_id, $comment, $photo);
        $rep->execute();
        $rep->close();

        $touch = $conn->prepare("UPDATE community_issues SET last_reported_at = NOW() WHERE issue_id = ?");
        $touch->bind_param('i', $issueId);
        $touch->execute();
        $touch->close();
        $count = pb2_issue_recount($conn, $issueId);
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        if ($photo) pb2_issue_delete_photo($photo);
        if ($e instanceof mysqli_sql_exception && (int)$e->getCode() === 1062) {
            $respond(false, 'You have already reported this issue.');
        }
        error_log('issue_map report: ' . $e->getMessage());
        $respond(false, 'We could not save your report. Please try again.');
    }

    $issue = $loadIssue($issueId);
    $row = pb2_issue_public_row($issue, $tiers);
    $row['mine'] = true;
    $respond(true, $count > 1
        ? "Thank you. Your report was added; $count residents have now reported this."
        : 'Thank you. Your report is now on the map.', $base + ['issue' => $row]);
}

// ---------------------------------------------------------------- withdraw
if ($action === 'withdraw' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $resident_id = $requireResident();
    $issueId = (int)$in('issue_id');
    $issue = $loadIssue($issueId);
    if (!$issue || !in_array($issue['status'], PB2_ISSUE_OPEN_STATUSES, true)) {
        $respond(false, 'Reports can only be withdrawn while the issue is open.');
    }
    $stmt = $conn->prepare("SELECT report_id, photo_path FROM community_issue_reports WHERE issue_id = ? AND resident_id = ?");
    $stmt->bind_param('ii', $issueId, $resident_id);
    $stmt->execute();
    $mine = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$mine) $respond(false, 'You have not reported this issue.');

    // The last report on a pin staff have already acted on stays, so their work isn't lost.
    if ((int)$issue['report_count'] <= 1 && $issue['status'] !== 'Reported') {
        $respond(false, 'Barangay staff are already working on this issue, so the only report on it can no longer be withdrawn.');
    }

    $del = $conn->prepare("DELETE FROM community_issue_reports WHERE report_id = ?");
    $rid = (int)$mine['report_id'];
    $del->bind_param('i', $rid);
    $del->execute();
    $del->close();
    pb2_issue_delete_photo($mine['photo_path']);

    $count = pb2_issue_recount($conn, $issueId);
    if ($count === 0) {
        $gone = $conn->prepare("DELETE FROM community_issues WHERE issue_id = ?");
        $gone->bind_param('i', $issueId);
        $gone->execute();
        $gone->close();
        @rmdir(__DIR__ . '/../uploads/issue_reports/' . $issueId);
        $respond(true, 'Your report was withdrawn and the pin was removed.', ['removed' => true]);
    }
    $row = pb2_issue_public_row($loadIssue($issueId), $tiers);
    $row['mine'] = false;
    $respond(true, 'Your report was withdrawn.', ['removed' => false, 'issue' => $row]);
}

$respond(false, 'Unknown action.', [], 400);

/** Open issues of a category within PB2_ISSUE_NEARBY_M of a point, nearest first. */
function pb2_issue_find_nearby(mysqli $conn, float $lat, float $lng, string $category, array $tiers, callable $mineSet): array
{
    if (!isset(PB2_ISSUE_CATEGORIES[$category])) return [];
    // ~0.0005 degrees is about 55 m: a cheap box before the exact distance.
    $d = 0.0005;
    $open = "'" . implode("','", PB2_ISSUE_OPEN_STATUSES) . "'";
    $stmt = $conn->prepare("SELECT * FROM community_issues
                             WHERE category = ? AND status IN ($open)
                               AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?");
    $a = $lat - $d; $b = $lat + $d; $c = $lng - $d; $e = $lng + $d;
    $stmt->bind_param('sdddd', $category, $a, $b, $c, $e);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $out = [];
    foreach ($rows as $r) {
        $dist = pb2_issue_distance_m($lat, $lng, (float)$r['latitude'], (float)$r['longitude']);
        if ($dist > PB2_ISSUE_NEARBY_M) continue;
        $row = pb2_issue_public_row($r, $tiers);
        $row['distance_m'] = (int)round($dist);
        $out[] = $row;
    }
    usort($out, function ($x, $y) { return $x['distance_m'] <=> $y['distance_m']; });
    $mine = $mineSet(array_column($out, 'issue_id'));
    foreach ($out as &$o) $o['mine'] = isset($mine[$o['issue_id']]);
    return $out;
}
