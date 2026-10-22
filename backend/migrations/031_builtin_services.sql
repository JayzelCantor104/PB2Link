-- 031_builtin_services.sql
--
-- Built-in services in Services Management (services.php, builtin_services_common.php,
-- src/Admin/AdminServices.jsx, src/pages/Services.jsx):
--
-- builtin_services        one row per built-in service (Barangay Clearance ...
--                         Report Incident): the name and description residents
--                         see on the Services page and the form heading, the
--                         Services-page category and icon, the display order,
--                         and Open / Closed. A closed built-in service refuses
--                         new requests on the server, and its card and form say
--                         so with closed_message. Printed certificates, emails
--                         and staff lists keep the official document name.
-- services.sort_order     display order of custom services on the Services
--   / services.icon       page (shared order with the built-ins) and their icon.
-- service_fields.builtin_key
--                         extra questions staff add to the END of a built-in
--                         form (service_id is NULL for those rows). Answers are
--                         stored with the request in extra_answers (a JSON copy
--                         of the questions and answers; uploaded files as paths),
--                         so later edits to the questions never change old requests.
--
-- Additive only, safe to re-run:
--     mysql -u root barangay_bims < backend/migrations/031_builtin_services.sql

CREATE TABLE IF NOT EXISTS `builtin_services` (
  `service_key` VARCHAR(20) NOT NULL PRIMARY KEY,
  `display_title` VARCHAR(150) NOT NULL,
  `description` TEXT NULL,
  `category` ENUM('Clearance & Certification','Facility Reservation','Permit','Registration','Other') NOT NULL DEFAULT 'Clearance & Certification',
  `icon` VARCHAR(40) NOT NULL DEFAULT 'bi-file-earmark-text-fill',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `closed_message` VARCHAR(300) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `updated_by` INT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- The cards as they were hard-coded in Services.jsx (typed text in ALL CAPS).
INSERT IGNORE INTO `builtin_services` (`service_key`, `display_title`, `description`, `category`, `icon`, `sort_order`) VALUES
  ('clearance',   'Barangay Clearance',       'Apply for your official barangay clearance digitally in just a few minutes.', 'Clearance & Certification', 'bi-file-earmark-text-fill', 1),
  ('residency',   'Certificate of Residency', 'Request your residency certificate without visiting the office.', 'Clearance & Certification', 'bi-house-check-fill', 2),
  ('barangay_id', 'Barangay ID',              'Apply for your official barangay ID for verification and records.', 'Clearance & Certification', 'bi-person-badge-fill', 3),
  ('business',    'Business Clearance',       'Secure your barangay clearance for business operations quickly.', 'Permit', 'bi-briefcase-fill', 4),
  ('indigency',   'Certificate of Indigency', 'Get certification assistance for scholarship or medical aid purposes.', 'Clearance & Certification', 'bi-heart-pulse-fill', 5),
  ('volunteer',   'Volunteer Registration',   'Join community projects and outreach programs within the barangay.', 'Registration', 'bi-people-fill', 6),
  ('amenity',     'Amenity Reservation',      'Schedule and book barangay facilities like the multi-purpose hall or court.', 'Facility Reservation', 'bi-calendar-event-fill', 7),
  ('incident',    'Report Incident',          'Report a public safety concern, dispute, or emergency to barangay officials with photo evidence.', 'Other', 'bi-exclamation-triangle-fill', 8);

ALTER TABLE `services`
  ADD COLUMN IF NOT EXISTS `sort_order` INT NOT NULL DEFAULT 100 AFTER `is_active`,
  ADD COLUMN IF NOT EXISTS `icon` VARCHAR(40) NULL DEFAULT NULL AFTER `category`;

ALTER TABLE `service_fields`
  MODIFY `service_id` INT NULL,
  ADD COLUMN IF NOT EXISTS `builtin_key` VARCHAR(20) NULL DEFAULT NULL AFTER `service_id`,
  ADD INDEX IF NOT EXISTS `idx_service_fields_builtin` (`builtin_key`);

ALTER TABLE `req_barangay_clearance`     ADD COLUMN IF NOT EXISTS `extra_answers` LONGTEXT NULL DEFAULT NULL;
ALTER TABLE `req_certificate_residency`  ADD COLUMN IF NOT EXISTS `extra_answers` LONGTEXT NULL DEFAULT NULL;
ALTER TABLE `req_barangay_id`            ADD COLUMN IF NOT EXISTS `extra_answers` LONGTEXT NULL DEFAULT NULL;
ALTER TABLE `req_business_clearance`     ADD COLUMN IF NOT EXISTS `extra_answers` LONGTEXT NULL DEFAULT NULL;
ALTER TABLE `req_certificate_indigency`  ADD COLUMN IF NOT EXISTS `extra_answers` LONGTEXT NULL DEFAULT NULL;
ALTER TABLE `req_volunteer_registration` ADD COLUMN IF NOT EXISTS `extra_answers` LONGTEXT NULL DEFAULT NULL;
ALTER TABLE `req_amenity_reservation`    ADD COLUMN IF NOT EXISTS `extra_answers` LONGTEXT NULL DEFAULT NULL;
ALTER TABLE `incident_reports`           ADD COLUMN IF NOT EXISTS `extra_answers` LONGTEXT NULL DEFAULT NULL;
