<?php
// Walk-in document requests encoded by staff at the Barangay Hall
// (migration 049, src/Admin/WalkInRequest.jsx on the Documents page).
// Every action needs an admin with the Documents tab.
//
//   GET  ?action=search&q=...   Active residents by name, control no. or mobile,
//                               with what the forms fill in from their record
//   GET  ?action=fees           the fee of each document
//   GET  ?action=services       open custom services with their fee and questions (migration 051)
//   POST action=create (multipart)
//        type        clearance | residency | indigency | barangay_id | business_clearance
//                    | volunteer | service (with service_id; answers in dynamic_fields
//                    JSON and dyn_<name> files, checked by pb2_sf_collect() like online)
//        resident_id registered resident (their record and ID on file are used),
//                    or empty for someone not registered: fName, mName, lName,
//                    suffix, birth_date, gender, civil_status, address typed in
//        the document's own fields (purpose, business details, ...)
//        pay_mode    paid (or_number, amount_paid) | waived (waive_reason) | unpaid
//        id_picture, signature   photos for a Barangay ID
//
// The request is saved like an online one (same table, status Processing,
// source 'walk_in', encoded_by = the admin), so it shows in Documents, Track
// Request (for a registered resident), the reports and the collections report,
// and prints the same way. The ID was checked in person at the counter.
ini_set('display_errors', 0);
error_reporting(E_ALL);
header('Content-Type: application/json');

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
$admin = pb2_require_admin();
require_once __DIR__ . '/admin_permissions.php';
pb2_require_any_permission(['module.documents']); // tab access
$admin_id = (int)$admin['admin_id'];

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/text_case.php';
require_once __DIR__ . '/payment_common.php';
require_once __DIR__ . '/residency_requirement.php';

$respond = function (bool $ok, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $ok, 'message' => $message], $extra));
    exit;
};
if (!$conn) $respond(false, 'Database connection failed.');
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// type => [table, label, tracking prefix]
const PB2_WALKIN_TYPES = [
    'clearance'          => ['req_barangay_clearance', 'Barangay Clearance', 'CLR'],
    'residency'          => ['req_certificate_residency', 'Certificate of Residency', 'RES'],
    'indigency'          => ['req_certificate_indigency', 'Certificate of Indigency', 'IND'],
    'barangay_id'        => ['req_barangay_id', 'Barangay ID', 'BID'],
    'business_clearance' => ['req_business_clearance', 'Business Clearance', 'BIZ'],
    'volunteer'          => ['req_volunteer_registration', 'Volunteer Registration', 'VOL'],
    // 'service' (custom services) is resolved per request below.
];

/** The address line the online forms build: block & lot, street, compound, subdivision, zone. */
function pb2_walkin_address(array $r): string
{
    $parts = array_filter([$r['house_no'] ?? '', $r['block_lot'] ?? '', $r['street'] ?? '', $r['compound'] ?? '', $r['subdivision'] ?? ''],
        fn($p) => trim((string)$p) !== '');
    $line = implode(', ', $parts);
    if (trim((string)($r['zone'] ?? '')) !== '') $line .= ($line !== '' ? ', ' : '') . 'Zone ' . $r['zone'];
    return $line;
}

$action = $_GET['action'] ?? ($_POST['action'] ?? '');

// ---------------------------------------------------------------- search
if ($action === 'search') {
    $q = trim((string)($_GET['q'] ?? ''));
    if (mb_strlen($q) < 2) $respond(true, 'OK', ['residents' => []]);
    $like = '%' . $q . '%';
    $digits = preg_replace('/\D/', '', $q);
    $digitsLike = $digits !== '' ? '%' . $digits . '%' : '__no_match__';
    $stmt = $conn->prepare("SELECT r.resident_id, r.control_num, r.fName, r.mName, r.lName, r.suffix, r.birth_date, r.gender,
                                   r.civil_status, r.house_no, r.block_lot, r.street, r.compound, r.subdivision, r.zone,
                                   r.contact_num, r.residency_status, r.residing_since, r.height, r.blood_type,
                                   r.birth_city, r.birth_province, r.contact_person, r.contactp_num, r.contactp_relationship,
                                   r.valid_id_img_front, r.profile_picture, r.valid_id_img_holding
                              FROM residents r
                             WHERE r.status = 'Active'
                               AND (CONCAT_WS(' ', r.fName, r.mName, r.lName) LIKE ? OR CONCAT_WS(' ', r.lName, r.fName) LIKE ?
                                    OR r.control_num LIKE ? OR r.contact_num LIKE ?)
                             ORDER BY r.lName, r.fName LIMIT 10");
    $stmt->bind_param('ssss', $like, $like, $like, $digitsLike);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $out = array_map(function ($r) {
        $since = $r['residing_since'] ?? null;
        return [
            'resident_id'   => (int)$r['resident_id'],
            'control_num'   => $r['control_num'],
            'name'          => trim(preg_replace('/\s+/', ' ', "{$r['fName']} {$r['mName']} {$r['lName']} {$r['suffix']}")),
            'fName' => $r['fName'], 'mName' => $r['mName'], 'lName' => $r['lName'], 'suffix' => $r['suffix'],
            'birth_date'    => $r['birth_date'],
            'gender'        => $r['gender'],
            'civil_status'  => $r['civil_status'],
            'address'       => pb2_walkin_address($r),
            'contact_num'   => $r['contact_num'],
            'residency_status' => $r['residency_status'],
            'years_in_PB2'  => $since ? pb2_years_from_since($since) : null,
            'height'        => $r['height'],
            'blood_type'    => $r['blood_type'],
            'birth_place'   => trim(implode(', ', array_filter([$r['birth_city'], $r['birth_province']]))),
            'contact_person' => $r['contact_person'],
            'contactp_num'  => $r['contactp_num'],
            'contactp_relationship' => $r['contactp_relationship'],
            'has_id'        => !empty($r['valid_id_img_front']),
            'photo'         => ($r['profile_picture'] ?: $r['valid_id_img_holding']) ?: null,
        ];
    }, $rows);
    $respond(true, 'OK', ['residents' => $out]);
}

// ---------------------------------------------------------------- fees
if ($action === 'fees') {
    $fees = [];
    foreach (PB2_WALKIN_TYPES as $key => [$t, $label]) {
        $fees[$key] = ['label' => $label, 'amount' => (float)pb2_fee_get($conn, pb2_fee_key($key))['amount']];
    }
    $respond(true, 'OK', ['fees' => $fees]);
}

// ---------------------------------------------------------------- services
// Open custom services, with the questions asked of the applicant themself
// (a walk-in is always the person at the counter).
require_once __DIR__ . '/service_fields_common.php';
if ($action === 'services') {
    $rows = $conn->query("SELECT service_id, title, description FROM services WHERE is_active = 1 ORDER BY sort_order, title")->fetch_all(MYSQLI_ASSOC);
    $out = [];
    foreach ($rows as $s) {
        $sid = (int)$s['service_id'];
        $f = $conn->prepare("SELECT field_name, field_label, field_type, field_options, is_required, show_for_target, help_text
                               FROM service_fields WHERE service_id = ? ORDER BY sort_order ASC, field_id ASC");
        $f->bind_param('i', $sid);
        $f->execute();
        $fields = array_values(array_filter($f->get_result()->fetch_all(MYSQLI_ASSOC), fn($q) => pb2_sf_visible((string)$q['show_for_target'], 'Self')));
        $f->close();
        $out[] = [
            'service_id'  => $sid,
            'title'       => $s['title'],
            'description' => $s['description'],
            'fee'         => (float)pb2_fee_get($conn, pb2_fee_key('service', $sid))['amount'],
            'fields'      => array_map(fn($q) => [
                'name'     => $q['field_name'],
                'label'    => $q['field_label'],
                'type'     => $q['field_type'],
                'options'  => json_decode((string)$q['field_options'], true) ?: [],
                'required' => (int)$q['is_required'] === 1,
                'help'     => $q['help_text'],
            ], $fields),
        ];
    }
    $respond(true, 'OK', ['services' => $out]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || $action !== 'create') $respond(false, 'Unknown action.');

// ---------------------------------------------------------------- create
$in = fn($k) => trim((string)($_POST[$k] ?? ''));
$type = $in('type');
$service = null;
if ($type === 'service') {
    $sid = (int)$in('service_id');
    $st = $conn->prepare("SELECT service_id, title, is_active FROM services WHERE service_id = ?");
    $st->bind_param('i', $sid);
    $st->execute();
    $service = $st->get_result()->fetch_assoc();
    $st->close();
    if (!$service) $respond(false, 'Choose which service to request.');
    if (!(int)$service['is_active']) $respond(false, 'This service is closed and is not taking requests.');
    [$table, $label, $prefix] = ['service_submissions', $service['title'], 'REQ'];
    $feeKey = pb2_fee_key('service', (int)$service['service_id']);
} else {
    if (!isset(PB2_WALKIN_TYPES[$type])) $respond(false, 'Choose which document to request.');
    [$table, $label, $prefix] = PB2_WALKIN_TYPES[$type];
    $feeKey = pb2_fee_key($type);
}

// Who it is for: a registered resident (their record is used) or someone typed in.
$residentId = (int)$in('resident_id');
$idFront = $idBack = $idHolding = '';
if ($residentId) {
    $stmt = $conn->prepare("SELECT * FROM residents WHERE resident_id = ? AND status = 'Active'");
    $stmt->bind_param('i', $residentId);
    $stmt->execute();
    $res = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$res) $respond(false, 'That resident was not found or is not active.');
    $person = [
        'fName' => $res['fName'], 'mName' => $res['mName'], 'lName' => $res['lName'], 'suffix' => $res['suffix'],
        'birth_date' => $res['birth_date'], 'gender' => $res['gender'], 'civil_status' => $res['civil_status'],
        'address' => pb2_walkin_address($res),
    ];
    $idOnFile = pb2_resident_id_on_file($conn, $residentId);
    if ($idOnFile) {
        $idFront = (string)$idOnFile['front'];
        $idBack = (string)($idOnFile['back'] ?? '');
        $idHolding = (string)$idOnFile['holding'];
    }
    $yearsDefault = $res['residing_since'] ? pb2_years_from_since($res['residing_since']) : null;
} else {
    $person = pb2_caps_keys([
        'fName' => $in('fName'), 'mName' => $in('mName'), 'lName' => $in('lName'), 'suffix' => $in('suffix'),
        'birth_date' => $in('birth_date'), 'gender' => $in('gender'), 'civil_status' => $in('civil_status'),
        'address' => $in('address'),
    ], ['fName', 'mName', 'lName', 'address']);
    $missing = [];
    foreach (['fName' => 'first name', 'lName' => 'last name', 'gender' => 'sex', 'address' => 'address'] as $k => $l) {
        if ($person[$k] === '') $missing[] = $l;
    }
    if ($missing) $respond(false, 'Please enter the ' . implode(', ', $missing) . '.');
    if (!in_array($person['gender'], ['Male', 'Female'], true)) $respond(false, 'Please choose the sex.');
    if ($person['civil_status'] !== '' && !in_array($person['civil_status'], ['Single', 'Married', 'Widowed', 'Separated'], true)) {
        $respond(false, 'Please choose a valid civil status.');
    }
    if ($person['birth_date'] !== '') {
        $bd = DateTime::createFromFormat('Y-m-d', $person['birth_date']);
        if (!$bd || $bd->format('Y-m-d') !== $person['birth_date'] || $bd > new DateTime('today')) $respond(false, 'Please enter a valid birth date.');
    }
    // What each document prints (migration 050): the clearance prints the age
    // and civil status, the residency certificate the birth date and civil
    // status, the Barangay ID the birth date; the volunteer certificate and
    // custom services print the age and civil status (migration 051).
    if (in_array($type, ['clearance', 'residency', 'barangay_id', 'volunteer', 'service'], true) && $person['birth_date'] === '') {
        $respond(false, 'Please enter the birth date. It is printed on the ' . $label . '.');
    }
    if (in_array($type, ['clearance', 'residency', 'volunteer', 'service'], true) && $person['civil_status'] === '') {
        $respond(false, 'Please choose the civil status. It is printed on the ' . $label . '.');
    }
    $yearsDefault = null;
}
foreach (['mName', 'suffix', 'birth_date', 'civil_status'] as $k) {
    if (($person[$k] ?? '') === '') $person[$k] = null;
}

// The document's own fields.
$caps = fn($k) => $in($k) === '' ? null : pb2_caps($in($k));
$cols = [
    'resident_id' => $residentId ?: null,
    'fName' => $person['fName'], 'mName' => $person['mName'], 'lName' => $person['lName'],
    'address' => $person['address'],
    'status' => 'Processing', 'source' => 'walk_in', 'encoded_by' => $admin_id,
];
if ($type !== 'indigency') $cols['suffix'] = $person['suffix'];
if ($type !== 'volunteer') $cols['request_mode'] = 'Self'; // the volunteer table has no request_mode
$need = function (array $keys) use ($in, $respond) {
    $missing = [];
    foreach ($keys as $k => $l) if ($in($k) === '') $missing[] = $l;
    if ($missing) $respond(false, 'Please fill in: ' . implode(', ', $missing) . '.');
};
$uploadDir = null;
$serviceFiles = []; // custom-service answer files, removed if the save fails
$committed = false;
// Any later refusal (payment, pictures) ends the script: remove those files then.
register_shutdown_function(function () use (&$serviceFiles, &$committed) {
    if (!$committed && $serviceFiles) pb2_sf_discard($serviceFiles);
});
// A tracking code like the online forms' (PREFIX-YYYYMMDD-XXXXXX), unique in its table.
do {
    $code = $prefix . '-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
    $c = $conn->prepare("SELECT 1 FROM $table WHERE tracking_code = ? LIMIT 1");
    $c->bind_param('s', $code);
    $c->execute();
    $taken = (bool)$c->get_result()->fetch_row();
    $c->close();
} while ($taken);
$cols['tracking_code'] = $code;

switch ($type) {
    case 'clearance':
        $need(['purpose' => 'purpose']);
        if ($person['gender'] === null || $person['gender'] === '') $respond(false, 'Please choose the sex.');
        $cols += [
            'birth_date' => $person['birth_date'], 'gender' => $person['gender'], 'civil_status' => $person['civil_status'],
            'purpose' => pb2_caps($in('purpose')), 'precinct_no' => $caps('precinct_no'),
            'years_in_PB2' => $in('years_in_PB2') !== '' ? (int)$in('years_in_PB2') : $yearsDefault,
            'id_front' => $idFront, 'id_back' => $idBack ?: null, 'id_holding' => $idHolding,
        ];
        break;
    case 'residency':
        $need(['purpose' => 'purpose', 'residency_status' => 'residency status']);
        if (!in_array($in('residency_status'), ['Homeowner', 'Tenant', 'Sharer'], true)) $respond(false, 'Please choose the residency status.');
        $years = $in('years_in_PB2') !== '' ? (int)$in('years_in_PB2') : $yearsDefault;
        if ($years === null) $respond(false, 'Please enter how many years they have lived in Pasong Buaya II.');
        // "Married to ___" on the certificate: from the record for a resident,
        // typed in for someone not registered (migration 050).
        $spouse = $residentId ? (string)($res['spouse_name_text'] ?? '') : $in('spouse_name');
        if (!$residentId && in_array($person['civil_status'], ['Married', 'Separated'], true) && $spouse === '') {
            $respond(false, "Please enter the spouse's name. It is printed on the certificate.");
        }
        $cols += [
            'birth_date' => $person['birth_date'], 'gender' => $person['gender'], 'civil_status' => $person['civil_status'],
            'residency_status' => $in('residency_status'), 'years_in_PB2' => $years,
            'purpose' => pb2_caps($in('purpose')), 'valid_id' => $idFront,
            'proof_doc' => $residentId ? pb2_residence_evidence_path($conn, $residentId) : null,
            'spouse_name' => $spouse === '' ? null : pb2_caps($spouse),
        ];
        $uploadDir = 'uploads/Resident_DocumentRequests/Residency/walk_in/';
        break;
    case 'indigency':
        $need(['purpose' => 'purpose']);
        $income = $in('monthly_income') === '' ? null : filter_var($in('monthly_income'), FILTER_VALIDATE_FLOAT);
        if ($income === false || ($income !== null && $income < 0)) $respond(false, 'Please enter the monthly income as a number.');
        $cols += [
            'civil_status' => $person['civil_status'], 'monthly_income' => $income,
            'employment_status' => $in('employment_status') ?: null,
            'purpose' => $in('purpose'), 'purpose_details' => $caps('purpose_details'),
            'valid_id' => $idFront ?: null,
        ];
        break;
    case 'barangay_id':
        $need(['birth_place' => 'birth place', 'height' => 'height', 'weight' => 'weight', 'contact_person' => 'emergency contact person',
               'contactp_num' => 'emergency contact number', 'contactp_relationship' => 'relationship', 'emergency_address' => 'emergency contact address']);
        if (!$person['birth_date']) $respond(false, 'Please enter the birth date.');
        if (!preg_match('/^09\d{9}$/', $in('contactp_num'))) $respond(false, 'The emergency contact number must be 11 digits starting with 09.');
        if ($in('contact_num') !== '' && !preg_match('/^09\d{9}$/', $in('contact_num'))) $respond(false, 'The mobile number must be 11 digits starting with 09.');
        $cols += [
            'gender' => $person['gender'] ?: null, // printed on the card (migration 050)
            'birth_date' => $person['birth_date'], 'birth_place' => pb2_caps($in('birth_place')),
            'contact_num' => $in('contact_num') ?: null, 'height' => $in('height'), 'weight' => $in('weight'),
            'blood_type' => $in('blood_type') ?: null, 'tin_no' => $in('tin_no') ?: null,
            'contact_person' => pb2_caps($in('contact_person')), 'contactp_num' => $in('contactp_num'),
            'contactp_relationship' => pb2_caps($in('contactp_relationship')), 'emergency_address' => pb2_caps($in('emergency_address')),
        ];
        $uploadDir = 'uploads/Resident_DocumentRequests/Barangay_ID/walk_in/';
        break;
    case 'business_clearance':
        $need(['business_name' => 'business name', 'business_type' => 'business type', 'nature_business' => 'nature of business',
               'business_address' => 'business address', 'business_contact_num' => 'business contact number']);
        $cols += [
            'contact_num' => $in('contact_num') ?: null,
            'business_name' => pb2_caps($in('business_name')), 'business_type' => $in('business_type'),
            'nature_business' => pb2_caps($in('nature_business')), 'business_address' => pb2_caps($in('business_address')),
            'contact_person' => pb2_caps($in('contact_person') ?: trim($person['fName'] . ' ' . $person['lName'])),
            'business_contact_num' => $in('business_contact_num'),
            'owner_id' => $idFront, 'home_based' => $in('home_based') === '1' ? 1 : 0,
        ];
        break;
    case 'volunteer':
        // Same choices as src/pages/VolunteerRegistration.jsx.
        $need(['program_area' => 'volunteer area', 'availability' => 'availability', 'occupation' => 'occupation', 'skills' => 'skills']);
        if (!in_array($in('program_area'), ['Disaster Response', 'Health Programs', 'Youth & Education', 'Administrative'], true)) $respond(false, 'Please choose the volunteer area.');
        if (!in_array($in('availability'), ['Weekends', 'Weekdays', 'On-Call'], true)) $respond(false, 'Please choose when they are available.');
        $mobile = $residentId ? ($res['contact_num'] ?? null) : ($in('contact_num') ?: null);
        if ($mobile !== null && $mobile !== '' && !preg_match('/^09\d{9}$/', $mobile)) $respond(false, 'The mobile number must be 11 digits starting with 09.');
        $email = $in('email');
        if ($residentId) {
            $e = $conn->prepare("SELECT email FROM users WHERE user_id = ?");
            $e->bind_param('s', $res['user_id']);
            $e->execute();
            $email = (string)($e->get_result()->fetch_row()[0] ?? '');
            $e->close();
        } elseif ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $respond(false, 'Please enter a valid email address, or leave it empty.');
        }
        $cols += [
            'birth_date' => $person['birth_date'], 'gender' => $person['gender'] ?: null, 'civil_status' => $person['civil_status'],
            'contact_num' => $mobile ?: null, 'email' => $email === '' ? null : strtolower($email),
            'program_area' => $in('program_area'), 'availability' => $in('availability'),
            'occupation' => pb2_caps($in('occupation')), 'skills' => pb2_caps($in('skills')),
            'valid_id' => $idFront,
        ];
        break;
    case 'service':
        // The service's own questions, checked by the same rules as online
        // (service_fields_common.php). Files go under the resident's control
        // number, or WALK_IN for someone not registered.
        $sid = (int)$service['service_id'];
        $f = $conn->prepare("SELECT field_name, field_label, field_type, field_options, is_required, show_for_target, step_section
                               FROM service_fields WHERE service_id = ? ORDER BY sort_order ASC, field_id ASC");
        $f->bind_param('i', $sid);
        $f->execute();
        $fields = $f->get_result()->fetch_all(MYSQLI_ASSOC);
        $f->close();
        $answers = json_decode((string)($_POST['dynamic_fields'] ?? '{}'), true);
        if (!is_array($answers)) $answers = [];
        $folder = ($residentId && preg_match('/^[A-Za-z0-9-]+$/', (string)$res['control_num'])) ? $res['control_num'] : 'WALK_IN';
        $uploadDir = "uploads/Service_Requests/$folder/$code/";
        $collected = pb2_sf_collect($fields, $answers, 'Self', $uploadDir, 'dyn_');
        foreach (array_keys($collected['files']) as $path) $serviceFiles[] = $path;
        if (!$collected['ok']) {
            pb2_sf_discard($serviceFiles);
            $respond(false, $collected['message']);
        }
        $formData = [];
        $attachments = [];
        foreach ($collected['data'] as $a) {
            if ($a['type'] === 'file' && $a['value'] !== '') {
                $attachments[$a['name']] = $a['value'];
                $a['value'] = basename($a['value']);
            }
            $formData[] = $a;
        }
        $mobile = $residentId ? ($res['contact_num'] ?? null) : ($in('contact_num') ?: null);
        $cols += [
            'service_id' => $sid, 'service_title' => $service['title'],
            'user_id' => $residentId ? $res['user_id'] : null,
            'birth_date' => $person['birth_date'], 'gender' => $person['gender'] ?: null, 'civil_status' => $person['civil_status'],
            'contact_num' => $mobile ?: null,
            'beneficiary_name' => trim(implode(' ', array_filter([$person['fName'], $person['mName'], $person['lName'], $person['suffix']]))),
            'form_data' => json_encode($formData, JSON_UNESCAPED_UNICODE),
            'attachments' => $attachments ? json_encode($attachments, JSON_UNESCAPED_UNICODE) : null,
            'valid_id' => $idFront ?: null,
        ];
        break;
}
$notes = $in('notes');
if ($notes !== '' && $type !== 'indigency') $cols['remarks'] = mb_substr($notes, 0, 500);

// Payment at the counter.
$fee = pb2_fee_get($conn, $feeKey);
$amountDue = (float)$fee['amount'];
$payMode = $in('pay_mode') ?: 'unpaid';
if ($amountDue > 0) {
    if (!in_array($payMode, ['paid', 'waived', 'unpaid'], true)) $respond(false, 'Choose how the fee was settled.');
    if ($payMode === 'paid') {
        $or = strtoupper(preg_replace('/\s+/', '', $in('or_number')));
        if ($or === '') $respond(false, 'Please enter the O.R. number from the official receipt.');
        $chk = $conn->prepare("SELECT 1 FROM request_payments WHERE or_number = ? LIMIT 1");
        $chk->bind_param('s', $or);
        $chk->execute();
        if ($chk->get_result()->fetch_row()) $respond(false, "O.R. number $or is already recorded on another request.");
        $chk->close();
        $paid = filter_var($in('amount_paid') !== '' ? $in('amount_paid') : $amountDue, FILTER_VALIDATE_FLOAT);
        if ($paid === false || $paid <= 0) $respond(false, 'Please enter the amount paid.');
    } elseif ($payMode === 'waived' && $in('waive_reason') === '') {
        $respond(false, 'Please give the reason the fee is waived.');
    }
}

// Pictures printed on the document: the photo and signature on a Barangay ID
// card (required), and the photo on a Certificate of Residency for someone
// not registered (optional; a resident's own photo comes from their record).
$savedFiles = [];
$pictures = $type === 'barangay_id' ? ['id_picture' => ['photo', true], 'signature' => ['signature', true]]
    : (($type === 'residency' && !$residentId) ? ['photo' => ['photo', false]] : []);
if ($pictures) {
    $abs = __DIR__ . '/' . $uploadDir;
    if (!is_dir($abs)) mkdir($abs, 0755, true);
    foreach ($pictures as $key => [$what, $required]) {
        $f = $_FILES[$key] ?? null;
        if (!$f || $f['error'] === UPLOAD_ERR_NO_FILE) {
            if ($required) $respond(false, "Please add the $what for the $label.");
            continue;
        }
        if ($f['error'] !== UPLOAD_ERR_OK) $respond(false, "The $what could not be uploaded. Please try again.");
        if ($f['size'] > 10 * 1024 * 1024) $respond(false, "The $what must be 10 MB or smaller.");
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime] ?? null;
        if (!$ext) $respond(false, "The $what must be a JPEG, PNG or WebP image.");
        $name = $key . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        if (!move_uploaded_file($f['tmp_name'], $abs . $name)) $respond(false, "The $what could not be saved.");
        $savedFiles[] = $abs . $name;
        $cols[$key] = $uploadDir . $name;
    }
}

$conn->begin_transaction();
try {
    $names = array_keys($cols);
    $sql = "INSERT INTO $table (" . implode(', ', $names) . ") VALUES (" . implode(', ', array_fill(0, count($names), '?')) . ")";
    $stmt = $conn->prepare($sql);
    $vals = array_map(fn($v) => $v === null ? null : (string)$v, array_values($cols));
    $stmt->bind_param(str_repeat('s', count($vals)), ...$vals);
    $stmt->execute();
    $requestId = (int)$stmt->insert_id;
    $stmt->close();

    $payStatus = null;
    if ($amountDue > 0) {
        $payStatus = ['paid' => 'Paid', 'waived' => 'Waived', 'unpaid' => 'Unpaid'][$payMode];
        $orVal = $payMode === 'paid' ? $or : null;
        $paidVal = $payMode === 'paid' ? (float)$paid : null;
        $remarks = $payMode === 'waived' ? mb_substr($in('waive_reason'), 0, 500) : null;
        $rid = $residentId ?: null;
        $settled = $payMode !== 'unpaid';
        $p = $conn->prepare("INSERT INTO request_payments
            (request_type, request_id, tracking_code, resident_id, fee_key, amount_due, method, status, amount_paid, paid_on,
             or_number, remarks, verified_by, verified_at)
            VALUES (?, ?, ?, ?, ?, ?, 'hall', ?, ?, IF(? = 'Paid', CURDATE(), NULL), ?, ?, IF(?, ?, NULL), IF(?, NOW(), NULL))");
        $settledInt = $settled ? 1 : 0;
        $p->bind_param('sisisdsdsssiii', $type, $requestId, $code, $rid, $feeKey, $amountDue, $payStatus, $paidVal,
            $payStatus, $orVal, $remarks, $settledInt, $admin_id, $settledInt);
        $p->execute();
        $paymentId = (int)$p->insert_id;
        $p->close();
        pb2_payment_event($conn, $paymentId, 'walk_in', null, $payStatus,
            $payMode === 'paid' ? "Paid at the counter, O.R. $or" : ($payMode === 'waived' ? 'Waived at the counter: ' . $remarks : 'To be paid at the counter'),
            $admin_id);
    }
    $conn->commit();
    $committed = true;
} catch (Throwable $e) {
    $conn->rollback();
    foreach ($savedFiles as $f) @unlink($f);
    if ($serviceFiles) pb2_sf_discard($serviceFiles);
    error_log('admin_walkin_request: ' . $e->getMessage());
    $respond(false, 'The request could not be saved. Please check the details and try again.');
}

$who = trim($person['fName'] . ' ' . $person['lName']);
pb2_log_admin_action('document_request.walk_in.create', 'document_request', "$type:$requestId",
    "Encoded a walk-in $label for $who ($code)" . ($residentId ? '' : ' (not registered)')
    . ($payStatus ? ", fee $payStatus" . ($payMode === 'paid' ? " (O.R. $or)" : '') : ''),
    [['field' => 'status', 'old_value' => null, 'new_value' => 'Processing']]);

$respond(true, "$label saved for $who. Tracking code: $code.", [
    'request_id' => $requestId, 'tracking_code' => $code, 'type' => $label, 'payment_status' => $payStatus,
]);
