<?php
// System settings changed by Super Admins (migrations 017, 019).
//   GET  -> { settings: { auto_approve_accounts: bool, issue_flag_tiers: [orange, red, purple] } }
//   POST JSON with either or both keys:
//        { auto_approve_accounts: bool, issue_flag_tiers: [2, 5, 10] }  -> saves (audit-logged)
// auto_approve_accounts: when on, a registration that passes every
// server-side check is approved at once (account_approval.php); when off,
// every registration waits for staff on Pending Users.
// hazard_alert_mode: off / draft / auto for hazard-feed detections (migration 022).
// advisory_sms_mode: manual / auto texting of advisories to all residents (migration 023).
// issue_flag_tiers: minimum report counts for an orange, red and purple flag
// on the Community Issue Map (1 report = yellow; issue_map_common.php).
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
$admin = pb2_require_super_admin();

require_once '../db_connection.php';
require_once __DIR__ . '/account_approval.php';
require_once __DIR__ . '/issue_map_common.php';

if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$current = function () use ($conn) {
    return [
        'auto_approve_accounts' => pb2_auto_approval_enabled($conn),
        'issue_flag_tiers'      => pb2_issue_tiers($conn),
        'hazard_alert_mode'     => pb2_setting_get($conn, 'hazard_alert_mode', 'draft'),
        'advisory_sms_mode'     => pb2_setting_get($conn, 'advisory_sms_mode', 'manual'),
    ];
};

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $messages = [];

    if (array_key_exists('issue_flag_tiers', $data)) {
        $tiers = pb2_issue_parse_tiers($data['issue_flag_tiers']);
        if (!$tiers) {
            echo json_encode(['success' => false, 'message' => 'Flag thresholds must be whole numbers in increasing order, starting at 2 or more (e.g. 2, 5, 10).']);
            exit;
        }
        $old = pb2_issue_tiers($conn);
        pb2_setting_set($conn, 'issue_flag_tiers', implode(',', $tiers), (int)$admin['admin_id']);
        if ($old !== $tiers) {
            pb2_log_admin_action('settings.issue_flag_tiers', 'setting', 'issue_flag_tiers',
                'Changed Issue Map flag thresholds to ' . implode(', ', $tiers),
                [['field' => 'issue_flag_tiers', 'old_value' => implode(',', $old), 'new_value' => implode(',', $tiers)]]);
        }
        $messages[] = "Flag colours saved: orange from {$tiers[0]}, red from {$tiers[1]}, purple from {$tiers[2]} reports.";
    }

    // Default permissions per barangay position (migration 020, admin_permissions.php).
    if (array_key_exists('position_permissions', $data)) {
        require_once __DIR__ . '/admin_permissions.php';
        $old = pb2_position_permissions($conn);
        $new = pb2_clean_position_permissions($data['position_permissions']);
        pb2_setting_set($conn, 'position_permissions', json_encode($new), (int)$admin['admin_id']);
        if ($old !== $new) {
            pb2_log_admin_action('settings.position_permissions', 'setting', 'position_permissions',
                'Changed default permissions per position',
                [['field' => 'position_permissions', 'old_value' => json_encode($old), 'new_value' => json_encode($new)]]);
        }
        $messages[] = 'Position permissions saved.';
    }

    // What happens when a hazard feed detects something serious (migration 022).
    if (array_key_exists('hazard_alert_mode', $data)) {
        require_once __DIR__ . '/hazard_feeds_common.php';
        $new = (string)$data['hazard_alert_mode'];
        if (!in_array($new, PB2_HAZ_MODES, true)) {
            echo json_encode(['success' => false, 'message' => 'Choose Off, Draft for staff, or Publish automatically.']);
            exit;
        }
        $old = pb2_haz_mode($conn);
        pb2_setting_set($conn, 'hazard_alert_mode', $new, (int)$admin['admin_id']);
        $labels = ['off' => 'OFF', 'draft' => 'DRAFT FOR STAFF', 'auto' => 'PUBLISH AUTOMATICALLY'];
        if ($old !== $new) {
            pb2_log_admin_action('settings.hazard_alert_mode', 'setting', 'hazard_alert_mode',
                'Set hazard-feed alerts to ' . $labels[$new],
                [['field' => 'hazard_alert_mode', 'old_value' => $old, 'new_value' => $new]]);
        }
        $messages[] = [
            'off' => 'Hazard feeds are shown, but detections are not recorded.',
            'draft' => 'Detected hazards now wait on Disaster Risk for staff to review.',
            'auto' => 'Serious detections now publish an advisory at once. SMS still needs staff.',
        ][$new];
    }

    // Whether a published advisory is texted to all residents (migration 023).
    if (array_key_exists('advisory_sms_mode', $data)) {
        require_once __DIR__ . '/advisory_sms.php';
        $new = (string)$data['advisory_sms_mode'];
        if (!in_array($new, PB2_ADVISORY_SMS_MODES, true)) {
            echo json_encode(['success' => false, 'message' => 'Choose Manual or Automatic.']);
            exit;
        }
        $old = pb2_advisory_sms_mode($conn);
        pb2_setting_set($conn, 'advisory_sms_mode', $new, (int)$admin['admin_id']);
        if ($old !== $new) {
            pb2_log_admin_action('settings.advisory_sms_mode', 'setting', 'advisory_sms_mode',
                'Set advisory SMS to ' . strtoupper($new === 'auto' ? 'automatic' : 'manual'),
                [['field' => 'advisory_sms_mode', 'old_value' => $old, 'new_value' => $new]]);
        }
        $messages[] = $new === 'auto'
            ? 'Advisories are now texted to all residents as soon as they go live.'
            : 'Advisories are no longer texted automatically. Staff send them from the SMS dispatcher.';
    }

    if (array_key_exists('auto_approve_accounts', $data)) {
        $old = pb2_auto_approval_enabled($conn);
        $new = filter_var($data['auto_approve_accounts'], FILTER_VALIDATE_BOOLEAN);
        pb2_setting_set($conn, 'auto_approve_accounts', $new ? '1' : '0', (int)$admin['admin_id']);
        if ($old !== $new) {
            pb2_log_admin_action('settings.auto_approve_accounts', 'setting', 'auto_approve_accounts',
                'Turned automatic account approval ' . ($new ? 'ON' : 'OFF'),
                [['field' => 'auto_approve_accounts', 'old_value' => $old ? 'on' : 'off', 'new_value' => $new ? 'on' : 'off']]);
        }
        $messages[] = $new
            ? 'Automatic approval is on: registrations that pass every check are approved at once.'
            : 'Automatic approval is off: every registration now waits for staff approval.';
    }

    if (!$messages) {
        echo json_encode(['success' => false, 'message' => 'Nothing to save.']);
        exit;
    }
    echo json_encode(['success' => true, 'message' => implode(' ', $messages), 'settings' => $current()]);
    exit;
}

echo json_encode(['success' => true, 'settings' => $current()]);
