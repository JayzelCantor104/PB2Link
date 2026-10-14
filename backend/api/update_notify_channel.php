<?php
// Edit Profile: where the signed-in resident wants status updates
// (residents.notify_channel, migration 015). A preference, not identity
// data, so it saves directly. Document-request updates always go by both
// email and SMS regardless (notify.php).
//
// POST JSON { notify_channel: 'email' | 'sms' | 'both' }
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

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

require_once '../db_connection.php';
require_once __DIR__ . '/sms.php';

$respond = function (bool $success, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
};

if (!$conn) $respond(false, 'Database connection failed.');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') $respond(false, 'Invalid request method.');
// Also open to a resident fixing their registration (restricted mode, migration 027).
if (pb2_resident_session_user(true) === null) {
    http_response_code(401);
    $respond(false, 'Your session has expired. Please log in again.', ['auth_error' => true]);
}

$user_id = pb2_resident_session_user(true);
$data = json_decode(file_get_contents('php://input'), true) ?: [];
$choice = (string)($data['notify_channel'] ?? '');
if (!in_array($choice, ['email', 'sms', 'both'], true)) {
    $respond(false, 'Choose email, SMS, or both.');
}

$stmt = $conn->prepare("SELECT contact_num FROM residents WHERE user_id = ?");
$stmt->bind_param("s", $user_id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$row) $respond(false, 'Resident profile record not found.');

if ($choice !== 'email' && pb2_sms_normalize($row['contact_num'] ?? '') === null) {
    $respond(false, 'Add a valid mobile number to your profile first to receive updates by SMS.');
}

$upd = $conn->prepare("UPDATE residents SET notify_channel = ? WHERE user_id = ?");
$upd->bind_param("ss", $choice, $user_id);
if (!$upd->execute()) $respond(false, 'We could not save your preference. Please try again.');

$labels = ['email' => 'email', 'sms' => 'SMS', 'both' => 'email and SMS'];
$respond(true, 'Updates will now be sent by ' . $labels[$choice] . '.', ['notify_channel' => $choice]);
