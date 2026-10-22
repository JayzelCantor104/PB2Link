<?php
/**
 * Admin access control (migration 020; tab access added later, no migration).
 *
 * The system role stays: Super (everything, always) or Admin. On top of it,
 * a standard admin's access is worked out in three layers:
 *   1. the standard-admin template, set by the Super Admin
 *      (system_settings 'standard_admin_permissions', JSON [perm, ...]);
 *      when it has never been saved, every tab is included, so admins who
 *      existed before tab access keep what they had;
 *   2. their barangay position's template (system_settings
 *      'position_permissions', JSON {position: [perm, ...]}), which only adds;
 *   3. per-admin overrides (admins.permission_overrides, JSON {perm: true|false}),
 *      where a Deny always wins.
 *
 * Permissions are checked on the server in every admin endpoint (hiding a tab
 * is only convenience). A missing permission answers code NO_PERMISSION on
 * HTTP 200, never 401/403: src/lib/apiClient.js signs the admin out on those,
 * and a missing permission is not a lost session.
 *
 *     require_once __DIR__ . '/admin_permissions.php';
 *     pb2_require_any_permission(['module.documents']);
 *
 * Manage Admins, the Audit Log and system settings stay Super-only
 * (pb2_require_super_admin) and are never grantable: separation of duties.
 * Mirrored for display in src/lib/adminAccess.js.
 */

const PB2_ADMIN_POSITIONS = [
    'Punong Barangay',
    'Barangay Secretary',
    'Barangay Treasurer',
    'Barangay Kagawad',
    'SK Chairperson',
    'Barangay Staff',
];

/** Every grantable permission: key => label. Order is the display order. */
const PB2_PERMISSIONS = [
    'module.residents'     => 'Residents and profile approvals',
    'module.address'       => 'Address list',
    'module.documents'     => 'Document requests',
    'module.services'      => 'Services and form builder',
    'module.incidents'     => 'Incident reports',
    'module.amenities'     => 'Amenities and bookings',
    'module.announcements' => 'Announcements and About page',
    'module.waste'         => 'Waste management',
    'module.disaster'      => 'Disaster risk',
    'disaster.sms'         => 'Send SMS broadcasts to residents',
    // Not in the default standard access: personal data (migration 033).
    'disaster.vulnerable'  => 'See the vulnerable residents list (seniors and persons with disability)',
    'module.issues'        => 'Community issue map',
    'payments.settings'    => 'Manage fees and the payment QR / account',
    'payments.verify'      => 'Verify payments and record O.R. numbers',
];

/** The tabs (module.*), used as the template before the Super Admin saves one. */
const PB2_MODULE_PERMISSIONS = [
    'module.residents', 'module.address', 'module.documents', 'module.services', 'module.incidents',
    'module.amenities', 'module.announcements', 'module.waste', 'module.disaster', 'disaster.sms', 'module.issues',
];

const PB2_SYSTEM_ROLES = ['Super', 'Admin'];

/** A connection for permission checks: the endpoint's, or a short-lived one. */
function pb2_perm_conn(): ?mysqli
{
    if (isset($GLOBALS['conn']) && $GLOBALS['conn'] instanceof mysqli) return $GLOBALS['conn'];
    static $own = null;
    if ($own) return $own;
    $configPath = __DIR__ . '/../config.php';
    if (!file_exists($configPath)) return null;
    require_once $configPath;
    $c = @mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if (!$c) return null;
    mysqli_set_charset($c, 'utf8mb4');
    return $own = $c;
}

/** A system_settings value, or null when missing. */
function pb2_perm_setting(mysqli $conn, string $key): ?string
{
    try {
        $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
        $stmt->bind_param('s', $key);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_row();
        $stmt->close();
        return $row ? (string)$row[0] : null;
    } catch (Throwable $e) {
        return null; // table missing
    }
}

/** Keeps known permissions only, in display order. */
function pb2_clean_permission_list($value): array
{
    return is_array($value) ? array_values(array_intersect(array_keys(PB2_PERMISSIONS), $value)) : [];
}

/** The standard-admin template: [perm, ...]. Every tab until the Super Admin saves one. */
function pb2_standard_permissions(mysqli $conn): array
{
    $raw = pb2_perm_setting($conn, 'standard_admin_permissions');
    if ($raw === null) return PB2_MODULE_PERMISSIONS;
    return pb2_clean_permission_list(json_decode($raw, true));
}

/** {position: [perm, ...]} with unknown positions/permissions dropped. */
function pb2_position_permissions(mysqli $conn): array
{
    return pb2_clean_position_permissions(json_decode((string)pb2_perm_setting($conn, 'position_permissions'), true));
}

function pb2_clean_position_permissions($value): array
{
    $out = [];
    foreach (PB2_ADMIN_POSITIONS as $pos) {
        $out[$pos] = pb2_clean_permission_list(is_array($value) ? ($value[$pos] ?? []) : []);
    }
    return $out;
}

/** {perm: bool} with unknown permissions dropped. */
function pb2_clean_overrides($value): array
{
    $out = [];
    if (!is_array($value)) return $out;
    foreach (PB2_PERMISSIONS as $perm => $label) {
        if (array_key_exists($perm, $value) && $value[$perm] !== null) {
            $out[$perm] = filter_var($value[$perm], FILTER_VALIDATE_BOOLEAN);
        }
    }
    return $out;
}

/**
 * Effective permissions of one admin: [perm, ...]. Read from the database on
 * every request (cached for the request only), so a change applies at once.
 */
function pb2_admin_permissions(mysqli $conn, int $admin_id): array
{
    static $cache = [];
    if (isset($cache[$admin_id])) return $cache[$admin_id];
    $stmt = $conn->prepare("SELECT role, position, permission_overrides FROM admins WHERE admin_id = ?");
    $stmt->bind_param('i', $admin_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) return $cache[$admin_id] = [];
    if ($row['role'] === 'Super') return $cache[$admin_id] = array_keys(PB2_PERMISSIONS);

    $granted = array_flip(pb2_standard_permissions($conn));
    foreach (pb2_position_permissions($conn)[$row['position']] ?? [] as $perm) $granted[$perm] = true;
    foreach (pb2_clean_overrides(json_decode((string)$row['permission_overrides'], true)) as $perm => $allow) {
        if ($allow) $granted[$perm] = true; else unset($granted[$perm]);
    }
    return $cache[$admin_id] = array_values(array_intersect(array_keys(PB2_PERMISSIONS), array_keys($granted)));
}

function pb2_admin_can(mysqli $conn, array $admin, string $perm): bool
{
    if (($admin['role'] ?? '') === 'Super') return true;
    return in_array($perm, pb2_admin_permissions($conn, (int)$admin['admin_id']), true);
}

/** The signed-in admin's permissions, or [] without a session. */
function pb2_current_permissions(): array
{
    $admin = pb2_current_admin();
    $conn = pb2_perm_conn();
    if (!$admin || !$conn) return [];
    return ($admin['role'] ?? '') === 'Super' ? array_keys(PB2_PERMISSIONS) : pb2_admin_permissions($conn, (int)$admin['admin_id']);
}

/**
 * Records a signed-in admin being refused (no tab permission, or a Super-only
 * page). The screens hide what an admin can't open, so a refusal usually means
 * an address typed by hand or a direct API call: worth keeping. Fails soft.
 */
function pb2_log_access_denied(string $what): void
{
    try {
        $admin = pb2_current_admin();
        if (!$admin) return;
        if (empty($GLOBALS['conn'])) $GLOBALS['conn'] = pb2_perm_conn();
        if (empty($GLOBALS['conn'])) return;
        require_once __DIR__ . '/audit_log.php';
        $path = strtok((string)($_SERVER['REQUEST_URI'] ?? ''), '?');
        $action = (string)($_GET['action'] ?? '');
        pb2_log_admin_action('admin.access.denied', 'endpoint', basename((string)$path),
            "Refused: $what (" . basename((string)$path) . ($action !== '' ? " action=$action" : '') . ')', null, 'failure');
    } catch (Throwable $e) {
        error_log('pb2_log_access_denied: ' . $e->getMessage());
    }
}

function pb2_deny_permission(string $label): void
{
    pb2_log_access_denied("no access to $label");
    if (!headers_sent()) header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'status'  => 'error', // for endpoints that answer with 'status'
        'code'    => 'NO_PERMISSION',
        'message' => "You don't have access to $label. Ask the Super Admin for access.",
    ]);
    exit;
}

/**
 * Any signed-in admin holding at least one of $perms. No session -> 401 (sign
 * in again). Signed in but without access -> NO_PERMISSION (see above).
 */
function pb2_require_any_permission(array $perms): array
{
    $admin = pb2_require_admin();
    if (($admin['role'] ?? '') === 'Super') return $admin;
    $conn = pb2_perm_conn();
    if (!$conn) pb2_deny_permission('this page (the database is unavailable)');
    $have = pb2_admin_permissions($conn, (int)$admin['admin_id']);
    if (!array_intersect($perms, $have)) {
        pb2_deny_permission(strtolower(PB2_PERMISSIONS[$perms[0]] ?? 'this page'));
    }
    return $admin;
}

/** One permission (kept for the payment endpoints). */
function pb2_require_permission(mysqli $conn, string $perm): array
{
    return pb2_require_any_permission([$perm]);
}
