-- 010_residency_proof.sql
--
-- Two changes to how document requests are verified:
--
-- 1. Requests no longer ask the resident to re-upload a government ID. The ID
--    submitted at registration (residents.valid_id_img_*) is reused: submit
--    endpoints copy those paths into the request row's existing ID columns
--    (id_front / valid_id / owner_id ...), so no request table changes for it.
--
-- 2. Residents who have lived in Pasong Buaya II for less than 6 months must
--    have a residency proof on file (HOA Certification / Permit to Reside, or
--    an accepted alternative) before certain documents can be released.
--
--   residents.residing_since   month the resident started living in PB2
--                              (always stored as the 1st of the month).
--                              years_in_PB2 stays, derived from it, so older
--                              screens and emails keep working.
--
--   resident_residency_proofs  one row per uploaded proof. The latest row
--                              that is Pending/Verified (and not past
--                              valid_until) is the one in force.
--
--   req_*.residency_proof_required  snapshot, taken at submission, of whether
--                              the rule applied to this request. Staff can't
--                              mark such a request Ready for Pick Up / Claimed
--                              until the resident's proof is Verified.
--
--   req_business_clearance.home_based  business is run from the owner's home
--                              address; only then does the owner's own
--                              residency length matter.
--
-- Additive only. Backfill: residents with years_in_PB2 >= 1 get an
-- approximate residing_since (date_registered minus those years); residents
-- with 0 years are left NULL and asked for the month on their next request.
--
-- Apply once:
--     mysql -u root barangay_bims < backend/migrations/010_residency_proof.sql
-- (PowerShell: Get-Content backend/migrations/010_residency_proof.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `residing_since` DATE DEFAULT NULL AFTER `years_in_PB2`;

UPDATE `residents`
   SET `residing_since` = DATE_FORMAT(
         DATE_SUB(`date_registered`, INTERVAL CAST(`years_in_PB2` AS UNSIGNED) YEAR),
         '%Y-%m-01')
 WHERE `residing_since` IS NULL
   AND `years_in_PB2` REGEXP '^[0-9]+$'
   AND CAST(`years_in_PB2` AS UNSIGNED) >= 1;

CREATE TABLE IF NOT EXISTS `resident_residency_proofs` (
  `proof_id`     INT(11) NOT NULL AUTO_INCREMENT,
  `resident_id`  INT(11) NOT NULL,
  `proof_type`   ENUM('HOA Certification','Lease Contract','Landlord Certification','Purok/Kagawad Certification') NOT NULL,
  `file_path`    VARCHAR(255) NOT NULL,
  `issued_by`    VARCHAR(150) DEFAULT NULL,
  `issue_date`   DATE DEFAULT NULL,
  `valid_until`  DATE DEFAULT NULL,
  `status`       ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
  `remarks`      TEXT DEFAULT NULL,
  `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_by`  INT(11) DEFAULT NULL,
  `reviewed_at`  DATETIME DEFAULT NULL,
  PRIMARY KEY (`proof_id`),
  KEY `idx_rrp_resident` (`resident_id`, `status`),
  CONSTRAINT `fk_rrp_resident` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`resident_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rrp_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `req_barangay_clearance`
  ADD COLUMN IF NOT EXISTS `residency_proof_required` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `req_certificate_residency`
  ADD COLUMN IF NOT EXISTS `residency_proof_required` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `req_certificate_indigency`
  ADD COLUMN IF NOT EXISTS `residency_proof_required` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `req_barangay_id`
  ADD COLUMN IF NOT EXISTS `residency_proof_required` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `req_business_clearance`
  ADD COLUMN IF NOT EXISTS `home_based` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `residency_proof_required` TINYINT(1) NOT NULL DEFAULT 0;
