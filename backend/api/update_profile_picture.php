<?php
// Lets a signed-in resident upload or replace their own profile photo from
// Edit Profile. Applied immediately (no admin approval) — it's a display
// photo, not identity data; the ID photos admins verify against are untouched.
// Saved in the same per-resident folder register.php uses for the ID photos.
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

$file = $_FILES['profile_picture'] ?? null;
if (!$file || $file['error'] === UPLOAD_ERR_NO_FILE) {
    $respond(false, 'Please choose a photo to upload.');
}
if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 10 * 1024 * 1024) {
    $respond(false, 'The photo could not be uploaded. Please use an image of 10MB or less.');
}

// Validate by actual content, not the client-supplied name/type.
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
if ($finfo) finfo_close($finfo);
$extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
if (!$mime || !isset($extMap[$mime])) {
    $respond(false, 'Please upload a JPEG, PNG, or WebP image.');
}

$stmt = $conn->prepare("SELECT control_num, profile_picture FROM residents WHERE user_id = ?");
$stmt->bind_param("s", $user_id);
$stmt->execute();
$resident = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$resident || empty($resident['control_num'])) {
    $respond(false, 'Resident profile record not found.');
}

// Same folder as the ID photos (see register.php). The control number is
// generated server-side as PB2-YYYY-..., but guard the path anyway.
$control_num = $resident['control_num'];
if (!preg_match('/^[A-Za-z0-9-]+$/', $control_num)) {
    $respond(false, 'Resident record has an invalid control number.');
}
$dir = "uploads/Resident_submitted_valid_ID/" . $control_num . "/";
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    $respond(false, 'Unable to prepare the upload folder.');
}

// Timestamped name so browsers don't keep showing the old cached photo.
$destination = $dir . "profile_picture_" . time() . "." . $extMap[$mime];
if (!move_uploaded_file($file['tmp_name'], $destination)) {
    $respond(false, 'Unable to save the photo. Please try again.');
}

$update = $conn->prepare("UPDATE residents SET profile_picture = ? WHERE user_id = ?");
$update->bind_param("ss", $destination, $user_id);
if (!$update->execute()) {
    @unlink($destination);
    $respond(false, 'Unable to save the photo. Please try again.');
}
$update->close();

// Remove the previous photo, but only if it lives in this resident's folder.
$old = $resident['profile_picture'];
if ($old && $old !== $destination && strpos($old, $dir) === 0 && is_file($old)) {
    @unlink($old);
}

$respond(true, 'Your profile photo has been updated.', ['profile_picture' => $destination]);
