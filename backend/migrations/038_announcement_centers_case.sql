-- 038_announcement_centers_case.sql
--
-- Website text is stored as typed (see 035). The sample announcement and two
-- evacuation centers were put in capitals by migration 016; this writes them
-- in proper case. Each row is matched by its id AND its exact current text, so
-- a row staff have edited since is left alone. Safe to re-run.

UPDATE `announcements` SET `caption` = 'This is a sample announcement to Barangay PB2'
 WHERE `announcement_id` = 4 AND BINARY `caption` = BINARY 'THIS IS A SAMPLE ANNOUNCEMENT TO BARANGAY PB2';

UPDATE `evacuation_centers` SET `name` = 'Barangay Pasong Buaya 2 Extension'
 WHERE `id` = 1 AND BINARY `name` = BINARY 'BARANGAY PASONG BUAYA 2 EXTENSION';
UPDATE `evacuation_centers` SET `location` = 'Ph. 12-A, Barangay Hall PB 2 Ext., Quirino cor. Udani St., Imus, Cavite'
 WHERE `id` = 1 AND BINARY `location` = BINARY 'PH.12 -A, BARANGAY HALL PB 2 EXT.QUIRINO COR.UDANI ST., IMUS, CAVITE';

UPDATE `evacuation_centers` SET `name` = 'Woodsite 3 Covered Basketball Court'
 WHERE `id` = 2 AND BINARY `name` = BINARY 'WOODSITE 3 COVERED BASKETBALL COURT';
UPDATE `evacuation_centers` SET `location` = '158 Bugallon St., Imus, Cavite'
 WHERE `id` = 2 AND BINARY `location` = BINARY '158 BUGALLON ST, IMUS, CAVITE';
