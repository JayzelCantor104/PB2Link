<?php
header('Content-Type: application/json');
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Credentials: true');

require_once __DIR__ . '/auth_guard.php';

// Clears only the citizen keys. This used to call session_destroy(), which
// also signed out an administrator signed in on the same browser.
pb2_citizen_logout_session();

echo json_encode(['success' => true]);
