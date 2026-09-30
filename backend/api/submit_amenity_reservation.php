<?php
// Resident amenity booking (src/pages/Booking.jsx).
// Multipart POST: amenity_id, tracking_code, reservation_date,
//   start_time + end_time (Venue / Vehicle), quantity (Equipment),
//   destination (Vehicle), purpose. The ID photos are the resident's
//   registration ID on file (residency_requirement.php), not a new upload.
// The resident, their contact name and number come from the session's
// resident record — never from the form.
// Rules live in amenity_common.php; schema in migrations 008/009.
ob_start();
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

$respond = function (bool $success, string $message, array $extra = []) {
    ob_end_clean();
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit();
};

if ($_SERVER['REQUEST_METHOD'] !== 'POST') $respond(false, 'Invalid request method.');
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    $respond(false, 'Your session has expired. Please log in again.', ['auth_error' => true]);
}
$user_id = $_SESSION['user_id'];

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/amenity_common.php';
if (!$conn) $respond(false, 'Database connection failed.');

$post = function ($k) { return trim((string)($_POST[$k] ?? '')); };

// ---- Resident -------------------------------------------------------------------
$stmt = $conn->prepare("SELECT r.resident_id, r.control_num, r.fName, r.mName, r.lName, r.suffix, r.contact_num, u.email
                        FROM residents r JOIN users u ON u.user_id = r.user_id WHERE r.user_id = ?");
$stmt->bind_param("s", $user_id);
$stmt->execute();
$resident = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$resident) $respond(false, 'Resident profile not found.');
$resident_id = (int)$resident['resident_id'];
$contact_name = trim(implode(' ', array_filter([$resident['fName'], $resident['mName'], $resident['lName'], $resident['suffix']])));
$contact_number = (string)$resident['contact_num'];

// ---- Amenity ---------------------------------------------------------------------
$amenity_id = (int)$post('amenity_id');
$stmt = $conn->prepare("SELECT amenity_id, name, category, booking_mode, total_quantity, open_time, close_time, status FROM amenities WHERE amenity_id = ?");
$stmt->bind_param("i", $amenity_id);
$stmt->execute();
$amenity = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$amenity || $amenity['status'] !== 'Available') $respond(false, 'This amenity is not available for booking.');
if ($amenity['booking_mode'] === 'hotline') $respond(false, 'This amenity is requested by calling the barangay hotline, not online.');
$category = $amenity['category'];

// ---- Date ---------------------------------------------------------------------------
$date = $post('reservation_date');
$d = DateTime::createFromFormat('Y-m-d', $date);
$today = new DateTime('today');
if (!$d || $d->format('Y-m-d') !== $date) $respond(false, 'Please choose a valid date.');
$d->setTime(0, 0);
if ($d < $today) $respond(false, 'The date has already passed. Please choose today or a later date.');
if ($d > (clone $today)->modify('+180 days')) $respond(false, 'Bookings can be made up to 6 months ahead only.');

// ---- Per-category details ----------------------------------------------------------
$start = null; $end = null; $quantity = 1; $destination = null;
if ($category === 'Equipment') {
    $quantity = filter_var($post('quantity'), FILTER_VALIDATE_INT);
    if ($quantity === false || $quantity < 1 || $quantity > 1000) $respond(false, 'Please enter how many units you need.');
} else {
    $start = pb2_amenity_time($post('start_time'));
    $end = pb2_amenity_time($post('end_time'));
    if (!$start || !$end) $respond(false, 'Please choose a start and end time.');
    if ($start >= $end) $respond(false, 'The end time must be later than the start time.');
    if ($start < $amenity['open_time'] || $end > $amenity['close_time']) {
        $respond(false, 'Please book within ' . substr($amenity['open_time'], 0, 5) . ' – ' . substr($amenity['close_time'], 0, 5) . '.');
    }
    if ($date === $today->format('Y-m-d') && $start <= date('H:i:s')) $respond(false, 'That start time has already passed today.');
    if ($category === 'Vehicle') {
        $destination = $post('destination');
        if ($destination === '') $respond(false, 'Please enter the destination.');
        if (mb_strlen($destination) > 255) $respond(false, 'The destination is too long.');
    }
}
$time_slot = pb2_amenity_label($start, $end);

$purpose = $post('purpose');
if ($purpose === '') $respond(false, 'Please state the purpose of your booking.');
if (mb_strlen($purpose) > 1000) $respond(false, 'The purpose is too long (1000 characters max).');

// ---- Limit: max 2 active bookings per resident ------------------------------------------
$stmt = $conn->prepare("SELECT COUNT(*) AS n FROM req_amenity_reservation WHERE resident_id = ? AND status IN ('Pending','Approved')");
$stmt->bind_param("i", $resident_id);
$stmt->execute();
if ((int)$stmt->get_result()->fetch_assoc()['n'] >= 2) {
    $respond(false, 'You already have 2 active bookings. Please wait until one is completed, or cancel one, before booking again.');
}
$stmt->close();

// ---- Tracking code ---------------------------------------------------------------------
$exists = function ($code) use ($conn) {
    $q = $conn->prepare("SELECT 1 FROM req_amenity_reservation WHERE tracking_code = ?");
    $q->bind_param("s", $code);
    $q->execute();
    $found = $q->get_result()->num_rows > 0;
    $q->close();
    return $found;
};
$tracking_code = strtoupper($post('tracking_code'));
if (!preg_match('/^BK-[A-Z0-9-]{6,40}$/', $tracking_code) || $exists($tracking_code)) {
    do {
        $tracking_code = 'BK-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3)));
    } while ($exists($tracking_code));
}

// ---- ID: the one from registration is reused (residency_requirement.php) ------------------------
// Bookings aren't certifications, so the under-6-months residency rule doesn't apply.
require_once __DIR__ . '/residency_requirement.php';
$idOnFile = pb2_resident_id_on_file($conn, $resident_id);
if (!$idOnFile) {
    $respond(false, 'We could not find the valid ID from your registration. Please update your ID in your profile first.', ['code' => 'ID_REQUIRED']);
}
$id_front = $idOnFile['front'];
$id_holding = $idOnFile['holding'];

// ---- Check availability + save atomically ------------------------------------------------------
// Locking the amenity row serialises bookings for that amenity, so two
// residents submitting at the same moment can't both take the last slot/units.
$conn->begin_transaction();
try {
    $lock = $conn->prepare("SELECT amenity_id FROM amenities WHERE amenity_id = ? FOR UPDATE");
    $lock->bind_param("i", $amenity_id);
    $lock->execute();
    $lock->close();

    if ($category === 'Equipment') {
        if ($amenity['total_quantity'] !== null) {
            $reserved = pb2_amenity_reserved_qty($conn, $amenity_id, $date);
            $remaining = (int)$amenity['total_quantity'] - $reserved;
            if ($quantity > $remaining) {
                $conn->rollback();
                $respond(false, $remaining > 0 ? "Only $remaining unit(s) are left for that date." : 'No units are left for that date.');
            }
        }
    } else {
        $clash = pb2_amenity_overlaps($conn, $amenity_id, $date, $start, $end);
        if ($clash) {
            $conn->rollback();
            $taken = implode(', ', array_map(function ($c) { return substr($c['start_time'], 0, 5) . '–' . substr($c['end_time'], 0, 5); }, $clash));
            $respond(false, "That time overlaps an existing booking ($taken). Please choose another time.");
        }
    }

    $ins = $conn->prepare("INSERT INTO req_amenity_reservation
        (tracking_code, amenity_id, resident_id, reservation_date, time_slot, start_time, end_time, quantity, purpose, destination,
         contact_name, contact_number, id_front, id_holding, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')");
    $ins->bind_param("siissssissssss", $tracking_code, $amenity_id, $resident_id, $date, $time_slot, $start, $end, $quantity,
        $purpose, $destination, $contact_name, $contact_number, $id_front, $id_holding);
    if (!$ins->execute()) throw new Exception($ins->error);
    $request_id = $ins->insert_id;
    $ins->close();
    $conn->commit();
} catch (Throwable $ex) {
    $conn->rollback();
    error_log('submit_amenity_reservation.php: ' . $ex->getMessage());
    $respond(false, 'We could not save your booking. Please try again.');
}

$booking = pb2_amenity_load($conn, $request_id);
if ($booking) {
    pb2_amenity_email($booking, 'Booking Received', 'Booking Received',
        'We received your booking request. It is now waiting for approval by barangay staff; we will email you once it is reviewed.');
}

$respond(true, 'Your booking request has been submitted.', ['tracking_code' => $tracking_code, 'request_id' => $request_id]);
