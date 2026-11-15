<?php
/**
 * Two-step sign-in (migration 052): after the right password, a 6-digit code
 * by email or SMS (verification_common.php, purpose 'login_admin' /
 * 'login_resident', 10 minutes, 5 tries, 60 s between sends).
 *
 *  - Staff: required while system_settings.admin_two_factor = 'on'.
 *  - Residents: optional (residents.two_factor_enabled), set in Edit Profile.
 *  - The code goes to the account's email, or its mobile number once it was
 *    confirmed by SMS; the person may switch between the two.
 *  - "Don't ask again on this device for 30 days": a random token in an
 *    httponly cookie (pb2_trust_admin / pb2_trust_resident), stored only as
 *    SHA-256 in trusted_devices. A password reset forgets every device.
 *
 * Between the password and the code, $_SESSION['pb2_2fa'][$tier] holds who is
 * signing in (no signed-in keys are set until the code is right), for at most
 * PB2_2FA_PENDING_MIN minutes.
 *
 * Callers have $conn and a started session (pb2_session_start()).
 */

require_once __DIR__ . '/verification_common.php';

const PB2_2FA_TRUST_DAYS = 30;
const PB2_2FA_PENDING_MIN = 10;

/** Whether staff must enter a code (Super Admin switch, default on). */
function pb2_2fa_admin_required(mysqli $conn): bool
{
    try {
        $r = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_two_factor'");
        $v = $r ? (string)($r->fetch_row()[0] ?? 'on') : 'on';
    } catch (Throwable $e) {
        $v = 'on';
    }
    return $v !== 'off';
}

/**
 * Where a code can go: ['email' => 'jo***@gmail.com', 'sms' => '0917****123'].
 * $account: email, mobile, mobile_verified (bool).
 */
function pb2_2fa_channels(array $account): array
{
    $out = [];
    $email = trim((string)($account['email'] ?? ''));
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) $out['email'] = pb2_vc_mask('email', strtolower($email));
    $mobile = pb2_sms_normalize((string)($account['mobile'] ?? ''));
    if ($mobile !== null && !empty($account['mobile_verified'])) $out['sms'] = pb2_vc_mask('sms', $mobile);
    return $out;
}

function pb2_2fa_account(mysqli $conn, string $tier, string $subject): ?array
{
    if ($tier === 'admin') {
        $s = $conn->prepare("SELECT admin_id, username, fullname, email, role, mobile_num, mobile_verified_at FROM admins WHERE admin_id = ?");
        $id = (int)$subject;
        $s->bind_param('i', $id);
    } else {
        $s = $conn->prepare("SELECT u.user_id, u.email, r.contact_num, r.mobile_verified_at, r.two_factor_enabled, r.two_factor_channel,
                                    r.status, r.fName, r.lName, r.profile_picture
                               FROM users u JOIN residents r ON r.user_id = u.user_id WHERE u.user_id = ?");
        $s->bind_param('s', $subject);
    }
    $s->execute();
    $row = $s->get_result()->fetch_assoc();
    $s->close();
    if (!$row) return null;
    $row['_channels'] = pb2_2fa_channels([
        'email' => $row['email'] ?? '',
        'mobile' => $tier === 'admin' ? ($row['mobile_num'] ?? '') : ($row['contact_num'] ?? ''),
        'mobile_verified' => !empty($row['mobile_verified_at']),
    ]);
    return $row;
}

// ---- Trusted devices ------------------------------------------------------------
function pb2_2fa_cookie(string $tier): string
{
    return 'pb2_trust_' . ($tier === 'admin' ? 'admin' : 'resident');
}

function pb2_2fa_is_trusted(mysqli $conn, string $tier, string $subject): bool
{
    $token = (string)($_COOKIE[pb2_2fa_cookie($tier)] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return false;
    $hash = hash('sha256', $token);
    try {
        $s = $conn->prepare("SELECT device_id FROM trusted_devices WHERE token_hash = ? AND tier = ? AND subject_id = ? AND expires_at > NOW()");
        $s->bind_param('sss', $hash, $tier, $subject);
        $s->execute();
        $id = $s->get_result()->fetch_row()[0] ?? null;
        $s->close();
        if (!$id) return false;
        $conn->query("UPDATE trusted_devices SET last_used_at = NOW() WHERE device_id = " . (int)$id);
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

function pb2_2fa_trust_device(mysqli $conn, string $tier, string $subject): void
{
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $label = mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? 'Unknown browser'), 0, 120);
    $days = PB2_2FA_TRUST_DAYS;
    $s = $conn->prepare("INSERT INTO trusted_devices (tier, subject_id, token_hash, label, last_used_at, expires_at)
                         VALUES (?, ?, ?, ?, NOW(), NOW() + INTERVAL $days DAY)");
    $s->bind_param('ssss', $tier, $subject, $hash, $label);
    $s->execute();
    $s->close();
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    setcookie(pb2_2fa_cookie($tier), $token, [
        'expires' => time() + $days * 86400, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $https,
    ]);
    // Old rows go away on their own.
    $conn->query("DELETE FROM trusted_devices WHERE expires_at < NOW()");
}

/** Forgets every trusted device of an account (password reset, or on request). Returns how many. */
function pb2_2fa_forget_devices(mysqli $conn, string $tier, string $subject): int
{
    try {
        $s = $conn->prepare("DELETE FROM trusted_devices WHERE tier = ? AND subject_id = ?");
        $s->bind_param('ss', $tier, $subject);
        $s->execute();
        $n = $s->affected_rows;
        $s->close();
        return $n;
    } catch (Throwable $e) {
        return 0;
    }
}

// ---- Pending sign-in ------------------------------------------------------------
/**
 * Holds the sign-in until the code is entered and returns what the sign-in
 * form needs to show the code step.
 */
function pb2_2fa_begin(string $tier, string $subject, array $channels, ?string $preferred): array
{
    $_SESSION['pb2_2fa'][$tier] = ['subject' => $subject, 'at' => time()];
    $default = ($preferred && isset($channels[$preferred])) ? $preferred : (isset($channels['email']) ? 'email' : array_key_first($channels));
    return [
        'success' => false,
        'two_factor' => true,
        'message' => 'Enter the code we send you to finish signing in.',
        'channels' => $channels,
        'default_channel' => $default,
    ];
}

/** The account waiting for its code, or null when none or too old. */
function pb2_2fa_pending(string $tier): ?string
{
    $p = $_SESSION['pb2_2fa'][$tier] ?? null;
    if (!$p || time() - (int)$p['at'] > PB2_2FA_PENDING_MIN * 60) return null;
    return (string)$p['subject'];
}

function pb2_2fa_end(string $tier): void
{
    unset($_SESSION['pb2_2fa'][$tier]);
}

// ---- Finishing a sign-in (shared by the password step and the code step) ---------
/** Signs a resident in (an Active one) and returns the login response. */
function pb2_finish_resident_login(mysqli $conn, array $row): array
{
    session_regenerate_id(true); // prevent session fixation
    $_SESSION['user_id'] = $row['user_id'];
    $_SESSION['role'] = 'user'; // citizen key only; the admin keys are separate
    unset($_SESSION['fix_user_id']);
    $_SESSION['citizen_checked_at'] = time();
    $u = $conn->prepare("UPDATE users SET last_login = NOW() WHERE user_id = ?");
    $u->bind_param('s', $row['user_id']);
    $u->execute();
    $u->close();
    return [
        'success' => true,
        'message' => 'Login successful',
        'user_id' => $row['user_id'],
        'role' => 'user',
        'status' => $row['status'],
        'fName' => $row['fName'],
        'lName' => $row['lName'],
        'profile_picture' => $row['profile_picture'],
    ];
}

/** Signs an admin in and returns the login response (audit-logged). */
function pb2_finish_admin_login(mysqli $conn, array $row, string $how = ''): array
{
    require_once __DIR__ . '/audit_log.php';
    pb2_admin_login_session([
        'admin_id' => $row['admin_id'], 'username' => $row['username'], 'email' => $row['email'], 'role' => $row['role'],
    ]);
    $u = $conn->prepare("UPDATE admins SET last_login = NOW() WHERE admin_id = ?");
    $u->bind_param('i', $row['admin_id']);
    $u->execute();
    $u->close();
    pb2_log_admin_action('admin.login.success', 'admin', $row['admin_id'], "Admin '{$row['username']}' signed in" . $how, null, 'success',
        ['admin_id' => $row['admin_id'], 'username' => $row['username'], 'role' => $row['role']]);
    return [
        'success' => true,
        'message' => 'Admin login successful',
        'adminData' => [
            'admin_id' => $row['admin_id'], 'username' => $row['username'], 'fullname' => $row['fullname'],
            'email' => $row['email'], 'role' => $row['role'],
        ],
    ];
}
