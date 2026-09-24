-- 007_custom_services.sql
--
-- Schema for admin-defined ("custom") services — the Services & Form Builder
-- (src/Admin/AdminServices.jsx, backend/api/services.php) and the resident
-- form that renders them (src/pages/DynamicRequestForm.jsx, submitted to
-- backend/api/submit_service_request.php). These tables were used by the
-- code but never created by any migration or dump, so the feature could not
-- work on a fresh database.
--
-- service_submissions deliberately mirrors the other req_* tables
-- (request_id, tracking_code, resident_id, status, remarks, date_requested)
-- so the existing admin status workflow (update_document_request.php) and
-- the resident's Track Request page handle it like any other request.
--
-- Apply once:
--     mysql -u root barangay_bims < backend/migrations/007_custom_services.sql
-- (PowerShell: Get-Content backend/migrations/007_custom_services.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims)

CREATE TABLE IF NOT EXISTS `services` (
  `service_id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(150) NOT NULL,
  `category` VARCHAR(60) NOT NULL DEFAULT 'Clearance & Certification',
  `description` TEXT DEFAULT NULL,
  `allow_third_party` TINYINT(1) NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`service_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `service_fields` (
  `field_id` INT NOT NULL AUTO_INCREMENT,
  `service_id` INT NOT NULL,
  `step_section` ENUM('Identity','Residency','Uploads','Review') NOT NULL DEFAULT 'Identity',
  `field_label` VARCHAR(150) NOT NULL,
  `field_name` VARCHAR(100) NOT NULL,
  -- text | textarea | number | select | date | time | file | checkbox | radio
  `field_type` VARCHAR(20) NOT NULL DEFAULT 'text',
  `field_options` TEXT DEFAULT NULL,           -- JSON array of choices (select / radio / checkbox)
  `is_required` TINYINT(1) NOT NULL DEFAULT 1,
  -- all | myself_only | someone_else_only
  `show_for_target` VARCHAR(20) NOT NULL DEFAULT 'all',
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`field_id`),
  UNIQUE KEY `uniq_service_field_name` (`service_id`, `field_name`),
  CONSTRAINT `fk_service_fields_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `service_submissions` (
  `request_id` INT NOT NULL AUTO_INCREMENT,
  `tracking_code` VARCHAR(50) NOT NULL,
  `service_id` INT NOT NULL,
  `service_title` VARCHAR(150) NOT NULL,       -- snapshot, in case the service is renamed later
  `resident_id` INT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `request_mode` ENUM('Self','Others') NOT NULL DEFAULT 'Self',
  `fName` VARCHAR(100) NOT NULL,
  `mName` VARCHAR(100) DEFAULT NULL,
  `lName` VARCHAR(100) NOT NULL,
  `suffix` VARCHAR(10) DEFAULT NULL,
  `birth_date` DATE DEFAULT NULL,
  `gender` VARCHAR(10) DEFAULT NULL,
  `civil_status` VARCHAR(20) DEFAULT NULL,
  `address` VARCHAR(255) DEFAULT NULL,
  `contact_num` VARCHAR(20) DEFAULT NULL,
  `beneficiary_name` VARCHAR(255) DEFAULT NULL,
  `form_data` LONGTEXT DEFAULT NULL,           -- JSON: [{ name, label, type, value }] snapshot of the answers
  `valid_id` VARCHAR(255) DEFAULT NULL,        -- required ID upload (path relative to backend/api/)
  `attachments` TEXT DEFAULT NULL,             -- JSON: { field_name: path } for "file" fields
  `status` VARCHAR(30) NOT NULL DEFAULT 'Pending',
  `remarks` TEXT DEFAULT NULL,
  `date_requested` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  UNIQUE KEY `uniq_service_tracking_code` (`tracking_code`),
  KEY `idx_service_submissions_resident` (`resident_id`),
  KEY `idx_service_submissions_service` (`service_id`),
  CONSTRAINT `fk_service_submissions_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`),
  CONSTRAINT `fk_service_submissions_resident` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`resident_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
