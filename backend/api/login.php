<?php
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true"); 
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Starts the session with hardened cookie params. This endpoint is normally
// what creates the session cookie, so the flags set here are the ones that
// apply for the rest of the citizen's visit.
require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

include_once "../db_connection.php";

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

$email = mysqli_real_escape_string($conn, $data['email']);
$password = $data['password'];

// UPGRADED PARAMETERIZED CHECK: Join users with residents to pull profiling status safely
$stmt = mysqli_prepare($conn, "SELECT u.user_id, u.password_hash, r.status FROM users u LEFT JOIN residents r ON u.user_id = r.user_id WHERE u.email = ?");
mysqli_stmt_bind_param($stmt, "s", $email);
mysqli_stmt_execute($stmt);
$result = mysqli_stmt_get_result($stmt);

if ($row = mysqli_fetch_assoc($result)) {
    if (password_verify($password, $row['password_hash'])) {
        
        // ENFORCE SYSTEM ADMINISTRATIVE PROTOCOL
        $accountStatus = strtoupper($row['status'] ?? 'PENDING');
        
        if ($accountStatus === 'PENDING') {
            echo json_encode([
                'success' => false,
                'message' => 'Your profiling record is currently PENDING verification. An administrator must complete reviewing your identity documents before access to the portal services is granted.'
            ]);
            mysqli_stmt_close($stmt);
            exit;
        }
        
        if ($accountStatus === 'REJECTED') {
            echo json_encode([
                'success' => false,
                'message' => 'Your profiling registration was REJECTED due to data mismatch. Please visit the Barangay Hall for compliance.'
            ]);
            mysqli_stmt_close($stmt);
            exit;
        }

        // normal session initialization ONLY executes if status is strictly 'ACTIVE'
        session_regenerate_id(true); // prevent session fixation
        $_SESSION['user_id'] = $row['user_id'];
        $_SESSION['role'] = 'user'; // Assign role explicitly to avoid admin tab mixing
        
        // Update last login timestamp safely
        $stmtUpdate = mysqli_prepare($conn, "UPDATE users SET last_login = NOW() WHERE user_id = ?");
        mysqli_stmt_bind_param($stmtUpdate, "s", $row['user_id']);
        mysqli_stmt_execute($stmtUpdate);
        mysqli_stmt_close($stmtUpdate);

        echo json_encode([
            'success' => true, 
            'message' => 'Login successful', 
            'user_id' => $row['user_id'],
            'role' => 'user',
            'status' => $row['status'] 
        ]);

    } else {
        echo json_encode(['success' => false, 'message' => 'Incorrect password']);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'Email not found']);
}
mysqli_stmt_close($stmt);