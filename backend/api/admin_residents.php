<?php
// Resident records for staff (src/Admin/Profiling.jsx). Every action needs an
// admin session; the CSV export needs a Super Admin.
//
//   GET  ?action=counts               accounts per status (sidebar badge)
//   GET  ?action=list                 summary rows + counts per status
//   GET  ?action=detail&id=N          full record, checks, history
//   GET  ?action=export&status=...    CSV (Super Admin, audit-logged)
//   POST ?action=update   JSON { id, changes: {field: value}, reason }
//   POST ?action=status   JSON { id, decision, remarks, notify, fix_items? }
//                         decision: approve | require_action | archive | restore
//                         fix_items (require_action): what the resident may fix
//                         online (registration_fix_common.php); none = visit the hall
//   POST ?action=resolve_duplicate JSON { id, notify }  keep the newest registration,
//                         archive the older ones, ask the newest to confirm online
//   POST ?action=upload   multipart { id, field: profile_picture, note, file }
//   POST ?action=review_check JSON { id, check: id|selfie|philsys|address|guardian,
//                         decision: accept|reject, note }  staff verdict on a check
//   POST ?action=request_change JSON { id, category, details, note }  ask the
//                         resident to change proof-backed information in Edit Profile
//   POST ?action=cancel_change_request JSON { id, request_id }
// Proof-backed fields (resident_change_common.php PB2_PROOF_FIELDS) are never
// changed by staff directly; every staff change notifies the resident.
//
// Rules: typed text is stored in ALL CAPS, fixed-list values are checked
// against the column's list (MySQL here is not strict and would store '' for
// a bad value), emails are lowercase and unique, years_in_PB2 and age are
// derived, never typed. Uploaded files are judged by their real content type.
// Old files are kept: they are part of the record.
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();
require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/text_case.php';
require_once __DIR__ . '/residency_requirement.php';
require_once __DIR__ . '/account_approval.php';
require_once __DIR__ . '/notify.php';
require_once __DIR__ . '/registration_fix_common.php';
require_once __DIR__ . '/resident_change_common.php';

// Checks staff can accept or reject (migration 028): key => [label, column, passing, failing].
const PB2_REVIEWABLE_CHECKS = [
    'id'       => ['ID scan', 'id_verification_status', 'Matched', 'Mismatch'],
    'selfie'   => ['selfie with ID', 'selfie_check_status', 'Verified', 'Needs Review'],
    'philsys'  => ['PhilSys card', 'philsys_verification_status', 'Matched', 'Mismatch'],
    'address'  => ['address on the ID', 'id_address_match', '1', '0'],
    'guardian' => ['parent or guardian documents', null, 'Verified', 'Rejected'],
];
const PB2_CHECK_RESIDENT_LABELS = [
    'id' => 'valid ID', 'selfie' => 'selfie holding your ID', 'philsys' => 'PhilSys card',
    'address' => 'address on your ID', 'guardian' => "parent's or guardian's documents",
];

$action = $_GET['action'] ?? '';
if ($action !== 'export') header('Content-Type: application/json');

$fail = function (string $msg, array $extra = []) {
    echo json_encode(['success' => false, 'message' => $msg] + $extra);
    exit;
};

const PB2_RES_STATUSES = ['Pending', 'Active', 'Action Required', 'Archived'];
const PB2_RES_SECTOR_FLAGS = ['is_senior' => 'Senior Citizen', 'is_pwd' => 'PWD', 'is_solo_parent' => 'Solo Parent', 'is_indigent' => 'Indigent', 'is_4ps' => '4Ps'];

// Fields staff may edit: type, required, max length / allowed values.
$PB2_RES_FIELDS = [
    'fName'                 => ['text', true, 100],
    'mName'                 => ['text', false, 100],
    'lName'                 => ['text', true, 100],
    'suffix'                => ['enum', false, ['Jr.', 'Sr.', 'II', 'III', 'IV']],
    'gender'                => ['enum', true, ['Male', 'Female', 'Other']],
    'birth_date'            => ['date', true],
    'civil_status'          => ['enum', true, ['Single', 'Married', 'Widowed', 'Separated']],
    'spouse_name_text'      => ['text', false, 150],
    'height'                => ['height', false],
    'blood_type'            => ['enum', false, ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-']],
    'religion'              => ['text', true, 50],
    'birth_city'            => ['text', true, 100],
    'birth_province'        => ['text', true, 100],
    'birth_country'         => ['text', true, 100],
    'contact_num'           => ['mobile', false],
    'email'                 => ['email', true],
    'notify_channel'        => ['enum', true, ['email', 'sms', 'both']],
    'house_no'              => ['text', false, 50],
    'block_lot'             => ['text', false, 50],
    'street'                => ['text', true, 100],
    'subdivision'           => ['text', false, 100],
    'zone'                  => ['text', false, 50],
    'area'                  => ['text', false, 100],
    'landmark'              => ['text', false, 100],
    'residing_since'        => ['month', true],
    'residency_status'      => ['enum', true, ['Homeowner', 'Tenant', 'Sharer']],
    'contact_person'        => ['text', true, 100],
    'contactp_relationship' => ['text', true, 50],
    'contactp_num'          => ['phone', false],
    'philsys_nat_id'        => ['philsys', false],
    'valid_id'              => ['enum', false, ['National ID (PhilID/ePhilID)', 'Passport', 'Drivers License', 'UMID (SSS/GSIS)', 'PRC ID', 'Postal ID', 'Voters ID', 'PhilHealth ID', 'TIN ID']],
    'is_senior'             => ['flag', false],
    'is_pwd'                => ['flag', false],
    'is_solo_parent'        => ['flag', false],
    'is_indigent'           => ['flag', false],
    'is_4ps'                => ['flag', false],
];

$LABELS = [
    'gender' => 'sex', 'fName' => 'first name', 'mName' => 'middle name', 'lName' => 'last name', 'birth_date' => 'birth date',
    'civil_status' => 'civil status', 'spouse_name_text' => 'spouse name', 'blood_type' => 'blood type',
    'birth_city' => 'birth city', 'birth_province' => 'birth province', 'birth_country' => 'birth country',
    'contact_num' => 'mobile number', 'notify_channel' => 'update preference', 'house_no' => 'house no.',
    'block_lot' => 'block & lot', 'residing_since' => 'move-in month', 'residency_status' => 'residency status',
    'contact_person' => 'emergency contact', 'contactp_relationship' => 'relationship', 'contactp_num' => 'emergency contact number',
    'philsys_nat_id' => 'PhilSys number', 'valid_id' => 'ID type',
    'is_pwd' => 'PWD sector', 'is_4ps' => '4Ps sector', 'is_solo_parent' => 'Solo Parent sector', 'is_indigent' => 'Indigent sector',
    'street' => 'street', 'subdivision' => 'subdivision', 'email' => 'email address',
];
$label = fn($f) => $LABELS[$f] ?? str_replace('_', ' ', $f);

/** A resident row with the user's email, or null. */
function pb2_res_load(mysqli $conn, int $id): ?array
{
    $st = $conn->prepare("SELECT r.*, u.email, u.last_login, TIMESTAMPDIFF(YEAR, r.birth_date, CURDATE()) AS age_now
                            FROM residents r LEFT JOIN users u ON u.user_id = r.user_id
                           WHERE r.resident_id = ?");
    $st->bind_param('i', $id);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    return $row ?: null;
}

function pb2_res_full_name(array $r): string
{
    return trim(preg_replace('/\s+/', ' ', ($r['fName'] ?? '') . ' ' . ($r['mName'] ?? '') . ' ' . ($r['lName'] ?? '') . ' ' . ($r['suffix'] ?? '')));
}

function pb2_res_json_list($raw): array
{
    $v = json_decode((string)$raw, true);
    return is_array($v) ? array_values(array_filter($v, 'is_string')) : [];
}

/** Other records that look like the same person: same name + birth date, or the same PhilSys number. */
function pb2_res_duplicate_records(mysqli $conn, array $r): array
{
    $rid = (int)$r['resident_id'];
    $st = $conn->prepare("SELECT resident_id, control_num, user_id, fName, lName, status, date_registered, replaced_by_resident_id,
                                 (SELECT COUNT(*) FROM req_barangay_clearance x WHERE x.resident_id = r.resident_id)
                               + (SELECT COUNT(*) FROM req_certificate_residency x WHERE x.resident_id = r.resident_id)
                               + (SELECT COUNT(*) FROM req_barangay_id x WHERE x.resident_id = r.resident_id)
                               + (SELECT COUNT(*) FROM req_business_clearance x WHERE x.resident_id = r.resident_id)
                               + (SELECT COUNT(*) FROM req_certificate_indigency x WHERE x.resident_id = r.resident_id) AS requests
                            FROM residents r
                           WHERE r.resident_id <> ?
                             AND ((UPPER(TRIM(r.fName)) = UPPER(TRIM(?)) AND UPPER(TRIM(r.lName)) = UPPER(TRIM(?)) AND r.birth_date = ?)
                                  OR (? <> '' AND REPLACE(REPLACE(COALESCE(r.philsys_nat_id, ''), '-', ''), ' ', '') = ?))
                           ORDER BY r.date_registered DESC LIMIT 10");
    $digits = preg_replace('/\D/', '', (string)($r['philsys_nat_id'] ?? ''));
    $fn = (string)$r['fName'];
    $ln = (string)$r['lName'];
    $bd = (string)$r['birth_date'];
    $st->bind_param('isssss', $rid, $fn, $ln, $bd, $digits, $digits);
    $st->execute();
    $rows = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();
    return $rows;
}

/**
 * A short notice to the resident by their update preference (email if SMS
 * can't go out): a sentence, an optional list, and a one-line SMS.
 */
function pb2_res_notify_info(mysqli $conn, array $r, string $subject, string $intro, array $lines, string $sms): array
{
    $esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $first = $r['fName'] ?: 'Resident';
    $list = $lines ? '<ul>' . implode('', array_map(fn($l) => '<li>' . $esc($l) . '</li>', $lines)) . '</ul>' : '';
    $body = "<p>Hi {$esc($first)},</p><p>{$esc($intro)}</p>$list<p>If you did not expect this, please contact the barangay office.</p>";
    $plain = "Hi $first,\n\n$intro\n" . ($lines ? '- ' . implode("\n- ", $lines) . "\n" : '') . "\nIf you did not expect this, please contact the barangay office.";
    return pb2_notify_resident($conn, $r['user_id'], $subject, pb2_mail_layout($subject, $body), $plain, $sms, 'account_update');
}

/**
 * Tells the resident about a status decision by their update preference
 * (email if SMS can't go out). Returns what was sent.
 */
function pb2_res_notify_status(mysqli $conn, array $r, string $decision, string $to, ?string $note, array $fixItems): array
{
    $first = $r['fName'] ?: 'Resident';
    $esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    if ($to === 'Active') {
        $subject = 'Your PB2Link account is active';
        $body = "<p>Hi {$esc($first)},</p><p>Your Barangay Pasong Buaya II account has been " . ($decision === 'restore' ? 'restored' : 'approved') . ". You can now sign in to PB2Link and request documents online.</p>";
        $sms = "PB2Link: Your Barangay Pasong Buaya II account is now active. You can sign in and request documents online.";
    } elseif ($to === 'Action Required' && $fixItems) {
        $list = implode('', array_map(fn($k) => '<li>' . $esc(PB2_FIX_ITEMS[$k][0]) . '</li>', $fixItems));
        $subject = 'Please fix your PB2Link registration';
        $body = "<p>Hi {$esc($first)},</p><p>Barangay staff need something before your account can be used:</p>"
              . "<p style=\"padding:12px;background:#fff7ed;border-left:4px solid #f59e0b\">{$esc($note)}</p>"
              . "<p>You can fix this online: sign in to PB2Link with your email and password. Edit Profile will open with what to fix:</p><ul>$list</ul>"
              . "<p>When you're done, press <strong>Send back for review</strong>. You can send it back up to " . PB2_MAX_RESUBMITS . " times.</p>";
        $sms = "PB2Link: Please fix your registration: $note Sign in to PB2Link to fix it online.";
    } elseif ($to === 'Action Required') {
        $subject = 'Action needed on your PB2Link registration';
        $body = "<p>Hi {$esc($first)},</p><p>Barangay staff need something before your account can be used:</p><p style=\"padding:12px;background:#fff7ed;border-left:4px solid #f59e0b\">{$esc($note)}</p><p>Please bring the needed documents to the Barangay Hall, or contact the barangay office.</p>";
        $sms = "PB2Link: Your account needs action: $note Please visit the Barangay Hall.";
    } else {
        $subject = 'Your PB2Link account was archived';
        $body = "<p>Hi {$esc($first)},</p><p>Your Barangay Pasong Buaya II account was archived and can no longer sign in.</p><p>Reason: {$esc($note)}</p><p>If this is a mistake, please contact the barangay office.</p>";
        $sms = "PB2Link: Your account was archived. Reason: $note Contact the barangay office if this is a mistake.";
    }
    $plain = strip_tags(str_replace(['</p>', '<br>', '</li>'], "\n", $body));
    return pb2_notify_resident($conn, $r['user_id'], $subject, pb2_mail_layout($subject, $body), $plain, $sms, 'account_status');
}

// ---------------------------------------------------------------- counts
// For the sidebar badge: registrations waiting for staff.
if ($action === 'counts') {
    $res = $conn->query("SELECT status, COUNT(*) n FROM residents GROUP BY status");
    $counts = array_fill_keys(PB2_RES_STATUSES, 0);
    while ($res && ($row = $res->fetch_assoc())) {
        if (isset($counts[$row['status']])) $counts[$row['status']] = (int)$row['n'];
    }
    $pc = $conn->query("SELECT COUNT(DISTINCT user_id) FROM pending_profile_changes WHERE status = 'pending_approval'");
    $profileChanges = $pc ? (int)$pc->fetch_row()[0] : 0;
    session_write_close();
    echo json_encode(['success' => true, 'counts' => $counts, 'profile_changes' => $profileChanges]);
    exit;
}

// ---------------------------------------------------------------- list
if ($action === 'list') {
    $sql = "SELECT r.resident_id, r.control_num, r.user_id, r.fName, r.mName, r.lName, r.suffix, r.gender,
                   r.birth_date, TIMESTAMPDIFF(YEAR, r.birth_date, CURDATE()) AS age, r.civil_status,
                   r.contact_num, (r.mobile_verified_at IS NOT NULL) AS mobile_verified, u.email, u.last_login,
                   r.house_no, r.block_lot, r.street, r.subdivision, r.zone, r.area, r.residency_status, r.residing_since,
                   r.is_senior, r.is_pwd, r.is_solo_parent, r.is_indigent, r.is_4ps,
                   r.status, r.approval_method, r.date_registered, r.admin_remarks,
                   r.id_verification_status, r.selfie_check_status, r.philsys_verification_status,
                   (COALESCE(r.philsys_nat_id, '') <> '') AS has_philsys, r.profile_picture, r.review_reasons,
                   (SELECT COUNT(*) FROM pending_profile_changes p WHERE p.user_id = r.user_id AND p.status = 'pending_approval') AS pending_changes,
                   (SELECT rp.status FROM resident_residency_proofs rp WHERE rp.resident_id = r.resident_id ORDER BY rp.proof_id DESC LIMIT 1) AS proof_status,
                   r.fix_items, r.resubmitted_at, r.resubmit_count,
                   (SELECT g.status FROM resident_guardians g WHERE g.resident_id = r.resident_id ORDER BY g.guardian_doc_id DESC LIMIT 1) AS guardian_status
              FROM residents r LEFT JOIN users u ON u.user_id = r.user_id
             ORDER BY r.date_registered DESC";
    $res = $conn->query($sql);
    if (!$res) $fail('Could not load the residents.');
    $rows = [];
    $counts = array_fill_keys(PB2_RES_STATUSES, 0);
    while ($r = $res->fetch_assoc()) {
        foreach (['resident_id', 'age', 'mobile_verified', 'is_senior', 'is_pwd', 'is_solo_parent', 'is_indigent', 'is_4ps', 'has_philsys', 'pending_changes', 'resubmit_count'] as $k) {
            $r[$k] = $r[$k] === null ? null : (int)$r[$k];
        }
        $r['full_name'] = pb2_res_full_name($r);
        $r['review_reasons'] = pb2_res_json_list($r['review_reasons']);
        $r['fix_items'] = pb2_fix_items_decode($r['fix_items']);
        if (isset($counts[$r['status']])) $counts[$r['status']]++;
        $rows[] = $r;
    }
    session_write_close();
    echo json_encode(['success' => true, 'residents' => $rows, 'counts' => $counts, 'is_super' => (pb2_current_admin()['role'] ?? '') === 'Super']);
    exit;
}

// ---------------------------------------------------------------- detail
if ($action === 'detail') {
    $id = (int)($_GET['id'] ?? 0);
    $r = pb2_res_load($conn, $id);
    if (!$r) $fail('That resident record was not found.');
    $uid = (string)$r['user_id'];

    $r['full_name'] = pb2_res_full_name($r);
    $r['age'] = $r['age_now'] === null ? null : (int)$r['age_now'];
    $r['months_residing'] = pb2_months_residing($r['residing_since']);
    $r['review_reasons'] = pb2_res_json_list($r['review_reasons']);
    $snap = json_decode((string)$r['id_ocr_snapshot'], true);
    $r['id_ocr_snapshot'] = is_array($snap) ? $snap : null;
    unset($r['age_now']);

    // Possible duplicates, checked again now (other records may have changed).
    // Older records already closed in favour of this one don't count.
    $dupes = [];
    $dupeRecords = [];
    foreach (pb2_res_duplicate_records($conn, $r) as $d) {
        if ((int)$d['replaced_by_resident_id'] === $id) continue;           // an older record this one replaced
        if ((int)$d['resident_id'] === (int)$r['replaced_by_resident_id']) continue; // the record that replaced this one
        $d['resident_id'] = (int)$d['resident_id'];
        $d['requests'] = (int)$d['requests'];
        $dupeRecords[] = $d;
        $dupes[] = "Possible duplicate: resident {$d['control_num']} ({$d['status']}) has the same name and birth date or PhilSys number.";
    }
    $r['fix_items'] = pb2_fix_items_decode($r['fix_items']);
    $r['fix_labels'] = array_map(fn($k) => PB2_FIX_ITEMS[$k][0], $r['fix_items']);
    $r['max_resubmits'] = PB2_MAX_RESUBMITS;
    $r['replaced_by'] = null;
    if (!empty($r['replaced_by_resident_id'])) {
        $st = $conn->prepare("SELECT resident_id, control_num FROM residents WHERE resident_id = ?");
        $rb = (int)$r['replaced_by_resident_id'];
        $st->bind_param('i', $rb);
        $st->execute();
        $r['replaced_by'] = $st->get_result()->fetch_assoc() ?: null;
        $st->close();
    }

    // A minor's parent or guardian documents (migration 027), newest first.
    $guardians = [];
    $st = $conn->prepare("SELECT g.*, a.fullname AS reviewed_by_name FROM resident_guardians g LEFT JOIN admins a ON a.admin_id = g.reviewed_by
                           WHERE g.resident_id = ? ORDER BY g.guardian_doc_id DESC LIMIT 5");
    if ($st) {
        $st->bind_param('i', $id);
        $st->execute();
        $guardians = $st->get_result()->fetch_all(MYSQLI_ASSOC);
        $st->close();
    }
    $fixChanges = $r['action_requested_at'] ? pb2_fix_changes_since($conn, $r) : [];

    // Staff reviews of the automatic checks (migration 028): the latest per check.
    $reviews = [];
    $st = $conn->prepare("SELECT cr.check_key, cr.decision, cr.note, cr.reviewed_at, a.fullname AS reviewer
                            FROM resident_check_reviews cr LEFT JOIN admins a ON a.admin_id = cr.reviewed_by
                           WHERE cr.resident_id = ? ORDER BY cr.review_id DESC LIMIT 50");
    if ($st) {
        $st->bind_param('i', $id);
        $st->execute();
        foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $rv) {
            if (!isset($reviews[$rv['check_key']])) $reviews[$rv['check_key']] = $rv;
        }
        $st->close();
    }
    $changeRequests = pb2_change_requests($conn, $r);

    // Requests across every type, newest first.
    $history = [];
    $types = [
        'req_barangay_clearance' => 'Barangay Clearance', 'req_certificate_residency' => 'Certificate of Residency',
        'req_barangay_id' => 'Barangay ID', 'req_business_clearance' => 'Business Clearance',
        'req_certificate_indigency' => 'Certificate of Indigency', 'req_volunteer_registration' => 'Volunteer Registration',
        'req_amenity_reservation' => 'Amenity Reservation',
    ];
    foreach ($types as $table => $name) {
        $st = $conn->prepare("SELECT tracking_code, status, date_requested FROM $table WHERE resident_id = ? ORDER BY date_requested DESC LIMIT 50");
        if (!$st) continue;
        $st->bind_param('i', $id);
        $st->execute();
        foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
            $history[] = ['type' => $name, 'kind' => $table === 'req_amenity_reservation' ? 'amenity' : 'document'] + $row;
        }
        $st->close();
    }
    $st = $conn->prepare("SELECT tracking_code, status, date_requested, service_title FROM service_submissions WHERE resident_id = ? ORDER BY date_requested DESC LIMIT 50");
    if ($st) {
        $st->bind_param('i', $id);
        $st->execute();
        foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
            $history[] = ['type' => $row['service_title'], 'kind' => 'service', 'tracking_code' => $row['tracking_code'], 'status' => $row['status'], 'date_requested' => $row['date_requested']];
        }
        $st->close();
    }
    $st = $conn->prepare("SELECT track_code, status, created_at, incident_class FROM incident_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
    if ($st) {
        $st->bind_param('s', $uid);
        $st->execute();
        foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
            $history[] = ['type' => 'Incident report' . ($row['incident_class'] ? ' (' . $row['incident_class'] . ')' : ''), 'kind' => 'incident', 'tracking_code' => $row['track_code'], 'status' => $row['status'], 'date_requested' => $row['created_at']];
        }
        $st->close();
    }
    usort($history, fn($a, $b) => strcmp((string)$b['date_requested'], (string)$a['date_requested']));

    // Payments in short.
    $payments = ['total' => 0, 'for_verification' => 0, 'paid_amount' => 0.0];
    $st = $conn->prepare("SELECT COUNT(*) n, SUM(status = 'For Verification') fv, COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount_paid END), 0) paid
                            FROM request_payments WHERE resident_id = ?");
    if ($st) {
        $st->bind_param('i', $id);
        $st->execute();
        $p = $st->get_result()->fetch_assoc();
        $payments = ['total' => (int)$p['n'], 'for_verification' => (int)$p['fv'], 'paid_amount' => (float)$p['paid']];
        $st->close();
    }

    // Profile changes the resident asked for that wait on staff.
    $changes = [];
    $st = $conn->prepare("SELECT change_id, field_name, new_value, created_at FROM pending_profile_changes
                           WHERE user_id = ? AND status = 'pending_approval' ORDER BY created_at DESC LIMIT 30");
    if ($st) {
        $st->bind_param('s', $uid);
        $st->execute();
        $changes = $st->get_result()->fetch_all(MYSQLI_ASSOC);
        $st->close();
    }
    foreach ($changes as &$c) {
        // ID/sector changes carry JSON; staff review them on Profile Approvals.
        if (strlen((string)$c['new_value']) > 80 || ($c['new_value'][0] ?? '') === '{') $c['new_value'] = null;
    }
    unset($c);

    $issues = 0;
    $st = $conn->prepare("SELECT COUNT(*) FROM community_issue_reports WHERE resident_id = ?");
    if ($st) {
        $st->bind_param('i', $id);
        $st->execute();
        $issues = (int)$st->get_result()->fetch_row()[0];
        $st->close();
    }

    // Change history: Super Admins only, like the audit log itself.
    $audit = null;
    if ((pb2_current_admin()['role'] ?? '') === 'Super') {
        $st = $conn->prepare("SELECT event_type, actor_username, description, changed_fields, created_at
                                FROM admin_audit_log WHERE target_entity_type = 'resident' AND target_entity_id = ?
                               ORDER BY log_id DESC LIMIT 30");
        $sid = (string)$id;
        $st->bind_param('s', $sid);
        $st->execute();
        $audit = $st->get_result()->fetch_all(MYSQLI_ASSOC);
        $st->close();
        foreach ($audit as &$a) {
            $a['changed_fields'] = json_decode((string)$a['changed_fields'], true) ?: [];
        }
        unset($a);
    }

    session_write_close();
    echo json_encode([
        'success'    => true,
        'resident'   => $r,
        'duplicates' => $dupes,
        'duplicate_records' => $dupeRecords,
        'guardians'  => $guardians,
        'fix_changes' => $fixChanges,
        'check_reviews' => (object)$reviews,
        'change_requests' => $changeRequests,
        'residency'  => pb2_residency_state($conn, $id),
        'history'    => $history,
        'payments'   => $payments,
        'changes'    => $changes,
        'issue_reports' => $issues,
        'audit'      => $audit,
    ]);
    exit;
}

// ---------------------------------------------------------------- export
if ($action === 'export') {
    pb2_require_super_admin();
    $status = $_GET['status'] ?? 'all';
    $where = in_array($status, PB2_RES_STATUSES, true) ? "WHERE r.status = '" . $conn->real_escape_string($status) . "'" : '';
    $res = $conn->query("SELECT r.control_num, r.lName, r.fName, r.mName, r.suffix, r.gender, r.birth_date,
                                TIMESTAMPDIFF(YEAR, r.birth_date, CURDATE()) age, r.civil_status,
                                r.house_no, r.block_lot, r.street, r.subdivision, r.zone, r.area,
                                r.residency_status, r.residing_since, r.is_senior, r.is_pwd, r.is_solo_parent, r.is_indigent, r.is_4ps,
                                r.contact_num, u.email, r.status, r.date_registered
                           FROM residents r LEFT JOIN users u ON u.user_id = r.user_id $where
                          ORDER BY r.lName, r.fName");
    $cell = function ($v) {
        $v = (string)$v;
        // A leading = + - @ (or tab/CR) would run as a spreadsheet formula.
        return preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v;
    };
    $n = 0;
    $out = fopen('php://temp', 'w+');
    fputcsv($out, ['Control No.', 'Last Name', 'First Name', 'Middle Name', 'Suffix', 'Sex', 'Birth Date', 'Age', 'Civil Status',
        'House No.', 'Block & Lot', 'Street', 'Subdivision', 'Zone', 'Area', 'Residency Status', 'Living in PB2 Since',
        'Senior', 'PWD', 'Solo Parent', 'Indigent', '4Ps', 'Mobile', 'Email', 'Account Status', 'Registered']);
    while ($res && ($r = $res->fetch_assoc())) {
        foreach (['is_senior', 'is_pwd', 'is_solo_parent', 'is_indigent', 'is_4ps'] as $f) $r[$f] = (int)$r[$f] === 1 ? 'Yes' : '';
        $r['residing_since'] = $r['residing_since'] ? substr($r['residing_since'], 0, 7) : '';
        fputcsv($out, array_map($cell, array_values($r)));
        $n++;
    }
    pb2_log_admin_action('resident.export', 'resident', null, "Exported $n resident record(s) to CSV" . ($where ? " (status: $status)" : ''));
    rewind($out);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="pb2-residents-' . date('Y-m-d') . '.csv"');
    echo "\xEF\xBB\xBF" . stream_get_contents($out);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') $fail('Invalid request.');

// ---------------------------------------------------------------- upload
if ($action === 'upload') {
    $id = (int)($_POST['id'] ?? 0);
    $field = (string)($_POST['field'] ?? '');
    $note = trim((string)($_POST['note'] ?? ''));
    // Only the profile photo: IDs, PhilSys photos and sector proofs are the
    // resident's proof, asked for with "Ask the resident to change it" (migration 028).
    $imageOnly = ['profile_picture'];
    $proofs = [];
    if (!in_array($field, $imageOnly, true)) $fail('Ask the resident to upload this in Edit Profile; staff can only replace the profile photo.');
    if (mb_strlen($note) < 5) $fail('Say briefly why the file is being replaced (e.g. "New ID presented at the hall").');
    $r = pb2_res_load($conn, $id);
    if (!$r) $fail('That resident record was not found.');

    $file = $_FILES['file'] ?? null;
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) $fail('Choose a file to upload.');
    if ($file['size'] > 10 * 1024 * 1024) $fail('The file is larger than 10 MB.');
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : '';
    if ($finfo) finfo_close($finfo);
    $map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (in_array($field, $proofs, true)) $map['application/pdf'] = 'pdf';
    if (!isset($map[$mime])) $fail(in_array($field, $proofs, true) ? 'Upload a JPEG, PNG, WebP or PDF file.' : 'Upload a JPEG, PNG or WebP image.');

    $folder = preg_replace('/[^A-Za-z0-9_-]/', '', (string)$r['control_num']) ?: ('RES_' . $id);
    $relDir = 'uploads/Resident_submitted_valid_ID/' . $folder . '/';
    if (!is_dir(__DIR__ . '/' . $relDir) && !mkdir(__DIR__ . '/' . $relDir, 0755, true)) $fail('The upload folder could not be prepared.');
    $rel = $relDir . 'staff_' . $field . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(3)) . '.' . $map[$mime];
    if (!move_uploaded_file($file['tmp_name'], __DIR__ . '/' . $rel)) $fail('The file could not be saved.');

    // The automatic checks no longer describe the new file.
    $extra = '';
    if ($field === 'valid_id_img_front') $extra = ", id_verification_status = 'Manual Entry', id_address_match = NULL";
    if ($field === 'valid_id_img_holding') $extra = ", selfie_check_status = 'Not Checked', selfie_check_notes = 'Replaced by staff'";
    if ($field === 'philsys_img_front' && !empty($r['philsys_nat_id'])) $extra = ", philsys_verification_status = 'Manual Entry'";
    $st = $conn->prepare("UPDATE residents SET $field = ? $extra WHERE resident_id = ?");
    $st->bind_param('si', $rel, $id);
    $st->execute();
    $st->close();

    pb2_log_admin_action('resident.document.replace', 'resident', (string)$id,
        "Replaced $field for {$r['control_num']}: " . pb2_caps($note),
        [['field' => $field, 'old_value' => $r[$field], 'new_value' => $rel]]);
    $notified = pb2_res_notify_info($conn, $r, 'Barangay staff replaced your profile photo',
        'Barangay staff replaced the profile photo on your PB2Link account.', ['Reason: ' . pb2_caps($note)],
        'PB2Link: Barangay staff replaced your profile photo. Reason: ' . pb2_caps($note));
    echo json_encode(['success' => true, 'message' => 'The photo was replaced. The old one is kept in the record folder.', 'path' => $rel, 'notified' => $notified]);
    exit;
}

$in = json_decode(file_get_contents('php://input'), true) ?: [];
$id = (int)($in['id'] ?? 0);
$r = pb2_res_load($conn, $id);
if (!$r) $fail('That resident record was not found.');

// ---------------------------------------------------------------- update
if ($action === 'update') {
    $changes = is_array($in['changes'] ?? null) ? $in['changes'] : [];
    $reason = trim((string)($in['reason'] ?? ''));
    if (!$changes) $fail('Nothing was changed.');
    if (mb_strlen($reason) < 5) $fail('Give a short reason for the change (e.g. "Corrected spelling per birth certificate").');

    $set = [];
    $errors = [];
    $logged = [];
    foreach ($changes as $field => $value) {
        // Needs the resident's proof or code (migration 028): staff ask instead.
        if (isset(PB2_PROOF_FIELDS[$field])) {
            $errors[] = ucfirst($label($field)) . ' needs the resident\'s ' . ($field === 'email' || $field === 'contact_num' ? 'confirmation code' : 'proof') . '. Use "Ask the resident to change it".';
            continue;
        }
        if ($field === 'is_senior') { $errors[] = 'Senior citizen status follows the birth date.'; continue; }
        if (!isset($PB2_RES_FIELDS[$field])) { $errors[] = "The $field field cannot be edited here."; continue; }
        [$type, $required] = $PB2_RES_FIELDS[$field];
        $opt = $PB2_RES_FIELDS[$field][2] ?? null;
        $v = is_string($value) ? trim(preg_replace('/\s+/', ' ', $value)) : $value;
        $name = $label($field);

        switch ($type) {
            case 'text':
                $v = pb2_caps((string)$v);
                if ($v === '' && $required) { $errors[] = "Enter the $name."; continue 2; }
                if (mb_strlen($v) > $opt) { $errors[] = ucfirst($name) . " is too long (max $opt)."; continue 2; }
                $v = $v === '' ? null : $v;
                break;
            case 'enum':
                $v = (string)$v;
                if ($v === '' && !$required) { $v = null; break; }
                if (!in_array($v, $opt, true)) { $errors[] = "Choose a valid $name."; continue 2; }
                break;
            case 'date':
                $d = DateTime::createFromFormat('!Y-m-d', (string)$v);
                if (!$d || $d->format('Y-m-d') !== $v || $v > date('Y-m-d') || $v < '1900-01-01') { $errors[] = "Enter a valid $name."; continue 2; }
                break;
            case 'month':
                $v = pb2_parse_residing_since((string)$v);
                if ($v === null) { $errors[] = 'Enter a valid move-in month (not in the future).'; continue 2; }
                break;
            case 'height':
                $v = (string)$v;
                if ($v !== '' && (!preg_match('/^\d{2,3}(\.\d)?$/', $v) || (float)$v < 40 || (float)$v > 250)) { $errors[] = 'Enter the height in centimetres (40-250).'; continue 2; }
                break;
            case 'mobile':
                $digits = preg_replace('/\D/', '', (string)$v);
                if (preg_match('/^639\d{9}$/', $digits)) $digits = '0' . substr($digits, 2);
                if ($digits === '') { $v = null; break; }
                if (!preg_match('/^09\d{9}$/', $digits)) { $errors[] = 'Enter the mobile number as 09XXXXXXXXX.'; continue 2; }
                $v = $digits;
                break;
            case 'phone':
                $v = preg_replace('/[^\d+\- ]/', '', (string)$v);
                if ($v !== '' && strlen(preg_replace('/\D/', '', $v)) < 7) { $errors[] = "Enter a valid $name."; continue 2; }
                if (strlen($v) > 20) { $errors[] = ucfirst($name) . ' is too long.'; continue 2; }
                $v = $v === '' ? null : $v;
                break;
            case 'email':
                $v = strtolower((string)$v);
                if (!filter_var($v, FILTER_VALIDATE_EMAIL) || strlen($v) > 100) { $errors[] = 'Enter a valid email address.'; continue 2; }
                $chk = $conn->prepare("SELECT 1 FROM users WHERE email = ? AND user_id <> ?");
                $uid = (string)$r['user_id'];
                $chk->bind_param('ss', $v, $uid);
                $chk->execute();
                if ($chk->get_result()->fetch_row()) { $errors[] = 'Another account already uses that email.'; continue 2; }
                break;
            case 'philsys':
                $digits = preg_replace('/\D/', '', (string)$v);
                if ($digits === '') { $v = null; break; }
                if (!in_array(strlen($digits), [12, 16], true)) { $errors[] = 'A PhilSys number has 12 (PSN) or 16 (PCN) digits.'; continue 2; }
                $chk = $conn->prepare("SELECT control_num FROM residents WHERE REPLACE(REPLACE(philsys_nat_id, '-', ''), ' ', '') = ? AND resident_id <> ? LIMIT 1");
                $chk->bind_param('si', $digits, $id);
                $chk->execute();
                if ($dup = $chk->get_result()->fetch_row()) { $errors[] = "Resident {$dup[0]} already has that PhilSys number."; continue 2; }
                $v = implode('-', str_split($digits, 4));
                break;
            case 'flag':
                $v = !empty($v) && $v !== '0' ? 1 : 0;
                break;
        }

        $old = $r[$field] ?? null;
        $same = $type === 'philsys'
            ? preg_replace('/\D/', '', (string)$old) === preg_replace('/\D/', '', (string)$v)
            : (string)$old === (string)$v && !($old === null && $v !== null && $v !== '');
        if ($same) continue;
        $set[$field] = $v;
        $logged[] = ['field' => $field, 'old_value' => $old, 'new_value' => $v];
    }
    if ($errors) $fail(implode(' ', $errors), ['errors' => $errors]);
    if (!$set) $fail('Nothing was changed.');

    // Derived values. (residents.age is computed by the database from birth_date.)
    if (array_key_exists('birth_date', $set)) {
        $senior = (new DateTime($set['birth_date']))->diff(new DateTime('today'))->y >= 60 ? 1 : 0;
        if ($senior !== (int)$r['is_senior']) {
            $set['is_senior'] = $senior;
            $logged[] = ['field' => 'is_senior', 'old_value' => $r['is_senior'], 'new_value' => $senior];
        }
    }
    if (array_key_exists('residing_since', $set)) {
        $set['years_in_PB2'] = (string)pb2_years_from_since($set['residing_since']);
    }
    if (array_key_exists('philsys_nat_id', $set)) {
        // Typed in by staff, not read from a card.
        $set['philsys_verification_status'] = $set['philsys_nat_id'] === null ? 'Not Provided' : 'Manual Entry';
    }
    // Leaving a sector clears its document, as Profile Approvals does.
    foreach (['is_pwd' => 'proof_pwd', 'is_4ps' => 'proof_4ps', 'is_solo_parent' => 'proof_solo_parent', 'is_indigent' => 'proof_indigent'] as $flag => $proofCol) {
        if (array_key_exists($flag, $set) && $set[$flag] === 0) $set[$proofCol] = null;
    }
    if (array_key_exists('contact_num', $set)) {
        $set['mobile_verified_at'] = null; // the resident hasn't confirmed this number by SMS
    }
    $email = $set['email'] ?? null;
    unset($set['email']);

    $conn->begin_transaction();
    try {
        if ($set) {
            $cols = [];
            $types = '';
            $vals = [];
            foreach ($set as $f => $v) {
                $cols[] = "$f = ?";
                $types .= is_int($v) ? 'i' : 's';
                $vals[] = $v;
            }
            $types .= 'i';
            $vals[] = $id;
            $st = $conn->prepare('UPDATE residents SET ' . implode(', ', $cols) . ' WHERE resident_id = ?');
            $st->bind_param($types, ...$vals);
            $st->execute();
            $st->close();
        }
        if ($email !== null) {
            $st = $conn->prepare("UPDATE users SET email = ? WHERE user_id = ?");
            $uid = (string)$r['user_id'];
            $st->bind_param('ss', $email, $uid);
            $st->execute();
            $st->close();
        }
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        $fail('The changes could not be saved. Nothing was changed.');
    }

    pb2_log_admin_action('resident.profile.update', 'resident', (string)$id,
        "Edited " . count($logged) . " field(s) of {$r['control_num']}: " . pb2_caps($reason), $logged);

    // The resident is always told what staff changed on their record.
    $show = function ($f, $v) {
        if ($v === null || $v === '') return 'blank';
        if (in_array($f, ['is_senior'], true)) return (int)$v === 1 ? 'yes' : 'no';
        if ($f === 'notify_channel') return ['email' => 'Email', 'sms' => 'SMS', 'both' => 'Email and SMS'][$v] ?? $v;
        return (string)$v;
    };
    $lines = array_map(fn($l) => ucfirst($label($l['field'] === 'is_senior' ? 'senior citizen' : $l['field'])) . ': ' . $show($l['field'], $l['old_value']) . ' -> ' . $show($l['field'], $l['new_value']), $logged);
    $notified = pb2_res_notify_info($conn, $r, 'Barangay staff updated your profile',
        'Barangay staff updated these details on your PB2Link profile:', array_merge($lines, ['Reason: ' . pb2_caps($reason)]),
        'PB2Link: Barangay staff updated your profile (' . implode(', ', array_map(fn($l) => $label($l['field'] === 'is_senior' ? 'senior citizen' : $l['field']), $logged)) . '). See your email or Edit Profile.');

    // A changed name or birth date may now match someone else.
    $warn = [];
    if (array_intersect(array_keys($set), ['fName', 'lName', 'birth_date'])) {
        $now = pb2_res_load($conn, $id);
        foreach (pb2_find_duplicate_residents($conn, (string)$now['fName'], (string)$now['lName'], (string)$now['birth_date'], null) as $d) {
            if (strpos($d, (string)$now['control_num']) === false) $warn[] = $d;
        }
    }
    echo json_encode(['success' => true, 'message' => count($logged) . ' change(s) saved.', 'warnings' => $warn, 'notified' => $notified]);
    exit;
}

// ---------------------------------------------------------------- review a check
// Staff accept or reject an automatic check after looking at the documents
// (migration 028). Accepting sets the passing status, rejecting the failing
// one; the decision, reviewer and note are kept in resident_check_reviews.
if ($action === 'review_check') {
    $check = (string)($in['check'] ?? '');
    $decision = (string)($in['decision'] ?? '');
    $note = trim((string)($in['note'] ?? ''));
    if (!isset(PB2_REVIEWABLE_CHECKS[$check])) $fail('That check cannot be reviewed here.');
    if (!in_array($decision, ['accept', 'reject'], true)) $fail('Choose Accept or Reject.');
    if ($decision === 'reject' && mb_strlen($note) < 5) $fail('Say why it is rejected; the resident sees this.');
    if (mb_strlen($note) > 250) $fail('The note is too long (max 250 characters).');
    [$checkLabel, $col, $pass, $failValue] = PB2_REVIEWABLE_CHECKS[$check];
    $noteCaps = $note !== '' ? pb2_caps($note) : null;
    $admin = pb2_current_admin();
    $reviewer = $admin ? (int)$admin['admin_id'] : null;

    if ($check === 'guardian') {
        $g = pb2_guardian_latest($conn, $id);
        if (!$g) $fail('There are no parent or guardian documents to review.');
        $old = $g['status'];
        $new = $decision === 'accept' ? 'Verified' : 'Rejected';
        $st = $conn->prepare("UPDATE resident_guardians SET status = ?, remarks = ?, reviewed_by = ?, reviewed_at = NOW() WHERE guardian_doc_id = ?");
        $gid = (int)$g['guardian_doc_id'];
        $st->bind_param('ssii', $new, $noteCaps, $reviewer, $gid);
        $st->execute();
        $st->close();
    } else {
        if ($check === 'philsys' && trim((string)$r['philsys_nat_id']) === '') $fail('There is no PhilSys number on this record to review.');
        if ($check === 'selfie' && trim((string)$r['valid_id_img_holding']) === '') $fail('There is no selfie with ID on file.');
        $old = $r[$col] === null ? null : (string)$r[$col];
        // A check that passed (automatically or by an earlier staff decision)
        // needs no review; only failed or unchecked ones get a decision.
        if ($old === $pass) $fail('This check already passed; it needs no review. If something is wrong, use "Ask for action".');
        $new = $decision === 'accept' ? $pass : $failValue;
        if ($check === 'selfie') {
            $selfieNote = pb2_caps(($decision === 'accept' ? 'Confirmed by staff' : 'Rejected by staff') . ($note !== '' ? ': ' . $note : ''));
            $st = $conn->prepare("UPDATE residents SET selfie_check_status = ?, selfie_check_notes = ? WHERE resident_id = ?");
            $st->bind_param('ssi', $new, $selfieNote, $id);
        } elseif ($check === 'address') {
            $int = (int)$new;
            $st = $conn->prepare("UPDATE residents SET id_address_match = ? WHERE resident_id = ?");
            $st->bind_param('ii', $int, $id);
        } else {
            $st = $conn->prepare("UPDATE residents SET $col = ? WHERE resident_id = ?");
            $st->bind_param('si', $new, $id);
        }
        $st->execute();
        $st->close();
    }

    $dec = $decision === 'accept' ? 'accepted' : 'rejected';
    $newStr = (string)$new;
    $ins = $conn->prepare("INSERT INTO resident_check_reviews (resident_id, check_key, decision, note, old_status, new_status, reviewed_by)
                           VALUES (?, ?, ?, ?, ?, ?, ?)");
    $ins->bind_param('isssssi', $id, $check, $dec, $noteCaps, $old, $newStr, $reviewer);
    $ins->execute();
    $ins->close();
    pb2_log_admin_action('resident.check.' . $dec, 'resident', (string)$id,
        ucfirst($dec) . " the $checkLabel of {$r['control_num']}" . ($noteCaps ? ": $noteCaps" : ''),
        [['field' => $check === 'guardian' ? 'guardian_documents' : $col, 'old_value' => $old, 'new_value' => $newStr]]);

    $friendly = PB2_CHECK_RESIDENT_LABELS[$check];
    $sent = $decision === 'accept'
        ? pb2_res_notify_info($conn, $r, 'Your ' . $friendly . ' was confirmed',
            "Barangay staff checked and confirmed your $friendly.", [],
            "PB2Link: Barangay staff confirmed your $friendly.")
        : pb2_res_notify_info($conn, $r, 'Your ' . $friendly . ' was not accepted',
            "Barangay staff could not accept your $friendly.", ['Reason: ' . $noteCaps],
            "PB2Link: Your $friendly was not accepted: $noteCaps");
    echo json_encode(['success' => true, 'message' => ucfirst($checkLabel) . " $dec.", 'status' => $newStr, 'notified' => $sent]);
    exit;
}

// ---------------------------------------------------------------- ask for a change
// Information that needs the resident's proof or code (resident_change_common.php):
// staff ask, the resident changes it in Edit Profile with the proof, and
// approving that change on Profile Approvals closes the request.
if ($action === 'request_change') {
    $category = (string)($in['category'] ?? '');
    $details = pb2_caps(trim((string)($in['details'] ?? '')));
    $note = trim((string)($in['note'] ?? ''));
    if (!isset(PB2_CHANGE_CATEGORIES[$category])) $fail('Choose what the resident should change.');
    if (mb_strlen($details) < 3) $fail('Say what should change (e.g. "Add PWD" or "Surname is now DELA CRUZ").');
    if (mb_strlen($details) > 250 || mb_strlen($note) > 250) $fail('Keep it under 250 characters.');
    if ($r['status'] !== 'Active') {
        $fail('Only an active resident can update their profile. For a registration under review, use "Ask for action" with the item to fix.');
    }
    foreach (pb2_change_requests($conn, $r, true) as $open) {
        if ($open['category'] === $category) $fail('There is already an open request for the ' . strtolower(PB2_CHANGE_CATEGORIES[$category][0]) . '. Cancel it first to ask again.');
    }
    $snapshot = json_encode(['email' => $r['email'], 'contact_num' => $r['contact_num']]);
    $noteCaps = $note !== '' ? pb2_caps($note) : null;
    $admin = pb2_current_admin();
    $by = $admin ? (int)$admin['admin_id'] : null;
    $st = $conn->prepare("INSERT INTO resident_change_requests (resident_id, category, details, note, snapshot, created_by) VALUES (?, ?, ?, ?, ?, ?)");
    $st->bind_param('issssi', $id, $category, $details, $noteCaps, $snapshot, $by);
    $st->execute();
    $reqId = (int)$st->insert_id;
    $st->close();
    [$catLabel, , $help] = PB2_CHANGE_CATEGORIES[$category];
    pb2_log_admin_action('resident.change.request', 'resident', (string)$id,
        "Asked {$r['control_num']} to update the " . strtolower($catLabel) . ": $details", null);

    // Always told: the change can only happen on their side.
    $sent = pb2_res_notify_info($conn, $r, 'Please update your ' . strtolower($catLabel),
        'Barangay staff ask you to update your ' . strtolower($catLabel) . ' on PB2Link:',
        array_values(array_filter([$details, $noteCaps ? 'Note: ' . $noteCaps : null, 'How: sign in, open Edit Profile, and ' . lcfirst($help)])),
        "PB2Link: Please update your " . strtolower($catLabel) . " in Edit Profile: $details");
    echo json_encode(['success' => true, 'message' => 'The resident was asked to update it.', 'request_id' => $reqId, 'notified' => $sent]);
    exit;
}

if ($action === 'cancel_change_request') {
    $reqId = (int)($in['request_id'] ?? 0);
    $admin = pb2_current_admin();
    $by = $admin ? (int)$admin['admin_id'] : null;
    $st = $conn->prepare("UPDATE resident_change_requests SET status = 'cancelled', closed_at = NOW(), closed_by = ?
                           WHERE request_id = ? AND resident_id = ? AND status = 'open'");
    $st->bind_param('iii', $by, $reqId, $id);
    $st->execute();
    if ($st->affected_rows !== 1) $fail('That request is already closed.');
    $st->close();
    pb2_log_admin_action('resident.change.cancel', 'resident', (string)$id, "Cancelled change request #$reqId for {$r['control_num']}", null);
    echo json_encode(['success' => true, 'message' => 'Request cancelled.']);
    exit;
}

// ---------------------------------------------------------------- status
if ($action === 'status') {
    $decision = (string)($in['decision'] ?? '');
    $remarks = trim((string)($in['remarks'] ?? ''));
    $notify = !empty($in['notify']);
    $from = (string)$r['status'];
    $rules = [
        'approve'        => ['to' => 'Active', 'from' => ['Pending', 'Action Required']],
        // From Action Required too, to change what the resident should fix.
        'require_action' => ['to' => 'Action Required', 'from' => ['Pending', 'Active', 'Action Required']],
        'archive'        => ['to' => 'Archived', 'from' => ['Pending', 'Active', 'Action Required']],
        'restore'        => ['to' => 'Active', 'from' => ['Archived']],
    ];
    if (!isset($rules[$decision])) $fail('Choose what to do with this account.');
    if (!in_array($from, $rules[$decision]['from'], true)) $fail("This account is $from; that action doesn't apply to it.");
    if (in_array($decision, ['require_action', 'archive'], true) && mb_strlen($remarks) < 5) {
        $fail($decision === 'archive' ? 'Give the reason for archiving (e.g. "Moved out of the barangay").' : 'Tell the resident what needs to be fixed.');
    }

    // What the resident may fix online (migration 027). None = visit the hall.
    $fixItems = [];
    if ($decision === 'require_action' && !empty($in['fix_items']) && is_array($in['fix_items'])) {
        $fixItems = array_values(array_unique(array_filter($in['fix_items'], fn($k) => is_string($k) && isset(PB2_FIX_ITEMS[$k]))));
        if ($fixItems && (int)$r['resubmit_count'] >= PB2_MAX_RESUBMITS) {
            $fail('This resident has already sent the registration back ' . PB2_MAX_RESUBMITS . ' times. Ask them to visit the Barangay Hall instead.');
        }
    }
    $fixJson = $fixItems ? json_encode($fixItems) : null;

    $to = $rules[$decision]['to'];
    $note = $remarks !== '' ? pb2_caps($remarks) : null;
    $admin = pb2_current_admin();
    $reviewer = $admin ? (int)$admin['admin_id'] : null;

    if ($to === 'Active') {
        // A staff approval is manual; remarks and the fix list are cleared once resolved.
        $st = $conn->prepare("UPDATE residents SET status = 'Active', admin_remarks = NULL, fix_items = NULL, action_requested_at = NULL,
                                     approval_method = IF(? = 'approve', 'manual', COALESCE(approval_method, 'manual'))
                               WHERE resident_id = ?");
        $st->bind_param('si', $decision, $id);
        $st->execute();
        $st->close();
        if ($decision === 'approve') {
            // Staff checked the residency proof and any guardian documents
            // shown with the registration (migrations 018 and 027).
            foreach (['resident_residency_proofs', 'resident_guardians'] as $table) {
                $p = $conn->prepare("UPDATE $table SET status = 'Verified', reviewed_by = ?, reviewed_at = NOW(),
                                            remarks = COALESCE(remarks, 'Checked with the registration')
                                      WHERE resident_id = ? AND status = 'Pending'");
                $p->bind_param('ii', $reviewer, $id);
                $p->execute();
                $p->close();
            }
        }
    } elseif ($to === 'Action Required') {
        $st = $conn->prepare("UPDATE residents SET status = 'Action Required', admin_remarks = ?, fix_items = ?, action_requested_at = NOW() WHERE resident_id = ?");
        $st->bind_param('ssi', $note, $fixJson, $id);
        $st->execute();
        $st->close();
    } else {
        $st = $conn->prepare("UPDATE residents SET status = ?, admin_remarks = ?, fix_items = NULL, action_requested_at = NULL WHERE resident_id = ?");
        $st->bind_param('ssi', $to, $note, $id);
        $st->execute();
        $st->close();
    }

    $diff = [['field' => 'status', 'old_value' => $from, 'new_value' => $to]];
    $newRemarks = $to === 'Active' ? null : $note;
    if ((string)$r['admin_remarks'] !== (string)$newRemarks) {
        $diff[] = ['field' => 'admin_remarks', 'old_value' => $r['admin_remarks'], 'new_value' => $newRemarks];
    }
    if ($decision === 'require_action') {
        $diff[] = ['field' => 'fix_items', 'old_value' => $r['fix_items'], 'new_value' => $fixItems ? implode(', ', array_map(fn($k) => PB2_FIX_ITEMS[$k][0], $fixItems)) : 'Visit the Barangay Hall'];
    }
    $verb = ['approve' => 'Approved', 'require_action' => 'Asked for action on', 'archive' => 'Archived', 'restore' => 'Restored'][$decision];
    pb2_log_admin_action('resident.status.' . $decision, 'resident', (string)$id,
        "$verb {$r['control_num']}" . ($note ? ": $note" : ''),
        $diff);

    $sent = $notify ? pb2_res_notify_status($conn, $r, $decision, $to, $note, $fixItems) : null;
    echo json_encode(['success' => true, 'message' => "Account is now $to.", 'status' => $to, 'notified' => $sent]);
    exit;
}

// ---------------------------------------------------------------- resolve duplicate
// Same person registered more than once: keep the newest registration, archive
// the older ones (replaced_by_resident_id), and ask the newest to confirm the
// details online. Staff confirm it after comparing the IDs.
if ($action === 'resolve_duplicate') {
    $group = array_merge([$r], pb2_res_duplicate_records($conn, $r));
    if (count($group) < 2) $fail('No other record with the same name and birth date or PhilSys number was found.');
    usort($group, fn($a, $b) => strcmp((string)$b['date_registered'], (string)$a['date_registered']) ?: ((int)$b['resident_id'] - (int)$a['resident_id']));
    $keep = $group[0];
    $older = array_slice($group, 1);
    if ($keep['status'] === 'Archived') $fail('The newest registration (' . $keep['control_num'] . ') is archived. Restore it first, or archive the duplicates one by one.');
    $notify = !empty($in['notify']);

    $keepId = (int)$keep['resident_id'];
    $askNote = pb2_caps('An older account with the same details was closed. Please check that everything on your profile is correct, then send it back.');
    $items = ['confirm'];
    $conn->begin_transaction();
    try {
        foreach ($older as $o) {
            $oid = (int)$o['resident_id'];
            $why = pb2_caps('Replaced by the newer registration ' . $keep['control_num']);
            $st = $conn->prepare("UPDATE residents SET status = 'Archived', admin_remarks = ?, fix_items = NULL, action_requested_at = NULL,
                                         replaced_by_resident_id = ? WHERE resident_id = ?");
            $st->bind_param('sii', $why, $keepId, $oid);
            $st->execute();
            $st->close();
            pb2_log_admin_action('resident.duplicate.archive', 'resident', (string)$oid,
                "Archived {$o['control_num']} as a duplicate of the newer {$keep['control_num']}",
                [['field' => 'status', 'old_value' => $o['status'], 'new_value' => 'Archived']]);
        }
        if ($keep['status'] !== 'Active') {
            $json = json_encode($items);
            $st = $conn->prepare("UPDATE residents SET status = 'Action Required', admin_remarks = ?, fix_items = ?, action_requested_at = NOW() WHERE resident_id = ?");
            $st->bind_param('ssi', $askNote, $json, $keepId);
            $st->execute();
            $st->close();
            pb2_log_admin_action('resident.duplicate.keep', 'resident', (string)$keepId,
                "Kept {$keep['control_num']} as the newest registration; asked the resident to confirm the details",
                [['field' => 'status', 'old_value' => $keep['status'], 'new_value' => 'Action Required']]);
        }
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        $fail('The duplicate could not be resolved. Nothing was changed.');
    }
    $sent = ($notify && $keep['status'] !== 'Active') ? pb2_res_notify_status($conn, $keep, 'require_action', 'Action Required', $askNote, $items) : null;
    echo json_encode([
        'success' => true,
        'message' => 'Kept ' . $keep['control_num'] . ' and archived ' . count($older) . ' older record(s).',
        'kept_id' => $keepId,
        'notified' => $sent,
    ]);
    exit;
}

$fail('Invalid action.');
