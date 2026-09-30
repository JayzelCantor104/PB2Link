-- 008_harden_foreign_keys.sql
--
-- Tightens referential integrity between the account tables (users, admins),
-- the person table (residents) and everything that hangs off them.
--
-- 1. Request history is a government record and must outlive the resident.
--    Every req_* / service_submissions FK to residents was ON DELETE CASCADE,
--    so deleting a resident silently erased all their clearances, IDs and
--    reservations. They are now ON DELETE RESTRICT: retire a resident by
--    setting residents.status = 'Archived' instead of deleting the row.
--    The same applies to the amenity catalog and custom services — both have
--    their own active/inactive handling and nothing in the API deletes them.
--    (resident_dependents keeps CASCADE: dependents are part of the profile.)
--
-- 2. Missing FKs:
--    - residents.user_id -> users   (had a UNIQUE key but no FK)
--    - req_certificate_indigency.resident_id -> residents  (only table of the
--      seven without one)
--    - incident_reports.user_id -> users  (widened int -> bigint to match
--      users.user_id; report_incident.php stores the session's user_id)
--
-- 3. Who processed a request: processed_by / processed_at on every req_*
--    table, service_submissions and incident_reports.
--    ON DELETE SET NULL so admin_manage.php can still delete an admin; the
--    admin_audit_log keeps the permanent record of who did what. Nothing
--    writes these columns yet — update_document_request.php and
--    update_incident_status.php need to set them from pb2_current_admin().
--
-- Deliberately NOT done: an FK from admin_audit_log.actor_admin_id to admins.
-- An audit log must survive the deletion of the admin it describes (it keeps
-- actor_username/actor_role denormalised for exactly that reason), and it
-- already holds rows for deleted admins. An FK would force those ids to NULL
-- and let future admin deletions rewrite history.
--
-- Uses MariaDB's IF [NOT] EXISTS forms (like 006), so it is safe to re-run.
--
-- Apply once:
--     mysql -u root barangay_bims < backend/migrations/008_harden_foreign_keys.sql

-- ---------------------------------------------------------------------------
-- 1. CASCADE -> RESTRICT
-- ---------------------------------------------------------------------------

ALTER TABLE `req_amenity_reservation` DROP FOREIGN KEY IF EXISTS `fk_amenity_reservation`;
ALTER TABLE `req_amenity_reservation`
  ADD CONSTRAINT `fk_amenity_reservation` FOREIGN KEY IF NOT EXISTS (`resident_id`)
  REFERENCES `residents` (`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `req_amenity_reservation` DROP FOREIGN KEY IF EXISTS `fk_amenity_catalog`;
ALTER TABLE `req_amenity_reservation`
  ADD CONSTRAINT `fk_amenity_catalog` FOREIGN KEY IF NOT EXISTS (`amenity_id`)
  REFERENCES `amenities` (`amenity_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `req_barangay_clearance` DROP FOREIGN KEY IF EXISTS `fk_brgy_clearance`;
ALTER TABLE `req_barangay_clearance`
  ADD CONSTRAINT `fk_brgy_clearance` FOREIGN KEY IF NOT EXISTS (`resident_id`)
  REFERENCES `residents` (`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `req_barangay_id` DROP FOREIGN KEY IF EXISTS `fk_brgy_id`;
ALTER TABLE `req_barangay_id`
  ADD CONSTRAINT `fk_brgy_id` FOREIGN KEY IF NOT EXISTS (`resident_id`)
  REFERENCES `residents` (`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `req_business_clearance` DROP FOREIGN KEY IF EXISTS `fk_biz_clearance`;
ALTER TABLE `req_business_clearance`
  ADD CONSTRAINT `fk_biz_clearance` FOREIGN KEY IF NOT EXISTS (`resident_id`)
  REFERENCES `residents` (`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `req_certificate_residency` DROP FOREIGN KEY IF EXISTS `fk_cert_residency`;
ALTER TABLE `req_certificate_residency`
  ADD CONSTRAINT `fk_cert_residency` FOREIGN KEY IF NOT EXISTS (`resident_id`)
  REFERENCES `residents` (`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `req_volunteer_registration` DROP FOREIGN KEY IF EXISTS `fk_volunteer`;
ALTER TABLE `req_volunteer_registration`
  ADD CONSTRAINT `fk_volunteer` FOREIGN KEY IF NOT EXISTS (`resident_id`)
  REFERENCES `residents` (`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- service_submissions FKs are named fk_service_submissions_* when the table
-- came from 007, and fk_sub_* on databases where it pre-dated 007. Drop both.
ALTER TABLE `service_submissions` DROP FOREIGN KEY IF EXISTS `fk_sub_resident`;
ALTER TABLE `service_submissions` DROP FOREIGN KEY IF EXISTS `fk_service_submissions_resident`;
ALTER TABLE `service_submissions`
  ADD CONSTRAINT `fk_sub_resident` FOREIGN KEY IF NOT EXISTS (`resident_id`)
  REFERENCES `residents` (`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `service_submissions` DROP FOREIGN KEY IF EXISTS `fk_sub_service`;
ALTER TABLE `service_submissions` DROP FOREIGN KEY IF EXISTS `fk_service_submissions_service`;
ALTER TABLE `service_submissions`
  ADD CONSTRAINT `fk_sub_service` FOREIGN KEY IF NOT EXISTS (`service_id`)
  REFERENCES `services` (`service_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Missing FKs
-- ---------------------------------------------------------------------------

ALTER TABLE `residents`
  ADD CONSTRAINT `fk_resident_user` FOREIGN KEY IF NOT EXISTS (`user_id`)
  REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `req_certificate_indigency`
  ADD CONSTRAINT `fk_cert_indigency` FOREIGN KEY IF NOT EXISTS (`resident_id`)
  REFERENCES `residents` (`resident_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `incident_reports`
  MODIFY `user_id` BIGINT(20) DEFAULT NULL;
ALTER TABLE `incident_reports`
  ADD CONSTRAINT `fk_incident_user` FOREIGN KEY IF NOT EXISTS (`user_id`)
  REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. processed_by / processed_at
-- ---------------------------------------------------------------------------

ALTER TABLE `req_amenity_reservation`
  ADD COLUMN IF NOT EXISTS `processed_by` INT(11) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `processed_at` DATETIME DEFAULT NULL;
ALTER TABLE `req_amenity_reservation`
  ADD CONSTRAINT `fk_amenity_reservation_admin` FOREIGN KEY IF NOT EXISTS (`processed_by`)
  REFERENCES `admins` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `req_barangay_clearance`
  ADD COLUMN IF NOT EXISTS `processed_by` INT(11) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `processed_at` DATETIME DEFAULT NULL;
ALTER TABLE `req_barangay_clearance`
  ADD CONSTRAINT `fk_brgy_clearance_admin` FOREIGN KEY IF NOT EXISTS (`processed_by`)
  REFERENCES `admins` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `req_barangay_id`
  ADD COLUMN IF NOT EXISTS `processed_by` INT(11) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `processed_at` DATETIME DEFAULT NULL;
ALTER TABLE `req_barangay_id`
  ADD CONSTRAINT `fk_brgy_id_admin` FOREIGN KEY IF NOT EXISTS (`processed_by`)
  REFERENCES `admins` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `req_business_clearance`
  ADD COLUMN IF NOT EXISTS `processed_by` INT(11) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `processed_at` DATETIME DEFAULT NULL;
ALTER TABLE `req_business_clearance`
  ADD CONSTRAINT `fk_biz_clearance_admin` FOREIGN KEY IF NOT EXISTS (`processed_by`)
  REFERENCES `admins` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `req_certificate_indigency`
  ADD COLUMN IF NOT EXISTS `processed_by` INT(11) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `processed_at` DATETIME DEFAULT NULL;
ALTER TABLE `req_certificate_indigency`
  ADD CONSTRAINT `fk_cert_indigency_admin` FOREIGN KEY IF NOT EXISTS (`processed_by`)
  REFERENCES `admins` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `req_certificate_residency`
  ADD COLUMN IF NOT EXISTS `processed_by` INT(11) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `processed_at` DATETIME DEFAULT NULL;
ALTER TABLE `req_certificate_residency`
  ADD CONSTRAINT `fk_cert_residency_admin` FOREIGN KEY IF NOT EXISTS (`processed_by`)
  REFERENCES `admins` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `req_volunteer_registration`
  ADD COLUMN IF NOT EXISTS `processed_by` INT(11) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `processed_at` DATETIME DEFAULT NULL;
ALTER TABLE `req_volunteer_registration`
  ADD CONSTRAINT `fk_volunteer_admin` FOREIGN KEY IF NOT EXISTS (`processed_by`)
  REFERENCES `admins` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `service_submissions`
  ADD COLUMN IF NOT EXISTS `processed_by` INT(11) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `processed_at` DATETIME DEFAULT NULL;
ALTER TABLE `service_submissions`
  ADD CONSTRAINT `fk_sub_admin` FOREIGN KEY IF NOT EXISTS (`processed_by`)
  REFERENCES `admins` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `incident_reports`
  ADD COLUMN IF NOT EXISTS `processed_by` INT(11) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `processed_at` DATETIME DEFAULT NULL;
ALTER TABLE `incident_reports`
  ADD CONSTRAINT `fk_incident_admin` FOREIGN KEY IF NOT EXISTS (`processed_by`)
  REFERENCES `admins` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE;
