<?php
// Disaster Risk Reduction & Management (DRRM) API Endpoint
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/text_case.php';
require_once __DIR__ . '/advisory_sms.php';
// Advisories, centers, templates and checklist tasks are website text: kept
// as staff type them (only residents' own information is stored in ALL CAPS).
// An active advisory not confirmed "still accurate" for this long is flagged
// for review on Disaster Risk and the Dashboard (migration 032).
const PB2_ADVISORY_REVIEW_HOURS = 24;
// Blanks in templates that must be filled in before publishing, e.g. {AREAS}.
const PB2_ADVISORY_BLANK = '/\{[A-Za-z_ ]+\}/';
pb2_session_start();

require_once __DIR__ . '/../db_connection.php';

// After an advisory is saved or reactivated: push it to devices, and text it
// (to all residents when advisory SMS is automatic; to staff only for a
// practice advisory). advisory_sms.php pb2_advisory_went_live(). Returns a
// note for the response message ('' when nothing was sent).
function pb2_dr_auto_sms_note(mysqli $conn, int $alertId): string
{
    return pb2_advisory_went_live($conn, $alertId, pb2_current_admin());
}

/** Whether the signed-in admin may manage Disaster Risk (sees practice advisories). */
function pb2_dr_is_staff(): bool
{
    $admin = pb2_current_admin();
    if (!$admin) return false;
    if (($admin['role'] ?? '') === 'Super') return true;
    require_once __DIR__ . '/admin_permissions.php';
    return in_array('module.disaster', pb2_current_permissions(), true);
}

const PB2_ALERT_LEVELS = ['Advisory', 'Watch', 'Warning', 'Severe'];

/**
 * The officials' checklist for an advisory (migration 033): active tasks of
 * its level and every level below, plus tasks already ticked on it (kept even
 * if the task was hidden or the level lowered later). [] before migration 033.
 */
function pb2_dr_alert_tasks(mysqli $conn, int $alertId, string $level): array
{
    $idx = array_search($level, PB2_ALERT_LEVELS, true);
    $levels = array_slice(PB2_ALERT_LEVELS, 0, $idx === false ? 1 : $idx + 1);
    $in = "'" . implode("','", $levels) . "'";
    $tasks = [];
    try {
        $res = mysqli_query($conn,
            "SELECT t.id, t.alert_level, COALESCE(p.task_text, t.task) AS task, p.done_at, COALESCE(NULLIF(a.fullname, ''), a.username) AS done_by
               FROM alert_task_templates t
               LEFT JOIN alert_task_progress p ON p.task_id = t.id AND p.alert_id = $alertId
               LEFT JOIN admins a ON a.admin_id = p.done_by
              WHERE (t.is_active = 1 AND t.alert_level IN ($in)) OR p.alert_id IS NOT NULL
              ORDER BY FIELD(t.alert_level, 'Advisory', 'Watch', 'Warning', 'Severe'), t.sort_order, t.id");
        while ($res && ($r = mysqli_fetch_assoc($res))) {
            $tasks[] = ['id' => (int) $r['id'], 'alert_level' => $r['alert_level'], 'task' => $r['task'],
                'done' => $r['done_at'] !== null, 'done_at' => $r['done_at'], 'done_by' => $r['done_by']];
        }
    } catch (Throwable $e) {
        return [];
    }
    return $tasks;
}

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

// Auto-create tables if not present
$tableCheck = mysqli_query($conn, "SHOW TABLES LIKE 'evacuation_centers'");
if (mysqli_num_rows($tableCheck) === 0) {
    include_once __DIR__ . '/../create_waste_and_risk_tables.php';
}

foreach (['latitude' => 'DECIMAL(10,7) NULL', 'longitude' => 'DECIMAL(10,7) NULL'] as $column => $definition) {
    $columnCheck = mysqli_query($conn, "SHOW COLUMNS FROM evacuation_centers LIKE '$column'");
    if ($columnCheck && mysqli_num_rows($columnCheck) === 0) {
        mysqli_query($conn, "ALTER TABLE evacuation_centers ADD COLUMN $column $definition");
    }
}

$action = $_GET['action'] ?? ($_POST['action'] ?? 'get_all');

// --- ACTION 1: GET ALL ALERTS, EVACUATION CENTERS & STATS ---
if ($action === 'get_all') {
    // Practice advisories are for staff only: residents never see them.
    $staff = pb2_dr_is_staff();
    $alerts = [];
    $where = '';
    $hasPractice = true;
    try {
        mysqli_query($conn, "SELECT is_practice FROM disaster_alerts LIMIT 1");
    } catch (Throwable $e) {
        $hasPractice = false; // migration 032 not applied
    }
    if ($hasPractice && !$staff) $where = 'WHERE is_practice = 0';
    $resAlerts = mysqli_query($conn, "SELECT * FROM disaster_alerts $where ORDER BY is_active DESC, created_at DESC");
    if ($resAlerts) {
        while ($row = mysqli_fetch_assoc($resAlerts)) {
            if ($staff && $hasPractice) {
                // Due for a "still accurate?" check (PB2_ADVISORY_REVIEW_HOURS).
                $since = strtotime((string)($row['reviewed_at'] ?: $row['created_at']));
                $row['review_due'] = (int)$row['is_active'] === 1 && $since && (time() - $since) >= PB2_ADVISORY_REVIEW_HOURS * 3600;
            }
            if ($staff && (int)$row['is_active'] === 1) {
                // Officials' checklist progress (migration 033).
                $tasks = pb2_dr_alert_tasks($conn, (int)$row['id'], (string)$row['alert_level']);
                $row['tasks_total'] = count($tasks);
                $row['tasks_done'] = count(array_filter($tasks, fn ($t) => $t['done']));
            }
            $alerts[] = $row;
        }
    }

    $centers = [];
    $resCenters = mysqli_query($conn, "SELECT * FROM evacuation_centers ORDER BY id ASC");
    if ($resCenters) {
        while ($row = mysqli_fetch_assoc($resCenters)) {
            $centers[] = $row;
        }
    }

    // Stats
    $activeAlerts = 0;
    foreach ($alerts as $a) {
        if ((int) ($a['is_active'] ?? 0) === 1 && (int) ($a['is_practice'] ?? 0) === 0) {
            $activeAlerts++;
        }
    }

    $totalCapacity = 0;
    $totalEvacuees = 0;
    $availableCenters = 0;
    foreach ($centers as $c) {
        $cap = (int) ($c['capacity_families'] ?? 0);
        $curr = (int) ($c['current_families'] ?? 0);
        $totalCapacity += $cap;
        $totalEvacuees += $curr;
        if (($c['status'] ?? '') === 'Available') {
            $availableCenters++;
        }
    }

    echo json_encode([
        'success' => true,
        'alerts' => $alerts,
        'centers' => $centers,
        'stats' => [
            'active_alerts_count' => $activeAlerts,
            'total_centers' => count($centers),
            'available_centers' => $availableCenters,
            'total_capacity_families' => $totalCapacity,
            'total_current_families' => $totalEvacuees
        ]
    ]);
    exit;
}

// All modifying actions below require administrative privileges
pb2_require_admin();
require_once __DIR__ . '/admin_permissions.php';
pb2_require_any_permission(['module.disaster']); // tab access

// --- ACTION 2: SAVE OR UPDATE DISASTER ALERT ---
if ($action === 'save_alert') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

    $id = isset($input['id']) && is_numeric($input['id']) ? (int) $input['id'] : null;
    $title = trim($input['title'] ?? '');
    $alert_level = in_array($input['alert_level'] ?? '', ['Advisory', 'Watch', 'Warning', 'Severe']) ? $input['alert_level'] : 'Advisory';
    $calamity_type = trim($input['calamity_type'] ?? 'Typhoon / Heavy Rain');
    $affected_areas = trim($input['affected_areas'] ?? '');
    $evacuation_schedule = trim($input['evacuation_schedule'] ?? '');
    $instructions = trim($input['instructions'] ?? '');
    $title_fil = trim($input['title_fil'] ?? '');
    $instructions_fil = trim($input['instructions_fil'] ?? '');
    $is_active = isset($input['is_active']) ? ((int) $input['is_active'] ? 1 : 0) : 1;
    // Practice is chosen when the advisory is created and never changes.
    $is_practice = !empty($input['is_practice']) ? 1 : 0;

    if (!$title || !$instructions) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Alert title and safety instructions are required.']);
        exit;
    }
    if (($title_fil === '') !== ($instructions_fil === '')) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Fill in both the Filipino title and instructions, or leave both empty.']);
        exit;
    }
    // Template blanks such as {AREAS} must be filled in before saving.
    $blanks = [];
    foreach ([$title, $instructions, $title_fil, $instructions_fil, $affected_areas, $evacuation_schedule] as $text) {
        if (preg_match_all(PB2_ADVISORY_BLANK, $text, $m)) $blanks = array_merge($blanks, $m[0]);
    }
    if ($blanks) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Fill in the blanks first: ' . implode(', ', array_unique($blanks)) . '.']);
        exit;
    }
    $title_fil = $title_fil !== '' ? $title_fil : null;
    $instructions_fil = $instructions_fil !== '' ? $instructions_fil : null;

    if ($id && $id > 0) {
        // Saving an edit counts as confirming it is still accurate.
        $reviewer = (int) (pb2_current_admin()['admin_id'] ?? 0);
        $stmt = mysqli_prepare($conn, "UPDATE disaster_alerts SET
            title = ?, title_fil = ?, alert_level = ?, calamity_type = ?, affected_areas = ?,
            evacuation_schedule = ?, instructions = ?, instructions_fil = ?, is_active = ?,
            reviewed_at = NOW(), reviewed_by = ?
            WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'ssssssssiii', $title, $title_fil, $alert_level, $calamity_type, $affected_areas, $evacuation_schedule, $instructions, $instructions_fil, $is_active, $reviewer, $id);
        $ok = mysqli_stmt_execute($stmt);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('disaster.alert.update', 'disaster_alert', $id, "Updated risk advisory '$title'");

        if ($ok && !$is_active) {
            mysqli_query($conn, "UPDATE disaster_alerts SET sms_sent_level = NULL, push_sent_level = NULL WHERE id = " . (int) $id);
        }
        $smsNote = $ok ? pb2_dr_auto_sms_note($conn, $id) : '';
        echo json_encode(['success' => $ok, 'message' => $ok ? 'Alert advisory updated.' . $smsNote : 'Failed to update alert.']);
        exit;
    } else {
        $stmt = mysqli_prepare($conn, "INSERT INTO disaster_alerts
            (title, title_fil, alert_level, calamity_type, affected_areas, evacuation_schedule, instructions, instructions_fil, is_active, is_practice)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        mysqli_stmt_bind_param($stmt, 'ssssssssii', $title, $title_fil, $alert_level, $calamity_type, $affected_areas, $evacuation_schedule, $instructions, $instructions_fil, $is_active, $is_practice);
        $ok = mysqli_stmt_execute($stmt);
        $newId = mysqli_insert_id($conn);
        mysqli_stmt_close($stmt);

        // Published from a hazard-feed draft: link it and take it off the staff list.
        $hazardEventId = isset($input['hazard_event_id']) ? (int) $input['hazard_event_id'] : 0;
        if ($ok && $hazardEventId > 0) {
            $adminId = (int) (pb2_current_admin()['admin_id'] ?? 0);
            $ev = mysqli_prepare($conn, "UPDATE hazard_events SET status = 'published', alert_id = ?, handled_by = ?, handled_at = NOW() WHERE id = ? AND status = 'new'");
            mysqli_stmt_bind_param($ev, 'iii', $newId, $adminId, $hazardEventId);
            mysqli_stmt_execute($ev);
            mysqli_stmt_close($ev);
            $ref = mysqli_prepare($conn, "UPDATE disaster_alerts d JOIN hazard_events h ON h.id = ? SET d.source = h.source, d.source_ref = h.hazard_key WHERE d.id = ?");
            mysqli_stmt_bind_param($ref, 'ii', $hazardEventId, $newId);
            mysqli_stmt_execute($ref);
            mysqli_stmt_close($ref);
        }

        pb2_log_admin_action('disaster.alert.create', 'disaster_alert', $newId, ($is_practice ? 'Published PRACTICE advisory' : 'Published emergency advisory') . " '$title' ($alert_level)" . ($hazardEventId > 0 ? ' from a hazard-feed detection' : '') . ($title_fil ? ' with a Filipino version' : ''));

        $smsNote = $ok ? pb2_dr_auto_sms_note($conn, (int) $newId) : '';
        echo json_encode(['success' => $ok, 'message' => $ok ? ($is_practice ? 'Practice advisory started (staff only).' : 'Emergency advisory issued.') . $smsNote : 'Failed to issue advisory.', 'id' => $newId]);
        exit;
    }
}

// --- ACTION 3: TOGGLE ALERT STATUS ---
if ($action === 'toggle_alert_status') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $id = (int) ($input['id'] ?? 0);
    $is_active = (int) ($input['is_active'] ?? 0) ? 1 : 0;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid alert ID.']);
        exit;
    }

    // Deactivating clears the texted level, so reactivating texts residents again.
    // Deactivating clears the texted / pushed level; reactivating counts as a review.
    $stmt = mysqli_prepare($conn, "UPDATE disaster_alerts SET is_active = ?, sms_sent_level = IF(? = 0, NULL, sms_sent_level),
        push_sent_level = IF(? = 0, NULL, push_sent_level), reviewed_at = IF(? = 1, NOW(), reviewed_at) WHERE id = ?");
    mysqli_stmt_bind_param($stmt, 'iiiii', $is_active, $is_active, $is_active, $is_active, $id);
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);

    pb2_log_admin_action('disaster.alert.toggle', 'disaster_alert', $id, "Toggled alert #$id active status to $is_active");

    $smsNote = ($ok && $is_active) ? pb2_dr_auto_sms_note($conn, $id) : '';
    echo json_encode(['success' => $ok, 'message' => $ok ? 'Alert status updated.' . $smsNote : 'Failed to update alert status.']);
    exit;
}

// --- Still accurate? (review reminder, migration 032) ---
if ($action === 'confirm_alert') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $id = (int) ($input['id'] ?? 0);
    $admin = pb2_current_admin();
    $reviewer = (int) ($admin['admin_id'] ?? 0);
    $stmt = mysqli_prepare($conn, "UPDATE disaster_alerts SET reviewed_at = NOW(), reviewed_by = ? WHERE id = ? AND is_active = 1");
    mysqli_stmt_bind_param($stmt, 'ii', $reviewer, $id);
    mysqli_stmt_execute($stmt);
    $ok = mysqli_stmt_affected_rows($stmt) === 1;
    mysqli_stmt_close($stmt);
    if ($ok) pb2_log_admin_action('disaster.alert.review', 'disaster_alert', $id, "Confirmed advisory #$id is still accurate");
    echo json_encode(['success' => $ok, 'message' => $ok ? 'Marked as still accurate. You will be reminded again in ' . PB2_ADVISORY_REVIEW_HOURS . ' hours.' : 'Only an active advisory can be confirmed.']);
    exit;
}

// --- Advisory templates (migration 032) ---
if ($action === 'get_templates') {
    $rows = [];
    try {
        $r = mysqli_query($conn, "SELECT * FROM advisory_templates ORDER BY is_active DESC, sort_order ASC, id ASC");
        while ($r && ($t = mysqli_fetch_assoc($r))) $rows[] = $t;
    } catch (Throwable $e) {
        // migration 032 not applied
    }
    echo json_encode(['success' => true, 'templates' => $rows]);
    exit;
}
if ($action === 'save_template') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $id = (int) ($input['id'] ?? 0);
    $name = trim(preg_replace('/\s+/u', ' ', (string) ($input['name'] ?? '')));
    $level = in_array($input['alert_level'] ?? '', ['Advisory', 'Watch', 'Warning', 'Severe'], true) ? $input['alert_level'] : 'Advisory';
    $fields = [];
    foreach (['calamity_type', 'title', 'instructions', 'title_fil', 'instructions_fil', 'evacuation_schedule'] as $k) $fields[$k] = trim((string) ($input[$k] ?? ''));
    $active = isset($input['is_active']) ? (int) !empty($input['is_active']) : 1;
    if ($name === '' || $fields['title'] === '' || $fields['instructions'] === '') {
        echo json_encode(['success' => false, 'message' => 'A template needs a name, a title and instructions.']);
        exit;
    }
    if (mb_strlen($name) > 120 || mb_strlen($fields['title']) > 200 || mb_strlen($fields['title_fil']) > 200) {
        echo json_encode(['success' => false, 'message' => 'The name or a title is too long.']);
        exit;
    }
    $dup = mysqli_prepare($conn, "SELECT id FROM advisory_templates WHERE name = ? AND id <> ?");
    mysqli_stmt_bind_param($dup, 'si', $name, $id);
    mysqli_stmt_execute($dup);
    if (mysqli_fetch_row(mysqli_stmt_get_result($dup))) {
        echo json_encode(['success' => false, 'message' => 'Another template already has this name.']);
        exit;
    }
    $by = (int) (pb2_current_admin()['admin_id'] ?? 0);
    $nul = function ($v) { return $v !== '' ? $v : null; };
    [$tf, $if, $es] = [$nul($fields['title_fil']), $nul($fields['instructions_fil']), $nul($fields['evacuation_schedule'])];
    if ($id > 0) {
        $st = mysqli_prepare($conn, "UPDATE advisory_templates SET name = ?, calamity_type = ?, alert_level = ?, title = ?, instructions = ?, title_fil = ?, instructions_fil = ?, evacuation_schedule = ?, is_active = ?, updated_by = ? WHERE id = ?");
        mysqli_stmt_bind_param($st, 'ssssssssiii', $name, $fields['calamity_type'], $level, $fields['title'], $fields['instructions'], $tf, $if, $es, $active, $by, $id);
    } else {
        $next = (int) (mysqli_fetch_row(mysqli_query($conn, "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM advisory_templates"))[0]);
        $st = mysqli_prepare($conn, "INSERT INTO advisory_templates (name, calamity_type, alert_level, title, instructions, title_fil, instructions_fil, evacuation_schedule, is_active, sort_order, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        mysqli_stmt_bind_param($st, 'ssssssssiii', $name, $fields['calamity_type'], $level, $fields['title'], $fields['instructions'], $tf, $if, $es, $active, $next, $by);
    }
    $ok = mysqli_stmt_execute($st);
    $savedId = $id > 0 ? $id : mysqli_insert_id($conn);
    if ($ok) pb2_log_admin_action($id > 0 ? 'disaster.template.update' : 'disaster.template.create', 'advisory_template', (string) $savedId, ($id > 0 ? 'Edited' : 'Added') . " advisory template \"$name\"" . ($active ? '' : ' (hidden)'));
    echo json_encode(['success' => $ok, 'message' => $ok ? 'Template saved.' : 'The template could not be saved.']);
    exit;
}
if ($action === 'delete_template') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $id = (int) ($input['id'] ?? 0);
    $row = mysqli_fetch_assoc(mysqli_query($conn, "SELECT name FROM advisory_templates WHERE id = $id"));
    if (!$row) {
        echo json_encode(['success' => false, 'message' => 'Template not found.']);
        exit;
    }
    mysqli_query($conn, "DELETE FROM advisory_templates WHERE id = $id");
    pb2_log_admin_action('disaster.template.delete', 'advisory_template', (string) $id, "Deleted advisory template \"{$row['name']}\"");
    echo json_encode(['success' => true, 'message' => 'Template deleted.']);
    exit;
}

// --- Officials' checklist per alert level (migration 033) ---
// An advisory shows the active tasks of its level and every level below it.
if ($action === 'get_tasks') {
    $alertId = (int) ($_GET['alert_id'] ?? 0);
    $alert = mysqli_fetch_assoc(mysqli_query($conn, "SELECT id, title, alert_level, is_active FROM disaster_alerts WHERE id = $alertId"));
    if (!$alert) {
        echo json_encode(['success' => false, 'message' => 'Advisory not found.']);
        exit;
    }
    echo json_encode(['success' => true, 'alert' => $alert, 'tasks' => pb2_dr_alert_tasks($conn, $alertId, (string) $alert['alert_level'])]);
    exit;
}
if ($action === 'toggle_task') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $alertId = (int) ($input['alert_id'] ?? 0);
    $taskId = (int) ($input['task_id'] ?? 0);
    $done = !empty($input['done']);
    $alert = mysqli_fetch_assoc(mysqli_query($conn, "SELECT id, title, alert_level, is_active FROM disaster_alerts WHERE id = $alertId"));
    if (!$alert || (int) $alert['is_active'] !== 1) {
        echo json_encode(['success' => false, 'message' => 'Tasks can only be ticked while the advisory is active.']);
        exit;
    }
    $task = null;
    foreach (pb2_dr_alert_tasks($conn, $alertId, (string) $alert['alert_level']) as $t) {
        if ($t['id'] === $taskId) $task = $t;
    }
    if (!$task) {
        echo json_encode(['success' => false, 'message' => 'This task is not on the checklist for this advisory.']);
        exit;
    }
    $by = (int) (pb2_current_admin()['admin_id'] ?? 0);
    if ($done) {
        $st = mysqli_prepare($conn, "INSERT IGNORE INTO alert_task_progress (alert_id, task_id, task_text, done_by) VALUES (?, ?, ?, ?)");
        mysqli_stmt_bind_param($st, 'iisi', $alertId, $taskId, $task['task'], $by);
    } else {
        $st = mysqli_prepare($conn, "DELETE FROM alert_task_progress WHERE alert_id = ? AND task_id = ?");
        mysqli_stmt_bind_param($st, 'ii', $alertId, $taskId);
    }
    mysqli_stmt_execute($st);
    if (mysqli_stmt_affected_rows($st) > 0) {
        pb2_log_admin_action($done ? 'disaster.task.done' : 'disaster.task.undone', 'disaster_alert', (string) $alertId,
            ($done ? 'Ticked' : 'Unticked') . " \"{$task['task']}\" on advisory \"{$alert['title']}\"");
    }
    echo json_encode(['success' => true, 'tasks' => pb2_dr_alert_tasks($conn, $alertId, (string) $alert['alert_level'])]);
    exit;
}
if ($action === 'get_task_templates') {
    $rows = [];
    try {
        $r = mysqli_query($conn, "SELECT * FROM alert_task_templates ORDER BY FIELD(alert_level, 'Advisory', 'Watch', 'Warning', 'Severe'), is_active DESC, sort_order, id");
        while ($r && ($t = mysqli_fetch_assoc($r))) $rows[] = $t;
    } catch (Throwable $e) {
        // migration 033 not applied
    }
    echo json_encode(['success' => true, 'templates' => $rows]);
    exit;
}
if ($action === 'save_task_template') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $id = (int) ($input['id'] ?? 0);
    $level = in_array($input['alert_level'] ?? '', PB2_ALERT_LEVELS, true) ? $input['alert_level'] : '';
    $task = trim(preg_replace('/\s+/u', ' ', (string) ($input['task'] ?? '')));
    $active = isset($input['is_active']) ? (int) !empty($input['is_active']) : 1;
    if ($level === '' || $task === '' || mb_strlen($task) > 255) {
        echo json_encode(['success' => false, 'message' => 'Choose a level and write the task (up to 255 characters).']);
        exit;
    }
    $dup = mysqli_prepare($conn, "SELECT id FROM alert_task_templates WHERE alert_level = ? AND task = ? AND id <> ?");
    mysqli_stmt_bind_param($dup, 'ssi', $level, $task, $id);
    mysqli_stmt_execute($dup);
    if (mysqli_fetch_row(mysqli_stmt_get_result($dup))) {
        echo json_encode(['success' => false, 'message' => 'This task is already on that level.']);
        exit;
    }
    $by = (int) (pb2_current_admin()['admin_id'] ?? 0);
    if ($id > 0) {
        $st = mysqli_prepare($conn, "UPDATE alert_task_templates SET alert_level = ?, task = ?, is_active = ?, updated_by = ? WHERE id = ?");
        mysqli_stmt_bind_param($st, 'ssiii', $level, $task, $active, $by, $id);
    } else {
        $next = (int) (mysqli_fetch_row(mysqli_query($conn, "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM alert_task_templates"))[0]);
        $st = mysqli_prepare($conn, "INSERT INTO alert_task_templates (alert_level, task, is_active, sort_order, updated_by) VALUES (?, ?, ?, ?, ?)");
        mysqli_stmt_bind_param($st, 'ssiii', $level, $task, $active, $next, $by);
    }
    $ok = mysqli_stmt_execute($st);
    $savedId = $id > 0 ? $id : mysqli_insert_id($conn);
    if ($ok) pb2_log_admin_action($id > 0 ? 'disaster.task_template.update' : 'disaster.task_template.create', 'alert_task_template', (string) $savedId,
        ($id > 0 ? 'Edited' : 'Added') . " $level checklist task \"$task\"" . ($active ? '' : ' (hidden)'));
    echo json_encode(['success' => $ok, 'message' => $ok ? 'Task saved.' : 'The task could not be saved.']);
    exit;
}
if ($action === 'delete_task_template') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $id = (int) ($input['id'] ?? 0);
    $row = mysqli_fetch_assoc(mysqli_query($conn, "SELECT alert_level, task FROM alert_task_templates WHERE id = $id"));
    if (!$row) {
        echo json_encode(['success' => false, 'message' => 'Task not found.']);
        exit;
    }
    // A task already ticked on an advisory is kept (hidden) so that record stays readable.
    $used = (int) mysqli_fetch_row(mysqli_query($conn, "SELECT COUNT(*) FROM alert_task_progress WHERE task_id = $id"))[0];
    if ($used > 0) {
        mysqli_query($conn, "UPDATE alert_task_templates SET is_active = 0 WHERE id = $id");
        pb2_log_admin_action('disaster.task_template.hide', 'alert_task_template', (string) $id, "Hid {$row['alert_level']} checklist task \"{$row['task']}\" (already used on advisories)");
        echo json_encode(['success' => true, 'message' => 'This task was already ticked on past advisories, so it was hidden instead of deleted.']);
        exit;
    }
    mysqli_query($conn, "DELETE FROM alert_task_templates WHERE id = $id");
    pb2_log_admin_action('disaster.task_template.delete', 'alert_task_template', (string) $id, "Deleted {$row['alert_level']} checklist task \"{$row['task']}\"");
    echo json_encode(['success' => true, 'message' => 'Task deleted.']);
    exit;
}

// --- ACTION 4: DELETE DISASTER ALERT ---
if ($action === 'delete_alert') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid alert ID.']);
        exit;
    }

    $stmt = mysqli_prepare($conn, "DELETE FROM disaster_alerts WHERE id = ?");
    mysqli_stmt_bind_param($stmt, 'i', $id);
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);
    if ($ok) {
        try {
            mysqli_query($conn, "DELETE FROM alert_task_progress WHERE alert_id = $id"); // its checklist ticks
        } catch (Throwable $e) {
            // migration 033 not applied
        }
    }

    pb2_log_admin_action('disaster.alert.delete', 'disaster_alert', $id, "Deleted emergency advisory #$id");

    echo json_encode(['success' => $ok, 'message' => $ok ? 'Advisory deleted.' : 'Failed to delete advisory.']);
    exit;
}

// --- ACTION 5: SAVE OR UPDATE EVACUATION CENTER ---
if ($action === 'save_center') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

    $id = isset($input['id']) && is_numeric($input['id']) ? (int) $input['id'] : null;
    $name = trim($input['name'] ?? '');
    $location = trim($input['location'] ?? '');
    $capacity_families = (int) ($input['capacity_families'] ?? 100);
    $current_families = (int) ($input['current_families'] ?? 0);
    $status = in_array($input['status'] ?? '', ['Available', 'Standby', 'Full', 'Closed']) ? $input['status'] : 'Available';
    $facilities = trim($input['facilities'] ?? '');
    $contact_person = trim($input['contact_person'] ?? '');
    $contact_number = trim($input['contact_number'] ?? '');
    $latitude = isset($input['latitude']) && is_numeric($input['latitude']) ? (float) $input['latitude'] : null;
    $longitude = isset($input['longitude']) && is_numeric($input['longitude']) ? (float) $input['longitude'] : null;

    if (!$name || !$location) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Evacuation center name and location are required.']);
        exit;
    }

    if (($latitude !== null && ($latitude < -90 || $latitude > 90)) || ($longitude !== null && ($longitude < -180 || $longitude > 180))) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Center coordinates are outside valid map bounds.']);
        exit;
    }

    // Auto calculate status if families >= capacity
    if ($capacity_families > 0 && $current_families >= $capacity_families && $status === 'Available') {
        $status = 'Full';
    }

    if ($id && $id > 0) {
        $stmt = mysqli_prepare($conn, "UPDATE evacuation_centers SET
            name = ?, location = ?, capacity_families = ?, current_families = ?,
            status = ?, facilities = ?, contact_person = ?, contact_number = ?, latitude = ?, longitude = ?
            WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'ssiissssddi', $name, $location, $capacity_families, $current_families, $status, $facilities, $contact_person, $contact_number, $latitude, $longitude, $id);
        $ok = mysqli_stmt_execute($stmt);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('disaster.center.update', 'evacuation_center', $id, "Updated evacuation center '$name'");

        echo json_encode(['success' => $ok, 'message' => $ok ? 'Evacuation center updated.' : 'Failed to update evacuation center.']);
        exit;
    } else {
        $stmt = mysqli_prepare($conn, "INSERT INTO evacuation_centers
            (name, location, capacity_families, current_families, status, facilities, contact_person, contact_number, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        mysqli_stmt_bind_param($stmt, 'ssiissssdd', $name, $location, $capacity_families, $current_families, $status, $facilities, $contact_person, $contact_number, $latitude, $longitude);
        $ok = mysqli_stmt_execute($stmt);
        $newId = mysqli_insert_id($conn);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('disaster.center.create', 'evacuation_center', $newId, "Added evacuation center '$name'");

        echo json_encode(['success' => $ok, 'message' => $ok ? 'Evacuation center added.' : 'Failed to add evacuation center.', 'id' => $newId]);
        exit;
    }
}

// --- ACTION 6: QUICK OCCUPANCY UPDATE ---
if ($action === 'update_center_occupancy') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $id = (int) ($input['id'] ?? 0);
    $current_families = (int) ($input['current_families'] ?? 0);
    $status = in_array($input['status'] ?? '', ['Available', 'Standby', 'Full', 'Closed']) ? $input['status'] : null;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid center ID.']);
        exit;
    }

    if ($status) {
        $stmt = mysqli_prepare($conn, "UPDATE evacuation_centers SET current_families = ?, status = ? WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'isi', $current_families, $status, $id);
    } else {
        $stmt = mysqli_prepare($conn, "UPDATE evacuation_centers SET current_families = ? WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'ii', $current_families, $id);
    }
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);

    pb2_log_admin_action('disaster.center.occupancy', 'evacuation_center', $id, "Updated occupancy to $current_families families");

    echo json_encode(['success' => $ok, 'message' => $ok ? 'Occupancy updated.' : 'Failed to update occupancy.']);
    exit;
}

// --- ACTION 7: DELETE EVACUATION CENTER ---
if ($action === 'delete_center') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid center ID.']);
        exit;
    }

    $stmt = mysqli_prepare($conn, "DELETE FROM evacuation_centers WHERE id = ?");
    mysqli_stmt_bind_param($stmt, 'i', $id);
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);

    pb2_log_admin_action('disaster.center.delete', 'evacuation_center', $id, "Deleted evacuation center #$id");

    echo json_encode(['success' => $ok, 'message' => $ok ? 'Evacuation center removed.' : 'Failed to delete evacuation center.']);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Invalid action parameter.']);
exit;

