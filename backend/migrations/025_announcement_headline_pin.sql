-- 025_announcement_headline_pin.sql
--
-- Announcements get an optional headline and can be pinned (pin_announcement.php).
--   title      a short headline shown on the Home page and above the caption.
--              Optional; without it the first line of the caption is used.
--              Stored in ALL CAPS like the caption.
--   is_pinned  pinned posts come first on the Home page, the Announcements page
--   pinned_at  and the admin list, newest pin first. At most 3 at a time
--              (PB2_ANNOUNCEMENT_MAX_PINNED in announcements_common.php).
-- It also restores the announcement tables' primary keys, AUTO_INCREMENT and
-- cascading foreign keys where an imported dump dropped them (see below).
--
-- Safe to re-run. Apply once:
--     mysql -u root barangay_bims < backend/migrations/025_announcement_headline_pin.sql
-- (PowerShell: Get-Content backend/migrations/025_announcement_headline_pin.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

ALTER TABLE `announcements`
  ADD COLUMN IF NOT EXISTS `title` VARCHAR(150) NULL AFTER `admin_id`,
  ADD COLUMN IF NOT EXISTS `is_pinned` TINYINT(1) NOT NULL DEFAULT 0 AFTER `audience_type`,
  ADD COLUMN IF NOT EXISTS `pinned_at` DATETIME NULL AFTER `is_pinned`;

CREATE INDEX IF NOT EXISTS `idx_pinned_created` ON `announcements` (`is_pinned`, `pinned_at`, `created_at`);

-- Repair: some database dumps were imported without the announcement tables'
-- primary keys, AUTO_INCREMENT and ON DELETE CASCADE foreign keys (as defined in
-- backend/create_announcements_tables.php). Without them a new post gets id 0
-- and deleting a post leaves its images, sectors and recipients behind.
-- Each step runs only when the key is missing, so this is a no-op on a correct
-- database and safe to re-run.

SET @no_pk := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements' AND CONSTRAINT_TYPE = 'PRIMARY KEY');
SET @s := IF(@no_pk, 'ALTER TABLE `announcements` MODIFY `announcement_id` INT NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (`announcement_id`)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @no_pk := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcement_images' AND CONSTRAINT_TYPE = 'PRIMARY KEY');
SET @s := IF(@no_pk, 'ALTER TABLE `announcement_images` MODIFY `image_id` INT NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (`image_id`)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @no_pk := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcement_sectors' AND CONSTRAINT_TYPE = 'PRIMARY KEY');
SET @s := IF(@no_pk, 'ALTER IGNORE TABLE `announcement_sectors` ADD PRIMARY KEY (`announcement_id`, `sector`)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @no_pk := (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcement_recipients' AND CONSTRAINT_TYPE = 'PRIMARY KEY');
SET @s := IF(@no_pk, 'ALTER IGNORE TABLE `announcement_recipients` ADD PRIMARY KEY (`announcement_id`, `user_id`)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

CREATE INDEX IF NOT EXISTS `idx_created_at` ON `announcements` (`created_at`);

-- Child rows of posts that no longer exist (left behind while the cascade was
-- missing) are removed, then the cascading foreign keys are restored.
DELETE i FROM `announcement_images` i LEFT JOIN `announcements` a ON a.announcement_id = i.announcement_id WHERE a.announcement_id IS NULL;
DELETE s FROM `announcement_sectors` s LEFT JOIN `announcements` a ON a.announcement_id = s.announcement_id WHERE a.announcement_id IS NULL;
DELETE r FROM `announcement_recipients` r LEFT JOIN `announcements` a ON a.announcement_id = r.announcement_id WHERE a.announcement_id IS NULL;

SET @no_fk := (SELECT COUNT(*) = 0 FROM information_schema.REFERENTIAL_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'announcement_images' AND REFERENCED_TABLE_NAME = 'announcements');
SET @s := IF(@no_fk, 'ALTER TABLE `announcement_images` ADD CONSTRAINT `fk_ann_images_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`announcement_id`) ON DELETE CASCADE', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @no_fk := (SELECT COUNT(*) = 0 FROM information_schema.REFERENTIAL_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'announcement_sectors' AND REFERENCED_TABLE_NAME = 'announcements');
SET @s := IF(@no_fk, 'ALTER TABLE `announcement_sectors` ADD CONSTRAINT `fk_ann_sectors_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`announcement_id`) ON DELETE CASCADE', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @no_fk := (SELECT COUNT(*) = 0 FROM information_schema.REFERENTIAL_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'announcement_recipients' AND REFERENCED_TABLE_NAME = 'announcements');
SET @s := IF(@no_fk, 'ALTER TABLE `announcement_recipients` ADD CONSTRAINT `fk_ann_recipients_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`announcement_id`) ON DELETE CASCADE', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
