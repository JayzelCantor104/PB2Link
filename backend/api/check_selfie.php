<?php
// Checks a "selfie holding ID" photo (migration 014, selfie_check_common.php).
//
// POST multipart { selfie_image, context: 'register' | 'profile', fName?, lName? }
//   -> { success: true, data: { check_token, status, code, message } }
//      status 'Verified' | 'Needs Review' is only a hint for the page; the
//      submit endpoint re-judges the stored result with the real name.
//   -> { success: false, code: 'OCR_UNAVAILABLE' | 'RATE_LIMITED' } when the
//      check can't run — the page then lets the resident continue unchecked.
//
// context 'profile' (Edit Profile ID change) takes the name from the signed-in
// resident's record; 'register' uses the name typed/scanned so far, if any.
ob_start();
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$respond = function (array $body, int $code = 200) {
    ob_end_clean();
    http_response_code($code);
    echo json_encode($body);
    exit;
};
$unavailable = function () use ($respond) {
    $respond(['success' => false, 'error' => 'Selfie checking is temporarily unavailable.', 'code' => 'OCR_UNAVAILABLE']);
};

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    $respond(['success' => false, 'error' => 'Method not allowed'], 405);
}

require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/vision_common.php';
require_once __DIR__ . '/selfie_check_common.php';
require_once __DIR__ . '/auth_guard.php';

// Same per-IP limiter as ocr_id.php (shared budget: ID scans + selfie checks).
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if ($conn) {
    $stmt = mysqli_prepare($conn, "SELECT COUNT(*) FROM ocr_scan_attempts WHERE ip_address = ? AND created_at > (NOW() - INTERVAL 10 MINUTE)");
    mysqli_stmt_bind_param($stmt, "s", $clientIp);
    mysqli_stmt_execute($stmt);
    $attempts = (int)(mysqli_fetch_row(mysqli_stmt_get_result($stmt))[0] ?? 0);
    mysqli_stmt_close($stmt);
    if ($attempts >= 8) {
        $respond(['success' => false, 'error' => 'Too many checks. Please wait a few minutes.', 'code' => 'RATE_LIMITED'], 429);
    }
    $log = mysqli_prepare($conn, "INSERT INTO ocr_scan_attempts (ip_address) VALUES (?)");
    mysqli_stmt_bind_param($log, "s", $clientIp);
    mysqli_stmt_execute($log);
    mysqli_stmt_close($log);
}

if (!$conn || !defined('GOOGLE_VISION_API_KEY') || GOOGLE_VISION_API_KEY === '' || !function_exists('curl_init') || !function_exists('imagecreatefromjpeg')) {
    $unavailable();
}

$file = $_FILES['selfie_image'] ?? null;
if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
    $respond(['success' => false, 'error' => 'No photo was received.'], 400);
}
if ($file['size'] > 10 * 1024 * 1024) {
    $respond(['success' => false, 'error' => 'The photo is too large (max 10MB).'], 400);
}
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
if ($finfo) finfo_close($finfo);
$loaders = ['image/jpeg' => 'imagecreatefromjpeg', 'image/png' => 'imagecreatefrompng', 'image/webp' => 'imagecreatefromwebp'];
if (!$mime || !isset($loaders[$mime]) || !function_exists($loaders[$mime])) {
    $respond(['success' => false, 'error' => 'Please use a JPEG, PNG, or WebP photo.'], 400);
}

// Whose name to look for on the ID.
$fName = '';
$lName = '';
if (($_POST['context'] ?? '') === 'profile') {
    pb2_session_start();
    if (!isset($_SESSION['user_id'])) {
        $respond(['success' => false, 'error' => 'Your session has expired. Please log in again.', 'auth_error' => true], 401);
    }
    $stmt = $conn->prepare("SELECT fName, lName FROM residents WHERE user_id = ?");
    $uid = (string)$_SESSION['user_id'];
    $stmt->bind_param("s", $uid);
    $stmt->execute();
    $who = $stmt->get_result()->fetch_assoc() ?: [];
    $stmt->close();
    $fName = (string)($who['fName'] ?? '');
    $lName = (string)($who['lName'] ?? '');
} else {
    $fName = substr(trim((string)($_POST['fName'] ?? '')), 0, 100);
    $lName = substr(trim((string)($_POST['lName'] ?? '')), 0, 100);
}

// Faces + text are two billed Vision features.
if (!tryReserveVisionQuota($conn, 2)) {
    $unavailable();
}

// Upright (EXIF), at most 1600px, JPEG — faces and an ID held at arm's length
// stay well detectable at that size.
$src = @call_user_func($loaders[$mime], $file['tmp_name']);
if (!$src) {
    $respond(['success' => false, 'error' => 'The photo could not be read.'], 400);
}
$orientation = detectExifOrientation($file['tmp_name'], $mime);
if ($orientation > 1 && function_exists('imagerotate') && function_exists('imageflip')) {
    $src = applyExifOrientation($src, $orientation);
}
$w = imagesx($src);
$h = imagesy($src);
$maxDim = 1600;
if (max($w, $h) > $maxDim) {
    $scale = $maxDim / max($w, $h);
    $resized = imagecreatetruecolor((int)round($w * $scale), (int)round($h * $scale));
    imagecopyresampled($resized, $src, 0, 0, 0, 0, imagesx($resized), imagesy($resized), $w, $h);
    imagedestroy($src);
    $src = $resized;
}
ob_start();
imagejpeg($src, null, 88);
$jpeg = ob_get_clean();
imagedestroy($src);

$payload = json_encode(['requests' => [[
    'image' => ['content' => base64_encode($jpeg)],
    'features' => [['type' => 'FACE_DETECTION', 'maxResults' => 10], ['type' => 'TEXT_DETECTION']],
]]]);
$ch = curl_init('https://vision.googleapis.com/v1/images:annotate?key=' . urlencode(GOOGLE_VISION_API_KEY));
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_CONNECTTIMEOUT => 10,
]);
$raw = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$data = $raw !== false ? json_decode($raw, true) : null;
$res = $data['responses'][0] ?? null;
if ($httpCode !== 200 || !is_array($res) || isset($res['error'])) {
    error_log('check_selfie.php: Vision error: ' . substr((string)$raw, 0, 300));
    $unavailable();
}

$faces = pb2_selfie_analyze_faces($res['faceAnnotations'] ?? []);
$row = [
    'face_count' => $faces['face_count'],
    'id_face' => $faces['id_face'] ? 1 : 0,
    'ocr_text' => (string)($res['textAnnotations'][0]['description'] ?? ''),
];

$token = bin2hex(random_bytes(16));
$hash = hash_file('sha256', $file['tmp_name']);
$now = date('Y-m-d H:i:s');
$save = $conn->prepare("INSERT INTO selfie_check_results (check_token, image_sha256, face_count, id_face, ocr_text, created_at) VALUES (?, ?, ?, ?, ?, ?)");
$save->bind_param("ssiiss", $token, $hash, $row['face_count'], $row['id_face'], $row['ocr_text'], $now);
if (!$save->execute()) $token = null;
$save->close();
// Holds personal data — keep no longer than a day.
mysqli_query($conn, "DELETE FROM selfie_check_results WHERE created_at < (NOW() - INTERVAL 1 DAY)");

$judged = pb2_selfie_judge($row, $fName, $lName);
$respond(['success' => true, 'data' => [
    'check_token' => $token,
    'status' => $judged['status'],
    'code' => $judged['code'],
    'message' => $judged['message'],
]]);
