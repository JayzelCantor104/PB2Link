<?php
/**
 * Shared session bootstrap and authorization guards.
 */

if (!function_exists('pb2_session_start')) {
    function pb2_session_start() {
        if (session_status() === PHP_SESSION_NONE) {
            session_set_cookie_params([
                'lifetime' => 86400,
                'path'     => '/',
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
            session_start();
        }
    }
}

if (!function_exists('pb2_deny')) {
    function pb2_deny($status, $message) {
        http_response_code($status);
        if (!headers_sent()) {
            header('Content-Type: application/json');
        }
        echo json_encode([
            'success'    => false,
            'message'    => $message,
            'auth_error' => true
        ]);
        exit;
    }
}

if (!function_exists('pb2_user_session_still_valid')) {
    function pb2_user_session_still_valid($user_id, $session_role) {
        $dbPath = __DIR__ . '/../db_connection.php';
        if (!file_exists($dbPath)) {
            $dbPath = __DIR__ . '/db_connection.php';
        }
        if (!file_exists($dbPath)) {
            return true; // Fallback if db path is unresolvable
        }
        require_once $dbPath;

        global $conn;
        if (!$conn || $conn->connect_error) {
            return true; // Fallback if connection drops momentarily
        }

        $stmt = $conn->prepare("SELECT role FROM users WHERE user_id = ? LIMIT 1");
        if (!$stmt) {
            return true;
        }

        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result ? $result->fetch_assoc() : null;
        $stmt->close();

        // If user doesn't exist at all, invalidate session
        if (!$row) {
            return false;
        }

        // Case-insensitive role comparison
        return strtolower($row['role']) === strtolower($session_role);
    }
}

if (!function_exists('pb2_current_user')) {
    function pb2_current_user() {
        pb2_session_start();

        if (empty($_SESSION['user_id']) || empty($_SESSION['role'])) {
            return null;
        }

        if (!pb2_user_session_still_valid((int)$_SESSION['user_id'], $_SESSION['role'])) {
            unset($_SESSION['user_id'], $_SESSION['role'], $_SESSION['email']);
            return null;
        }

        return [
            'user_id' => $_SESSION['user_id'],
            'email'   => $_SESSION['email'] ?? '',
            'role'    => $_SESSION['role']
        ];
    }
}

if (!function_exists('pb2_require_admin')) {
    function pb2_require_admin() {
        $user = pb2_current_user();

        if ($user === null) {
            pb2_deny(401, 'Not authenticated. Please sign in as an administrator.');
        }

        $adminRoles = ['super', 'admin', 'staff'];
        if (!in_array(strtolower($user['role']), $adminRoles)) {
            pb2_deny(403, 'Forbidden: Administrative privileges required.');
        }

        return $user;
    }
}

if (!function_exists('pb2_require_super_admin')) {
    function pb2_require_super_admin() {
        $user = pb2_require_admin();
        if (strtolower($user['role']) !== 'super') {
            pb2_deny(403, 'This action requires Super Administrator privileges.');
        }
        return $user;
    }
}
?>