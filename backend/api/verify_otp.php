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

$submitted_otp = isset($data['otp']) ? trim((string)$data['otp']) : '';
if (empty($submitted_otp)) {
    echo json_encode(['success' => false, 'message' => 'Missing token parameters.']);
    exit;
}

// Fetch matching verification codes
$stmt = $conn->prepare("
    SELECT change_id, field_name, new_value, otp_expire 
    FROM pending_profile_changes 
    WHERE user_id = ? AND otp = ? AND status = 'pending_otp'
");
$stmt->bind_param("is", $user_id, $submitted_otp);
$stmt->execute();
$result = $stmt->get_result();

$pending_changes = [];
while ($row = $result->fetch_assoc()) {
    $pending_changes[] = $row;
}

if (empty($pending_changes)) {
    echo json_encode(['success' => false, 'message' => 'Incorrect verification code. Please try again.']);
    exit;
}

// Timeout check
$current_time = date('Y-m-d H:i:s');
if ($current_time > $pending_changes[0]['otp_expire']) {
    echo json_encode(['success' => false, 'message' => 'The verification code has expired.']);
    exit;
}

$conn->begin_transaction();

try {
    $processed_change_ids = [];
    $resident_updates = [];
    $resident_types = "";
    $resident_values = [];

    foreach ($pending_changes as $change) {
        $field_name = $change['field_name'];
        $new_value = $change['new_value'];
        $processed_change_ids[] = $change['change_id'];

        if ($field_name === 'email') {
            $update_user = $conn->prepare("UPDATE users SET email = ? WHERE user_id = ?");
            $update_user->bind_param("si", $new_value, $user_id);
            if (!$update_user->execute()) {
                throw new Exception("Failed migrating email value to users record.");
            }
        } else {
            // Safely group all residents table fields together
            $resident_updates[] = "`$field_name` = ?";
            $resident_types .= "s";
            $resident_values[] = $new_value;
        }
    }

    // Execute standard resident column updates in one sweep
    if (!empty($resident_updates)) {
        $query_string = "UPDATE residents SET " . implode(', ', $resident_updates) . " WHERE user_id = ?";
        $resident_types .= "i";
        $resident_values[] = $user_id;

        $update_resident = $conn->prepare($query_string);
        $update_resident->bind_param($resident_types, ...$resident_values);
        
        if (!$update_resident->execute()) {
            throw new Exception("Failed migrating values to live resident data records.");
        }
    }

    // Mark track logs as fully approved/applied
    if (!empty($processed_change_ids)) {
        $placeholders = implode(',', array_fill(0, count($processed_change_ids), '?'));
        $types = str_repeat('i', count($processed_change_ids));
        
        $log_update = $conn->prepare("
            UPDATE pending_profile_changes 
            SET status = 'approved', otp = NULL, otp_expire = NULL 
            WHERE change_id IN ($placeholders)
        ");
        $log_update->bind_param($types, ...$processed_change_ids);
        if (!$log_update->execute()) {
            throw new Exception("Failed updating pending log status states.");
        }
    }

    $conn->commit();
    echo json_encode(['success' => true, 'message' => 'Profile details updated live successfully!']);

} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(['success' => false, 'message' => 'Database failure: ' . $e->getMessage()]);
}
exit;