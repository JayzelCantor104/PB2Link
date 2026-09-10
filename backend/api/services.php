<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Include your database connection
require_once '../db_connection.php';

// Ensure MySQLi connection exists
if (!isset($conn) || $conn->connect_error) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

// Read Axios JSON body
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true) ?? [];

// Get action parameter
$action = $_GET['action'] ?? $input['action'] ?? '';

switch ($action) {
    case 'get_all':
        $sql = "SELECT * FROM services ORDER BY service_id DESC";
        $result = $conn->query($sql);

        if ($result) {
            // MySQLi equivalent of fetchAll(PDO::FETCH_ASSOC)
            $services = $result->fetch_all(MYSQLI_ASSOC);

            // Cast numerical values properly for React
            foreach ($services as &$s) {
                $s['service_id'] = (int)$s['service_id'];
                $s['allow_third_party'] = (int)$s['allow_third_party'];
                $s['is_active'] = (int)$s['is_active'];
                $s['created_by'] = $s['created_by'] !== null ? (int)$s['created_by'] : null;
            }

            echo json_encode(['success' => true, 'services' => $services]);
        } else {
            echo json_encode(['success' => false, 'message' => $conn->error]);
        }
        break;

    case 'get_fields':
        $service_id = $_GET['service_id'] ?? $input['service_id'] ?? null;
        if (!$service_id) {
            echo json_encode(['success' => false, 'message' => 'Service ID is required']);
            exit();
        }

        $stmt = $conn->prepare("SELECT * FROM service_fields WHERE service_id = ? ORDER BY sort_order ASC, field_id ASC");
        $stmt->bind_param("i", $service_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $fields = $result->fetch_all(MYSQLI_ASSOC);

        foreach ($fields as &$f) {
            $f['field_id'] = (int)$f['field_id'];
            $f['service_id'] = (int)$f['service_id'];
            $f['is_required'] = (int)$f['is_required'];
            $f['sort_order'] = (int)$f['sort_order'];
        }

        echo json_encode(['success' => true, 'fields' => $fields]);
        break;

    case 'save_service':
        $service_id = $input['service_id'] ?? null;
        $title = trim($input['title'] ?? '');
        $category = $input['category'] ?? 'Clearance & Certification';
        $description = $input['description'] ?? '';
        $allow_third_party = isset($input['allow_third_party']) ? (int)$input['allow_third_party'] : 1;
        $is_active = isset($input['is_active']) ? (int)$input['is_active'] : 1;

        if (empty($title)) {
            echo json_encode(['success' => false, 'message' => 'Title is required']);
            exit();
        }

        if ($service_id) {
            $stmt = $conn->prepare("UPDATE services SET title = ?, category = ?, description = ?, allow_third_party = ?, is_active = ? WHERE service_id = ?");
            $stmt->bind_param("sssiii", $title, $category, $description, $allow_third_party, $is_active, $service_id);
        } else {
            $stmt = $conn->prepare("INSERT INTO services (title, category, description, allow_third_party, is_active) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param("sssii", $title, $category, $description, $allow_third_party, $is_active);
        }

        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'Service saved successfully']);
        } else {
            echo json_encode(['success' => false, 'message' => $stmt->error]);
        }
        break;

    case 'toggle_status':
        $service_id = $input['service_id'] ?? null;
        $is_active = isset($input['is_active']) ? (int)$input['is_active'] : 0;

        if (!$service_id) {
            echo json_encode(['success' => false, 'message' => 'Service ID required']);
            exit();
        }

        $stmt = $conn->prepare("UPDATE services SET is_active = ? WHERE service_id = ?");
        $stmt->bind_param("ii", $is_active, $service_id);

        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'Status updated']);
        } else {
            echo json_encode(['success' => false, 'message' => $stmt->error]);
        }
        break;

    case 'save_field':
        $field_id = $input['field_id'] ?? null;
        $service_id = $input['service_id'] ?? null;
        $step_section = $input['step_section'] ?? 'Identity';
        $field_label = trim($input['field_label'] ?? '');
        $field_name = trim($input['field_name'] ?? '');
        $field_type = $input['field_type'] ?? 'text';
        $field_options = !empty($input['field_options']) ? json_encode(array_map('trim', explode(',', $input['field_options']))) : null;
        $is_required = isset($input['is_required']) ? (int)$input['is_required'] : 1;
        $show_for_target = $input['show_for_target'] ?? 'all';
        $sort_order = isset($input['sort_order']) ? (int)$input['sort_order'] : 0;

        if (!$service_id || empty($field_label)) {
            echo json_encode(['success' => false, 'message' => 'Missing service ID or field label']);
            exit();
        }

        if ($field_id) {
            $stmt = $conn->prepare("UPDATE service_fields SET step_section = ?, field_label = ?, field_name = ?, field_type = ?, field_options = ?, is_required = ?, show_for_target = ?, sort_order = ? WHERE field_id = ?");
            $stmt->bind_param("sssssisii", $step_section, $field_label, $field_name, $field_type, $field_options, $is_required, $show_for_target, $sort_order, $field_id);
        } else {
            $stmt = $conn->prepare("INSERT INTO service_fields (service_id, step_section, field_label, field_name, field_type, field_options, is_required, show_for_target, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("isssssisi", $service_id, $step_section, $field_label, $field_name, $field_type, $field_options, $is_required, $show_for_target, $sort_order);
        }

        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'Field saved successfully']);
        } else {
            echo json_encode(['success' => false, 'message' => $stmt->error]);
        }
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action parameter']);
        break;
}
?>