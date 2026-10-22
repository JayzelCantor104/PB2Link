<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Creating, editing and deleting administrator accounts is Super-only —
// mirrors SuperAdminProtectedRoute on /admin/manage-admins in the frontend.
require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/text_case.php'; // typed text (full name) is stored in ALL CAPS
pb2_require_super_admin();

include "../db_connection.php";
require __DIR__ . '/vendor/autoload.php';

$method = $_SERVER['REQUEST_METHOD'];
require_once __DIR__ . '/admin_permissions.php';

// Roles a Super Admin can give (PB2_SYSTEM_ROLES). 'Viewer' is still in the
// admins.role enum for old rows but is no longer offered: it never limited
// anything. Tab access is set with permissions instead.
function pb2_am_valid_role(string $role, ?string $current = null): bool {
    return in_array($role, PB2_SYSTEM_ROLES, true) || ($current !== null && $role === $current);
}

// Active Super Admins other than $exceptId. The system must always keep one,
// or nobody could manage admins or permissions again.
function pb2_am_other_supers($conn, int $exceptId): int {
    $r = mysqli_query($conn, "SELECT COUNT(*) AS n FROM admins WHERE role = 'Super' AND status = 'active' AND admin_id <> $exceptId");
    return $r ? (int)mysqli_fetch_assoc($r)['n'] : 0;
}
// 0917 *** 4567: numbers in notices are partly hidden.
function pb2_am_mask(string $num): string {
    $d = preg_replace('/\D/', '', $num);
    return strlen($d) >= 7 ? substr($d, 0, 4) . ' *** ' . substr($d, -4) : ($d === '' ? '(none)' : $d);
}
$me = pb2_current_admin();
$myId = (int)($me['admin_id'] ?? 0);

// HANDLE GET: Fetch Admins for React Table
if ($method === 'GET') {
    $search = trim($_GET['search'] ?? '');
    $where = "1";
    
    if ($search !== '') {
        $s = mysqli_real_escape_string($conn, $search);
        $where .= " AND (username LIKE '%$s%' OR fullname LIKE '%$s%' OR email LIKE '%$s%')";
    }

    $sql = "SELECT admin_id, username, fullname, email, mobile_num, email_verified_at, mobile_verified_at, role, position, permission_overrides, status, last_login, created_at FROM admins WHERE $where ORDER BY created_at DESC";
    try {
        $result = mysqli_query($conn, str_replace('email_verified_at,', 'email_verified_at, email_changed_by,', $sql));
    } catch (Throwable $e) {
        $result = mysqli_query($conn, $sql); // migration 029 not applied yet
    }
    $admins = mysqli_fetch_all($result, MYSQLI_ASSOC);

    // Position + permission overrides (migration 020, admin_permissions.php).
    foreach ($admins as &$a) {
        $a['permission_overrides'] = pb2_clean_overrides(json_decode((string)$a['permission_overrides'], true));
        $a['permissions'] = pb2_admin_permissions($conn, (int)$a['admin_id']);
    }
    unset($a);

    echo json_encode([
        'status' => 'success',
        'data' => $admins,
        'positions' => PB2_ADMIN_POSITIONS,
        'permission_labels' => PB2_PERMISSIONS,
        'position_permissions' => pb2_position_permissions($conn),
        // Tab access every standard admin gets (Standard admin access card).
        'standard_permissions' => pb2_standard_permissions($conn),
        'module_permissions' => PB2_MODULE_PERMISSIONS,
        'roles' => PB2_SYSTEM_ROLES,
        'me' => $myId,
    ]);
    exit;
}

// HANDLE POST: Create, Update, Delete, Resend
if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $action = $data['action'] ?? '';

    // Barangay position and per-admin permission overrides (migration 020).
    //   { action:'set_access', admin_id, position: '' | one of PB2_ADMIN_POSITIONS,
    //     overrides: { 'payments.verify': true|false|null, ... } }   null = follow the position
    if ($action === 'set_access') {
        $target = (int)($data['admin_id'] ?? 0);
        $position = trim((string)($data['position'] ?? ''));
        if ($position !== '' && !in_array($position, PB2_ADMIN_POSITIONS, true)) {
            echo json_encode(['status' => 'error', 'message' => 'Unknown position.']);
            exit;
        }
        $overrides = pb2_clean_overrides(is_array($data['overrides'] ?? null) ? $data['overrides'] : []);
        $old = mysqli_fetch_assoc(mysqli_query($conn, "SELECT username, position, permission_overrides FROM admins WHERE admin_id = $target"));
        if (!$old) {
            echo json_encode(['status' => 'error', 'message' => 'Admin not found.']);
            exit;
        }
        $posVal = $position !== '' ? $position : null;
        $ovJson = $overrides ? json_encode($overrides) : null;
        $stmt = $conn->prepare("UPDATE admins SET position = ?, permission_overrides = ? WHERE admin_id = ?");
        $stmt->bind_param('ssi', $posVal, $ovJson, $target);
        $stmt->execute();
        $stmt->close();
        pb2_log_admin_action('admin.account.access', 'admin', (string)$target,
            "Set position/permissions for '{$old['username']}'",
            [
                ['field' => 'position', 'old_value' => $old['position'], 'new_value' => $posVal],
                ['field' => 'permission_overrides', 'old_value' => $old['permission_overrides'], 'new_value' => $ovJson],
            ]);
        echo json_encode(['status' => 'success', 'message' => 'Access saved.', 'permissions' => pb2_admin_permissions($conn, $target)]);
        exit;
    }

    if ($action === 'create') {
        if (!isset($data['email']) || !isset($data['username']) || !isset($data['fullname'])) {
            echo json_encode(['status' => 'error', 'message' => 'Username, Full Name, and Email are required.']);
            exit;
        }

        $username = mysqli_real_escape_string($conn, trim($data['username']));
        $fullname = mysqli_real_escape_string($conn, trim(preg_replace('/\s+/', ' ', (string)$data['fullname'])));
        $email    = mysqli_real_escape_string($conn, strtolower(trim($data['email'])));
        $role     = trim((string)($data['role'] ?? 'Admin'));
        if (!pb2_am_valid_role($role)) {
            echo json_encode(['status' => 'error', 'message' => 'Choose Admin or Super Admin.']);
            exit;
        }
        // Mobile number (migration 015): verified by SMS code when the admin activates the account.
        $mobile   = preg_replace('/\D/', '', (string)($data['mobile_num'] ?? ''));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid email format.']);
            exit;
        }
        if (!preg_match('/^09\d{9}$/', $mobile)) {
            echo json_encode(['status' => 'error', 'message' => 'Mobile number must be 11 digits starting with 09.']);
            exit;
        }

        $checkQuery = "SELECT admin_id FROM admins WHERE username = '$username' OR LOWER(email) = '$email'";
        $checkResult = mysqli_query($conn, $checkQuery);

        if ($checkResult && mysqli_num_rows($checkResult) > 0) {
            echo json_encode(['status' => 'error', 'message' => 'Username or Email already exists.']);
            exit;
        }

        $reset_token = bin2hex(random_bytes(32));
        $reset_expiry = date('Y-m-d H:i:s', strtotime('+24 hours'));
        $temporary_password = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);

        $query = "INSERT INTO admins (username, fullname, email, mobile_num, role, password_hash, status, reset_token, reset_expiry)
                  VALUES ('$username', '$fullname', '$email', '$mobile', '$role', '$temporary_password', 'inactive', '$reset_token', '$reset_expiry')";

        if (mysqli_query($conn, $query)) {
            $new_admin_id = mysqli_insert_id($conn);
            pb2_log_admin_action(
                'admin.account.create',
                'admin',
                (string)$new_admin_id,
                "Created admin account '$username' ($role)",
                [
                    ['field' => 'username', 'old_value' => null, 'new_value' => $username],
                    ['field' => 'fullname', 'old_value' => null, 'new_value' => $fullname],
                    ['field' => 'email', 'old_value' => null, 'new_value' => $email],
                    ['field' => 'mobile_num', 'old_value' => null, 'new_value' => $mobile],
                    ['field' => 'role', 'old_value' => null, 'new_value' => $role],
                ]
            );

            $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
            $frontUrl = $origin ? rtrim($origin, '/') : 'http://localhost:5173';
            $setup_link = "$frontUrl/setup-password?token=$reset_token";

            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            try {
                $mail->isSMTP();
                $mail->Host       = 'smtp.gmail.com';
                $mail->SMTPAuth   = true;
                $mail->Username   = SMTP_USER; 
                $mail->Password   = SMTP_PASS; 
                $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
                $mail->Port       = 465;

                $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
                $mail->addAddress($email, $fullname);
                $mail->isHTML(true);
                $mail->Subject = 'PB2: Administrator Access Invitation';
                
                $mail->Body    = "
                    <div style='font-family: Arial, sans-serif; color: #333; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 550px;'>
                        <h2 style='color: #059669; margin-top: 0;'>You're Invited!</h2>
                        <p>Hello <strong>$fullname</strong>,</p>
                        <p>You have been officially invited to join the <strong>Barangay Pasong Buaya II System</strong> as a system <strong>$role</strong>.</p>
                        <p>To accept this invitation and create your account password, click the secure link below:</p>
                        <p style='margin: 25px 0;'>
                            <a href='$setup_link' style='display:inline-block; padding:12px 24px; background-color:#059669; color:white; text-decoration:none; border-radius:6px; font-weight:bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);'>
                                Set Up Your Account
                            </a>
                        </p>
                    </div>";

                $mail->send();
                echo json_encode(['status' => 'success', 'message' => 'Invitation email sent successfully.']);
            } catch (Exception $e) {
                echo json_encode(['status' => 'error', 'message' => 'Admin recorded, but email failed.']);
            }
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Database error.']);
        }
        exit;
    }

    // --- RESEND INVITATION ---
    if ($action === 'resend') {
        $admin_id = (int)($data['admin_id'] ?? 0);
        
        // Fetch User Details to ensure they aren't active yet
        $query = "SELECT fullname, email, role FROM admins WHERE admin_id = $admin_id AND status != 'active'";
        $result = mysqli_query($conn, $query);
        $user = mysqli_fetch_assoc($result);

        if ($user) {
            $fullname = $user['fullname'];
            $email = $user['email'];
            $role = $user['role'];

            // Generate a fresh 24-hour token
            $reset_token = bin2hex(random_bytes(32));
            $reset_expiry = date('Y-m-d H:i:s', strtotime('+24 hours'));
            
            // Apply new token to database
            $updQuery = "UPDATE admins SET reset_token = '$reset_token', reset_expiry = '$reset_expiry', status = 'inactive' WHERE admin_id = $admin_id";
            
            if (mysqli_query($conn, $updQuery)) {
                $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
                $frontUrl = $origin ? rtrim($origin, '/') : 'http://localhost:5173';
                $setup_link = "$frontUrl/setup-password?token=$reset_token";

                $mail = new PHPMailer\PHPMailer\PHPMailer(true);
                try {
                    $mail->isSMTP();
                    $mail->Host       = 'smtp.gmail.com';
                    $mail->SMTPAuth   = true;
                    $mail->Username   = SMTP_USER; 
                    $mail->Password   = SMTP_PASS; 
                    $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
                    $mail->Port       = 465;

                    $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
                    $mail->addAddress($email, $fullname);
                    $mail->isHTML(true);
                    $mail->Subject = 'PB2: Administrator Access Reminder';
                    
                    $mail->Body    = "
                        <div style='font-family: Arial, sans-serif; color: #333; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 550px;'>
                            <h2 style='color: #059669; margin-top: 0;'>Invitation Reminder</h2>
                            <p>Hello <strong>$fullname</strong>,</p>
                            <p>This is a reminder that you have been invited to join the <strong>Barangay Pasong Buaya II System</strong> as a system <strong>$role</strong>.</p>
                            <p>To accept this invitation and create your account password, click the secure link below:</p>
                            <p style='margin: 25px 0;'>
                                <a href='$setup_link' style='display:inline-block; padding:12px 24px; background-color:#059669; color:white; text-decoration:none; border-radius:6px; font-weight:bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);'>
                                    Set Up Your Account
                                </a>
                            </p>
                        </div>";

                    $mail->send();
                    pb2_log_admin_action('admin.account.invite_resend', 'admin', (string)$admin_id,
                        "Resent the invitation to " . $email . " (new 24-hour link; the old link stops working)");
                    echo json_encode(['status' => 'success', 'message' => 'Invitation resent successfully.']);
                } catch (Exception $e) {
                    echo json_encode(['status' => 'error', 'message' => 'Token updated, but email failed.']);
                }
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Database update error.']);
            }
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Cannot resend: User not found or is already active.']);
        }
        exit;
    }

    // --- SEND A PASSWORD RESET LINK ---
    // Super Admins never see or choose another admin's password (standard
    // practice): they send a single-use link to the admin's own email, and the
    // admin picks the new password. Never to an email another admin set that
    // its owner hasn't confirmed (migration 029), so changing someone's email
    // can't be used to take over their account.
    if ($action === 'send_reset') {
        require_once __DIR__ . '/mailer.php';
        $admin_id = (int)($data['admin_id'] ?? 0);
        $st = $conn->prepare("SELECT admin_id, username, fullname, email, status, email_verified_at, email_changed_by, reset_expiry FROM admins WHERE admin_id = ?");
        $st->bind_param('i', $admin_id);
        $st->execute();
        $target = $st->get_result()->fetch_assoc();
        $st->close();
        $fail = function (string $msg) {
            echo json_encode(['status' => 'error', 'message' => $msg]);
            exit;
        };
        if (!$target) $fail('Admin not found. Reload the page and try again.');
        if ($target['status'] !== 'active') $fail("This admin hasn't activated the account yet. Use Resend invite instead.");
        if (!filter_var((string)$target['email'], FILTER_VALIDATE_EMAIL)) $fail('This admin has no valid email address. Correct it first with Edit.');
        if ($target['email_verified_at'] === null && $target['email_changed_by'] !== null) {
            $fail("This email was changed and its owner hasn't confirmed it yet, so a reset link can't be sent to it. The admin confirms it with a code after signing in, or can reset by SMS from the sign-in page.");
        }
        // One link a minute at most (the link lasts 24 hours).
        if (!empty($target['reset_expiry']) && strtotime($target['reset_expiry']) > strtotime('+24 hours') - 60) {
            $fail('A reset link was just sent. Wait a minute before sending another.');
        }

        $token = bin2hex(random_bytes(32));
        $expiry = date('Y-m-d H:i:s', strtotime('+24 hours'));
        $st = $conn->prepare("UPDATE admins SET reset_token = ?, reset_expiry = ? WHERE admin_id = ?");
        $st->bind_param('ssi', $token, $expiry, $admin_id);
        $st->execute();
        $st->close();

        $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
        $frontUrl = $origin ? rtrim($origin, '/') : 'http://localhost:5173';
        $link = "$frontUrl/admin/reset-password?token=$token";
        $name = htmlspecialchars((string)($target['fullname'] ?: $target['username']), ENT_QUOTES);
        $by = htmlspecialchars((string)($me['username'] ?? 'the Super Admin'), ENT_QUOTES);
        $sent = pb2_send_mail((string)$target['email'], 'PB2 Admin: Set a new password',
            "<div style='font-family: Arial, sans-serif; color: #333; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 550px;'>
                <h2 style='color: #059669; margin-top: 0;'>Set a new password</h2>
                <p>Hello <strong>$name</strong>,</p>
                <p>The Super Admin (<strong>$by</strong>) sent you a link to set a new password for the Barangay Pasong Buaya II admin portal.</p>
                <p style='margin: 25px 0;'><a href='$link' style='display:inline-block; padding:12px 24px; background-color:#059669; color:white; text-decoration:none; border-radius:6px; font-weight:bold;'>Set a New Password</a></p>
                <p style='font-size: 0.85rem; color: #64748b;'>The link works once and expires in 24 hours. Your current password keeps working until you set a new one. Setting it signs you out on every other device. If you didn't expect this, contact the Super Admin.</p>
            </div>");
        if (!$sent) {
            $st = $conn->prepare("UPDATE admins SET reset_token = NULL, reset_expiry = NULL WHERE admin_id = ? AND reset_token = ?");
            $st->bind_param('is', $admin_id, $token);
            $st->execute();
            $fail("The email couldn't be sent, so no link was created. Try again later.");
        }
        pb2_log_admin_action('admin.account.reset_link', 'admin', (string)$admin_id,
            "Sent a password reset link to '{$target['username']}'");
        echo json_encode(['status' => 'success', 'message' => "A reset link was emailed to {$target['email']}. It works once and expires in 24 hours."]);
        exit;
    }

    // --- UPDATE ---
    // Every field is checked before anything is saved, and the answer says
    // what actually happened. Passwords are not set here: see send_reset.
    if ($action === 'update') {
        $admin_id = (int)($data['admin_id'] ?? 0);
        $username = trim((string)($data['username'] ?? ''));
        $fullname = trim(preg_replace('/\s+/', ' ', (string)($data['fullname'] ?? '')));
        $email    = strtolower(trim((string)($data['email'] ?? '')));
        $role     = trim((string)($data['role'] ?? ''));
        $mobile   = preg_replace('/\D/', '', (string)($data['mobile_num'] ?? ''));
        $fail = function (string $msg) {
            echo json_encode(['status' => 'error', 'message' => $msg]);
            exit;
        };
        if (($data['password'] ?? '') !== '') {
            $fail("Passwords can't be set for another admin. Use Reset password to email them a link.");
        }

        // The pre-update row, so the audit log records what actually changed.
        $st = $conn->prepare("SELECT username, fullname, email, mobile_num, role, email_verified_at, mobile_verified_at FROM admins WHERE admin_id = ?");
        $st->bind_param('i', $admin_id);
        $st->execute();
        $oldRow = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$oldRow) $fail('Admin not found. Reload the page and try again.');

        if ($username === '' || $fullname === '' || $email === '') $fail('Username, full name and email are required.');
        // A new username follows the usual rule; an old one is kept as it is.
        if ($username !== $oldRow['username'] && !preg_match('/^[A-Za-z0-9._-]{3,50}$/', $username)) {
            $fail('Username must be 3 to 50 letters, numbers, dots, dashes or underscores, with no spaces.');
        }
        if (mb_strlen($fullname) > 255) $fail('Full name is too long.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) $fail('Enter a valid email address.');
        if ($mobile !== '' && !preg_match('/^09\d{9}$/', $mobile)) $fail('Mobile number must be 11 digits starting with 09.');
        if (!pb2_am_valid_role($role, $oldRow['role'])) $fail('Choose Admin or Super Admin.');
        if ($oldRow['role'] === 'Super' && $role !== 'Super') {
            if ($admin_id === $myId) $fail("You can't remove your own Super Admin role. Ask another Super Admin to do it.");
            if (pb2_am_other_supers($conn, $admin_id) < 1) $fail('This is the only active Super Admin. Make someone else a Super Admin first.');
        }

        // Usernames and emails must stay unique: admins sign in by email.
        $st = $conn->prepare("SELECT username FROM admins WHERE admin_id <> ? AND (username = ? OR LOWER(email) = ?) LIMIT 1");
        $st->bind_param('iss', $admin_id, $username, $email);
        $st->execute();
        $clash = $st->get_result()->fetch_assoc();
        $st->close();
        if ($clash) {
            $fail(strcasecmp($clash['username'], $username) === 0
                ? "The username \"$username\" is already used by another admin."
                : 'That email is already used by another admin.');
        }

        // Keep the old number if none was sent. A changed email or number has
        // to be confirmed again by its owner with a code (admin_contact_verify.php).
        if ($mobile === '') $mobile = (string)$oldRow['mobile_num'];
        $emailChanged  = strcasecmp((string)$oldRow['email'], $email) !== 0;
        $mobileChanged = (string)$oldRow['mobile_num'] !== $mobile;
        $mobileVal = $mobile === '' ? null : $mobile;
        $byOther = $admin_id !== $myId;

        $sql = "UPDATE admins SET username = ?, fullname = ?, email = ?, mobile_num = ?, role = ?, updated_at = NOW()"
             . ($emailChanged ? ', email_verified_at = NULL, email_changed_by = ' . ($byOther ? $myId : 'NULL') : '')
             . ($mobileChanged ? ', mobile_verified_at = NULL' : '')
             . ' WHERE admin_id = ?';
        try {
            $st = $conn->prepare($sql);
            $st->bind_param('sssssi', $username, $fullname, $email, $mobileVal, $role, $admin_id);
            $st->execute();
            $st->close();
        } catch (Throwable $e) {
            error_log('admin_manage.php update: ' . $e->getMessage());
            $fail('The changes could not be saved. Nothing was changed.');
        }

        $changedFields = [];
        $newValues = ['username' => $username, 'fullname' => $fullname, 'email' => $email, 'mobile_num' => $mobile, 'role' => $role];
        foreach ($newValues as $field => $newValue) {
            if ((string)$oldRow[$field] !== (string)$newValue) {
                $changedFields[] = ['field' => $field, 'old_value' => $oldRow[$field], 'new_value' => $newValue];
            }
        }
        if (!$changedFields) {
            echo json_encode(['status' => 'success', 'message' => 'Nothing was changed.']);
            exit;
        }
        pb2_log_admin_action('admin.account.update', 'admin', (string)$admin_id,
            "Updated admin account '{$oldRow['username']}'", $changedFields);

        // Editing your own account: keep this session's name and email current.
        if ($admin_id === $myId) {
            $_SESSION['admin_username'] = $username;
            $_SESSION['admin_email'] = $email;
        }

        // Tell the owner (standard practice for a sign-in detail changed by
        // someone else): the OLD email / number hears about it, so a change
        // they didn't expect can't go unnoticed; the new email is asked to
        // confirm. Best effort: a failed notice doesn't undo the save.
        $noticeNotes = [];
        if ($byOther && ($emailChanged || $mobileChanged)) {
            require_once __DIR__ . '/mailer.php';
            $by = htmlspecialchars((string)($me['username'] ?? 'the Super Admin'), ENT_QUOTES);
            $who = htmlspecialchars($fullname, ENT_QUOTES);
            $when = date('M j, Y g:i A');
            $what = $emailChanged && $mobileChanged ? 'email address and mobile number' : ($emailChanged ? 'email address' : 'mobile number');
            $were = $emailChanged && $mobileChanged ? 'were' : 'was';
            $lines = '';
            if ($emailChanged) $lines .= '<li>Email: ' . htmlspecialchars((string)$oldRow['email'], ENT_QUOTES) . ' &rarr; ' . htmlspecialchars($email, ENT_QUOTES) . '</li>';
            if ($mobileChanged) $lines .= '<li>Mobile: ' . htmlspecialchars(pb2_am_mask((string)$oldRow['mobile_num']), ENT_QUOTES) . ' &rarr; ' . htmlspecialchars(pb2_am_mask($mobile), ENT_QUOTES) . '</li>';
            $notice = "<div style='font-family: Arial, sans-serif; color: #333; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 550px;'>
                <h2 style='color: #b45309; margin-top: 0;'>Your admin $what $were changed</h2>
                <p>Hello <strong>$who</strong>,</p>
                <p>The Super Admin (<strong>$by</strong>) changed the $what on your Barangay Pasong Buaya II admin account on $when:</p>
                <ul>$lines</ul>
                <p>If you didn't expect this, contact the Super Admin or the barangay office right away.</p>
            </div>";
            $oldEmail = (string)$oldRow['email'];
            if (filter_var($oldEmail, FILTER_VALIDATE_EMAIL)) {
                pb2_send_mail($oldEmail, "PB2 Admin: your $what $were changed", $notice);
            }
            if ($emailChanged) {
                pb2_send_mail($email, 'PB2 Admin: confirm your new email',
                    "<div style='font-family: Arial, sans-serif; color: #333; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 550px;'>
                        <h2 style='color: #059669; margin-top: 0;'>Confirm your new email</h2>
                        <p>Hello <strong>$who</strong>,</p>
                        <p>This address is now the email of your Barangay Pasong Buaya II admin account (changed by <strong>$by</strong>). Sign in to the admin portal and confirm it with the code we'll send you. Password reset links are only sent here once it's confirmed.</p>
                        <p>If this isn't your account, ignore this email.</p>
                    </div>");
            }
            // A text to the old number, only if it was confirmed (never to a
            // number nobody proved they own).
            if ($mobileChanged && $oldRow['mobile_verified_at'] !== null && $oldRow['mobile_num'] !== '') {
                require_once __DIR__ . '/sms.php';
                pb2_send_sms($conn, (string)$oldRow['mobile_num'],
                    "PB2 Admin: the mobile number on your admin account was changed by $by on $when. If you didn't expect this, contact the Super Admin.",
                    'admin_contact_notice');
            }
            $noticeNotes[] = 'A notice went to their old contact details.';
        }

        $notes = [];
        if (!$byOther && ($emailChanged || $mobileChanged)) $notes[] = 'Confirm the new ' . ($emailChanged && $mobileChanged ? 'email and number' : ($emailChanged ? 'email' : 'number')) . ' with a code from the banner at the top of the page.';
        elseif ($emailChanged && $mobileChanged) $notes[] = 'The new email and mobile number must be confirmed by the admin with a code.';
        elseif ($emailChanged) $notes[] = 'The new email must be confirmed by the admin with a code. Reset links only go to a confirmed email.';
        elseif ($mobileChanged) $notes[] = 'The new mobile number must be confirmed by the admin with a code.';
        $notes = array_merge($notes, $noticeNotes);
        if ($role !== $oldRow['role']) $notes[] = 'Their role changed, so they are signed out and must sign in again.';
        echo json_encode([
            'status' => 'success',
            'message' => trim('Account updated. ' . implode(' ', $notes)),
            'self' => $admin_id === $myId,
            'admin' => ['admin_id' => $admin_id, 'username' => $username, 'fullname' => $fullname, 'email' => $email, 'role' => $role],
        ]);
        exit;
    }

    // --- DELETE ---
    if ($action === 'delete') {
        $admin_id = (int)$data['admin_id'];

        // Snapshot the full row before it disappears — this is the one case
        // where a full-row capture (not a diff) is correct.
        $oldResult = mysqli_query($conn, "SELECT username, fullname, email, role, status FROM admins WHERE admin_id = $admin_id");
        $oldRow = $oldResult ? mysqli_fetch_assoc($oldResult) : null;
        if (!$oldRow) {
            echo json_encode(['status' => 'error', 'message' => 'Admin not found.']);
            exit;
        }
        if ($admin_id === $myId) {
            echo json_encode(['status' => 'error', 'message' => "You can't delete your own account."]);
            exit;
        }
        if ($oldRow['role'] === 'Super' && pb2_am_other_supers($conn, $admin_id) < 1) {
            echo json_encode(['status' => 'error', 'message' => 'This is the only active Super Admin. Make someone else a Super Admin first.']);
            exit;
        }

        if (mysqli_query($conn, "DELETE FROM admins WHERE admin_id = $admin_id") && $oldRow) {
            $changedFields = [];
            foreach ($oldRow as $field => $value) {
                $changedFields[] = ['field' => $field, 'old_value' => $value, 'new_value' => null];
            }
            pb2_log_admin_action(
                'admin.account.delete',
                'admin',
                (string)$admin_id,
                "Deleted admin account '{$oldRow['username']}'",
                $changedFields
            );
        }

        echo json_encode(['status' => 'success', 'message' => 'Admin deleted.']);
        exit;
    }
}
?>