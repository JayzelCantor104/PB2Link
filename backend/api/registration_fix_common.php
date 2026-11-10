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
    'confirm'  => ['Confirm your details', 'Check that everything on your profile is correct and that this is your only account, then send it back.'],
];

const PB2_MAX_RESUBMITS = 3;
// The IDs a resident can register with (only residents 18 or older have
// accounts, PB2_ADULT_AGE in account_approval.php). The same list is in
// Register.jsx (VALID_ID_TYPES), Edit_profile.jsx, residentConfig.js and the
// residents.valid_id ENUM (migration 043).
const PB2_VALID_ID_TYPES = ['National ID (PhilID/ePhilID)', 'Passport', 'Drivers License', 'UMID (SSS/GSIS)', 'PRC ID', 'Postal ID', 'Voters ID', 'PhilHealth ID', 'TIN ID', 'Senior Citizen ID (OSCA)', 'Barangay ID (Pasong Buaya II)'];

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
        'compound' => 'address', 'subdivision' => 'address', 'zone' => 'address', 'area' => 'address', 'landmark' => 'address',
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

    if (!empty($r['mobile_verified_at']) && $r['mobile_verified_at'] >= $since) $out[] = 'Confirmed a mobile number by SMS';
    return $out;
}
