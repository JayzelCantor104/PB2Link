-- 006_fix_incident_reports_columns.sql
--
-- incident_reports.incident_class / reporting_class were VARCHAR(10), but the
-- Incident Report form sends values like "Environmental & Infrastructure" and
-- "Suspicious Activity Report". MySQL here runs without STRICT mode, so those
-- were silently cut off ("Suspicious", "Environmen", "Health & S") instead of
-- failing. attachment_path was VARCHAR(255) while it stores a comma-separated
-- list of up to 10 file paths. report_incident.php used to try an ALTER on
-- every request to paper over this; that is removed in favour of this file.
--
-- Apply once:
--     mysql -u root barangay_bims < backend/migrations/006_fix_incident_reports_columns.sql

ALTER TABLE `incident_reports`
  MODIFY `incident_class` VARCHAR(100) DEFAULT NULL,
  MODIFY `reporting_class` VARCHAR(100) DEFAULT NULL,
  MODIFY `attachment_path` TEXT DEFAULT NULL;

-- Repair rows already truncated to 10 characters. Each prefix maps to exactly
-- one option of the form, so the original value is unambiguous.
UPDATE `incident_reports` SET `incident_class` = 'Health & Safety' WHERE `incident_class` = 'Health & S';
UPDATE `incident_reports` SET `incident_class` = 'Environmental & Infrastructure' WHERE `incident_class` = 'Environmen';
UPDATE `incident_reports` SET `reporting_class` = 'Accident Report' WHERE `reporting_class` = 'Accident R';
UPDATE `incident_reports` SET `reporting_class` = 'Near Miss Report' WHERE `reporting_class` = 'Near Miss ';
UPDATE `incident_reports` SET `reporting_class` = 'Hazard Report' WHERE `reporting_class` = 'Hazard Rep';
UPDATE `incident_reports` SET `reporting_class` = 'Complaint Report' WHERE `reporting_class` = 'Complaint ';
UPDATE `incident_reports` SET `reporting_class` = 'Suspicious Activity Report' WHERE `reporting_class` = 'Suspicious';

-- track_code had two identical UNIQUE indexes; keep one.
ALTER TABLE `incident_reports` DROP INDEX IF EXISTS `track_code_2`;
