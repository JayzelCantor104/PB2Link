<?php
// Staff side of request payments (migration 020, rules in payment_common.php).
// Reading the queue and acting on payments need the 'payments.verify'
// permission (admin_permissions.php); every change is audit-logged.
//
//   GET  ?action=me                         -> this admin's permissions (any admin)
//   GET  ?action=for_request&request_type=&request_id=   -> payment + history (any admin;
//        receipts themselves need 'payments.verify', see payment_file.php)
//   GET  ?action=queue[&status=For Verification|Unpaid|Rejected|Paid|Waived|Refunded|all]
//   GET  ?action=collections&from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv]   treasurer's report
//   POST { action:'verify',  payment_id, or_number }           -> Paid (online or at the hall)
//   POST { action:'reject',  payment_id, reason }              -> Rejected (resident re-uploads)
//   POST { action:'waive',   payment_id, reason }              -> Waived (e.g. confirms a First-Time Jobseeker oath)
//   POST { action:'refund',  payment_id, reason }              -> Refunded (paid, then the request was declined)
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
$admin = pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/payment_common.php';
require_once __DIR__ . '/admin_permissions.php';
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$action = $_GET['action'] ?? '';
$data = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $data['action'] ?? $action;
}

$respond = function (bool $ok, string $message, array $extra = []) {
    header('Content-Type: application/json');
    echo json_encode(array_merge(['success' => $ok, 'message' => $message], $extra));
    exit;
};

$events = function (int $payment_id) use ($conn) {
    $stmt = $conn->prepare("SELECT e.action, e.old_status, e.new_status, e.detail, e.created_at, a.fullname AS admin_name
                              FROM request_payment_events e LEFT JOIN admins a ON a.admin_id = e.admin_id
                             WHERE e.payment_id = ? ORDER BY e.created_at, e.event_id");
    $stmt->bind_param('i', $payment_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
};

$myPerms = pb2_admin_permissions($conn, (int)$admin['admin_id']);
$canVerify = in_array('payments.verify', $myPerms, true);

if ($action === 'me') {
    $respond(true, 'OK', ['permissions' => $myPerms, 'is_super' => $admin['role'] === 'Super']);
}

if ($action === 'for_request') {
    $type = (string)($_GET['request_type'] ?? '');
    $p = pb2_payment_for($conn, $type, (int)($_GET['request_id'] ?? 0));
    $verifiedBy = null;
    if ($p && $p['verified_by']) {
        $s = $conn->prepare("SELECT fullname FROM admins WHERE admin_id = ?");
        $vb = (int)$p['verified_by'];
        $s->bind_param('i', $vb);
        $s->execute();
        $verifiedBy = $s->get_result()->fetch_row()[0] ?? null;
        $s->close();
    }
    $out = $p ? pb2_payment_public($p, true) + ['verified_by_name' => $verifiedBy] : null;
    if ($out && !$canVerify) {
        // Without the permission, staff see the status but not the receipt itself.
        $out['receipt_url'] = null;
        $out['exemption_proof_url'] = null;
    }
    $respond(true, 'OK', ['payment' => $out, 'events' => $p ? $events((int)$p['payment_id']) : [], 'can_verify' => $canVerify]);
}

// Everything below handles money: the permission is required.
$admin = pb2_require_permission($conn, 'payments.verify');
$admin_id = (int)$admin['admin_id'];

if ($action === 'queue') {
    $status = (string)($_GET['status'] ?? 'For Verification');
    $valid = ['Unpaid', 'For Verification', 'Paid', 'Rejected', 'Waived', 'Refunded'];
    $sql = "SELECT p.*, r.fName, r.lName, r.control_num FROM request_payments p JOIN residents r ON r.resident_id = p.resident_id";
    if (in_array($status, $valid, true)) {
        $stmt = $conn->prepare("$sql WHERE p.status = ? ORDER BY p.created_at ASC LIMIT 500");
        $stmt->bind_param('s', $status);
    } else {
        $stmt = $conn->prepare("$sql ORDER BY p.created_at DESC LIMIT 500");
    }
    $stmt->execute();
    $rows = array_map(function ($r) {
        return pb2_payment_public($r, true) + ['resident_name' => trim($r['fName'] . ' ' . $r['lName']), 'control_num' => $r['control_num']];
    }, $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    $stmt->close();
    $counts = [];
    foreach ($conn->query("SELECT status, COUNT(*) n FROM request_payments GROUP BY status")->fetch_all(MYSQLI_ASSOC) as $c) {
        $counts[$c['status']] = (int)$c['n'];
    }
    $respond(true, 'OK', ['payments' => $rows, 'counts' => $counts]);
}

if ($action === 'collections') {
    $from = DateTime::createFromFormat('Y-m-d', (string)($_GET['from'] ?? '')) ?: new DateTime('today');
    $to = DateTime::createFromFormat('Y-m-d', (string)($_GET['to'] ?? '')) ?: new DateTime('today');
    $f = $from->format('Y-m-d') . ' 00:00:00';
    $t = $to->format('Y-m-d') . ' 23:59:59';
    $stmt = $conn->prepare("SELECT p.verified_at, p.or_number, p.tracking_code, p.request_type, p.fee_key, p.method,
                                   p.amount_due, p.amount_paid, p.reference_no, r.fName, r.lName, r.control_num, a.fullname AS verified_by
                              FROM request_payments p
                              JOIN residents r ON r.resident_id = p.resident_id
                              LEFT JOIN admins a ON a.admin_id = p.verified_by
                             WHERE p.status = 'Paid' AND p.verified_at BETWEEN ? AND ?
                             ORDER BY p.verified_at, p.or_number");
    $stmt->bind_param('ss', $f, $t);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $total = array_sum(array_map(function ($r) { return (float)$r['amount_due']; }, $rows));

    if (($_GET['format'] ?? '') === 'csv') {
        pb2_log_admin_action('payments.collections.export', 'payment', null,
            'Exported collections ' . $from->format('Y-m-d') . ' to ' . $to->format('Y-m-d') . ' (' . count($rows) . ' payments)');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="collections_' . $from->format('Ymd') . '_' . $to->format('Ymd') . '.csv"');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['Date Verified', 'O.R. No.', 'Tracking Code', 'Document', 'Payor', 'Control No.', 'Method', 'Amount (PHP)', 'E-wallet Reference', 'Verified By']);
        foreach ($rows as $r) {
            $doc = PB2_FEE_TYPES[$r['request_type']] ?? ($r['request_type'] === 'service' ? 'Custom service' : $r['request_type']);
            // A leading = + - @ would run as a formula in Excel (CSV injection).
            $cell = function ($v) { $v = (string)$v; return preg_match('/^[=+\-@]/', $v) ? "'" . $v : $v; };
            fputcsv($out, array_map($cell, [$r['verified_at'], $r['or_number'], $r['tracking_code'], $doc,
                trim($r['fName'] . ' ' . $r['lName']), $r['control_num'], $r['method'] === 'hall' ? 'Cash at hall' : 'Online',
                number_format((float)$r['amount_due'], 2, '.', ''), $r['reference_no'], $r['verified_by']]));
        }
        fputcsv($out, ['', '', '', '', '', '', 'TOTAL', number_format($total, 2, '.', ''), '', '']);
        fclose($out);
        exit;
    }
    $respond(true, 'OK', ['rows' => $rows, 'total' => $total, 'count' => count($rows)]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') $respond(false, 'Unknown action.');

$payment_id = (int)($data['payment_id'] ?? 0);
$stmt = $conn->prepare("SELECT * FROM request_payments WHERE payment_id = ?");
$stmt->bind_param('i', $payment_id);
$stmt->execute();
$p = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$p) $respond(false, 'Payment not found.');
$old = $p['status'];

// Which current statuses each action may start from.
$allowedFrom = [
    'verify' => ['For Verification', 'Unpaid', 'Rejected'],
    'reject' => ['For Verification'],
    'waive'  => ['For Verification', 'Unpaid', 'Rejected'],
    'refund' => ['Paid'],
];
if (!isset($allowedFrom[$action])) $respond(false, 'Unknown action.');
if (!in_array($old, $allowedFrom[$action], true)) $respond(false, "A payment that is $old can't be changed this way.");

$reason = trim((string)($data['reason'] ?? ''));
if ($action !== 'verify' && $reason === '') $respond(false, 'Please give a reason. The resident will see it.');
if (mb_strlen($reason) > 500) $respond(false, 'Please keep the reason under 500 characters.');
$reason = $reason !== '' ? pb2_caps($reason) : null;

if ($action === 'verify') {
    $or = strtoupper(preg_replace('/\s+/', '', (string)($data['or_number'] ?? '')));
    if (!preg_match('/^[A-Z0-9-]{3,40}$/', $or)) $respond(false, 'Enter the Official Receipt (O.R.) number issued for this payment.');
    $chk = $conn->prepare("SELECT tracking_code FROM request_payments WHERE or_number = ? AND payment_id <> ?");
    $chk->bind_param('si', $or, $payment_id);
    $chk->execute();
    $dupe = $chk->get_result()->fetch_row();
    $chk->close();
    if ($dupe) $respond(false, "O.R. No. $or is already recorded for request {$dupe[0]}. Each O.R. is used once.");
    // A pay-at-hall payment is paid in cash now; record the amount as the fee.
    $amountPaid = $p['method'] === 'hall' || $p['amount_paid'] === null ? (float)$p['amount_due'] : (float)$p['amount_paid'];
    $u = $conn->prepare("UPDATE request_payments SET status = 'Paid', or_number = ?, amount_paid = ?, verified_by = ?, verified_at = NOW(), remarks = NULL WHERE payment_id = ?");
    $u->bind_param('sdii', $or, $amountPaid, $admin_id, $payment_id);
    $u->execute();
    $u->close();
    $new = 'Paid';
    $detail = "O.R. No. $or";
} else {
    $new = ['reject' => 'Rejected', 'waive' => 'Waived', 'refund' => 'Refunded'][$action];
    $u = $conn->prepare("UPDATE request_payments SET status = ?, remarks = ?, verified_by = ?, verified_at = NOW() WHERE payment_id = ?");
    $u->bind_param('ssii', $new, $reason, $admin_id, $payment_id);
    $u->execute();
    $u->close();
    $detail = $reason;
    // RA 11261: the free First-Time Jobseeker document is used up once confirmed.
    if ($action === 'waive' && $p['exemption'] === 'first_time_jobseeker') {
        $f = $conn->prepare("UPDATE residents SET ftj_availed_at = NOW() WHERE resident_id = ? AND ftj_availed_at IS NULL");
        $rid = (int)$p['resident_id'];
        $f->bind_param('i', $rid);
        $f->execute();
        $f->close();
    }
}

pb2_payment_event($conn, $payment_id, $action, $old, $new, $detail, $admin_id);
pb2_log_admin_action('payment.' . $action, 'payment', (string)$payment_id,
    "Payment for {$p['tracking_code']}: $old -> $new" . ($detail ? " ($detail)" : ''),
    [['field' => 'status', 'old_value' => $old, 'new_value' => $new]]);

$stmt = $conn->prepare("SELECT * FROM request_payments WHERE payment_id = ?");
$stmt->bind_param('i', $payment_id);
$stmt->execute();
$fresh = $stmt->get_result()->fetch_assoc();
$stmt->close();
pb2_payment_notify($conn, $fresh, $new);

$respond(true, [
    'Paid'     => "Payment confirmed. O.R. No. {$fresh['or_number']} recorded.",
    'Rejected' => 'Payment rejected. The resident was told and can upload a new receipt.',
    'Waived'   => 'Fee waived.',
    'Refunded' => 'Refund recorded.',
][$new], ['payment' => pb2_payment_public($fresh, true), 'events' => $events($payment_id)]);
