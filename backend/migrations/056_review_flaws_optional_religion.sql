-- 1. Problems staff ticked when rejecting an ID, selfie, PhilSys card or
--    address check (blurry, glare, expired, name doesn't match...): a JSON list
--    of keys from backend/api/id_flaws.php, shown on the resident record and
--    sent to the resident.
-- 2. Religion is optional on registration, Edit Profile and staff edits; a
--    staff edit that clears it saves NULL, so the column must allow it.
-- Safe to re-run.

ALTER TABLE resident_check_reviews
  ADD COLUMN IF NOT EXISTS `flaws` TEXT NULL DEFAULT NULL AFTER `note`;

ALTER TABLE residents
  MODIFY `religion` VARCHAR(255) NULL DEFAULT NULL;
