// Flood level of every street in Pasong Buaya II, from the Project NOAH
// 100-year flood map the site already uses (public/data/noah/flood_100yr.png).
//
// Inputs: OpenStreetMap street shapes from Overpass (see README.md), the
// barangay boundary and the flood image. Outputs:
//   scripts/streets_flood/street_flood.json   { streets: { "<NAME>": { level, share, length_m } } }
//   backend/migrations/034_street_flood_levels.sql   UPDATEs for address_streets
// level: 0 none, 1 low, 2 medium, 3 high = the highest level covering at least
//        10% of the street's length inside the barangay (and at least 15 m),
//        so one flooded corner doesn't mark a whole long street.
// share: fraction of that length inside any NOAH flood area.
//
//   node scripts/streets_flood/compute.mjs <overpass.json>
// Uses fast-png, already in node_modules (a dependency of the PDF tools).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { decode } = await import(pathToFileURL(path.join(root, 'node_modules/fast-png/lib/index.js')).href);
const { PB2_BOUNDARY } = await import(pathToFileURL(path.join(root, 'src/components/pasongBuaya2Boundary.js')).href);

const osm = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(root, 'public/data/noah/flood_100yr.json'), 'utf8'));
const png = decode(fs.readFileSync(path.join(root, 'public/data/noah/flood_100yr.png')));
const channels = png.channels;

// Same colour rule as floodLevelAt() in src/components/DisasterMap.jsx.
const [[south, west], [north, east]] = meta.bounds;
const levelAt = (lat, lng) => {
  if (lat < south || lat > north || lng < west || lng > east) return 0;
  const x = Math.min(png.width - 1, Math.floor(((lng - west) / (east - west)) * png.width));
  const y = Math.min(png.height - 1, Math.floor(((north - lat) / (north - south)) * png.height));
  const i = (y * png.width + x) * channels;
  const alpha = channels === 4 ? png.data[i + 3] : 255;
  if (alpha < 128) return 0;
  const green = png.data[i + 1];
  if (green > 160) return 1;
  if (green > 70) return 2;
  return 3;
};

const inside = (lat, lng) => {
  let hit = false;
  for (let i = 0, j = PB2_BOUNDARY.length - 1; i < PB2_BOUNDARY.length; j = i++) {
    const [yi, xi] = PB2_BOUNDARY[i];
    const [yj, xj] = PB2_BOUNDARY[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

// Street names compared like the address list stores them (address_common.php):
// upper case, single spaces, no dots.
const key = (name) => String(name).toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
const metres = (a, b) => {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lon - a.lon) * Math.PI) / 180;
  const m = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return r * Math.sqrt(dLat * dLat + dLng * m * (dLng * m));
};

const STEP = 3; // metres, about one pixel of the flood image
const totals = {};
for (const way of osm.elements || []) {
  if (way.type !== 'way' || !way.geometry || !way.tags?.name) continue;
  const name = key(way.tags.name);
  const t = (totals[name] ||= { samples: 0, byLevel: [0, 0, 0, 0] });
  for (let s = 1; s < way.geometry.length; s++) {
    const a = way.geometry[s - 1];
    const b = way.geometry[s];
    const n = Math.max(1, Math.round(metres(a, b) / STEP));
    for (let k = 0; k < n; k++) {
      const lat = a.lat + ((b.lat - a.lat) * (k + 0.5)) / n;
      const lng = a.lon + ((b.lon - a.lon) * (k + 0.5)) / n;
      if (!inside(lat, lng)) continue;
      t.samples++;
      t.byLevel[levelAt(lat, lng)]++;
    }
  }
}

const streets = {};
for (const [name, t] of Object.entries(totals)) {
  if (t.samples < 3) continue; // outside the barangay
  let level = 0;
  for (let l = 3; l >= 1; l--) {
    const atLeast = t.byLevel.slice(l).reduce((x, y) => x + y, 0);
    if (atLeast >= t.samples * 0.1 && atLeast * STEP >= 15) { level = l; break; }
  }
  const flooded = t.samples - t.byLevel[0];
  streets[name] = { level, share: Math.round((flooded / t.samples) * 100) / 100, length_m: t.samples * STEP };
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  rule: 'level = highest NOAH 100-year flood level covering at least 10% (and 15 m) of the street inside the barangay',
  source: 'Street shapes: OpenStreetMap contributors (ODbL). Flood hazard: Project NOAH 100-year map (ODbL).',
  streets: Object.fromEntries(Object.entries(streets).sort(([a], [b]) => a.localeCompare(b))),
};
fs.writeFileSync(path.join(root, 'scripts/streets_flood/street_flood.json'), JSON.stringify(out, null, 1) + '\n');

// Streets are matched by name the way address_common.php stores them (ALL
// CAPS, single spaces), ignoring dots. A name used by two subdivisions gets
// the level of all its OSM pieces together. Streets with no shape stay NULL
// ("not mapped yet").
const sqlStr = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
const sql = [
  '-- 034_street_flood_levels.sql',
  '--',
  `-- GENERATED by scripts/streets_flood/compute.mjs on ${out.generated}; do not edit by hand.`,
  '-- Flood level of each street from the Project NOAH 100-year flood map',
  `-- (needs 033_preparedness.sql). Rule: ${out.rule}.`,
  `-- ${out.source}`,
  '-- Safe to re-run.',
  '',
  ...Object.entries(out.streets).map(([name, s]) =>
    `UPDATE address_streets SET flood_level = ${s.level}, flood_share = ${s.share.toFixed(2)}, flood_checked_at = '${out.generated}' WHERE REPLACE(name, '.', '') = ${sqlStr(name)};`),
  '',
];
fs.writeFileSync(path.join(root, 'backend/migrations/034_street_flood_levels.sql'), sql.join('\n'));
const counts = [0, 0, 0, 0];
Object.values(streets).forEach((s) => counts[s.level]++);
console.log(`${Object.keys(streets).length} streets inside the barangay: none ${counts[0]}, low ${counts[1]}, medium ${counts[2]}, high ${counts[3]}`);
