-- Manual garbage collection routes use ordered map points inside PB2.
-- Existing schedules remain valid and can be plotted when staff next edit them.
ALTER TABLE waste_schedules
    ADD COLUMN route_coordinates LONGTEXT NULL AFTER truck_route;
