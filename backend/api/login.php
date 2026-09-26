<?php
// Buffer output to catch stray whitespaces or warnings
ob_start();

// Suppress error display so PHP never outputs HTML error blocks
ini_set('display_errors', 0);
error_reporting(E_ALL);

// Set CORS and Content-Type Headers
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
} else {
    header("Access-Control-Allow-Origin: *");
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_clean();
    http_response_code(200);
    exit;
}

// Locate Database File
$dbPath = __DIR__ . '/../db_connection.php';
if (!file_exists($dbPath)) {
    $dbPath = __DIR__ . '/db_connection.php';
}

if (!file_exists($dbPath)) {
    ob_clean();
    http_response_code(200);
    echo json_encode(["success" => false, "message" => "db_connection.php missing."]);
    exit;
}

require_once $dbPath;

// Include Session Guard
$authGuardPath = __DIR__ . '/auth_guard.php';
if (file_exists($authGuardPath)) {
    require_once $authGuardPath;
    if (function_exists('pb2_session_start')) {
        pb2_session_start();
    }
} else {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
}

// Check Database Connection
if (!isset($conn) or !$conn or $conn->connect_error) {
    ob_clean();
    http_response_code(200);
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

// Read JSON Input
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!is_array($input)) {
    ob_clean();
    http_response_code(200);
    echo json_encode(["success" => false, "message" => "Invalid payload."]);
    exit;
}

$email = trim($input['email'] ?? '');
$password = trim($input['password'] ?? '');

// Input Validation (Using OR to bypass any pipe symbols)
if (empty($email) or empty($password)) {
    ob_clean();
    http_response_code(200);
    echo json_encode(["success" => false, "message" => "Email and password are required."]);
    exit;
}

// SQL Query
$sql = "
    SELECT 
        u.user_id,
        u.email,
        u.password_hash,
        u.role,
        u.status AS account_status,
        r.fName,
        r.lName
    FROM users u
    LEFT JOIN residents r 
        ON u.user_id = r.user_id
    WHERE u.email = ?
    LIMIT 1
";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    ob_clean();
    http_response_code(200);
    echo json_encode(["success" => false, "message" => "SQL Prepare error: " . $conn->error]);
    exit;
}

$stmt->bind_param("s", $email);

if (!$stmt->execute()) {
    ob_clean();
    http_response_code(200);
    echo json_encode(["success" => false, "message" => "SQL Execution error: " . $stmt->error]);
    $stmt->close();
    exit;
}

$result = $stmt->get_result();
$user = $result ? $result->fetch_assoc() : null;
$stmt->close();

if (!$user) {
    ob_clean();
    http_response_code(200);
    echo json_encode(["success" => false, "message" => "Invalid email or password."]);
    exit;
}

if (!password_verify($password, $user['password_hash'])) {
    ob_clean();
    http_response_code(200);
    echo json_encode(["success" => false, "message" => "Invalid email or password."]);
    exit;
}

if (strtolower($user['account_status']) !== 'active') {
    ob_clean();
    http_response_code(200);
    echo json_encode(["success" => false, "message" => "Account is inactive."]);
    exit;
}

// Set Session
session_regenerate_id(true);
$_SESSION['user_id'] = $user['user_id'];
$_SESSION['email']   = $user['email'];
$_SESSION['role']    = $user['role'];

$fullName = trim(($user['fName'] ?? '') . ' ' . ($user['lName'] ?? ''));
if (empty($fullName)) {
    $fullName = $user['email'];
}

// Final Pure JSON Output
while (ob_get_level()) {
    ob_end_clean();
}

header("Content-Type: application/json; charset=UTF-8");
http_response_code(200);

echo json_encode([
    "success" => true,
    "message" => "Login successful.",
    "role" => $user['role'],
    "userData" => [
        "user_id" => $user['user_id'],
        "email" => $user['email'],
        "role" => $user['role'],
        "fullname" => $fullName
    ]
]);

exit;
?>