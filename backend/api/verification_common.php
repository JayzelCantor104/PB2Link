<?php
/**
 * 6-digit codes sent by email or SMS (contact_verifications, migration 015).
 * Used by registration (mobile number), admin activation / contact checks and
 * the SMS password resets. Edit Profile keeps its own profile_otp_challenges
 * (profile_otp_common.php), which now also has a channel.
 *
 * Same rules as the other code flows: random_int, stored only as a
 * password_hash(), 10-minute life, 5 wrong tries lock the code, 60 seconds
 * between sends, and at most 5 SMS codes per number per day.
 *
 *   pb2_vc_send($conn, $purpose, $key, 'sms', '0917...', $context)  -> ['ok', 'message', 'resend_in', 'sent_to']
 *   pb2_vc_check($conn, $purpose, $key, 'sms', '123456')           -> ['ok', 'message', 'locked'?]
 *   pb2_vc_is_verified($conn, $purpose, $key, 'sms', '0917...')    -> bool (verified within 30 min, same destination)
 *   pb2_vc_clear($conn, $purpose, $key)
 *
 * Callers must already have $conn (db_connection.php).
 */

require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/sms.php';

const PB2_VC_TTL_MINUTES      = 10;
const PB2_VC_MAX_ATTEMPTS     = 5;
const PB2_VC_RESEND_COOLDOWN  = 60;  // seconds
const PB2_VC_VERIFIED_FOR_MIN = 30;  // a verified code may be used this long

/** Masked destination for display. */
function pb2_vc_mask(string $channel, string $destination): string
{
    if ($channel === 'sms') return pb2_sms_mask($destination);
    [$local, $domain] = array_pad(explode('@', $destination, 2), 2, '');
    $shown = mb_substr($local, 0, min(2, mb_strlen($local)));
    return $shown . str_repeat('*', min(6, max(3, mb_strlen($local) - mb_strlen($shown)))) . ($domain !== '' ? "@$domain" : '');
}

function pb2_vc_row(mysqli $conn, string $purpose, string $key, string $channel): ?array
{
    $stmt = $conn->prepare("SELECT * FROM contact_verifications WHERE purpose = ? AND subject_key = ? AND channel = ?");
    $stmt->bind_param('sss', $purpose, $key, $channel);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

/**
 * Creates (or replaces) the code and sends it.
 * $context: 'what' => short phrase for the message ("verify your mobile number"),
 *           'user_id' / 'admin_id' for the SMS log.
 */
function pb2_vc_send(mysqli $conn, string $purpose, string $key, string $channel, string $destination, array $context = []): array
{
    $channel = $channel === 'sms' ? 'sms' : 'email';
    if ($channel === 'sms') {
        $normalized = pb2_sms_normalize($destination);
        if ($normalized === null) return ['ok' => false, 'message' => 'Enter a valid Philippine mobile number (09XXXXXXXXX).'];
        $destination = $normalized;
        if (!pb2_sms_configured()) return ['ok' => false, 'message' => 'Text messages are not available right now. Please try again later.'];
        if (pb2_sms_codes_sent_today($conn, $destination) >= PB2_SMS_DAILY_CODES_PER_NUMBER) {
            return ['ok' => false, 'message' => 'Too many codes were sent to this number today. Please try again tomorrow.'];
        }
    } else {
        $destination = strtolower(trim($destination));
        if (!filter_var($destination, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'message' => 'A valid email address is required.'];
    }

    $existing = pb2_vc_row($conn, $purpose, $key, $channel);
    if ($existing && $existing['verified_at'] === null && $existing['destination'] === $destination) {
        $wait = PB2_VC_RESEND_COOLDOWN - (time() - strtotime($existing['last_sent_at']));
        if ($wait > 0) {
            $wait = min(PB2_VC_RESEND_COOLDOWN, $wait);
            return ['ok' => false, 'message' => "Please wait $wait seconds before requesting another code.", 'resend_in' => $wait];
        }
    }

    $code = sprintf('%06d', random_int(0, 999999));
    $hash = password_hash($code, PASSWORD_DEFAULT);
    $expires = date('Y-m-d H:i:s', time() + PB2_VC_TTL_MINUTES * 60);
    $now = date('Y-m-d H:i:s');
    $stmt = $conn->prepare("INSERT INTO contact_verifications (purpose, subject_key, channel, destination, otp_hash, attempts, expires_at, last_sent_at, verified_at)
                            VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL)
                            ON DUPLICATE KEY UPDATE destination = VALUES(destination), otp_hash = VALUES(otp_hash), attempts = 0,
                                                    expires_at = VALUES(expires_at), last_sent_at = VALUES(last_sent_at), verified_at = NULL");
    $stmt->bind_param('sssssss', $purpose, $key, $channel, $destination, $hash, $expires, $now);
    $stmt->execute();
    $stmt->close();

    $what = $context['what'] ?? 'confirm it is you';
    $minutes = PB2_VC_TTL_MINUTES;
    if ($channel === 'sms') {
        $text = "PB2Link: Your code to $what is $code. Valid for $minutes minutes. Never share it with anyone.";
        $r = pb2_send_sms($conn, $destination, $text, "code:$purpose", array_intersect_key($context, ['user_id' => 1, 'admin_id' => 1]));
        $sent = $r['ok'];
        $failMsg = !empty($r['capped'])
            ? 'Text messages are not available right now (monthly limit reached). Please contact the Barangay Hall.'
            : 'We could not send the text message. Please check the number and try again.';
    } else {
        $html = pb2_mail_layout('Your Verification Code', "
            <p>Hello,</p>
            <p>Use this code to <strong>" . htmlspecialchars($what) . "</strong> on the Barangay Pasong Buaya II portal:</p>
            <div style='text-align: center; margin: 25px 0;'>
                <b style='font-size: 28px; color: #059669; letter-spacing: 6px; background: #f0fdf4; padding: 10px 25px; border-radius: 8px; border: 1px dashed #059669; display: inline-block;'>$code</b>
            </div>
            <p style='color: #64748b; font-size: 14px;'>The code expires in $minutes minutes. Never share it with anyone — barangay staff will never ask for it.</p>
            <p style='color: #64748b; font-size: 14px;'>If you did not request this, you can ignore this email.</p>");
        $sent = pb2_send_mail($destination, 'Your verification code — Barangay Pasong Buaya II', $html,
            "Your Barangay Pasong Buaya II code is $code (to $what). It expires in $minutes minutes.");
        $failMsg = 'We could not send the email. Please try again in a moment.';
    }

    if (!$sent) {
        pb2_vc_clear($conn, $purpose, $key, $channel);
        return ['ok' => false, 'message' => $failMsg];
    }
    return [
        'ok' => true,
        'message' => 'A 6-digit code was sent to ' . pb2_vc_mask($channel, $destination) . '.',
        'resend_in' => PB2_VC_RESEND_COOLDOWN,
        'sent_to' => pb2_vc_mask($channel, $destination),
    ];
}

/** Checks a code. A correct code marks the row verified (it is not deleted). */
function pb2_vc_check(mysqli $conn, string $purpose, string $key, string $channel, string $code): array
{
    $row = pb2_vc_row($conn, $purpose, $key, $channel === 'sms' ? 'sms' : 'email');
    $code = preg_replace('/\D/', '', $code);
    if (!$row) return ['ok' => false, 'message' => 'No code was requested. Please request a new one.'];
    if ($row['verified_at'] !== null) return ['ok' => true, 'message' => 'Already verified.'];
    if ((int)$row['attempts'] >= PB2_VC_MAX_ATTEMPTS) {
        return ['ok' => false, 'locked' => true, 'message' => 'Too many wrong tries. Please request a new code.'];
    }
    if (strtotime($row['expires_at']) < time()) {
        return ['ok' => false, 'expired' => true, 'message' => 'This code has expired. Please request a new one.'];
    }
    $id = (int)$row['verification_id'];
    if (strlen($code) !== 6 || !password_verify($code, $row['otp_hash'])) {
        $conn->query("UPDATE contact_verifications SET attempts = attempts + 1 WHERE verification_id = $id");
        $left = PB2_VC_MAX_ATTEMPTS - ((int)$row['attempts'] + 1);
        return [
            'ok' => false,
            'locked' => $left <= 0,
            'message' => $left > 0
                ? "Incorrect code. You have $left " . ($left === 1 ? 'try' : 'tries') . ' left.'
                : 'Incorrect code. Too many wrong tries — please request a new code.',
        ];
    }
    $conn->query("UPDATE contact_verifications SET verified_at = NOW() WHERE verification_id = $id");
    return ['ok' => true, 'message' => 'Code verified.'];
}

/** True when the code was entered within the last 30 minutes for this same destination. */
function pb2_vc_is_verified(mysqli $conn, string $purpose, string $key, string $channel, ?string $destination = null): bool
{
    $row = pb2_vc_row($conn, $purpose, $key, $channel === 'sms' ? 'sms' : 'email');
    if (!$row || $row['verified_at'] === null) return false;
    if (strtotime($row['verified_at']) < time() - PB2_VC_VERIFIED_FOR_MIN * 60) return false;
    if ($destination !== null) {
        $want = $channel === 'sms' ? pb2_sms_normalize($destination) : strtolower(trim($destination));
        if ($want === null || $want !== $row['destination']) return false;
    }
    return true;
}

/**
 * Registration's email code (email_verifications, send_otp.php): true when
 * $code matches and was either confirmed in the last 30 minutes or is still
 * inside its 10 minutes. Registration verifies the email first, then the
 * mobile number, so the email code may expire during the SMS step.
 */
function pb2_registration_email_ok(mysqli $conn, string $email, string $code): bool
{
    $email = strtolower(trim($email));
    $stmt = $conn->prepare("SELECT otp_hash, expires_at, attempts, verified_at FROM email_verifications WHERE email = ?");
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row || (int)$row['attempts'] >= PB2_VC_MAX_ATTEMPTS) return false;
    if (!password_verify(preg_replace('/\D/', '', $code), $row['otp_hash'])) return false;
    $fresh = strtotime($row['expires_at']) >= time();
    $confirmed = $row['verified_at'] !== null && strtotime($row['verified_at']) > time() - PB2_VC_VERIFIED_FOR_MIN * 60;
    return $fresh || $confirmed;
}

/** Removes the codes for a purpose/key (one channel, or all). */
function pb2_vc_clear(mysqli $conn, string $purpose, string $key, ?string $channel = null): void
{
    if ($channel === null) {
        $stmt = $conn->prepare("DELETE FROM contact_verifications WHERE purpose = ? AND subject_key = ?");
        $stmt->bind_param('ss', $purpose, $key);
    } else {
        $stmt = $conn->prepare("DELETE FROM contact_verifications WHERE purpose = ? AND subject_key = ? AND channel = ?");
        $stmt->bind_param('sss', $purpose, $key, $channel);
    }
    $stmt->execute();
    $stmt->close();
}
