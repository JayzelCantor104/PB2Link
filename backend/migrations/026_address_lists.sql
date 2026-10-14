-- 026_address_lists.sql
--
-- Pick lists for the Street and Subdivision fields (address_options.php,
-- src/components/AddressCombobox.jsx), managed by staff on the admin
-- "Address List" page.
--   address_subdivisions  subdivisions, villages and compounds in the barangay.
--   address_streets       streets; subdivision_id says which subdivision a street
--                         lies in (NULL = not inside a mapped subdivision), so
--                         picking a subdivision lists its streets first.
--   address_suggestions   names residents typed that aren't on the list
--                         ("Other / not listed"), collected at registration and
--                         when staff approve an address change, for staff to add
--                         or dismiss.
-- Names are stored in ALL CAPS like the addresses themselves. Hidden entries
-- (is_active = 0) stay for old records but aren't offered.
--
-- Seeded once (only into empty tables) from OpenStreetMap: 18 subdivisions and
-- 166 streets inside the official PSA boundary, duplicates merged and two
-- typos fixed. Street names (c) OpenStreetMap contributors, ODbL.
-- Values residents already have on file are added too.
--
-- Additive only. Apply once:
--     mysql -u root barangay_bims < backend/migrations/026_address_lists.sql
-- (PowerShell: Get-Content backend/migrations/026_address_lists.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `address_subdivisions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `kind` ENUM('subdivision','village','compound','area') NOT NULL DEFAULT 'subdivision',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `source` ENUM('osm','staff','resident') NOT NULL DEFAULT 'staff',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_subdivision_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `address_streets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `subdivision_id` INT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `source` ENUM('osm','staff','resident') NOT NULL DEFAULT 'staff',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_street_subdivision` (`subdivision_id`),
  KEY `idx_street_name` (`name`),
  CONSTRAINT `fk_street_subdivision` FOREIGN KEY (`subdivision_id`) REFERENCES `address_subdivisions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `address_suggestions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `kind` ENUM('street','subdivision') NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `subdivision_name` VARCHAR(150) NOT NULL DEFAULT '',
  `times_seen` INT NOT NULL DEFAULT 1,
  `status` ENUM('new','added','dismissed') NOT NULL DEFAULT 'new',
  `first_seen` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_suggestion` (`kind`, `name`, `subdivision_name`),
  KEY `idx_suggestion_status` (`status`, `last_seen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed from OpenStreetMap, only when the lists are still empty.
SET @seed := (SELECT COUNT(*) = 0 FROM `address_subdivisions`) AND (SELECT COUNT(*) = 0 FROM `address_streets`);

CREATE TEMPORARY TABLE `tmp_seed_subdivisions` (`name` VARCHAR(150), `kind` VARCHAR(20), `source` VARCHAR(10));
INSERT INTO `tmp_seed_subdivisions` VALUES
  ('ARDIA VERMOSA', 'subdivision', 'osm'),
  ('AREVALO''S COMPOUND', 'compound', 'osm'),
  ('FAIRGROUNDS VALLEJO PLACE', 'subdivision', 'osm'),
  ('FELIZANA ESTATE SUBDIVISION (PHASE 3)', 'subdivision', 'osm'),
  ('GARCIA COMPOUND', 'compound', 'osm'),
  ('KAPATIRAN VILLAGE', 'subdivision', 'osm'),
  ('LARA COMPOUND', 'compound', 'osm'),
  ('LOS PINOS SUBDIVISION', 'subdivision', 'osm'),
  ('RICHMOND 2', 'subdivision', 'osm'),
  ('SAN MIGUEL 1', 'subdivision', 'osm'),
  ('SUMMER POINTE COUNTRY HOMES', 'subdivision', 'osm'),
  ('SUMMER POINTE RESIDENCES', 'subdivision', 'osm'),
  ('VALLEJO PLACE PHASE 3', 'subdivision', 'osm'),
  ('VALLEJO PLACE PHASE 3 EXTENSION', 'subdivision', 'osm'),
  ('VILLA BIENES', 'subdivision', 'osm'),
  ('VILLA VERDE SUBDIVISION', 'subdivision', 'osm'),
  ('WOODSITE 1', 'subdivision', 'osm'),
  ('WOODSITE 2', 'subdivision', 'osm');
INSERT IGNORE INTO `address_subdivisions` (`name`, `kind`, `source`)
SELECT `name`, `kind`, `source` FROM `tmp_seed_subdivisions` WHERE @seed;

CREATE TEMPORARY TABLE `tmp_seed_streets` (`name` VARCHAR(150), `subdivision` VARCHAR(150) NULL);
INSERT INTO `tmp_seed_streets` VALUES
  ('2ND AVENUE', 'FAIRGROUNDS VALLEJO PLACE'),
  ('ABAD STREET', NULL),
  ('ABELLA STREET', NULL),
  ('AFRICA STREET', NULL),
  ('AGUADO STREET', NULL),
  ('ALDANA STREET', 'VILLA VERDE SUBDIVISION'),
  ('ALEJANDRO STREET', 'VILLA VERDE SUBDIVISION'),
  ('AMBER STREET', NULL),
  ('ANTHURIUM AVENUE', NULL),
  ('APPLE DRIVE', NULL),
  ('APRICOT STREET', NULL),
  ('AQUAMARINE STREET', NULL),
  ('ARANETA STREET', NULL),
  ('ARCHERS ROAD', NULL),
  ('ASPEN STREET', NULL),
  ('ASTER STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('AVACEÑA STREET', NULL),
  ('AZALEA STREET', 'SUMMER POINTE COUNTRY HOMES'),
  ('BACARDI STREET', 'VALLEJO PLACE PHASE 3 EXTENSION'),
  ('BAGAY STREET', 'VILLA VERDE SUBDIVISION'),
  ('BALSAM STREET', 'SUMMER POINTE COUNTRY HOMES'),
  ('BARLIN STREET', NULL),
  ('BENITEZ STREET', 'LOS PINOS SUBDIVISION'),
  ('BERYL STREET', NULL),
  ('BIRCH STREET', 'SUMMER POINTE COUNTRY HOMES'),
  ('BLUEBELL STREET', 'SUMMER POINTE COUNTRY HOMES'),
  ('BLUEBERRY STREET', NULL),
  ('BONIFACIO LOOP', 'FELIZANA ESTATE SUBDIVISION (PHASE 3)'),
  ('BUGALLON STREET', NULL),
  ('CAILLES STREET', NULL),
  ('CALLEJA STREET', 'VILLA VERDE SUBDIVISION'),
  ('CAMACHILI ROAD', NULL),
  ('CAMIA STREET', NULL),
  ('CAMPUS DRIVE', NULL),
  ('CARNATION STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('CASTANEDA STREET', 'LOS PINOS SUBDIVISION'),
  ('CASTRO STREET', NULL),
  ('CATTLEYA STREET', NULL),
  ('CHIVAS REGAL STREET', 'VALLEJO PLACE PHASE 3 EXTENSION'),
  ('CLOVER STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('CLYDE STREET', NULL),
  ('COLAYCO STREET', NULL),
  ('CORAL STREET', NULL),
  ('CORNEJO STREET', NULL),
  ('COURVOISIER STREET', 'VALLEJO PLACE PHASE 3'),
  ('CRYSTAL STREET', NULL),
  ('CUENCA COMPOUND', NULL),
  ('DAANG HARI', NULL),
  ('DACANAY STREET', NULL),
  ('DAFFODIL STREET', NULL),
  ('DAHLIA STREET', NULL),
  ('DAISY STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('DALLAS', NULL),
  ('DAMA DE NOCHE STREET', NULL),
  ('DANDELION STREET', NULL),
  ('DE LUNA STREET', 'WOODSITE 2'),
  ('DEL PRADO STREET', NULL),
  ('DIEGO MOJICA STREET', NULL),
  ('DIMAYUGA STREET', NULL),
  ('DOVE STREET', 'VALLEJO PLACE PHASE 3'),
  ('DUILAT ROAD', NULL),
  ('DURANTA STREET', NULL),
  ('EARNSHAW STREET', NULL),
  ('ENRIQUE STREET', 'LOS PINOS SUBDIVISION'),
  ('ESCALER STREET', NULL),
  ('ESPENELI STREET', 'WOODSITE 2'),
  ('ESPIRITU SANTO STREET', NULL),
  ('ESTRELLA STREET', NULL),
  ('EVERLASTING STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('FAIRGROUNDS DRIVE', 'FAIRGROUNDS VALLEJO PLACE'),
  ('FAJARDO STREET', NULL),
  ('FENOY STREET', 'WOODSITE 2'),
  ('FERNANDEZ STREET', NULL),
  ('FERNANDO C. AMORSOLO STREET', 'LOS PINOS SUBDIVISION'),
  ('FICUS STREET', NULL),
  ('FIRE TREE STREET', 'SUMMER POINTE COUNTRY HOMES'),
  ('FUENTES STREET', 'VILLA VERDE SUBDIVISION'),
  ('GABRIEL STREET', NULL),
  ('GALANG STREET', 'WOODSITE 2'),
  ('GARDENIA STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('GATMAITAN STREET', NULL),
  ('GOLD STREET', NULL),
  ('GUEVARA STREET', 'LOS PINOS SUBDIVISION'),
  ('GUMAMELA STREET', NULL),
  ('HAZELNUT STREET', 'SUMMER POINTE COUNTRY HOMES'),
  ('HEATHER STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('HENNESSY X.O. STREET', 'VALLEJO PLACE PHASE 3 EXTENSION'),
  ('HERNAEZ STREET', NULL),
  ('ILANG-ILANG STREET', NULL),
  ('ILANO STREET', NULL),
  ('ILAYA PROPER PASONG BUAYA II', NULL),
  ('INTENSITY ROAD', NULL),
  ('IRIS STREET', NULL),
  ('IVY STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('JACK DANIELS STREET', 'VALLEJO PLACE PHASE 3'),
  ('JADE STREET', NULL),
  ('JASMINE STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('JECIEL STREET', NULL),
  ('JIM BEAM STREET', 'VALLEJO PLACE PHASE 3 EXTENSION'),
  ('JOHNNIE WALKER STREET', 'VALLEJO PLACE PHASE 3 EXTENSION'),
  ('KALANTIAW STREET', NULL),
  ('KALAW STREET', 'WOODSITE 2'),
  ('KAPATIRAN ROAD', 'KAPATIRAN VILLAGE'),
  ('KIAMZON STREET', NULL),
  ('LACUNA STREET', NULL),
  ('LAVENDER STREET', NULL),
  ('LEDESMA STREET', 'WOODSITE 2'),
  ('LEGARDA STREET', 'WOODSITE 2'),
  ('LILAC STREET', NULL),
  ('LILY STREET', NULL),
  ('LOBELIA STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('LOTUS STREET', NULL),
  ('LYCHEE STREET', NULL),
  ('MACEDA STREET', 'WOODSITE 2'),
  ('MAGNOLIA STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('MAGSAYSAY STREET', NULL),
  ('MAPLE STREET', 'SUMMER POINTE COUNTRY HOMES'),
  ('MARATHON DRIVE', NULL),
  ('MARIGOLD STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('MARYLAND', 'RICHMOND 2'),
  ('MENDIOLA STREET', 'WOODSITE 2'),
  ('MYER''S RUM STREET', 'VALLEJO PLACE PHASE 3 EXTENSION'),
  ('NAPOLEON STREET', 'VALLEJO PLACE PHASE 3'),
  ('NAVARRO STREET', 'WOODSITE 2'),
  ('OLD ADMIRAL STREET', 'VALLEJO PLACE PHASE 3'),
  ('OLIVEROS STREET', 'WOODSITE 2'),
  ('ONYX STREET', NULL),
  ('OPAL STREET', NULL),
  ('ORCHID STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('PEAR STREET', NULL),
  ('PERIWINKLE STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('PLATINUM STREET', NULL),
  ('POINSETTIA STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('PORTLAND', NULL),
  ('PRIMROSE STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('PURPLE GRAPE STREET', NULL),
  ('QUIRINO STREET', NULL),
  ('RAIN TREE STREET', 'SUMMER POINTE COUNTRY HOMES'),
  ('RECTO STREET', NULL),
  ('REMY MARTIN STREET', 'VALLEJO PLACE PHASE 3'),
  ('RICARTE STREET', NULL),
  ('ROSE STREET', 'SUMMER POINTE RESIDENCES'),
  ('RUBIA STREET', NULL),
  ('RUBY STREET', NULL),
  ('SAINT JOHN STREET', NULL),
  ('SAMPAGUITA STREET', NULL),
  ('SAMPALOC DRIVE', NULL),
  ('SANTORY STREET', 'VALLEJO PLACE PHASE 3'),
  ('SILVER STREET', NULL),
  ('SPCH MAIN', NULL),
  ('SPRINT ROAD', NULL),
  ('SUNFLOWER STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('TEQUILA STREET', 'VALLEJO PLACE PHASE 3 EXTENSION'),
  ('TOPAZ STREET', NULL),
  ('TULIP STREET', NULL),
  ('TURQUOISE STREET', NULL),
  ('VALOR DRIVE', NULL),
  ('VERMOSA BOULEVARD', 'ARDIA VERMOSA'),
  ('VERONICA STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('VINIEGRA STREET', NULL),
  ('VIOLET STREET', 'FAIRGROUNDS VALLEJO PLACE'),
  ('VIOLETA STREET', NULL),
  ('VIRATA STREET', NULL),
  ('VODKA STREET', 'VALLEJO PLACE PHASE 3'),
  ('WILLOWS STREET', 'SUMMER POINTE COUNTRY HOMES'),
  ('ZINNIA STREET', 'FAIRGROUNDS VALLEJO PLACE');
INSERT INTO `address_streets` (`name`, `subdivision_id`, `source`)
SELECT t.`name`, s.`id`, 'osm' FROM `tmp_seed_streets` t
LEFT JOIN `address_subdivisions` s ON s.`name` = t.`subdivision`
WHERE @seed;

-- Values residents already have on file (e.g. ones OpenStreetMap doesn't know).
INSERT IGNORE INTO `address_subdivisions` (`name`, `kind`, `source`)
SELECT DISTINCT UPPER(TRIM(r.`subdivision`)), 'subdivision', 'resident' FROM `residents` r
WHERE @seed AND r.`subdivision` IS NOT NULL AND TRIM(r.`subdivision`) <> '';
INSERT INTO `address_streets` (`name`, `subdivision_id`, `source`)
SELECT DISTINCT UPPER(TRIM(r.`street`)), s.`id`, 'resident' FROM `residents` r
LEFT JOIN `address_subdivisions` s ON s.`name` = UPPER(TRIM(r.`subdivision`))
WHERE @seed AND r.`street` IS NOT NULL AND TRIM(r.`street`) <> ''
  AND NOT EXISTS (SELECT 1 FROM `address_streets` x WHERE x.`name` = UPPER(TRIM(r.`street`)));

DROP TEMPORARY TABLE `tmp_seed_subdivisions`;
DROP TEMPORARY TABLE `tmp_seed_streets`;
