<?php
// Resident submission for an admin-defined ("custom") service
// (src/pages/DynamicRequestForm.jsx). Stored in service_submissions, which the
// admin Documents page and the resident's Track Request page list alongside
// the built-in request types. Schema: backend/migrations/007_custom_services.sql
//
// Multipart POST:
//   service_id, tracking_code, request_mode (Self | Others)
//   Others only: fName, mName, lName, suffix, birth_date, gender, civil_status, contact_num, address
//   dynamic_fields  JSON { field_name: value | [values] }   (non-file fields)
//   owner_id        required valid-ID upload
//   dyn_<field_name> uploads for the service's "file" fields
ob_start();
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

$saved_files = [];
$respond = function (bool $success, string $message, array $extra = []) use (&$saved_files) {
    if (!$success) {
        foreach ($saved_files as $p) @unlink($p);
    }
    ob_end_clean();
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit();
};

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    $respond(false, 'Invalid request method.');
}
// The resident is always the signed-in session user, never a form field.
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    $respond(false, 'Your session has expired. Please log in again.', ['auth_error' => true]);
}
$user_id = $_SESSION['user_id'];

require_once '../db_connection.php';
require __DIR__ . '/vendor/autoload.php';
if (!$conn) {
    $respond(false, 'Database connection failed.');
}

$post = function ($k) { return trim((string)($_POST[$k] ?? '')); };
$upper = function ($v) { return function_exists('mb_strtoupper') ? mb_strtoupper((string)$v, 'UTF-8') : strtoupper((string)$v); };

// ---- Resident (from the session) ----------------------------------------------
$stmt = $conn->prepare("SELECT r.resident_id, r.control_num, r.fName, r.mName, r.lName, r.suffix, r.birth_date, r.gender,
                               r.civil_status, r.contact_num, r.house_no, r.block_lot, r.street, r.subdivision, r.zone, u.email
                        FROM residents r JOIN users u ON u.user_id = r.user_id WHERE r.user_id = ?");
$stmt->bind_param("s", $user_id);
$stmt->execute();
$resident = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$resident) {
    $respond(false, 'Resident profile not found.');
}

// ---- Service ---------------------------------------------------------------------
$service_id = (int)$post('service_id');
$stmt = $conn->prepare("SELECT service_id, title, allow_third_party, is_active FROM services WHERE service_id = ?");
$stmt->bind_param("i", $service_id);
$stmt->execute();
$service = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$service) {
    $respond(false, 'This service does not exist.');
}
if (!(int)$service['is_active']) {
    $respond(false, 'This service is no longer accepting requests.');
}

$request_mode = $post('request_mode') === 'Others' ? 'Others' : 'Self';
if ($request_mode === 'Others' && !(int)$service['allow_third_party']) {
    $respond(false, 'This service can only be requested for yourself.');
}

// ---- Applicant ----------------------------------------------------------------------
if ($request_mode === 'Self') {
    $applicant = [
        'fName' => $resident['fName'], 'mName' => $resident['mName'], 'lName' => $resident['lName'],
        'suffix' => $resident['suffix'], 'birth_date' => $resident['birth_date'], 'gender' => $resident['gender'],
        'civil_status' => $resident['civil_status'], 'contact_num' => $resident['contact_num'],
        'address' => implode(', ', array_filter([$resident['house_no'], $resident['block_lot'], $resident['street'], $resident['subdivision'],
            $resident['zone'] ? (ctype_digit((string)$resident['zone']) ? 'Zone ' . $resident['zone'] : $resident['zone']) : ''])),
    ];
} else {
    $applicant = [
        'fName' => $upper($post('fName')), 'mName' => $upper($post('mName')), 'lName' => $upper($post('lName')),
        'suffix' => $post('suffix'), 'birth_date' => $post('birth_date'), 'gender' => $post('gender'),
        'civil_status' => $post('civil_status'), 'contact_num' => preg_replace('/\D/', '', $post('contact_num')),
        'address' => $upper($post('address')),
    ];
    if ($applicant['fName'] === '' || $applicant['lName'] === '') $respond(false, "Please enter the person's first and last name.");
    $bd = DateTime::createFromFormat('Y-m-d', $applicant['birth_date']);
    if (!$bd || $bd->format('Y-m-d') !== $applicant['birth_date'] || $bd > new DateTime('today')) $respond(false, "Please enter the person's valid birth date.");
    if (!in_array($applicant['gender'], ['Male', 'Female'], true)) $respond(false, "Please select the person's sex.");
    if (!in_array($applicant['civil_status'], ['Single', 'Married', 'Widowed', 'Separated'], true)) $respond(false, "Please select the person's civil status.");
    if ($applicant['address'] === '') $respond(false, "Please enter the person's address.");
    if ($applicant['contact_num'] !== '' && !preg_match('/^09\d{9}$/', $applicant['contact_num'])) $respond(false, "The person's mobile number must be 11 digits starting with 09.");
    if ($applicant['suffix'] !== '' && !in_array($applicant['suffix'], ['Jr.', 'Sr.', 'II', 'III', 'IV'], true)) $applicant['suffix'] = '';
}
$beneficiary_name = trim(implode(' ', array_filter([$applicant['fName'], $applicant['mName'], $applicant['lName'], $applicant['suffix']])));

// ---- Tracking code: keep the client's if well-formed and unused ---------------
$exists = function ($code) use ($conn) {
    $q = $conn->prepare("SELECT 1 FROM service_submissions WHERE tracking_code = ?");
    $q->bind_param("s", $code);
    $q->execute();
    $found = $q->get_result()->num_rows > 0;
    $q->close();
    return $found;
};
$tracking_code = strtoupper($post('tracking_code'));
if (!preg_match('/^REQ-[A-Z0-9-]{6,40}$/', $tracking_code) || $exists($tracking_code)) {
    do {
        $tracking_code = 'REQ-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
    } while ($exists($tracking_code));
}

// ---- Uploads ----------------------------------------------------------------------
$control_num = preg_match('/^[A-Za-z0-9-]+$/', (string)$resident['control_num']) ? $resident['control_num'] : 'UNASSIGNED';
$upload_dir = "uploads/Service_Requests/" . $control_num . "/" . $tracking_code . "/";
$extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];

// Returns the saved path, null when no file was sent; fails the request on a bad file.
$save_upload = function ($key, $basename, $label) use (&$saved_files, $upload_dir, $extMap, $respond) {
    $file = $_FILES[$key] ?? null;
    if (!$file || $file['error'] === UPLOAD_ERR_NO_FILE) return null;
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 10 * 1024 * 1024) {
        $respond(false, "$label could not be uploaded. Files must be 10MB or smaller.");
    }
    // Type from the file's content, never its name — this folder is web-served.
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
    if ($finfo) finfo_close($finfo);
    if (!$mime || !isset($extMap[$mime])) {
        $respond(false, "$label must be a JPEG, PNG, WebP image, or a PDF.");
    }
    if (!is_dir($upload_dir) && !mkdir($upload_dir, 0755, true)) {
        $respond(false, 'Unable to prepare the upload folder. Please try again.');
    }
    $dest = $upload_dir . $basename . '.' . $extMap[$mime];
    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        $respond(false, "Unable to save $label. Please try again.");
    }
    $saved_files[] = $dest;
    return $dest;
};

// ---- Custom fields (validated against the service's own definition) ----------------
$stmt = $conn->prepare("SELECT field_name, field_label, field_type, field_options, is_required, show_for_target, step_section
                        FROM service_fields WHERE service_id = ? ORDER BY sort_order ASC, field_id ASC");
$stmt->bind_param("i", $service_id);
$stmt->execute();
$fields = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

$answers = json_decode((string)($_POST['dynamic_fields'] ?? '{}'), true);
if (!is_array($answers)) $answers = [];

$form_data = [];
$attachments = [];
foreach ($fields as $f) {
    $target = $f['show_for_target'];
    // Accept the older 'myself' / 'third_party' spellings too.
    $visible = $target === 'all' || $target === ''
        || (in_array($target, ['myself_only', 'myself'], true) && $request_mode === 'Self')
        || (in_array($target, ['someone_else_only', 'third_party'], true) && $request_mode === 'Others');
    if (!$visible) continue;

    $name = $f['field_name'];
    $label = $f['field_label'];
    $type = $f['field_type'];
    $required = (int)$f['is_required'] === 1;
    $options = json_decode((string)$f['field_options'], true);
    if (!is_array($options)) $options = [];

    if ($type === 'file') {
        $path = $save_upload('dyn_' . $name, 'field_' . preg_replace('/[^a-z0-9_]/', '', $name), $label);
        if ($required && !$path) $respond(false, "Please upload: $label.");
        if ($path) $attachments[$name] = $path;
        $form_data[] = ['name' => $name, 'label' => $label, 'type' => $type, 'step' => $f['step_section'], 'value' => $path ? basename($path) : ''];
        continue;
    }

    $raw = $answers[$name] ?? '';
    if ($type === 'checkbox') {
        $values = is_array($raw) ? $raw : ($raw === '' ? [] : [$raw]);
        $values = array_values(array_filter(array_map(function ($v) { return trim((string)$v); }, $values), 'strlen'));
        if ($options) $values = array_values(array_intersect($values, $options));
        if ($required && !$values) $respond(false, "Please complete: $label.");
        $value = implode(', ', $values);
    } else {
        $value = trim(is_array($raw) ? implode(', ', $raw) : (string)$raw);
        if ($required && $value === '') $respond(false, "Please complete: $label.");
        if ($value !== '') {
            if (in_array($type, ['select', 'radio'], true) && $options && !in_array($value, $options, true)) $respond(false, "Please choose a valid option for: $label.");
            if ($type === 'number' && !is_numeric($value)) $respond(false, "$label must be a number.");
            if ($type === 'date' && !DateTime::createFromFormat('Y-m-d', $value)) $respond(false, "$label must be a valid date.");
            if ($type === 'time' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value)) $respond(false, "$label must be a valid time.");
            if (mb_strlen($value) > ($type === 'textarea' ? 5000 : 500)) $respond(false, "$label is too long.");
        }
    }
    $form_data[] = ['name' => $name, 'label' => $label, 'type' => $type, 'step' => $f['step_section'], 'value' => $value];
}

// Valid ID of the applicant (always required).
$valid_id = $save_upload('owner_id', 'valid_id', 'The valid ID');
if (!$valid_id) {
    $respond(false, 'Please upload a valid ID.');
}

// ---- Save ------------------------------------------------------------------------
$form_json = json_encode($form_data, JSON_UNESCAPED_UNICODE);
$attach_json = $attachments ? json_encode($attachments, JSON_UNESCAPED_UNICODE) : null;
$bd_val = $applicant['birth_date'] ?: null;
$mName = $applicant['mName'] ?: null;
$suffix = $applicant['suffix'] ?: null;
$resident_id = (int)$resident['resident_id'];

$ins = $conn->prepare("INSERT INTO service_submissions
    (tracking_code, service_id, service_title, resident_id, user_id, request_mode, fName, mName, lName, suffix,
     birth_date, gender, civil_status, address, contact_num, beneficiary_name, form_data, valid_id, attachments, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')");
$ins->bind_param("sisisssssssssssssss",
    $tracking_code, $service_id, $service['title'], $resident_id, $user_id, $request_mode,
    $applicant['fName'], $mName, $applicant['lName'], $suffix,
    $bd_val, $applicant['gender'], $applicant['civil_status'], $applicant['address'], $applicant['contact_num'],
    $beneficiary_name, $form_json, $valid_id, $attach_json);
if (!$ins->execute()) {
    error_log('submit_service_request.php insert failed: ' . $ins->error);
    @rmdir($upload_dir);
    $respond(false, 'We could not save your request. Please try again.');
}
$ins->close();

// ---- Confirmation email (best effort) ---------------------------------------------
if (!empty($resident['email'])) {
    $e = function ($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); };
    try {
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = 'smtp.gmail.com';
        $mail->SMTPAuth = true;
        $mail->Username = SMTP_USER;
        $mail->Password = SMTP_PASS;
        $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        $mail->Port = 465;
        $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
        $mail->addAddress($resident['email']);
        $mail->isHTML(true);
        $mail->Subject = "Request Received [$tracking_code]";
        $mail->Body = "
            <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                <h2 style='color: #064e3b; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Request Received</h2>
                <p>We received your request for <strong>{$e($service['title'])}</strong>" . ($request_mode === 'Others' ? " on behalf of <strong>{$e($beneficiary_name)}</strong>" : '') . ".</p>
                <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                    <p><strong>Tracking Code:</strong> <span style='color: #059669; font-weight: bold;'>{$e($tracking_code)}</span></p>
                    <p><strong>Status:</strong> Pending review</p>
                </div>
                <p>You can follow its progress on the Track Request page.</p>
                <p>Thank you,<br>Barangay Pasong Buaya II Administration</p>
            </div>";
        $mail->send();
    } catch (Exception $ex) {
        error_log('Service request confirmation email failed: ' . $ex->getMessage());
    }
}

$respond(true, 'Your request has been submitted.', ['tracking_code' => $tracking_code]);
