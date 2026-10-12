-- 017_auto_approval.sql
--
-- Automatic account approval (backend/api/account_approval.php, called by
-- register.php). A new registration becomes Active immediately when every
-- server-side check passes; otherwise it stays Pending for staff, with the
-- reasons recorded.
--
--   system_settings              key/value settings changed by Super Admins
--     auto_approve_accounts      '1' (default) = approve when checks pass,
--                                '0' = every registration waits for staff
--
--   residents.approval_method    'auto'   = approved by the checks at registration
--                                'manual' = approved by a staff member
--                                NULL     = not approved (yet), or predates this
--   residents.review_reasons     JSON array of why the registration went to
--                                staff (shown on Pending Users); NULL when none
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/017_auto_approval.sql
-- (PowerShell: Get-Content backend/migrations/017_auto_approval.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key`   VARCHAR(64) NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `updated_by`    INT(11) DEFAULT NULL,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('auto_approve_accounts', '1');

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `approval_method` ENUM('auto','manual') DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `review_reasons` TEXT DEFAULT NULL;

-- Accounts that were already Active were approved by staff.
UPDATE `residents` SET `approval_method` = 'manual' WHERE `status` = 'Active' AND `approval_method` IS NULL;
