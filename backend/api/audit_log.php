<?php
/**
 * Admin activity audit logging — records every action/change an admin makes
 * on the admin side. Read access to this data is Super-Admin-only (see
 * get_audit_log.php); nothing in the API surface ever updates or deletes a
 * row here.
 *
 * Usage — call AFTER a write has already succeeded, from a file that has
 * already `require_once`d auth_guard.php and included db_connection.php:
 *
 *     require_once __DIR__ . '/audit_log.php';
 *     pb2_log_admin_action(
 *         'resident.status.update',
 *         'resident',
 *         $resident_id,
 *         "Updated resident status to $status",
 *         $changedFields   // [['field'=>'status','old_value'=>'Pending','new_value'=>'Active'], ...]
 *     );
 *
 * Deliberately fails soft: a logging failure is written to the PHP error
 * log and swallowed, never re-thrown or surfaced to the caller. Blocking a
 * legitimate administrative action because the audit insert hiccuped would
 * be the wrong tradeoff.
 */

require_once __DIR__ . '/auth_guard.php';

function pb2_log_admin_action(
    string $eventType,
    ?string $targetEntityType,
    ?string $targetEntityId,
    string $description,
    ?array $changedFields = null,
    string $outcome = 'success',
    ?array $actorOverride = null
): void {
    global $conn;

    try {
        if (empty($conn)) {
            error_log('pb2_log_admin_action: no DB connection available, skipping');
            return;
        }

        $actor = $actorOverride ?? pb2_current_admin();
        $actorAdminId = $actor['admin_id'] ?? null;
        $actorUsername = $actor['username'] ?? 'unknown';
        $actorRole = $actor['role'] ?? 'Admin';

        $description = substr($description, 0, 255);
        $targetEntityId = $targetEntityId !== null ? substr($targetEntityId, 0, 64) : null;
        $changedFieldsJson = $changedFields !== null ? json_encode($changedFields) : null;
        $ipAddress = $_SERVER['REMOTE_ADDR'] ?? null;
        $userAgent = isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 255) : null;

        $stmt = mysqli_prepare($conn, "INSERT INTO admin_audit_log
            (event_type, actor_admin_id, actor_username, actor_role, target_entity_type,
             target_entity_id, description, changed_fields, outcome, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        if (!$stmt) {
            error_log('pb2_log_admin_action: prepare failed: ' . mysqli_error($conn));
            return;
        }

        mysqli_stmt_bind_param(
            $stmt,
            'sisssssssss',
            $eventType,
            $actorAdminId,
            $actorUsername,
            $actorRole,
            $targetEntityType,
            $targetEntityId,
            $description,
            $changedFieldsJson,
            $outcome,
            $ipAddress,
            $userAgent
        );

        if (!mysqli_stmt_execute($stmt)) {
            error_log('pb2_log_admin_action: insert failed: ' . mysqli_stmt_error($stmt));
        }

        mysqli_stmt_close($stmt);
    } catch (\Throwable $e) {
        error_log('pb2_log_admin_action: unexpected error: ' . $e->getMessage());
    }
}
