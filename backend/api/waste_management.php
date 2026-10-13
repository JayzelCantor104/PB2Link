<?php
// Waste Management API Endpoint
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
require_once __DIR__ . '/issue_map_common.php';
// Typed text is stored in ALL CAPS. Picked values (status, waste_type, alert level,
// feature type, color tag, icon class) and numbers keep their exact form.
const PB2_TYPED_TEXT_FIELDS = ['zone_area', 'collection_day', 'collection_time', 'truck_route', 'disposal_site', 'truck_team', 'notes', 'category_name', 'description', 'allowed_items', 'prohibited_items', 'collection_days', 'guidelines'];
pb2_session_start();

require_once __DIR__ . '/../db_connection.php';

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

// Auto-create tables if they don't exist yet for smooth setup
$tableCheck = mysqli_query($conn, "SHOW TABLES LIKE 'waste_schedules'");
if (mysqli_num_rows($tableCheck) === 0) {
    include_once __DIR__ . '/../create_waste_and_risk_tables.php';
}

$action = $_GET['action'] ?? ($_POST['action'] ?? 'get_all');

// --- ACTION 1: GET ALL SCHEDULES, SEGREGATION RULES & STATS ---
if ($action === 'get_all') {
    $schedules = [];
    $resSchedules = mysqli_query($conn, "SELECT * FROM waste_schedules ORDER BY id ASC");
    if ($resSchedules) {
        while ($row = mysqli_fetch_assoc($resSchedules)) {
            $schedules[] = $row;
        }
    }

    $segregation = [];
    $resSeg = mysqli_query($conn, "SELECT * FROM waste_segregation ORDER BY id ASC");
    if ($resSeg) {
        while ($row = mysqli_fetch_assoc($resSeg)) {
            $segregation[] = $row;
        }
    }

    // Calculate informative overview statistics
    $totalSchedules = count($schedules);
    $activeSchedules = 0;
    $zones = [];
    foreach ($schedules as $s) {
        if (($s['status'] ?? 'Active') === 'Active') {
            $activeSchedules++;
        }
        $z = trim($s['zone_area'] ?? '');
        if ($z && !in_array($z, $zones)) {
            $zones[] = $z;
        }
    }

    echo json_encode([
        'success' => true,
        'schedules' => $schedules,
        'segregation' => $segregation,
        'stats' => [
            'total_schedules' => $totalSchedules,
            'active_schedules' => $activeSchedules,
            'total_zones' => count($zones),
            'categories_count' => count($segregation)
        ]
    ]);
    exit;
}

// All modifying actions below require administrative privileges
pb2_require_admin();

// --- ACTION 2: SAVE OR UPDATE PICKUP SCHEDULE ---
if ($action === 'save_schedule') {
    $routeColumn = mysqli_query($conn, "SHOW COLUMNS FROM waste_schedules LIKE 'route_coordinates'");
    if (!$routeColumn || mysqli_num_rows($routeColumn) === 0) {
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'message' => 'Waste route setup is incomplete. Apply backend/migrations/020_waste_route_coordinates.sql to the barangay_bims database, then retry.'
        ]);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS

    $id = isset($input['id']) && is_numeric($input['id']) ? (int) $input['id'] : null;
    $zone_area = trim($input['zone_area'] ?? '');
    $collection_day = trim($input['collection_day'] ?? '');
    $collection_time = trim($input['collection_time'] ?? '');
    $waste_type = trim($input['waste_type'] ?? '');
    $truck_route = trim($input['truck_route'] ?? '');
    $id = isset($input['id']) && is_numeric($input['id']) ? (int) $input['id'] : null;
    $routeCoordinates = $input['route_coordinates'] ?? null;
    if (is_string($routeCoordinates)) {
        $routeCoordinates = json_decode($routeCoordinates, true);
    }
    $isExistingSchedule = $id && $id > 0;
    if (!is_array($routeCoordinates) || count($routeCoordinates) > 500
        || (!$isExistingSchedule && count($routeCoordinates) < 2)
        || ($isExistingSchedule && count($routeCoordinates) === 1)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'New routes need 2 to 500 points; an existing unmapped schedule may remain without route points.']);
        exit;
    }
    $previousPoint = null;
    foreach ($routeCoordinates as $point) {
        if (!is_array($point) || count($point) !== 2 || !is_numeric($point[0]) || !is_numeric($point[1])
            || !pb2_point_in_pb2((float) $point[0], (float) $point[1])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Every route point must be inside the Pasong Buaya II boundary.']);
            exit;
        }
        $currentPoint = [(float) $point[0], (float) $point[1]];
        if ($previousPoint !== null) {
            $steps = (int) ceil(max(
                abs($currentPoint[0] - $previousPoint[0]),
                abs($currentPoint[1] - $previousPoint[1])
            ) / 0.0002);
            for ($step = 1; $step < $steps; $step++) {
                $ratio = $step / $steps;
                $sampleLat = $previousPoint[0] + ($currentPoint[0] - $previousPoint[0]) * $ratio;
                $sampleLng = $previousPoint[1] + ($currentPoint[1] - $previousPoint[1]) * $ratio;
                if (!pb2_point_in_pb2($sampleLat, $sampleLng)) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'The plotted route must stay inside the Pasong Buaya II boundary.']);
                    exit;
                }
            }
        }
        $previousPoint = $currentPoint;
    }
    $route_coordinates = count($routeCoordinates) === 0
        ? null
        : json_encode(array_values($routeCoordinates), JSON_UNESCAPED_SLASHES);
    if (count($routeCoordinates) > 0 && $route_coordinates === false) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'The route points could not be saved. Please redraw the route.']);
        exit;
    }
    $disposal_site = trim($input['disposal_site'] ?? 'Imus City Materials Recovery Facility (MRF) / Central Landfill');
    $truck_team = trim($input['truck_team'] ?? 'PB2 Green Fleet');
    $status = in_array($input['status'] ?? '', ['Active', 'Suspended', 'Rescheduled', 'Completed']) ? $input['status'] : 'Active';
    $notes = trim($input['notes'] ?? '');

    if (!$zone_area || !$collection_day || !$collection_time || !$waste_type) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Please fill in all required fields (Zone, Day, Time, Waste Type).']);
        exit;
    }

    if ($id && $id > 0) {
        $stmt = mysqli_prepare($conn, "UPDATE waste_schedules SET 
            zone_area = ?, collection_day = ?, collection_time = ?, waste_type = ?, 
            truck_route = ?, route_coordinates = ?, disposal_site = ?, truck_team = ?, status = ?, notes = ?
            WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'ssssssssssi', $zone_area, $collection_day, $collection_time, $waste_type, $truck_route, $route_coordinates, $disposal_site, $truck_team, $status, $notes, $id);
        $ok = mysqli_stmt_execute($stmt);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('waste.schedule.update', 'waste_schedule', $id, "Updated garbage collection schedule for $zone_area");

        echo json_encode(['success' => $ok, 'message' => $ok ? 'Schedule updated successfully.' : 'Failed to update schedule.']);
        exit;
    } else {
        $stmt = mysqli_prepare($conn, "INSERT INTO waste_schedules 
            (zone_area, collection_day, collection_time, waste_type, truck_route, route_coordinates, disposal_site, truck_team, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        mysqli_stmt_bind_param($stmt, 'ssssssssss', $zone_area, $collection_day, $collection_time, $waste_type, $truck_route, $route_coordinates, $disposal_site, $truck_team, $status, $notes);
        $ok = mysqli_stmt_execute($stmt);
        $newId = mysqli_insert_id($conn);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('waste.schedule.create', 'waste_schedule', $newId, "Created new garbage pickup schedule for $zone_area");

        echo json_encode(['success' => $ok, 'message' => $ok ? 'New schedule created successfully.' : 'Failed to create schedule.', 'id' => $newId]);
        exit;
    }
}

// --- ACTION 3: DELETE PICKUP SCHEDULE ---
if ($action === 'delete_schedule') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid schedule ID.']);
        exit;
    }

    $stmt = mysqli_prepare($conn, "DELETE FROM waste_schedules WHERE id = ?");
    mysqli_stmt_bind_param($stmt, 'i', $id);
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);

    pb2_log_admin_action('waste.schedule.delete', 'waste_schedule', $id, "Deleted garbage pickup schedule #$id");

    echo json_encode(['success' => $ok, 'message' => $ok ? 'Schedule removed successfully.' : 'Failed to delete schedule.']);
    exit;
}

// --- ACTION 4: SAVE OR UPDATE SEGREGATION CATEGORY ---
if ($action === 'save_segregation') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS


    $category_name = trim($input['category_name'] ?? '');
    $color_tag = trim($input['color_tag'] ?? 'green');
    $icon_class = trim($input['icon_class'] ?? 'bi-trash-fill');
    $description = trim($input['description'] ?? '');
    $allowed_items = trim($input['allowed_items'] ?? '');
    $prohibited_items = trim($input['prohibited_items'] ?? '');
    $collection_days = trim($input['collection_days'] ?? '');
    $guidelines = trim($input['guidelines'] ?? '');

    if (!$category_name || !$description) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Category name and description are required.']);
        exit;
    }

    if ($id && $id > 0) {
        $stmt = mysqli_prepare($conn, "UPDATE waste_segregation SET 
            category_name = ?, color_tag = ?, icon_class = ?, description = ?, 
            allowed_items = ?, prohibited_items = ?, collection_days = ?, guidelines = ? 
            WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'ssssssssi', $category_name, $color_tag, $icon_class, $description, $allowed_items, $prohibited_items, $collection_days, $guidelines, $id);
        $ok = mysqli_stmt_execute($stmt);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('waste.segregation.update', 'waste_segregation', $id, "Updated segregation rule for $category_name");

        echo json_encode(['success' => $ok, 'message' => $ok ? 'Segregation rule updated.' : 'Failed to update segregation rule.']);
        exit;
    } else {
        $stmt = mysqli_prepare($conn, "INSERT INTO waste_segregation 
            (category_name, color_tag, icon_class, description, allowed_items, prohibited_items, collection_days, guidelines) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        mysqli_stmt_bind_param($stmt, 'ssssssss', $category_name, $color_tag, $icon_class, $description, $allowed_items, $prohibited_items, $collection_days, $guidelines);
        $ok = mysqli_stmt_execute($stmt);
        $newId = mysqli_insert_id($conn);
        mysqli_stmt_close($stmt);

        pb2_log_admin_action('waste.segregation.create', 'waste_segregation', $newId, "Added segregation rule for $category_name");

        echo json_encode(['success' => $ok, 'message' => $ok ? 'Segregation rule added.' : 'Failed to add segregation rule.', 'id' => $newId]);
        exit;
    }
}

// --- ACTION 5: DELETE SEGREGATION CATEGORY ---
if ($action === 'delete_segregation') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $input = pb2_caps_keys($input, PB2_TYPED_TEXT_FIELDS); // typed text is stored in ALL CAPS
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid category ID.']);
        exit;
    }

    $stmt = mysqli_prepare($conn, "DELETE FROM waste_segregation WHERE id = ?");
    mysqli_stmt_bind_param($stmt, 'i', $id);
    $ok = mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);

    pb2_log_admin_action('waste.segregation.delete', 'waste_segregation', $id, "Deleted segregation rule #$id");

    echo json_encode(['success' => $ok, 'message' => $ok ? 'Category removed successfully.' : 'Failed to delete category.']);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Invalid action parameter.']);
exit;
