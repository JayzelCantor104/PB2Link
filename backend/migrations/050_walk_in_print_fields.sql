-- 050_walk_in_print_fields.sql
--
-- What the printed documents need, for walk-ins who aren't registered
-- (admin_walkin_request.php). A registered resident's request reads these from
-- their record; someone not registered has no record, so the request keeps them.
--
--  * req_certificate_residency.spouse_name and .photo: the Certificate of
--    Residency prints "Married to ___" and the resident's photo.
--  * req_barangay_id.gender: the Barangay ID card prints the sex. The list read
--    it as NULL before, so online cards printed it blank too; it now falls back
--    to the resident's record (get_document_requests.php).
--
-- Additive and safe to re-run:
--     Get-Content backend/migrations/050_walk_in_print_fields.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims

ALTER TABLE `req_certificate_residency`
  ADD COLUMN IF NOT EXISTS `spouse_name` VARCHAR(150) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `photo` VARCHAR(255) NULL DEFAULT NULL;

ALTER TABLE `req_barangay_id`
  ADD COLUMN IF NOT EXISTS `gender` VARCHAR(10) NULL DEFAULT NULL;
