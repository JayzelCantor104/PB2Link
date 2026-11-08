<?php
// Limit on failed sign-in attempts (migration 041), shared by login.php
// (residents) and admin_login.php (admins).
//
// - Per account: 5 wrong passwords for the same email, each within 15 minutes
//   of the first, pause that email for 15 minutes from the 5th. A successful
//   sign-in clears the count. Forgot password keeps working meanwhile.
// - Per connection: 20 failures from one IP address in 15 minutes, across any
//   emails, pause sign-in from that address (stops one password being tried
//   on many accounts).
// - The pause is never permanent, so nobody can lock a resident out for good
//   by typing their email. It applies whether or not the email is registered,
//   so the answer never reveals which emails exist.
// - Time comes from PHP's clock on both sides (stored and compared), so a
//   different MySQL time zone can't shift the window.

const PB2_LOGIN_MAX_FAILS   = 5;
const PB2_LOGIN_WINDOW_SECS = 900;   // 15 minutes
const PB2_LOGIN_IP_MAX      = 20;
const PB2_LOGIN_WARN_AT     = 2;     // say how many tries are left once this few remain

function pb2_login_email_key(string $email): string
{
    return mb_strtolower(trim($email), 'UTF-8');
}

function pb2_login_ip(): string
{
    // REMOTE_ADDR only: X-Forwarded-For is typed by the caller and would let
    // anyone pick a fresh "address" for every try.
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 45);
}

/** Times (unix) of the newest $limit failures matching the WHERE clause, newest first. */
function pb2_login_recent(mysqli $conn, string $where, string $types, array $params, int $limit): array
{
    $since = date('Y-m-d H:i:s', time() - 2 * PB2_LOGIN_WINDOW_SECS);
    $sql = "SELECT attempted_at FROM login_attempts WHERE $where AND attempted_at >= ? ORDER BY attempted_at DESC, id DESC LIMIT $limit";
    $stmt = $conn->prepare($sql);
    if (!$stmt) return [];
    $types .= 's';
    $params[] = $since;
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();
    $out = [];
    while ($r = $res->fetch_assoc()) $out[] = strtotime($r['attempted_at']);
    $stmt->close();
    return $out;
}

/**
 * Seconds left in a pause, or 0. $times are newest first; a pause starts at
 * the $max-th newest failure when all $max happened within the window.
 */
function pb2_login_pause_left(array $times, int $max): int
{
    if (count($times) < $max) return 0;
    $newest = $times[0];
    $oldest = $times[$max - 1];
    if ($newest - $oldest > PB2_LOGIN_WINDOW_SECS) return 0;
    return max(0, $newest + PB2_LOGIN_WINDOW_SECS - time());
}

function pb2_login_wait_text(int $seconds): string
{
    $min = max(1, (int)ceil($seconds / 60));
    return $min === 1 ? '1 minute' : "$min minutes";
}

/**
 * Call before checking the password. Returns null when sign-in may go ahead,
 * or ['message', 'retry_after'] when it is paused.
 */
function pb2_login_check(mysqli $conn, string $scope, string $email): ?array
{
    try {
        // Housekeeping: rows older than a day are never needed.
        $conn->query("DELETE FROM login_attempts WHERE attempted_at < '" . date('Y-m-d H:i:s', time() - 86400) . "'");

        $key = pb2_login_email_key($email);
        $left = pb2_login_pause_left(
            pb2_login_recent($conn, 'scope = ? AND email_key = ?', 'ss', [$scope, $key], PB2_LOGIN_MAX_FAILS),
            PB2_LOGIN_MAX_FAILS
        );
        $byIp = pb2_login_pause_left(
            pb2_login_recent($conn, 'ip = ?', 's', [pb2_login_ip()], PB2_LOGIN_IP_MAX),
            PB2_LOGIN_IP_MAX
        );
        $wait = max($left, $byIp);
        if ($wait <= 0) return null;

        $forgot = $scope === 'admin' ? 'Forgot Password' : 'Forgot password';
        return [
            'message' => 'Too many incorrect sign-in attempts. Please wait ' . pb2_login_wait_text($wait)
                . " and try again, or use $forgot to set a new password.",
            'retry_after' => $wait,
            'reason' => $left >= $byIp ? 'account' : 'network',
        ];
    } catch (Throwable $e) {
        error_log("pb2_login_check: " . $e->getMessage() . " (is migration 041 applied?)");
        return null;
    }
}

/**
 * Call after a wrong password (or an unknown email). Records it and returns
 * ['tries_left' => int, 'locked' => bool, 'message' => string] for the reply.
 */
function pb2_login_record_failure(mysqli $conn, string $scope, string $email, string $baseMessage): array
{
    try {
        $key = pb2_login_email_key($email);
        $ip = pb2_login_ip();
        $now = date('Y-m-d H:i:s');
        $stmt = $conn->prepare('INSERT INTO login_attempts (scope, email_key, ip, attempted_at) VALUES (?, ?, ?, ?)');
        if ($stmt) {
            $stmt->bind_param('ssss', $scope, $key, $ip, $now);
            $stmt->execute();
            $stmt->close();
        }

        // Failures in a row for this email: count back while each is within the
        // window of the newest one (the same rule pb2_login_pause_left uses).
        $times = pb2_login_recent($conn, 'scope = ? AND email_key = ?', 'ss', [$scope, $key], PB2_LOGIN_MAX_FAILS);
        $streak = 0;
        foreach ($times as $t) {
            if ($times[0] - $t > PB2_LOGIN_WINDOW_SECS) break;
            $streak++;
        }
        $left = PB2_LOGIN_MAX_FAILS - $streak;

        if ($left <= 0) {
            return [
                'tries_left' => 0,
                'locked' => true,
                'message' => rtrim($baseMessage, '.') . '. Too many incorrect attempts: please wait 15 minutes and try again, or use '
                    . ($scope === 'admin' ? 'Forgot Password' : 'Forgot password') . ' to set a new password.',
            ];
        }
        $message = $baseMessage;
        if ($left <= PB2_LOGIN_WARN_AT) {
            $message = rtrim($baseMessage, '.') . '. ' . ($left === 1 ? '1 attempt' : "$left attempts")
                . ' left before a 15-minute wait.';
        }
        return ['tries_left' => $left, 'locked' => false, 'message' => $message];
    } catch (Throwable $e) {
        error_log("pb2_login_record_failure: " . $e->getMessage());
        return ['tries_left' => PB2_LOGIN_MAX_FAILS, 'locked' => false, 'message' => $baseMessage];
    }
}

/** Call after a successful sign-in: the count for that email starts over. */
function pb2_login_clear(mysqli $conn, string $scope, string $email): void
{
    try {
        $key = pb2_login_email_key($email);
        $stmt = $conn->prepare('DELETE FROM login_attempts WHERE scope = ? AND email_key = ?');
        if ($stmt) {
            $stmt->bind_param('ss', $scope, $key);
            $stmt->execute();
            $stmt->close();
        }
    } catch (Throwable $e) {
        error_log("pb2_login_clear: " . $e->getMessage());
    }
}
