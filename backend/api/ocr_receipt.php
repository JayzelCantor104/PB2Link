<?php
// Reads an e-wallet receipt screenshot (GCash, Maya...) so the payment form
// can fill in the reference number, amount and date instead of the resident
// retyping them (src/components/PaymentSection.jsx). It only fills the form:
// staff still match the reference number against the barangay's e-wallet
// history before recording an O.R. number (payment_common.php).
//
// POST multipart { receipt } -> { success, reference, amount, date, found: [..] }
//   code OCR_UNAVAILABLE  no Vision key, monthly cap reached, Vision error
//   code BAD_PHOTO        not a JPEG / PNG / WebP image, or over 8 MB
//   code RATE_LIMITED     more than 10 reads in 10 minutes for this resident
//
// Signed-in residents only. Counts against OCR_MONTHLY_CAP (one unit per read,
// shared with the ID scanner). The image is read from the upload's temporary
// file and never stored.
ob_start();
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

$respond = function (bool $success, array $extra = [], int $status = 200) {
    ob_end_clean();
    http_response_code($status);
    echo json_encode(['success' => $success] + $extra);
    exit;
};
$unavailable = fn($why = '') => $respond(false, ['code' => 'OCR_UNAVAILABLE',
    'message' => "We couldn't read the receipt right now. Please type the reference number from your receipt."]);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') $respond(false, ['message' => 'Invalid request method.'], 405);

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
if (empty($_SESSION['user_id'])) {
    $respond(false, ['auth_error' => true, 'message' => 'Please sign in again.'], 401);
}
$uid = (string)$_SESSION['user_id'];

require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/vision_common.php';
if (!$conn) $unavailable();

// 10 reads per 10 minutes per resident (ocr_scan_attempts, keyed by account).
const PB2_RECEIPT_OCR_LIMIT = 10;
$key = substr('receipt:' . $uid, 0, 45);
$st = mysqli_prepare($conn, "SELECT COUNT(*) FROM ocr_scan_attempts WHERE ip_address = ? AND created_at > (NOW() - INTERVAL 10 MINUTE)");
mysqli_stmt_bind_param($st, 's', $key);
mysqli_stmt_execute($st);
$used = (int)(mysqli_fetch_row(mysqli_stmt_get_result($st))[0] ?? 0);
mysqli_stmt_close($st);
if ($used >= PB2_RECEIPT_OCR_LIMIT) {
    $respond(false, ['code' => 'RATE_LIMITED', 'message' => 'You have read 10 receipts in the last 10 minutes. Please type the reference number.'], 429);
}

// The photo: a JPEG, PNG or WebP image up to 8 MB (a PDF receipt is typed in).
$file = $_FILES['receipt'] ?? null;
if (!$file || $file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
    $respond(false, ['code' => 'BAD_PHOTO', 'message' => 'Please attach a photo or screenshot of your receipt.']);
}
if ($file['size'] > 8 * 1024 * 1024) {
    $respond(false, ['code' => 'BAD_PHOTO', 'message' => 'The receipt image is over 8 MB. Please use a smaller screenshot.']);
}
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
    $respond(false, ['code' => 'BAD_PHOTO', 'message' => 'Only a JPEG, PNG or WebP screenshot can be read. Please type the reference number.']);
}

$log = mysqli_prepare($conn, "INSERT INTO ocr_scan_attempts (ip_address) VALUES (?)");
mysqli_stmt_bind_param($log, 's', $key);
mysqli_stmt_execute($log);
mysqli_stmt_close($log);

if (!defined('GOOGLE_VISION_API_KEY') || GOOGLE_VISION_API_KEY === '' || !tryReserveVisionQuota($conn, 1)) $unavailable();

// Vision: only the plain text (a few KB), which is all the reading below needs.
$payload = json_encode(['requests' => [[
    'image' => ['content' => base64_encode((string)file_get_contents($file['tmp_name']))],
    'features' => [['type' => 'TEXT_DETECTION']],
]]]);
$url = 'https://vision.googleapis.com/v1/images:annotate?key=' . urlencode(GOOGLE_VISION_API_KEY)
    . '&fields=' . rawurlencode('responses(error,fullTextAnnotation/text)');
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 45, CURLOPT_CONNECTTIMEOUT => 15,
]);
$raw = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$data = is_string($raw) ? json_decode($raw, true) : null;
if ($http !== 200 || !is_array($data) || isset($data['responses'][0]['error'])) {
    error_log('ocr_receipt.php Vision error: HTTP ' . $http);
    $unavailable();
}
$text = (string)($data['responses'][0]['fullTextAnnotation']['text'] ?? '');

require_once __DIR__ . '/receipt_read.php';
$read = pb2_receipt_read($text);
$found = array_keys(array_filter($read, fn($v) => $v !== null));
$respond(true, $read + ['found' => $found,
    'message' => $read['reference'] ? 'Read from your receipt.' : "We couldn't find the reference number on this receipt. Please type it."]);
