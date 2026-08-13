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
    echo json_encode(['user_id' => null, 'role' => null, 'message' => 'Database connection failed.']);
    exit;
}

// Ensure the session belongs explicitly to a citizen role
if (isset($_SESSION['user_id']) && isset($_SESSION['role']) && $_SESSION['role'] === 'user') {
    $userId = $_SESSION['user_id'];

    // Real-time verification lookup parameter matching database constraints safely
    $stmt = mysqli_prepare($conn, "SELECT status, email FROM residents r JOIN users u ON r.user_id = u.user_id WHERE r.user_id = ?");
    mysqli_stmt_bind_param($stmt, "s", $userId);
    mysqli_stmt_execute($stmt);
    $res = mysqli_stmt_get_result($stmt);

    if ($row = mysqli_fetch_assoc($res)) {
        if (strtoupper($row['status']) === 'ACTIVE') {
            echo json_encode([
                'user_id' => $_SESSION['user_id'],
                'role' => 'user',
                'email' => $row['email']
            ]);
            mysqli_stmt_close($stmt);
            exit;
        }
    }
    mysqli_stmt_close($stmt);

    // Hard logout checkpoint: Terminate invalid state loops seamlessly.
    // Clears only the citizen keys — session_destroy() here would also sign
    // out an administrator signed in on the same browser.
    pb2_citizen_logout_session();
    echo json_encode(['user_id' => null, 'role' => null, 'message' => 'Account status no longer active.']);
} else {
    echo json_encode(['user_id' => null, 'role' => null]);
}