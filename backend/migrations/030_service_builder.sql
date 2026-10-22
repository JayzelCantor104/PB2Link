-- 030_service_builder.sql
--
-- Services & Form Builder (services.php, src/Admin/AdminServices.jsx,
-- src/pages/DynamicRequestForm.jsx):
--
-- service_fields.help_text   a short hint shown under the field on the
--                            resident's form (e.g. "As written on your
--                            school ID"). Optional, stored in ALL CAPS like
--                            the field label (text_case.php).
--
-- Additive only, safe to re-run:
--     mysql -u root barangay_bims < backend/migrations/030_service_builder.sql

ALTER TABLE `service_fields`
  ADD COLUMN IF NOT EXISTS `help_text` VARCHAR(300) NULL DEFAULT NULL AFTER `field_options`;
