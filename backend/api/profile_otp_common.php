<?php
/**
 * Email verification codes for Edit Profile (migration 011).
 *
 * Which fields need a code (kept in sync with src/pages/Edit_profile.jsx):
 *   PB2_OTP_APPLY_FIELDS     applied as soon as the code is entered
 *   PB2_OTP_ADDRESS_FIELDS   code first, then admin approval with a proof of the
 *                            new address (migration 021)
 *   PB2_OTP_REVIEW_FIELDS    code first, then admin approval — the whole
 *                            Personal Identity section (checked against the
 *                            ID on file; birth date also sets Senior status)
 * The password change uses purpose 'password'.
 *
 * Codes go by email or SMS (channel, migration 015). The resident chooses,
 * except that a new email address gets its code by email and a new mobile
 * number gets its code by SMS — entering it proves they own it.
 *
 * Codes follow registration's send_otp.php: random_int, stored only as a
 * password_hash(), 10-minute life. On top of that: 5 wrong tries locks the
 * code, and a new code can be sent after 60 seconds.
 *
 * Callers must already have $conn (db_connection.php).
 */

require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/sms.php';

const PB2_OTP_TTL_MINUTES     = 10;
const PB2_OTP_MAX_ATTEMPTS    = 5;
const PB2_OTP_RESEND_COOLDOWN = 60; // seconds

const PB2_OTP_APPLY_FIELDS = [
    'residency_status',
    'contact_person', 'contactp_relationship', 'contactp_num',
    'email', 'contact_num',
];
// The home address (migration 021): code first, then staff approval with a
// proof of the new address, like registration (residency_requirement.php).
const PB2_OTP_ADDRESS_FIELDS = ['house_no', 'block_lot', 'street', 'subdivision', 'zone', 'area', 'landmark'];
// Everything in Edit Profile's "Personal Identity" section: verified against
// the ID on file, so after the code staff still approve it.
const PB2_OTP_REVIEW_FIELDS = ['fName', 'mName', 'lName', 'suffix', 'birth_date', 'gender', 'philsys_nat_id'];

const PB2_OTP_FIELD_LABELS = [
    'fName' => 'First Name', 'mName' => 'Middle Name', 'lName' => 'Last Name', 'suffix' => 'Suffix',
    'philsys_nat_id' => 'PhilSys Number',
    'birth_date' => 'Birth Date', 'gender' => 'Sex',
    'house_no' => 'House No.', 'block_lot' => 'Block & Lot', 'street' => 'Street', 'subdivision' => 'Subdivision',
    'zone' => 'Zone / Purok', 'area' => 'Area / Village', 'landmark' => 'Landmark', 'residency_status' => 'Residency Status',
    'contact_person' => 'Emergency Contact', 'contactp_relationship' => 'Emergency Contact Relationship',
    'contactp_num' => 'Emergency Contact Mobile', 'email' => 'Email Address', 'contact_num' => 'Mobile Number',
];

/** Masked address or number for display. */
function pb2_otp_mask(string $channel, string $to): string
{
    return $channel === 'sms' ? pb2_sms_mask($to) : pb2_otp_mask_email($to);
}

/** "ju***@gmail.com" — enough for the resident to recognise the inbox. */
function pb2_otp_mask_email(string $email): string
{
    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    $shown = mb_substr($local, 0, min(2, mb_strlen($local)));
    return $shown . str_repeat('*', min(6, max(3, mb_strlen($local) - mb_strlen($shown)))) . ($domain !== '' ? "@$domain" : '');
}

/** The resident's current pending code for a purpose, or null. */
function pb2_otp_active(mysqli $conn, $user_id, string $purpose): ?array
{
    $stmt = $conn->prepare("SELECT * FROM profile_otp_challenges
                             WHERE user_id = ? AND purpose = ? AND status = 'pending'
                             ORDER BY challenge_id DESC LIMIT 1");
    $uid = (string)$user_id;
    $stmt->bind_param("ss", $uid, $purpose);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

/**
 * Cancels the resident's pending code for this purpose, dropping the field
 * changes it was holding (they were never applied).
 */
function pb2_otp_cancel(mysqli $conn, $user_id, string $purpose): void
{
    $uid = (string)$user_id;
    $del = $conn->prepare("DELETE p FROM pending_profile_changes p
                             JOIN profile_otp_challenges c ON c.challenge_id = p.challenge_id
                            WHERE c.user_id = ? AND c.purpose = ? AND c.status = 'pending' AND p.status = 'pending_otp'");
    $del->bind_param("ss", $uid, $purpose);
    $del->execute();
    $del->close();

    $upd = $conn->prepare("UPDATE profile_otp_challenges SET status = 'cancelled'
                            WHERE user_id = ? AND purpose = ? AND status = 'pending'");
    $upd->bind_param("ss", $uid, $purpose);
    $upd->execute();
    $upd->close();
}

/**
 * Starts a new code (cancelling any earlier one for the same purpose).
 * Returns [challenge_id, plain code] — the code is only ever emailed.
 */
function pb2_otp_create(mysqli $conn, $user_id, string $purpose, string $sent_to, ?string $new_password_hash = null, string $channel = 'email'): array
{
    pb2_otp_cancel($conn, $user_id, $purpose);

    $code = sprintf('%06d', random_int(0, 999999));
    $hash = password_hash($code, PASSWORD_DEFAULT);
    $expires = date('Y-m-d H:i:s', time() + PB2_OTP_TTL_MINUTES * 60);
    $now = date('Y-m-d H:i:s');
    $uid = (string)$user_id;

    $channel = $channel === 'sms' ? 'sms' : 'email';
    $stmt = $conn->prepare("INSERT INTO profile_otp_challenges
                              (user_id, purpose, channel, otp_hash, sent_to, expires_at, last_sent_at, new_password_hash)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("ssssssss", $uid, $purpose, $channel, $hash, $sent_to, $expires, $now, $new_password_hash);
    $stmt->execute();
    $id = (int)$stmt->insert_id;
    $stmt->close();
    return [$id, $code];
}

/** New code for an existing challenge (resend): fresh expiry, tries reset. */
function pb2_otp_regenerate(mysqli $conn, int $challenge_id): string
{
    $code = sprintf('%06d', random_int(0, 999999));
    $hash = password_hash($code, PASSWORD_DEFAULT);
    $expires = date('Y-m-d H:i:s', time() + PB2_OTP_TTL_MINUTES * 60);
    $now = date('Y-m-d H:i:s');
    $stmt = $conn->prepare("UPDATE profile_otp_challenges
                               SET otp_hash = ?, attempts = 0, expires_at = ?, last_sent_at = ?
                             WHERE challenge_id = ? AND status = 'pending'");
    $stmt->bind_param("sssi", $hash, $expires, $now, $challenge_id);
    $stmt->execute();
    $stmt->close();
    return $code;
}

/** Seconds until another code may be sent (0 = now). */
function pb2_otp_resend_wait(array $challenge): int
{
    // Capped at the cooldown so a clock/timezone mismatch can never show a
    // resident an hours-long wait.
    return min(PB2_OTP_RESEND_COOLDOWN, max(0, PB2_OTP_RESEND_COOLDOWN - (time() - strtotime($challenge['last_sent_at']))));
}

/** Human labels of the field changes a profile code is holding. */
function pb2_otp_held_fields(mysqli $conn, int $challenge_id): array
{
    $stmt = $conn->prepare("SELECT field_name FROM pending_profile_changes
                             WHERE challenge_id = ? AND status = 'pending_otp' ORDER BY change_id");
    $stmt->bind_param("i", $challenge_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $labels = [];
    while ($r = $res->fetch_assoc()) {
        $labels[] = PB2_OTP_FIELD_LABELS[$r['field_name']] ?? $r['field_name'];
    }
    $stmt->close();
    return $labels;
}

/** What the page needs to show a waiting code (no hash, masked address). */
function pb2_otp_summary(mysqli $conn, $user_id, string $purpose): ?array
{
    $c = pb2_otp_active($conn, $user_id, $purpose);
    if (!$c) return null;
    return [
        'purpose'       => $purpose,
        'channel'       => $c['channel'] ?? 'email',
        'sent_to'       => pb2_otp_mask($c['channel'] ?? 'email', $c['sent_to']),
        'expires_at'    => $c['expires_at'],
        'expired'       => strtotime($c['expires_at']) < time(),
        'attempts_left' => max(0, PB2_OTP_MAX_ATTEMPTS - (int)$c['attempts']),
        'resend_in'     => pb2_otp_resend_wait($c),
        'fields'        => $purpose === 'profile' ? pb2_otp_held_fields($conn, (int)$c['challenge_id']) : [],
        'can_switch'    => !pb2_otp_channel_forced($conn, (int)$c['challenge_id']),
    ];
}

/** True when the code is holding a new email or mobile number (its channel is fixed). */
function pb2_otp_channel_forced(mysqli $conn, int $challenge_id): bool
{
    $stmt = $conn->prepare("SELECT 1 FROM pending_profile_changes
                             WHERE challenge_id = ? AND status = 'pending_otp' AND field_name IN ('email', 'contact_num') LIMIT 1");
    $stmt->bind_param("i", $challenge_id);
    $stmt->execute();
    $forced = $stmt->get_result()->num_rows > 0;
    $stmt->close();
    return $forced;
}

/** Emails the code. Returns true when sent. */
function pb2_otp_send_code(string $to, string $code, string $purpose, array $fieldLabels = []): bool
{
    $what = $purpose === 'password'
        ? 'change your account password'
        : 'update your profile' . ($fieldLabels ? ' (' . htmlspecialchars(implode(', ', $fieldLabels)) . ')' : '');
    $minutes = PB2_OTP_TTL_MINUTES;
    $html = pb2_mail_layout('Your Verification Code', "
        <p>Hello,</p>
        <p>We received a request to <strong>$what</strong> on the Barangay Pasong Buaya II resident portal.</p>
        <p>Enter this code to confirm it was you:</p>
        <div style='text-align: center; margin: 25px 0;'>
            <b style='font-size: 28px; color: #059669; letter-spacing: 6px; background: #f0fdf4; padding: 10px 25px; border-radius: 8px; border: 1px dashed #059669; display: inline-block;'>$code</b>
        </div>
        <p style='color: #64748b; font-size: 14px;'>The code expires in $minutes minutes. Never share it with anyone — barangay staff will never ask for it.</p>
        <p style='color: #64748b; font-size: 14px;'>If you did not request this, you can ignore this email; nothing will change. Consider changing your password.</p>");
    $plain = "Your Barangay Pasong Buaya II verification code is $code. It expires in $minutes minutes. If you did not request this, ignore this email.";
    return pb2_send_mail($to, 'Your verification code — Barangay Pasong Buaya II', $html, $plain);
}

/** "Your profile was changed" notice (courtesy — failure doesn't block). */
function pb2_otp_send_change_notice(string $to, array $changedLabels, string $extraHtml = ''): void
{
    $items = implode('', array_map(fn($l) => '<li>' . htmlspecialchars($l) . '</li>', $changedLabels));
    $when = date('F j, Y g:i A');
    $html = pb2_mail_layout('Your Account Was Updated', "
        <p>Hello,</p>
        <p>These changes to your Barangay Pasong Buaya II resident account were confirmed with an email code on <strong>$when</strong>:</p>
        <ul>$items</ul>
        $extraHtml
        <p style='color: #991b1b; font-size: 14px;'>If you did not make these changes, change your password right away and contact the Barangay Hall.</p>");
    pb2_send_mail($to, 'Your account was updated — Barangay Pasong Buaya II', $html,
        'These changes to your Barangay Pasong Buaya II account were confirmed: ' . implode(', ', $changedLabels)
        . ". If you did not make them, change your password and contact the Barangay Hall.");
}

/**
 * Sends the code by its channel. SMS needs $conn for the log and the monthly
 * cap. Returns true when sent.
 */
function pb2_otp_deliver(mysqli $conn, $user_id, string $channel, string $to, string $code, string $purpose, array $fieldLabels = []): bool
{
    if ($channel !== 'sms') {
        return pb2_otp_send_code($to, $code, $purpose, $fieldLabels);
    }
    $what = $purpose === 'password' ? 'change your password' : 'confirm your profile changes';
    $minutes = PB2_OTP_TTL_MINUTES;
    $r = pb2_send_sms($conn, $to, "PB2Link: Your code to $what is $code. Valid for $minutes minutes. Never share it with anyone.",
        "code:profile_$purpose", ['user_id' => $user_id]);
    return $r['ok'];
}

/**
 * Where a code may go for this save: [channel, destination, forced].
 * A new email gets the code by email, a new mobile number by SMS; otherwise
 * the resident's choice, to the address / number on file.
 * Returns [null, error message, true] when the choice can't be honoured.
 */
function pb2_otp_route(array $current, array $changedColumns, array $newValues, string $wanted): array
{
    $emailChanging = in_array('email', $changedColumns, true);
    $mobileChanging = in_array('contact_num', $changedColumns, true);
    if ($emailChanging && $mobileChanging) {
        return [null, 'Please change your email address and your mobile number one at a time, so each can be confirmed with its own code.', true];
    }
    if ($emailChanging) return ['email', (string)$newValues['email'], true];
    if ($mobileChanging) {
        $n = pb2_sms_normalize($newValues['contact_num'] ?? '');
        if ($n === null) return [null, 'Mobile number must be 11 digits starting with 09.', true];
        if (!pb2_sms_configured()) return [null, 'Text messages are not available right now, so a new mobile number cannot be confirmed. Please try again later.', true];
        return ['sms', $n, true];
    }
    if ($wanted === 'sms') {
        $n = pb2_sms_normalize($current['contact_num'] ?? '');
        if ($n === null) return [null, 'There is no valid mobile number on your profile to text a code to. Choose email instead.', false];
        if (!pb2_sms_configured()) return [null, 'Text messages are not available right now. Choose email instead.', false];
        return ['sms', $n, false];
    }
    return ['email', (string)$current['email'], false];
}

/**
 * "Your account was updated" notice by the resident's preferred channel
 * (email fallback). Courtesy only — failure doesn't block.
 */
function pb2_otp_notify_change(mysqli $conn, $user_id, string $email, array $changedLabels): void
{
    require_once __DIR__ . '/notify.php';
    $ch = pb2_notify_channels($conn, $user_id);
    $list = implode(', ', $changedLabels);
    $sms_ok = pb2_notify_sms($conn, $ch, "PB2Link: Your account was updated ($list). If this was not you, change your password and contact the Barangay Hall.", 'account_notice');
    if (($ch['email'] || !$sms_ok) && $email !== '') {
        pb2_otp_send_change_notice($email, $changedLabels);
    }
}

/**
 * A code entered from a text message proves the resident has that phone:
 * record it on residents.mobile_verified_at when it is the number on file
 * (call after the held changes are applied, so a new number counts).
 */
function pb2_otp_mark_mobile_verified(mysqli $conn, $user_id, array $challenge): void
{
    if (($challenge['channel'] ?? 'email') !== 'sms') return;
    $uid = (string)$user_id;
    $stmt = $conn->prepare("SELECT contact_num FROM residents WHERE user_id = ?");
    $stmt->bind_param("s", $uid);
    $stmt->execute();
    $num = (string)($stmt->get_result()->fetch_row()[0] ?? '');
    $stmt->close();
    if (pb2_sms_normalize($num) !== null && pb2_sms_normalize($num) === pb2_sms_normalize($challenge['sent_to'])) {
        $upd = $conn->prepare("UPDATE residents SET mobile_verified_at = NOW() WHERE user_id = ?");
        $upd->bind_param("s", $uid);
        $upd->execute();
        $upd->close();
    }
}
