-- 040: a minor's guardian consent can be a letter OR a birth certificate.
--
-- When the guardian's surname differs from the applicant's, registration used
-- to require a letter the guardian signed. Many real parents have a different
-- surname (mothers often keep their maiden name), and a letter is easy to
-- write, so the applicant may now send ONE of:
--   letter             a consent letter the guardian signed (any relationship)
--   birth_certificate  the applicant's PSA birth certificate naming the
--                      guardian as a parent (Mother / Father only)
--   guardianship       a guardianship document, e.g. a court order or DSWD
--                      certification (any relationship)
-- The file stays in resident_guardians.letter_path; consent_type says which
-- kind it is. NULL = no consent document (same surname), or a row saved
-- before this migration, which was always a letter.
--
-- The guardian's ID and staff approval of every minor are unchanged.
--
-- Additive only, safe to re-run:
--     mysql -u root barangay_bims < backend/migrations/040_guardian_consent_type.sql
-- (PowerShell: Get-Content backend/migrations/040_guardian_consent_type.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

ALTER TABLE `resident_guardians`
  ADD COLUMN IF NOT EXISTS `consent_type` VARCHAR(30) NULL DEFAULT NULL AFTER `letter_path`;

-- Rows saved before this migration that carry a file were letters.
UPDATE `resident_guardians`
   SET `consent_type` = 'letter'
 WHERE `consent_type` IS NULL AND `letter_path` IS NOT NULL;
