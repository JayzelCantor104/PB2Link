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

$conn = mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);

// If connection fails, we don't want a "Fatal Error"
if (!$conn) {
    // We will handle the error inside login.php instead
    $conn = false;
}
