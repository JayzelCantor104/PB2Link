-- 022_hazard_feeds.sql
--
-- Live hazard feeds for Disaster Risk (hazard_feeds_common.php):
--   PAGASA tropical cyclone bulletin, GDACS (UN / European Commission) storms,
--   PHIVOLCS earthquakes (USGS as a backup), and the Open-Meteo model forecast.
-- The server fetches each source on its own timer and keeps the last good copy,
-- so every visitor shares one request and the page still shows data while a
-- source is down.
--
--   hazard_feed_cache   one row per source: last good payload, when it was
--                       fetched, and the last error.
--   hazard_events       something serious a feed detected (Cavite under a wind
--                       signal, a strong quake near Imus, ...). One row per
--                       hazard and severity, so an escalation is a new row.
--                       status: new (waiting for staff) / published / dismissed.
--   disaster_alerts     source + source_ref link an advisory to the feed event
--                       it came from; auto_generated marks ones published
--                       without staff (hazard_alert_mode = 'auto').
--   system_settings     hazard_alert_mode: 'off' | 'draft' (default) | 'auto',
--                       set by the Super Admin on Manage Admins.
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/022_hazard_feeds.sql
-- (PowerShell: Get-Content backend/migrations/022_hazard_feeds.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `hazard_feed_cache` (
  `source` VARCHAR(30) NOT NULL,
  `payload` MEDIUMTEXT NULL,
  `fetched_at` DATETIME NULL,
  `last_success_at` DATETIME NULL,
  `last_error` VARCHAR(255) NULL,
  PRIMARY KEY (`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `hazard_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `source` VARCHAR(30) NOT NULL,
  `hazard_key` VARCHAR(120) NOT NULL,
  `severity_key` VARCHAR(40) NOT NULL,
  `kind` ENUM('typhoon','earthquake','rainfall') NOT NULL,
  `alert_level` ENUM('Advisory','Watch','Warning','Severe') NOT NULL DEFAULT 'Advisory',
  `headline` VARCHAR(255) NOT NULL,
  `details` TEXT NULL,
  `draft` TEXT NULL,
  `official_url` VARCHAR(500) NULL,
  `status` ENUM('new','published','dismissed') NOT NULL DEFAULT 'new',
  `alert_id` INT NULL,
  `handled_by` INT NULL,
  `handled_at` DATETIME NULL,
  `detected_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_hazard_severity` (`hazard_key`, `severity_key`),
  KEY `idx_status` (`status`, `detected_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `disaster_alerts`
  ADD COLUMN IF NOT EXISTS `source` VARCHAR(30) NOT NULL DEFAULT 'manual' AFTER `is_active`,
  ADD COLUMN IF NOT EXISTS `source_ref` VARCHAR(120) NULL AFTER `source`,
  ADD COLUMN IF NOT EXISTS `auto_generated` TINYINT(1) NOT NULL DEFAULT 0 AFTER `source_ref`;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('hazard_alert_mode', 'draft');
