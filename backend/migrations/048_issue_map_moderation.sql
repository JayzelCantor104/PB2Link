-- 048_issue_map_moderation.sql
--
-- Community Issue Map safeguards (rules in backend/api/issue_map_common.php
-- and issue_map_screen.php).
--
--  * Posts go live at once. Before posting, the resident agrees to the posting
--    rules, and the text is screened: phone numbers, emails and offensive words
--    are refused; wording that may name a person is held for a staff check.
--    A Super Admin can turn on manual review for everything
--    (system_settings.issue_review_mode = 'all'; default 'off').
--  * community_issue_reports gains:
--      held_at / held_reason     waiting for a staff check (not public, not counted)
--      reviewed_at / reviewed_by staff approved a held report
--      removed_at / removed_by / removed_reason
--                                staff removed it (abuse, or a held report not
--                                posted): not public, not counted, kept for the record
--      staff_seen_at             first opened by staff (the "new" badge)
--      flag_count                residents who reported the comment
--  * community_issue_flags       one per resident per comment; at
--                                PB2_ISSUE_FLAG_AUTOHIDE the comment is hidden
--                                until staff check it.
--  * issue_map_suspensions       a resident blocked from posting on the Issue
--                                Map until ends_at (NULL = until staff lift it).
--
-- Additive only, safe to re-run:
--     Get-Content backend/migrations/048_issue_map_moderation.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims

ALTER TABLE `community_issue_reports`
  ADD COLUMN IF NOT EXISTS `held_at`        DATETIME DEFAULT NULL AFTER `hidden_reason`,
  ADD COLUMN IF NOT EXISTS `held_reason`    VARCHAR(255) DEFAULT NULL AFTER `held_at`,
  ADD COLUMN IF NOT EXISTS `reviewed_at`    DATETIME DEFAULT NULL AFTER `held_reason`,
  ADD COLUMN IF NOT EXISTS `reviewed_by`    INT(11) DEFAULT NULL AFTER `reviewed_at`,
  ADD COLUMN IF NOT EXISTS `removed_at`     DATETIME DEFAULT NULL AFTER `reviewed_by`,
  ADD COLUMN IF NOT EXISTS `removed_by`     INT(11) DEFAULT NULL AFTER `removed_at`,
  ADD COLUMN IF NOT EXISTS `removed_reason` VARCHAR(255) DEFAULT NULL AFTER `removed_by`,
  ADD COLUMN IF NOT EXISTS `staff_seen_at`  DATETIME DEFAULT NULL AFTER `removed_reason`,
  ADD COLUMN IF NOT EXISTS `flag_count`     INT(11) NOT NULL DEFAULT 0 AFTER `staff_seen_at`,
  ADD KEY IF NOT EXISTS `idx_cir_held` (`held_at`),
  ADD KEY IF NOT EXISTS `idx_cir_seen` (`staff_seen_at`);

-- Reports that existed before this change count as already seen by staff.
UPDATE `community_issue_reports` SET `staff_seen_at` = `created_at` WHERE `staff_seen_at` IS NULL;

CREATE TABLE IF NOT EXISTS `community_issue_flags` (
  `flag_id`     INT(11) NOT NULL AUTO_INCREMENT,
  `report_id`   INT(11) NOT NULL,
  `resident_id` INT(11) NOT NULL,
  `reason`      VARCHAR(30) NOT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`flag_id`),
  UNIQUE KEY `uniq_flag` (`report_id`, `resident_id`),
  CONSTRAINT `fk_cif_report` FOREIGN KEY (`report_id`) REFERENCES `community_issue_reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cif_resident` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`resident_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `issue_map_suspensions` (
  `suspension_id` INT(11) NOT NULL AUTO_INCREMENT,
  `resident_id`   INT(11) NOT NULL,
  `report_id`     INT(11) DEFAULT NULL,
  `reason`        VARCHAR(500) NOT NULL,
  `starts_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ends_at`       DATETIME DEFAULT NULL,
  `created_by`    INT(11) DEFAULT NULL,
  `lifted_at`     DATETIME DEFAULT NULL,
  `lifted_by`     INT(11) DEFAULT NULL,
  `lift_reason`   VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`suspension_id`),
  KEY `idx_ims_resident` (`resident_id`, `lifted_at`, `ends_at`),
  CONSTRAINT `fk_ims_resident` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`resident_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ims_report` FOREIGN KEY (`report_id`) REFERENCES `community_issue_reports` (`report_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ims_creator` FOREIGN KEY (`created_by`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ims_lifter` FOREIGN KEY (`lifted_by`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('issue_review_mode', 'off');
