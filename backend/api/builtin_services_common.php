<?php
/**
 * Built-in services (migration 031): Barangay Clearance ... Report Incident.
 * Their forms and rules are fixed pages; Services Management (services.php)
 * edits only what residents see on the Services page and the form heading
 * (name, description, category, icon, order), Open / Closed, and extra
 * questions at the end of the form (service_fields_common.php).
 *
 * The official document name (label) never changes: printed certificates,
 * emails and staff lists keep it.
 *
 * Every submit endpoint calls pb2_builtin_require_open() first, so a closed
 * service refuses new requests even if someone opens the form's address.
 */

const PB2_BUILTIN_SERVICES = [
    'clearance'   => ['label' => 'Barangay Clearance',       'table' => 'req_barangay_clearance',     'id' => 'request_id', 'mode' => true,  'fee' => 'clearance',          'route' => '/request/clearance'],
    'residency'   => ['label' => 'Certificate of Residency', 'table' => 'req_certificate_residency',  'id' => 'request_id', 'mode' => true,  'fee' => 'residency',          'route' => '/request/residency'],
    'barangay_id' => ['label' => 'Barangay ID',              'table' => 'req_barangay_id',            'id' => 'request_id', 'mode' => true,  'fee' => 'barangay_id',        'route' => '/request/id'],
    'business'    => ['label' => 'Business Clearance',       'table' => 'req_business_clearance',     'id' => 'request_id', 'mode' => true,  'fee' => 'business_clearance', 'route' => '/request/business'],
    'indigency'   => ['label' => 'Certificate of Indigency', 'table' => 'req_certificate_indigency',  'id' => 'request_id', 'mode' => true,  'fee' => 'indigency',          'route' => '/request/indigency'],
    'volunteer'   => ['label' => 'Volunteer Registration',   'table' => 'req_volunteer_registration', 'id' => 'request_id', 'mode' => false, 'fee' => null,                 'route' => '/request/volunteer'],
    'amenity'     => ['label' => 'Amenity Reservation',      'table' => 'req_amenity_reservation',    'id' => 'request_id', 'mode' => false, 'fee' => null,                 'route' => '/amenity-reservation'],
    'incident'    => ['label' => 'Report Incident',          'table' => 'incident_reports',           'id' => 'id',         'mode' => false, 'fee' => null,                 'route' => '/incident-report'],
];

/** Icons staff can pick for a service card (Bootstrap Icons). */
const PB2_SERVICE_ICONS = [
    'bi-file-earmark-text-fill', 'bi-house-check-fill', 'bi-person-badge-fill', 'bi-briefcase-fill', 'bi-heart-pulse-fill',
    'bi-people-fill', 'bi-calendar-event-fill', 'bi-exclamation-triangle-fill', 'bi-mortarboard-fill', 'bi-clipboard2-check-fill',
    'bi-cash-coin', 'bi-shop', 'bi-tools', 'bi-truck', 'bi-tree-fill', 'bi-droplet-fill', 'bi-lightning-charge-fill',
    'bi-hospital-fill', 'bi-capsule', 'bi-basket-fill', 'bi-award-fill', 'bi-megaphone-fill', 'bi-shield-check',
    'bi-hand-thumbs-up-fill', 'bi-gift-fill', 'bi-layers-fill',
];

/** The built-in service's settings row, or null (no row / migration 031 missing). */
function pb2_builtin_get(mysqli $conn, string $key): ?array
{
    try {
        $st = $conn->prepare("SELECT * FROM builtin_services WHERE service_key = ?");
        $st->bind_param('s', $key);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        return $row ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * Ends the request with code SERVICE_CLOSED when staff closed this service.
 * Open when there is no settings row (before migration 031).
 */
function pb2_builtin_require_open(mysqli $conn, string $key): void
{
    $row = pb2_builtin_get($conn, $key);
    if ($row && (int)$row['is_active'] !== 1) {
        $msg = 'This service is not accepting requests right now.';
        if (!empty($row['closed_message'])) $msg .= ' ' . $row['closed_message'];
        if (ob_get_level() > 0) @ob_end_clean();
        if (!headers_sent()) header('Content-Type: application/json');
        echo json_encode(['success' => false, 'code' => 'SERVICE_CLOSED', 'message' => $msg]);
        exit;
    }
}

/**
 * Extra answers for a built-in request: checks them and saves their files, or
 * ends the request with the message. Call before the request is saved.
 */
function pb2_builtin_extra_or_fail(mysqli $conn, string $key, string $mode, string $controlNum, string $trackingCode): array
{
    require_once __DIR__ . '/service_fields_common.php';
    $extra = pb2_extra_prepare($conn, $key, $mode, $controlNum, $trackingCode);
    if (!$extra['ok']) {
        if (ob_get_level() > 0) @ob_end_clean();
        if (!headers_sent()) header('Content-Type: application/json');
        echo json_encode(['success' => false, 'code' => 'EXTRA_ANSWERS', 'message' => $extra['message']]);
        exit;
    }
    // The files are already saved. If the request then ends without being
    // saved, for any reason (payment incomplete, residency check, a database
    // error), remove them at the end of the request: no stray personal
    // documents without a request. pb2_builtin_extra_store() keeps them.
    if (!empty($extra['files'])) {
        // Absolute paths: the working directory can change once the script ends.
        $abs = [];
        foreach (array_keys($extra['files']) as $p) {
            $real = realpath($p);
            if ($real !== false) $abs[$real] = true;
        }
        $GLOBALS['pb2_extra_pending_files'] = $abs;
        register_shutdown_function(function () {
            $pending = $GLOBALS['pb2_extra_pending_files'] ?? [];
            if ($pending) {
                require_once __DIR__ . '/service_fields_common.php';
                pb2_sf_discard($pending);
            }
        });
    }
    return $extra;
}

/** Stores the extra answers on the saved request (see pb2_extra_store) and keeps their files. */
function pb2_builtin_extra_store(mysqli $conn, string $key, int $id, array $extra): void
{
    require_once __DIR__ . '/service_fields_common.php';
    $def = PB2_BUILTIN_SERVICES[$key] ?? null;
    if ($def && $id > 0) {
        pb2_extra_store($conn, $def['table'], $def['id'], $id, $extra);
        $GLOBALS['pb2_extra_pending_files'] = []; // the request was saved: keep the files
    }
}
