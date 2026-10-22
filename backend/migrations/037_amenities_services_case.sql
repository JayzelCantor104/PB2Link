-- 037_amenities_services_case.sql
--
-- Website text is stored as typed (see 035). These amenity and custom-service
-- texts were put in capitals by migration 016; this writes them in proper case.
-- Each row is matched by its id AND its exact current text, so a row staff
-- have edited since is left alone. Requests keep their own copy of the
-- questions (service_submissions.form_data), so old requests are unaffected.
-- Safe to re-run.

UPDATE `amenities` SET `name` = 'Basketball Court' WHERE `amenity_id` = 1 AND BINARY `name` = BINARY 'BASKETBALL COURT';
UPDATE `amenities` SET `description` = 'Court' WHERE `amenity_id` = 1 AND BINARY `description` = BINARY 'COURT';
UPDATE `amenities` SET `name` = 'Ambulance' WHERE `amenity_id` IN (2, 3) AND BINARY `name` = BINARY 'AMBULANCE';
UPDATE `amenities` SET `description` = 'For emergency' WHERE `amenity_id` = 2 AND BINARY `description` = BINARY 'FOR EMERGENCY';
UPDATE `amenities` SET `description` = 'Call for emergency' WHERE `amenity_id` = 3 AND BINARY `description` = BINARY 'CALL FOR EMERGENCY';

UPDATE `services` SET `title` = 'Bayanihan' WHERE `service_id` = 2 AND BINARY `title` = BINARY 'BAYANIHAN';
UPDATE `services` SET `description` = 'Community cleaning' WHERE `service_id` = 2 AND BINARY TRIM(`description`) = BINARY 'COMMUNITY CLEANING';
UPDATE `services` SET `title` = 'Feeding Program' WHERE `service_id` = 3 AND BINARY `title` = BINARY 'FEEDING PROGRAM';
UPDATE `services` SET `description` = 'Community outreach' WHERE `service_id` = 3 AND BINARY `description` = BINARY 'COMMUNITY OUTREACH';

UPDATE `service_fields` SET `field_label` = 'First Name' WHERE `field_id` = 1 AND BINARY `field_label` = BINARY 'FIRST NAME';
UPDATE `service_fields` SET `field_label` = 'Last Name' WHERE `field_id` = 2 AND BINARY `field_label` = BINARY 'LAST NAME';
