-- 039_issue_map_case.sql
--
-- Public issue-map comments and landmarks are stored as typed (posted without
-- names, see 035). This puts the one comment and landmark that migration 016
-- had capitalised into sentence case. Only the case changes: the resident's
-- wording is kept as written. Each row is matched by its id AND its exact
-- current text, so anything edited since is left alone. Safe to re-run.

UPDATE `community_issue_reports`
   SET `comment` = 'There are residents here who dispose garbages in inproper areas. Please do an action.'
 WHERE `report_id` = 359
   AND BINARY `comment` = BINARY 'THERE ARE RESIDENTS HERE WHO DISPOSE GARBAGES IN INPROPER AREAS. PLEASE DO AN ACTION.';

UPDATE `community_issues` SET `landmark` = 'Near Bangbang'
 WHERE `issue_id` = 216 AND BINARY `landmark` = BINARY 'NEAR BANGBANG';
