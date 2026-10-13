-- 020_request_payments.sql
--
-- Fees and payments for document requests (rules in backend/api/payment_common.php).
--
--   request_fees           one fee per request type ('clearance', 'residency',
--                          'barangay_id', 'business_clearance', 'indigency') or
--                          custom service ('service:<id>'), set from the
--                          barangay's revenue ordinance. 0 = free. The waive_*
--                          flags say which exemptions apply to that fee.
--   request_payments       one per request that has a fee. The amount is copied
--                          from request_fees when the request is filed, so a
--                          later fee change doesn't alter it. The receipt
--                          screenshot is only proof of transfer: staff with the
--                          'payments.verify' permission match the reference
--                          number against the barangay's e-wallet history, then
--                          record the Official Receipt (O.R.) number.
--   request_payment_events every upload / verification / rejection, for the
--                          audit trail and the resident's history.
--   admins.position        barangay position (Barangay Treasurer, Secretary...).
--                          Positions get default permissions
--                          (system_settings 'position_permissions');
--   admins.permission_overrides  per-admin allow/deny on top of that (JSON).
--   residents.ftj_availed_at  First-Time Jobseekers Act (RA 11261): the free
--                          clearance/certificate is available once.
--
-- Payment settings (QR image, account name/number, pay-at-hall) live in
-- system_settings under 'payment_*' keys.
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/020_request_payments.sql
-- (PowerShell: Get-Content backend/migrations/020_request_payments.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `request_fees` (
  `fee_key`               VARCHAR(40) NOT NULL,
  `amount`                DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `waive_first_jobseeker` TINYINT(1) NOT NULL DEFAULT 0,
  `waive_indigent`        TINYINT(1) NOT NULL DEFAULT 0,
  `waive_senior`          TINYINT(1) NOT NULL DEFAULT 0,
  `waive_pwd`             TINYINT(1) NOT NULL DEFAULT 0,
  `updated_by`            INT(11) DEFAULT NULL,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`fee_key`),
  CONSTRAINT `fk_rf_admin` FOREIGN KEY (`updated_by`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Every built-in fee starts at 0 (free) until staff enter the ordinance amounts.
-- RA 11261 covers barangay clearances and certifications.
INSERT IGNORE INTO `request_fees` (`fee_key`, `amount`, `waive_first_jobseeker`, `waive_indigent`) VALUES
  ('clearance', 0, 1, 1),
  ('residency', 0, 1, 1),
  ('indigency', 0, 1, 1),
  ('barangay_id', 0, 0, 1),
  ('business_clearance', 0, 0, 0);

CREATE TABLE IF NOT EXISTS `request_payments` (
  `payment_id`        INT(11) NOT NULL AUTO_INCREMENT,
  `request_type`      VARCHAR(30) NOT NULL,
  `request_id`        INT(11) NOT NULL,
  `tracking_code`     VARCHAR(50) NOT NULL,
  `resident_id`       INT(11) NOT NULL,
  `fee_key`           VARCHAR(40) NOT NULL,
  `amount_due`        DECIMAL(10,2) NOT NULL,
  `method`            ENUM('online','hall','exempt') NOT NULL,
  `status`            ENUM('Unpaid','For Verification','Paid','Rejected','Waived','Refunded') NOT NULL,
  `reference_no`      VARCHAR(40) DEFAULT NULL,
  `amount_paid`       DECIMAL(10,2) DEFAULT NULL,
  `paid_on`           DATE DEFAULT NULL,
  `receipt_path`      VARCHAR(255) DEFAULT NULL,
  `receipt_sha256`    CHAR(64) DEFAULT NULL,
  `exemption`         ENUM('first_time_jobseeker','indigent','senior','pwd') DEFAULT NULL,
  `exemption_proof`   VARCHAR(255) DEFAULT NULL,
  `flags`             TEXT DEFAULT NULL,
  `or_number`         VARCHAR(40) DEFAULT NULL,
  `remarks`           TEXT DEFAULT NULL,
  `verified_by`       INT(11) DEFAULT NULL,
  `verified_at`       DATETIME DEFAULT NULL,
  `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uniq_rp_request` (`request_type`, `request_id`),
  UNIQUE KEY `uniq_rp_reference` (`reference_no`),
  UNIQUE KEY `uniq_rp_or` (`or_number`),
  KEY `idx_rp_status` (`status`, `created_at`),
  KEY `idx_rp_sha` (`receipt_sha256`),
  KEY `idx_rp_verified` (`verified_at`),
  CONSTRAINT `fk_rp_resident` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`resident_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_verifier` FOREIGN KEY (`verified_by`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `request_payment_events` (
  `event_id`    INT(11) NOT NULL AUTO_INCREMENT,
  `payment_id`  INT(11) NOT NULL,
  `action`      VARCHAR(30) NOT NULL,
  `old_status`  VARCHAR(20) DEFAULT NULL,
  `new_status`  VARCHAR(20) DEFAULT NULL,
  `detail`      TEXT DEFAULT NULL,
  `admin_id`    INT(11) DEFAULT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_rpe_payment` (`payment_id`, `created_at`),
  CONSTRAINT `fk_rpe_payment` FOREIGN KEY (`payment_id`) REFERENCES `request_payments` (`payment_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rpe_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `admins`
  ADD COLUMN IF NOT EXISTS `position` VARCHAR(40) DEFAULT NULL AFTER `role`,
  ADD COLUMN IF NOT EXISTS `permission_overrides` TEXT DEFAULT NULL AFTER `position`;

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `ftj_availed_at` DATETIME DEFAULT NULL;

-- Defaults: the Treasurer handles collections and settings; the Secretary may
-- verify. Super Admins always have every permission.
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
  ('position_permissions', '{"Barangay Treasurer":["payments.settings","payments.verify"],"Barangay Secretary":["payments.verify"]}'),
  ('payment_allow_hall', '1'),
  ('payment_channel', 'GCash'),
  ('payment_account_name', ''),
  ('payment_account_number', ''),
  ('payment_qr_path', ''),
  ('payment_instructions', '');
