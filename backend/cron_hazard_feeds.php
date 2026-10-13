<?php
// Refresh the live hazard feeds from a scheduled job, so detection (and
// auto-published advisories, if the Super Admin turned that on) happens even
// when nobody has the Disaster Risk page open. Command line only.
//
// Hostinger hPanel -> Advanced -> Cron Jobs, every 10 minutes:
//     php /home/<user>/public_html/backend/cron_hazard_feeds.php
// Locally (Windows Task Scheduler): C:\xampp\php\php.exe C:\xampp\htdocs\PB2Link\backend\cron_hazard_feeds.php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/db_connection.php';
require_once __DIR__ . '/api/auth_guard.php';
require_once __DIR__ . '/api/hazard_feeds_common.php';

pb2_haz_refresh($conn, in_array('--force', $argv ?? [], true));
foreach (pb2_haz_cache_all($conn) as $source => $row) {
    echo str_pad($source, 10), $row['last_error'] ? 'ERROR ' . $row['last_error'] : 'ok ' . $row['last_success_at'], PHP_EOL;
}
