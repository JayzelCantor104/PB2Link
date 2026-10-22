<?php
// What the signed-in admin may open (admin_permissions.php): drives the admin
// sidebar, the page guard and the Dashboard cards (src/lib/adminAccess.js).
// Only a convenience for the screens; every endpoint checks again itself.
//   GET -> { success, role, permissions: [perm, ...] }
ini_set('display_errors', 0);
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
$admin = pb2_require_admin();
require_once __DIR__ . '/admin_permissions.php';

$permissions = pb2_current_permissions();
session_write_close();
echo json_encode(['success' => true, 'role' => $admin['role'], 'permissions' => $permissions]);
