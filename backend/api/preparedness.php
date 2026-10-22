<?php
// Disaster preparedness (migration 033, rules in preparedness_common.php).
//   GET  action=overview          public: { hotlines, guides } for /preparedness,
//                                 Disaster Risk and the Home page
//   GET  action=street_risk&street=&subdivision=   public: a street's flood level
//   GET  action=my_street         signed-in resident: their own street's flood level
//   GET  action=admin             admin: hotlines incl. hidden, guides
//   GET  action=form_helpers      admin: medium/high flood-risk street names and checklist
//                                 sizes per level, for the advisory form
//   POST action=save_hotline      admin JSON: { id?, name, number, category, note, is_active }
//   POST action=delete_hotline    admin JSON: { id }
//   POST action=order_hotlines    admin JSON: { ids: [...] }
//   POST action=save_guide        admin JSON: { hazard, phase, body, body_fil }
// Everything here is website text and keeps the capitalisation staff type. Every write is
// audit-logged as disaster.hotline.* / disaster.guide.*.
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/text_case.php';
require_once __DIR__ . '/preparedness_common.php';

if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$action = (string)($_GET['action'] ?? 'overview');

function pb2_prep_hotlines(mysqli $conn, bool $all): array
{
    $rows = [];
    try {
        $res = $conn->query("SELECT id, name, number, category, note, is_active, sort_order FROM emergency_hotlines"
            . ($all ? '' : ' WHERE is_active = 1') . " ORDER BY sort_order, id");
        while ($res && ($r = $res->fetch_assoc())) {
            $r['id'] = (int)$r['id'];
            $r['is_active'] = (int)$r['is_active'];
            $rows[] = $r;
        }
    } catch (Throwable $e) {
        // migration 033 not applied
    }
    return $rows;
}

function pb2_prep_guides(mysqli $conn): array
{
    $rows = [];
    try {
        $res = $conn->query("SELECT hazard, phase, body, body_fil, updated_at FROM preparedness_guides");
        while ($res && ($r = $res->fetch_assoc())) $rows[] = $r;
    } catch (Throwable $e) {
        // migration 033 not applied
    }
    return $rows;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'overview') {
    session_write_close();
    echo json_encode(['success' => true, 'hotlines' => pb2_prep_hotlines($conn, false), 'guides' => pb2_prep_guides($conn)]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'street_risk') {
    session_write_close();
    echo json_encode(['success' => true] + pb2_street_flood($conn, $_GET['street'] ?? '', $_GET['subdivision'] ?? ''));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'my_street') {
    $userId = pb2_resident_session_user(true);
    session_write_close();
    if (!$userId) {
        echo json_encode(['success' => false, 'signed_in' => false, 'message' => 'Sign in to see your street.']);
        exit;
    }
    $st = $conn->prepare("SELECT street, subdivision FROM residents WHERE user_id = ? LIMIT 1");
    $st->bind_param('s', $userId);
    $st->execute();
    $res = $st->get_result()->fetch_assoc();
    $st->close();
    if (!$res) {
        echo json_encode(['success' => false, 'signed_in' => true, 'message' => 'No resident record.']);
        exit;
    }
    echo json_encode(['success' => true, 'signed_in' => true, 'subdivision' => $res['subdivision']]
        + pb2_street_flood($conn, $res['street'], $res['subdivision']));
    exit;
}

// Everything below is for staff with the Disaster Risk tab.
pb2_require_admin();
require_once __DIR__ . '/admin_permissions.php';
pb2_require_any_permission(['module.disaster']); // tab access

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'admin') {
    echo json_encode(['success' => true, 'hotlines' => pb2_prep_hotlines($conn, true), 'guides' => pb2_prep_guides($conn),
        'categories' => PB2_HOTLINE_CATEGORIES, 'hazards' => PB2_GUIDE_HAZARDS, 'phases' => PB2_GUIDE_PHASES]);
    exit;
}

// For the advisory form (admin Disaster Risk): street names by flood level
// (medium and high), to fill in "Affected areas", and the officials'
// checklist size per alert level.
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'form_helpers') {
    $streets = ['2' => [], '3' => []];
    $tasks = ['Advisory' => 0, 'Watch' => 0, 'Warning' => 0, 'Severe' => 0];
    try {
        $res = $conn->query("SELECT DISTINCT name, flood_level FROM address_streets WHERE is_active = 1 AND flood_level >= 2 ORDER BY name");
        while ($res && ($r = $res->fetch_assoc())) $streets[(string)$r['flood_level']][] = $r['name'];
        $res = $conn->query("SELECT alert_level, COUNT(*) n FROM alert_task_templates WHERE is_active = 1 GROUP BY alert_level");
        while ($res && ($r = $res->fetch_assoc())) $tasks[$r['alert_level']] = (int)$r['n'];
    } catch (Throwable $e) {
        // migration 033 not applied: no helpers
    }
    echo json_encode(['success' => true, 'flood_streets' => $streets, 'task_counts' => $tasks]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Unknown request.']);
    exit;
}
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];
$adminId = (int)(pb2_current_admin()['admin_id'] ?? 0);

if ($action === 'save_hotline') {
    $id = (int)($input['id'] ?? 0);
    $name = trim(preg_replace('/\s+/u', ' ', (string)($input['name'] ?? '')));
    $number = trim(preg_replace('/\s+/', ' ', (string)($input['number'] ?? '')));
    $category = in_array($input['category'] ?? '', PB2_HOTLINE_CATEGORIES, true) ? $input['category'] : 'other';
    $note = trim(preg_replace('/\s+/u', ' ', (string)($input['note'] ?? '')));
    $active = isset($input['is_active']) ? (int)!empty($input['is_active']) : 1;
    // Phone numbers, short codes (911, 143) and landlines with area codes;
    // what a phone can dial: digits, +, spaces, dashes and brackets.
    $digits = preg_replace('/\D/', '', $number);
    if ($name === '' || mb_strlen($name) > 120) {
        echo json_encode(['success' => false, 'message' => 'Enter a name of up to 120 characters.']);
        exit;
    }
    if (!preg_match('/^\+?[0-9 ()\-]{3,40}$/', $number) || strlen($digits) < 3 || strlen($digits) > 15) {
        echo json_encode(['success' => false, 'message' => 'Enter a number a phone can dial: 3 to 15 digits, with spaces, dashes or brackets if needed.']);
        exit;
    }
    if (mb_strlen($note) > 200) {
        echo json_encode(['success' => false, 'message' => 'Keep the note under 200 characters.']);
        exit;
    }
    $dup = $conn->prepare("SELECT id, name FROM emergency_hotlines WHERE number = ? AND id <> ?");
    $dup->bind_param('si', $number, $id);
    $dup->execute();
    if ($d = $dup->get_result()->fetch_assoc()) {
        echo json_encode(['success' => false, 'message' => "This number is already listed as {$d['name']}."]);
        exit;
    }
    $noteVal = $note !== '' ? $note : null;
    if ($id > 0) {
        $old = $conn->query("SELECT name, number, category, note, is_active FROM emergency_hotlines WHERE id = $id")->fetch_assoc();
        if (!$old) {
            echo json_encode(['success' => false, 'message' => 'Hotline not found.']);
            exit;
        }
        $st = $conn->prepare("UPDATE emergency_hotlines SET name = ?, number = ?, category = ?, note = ?, is_active = ?, updated_by = ? WHERE id = ?");
        $st->bind_param('ssssiii', $name, $number, $category, $noteVal, $active, $adminId, $id);
        $ok = $st->execute();
        $changes = [];
        foreach (['name' => $name, 'number' => $number, 'category' => $category, 'note' => $noteVal, 'is_active' => $active] as $k => $v) {
            if ((string)$old[$k] !== (string)$v) $changes[$k] = ['old' => $old[$k], 'new' => $v];
        }
        if ($ok) pb2_log_admin_action('disaster.hotline.update', 'emergency_hotline', (string)$id, "Edited hotline $name ($number)", $changes ?: null);
    } else {
        $next = (int)$conn->query("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM emergency_hotlines")->fetch_row()[0];
        $st = $conn->prepare("INSERT INTO emergency_hotlines (name, number, category, note, is_active, sort_order, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $st->bind_param('ssssiii', $name, $number, $category, $noteVal, $active, $next, $adminId);
        $ok = $st->execute();
        $id = $conn->insert_id;
        if ($ok) pb2_log_admin_action('disaster.hotline.create', 'emergency_hotline', (string)$id, "Added hotline $name ($number)");
    }
    echo json_encode(['success' => (bool)$ok, 'message' => $ok ? 'Hotline saved.' : 'The hotline could not be saved.', 'hotlines' => pb2_prep_hotlines($conn, true)]);
    exit;
}

if ($action === 'delete_hotline') {
    $id = (int)($input['id'] ?? 0);
    $row = $conn->query("SELECT name, number FROM emergency_hotlines WHERE id = $id")->fetch_assoc();
    if (!$row) {
        echo json_encode(['success' => false, 'message' => 'Hotline not found.']);
        exit;
    }
    $conn->query("DELETE FROM emergency_hotlines WHERE id = $id");
    pb2_log_admin_action('disaster.hotline.delete', 'emergency_hotline', (string)$id, "Removed hotline {$row['name']} ({$row['number']})");
    echo json_encode(['success' => true, 'message' => 'Hotline removed.', 'hotlines' => pb2_prep_hotlines($conn, true)]);
    exit;
}

if ($action === 'order_hotlines') {
    $ids = array_values(array_filter(array_map('intval', (array)($input['ids'] ?? []))));
    $st = $conn->prepare("UPDATE emergency_hotlines SET sort_order = ? WHERE id = ?");
    foreach ($ids as $i => $hid) {
        $pos = $i + 1;
        $st->bind_param('ii', $pos, $hid);
        $st->execute();
    }
    pb2_log_admin_action('disaster.hotline.order', 'emergency_hotline', null, 'Changed the order of the emergency hotlines');
    echo json_encode(['success' => true, 'message' => 'Order saved.', 'hotlines' => pb2_prep_hotlines($conn, true)]);
    exit;
}

if ($action === 'save_guide') {
    $hazard = (string)($input['hazard'] ?? '');
    $phase = (string)($input['phase'] ?? '');
    if (!in_array($hazard, PB2_GUIDE_HAZARDS, true) || !in_array($phase, PB2_GUIDE_PHASES, true)) {
        echo json_encode(['success' => false, 'message' => 'Unknown guide.']);
        exit;
    }
    // One step per line; blank lines and stray spaces dropped. Keeps case.
    $clean = function ($text) {
        $lines = array_filter(array_map(fn ($l) => trim(preg_replace('/[ \t]+/u', ' ', $l)), preg_split('/\R/u', (string)$text)), 'strlen');
        return implode("\n", $lines);
    };
    $body = $clean($input['body'] ?? '');
    $bodyFil = $clean($input['body_fil'] ?? '');
    if ($body === '') {
        echo json_encode(['success' => false, 'message' => 'Write at least one step.']);
        exit;
    }
    foreach ([$body, $bodyFil] as $t) {
        if (mb_strlen($t) > 4000 || count(explode("\n", $t)) > 20) {
            echo json_encode(['success' => false, 'message' => 'Keep each guide to 20 steps and 4,000 characters.']);
            exit;
        }
    }
    $filVal = $bodyFil !== '' ? $bodyFil : null;
    $st = $conn->prepare("INSERT INTO preparedness_guides (hazard, phase, body, body_fil, updated_by) VALUES (?, ?, ?, ?, ?)
                          ON DUPLICATE KEY UPDATE body = VALUES(body), body_fil = VALUES(body_fil), updated_by = VALUES(updated_by)");
    $st->bind_param('ssssi', $hazard, $phase, $body, $filVal, $adminId);
    $ok = $st->execute();
    if ($ok) pb2_log_admin_action('disaster.guide.update', 'preparedness_guide', "$hazard.$phase", "Edited the \"$phase\" steps for " . $hazard . ($filVal ? ' (with Filipino)' : ''));
    echo json_encode(['success' => (bool)$ok, 'message' => $ok ? 'Guide saved.' : 'The guide could not be saved.', 'guides' => pb2_prep_guides($conn)]);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Unknown action.']);
