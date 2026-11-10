-- 046: A "Compound" part of the address (e.g. MINALDO COMPOUND), optional,
-- kept apart from the subdivision. Asked on registration, Edit Profile and the
-- "someone else" address of the request forms; shown to staff wherever the
-- address is. Stored in capitals like the other address parts. Safe to re-run.
ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS compound VARCHAR(100) NULL DEFAULT NULL AFTER street;
