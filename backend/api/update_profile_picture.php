<?php
// Lets a signed-in resident upload or replace their own profile photo from
// Edit Profile. Profile photo rule: the selfie with ID (valid_id_img_holding)
// is the profile photo until the resident uploads their own; POST
// action=use_selfie goes back to it. Applied immediately (no admin approval) — it's a display
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

// Also open to a resident fixing their registration (restricted mode, migration 027).
if (pb2_resident_session_user(true) === null) {
    http_response_code(401);
    $respond(false, 'Your session has expired. Please log in again.', ['auth_error' => true]);
}
$user_id = pb2_resident_session_user(true);

include_once "../db_connection.php";
if (!$conn) {
    $respond(false, 'Database connection failed.');
}

// Only the resident's own uploaded photos (profile_picture*) are ever deleted,
// never the selfie with ID or the other ID photos.
$isOwnPhoto = fn($path, $dir) => $path && strpos($path, $dir) === 0 && strpos(basename($path), 'profile_picture') === 0 && is_file($path);

if (($_POST['action'] ?? '') === 'use_selfie') {
    $st = $conn->prepare("SELECT control_num, profile_picture, valid_id_img_holding FROM residents WHERE user_id = ?");
    $st->bind_param("s", $user_id);
    $st->execute();
    $r = $st->get_result()->fetch_assoc();
    $st->close();
    if (!$r || empty($r['valid_id_img_holding'])) $respond(false, 'There is no selfie with ID on file.');
    $up = $conn->prepare("UPDATE residents SET profile_picture = valid_id_img_holding WHERE user_id = ?");
    $up->bind_param("s", $user_id);
    if (!$up->execute()) $respond(false, 'Unable to update your photo. Please try again.');
    $up->close();
    $dir = "uploads/Resident_submitted_valid_ID/" . $r['control_num'] . "/";
    if ($isOwnPhoto($r['profile_picture'], $dir)) @unlink($r['profile_picture']);
    $respond(true, 'Your selfie with ID is your profile photo again.', ['profile_picture' => $r['valid_id_img_holding'], 'is_selfie' => true]);
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

// Remove the previous uploaded photo (never the selfie with ID it may have been).
$old = $resident['profile_picture'];
if ($old !== $destination && $isOwnPhoto($old, $dir)) {
    @unlink($old);
}

$respond(true, 'Your profile photo has been updated.', ['profile_picture' => $destination, 'is_selfie' => false]);
