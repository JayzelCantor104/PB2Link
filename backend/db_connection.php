<?php
// Load local credentials (DB + SMTP constants).
// __DIR__ keeps this correct regardless of which directory the calling script
// lives in — endpoints in backend/api/ and scripts in backend/ both work.
$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
    http_response_code(500);
    die(json_encode([
        "success" => false,
        "message" => "Missing backend/config.php. Copy backend/config.example.php to backend/config.php and fill in your credentials."
    ]));
}
require_once $configPath;

// Turn off reporting so it doesn't "echo" errors into your JSON
mysqli_report(MYSQLI_REPORT_OFF);

// The request's one shared connection (db_shared.php: utf8mb4, retried when the
// host is briefly out of connections). The sign-in checks in auth_guard.php
// reuse the same one. false when the database can't be reached; endpoints
// answer with their own "Database connection failed" message.
require_once __DIR__ . '/db_shared.php';
$conn = pb2_db() ?: false;
