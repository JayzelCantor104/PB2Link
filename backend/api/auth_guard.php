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
    unset($_SESSION['user_id'], $_SESSION['role']);
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
