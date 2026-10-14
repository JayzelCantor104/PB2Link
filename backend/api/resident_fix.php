<?php
// A resident fixing their registration online ("restricted mode", migration
// 027, rules in registration_fix_common.php). Used by Edit Profile.
//
//   GET                  what staff asked for, what has changed since, the
//                        proof types and the guardian documents on file
//   POST action=proof    multipart { proof_type, proof_file }  (item 'address')
//   POST action=guardian multipart { guardian_fname, guardian_lname,
//                        guardian_relationship, guardian_id, guardian_letter? }
//                        (item 'guardian')
//   POST action=resubmit JSON { confirm: true }  back to the staff review queue
//
// Only a restricted session (or an Active resident, who just gets mode 'none')
// can call it; nothing here changes the account status except resubmit, and
// that only from Action Required to Pending.
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
$user_id = pb2_resident_session_user(true);
if ($user_id === null) {
    http_response_code(401);
    echo json_encode(['success' => false, 'auth_error' => true, 'message' => 'Your session has ended. Please sign in again.']);
    exit;
}
require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/registration_fix_common.php';
require_once __DIR__ . '/residency_requirement.php';
require_once __DIR__ . '/audit_log.php';

$fail = function (string $msg, array $extra = []) {
    echo json_encode(['success' => false, 'message' => $msg] + $extra);
    exit;
};

$st = $conn->prepare("SELECT resident_id, user_id, control_num, fName, lName, status, admin_remarks, fix_items,
                             action_requested_at, resubmitted_at, resubmit_count, residing_since, id_address_match,
                             mobile_verified_at, review_reasons
                        FROM residents WHERE user_id = ?");
$st->bind_param('s', $user_id);
$st->execute();
$r = $st->get_result()->fetch_assoc();
$st->close();
if (!$r) $fail('Your resident record was not found.');

$rid = (int)$r['resident_id'];
$items = pb2_fix_items_decode($r['fix_items']);
$open = pb2_fix_mode_open($r);
$months = pb2_months_residing($r['residing_since']);
$proofKind = ($months !== null && $months < PB2_MIN_RESIDENCY_MONTHS) ? 'endorsement' : 'address';
$proofTypes = $proofKind === 'endorsement' ? PB2_RESIDENCY_PROOF_TYPES : PB2_ADDRESS_PROOF_TYPES;
$folder = 'uploads/Resident_submitted_valid_ID/' . (preg_replace('/[^A-Za-z0-9_-]/', '', (string)$r['control_num']) ?: ('RES_' . $rid)) . '/';

$state = function () use ($conn, $r, $rid, $items, $open, $proofKind, $proofTypes) {
    $g = pb2_guardian_latest($conn, $rid);
    $proof = pb2_latest_residency_proof($conn, $rid);
    $waitingCode = 0;
    $st = $conn->prepare("SELECT COUNT(*) FROM pending_profile_changes WHERE user_id = ? AND status = 'pending_otp'");
    $uid = (string)$r['user_id'];
    $st->bind_param('s', $uid);
    $st->execute();
    $waitingCode = (int)$st->get_result()->fetch_row()[0];
    $st->close();
    return [
        'mode'         => $open ? 'fix' : 'none',
        'status'       => $r['status'],
        'remarks'      => $r['admin_remarks'],
        'items'        => array_map(fn($k) => ['key' => $k, 'label' => PB2_FIX_ITEMS[$k][0], 'help' => PB2_FIX_ITEMS[$k][1]], $items),
        'asked_at'     => $r['action_requested_at'],
        'resubmit_count' => (int)$r['resubmit_count'],
        'max_resubmits'  => PB2_MAX_RESUBMITS,
        'changes'      => pb2_fix_changes_since($conn, $r),
        'codes_waiting'  => $waitingCode,
        'proof_kind'   => $proofKind,
        'proof_types'  => $proofTypes,
        'proof'        => $proof ? ['type' => $proof['proof_type'], 'status' => $proof['status'], 'submitted_at' => $proof['submitted_at']] : null,
        'guardian'     => $g ? [
            'name' => trim($g['guardian_fname'] . ' ' . $g['guardian_lname']), 'relationship' => $g['relationship'],
            'same_surname' => (int)$g['same_surname'], 'has_letter' => $g['letter_path'] !== null,
            'status' => $g['status'], 'submitted_at' => $g['submitted_at'],
        ] : null,
        'guardian_relationships' => PB2_GUARDIAN_RELATIONSHIPS,
        'last_name'    => $r['lName'],
    ];
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    session_write_close();
    echo json_encode(['success' => true] + $state());
    exit;
}

if (!$open) $fail('Your registration is not waiting for fixes. If staff asked you to visit the Barangay Hall, please go there.');
$action = $_GET['action'] ?? ($_POST['action'] ?? '');

// ------------------------------------------------------------ proof of address
if ($action === 'proof') {
    if (!in_array('address', $items, true)) $fail('Staff did not ask for a proof of address.');
    $type = (string)($_POST['proof_type'] ?? '');
    if (!in_array($type, $proofTypes, true)) $fail('Choose the type of document you are uploading.');
    if (empty($_FILES['proof_file']) || $_FILES['proof_file']['error'] === UPLOAD_ERR_NO_FILE) $fail('Choose the file to upload.');
    $path = pb2_store_residency_proof_file($_FILES['proof_file'], $folder, 'residency_proof_' . date('YmdHis'));
    if (!$path) $fail('The file could not be read. Upload a JPEG, PNG, WebP or PDF file up to 10 MB.');
    pb2_insert_residency_proof($conn, $rid, $type, $path, null, null);
    echo json_encode(['success' => true, 'message' => 'Your proof was uploaded. Staff will check it when you send your registration back.'] + $state());
    exit;
}

// ------------------------------------------------------------ guardian documents
if ($action === 'guardian') {
    if (!in_array('guardian', $items, true)) $fail('Staff did not ask for parent or guardian documents.');
    $res = pb2_store_guardian_docs($conn, $rid, (string)$r['lName'], $folder, $_POST,
        ['id' => $_FILES['guardian_id'] ?? null, 'letter' => $_FILES['guardian_letter'] ?? null]);
    if (!$res['ok']) $fail($res['message']);
    echo json_encode(['success' => true, 'message' => 'Guardian documents uploaded.'] + $state());
    exit;
}

// ------------------------------------------------------------ send back for review
if ($action === 'resubmit') {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    if (empty($in['confirm'])) $fail('Please confirm that you have made the changes.');
    $s = $state();
    if ($s['codes_waiting'] > 0) $fail('Some of your changes still need their verification code. Enter the code first (see the notice at the top of Edit Profile).');

    $changes = $s['changes'];
    $joined = implode(' ', $changes);
    $missing = [];
    if (in_array('id', $items, true) && strpos($joined, 'valid ID photos') === false) $missing[] = PB2_FIX_ITEMS['id'][0];
    if (in_array('address', $items, true) && strpos($joined, 'proof of address') === false && strpos($joined, 'address') === false) $missing[] = PB2_FIX_ITEMS['address'][0];
    if (in_array('guardian', $items, true) && strpos($joined, 'guardian') === false) $missing[] = PB2_FIX_ITEMS['guardian'][0];
    if ($missing) $fail('Please finish these first: ' . implode(', ', $missing) . '.');
    if (!$changes && $items !== ['confirm']) $fail("You haven't changed anything yet. Fix the items listed, then send your registration back.");

    $n = (int)$r['resubmit_count'] + 1;
    $when = date('M j, Y g:i A');
    $lead = ["Resubmitted by the resident on $when ($n of " . PB2_MAX_RESUBMITS . ')' . ($changes ? ': ' . implode('; ', $changes) . '.' : ', confirming the details are correct.')];
    if ($r['admin_remarks']) $lead[] = 'Staff had asked: ' . $r['admin_remarks'];
    $old = json_decode((string)$r['review_reasons'], true);
    $old = is_array($old) ? array_values(array_filter($old, fn($x) => is_string($x) && strpos($x, 'Resubmitted by the resident') !== 0 && strpos($x, 'Staff had asked:') !== 0)) : [];
    $reasons = json_encode(array_merge($lead, $old), JSON_UNESCAPED_UNICODE);

    $up = $conn->prepare("UPDATE residents SET status = 'Pending', resubmitted_at = NOW(), resubmit_count = ?, review_reasons = ?
                           WHERE resident_id = ? AND status = 'Action Required'");
    $up->bind_param('isi', $n, $reasons, $rid);
    $up->execute();
    if ($up->affected_rows !== 1) $fail('Your registration could not be sent. Please try again.');
    $up->close();

    pb2_log_admin_action('resident.resubmitted', 'resident', (string)$rid,
        "Resident sent {$r['control_num']} back for review ($n of " . PB2_MAX_RESUBMITS . ')',
        [['field' => 'status', 'old_value' => 'Action Required', 'new_value' => 'Pending']], 'success',
        ['admin_id' => null, 'username' => 'resident ' . $r['control_num'], 'role' => 'Admin']);

    // Restricted mode ends here; the account waits for staff.
    unset($_SESSION['fix_user_id'], $_SESSION['citizen_checked_at']);
    echo json_encode(['success' => true, 'message' => 'Your registration was sent back to barangay staff. You will be notified once it is reviewed.']);
    exit;
}

$fail('Invalid action.');
