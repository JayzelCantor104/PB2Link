<?php
/**
 * One place to send SMS (PhilSMS), with the SMS_* constants from
 * backend/config.php (loaded by db_connection.php). Schema: migration 015.
 *
 *     require_once __DIR__ . '/sms.php';
 *     $r = pb2_send_sms($conn, '09171234567', 'PB2Link: ...', 'doc_status', ['user_id' => $uid]);
 *     if ($r['ok']) ...
 *
 * - Numbers are normalised to 639XXXXXXXXX; anything else is skipped.
 * - The text is folded to plain GSM characters (ñ -> n, dashes, quotes) and
 *   cut to 160, so every text is exactly one SMS.
 * - SMS_MONTHLY_CAP (default 500) limits texts per calendar month. Disaster
 *   broadcasts pass 'bypass_cap' => true: they are counted, never blocked.
 * - Every attempt is written to sms_log (masked number, no message body).
 *
 * Never throws: returns ['ok' => bool, 'sent' => int, 'message' => string].
 */

const PB2_SMS_MAX_CHARS = 160;
const PB2_SMS_DAILY_CODES_PER_NUMBER = 5;

/** '09171234567' / '+639171234567' / '639171234567' -> '639171234567', else null. */
function pb2_sms_normalize($number): ?string
{
    $clean = preg_replace('/\D/', '', (string)$number);
    if (strlen($clean) === 11 && substr($clean, 0, 2) === '09') {
        $clean = '63' . substr($clean, 1);
    } elseif (strlen($clean) === 10 && $clean[0] === '9') {
        $clean = '63' . $clean;
    }
    return preg_match('/^639\d{9}$/', $clean) ? $clean : null;
}

/** '0917*****67' style — enough for the person to recognise their number. */
function pb2_sms_mask($number): string
{
    $n = pb2_sms_normalize($number);
    if ($n === null) return '';
    $local = '0' . substr($n, 2);           // 09171234567
    return substr($local, 0, 4) . '*****' . substr($local, -2);
}

function pb2_sms_configured(): bool
{
    return defined('SMS_API_KEY') && trim((string)SMS_API_KEY) !== '';
}

/** Plain one-SMS text: GSM-safe characters, single spaces, at most 160. */
function pb2_sms_clean_text(string $text): string
{
    $map = ['ñ' => 'n', 'Ñ' => 'N', '—' => '-', '–' => '-', '‘' => "'", '’' => "'", '“' => '"', '”' => '"', '…' => '...', '·' => '-', '•' => '-'];
    $text = strtr($text, $map);
    if (function_exists('iconv')) {
        $folded = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if ($folded !== false) $text = $folded;
    }
    $text = preg_replace('/[^\x20-\x7E\n]/', '', $text);
    $text = trim(preg_replace('/[ \t]+/', ' ', $text));
    if (strlen($text) > PB2_SMS_MAX_CHARS) {
        $text = rtrim(substr($text, 0, PB2_SMS_MAX_CHARS - 3)) . '...';
    }
    return $text;
}

/**
 * Reserves $units texts in this month's quota. Returns false when the cap
 * would be exceeded (nothing is reserved then). With $bypass the units are
 * counted but the cap is not enforced.
 */
function pb2_sms_reserve_quota(mysqli $conn, int $units, bool $bypass = false): bool
{
    $cap = defined('SMS_MONTHLY_CAP') ? (int)SMS_MONTHLY_CAP : 500;
    $month = date('Y-m');
    try {
        $conn->query("INSERT INTO sms_usage (usage_month, sms_count) VALUES ('$month', 0) ON DUPLICATE KEY UPDATE usage_month = usage_month");
        // One atomic UPDATE instead of a transaction: callers (edit_profile.php)
        // may already be inside theirs, and begin_transaction() would commit it.
        $limit = $bypass ? PHP_INT_MAX : $cap;
        $stmt = $conn->prepare("UPDATE sms_usage SET sms_count = sms_count + ? WHERE usage_month = ? AND sms_count + ? <= ?");
        $stmt->bind_param('isii', $units, $month, $units, $limit);
        $stmt->execute();
        $reserved = $stmt->affected_rows === 1;
        $stmt->close();
        return $reserved;
    } catch (Throwable $e) {
        error_log('pb2_sms_reserve_quota: ' . $e->getMessage());
        return false;
    }
}

/** Gives back units reserved for texts the provider refused. */
function pb2_sms_release_quota(mysqli $conn, int $units): void
{
    $month = date('Y-m');
    try {
        $stmt = $conn->prepare("UPDATE sms_usage SET sms_count = GREATEST(0, CAST(sms_count AS SIGNED) - ?) WHERE usage_month = ?");
        $stmt->bind_param('is', $units, $month);
        $stmt->execute();
        $stmt->close();
    } catch (Throwable $e) {
        error_log('pb2_sms_release_quota: ' . $e->getMessage());
    }
}

function pb2_sms_log(mysqli $conn, string $purpose, string $recipient, int $count, string $status, ?string $detail, array $opts): void
{
    try {
        $uid = isset($opts['user_id']) ? (string)$opts['user_id'] : null;
        $aid = isset($opts['admin_id']) ? (int)$opts['admin_id'] : null;
        $detail = $detail !== null ? mb_substr($detail, 0, 255) : null;
        $stmt = $conn->prepare("INSERT INTO sms_log (purpose, recipient, recipient_count, user_id, admin_id, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('ssisiss', $purpose, $recipient, $count, $uid, $aid, $status, $detail);
        $stmt->execute();
        $stmt->close();
    } catch (Throwable $e) {
        error_log('pb2_sms_log: ' . $e->getMessage());
    }
}

/** Codes sent to this number in the last 24 hours (anti-abuse for public endpoints). */
function pb2_sms_codes_sent_today(mysqli $conn, string $number): int
{
    $masked = pb2_sms_mask($number);
    if ($masked === '') return 0;
    $stmt = $conn->prepare("SELECT COUNT(*) FROM sms_log WHERE recipient = ? AND purpose LIKE 'code:%' AND status = 'sent' AND created_at > NOW() - INTERVAL 1 DAY");
    $stmt->bind_param('s', $masked);
    $stmt->execute();
    $n = (int)$stmt->get_result()->fetch_row()[0];
    $stmt->close();
    return $n;
}

/** Raw PhilSMS call. Returns [ok, provider message]. */
function pb2_sms_gateway_send(array $numbers, string $text): array
{
    if (!function_exists('curl_init')) return [false, 'cURL is not available on this server.'];
    $payload = [
        'recipient' => implode(',', $numbers),
        'sender_id' => defined('SMS_SENDER_ID') && SMS_SENDER_ID !== '' ? SMS_SENDER_ID : 'PhilSMS',
        'type'      => 'plain',
        'message'   => $text,
    ];
    $url = defined('SMS_GATEWAY_URL') && SMS_GATEWAY_URL !== '' ? SMS_GATEWAY_URL : 'https://dashboard.philsms.com/api/v3/sms/send';
    $curl = curl_init($url);
    if ($curl === false) return [false, 'Unable to start the SMS request.'];
    curl_setopt_array($curl, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . trim((string)SMS_API_KEY),
            'Content-Type: application/json',
            'Accept: application/json',
        ],
    ]);
    $body = curl_exec($curl);
    $err = curl_error($curl);
    $code = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($body === false) return [false, 'SMS gateway connection failed: ' . $err];
    $json = json_decode($body, true);
    if ($code < 200 || $code >= 300 || (is_array($json) && ($json['status'] ?? '') === 'error')) {
        $msg = is_array($json) ? (string)($json['message'] ?? '') : '';
        return [false, $msg !== '' ? $msg : "The SMS provider rejected the message (HTTP $code)."];
    }
    return [true, is_array($json) ? (string)($json['message'] ?? 'Accepted') : 'Accepted'];
}

/**
 * Sends one text to one or more numbers.
 * $opts: user_id, admin_id (for the log), bypass_cap (disaster broadcasts).
 */
function pb2_send_sms(mysqli $conn, $to, string $text, string $purpose, array $opts = []): array
{
    $numbers = [];
    foreach ((array)$to as $raw) {
        $n = pb2_sms_normalize($raw);
        if ($n !== null) $numbers[$n] = true;
    }
    $numbers = array_keys($numbers);
    $logTo = count($numbers) === 1 ? pb2_sms_mask($numbers[0]) : (count($numbers) . ' numbers');

    if (!$numbers) {
        return ['ok' => false, 'sent' => 0, 'message' => 'No valid Philippine mobile number to send to.'];
    }
    if (!pb2_sms_configured()) {
        pb2_sms_log($conn, $purpose, $logTo, count($numbers), 'skipped', 'SMS_API_KEY not set', $opts);
        return ['ok' => false, 'sent' => 0, 'message' => 'SMS is not configured on this server.'];
    }
    $text = pb2_sms_clean_text($text);
    if ($text === '') {
        return ['ok' => false, 'sent' => 0, 'message' => 'The SMS message is empty.'];
    }

    $units = count($numbers);
    if (!pb2_sms_reserve_quota($conn, $units, !empty($opts['bypass_cap']))) {
        pb2_sms_log($conn, $purpose, $logTo, $units, 'capped', 'Monthly SMS cap reached', $opts);
        return ['ok' => false, 'sent' => 0, 'capped' => true, 'message' => 'The monthly SMS limit has been reached.'];
    }

    [$ok, $detail] = pb2_sms_gateway_send($numbers, $text);
    if (!$ok) {
        pb2_sms_release_quota($conn, $units);
        error_log("pb2_send_sms ($purpose) failed: $detail");
    }
    pb2_sms_log($conn, $purpose, $logTo, $units, $ok ? 'sent' : 'failed', $detail, $opts);
    return ['ok' => $ok, 'sent' => $ok ? $units : 0, 'message' => $ok ? 'SMS sent.' : $detail];
}
