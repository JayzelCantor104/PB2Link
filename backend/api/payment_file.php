<?php
// Serves a payment receipt or First-Time Jobseeker oath (migration 020).
// These live in backend/private_uploads/, which refuses direct web access.
// Allowed: staff with 'payments.verify', or the resident who uploaded it.
//   GET ?payment_id=N&kind=receipt|exemption
ini_set('display_errors', 0);

require_once __DIR__ . '/auth_guard.php';
include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/payment_common.php';
require_once __DIR__ . '/admin_permissions.php';

$deny = function (int $code, string $msg) {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $msg;
    exit;
};

$payment_id = (int)($_GET['payment_id'] ?? 0);
$kind = ($_GET['kind'] ?? '') === 'exemption' ? 'exemption_proof' : 'receipt_path';

$stmt = $conn->prepare("SELECT p.receipt_path, p.exemption_proof, r.user_id FROM request_payments p
                          JOIN residents r ON r.resident_id = p.resident_id WHERE p.payment_id = ?");
$stmt->bind_param('i', $payment_id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$row) $deny(404, 'Not found.');

pb2_session_start();
$admin = pb2_current_admin();
$isOwner = !empty($_SESSION['user_id']) && (string)$_SESSION['user_id'] === (string)$row['user_id'];
$isStaff = $admin && pb2_admin_can($conn, $admin, 'payments.verify');
if (!$isOwner && !$isStaff) $deny(403, 'You are not allowed to view this file.');

$path = pb2_payment_private_path($row[$kind]);
if (!$path) $deny(404, 'File not found.');

$types = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'pdf' => 'application/pdf'];
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Content-Length: ' . filesize($path));
header('Content-Disposition: inline; filename="' . ($kind === 'receipt_path' ? 'receipt' : 'oath') . '.' . $ext . '"');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');
readfile($path);
