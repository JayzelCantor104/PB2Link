-- 032_advisory_tools.sql
--
-- Disaster Risk: advisory tools (disaster_risk.php, advisory_sms.php,
-- advisory_push.php, push_subscribe.php, src/Admin/DisasterRisk.jsx):
--
-- disaster_alerts.title_fil / instructions_fil
--        Filipino version of the advisory, written by staff (templates help).
--        Residents who chose Filipino see it and get it by SMS and push.
-- disaster_alerts.is_practice
--        A drill: shown to staff only, marked PRACTICE, sent only to staff
--        (verified admin mobiles, staff devices). Never reaches residents.
-- disaster_alerts.reviewed_at / reviewed_by
--        Staff confirmed the advisory is still accurate. An active advisory
--        not confirmed for PB2_ADVISORY_REVIEW_HOURS is flagged for review.
-- disaster_alerts.push_sent_level
--        Push is sent once per alert level, like sms_sent_level.
-- residents.preferred_language
--        'en' or 'fil' for advisories (Edit Profile).
-- advisory_templates
--        Ready-made bulletins per hazard and level, in English and Filipino,
--        with blanks such as {AREAS}, {CENTER}, {TIME} that must be filled in.
-- push_subscriptions
--        Devices that turned on alerts (Web Push). user_id / admin_id record
--        who was signed in; staff devices also get practice advisories.
--
-- Additive only, safe to re-run:
--     mysql -u root barangay_bims < backend/migrations/032_advisory_tools.sql

ALTER TABLE `disaster_alerts`
  ADD COLUMN IF NOT EXISTS `title_fil` VARCHAR(200) NULL DEFAULT NULL AFTER `title`,
  ADD COLUMN IF NOT EXISTS `instructions_fil` TEXT NULL DEFAULT NULL AFTER `instructions`,
  ADD COLUMN IF NOT EXISTS `is_practice` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`,
  ADD COLUMN IF NOT EXISTS `reviewed_at` DATETIME NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `reviewed_by` INT NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `push_sent_level` VARCHAR(20) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `push_sent_at` DATETIME NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `push_sent_count` INT NULL DEFAULT NULL;

ALTER TABLE `residents`
  ADD COLUMN IF NOT EXISTS `preferred_language` ENUM('en','fil') NOT NULL DEFAULT 'en';

CREATE TABLE IF NOT EXISTS `advisory_templates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `calamity_type` VARCHAR(100) NOT NULL,
  `alert_level` ENUM('Advisory','Watch','Warning','Severe') NOT NULL DEFAULT 'Advisory',
  `title` VARCHAR(200) NOT NULL,
  `instructions` TEXT NOT NULL,
  `title_fil` VARCHAR(200) NULL,
  `instructions_fil` TEXT NULL,
  `evacuation_schedule` VARCHAR(255) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_by` INT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_template_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `advisory_templates` (`name`, `calamity_type`, `alert_level`, `title`, `instructions`, `title_fil`, `instructions_fil`, `evacuation_schedule`, `sort_order`) VALUES
('Typhoon - Signal No. 1', 'Typhoon', 'Advisory',
 'Tropical Cyclone Wind Signal No. 1 over Imus',
 'Strong winds and rain are expected within 36 hours. Secure loose roofing and objects outside, charge phones and power banks, prepare your go bag, and stay tuned to barangay announcements.',
 'Tropical Cyclone Wind Signal Blg. 1 sa Imus',
 'Asahan ang malakas na hangin at ulan sa loob ng 36 na oras. Itali o ipasok ang mga maaaring liparin, i-charge ang cellphone at power bank, ihanda ang go bag, at abangan ang anunsyo ng barangay.',
 NULL, 1),
('Typhoon - Signal No. 2', 'Typhoon', 'Watch',
 'Tropical Cyclone Wind Signal No. 2 over Imus',
 'Gale-force winds are expected within 24 hours. Stay indoors, avoid unnecessary travel, and keep away from trees and power lines. Families in {AREAS} should be ready to evacuate to {CENTER}.',
 'Tropical Cyclone Wind Signal Blg. 2 sa Imus',
 'Asahan ang napakalakas na hangin sa loob ng 24 na oras. Manatili sa loob ng bahay, iwasan ang hindi kailangang paglalakbay, at lumayo sa puno at linya ng kuryente. Ang mga pamilya sa {AREAS} ay maghanda sa paglikas sa {CENTER}.',
 NULL, 2),
('Typhoon - Signal No. 3 and up (pre-emptive evacuation)', 'Typhoon', 'Warning',
 'Pre-emptive evacuation: Typhoon Signal No. 3 over Imus',
 'Pre-emptive evacuation for {AREAS}. Go to {CENTER} before {TIME}. Bring your go bag, medicines and IDs. Turn off the main switch before leaving. Seniors, PWDs and pregnant women first.',
 'Pre-emptive na paglikas: Typhoon Signal Blg. 3 sa Imus',
 'Pre-emptive na paglikas para sa {AREAS}. Pumunta sa {CENTER} bago mag-{TIME}. Dalhin ang go bag, gamot at ID. Patayin ang main switch bago umalis. Unahin ang senior, PWD at buntis.',
 'Pre-emptive evacuation before {TIME}', 3),
('Heavy rain - flood watch', 'Heavy rainfall / flood', 'Watch',
 'Flood watch: continuous heavy rain',
 'Flooding is possible in low-lying areas, especially {AREAS}. Move appliances and documents to higher places, avoid walking or driving through floodwater, and be ready to evacuate to {CENTER}.',
 'Flood watch: tuloy-tuloy na malakas na ulan',
 'Maaaring bumaha sa mababang lugar, lalo na sa {AREAS}. Ilipat sa mataas ang mga gamit at dokumento, huwag lumusong o magmaneho sa baha, at maghanda sa paglikas sa {CENTER}.',
 NULL, 4),
('Flood - forced evacuation', 'Flood', 'Severe',
 'Forced evacuation: rising floodwater',
 'Forced evacuation now for {AREAS}. Go to {CENTER} immediately or wait for the rescue team if you cannot leave safely. Do not cross floodwater. Call the barangay hotline for rescue.',
 'Sapilitang paglikas: tumataas ang baha',
 'Sapilitang paglikas ngayon para sa {AREAS}. Pumunta agad sa {CENTER} o hintayin ang rescue team kung hindi ligtas umalis. Huwag tumawid sa baha. Tumawag sa hotline ng barangay para sa rescue.',
 'Forced evacuation now', 5),
('Earthquake', 'Earthquake', 'Warning',
 'Earthquake: check your home and family',
 'A strong earthquake was felt. Expect aftershocks: drop, cover and hold on. Check for gas leaks and cracks before going back inside. If your house is damaged, go to {CENTER}. Report injuries to the barangay.',
 'Lindol: suriin ang bahay at pamilya',
 'May naramdamang malakas na lindol. Asahan ang aftershock: duck, cover and hold. Suriin kung may tagas ng gas at bitak bago pumasok muli. Kung nasira ang bahay, pumunta sa {CENTER}. Iulat sa barangay ang may sugat.',
 NULL, 6),
('Fire', 'Fire', 'Warning',
 'Fire alert in {AREAS}',
 'A fire is reported in {AREAS}. Keep away and leave the roads clear for fire trucks. Residents nearby should evacuate to {CENTER}. Call BFP Imus or the barangay hotline if you need help.',
 'Sunog sa {AREAS}',
 'May sunog sa {AREAS}. Lumayo at huwag harangan ang daan ng fire truck. Ang mga malapit na residente ay lumikas sa {CENTER}. Tumawag sa BFP Imus o sa hotline ng barangay kung kailangan ng tulong.',
 NULL, 7),
('All clear', 'All clear', 'Advisory',
 'All clear: it is safe to return home',
 'The danger has passed. Families may leave {CENTER} and return home. Check your house for damage, avoid fallen power lines, and report damage or missing family members to the barangay.',
 'All clear: ligtas nang umuwi',
 'Lumipas na ang panganib. Maaari nang umalis sa {CENTER} at umuwi. Suriin ang bahay kung may sira, lumayo sa naputol na linya ng kuryente, at iulat sa barangay ang pinsala o nawawalang kapamilya.',
 NULL, 8);

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `endpoint_hash` CHAR(64) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `p256dh` VARCHAR(120) NOT NULL,
  `auth` VARCHAR(60) NOT NULL,
  `language` ENUM('en','fil') NOT NULL DEFAULT 'en',
  `user_id` BIGINT NULL,
  `admin_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_success_at` DATETIME NULL,
  `failures` INT NOT NULL DEFAULT 0,
  UNIQUE KEY `uniq_push_endpoint` (`endpoint_hash`),
  KEY `idx_push_admin` (`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
