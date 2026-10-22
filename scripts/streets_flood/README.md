# Street flood levels

Works out each street's flood level from the Project NOAH 100-year flood map
the site already ships (`public/data/noah/flood_100yr.png`), so residents see
their street's risk and staff can sort the vulnerable-residents list by it.

1. Download the named streets inside the flood map's box from Overpass
   (OpenStreetMap, ODbL) and save the JSON outside the project:

   ```
   [out:json][timeout:80];
   way["highway"]["name"](14.356728,120.949728,14.402973,120.987993);
   out geom;
   ```

   POST it to `https://overpass-api.de/api/interpreter` (form field `data`).

2. Run `node scripts/streets_flood/compute.mjs <saved.json>`. It writes
   `street_flood.json` here (the record) and regenerates
   `backend/migrations/034_street_flood_levels.sql`.

3. Apply `034_street_flood_levels.sql`.

Rule: the street's level is the highest NOAH level (1 low, 2 medium, 3 high)
covering at least 10% of its length inside the barangay, and at least 15 m,
sampled every 3 m (one pixel of the flood map). `flood_share` is the share of
its length in any flood area. Streets with no OpenStreetMap shape, or added
by staff later, stay "not mapped yet" until the script is run again.

This is a model of a 100-year flood, not a record of past floods: staff
should still correct it with what the barangay knows.
