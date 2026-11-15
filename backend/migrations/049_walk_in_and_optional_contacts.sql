-- 049_walk_in_and_optional_contacts.sql
--
-- Residents without an email or a mobile number, and walk-ins at the hall.
--
--  * users.email may be NULL: a resident can register online with a mobile
--    number only (signing in with that number), and staff can register a
--    walk-in resident with neither (no online sign-in until a contact is added).
--    UNIQUE still applies to every email that is given.
--  * residents.approval_method gains 'hall' (registered by staff at the
--    Barangay Hall after checking the ID in person) and registered_by (admin).
--  * The five document tables gain source ('online' / 'walk_in') and
--    encoded_by (the admin who encoded a walk-in request). resident_id may be
--    NULL for a walk-in who isn't registered; the request row keeps the
--    person's own name, birth date and address.
--  * request_payments.resident_id may be NULL for the same reason.
--  * registration_sms_ip: texts sent for mobile-only registrations, per
--    internet address, so that public endpoint can't be used to text
--    numbers in bulk.
--
-- Additive and safe to re-run:
--     Get-Content backend/migrations/049_walk_in_and_optional_contacts.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims

ALTER TABLE `users` MODIFY `email` VARCHAR(100) NULL DEFAULT NULL;

ALTER TABLE `residents`
  MODIFY `approval_method` ENUM('auto','manual','hall') NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `registered_by` INT(11) NULL DEFAULT NULL AFTER `approval_method`;

ALTER TABLE `req_barangay_clearance`
  MODIFY `resident_id` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `source` ENUM('online','walk_in') NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS `encoded_by` INT(11) NULL DEFAULT NULL;
ALTER TABLE `req_certificate_residency`
  MODIFY `resident_id` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `source` ENUM('online','walk_in') NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS `encoded_by` INT(11) NULL DEFAULT NULL;
ALTER TABLE `req_certificate_indigency`
  MODIFY `resident_id` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `source` ENUM('online','walk_in') NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS `encoded_by` INT(11) NULL DEFAULT NULL;
ALTER TABLE `req_barangay_id`
  MODIFY `resident_id` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `source` ENUM('online','walk_in') NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS `encoded_by` INT(11) NULL DEFAULT NULL;
ALTER TABLE `req_business_clearance`
  MODIFY `resident_id` INT(11) NULL,
  ADD COLUMN IF NOT EXISTS `source` ENUM('online','walk_in') NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS `encoded_by` INT(11) NULL DEFAULT NULL;

ALTER TABLE `request_payments` MODIFY `resident_id` INT(11) NULL;

CREATE TABLE IF NOT EXISTS `registration_sms_ip` (
  `id`         INT(11) NOT NULL AUTO_INCREMENT,
  `ip`         VARCHAR(45) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rsi_ip` (`ip`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
