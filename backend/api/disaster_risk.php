<?php
// Disaster Risk Reduction & Management (DRRM) API Endpoint
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/text_case.php';
require_once __DIR__ . '/advisory_sms.php';
// Typed text is stored in ALL CAPS. Picked values (status, alert level,
// feature type, color tag, icon class) and numbers keep their exact form.
const PB2_TYPED_TEXT_FIELDS = ['title', 'calamity_type', 'affected_areas', 'evacuation_schedule', 'instructions', 'name', 'location', 'facilities', 'contact_person', 'description'];
pb2_session_start();

require_once __DIR__ . '/../db_connection.php';

// After an advisory is saved or reactivated: text it to all residents when the
// Super Admin set advisory SMS to automatic (advisory_sms.php). Returns a note
// for the response message ('' when nothing was sent).
function pb2_dr_auto_sms_note(mysqli $conn, int $alertId): string
{
    $r = pb2_advisory_sms_auto($conn, $alertId, pb2_current_admin());
    if ($r === null) return '';
    return $r['ok'] ? " Texted to {$r['sent']} resident(s)." : " The automatic SMS was not sent: {$r['message']}";
}

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

// Auto-create tables if not present
$tableCheck = mysqli_query($conn, "SHOW TABLES LIKE 'evacuation_centers'");
if (mysqli_num_rows($tableCheck) === 0) {
    include_once __DIR__ . '/../create_waste_and_risk_tables.php';
}

foreach (['latitude' => 'DECIMAL(10,7) NULL', 'longitude' => 'DECIMAL(10,7) NULL'] as $column => $definition) {
    $columnCheck = mysqli_query($conn, "SHOW COLUMNS FROM evacuation_centers LIKE '$column'");
    if ($columnCheck && mysqli_num_rows($columnCheck) === 0) {
        mysqli_query($conn, "ALTER TABLE evacuation_centers ADD COLUMN $column $definition");
    }
}

$action = $_GET['action'] ?? ($_POST['action'] ?? 'get_all');

// --- ACTION 1: GET ALL ALERTS, EVACUATION CENTERS & STATS ---
if ($action === 'get_all') {
    $alerts = [];
    $resAlerts = mysqli_query($conn, "SELECT * FROM disaster_alerts ORDER BY is_active DESC, created_at DESC");
    if ($resAlerts) {
        while ($row = mysqli_fetch_assoc($resAlerts)) {
            $alerts[] = $row;
        }
    }

    $centers = [];
    $resCenters = mysqli_query($conn, "SELECT * FROM evacuation_centers ORDER BY id ASC");
    if ($resCenters) {
        while ($row = mysqli_fetch_assoc($resCenters)) {
            $centers[] = $row;
        }
    }

    // Stats
    $activeAlerts = 0;
    foreach ($alerts as $a) {
        if ((int) ($a['is_active'] ?? 0) === 1) {
            $activeAlerts++;
        }
    }

    $totalCapacity = 0;
    $totalEvacuees = 0;
    $availableCenters = 0;
    foreach ($centers as $c) {
        $cap = (int) ($c['capacity_families'] ?? 0);
        $curr = (int) ($c['current_families'] ?? 0);
        $totalCapacity += $cap;
        $totalEvacuees += $curr;
        if (($c['status'] ?? '') === 'Available') {
            $availableCenters++;
        }
    }

    echo json_encode([
        'success' => true,
        'alerts' => $alerts,
        'centers' => $centers,
        'stats' => [
            'active_alerts_count' => $activeAlerts,
            'total_centers' => count($centers),
            'available_centers' => $availableCenters,
            'total_capacity_families' => $totalCapacity,
            'total_current_families' => $totalEvacuees
        ]
    ]);
    exit;
}

// All modifying actions below require administrative privileges
pb2_require_admin();

// --- ACTION 2: SAVE OR UPDATE DISASTER ALERT ---
if ($action === 'save_alert') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS

    $id = isset($input['id']) && is_numeric($input['id']) ? (int) $input['id'] : null;
    $title = trim($input['title'] ?? '');
    $alert_level = in_array($input['alert_level'] ?? '', ['Advisory', 'Watch', 'Warning', 'Severe']) ? $input['alert_level'] : 'Advisory';
    $calamity_type = trim($input['calamity_type'] ?? 'Typhoon / Heavy Rain');
    $affected_areas = trim($input['affected_areas'] ?? '');
    $evacuation_schedule = trim($input['evacuation_schedule'] ?? '');
    $instructions = trim($input['instructions'] ?? '');
    $is_active = isset($input['is_active']) ? ((int) $input['is_active'] ? 1 : 0) : 1;

    if (!$title || !$instructions) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Alert title and safety instructions are required.']);
        exit;
    }

    if ($id && $id > 0) {
        $stmt = mysqli_prepare($conn, "UPDATE disaster_alerts SET 
            title = ?, alert_level = ?, calamity_type = ?, affected_areas = ?, 
            evacuation_schedule = ?, instructions = ?, is_active = ? 
            WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'ssssssii', $title, $alert_level, $calamity_type, $affected_areas, $evacuation_schedule, $instructions, $is_active, $id);
        $ok = mysqli_stmt_execute($stmt);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('disaster.alert.update', 'disaster_alert', $id, "Updated risk advisory '$title'");

        if ($ok && !$is_active) {
            mysqli_query($conn, "UPDATE disaster_alerts SET sms_sent_level = NULL WHERE id = " . (int) $id);
        }
        $smsNote = $ok ? pb2_dr_auto_sms_note($conn, $id) : '';
        echo json_encode(['success' => $ok, 'message' => $ok ? 'Alert advisory updated.' . $smsNote : 'Failed to update alert.']);
        exit;
    } else {
        $stmt = mysqli_prepare($conn, "INSERT INTO disaster_alerts 
            (title, alert_level, calamity_type, affected_areas, evacuation_schedule, instructions, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?)");
        mysqli_stmt_bind_param($stmt, 'ssssssi', $title, $alert_level, $calamity_type, $affected_areas, $evacuation_schedule, $instructions, $is_active);
        $ok = mysqli_stmt_execute($stmt);
        $newId = mysqli_insert_id($conn);
        mysqli_stmt_close($stmt);

        // Published from a hazard-feed draft: link it and take it off the staff list.
        $hazardEventId = isset($input['hazard_event_id']) ? (int) $input['hazard_event_id'] : 0;
        if ($ok && $hazardEventId > 0) {
            $adminId = (int) (pb2_current_admin()['admin_id'] ?? 0);
            $ev = mysqli_prepare($conn, "UPDATE hazard_events SET status = 'published', alert_id = ?, handled_by = ?, handled_at = NOW() WHERE id = ? AND status = 'new'");
            mysqli_stmt_bind_param($ev, 'iii', $newId, $adminId, $hazardEventId);
            mysqli_stmt_execute($ev);
            mysqli_stmt_close($ev);
            $ref = mysqli_prepare($conn, "UPDATE disaster_alerts d JOIN hazard_events h ON h.id = ? SET d.source = h.source, d.source_ref = h.hazard_key WHERE d.id = ?");
            mysqli_stmt_bind_param($ref, 'ii', $hazardEventId, $newId);
            mysqli_stmt_execute($ref);
            mysqli_stmt_close($ref);
        }

        pb2_log_admin_action('disaster.alert.create', 'disaster_alert', $newId, "Published emergency advisory '$title' ($alert_level)" . ($hazardEventId > 0 ? ' from a hazard-feed detection' : ''));

        $smsNote = $ok ? pb2_dr_auto_sms_note($conn, (int) $newId) : '';
        echo json_encode(['success' => $ok, 'message' => $ok ? 'Emergency advisory issued.' . $smsNote : 'Failed to issue advisory.', 'id' => $newId]);
        exit;
    }
}

// --- ACTION 3: TOGGLE ALERT STATUS ---
if ($action === 'toggle_alert_status') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS
    $id = (int) ($input['id'] ?? 0);
    $is_active = (int) ($input['is_active'] ?? 0) ? 1 : 0;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid alert ID.']);
        exit;
    }

    // Deactivating clears the texted level, so reactivating texts residents again.
    $stmt = mysqli_prepare($conn, "UPDATE disaster_alerts SET is_active = ?, sms_sent_level = IF(? = 0, NULL, sms_sent_level) WHERE id = ?");
    mysqli_stmt_bind_param($stmt, 'iii', $is_active, $is_active, $id);
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);

    pb2_log_admin_action('disaster.alert.toggle', 'disaster_alert', $id, "Toggled alert #$id active status to $is_active");

    $smsNote = ($ok && $is_active) ? pb2_dr_auto_sms_note($conn, $id) : '';
    echo json_encode(['success' => $ok, 'message' => $ok ? 'Alert status updated.' . $smsNote : 'Failed to update alert status.']);
    exit;
}

// --- ACTION 4: DELETE DISASTER ALERT ---
if ($action === 'delete_alert') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid alert ID.']);
        exit;
    }

    $stmt = mysqli_prepare($conn, "DELETE FROM disaster_alerts WHERE id = ?");
    mysqli_stmt_bind_param($stmt, 'i', $id);
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);

    pb2_log_admin_action('disaster.alert.delete', 'disaster_alert', $id, "Deleted emergency advisory #$id");

    echo json_encode(['success' => $ok, 'message' => $ok ? 'Advisory deleted.' : 'Failed to delete advisory.']);
    exit;
}

// --- ACTION 5: SAVE OR UPDATE EVACUATION CENTER ---
if ($action === 'save_center') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS

    $id = isset($input['id']) && is_numeric($input['id']) ? (int) $input['id'] : null;
    $name = trim($input['name'] ?? '');
    $location = trim($input['location'] ?? '');
    $capacity_families = (int) ($input['capacity_families'] ?? 100);
    $current_families = (int) ($input['current_families'] ?? 0);
    $status = in_array($input['status'] ?? '', ['Available', 'Standby', 'Full', 'Closed']) ? $input['status'] : 'Available';
    $facilities = trim($input['facilities'] ?? '');
    $contact_person = trim($input['contact_person'] ?? '');
    $contact_number = trim($input['contact_number'] ?? '');
    $latitude = isset($input['latitude']) && is_numeric($input['latitude']) ? (float) $input['latitude'] : null;
    $longitude = isset($input['longitude']) && is_numeric($input['longitude']) ? (float) $input['longitude'] : null;

    if (!$name || !$location) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Evacuation center name and location are required.']);
        exit;
    }

    if (($latitude !== null && ($latitude < -90 || $latitude > 90)) || ($longitude !== null && ($longitude < -180 || $longitude > 180))) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Center coordinates are outside valid map bounds.']);
        exit;
    }

    // Auto calculate status if families >= capacity
    if ($capacity_families > 0 && $current_families >= $capacity_families && $status === 'Available') {
        $status = 'Full';
    }

    if ($id && $id > 0) {
        $stmt = mysqli_prepare($conn, "UPDATE evacuation_centers SET 
            name = ?, location = ?, capacity_families = ?, current_families = ?, 
            status = ?, facilities = ?, contact_person = ?, contact_number = ?, latitude = ?, longitude = ?
            WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'ssiissssddi', $name, $location, $capacity_families, $current_families, $status, $facilities, $contact_person, $contact_number, $latitude, $longitude, $id);
        $ok = mysqli_stmt_execute($stmt);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('disaster.center.update', 'evacuation_center', $id, "Updated evacuation center '$name'");

        echo json_encode(['success' => $ok, 'message' => $ok ? 'Evacuation center updated.' : 'Failed to update evacuation center.']);
        exit;
    } else {
        $stmt = mysqli_prepare($conn, "INSERT INTO evacuation_centers 
            (name, location, capacity_families, current_families, status, facilities, contact_person, contact_number, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        mysqli_stmt_bind_param($stmt, 'ssiissssdd', $name, $location, $capacity_families, $current_families, $status, $facilities, $contact_person, $contact_number, $latitude, $longitude);
        $ok = mysqli_stmt_execute($stmt);
        $newId = mysqli_insert_id($conn);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('disaster.center.create', 'evacuation_center', $newId, "Added evacuation center '$name'");

        echo json_encode(['success' => $ok, 'message' => $ok ? 'Evacuation center added.' : 'Failed to add evacuation center.', 'id' => $newId]);
        exit;
    }
}

// --- ACTION 6: QUICK OCCUPANCY UPDATE ---
if ($action === 'update_center_occupancy') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS
    $id = (int) ($input['id'] ?? 0);
    $current_families = (int) ($input['current_families'] ?? 0);
    $status = in_array($input['status'] ?? '', ['Available', 'Standby', 'Full', 'Closed']) ? $input['status'] : null;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid center ID.']);
        exit;
    }

    if ($status) {
        $stmt = mysqli_prepare($conn, "UPDATE evacuation_centers SET current_families = ?, status = ? WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'isi', $current_families, $status, $id);
    } else {
        $stmt = mysqli_prepare($conn, "UPDATE evacuation_centers SET current_families = ? WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'ii', $current_families, $id);
    }
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);

    pb2_log_admin_action('disaster.center.occupancy', 'evacuation_center', $id, "Updated occupancy to $current_families families");

    echo json_encode(['success' => $ok, 'message' => $ok ? 'Occupancy updated.' : 'Failed to update occupancy.']);
    exit;
}

// --- ACTION 7: DELETE EVACUATION CENTER ---
if ($action === 'delete_center') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid center ID.']);
        exit;
    }

    $stmt = mysqli_prepare($conn, "DELETE FROM evacuation_centers WHERE id = ?");
    mysqli_stmt_bind_param($stmt, 'i', $id);
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);

    pb2_log_admin_action('disaster.center.delete', 'evacuation_center', $id, "Deleted evacuation center #$id");

    echo json_encode(['success' => $ok, 'message' => $ok ? 'Evacuation center removed.' : 'Failed to delete evacuation center.']);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Invalid action parameter.']);
exit;

