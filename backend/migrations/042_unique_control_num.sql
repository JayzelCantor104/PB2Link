-- 042: A control number belongs to exactly one resident.
-- register.php already checks before saving (and claims the number by creating
-- its upload folder), but nothing in the database refused a duplicate: a
-- record added another way (phpMyAdmin, an import script) could reuse one, and
-- the two residents would then share an ID-photo folder.
--
-- Before applying, check there are no duplicates (both must return no rows):
--   SELECT control_num, COUNT(*) FROM residents GROUP BY control_num HAVING COUNT(*) > 1;
--   SELECT control_num, COUNT(*) FROM users     GROUP BY control_num HAVING COUNT(*) > 1;
-- NULLs are allowed more than once by a UNIQUE index, so empty values don't block it.
-- Safe to re-run: each index is added only when it isn't there yet.

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'residents' AND INDEX_NAME = 'uq_residents_control_num');
SET @sql := IF(@has = 0, 'ALTER TABLE residents ADD UNIQUE KEY uq_residents_control_num (control_num)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_control_num');
SET @sql := IF(@has = 0, 'ALTER TABLE users ADD UNIQUE KEY uq_users_control_num (control_num)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
