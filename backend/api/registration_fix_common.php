<?php
/**
 * Fixing a registration online (migration 027).
 *
 * Staff put an account in "Action Required" either with a list of items the
 * resident may fix online (residents.fix_items) or with none (visit the hall).
 * With items, login.php gives a restricted session ($_SESSION['fix_user_id'],
 * never 'user_id', so no request endpoint accepts it) that only opens Edit
 * Profile (pb2_resident_session_user(true)) and resident_fix.php. Sending the
 * registration back puts it in the staff review queue again (Pending).
 *
 * Mirrored for display in src/lib/registrationFix.js.
 */

require_once __DIR__ . '/text_case.php';

/** key => [label for staff and residents, what the resident does]. */
const PB2_FIX_ITEMS = [
    'id'       => ['Valid ID photos and selfie', 'Upload new, clear photos of your valid ID (front and back) and a selfie holding it.'],
    'details'  => ['Name, birth date or sex', 'Correct your name, birth date or sex so they match your ID exactly.'],
    'philsys'  => ['PhilSys number and card photos', 'Re-enter your PhilSys number and upload clear photos of the card.'],
    'address'  => ['Proof of address', 'Upload a document with your name and your Pasong Buaya II address.'],
    'sectors'  => ['Sector documents', 'Upload the document for your PWD, 4Ps, Solo Parent or Indigent claim, or remove the claim.'],
    'mobile'   => ['Mobile number', 'Enter your mobile number and confirm it with the code we text you.'],
    'guardian' => ['Parent or guardian documents', 'Upload your parent\'s or guardian\'s ID (with signature); if their surname differs from yours, also a letter they signed.'],
    'confirm'  => ['Confirm your details', 'Check that everything on your profile is correct and that this is your only account, then send it back.'],
];

const PB2_MAX_RESUBMITS = 3;
const PB2_GUARDIAN_RELATIONSHIPS = ['Mother', 'Father', 'Legal Guardian', 'Grandparent', 'Sibling', 'Aunt/Uncle', 'Other Relative'];

/** The stored list, keeping only known keys. */
function pb2_fix_items_decode($raw): array
{
    $list = json_decode((string)$raw, true);
    if (!is_array($list)) return [];
    return array_values(array_unique(array_filter($list, fn($k) => is_string($k) && isset(PB2_FIX_ITEMS[$k]))));
}

/** Can this account use restricted mode right now? */
function pb2_fix_mode_open(?array $resident): bool
{
    return $resident
        && ($resident['status'] ?? '') === 'Action Required'
        && pb2_fix_items_decode($resident['fix_items'] ?? null)
        && (int)($resident['resubmit_count'] ?? 0) < PB2_MAX_RESUBMITS;
}

/** Same surname, ignoring case, accents, spaces and punctuation. */
function pb2_same_surname(string $a, string $b): bool
{
    $norm = function (string $s): string {
        $s = mb_strtoupper(trim($s), 'UTF-8');
        $s = strtr($s, ['Ñ' => 'N', 'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U']);
        return preg_replace('/[^A-Z]/', '', $s);
    };
    return $norm($a) !== '' && $norm($a) === $norm($b);
}

/**
 * Validates and stores a minor's guardian documents and inserts a Pending row
 * (an earlier Pending one is superseded). $files: ['id' => $_FILES[..], 'letter' => $_FILES[..]|null].
 * Returns ['ok' => bool, 'message' => string, 'id' => int].
 */
function pb2_store_guardian_docs(mysqli $conn, int $residentId, string $applicantLname, string $dir, array $in, array $files): array
{
    $fname = pb2_caps(trim((string)($in['guardian_fname'] ?? '')));
    $lname = pb2_caps(trim((string)($in['guardian_lname'] ?? '')));
    $rel = (string)($in['guardian_relationship'] ?? '');
    if ($fname === '' || $lname === '') return ['ok' => false, 'message' => "Enter your parent's or guardian's first and last name."];
    if (mb_strlen($fname) > 100 || mb_strlen($lname) > 100) return ['ok' => false, 'message' => "The guardian's name is too long."];
    if (!in_array($rel, PB2_GUARDIAN_RELATIONSHIPS, true)) return ['ok' => false, 'message' => 'Choose how the guardian is related to you.'];
    $same = pb2_same_surname($lname, $applicantLname);

    $save = function ($file, string $base) use ($dir) {
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || $file['size'] > 10 * 1024 * 1024) return null;
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : '';
        if ($finfo) finfo_close($finfo);
        $map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
        if (!isset($map[$mime])) return null;
        if (!is_dir($dir) && !mkdir($dir, 0755, true)) return null;
        $dest = rtrim($dir, '/') . '/' . $base . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(3)) . '.' . $map[$mime];
        return move_uploaded_file($file['tmp_name'], $dest) ? $dest : null;
    };

    if (empty($files['id']) || ($files['id']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return ['ok' => false, 'message' => "Upload a photo of your parent's or guardian's ID showing their signature."];
    }
    if (!$same && (empty($files['letter']) || ($files['letter']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE)) {
        return ['ok' => false, 'message' => "Your guardian's surname is different from yours, so a letter they signed is also needed."];
    }
    $idPath = $save($files['id'], 'guardian_id');
    if (!$idPath) return ['ok' => false, 'message' => "The guardian's ID could not be read. Upload a JPEG, PNG, WebP or PDF file up to 10 MB."];
    $letterPath = null;
    if (!empty($files['letter']) && ($files['letter']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $letterPath = $save($files['letter'], 'guardian_letter');
        if (!$letterPath) return ['ok' => false, 'message' => 'The signed letter could not be read. Upload a JPEG, PNG, WebP or PDF file up to 10 MB.'];
    }

    $sup = $conn->prepare("UPDATE resident_guardians SET status = 'Rejected', remarks = 'Replaced by a newer upload' WHERE resident_id = ? AND status = 'Pending'");
    $sup->bind_param('i', $residentId);
    $sup->execute();
    $sup->close();
    $sameInt = $same ? 1 : 0;
    $ins = $conn->prepare("INSERT INTO resident_guardians (resident_id, guardian_fname, guardian_lname, relationship, same_surname, id_path, letter_path)
                           VALUES (?, ?, ?, ?, ?, ?, ?)");
    $ins->bind_param('isssiss', $residentId, $fname, $lname, $rel, $sameInt, $idPath, $letterPath);
    $ins->execute();
    $id = (int)$ins->insert_id;
    $ins->close();
    return ['ok' => true, 'message' => 'Guardian documents saved.', 'id' => $id];
}

/** Latest guardian documents (any status), or null. */
function pb2_guardian_latest(mysqli $conn, int $residentId): ?array
{
    $st = $conn->prepare("SELECT * FROM resident_guardians WHERE resident_id = ? ORDER BY guardian_doc_id DESC LIMIT 1");
    $st->bind_param('i', $residentId);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    return $row ?: null;
}

/**
 * What the resident changed since staff asked for action, as readable lines.
 * $r needs resident_id, user_id, action_requested_at, mobile_verified_at.
 */
function pb2_fix_changes_since(mysqli $conn, array $r): array
{
    $since = $r['action_requested_at'] ?: '1970-01-01 00:00:00';
    $out = [];
    $labels = [
        'fName' => 'first name', 'mName' => 'middle name', 'lName' => 'last name', 'suffix' => 'suffix', 'birth_date' => 'birth date',
        'gender' => 'sex', 'philsys_nat_id' => 'PhilSys number', 'valid_id_documents' => 'valid ID photos and selfie',
        'is_pwd' => 'PWD claim', 'is_4ps' => '4Ps claim', 'is_solo_parent' => 'Solo Parent claim', 'is_indigent' => 'Indigent claim',
        'residing_since' => 'move-in month', 'house_no' => 'address', 'block_lot' => 'address', 'street' => 'address',
        'subdivision' => 'address', 'zone' => 'address', 'area' => 'address', 'landmark' => 'address',
    ];
    $uid = (string)$r['user_id'];
    $st = $conn->prepare("SELECT DISTINCT field_name FROM pending_profile_changes
                           WHERE user_id = ? AND created_at >= ? AND status IN ('pending_approval', 'approved')");
    $st->bind_param('ss', $uid, $since);
    $st->execute();
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $c) {
        $out[] = 'Changed ' . ($labels[$c['field_name']] ?? str_replace('_', ' ', $c['field_name']));
    }
    $st->close();
    $out = array_values(array_unique($out));

    $rid = (int)$r['resident_id'];
    $st = $conn->prepare("SELECT proof_type FROM resident_residency_proofs WHERE resident_id = ? AND submitted_at >= ? ORDER BY proof_id DESC LIMIT 1");
    $st->bind_param('is', $rid, $since);
    $st->execute();
    if ($p = $st->get_result()->fetch_assoc()) $out[] = 'Uploaded a proof of address (' . $p['proof_type'] . ')';
    $st->close();

    $st = $conn->prepare("SELECT 1 FROM resident_guardians WHERE resident_id = ? AND submitted_at >= ? LIMIT 1");
    $st->bind_param('is', $rid, $since);
    $st->execute();
    if ($st->get_result()->fetch_row()) $out[] = 'Uploaded parent/guardian documents';
    $st->close();

    if (!empty($r['mobile_verified_at']) && $r['mobile_verified_at'] >= $since) $out[] = 'Confirmed a mobile number by SMS';
    return $out;
}
