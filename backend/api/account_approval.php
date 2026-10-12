<?php
/**
 * Automatic account approval (migration 017), used by register.php.
 *
 * A registration becomes Active at once when every server-side check passes.
 * Each check is judged here from data the server produced itself (Vision scan
 * records, the stored selfie check, the database) — never from a verdict the
 * browser sends. Otherwise it stays Pending for staff, and the reasons are
 * saved in residents.review_reasons for the Pending Users page.
 *
 * Auto-approve only when ALL hold:
 *   - email and SMS codes entered (register.php refuses to save otherwise)
 *   - ID: the uploaded ID front is the photo Vision scanned, and the first and
 *     last name are printed on it                      (pb2_id_scan_verify)
 *   - selfie check 'Verified'
 *   - PhilSys 'Matched' or 'Not Provided'
 *   - 18 or older
 *   - no other resident with the same name + birth date, or the same PhilSys no.
 *   - residency (migration 018): 6+ months in PB2 AND the scanned ID shows a
 *     Pasong Buaya II address. Under 6 months, or an ID without a PB2 address,
 *     needs an uploaded proof that staff check (pb2_registration_residency_rule)
 *   - the auto_approve_accounts setting is on
 *
 * Not reasons to hold an account (handled elsewhere):
 *   - sector claims (PWD, 4Ps, Solo Parent, Indigent): the account is approved
 *     but each claim goes to staff with its document (pb2_hold_registration_sectors)
 */

require_once __DIR__ . '/philsys_scan_common.php';

const PB2_ADULT_AGE = 18;

/** A system_settings value, or $default when unset / the table is missing. */
function pb2_setting_get(mysqli $conn, string $key, string $default): string
{
    try {
        $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
        $stmt->bind_param('s', $key);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_row();
        $stmt->close();
        return $row ? (string)$row[0] : $default;
    } catch (Throwable $e) {
        return $default;
    }
}

function pb2_setting_set(mysqli $conn, string $key, string $value, ?int $adminId): void
{
    $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
                            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)");
    $stmt->bind_param('ssi', $key, $value, $adminId);
    $stmt->execute();
    $stmt->close();
}

function pb2_auto_approval_enabled(mysqli $conn): bool
{
    return pb2_setting_get($conn, 'auto_approve_accounts', '1') === '1';
}

/**
 * Server-side ID check. 'Matched' = the uploaded ID front is the exact photo
 * Vision scanned (same SHA-256, token unused and under an hour old) and the
 * first and last name are printed on it. 'Mismatch' = scanned, but the name
 * isn't on it. 'Manual Entry' = no usable scan of this photo.
 * Returns ['status' => ..., 'reason' => text for staff,
 *          'address_match' => true/false (PB2 address printed on it), null = no scan].
 */
function pb2_id_scan_verify(mysqli $conn, ?string $token, string $frontImageBinary, string $fName, string $lName): array
{
    $scan = $token ? pb2_scan_load($conn, $token, $frontImageBinary) : null;
    if (!$scan) {
        return ['status' => 'Manual Entry', 'reason' => 'The ID photo was not scanned (or the scan expired), so the name on it could not be checked automatically.', 'address_match' => null];
    }
    require_once __DIR__ . '/residency_requirement.php';
    $address = pb2_text_has_pb2_address((string)$scan['raw']);
    $name = pb2_scan_name_matches($scan, $fName, null, $lName);
    if (!$name['match']) {
        return ['status' => 'Mismatch', 'reason' => 'The ' . implode(' and ', $name['missing']) . ' could not be found on the scanned ID.', 'address_match' => $address];
    }
    return ['status' => 'Matched', 'reason' => '', 'address_match' => $address];
}

/** Existing residents that look like the same person. Returns reasons for staff. */
function pb2_find_duplicate_residents(mysqli $conn, string $fName, string $lName, string $birthDate, ?string $philsys): array
{
    $reasons = [];
    $stmt = $conn->prepare("SELECT control_num, status FROM residents
                             WHERE UPPER(TRIM(fName)) = UPPER(TRIM(?)) AND UPPER(TRIM(lName)) = UPPER(TRIM(?)) AND birth_date = ?
                             LIMIT 3");
    $stmt->bind_param('sss', $fName, $lName, $birthDate);
    $stmt->execute();
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $r) {
        $reasons[] = "Possible duplicate: resident {$r['control_num']} ({$r['status']}) has the same name and birth date.";
    }
    $stmt->close();

    $digits = preg_replace('/\D/', '', (string)$philsys);
    if ($digits !== '') {
        $stmt = $conn->prepare("SELECT control_num, status FROM residents
                                 WHERE REPLACE(REPLACE(philsys_nat_id, '-', ''), ' ', '') = ? LIMIT 3");
        $stmt->bind_param('s', $digits);
        $stmt->execute();
        foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $r) {
            $reasons[] = "Possible duplicate: resident {$r['control_num']} ({$r['status']}) already has this PhilSys number.";
        }
        $stmt->close();
    }
    return $reasons;
}

/**
 * The decision. $checks: id_status, id_reason, selfie_status, selfie_notes,
 * philsys_status, age, duplicates (array of reasons), residency_reason ('' = ok).
 * Returns ['auto' => bool, 'reasons' => [...]].
 */
function pb2_approval_decision(mysqli $conn, array $checks): array
{
    $reasons = [];
    if ($checks['id_status'] !== 'Matched') {
        $reasons[] = 'ID: ' . ($checks['id_reason'] ?: 'could not be verified automatically.');
    }
    if ($checks['selfie_status'] === 'Needs Review') {
        $reasons[] = 'Verification selfie: ' . ($checks['selfie_notes'] ?: 'did not pass the automatic check.');
    } elseif ($checks['selfie_status'] !== 'Verified') {
        $reasons[] = 'Verification selfie could not be checked automatically.';
    }
    if ($checks['philsys_status'] === 'Mismatch') {
        $reasons[] = 'PhilSys: ' . ($checks['philsys_reason'] ?: 'the number or name does not match the card.');
    } elseif ($checks['philsys_status'] === 'Manual Entry') {
        $reasons[] = 'PhilSys: the number was typed in without a usable card scan.';
    }
    if ((int)$checks['age'] < PB2_ADULT_AGE) {
        $reasons[] = 'Applicant is under ' . PB2_ADULT_AGE . ' (age ' . (int)$checks['age'] . ').';
    }
    foreach ($checks['duplicates'] as $d) $reasons[] = $d;
    if (!empty($checks['residency_reason'])) $reasons[] = $checks['residency_reason'];

    $enabled = pb2_auto_approval_enabled($conn);
    if (!$enabled) {
        array_unshift($reasons, 'Automatic approval is turned off; every registration is reviewed by staff.');
    }
    return ['auto' => $enabled && !$reasons, 'reasons' => $reasons];
}

/**
 * For an auto-approved account: sector claims (PWD, 4Ps, Solo Parent,
 * Indigent) are not applied yet. Each claim and its document is queued in
 * pending_profile_changes, the same staff queue Edit Profile uses
 * (AdminProfileApprovals.jsx -> admin_process_profile.php), so it applies only
 * once a person has looked at the document. The document is moved to
 * backend/uploads/proofs/ where that queue reads proofs from.
 * $claims: ['is_pwd' => stored path (relative to backend/api/), ...] for the
 * sectors claimed. Returns the labels that were held.
 */
function pb2_hold_registration_sectors(mysqli $conn, $user_id, string $control_num, array $claims): array
{
    $labels = ['is_pwd' => 'PWD', 'is_4ps' => '4Ps', 'is_solo_parent' => 'Solo Parent', 'is_indigent' => 'Indigent'];
    $proofColumns = ['is_pwd' => 'proof_pwd', 'is_4ps' => 'proof_4ps', 'is_solo_parent' => 'proof_solo_parent', 'is_indigent' => 'proof_indigent'];
    $held = [];
    $proofDir = __DIR__ . '/../uploads/proofs/';
    if (!is_dir($proofDir)) mkdir($proofDir, 0755, true);
    $uid = (string)$user_id;
    $batch = time() . '_' . $uid;

    foreach ($claims as $flag => $path) {
        if (!isset($labels[$flag]) || !$path) continue;
        $src = __DIR__ . '/' . $path;
        $ext = strtolower(pathinfo($src, PATHINFO_EXTENSION));
        $name = 'reg_' . preg_replace('/[^A-Za-z0-9-]/', '', $control_num) . '_' . $proofColumns[$flag] . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        if (!is_file($src) || !@rename($src, $proofDir . $name)) continue;
        $proofRel = 'uploads/proofs/' . $name;

        $ins = $conn->prepare("INSERT INTO pending_profile_changes
                                 (user_id, field_name, old_value, new_value, change_type, status, submission_batch, proof_document)
                               VALUES (?, ?, '0', '1', 'other', 'pending_approval', ?, ?)");
        $ins->bind_param('ssss', $uid, $flag, $batch, $proofRel);
        $ins->execute();
        $ins->close();

        $col = $proofColumns[$flag];
        $upd = $conn->prepare("UPDATE residents SET `$flag` = 0, `$col` = NULL WHERE user_id = ?");
        $upd->bind_param('s', $uid);
        $upd->execute();
        $upd->close();
        $held[] = $labels[$flag];
    }
    return $held;
}
