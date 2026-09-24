<?php
// Resident-side "change my valid ID" request (Edit Profile).
//
// POST multipart { valid_id, valid_id_img_front, valid_id_img_back, valid_id_img_holding }
//   -> saves the new photos next to the current ones and queues ONE
//      pending_profile_changes row (field_name = 'valid_id_documents',
//      old/new values as JSON). Nothing on the live residents row changes
//      until an admin approves it in AdminProfileApprovals.jsx
//      (admin_process_profile.php applies or discards it).
// POST { action: 'cancel' } (form field) -> withdraws the pending request.
ob_start();
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

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

const ID_CHANGE_FIELD = 'valid_id_documents';

$respond = function (bool $success, string $message, array $extra = []) {
    ob_end_clean();
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
};

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    $respond(false, 'Invalid request method.');
}
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    $respond(false, 'Your session has expired. Please log in again.', ['auth_error' => true]);
}
$user_id = $_SESSION['user_id'];

include_once "../db_connection.php";
if (!$conn) {
    $respond(false, 'Database connection failed.');
}

$findPending = function () use ($conn, $user_id) {
    $stmt = $conn->prepare("SELECT change_id, new_value FROM pending_profile_changes WHERE user_id = ? AND field_name = ? AND status = 'pending_approval' LIMIT 1");
    $field = ID_CHANGE_FIELD;
    $stmt->bind_param("ss", $user_id, $field);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
};

// Only delete files that belong to a pending request, inside this API's uploads folder.
$deleteRequestFiles = function (?string $json) {
    $data = json_decode((string)$json, true);
    if (!is_array($data)) return;
    foreach (['front', 'back', 'holding'] as $k) {
        $path = $data[$k] ?? '';
        if ($path && strpos($path, 'uploads/Resident_submitted_valid_ID/') === 0 && strpos($path, '..') === false && is_file($path)) {
            @unlink($path);
        }
    }
};

// --- Withdraw a pending request -------------------------------------------
if (($_POST['action'] ?? '') === 'cancel') {
    $pending = $findPending();
    if (!$pending) {
        $respond(false, 'There is no pending ID update request to cancel.');
    }
    $del = $conn->prepare("DELETE FROM pending_profile_changes WHERE change_id = ? AND user_id = ? AND status = 'pending_approval'");
    $del->bind_param("is", $pending['change_id'], $user_id);
    $del->execute();
    $deleteRequestFiles($pending['new_value']);
    $respond(true, 'Your ID update request was cancelled.');
}

// --- Submit a new request ----------------------------------------------------
if ($findPending()) {
    $respond(false, 'You already have an ID update waiting for admin approval. Cancel it first if you need to change it.');
}

$allowedIdTypes = ['National ID (PhilID/ePhilID)', 'Passport', 'Drivers License', 'UMID (SSS/GSIS)', 'PRC ID', 'Postal ID', 'Voters ID', 'PhilHealth ID', 'TIN ID'];
$idType = trim((string)($_POST['valid_id'] ?? ''));
if (!in_array($idType, $allowedIdTypes, true)) {
    $respond(false, 'Please select a valid government ID type.');
}

$labels = ['valid_id_img_front' => 'ID front photo', 'valid_id_img_back' => 'ID back photo', 'valid_id_img_holding' => 'selfie holding the ID'];
$extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
$exts = [];
foreach ($labels as $key => $label) {
    $file = $_FILES[$key] ?? null;
    if (!$file || $file['error'] === UPLOAD_ERR_NO_FILE) {
        $respond(false, "Please upload your $label.");
    }
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 10 * 1024 * 1024) {
        $respond(false, "Your $label could not be uploaded. Please use an image of 10MB or less.");
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
    if ($finfo) finfo_close($finfo);
    if (!$mime || !isset($extMap[$mime])) {
        $respond(false, "Your $label must be a JPEG, PNG, or WebP image.");
    }
    $exts[$key] = $extMap[$mime];
}

$stmt = $conn->prepare("SELECT control_num, valid_id, valid_id_img_front, valid_id_img_back, valid_id_img_holding FROM residents WHERE user_id = ?");
$stmt->bind_param("s", $user_id);
$stmt->execute();
$resident = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$resident || !preg_match('/^[A-Za-z0-9-]+$/', (string)$resident['control_num'])) {
    $respond(false, 'Resident profile record not found.');
}

// Same per-resident folder register.php uses; request files are prefixed so
// they can't collide with (or overwrite) the currently approved photos.
$dir = "uploads/Resident_submitted_valid_ID/" . $resident['control_num'] . "/";
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    $respond(false, 'Unable to prepare the upload folder.');
}

$stamp = time();
$names = ['valid_id_img_front' => 'front_ID', 'valid_id_img_back' => 'back_ID', 'valid_id_img_holding' => 'selfie_with_ID'];
$saved = [];
foreach ($names as $key => $base) {
    $dest = $dir . "request_{$stamp}_{$base}." . $exts[$key];
    if (!move_uploaded_file($_FILES[$key]['tmp_name'], $dest)) {
        foreach ($saved as $p) @unlink($p);
        $respond(false, 'Unable to save your photos. Please try again.');
    }
    $saved[$key] = $dest;
}

$oldValue = json_encode([
    'valid_id' => $resident['valid_id'],
    'front' => $resident['valid_id_img_front'],
    'back' => $resident['valid_id_img_back'],
    'holding' => $resident['valid_id_img_holding'],
]);
$newValue = json_encode([
    'valid_id' => $idType,
    'front' => $saved['valid_id_img_front'],
    'back' => $saved['valid_id_img_back'],
    'holding' => $saved['valid_id_img_holding'],
]);

$field = ID_CHANGE_FIELD;
$batch = $stamp . '_' . $user_id . '_id';
$ins = $conn->prepare("INSERT INTO pending_profile_changes (user_id, field_name, old_value, new_value, change_type, status, submission_batch) VALUES (?, ?, ?, ?, 'other', 'pending_approval', ?)");
$ins->bind_param("sssss", $user_id, $field, $oldValue, $newValue, $batch);
if (!$ins->execute()) {
    foreach ($saved as $p) @unlink($p);
    $respond(false, 'Unable to submit your request. Please try again.');
}

$respond(true, 'Your new ID was submitted for admin approval. Your current ID stays on file until it is approved.', [
    'request' => [
        'change_id' => $conn->insert_id,
        'field_name' => ID_CHANGE_FIELD,
        'new_value' => $newValue,
        'status' => 'pending_approval',
        'created_at' => date('Y-m-d H:i:s'),
    ],
]);
