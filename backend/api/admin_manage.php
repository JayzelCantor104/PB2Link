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

// HANDLE GET: Fetch Admins for React Table
if ($method === 'GET') {
    $search = trim($_GET['search'] ?? '');
    $where = "1";
    
    if ($search !== '') {
        $s = mysqli_real_escape_string($conn, $search);
        $where .= " AND (username LIKE '%$s%' OR fullname LIKE '%$s%' OR email LIKE '%$s%')";
    }

    $sql = "SELECT admin_id, username, fullname, email, mobile_num, email_verified_at, mobile_verified_at, role, position, permission_overrides, status, last_login, created_at FROM admins WHERE $where ORDER BY created_at DESC";
    $result = mysqli_query($conn, $sql);
    $admins = mysqli_fetch_all($result, MYSQLI_ASSOC);

    // Position + permission overrides (migration 020, admin_permissions.php).
    require_once __DIR__ . '/admin_permissions.php';
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
        require_once __DIR__ . '/admin_permissions.php';
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
        $fullname = mysqli_real_escape_string($conn, pb2_caps(trim($data['fullname'])));
        $email    = mysqli_real_escape_string($conn, trim($data['email']));
        $role     = mysqli_real_escape_string($conn, trim($data['role'] ?? 'Admin'));
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

        $checkQuery = "SELECT admin_id FROM admins WHERE username = '$username' OR email = '$email'";
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

    // --- UPDATE ---
    if ($action === 'update') {
        $admin_id = (int)$data['admin_id'];
        $username = mysqli_real_escape_string($conn, $data['username']);
        $fullname = mysqli_real_escape_string($conn, pb2_caps(trim($data['fullname'])));
        $email    = mysqli_real_escape_string($conn, $data['email']);
        $role     = mysqli_real_escape_string($conn, $data['role']);
        $password = $data['password'] ?? '';
        $mobile   = preg_replace('/\D/', '', (string)($data['mobile_num'] ?? ''));

        if ($mobile !== '' && !preg_match('/^09\d{9}$/', $mobile)) {
            echo json_encode(['status' => 'error', 'message' => 'Mobile number must be 11 digits starting with 09.']);
            exit;
        }

        // Fetch the pre-update row so the audit log can record what actually
        // changed, not just what was submitted.
        $oldResult = mysqli_query($conn, "SELECT username, fullname, email, mobile_num, role FROM admins WHERE admin_id = $admin_id");
        $oldRow = $oldResult ? mysqli_fetch_assoc($oldResult) : null;

        // A changed email or mobile number has to be verified again by its owner
        // (admin_contact_verify.php); keep the old number if none was sent.
        if ($mobile === '' && $oldRow) $mobile = (string)$oldRow['mobile_num'];
        $reverify = '';
        if ($oldRow && strcasecmp((string)$oldRow['email'], $email) !== 0) $reverify .= ', email_verified_at = NULL';
        if ($oldRow && (string)$oldRow['mobile_num'] !== $mobile) $reverify .= ', mobile_verified_at = NULL';
        $mobileSql = $mobile === '' ? 'NULL' : "'$mobile'";

        if (!empty($password)) {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $query = "UPDATE admins SET username='$username', fullname='$fullname', email='$email', mobile_num=$mobileSql, role='$role', password_hash='$hash', updated_at=NOW()$reverify WHERE admin_id=$admin_id";
        } else {
            $query = "UPDATE admins SET username='$username', fullname='$fullname', email='$email', mobile_num=$mobileSql, role='$role', updated_at=NOW()$reverify WHERE admin_id=$admin_id";
        }

        if (mysqli_query($conn, $query) && $oldRow) {
            $changedFields = [];
            $newValues = ['username' => $username, 'fullname' => $fullname, 'email' => $email, 'mobile_num' => $mobile, 'role' => $role];
            foreach ($newValues as $field => $newValue) {
                if ((string)$oldRow[$field] !== (string)$newValue) {
                    $changedFields[] = ['field' => $field, 'old_value' => $oldRow[$field], 'new_value' => $newValue];
                }
            }
            // Never log the password hash itself — only whether it changed.
            if (!empty($password)) {
                $changedFields[] = ['field' => 'password', 'old_value' => null, 'new_value' => 'changed'];
            }

            pb2_log_admin_action(
                'admin.account.update',
                'admin',
                (string)$admin_id,
                "Updated admin account '{$oldRow['username']}'",
                $changedFields
            );
        }

        echo json_encode(['status' => 'success', 'message' => 'Account updated.']);
        exit;
    }

    // --- DELETE ---
    if ($action === 'delete') {
        $admin_id = (int)$data['admin_id'];

        // Snapshot the full row before it disappears — this is the one case
        // where a full-row capture (not a diff) is correct.
        $oldResult = mysqli_query($conn, "SELECT username, fullname, email, role, status FROM admins WHERE admin_id = $admin_id");
        $oldRow = $oldResult ? mysqli_fetch_assoc($oldResult) : null;

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