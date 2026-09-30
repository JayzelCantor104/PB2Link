-- 009_amenity_booking.sql
--
-- Completes the amenity (facility / equipment / vehicle) booking feature on
-- top of the catalog layout (req_amenity_reservation.amenity_id -> amenities).
-- Additive only: no existing row is removed or rewritten except the backfills
-- noted below.
--
--   amenities.booking_mode     'online' = residents book it in the portal,
--                              'hotline' = residents are shown hotline_number
--                              (emergency vehicles such as the ambulance)
--   amenities.hotline_number   number shown for hotline-mode amenities
--   amenities.total_quantity   stock for Equipment (e.g. 100 chairs); bookings
--                              for one date can't exceed it
--   amenities.open_time/close_time  bookable hours for Venues / Vehicles
--
--   req_amenity_reservation.start_time/end_time  real times, so overlapping
--                              bookings are detected properly (time_slot stays
--                              as the human-readable label)
--   req_amenity_reservation.tracking_code  widened: the booking page's codes
--                              are 22 characters and VARCHAR(20) cut them short
--
-- Apply once:
--     mysql -u root barangay_bims < backend/migrations/009_amenity_booking.sql
-- (PowerShell: Get-Content backend/migrations/009_amenity_booking.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

ALTER TABLE `amenities`
  ADD COLUMN IF NOT EXISTS `booking_mode` ENUM('online','hotline') NOT NULL DEFAULT 'online' AFTER `category`,
  ADD COLUMN IF NOT EXISTS `hotline_number` VARCHAR(30) DEFAULT NULL AFTER `booking_mode`,
  ADD COLUMN IF NOT EXISTS `total_quantity` INT DEFAULT NULL AFTER `hotline_number`,
  ADD COLUMN IF NOT EXISTS `open_time` TIME NOT NULL DEFAULT '06:00:00' AFTER `total_quantity`,
  ADD COLUMN IF NOT EXISTS `close_time` TIME NOT NULL DEFAULT '22:00:00' AFTER `open_time`;

-- Vehicles were hotline-only before this feature; keep them that way until an
-- admin switches one to online booking.
UPDATE `amenities` SET `booking_mode` = 'hotline' WHERE `category` = 'Vehicle' AND `booking_mode` = 'online';

ALTER TABLE `req_amenity_reservation`
  MODIFY `tracking_code` VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `start_time` TIME DEFAULT NULL AFTER `time_slot`,
  ADD COLUMN IF NOT EXISTS `end_time` TIME DEFAULT NULL AFTER `start_time`;

-- Backfill start/end from existing "HH:MM - HH:MM" labels.
UPDATE `req_amenity_reservation`
SET `start_time` = STR_TO_DATE(SUBSTRING_INDEX(`time_slot`, ' - ', 1), '%H:%i'),
    `end_time`   = STR_TO_DATE(SUBSTRING(SUBSTRING_INDEX(`time_slot`, ' - ', -1), 1, 5), '%H:%i')
WHERE `start_time` IS NULL
  AND `time_slot` REGEXP '^[0-9]{2}:[0-9]{2} - [0-9]{2}:[0-9]{2}';

ALTER TABLE `req_amenity_reservation`
  ADD INDEX IF NOT EXISTS `idx_amenity_date` (`amenity_id`, `reservation_date`);
