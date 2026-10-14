# Rebuilding the NOAH flood overlay

`public/data/noah/flood_100yr.png` (+ `.json`) is the Project NOAH 100-year
flood hazard map cropped to Pasong Buaya II, shown by `src/components/DisasterMap.jsx`
("Flood-prone areas") and used to tell a resident the flood level at their spot.

Regenerate it when NOAH publishes new data or the barangay boundary changes.
Run from a scratch folder (the libraries are not project dependencies):

```bash
npm install --no-save pmtiles@3 @mapbox/vector-tile@1 pbf@3
node scripts/noah/extract.mjs src/components/pasongBuaya2Boundary.js flood.geojson
node scripts/noah/rasterize.mjs flood.geojson public/data/noah/flood_100yr.png public/data/noah/flood_100yr.json
```

- `extract.mjs` reads only the zoom-14 tiles around the barangay from the
  BetterGov.ph `flood_100yr.pmtiles` (HTTP range requests, a few hundred KB),
  clipped to each tile's edges.
- `rasterize.mjs` paints them into one transparent PNG (about 3 m per pixel) in
  NOAH's colours: yellow low, orange medium, red high.

Data licence: Open Data Commons Open Database License (ODbL) 1.0. Keep the
attribution to Project NOAH and its contributors (see `public/data/noah/README.txt`).
