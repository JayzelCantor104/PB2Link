-- 051_walk_in_volunteer_and_services.sql
--
-- Walk-in Volunteer Registration and custom-service requests
-- (admin_walkin_request.php), like the five documents in migration 049.
--
--  * req_volunteer_registration and service_submissions gain source
--    ('online' / 'walk_in') and encoded_by; resident_id (and the service's
--    user_id) may be NULL for someone not registered.
--  * Volunteer contact_num / email may be NULL: a walk-in may have neither.
--  * req_volunteer_registration gains birth_date, gender and civil_status: the
--    printed volunteer certificate shows the age and civil status, which the
--    list used to send as NULL for every request. It now falls back to the
--    resident's record for online requests (get_document_requests.php).
--
-- Additive and safe to re-run:
--     Get-Content backend/migrations/051_walk_in_volunteer_and_services.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims

ALTER TABLE `req_volunteer_registration`
  MODIFY `resident_id` INT(11) NULL,
  MODIFY `contact_num` VARCHAR(20) NULL DEFAULT NULL,
  MODIFY `email` VARCHAR(100) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `birth_date` DATE NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `gender` VARCHAR(10) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `civil_status` VARCHAR(20) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `source` ENUM('online','walk_in') NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS `encoded_by` INT(11) NULL DEFAULT NULL;

ALTER TABLE `service_submissions`
  MODIFY `resident_id` INT(11) NULL,
  MODIFY `user_id` BIGINT(20) NULL,
  ADD COLUMN IF NOT EXISTS `source` ENUM('online','walk_in') NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS `encoded_by` INT(11) NULL DEFAULT NULL;
