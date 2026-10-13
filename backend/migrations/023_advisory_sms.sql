-- 023_advisory_sms.sql
--
-- Advisory SMS to all residents (advisory_sms.php).
--   system_settings.advisory_sms_mode  'manual' (default): staff text residents
--       from the SMS dispatcher, which can now target "All residents";
--       'auto': an advisory that goes live (published by staff or by the hazard
--       feed, raised to a higher level, or reactivated) is texted to every
--       Active resident with a mobile number. Set by the Super Admin.
--   disaster_alerts.sms_sent_level / sms_sent_at / sms_sent_count
--       the level last texted automatically, so the same advisory is texted
--       once per level: an escalation is texted again, an edit is not.
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/023_advisory_sms.sql
-- (PowerShell: Get-Content backend/migrations/023_advisory_sms.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

ALTER TABLE `disaster_alerts`
  ADD COLUMN IF NOT EXISTS `sms_sent_level` VARCHAR(20) NULL AFTER `auto_generated`,
  ADD COLUMN IF NOT EXISTS `sms_sent_at` DATETIME NULL AFTER `sms_sent_level`,
  ADD COLUMN IF NOT EXISTS `sms_sent_count` INT NULL AFTER `sms_sent_at`;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('advisory_sms_mode', 'manual');
