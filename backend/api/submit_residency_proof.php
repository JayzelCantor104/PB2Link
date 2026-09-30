<?php
// Resident-side residency proof for residents living in Pasong Buaya II for
// less than 6 months (backend/migrations/010_residency_proof.sql).
//
// POST multipart
//   { action: 'set_residing_since', residing_since: 'YYYY-MM' }
//       -> records the move-in month, only if none is on file yet (older
//          accounts registered as "0 years"). Once set, only staff change it.
//   { proof_type, proof_file, issued_by?, issue_date?, residing_since? }
//       -> stores a new Pending proof (HOA Certification / Permit to Reside,
//          Lease Contract, Landlord Certification, Purok/Kagawad
//          Certification). An earlier Pending proof is superseded. Staff
//          verify it in the admin views (admin_residency_proof.php).
//
// Responds with the refreshed residency state.
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
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    $respond(false, 'Your session has expired. Please log in again.', ['auth_error' => true]);
}

include_once "../db_connection.php";
require_once __DIR__ . '/residency_requirement.php';
if (!$conn) {
    $respond(false, 'Database connection failed.');
}

$stmt = $conn->prepare("SELECT resident_id, control_num, residing_since FROM residents WHERE user_id = ?");
$uid = (string)$_SESSION['user_id'];
$stmt->bind_param("s", $uid);
$stmt->execute();
$resident = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$resident) {
    $respond(false, 'Resident profile not found.');
}
$resident_id = (int)$resident['resident_id'];

// Move-in month: only fillable while still unknown.
$sinceInput = trim($_POST['residing_since'] ?? '');
if ($sinceInput !== '' && empty($resident['residing_since'])) {
    $since = pb2_parse_residing_since($sinceInput);
    if (!$since) {
        $respond(false, 'Please enter a valid month (not in the future).');
    }
    $years = (string)pb2_years_from_since($since);
    $up = $conn->prepare("UPDATE residents SET residing_since = ?, years_in_PB2 = ? WHERE resident_id = ?");
    $up->bind_param("ssi", $since, $years, $resident_id);
    $up->execute();
    $up->close();
}

if (($_POST['action'] ?? '') === 'set_residing_since') {
    $respond(true, 'Move-in month saved.', ['residency' => pb2_residency_state($conn, $resident_id)]);
}

// Proof upload
$type = $_POST['proof_type'] ?? '';
if (!in_array($type, PB2_RESIDENCY_PROOF_TYPES, true)) {
    $respond(false, 'Please choose the type of residency proof.');
}
if (!isset($_FILES['proof_file']) || $_FILES['proof_file']['error'] === UPLOAD_ERR_NO_FILE) {
    $respond(false, 'Please attach your residency proof.');
}
$issuedBy  = trim($_POST['issued_by'] ?? '') ?: null;
$issueDate = trim($_POST['issue_date'] ?? '');
if ($issueDate !== '') {
    $d = DateTime::createFromFormat('Y-m-d', $issueDate);
    if (!$d || $d->format('Y-m-d') !== $issueDate || $issueDate > date('Y-m-d')) {
        $respond(false, 'Please enter a valid issue date (not in the future).');
    }
} else {
    $issueDate = null;
}

$state = pb2_residency_state($conn, $resident_id);
if ($state['proof_verified']) {
    $respond(false, 'Your residency proof is already verified.', ['residency' => $state]);
}

// Same per-resident folder as the registration ID photos.
$dir = "uploads/Resident_submitted_valid_ID/" . $resident['control_num'] . "/";
$path = pb2_store_residency_proof_file($_FILES['proof_file'], $dir, 'residency_proof_' . date('YmdHis'));
if (!$path) {
    $respond(false, 'The file could not be read. Please upload a JPEG, PNG, WebP, or PDF (max 10MB).');
}

pb2_insert_residency_proof($conn, $resident_id, $type, $path, $issuedBy, $issueDate);

$respond(true, 'Residency proof uploaded. Barangay staff will verify it before your document is released.', [
    'residency' => pb2_residency_state($conn, $resident_id),
]);
