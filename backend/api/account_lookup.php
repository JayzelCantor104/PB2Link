<?php
/**
 * Finding a resident's account by what they type to sign in or reset a
 * password: an email address, or a mobile number (migration 049: residents
 * may register with a mobile number only).
 *
 *   pb2_mobile_09($text)                 '09XXXXXXXXX' or null (accepts +63 / 63 / spaces / dashes)
 *   pb2_find_login_account($conn, $id)   ['user' => row] | ['ambiguous' => true] | null
 *   pb2_mobile_is_login($conn, $mobile)  true when an account with no email signs in with this number
 *
 * A mobile number counts once it was confirmed by an SMS code
 * (residents.mobile_verified_at), or when it is the only contact on the account
 * (registered at the hall with no email): a password reset by SMS then proves
 * the phone and confirms the number (forgot_password.php). Families often share one phone, so when
 * several accounts have the same confirmed number, the one with no email is
 * the one that signs in with it; if that is still more than one, the person
 * is asked to use their email.
 */

function pb2_mobile_09(string $text): ?string
{
    $d = preg_replace('/\D/', '', $text);
    if (preg_match('/^639\d{9}$/', $d)) $d = '0' . substr($d, 2);
    elseif (preg_match('/^9\d{9}$/', $d)) $d = '0' . $d;
    return preg_match('/^09\d{9}$/', $d) ? $d : null;
}

function pb2_find_login_account(mysqli $conn, string $identifier): ?array
{
    $identifier = trim($identifier);
    $cols = "u.user_id, u.email, u.password_hash, r.resident_id, r.status, r.admin_remarks, r.fix_items, r.resubmit_count,
             r.fName, r.lName, r.profile_picture, r.contact_num";
    if (strpos($identifier, '@') !== false) {
        $email = strtolower($identifier);
        $stmt = $conn->prepare("SELECT $cols FROM users u LEFT JOIN residents r ON r.user_id = u.user_id WHERE u.email = ? LIMIT 1");
        $stmt->bind_param('s', $email);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ? ['user' => $row] : null;
    }
    $mobile = pb2_mobile_09($identifier);
    if ($mobile === null) return null;
    $stmt = $conn->prepare("SELECT $cols FROM users u JOIN residents r ON r.user_id = u.user_id
                             WHERE r.contact_num = ? AND (r.mobile_verified_at IS NOT NULL OR u.email IS NULL OR u.email = '')
                             ORDER BY (u.email IS NULL OR u.email = '') DESC");
    $stmt->bind_param('s', $mobile);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    if (!$rows) return null;
    $noEmail = array_values(array_filter($rows, fn($r) => trim((string)$r['email']) === ''));
    if (count($noEmail) === 1) return ['user' => $noEmail[0]];
    if (count($noEmail) === 0 && count($rows) === 1) return ['user' => $rows[0]];
    return ['ambiguous' => true];
}

/** Whether an account without an email already signs in with this mobile number. */
function pb2_mobile_is_login(mysqli $conn, string $mobile): bool
{
    $m = pb2_mobile_09($mobile);
    if ($m === null) return false;
    $stmt = $conn->prepare("SELECT 1 FROM residents r JOIN users u ON u.user_id = r.user_id
                             WHERE r.contact_num = ?
                               AND (u.email IS NULL OR u.email = '') AND r.status <> 'Archived' LIMIT 1");
    $stmt->bind_param('s', $m);
    $stmt->execute();
    $found = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $found;
}
