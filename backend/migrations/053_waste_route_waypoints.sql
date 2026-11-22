-- 053_waste_route_waypoints.sql
--
-- Easier garbage truck routes (src/components/WasteRouteEditor.jsx).
--
--  * route_waypoints: the few points staff place (start, stops, end) as a
--    JSON list of [lat, lng]. The route between them is found along the
--    streets, and saved as before in route_coordinates (now up to 3,000
--    points, because it follows every bend of the streets).
--  * route_streets: the street names the route passes, in order (JSON list),
--    so residents can look up their street and the written route can be
--    filled in from the map.
--
-- Older routes keep working without them: the editor turns a saved route into
-- draggable points when it is opened.
--
-- Additive and safe to re-run:
--     Get-Content backend/migrations/053_waste_route_waypoints.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims

ALTER TABLE `waste_schedules`
    ADD COLUMN IF NOT EXISTS `route_waypoints` LONGTEXT NULL AFTER `route_coordinates`,
    ADD COLUMN IF NOT EXISTS `route_streets` TEXT NULL AFTER `route_waypoints`;
