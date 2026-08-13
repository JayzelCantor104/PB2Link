<?php
// Credentialed requests cannot use a wildcard origin, so echo the caller's
// origin back and allow credentials. Through the Vite dev proxy this is a
// same-origin request and CORS does not apply, but this keeps the endpoint
// correct if the frontend is ever served from a different origin.
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
require_once __DIR__ . '/audit_log.php';
include_once __DIR__ . "/../db_connection.php";

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed"]);
    exit;
}

$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (!$data || !isset($data['email']) || !isset($data['password'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid input - missing data']);
    exit;
}

$email    = $data['email'];
$password = $data['password'];

$stmt = mysqli_prepare(
    $conn,
    "SELECT admin_id, username, fullname, email, password_hash, role FROM admins WHERE email = ?"
);
mysqli_stmt_bind_param($stmt, "s", $email);
mysqli_stmt_execute($stmt);
$result = mysqli_stmt_get_result($stmt);
$row    = mysqli_fetch_assoc($result);
mysqli_stmt_close($stmt);

// Uniform message for both "no such email" and "wrong password" so the
// response cannot be used to enumerate which admin addresses exist.
if (!$row || !password_verify($password, $row['password_hash'])) {
    // No admin session exists yet, so the actor is supplied via override —
    // log only the attempted email, never the attempted password.
    pb2_log_admin_action(
        'admin.login.failure',
        'admin',
        $row['admin_id'] ?? null,
        "Failed login attempt for $email",
        null,
        'failure',
        [
            'admin_id' => $row['admin_id'] ?? null,
            'username' => $row['username'] ?? $email,
            'role'     => $row['role'] ?? 'Admin',
        ]
    );
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid email or password']);
    exit;
}

// Establish the server-side session. Until this existed, the admin's identity
// and role lived only in localStorage and the API trusted anyone who asked.
pb2_admin_login_session([
    'admin_id' => $row['admin_id'],
    'username' => $row['username'],
    'email'    => $row['email'],
    'role'     => $row['role'],
]);

$stmtUpdate = mysqli_prepare($conn, "UPDATE admins SET last_login = NOW() WHERE admin_id = ?");
mysqli_stmt_bind_param($stmtUpdate, "i", $row['admin_id']);
mysqli_stmt_execute($stmtUpdate);
mysqli_stmt_close($stmtUpdate);

pb2_log_admin_action(
    'admin.login.success',
    'admin',
    $row['admin_id'],
    "Admin '{$row['username']}' signed in",
    null,
    'success',
    [
        'admin_id' => $row['admin_id'],
        'username' => $row['username'],
        'role'     => $row['role'],
    ]
);

echo json_encode([
    'success' => true,
    'message' => 'Admin login successful',
    'adminData' => [
        'admin_id' => $row['admin_id'],
        'username' => $row['username'],
        'fullname' => $row['fullname'],
        'email'    => $row['email'],
        'role'     => $row['role']
    ]
]);
