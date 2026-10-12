-- 016_uppercase_typed_text.sql
--
-- House rule: typed text is stored in ALL CAPS (backend/api/text_case.php,
-- applied by every endpoint that saves typed text). This converts rows saved
-- before the rule so old and new data match.
--
-- Only free text a person types is converted. Never touched: emails,
-- passwords / hashes / codes / tokens, file paths (case-sensitive on Linux),
-- JSON columns (form_data, form_payload, attachments), phone numbers, dates,
-- and values picked from a fixed list (status, suffix, gender, civil_status,
-- sector, request_mode, category, booking_mode, alert_level, feature_type,
-- color_tag, icon_class, waste_type, business_type, employment_status, program_area,
-- availability, residency_status, incident_class, reporting_class), which the
-- code compares exactly.
--
-- Idempotent (UPPER of an uppercase string is unchanged). Apply once:
--     mysql -u root barangay_bims < backend/migrations/016_uppercase_typed_text.sql
-- (PowerShell: Get-Content backend/migrations/016_uppercase_typed_text.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

-- ---- People ---------------------------------------------------------------------
UPDATE `residents` SET
  `fName` = UPPER(`fName`), `mName` = UPPER(`mName`), `lName` = UPPER(`lName`),
  `spouse_name_text` = UPPER(`spouse_name_text`), `religion` = UPPER(`religion`),
  `birth_city` = UPPER(`birth_city`), `birth_province` = UPPER(`birth_province`), `birth_country` = UPPER(`birth_country`),
  `house_no` = UPPER(`house_no`), `street` = UPPER(`street`), `zone` = UPPER(`zone`), `subdivision` = UPPER(`subdivision`),
  `area` = UPPER(`area`), `block_lot` = UPPER(`block_lot`), `landmark` = UPPER(`landmark`),
  `contact_person` = UPPER(`contact_person`), `contactp_relationship` = UPPER(`contactp_relationship`);

UPDATE `admins` SET `fullname` = UPPER(`fullname`);

-- ---- Requests -------------------------------------------------------------------
UPDATE `req_barangay_clearance` SET
  `fName` = UPPER(`fName`), `mName` = UPPER(`mName`), `lName` = UPPER(`lName`), `address` = UPPER(`address`),
  `beneficiary_name` = UPPER(`beneficiary_name`), `precinct_no` = UPPER(`precinct_no`),
  `purpose` = UPPER(`purpose`), `remarks` = UPPER(`remarks`);

UPDATE `req_certificate_residency` SET
  `fName` = UPPER(`fName`), `mName` = UPPER(`mName`), `lName` = UPPER(`lName`), `address` = UPPER(`address`),
  `beneficiary_name` = UPPER(`beneficiary_name`), `purpose` = UPPER(`purpose`), `remarks` = UPPER(`remarks`);

UPDATE `req_barangay_id` SET
  `fName` = UPPER(`fName`), `mName` = UPPER(`mName`), `lName` = UPPER(`lName`), `address` = UPPER(`address`),
  `birth_place` = UPPER(`birth_place`), `beneficiary_name` = UPPER(`beneficiary_name`), `blood_type` = UPPER(`blood_type`),
  `contact_person` = UPPER(`contact_person`), `contactp_relationship` = UPPER(`contactp_relationship`),
  `emergency_address` = UPPER(`emergency_address`), `remarks` = UPPER(`remarks`);

UPDATE `req_business_clearance` SET
  `fName` = UPPER(`fName`), `mName` = UPPER(`mName`), `lName` = UPPER(`lName`), `address` = UPPER(`address`),
  `beneficiary_name` = UPPER(`beneficiary_name`), `business_name` = UPPER(`business_name`),
  `nature_business` = UPPER(`nature_business`), `business_address` = UPPER(`business_address`),
  `contact_person` = UPPER(`contact_person`), `remarks` = UPPER(`remarks`);

UPDATE `req_certificate_indigency` SET
  `fName` = UPPER(`fName`), `mName` = UPPER(`mName`), `lName` = UPPER(`lName`), `address` = UPPER(`address`),
  `beneficiary_name` = UPPER(`beneficiary_name`), `purpose` = UPPER(`purpose`),
  `purpose_details` = UPPER(`purpose_details`), `remarks` = UPPER(`remarks`);

UPDATE `req_volunteer_registration` SET
  `fName` = UPPER(`fName`), `mName` = UPPER(`mName`), `lName` = UPPER(`lName`), `address` = UPPER(`address`),
  `occupation` = UPPER(`occupation`), `skills` = UPPER(`skills`), `remarks` = UPPER(`remarks`);

UPDATE `req_amenity_reservation` SET
  `purpose` = UPPER(`purpose`), `destination` = UPPER(`destination`), `contact_name` = UPPER(`contact_name`),
  `remarks` = UPPER(`remarks`);

UPDATE `service_submissions` SET
  `service_title` = UPPER(`service_title`), `fName` = UPPER(`fName`), `mName` = UPPER(`mName`), `lName` = UPPER(`lName`),
  `address` = UPPER(`address`), `beneficiary_name` = UPPER(`beneficiary_name`), `remarks` = UPPER(`remarks`);

UPDATE `incident_reports` SET
  `reporter_name` = UPPER(`reporter_name`), `reporter_address` = UPPER(`reporter_address`),
  `contact_person_name` = UPPER(`contact_person_name`), `incident_address` = UPPER(`incident_address`),
  `description` = UPPER(`description`);

UPDATE `resident_residency_proofs` SET `issued_by` = UPPER(`issued_by`), `remarks` = UPPER(`remarks`);

-- ---- Site content -----------------------------------------------------------------
UPDATE `amenities` SET `name` = UPPER(`name`), `description` = UPPER(`description`);

UPDATE `announcements` SET `caption` = UPPER(`caption`);

UPDATE `services` SET `title` = UPPER(`title`), `description` = UPPER(`description`);

-- Choices are a JSON array of strings; answers are checked against them.
-- Rows containing a backslash (JSON escapes such as \u00f1) are skipped so an
-- escape is never corrupted; services.php re-saves those in caps on next edit.
UPDATE `service_fields` SET `field_label` = UPPER(`field_label`);
UPDATE `service_fields` SET `field_options` = UPPER(`field_options`)
 WHERE `field_options` IS NOT NULL AND `field_options` NOT LIKE '%\\\\%';

UPDATE `waste_schedules` SET
  `zone_area` = UPPER(`zone_area`), `collection_day` = UPPER(`collection_day`), `collection_time` = UPPER(`collection_time`),
  `truck_route` = UPPER(`truck_route`), `disposal_site` = UPPER(`disposal_site`),
  `truck_team` = UPPER(`truck_team`), `notes` = UPPER(`notes`);

UPDATE `waste_segregation` SET
  `category_name` = UPPER(`category_name`), `description` = UPPER(`description`),
  `allowed_items` = UPPER(`allowed_items`), `prohibited_items` = UPPER(`prohibited_items`),
  `collection_days` = UPPER(`collection_days`), `guidelines` = UPPER(`guidelines`);

UPDATE `disaster_alerts` SET
  `title` = UPPER(`title`), `calamity_type` = UPPER(`calamity_type`), `affected_areas` = UPPER(`affected_areas`),
  `evacuation_schedule` = UPPER(`evacuation_schedule`), `instructions` = UPPER(`instructions`);

UPDATE `evacuation_centers` SET
  `name` = UPPER(`name`), `location` = UPPER(`location`), `facilities` = UPPER(`facilities`),
  `contact_person` = UPPER(`contact_person`);

UPDATE `disaster_map_features` SET `title` = UPPER(`title`), `description` = UPPER(`description`);
