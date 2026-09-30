-- 011_profile_otp.sql
--
-- Email verification codes for Edit Profile (backend/api/profile_otp_common.php).
--
-- Birth date, sex, address, emergency contact, email, mobile number and the
-- password are only changed after the resident enters a 6-digit code sent by
-- email. Replaces the old scheme, which kept the code in plain text in
-- pending_profile_changes.otp (generated with rand(), no attempt limit).
--
--   profile_otp_challenges  one row per code sent.
--       purpose       'profile' (held field changes) or 'password'
--       otp_hash      password_hash() of the code — the code itself is never stored
--       sent_to       address the code went to (the NEW address when the
--                     email is being changed, proving the resident owns it)
--       attempts      wrong guesses so far; the code locks at 5
--       expires_at    10 minutes after the code was (re)sent
--       last_sent_at  for the 60-second resend cooldown
--       new_password_hash  for purpose 'password' only: the hash of the new
--                     password waiting for the code (never the plain password)
--       status        pending -> verified | cancelled | locked
--                     (expiry is judged from expires_at)
--
--   pending_profile_changes.challenge_id  links held field changes
--                     (status 'pending_otp') to the code that releases them.
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/011_profile_otp.sql
-- (PowerShell: Get-Content backend/migrations/011_profile_otp.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `profile_otp_challenges` (
  `challenge_id`      INT(11) NOT NULL AUTO_INCREMENT,
  `user_id`           BIGINT(20) NOT NULL,
  `purpose`           ENUM('profile','password') NOT NULL,
  `otp_hash`          VARCHAR(255) NOT NULL,
  `sent_to`           VARCHAR(255) NOT NULL,
  `attempts`          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `expires_at`        DATETIME NOT NULL,
  `last_sent_at`      DATETIME NOT NULL,
  `new_password_hash` VARCHAR(255) DEFAULT NULL,
  `status`            ENUM('pending','verified','cancelled','locked') NOT NULL DEFAULT 'pending',
  `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`challenge_id`),
  KEY `idx_poc_user` (`user_id`, `purpose`, `status`),
  CONSTRAINT `fk_poc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `pending_profile_changes`
  ADD COLUMN IF NOT EXISTS `challenge_id` INT(11) DEFAULT NULL AFTER `submission_batch`,
  ADD KEY IF NOT EXISTS `idx_ppc_challenge` (`challenge_id`);
