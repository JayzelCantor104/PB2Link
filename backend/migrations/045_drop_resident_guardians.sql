-- 045: Only residents 18 or older can have an account, so the parent/guardian
-- documents that migrations 027 and 040 added for applicants under 18 are no
-- longer used anywhere in the code. Drops their table.
--
-- Check before applying on a database with real residents: this deletes any
-- rows in it (SELECT COUNT(*) FROM resident_guardians; should be 0). The files
-- those rows pointed to (under uploads/Resident_submitted_valid_ID/) are not
-- touched. Safe to re-run.
DROP TABLE IF EXISTS resident_guardians;
