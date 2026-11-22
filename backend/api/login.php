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

// Limit on failed attempts (migration 041): 5 wrong passwords pause this email
// for 15 minutes. Checked before the password, whether or not the email exists.
require_once __DIR__ . '/login_throttle.php';
$paused = pb2_login_check($conn, 'resident', (string)$data['email']);
if ($paused) {
    http_response_code(429);
    header('Retry-After: ' . $paused['retry_after']);
    echo json_encode(['success' => false, 'code' => 'TOO_MANY_ATTEMPTS', 'retry_after' => $paused['retry_after'], 'message' => $paused['message']]);
    exit;
}

// The account by email or confirmed mobile number (account_lookup.php, migration 049).
require_once __DIR__ . '/account_lookup.php';
$found = pb2_find_login_account($conn, (string)$data['email']);
if (!empty($found['ambiguous'])) {
    echo json_encode(['success' => false, 'message' => 'This mobile number is used by more than one account. Please sign in with your email address instead.']);
    exit;
}
$row = $found['user'] ?? null;

if ($row) {
    if (password_verify($password, $row['password_hash'])) {
        pb2_login_clear($conn, 'resident', (string)$data['email']);
        
        // ENFORCE SYSTEM ADMINISTRATIVE PROTOCOL
        $accountStatus = strtoupper($row['status'] ?? 'PENDING');
        
        // Only an Active resident gets a session. The statuses are Pending,
        // Action Required and Archived (residents.status); each gets its own
        // message, and Action Required shows what staff asked for.
        // Staff let this resident fix the registration online (migration 027):
        // a restricted session that only opens Edit Profile. It uses its own
        // key, never 'user_id', so no request endpoint accepts it.
        require_once __DIR__ . '/registration_fix_common.php';
        require_once __DIR__ . '/account_approval.php'; // PB2_REGISTRATION_REVIEW_TIME
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
            
            exit;
        }

        if ($accountStatus !== 'ACTIVE') {
            $messages = [
                'PENDING'         => 'Your registration is still being checked by barangay staff, usually ' . PB2_REGISTRATION_REVIEW_TIME . '. You will be told by email or SMS as soon as your account is approved.',
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
            
            exit;
        }

        // Two-step sign-in, when the resident turned it on (migration 052,
        // two_factor.php): login_2fa.php finishes the sign-in once the code is
        // right. A device trusted for 30 days skips the code.
        require_once __DIR__ . '/two_factor.php';
        $acct = pb2_2fa_account($conn, 'resident', (string)$row['user_id']);
        if (!empty($acct['two_factor_enabled']) && !empty($acct['_channels'])
            && !pb2_2fa_is_trusted($conn, 'resident', (string)$row['user_id'])) {
            echo json_encode(pb2_2fa_begin('resident', (string)$row['user_id'], $acct['_channels'], $acct['two_factor_channel'] ?? null));
            exit;
        }
        echo json_encode(pb2_finish_resident_login($conn, $row));

    } else {
        $fail = pb2_login_record_failure($conn, 'resident', (string)$data['email'], 'Incorrect email, mobile number or password.');
        echo json_encode(['success' => false, 'tries_left' => $fail['tries_left'], 'message' => $fail['message']]);
    }
} else {
    // Same message (and the same attempt count) as a wrong password, so the
    // form doesn't reveal which emails are registered.
    $fail = pb2_login_record_failure($conn, 'resident', (string)$data['email'], 'Incorrect email, mobile number or password.');
    echo json_encode(['success' => false, 'tries_left' => $fail['tries_left'], 'message' => $fail['message']]);
}
