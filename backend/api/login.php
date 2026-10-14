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
$stmt = mysqli_prepare($conn, "SELECT u.user_id, u.password_hash, r.status, r.admin_remarks, r.fix_items, r.resubmit_count, r.fName, r.lName, r.profile_picture FROM users u LEFT JOIN residents r ON u.user_id = r.user_id WHERE u.email = ?");
mysqli_stmt_bind_param($stmt, "s", $email);
mysqli_stmt_execute($stmt);
$result = mysqli_stmt_get_result($stmt);

if ($row = mysqli_fetch_assoc($result)) {
    if (password_verify($password, $row['password_hash'])) {
        
        // ENFORCE SYSTEM ADMINISTRATIVE PROTOCOL
        $accountStatus = strtoupper($row['status'] ?? 'PENDING');
        
        // Only an Active resident gets a session. The statuses are Pending,
        // Action Required and Archived (residents.status); each gets its own
        // message, and Action Required shows what staff asked for.
        // Staff let this resident fix the registration online (migration 027):
        // a restricted session that only opens Edit Profile. It uses its own
        // key, never 'user_id', so no request endpoint accepts it.
        require_once __DIR__ . '/registration_fix_common.php';
        if ($accountStatus === 'ACTION REQUIRED' && pb2_fix_mode_open($row)) {
            session_regenerate_id(true);
            unset($_SESSION['user_id'], $_SESSION['role']);
            $_SESSION['fix_user_id'] = $row['user_id'];
            $_SESSION['citizen_checked_at'] = time();
            echo json_encode([
                'success' => true,
                'restricted' => true,
                'message' => 'Your registration needs a few fixes before your account can be used.',
                'user_id' => $row['user_id'],
                'role' => 'user',
                'status' => $row['status'],
                'fName' => $row['fName'],
                'lName' => $row['lName'],
                'profile_picture' => $row['profile_picture']
            ]);
            mysqli_stmt_close($stmt);
            exit;
        }

        if ($accountStatus !== 'ACTIVE') {
            $messages = [
                'PENDING'         => 'Your registration is still being reviewed by barangay staff. You will be notified once your account is approved.',
                'ACTION REQUIRED' => 'Barangay staff need something before your account can be used'
                                     . (trim((string)($row['admin_remarks'] ?? '')) !== '' ? ': ' . rtrim(trim($row['admin_remarks']), '.') . '.' : '.')
                                     . ' Please visit the Barangay Hall or contact the barangay office.',
                'ARCHIVED'        => 'This account was archived and can no longer sign in. Please contact the barangay office if this is a mistake.',
            ];
            echo json_encode([
                'success' => false,
                'status'  => $row['status'],
                'message' => $messages[$accountStatus] ?? 'This account cannot sign in yet. Please contact the barangay office.'
            ]);
            mysqli_stmt_close($stmt);
            exit;
        }

        // normal session initialization ONLY executes if status is strictly 'ACTIVE'
        session_regenerate_id(true); // prevent session fixation
        $_SESSION['user_id'] = $row['user_id'];
        $_SESSION['role'] = 'user'; // Assign role explicitly to avoid admin tab mixing
        unset($_SESSION['fix_user_id']);
        $_SESSION['citizen_checked_at'] = time();
        
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
            'status' => $row['status'],
            'fName' => $row['fName'],
            'lName' => $row['lName'],
            'profile_picture' => $row['profile_picture']
        ]);

    } else {
        echo json_encode(['success' => false, 'message' => 'Incorrect email or password.']);
    }
} else {
    // Same message as a wrong password, so the form doesn't reveal which emails are registered.
    echo json_encode(['success' => false, 'message' => 'Incorrect email or password.']);
}
mysqli_stmt_close($stmt);