<?php
// Street and subdivision pick lists (migration 026, rules in address_common.php).
//   GET                         public: active { subdivisions, streets } for the
//                               address fields (AddressCombobox.jsx)
//   GET ?all=1                  admin: also hidden entries and suggestions
//   POST action=save_subdivision admin JSON: { id?, name, kind, is_active }
//   POST action=save_street     admin JSON: { id?, name, subdivision_id|null, is_active }
//                               (both saves take suggestion_id? to close the suggestion they came from)
//   POST action=add_suggestion  admin JSON: { id } adds a typed-in name to the list
//   POST action=dismiss_suggestion admin JSON: { id }
// Entries are never deleted (old addresses may use them): staff hide them.
// Every write is audit-logged.
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/address_common.php';

if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $all = !empty($_GET['all']);
    if ($all) {
        pb2_require_admin();
    }
    session_write_close();
    echo json_encode(['success' => true] + pb2_address_lists($conn, $all));
    exit;
}

pb2_require_admin();
$action = $_GET['action'] ?? '';
$in = json_decode(file_get_contents('php://input'), true) ?: [];
$fail = function (string $msg) {
    echo json_encode(['success' => false, 'message' => $msg]);
    exit;
};
// A save that started from a suggestion ("Edit, then add") closes that suggestion,
// even when staff corrected the spelling.
$closeSuggestion = function () use ($conn, $in) {
    $sid = (int)($in['suggestion_id'] ?? 0);
    if ($sid > 0) {
        $conn->query("UPDATE address_suggestions SET status = 'added' WHERE id = $sid AND status = 'new'");
    }
};
$done = function (string $msg) use ($conn) {
    echo json_encode(['success' => true, 'message' => $msg] + pb2_address_lists($conn, true));
    exit;
};

if ($action === 'save_subdivision') {
    $id = (int)($in['id'] ?? 0);
    $name = pb2_address_clean($in['name'] ?? '');
    $kind = in_array($in['kind'] ?? '', PB2_SUBDIVISION_KINDS, true) ? $in['kind'] : 'subdivision';
    $active = !empty($in['is_active']) ? 1 : 0;
    if ($name === '') $fail('Enter the subdivision name.');
    if (mb_strlen($name) > PB2_ADDRESS_NAME_MAX) $fail('The name is too long.');
    $dup = $conn->prepare("SELECT id FROM address_subdivisions WHERE name = ? AND id <> ?");
    $dup->bind_param('si', $name, $id);
    $dup->execute();
    if ($dup->get_result()->fetch_row()) $fail("$name is already on the list.");
    if ($id > 0) {
        $st = $conn->prepare("UPDATE address_subdivisions SET name = ?, kind = ?, is_active = ? WHERE id = ?");
        $st->bind_param('ssii', $name, $kind, $active, $id);
        $st->execute();
        pb2_log_admin_action('address.subdivision.update', 'address_subdivision', (string)$id, "Updated subdivision $name" . ($active ? '' : ' (hidden)'));
    } else {
        $st = $conn->prepare("INSERT INTO address_subdivisions (name, kind, is_active, source) VALUES (?, ?, ?, 'staff')");
        $st->bind_param('ssi', $name, $kind, $active);
        $st->execute();
        $id = (int)$st->insert_id;
        pb2_log_admin_action('address.subdivision.create', 'address_subdivision', (string)$id, "Added subdivision $name");
    }
    // Clears any matching suggestion.
    $conn->query("UPDATE address_suggestions SET status = 'added' WHERE kind = 'subdivision' AND status = 'new' AND name = '" . $conn->real_escape_string($name) . "'");
    $closeSuggestion();
    $done('Subdivision saved.');
}

if ($action === 'save_street') {
    $id = (int)($in['id'] ?? 0);
    $name = pb2_address_clean($in['name'] ?? '');
    $sub = isset($in['subdivision_id']) && $in['subdivision_id'] !== '' && $in['subdivision_id'] !== null ? (int)$in['subdivision_id'] : null;
    $active = !empty($in['is_active']) ? 1 : 0;
    if ($name === '') $fail('Enter the street name.');
    if (mb_strlen($name) > PB2_ADDRESS_NAME_MAX) $fail('The name is too long.');
    if ($sub !== null) {
        $chk = $conn->prepare("SELECT 1 FROM address_subdivisions WHERE id = ?");
        $chk->bind_param('i', $sub);
        $chk->execute();
        if (!$chk->get_result()->fetch_row()) $fail('Choose a subdivision from the list.');
    }
    // The same street name may exist in two subdivisions, but not twice in one.
    $dup = $conn->prepare("SELECT id FROM address_streets WHERE name = ? AND id <> ? AND (subdivision_id <=> ?)");
    $dup->bind_param('sii', $name, $id, $sub);
    $dup->execute();
    if ($dup->get_result()->fetch_row()) $fail("$name is already listed" . ($sub ? ' in that subdivision.' : '.'));
    if ($id > 0) {
        $st = $conn->prepare("UPDATE address_streets SET name = ?, subdivision_id = ?, is_active = ? WHERE id = ?");
        $st->bind_param('siii', $name, $sub, $active, $id);
        $st->execute();
        pb2_log_admin_action('address.street.update', 'address_street', (string)$id, "Updated street $name" . ($active ? '' : ' (hidden)'));
    } else {
        $st = $conn->prepare("INSERT INTO address_streets (name, subdivision_id, is_active, source) VALUES (?, ?, ?, 'staff')");
        $st->bind_param('sii', $name, $sub, $active);
        $st->execute();
        $id = (int)$st->insert_id;
        pb2_log_admin_action('address.street.create', 'address_street', (string)$id, "Added street $name");
    }
    $conn->query("UPDATE address_suggestions SET status = 'added' WHERE kind = 'street' AND status = 'new' AND name = '" . $conn->real_escape_string($name) . "'");
    $closeSuggestion();
    $done('Street saved.');
}

if ($action === 'add_suggestion' || $action === 'dismiss_suggestion') {
    $id = (int)($in['id'] ?? 0);
    $q = $conn->prepare("SELECT * FROM address_suggestions WHERE id = ? AND status = 'new'");
    $q->bind_param('i', $id);
    $q->execute();
    $s = $q->get_result()->fetch_assoc();
    if (!$s) $fail('That suggestion was already handled.');

    if ($action === 'dismiss_suggestion') {
        $conn->query("UPDATE address_suggestions SET status = 'dismissed' WHERE id = $id");
        pb2_log_admin_action('address.suggestion.dismiss', 'address_suggestion', (string)$id, "Dismissed suggested {$s['kind']} {$s['name']}");
        $done('Suggestion dismissed.');
    }

    if ($s['kind'] === 'subdivision') {
        pb2_address_subdivision_id($conn, $s['name'], 'resident');
    } else {
        // The resident's subdivision comes along (added too if it's new).
        $sub = $s['subdivision_name'] !== '' ? pb2_address_subdivision_id($conn, $s['subdivision_name'], 'resident') : null;
        if ($sub !== null) {
            $conn->query("UPDATE address_suggestions SET status = 'added' WHERE kind = 'subdivision' AND status = 'new' AND name = '" . $conn->real_escape_string($s['subdivision_name']) . "'");
        }
        $dup = $conn->prepare("SELECT 1 FROM address_streets WHERE name = ? AND (subdivision_id <=> ?)");
        $dup->bind_param('si', $s['name'], $sub);
        $dup->execute();
        if (!$dup->get_result()->fetch_row()) {
            $ins = $conn->prepare("INSERT INTO address_streets (name, subdivision_id, source) VALUES (?, ?, 'resident')");
            $ins->bind_param('si', $s['name'], $sub);
            $ins->execute();
        }
    }
    $conn->query("UPDATE address_suggestions SET status = 'added' WHERE id = $id");
    pb2_log_admin_action('address.suggestion.add', 'address_suggestion', (string)$id, "Added suggested {$s['kind']} {$s['name']} to the address list");
    $done("{$s['name']} is now on the list.");
}

$fail('Invalid action.');
