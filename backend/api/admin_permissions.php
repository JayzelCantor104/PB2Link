<?php
/**
 * Fine-grained admin permissions (migration 020).
 *
 * The system role (Super / Admin / Viewer) stays as it is. On top of it:
 *   - every admin may hold a barangay position (admins.position);
 *   - each position has default permissions, set by the Super Admin
 *     (system_settings 'position_permissions', JSON {position: [perm, ...]});
 *   - each admin may have overrides that allow or deny a permission
 *     regardless of position (admins.permission_overrides, JSON {perm: true|false}).
 * Super Admins always hold every permission.
 *
 *     require_once __DIR__ . '/admin_permissions.php';
 *     $admin = pb2_require_permission($conn, 'payments.verify');
 *
 * Callers must already have $conn (db_connection.php) and auth_guard.php.
 */

const PB2_ADMIN_POSITIONS = [
    'Punong Barangay',
    'Barangay Secretary',
    'Barangay Treasurer',
    'Barangay Kagawad',
    'SK Chairperson',
    'Barangay Staff',
];

const PB2_PERMISSIONS = [
    'payments.settings' => 'Manage fees and the payment QR / account',
    'payments.verify'   => 'Verify payments and record O.R. numbers',
];

/** {position: [perm, ...]} with unknown positions/permissions dropped. */
function pb2_position_permissions(mysqli $conn): array
{
    $raw = '';
    try {
        $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'position_permissions'");
        $stmt->execute();
        $raw = (string)($stmt->get_result()->fetch_row()[0] ?? '');
        $stmt->close();
    } catch (Throwable $e) {
        // table missing: no position defaults
    }
    return pb2_clean_position_permissions(json_decode($raw, true));
}

function pb2_clean_position_permissions($value): array
{
    $out = [];
    foreach (PB2_ADMIN_POSITIONS as $pos) {
        $perms = is_array($value) && isset($value[$pos]) && is_array($value[$pos]) ? $value[$pos] : [];
        $out[$pos] = array_values(array_intersect(array_keys(PB2_PERMISSIONS), $perms));
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

/** Effective permissions of one admin: [perm, ...]. */
function pb2_admin_permissions(mysqli $conn, int $admin_id): array
{
    $stmt = $conn->prepare("SELECT role, position, permission_overrides FROM admins WHERE admin_id = ?");
    $stmt->bind_param('i', $admin_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) return [];
    if ($row['role'] === 'Super') return array_keys(PB2_PERMISSIONS);

    $byPosition = pb2_position_permissions($conn);
    $granted = array_flip($byPosition[$row['position']] ?? []);
    foreach (pb2_clean_overrides(json_decode((string)$row['permission_overrides'], true)) as $perm => $allow) {
        if ($allow) $granted[$perm] = true; else unset($granted[$perm]);
    }
    return array_values(array_intersect(array_keys(PB2_PERMISSIONS), array_keys($granted)));
}

function pb2_admin_can(mysqli $conn, array $admin, string $perm): bool
{
    if (($admin['role'] ?? '') === 'Super') return true;
    return in_array($perm, pb2_admin_permissions($conn, (int)$admin['admin_id']), true);
}

/**
 * Any signed-in admin holding $perm. No session -> 401 (sign in again).
 * Signed in but without the permission -> a normal JSON refusal with
 * code NO_PERMISSION and no auth_error: src/lib/apiClient.js signs the admin
 * out on any 401/403, and a missing permission is not a lost session.
 */
function pb2_require_permission(mysqli $conn, string $perm): array
{
    $admin = pb2_require_admin();
    if (!pb2_admin_can($conn, $admin, $perm)) {
        echo json_encode([
            'success' => false,
            'code'    => 'NO_PERMISSION',
            'message' => 'You do not have permission to do this (' . (PB2_PERMISSIONS[$perm] ?? $perm) . '). Ask the Super Admin for access.',
        ]);
        exit;
    }
    return $admin;
}
