<?php
/**
 * Email verification codes for Edit Profile (migration 011).
 *
 * Which fields need a code (kept in sync with src/pages/Edit_profile.jsx):
 *   PB2_OTP_APPLY_FIELDS     applied as soon as the code is entered
 *   PB2_OTP_REVIEW_FIELDS    code first, then admin approval — the whole
 *                            Personal Identity section (checked against the
 *                            ID on file; birth date also sets Senior status)
 * The password change uses purpose 'password'.
 *
 * Codes follow registration's send_otp.php: random_int, stored only as a
 * password_hash(), 10-minute life. On top of that: 5 wrong tries locks the
 * code, and a new code can be sent after 60 seconds.
 *
 * Callers must already have $conn (db_connection.php).
 */

require_once __DIR__ . '/mailer.php';

const PB2_OTP_TTL_MINUTES     = 10;
const PB2_OTP_MAX_ATTEMPTS    = 5;
const PB2_OTP_RESEND_COOLDOWN = 60; // seconds

const PB2_OTP_APPLY_FIELDS = [
    'house_no', 'block_lot', 'street', 'subdivision', 'zone', 'area', 'landmark', 'residency_status',
    'contact_person', 'contactp_relationship', 'contactp_num',
    'email', 'contact_num',
];
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
function pb2_otp_create(mysqli $conn, $user_id, string $purpose, string $sent_to, ?string $new_password_hash = null): array
{
    pb2_otp_cancel($conn, $user_id, $purpose);

    $code = sprintf('%06d', random_int(0, 999999));
    $hash = password_hash($code, PASSWORD_DEFAULT);
    $expires = date('Y-m-d H:i:s', time() + PB2_OTP_TTL_MINUTES * 60);
    $now = date('Y-m-d H:i:s');
    $uid = (string)$user_id;

    $stmt = $conn->prepare("INSERT INTO profile_otp_challenges
                              (user_id, purpose, otp_hash, sent_to, expires_at, last_sent_at, new_password_hash)
                            VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sssssss", $uid, $purpose, $hash, $sent_to, $expires, $now, $new_password_hash);
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
        'sent_to'       => pb2_otp_mask_email($c['sent_to']),
        'expires_at'    => $c['expires_at'],
        'expired'       => strtotime($c['expires_at']) < time(),
        'attempts_left' => max(0, PB2_OTP_MAX_ATTEMPTS - (int)$c['attempts']),
        'resend_in'     => pb2_otp_resend_wait($c),
        'fields'        => $purpose === 'profile' ? pb2_otp_held_fields($conn, (int)$c['challenge_id']) : [],
    ];
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
