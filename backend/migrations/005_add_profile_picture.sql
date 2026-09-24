-- 005_add_profile_picture.sql
--
-- Adds the resident's profile photo, captured as a required upload at the
-- last step of self-registration (src/pages/Register.jsx) and saved by
-- backend/api/register.php next to the ID photos, in
-- backend/api/uploads/Resident_submitted_valid_ID/<control_num>/profile_picture.<ext>.
-- Apply once against the barangay_bims database:
--
--     mysql -u root barangay_bims < backend/migrations/005_add_profile_picture.sql
--
-- Nullable on purpose: residents registered before this column existed (and
-- ones encoded by staff through the admin side) have no photo, and the
-- citizen UI falls back to their initial in that case.

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `profile_picture` VARCHAR(255) DEFAULT NULL AFTER `valid_id_img_holding`;
