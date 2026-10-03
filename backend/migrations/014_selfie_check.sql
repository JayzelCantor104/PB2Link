-- 014_selfie_check.sql
--
-- Verification-selfie check (backend/api/selfie_check_common.php).
--
--   selfie_check_results  what Google Vision found in a "selfie holding ID"
--                         photo (faces + readable text), keyed by a one-time
--                         token and tied to the photo's SHA-256, so the server
--                         re-judges the photo itself at submission instead of
--                         trusting the browser. Usable for 1 hour, deleted
--                         after a day (it holds personal data).
--
--   residents.selfie_check_status
--                         Verified      a face plus the smaller face printed on
--                                       the ID were found, and the resident's
--                                       name could be read on the ID
--                         Needs Review  the check ran but failed (no face, no
--                                       ID photo, name not readable, or the
--                                       selfie is the ID photo itself) —
--                                       flagged for staff, not blocked
--                         Not Checked   checking was unavailable, or the record
--                                       predates this check
--   residents.selfie_check_notes  the reason shown to staff
--
-- Edit Profile ID-change requests keep the same result inside their
-- pending_profile_changes.new_value JSON ("selfie_check"); approving the
-- request copies it onto the resident.
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/014_selfie_check.sql
-- (PowerShell: Get-Content backend/migrations/014_selfie_check.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `selfie_check_results` (
  `check_token`  CHAR(32) NOT NULL,
  `image_sha256` CHAR(64) NOT NULL,
  `face_count`   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `id_face`      TINYINT(1) NOT NULL DEFAULT 0,
  `ocr_text`     MEDIUMTEXT NOT NULL,
  `created_at`   DATETIME NOT NULL,
  `used_at`      DATETIME DEFAULT NULL,
  PRIMARY KEY (`check_token`),
  KEY `idx_scr_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `selfie_check_status`
      ENUM('Not Checked','Verified','Needs Review') NOT NULL DEFAULT 'Not Checked' AFTER `philsys_verification_status`,
  ADD COLUMN IF NOT EXISTS `selfie_check_notes` VARCHAR(255) DEFAULT NULL AFTER `selfie_check_status`;
