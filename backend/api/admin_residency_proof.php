<?php
// Staff review of residency proofs for residents under 6 months
// (backend/migrations/010_residency_proof.sql).
//
// GET  ?resident_id=N
//   -> residency state (move-in month, months residing, proof in force)
//      plus the resident's full proof history.
// POST { proof_id, action: 'verify' | 'reject', remarks?, valid_until? }
//   -> verify or reject a Pending proof. Rejecting requires remarks, which
//      the resident sees on their request pages.
// POST { resident_id, action: 'set_residing_since', residing_since: 'YYYY-MM' }
//   -> staff correction of the move-in month (e.g. after checking the HOA).
ini_set('display_errors', 0);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
$admin = pb2_require_admin();
require_once __DIR__ . '/admin_permissions.php';
pb2_require_any_permission(['module.residents', 'module.documents']); // tab access
$admin_id = (int)$admin['admin_id'];

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/residency_requirement.php';

$respond = function (bool $success, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
};

$history = function (int $resident_id) use ($conn) {
    $stmt = $conn->prepare("SELECT p.proof_id, p.proof_type, p.file_path, p.issued_by, p.issue_date, p.valid_until,
                                   p.status, p.remarks, p.submitted_at, p.reviewed_at, a.fullname AS reviewed_by_name
                              FROM resident_residency_proofs p
                              LEFT JOIN admins a ON a.admin_id = p.reviewed_by
                             WHERE p.resident_id = ? ORDER BY p.proof_id DESC");
    $stmt->bind_param("i", $resident_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $resident_id = (int)($_GET['resident_id'] ?? 0);
    if (!$resident_id) $respond(false, 'resident_id is required.');
    $respond(true, 'OK', [
        'residency' => pb2_residency_state($conn, $resident_id),
        'history'   => $history($resident_id),
    ]);
}

$data   = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $data['action'] ?? '';

if ($action === 'set_residing_since') {
    $resident_id = (int)($data['resident_id'] ?? 0);
    $since = pb2_parse_residing_since($data['residing_since'] ?? '');
    if (!$resident_id || !$since) $respond(false, 'A resident and a valid month (not in the future) are required.');

    $old = $conn->prepare("SELECT residing_since FROM residents WHERE resident_id = ?");
    $old->bind_param("i", $resident_id);
    $old->execute();
    $oldRow = $old->get_result()->fetch_assoc();
    $old->close();
    if (!$oldRow) $respond(false, 'Resident not found.');

    $years = (string)pb2_years_from_since($since);
    $up = $conn->prepare("UPDATE residents SET residing_since = ?, years_in_PB2 = ? WHERE resident_id = ?");
    $up->bind_param("ssi", $since, $years, $resident_id);
    $up->execute();
    $up->close();

    pb2_log_admin_action('resident.residing_since.update', 'resident', (string)$resident_id,
        "Set resident move-in month to " . substr($since, 0, 7),
        [['field' => 'residing_since', 'old_value' => $oldRow['residing_since'], 'new_value' => $since]]);

    $respond(true, 'Move-in month updated.', [
        'residency' => pb2_residency_state($conn, $resident_id),
        'history'   => $history($resident_id),
    ]);
}

if (!in_array($action, ['verify', 'reject'], true)) {
    $respond(false, 'Invalid action.');
}

$proof_id = (int)($data['proof_id'] ?? 0);
// Staff remarks are a message to the resident: kept as typed.
$remarks  = trim((string)($data['remarks'] ?? '')) ?: null;
$validUntil = trim((string)($data['valid_until'] ?? ''));
if ($validUntil !== '') {
    $d = DateTime::createFromFormat('Y-m-d', $validUntil);
    if (!$d || $d->format('Y-m-d') !== $validUntil) $respond(false, 'Invalid "valid until" date.');
} else {
    $validUntil = null;
}
if ($action === 'reject' && !$remarks) {
    $respond(false, 'Please give the resident a reason for rejecting this proof.');
}

$stmt = $conn->prepare("SELECT resident_id, status, proof_type FROM resident_residency_proofs WHERE proof_id = ?");
$stmt->bind_param("i", $proof_id);
$stmt->execute();
$proof = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$proof) $respond(false, 'Residency proof not found.');
if ($proof['status'] !== 'Pending') $respond(false, 'This proof has already been reviewed.');

$newStatus = $action === 'verify' ? 'Verified' : 'Rejected';
$up = $conn->prepare("UPDATE resident_residency_proofs
                         SET status = ?, remarks = ?, valid_until = ?, reviewed_by = ?, reviewed_at = NOW()
                       WHERE proof_id = ? AND status = 'Pending'");
$up->bind_param("sssii", $newStatus, $remarks, $validUntil, $admin_id, $proof_id);
$up->execute();
$up->close();

$resident_id = (int)$proof['resident_id'];
pb2_log_admin_action('resident.residency_proof.' . $action, 'resident', (string)$resident_id,
    "$newStatus residency proof #$proof_id ({$proof['proof_type']})",
    [['field' => 'residency_proof_status', 'old_value' => 'Pending', 'new_value' => $newStatus]]);

// A rejection: tell the resident, or, when they can't sign in yet, tell staff
// what to do next.
$extra = [];
$message = "Residency proof $newStatus.";
if ($action === 'reject') {
    $rs = $conn->prepare("SELECT r.user_id, r.fName, r.status, r.fix_items FROM residents r WHERE r.resident_id = ?");
    $rs->bind_param("i", $resident_id);
    $rs->execute();
    $res = $rs->get_result()->fetch_assoc();
    $rs->close();
    $status = $res['status'] ?? '';
    $fixItems = json_decode((string)($res['fix_items'] ?? ''), true);
    $canFixOnline = $status === 'Action Required' && is_array($fixItems) && in_array('address', $fixItems, true);

    if ($res && ($status === 'Active' || $canFixOnline)) {
        // Active residents replace it in Edit Profile; an Action Required
        // account with the address item does it in its restricted session.
        require_once __DIR__ . '/notify.php';
        $esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
        $first = $res['fName'] ?: 'Resident';
        $type = $proof['proof_type'];
        $subject = 'Your proof of residence was not accepted';
        $body = "<p>Hi {$esc($first)},</p>"
              . "<p>Barangay staff checked the <strong>{$esc($type)}</strong> you sent as proof of residence in Pasong Buaya II and could not accept it.</p>"
              . "<p><strong>Reason:</strong> {$esc($remarks)}</p>"
              . "<p>Please sign in to PB2Link, open <strong>Edit Profile</strong> and upload a new proof. Requests that need it stay on hold until barangay staff verify the new one.</p>"
              . "<p>If you have questions, please visit or contact the Barangay Hall.</p>";
        $plain = "Hi $first,\n\nBarangay staff checked the $type you sent as proof of residence in Pasong Buaya II and could not accept it.\n\nReason: $remarks\n\n"
               . "Please sign in to PB2Link, open Edit Profile and upload a new proof. Requests that need it stay on hold until barangay staff verify the new one.";
        $sms = "PB2Link: Your $type was not accepted as proof of residence. Reason: $remarks. Please upload a new one in Edit Profile.";
        $sent = pb2_notify_resident($conn, $res['user_id'], $subject, pb2_mail_layout($subject, $body), $plain, $sms, 'account_update');
        $how = array_keys(array_filter(['SMS' => $sent['sms'], 'email' => $sent['email']]));
        $message .= $how
            ? ' The resident was told by ' . implode(' and ', $how) . ', with your reason.'
            : ' The resident could not be notified (no working email or mobile number); they will see the reason in Edit Profile.';
        $extra['notified'] = $how;
    } elseif ($res && ($status === 'Pending' || $status === 'Action Required')) {
        // A registration not approved yet: the resident can't sign in to send
        // a new proof until staff ask for it (Ask for action, proof of address).
        $message .= ' This account is not approved yet, so the resident cannot sign in to send a new proof. Use "Ask for action" with "Proof of address" ticked so they can.';
        $extra['ask_action'] = true;
    }
}

$respond(true, $message, $extra + [
    'residency' => pb2_residency_state($conn, $resident_id),
    'history'   => $history($resident_id),
]);
