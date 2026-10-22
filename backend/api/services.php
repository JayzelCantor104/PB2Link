<?php
// Services & Form Builder: custom services, the built-in services' settings,
// and the questions of both.
//   GET  ?action=get_all                      public: custom services (request form)
//   GET  ?action=get_catalog                  public: every service for the Services page, in
//                                             display order (built-in + open custom services)
//   GET  ?action=get_builtin&key=K            public: a built-in service's heading, open state
//                                             and extra questions (its request form)
//   GET  ?action=get_fields&service_id=N      public: a custom service's questions
//   GET  ?action=get_admin                    staff: everything above with counts, fees, warnings
//   POST ?action=save_service | toggle_status | delete_service        custom services
//        ?action=save_builtin | toggle_builtin                         built-in services
//        ?action=save_order                                            Services page order
//        ?action=save_field | delete_field | reorder_fields            questions (service_id or builtin_key)
// Writes need module.services and are audit-logged (service.*).
// Schema: migrations 007, 030, 031.
//
// Rules:
// - Names must stay unique on the Services page: a custom service can't take the
//   name of a built-in service (its official name or its current card name) or
//   of another custom service, and a built-in card can't take another's name.
// - A custom service that residents have used can't be deleted: close it.
//   Built-in services are never deleted, only closed (pb2_builtin_require_open()
//   in every submit endpoint refuses new requests).
// - Renaming a built-in service changes only the Services page card and the form
//   heading; certificates, emails and staff lists keep the official name.
// - Removing or editing a question never changes old requests: each request
//   keeps its own copy of the questions with the answers.
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
require_once __DIR__ . '/text_case.php'; // typed text is stored in ALL CAPS
require_once '../db_connection.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/builtin_services_common.php';

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
const PB2_SERVICE_MAX_FIELDS = 40;

$STAFF_ACTIONS = ['get_admin', 'save_service', 'toggle_status', 'delete_service', 'save_builtin', 'toggle_builtin',
    'save_order', 'save_field', 'delete_field', 'reorder_fields'];
if (in_array($action, $STAFF_ACTIONS, true)) {
    $admin = pb2_require_admin();
    require_once __DIR__ . '/admin_permissions.php';
    pb2_require_any_permission(['module.services']); // tab access
}

$fail = function ($msg, array $extra = []) { echo json_encode(['success' => false, 'message' => $msg] + $extra); exit(); };

/** Compare names the way a resident reads them: case, spacing and punctuation ignored. */
function pb2_service_title_key(string $title): string
{
    return trim(preg_replace('/[^A-Z0-9Ñ]+/u', ' ', mb_strtoupper($title, 'UTF-8')));
}

/** Built-in settings rows keyed by service_key ([] before migration 031). */
function pb2_builtin_rows(mysqli $conn): array
{
    $rows = [];
    try {
        $r = $conn->query("SELECT * FROM builtin_services");
        while ($r && ($b = $r->fetch_assoc())) $rows[$b['service_key']] = $b;
    } catch (Throwable $e) {
    }
    return $rows;
}

/**
 * Who already uses this name on the Services page, ignoring $self
 * ('builtin:<key>' or 'service:<id>'). Returns a description or null.
 */
function pb2_service_name_taken(mysqli $conn, string $title, string $self): ?string
{
    $key = pb2_service_title_key($title);
    $builtins = pb2_builtin_rows($conn);
    foreach (PB2_BUILTIN_SERVICES as $k => $def) {
        if ("builtin:$k" === $self) continue;
        $names = [$def['label']];
        if (isset($builtins[$k])) $names[] = $builtins[$k]['display_title'];
        foreach ($names as $n) {
            if (pb2_service_title_key($n) === $key) return "the built-in \"{$def['label']}\" service";
        }
    }
    $r = $conn->query("SELECT service_id, title FROM services");
    while ($r && ($o = $r->fetch_assoc())) {
        if ("service:{$o['service_id']}" !== $self && pb2_service_title_key($o['title']) === $key) return "the service \"{$o['title']}\"";
    }
    return null;
}

/** Fees by fee_key (payment_common.php, migration 020), [] when unavailable. */
function pb2_service_fees(mysqli $conn): array
{
    $fees = [];
    try {
        $r = $conn->query("SELECT fee_key, amount FROM request_fees");
        while ($r && ($f = $r->fetch_assoc())) $fees[$f['fee_key']] = (float)$f['amount'];
    } catch (Throwable $e) {
    }
    return $fees;
}

$loadService = function (int $id) use ($conn) {
    $q = $conn->prepare("SELECT service_id, title, category, icon, description, allow_third_party, is_active FROM services WHERE service_id = ?");
    $q->bind_param("i", $id);
    $q->execute();
    return $q->get_result()->fetch_assoc();
};
$cleanIcon = function ($icon) {
    return in_array($icon, PB2_SERVICE_ICONS, true) ? $icon : null;
};

/**
 * The owner of a question: a custom service (service_id) or a built-in one
 * (builtin_key). Ends the request when it doesn't exist.
 */
$resolveOwner = function (array $in) use ($conn, $loadService, $fail): array {
    $bk = (string)($in['builtin_key'] ?? '');
    if ($bk !== '') {
        if (!isset(PB2_BUILTIN_SERVICES[$bk])) $fail('Service not found.');
        return ['col' => 'builtin_key', 'type' => 's', 'val' => $bk, 'ref' => "builtin:$bk",
                'name' => PB2_BUILTIN_SERVICES[$bk]['label'], 'mode' => PB2_BUILTIN_SERVICES[$bk]['mode'], 'builtin' => true];
    }
    $sid = (int)($in['service_id'] ?? 0);
    $s = $sid ? $loadService($sid) : null;
    if (!$s) $fail('Service not found.');
    return ['col' => 'service_id', 'type' => 'i', 'val' => $sid, 'ref' => (string)$sid,
            'name' => $s['title'], 'mode' => (int)$s['allow_third_party'] === 1, 'builtin' => false];
};
$ownerFieldCount = function (array $o) use ($conn): int {
    $q = $conn->prepare("SELECT COUNT(*) FROM service_fields WHERE {$o['col']} = ?");
    $q->bind_param($o['type'], $o['val']);
    $q->execute();
    return (int)$q->get_result()->fetch_row()[0];
};
// Audit target for a question change.
$auditTarget = function (array $o): array {
    return $o['builtin'] ? ['builtin_service', $o['val']] : ['service', (string)$o['val']];
};

/** Cast a field row for JSON. */
function pb2_service_field_out(array $f): array
{
    $f['field_id'] = (int)$f['field_id'];
    $f['service_id'] = isset($f['service_id']) ? (int)$f['service_id'] : null;
    $f['is_required'] = (int)$f['is_required'];
    $f['sort_order'] = (int)$f['sort_order'];
    return $f;
}

/** Built-in service as sent to pages. */
function pb2_builtin_out(string $key, ?array $row): array
{
    $def = PB2_BUILTIN_SERVICES[$key];
    return [
        'key' => $key,
        'label' => $def['label'],
        'route' => $def['route'],
        'has_mode' => $def['mode'],
        'title' => $row['display_title'] ?? $def['label'],
        'description' => $row['description'] ?? '',
        'category' => $row['category'] ?? 'Clearance & Certification',
        'icon' => $row['icon'] ?? 'bi-file-earmark-text-fill',
        'is_active' => $row ? (int)$row['is_active'] : 1,
        'closed_message' => $row['closed_message'] ?? null,
        'sort_order' => $row ? (int)$row['sort_order'] : 0,
    ];
}

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

    case 'get_catalog':
        // The Services page: built-in services (closed ones too, shown as
        // unavailable) and open custom services (closed = still being built).
        $items = [];
        $rows = pb2_builtin_rows($conn);
        foreach (PB2_BUILTIN_SERVICES as $k => $def) {
            $b = pb2_builtin_out($k, $rows[$k] ?? null);
            $items[] = $b + ['kind' => 'builtin', 'id' => $k];
        }
        $hasSort = true;
        try {
            $r = $conn->query("SELECT service_id, title, category, icon, description, sort_order FROM services WHERE is_active = 1");
        } catch (Throwable $e) {
            $hasSort = false;
            $r = $conn->query("SELECT service_id, title, category, NULL AS icon, description, 100 AS sort_order FROM services WHERE is_active = 1");
        }
        while ($r && ($s = $r->fetch_assoc())) {
            $items[] = ['kind' => 'custom', 'id' => (int)$s['service_id'], 'title' => $s['title'], 'description' => $s['description'] ?? '',
                'category' => $s['category'], 'icon' => $s['icon'], 'is_active' => 1, 'closed_message' => null,
                'sort_order' => (int)$s['sort_order'], 'route' => '/request/' . (int)$s['service_id']];
        }
        usort($items, function ($a, $b) {
            return [$a['sort_order'], $a['kind'] === 'builtin' ? 0 : 1, $a['title']] <=> [$b['sort_order'], $b['kind'] === 'builtin' ? 0 : 1, $b['title']];
        });
        echo json_encode(['success' => true, 'items' => $items]);
        break;

    case 'get_builtin':
        $key = (string)($_GET['key'] ?? '');
        if (!isset(PB2_BUILTIN_SERVICES[$key])) $fail('Service not found.');
        require_once __DIR__ . '/service_fields_common.php';
        $fields = array_map('pb2_service_field_out', pb2_extra_fields($conn, $key));
        echo json_encode(['success' => true, 'service' => pb2_builtin_out($key, pb2_builtin_get($conn, $key)), 'fields' => $fields]);
        break;

    case 'get_admin':
        $fees = pb2_service_fees($conn);
        $countSub = function (string $sql) use ($conn): array {
            $out = [];
            try {
                $r = $conn->query($sql);
                while ($r && ($x = $r->fetch_row())) $out[$x[0]] = [(int)$x[1], (int)$x[2]];
            } catch (Throwable $e) {
            }
            return $out;
        };

        // Custom services.
        $result = $conn->query("SELECT s.*,
                (SELECT COUNT(*) FROM service_fields f WHERE f.service_id = s.service_id) AS field_count,
                (SELECT COUNT(*) FROM service_submissions ss WHERE ss.service_id = s.service_id) AS request_count,
                (SELECT COUNT(*) FROM service_submissions ss WHERE ss.service_id = s.service_id AND ss.status IN ('Pending','Processing')) AS open_count
            FROM services s ORDER BY s.is_active DESC, s.title ASC");
        if (!$result) $fail('Unable to load services.');
        $services = [];
        $seen = [];
        foreach ($result->fetch_all(MYSQLI_ASSOC) as $s) {
            foreach (['service_id', 'allow_third_party', 'is_active', 'field_count', 'request_count', 'open_count'] as $k) $s[$k] = (int)$s[$k];
            $s['sort_order'] = (int)($s['sort_order'] ?? 100);
            $s['fee'] = $fees['service:' . $s['service_id']] ?? null;
            $warnings = [];
            $taken = pb2_service_name_taken($conn, $s['title'], 'service:' . $s['service_id']);
            if ($taken && strpos($taken, 'built-in') !== false) {
                $warnings[] = "Has the same name as $taken, so residents never see it. Rename it.";
            }
            $key = pb2_service_title_key($s['title']);
            if (isset($seen[$key])) $warnings[] = 'Another custom service has the same name. Residents only see one of them.';
            $seen[$key] = true;
            $s['warnings'] = $warnings;
            $services[] = $s;
        }

        // Built-in services.
        $rows = pb2_builtin_rows($conn);
        $fieldCounts = [];
        try {
            $r = $conn->query("SELECT builtin_key, COUNT(*) FROM service_fields WHERE builtin_key IS NOT NULL GROUP BY builtin_key");
            while ($r && ($x = $r->fetch_row())) $fieldCounts[$x[0]] = (int)$x[1];
        } catch (Throwable $e) {
        }
        $builtins = [];
        foreach (PB2_BUILTIN_SERVICES as $k => $def) {
            $b = pb2_builtin_out($k, $rows[$k] ?? null);
            $openStatuses = "'Pending','Processing'";
            [$total, $open] = [0, 0];
            try {
                $x = $conn->query("SELECT COUNT(*), SUM(status IN ($openStatuses)) FROM `{$def['table']}`")->fetch_row();
                [$total, $open] = [(int)$x[0], (int)$x[1]];
            } catch (Throwable $e) {
            }
            $b += [
                'field_count' => $fieldCounts[$k] ?? 0,
                'request_count' => $total,
                'open_count' => $open,
                'fee' => $def['fee'] !== null ? ($fees[$def['fee']] ?? null) : null,
                'has_fee' => $def['fee'] !== null,
                'configured' => isset($rows[$k]),
            ];
            $builtins[] = $b;
        }
        usort($builtins, function ($a, $b) { return $a['sort_order'] <=> $b['sort_order']; });
        echo json_encode(['success' => true, 'services' => $services, 'builtins' => $builtins,
            'max_fields' => PB2_SERVICE_MAX_FIELDS, 'icons' => PB2_SERVICE_ICONS, 'categories' => $CATEGORIES,
            'needs_migration' => !$rows]);
        break;

    case 'get_fields':
        $service_id = (int)($_GET['service_id'] ?? $input['service_id'] ?? 0);
        $builtin_key = (string)($_GET['builtin_key'] ?? '');
        if ($builtin_key !== '') {
            if (!isset(PB2_BUILTIN_SERVICES[$builtin_key])) $fail('Service not found.');
            require_once __DIR__ . '/service_fields_common.php';
            echo json_encode(['success' => true, 'fields' => array_map('pb2_service_field_out', pb2_extra_fields($conn, $builtin_key))]);
            break;
        }
        if (!$service_id) $fail('Service ID is required');
        $stmt = $conn->prepare("SELECT * FROM service_fields WHERE service_id = ? ORDER BY FIELD(step_section, 'Identity', 'Residency', 'Uploads', 'Review'), sort_order ASC, field_id ASC");
        $stmt->bind_param("i", $service_id);
        $stmt->execute();
        $fields = array_map('pb2_service_field_out', $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        echo json_encode(['success' => true, 'fields' => $fields]);
        break;

    // ------------------------------------------------------------ custom services
    case 'save_service':
        $service_id = (int)($input['service_id'] ?? 0);
        $title = trim(preg_replace('/\s+/u', ' ', (string)($input['title'] ?? '')));
        $category = in_array($input['category'] ?? '', $CATEGORIES, true) ? $input['category'] : 'Clearance & Certification';
        $description = trim((string)($input['description'] ?? ''));
        $allow_third_party = !empty($input['allow_third_party']) ? 1 : 0;
        $is_active = isset($input['is_active']) ? (!empty($input['is_active']) ? 1 : 0) : 1;
        $icon = $cleanIcon($input['icon'] ?? null);

        if ($title === '') $fail('Enter the service name.');
        if (mb_strlen($title) > 150) $fail('The name must be 150 characters or fewer.');
        if (mb_strlen($description) > 1000) $fail('The description must be 1,000 characters or fewer.');
        if ($taken = pb2_service_name_taken($conn, $title, 'service:' . $service_id)) {
            $fail("That name is already used by $taken. Choose a different name.");
        }

        $oldService = null;
        if ($service_id) {
            $oldService = $loadService($service_id);
            if (!$oldService) $fail('Service not found.');
        }
        if ($service_id) {
            $stmt = $conn->prepare("UPDATE services SET title = ?, category = ?, icon = ?, description = ?, allow_third_party = ?, is_active = ? WHERE service_id = ?");
            $stmt->bind_param("ssssiii", $title, $category, $icon, $description, $allow_third_party, $is_active, $service_id);
        } else {
            $created_by = (int)$admin['admin_id'];
            // New services go to the end of the Services page.
            $next = 100;
            try { $next = (int)$conn->query("SELECT GREATEST(COALESCE(MAX(sort_order), 0), (SELECT COALESCE(MAX(sort_order), 0) FROM builtin_services)) + 1 FROM services")->fetch_row()[0]; } catch (Throwable $e) {}
            $stmt = $conn->prepare("INSERT INTO services (title, category, icon, description, allow_third_party, is_active, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("ssssiiii", $title, $category, $icon, $description, $allow_third_party, $is_active, $next, $created_by);
        }
        if (!$stmt->execute()) $fail('Unable to save the service.');
        $savedId = $service_id ?: (int)$stmt->insert_id;
        $newService = ['title' => $title, 'category' => $category, 'icon' => $icon, 'description' => $description, 'allow_third_party' => $allow_third_party, 'is_active' => $is_active];
        $auditChanges = [];
        foreach ($newService as $k => $v) {
            $old = $oldService[$k] ?? null;
            if ($oldService === null || (string)$old !== (string)$v) $auditChanges[] = ['field' => $k, 'old_value' => $old, 'new_value' => $v];
        }
        if ($oldService === null || $auditChanges) {
            pb2_log_admin_action($oldService === null ? 'service.create' : 'service.update', 'service', (string)$savedId,
                ($oldService === null ? 'Created' : 'Edited') . " service \"$title\"", $auditChanges);
        }
        echo json_encode(['success' => true, 'message' => $oldService === null ? 'Service created. Add the questions it needs, then open it to residents.' : 'Service saved.', 'service_id' => $savedId]);
        break;

    case 'toggle_status':
        $service_id = (int)($input['service_id'] ?? 0);
        $is_active = !empty($input['is_active']) ? 1 : 0;
        if (!$service_id) $fail('Service ID required');

        $oldService = $loadService($service_id);
        if (!$oldService) $fail('Service not found.');
        if ($is_active && ($taken = pb2_service_name_taken($conn, $oldService['title'], 'service:' . $service_id))) {
            $fail("Rename this service first: $taken already uses this name, so residents would not see it.");
        }
        $stmt = $conn->prepare("UPDATE services SET is_active = ? WHERE service_id = ?");
        $stmt->bind_param("ii", $is_active, $service_id);
        if (!$stmt->execute()) $fail('Unable to update the service.');
        if ((int)$oldService['is_active'] !== $is_active) {
            pb2_log_admin_action('service.status', 'service', (string)$service_id,
                ($is_active ? 'Opened' : 'Closed') . " service \"{$oldService['title']}\" to residents",
                [['field' => 'is_active', 'old_value' => $oldService['is_active'], 'new_value' => $is_active]]);
        }
        echo json_encode(['success' => true, 'message' => $is_active
            ? "\"{$oldService['title']}\" is open: residents can request it on the Services page."
            : "\"{$oldService['title']}\" is closed: residents no longer see it. Requests already sent are kept."]);
        break;

    case 'delete_service':
        $service_id = (int)($input['service_id'] ?? 0);
        $oldService = $service_id ? $loadService($service_id) : null;
        if (!$oldService) $fail('Service not found.');
        $q = $conn->prepare("SELECT COUNT(*) FROM service_submissions WHERE service_id = ?");
        $q->bind_param("i", $service_id);
        $q->execute();
        $used = (int)$q->get_result()->fetch_row()[0];
        if ($used > 0) {
            $fail("Residents have already sent $used request(s) for this service, so it can't be deleted. Close it instead: it disappears for residents and the requests are kept.");
        }
        $fields = [];
        $q = $conn->prepare("SELECT field_label, field_type FROM service_fields WHERE service_id = ? ORDER BY sort_order");
        $q->bind_param("i", $service_id);
        $q->execute();
        foreach ($q->get_result()->fetch_all(MYSQLI_ASSOC) as $f) $fields[] = $f['field_label'] . ' (' . $f['field_type'] . ')';
        $conn->begin_transaction();
        try {
            $d = $conn->prepare("DELETE FROM service_fields WHERE service_id = ?");
            $d->bind_param("i", $service_id);
            $d->execute();
            try {
                $feeKey = 'service:' . $service_id;
                $d = $conn->prepare("DELETE FROM request_fees WHERE fee_key = ?");
                $d->bind_param("s", $feeKey);
                $d->execute();
            } catch (Throwable $e) {
                // no fees table
            }
            $d = $conn->prepare("DELETE FROM services WHERE service_id = ?");
            $d->bind_param("i", $service_id);
            $d->execute();
            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            error_log('services.php delete_service: ' . $e->getMessage());
            $fail('The service could not be deleted.');
        }
        pb2_log_admin_action('service.delete', 'service', (string)$service_id, "Deleted service \"{$oldService['title']}\" (never used)", [
            ['field' => 'title', 'old_value' => $oldService['title'], 'new_value' => null],
            ['field' => 'category', 'old_value' => $oldService['category'], 'new_value' => null],
            ['field' => 'description', 'old_value' => $oldService['description'], 'new_value' => null],
            ['field' => 'fields', 'old_value' => implode('; ', $fields), 'new_value' => null],
        ]);
        echo json_encode(['success' => true, 'message' => "\"{$oldService['title']}\" was deleted."]);
        break;

    // ------------------------------------------------------------ built-in services
    case 'save_builtin':
        $key = (string)($input['key'] ?? '');
        if (!isset(PB2_BUILTIN_SERVICES[$key])) $fail('Service not found.');
        $old = pb2_builtin_get($conn, $key);
        if (!$old) $fail('Apply backend/migrations/031_builtin_services.sql first.');
        $title = trim(preg_replace('/\s+/u', ' ', (string)($input['title'] ?? '')));
        $description = trim((string)($input['description'] ?? ''));
        $category = in_array($input['category'] ?? '', $CATEGORIES, true) ? $input['category'] : $old['category'];
        $icon = $cleanIcon($input['icon'] ?? null) ?? $old['icon'];
        $closedMsg = trim(preg_replace('/\s+/u', ' ', (string)($input['closed_message'] ?? '')));
        if ($title === '') $fail('Enter the name residents see.');
        if (mb_strlen($title) > 150) $fail('The name must be 150 characters or fewer.');
        if (mb_strlen($description) > 1000) $fail('The description must be 1,000 characters or fewer.');
        if (mb_strlen($closedMsg) > 300) $fail('The closed message must be 300 characters or fewer.');
        if ($taken = pb2_service_name_taken($conn, $title, "builtin:$key")) $fail("That name is already used by $taken. Choose a different name.");
        $closedVal = $closedMsg !== '' ? $closedMsg : null;
        $by = (int)$admin['admin_id'];
        $st = $conn->prepare("UPDATE builtin_services SET display_title = ?, description = ?, category = ?, icon = ?, closed_message = ?, updated_by = ? WHERE service_key = ?");
        $st->bind_param('sssssis', $title, $description, $category, $icon, $closedVal, $by, $key);
        if (!$st->execute()) $fail('Unable to save the service.');
        $changes = [];
        foreach (['display_title' => $title, 'description' => $description, 'category' => $category, 'icon' => $icon, 'closed_message' => $closedVal] as $k => $v) {
            if ((string)$old[$k] !== (string)$v) $changes[] = ['field' => $k, 'old_value' => $old[$k], 'new_value' => $v];
        }
        if ($changes) {
            pb2_log_admin_action('service.builtin.update', 'builtin_service', $key,
                'Edited the Services page card of ' . PB2_BUILTIN_SERVICES[$key]['label'], $changes);
        }
        echo json_encode(['success' => true, 'message' => 'Saved. Residents see the change on the Services page and the form heading.']);
        break;

    case 'toggle_builtin':
        $key = (string)($input['key'] ?? '');
        if (!isset(PB2_BUILTIN_SERVICES[$key])) $fail('Service not found.');
        $old = pb2_builtin_get($conn, $key);
        if (!$old) $fail('Apply backend/migrations/031_builtin_services.sql first.');
        $is_active = !empty($input['is_active']) ? 1 : 0;
        $by = (int)$admin['admin_id'];
        $st = $conn->prepare("UPDATE builtin_services SET is_active = ?, updated_by = ? WHERE service_key = ?");
        $st->bind_param('iis', $is_active, $by, $key);
        if (!$st->execute()) $fail('Unable to update the service.');
        $label = PB2_BUILTIN_SERVICES[$key]['label'];
        if ((int)$old['is_active'] !== $is_active) {
            pb2_log_admin_action('service.builtin.status', 'builtin_service', $key,
                ($is_active ? 'Opened' : 'Closed') . " $label to new requests",
                [['field' => 'is_active', 'old_value' => $old['is_active'], 'new_value' => $is_active]]);
        }
        echo json_encode(['success' => true, 'message' => $is_active
            ? "$label is open again."
            : "$label is closed: residents see it as unavailable and new requests are refused. Requests already sent can still be processed."]);
        break;

    case 'save_order':
        // { order: ['builtin:clearance', 'service:3', ...] } top to bottom.
        $order = array_values(array_unique(array_map('strval', (array)($input['order'] ?? []))));
        if (!$order) $fail('Nothing to reorder.');
        $ub = $conn->prepare("UPDATE builtin_services SET sort_order = ? WHERE service_key = ?");
        $us = $conn->prepare("UPDATE services SET sort_order = ? WHERE service_id = ?");
        foreach ($order as $i => $ref) {
            $pos = $i + 1;
            if (strpos($ref, 'builtin:') === 0) {
                $k = substr($ref, 8);
                if (!isset(PB2_BUILTIN_SERVICES[$k])) continue;
                $ub->bind_param('is', $pos, $k);
                $ub->execute();
            } elseif (strpos($ref, 'service:') === 0) {
                $sid = (int)substr($ref, 8);
                $us->bind_param('ii', $pos, $sid);
                $us->execute();
            }
        }
        pb2_log_admin_action('service.order', 'services_page', null, 'Changed the order of the Services page',
            [['field' => 'order', 'old_value' => null, 'new_value' => implode(', ', $order)]]);
        echo json_encode(['success' => true, 'message' => 'Order saved. Residents see it on the Services page.']);
        break;

    // ------------------------------------------------------------ questions
    case 'save_field':
        $owner = $resolveOwner($input);
        $field_id = (int)($input['field_id'] ?? 0);
        // Built-in forms ask extra questions at their end only.
        $step_section = $owner['builtin'] ? 'Review'
            : (in_array($input['step_section'] ?? '', $STEPS, true) ? $input['step_section'] : 'Residency');
        $field_label = trim(preg_replace('/\s+/u', ' ', (string)($input['field_label'] ?? '')));
        $help_text = trim(preg_replace('/\s+/u', ' ', (string)($input['help_text'] ?? '')));
        $field_type = in_array($input['field_type'] ?? '', $FIELD_TYPES, true) ? $input['field_type'] : 'text';
        $is_required = isset($input['is_required']) ? (!empty($input['is_required']) ? 1 : 0) : 1;
        $show_for_target = $owner['mode'] && in_array($input['show_for_target'] ?? '', $TARGETS, true) ? $input['show_for_target'] : 'all';

        if ($field_label === '') $fail('Enter the question or label.');
        if (mb_strlen($field_label) > 150) $fail('The label must be 150 characters or fewer.');
        if (mb_strlen($help_text) > 300) $fail('The hint must be 300 characters or fewer.');
        if (!$field_id && $ownerFieldCount($owner) >= PB2_SERVICE_MAX_FIELDS) {
            $fail('A service can have up to ' . PB2_SERVICE_MAX_FIELDS . ' questions.');
        }

        // Choices: an array, a JSON array, or "a, b, c" / one per line.
        $field_options = null;
        if (in_array($field_type, ['select', 'radio', 'checkbox'], true)) {
            $raw = $input['field_options'] ?? '';
            $opts = is_array($raw) ? $raw : json_decode((string)$raw, true);
            if (!is_array($opts)) $opts = preg_split('/[\r\n,]+/', (string)$raw);
            // Choices are stored in ALL CAPS; answers are checked against them.
            $opts = array_values(array_unique(array_filter(array_map(fn($o) => trim((string)$o), $opts), 'strlen')));
            if (in_array($field_type, ['select', 'radio'], true) && count($opts) < 2) {
                $fail('List at least two choices for a dropdown or a single-choice question.');
            }
            if (count($opts) > 50) $fail('Up to 50 choices per question.');
            foreach ($opts as $o) if (mb_strlen($o) > 150) $fail('Each choice must be 150 characters or fewer.');
            $field_options = $opts ? json_encode($opts, JSON_UNESCAPED_UNICODE) : null;
        }

        $oldField = null;
        if ($field_id) {
            $q = $conn->prepare("SELECT step_section, field_label, field_name, field_type, field_options, help_text, is_required, show_for_target, sort_order
                                 FROM service_fields WHERE field_id = ? AND {$owner['col']} = ?");
            $q->bind_param('i' . $owner['type'], $field_id, $owner['val']);
            $q->execute();
            $oldField = $q->get_result()->fetch_assoc();
            if (!$oldField) $fail('Field not found.');
        }

        // field_name is the key the answer is stored under: set once from the
        // label, kept when the label is edited later.
        if ($oldField) {
            $field_name = $oldField['field_name'];
        } else {
            $field_name = trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($field_label)), '_');
            if ($field_name === '') $field_name = 'field';
            $field_name = substr($field_name, 0, 90);
            $base = $field_name;
            $n = 2;
            $taken = $conn->prepare("SELECT 1 FROM service_fields WHERE {$owner['col']} = ? AND field_name = ?");
            while (true) {
                $taken->bind_param($owner['type'] . 's', $owner['val'], $field_name);
                $taken->execute();
                if ($taken->get_result()->num_rows === 0) break;
                $field_name = $base . '_' . $n++;
            }
        }

        // A new field, or one moved to another step, goes to the end of that step.
        if (!$oldField || $oldField['step_section'] !== $step_section) {
            $q = $conn->prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM service_fields WHERE {$owner['col']} = ? AND step_section = ?");
            $q->bind_param($owner['type'] . 's', $owner['val'], $step_section);
            $q->execute();
            $sort_order = (int)$q->get_result()->fetch_row()[0];
        } else {
            $sort_order = (int)$oldField['sort_order'];
        }
        $helpVal = $help_text !== '' ? $help_text : null;

        if ($field_id) {
            $stmt = $conn->prepare("UPDATE service_fields SET step_section = ?, field_label = ?, field_type = ?, field_options = ?, help_text = ?, is_required = ?, show_for_target = ?, sort_order = ?
                                    WHERE field_id = ? AND {$owner['col']} = ?");
            $stmt->bind_param('sssssisii' . $owner['type'], $step_section, $field_label, $field_type, $field_options, $helpVal, $is_required, $show_for_target, $sort_order, $field_id, $owner['val']);
        } else {
            $sid = $owner['builtin'] ? null : (int)$owner['val'];
            $bkey = $owner['builtin'] ? $owner['val'] : null;
            $stmt = $conn->prepare("INSERT INTO service_fields (service_id, builtin_key, step_section, field_label, field_name, field_type, field_options, help_text, is_required, show_for_target, sort_order)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param('isssssssisi', $sid, $bkey, $step_section, $field_label, $field_name, $field_type, $field_options, $helpVal, $is_required, $show_for_target, $sort_order);
        }
        if (!$stmt->execute()) $fail('Unable to save the field.');
        $savedField = $field_id ?: (int)$stmt->insert_id;
        $newField = ['step_section' => $step_section, 'field_label' => $field_label, 'field_type' => $field_type, 'field_options' => $field_options, 'help_text' => $helpVal, 'is_required' => $is_required, 'show_for_target' => $show_for_target];
        $auditChanges = [];
        foreach ($newField as $k => $v) {
            $old = $oldField[$k] ?? null;
            if ($oldField === null || (string)$old !== (string)$v) $auditChanges[] = ['field' => $k, 'old_value' => $old, 'new_value' => $v];
        }
        if ($oldField === null || $auditChanges) {
            [$tt, $tid] = $auditTarget($owner);
            pb2_log_admin_action($oldField === null ? 'service.field.create' : 'service.field.update', $tt, $tid,
                ($oldField === null ? 'Added' : 'Edited') . " question \"$field_label\" (field #$savedField) on {$owner['name']}", $auditChanges);
        }
        echo json_encode(['success' => true, 'message' => $oldField ? 'Question saved.' : 'Question added.', 'field_id' => $savedField, 'field_name' => $field_name]);
        break;

    case 'delete_field':
        $owner = $resolveOwner($input);
        $field_id = (int)($input['field_id'] ?? 0);
        $q = $conn->prepare("SELECT field_label, field_type, step_section FROM service_fields WHERE field_id = ? AND {$owner['col']} = ?");
        $q->bind_param('i' . $owner['type'], $field_id, $owner['val']);
        $q->execute();
        $oldField = $q->get_result()->fetch_assoc();
        if (!$oldField) $fail('Field not found.');
        $d = $conn->prepare("DELETE FROM service_fields WHERE field_id = ? AND {$owner['col']} = ?");
        $d->bind_param('i' . $owner['type'], $field_id, $owner['val']);
        if (!$d->execute()) $fail('The question could not be removed.');
        [$tt, $tid] = $auditTarget($owner);
        pb2_log_admin_action('service.field.delete', $tt, $tid,
            "Removed question \"{$oldField['field_label']}\" (field #$field_id) from {$owner['name']}",
            [['field' => 'field', 'old_value' => "{$oldField['field_label']} ({$oldField['field_type']}, {$oldField['step_section']})", 'new_value' => null]]);
        echo json_encode(['success' => true, 'message' => 'Question removed. Answers already sent with earlier requests are kept.']);
        break;

    case 'reorder_fields':
        // { service_id | builtin_key, step_section, order: [field_id, ...] }
        $owner = $resolveOwner($input);
        $step_section = $owner['builtin'] ? 'Review' : (string)($input['step_section'] ?? '');
        $order = array_values(array_unique(array_map('intval', (array)($input['order'] ?? []))));
        if (!in_array($step_section, $STEPS, true) || !$order) $fail('Nothing to reorder.');
        $q = $conn->prepare("SELECT field_id FROM service_fields WHERE {$owner['col']} = ? AND step_section = ?");
        $q->bind_param($owner['type'] . 's', $owner['val'], $step_section);
        $q->execute();
        $existing = array_map('intval', array_column($q->get_result()->fetch_all(MYSQLI_ASSOC), 'field_id'));
        sort($existing);
        $check = $order;
        sort($check);
        if ($existing !== $check) $fail('The list changed. Reload the page and try again.');
        $u = $conn->prepare("UPDATE service_fields SET sort_order = ? WHERE field_id = ? AND {$owner['col']} = ?");
        foreach ($order as $i => $fid) {
            $pos = $i + 1;
            $u->bind_param('ii' . $owner['type'], $pos, $fid, $owner['val']);
            $u->execute();
        }
        [$tt, $tid] = $auditTarget($owner);
        pb2_log_admin_action('service.field.reorder', $tt, $tid, "Reordered the questions of {$owner['name']}",
            [['field' => 'order', 'old_value' => null, 'new_value' => implode(', ', $order)]]);
        echo json_encode(['success' => true, 'message' => 'Order saved.']);
        break;

    default:
        $fail('Invalid action parameter');
}
