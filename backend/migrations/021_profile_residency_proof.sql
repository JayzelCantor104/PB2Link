-- 021_profile_residency_proof.sql
--
-- Edit Profile follows the registration residency rules (migration 018):
--   - changing the address (house no., block & lot, street, subdivision, zone,
--     area, landmark) needs the code, then a proof of the new address, and
--     applies only after staff approve it;
--   - the move-in month needs the same proof registration asks for
--     (pb2_registration_residency_rule: under 6 months -> HOA endorsement or
--     another certification; 6+ months but the scanned ID doesn't show
--     Pasong Buaya II -> proof of address), and then goes to staff.
-- Approving such a change files the proof as a Verified resident_residency_proofs row.
--
--   pending_profile_changes.proof_type  which kind of proof is attached
--                                       (one of PB2_ADDRESS_PROOF_TYPES).
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/021_profile_residency_proof.sql
-- (PowerShell: Get-Content backend/migrations/021_profile_residency_proof.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

ALTER TABLE `pending_profile_changes`
  ADD COLUMN IF NOT EXISTS `proof_type` VARCHAR(40) DEFAULT NULL AFTER `proof_document_back`;
