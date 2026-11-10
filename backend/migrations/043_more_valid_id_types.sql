-- 043: Two more accepted IDs for registration and the Edit Profile ID change:
-- the City of Imus Senior Citizen ID (OSCA) and the Barangay Pasong Buaya II ID.
-- residents.valid_id is a fixed list, so they must be added here as well as in
-- register.php, request_id_change.php and admin_residents.php. The existing
-- values keep their order; safe to re-run (MODIFY just sets the same list).
ALTER TABLE residents MODIFY valid_id ENUM(
  'National ID (PhilID/ePhilID)',
  'Passport',
  'Drivers License',
  'UMID (SSS/GSIS)',
  'PRC ID',
  'Postal ID',
  'Voters ID',
  'PhilHealth ID',
  'TIN ID',
  'Senior Citizen ID (OSCA)',
  'Barangay ID (Pasong Buaya II)'
) NULL DEFAULT NULL;
