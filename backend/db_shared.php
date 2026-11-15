<?php
/**
 * One database connection per request, shared by everything that needs it:
 * the sign-in checks in auth_guard.php, the permission checks in
 * admin_permissions.php, and the endpoint itself (db_connection.php).
 *
 * Shared hosting (Hostinger) limits how many connections one database user may
 * have open at the same moment. Switching admin tabs quickly fires several
 * requests at once; when each opened two or three connections, the burst went
 * over the limit, the sign-in check could not reach the database, and the admin
 * was signed out. Now each request opens one, and a refused connection is tried
 * again a few times before giving up.
 */

if (!function_exists('pb2_db')) {
    /** The request's connection, or null when the database can't be reached. */
    function pb2_db(): ?mysqli
    {
        static $conn = null, $tried = false;
        if ($conn instanceof mysqli) return $conn;
        if ($tried) return null; // already failed in this request: don't wait again
        $tried = true;

        $configPath = __DIR__ . '/config.php';
        if (!file_exists($configPath)) return null;
        require_once $configPath;
        mysqli_report(MYSQLI_REPORT_OFF);

        // "Too many connections" (1040), "max_user_connections" (1203) and a
        // busy socket clear within moments, so wait a little and try again.
        $retryable = [1040, 1203, 2002, 2006, 2013];
        $waits = [0, 150000, 400000, 900000]; // microseconds: about 1.5 s in total
        foreach ($waits as $wait) {
            if ($wait) usleep($wait);
            $c = @mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);
            if ($c) {
                // The tables are utf8mb4; without this the connection defaults
                // to latin1 and letters like "ñ" are stored as "?".
                mysqli_set_charset($c, 'utf8mb4');
                return $conn = $c;
            }
            if (!in_array(mysqli_connect_errno(), $retryable, true)) break; // wrong password etc.: don't retry
        }
        error_log('pb2_db: database connection failed (' . mysqli_connect_errno() . '): ' . mysqli_connect_error());
        return null;
    }
}
