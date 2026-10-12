-- 018_registration_address_check.sql
--
-- The move-in month ("Living in PB2 Since") typed at registration is only a
-- claim. It is accepted on its own only when the ID the resident scanned
-- shows a Pasong Buaya II address. Otherwise registration asks for a proof
-- and the account waits for staff (rules in residency_requirement.php):
--
--   under 6 months                 -> HOA endorsement (or an accepted
--                                     alternative), staff review
--   6+ months, ID shows PB2        -> date accepted, no proof
--   6+ months, ID not PB2 / unread -> proof of address with the resident's
--                                     name (bill, other ID, parcel, HOA
--                                     endorsement ...), staff review
--
--   residents.id_address_match     1 = the server's scan of the ID front
--                                  shows Pasong Buaya II, 0 = it doesn't,
--                                  NULL = no usable scan / older account.
--   resident_residency_proofs.proof_type gains the proof-of-address kinds.
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/018_registration_address_check.sql
-- (PowerShell: Get-Content backend/migrations/018_registration_address_check.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `id_address_match` TINYINT(1) DEFAULT NULL AFTER `id_verification_status`;

ALTER TABLE `resident_residency_proofs`
  MODIFY `proof_type` ENUM(
    'HOA Certification','Lease Contract','Landlord Certification','Purok/Kagawad Certification',
    'Utility Bill','Bank/Billing Statement','Other ID with Address','Parcel/Delivery Receipt'
  ) NOT NULL;
