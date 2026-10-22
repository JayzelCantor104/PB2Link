-- 029_admin_account_security.sql
--
-- Admin account security (admin_manage.php, admin_reset_password.php,
-- admin_forgot_password.php, auth_guard.php):
--
-- password_changed_at  set whenever an admin's password changes (reset link,
--                      SMS reset). Sessions that signed in before it are
--                      ended (pb2_admin_session_still_valid), so a reset
--                      signs the account out everywhere.
-- email_changed_by     the admin who changed this admin's email, while the
--                      owner hasn't confirmed it with a code yet. Password
--                      reset links are never sent to such an address, so
--                      changing someone's email can't be used to take over
--                      their account. Cleared when the owner verifies it
--                      (admin_contact_verify.php).
--
-- Super Admins no longer type passwords for other admins: they send a reset
-- link to the admin's own email instead.
--
-- Additive only, safe to re-run:
--     mysql -u root barangay_bims < backend/migrations/029_admin_account_security.sql

ALTER TABLE `admins`
  ADD COLUMN IF NOT EXISTS `password_changed_at` DATETIME NULL DEFAULT NULL AFTER `password_hash`,
  ADD COLUMN IF NOT EXISTS `email_changed_by` INT NULL DEFAULT NULL AFTER `email_verified_at`;
