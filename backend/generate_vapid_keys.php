<?php
// Generates the Web Push (VAPID) key pair for advisory push notifications
// (backend/api/advisory_push.php). Command line only:
//     php backend/generate_vapid_keys.php you@example.com
// Paste the printed lines into backend/config.php. Keep the private key out of
// the repository. Changing the keys later turns off alerts on every device
// that already subscribed (residents just turn them on again).
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/api/advisory_push.php';

$contact = $argv[1] ?? 'admin@example.com';
$key = pb2_push_new_ec_key();
if (!$key) {
    fwrite(STDERR, "OpenSSL could not create a key (openssl.cnf not found).\n");
    exit(1);
}
$cnf = pb2_push_openssl_cnf();
openssl_pkey_export($key, $pem, null, $cnf ? ['config' => $cnf] : []);
$public = pb2_b64url_encode(pb2_push_key_point($key));
echo "// Web Push (advisory alerts on phones), generated " . date('Y-m-d') . "\n";
echo "define('PUSH_VAPID_PUBLIC_KEY', '$public');\n";
echo "define('PUSH_VAPID_PRIVATE_KEY', '" . trim($pem) . "');\n";
echo "define('PUSH_VAPID_SUBJECT', 'mailto:" . addslashes($contact) . "');\n";
