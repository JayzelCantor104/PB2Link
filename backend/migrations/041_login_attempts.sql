-- 041: Limit on failed sign-in attempts (backend/api/login_throttle.php).
-- One row per failed password, for residents (login.php) and admins
-- (admin_login.php). Rows are removed after a successful sign-in and once
-- they are a day old. Never stores the password that was tried.
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope ENUM('resident','admin') NOT NULL,
  email_key VARCHAR(255) NOT NULL,      -- the email that was typed, trimmed and lowercased
  ip VARCHAR(45) NOT NULL,
  attempted_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_login_attempts_email (scope, email_key, attempted_at),
  KEY idx_login_attempts_ip (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
