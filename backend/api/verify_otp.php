<?php
// Edit Profile email codes (migration 011, rules in profile_otp_common.php).
//
// POST JSON { purpose: 'profile' | 'password', action: 'verify', otp: '123456' }
//   profile  -> applies the held changes (address, emergency contact, email,
//               mobile no.); birth date / sex move on to admin approval.
//   password -> sets the new password that was waiting for the code.
//   A wrong code uses up one of 5 tries; then the code is locked and a new
//   one must be sent.
// POST JSON { purpose, action: 'resend' }  -> new code (60-second cooldown)
// POST JSON { purpose, action: 'cancel' }  -> drops the code and what it held
//
// After a confirmed change, a notice goes to the account email (and to the
// old address when the email itself changed).
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

require_once '../db_connection.php';
require_once __DIR__ . '/profile_otp_common.php';

$respond = function (bool $success, string $message, array $extra = []) {
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
};

if (!$conn) {
    $respond(false, 'Database connection failed.');
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    $respond(false, 'Invalid request method.');
}
// Also open to a resident fixing their registration (restricted mode, migration 027).
if (pb2_resident_session_user(true) === null) {
    http_response_code(401);
    $respond(false, 'Your session has expired. Please log in again.', ['auth_error' => true]);
}

$user_id = pb2_resident_session_user(true);
$data = json_decode(file_get_contents('php://input'), true) ?: [];
$purpose = ($data['purpose'] ?? 'profile') === 'password' ? 'password' : 'profile';
$action = $data['action'] ?? 'verify';

$challenge = pb2_otp_active($conn, $user_id, $purpose);
if (!$challenge) {
    $respond(false, 'There is no code waiting. Please save your changes again to get a new code.', ['otp' => null]);
}
$challenge_id = (int)$challenge['challenge_id'];

// ---- Cancel -------------------------------------------------------------------
if ($action === 'cancel') {
    pb2_otp_cancel($conn, $user_id, $purpose);
    $respond(true, $purpose === 'password' ? 'Password change cancelled.' : 'Changes waiting for a code were discarded.', ['otp' => null]);
}

// ---- Resend -------------------------------------------------------------------
if ($action === 'resend') {
    $wait = pb2_otp_resend_wait($challenge);
    if ($wait > 0) {
        $respond(false, "Please wait $wait seconds before requesting another code.", ['otp' => pb2_otp_summary($conn, $user_id, $purpose)]);
    }
    // "Send it by SMS / email instead" (migration 015): allowed unless the code
    // is confirming a new email or mobile number, whose channel is fixed.
    $channel = $challenge['channel'] ?? 'email';
    $sent_to = $challenge['sent_to'];
    $wanted = $data['channel'] ?? $channel;
    if (in_array($wanted, ['email', 'sms'], true) && $wanted !== $channel) {
        if (pb2_otp_channel_forced($conn, $challenge_id)) {
            $respond(false, 'This code confirms a new email address or mobile number, so it can only be sent there.', ['otp' => pb2_otp_summary($conn, $user_id, $purpose)]);
        }
        $cur = $conn->prepare("SELECT u.email, r.contact_num FROM users u LEFT JOIN residents r ON r.user_id = u.user_id WHERE u.user_id = ?");
        $uid_s = (string)$user_id;
        $cur->bind_param("s", $uid_s);
        $cur->execute();
        $contact = $cur->get_result()->fetch_assoc() ?: [];
        [$new_channel, $new_to] = pb2_otp_route($contact, [], [], $wanted);
        if ($new_channel === null) {
            $respond(false, $new_to, ['otp' => pb2_otp_summary($conn, $user_id, $purpose)]);
        }
        $sw = $conn->prepare("UPDATE profile_otp_challenges SET channel = ?, sent_to = ? WHERE challenge_id = ? AND status = 'pending'");
        $sw->bind_param("ssi", $new_channel, $new_to, $challenge_id);
        $sw->execute();
        [$channel, $sent_to] = [$new_channel, $new_to];
    }
    $code = pb2_otp_regenerate($conn, $challenge_id);
    $labels = $purpose === 'profile' ? pb2_otp_held_fields($conn, $challenge_id) : [];
    if (!pb2_otp_deliver($conn, $user_id, $channel, $sent_to, $code, $purpose, $labels)) {
        $respond(false, $channel === 'sms' ? 'We could not send the text message. Please try again in a moment.' : 'We could not send the email. Please try again in a moment.',
            ['otp' => pb2_otp_summary($conn, $user_id, $purpose)]);
    }
    $respond(true, 'A new code was sent to ' . pb2_otp_mask($channel, $sent_to) . '.', ['otp' => pb2_otp_summary($conn, $user_id, $purpose)]);
}

// ---- Verify -------------------------------------------------------------------
$submitted = preg_replace('/\D/', '', (string)($data['otp'] ?? ''));
if (strlen($submitted) !== 6) {
    $respond(false, ($challenge['channel'] ?? 'email') === 'sms' ? 'Please enter the 6-digit code from the text message.' : 'Please enter the 6-digit code from your email.');
}
if ((int)$challenge['attempts'] >= PB2_OTP_MAX_ATTEMPTS) {
    $respond(false, 'Too many wrong tries. Please request a new code.', ['otp' => pb2_otp_summary($conn, $user_id, $purpose), 'locked' => true]);
}
if (strtotime($challenge['expires_at']) < time()) {
    $respond(false, 'This code has expired. Please request a new one.', ['otp' => pb2_otp_summary($conn, $user_id, $purpose), 'expired' => true]);
}

if (!password_verify($submitted, $challenge['otp_hash'])) {
    $bump = $conn->prepare("UPDATE profile_otp_challenges SET attempts = attempts + 1 WHERE challenge_id = ?");
    $bump->bind_param("i", $challenge_id);
    $bump->execute();
    $left = PB2_OTP_MAX_ATTEMPTS - ((int)$challenge['attempts'] + 1);
    $respond(false, $left > 0
        ? "Incorrect code. You have $left " . ($left === 1 ? 'try' : 'tries') . ' left.'
        : 'Incorrect code. Too many wrong tries — please request a new code.',
        ['otp' => pb2_otp_summary($conn, $user_id, $purpose), 'locked' => $left <= 0]);
}

$cur = $conn->prepare("SELECT u.email FROM users u WHERE u.user_id = ?");
$uid = (string)$user_id;
$cur->bind_param("s", $uid);
$cur->execute();
$account_email = (string)($cur->get_result()->fetch_row()[0] ?? '');

// Password change ------------------------------------------------------------------
if ($purpose === 'password') {
    $conn->begin_transaction();
    try {
        $upd = $conn->prepare("UPDATE users SET password_hash = ? WHERE user_id = ?");
        $upd->bind_param("ss", $challenge['new_password_hash'], $uid);
        if (!$upd->execute()) throw new Exception('password update failed');
        $done = $conn->prepare("UPDATE profile_otp_challenges SET status = 'verified', new_password_hash = NULL WHERE challenge_id = ?");
        $done->bind_param("i", $challenge_id);
        $done->execute();
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('verify_otp.php password: ' . $e->getMessage());
        $respond(false, 'We could not change your password. Please try again.');
    }
    pb2_otp_mark_mobile_verified($conn, $uid, $challenge);
    pb2_otp_notify_change($conn, $user_id, $account_email, ['Password']);
    $respond(true, 'Your password has been changed.', ['otp' => null]);
}

// Profile changes ------------------------------------------------------------------
$stmt = $conn->prepare("SELECT change_id, field_name, old_value, new_value, proof_document, proof_document_back, verified_by_scan FROM pending_profile_changes
                         WHERE challenge_id = ? AND user_id = ? AND status = 'pending_otp'");
$stmt->bind_param("is", $challenge_id, $uid);
$stmt->execute();
$held = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

$allowed_apply = PB2_OTP_APPLY_FIELDS;
$nullable = ['house_no', 'zone', 'area', 'block_lot', 'landmark'];
$applied_labels = [];
$review_labels = [];
$old_email = null;

$conn->begin_transaction();
try {
    foreach ($held as $change) {
        $field = $change['field_name'];
        $value = $change['new_value'];
        $change_id = (int)$change['change_id'];

        // A PhilSys number whose card was scanned and name-matched on the
        // server (edit_profile.php) applies now, with its card photos filed
        // on the record — the scan did the check staff would do.
        if ($field === 'philsys_nat_id' && (int)$change['verified_by_scan'] === 1 && (string)$value !== '') {
            require_once __DIR__ . '/philsys_scan_common.php';
            $front = pb2_file_proof_on_record($conn, $user_id, $change['proof_document'] ?? '', 'philsys_front');
            $back = pb2_file_proof_on_record($conn, $user_id, $change['proof_document_back'] ?? '', 'philsys_back');
            if ($front === null || $back === null) throw new Exception('Could not file the PhilSys card photos.');
            $ps = $conn->prepare("UPDATE residents SET philsys_nat_id = ?, philsys_img_front = ?, philsys_img_back = ?, philsys_verification_status = 'Matched' WHERE user_id = ?");
            $ps->bind_param("ssss", $value, $front, $back, $uid);
            if (!$ps->execute()) throw new Exception('Could not update the PhilSys number.');
            $done = $conn->prepare("UPDATE pending_profile_changes SET status = 'approved' WHERE change_id = ?");
            $done->bind_param("i", $change_id);
            $done->execute();
            $applied_labels[] = PB2_OTP_FIELD_LABELS[$field];
            continue;
        }

        if (in_array($field, PB2_OTP_REVIEW_FIELDS, true) || in_array($field, PB2_OTP_ADDRESS_FIELDS, true)) {
            // Other Personal Identity changes, and the home address with its
            // proof (migration 021): confirmed by the resident, now checked by staff.
            $clear = $conn->prepare("DELETE FROM pending_profile_changes WHERE user_id = ? AND field_name = ? AND status = 'pending_approval'");
            $clear->bind_param("ss", $uid, $field);
            $clear->execute();
            $to_review = $conn->prepare("UPDATE pending_profile_changes SET status = 'pending_approval' WHERE change_id = ?");
            $to_review->bind_param("i", $change_id);
            $to_review->execute();
            $review_labels[] = PB2_OTP_FIELD_LABELS[$field] ?? $field;
            continue;
        }
        if (!in_array($field, $allowed_apply, true)) {
            throw new Exception("Unexpected held field $field.");
        }

        if ($field === 'email') {
            // Still unique? Another account may have taken it since.
            $dup = $conn->prepare("SELECT 1 FROM users WHERE email = ? AND user_id <> ?");
            $dup->bind_param("ss", $value, $uid);
            $dup->execute();
            if ($dup->get_result()->num_rows > 0) {
                throw new RuntimeException('That email address is now used by another account. Please choose a different one.');
            }
            $old_email = $account_email;
            $upd = $conn->prepare("UPDATE users SET email = ? WHERE user_id = ?");
        } else {
            $upd = $conn->prepare("UPDATE residents SET `$field` = ? WHERE user_id = ?");
            if ($value === '' && in_array($field, $nullable, true)) $value = null;
        }
        $upd->bind_param("ss", $value, $uid);
        if (!$upd->execute()) throw new Exception("Could not update $field.");

        $done = $conn->prepare("UPDATE pending_profile_changes SET status = 'approved' WHERE change_id = ?");
        $done->bind_param("i", $change_id);
        $done->execute();
        $applied_labels[] = PB2_OTP_FIELD_LABELS[$field] ?? $field;
    }

    $fin = $conn->prepare("UPDATE profile_otp_challenges SET status = 'verified' WHERE challenge_id = ?");
    $fin->bind_param("i", $challenge_id);
    $fin->execute();
    $conn->commit();
} catch (RuntimeException $e) {
    $conn->rollback();
    $respond(false, $e->getMessage());
} catch (Throwable $e) {
    $conn->rollback();
    error_log('verify_otp.php profile: ' . $e->getMessage());
    $respond(false, 'We could not apply your changes. Please try again.');
}

// Notices: the (possibly new) account address, plus the old one on an email change.
$notice_labels = array_merge($applied_labels, array_map(fn($l) => "$l (sent to barangay staff for approval)", $review_labels));
$new_email = $old_email !== null ? $held[array_search('email', array_column($held, 'field_name'))]['new_value'] : $account_email;
pb2_otp_mark_mobile_verified($conn, $uid, $challenge);
if ($notice_labels) {
    // A changed email is announced by email to both addresses (below);
    // otherwise the notice follows the resident's preferred channel.
    if ($old_email !== null) {
        pb2_otp_send_change_notice($new_email, $notice_labels);
    } else {
        pb2_otp_notify_change($conn, $user_id, $new_email, $notice_labels);
    }
}
// A changed mobile number: the old number is told by SMS, like the old email address.
$mobile_row = array_values(array_filter($held, fn($h) => $h['field_name'] === 'contact_num'));
if ($mobile_row && pb2_sms_normalize($mobile_row[0]['old_value'] ?? '') !== null
    && pb2_sms_normalize($mobile_row[0]['old_value']) !== pb2_sms_normalize($mobile_row[0]['new_value'])) {
    pb2_send_sms($conn, $mobile_row[0]['old_value'], "PB2Link: The mobile number on your Barangay Pasong Buaya II account was changed to " . pb2_sms_mask($mobile_row[0]['new_value']) . ". If this was not you, contact the Barangay Hall.", 'account_notice', ['user_id' => $user_id]);
}
if ($old_email !== null && strcasecmp($old_email, $new_email) !== 0) {
    pb2_otp_send_change_notice($old_email, $notice_labels,
        "<p>Your account's email address was changed to <strong>" . htmlspecialchars(pb2_otp_mask_email($new_email)) . "</strong>. Future notices will go there.</p>");
}

$message = $applied_labels ? 'Your changes have been saved.' : 'Code confirmed.';
if ($review_labels) {
    $message .= ' ' . implode(' and ', $review_labels) . ' will apply once barangay staff approve ' . (count($review_labels) > 1 ? 'them' : 'it') . '.';
}
$respond(true, $message, [
    'applied' => $applied_labels,
    'sent_for_review' => $review_labels,
    'email_changed' => $old_email !== null,
    'otp' => null,
]);
