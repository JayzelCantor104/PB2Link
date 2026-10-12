-- 019_community_issue_map.sql
--
-- Barangay Community Issue Map (rules in backend/api/issue_map_common.php).
--
-- Residents pin a community problem inside Pasong Buaya II. Other residents
-- add their own report to the same pin, which works as a vote; the flag's
-- colour follows the number of reports (thresholds in system_settings).
-- Anyone may see the flags, counts, status and staff updates; comments need
-- a login and are shown without names. Only staff see who reported.
--
--   community_issues         one pin. report_count is kept in step with the
--                            visible (not withdrawn) reports.
--   community_issue_reports  one per resident per issue (the vote) with a
--                            required comment and an optional photo. Staff can
--                            hide a comment (the vote still counts).
--   community_issue_updates  status timeline; the remark is public, the staff
--                            member is shown to residents only as "Barangay staff".
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/019_community_issue_map.sql
-- (PowerShell: Get-Content backend/migrations/019_community_issue_map.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `community_issues` (
  `issue_id`          INT(11) NOT NULL AUTO_INCREMENT,
  `category`          ENUM('streetlight','illegal_dumping','road_damage','flooding','stray_animals','noise','fire_hazard','water') NOT NULL,
  `latitude`          DECIMAL(10,7) NOT NULL,
  `longitude`         DECIMAL(10,7) NOT NULL,
  `landmark`          VARCHAR(150) DEFAULT NULL,
  `status`            ENUM('Reported','Acknowledged','In Progress','Resolved','Rejected','Merged') NOT NULL DEFAULT 'Reported',
  `report_count`      INT(11) NOT NULL DEFAULT 0,
  `created_by`        INT(11) DEFAULT NULL,
  `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_reported_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status_updated_at` DATETIME DEFAULT NULL,
  `merged_into`       INT(11) DEFAULT NULL,
  PRIMARY KEY (`issue_id`),
  KEY `idx_ci_status` (`status`, `status_updated_at`),
  KEY `idx_ci_category` (`category`, `status`),
  CONSTRAINT `fk_ci_creator` FOREIGN KEY (`created_by`) REFERENCES `residents` (`resident_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ci_merged` FOREIGN KEY (`merged_into`) REFERENCES `community_issues` (`issue_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `community_issue_reports` (
  `report_id`     INT(11) NOT NULL AUTO_INCREMENT,
  `issue_id`      INT(11) NOT NULL,
  `resident_id`   INT(11) NOT NULL,
  `comment`       TEXT NOT NULL,
  `photo_path`    VARCHAR(255) DEFAULT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `hidden_at`     DATETIME DEFAULT NULL,
  `hidden_by`     INT(11) DEFAULT NULL,
  `hidden_reason` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `uniq_issue_resident` (`issue_id`, `resident_id`),
  KEY `idx_cir_resident` (`resident_id`, `created_at`),
  CONSTRAINT `fk_cir_issue` FOREIGN KEY (`issue_id`) REFERENCES `community_issues` (`issue_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cir_resident` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`resident_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cir_hider` FOREIGN KEY (`hidden_by`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `community_issue_updates` (
  `update_id`  INT(11) NOT NULL AUTO_INCREMENT,
  `issue_id`   INT(11) NOT NULL,
  `admin_id`   INT(11) DEFAULT NULL,
  `old_status` VARCHAR(20) DEFAULT NULL,
  `new_status` VARCHAR(20) NOT NULL,
  `remarks`    TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`update_id`),
  KEY `idx_ciu_issue` (`issue_id`, `created_at`),
  CONSTRAINT `fk_ciu_issue` FOREIGN KEY (`issue_id`) REFERENCES `community_issues` (`issue_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ciu_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Flag colour thresholds: the minimum report count for orange, red and purple
-- (1 report = yellow). Edited by Super Admins on Manage Admins.
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('issue_flag_tiers', '2,5,10');
