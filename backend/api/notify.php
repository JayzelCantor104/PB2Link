<?php
/**
 * Where a resident's status updates go (residents.notify_channel, migration 015).
 *
 *   email / sms / both   chosen by the resident (Register, Edit Profile)
 *   document requests    always both ($always_both = true)
 *
 * SMS only goes out when the resident has a valid mobile number and SMS is
 * configured. If a text can't be sent (no number, provider error, monthly cap)
 * the update falls back to email, so nobody misses it.
 *
 * Existing endpoints keep their own email code and wrap it like this:
 *
 *     require_once __DIR__ . '/notify.php';
 *     $ch = pb2_notify_channels($conn, $user_id, true);
 *     $sms_ok = pb2_notify_sms($conn, $ch, "PB2Link: ...", 'doc_status');
 *     if ($ch['email'] || !$sms_ok) { ...send the email as before... }
 *
 * New code can use pb2_notify_resident(), which does both.
 */

require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/sms.php';

const PB2_NOTIFY_CHANNELS = ['email', 'sms', 'both'];

/** users.email + residents.contact_num / notify_channel / fName, or null. */
function pb2_resident_contact(mysqli $conn, $user_id): ?array
{
    $uid = (string)$user_id;
    $stmt = $conn->prepare("SELECT u.email, r.contact_num, r.notify_channel, r.fName
                              FROM users u LEFT JOIN residents r ON r.user_id = u.user_id
                             WHERE u.user_id = ? LIMIT 1");
    $stmt->bind_param('s', $uid);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

/**
 * ['email' => bool, 'sms' => bool, 'email_to' => ?string, 'sms_to' => ?string, 'user_id' => ...]
 * 'email' is also true when SMS was wanted but can't be used.
 */
function pb2_notify_channels(mysqli $conn, $user_id, bool $always_both = false): array
{
    $c = $user_id ? pb2_resident_contact($conn, $user_id) : null;
    $pref = $always_both ? 'both' : (in_array($c['notify_channel'] ?? '', PB2_NOTIFY_CHANNELS, true) ? $c['notify_channel'] : 'email');
    $mobile = $c ? pb2_sms_normalize($c['contact_num'] ?? '') : null;
    $email = trim((string)($c['email'] ?? ''));

    $sms = in_array($pref, ['sms', 'both'], true) && $mobile !== null && pb2_sms_configured();
    return [
        'email'    => in_array($pref, ['email', 'both'], true) || !$sms,
        'sms'      => $sms,
        'email_to' => $email !== '' ? $email : null,
        'sms_to'   => $mobile,
        'user_id'  => $user_id,
    ];
}

/** Sends the SMS part when the channels call for it. Returns true when a text went out. */
function pb2_notify_sms(mysqli $conn, array $channels, string $text, string $purpose): bool
{
    if (empty($channels['sms']) || empty($channels['sms_to'])) return false;
    $r = pb2_send_sms($conn, $channels['sms_to'], $text, $purpose, ['user_id' => $channels['user_id'] ?? null]);
    return $r['ok'];
}

/**
 * Full notice: SMS and/or email per the resident's preference, email as the
 * fallback. Best effort — never blocks the caller. Returns what was sent.
 */
function pb2_notify_resident(mysqli $conn, $user_id, string $subject, string $html, string $plain, string $sms_text, string $purpose, bool $always_both = false): array
{
    $ch = pb2_notify_channels($conn, $user_id, $always_both);
    $sms_ok = pb2_notify_sms($conn, $ch, $sms_text, $purpose);
    $mail_ok = false;
    if (($ch['email'] || !$sms_ok) && $ch['email_to']) {
        $mail_ok = pb2_send_mail($ch['email_to'], $subject, $html, $plain);
    }
    return ['sms' => $sms_ok, 'email' => $mail_ok];
}
