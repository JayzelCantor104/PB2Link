<?php
// Session is started by auth_guard.php below (hardened cookie params).
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
pb2_require_admin();

include '../db_connection.php';

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

// Simple email notifier log wrapper (uncomment mail() for production)
function sendEmailNotification($userEmail, $changes) {
    $subject = "PB2Link Profile Modification Decision Summary";
    $message = "Dear Resident,\n\nOur administrative team has reviewed your profile modification update request. Review details:\n\n";
    
    foreach ($changes as $change) {
        $status = ucfirst($change['status']);
        $fieldName = str_replace('_', ' ', $change['field_name']);
        $message .= "• Field: " . strtoupper($fieldName) . "\n";
        $message .= "  Action Outcome: $status\n";
        $message .= "  Requested Value: {$change['new_value']}\n\n";
    }
    
    $message .= "If you have any questions or require further assistance, please contact the office.\n\nBest regards,\nBarangay Pasong Buaya II Administration";
    $headers = "From: noreply@pasongbuaya2.gov\r\nX-Mailer: PHP/" . phpversion();
    
    error_log("Dispatching update email notification to: $userEmail");
    // mail($userEmail, $subject, $message, $headers);
    return true;
}

// --- HANDLE TARGETED GET REQUEST FOR PROOF DOCUMENTS FIRST ---
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['get_proof'])) {
    $change_id = isset($_GET['change_id']) ? (int)$_GET['change_id'] : 0;
    
    $stmt = $conn->prepare("SELECT proof_document FROM pending_profile_changes WHERE change_id = ?");
    $stmt->bind_param("i", $change_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        if (!empty($row['proof_document'])) {
            $file_path = __DIR__ . '/../' . $row['proof_document'];
            if (file_exists($file_path)) {
                $file_type = mime_content_type($file_path);
                header('Content-Type: ' . $file_type);
                readfile($file_path);
                exit;
            }
        }
    }
    echo json_encode(["success" => false, "message" => "Target proof attachment could not be located."]);
    exit;
}

// --- HANDLE STANDARD GET REQUEST (FETCH ALL PENDING LOGS) ---
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $query = "SELECT p.*, r.fName, r.lName, u.email 
              FROM pending_profile_changes p 
              JOIN residents r ON p.user_id = r.user_id 
              JOIN users u ON p.user_id = u.user_id 
              WHERE p.status = 'pending_approval' 
              AND p.field_name IN ('fName', 'mName', 'lName', 'suffix', 'sector') 
              ORDER BY p.created_at ASC";
              
    $result = $conn->query($query);
    $requests = [];
    while ($row = $result->fetch_assoc()) {
        $requests[] = $row;
    }
    echo json_encode(["success" => true, "requests" => $requests]);
    exit;
}

// --- HANDLE POST CONFIGURATION (APPROVE / REJECT PIPELINE) ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw_input = file_get_contents("php://input");
    $data = json_decode($raw_input, true);
    
    $action = $data['action'] ?? '';
    $user_id = isset($data['user_id']) ? (int)$data['user_id'] : 0;
    
    if (($action !== 'approve' && $action !== 'reject') || !$user_id) {
        echo json_encode(["success" => false, "message" => "Invalid target tracking parameters parameters."]);
        exit;
    }

    // Extract target ID numbers from both single and batch frontend actions
    $target_change_ids = [];
    if (isset($data['batch_action']) && $data['batch_action'] === true) {
        $target_change_ids = array_map('intval', $data['change_ids'] ?? []);
    } else if (isset($data['change_id'])) {
        $target_change_ids[] = (int)$data['change_id'];
    }

    if (empty($target_change_ids)) {
        echo json_encode(["success" => false, "message" => "No specific change entry indices targeting execution parameters."]);
        exit;
    }

    // Explicit structural security column whitelist validation
    $allowed_fields = ['fName', 'mName', 'lName', 'suffix', 'sector'];
    
    $conn->begin_transaction();
    try {
        foreach ($target_change_ids as $change_id) {
            // Verify verification log records matches identity parameters
            $stmt = $conn->prepare("SELECT field_name, new_value FROM pending_profile_changes WHERE change_id = ? AND user_id = ? AND status = 'pending_approval'");
            $stmt->bind_param("ii", $change_id, $user_id);
            $stmt->execute();
            $request_entry = $stmt->get_result()->fetch_assoc();
            
            if (!$request_entry) {
                continue; // Skip if index modified or missing context tracking tags
            }
            
            $field_name = $request_entry['field_name'];
            $new_value = $request_entry['new_value'];
            
            if (!in_array($field_name, $allowed_fields)) {
                throw new Exception("Security Alert: Malicious structural modifier parameter attempted.");
            }

            // Fetch the current live value before it's overwritten, for the audit diff.
            $old_value_stmt = $conn->prepare("SELECT `$field_name` FROM residents WHERE user_id = ?");
            $old_value_stmt->bind_param("i", $user_id);
            $old_value_stmt->execute();
            $old_value_row = $old_value_stmt->get_result()->fetch_assoc();
            $old_value = $old_value_row[$field_name] ?? null;

            if ($action === 'approve') {
                // Apply update changes directly to the live residents profile table
                $update_string = "UPDATE residents SET `$field_name` = ? WHERE user_id = ?";
                $update_live = $conn->prepare($update_string);
                $update_live->bind_param("si", $new_value, $user_id);
                if (!$update_live->execute()) {
                    throw new Exception("Live table write execution malfunction.");
                }
                
                // Track update states as approved
                $update_log = $conn->prepare("UPDATE pending_profile_changes SET status = 'approved' WHERE change_id = ?");
            } else {
                // Deny changes and flag tracker log row as rejected
                $update_log = $conn->prepare("UPDATE pending_profile_changes SET status = 'rejected' WHERE change_id = ?");
            }
            
            $update_log->bind_param("i", $change_id);
            if (!$update_log->execute()) {
                throw new Exception("Tracking configuration status update mismatch error.");
            }

            $changedFields = [[
                'field' => $field_name,
                'old_value' => $old_value,
                'new_value' => $action === 'approve' ? $new_value : $old_value,
            ]];
            if ($action === 'reject') {
                $changedFields[0]['requested_value_rejected'] = $new_value;
            }
            pb2_log_admin_action(
                $action === 'approve' ? 'profile_change.approve' : 'profile_change.reject',
                'resident',
                (string)$user_id,
                ucfirst($action) . "d requested change to $field_name (change #$change_id)",
                $changedFields
            );
        }
        
        $conn->commit();
        
        // Post-Transaction Step: Handle notification emails cleanly if user pool update batch finishes
        $check_stmt = $conn->prepare("SELECT COUNT(*) as remaining FROM pending_profile_changes WHERE user_id = ? AND status = 'pending_approval'");
        $check_stmt->bind_param("i", $user_id);
        $check_stmt->execute();
        $remaining_tasks = $check_stmt->get_result()->fetch_assoc()['remaining'];
        
        if ($remaining_tasks == 0) {
            $log_fetch = $conn->prepare("SELECT field_name, new_value, status FROM pending_profile_changes WHERE user_id = ? ORDER BY created_at DESC LIMIT 5");
            $log_fetch->bind_param("i", $user_id);
            $log_fetch->execute();
            $recent_history = $log_fetch->get_result();
            
            $changes_summary = [];
            while ($row = $recent_history->fetch_assoc()) {
                $changes_summary[] = $row;
            }
            
            $user_fetch = $conn->prepare("SELECT email FROM users WHERE user_id = ?");
            $user_fetch->bind_param("i", $user_id);
            $user_fetch->execute();
            $user_meta = $user_fetch->get_result()->fetch_assoc();
            
            if ($user_meta && !empty($user_meta['email'])) {
                sendEmailNotification($user_meta['email'], $changes_summary);
            }
        }
        
        echo json_encode([
            "success" => true, 
            "message" => ($action === 'approve') ? "Changes successfully moved live to database registry!" : "Profile adjustments denied successfully."
        ]);
        exit;
        
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => "Administrative loop execution failure: " . $e->getMessage()]);
        exit;
    }
}
?>