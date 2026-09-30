<?php
/**
 * Shared rules for verifying a resident on a document request
 * (backend/migrations/010_residency_proof.sql).
 *
 *  1. ID on file — requests no longer ask for a new government-ID upload.
 *     The ID the resident submitted at registration (and an admin approved)
 *     is reused: pb2_resident_id_on_file() returns its paths, and the submit
 *     endpoints copy them into the request row's own ID columns, so each
 *     request keeps a record of the ID it was checked against even if the
 *     resident changes their ID later (request_id_change.php).
 *
 *  2. Under-6-months residency — a resident who has lived in Pasong Buaya II
 *     for less than PB2_MIN_RESIDENCY_MONTHS needs a residency proof on file
 *     (HOA Certification / Permit to Reside, or an accepted alternative).
 *     A Pending proof is enough to submit; staff can't release the document
 *     (Ready for Pick Up / Claimed) until the proof is Verified — see
 *     pb2_residency_release_block().
 *
 * Callers must already have $conn (db_connection.php).
 */

const PB2_MIN_RESIDENCY_MONTHS = 6;

const PB2_RESIDENCY_PROOF_TYPES = [
    'HOA Certification',
    'Lease Contract',
    'Landlord Certification',
    'Purok/Kagawad Certification',
];

// Request statuses that hand the document to the resident — blocked until the
// residency proof is Verified.
const PB2_RELEASE_STATUSES = ['Ready for Pick Up', 'Claimed', 'Approved'];

/** Whole months from $since to today (never negative). */
function pb2_months_residing(?string $since): ?int {
    if (!$since) return null;
    $from = DateTime::createFromFormat('Y-m-d', substr($since, 0, 10));
    if (!$from) return null;
    $today = new DateTime('today');
    if ($from > $today) return 0;
    $diff = $from->diff($today);
    return $diff->y * 12 + $diff->m;
}

/**
 * Parses a "YYYY-MM" (or "YYYY-MM-DD") move-in month into the stored
 * 1st-of-month DATE. Returns null if invalid, in the future, or before 1900.
 */
function pb2_parse_residing_since(?string $value): ?string {
    $value = trim((string)$value);
    if (!preg_match('/^(\d{4})-(\d{2})(?:-\d{2})?$/', $value, $m)) return null;
    $year = (int)$m[1];
    $month = (int)$m[2];
    if ($year < 1900 || $month < 1 || $month > 12) return null;
    $date = sprintf('%04d-%02d-01', $year, $month);
    if ($date > date('Y-m-01')) return null;
    return $date;
}

/** years_in_PB2 derived from residing_since, for the older screens/emails. */
function pb2_years_from_since(string $since): int {
    return intdiv((int)pb2_months_residing($since), 12);
}

/**
 * The resident's approved registration ID, or null if nothing usable is on
 * file. Paths are relative to backend/api (same root the request uploads use).
 */
function pb2_resident_id_on_file(mysqli $conn, int $resident_id): ?array {
    $stmt = $conn->prepare("SELECT valid_id, valid_id_img_front, valid_id_img_back, valid_id_img_holding,
                                   id_verification_status, user_id
                              FROM residents WHERE resident_id = ?");
    $stmt->bind_param("i", $resident_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row || empty($row['valid_id_img_front'])) return null;

    // An ID change waiting for admin approval doesn't replace this one yet.
    $pendingChange = false;
    $pc = $conn->prepare("SELECT 1 FROM pending_profile_changes WHERE user_id = ? AND field_name = 'valid_id_documents' AND status = 'pending_approval' LIMIT 1");
    if ($pc) {
        $uid = (string)$row['user_id'];
        $pc->bind_param("s", $uid);
        $pc->execute();
        $pendingChange = (bool)$pc->get_result()->fetch_row();
        $pc->close();
    }

    return [
        'type'                => $row['valid_id'],
        'front'               => $row['valid_id_img_front'],
        'back'                => $row['valid_id_img_back'],
        'holding'             => $row['valid_id_img_holding'],
        'verification_status' => $row['id_verification_status'] ?: 'Not Scanned',
        'change_pending'      => $pendingChange,
    ];
}

/** Latest residency proof row for a resident, or null. */
function pb2_latest_residency_proof(mysqli $conn, int $resident_id): ?array {
    $stmt = $conn->prepare("SELECT p.proof_id, p.proof_type, p.file_path, p.issued_by, p.issue_date, p.valid_until,
                                   p.status, p.remarks, p.submitted_at, p.reviewed_at, a.fullname AS reviewed_by_name
                              FROM resident_residency_proofs p
                              LEFT JOIN admins a ON a.admin_id = p.reviewed_by
                             WHERE p.resident_id = ?
                             ORDER BY p.proof_id DESC LIMIT 1");
    $stmt->bind_param("i", $resident_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

/**
 * Everything the request pages and admin views need about a resident's
 * residency: move-in month, months residing, and the proof in force.
 */
function pb2_residency_state(mysqli $conn, int $resident_id): array {
    $stmt = $conn->prepare("SELECT residing_since, years_in_PB2, residency_status FROM residents WHERE resident_id = ?");
    $stmt->bind_param("i", $resident_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc() ?: [];
    $stmt->close();

    $since  = $row['residing_since'] ?? null;
    $months = pb2_months_residing($since);
    $proof  = pb2_latest_residency_proof($conn, $resident_id);

    $inForce = $proof
        && in_array($proof['status'], ['Pending', 'Verified'], true)
        && (empty($proof['valid_until']) || $proof['valid_until'] >= date('Y-m-d'));

    return [
        'residing_since'   => $since,
        'months'           => $months,
        'minimum_months'   => PB2_MIN_RESIDENCY_MONTHS,
        'residency_status' => $row['residency_status'] ?? null,
        // null = move-in month unknown (older account with "0 years")
        'under_minimum'    => $months === null ? null : $months < PB2_MIN_RESIDENCY_MONTHS,
        'proof'            => $proof,
        'proof_in_force'   => (bool)$inForce,
        'proof_verified'   => $inForce && $proof['status'] === 'Verified',
        'proof_types'      => PB2_RESIDENCY_PROOF_TYPES,
    ];
}

/**
 * Called by a submit endpoint for a request covered by the 6-month rule.
 * Returns ['ok' => true, 'required' => bool] or
 *         ['ok' => false, 'code' => ..., 'message' => ...].
 */
function pb2_residency_gate(mysqli $conn, int $resident_id): array {
    $state = pb2_residency_state($conn, $resident_id);

    if ($state['under_minimum'] === null) {
        return ['ok' => false, 'code' => 'RESIDING_SINCE_REQUIRED',
                'message' => 'Please tell us the month you started living in Pasong Buaya II before submitting this request.'];
    }
    if (!$state['under_minimum']) {
        return ['ok' => true, 'required' => false];
    }
    if (!$state['proof_in_force']) {
        $rejected = $state['proof'] && $state['proof']['status'] === 'Rejected';
        return ['ok' => false, 'code' => 'HOA_PERMIT_REQUIRED',
                'message' => $rejected
                    ? 'Your residency proof was not accepted. Please upload a new HOA Certification or another accepted proof of residency.'
                    : 'You have lived in the barangay for less than ' . PB2_MIN_RESIDENCY_MONTHS . ' months. Please upload an HOA Certification (Permit to Reside) or another accepted proof of residency first.'];
    }
    return ['ok' => true, 'required' => true];
}

/**
 * For update_document_request.php: a message explaining why this request
 * can't be released yet, or null if it can.
 */
function pb2_residency_release_block(mysqli $conn, string $table, int $request_id, string $newStatus): ?string {
    if (!in_array($newStatus, PB2_RELEASE_STATUSES, true)) return null;

    $covered = ['req_barangay_clearance', 'req_certificate_residency', 'req_certificate_indigency',
                'req_barangay_id', 'req_business_clearance'];
    if (!in_array($table, $covered, true)) return null;

    $stmt = $conn->prepare("SELECT resident_id, residency_proof_required FROM `$table` WHERE request_id = ?");
    if (!$stmt) return null; // migration 010 not applied
    $stmt->bind_param("i", $request_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row || !(int)$row['residency_proof_required']) return null;

    $state = pb2_residency_state($conn, (int)$row['resident_id']);
    if ($state['proof_verified'] || $state['under_minimum'] === false) return null;

    return "This resident has lived in the barangay for less than " . PB2_MIN_RESIDENCY_MONTHS
         . " months. Verify their residency proof (HOA Certification or alternative) before releasing this document.";
}

/**
 * Validates and stores an uploaded residency proof (image or PDF, max 10MB),
 * judged by its real content type, not its filename. Returns the stored path
 * or null.
 */
function pb2_store_residency_proof_file(array $file, string $dir, string $basename): ?string {
    if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) return null;
    if ($file['size'] > 10 * 1024 * 1024) return null;

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo === false) return null;
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    $map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
    if (!isset($map[$mime])) return null;

    if (!is_dir($dir)) mkdir($dir, 0777, true);
    $dest = rtrim($dir, '/') . '/' . $basename . '.' . $map[$mime];
    return move_uploaded_file($file['tmp_name'], $dest) ? $dest : null;
}

/** Inserts a Pending proof row, superseding any earlier Pending one. */
function pb2_insert_residency_proof(mysqli $conn, int $resident_id, string $type, string $path, ?string $issuedBy, ?string $issueDate): int {
    $sup = $conn->prepare("UPDATE resident_residency_proofs SET status = 'Rejected', remarks = 'Replaced by a newer upload'
                            WHERE resident_id = ? AND status = 'Pending'");
    $sup->bind_param("i", $resident_id);
    $sup->execute();
    $sup->close();

    $stmt = $conn->prepare("INSERT INTO resident_residency_proofs (resident_id, proof_type, file_path, issued_by, issue_date)
                            VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param("issss", $resident_id, $type, $path, $issuedBy, $issueDate);
    $stmt->execute();
    $id = (int)$stmt->insert_id;
    $stmt->close();
    return $id;
}

/** Common JSON failure for a submit endpoint that hit a verification rule. */
function pb2_verification_fail(string $code, string $message): void {
    http_response_code(422);
    echo json_encode(['success' => false, 'code' => $code, 'message' => $message]);
    exit;
}

/**
 * The resident's ID on file, or ends the request with ID_REQUIRED.
 */
function pb2_require_id_on_file(mysqli $conn, int $resident_id): array {
    $id = pb2_resident_id_on_file($conn, $resident_id);
    if (!$id) {
        pb2_verification_fail('ID_REQUIRED', 'We could not find the valid ID from your registration. Please update your ID in your profile first.');
    }
    return $id;
}
