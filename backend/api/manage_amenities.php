<?php
// Admin: the amenity catalogue (Manage Amenities panel in src/Admin/AmenityDashboard.jsx).
//   GET                                    -> every amenity, any status
//   POST { action: 'save', amenity_id?, name, category, booking_mode, hotline_number,
//          total_quantity, open_time, close_time, description, icon_class }   -> add / edit
//   POST { action: 'set_status', amenity_id, status }   -> Available / Under Maintenance / Disabled
// No hard delete: bookings reference amenities (FK), so retire one with 'Disabled'.
// Replaces add_facility.php.
header("Content-Type: application/json");
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/amenity_common.php';
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

const PB2_AMENITY_ICONS = ['bi-building', 'bi-truck-front-fill', 'bi-dribbble', 'bi-tools', 'bi-geo-alt',
    'bi-house-door', 'bi-music-note-beamed', 'bi-umbrella', 'bi-lightning-charge', 'bi-people', 'bi-box-seam', 'bi-car-front-fill'];

$fail = function ($msg) { echo json_encode(['success' => false, 'message' => $msg]); exit(); };

$load = function ($id) use ($conn) {
    $stmt = $conn->prepare("SELECT * FROM amenities WHERE amenity_id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
};

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = $conn->query("SELECT a.amenity_id, a.name, a.category, a.booking_mode, a.hotline_number, a.total_quantity,
            TIME_FORMAT(a.open_time, '%H:%i') AS open_time, TIME_FORMAT(a.close_time, '%H:%i') AS close_time,
            a.description, a.icon_class, a.status, a.created_at,
            (SELECT COUNT(*) FROM req_amenity_reservation ar
              WHERE ar.amenity_id = a.amenity_id AND ar.status IN ('Pending','Approved') AND ar.reservation_date >= CURDATE()) AS upcoming_bookings
        FROM amenities a
        ORDER BY FIELD(a.status, 'Available', 'Under Maintenance', 'Disabled'), FIELD(a.category, 'Venue', 'Equipment', 'Vehicle'), a.name");
    if (!$result) {
        error_log('manage_amenities.php: ' . $conn->error);
        $fail('Unable to load amenities.');
    }
    echo json_encode(['success' => true, 'data' => $result->fetch_all(MYSQLI_ASSOC), 'icons' => PB2_AMENITY_ICONS]);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$action = (string)($data['action'] ?? '');

if ($action === 'set_status') {
    $id = (int)($data['amenity_id'] ?? 0);
    $status = (string)($data['status'] ?? '');
    if (!in_array($status, ['Available', 'Under Maintenance', 'Disabled'], true)) $fail('Invalid status.');
    $old = $load($id);
    if (!$old) $fail('Amenity not found.');
    $stmt = $conn->prepare("UPDATE amenities SET status = ? WHERE amenity_id = ?");
    $stmt->bind_param("si", $status, $id);
    if (!$stmt->execute()) $fail('Unable to update the amenity.');
    pb2_log_admin_action('amenity.status.update', 'amenity', (string)$id, "Set amenity \"{$old['name']}\" to $status",
        [['field' => 'status', 'old_value' => $old['status'], 'new_value' => $status]]);
    echo json_encode(['success' => true, 'message' => "\"{$old['name']}\" is now $status."]);
    exit();
}

if ($action !== 'save') $fail('Unknown action.');

// ---- Validate add / edit -----------------------------------------------------------------
$id = (int)($data['amenity_id'] ?? 0);
$name = trim((string)($data['name'] ?? ''));
$category = (string)($data['category'] ?? '');
$mode = (string)($data['booking_mode'] ?? 'online');
$hotline = trim((string)($data['hotline_number'] ?? ''));
$qty_raw = $data['total_quantity'] ?? '';
$open = pb2_amenity_time($data['open_time'] ?? '06:00');
$close = pb2_amenity_time($data['close_time'] ?? '22:00');
$description = trim((string)($data['description'] ?? ''));
$icon = (string)($data['icon_class'] ?? 'bi-building');

if ($name === '' || mb_strlen($name) > 100) $fail('Please enter a name (up to 100 characters).');
if (!in_array($category, ['Venue', 'Equipment', 'Vehicle'], true)) $fail('Please choose a category.');
if (!in_array($mode, ['online', 'hotline'], true)) $fail('Invalid booking mode.');
if ($category !== 'Vehicle') $mode = 'online'; // hotline mode is for emergency vehicles only
if ($mode === 'hotline') {
    if (!preg_match('/^[0-9+()\\- ]{3,30}$/', $hotline)) $fail('Please enter a valid hotline number.');
} else {
    $hotline = $hotline !== '' ? $hotline : null;
    if ($hotline !== null && !preg_match('/^[0-9+()\\- ]{3,30}$/', $hotline)) $fail('Please enter a valid hotline number.');
}
$total_quantity = null;
if ($category === 'Equipment') {
    $total_quantity = filter_var($qty_raw, FILTER_VALIDATE_INT);
    if ($total_quantity === false || $total_quantity < 1 || $total_quantity > 100000) $fail('Please enter how many units the barangay has.');
}
if (!$open || !$close || $open >= $close) $fail('Closing time must be later than opening time.');
if (mb_strlen($description) > 1000) $fail('The description is too long (1000 characters max).');
if (!preg_match('/^bi-[a-z0-9-]{1,60}$/', $icon)) $icon = 'bi-building'; // a Bootstrap Icons class name only

$old = $id ? $load($id) : null;
if ($id && !$old) $fail('Amenity not found.');

// Same name twice would be confusing on the booking page (checked only when
// the name is new, so older duplicates can still be edited or disabled).
if (!$old || mb_strtolower($old['name']) !== mb_strtolower($name)) {
    $dup = $conn->prepare("SELECT amenity_id FROM amenities WHERE name = ? AND amenity_id <> ? AND status <> 'Disabled'");
    $dup->bind_param("si", $name, $id);
    $dup->execute();
    if ($dup->get_result()->num_rows > 0) $fail('Another amenity already has that name.');
    $dup->close();
}

if ($id) {
    if ($old['category'] !== $category) {
        // Changing category would reinterpret existing bookings (times vs. units).
        $cnt = $conn->prepare("SELECT COUNT(*) AS n FROM req_amenity_reservation WHERE amenity_id = ?");
        $cnt->bind_param("i", $id);
        $cnt->execute();
        if ((int)$cnt->get_result()->fetch_assoc()['n'] > 0) $fail('This amenity already has bookings, so its category can no longer be changed. Add a new amenity instead.');
        $cnt->close();
    }
    $stmt = $conn->prepare("UPDATE amenities SET name = ?, category = ?, booking_mode = ?, hotline_number = ?, total_quantity = ?,
            open_time = ?, close_time = ?, description = ?, icon_class = ? WHERE amenity_id = ?");
    $stmt->bind_param("ssssissssi", $name, $category, $mode, $hotline, $total_quantity, $open, $close, $description, $icon, $id);
    if (!$stmt->execute()) {
        error_log('manage_amenities.php: ' . $stmt->error);
        $fail('Unable to save the amenity.');
    }
    $changed = [];
    $new = $load($id);
    foreach (['name', 'category', 'booking_mode', 'hotline_number', 'total_quantity', 'open_time', 'close_time', 'description', 'icon_class'] as $f) {
        if ((string)$old[$f] !== (string)$new[$f]) $changed[] = ['field' => $f, 'old_value' => $old[$f], 'new_value' => $new[$f]];
    }
    pb2_log_admin_action('amenity.update', 'amenity', (string)$id, "Edited amenity \"$name\"", $changed);
    echo json_encode(['success' => true, 'message' => "\"$name\" was updated.", 'amenity_id' => $id]);
    exit();
}

$stmt = $conn->prepare("INSERT INTO amenities (name, category, booking_mode, hotline_number, total_quantity, open_time, close_time, description, icon_class, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')");
$stmt->bind_param("ssssissss", $name, $category, $mode, $hotline, $total_quantity, $open, $close, $description, $icon);
if (!$stmt->execute()) {
    error_log('manage_amenities.php: ' . $stmt->error);
    $fail('Unable to add the amenity.');
}
$new_id = $stmt->insert_id;
pb2_log_admin_action('amenity.create', 'amenity', (string)$new_id, "Added amenity \"$name\" ($category)");
echo json_encode(['success' => true, 'message' => "\"$name\" was added.", 'amenity_id' => $new_id]);
