-- 024_about_page.sql
--
-- Editable About page and barangay council (about_content.php), managed on the
-- admin Announcements page ("About Page & Council" tab).
--   barangay_officials  the council roster, one shared list for the public
--                       About page and the printed certificates, signatures and
--                       Barangay ID (PrintTemplates.jsx).
--                       role_key decides where someone appears in print:
--                         punong_barangay  first in the sidebar, "Approved by",
--                                          and the Barangay ID;
--                         secretary        "Prepared by";
--                         kagawad / sk_chair / treasurer / other  sidebar only.
--                       Elected roles (punong_barangay, kagawad, sk_chair) are
--                       shown with "HON." in front, so full_name never has it.
--                       show_on_about / show_on_print hide a row from one place.
--   site_content        key/value text for the About page: hero title and
--                       subtitle, mission, vision, and the timeline (JSON list
--                       of {year, title, description}).
-- Council names and positions are stored in ALL CAPS (text_case.php); the About
-- page text keeps the capitalisation the admin types. Photos are saved under
-- backend/uploads/officials/.
--
-- Seeded from the roster that was hard-coded on the printed certificates.
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/024_about_page.sql
-- (PowerShell: Get-Content backend/migrations/024_about_page.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `barangay_officials` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `full_name` VARCHAR(150) NOT NULL,
  `position` VARCHAR(150) NOT NULL,
  `role_key` ENUM('punong_barangay','kagawad','sk_chair','secretary','treasurer','other') NOT NULL DEFAULT 'other',
  `photo_path` VARCHAR(255) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `show_on_about` TINYINT(1) NOT NULL DEFAULT 1,
  `show_on_print` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_order` (`sort_order`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `site_content` (
  `content_key` VARCHAR(60) NOT NULL PRIMARY KEY,
  `content_value` MEDIUMTEXT NULL,
  `updated_by` INT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the roster only into an empty table, so re-running never duplicates it.
INSERT INTO `barangay_officials` (`full_name`, `position`, `role_key`, `sort_order`)
SELECT * FROM (
  SELECT 'CARLITO C. TAGLE' AS n, 'PUNONG BARANGAY' AS p, 'punong_barangay' AS r, 10 AS s UNION ALL
  SELECT 'ANTONIO A. VILLALON', 'COMMITTEE ON PEACE & ORDER', 'kagawad', 20 UNION ALL
  SELECT 'EDWIN CAPELLAN', 'COMMITTEE ON INFRASTRUCTURE', 'kagawad', 30 UNION ALL
  SELECT 'FLORENCE CAMERINO', 'COMMITTEE ON EDUCATION', 'kagawad', 40 UNION ALL
  SELECT 'RYAN NATO', 'COMMITTEE ON HEALTH', 'kagawad', 50 UNION ALL
  SELECT 'EDWIN CAPELLAN', 'COMMITTEE ON BUDGET', 'kagawad', 60 UNION ALL
  SELECT 'JOHN MATTHEW CAMERINO', 'COMMITTEE ON ENVIRONMENT', 'kagawad', 70 UNION ALL
  SELECT 'LEONOR MATEO', 'COMMITTEE ON WAYS & MEANS', 'kagawad', 80 UNION ALL
  SELECT 'SK CHAIRPERSON', 'SK CHAIRPERSON', 'sk_chair', 90 UNION ALL
  SELECT 'DIGNA E. CABRERA', 'BARANGAY SECRETARY', 'secretary', 100 UNION ALL
  SELECT 'FLORENCE CAMERINO', 'BARANGAY TREASURER', 'treasurer', 110
) seed
WHERE NOT EXISTS (SELECT 1 FROM `barangay_officials`);

INSERT IGNORE INTO `site_content` (`content_key`, `content_value`) VALUES
  ('about_hero_title', 'The Heritage of Pasong Buaya II'),
  ('about_hero_subtitle', 'A story of resilience carved from the earth, rising into a modern beacon of digital governance and community unity.'),
  ('about_mission', 'To orchestrate a seamless bridge between tradition and technology. We pledge to deliver transparent public service, foster sustainable growth, and ensure the safety of every home within our jurisdiction.'),
  ('about_vision', 'We envision a self-sustaining, smart community where every resident thrives. A barangay that sets the gold standard for innovation, peace, and progressive leadership in the province of Cavite.'),
  ('about_timeline', '[{"year":"1990","title":"Genesis","description":"Pasong Buaya II is officially constituted, separating from its mother barangay to focus on the unique needs of its growing agricultural population."},{"year":"2005","title":"Infrastructure","description":"The cementing of the main arterial roads connects the barangay to the heart of Imus, sparking a wave of residential and commercial development."},{"year":"2018","title":"Modernization","description":"Under new leadership, the barangay adopts its first computerized systems and establishes a dedicated disaster command center."},{"year":"2026","title":"The Digital Era","description":"Launch of the PB2 Digital Portal. Residents can now access services, book amenities, and connect with officials instantly online."}]');
