<?php
// Sets a new admin password from a reset token: the emailed link (forgot
// password, or one the Super Admin sent from Manage Admins) or the SMS-code
// flow. The token is single-use. password_changed_at (migration 029) ends
// every session that signed in before the change.
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

include "../db_connection.php";
require_once __DIR__ . '/audit_log.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!$data || !isset($data['token']) || !isset($data['password'])) {
    echo json_encode(['success' => false, 'message' => 'Token and password are required']);
    exit;
}

$token = (string)$data['token'];
$password = (string)$data['password'];

if (strlen($password) < 8 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
    echo json_encode(['success' => false, 'message' => 'Use at least 8 characters, with letters and numbers.']);
    exit;
}

$stmt = $conn->prepare("SELECT admin_id, username, role, reset_expiry FROM admins WHERE reset_token = ? AND status = 'active' LIMIT 1");
$stmt->bind_param('s', $token);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row) {
    echo json_encode(['success' => false, 'message' => 'This reset link is invalid or was already used. Please request a new one.']);
    exit;
}
if (date('Y-m-d H:i:s') > $row['reset_expiry']) {
    echo json_encode(['success' => false, 'message' => 'This reset link has expired. Please request a new one.']);
    exit;
}

$admin_id = (int)$row['admin_id'];
$hash = password_hash($password, PASSWORD_DEFAULT);
// PHP's clock, the same one auth_guard.php compares the session start with.
$now = date('Y-m-d H:i:s');

try {
    $upd = $conn->prepare("UPDATE admins SET password_hash = ?, password_changed_at = ?, reset_token = NULL, reset_expiry = NULL, updated_at = NOW() WHERE admin_id = ?");
    $upd->bind_param('ssi', $hash, $now, $admin_id);
    $upd->execute();
} catch (Throwable $e) {
    // Migration 029 not applied yet.
    $upd = $conn->prepare("UPDATE admins SET password_hash = ?, reset_token = NULL, reset_expiry = NULL WHERE admin_id = ?");
    $upd->bind_param('si', $hash, $admin_id);
    if (!$upd->execute()) {
        echo json_encode(['success' => false, 'message' => 'Failed to update password.']);
        exit;
    }
}

pb2_log_admin_action('admin.password.reset', 'admin', (string)$admin_id,
    "Admin '{$row['username']}' set a new password with a reset link",
    [['field' => 'password', 'old_value' => null, 'new_value' => 'changed']],
    'success', ['admin_id' => $admin_id, 'username' => $row['username'], 'role' => $row['role']]);

echo json_encode(['success' => true, 'message' => 'Password changed. Any other signed-in sessions were signed out.']);
