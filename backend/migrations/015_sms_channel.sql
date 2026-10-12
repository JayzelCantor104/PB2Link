-- 015_sms_channel.sql
--
-- SMS as a second contact channel next to email (PhilSMS, backend/api/sms.php).
--
--   sms_log              one row per text sent (or refused): who it was for,
--                        why (purpose), and what the provider said. The
--                        number is stored masked; the message body is never
--                        stored, because codes travel in it.
--   sms_usage            texts counted per calendar month for SMS_MONTHLY_CAP
--                        (same pattern as ocr_vision_usage). Disaster
--                        broadcasts are counted but never blocked by the cap.
--   contact_verifications  6-digit codes sent by email or SMS outside Edit
--                        Profile (backend/api/verification_common.php):
--                          register              SMS code for the mobile number
--                                                at registration (key = email)
--                          admin_setup           email + SMS codes when an
--                                                invited admin activates the
--                                                account (key = admin_id)
--                          admin_contact         email + SMS codes when a signed-in
--                                                admin verifies their contacts
--                          password_reset        resident reset by SMS (key = user_id)
--                          admin_password_reset  admin reset by SMS (key = admin_id)
--                        Stored only as password_hash(); 10-minute life,
--                        5 wrong tries lock it, 60 s between sends.
--   profile_otp_challenges.channel   Edit Profile codes can now go by SMS.
--   residents.notify_channel   where status updates go: email, sms or both.
--                        Document-request updates always go by both.
--   residents.mobile_verified_at   set when an SMS code to contact_num is entered.
--   admins.mobile_num, email_verified_at, mobile_verified_at
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/015_sms_channel.sql
-- (PowerShell: Get-Content backend/migrations/015_sms_channel.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `sms_log` (
  `sms_id`        INT(11) NOT NULL AUTO_INCREMENT,
  `purpose`       VARCHAR(40) NOT NULL,
  `recipient`     VARCHAR(20) NOT NULL,
  `recipient_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `user_id`       BIGINT(20) DEFAULT NULL,
  `admin_id`      INT(11) DEFAULT NULL,
  `status`        ENUM('sent','failed','capped','skipped') NOT NULL,
  `detail`        VARCHAR(255) DEFAULT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sms_id`),
  KEY `idx_sms_recipient` (`recipient`, `created_at`),
  KEY `idx_sms_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `sms_usage` (
  `usage_month`   CHAR(7) NOT NULL,
  `sms_count`     INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`usage_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `contact_verifications` (
  `verification_id` INT(11) NOT NULL AUTO_INCREMENT,
  `purpose`       VARCHAR(30) NOT NULL,
  `subject_key`   VARCHAR(255) NOT NULL,
  `channel`       ENUM('email','sms') NOT NULL,
  `destination`   VARCHAR(255) NOT NULL,
  `otp_hash`      VARCHAR(255) NOT NULL,
  `attempts`      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `expires_at`    DATETIME NOT NULL,
  `last_sent_at`  DATETIME NOT NULL,
  `verified_at`   DATETIME DEFAULT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`verification_id`),
  UNIQUE KEY `uniq_cv` (`purpose`, `subject_key`, `channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `profile_otp_challenges`
  ADD COLUMN IF NOT EXISTS `channel` ENUM('email','sms') NOT NULL DEFAULT 'email' AFTER `purpose`;

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `notify_channel` ENUM('email','sms','both') NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS `mobile_verified_at` DATETIME DEFAULT NULL;

ALTER TABLE `admins`
  ADD COLUMN IF NOT EXISTS `mobile_num` VARCHAR(15) DEFAULT NULL AFTER `email`,
  ADD COLUMN IF NOT EXISTS `email_verified_at` DATETIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `mobile_verified_at` DATETIME DEFAULT NULL;

-- Registration's email code (send_otp.php / email_verification_otp.php) now has
-- a try limit and remembers when it was entered: the resident verifies the
-- email first, then the mobile number, and register.php accepts an email code
-- that was confirmed within the last 30 minutes even if its 10 minutes ran out
-- during the SMS step.
ALTER TABLE `email_verifications`
  ADD COLUMN IF NOT EXISTS `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `verified_at` DATETIME DEFAULT NULL;
