-- 001_admin_audit_log.sql
--
-- Table backing the admin activity audit log (backend/api/audit_log.php writes
-- it, backend/api/get_audit_log.php reads it). Apply once against the
-- barangay_bims database:
--
--     mysql -u root barangay_bims < backend/migrations/001_admin_audit_log.sql
--
-- Column widths intentionally mirror the truncation done in
-- pb2_log_admin_action(): description and user_agent are cut to 255 chars and
-- target_entity_id to 64 before insert, so an over-long value is trimmed rather
-- than rejected.
--
-- actor_admin_id deliberately carries NO foreign key to admins.admin_id. An
-- audit trail has to outlive the account that produced it -- a FK would either
-- cascade the history away when an admin is deleted, or block the delete
-- outright. actor_username / actor_role are denormalised into each row for the
-- same reason: the record stays readable after the account is gone.

CREATE TABLE IF NOT EXISTS `admin_audit_log` (
  `log_id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_type`         VARCHAR(64)  NOT NULL,
  `actor_admin_id`     INT(11)      DEFAULT NULL,
  `actor_username`     VARCHAR(100) NOT NULL,
  `actor_role`         ENUM('Super','Admin','Viewer') NOT NULL,
  `target_entity_type` VARCHAR(64)  DEFAULT NULL,
  `target_entity_id`   VARCHAR(64)  DEFAULT NULL,
  `description`        VARCHAR(255) NOT NULL,
  `changed_fields`     JSON         DEFAULT NULL,
  `outcome`            ENUM('success','failure') NOT NULL DEFAULT 'success',
  `ip_address`         VARCHAR(45)  DEFAULT NULL,
  `user_agent`         VARCHAR(255) DEFAULT NULL,
  `created_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_actor` (`actor_admin_id`),
  KEY `idx_event_type` (`event_type`),
  KEY `idx_target` (`target_entity_type`, `target_entity_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
