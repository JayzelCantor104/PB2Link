<?php
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';

// Clears only the admin keys so a citizen signed in on the same browser stays
// signed in. Always reports success — logging out should be idempotent.
// Recorded before the session is cleared, while we still know who it was.
$leaving = pb2_current_admin();
if ($leaving) {
    require_once __DIR__ . '/../db_connection.php';
    require_once __DIR__ . '/audit_log.php';
    pb2_log_admin_action('admin.logout', 'admin', (string)$leaving['admin_id'], "Admin '{$leaving['username']}' signed out");
}
pb2_admin_logout_session();

echo json_encode(['success' => true, 'message' => 'Logged out']);
