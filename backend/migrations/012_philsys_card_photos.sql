-- 012_philsys_card_photos.sql
--
-- Edit Profile: entering or changing a PhilSys number now requires photos of
-- the front and back of the PhilSys card (backend/api/edit_profile.php).
--
--   pending_profile_changes.proof_document_back  second image for a request
--                     (the PhilSys card's back; the front uses proof_document)
--   residents.philsys_img_front / philsys_img_back  the card photos, filed
--                     on the resident record when staff approve the number
--                     (admin_process_profile.php)
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/012_philsys_card_photos.sql
-- (PowerShell: Get-Content backend/migrations/012_philsys_card_photos.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

ALTER TABLE `pending_profile_changes`
  ADD COLUMN IF NOT EXISTS `proof_document_back` VARCHAR(255) DEFAULT NULL AFTER `proof_document`;

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `philsys_img_front` VARCHAR(255) DEFAULT NULL AFTER `philsys_nat_id`,
  ADD COLUMN IF NOT EXISTS `philsys_img_back` VARCHAR(255) DEFAULT NULL AFTER `philsys_img_front`;
