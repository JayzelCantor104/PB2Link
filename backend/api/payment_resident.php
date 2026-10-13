<?php
// Resident side of request payments (migration 020, rules in payment_common.php).
//
//   GET  ?action=info&request_type=clearance[&service_id=N][&request_mode=Self|Others]
//        -> fee, QR / account details, pay-at-hall, the exemptions this resident may claim
//   POST action=resubmit (multipart) payment_id, payment_method, + the payment fields
//        -> replace a Rejected receipt, or switch a pay-at-hall request to online
//           (or claim an exemption). Only on the resident's own payment.
ini_set('display_errors', 0);
header("Content-Type: application/json");
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Your session has expired. Please log in again.', 'auth_error' => true]);
    exit;
}

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/payment_common.php';
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$respond = function (bool $ok, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $ok, 'message' => $message], $extra));
    exit;
};

$uid = (string)$_SESSION['user_id'];
$stmt = $conn->prepare("SELECT resident_id FROM residents WHERE user_id = ?");
$stmt->bind_param('s', $uid);
$stmt->execute();
$resident_id = (int)($stmt->get_result()->fetch_row()[0] ?? 0);
$stmt->close();
if (!$resident_id) $respond(false, 'Resident profile not found.');

$action = $_GET['action'] ?? ($_POST['action'] ?? '');

if ($action === 'info') {
    $type = (string)($_GET['request_type'] ?? '');
    if ($type !== 'service' && !isset(PB2_FEE_TYPES[$type])) $respond(false, 'Unknown request type.');
    $mode = ($_GET['request_mode'] ?? 'Self') === 'Others' ? 'Others' : 'Self';
    $info = pb2_payment_info($conn, pb2_fee_key($type, (int)($_GET['service_id'] ?? 0)), $resident_id, $mode);
    $respond(true, 'OK', ['payment' => $info]);
}

if ($action === 'resubmit' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $payment_id = (int)($_POST['payment_id'] ?? 0);
    $stmt = $conn->prepare("SELECT * FROM request_payments WHERE payment_id = ? AND resident_id = ?");
    $stmt->bind_param('ii', $payment_id, $resident_id);
    $stmt->execute();
    $p = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$p) $respond(false, 'Payment not found.');
    if (!in_array($p['status'], ['Rejected', 'Unpaid'], true)) {
        $respond(false, 'This payment is ' . strtolower($p['status']) . ' and can no longer be changed here.');
    }
    $table = PB2_PAYMENT_TABLES[$p['request_type']] ?? null;
    $req = null;
    if ($table) {
        $q = $conn->prepare("SELECT status, request_mode FROM `$table` WHERE request_id = ?");
        $rid = (int)$p['request_id'];
        $q->bind_param('i', $rid);
        $q->execute();
        $req = $q->get_result()->fetch_assoc();
        $q->close();
    }
    if (!$req || in_array($req['status'], ['Declined', 'Rejected', 'Claimed'], true)) {
        $respond(false, 'This request is closed, so its payment can no longer be changed.');
    }

    try {
        $prep = pb2_payment_prepare($conn, $p['fee_key'], $resident_id, $req['request_mode'] ?? 'Self', $_POST, $_FILES, $payment_id);
    } catch (PaymentError $e) {
        $respond(false, $e->getMessage(), ['code' => 'PAYMENT_REQUIRED']);
    }
    if (!$prep) $respond(false, 'This request no longer has a fee.');
    // The amount stays what it was when the request was filed.
    $prep['amount_due'] = (float)$p['amount_due'];

    try {
        $receipt = $prep['receipt'] ? pb2_payment_store($prep['receipt'], $p['tracking_code'], 'receipt') : null;
        $proof = $prep['exemption_proof'] ? pb2_payment_store($prep['exemption_proof'], $p['tracking_code'], 'oath') : null;
    } catch (PaymentError $e) {
        $respond(false, $e->getMessage());
    }
    $sha = $prep['receipt']['sha'] ?? null;
    $flags = $prep['flags'] ? json_encode($prep['flags'], JSON_UNESCAPED_UNICODE) : null;
    try {
        $u = $conn->prepare("UPDATE request_payments SET method = ?, status = ?, reference_no = ?, amount_paid = ?, paid_on = ?,
                                    receipt_path = ?, receipt_sha256 = ?, exemption = ?, exemption_proof = ?, flags = ?, remarks = NULL
                              WHERE payment_id = ?");
        $u->bind_param('sssdssssssi', $prep['method'], $prep['status'], $prep['reference_no'], $prep['amount_paid'], $prep['paid_on'],
            $receipt, $sha, $prep['exemption'], $proof, $flags, $payment_id);
        $u->execute();
        $u->close();
    } catch (mysqli_sql_exception $e) {
        if ((int)$e->getCode() === 1062) $respond(false, 'This payment reference or receipt was already submitted for another request.');
        throw $e;
    }
    // The replaced receipt stays on file (it may be evidence of a bad payment);
    // the history records where it is and what it claimed.
    $previous = $p['receipt_path'] ? " (previous receipt kept: {$p['receipt_path']}, reference {$p['reference_no']})" : '';
    pb2_payment_event($conn, $payment_id, 'resubmitted', $p['status'], $prep['status'],
        ($prep['method'] === 'online' ? "New receipt, reference {$prep['reference_no']}"
        : ($prep['method'] === 'hall' ? 'Will pay at the barangay hall' : 'Exemption: ' . PB2_EXEMPTIONS[$prep['exemption']])) . $previous);

    $stmt = $conn->prepare("SELECT * FROM request_payments WHERE payment_id = ?");
    $stmt->bind_param('i', $payment_id);
    $stmt->execute();
    $fresh = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $respond(true, $prep['status'] === 'For Verification'
        ? 'Thank you. Your payment was sent to the barangay treasurer for checking.'
        : ($prep['status'] === 'Waived' ? 'Your fee was waived.' : 'Noted. Please pay at the barangay hall when you claim your document.'),
        ['payment' => pb2_payment_public($fresh)]);
}

$respond(false, 'Unknown action.');
