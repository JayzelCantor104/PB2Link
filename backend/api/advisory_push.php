<?php
/**
 * Web Push for advisories (migration 032). No library: VAPID (RFC 8292) and
 * payload encryption (RFC 8291, aes128gcm) with PHP's own OpenSSL, so it runs
 * on shared hosting without Composer packages or the gmp extension.
 *
 * Keys live in backend/config.php (never in the repo):
 *   PUSH_VAPID_PUBLIC_KEY   base64url, 65-byte uncompressed P-256 point
 *   PUSH_VAPID_PRIVATE_KEY  PEM of the matching EC private key
 *   PUSH_VAPID_SUBJECT      'mailto:...' contact for the push services
 * Generate them with: php backend/generate_vapid_keys.php
 * Without them push is simply off (pb2_push_enabled() is false).
 *
 * pb2_push_advisory() sends an advisory once per alert level
 * (disaster_alerts.push_sent_level), each device in its own language.
 * Practice advisories go only to staff devices (push_subscriptions.admin_id).
 * Subscriptions the push service reports gone (404 / 410) are deleted.
 * Push needs HTTPS in production (localhost works for testing).
 */

require_once __DIR__ . '/audit_log.php';

function pb2_push_enabled(): bool
{
    return defined('PUSH_VAPID_PUBLIC_KEY') && defined('PUSH_VAPID_PRIVATE_KEY')
        && PUSH_VAPID_PUBLIC_KEY !== '' && PUSH_VAPID_PRIVATE_KEY !== '';
}

function pb2_b64url_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function pb2_b64url_decode(string $s): string
{
    $s = strtr($s, '-_', '+/');
    return (string)base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

/**
 * A new P-256 key. On Windows (XAMPP) OpenSSL can't find its openssl.cnf on its
 * own, so the usual locations are tried; on Linux hosting the default works.
 */
function pb2_push_new_ec_key()
{
    $base = ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC];
    $key = @openssl_pkey_new($base);
    if ($key) return $key;
    $cnf = pb2_push_openssl_cnf();
    $key = $cnf ? @openssl_pkey_new($base + ['config' => $cnf]) : false;
    while (openssl_error_string()) {
        // clear OpenSSL's error queue
    }
    return $key ?: false;
}

/** openssl.cnf for OpenSSL calls that need one on Windows, or null. */
function pb2_push_openssl_cnf(): ?string
{
    foreach ([getenv('OPENSSL_CONF') ?: null, PHP_BINDIR . '/extras/ssl/openssl.cnf', dirname(PHP_BINDIR) . '/php/extras/ssl/openssl.cnf',
              'C:/xampp/php/extras/ssl/openssl.cnf', 'C:/xampp/apache/conf/openssl.cnf'] as $cnf) {
        if ($cnf && is_file($cnf)) return $cnf;
    }
    return null;
}

/** PEM public key for a raw 65-byte uncompressed P-256 point. */
function pb2_push_point_to_pem(string $point): string
{
    // SubjectPublicKeyInfo: ecPublicKey, prime256v1, then the point.
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $point;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** 65-byte uncompressed point of an OpenSSL EC key. */
function pb2_push_key_point($key): string
{
    $d = openssl_pkey_get_details($key);
    return "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
}

/** DER ECDSA signature -> raw R||S (64 bytes), as JWT ES256 needs. */
function pb2_push_der_to_raw(string $der): string
{
    $pos = 2; // SEQUENCE header (signatures are short, one length byte)
    if (ord($der[1]) & 0x80) $pos += ord($der[1]) & 0x7f;
    $out = '';
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$pos + 1]);
        $int = substr($der, $pos + 2, $len);
        $int = ltrim($int, "\0");
        $out .= str_pad($int, 32, "\0", STR_PAD_LEFT);
        $pos += 2 + $len;
    }
    return $out;
}

/** VAPID Authorization header for an endpoint. */
function pb2_push_vapid_header(string $endpoint): ?string
{
    $u = parse_url($endpoint);
    if (empty($u['scheme']) || empty($u['host'])) return null;
    $aud = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
    $header = pb2_b64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = pb2_b64url_encode(json_encode([
        'aud' => $aud,
        'exp' => time() + 12 * 3600,
        'sub' => defined('PUSH_VAPID_SUBJECT') ? PUSH_VAPID_SUBJECT : 'mailto:admin@localhost',
    ]));
    $key = openssl_pkey_get_private(PUSH_VAPID_PRIVATE_KEY);
    if (!$key || !openssl_sign("$header.$claims", $sig, $key, OPENSSL_ALGO_SHA256)) return null;
    $jwt = "$header.$claims." . pb2_b64url_encode(pb2_push_der_to_raw($sig));
    return 'vapid t=' . $jwt . ', k=' . PUSH_VAPID_PUBLIC_KEY;
}

/**
 * RFC 8291 aes128gcm body for one subscription, or null when its keys are bad.
 */
function pb2_push_encrypt(string $payload, string $p256dhB64, string $authB64): ?string
{
    $uaPublic = pb2_b64url_decode($p256dhB64);
    $authSecret = pb2_b64url_decode($authB64);
    if (strlen($uaPublic) !== 65 || $uaPublic[0] !== "\x04" || strlen($authSecret) < 16) return null;

    $local = pb2_push_new_ec_key();
    $peer = openssl_pkey_get_public(pb2_push_point_to_pem($uaPublic));
    if (!$local || !$peer) return null;
    $asPublic = pb2_push_key_point($local);
    $ecdh = openssl_pkey_derive($peer, $local, 32);
    if ($ecdh === false || strlen($ecdh) !== 32) return null;

    // Key derivation (RFC 8291 section 3.4).
    $ikm = hash_hkdf('sha256', $ecdh, 32, "WebPush: info\0" . $uaPublic . $asPublic, $authSecret);
    $salt = random_bytes(16);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);

    // One record: the payload, then the 0x02 "last record" delimiter.
    $tag = '';
    $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    if ($cipher === false) return null;
    return $salt . pack('N', 4096) . chr(65) . $asPublic . $cipher . $tag;
}

/**
 * Sends one payload to many subscriptions in parallel.
 * $subs: rows with id, endpoint, p256dh, auth. Returns [id => HTTP status].
 */
function pb2_push_send_many(array $subs, callable $payloadFor): array
{
    $results = [];
    foreach (array_chunk($subs, 50) as $chunk) {
        $mh = curl_multi_init();
        $handles = [];
        foreach ($chunk as $s) {
            $body = pb2_push_encrypt($payloadFor($s), $s['p256dh'], $s['auth']);
            $auth = $body !== null ? pb2_push_vapid_header($s['endpoint']) : null;
            if ($body === null || $auth === null) { $results[(int)$s['id']] = 400; continue; }
            $ch = curl_init($s['endpoint']);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_HTTPHEADER => [
                    'Authorization: ' . $auth,
                    'Content-Encoding: aes128gcm',
                    'Content-Type: application/octet-stream',
                    'TTL: 86400',
                    'Urgency: high',
                ],
            ]);
            curl_multi_add_handle($mh, $ch);
            $handles[(int)$s['id']] = $ch;
        }
        do {
            $status = curl_multi_exec($mh, $running);
            if ($running) curl_multi_select($mh, 1.0);
        } while ($running && $status === CURLM_OK);
        foreach ($handles as $id => $ch) {
            $results[$id] = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);
    }
    return $results;
}

/** The notification a device shows for an advisory, in its language. */
function pb2_push_advisory_payload(array $alert, string $lang): string
{
    $fil = $lang === 'fil' && trim((string)($alert['title_fil'] ?? '')) !== '';
    $title = $fil ? $alert['title_fil'] : $alert['title'];
    $body = $fil && trim((string)($alert['instructions_fil'] ?? '')) !== '' ? $alert['instructions_fil'] : $alert['instructions'];
    $prefix = (int)($alert['is_practice'] ?? 0) === 1 ? '[PRACTICE] ' : '';
    return json_encode([
        'title' => $prefix . strtoupper((string)$alert['alert_level']) . ': ' . $title,
        'body' => mb_substr((string)$body, 0, 240),
        // The light emergency page (public/emergency.html); drills open the staff page.
        'url' => (int)($alert['is_practice'] ?? 0) === 1 ? '/admin/disaster-risk' : '/emergency',
        'tag' => 'advisory-' . (int)$alert['id'],
        'level' => $alert['alert_level'],
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * Push an advisory once per level. Returns null when nothing was due or push
 * is off, otherwise ['ok', 'sent', 'removed', 'message'].
 */
function pb2_push_advisory(mysqli $conn, int $alertId, ?array $actor = null): ?array
{
    if (!pb2_push_enabled()) return null;
    try {
        $st = $conn->prepare("SELECT id, title, title_fil, instructions, instructions_fil, alert_level, is_active, is_practice, push_sent_level FROM disaster_alerts WHERE id = ?");
        $st->bind_param('i', $alertId);
        $st->execute();
        $alert = $st->get_result()->fetch_assoc();
        $st->close();
    } catch (Throwable $e) {
        return null; // migration 032 not applied
    }
    if (!$alert || (int)$alert['is_active'] !== 1 || $alert['push_sent_level'] === $alert['alert_level']) return null;

    // Claim this level first, so two requests can't push it twice.
    $claim = $conn->prepare("UPDATE disaster_alerts SET push_sent_level = ?, push_sent_at = NOW()
                             WHERE id = ? AND (push_sent_level IS NULL OR push_sent_level <> ?)");
    $claim->bind_param('sis', $alert['alert_level'], $alertId, $alert['alert_level']);
    $claim->execute();
    $claimed = $claim->affected_rows === 1;
    $claim->close();
    if (!$claimed) return null;

    $practice = (int)$alert['is_practice'] === 1;
    $res = $conn->query("SELECT id, endpoint, p256dh, auth, language FROM push_subscriptions" . ($practice ? " WHERE admin_id IS NOT NULL" : ''));
    $subs = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
    if (!$subs) return ['ok' => true, 'sent' => 0, 'removed' => 0, 'message' => 'No device has alerts turned on.'];

    $payloads = ['en' => pb2_push_advisory_payload($alert, 'en'), 'fil' => pb2_push_advisory_payload($alert, 'fil')];
    $results = pb2_push_send_many($subs, function ($s) use ($payloads) { return $payloads[$s['language']] ?? $payloads['en']; });

    $sent = 0;
    $gone = [];
    $failed = [];
    foreach ($results as $id => $code) {
        if ($code >= 200 && $code < 300) $sent++;
        elseif ($code === 404 || $code === 410) $gone[] = (int)$id;
        else $failed[] = (int)$id;
    }
    if ($sent) {
        $ok = array_keys(array_filter($results, function ($c) { return $c >= 200 && $c < 300; }));
        $conn->query("UPDATE push_subscriptions SET last_success_at = NOW(), failures = 0 WHERE id IN (" . implode(',', array_map('intval', $ok)) . ")");
    }
    if ($gone) $conn->query("DELETE FROM push_subscriptions WHERE id IN (" . implode(',', $gone) . ")");
    if ($failed) {
        $conn->query("UPDATE push_subscriptions SET failures = failures + 1 WHERE id IN (" . implode(',', $failed) . ")");
        // A device that keeps failing is dropped after 10 tries.
        $conn->query("DELETE FROM push_subscriptions WHERE failures >= 10");
    }
    $up = $conn->prepare("UPDATE disaster_alerts SET push_sent_count = ? WHERE id = ?");
    $up->bind_param('ii', $sent, $alertId);
    $up->execute();

    pb2_log_admin_action('disaster.push', 'disaster_alert', (string)$alertId,
        ($practice ? 'Practice advisory' : 'Advisory') . " #$alertId ({$alert['alert_level']}) pushed to $sent device(s)"
        . ($gone ? ', ' . count($gone) . ' expired removed' : '') . ($failed ? ', ' . count($failed) . ' failed' : ''),
        null, $failed && !$sent ? 'failure' : 'success', $actor);
    return ['ok' => true, 'sent' => $sent, 'removed' => count($gone), 'message' => "Pushed to $sent device(s)."];
}
