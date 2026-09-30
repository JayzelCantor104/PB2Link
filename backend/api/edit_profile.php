<?php
// Resident Edit Profile save (src/pages/Edit_profile.jsx). Field rules:
//   admin approval            name, PhilSys no., sectors, recorded move-in month
//   email code (+ approval)   birth date, sex  (profile_otp_common.php)
//   email code                address, emergency contact, email, mobile no.
//   saved immediately         civil status, religion, height, blood type, birthplace
//   change_password           current password + email code
// Codes are confirmed in verify_otp.php.
ini_set('display_errors', 0);
error_reporting(E_ALL);

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

// Hardened session cookie (auth_guard.php) — never a bare session_start().
require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

require_once '../db_connection.php';
require_once __DIR__ . '/profile_otp_common.php';

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Your session has expired. Please log in again.', 'auth_error' => true]);
    exit;
}

$user_id = $_SESSION['user_id'];
$raw_input = file_get_contents("php://input");
$data = json_decode($raw_input, true);

// 1. Handle background password verification step
if (isset($data['verify_password']) && $data['verify_password'] == '1') {
    $email = $data['email'] ?? '';
    $password = $data['password'] ?? '';
    
    $stmt = $conn->prepare("SELECT password_hash FROM users WHERE email = ? AND user_id = ?");
    $stmt->bind_param("si", $email, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 0) {
        echo json_encode(['success' => false, 'message' => 'Email does not match your account.']);
        exit;
    }
    
    $user = $result->fetch_assoc();
    if (!password_verify($password, $user['password_hash'])) {
        echo json_encode(['success' => false, 'message' => 'Incorrect password.']);
        exit;
    }
    
    echo json_encode(['success' => true, 'message' => 'Password verified successfully.']);
    exit;
}

if (!$data || !isset($data['update_profile'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid or empty data payload received.']);
    exit;
}

// Fetch current baseline data
$stmt = $conn->prepare("SELECT r.*, u.email, u.password_hash FROM residents r JOIN users u ON r.user_id = u.user_id WHERE r.user_id = ?");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$current_user = $stmt->get_result()->fetch_assoc();

if (!$current_user) {
    echo json_encode(['success' => false, 'message' => 'Resident profile record not found.']);
    exit;
}

// 2. Handle Password Change Action
if (isset($data['change_password']) && $data['change_password'] == '1') {
    $current_password = $data['current_password'] ?? '';
    $new_password = $data['new_password'] ?? '';
    
    if (!password_verify($current_password, $current_user['password_hash'])) {
        echo json_encode(['success' => false, 'message' => 'Current password is incorrect.']);
        exit;
    }
    
    // Same rule as registration (register.php / Register.jsx).
    if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/', $new_password)) {
        echo json_encode(['success' => false, 'message' => 'New password must be at least 8 characters with an uppercase letter, a number, and a special character (@$!%*?&).']);
        exit;
    }
    
    if (password_verify($new_password, $current_user['password_hash'])) {
        echo json_encode(['success' => false, 'message' => 'Your new password must be different from your current one.']);
        exit;
    }

    // The password only changes after the emailed code is entered
    // (verify_otp.php). Only the new password's hash waits here.
    $new_hash = password_hash($new_password, PASSWORD_DEFAULT);
    $sent_to = (string)$current_user['email'];
    [$challenge_id, $code] = pb2_otp_create($conn, $user_id, 'password', $sent_to, $new_hash);
    if (!pb2_otp_send_code($sent_to, $code, 'password')) {
        pb2_otp_cancel($conn, $user_id, 'password');
        echo json_encode(['success' => false, 'message' => 'We could not send the verification email. Please try again in a moment.']);
        exit;
    }
    echo json_encode([
        'success' => true,
        'requiresOtp' => true,
        'purpose' => 'password',
        'otp' => pb2_otp_summary($conn, $user_id, 'password'),
        'message' => 'We emailed you a verification code. Enter it to finish changing your password.'
    ]);
    exit;
}

// Validate overall transaction password authority
$submitted_password = $data['current_password'] ?? '';
if (!password_verify($submitted_password, $current_user['password_hash'])) {
    echo json_encode(['success' => false, 'message' => 'Security verification failed. Invalid password.']);
    exit;
}

// Sector membership (same is_* flags registration and announcements use)
// needs admin approval with each sector's document.
$admin_approval_fields = [
    'is_pwd', 'is_4ps', 'is_solo_parent', 'is_indigent'
];
// Email-code fields. The Personal Identity ones (PB2_OTP_REVIEW_FIELDS:
// name, suffix, birth date, sex, PhilSys no.) then also go to admin approval,
// since they were verified against the resident's ID at registration.
$otp_only_fields = array_merge(PB2_OTP_REVIEW_FIELDS, PB2_OTP_APPLY_FIELDS);
$direct_update_fields = [
    'religion', 'civil_status', 'spouse_name_text', 'height', 'blood_type',
    'birth_city', 'birth_province', 'birth_country',
];
// The move-in month (residing_since, migration 010) decides the under-6-months
// HOA rule, so it is handled separately below: a first entry (none on file)
// saves directly; changing a recorded month needs admin approval. years_in_PB2
// is always derived from it and never typed in.

// ---- Normalize + validate the submitted profile (mirrors register.php) ----
$flag_fields = ['is_pwd', 'is_4ps', 'is_solo_parent', 'is_indigent'];
foreach ($flag_fields as $f) {
    $v = $data[$f] ?? ($current_user[$f] ?? 0);
    $data[$f] = ($v === true || $v === 1 || $v === '1' || $v === 'true') ? '1' : '0';
    $current_user[$f] = (string)(int)($current_user[$f] ?? 0);
}
$val = function ($k) use (&$data) { return trim((string)($data[$k] ?? '')); };
foreach (['contact_num', 'contactp_num'] as $k) {
    $data[$k] = preg_replace('/\D/', '', $val($k));
}
$data['philsys_nat_id'] = preg_replace('/\D/', '', $val('philsys_nat_id'));
// Registration may have stored the number with dashes; compare digits to
// digits so an untouched number is never seen as a change.
$current_user['philsys_nat_id'] = preg_replace('/\D/', '', (string)($current_user['philsys_nat_id'] ?? ''));
// Registration stores these in uppercase (register.php); keep edits consistent
// so "Imus" vs "IMUS" isn't treated as a change or saved in mixed case.
foreach (['fName', 'mName', 'lName', 'spouse_name_text', 'religion', 'birth_city', 'birth_province', 'birth_country',
          'house_no', 'street', 'zone', 'subdivision', 'area', 'block_lot', 'landmark', 'contact_person', 'contactp_relationship'] as $k) {
    $data[$k] = function_exists('mb_strtoupper') ? mb_strtoupper($val($k), 'UTF-8') : strtoupper($val($k));
}

$fail = function ($msg) { echo json_encode(['success' => false, 'message' => $msg]); exit; };

foreach (['fName' => 'First name', 'lName' => 'Last name', 'religion' => 'Religion', 'birth_city' => 'Birth city',
          'birth_province' => 'Birth province', 'birth_country' => 'Birth country', 'street' => 'Street',
          'subdivision' => 'Subdivision', 'contact_person' => 'Emergency contact person',
          'contactp_relationship' => 'Emergency contact relationship'] as $k => $label) {
    if ($val($k) === '') $fail("$label is required.");
}
if ($val('house_no') === '' && $val('block_lot') === '') $fail('Please enter a House No. or a Block & Lot.');
if (!filter_var($val('email'), FILTER_VALIDATE_EMAIL)) $fail('Please enter a valid email address.');
if (!preg_match('/^09\d{9}$/', $data['contact_num'])) $fail('Mobile number must be 11 digits starting with 09.');
if (!preg_match('/^09\d{9}$/', $data['contactp_num'])) $fail('Emergency contact number must be 11 digits starting with 09.');
if (!in_array($val('gender'), ['Male', 'Female', 'Other'], true)) $fail('Please select a valid sex.');
if (!in_array($val('civil_status'), ['Single', 'Married', 'Widowed', 'Separated'], true)) $fail('Please select a valid civil status.');
if (!in_array($val('residency_status'), ['Homeowner', 'Tenant', 'Sharer'], true)) $fail('Please select a valid residency status.');
if ($val('suffix') !== '' && !in_array($val('suffix'), ['Jr.', 'Sr.', 'II', 'III', 'IV'], true)) $fail('Please select a valid suffix.');
if ($val('blood_type') !== '' && !in_array($val('blood_type'), ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], true)) $fail('Please select a valid blood type.');
if (in_array($val('civil_status'), ['Married', 'Separated'], true) && $val('spouse_name_text') === '') $fail("Please enter your spouse's name.");
$h = filter_var($val('height'), FILTER_VALIDATE_INT);
if ($h === false || $h < 50 || $h > 250) $fail('Height must be a whole number of centimeters between 50 and 250.');
require_once __DIR__ . '/residency_requirement.php';
$current_since = $current_user['residing_since'] ?? null;
$new_since = $current_since;
if ($val('residing_since') !== '') {
    $new_since = pb2_parse_residing_since($val('residing_since'));
    if (!$new_since) $fail('Please choose the month you started living in Pasong Buaya II (not in the future).');
}
$bd = DateTime::createFromFormat('Y-m-d', $val('birth_date'));
if (!$bd || $bd->format('Y-m-d') !== $val('birth_date') || $bd > new DateTime('today') || (int)$bd->format('Y') < 1900) $fail('Please enter a valid birth date.');
if ($data['philsys_nat_id'] !== '' && strlen($data['philsys_nat_id']) !== 16) $fail('PhilSys number must be 16 digits.');
if (!in_array($val('civil_status'), ['Married', 'Separated'], true)) $data['spouse_name_text'] = '';

// New email must not already belong to another account (users.email is UNIQUE).
if (strtolower($val('email')) !== strtolower((string)$current_user['email'])) {
    $dup = $conn->prepare("SELECT 1 FROM users WHERE email = ? AND user_id <> ?");
    $newEmail = strtolower($val('email'));
    $dup->bind_param("si", $newEmail, $user_id);
    $dup->execute();
    if ($dup->get_result()->num_rows > 0) $fail('That email address is already used by another account.');
    $data['email'] = $newEmail;
}

// Nullable columns: an emptied field is stored as NULL, not '' (which is not a
// valid value for the ENUM columns and reads as "set" elsewhere).
$nullable_fields = ['mName', 'suffix', 'philsys_nat_id', 'spouse_name_text', 'blood_type', 'house_no', 'zone',
                    'area', 'block_lot', 'landmark'];

$detected_changes = [];
$needs_otp = false;
$otp_fields_labels = [];
$admin_approval_changes = [];

// Track identity modifications requiring admin reviews
foreach ($admin_approval_fields as $field) {
    $submitted_value = $data[$field] ?? '';
    $current_db_value = $current_user[$field] ?? '';
    if (trim((string)$submitted_value) !== trim((string)$current_db_value)) {
        $admin_approval_changes[] = [
            'column' => $field,
            'old' => (string)$current_db_value,
            'new' => (string)$submitted_value
        ];
    }
}

// Track address variables and electronic contact nodes
$all_updatable_fields = array_merge($otp_only_fields, $direct_update_fields);
foreach ($all_updatable_fields as $column_name) {
    $submitted_value = $data[$column_name] ?? '';
    $current_db_value = $current_user[$column_name] ?? '';
    if (trim((string)$submitted_value) !== trim((string)$current_db_value)) {
        $requires_otp = in_array($column_name, $otp_only_fields);
        if ($requires_otp) {
            $needs_otp = true;
            $otp_fields_labels[] = PB2_OTP_FIELD_LABELS[$column_name] ?? $column_name;
        }
        $detected_changes[] = [
            'column' => $column_name,
            'old' => (string)$current_db_value,
            'new' => (string)$submitted_value,
            'requires_otp' => $requires_otp
        ];
    }
}

// Move-in month (see the note by $direct_update_fields).
if ($new_since !== null && $new_since !== $current_since) {
    if ($current_since === null) {
        $detected_changes[] = ['column' => 'residing_since', 'old' => '', 'new' => $new_since, 'requires_otp' => false];
        $detected_changes[] = ['column' => 'years_in_PB2', 'old' => (string)($current_user['years_in_PB2'] ?? ''),
                               'new' => (string)pb2_years_from_since($new_since), 'requires_otp' => false];
    } else {
        $admin_approval_changes[] = ['column' => 'residing_since', 'old' => (string)$current_since, 'new' => $new_since];
    }
}

if (empty($detected_changes) && empty($admin_approval_changes)) {
    echo json_encode(['success' => false, 'message' => 'No modifications detected.']);
    exit;
}

$submission_batch = time() . '_' . $user_id;

// Everything below is saved together or not at all: if the verification
// email can't be sent, the approval requests and direct edits are rolled back
// too (and any proof files saved for them are removed), so the resident never
// ends up with half a save.
$saved_proof_files = [];
$conn->begin_transaction();
$fail = function ($msg) use ($conn, &$saved_proof_files) {
    $conn->rollback();
    foreach ($saved_proof_files as $f) @unlink($f);
    echo json_encode(['success' => false, 'message' => $msg]);
    exit;
};

// --- STEP 1: SUPPORTING DOCUMENTS -------------------------------------------------
// Decodes a base64 upload and saves it under backend/uploads/proofs/ (where
// AdminProfileApprovals.jsx reads proofs from). Returns the stored path; ends
// the request (rolling everything back) if the file is unusable. The type is
// judged from the file's content, never the browser: this folder is
// web-served, so a client-chosen extension (e.g. .php) would be executable.
$save_proof = function ($encoded, $prefix, $label, $imagesOnly = false) use ($fail, $user_id, &$saved_proof_files) {
    $proof_data = (string)$encoded;
    if (strpos($proof_data, 'base64,') !== false) {
        $proof_data = explode('base64,', $proof_data, 2)[1];
    }
    $proof_binary = base64_decode($proof_data, true);
    if ($proof_binary === false || strlen($proof_binary) === 0) {
        $fail("The attached $label could not be read. Please attach it again.");
    }
    if (strlen($proof_binary) > 5 * 1024 * 1024) {
        $fail("The $label must be 5MB or smaller.");
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_buffer($finfo, $proof_binary) : false;
    if ($finfo) finfo_close($finfo);
    $extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!$imagesOnly) $extMap['application/pdf'] = 'pdf';
    if (!$mime || !isset($extMap[$mime])) {
        $fail($imagesOnly ? "The $label must be a JPEG, PNG, or WebP photo." : "The $label must be a JPEG, PNG, WebP image, or a PDF.");
    }

    $proof_filename = $prefix . '_' . preg_replace('/\D/', '', (string)$user_id) . '_' . time() . '.' . $extMap[$mime];
    $proof_dir = __DIR__ . '/../uploads/proofs/';
    if (!is_dir($proof_dir)) {
        mkdir($proof_dir, 0755, true);
    }
    if (file_put_contents($proof_dir . $proof_filename, $proof_binary) === false) {
        $fail("Unable to save the $label. Please try again.");
    }
    $saved_proof_files[] = $proof_dir . $proof_filename;
    return 'uploads/proofs/' . $proof_filename;
};

$changed_columns = array_merge(array_column($admin_approval_changes, 'column'), array_column($detected_changes, 'column'));

// Joining a sector needs that sector's own document, same as registration
// (register.php): PWD ID, 4Ps certification, Solo Parent ID, Certificate of
// Indigency. Leaving a sector needs no document.
$sector_proof_labels = [
    'is_pwd'         => 'PWD ID card',
    'is_4ps'         => '4Ps membership certification',
    'is_solo_parent' => 'Solo Parent ID / social worker certification',
    'is_indigent'    => 'Barangay Certificate of Indigency',
];
$sector_proofs = is_array($data['sector_proofs'] ?? null) ? $data['sector_proofs'] : [];
$joined_sectors = [];
foreach ($admin_approval_changes as $c) {
    if (isset($sector_proof_labels[$c['column']]) && $c['new'] === '1') $joined_sectors[] = $c['column'];
}

// Name changes are backed by one general supporting document.
$name_fields = ['fName', 'mName', 'lName', 'suffix'];
$needs_name_proof = (bool)array_intersect($name_fields, $changed_columns);

// Entering or changing a PhilSys number needs photos of the card's front and back.
$needs_philsys_photos = in_array('philsys_nat_id', $changed_columns, true) && $data['philsys_nat_id'] !== '';

// Check every required document is attached before saving any of them.
foreach ($joined_sectors as $flag) {
    if (empty($sector_proofs[$flag])) $fail("Please attach your {$sector_proof_labels[$flag]}.");
}
if ($needs_name_proof && empty($data['proof_document'])) {
    $fail('Please attach a supporting document for your name change.');
}
if ($needs_philsys_photos && (empty($data['philsys_img_front']) || empty($data['philsys_img_back']))) {
    $fail('Please add photos of the front and back of your PhilSys (National ID) card.');
}

// A scanned card is re-checked here, on the server (philsys_scan_common.php):
// the photo must be the one scanned, its printed number must be the one
// submitted, and its printed name must match this profile. A mismatch stops
// the change. A match lets it apply right after the email code; a number
// typed by hand (scan unavailable) goes to staff instead.
$philsys_verified_by_scan = 0;
$philsys_scan_token = null;
if ($needs_philsys_photos && !empty($data['philsys_scan_token'])) {
    require_once __DIR__ . '/philsys_scan_common.php';
    $front_data = (string)$data['philsys_img_front'];
    if (strpos($front_data, 'base64,') !== false) $front_data = explode('base64,', $front_data, 2)[1];
    $front_binary = (string)base64_decode($front_data, true);
    $check = pb2_philsys_verify($conn, (string)$data['philsys_scan_token'], $front_binary, $data['philsys_nat_id'],
        (string)$current_user['fName'], $current_user['mName'] ?? null, (string)$current_user['lName']);
    if ($check['status'] === 'Mismatch') {
        $fail($check['reason'] . ' Your PhilSys number change was not submitted.');
    }
    if ($check['status'] !== 'Matched') {
        $fail('Your card scan has expired or does not match this photo. Please scan the front of your PhilSys card again.');
    }
    $philsys_verified_by_scan = 1;
    $philsys_scan_token = (string)$data['philsys_scan_token'];
}

$sector_proof_paths = [];
foreach ($joined_sectors as $flag) {
    $sector_proof_paths[$flag] = $save_proof($sector_proofs[$flag], 'sector_' . substr($flag, 3), $sector_proof_labels[$flag]);
}
$proof_document_path = $needs_name_proof ? $save_proof($data['proof_document'], 'proof', 'supporting document') : null;
$philsys_front_path = $needs_philsys_photos ? $save_proof($data['philsys_img_front'], 'philsys_front', 'PhilSys card photo (front)', true) : null;
$philsys_back_path = $needs_philsys_photos ? $save_proof($data['philsys_img_back'], 'philsys_back', 'PhilSys card photo (back)', true) : null;

// Documents that travel with each change row: [front/only document, back].
$row_documents = function ($column) use ($sector_proof_paths, $name_fields, $proof_document_path, $philsys_front_path, $philsys_back_path) {
    if (isset($sector_proof_paths[$column])) return [$sector_proof_paths[$column], null];
    if (in_array($column, $name_fields, true)) return [$proof_document_path, null];
    if ($column === 'philsys_nat_id') return [$philsys_front_path, $philsys_back_path];
    return [null, null];
};

// Sector changes go straight to admin approval. A newer request for the same
// field replaces the one still waiting.
if (!empty($admin_approval_changes)) {
    $clear_prev = $conn->prepare("DELETE FROM pending_profile_changes WHERE user_id = ? AND field_name = ? AND status = 'pending_approval'");
    $log_stmt = $conn->prepare("INSERT INTO pending_profile_changes (user_id, field_name, old_value, new_value, change_type, status, submission_batch, proof_document) VALUES (?, ?, ?, ?, 'other', 'pending_approval', ?, ?)");
    foreach ($admin_approval_changes as $change) {
        $column_name = $change['column'];
        [$row_proof] = $row_documents($column_name);
        $clear_prev->bind_param("is", $user_id, $column_name);
        $clear_prev->execute();
        $log_stmt->bind_param("isssss", $user_id, $column_name, $change['old'], $change['new'], $submission_batch, $row_proof);
        $log_stmt->execute();
    }
}

// --- STEP 2: DIRECT FIELDS NOW, EMAIL-CODE FIELDS HELD FOR THE CODE ---
$otp_queue = array_values(array_filter($detected_changes, function ($c) { return $c['requires_otp']; }));
$direct_queue = array_values(array_filter($detected_changes, function ($c) { return !$c['requires_otp']; }));

// A. Direct fields go live now (still inside the transaction).
$direct_update_ok = true;
foreach ($direct_queue as $change) {
    $column_name = $change['column'];
    $new_value = ($change['new'] === '' && in_array($column_name, $nullable_fields, true)) ? null : $change['new'];

    $direct_update = $conn->prepare("UPDATE residents SET `$column_name` = ? WHERE user_id = ?");
    $direct_update->bind_param("si", $new_value, $user_id);
    $direct_update_ok = $direct_update->execute() && $direct_update_ok;

    // History row, marked as already applied.
    $history_stmt = $conn->prepare("INSERT INTO pending_profile_changes (user_id, field_name, old_value, new_value, change_type, status, submission_batch) VALUES (?, ?, ?, ?, 'other', 'approved', ?)");
    $history_stmt->bind_param("issss", $user_id, $column_name, $change['old'], $change['new'], $submission_batch);
    $history_stmt->execute();
}
if (!$direct_update_ok) {
    $fail('We could not save your changes. Please try again.');
}

// B. Email-code fields are held as 'pending_otp' until verify_otp.php.
//    When the email itself is changing, the code goes to the NEW address —
//    entering it proves the resident owns that inbox. The old address is
//    told about the change once it's confirmed.
$sent_to = null;
if ($otp_queue) {
    $sent_to = (string)$current_user['email'];
    foreach ($otp_queue as $change) {
        if ($change['column'] === 'email') $sent_to = $change['new'];
    }

    [$challenge_id, $code] = pb2_otp_create($conn, $user_id, 'profile', $sent_to);

    $hold_stmt = $conn->prepare("INSERT INTO pending_profile_changes (user_id, field_name, old_value, new_value, change_type, status, submission_batch, challenge_id, proof_document, proof_document_back, verified_by_scan) VALUES (?, ?, ?, ?, ?, 'pending_otp', ?, ?, ?, ?, ?)");
    foreach ($otp_queue as $change) {
        $column_name = $change['column'];
        $change_type = $column_name === 'email' ? 'email' : ($column_name === 'contact_num' ? 'phone' : 'other');
        // Name / PhilSys documents stay on the row, so staff see them once the
        // code moves it on to admin approval (verify_otp.php).
        [$doc_front, $doc_back] = $row_documents($column_name);
        $row_verified = $column_name === 'philsys_nat_id' ? $philsys_verified_by_scan : 0;
        $hold_stmt->bind_param("isssssissi", $user_id, $column_name, $change['old'], $change['new'], $change_type, $submission_batch, $challenge_id, $doc_front, $doc_back, $row_verified);
        if (!$hold_stmt->execute()) {
            $fail('We could not save your changes. Please try again.');
        }
    }

    if (!pb2_otp_send_code($sent_to, $code, 'profile', $otp_fields_labels)) {
        $fail('We could not send the verification email to ' . pb2_otp_mask_email($sent_to) . '. Nothing was saved — please check the address and try again.');
    }
}

$conn->commit();

// The scan backed this submission; it can't back another.
if ($philsys_scan_token !== null) {
    pb2_scan_mark_used($conn, $philsys_scan_token);
}

// --- STEP 3: RESPONSE ---
$final_message = "Profile changes updated successfully!";
if ($otp_queue) {
    $final_message = "We emailed a verification code to " . pb2_otp_mask_email($sent_to) . ". Enter it to finish your changes.";
} elseif (!empty($admin_approval_changes)) {
    $final_message = "Identity changes logged. Document proof queued for administrative verification.";
}

echo json_encode([
    'success' => true,
    'requiresOtp' => !empty($otp_queue),
    'purpose' => 'profile',
    'otp' => $otp_queue ? pb2_otp_summary($conn, $user_id, 'profile') : null,
    'hasAdminApproval' => !empty($admin_approval_changes),
    'message' => $final_message
]);
exit;
