<?php
/**
 * Barangay Community Issue Map (migration 019): shared rules for
 * issue_map.php (public + residents) and admin_issue_map.php (staff).
 *
 *  - A pin must be inside Pasong Buaya II (pb2_point_in_pb2, server-side).
 *  - One report per resident per issue; the report is the vote and always
 *    carries a comment (stored as typed) and maybe a photo.
 *  - A new pin within PB2_ISSUE_NEARBY_M of an open issue of the same
 *    category is offered as "add your report to this" first.
 *  - Flag colour = report_count against the thresholds in system_settings
 *    'issue_flag_tiers' ("orange,red,purple" minimums; 1 report = yellow).
 *  - Residents never receive reporter identities; only staff do.
 *  - Status changes notify reporters by email (when their preference includes
 *    email); SMS only for Resolved, to protect SMS_MONTHLY_CAP.
 *
 * Callers must already have $conn (db_connection.php).
 */

require_once __DIR__ . '/text_case.php';

const PB2_ISSUE_CATEGORIES = [
    'streetlight'     => 'Broken Streetlight',
    'illegal_dumping' => 'Illegal Dumping',
    'road_damage'     => 'Road Damage',
    'flooding'        => 'Flooding',
    'stray_animals'   => 'Stray Animals',
    'noise'           => 'Noise Complaint',
    'fire_hazard'     => 'Fire Hazard',
    'water'           => 'Water Problem',
];

const PB2_ISSUE_OPEN_STATUSES = ['Reported', 'Acknowledged', 'In Progress'];
// Resolved / Rejected issues stay on the map (behind a toggle) this long.
const PB2_ISSUE_CLOSED_VISIBLE_DAYS = 7;
const PB2_ISSUE_NEARBY_M = 30;
const PB2_ISSUE_DAILY_NEW_LIMIT = 5;
const PB2_ISSUE_COMMENT_MAX = 500;
const PB2_ISSUE_LANDMARK_MAX = 150;
const PB2_ISSUE_DEFAULT_TIERS = [2, 5, 10];

// ---- Safeguards (migration 048, screening in issue_map_screen.php)
// A report is public and counted only when it is neither held for a staff
// check nor removed by staff (hidden comments still count as votes).
const PB2_ISSUE_LIVE_SQL = 'held_at IS NULL AND removed_at IS NULL';
// system_settings.issue_review_mode: 'off' = posts go live at once (only
// possible names are held); 'all' = every new report waits for staff.
const PB2_ISSUE_REVIEW_MODES = ['off', 'all'];
// This many residents reporting a comment hide it until staff check it.
const PB2_ISSUE_FLAG_AUTOHIDE = 3;
const PB2_ISSUE_FLAG_REASONS = [
    'offensive'    => 'Offensive or insulting',
    'names_person' => 'Names or accuses a person',
    'private_info' => 'Shares private information',
    'false_report' => 'False or not a real problem',
    'other'        => 'Something else',
];
// Suspension lengths staff can choose (days; null = until staff lift it).
const PB2_ISSUE_SUSPEND_OPTIONS = ['7' => 7, '30' => 30, 'permanent' => null];

// Staff status changes (Merged is set only by a merge).
const PB2_ISSUE_TRANSITIONS = [
    'Reported'     => ['Acknowledged', 'In Progress', 'Resolved', 'Rejected'],
    'Acknowledged' => ['In Progress', 'Resolved', 'Rejected'],
    'In Progress'  => ['Resolved', 'Rejected'],
    'Resolved'     => ['In Progress'],   // reopen
    'Rejected'     => ['Reported'],      // reopen
    'Merged'       => [],
];

// Official boundary, copied from src/components/pasongBuaya2Boundary.js
// (PSA PSGC 2023, barangay 0402109085). Keep the two in sync.
const PB2_BOUNDARY_POINTS = [
    [14.393018, 120.963759], [14.392581, 120.962762], [14.394417, 120.961962], [14.394361, 120.960932],
    [14.395265, 120.959954], [14.394755, 120.958518], [14.394115, 120.956229], [14.393152, 120.956105],
    [14.392334, 120.956668], [14.390275, 120.958171], [14.390047, 120.959276], [14.389483, 120.959305],
    [14.389079, 120.960239], [14.387704, 120.961511], [14.387545, 120.962097], [14.386329, 120.962749],
    [14.385178, 120.962584], [14.384691, 120.963711], [14.382517, 120.963696], [14.379677, 120.964193],
    [14.378133, 120.964881], [14.377269, 120.964769], [14.375736, 120.963383], [14.374439, 120.963101],
    [14.373183, 120.962489], [14.372183, 120.962598], [14.369022, 120.963836], [14.364781, 120.963332],
    [14.364435, 120.98161], [14.365694, 120.981615], [14.366728, 120.975464], [14.368046, 120.975994],
    [14.369089, 120.975615], [14.369606, 120.974979], [14.372421, 120.974944], [14.373619, 120.974107],
    [14.377135, 120.974107], [14.378019, 120.973547], [14.37995, 120.973309], [14.380759, 120.972244],
    [14.381318, 120.970905], [14.382365, 120.97067], [14.382939, 120.97001], [14.385585, 120.969992],
    [14.385866, 120.969292], [14.387382, 120.969255], [14.387143, 120.9713], [14.387593, 120.971406],
    [14.388639, 120.969386], [14.389443, 120.96936], [14.390642, 120.97005], [14.391685, 120.970206],
    [14.391368, 120.967725], [14.392424, 120.967155], [14.393269, 120.969112], [14.393695, 120.967683],
    [14.392949, 120.965377], [14.393018, 120.963759],
];

/** Ray-casting point-in-polygon test against the barangay boundary. */
function pb2_point_in_pb2(float $lat, float $lng): bool
{
    $inside = false;
    $pts = PB2_BOUNDARY_POINTS;
    $n = count($pts);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        [$yi, $xi] = $pts[$i];
        [$yj, $xj] = $pts[$j];
        if (($yi > $lat) !== ($yj > $lat)
            && $lng < ($xj - $xi) * ($lat - $yi) / ($yj - $yi) + $xi) {
            $inside = !$inside;
        }
    }
    return $inside;
}

/** Distance in metres between two points (haversine). */
function pb2_issue_distance_m(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $r = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
    return 2 * $r * asin(min(1, sqrt($a)));
}

/**
 * Validates flag thresholds ("2,5,10" or [2,5,10]): whole numbers,
 * 2 <= orange < red < purple <= 1000. Returns [o, r, p] or null.
 */
function pb2_issue_parse_tiers($value): ?array
{
    $parts = is_array($value) ? array_values($value) : explode(',', (string)$value);
    if (count($parts) !== 3) return null;
    $out = [];
    foreach ($parts as $p) {
        $n = filter_var(trim((string)$p), FILTER_VALIDATE_INT);
        if ($n === false) return null;
        $out[] = $n;
    }
    if ($out[0] < 2 || $out[0] >= $out[1] || $out[1] >= $out[2] || $out[2] > 1000) return null;
    return $out;
}

/** Current thresholds [orange, red, purple]. */
function pb2_issue_tiers(mysqli $conn): array
{
    try {
        $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'issue_flag_tiers'");
        $stmt->execute();
        $row = $stmt->get_result()->fetch_row();
        $stmt->close();
        return ($row ? pb2_issue_parse_tiers($row[0]) : null) ?: PB2_ISSUE_DEFAULT_TIERS;
    } catch (Throwable $e) {
        return PB2_ISSUE_DEFAULT_TIERS;
    }
}

/** 'yellow' | 'orange' | 'red' | 'purple' for a report count. */
function pb2_issue_tier(int $count, array $tiers): string
{
    if ($count >= $tiers[2]) return 'purple';
    if ($count >= $tiers[1]) return 'red';
    if ($count >= $tiers[0]) return 'orange';
    return 'yellow';
}

/**
 * Recomputes report_count from the reports table: hidden comments still count,
 * reports held for a staff check or removed by staff don't. Returns it.
 */
function pb2_issue_recount(mysqli $conn, int $issue_id): int
{
    $stmt = $conn->prepare("UPDATE community_issues
                               SET report_count = (SELECT COUNT(*) FROM community_issue_reports
                                                    WHERE issue_id = ? AND " . PB2_ISSUE_LIVE_SQL . ")
                             WHERE issue_id = ?");
    $stmt->bind_param('ii', $issue_id, $issue_id);
    $stmt->execute();
    $stmt->close();
    $stmt = $conn->prepare("SELECT report_count FROM community_issues WHERE issue_id = ?");
    $stmt->bind_param('i', $issue_id);
    $stmt->execute();
    $n = (int)($stmt->get_result()->fetch_row()[0] ?? 0);
    $stmt->close();
    return $n;
}

/**
 * Stores an optional report photo (JPEG/PNG/WebP, max 8 MB, judged by its
 * content) under backend/api/uploads/issue_reports/<issue_id>/. Returns the path
 * relative to backend/api/ (uploads/issue_reports/..., served at /api_backend/<path>), null when
 * no file was sent, or false when the file is unusable.
 */
function pb2_issue_store_photo(?array $file, int $issue_id)
{
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 8 * 1024 * 1024) return false;
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo === false) return false;
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    $map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($map[$mime])) return false;
    $rel = 'uploads/issue_reports/' . $issue_id . '/';
    $dir = __DIR__ . '/' . $rel;
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = bin2hex(random_bytes(8)) . '.' . $map[$mime];
    return move_uploaded_file($file['tmp_name'], $dir . $name) ? $rel . $name : false;
}

/** Deletes a stored report photo (path relative to backend/api/). */
function pb2_issue_delete_photo(?string $rel): void
{
    if (!$rel || strpos($rel, 'uploads/issue_reports/') !== 0 || strpos($rel, '..') !== false) return;
    $path = __DIR__ . '/' . $rel;
    if (is_file($path)) @unlink($path);
}

/** Issue row shaped for the map (no identities). */
function pb2_issue_public_row(array $r, array $tiers): array
{
    return [
        'issue_id'          => (int)$r['issue_id'],
        'category'          => $r['category'],
        'category_label'    => PB2_ISSUE_CATEGORIES[$r['category']] ?? $r['category'],
        'lat'               => (float)$r['latitude'],
        'lng'               => (float)$r['longitude'],
        'landmark'          => $r['landmark'],
        'status'            => $r['status'],
        'report_count'      => (int)$r['report_count'],
        'tier'              => pb2_issue_tier((int)$r['report_count'], $tiers),
        'created_at'        => $r['created_at'],
        'last_reported_at'  => $r['last_reported_at'],
        'status_updated_at' => $r['status_updated_at'],
        'merged_into'       => !empty($r['merged_into']) ? (int)$r['merged_into'] : null,
    ];
}

/** Public timeline of staff updates (staff shown only as "Barangay staff"). */
function pb2_issue_timeline(mysqli $conn, int $issue_id, bool $withStaffNames = false): array
{
    $stmt = $conn->prepare("SELECT u.update_id, u.old_status, u.new_status, u.remarks, u.created_at, a.fullname
                              FROM community_issue_updates u
                              LEFT JOIN admins a ON a.admin_id = u.admin_id
                             WHERE u.issue_id = ? ORDER BY u.created_at, u.update_id");
    $stmt->bind_param('i', $issue_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return array_map(function ($r) use ($withStaffNames) {
        $out = [
            'old_status' => $r['old_status'],
            'new_status' => $r['new_status'],
            'remarks'    => $r['remarks'],
            'created_at' => $r['created_at'],
        ];
        if ($withStaffNames) $out['staff'] = $r['fullname'];
        return $out;
    }, $rows);
}

/**
 * Tells every reporter about a status change:
 *  - email when their preference includes email (or SMS can't be used);
 *  - SMS only for 'Resolved', and an email instead if that text fails.
 * Best effort, never throws. Returns ['email' => n, 'sms' => n].
 */
function pb2_issue_notify_reporters(mysqli $conn, int $issue_id, string $category, string $newStatus, string $remarks): array
{
    require_once __DIR__ . '/notify.php';
    $sent = ['email' => 0, 'sms' => 0];
    try {
        $users = pb2_issue_reporter_users($conn, $issue_id);

        $label = PB2_ISSUE_CATEGORIES[$category] ?? 'Community issue';
        $subject = "Issue #$issue_id ($label): $newStatus";
        $safeRemarks = htmlspecialchars($remarks, ENT_QUOTES, 'UTF-8');
        $html = "<p>Good day,</p><p>The community issue you reported on the PB2Link Issue Map "
              . "(<strong>#$issue_id, $label</strong>) is now <strong>$newStatus</strong>.</p>"
              . "<p><strong>Barangay staff:</strong> $safeRemarks</p>"
              . "<p>Thank you for helping keep Pasong Buaya II safe.</p><p>Barangay Pasong Buaya II</p>";
        $plain = "The community issue you reported (#$issue_id, $label) is now $newStatus.\nBarangay staff: $remarks";
        $smsText = "PB2Link: The $label you reported (#$issue_id) is now RESOLVED. Thank you for reporting.";

        foreach ($users as $uid) {
            $ch = pb2_notify_channels($conn, $uid);
            $smsOk = false;
            if ($newStatus === 'Resolved' && $ch['sms']) {
                $smsOk = pb2_notify_sms($conn, $ch, $smsText, 'issue_resolved');
                if ($smsOk) $sent['sms']++;
            }
            $wantsEmail = $ch['email'] || ($newStatus === 'Resolved' && !$smsOk);
            if ($wantsEmail && $ch['email_to'] && pb2_send_mail($ch['email_to'], $subject, $html, $plain)) {
                $sent['email']++;
            }
        }
    } catch (Throwable $e) {
        error_log('issue notify: ' . $e->getMessage());
    }
    return $sent;
}

/** users.user_id of everyone with a report on the issue (reports staff removed left out). */
function pb2_issue_reporter_users(mysqli $conn, int $issue_id): array
{
    $stmt = $conn->prepare("SELECT DISTINCT r.user_id FROM community_issue_reports cr
                              JOIN residents r ON r.resident_id = cr.resident_id
                             WHERE cr.issue_id = ? AND cr.removed_at IS NULL");
    $stmt->bind_param('i', $issue_id);
    $stmt->execute();
    $users = array_column($stmt->get_result()->fetch_all(MYSQLI_ASSOC), 'user_id');
    $stmt->close();
    return $users;
}

/**
 * Tells the reporters of a duplicate pin that it was merged and where their
 * report now counts. $users / $alreadyOnTarget: user_ids taken BEFORE the
 * merge (reporters of the duplicate, and of the issue it went into).
 * Email only, by preference — like every non-Resolved change, so merges never
 * spend SMS. Best effort, never throws. Returns ['email' => n, 'sms' => 0].
 */
function pb2_issue_notify_merged(mysqli $conn, array $users, array $alreadyOnTarget, int $fromId, int $intoId,
                                 string $category, string $intoStatus, string $remarks): array
{
    require_once __DIR__ . '/notify.php';
    $sent = ['email' => 0, 'sms' => 0];
    try {
        $label = PB2_ISSUE_CATEGORIES[$category] ?? 'Community issue';
        $subject = "Issue #$fromId ($label) was merged into issue #$intoId";
        $safeRemarks = htmlspecialchars($remarks, ENT_QUOTES, 'UTF-8');
        $onTarget = array_flip(array_map('strval', $alreadyOnTarget));
        foreach (array_unique($users) as $uid) {
            $already = isset($onTarget[(string)$uid]);
            $what = $already
                ? "You had already reported issue #$intoId too, so your report there still counts."
                : "Your report was moved to issue #$intoId and counts toward it.";
            $html = "<p>Good day,</p><p>Barangay staff found that the community issue you reported on the PB2Link Issue Map "
                  . "(<strong>#$fromId, $label</strong>) is the same problem as <strong>issue #$intoId</strong>, "
                  . "so the two were combined.</p><p>$what Issue #$intoId is currently <strong>$intoStatus</strong>; "
                  . "follow its updates on the Issue Map.</p>"
                  . "<p><strong>Barangay staff:</strong> $safeRemarks</p>"
                  . "<p>Thank you for helping keep Pasong Buaya II safe.</p><p>Barangay Pasong Buaya II</p>";
            $plain = "Issue #$fromId ($label) is the same problem as issue #$intoId, so the two were combined. $what "
                   . "Issue #$intoId is currently $intoStatus.\nBarangay staff: $remarks";
            $ch = pb2_notify_channels($conn, $uid);
            if ($ch['email'] && $ch['email_to'] && pb2_send_mail($ch['email_to'], $subject, $html, $plain)) {
                $sent['email']++;
            }
        }
    } catch (Throwable $e) {
        error_log('issue merge notify: ' . $e->getMessage());
    }
    return $sent;
}

// ======================================================================
// Safeguards (migration 048)
// ======================================================================

/** 'off' (posts go live) or 'all' (every new report waits for staff). */
function pb2_issue_review_mode(mysqli $conn): string
{
    try {
        $res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'issue_review_mode'");
        $v = $res ? (string)($res->fetch_row()[0] ?? 'off') : 'off';
    } catch (Throwable $e) {
        $v = 'off';
    }
    return in_array($v, PB2_ISSUE_REVIEW_MODES, true) ? $v : 'off';
}

/** The resident's suspension in force, or null: suspension_id, reason, starts_at, ends_at (null = until lifted), permanent. */
function pb2_issue_active_suspension(mysqli $conn, int $resident_id): ?array
{
    try {
        $stmt = $conn->prepare("SELECT suspension_id, reason, starts_at, ends_at FROM issue_map_suspensions
                                 WHERE resident_id = ? AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at > NOW())
                                 ORDER BY ends_at IS NULL DESC, ends_at DESC LIMIT 1");
        $stmt->bind_param('i', $resident_id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
    } catch (Throwable $e) {
        return null; // table missing: nobody is suspended
    }
    if (!$row) return null;
    return [
        'suspension_id' => (int)$row['suspension_id'],
        'reason'        => $row['reason'],
        'starts_at'     => $row['starts_at'],
        'ends_at'       => $row['ends_at'],
        'permanent'     => $row['ends_at'] === null,
    ];
}

/** "until 17 Nov 2026, 3:05 PM" or "until barangay staff lift it". */
function pb2_issue_suspension_until(?string $endsAt): string
{
    return $endsAt === null ? 'until barangay staff lift it' : 'until ' . date('j M Y, g:i A', strtotime($endsAt));
}

/**
 * Blocks a resident from posting on the Issue Map. $length is a key of
 * PB2_ISSUE_SUSPEND_OPTIONS. A suspension already in force is replaced.
 * Returns ['suspension_id', 'ends_at'], or null for a bad length. Throws on DB errors.
 */
function pb2_issue_suspend(mysqli $conn, int $resident_id, string $length, string $reason, int $admin_id, ?int $report_id = null): ?array
{
    if (!array_key_exists($length, PB2_ISSUE_SUSPEND_OPTIONS)) return null;
    $days = PB2_ISSUE_SUSPEND_OPTIONS[$length];
    $endsAt = $days === null ? null : date('Y-m-d H:i:s', time() + $days * 86400);
    $replaced = 'Replaced by a new suspension.';
    $stmt = $conn->prepare("UPDATE issue_map_suspensions SET lifted_at = NOW(), lifted_by = ?, lift_reason = ?
                             WHERE resident_id = ? AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at > NOW())");
    $stmt->bind_param('isi', $admin_id, $replaced, $resident_id);
    $stmt->execute();
    $stmt->close();
    $stmt = $conn->prepare("INSERT INTO issue_map_suspensions (resident_id, report_id, reason, ends_at, created_by) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param('iissi', $resident_id, $report_id, $reason, $endsAt, $admin_id);
    $stmt->execute();
    $id = (int)$stmt->insert_id;
    $stmt->close();
    return ['suspension_id' => $id, 'ends_at' => $endsAt];
}

/**
 * The resident's Issue Map record for staff: reports posted, how many staff
 * removed or hid, how many other residents reported, pins they started that
 * were rejected, and their suspensions.
 */
function pb2_issue_conduct(mysqli $conn, int $resident_id): array
{
    $out = ['reports' => 0, 'removed' => 0, 'hidden' => 0, 'flagged' => 0, 'rejected_pins' => 0,
            'suspensions' => [], 'active_suspension' => null];
    try {
        $stmt = $conn->prepare("SELECT COUNT(*),
                                       COALESCE(SUM(removed_at IS NOT NULL), 0),
                                       COALESCE(SUM(hidden_at IS NOT NULL AND removed_at IS NULL), 0),
                                       COALESCE(SUM(flag_count > 0), 0)
                                  FROM community_issue_reports WHERE resident_id = ?");
        $stmt->bind_param('i', $resident_id);
        $stmt->execute();
        [$a, $b, $c, $d] = $stmt->get_result()->fetch_row();
        $stmt->close();
        $out['reports'] = (int)$a;
        $out['removed'] = (int)$b;
        $out['hidden']  = (int)$c;
        $out['flagged'] = (int)$d;

        $stmt = $conn->prepare("SELECT COUNT(*) FROM community_issues WHERE created_by = ? AND status = 'Rejected'");
        $stmt->bind_param('i', $resident_id);
        $stmt->execute();
        $out['rejected_pins'] = (int)$stmt->get_result()->fetch_row()[0];
        $stmt->close();

        $stmt = $conn->prepare("SELECT s.suspension_id, s.reason, s.starts_at, s.ends_at, s.lifted_at, s.lift_reason,
                                       a.fullname AS created_by_name, l.fullname AS lifted_by_name
                                  FROM issue_map_suspensions s
                                  LEFT JOIN admins a ON a.admin_id = s.created_by
                                  LEFT JOIN admins l ON l.admin_id = s.lifted_by
                                 WHERE s.resident_id = ? ORDER BY s.starts_at DESC, s.suspension_id DESC LIMIT 20");
        $stmt->bind_param('i', $resident_id);
        $stmt->execute();
        foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $s) {
            $active = $s['lifted_at'] === null && ($s['ends_at'] === null || strtotime($s['ends_at']) > time());
            $out['suspensions'][] = [
                'suspension_id'   => (int)$s['suspension_id'],
                'reason'          => $s['reason'],
                'starts_at'       => $s['starts_at'],
                'ends_at'         => $s['ends_at'],
                'lifted_at'       => $s['lifted_at'],
                'lift_reason'     => $s['lift_reason'],
                'created_by_name' => $s['created_by_name'],
                'lifted_by_name'  => $s['lifted_by_name'],
                'active'          => $active,
            ];
        }
        $stmt->close();
        foreach ($out['suspensions'] as $s) {
            if ($s['active']) { $out['active_suspension'] = $s; break; }
        }
    } catch (Throwable $e) {
        error_log('issue conduct: ' . $e->getMessage());
    }
    // Repeat problems: two or more posts removed, hidden or rejected, or any suspension.
    $out['repeat'] = ($out['removed'] + $out['hidden'] + $out['rejected_pins']) >= 2 || count($out['suspensions']) > 0;
    return $out;
}

/**
 * Emails a resident about a staff decision on their own Issue Map post. Always
 * by email, whatever their update preference, so they know what happened and
 * why. Best effort; returns whether it was sent.
 */
function pb2_issue_mail_resident(mysqli $conn, int $resident_id, string $subject, string $htmlBody, string $plainBody): bool
{
    require_once __DIR__ . '/notify.php';
    try {
        $stmt = $conn->prepare("SELECT user_id FROM residents WHERE resident_id = ?");
        $stmt->bind_param('i', $resident_id);
        $stmt->execute();
        $uid = $stmt->get_result()->fetch_row()[0] ?? null;
        $stmt->close();
        if (!$uid) return false;
        $ch = pb2_notify_channels($conn, $uid);
        if (empty($ch['email_to'])) return false;
        $html = "<p>Good day,</p>$htmlBody<p>Barangay Pasong Buaya II</p>";
        return (bool)pb2_send_mail($ch['email_to'], $subject, $html, $plainBody);
    } catch (Throwable $e) {
        error_log('issue mail resident: ' . $e->getMessage());
        return false;
    }
}
