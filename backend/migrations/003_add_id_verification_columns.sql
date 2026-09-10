-- 003_add_id_verification_columns.sql
--
-- Adds the ID-scan verification trail to `residents`, read/written by
-- backend/api/register.php (computes id_verification_status server-side by
-- comparing what the ID scanner extracted against what was finally
-- submitted) and backend/api/get_pending_users.php (surfaces it to admins
-- as a status pill in PendingUsers.jsx/Profiling.jsx). Apply once against
-- the barangay_bims database:
--
--     mysql -u root barangay_bims < backend/migrations/003_add_id_verification_columns.sql
--
-- These columns were originally added directly against the live database
-- during development without a matching migration file — this migration
-- exists so a fresh environment built from a dump that predates this
-- feature doesn't fail at the first registration attempt with
-- "Unknown column".
--
-- Deliberately independent of the id_ocr_snapshot column's actual OCR
-- source (Tesseract.js, client-side) — this only stores results.

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `id_ocr_snapshot` JSON DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `id_ocr_confidence` DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `id_verification_status` ENUM('Not Scanned','Matched','Mismatch','Manual Entry') DEFAULT 'Not Scanned';
