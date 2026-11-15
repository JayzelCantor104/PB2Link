-- 052_two_factor_sign_in.sql
--
-- Two-step sign-in (rules in backend/api/two_factor.php, code step in
-- login_2fa.php).
--
--  * Staff: after the password, a 6-digit code by email or SMS (a verified
--    mobile number) is required, while system_settings.admin_two_factor is
--    'on' (default; a Super Admin can turn it off on Manage Admins).
--  * Residents: optional (Edit Profile). residents.two_factor_enabled turns it
--    on; two_factor_channel is the default way to receive the code ('email',
--    or 'sms' for a confirmed mobile number). The other way can be chosen at
--    sign-in when both exist.
--  * trusted_devices: "Don't ask again on this device for 30 days". The browser
--    keeps a random token in an httponly cookie; only its SHA-256 is stored.
--    A password reset forgets every device of that account.
--
-- Additive and safe to re-run:
--     Get-Content backend/migrations/052_two_factor_sign_in.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `two_factor_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `two_factor_channel` ENUM('email','sms') NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `trusted_devices` (
  `device_id`    INT(11) NOT NULL AUTO_INCREMENT,
  `tier`         ENUM('resident','admin') NOT NULL,
  `subject_id`   VARCHAR(30) NOT NULL,
  `token_hash`   CHAR(64) NOT NULL,
  `label`        VARCHAR(120) DEFAULT NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` DATETIME DEFAULT NULL,
  `expires_at`   DATETIME NOT NULL,
  PRIMARY KEY (`device_id`),
  UNIQUE KEY `uq_td_token` (`token_hash`),
  KEY `idx_td_subject` (`tier`, `subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('admin_two_factor', 'on');
