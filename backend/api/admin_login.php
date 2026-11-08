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

// Limit on failed attempts (migration 041): 5 wrong passwords pause this email
// for 15 minutes. Checked before the password, whether or not the email exists.
require_once __DIR__ . '/login_throttle.php';
$paused = pb2_login_check($conn, 'admin', (string)$email);
if ($paused) {
    http_response_code(429);
    header('Retry-After: ' . $paused['retry_after']);
    echo json_encode(['success' => false, 'code' => 'TOO_MANY_ATTEMPTS', 'retry_after' => $paused['retry_after'], 'message' => $paused['message']]);
    exit;
}

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
    $fail = pb2_login_record_failure($conn, 'admin', (string)$email, 'Invalid email or password.');
    if ($fail['locked']) {
        pb2_login_admin_paused($conn, $row ?: null, (string)$email);
    }
    http_response_code(401);
    echo json_encode(['success' => false, 'tries_left' => $fail['tries_left'], 'message' => $fail['message']]);
    exit;
}

// Correct password: the count of failed attempts starts over.
pb2_login_clear($conn, 'admin', (string)$email);

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


/**
 * The 5th wrong password just paused this admin email for 15 minutes:
 * record it in the audit log and, when it belongs to a real admin, tell them
 * by email (staff accounts reach residents' data, so they should know).
 */
function pb2_login_admin_paused(mysqli $conn, ?array $row, string $email): void
{
    pb2_log_admin_action(
        'admin.login.locked',
        'admin',
        $row['admin_id'] ?? null,
        "Sign-in paused for 15 minutes after 5 incorrect passwords for $email",
        ['ip' => pb2_login_ip()],
        'failure',
        [
            'admin_id' => $row['admin_id'] ?? null,
            'username' => $row['username'] ?? $email,
            'role'     => $row['role'] ?? 'Admin',
        ]
    );
    if (!$row || empty($row['email'])) return;

    require_once __DIR__ . '/mailer.php';
    $name = htmlspecialchars((string)($row['fullname'] ?: $row['username']), ENT_QUOTES, 'UTF-8');
    $when = date('F j, Y g:i A');
    $html = "<p>Hello $name,</p>"
        . "<p>Someone entered an incorrect password 5 times while signing in to your PB2Link admin account "
        . "(last attempt on $when). Sign-in to your account is paused for 15 minutes.</p>"
        . "<p>If this was you, wait 15 minutes and try again, or use <strong>Forgot Password</strong> on the admin sign-in page.</p>"
        . "<p><strong>If this wasn't you,</strong> someone may be trying to guess your password. "
        . "Set a new one with Forgot Password and tell your Super Admin.</p>"
        . "<p>Barangay Pasong Buaya II</p>";
    $plain = "Hello " . ($row['fullname'] ?: $row['username']) . ",\n\n"
        . "Someone entered an incorrect password 5 times while signing in to your PB2Link admin account (last attempt on $when). "
        . "Sign-in to your account is paused for 15 minutes.\n\n"
        . "If this was you, wait 15 minutes and try again, or use Forgot Password on the admin sign-in page.\n\n"
        . "If this wasn't you, someone may be trying to guess your password. Set a new one with Forgot Password and tell your Super Admin.\n\n"
        . "Barangay Pasong Buaya II";
    pb2_send_mail((string)$row['email'], 'PB2 Admin: sign-in paused after incorrect passwords', $html, $plain);
}
