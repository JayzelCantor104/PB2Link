<?php
// Fees and payment account settings (migration 020). Needs the
// 'payments.settings' permission (Super Admins, and positions/admins the
// Super Admin allows — admin_permissions.php). Every change is audit-logged.
//
//   GET                                     -> { fees: [...], settings: {...} }
//   POST JSON { action:'save', fees: [{fee_key, amount, waive_*}], settings: {channel,
//              account_name, account_number, instructions, allow_hall} }
//   POST multipart action=upload_qr, qr (image)   -> re-encoded to PNG, replaces the old QR
//   POST JSON { action:'remove_qr' }
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
pb2_require_admin();
include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/admin_permissions.php';
require_once __DIR__ . '/payment_common.php';
require_once __DIR__ . '/account_approval.php'; // pb2_setting_set
$admin = pb2_require_permission($conn, 'payments.settings');
$admin_id = (int)$admin['admin_id'];
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$respond = function (bool $ok, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $ok, 'message' => $message], $extra));
    exit;
};

$current = function () use ($conn) {
    $fees = [];
    foreach (PB2_FEE_TYPES as $key => $label) {
        $fees[] = ['label' => $label] + pb2_fee_get($conn, $key);
    }
    $res = $conn->query("SELECT service_id, title, is_active FROM services ORDER BY title");
    foreach ($res ? $res->fetch_all(MYSQLI_ASSOC) : [] as $s) {
        $fees[] = ['label' => $s['title'] . ($s['is_active'] ? '' : ' (inactive)'), 'is_service' => true]
                + pb2_fee_get($conn, 'service:' . (int)$s['service_id']);
    }
    foreach ($fees as &$f) {
        $f['amount'] = (float)$f['amount'];
        foreach (['waive_first_jobseeker', 'waive_indigent', 'waive_senior', 'waive_pwd'] as $w) $f[$w] = (bool)(int)$f[$w];
    }
    unset($f);
    return ['fees' => $fees, 'settings' => pb2_payment_settings($conn), 'exemptions' => PB2_EXEMPTIONS];
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') $respond(true, 'OK', $current());

$isMultipart = !empty($_POST) || !empty($_FILES);
$data = $isMultipart ? $_POST : (json_decode(file_get_contents('php://input'), true) ?: []);
$action = $data['action'] ?? '';

if ($action === 'upload_qr') {
    $file = $_FILES['qr'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024) $respond(false, 'Please choose a QR image up to 5 MB.');
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if (!in_array($mime, ['image/png', 'image/jpeg', 'image/webp'], true)) $respond(false, 'The QR must be a PNG, JPEG or WebP image.');
    // Re-encode: drops metadata and anything that isn't plain image data.
    $img = @imagecreatefromstring((string)file_get_contents($file['tmp_name']));
    if (!$img) $respond(false, 'That image could not be read.');
    $w = imagesx($img);
    $h = imagesy($img);
    if ($w < 150 || $h < 150) $respond(false, 'The QR image is too small to scan. Use one at least 150 x 150 pixels.');
    $dir = __DIR__ . '/../uploads/payment/';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $rel = 'payment/qr_' . bin2hex(random_bytes(6)) . '.png';
    if (!imagepng($img, __DIR__ . '/../uploads/' . $rel)) $respond(false, 'The QR could not be saved.');
    imagedestroy($img);

    $old = pb2_payment_setting($conn, 'payment_qr_path');
    pb2_setting_set($conn, 'payment_qr_path', $rel, $admin_id);
    if ($old && strpos($old, 'payment/qr_') === 0 && is_file(__DIR__ . '/../uploads/' . $old)) @unlink(__DIR__ . '/../uploads/' . $old);
    pb2_log_admin_action('payments.qr.update', 'setting', 'payment_qr_path', 'Replaced the payment QR code',
        [['field' => 'payment_qr_path', 'old_value' => $old, 'new_value' => $rel]]);
    $respond(true, 'Payment QR updated. Residents will see it on the payment step.', $current());
}

if ($action === 'remove_qr') {
    $old = pb2_payment_setting($conn, 'payment_qr_path');
    pb2_setting_set($conn, 'payment_qr_path', '', $admin_id);
    if ($old && strpos($old, 'payment/qr_') === 0 && is_file(__DIR__ . '/../uploads/' . $old)) @unlink(__DIR__ . '/../uploads/' . $old);
    pb2_log_admin_action('payments.qr.remove', 'setting', 'payment_qr_path', 'Removed the payment QR code (online payment off)');
    $respond(true, 'QR removed. Online payment is off until a new QR is uploaded.', $current());
}

if ($action === 'save') {
    $changes = [];
    // Account details
    $s = is_array($data['settings'] ?? null) ? $data['settings'] : [];
    $num = preg_replace('/[^0-9A-Za-z -]/', '', (string)($s['account_number'] ?? ''));
    $fields = [
        'payment_channel'        => mb_substr(trim((string)($s['channel'] ?? 'GCash')), 0, 40) ?: 'GCash',
        'payment_account_name'   => pb2_caps(mb_substr(trim((string)($s['account_name'] ?? '')), 0, 120)),
        'payment_account_number' => mb_substr(trim($num), 0, 40),
        'payment_instructions'   => pb2_caps(mb_substr(trim((string)($s['instructions'] ?? '')), 0, 500)),
        'payment_allow_hall'     => !empty($s['allow_hall']) ? '1' : '0',
    ];
    foreach ($fields as $key => $value) {
        $old = pb2_payment_setting($conn, $key);
        if ($old !== $value) {
            pb2_setting_set($conn, $key, $value, $admin_id);
            $changes[] = ['field' => $key, 'old_value' => $old, 'new_value' => $value];
        }
    }

    // Fees
    foreach (is_array($data['fees'] ?? null) ? $data['fees'] : [] as $f) {
        $key = (string)($f['fee_key'] ?? '');
        $valid = isset(PB2_FEE_TYPES[$key]);
        if (!$valid && preg_match('/^service:(\d+)$/', $key, $m)) {
            $q = $conn->prepare("SELECT 1 FROM services WHERE service_id = ?");
            $sid = (int)$m[1];
            $q->bind_param('i', $sid);
            $q->execute();
            $valid = (bool)$q->get_result()->fetch_row();
            $q->close();
        }
        if (!$valid) continue;
        $amount = filter_var($f['amount'] ?? 0, FILTER_VALIDATE_FLOAT);
        if ($amount === false || $amount < 0 || $amount > 100000) $respond(false, 'Fees must be between PHP 0 and PHP 100,000.');
        $amount = round($amount, 2);
        $w = [];
        foreach (['waive_first_jobseeker', 'waive_indigent', 'waive_senior', 'waive_pwd'] as $k) $w[$k] = !empty($f[$k]) ? 1 : 0;
        $before = pb2_fee_get($conn, $key);
        $stmt = $conn->prepare("INSERT INTO request_fees (fee_key, amount, waive_first_jobseeker, waive_indigent, waive_senior, waive_pwd, updated_by)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                                ON DUPLICATE KEY UPDATE amount = VALUES(amount), waive_first_jobseeker = VALUES(waive_first_jobseeker),
                                  waive_indigent = VALUES(waive_indigent), waive_senior = VALUES(waive_senior), waive_pwd = VALUES(waive_pwd),
                                  updated_by = VALUES(updated_by)");
        $stmt->bind_param('sdiiiii', $key, $amount, $w['waive_first_jobseeker'], $w['waive_indigent'], $w['waive_senior'], $w['waive_pwd'], $admin_id);
        $stmt->execute();
        $stmt->close();
        if ((float)$before['amount'] !== $amount) $changes[] = ['field' => "fee:$key", 'old_value' => $before['amount'], 'new_value' => number_format($amount, 2, '.', '')];
        foreach ($w as $k => $v) {
            if ((int)$before[$k] !== $v) $changes[] = ['field' => "fee:$key:$k", 'old_value' => (string)$before[$k], 'new_value' => (string)$v];
        }
    }

    if ($changes) {
        pb2_log_admin_action('payments.settings.update', 'setting', 'payments', 'Updated fees / payment settings (' . count($changes) . ' change(s))', $changes);
    }
    $respond(true, $changes ? 'Payment settings saved.' : 'Nothing changed.', $current());
}

$respond(false, 'Unknown action.');
