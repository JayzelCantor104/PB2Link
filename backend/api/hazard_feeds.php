<?php
// Live hazard feeds (migration 022, rules in hazard_feeds_common.php).
//   GET  action=live      public: typhoon (PAGASA + GDACS), nearby earthquakes
//                         (PHIVOLCS, USGS backup), model rainfall, source status
//   GET  action=weather   public: cached Open-Meteo forecast for the map panel
//   GET  action=events    admin: detected hazards waiting for staff, the mode, and
//                         the advisory SMS mode with how many residents it reaches
//   POST action=dismiss   admin: { id } hides a detected hazard
//   POST action=refresh   admin: fetch every source now
// Reads refresh stale sources first, so the page is never older than each
// source's timer (a cron job can also call backend/cron_hazard_feeds.php).
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
pb2_session_start();
require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/hazard_feeds_common.php';
require_once __DIR__ . '/advisory_sms.php';

if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$action = $_GET['action'] ?? ($_POST['action'] ?? 'live');

if ($action === 'live' || $action === 'weather') {
    // Release the session lock so a slow refresh doesn't block the visitor's other requests.
    session_write_close();
    pb2_haz_refresh($conn);
    if ($action === 'weather') {
        $w = pb2_haz_weather($conn);
        $cache = pb2_haz_cache_all($conn);
        echo json_encode([
            'success' => $w !== null,
            'weather' => $w,
            'source' => pb2_haz_source_status($cache, 'weather'),
            'message' => $w === null ? 'The forecast is not available yet.' : null,
        ]);
        exit;
    }
    echo json_encode(['success' => true] + pb2_haz_live($conn));
    exit;
}

$admin = pb2_require_admin();

if ($action === 'events') {
    session_write_close();
    pb2_haz_refresh($conn);
    echo json_encode([
        'success' => true,
        'mode' => pb2_haz_mode($conn),
        'events' => pb2_haz_pending_events($conn),
        // So the advisory form can warn that saving texts every resident.
        'advisory_sms_mode' => pb2_advisory_sms_mode($conn),
        'sms_recipients' => count(pb2_all_resident_numbers($conn)),
    ]);
    exit;
}

if ($action === 'refresh' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    session_write_close();
    pb2_haz_refresh($conn, true);
    echo json_encode(['success' => true, 'message' => 'Feeds checked.'] + pb2_haz_live($conn));
    exit;
}

if ($action === 'dismiss' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = (int)($data['id'] ?? 0);
    $st = $conn->prepare("UPDATE hazard_events SET status = 'dismissed', handled_by = ?, handled_at = NOW() WHERE id = ? AND status = 'new'");
    $adminId = (int)$admin['admin_id'];
    $st->bind_param('ii', $adminId, $id);
    $st->execute();
    $done = $st->affected_rows === 1;
    $st->close();
    if ($done) {
        $h = $conn->query("SELECT headline FROM hazard_events WHERE id = $id")->fetch_row()[0] ?? '';
        pb2_log_admin_action('disaster.hazard.dismiss', 'hazard_event', (string)$id, "Dismissed detected hazard: $h");
    }
    echo json_encode(['success' => $done, 'message' => $done ? 'Dismissed.' : 'That detection was already handled.']);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Invalid action.']);
