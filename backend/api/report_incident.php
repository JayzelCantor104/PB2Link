<?php
// Citizen incident report submission (src/pages/IncidentReport.jsx).
//
// The reporter is always the signed-in resident (session), never a user_id
// sent by the browser. Reporter name/address/contact/email are read from
// their resident record here too, so a report can't be filed under someone
// else's identity. Schema: backend/migrations/006_fix_incident_reports_columns.sql
ob_start();
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

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
    $respond(false, 'Your session has expired. Please log in again to submit a report.', ['auth_error' => true]);
}
$user_id = $_SESSION['user_id'];

include "../db_connection.php";
require __DIR__ . '/vendor/autoload.php';

// Keep these lists in sync with the <select> options in IncidentReport.jsx.
$INCIDENT_CLASSES = ['Health & Safety', 'Security', 'Environmental & Infrastructure', 'Others'];
$REPORTING_CLASSES = ['Accident Report', 'Near Miss Report', 'Hazard Report', 'Complaint Report', 'Suspicious Activity Report', 'Others'];

$post = function ($key) { return trim((string)($_POST[$key] ?? '')); };

$incident_address      = $post('incident_address');
$description           = $post('description');
$incident_class        = $post('incident_class');
$reporting_class       = $post('reporting_class');
$contact_person_name   = $post('contact_person_name');
$contact_person_number = preg_replace('/\D/', '', $post('contact_person_number'));

if ($incident_address === '' || $description === '') {
    $respond(false, 'Please provide the incident location and a description.');
}
if (!in_array($incident_class, $INCIDENT_CLASSES, true)) {
    $respond(false, 'Please select a valid incident classification.');
}
if (!in_array($reporting_class, $REPORTING_CLASSES, true)) {
    $respond(false, 'Please select a valid reporting type.');
}
if ($contact_person_number !== '' && !preg_match('/^09\d{9}$/', $contact_person_number)) {
    $respond(false, "The involved person's contact number must be 11 digits starting with 09.");
}
if (mb_strlen($incident_address) > 255 || mb_strlen($contact_person_name) > 255) {
    $respond(false, 'The incident address or involved person name is too long.');
}

// --- Reporter identity comes from the resident record ------------------------
$stmt = $conn->prepare("SELECT r.control_num, r.fName, r.mName, r.lName, r.suffix, r.house_no, r.block_lot, r.street,
                               r.subdivision, r.zone, r.contact_num, u.email
                        FROM residents r JOIN users u ON u.user_id = r.user_id WHERE r.user_id = ?");
$stmt->bind_param("s", $user_id);
$stmt->execute();
$resident = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$resident) {
    $respond(false, 'Resident profile record not found.');
}

$reporter_name = trim(implode(' ', array_filter([$resident['fName'], $resident['mName'], $resident['lName'], $resident['suffix']])));
$reporter_address = implode(', ', array_filter([
    $resident['house_no'], $resident['block_lot'], $resident['street'], $resident['subdivision'],
    // "3" -> "Zone 3", but "PUROK 3" stays as typed
    $resident['zone'] ? (ctype_digit((string)$resident['zone']) ? 'Zone ' . $resident['zone'] : $resident['zone']) : '',
]));
$reporter_contact = (string)$resident['contact_num'];
$reporter_email = (string)$resident['email'];

// --- Tracking code: accept the client's if well-formed and unused -------------
$exists = function ($code) use ($conn) {
    $q = $conn->prepare("SELECT 1 FROM incident_reports WHERE track_code = ?");
    $q->bind_param("s", $code);
    $q->execute();
    $found = $q->get_result()->num_rows > 0;
    $q->close();
    return $found;
};
$track_code = strtoupper($post('track_code'));
if (!preg_match('/^INC-[A-Z0-9-]{6,40}$/', $track_code) || $exists($track_code)) {
    do {
        $track_code = 'INC-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3)));
    } while ($exists($track_code));
}

// --- Attachments -------------------------------------------------------------
$file_post = $_FILES['attachment'] ?? null;
if (!$file_post || empty($file_post['name']) || (is_array($file_post['name']) && count(array_filter($file_post['name'])) === 0)) {
    $respond(false, 'Please attach at least one photo or video as evidence.');
}
$files = [];
if (is_array($file_post['name'])) {
    foreach ($file_post['name'] as $i => $name) {
        $files[] = ['name' => $name, 'tmp_name' => $file_post['tmp_name'][$i], 'size' => $file_post['size'][$i], 'error' => $file_post['error'][$i]];
    }
} else {
    $files[] = $file_post;
}
if (count($files) > 10) {
    $respond(false, 'You can attach a maximum of 10 files.');
}

$mimeMap = ['image/jpeg' => ['jpg', 'image'], 'image/png' => ['png', 'image'], 'video/mp4' => ['mp4', 'video']];
$validated = [];
foreach ($files as $file) {
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $respond(false, "\"{$file['name']}\" could not be uploaded. Files must be 10MB or smaller.");
    }
    if ($file['size'] > 10 * 1024 * 1024) {
        $respond(false, "\"{$file['name']}\" exceeds the 10MB limit.");
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
    if ($finfo) finfo_close($finfo);
    if (!$mime || !isset($mimeMap[$mime])) {
        $respond(false, "\"{$file['name']}\" is not a supported file. Only JPG, PNG, and MP4 are allowed.");
    }
    $validated[] = ['tmp' => $file['tmp_name'], 'ext' => $mimeMap[$mime][0], 'kind' => $mimeMap[$mime][1]];
}

$control_num = preg_match('/^[A-Za-z0-9-]+$/', (string)$resident['control_num']) ? $resident['control_num'] : 'UNASSIGNED';
$upload_dir = "uploads/Incident_Reports/" . $control_num . "/" . $track_code . "/";
if (!is_dir($upload_dir) && !mkdir($upload_dir, 0755, true)) {
    $respond(false, 'Unable to prepare the upload folder. Please try again.');
}

$uploaded_paths = [];
$attachment_type = 'image';
foreach ($validated as $f) {
    $target = $upload_dir . uniqid('incident_', true) . '.' . $f['ext'];
    if (!move_uploaded_file($f['tmp'], $target)) {
        foreach ($uploaded_paths as $p) @unlink($p);
        $respond(false, 'Unable to save your attachments. Please try again.');
    }
    $uploaded_paths[] = $target;
    if ($f['kind'] === 'video') $attachment_type = 'video';
}
$attachments = implode(',', $uploaded_paths);

// --- Save -----------------------------------------------------------------
$status = 'Pending';
$ins = $conn->prepare("INSERT INTO incident_reports
    (track_code, user_id, reporter_name, reporter_address, reporter_contact, reporter_email,
     contact_person_name, contact_person_number, incident_address, description,
     incident_class, reporting_class, status, attachment_path, attachment_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
$ins->bind_param("sssssssssssssss",
    $track_code, $user_id, $reporter_name, $reporter_address, $reporter_contact, $reporter_email,
    $contact_person_name, $contact_person_number, $incident_address, $description,
    $incident_class, $reporting_class, $status, $attachments, $attachment_type);

if (!$ins->execute()) {
    error_log('report_incident.php insert failed: ' . $ins->error);
    foreach ($uploaded_paths as $p) @unlink($p);
    @rmdir($upload_dir);
    $respond(false, 'We could not save your report. Please try again.');
}
$incident_id = $ins->insert_id;
$ins->close();

// --- Confirmation email (best effort) ------------------------------------------
if ($reporter_email !== '') {
    $e = function ($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); };
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = 'smtp.gmail.com';
        $mail->SMTPAuth = true;
        $mail->Username = SMTP_USER;
        $mail->Password = SMTP_PASS;
        $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        $mail->Port = 465;
        $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
        $mail->addAddress($reporter_email);
        $mail->isHTML(true);
        $mail->Subject = "Incident Report Received [$track_code]";
        $mail->Body = "
            <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                <h2 style='color: #064e3b; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Incident Report Received</h2>
                <p>Hello {$e($reporter_name)},</p>
                <p>We have received your incident report. It is now waiting for review by barangay officials.</p>
                <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                    <p><strong>Tracking Code:</strong> <span style='color: #059669; font-weight: bold;'>{$e($track_code)}</span></p>
                    <p><strong>Type:</strong> {$e($reporting_class)} ({$e($incident_class)})</p>
                    <p><strong>Location:</strong> {$e($incident_address)}</p>
                    <p><strong>Files Attached:</strong> " . count($uploaded_paths) . "</p>
                </div>
                <p>Thank you,<br>Barangay Pasong Buaya II Administration</p>
            </div>";
        $mail->send();
    } catch (Exception $ex) {
        error_log("Failed to send incident report email to $reporter_email: " . $mail->ErrorInfo);
    }
}

$created = $conn->prepare("SELECT created_at FROM incident_reports WHERE id = ?");
$created->bind_param("i", $incident_id);
$created->execute();
$row = $created->get_result()->fetch_assoc();

$respond(true, 'Your incident report was submitted.', [
    'incident_id' => $incident_id,
    'track_code' => $track_code,
    'created_at' => $row['created_at'] ?? null,
]);
