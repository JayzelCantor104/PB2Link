<?php
header('Content-Type: application/json');
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Starts the session with hardened cookie params (replaces a bare
// session_start()) and provides pb2_citizen_logout_session().
require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

/** @var mysqli|false $conn */
include_once __DIR__ . '/../db_connection.php';

if (!$conn) {
    echo json_encode(['user_id' => null, 'role' => null, 'unavailable' => true, 'message' => 'Database connection failed.']);
    exit;
}

// The citizen session as the server sees it now (auth_guard.php re-checks the
// account): full, restricted (fixing a registration, migration 027) or none.
// AuthContext calls this on load so the browser never trusts a stale copy.
pb2_citizen_session_gate(true);
if (!empty($_SESSION['user_id'])) {
    echo json_encode(['user_id' => (string)$_SESSION['user_id'], 'role' => 'user', 'restricted' => false]);
} elseif (!empty($_SESSION['fix_user_id'])) {
    echo json_encode(['user_id' => (string)$_SESSION['fix_user_id'], 'role' => 'user', 'restricted' => true]);
} else {
    echo json_encode(['user_id' => null, 'role' => null, 'message' => 'Not signed in.']);
}
