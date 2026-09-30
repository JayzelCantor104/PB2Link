-- 013_philsys_scan_verification.sql
--
-- PhilSys (National ID) number verification by scan (backend/api/philsys_scan_common.php).
--
--   ocr_scan_results  what ocr_id.php actually read from a photo, keyed by a
--                     one-time token and tied to the photo's SHA-256. Lets the
--                     server re-check a scanned PhilSys number and name itself
--                     instead of trusting what the browser says it read.
--                     Short-lived: usable for 1 hour, deleted after a day.
--
--   residents.philsys_verification_status
--                     Matched      scan read this number and the card's name
--                                  matched the resident
--                     Mismatch     scan read the card but the name/number
--                                  didn't match (registration only — flagged
--                                  for staff, not blocked)
--                     Manual Entry number typed by hand (scan unavailable) or
--                                  from before this check existed
--                     Not Provided no PhilSys number
--
--   pending_profile_changes.verified_by_scan
--                     1 = an Edit Profile PhilSys change whose card was scanned
--                     and name-matched on the server; it applies right after
--                     the email code (verify_otp.php) instead of going to staff.
--
-- Backfills: existing numbers become 'Manual Entry' (never scan-checked), and
-- residents who registered with a PhilSys card as their ID get that card's
-- photos as their PhilSys card photos (shown in Edit Profile).
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/013_philsys_scan_verification.sql
-- (PowerShell: Get-Content backend/migrations/013_philsys_scan_verification.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `ocr_scan_results` (
  `scan_token`   CHAR(32) NOT NULL,
  `image_sha256` CHAR(64) NOT NULL,
  `id_type`      VARCHAR(40) NOT NULL,
  `ocr_text`     MEDIUMTEXT NOT NULL,
  `created_at`   DATETIME NOT NULL,
  `used_at`      DATETIME DEFAULT NULL,
  PRIMARY KEY (`scan_token`),
  KEY `idx_osr_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `philsys_verification_status`
      ENUM('Not Provided','Matched','Mismatch','Manual Entry') NOT NULL DEFAULT 'Not Provided' AFTER `philsys_img_back`;

ALTER TABLE `pending_profile_changes`
  ADD COLUMN IF NOT EXISTS `verified_by_scan` TINYINT(1) NOT NULL DEFAULT 0 AFTER `proof_document_back`;

UPDATE `residents`
   SET `philsys_verification_status` = 'Manual Entry'
 WHERE `philsys_nat_id` IS NOT NULL AND `philsys_nat_id` <> ''
   AND `philsys_verification_status` = 'Not Provided';

UPDATE `residents`
   SET `philsys_img_front` = `valid_id_img_front`,
       `philsys_img_back`  = `valid_id_img_back`
 WHERE `valid_id` = 'National ID (PhilID/ePhilID)'
   AND `philsys_img_front` IS NULL;
