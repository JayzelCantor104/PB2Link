<?php
/**
 * Shared session bootstrap and authorization guards.
 *
 * Usage in an admin endpoint — place AFTER the CORS headers and AFTER the
 * OPTIONS short-circuit, BEFORE any database work:
 *
 *     require_once __DIR__ . '/auth_guard.php';
 *     pb2_require_admin();        // any authenticated admin
 *     pb2_require_super_admin();  // Super role only
 *
 * IMPORTANT — citizen and admin sessions intentionally share one PHP session
 * but use DIFFERENT keys, so a person can be signed in as both in the same
 * browser (the frontend keeps separate localStorage entries for each):
 *
 *     citizen -> $_SESSION['user_id'],  $_SESSION['role'] = 'user'
 *     citizen fixing a registration (restricted mode, migration 027)
 *             -> $_SESSION['fix_user_id'] only, never 'user_id', so no
 *                request endpoint accepts it; only the Edit Profile ones do,
 *                through pb2_resident_session_user(true)
 *     admin   -> $_SESSION['admin_id'], $_SESSION['admin_role']
 *
 * Never write $_SESSION['role'] from the admin flow: it would clobber the
 * citizen session and silently sign the citizen out.
 */

/**
 * Start the session with hardened cookie flags. Safe to call repeatedly.
 */
function pb2_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    // 'secure' is intentionally omitted: local XAMPP serves plain HTTP, and
    // setting it would stop the cookie from being sent at all. Turn it on
    // (add 'secure' => true) when this is deployed behind HTTPS.
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,   // not readable from JavaScript
        'samesite' => 'Lax',  // not sent on cross-site POSTs
    ]);

    session_start();
    pb2_citizen_session_gate();
}

/**
 * A citizen session only lasts while the account allows it: an Active
 * resident keeps full access; an "Action Required" one that staff let fix the
 * registration online is held to restricted mode; anyone else (Pending,
 * Archived, sent to the hall) is signed out. Approving a restricted account
 * upgrades its session. Re-read at most every 30 seconds ($force: now).
 *
 * Opens its own short-lived connection, like pb2_admin_session_still_valid(),
 * because it runs before the endpoint connects.
 */
function pb2_citizen_session_gate(bool $force = false): void
{
    $uid = $_SESSION['user_id'] ?? ($_SESSION['fix_user_id'] ?? null);
    if ($uid === null || $uid === '') return;
    if (!$force && ($_SESSION['citizen_checked_at'] ?? 0) > time() - 30) return;

    $configPath = __DIR__ . '/../config.php';
    if (!file_exists($configPath)) return;
    require_once $configPath;
    $conn = @mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if (!$conn) return; // the endpoint will fail on its own; check again next time
    $stmt = mysqli_prepare($conn, "SELECT status, fix_items, resubmit_count FROM residents WHERE user_id = ? LIMIT 1");
    $uidStr = (string)$uid;
    mysqli_stmt_bind_param($stmt, 's', $uidStr);
    mysqli_stmt_execute($stmt);
    $row = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt)) ?: null;
    mysqli_close($conn);
    $_SESSION['citizen_checked_at'] = time();

    require_once __DIR__ . '/registration_fix_common.php';
    if ($row && strcasecmp($row['status'], 'Active') === 0) {
        if (!isset($_SESSION['user_id'])) {
            session_regenerate_id(true); // more access than before: new session id
            $_SESSION['user_id'] = $uid;
            $_SESSION['role'] = 'user';
            unset($_SESSION['fix_user_id']);
        }
        return;
    }
    if (pb2_fix_mode_open($row)) {
        $_SESSION['fix_user_id'] = $uid;
        unset($_SESSION['user_id'], $_SESSION['role']);
        return;
    }
    unset($_SESSION['user_id'], $_SESSION['role'], $_SESSION['fix_user_id'], $_SESSION['citizen_checked_at']);
}

/**
 * The signed-in resident's user_id, or null. Only endpoints that Edit Profile
 * needs pass $allowRestricted = true, so a restricted session (fixing a
 * registration) can't submit requests or reach anything else.
 */
function pb2_resident_session_user(bool $allowRestricted = false): ?string
{
    pb2_session_start();
    if (!empty($_SESSION['user_id'])) return (string)$_SESSION['user_id'];
    if ($allowRestricted && !empty($_SESSION['fix_user_id'])) return (string)$_SESSION['fix_user_id'];
    return null;
}

/**
 * Emit a JSON error and stop. `auth_error` lets the frontend distinguish an
 * authentication failure from an ordinary application error and force a
 * re-login instead of showing a generic toast.
 */
function pb2_deny(int $status, string $message): void
{
    http_response_code($status);
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    echo json_encode([
        'success'    => false,
        'message'    => $message,
        'auth_error' => true,
    ]);
    exit;
}

/**
 * Record a successful admin authentication into the session.
 * Regenerates the session id to prevent session fixation.
 */
function pb2_admin_login_session(array $admin): void
{
    pb2_session_start();
    session_regenerate_id(true);

    $_SESSION['admin_id']       = $admin['admin_id'];
    $_SESSION['admin_username'] = $admin['username'];
    $_SESSION['admin_email']    = $admin['email'];
    $_SESSION['admin_role']     = $admin['role'];
}

/**
 * Clear ONLY the admin keys, leaving any citizen session intact.
 */
function pb2_admin_logout_session(): void
{
    pb2_session_start();
    unset(
        $_SESSION['admin_id'],
        $_SESSION['admin_username'],
        $_SESSION['admin_email'],
        $_SESSION['admin_role']
    );
}

/**
 * Clear ONLY the citizen keys, leaving any admin session intact.
 *
 * Use this instead of session_destroy() in citizen sign-out paths: destroying
 * the whole session would also sign out an administrator who happens to be
 * signed in on the same browser.
 */
function pb2_citizen_logout_session(): void
{
    pb2_session_start();
    unset($_SESSION['user_id'], $_SESSION['role'], $_SESSION['fix_user_id'], $_SESSION['citizen_checked_at']);
}

/**
 * Re-check the admins table so a deleted account, a deactivated account, or a
 * role change (Super -> Admin, etc.) takes effect on the account's live
 * session immediately, instead of only at next login. $_SESSION['admin_role']
 * is otherwise set once at login (pb2_admin_login_session()) and never
 * refreshed, so without this a demoted/removed admin keeps their old
 * privileges until they happen to log out or the session expires.
 *
 * Opens its own short-lived connection rather than reusing the endpoint's
 * $conn, because this runs from pb2_require_admin() / pb2_current_admin(),
 * which endpoints call BEFORE including db_connection.php.
 */
function pb2_admin_session_still_valid(int $admin_id, string $session_role): bool
{
    $configPath = __DIR__ . '/../config.php';
    if (!file_exists($configPath)) {
        return false;
    }
    require_once $configPath;

    $conn = @mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if (!$conn) {
        // Fail closed: every guarded endpoint needs the database anyway, so
        // refusing to trust an unverifiable session doesn't cost extra
        // availability.
        return false;
    }

    $result = mysqli_query($conn, "SELECT role, status FROM admins WHERE admin_id = $admin_id LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    mysqli_close($conn);

    if (!$row || $row['status'] !== 'active') {
        return false;
    }

    return $row['role'] === $session_role;
}

/**
 * @return array|null The signed-in admin, or null if there is no admin session.
 */
function pb2_current_admin(): ?array
{
    pb2_session_start();

    if (empty($_SESSION['admin_id']) || empty($_SESSION['admin_role'])) {
        return null;
    }

    if (!pb2_admin_session_still_valid((int) $_SESSION['admin_id'], $_SESSION['admin_role'])) {
        pb2_admin_logout_session();
        return null;
    }

    return [
        'admin_id' => $_SESSION['admin_id'],
        'username' => $_SESSION['admin_username'] ?? '',
        'email'    => $_SESSION['admin_email'] ?? '',
        'role'     => $_SESSION['admin_role'],
    ];
}

/**
 * Require any authenticated admin. Exits 401 if absent.
 */
function pb2_require_admin(): array
{
    $admin = pb2_current_admin();
    if ($admin === null) {
        pb2_deny(401, 'Not authenticated. Please sign in as an administrator.');
    }
    return $admin;
}

/**
 * Require the 'Super' role. Exits 401 if not signed in, 403 if not Super.
 */
function pb2_require_super_admin(): array
{
    $admin = pb2_require_admin();
    if ($admin['role'] !== 'Super') {
        pb2_deny(403, 'This action requires Super Administrator privileges.');
    }
    return $admin;
}
