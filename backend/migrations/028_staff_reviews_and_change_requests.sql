-- 028_staff_reviews_and_change_requests.sql
--
-- resident_check_reviews   staff accepting or rejecting an automatic check on
--                          a resident's record (ID scan, selfie with ID,
--                          PhilSys card, address on the ID, guardian
--                          documents). Accepting sets the check's status to its
--                          passing value (e.g. id_verification_status
--                          'Matched'); rejecting sets the failing one. Each
--                          decision is kept here with the reviewer and note,
--                          and shown on the check card. Mobile numbers are
--                          only confirmed by the resident's SMS code.
--
-- resident_change_requests staff asking a resident to change information that
--                          needs the resident's proof or code (name, address
--                          and move-in month, sectors, PhilSys, valid ID,
--                          email/mobile). Staff can't change those directly
--                          (admin_residents.php). The resident makes the change
--                          in Edit Profile with the proof; it reaches Profile
--                          Approvals, and approving it closes the request.
--                          snapshot keeps the values at the time of asking, so a
--                          change that applies without staff (email, mobile)
--                          closes it too.
--
-- Additive only, safe to re-run:
--     mysql -u root barangay_bims < backend/migrations/028_staff_reviews_and_change_requests.sql

CREATE TABLE IF NOT EXISTS `resident_check_reviews` (
  `review_id` INT AUTO_INCREMENT PRIMARY KEY,
  `resident_id` INT NOT NULL,
  `check_key` VARCHAR(20) NOT NULL,
  `decision` ENUM('accepted','rejected') NOT NULL,
  `note` VARCHAR(255) NULL DEFAULT NULL,
  `old_status` VARCHAR(30) NULL DEFAULT NULL,
  `new_status` VARCHAR(30) NULL DEFAULT NULL,
  `reviewed_by` INT NULL DEFAULT NULL,
  `reviewed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_check_resident` (`resident_id`, `check_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `resident_change_requests` (
  `request_id` INT AUTO_INCREMENT PRIMARY KEY,
  `resident_id` INT NOT NULL,
  `category` ENUM('name','address','sectors','philsys','id','contact') NOT NULL,
  `details` VARCHAR(255) NOT NULL,
  `note` VARCHAR(255) NULL DEFAULT NULL,
  `snapshot` TEXT NULL DEFAULT NULL,
  `status` ENUM('open','done','cancelled') NOT NULL DEFAULT 'open',
  `created_by` INT NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` DATETIME NULL DEFAULT NULL,
  `closed_by` INT NULL DEFAULT NULL,
  KEY `idx_change_req_resident` (`resident_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Profile Approvals record who accepted or rejected each Edit Profile change
-- and why (admin_notes holds the note; a rejection must have one).
ALTER TABLE `pending_profile_changes`
  ADD COLUMN IF NOT EXISTS `reviewed_by` INT NULL DEFAULT NULL AFTER `admin_notes`,
  ADD COLUMN IF NOT EXISTS `reviewed_at` DATETIME NULL DEFAULT NULL AFTER `reviewed_by`;
