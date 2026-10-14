-- 027_registration_fixes.sql
--
-- Fixing a registration online, and parent/guardian documents for minors.
--
-- residents
--   fix_items           JSON list of what an "Action Required" resident may fix
--                       online in Edit Profile ("restricted mode"): id, details,
--                       philsys, address, sectors, mobile, guardian, confirm.
--                       NULL = they must visit the Barangay Hall (e.g. a
--                       suspected fake ID), so they get no session at all.
--   action_requested_at when staff last asked for action (changes made after
--                       it count as fixes).
--   resubmitted_at      when the resident last sent the registration back.
--   resubmit_count      how many times; after 3 only the hall is offered.
--   replaced_by_resident_id  set on an older duplicate record that staff closed
--                       in favour of the newest registration.
--
-- resident_guardians    a minor's parent or guardian: their ID (with a
--                       signature) and, when the surname differs from the
--                       applicant's, a signed authorization letter. Staff
--                       compare the signatures; minors are always approved by
--                       a person. Approving the account marks the documents
--                       Verified. Files live in the resident's ID folder
--                       (backend/api/uploads/Resident_submitted_valid_ID/<control>/).
--
-- Additive only, safe to re-run:
--     mysql -u root barangay_bims < backend/migrations/027_registration_fixes.sql
-- (PowerShell: Get-Content backend/migrations/027_registration_fixes.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `fix_items` TEXT NULL DEFAULT NULL AFTER `admin_remarks`,
  ADD COLUMN IF NOT EXISTS `action_requested_at` DATETIME NULL DEFAULT NULL AFTER `fix_items`,
  ADD COLUMN IF NOT EXISTS `resubmitted_at` DATETIME NULL DEFAULT NULL AFTER `action_requested_at`,
  ADD COLUMN IF NOT EXISTS `resubmit_count` INT NOT NULL DEFAULT 0 AFTER `resubmitted_at`,
  ADD COLUMN IF NOT EXISTS `replaced_by_resident_id` INT NULL DEFAULT NULL AFTER `resubmit_count`;

CREATE TABLE IF NOT EXISTS `resident_guardians` (
  `guardian_doc_id` INT AUTO_INCREMENT PRIMARY KEY,
  `resident_id` INT NOT NULL,
  `guardian_fname` VARCHAR(100) NOT NULL,
  `guardian_lname` VARCHAR(100) NOT NULL,
  `relationship` VARCHAR(30) NOT NULL,
  `same_surname` TINYINT(1) NOT NULL DEFAULT 0,
  `id_path` VARCHAR(255) NOT NULL,
  `letter_path` VARCHAR(255) NULL DEFAULT NULL,
  `status` ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
  `remarks` VARCHAR(255) NULL DEFAULT NULL,
  `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_by` INT NULL DEFAULT NULL,
  `reviewed_at` DATETIME NULL DEFAULT NULL,
  KEY `idx_guardian_resident` (`resident_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
