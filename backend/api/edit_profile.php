<?php
session_start();
ini_set('display_errors', 0);
error_reporting(E_ALL);

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

require_once '../db_connection.php';

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized session state. Please log in again.']);
    exit;
}

$user_id = $_SESSION['user_id'];
$raw_input = file_get_contents("php://input");
$data = json_decode($raw_input, true);

// 1. Handle background password verification step
if (isset($data['verify_password']) && $data['verify_password'] == '1') {
    $email = $data['email'] ?? '';
    $password = $data['password'] ?? '';
    
    $stmt = $conn->prepare("SELECT password_hash FROM users WHERE email = ? AND user_id = ?");
    $stmt->bind_param("si", $email, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 0) {
        echo json_encode(['success' => false, 'message' => 'Email does not match your account.']);
        exit;
    }
    
    $user = $result->fetch_assoc();
    if (!password_verify($password, $user['password_hash'])) {
        echo json_encode(['success' => false, 'message' => 'Incorrect password.']);
        exit;
    }
    
    echo json_encode(['success' => true, 'message' => 'Password verified successfully.']);
    exit;
}

if (!$data || !isset($data['update_profile'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid or empty data payload received.']);
    exit;
}

// Fetch current baseline data
$stmt = $conn->prepare("SELECT r.*, u.email, u.password_hash FROM residents r JOIN users u ON r.user_id = u.user_id WHERE r.user_id = ?");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$current_user = $stmt->get_result()->fetch_assoc();

if (!$current_user) {
    echo json_encode(['success' => false, 'message' => 'Resident profile record not found.']);
    exit;
}

// 2. Handle Password Change Action
if (isset($data['change_password']) && $data['change_password'] == '1') {
    $current_password = $data['current_password'] ?? '';
    $new_password = $data['new_password'] ?? '';
    
    if (!password_verify($current_password, $current_user['password_hash'])) {
        echo json_encode(['success' => false, 'message' => 'Current password is incorrect.']);
        exit;
    }
    
    if (strlen($new_password) < 8) {
        echo json_encode(['success' => false, 'message' => 'New password must be at least 8 characters.']);
        exit;
    }
    
    $new_hash = password_hash($new_password, PASSWORD_DEFAULT);
    $update_stmt = $conn->prepare("UPDATE users SET password_hash = ? WHERE user_id = ?");
    $update_stmt->bind_param("si", $new_hash, $user_id);
    
    if ($update_stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Password updated successfully!']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to update password.']);
    }
    exit;
}

// Validate overall transaction password authority
$submitted_password = $data['current_password'] ?? '';
if (!password_verify($submitted_password, $current_user['password_hash'])) {
    echo json_encode(['success' => false, 'message' => 'Security verification failed. Invalid password.']);
    exit;
}

$admin_approval_fields = ['fName', 'mName', 'lName', 'suffix', 'sector'];
$otp_only_fields = ['email', 'contact_num'];
$direct_update_fields = [
    'gender', 'birth_date', 'religion', 'civil_status', 'birth_city', 'birth_province', 'birth_country', 
    'house_no', 'street', 'zone', 'subdivision', 'area', 'block_lot', 'landmark', 'residency_status', 
    'years_in_PB2', 'contact_person', 'contactp_relationship', 'contactp_num'
];

$detected_changes = [];
$needs_otp = false;
$otp_fields_labels = [];
$admin_approval_changes = [];

// Track identity modifications requiring admin reviews
foreach ($admin_approval_fields as $field) {
    $submitted_value = $data[$field] ?? '';
    $current_db_value = $current_user[$field] ?? '';
    if (trim((string)$submitted_value) !== trim((string)$current_db_value)) {
        $admin_approval_changes[] = [
            'column' => $field,
            'old' => (string)$current_db_value,
            'new' => (string)$submitted_value
        ];
    }
}

// Track address variables and electronic contact nodes
$all_updatable_fields = array_merge($otp_only_fields, $direct_update_fields);
foreach ($all_updatable_fields as $column_name) {
    $submitted_value = $data[$column_name] ?? '';
    $current_db_value = $current_user[$column_name] ?? '';
    if (trim((string)$submitted_value) !== trim((string)$current_db_value)) {
        $requires_otp = in_array($column_name, $otp_only_fields);
        if ($requires_otp) {
            $needs_otp = true;
            $otp_fields_labels[] = ($column_name === 'contact_num') ? 'Mobile Number' : 'Email Address';
        }
        $detected_changes[] = [
            'column' => $column_name,
            'old' => (string)$current_db_value,
            'new' => (string)$submitted_value,
            'requires_otp' => $requires_otp
        ];
    }
}

if (empty($detected_changes) && empty($admin_approval_changes)) {
    echo json_encode(['success' => false, 'message' => 'No modifications detected.']);
    exit;
}

$submission_batch = time() . '_' . $user_id;

// --- STEP 1: HANDOFF SECURE IDENTITY ALTERATIONS REQUIRING ADMIN APPROVAL ---
if (!empty($admin_approval_changes)) {
    $proof_document_path = null;
    if (isset($data['proof_document']) && !empty($data['proof_document'])) {
        $proof_data = $data['proof_document'];
        if (strpos($proof_data, 'base64,') !== false) {
            $proof_data = explode('base64,', $proof_data)[1];
        }
        $proof_binary = base64_decode($proof_data);
        $proof_filename = 'proof_' . $user_id . '_' . time() . '.' . ($data['proof_extension'] ?? 'jpg');
        $proof_path = __DIR__ . '/../uploads/proofs/' . $proof_filename;
        
        if (!file_exists(dirname($proof_path))) {
            mkdir(dirname($proof_path), 0777, true);
        }
        if (file_put_contents($proof_path, $proof_binary) !== false) {
            $proof_document_path = 'uploads/proofs/' . $proof_filename;
        }
    }

    $log_stmt = $conn->prepare("INSERT INTO pending_profile_changes (user_id, field_name, old_value, new_value, change_type, status, submission_batch, proof_document) VALUES (?, ?, ?, ?, 'other', 'pending_approval', ?, ?)");
    foreach ($admin_approval_changes as $change) {
        $column_name = $change['column'];
        $log_stmt->bind_param("isssss", $user_id, $column_name, $change['old'], $change['new'], $submission_batch, $proof_document_path);
        $log_stmt->execute();
    }
}

// --- STEP 2: SEGREGATE AND ROUTE SENSITIVE OTP VS DIRECT LIVE TRANSACTIONS ---
if (!empty($detected_changes)) {
    $otp_queue = [];
    $direct_queue = [];
    
    foreach ($detected_changes as $change) {
        if ($change['requires_otp']) {
            $otp_queue[] = $change;
        } else {
            $direct_queue[] = $change;
        }
    }

    // A. Apply any direct fields directly to the live table right now!
    if (!empty($direct_queue)) {
        $conn->begin_transaction();
        try {
            foreach ($direct_queue as $change) {
                $column_name = $change['column'];
                $new_value = $change['new']; 

                // Write live data change directly to residents registry
                $direct_update = $conn->prepare("UPDATE residents SET `$column_name` = ? WHERE user_id = ?");
                $direct_update->bind_param("si", $new_value, $user_id);
                $direct_update->execute();

                // Track historical entry row as immediately approved
                $history_stmt = $conn->prepare("INSERT INTO pending_profile_changes (user_id, field_name, old_value, new_value, change_type, status, submission_batch) VALUES (?, ?, ?, ?, 'other', 'approved', ?)");
                $history_stmt->bind_param("issss", $user_id, $column_name, $change['old'], $change['new'], $submission_batch);
                $history_stmt->execute();
            }
            $conn->commit();
        } catch (Exception $ex) {
            $conn->rollback();
            echo json_encode(['success' => false, 'message' => 'Direct update storage error: ' . $ex->getMessage()]);
            exit;
        }
    }

    // B. If sensitive fields changed, dispatch email and log them as pending_otp
    if (!empty($otp_queue) && $needs_otp) {
        // Purge old stalled verification code tokens for this clean session
        $clean_stmt = $conn->prepare("DELETE FROM pending_profile_changes WHERE user_id = ? AND status = 'pending_otp'");
        $clean_stmt->bind_param("i", $user_id);
        $clean_stmt->execute();

        $shared_otp_code = (string)rand(100000, 999999);
        $shared_otp_expire = date('Y-m-d H:i:s', strtotime('+15 minutes'));

        require_once __DIR__ . '/vendor/autoload.php';
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host = 'smtp.gmail.com';
            $mail->SMTPAuth = true;
            $mail->Username = SMTP_USER;
            $mail->Password = SMTP_PASS; // Replace with your secure Google App Password
            $mail->SMTPSecure = 'ssl';
            $mail->Port = 465;
            $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
            $mail->addAddress($current_user['email']);
            $mail->isHTML(true);
            $mail->Subject = 'PB2Link Secure Account Verification Token';
            
            $fields_sentence = implode(' and ', $otp_fields_labels);
            $mail->Body = "
                <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                    <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Security Update Verification</h2>
                    <p>You requested a modification to sensitive account variables (<strong>" . htmlspecialchars($fields_sentence) . "</strong>).</p>
                    <p>Your security verification validation OTP is:</p>
                    <div style='text-align: center; margin: 25px 0;'>
                        <b style='font-size: 28px; color: #059669; letter-spacing: 4px; background: #f0fdf4; padding: 10px 25px; border-radius: 8px; border: 1px dashed #059669; display: inline-block;'>$shared_otp_code</b>
                    </div>
                    <p style='color: #64748b; font-size: 14px;'>This security session will expire in 15 minutes.</p>
                </div>";
            $mail->send();

            // Store only the sensitive items in the verification hold table state
            $log_stmt = $conn->prepare("INSERT INTO pending_profile_changes (user_id, field_name, old_value, new_value, change_type, otp, otp_expire, status, submission_batch) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_otp', ?)");
            foreach ($otp_queue as $change) {
                $column_name = $change['column'];
                $change_type = ($column_name === 'email') ? 'email' : 'phone';
                $log_stmt->bind_param("isssssss", $user_id, $column_name, $change['old'], $change['new'], $change_type, $shared_otp_code, $shared_otp_expire, $submission_batch);
                $log_stmt->execute();
            }

        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => 'PHPMailer Execution Failure: ' . $mail->ErrorInfo]);
            exit;
        }
    }
}

// --- STEP 3: CONSTRUCT FLUID DYNAMIC INTERFACE RESPONSE PAYLOAD ---
$final_message = "Profile changes updated successfully!";
if ($needs_otp) {
    $final_message = "Please check your email inbox for your secure verification code.";
} elseif (!empty($admin_approval_changes)) {
    $final_message = "Identity changes logged. Document proof queued for administrative verification.";
}

echo json_encode([
    'success' => true,
    'requiresOtp' => $needs_otp,
    'hasAdminApproval' => !empty($admin_approval_changes),
    'message' => $final_message
]);
exit;
?>