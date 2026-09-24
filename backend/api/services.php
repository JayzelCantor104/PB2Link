<?php
// Custom services + their form fields (Services & Form Builder).
//   GET  ?action=get_all                      public  — list services (Services page, request form)
//   GET  ?action=get_fields&service_id=N      public  — a service's form fields
//   POST ?action=save_service | toggle_status | save_field   admin only
// Schema: backend/migrations/007_custom_services.sql
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/auth_guard.php';
require_once '../db_connection.php';

if (!isset($conn) || !$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true) ?? [];
$action = $_GET['action'] ?? $input['action'] ?? '';

$FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'date', 'time', 'file', 'checkbox', 'radio'];
$STEPS = ['Identity', 'Residency', 'Uploads', 'Review'];
$TARGETS = ['all', 'myself_only', 'someone_else_only'];
$CATEGORIES = ['Clearance & Certification', 'Facility Reservation', 'Permit', 'Registration', 'Other'];

// Changing services is an admin action; reading them is public (the
// resident Services page and request form need it).
if (in_array($action, ['save_service', 'toggle_status', 'save_field'], true)) {
    $admin = pb2_require_admin();
}

$fail = function ($msg) { echo json_encode(['success' => false, 'message' => $msg]); exit(); };

switch ($action) {
    case 'get_all':
        $result = $conn->query("SELECT * FROM services ORDER BY service_id DESC");
        if (!$result) $fail('Unable to load services.');
        $services = $result->fetch_all(MYSQLI_ASSOC);
        foreach ($services as &$s) {
            $s['service_id'] = (int)$s['service_id'];
            $s['allow_third_party'] = (int)$s['allow_third_party'];
            $s['is_active'] = (int)$s['is_active'];
            $s['created_by'] = $s['created_by'] !== null ? (int)$s['created_by'] : null;
        }
        echo json_encode(['success' => true, 'services' => $services]);
        break;

    case 'get_fields':
        $service_id = (int)($_GET['service_id'] ?? $input['service_id'] ?? 0);
        if (!$service_id) $fail('Service ID is required');

        $stmt = $conn->prepare("SELECT * FROM service_fields WHERE service_id = ? ORDER BY sort_order ASC, field_id ASC");
        $stmt->bind_param("i", $service_id);
        $stmt->execute();
        $fields = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        foreach ($fields as &$f) {
            $f['field_id'] = (int)$f['field_id'];
            $f['service_id'] = (int)$f['service_id'];
            $f['is_required'] = (int)$f['is_required'];
            $f['sort_order'] = (int)$f['sort_order'];
        }
        echo json_encode(['success' => true, 'fields' => $fields]);
        break;

    case 'save_service':
        $service_id = (int)($input['service_id'] ?? 0);
        $title = trim($input['title'] ?? '');
        $category = in_array($input['category'] ?? '', $CATEGORIES, true) ? $input['category'] : 'Clearance & Certification';
        $description = trim($input['description'] ?? '');
        $allow_third_party = !empty($input['allow_third_party']) ? 1 : 0;
        $is_active = isset($input['is_active']) ? (!empty($input['is_active']) ? 1 : 0) : 1;

        if ($title === '') $fail('Title is required');
        if (mb_strlen($title) > 150) $fail('Title must be 150 characters or fewer.');

        if ($service_id) {
            $stmt = $conn->prepare("UPDATE services SET title = ?, category = ?, description = ?, allow_third_party = ?, is_active = ? WHERE service_id = ?");
            $stmt->bind_param("sssiii", $title, $category, $description, $allow_third_party, $is_active, $service_id);
        } else {
            $created_by = (int)$admin['admin_id'];
            $stmt = $conn->prepare("INSERT INTO services (title, category, description, allow_third_party, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("sssiii", $title, $category, $description, $allow_third_party, $is_active, $created_by);
        }
        if (!$stmt->execute()) $fail('Unable to save the service.');
        echo json_encode(['success' => true, 'message' => 'Service saved successfully', 'service_id' => $service_id ?: $stmt->insert_id]);
        break;

    case 'toggle_status':
        $service_id = (int)($input['service_id'] ?? 0);
        $is_active = !empty($input['is_active']) ? 1 : 0;
        if (!$service_id) $fail('Service ID required');

        $stmt = $conn->prepare("UPDATE services SET is_active = ? WHERE service_id = ?");
        $stmt->bind_param("ii", $is_active, $service_id);
        if (!$stmt->execute()) $fail('Unable to update the service.');
        echo json_encode(['success' => true, 'message' => 'Status updated']);
        break;

    case 'save_field':
        $field_id = (int)($input['field_id'] ?? 0);
        $service_id = (int)($input['service_id'] ?? 0);
        $step_section = in_array($input['step_section'] ?? '', $STEPS, true) ? $input['step_section'] : 'Identity';
        $field_label = trim($input['field_label'] ?? '');
        $field_type = in_array($input['field_type'] ?? '', $FIELD_TYPES, true) ? $input['field_type'] : 'text';
        $is_required = isset($input['is_required']) ? (!empty($input['is_required']) ? 1 : 0) : 1;
        $show_for_target = in_array($input['show_for_target'] ?? '', $TARGETS, true) ? $input['show_for_target'] : 'all';
        $sort_order = (int)($input['sort_order'] ?? 0);

        if (!$service_id || $field_label === '') $fail('Missing service ID or field label');

        // Choices: accept an array, a JSON array (what get_fields returns, so
        // re-saving an edited field doesn't mangle it), or "a, b, c" text.
        $field_options = null;
        if (in_array($field_type, ['select', 'radio', 'checkbox'], true)) {
            $raw = $input['field_options'] ?? '';
            $opts = is_array($raw) ? $raw : json_decode((string)$raw, true);
            if (!is_array($opts)) $opts = explode(',', (string)$raw);
            $opts = array_values(array_unique(array_filter(array_map('trim', $opts), 'strlen')));
            if (in_array($field_type, ['select', 'radio'], true) && count($opts) === 0) {
                $fail('Please list at least one choice for this field.');
            }
            $field_options = $opts ? json_encode($opts, JSON_UNESCAPED_UNICODE) : null;
        }

        // field_name is the key the answer is stored under; derive it from the
        // label when blank and keep it unique within the service.
        $field_name = strtolower(trim($input['field_name'] ?? ''));
        if ($field_name === '') $field_name = $field_label;
        $field_name = trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($field_name)), '_');
        if ($field_name === '') $field_name = 'field';
        $field_name = substr($field_name, 0, 90);
        $base = $field_name;
        $n = 2;
        $taken = $conn->prepare("SELECT 1 FROM service_fields WHERE service_id = ? AND field_name = ? AND field_id <> ?");
        while (true) {
            $taken->bind_param("isi", $service_id, $field_name, $field_id);
            $taken->execute();
            if ($taken->get_result()->num_rows === 0) break;
            $field_name = $base . '_' . $n++;
        }

        if ($field_id) {
            $stmt = $conn->prepare("UPDATE service_fields SET step_section = ?, field_label = ?, field_name = ?, field_type = ?, field_options = ?, is_required = ?, show_for_target = ?, sort_order = ? WHERE field_id = ? AND service_id = ?");
            $stmt->bind_param("sssssisiii", $step_section, $field_label, $field_name, $field_type, $field_options, $is_required, $show_for_target, $sort_order, $field_id, $service_id);
        } else {
            $stmt = $conn->prepare("INSERT INTO service_fields (service_id, step_section, field_label, field_name, field_type, field_options, is_required, show_for_target, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("isssssisi", $service_id, $step_section, $field_label, $field_name, $field_type, $field_options, $is_required, $show_for_target, $sort_order);
        }
        if (!$stmt->execute()) $fail('Unable to save the field.');
        echo json_encode(['success' => true, 'message' => 'Field saved successfully', 'field_name' => $field_name]);
        break;

    default:
        $fail('Invalid action parameter');
}
