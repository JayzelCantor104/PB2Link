<?php
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';

// Lets the frontend verify a localStorage admin entry against the real server
// session on page load, instead of trusting localStorage alone. Returns 200
// with authenticated=false rather than 401, because "not signed in" is a
// normal answer here, not an error.
$admin = pb2_current_admin();

if ($admin === null) {
    echo json_encode(['authenticated' => false, 'adminData' => null]);
    exit;
}

echo json_encode(['authenticated' => true, 'adminData' => $admin]);
