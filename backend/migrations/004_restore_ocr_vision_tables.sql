-- 004_restore_ocr_vision_tables.sql
--
-- Re-creates ocr_scan_attempts and ocr_vision_usage, dropped by
-- 002_drop_ocr_backend_tables.sql when the ID scanner moved to client-side
-- Tesseract.js (which needed neither). The scanner has since moved back to
-- a server-side Google Cloud Vision call (backend/api/ocr_id.php) now that
-- the barangay has completed Google Cloud billing setup under its own
-- official account — these tables rate-limit and cost-cap that endpoint,
-- which now incurs real (if small) usage cost. Apply once:
--
--     mysql -u root barangay_bims < backend/migrations/004_restore_ocr_vision_tables.sql
--
-- Does NOT touch residents.id_ocr_snapshot / id_ocr_confidence /
-- id_verification_status (added by 003) — those store the scan-vs-submission
-- verification result computed in register.php, unrelated to which OCR
-- engine produced the scan.

CREATE TABLE IF NOT EXISTS `ocr_scan_attempts` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip_address`  VARCHAR(45) NOT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ip_created` (`ip_address`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `ocr_vision_usage` (
  `usage_month` CHAR(7) NOT NULL,
  `call_count`  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`usage_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
