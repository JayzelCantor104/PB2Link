-- Community Issue Map: an "Other" category for problems not on the list.
-- The resident names the problem (custom_label, e.g. "Clogged drainage"),
-- shown on the flag, the lists and the issue page instead of "Other".
-- Stored as typed (public text, like comments and landmarks); screened like
-- them by issue_map.php. Safe to re-run.

ALTER TABLE community_issues
  MODIFY `category` ENUM('streetlight','illegal_dumping','road_damage','flooding','stray_animals','noise','fire_hazard','water','other') NOT NULL;

ALTER TABLE community_issues
  ADD COLUMN IF NOT EXISTS `custom_label` VARCHAR(60) NULL DEFAULT NULL AFTER `category`;
