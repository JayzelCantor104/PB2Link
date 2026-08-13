<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';

// Parse POST input natively
$postData = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST)) {
    $postData = $_POST;
} else {
    $postData = json_decode(file_get_contents("php://input"), true);
}

if (!$postData || !isset($postData['resident_id']) || !isset($postData['status'])) {
    echo json_encode(["success" => false, "message" => "Invalid input data"]);
    exit;
}

$resident_id = intval($postData['resident_id']);
$status = $conn->real_escape_string($postData['status']);
if ($status === 'Archive Resident') $status = 'Archived';

$remarks = ($status === 'Action Required' && isset($postData['admin_remarks'])) 
           ? $conn->real_escape_string($postData['admin_remarks']) : null;

$editable = isset($postData['editableData']) && is_array($postData['editableData']) ? $postData['editableData'] : [];

// --- DYNAMIC FOLDER ARCHITECTURE ---
// Prioritize DB fallback to ensure the folder is always structurally consistent
$control_num = $editable['control_num'] ?? '';

if (empty($control_num)) {
    $stmt_cn = $conn->prepare("SELECT control_num FROM residents WHERE resident_id = ?");
    $stmt_cn->bind_param("i", $resident_id);
    $stmt_cn->execute();
    $res_cn = $stmt_cn->get_result();
    if ($row = $res_cn->fetch_assoc()) {
        $control_num = $row['control_num'];
    }
    $stmt_cn->close();
}

// Clean string for folder directory usage. Fallback to Resident ID if entirely blank.
$safe_control_num = preg_replace('/[^a-zA-Z0-9_-]/', '', $control_num);
if (empty($safe_control_num)) $safe_control_num = 'RES_' . $resident_id;

$relative_dir = 'uploads/Resident_submitted_valid_ID/' . $safe_control_num . '/';
$upload_dir = __DIR__ . '/' . $relative_dir;

if (!is_dir($upload_dir)) {
    mkdir($upload_dir, 0777, true);
}

// --- FILE UPLOADING ---
$files_to_check = [
    'valid_id_img_front', 'valid_id_img_back', 'valid_id_img_holding',
    'proof_pwd', 'proof_4ps', 'proof_solo_parent', 'proof_indigent', 'proof_senior'
];

$uploaded_paths = [];

foreach ($files_to_check as $fileKey) {
    if (isset($_FILES[$fileKey]) && $_FILES[$fileKey]['error'] === UPLOAD_ERR_OK) {
        $ext = strtolower(pathinfo($_FILES[$fileKey]['name'], PATHINFO_EXTENSION));
        // Strict Naming Requirement: named according to requested image
        $filename = $fileKey . '.' . $ext; 
        
        if (move_uploaded_file($_FILES[$fileKey]['tmp_name'], $upload_dir . $filename)) {
            $uploaded_paths[$fileKey] = $relative_dir . $filename; // Saves path mapping natively to backend structure
        }
    } else {
        $uploaded_paths[$fileKey] = null;
    }
}

// --- DYNAMIC SQL CONSTRUCTION ---
// Only update fields explicitly provided inside `editableData` payload array. Prevents overwriting with empty NULLs.
$allowed_fields = [
    'control_num', 'fName', 'mName', 'lName', 'suffix', 'gender', 'birth_date', 
    'height', 'blood_type', 'religion', 'civil_status', 'spouse_name_text', 
    'contact_num', 'birth_city', 'birth_province', 'birth_country', 'date_registered', 
    'house_no', 'street', 'subdivision', 'zone', 'block_lot', 'area', 'landmark', 
    'residency_status', 'years_in_PB2', 'sector', 'is_senior', 'is_pwd', 
    'is_solo_parent', 'is_indigent', 'is_4ps', 'contact_person', 'contactp_relationship', 
    'contactp_num', 'philsys_nat_id', 'valid_id'
];

$update_parts = ["status = ?", "admin_remarks = ?"];
$params = [$status, $remarks];
$types = "ss";

foreach ($allowed_fields as $field) {
    if (array_key_exists($field, $editable)) {
        $update_parts[] = "$field = ?";
        $val = $editable[$field];
        
        if (in_array($field, ['is_senior', 'is_pwd', 'is_solo_parent', 'is_indigent', 'is_4ps'])) {
            $params[] = intval($val);
            $types .= "i";
        } else {
            $params[] = $val;
            $types .= "s";
        }
    }
}

foreach ($files_to_check as $fileKey) {
    if ($uploaded_paths[$fileKey] !== null) {
        $update_parts[] = "$fileKey = ?";
        $params[] = $uploaded_paths[$fileKey];
        $types .= "s";
    }
}

$params[] = $resident_id;
$types .= "i";

// Fetch pre-update values for the audit diff, limited to fields this write
// actually touches (status/remarks always; editable fields only if present).
$fields_to_fetch = array_unique(array_merge(['status', 'admin_remarks'], array_intersect($allowed_fields, array_keys($editable))));
$fetch_sql = "SELECT " . implode(', ', $fields_to_fetch) . " FROM residents WHERE resident_id = ?";
$fetch_stmt = $conn->prepare($fetch_sql);
$oldValues = [];
if ($fetch_stmt) {
    $fetch_stmt->bind_param("i", $resident_id);
    $fetch_stmt->execute();
    $oldValues = $fetch_stmt->get_result()->fetch_assoc() ?: [];
    $fetch_stmt->close();
}

$sql = "UPDATE residents SET " . implode(", ", $update_parts) . " WHERE resident_id = ?";
$stmt = $conn->prepare($sql);

if ($stmt) {
    $stmt->bind_param($types, ...$params);

    if ($stmt->execute()) {
        // Handle User Table Email Updates
        if (isset($editable['email']) && isset($editable['user_id'])) {
            $user_email = $conn->real_escape_string($editable['email']);
            $user_id = $conn->real_escape_string($editable['user_id']);
            $userUpdate = $conn->prepare("UPDATE users SET email = ? WHERE user_id = ?");
            if ($userUpdate) {
                $userUpdate->bind_param("ss", $user_email, $user_id);
                $userUpdate->execute();
                $userUpdate->close();
            }
        }

        $changedFields = [];
        $newValuesForLog = array_merge(
            ['status' => $status, 'admin_remarks' => $remarks],
            array_intersect_key($editable, array_flip($allowed_fields))
        );
        foreach ($newValuesForLog as $field => $newValue) {
            $oldValue = $oldValues[$field] ?? null;
            if ((string)$oldValue !== (string)$newValue) {
                $changedFields[] = ['field' => $field, 'old_value' => $oldValue, 'new_value' => $newValue];
            }
        }
        foreach ($files_to_check as $fileKey) {
            if ($uploaded_paths[$fileKey] !== null) {
                $changedFields[] = ['field' => $fileKey, 'old_value' => null, 'new_value' => 'file_uploaded'];
            }
        }

        $hasProfileEdits = count(array_intersect($allowed_fields, array_keys($editable))) > 0;
        pb2_log_admin_action(
            $hasProfileEdits ? 'resident.profile.update' : 'resident.status.update',
            'resident',
            (string)$resident_id,
            "Updated resident #$resident_id (status: $status)",
            $changedFields
        );

        echo json_encode(["success" => true, "message" => "Status and profile seamlessly updated.", "dir" => $relative_dir]);
    } else {
        echo json_encode(["success" => false, "message" => "Database execution failed: " . $stmt->error]);
    }
    $stmt->close();
} else {
    echo json_encode(["success" => false, "message" => "Database preparation failed: " . $conn->error]);
}

$conn->close();
?>