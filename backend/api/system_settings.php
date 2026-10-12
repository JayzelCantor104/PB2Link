<?php
// System settings changed by Super Admins (migrations 017, 019).
//   GET  -> { settings: { auto_approve_accounts: bool, issue_flag_tiers: [orange, red, purple] } }
//   POST JSON with either or both keys:
//        { auto_approve_accounts: bool, issue_flag_tiers: [2, 5, 10] }  -> saves (audit-logged)
// auto_approve_accounts: when on, a registration that passes every
// server-side check is approved at once (account_approval.php); when off,
// every registration waits for staff on Pending Users.
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
