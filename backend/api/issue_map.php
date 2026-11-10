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
//   POST action=flag { report_id, reason } report another resident's comment
//
// Safeguards (migration 048): a resident agrees to the posting rules
// (agree_rules=1) on every report; comments and landmarks are screened
// (issue_map_screen.php): contact details and offensive words are refused,
// possible names are held for a staff check, and with issue_review_mode =
// 'all' every report is held. Held or removed reports are not public and not
// counted. A suspended resident can still view the map but not post or flag.
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
require_once __DIR__ . '/issue_map_screen.php';

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
$mySuspension = $me ? pb2_issue_active_suspension($conn, $me) : null;
$suspensionOut = $mySuspension ? [
    'reason'    => $mySuspension['reason'],
    'ends_at'   => $mySuspension['ends_at'],
    'permanent' => $mySuspension['permanent'],
    'until'     => pb2_issue_suspension_until($mySuspension['ends_at']),
] : null;
// Posting is blocked while a suspension is in force (viewing is not).
$requirePoster = function () use ($requireResident, $mySuspension, $suspensionOut, $respond) {
    $id = $requireResident();
    if ($mySuspension) {
        $respond(false, 'Your access to post on the Issue Map is paused ' . $suspensionOut['until'] . '. Reason: ' . $mySuspension['reason'],
            ['code' => 'SUSPENDED', 'suspension' => $suspensionOut]);
    }
    return $id;
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

// Issues the signed-in resident has a report on (reports staff removed left out).
$mineSet = function (array $ids) use ($conn, $me) {
    if (!$me || !$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $conn->prepare("SELECT issue_id FROM community_issue_reports WHERE resident_id = ? AND removed_at IS NULL AND issue_id IN ($ph)");
    $types = 'i' . str_repeat('i', count($ids));
    $stmt->bind_param($types, $me, ...$ids);
    $stmt->execute();
    $set = array_flip(array_map('intval', array_column($stmt->get_result()->fetch_all(MYSQLI_ASSOC), 'issue_id')));
    $stmt->close();
    return $set;
};

$base = [
    'categories'   => PB2_ISSUE_CATEGORIES,
    'tiers'        => $tiers,
    'signed_in'    => (bool)$me,
    'suspension'   => $suspensionOut,
    'flag_reasons' => PB2_ISSUE_FLAG_REASONS,
];

// ---------------------------------------------------------------- list
if ($action === 'list') {
    $includeClosed = !empty($_GET['include_closed']);
    $open = "'" . implode("','", PB2_ISSUE_OPEN_STATUSES) . "'";
    // A pin with no counted report (only held or removed ones) is not public.
    $sql = "SELECT * FROM community_issues WHERE report_count > 0 AND (status IN ($open)";
    if ($includeClosed) {
        $sql .= " OR (status IN ('Resolved','Rejected') AND status_updated_at >= NOW() - INTERVAL " . (int)PB2_ISSUE_CLOSED_VISIBLE_DAYS . " DAY)";
    }
    $sql .= ") ORDER BY report_count DESC, last_reported_at DESC LIMIT 1000";
    $rows = $conn->query($sql)->fetch_all(MYSQLI_ASSOC);
    $mine = $mineSet(array_map(function ($r) { return (int)$r['issue_id']; }, $rows));
    $issues = array_map(function ($r) use ($tiers, $mine) {
        $out = pb2_issue_public_row($r, $tiers);
        $out['mine'] = isset($mine[(int)$r['issue_id']]);
        return $out;
    }, $rows);
    // The resident's own new pins still waiting for a staff check (shown only to them).
    $pending = [];
    if ($me) {
        $stmt = $conn->prepare("SELECT i.* FROM community_issues i
                                  JOIN community_issue_reports cr ON cr.issue_id = i.issue_id
                                 WHERE cr.resident_id = ? AND cr.held_at IS NOT NULL AND cr.removed_at IS NULL
                                   AND i.report_count = 0 AND i.status IN ($open)
                                 ORDER BY i.created_at DESC LIMIT 20");
        $stmt->bind_param('i', $me);
        $stmt->execute();
        foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $r) {
            $row = pb2_issue_public_row($r, $tiers);
            $row['mine'] = true;
            $row['pending'] = true;
            $pending[] = $row;
        }
        $stmt->close();
    }
    $respond(true, 'OK', $base + ['issues' => $issues, 'my_pending' => $pending]);
}

// ---------------------------------------------------------------- detail
if ($action === 'detail') {
    $issue = $loadIssue((int)($_GET['issue_id'] ?? 0));
    if (!$issue) $respond(false, 'This issue no longer exists.', [], 404);
    $iid = (int)$issue['issue_id'];
    // My own report on it: 'live' | 'held' (waiting for staff) | 'removed' | null.
    $myReport = null;
    if ($me) {
        $stmt = $conn->prepare("SELECT held_at, removed_at FROM community_issue_reports WHERE issue_id = ? AND resident_id = ?");
        $stmt->bind_param('ii', $iid, $me);
        $stmt->execute();
        $mr = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($mr) $myReport = $mr['removed_at'] ? 'removed' : ($mr['held_at'] ? 'held' : 'live');
    }
    // A pin with no counted report is shown only to the resident waiting on it.
    if ((int)$issue['report_count'] === 0 && $myReport !== 'held') $respond(false, 'This issue is not on the map.', [], 404);
    $out = pb2_issue_public_row($issue, $tiers);
    $out['mine'] = $myReport === 'live' || $myReport === 'held';
    $out['my_report'] = $myReport;
    $out['pending'] = (int)$issue['report_count'] === 0;
    $out['open'] = in_array($issue['status'], PB2_ISSUE_OPEN_STATUSES, true);
    $out['timeline'] = $out['pending'] ? [] : pb2_issue_timeline($conn, $iid);

    $stmt = $conn->prepare("SELECT COUNT(*) FROM community_issue_reports WHERE issue_id = ? AND hidden_at IS NULL AND " . PB2_ISSUE_LIVE_SQL);
    $stmt->bind_param('i', $iid);
    $stmt->execute();
    $out['comment_count'] = (int)$stmt->get_result()->fetch_row()[0];
    $stmt->close();

    if ($me) {
        // Anonymous to residents: no name, no resident id, only "mine". Held
        // comments are shown to their own author only (marked pending).
        $stmt = $conn->prepare("SELECT cr.report_id, cr.comment, cr.photo_path, cr.created_at, cr.held_at,
                                       cr.resident_id = ? AS mine,
                                       EXISTS (SELECT 1 FROM community_issue_flags f WHERE f.report_id = cr.report_id AND f.resident_id = ?) AS flagged
                                  FROM community_issue_reports cr
                                 WHERE cr.issue_id = ? AND cr.hidden_at IS NULL AND cr.removed_at IS NULL
                                   AND (cr.held_at IS NULL OR cr.resident_id = ?)
                                 ORDER BY cr.created_at, cr.report_id");
        $stmt->bind_param('iiii', $me, $me, $iid, $me);
        $stmt->execute();
        $out['comments'] = array_map(function ($c) {
            return [
                'report_id'  => (int)$c['report_id'],
                'comment'    => $c['comment'],
                'photo_url'  => $c['photo_path'] ? '/api_backend/' . $c['photo_path'] : null,
                'created_at' => $c['created_at'],
                'mine'       => (bool)$c['mine'],
                'pending'    => $c['held_at'] !== null,
                'flagged'    => (bool)$c['flagged'],
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
    $resident_id = $requirePoster();
    if (!filter_var($in('agree_rules'), FILTER_VALIDATE_BOOLEAN)) {
        $respond(false, 'Please read the posting rules and tick the box to agree before you post.', ['code' => 'RULES_REQUIRED']);
    }

    $comment = trim(preg_replace('/\s+/u', ' ', (string)$in('comment')));
    if ($comment === '') $respond(false, 'Please describe the problem in your comment.');
    if (mb_strlen($comment) > PB2_ISSUE_COMMENT_MAX) $respond(false, 'Please keep your comment under ' . PB2_ISSUE_COMMENT_MAX . ' characters.');
    // Posted publicly without names: kept as typed (not stored as resident data).

    // Screening: refuse contact details and offensive words; hold possible names.
    $screen = pb2_screen($conn, $comment);
    if ($screen['blocked']) $respond(false, $screen['blocked'], ['code' => 'SCREEN_BLOCKED', 'field' => 'comment']);
    $holdNotes = $screen['hold'] ? ['Comment: ' . $screen['hold']] : [];
    if (!(int)$in('issue_id')) {
        $lmScreen = pb2_screen($conn, (string)$in('landmark'));
        if ($lmScreen['blocked']) $respond(false, 'Landmark: ' . $lmScreen['blocked'], ['code' => 'SCREEN_BLOCKED', 'field' => 'landmark']);
        if ($lmScreen['hold']) $holdNotes[] = 'Landmark: ' . $lmScreen['hold'];
    }
    if (pb2_issue_review_mode($conn) === 'all') array_unshift($holdNotes, 'Manual review is on: every new report is checked first.');
    $heldReason = $holdNotes ? mb_substr(implode(' ', $holdNotes), 0, 255) : null;

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
            $landmark = $landmark === '' ? null : $landmark;

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

        if ($heldReason === null) {
            $rep = $conn->prepare("INSERT INTO community_issue_reports (issue_id, resident_id, comment, photo_path) VALUES (?, ?, ?, ?)");
            $rep->bind_param('iiss', $issueId, $resident_id, $comment, $photo);
        } else {
            $rep = $conn->prepare("INSERT INTO community_issue_reports (issue_id, resident_id, comment, photo_path, held_at, held_reason) VALUES (?, ?, ?, ?, NOW(), ?)");
            $rep->bind_param('iisss', $issueId, $resident_id, $comment, $photo, $heldReason);
        }
        $rep->execute();
        $rep->close();

        if ($heldReason === null) {
            $touch = $conn->prepare("UPDATE community_issues SET last_reported_at = NOW() WHERE issue_id = ?");
            $touch->bind_param('i', $issueId);
            $touch->execute();
            $touch->close();
        }
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
    if ($heldReason !== null) {
        $row['pending'] = $count === 0;
        $why = strpos($heldReason, 'Manual review') === 0
            ? 'Barangay staff check every new report before it appears.'
            : 'It may mention a person, so barangay staff will check it first.';
        $respond(true, "Thank you. Your report was received and will appear on the map once barangay staff check it. $why",
            $base + ['issue' => $row, 'held' => true]);
    }
    $respond(true, $count > 1
        ? "Thank you. Your report was added; $count residents have now reported this."
        : 'Thank you. Your report is now on the map.', $base + ['issue' => $row, 'held' => false]);
}

// ---------------------------------------------------------------- withdraw
if ($action === 'withdraw' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $resident_id = $requireResident();
    $issueId = (int)$in('issue_id');
    $issue = $loadIssue($issueId);
    if (!$issue || !in_array($issue['status'], PB2_ISSUE_OPEN_STATUSES, true)) {
        $respond(false, 'Reports can only be withdrawn while the issue is open.');
    }
    $stmt = $conn->prepare("SELECT report_id, photo_path FROM community_issue_reports WHERE issue_id = ? AND resident_id = ? AND removed_at IS NULL");
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
    // Remove the pin only when no report of any kind is left on it (held or
    // removed reports are kept for staff and the residents' records).
    $left = $conn->prepare("SELECT COUNT(*) FROM community_issue_reports WHERE issue_id = ?");
    $left->bind_param('i', $issueId);
    $left->execute();
    $anyLeft = (int)$left->get_result()->fetch_row()[0];
    $left->close();
    if ($count === 0 && $anyLeft === 0) {
        $gone = $conn->prepare("DELETE FROM community_issues WHERE issue_id = ?");
        $gone->bind_param('i', $issueId);
        $gone->execute();
        $gone->close();
        @rmdir(__DIR__ . '/uploads/issue_reports/' . $issueId);
        $respond(true, 'Your report was withdrawn and the pin was removed.', ['removed' => true]);
    }
    if ($count === 0) $respond(true, 'Your report was withdrawn.', ['removed' => true]);
    $row = pb2_issue_public_row($loadIssue($issueId), $tiers);
    $row['mine'] = false;
    $respond(true, 'Your report was withdrawn.', ['removed' => false, 'issue' => $row]);
}

// ---------------------------------------------------------------- flag
// Report another resident's comment. PB2_ISSUE_FLAG_AUTOHIDE residents hide it
// until staff check it (not a comment staff have already checked).
if ($action === 'flag' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $resident_id = $requirePoster();
    $reportId = (int)$in('report_id');
    $reason = (string)$in('reason');
    if (!isset(PB2_ISSUE_FLAG_REASONS[$reason])) $respond(false, 'Please choose what is wrong with this comment.');
    $stmt = $conn->prepare("SELECT report_id, resident_id, reviewed_at, hidden_at FROM community_issue_reports
                             WHERE report_id = ? AND removed_at IS NULL AND held_at IS NULL");
    $stmt->bind_param('i', $reportId);
    $stmt->execute();
    $rep = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$rep) $respond(false, 'This comment is no longer on the map.');
    if ((int)$rep['resident_id'] === $resident_id) $respond(false, "You can't report your own comment. You can withdraw your report instead.");
    $hidden = false;
    try {
        $conn->begin_transaction();
        $ins = $conn->prepare("INSERT INTO community_issue_flags (report_id, resident_id, reason) VALUES (?, ?, ?)");
        $ins->bind_param('iis', $reportId, $resident_id, $reason);
        $ins->execute();
        $ins->close();
        // A new flag puts the comment back in front of staff (the "new" badge).
        $upd = $conn->prepare("UPDATE community_issue_reports
                                  SET flag_count = (SELECT COUNT(*) FROM community_issue_flags WHERE report_id = ?),
                                      staff_seen_at = NULL
                                WHERE report_id = ?");
        $upd->bind_param('ii', $reportId, $reportId);
        $upd->execute();
        $upd->close();
        if ($rep['hidden_at'] === null && $rep['reviewed_at'] === null) {
            $why = 'Hidden automatically after ' . PB2_ISSUE_FLAG_AUTOHIDE . ' residents reported it. Waiting for a staff check.';
            $lim = PB2_ISSUE_FLAG_AUTOHIDE;
            $hide = $conn->prepare("UPDATE community_issue_reports SET hidden_at = NOW(), hidden_by = NULL, hidden_reason = ?
                                     WHERE report_id = ? AND flag_count >= ? AND hidden_at IS NULL");
            $hide->bind_param('sii', $why, $reportId, $lim);
            $hide->execute();
            $hidden = $hide->affected_rows > 0;
            $hide->close();
        }
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        if ($e instanceof mysqli_sql_exception && (int)$e->getCode() === 1062) {
            $respond(false, 'You have already reported this comment. Barangay staff will look at it.');
        }
        error_log('issue_map flag: ' . $e->getMessage());
        $respond(false, 'We could not send your report. Please try again.');
    }
    $respond(true, $hidden
        ? 'Thank you. This comment is now hidden until barangay staff check it.'
        : 'Thank you. Barangay staff will look at this comment.', ['hidden' => $hidden]);
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
                             WHERE category = ? AND status IN ($open) AND report_count > 0
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
