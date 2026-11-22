// Builds public/data/pb2_roads.json ([id, name, [[lat, lng], ...]] per street): the streets the garbage Route Map snaps to
// (src/components/WasteRouteMap.jsx), so plotting a route doesn't depend on the
// free OpenStreetMap street servers being up.
//
// 1. Download the streets around the barangay from any Overpass server, e.g.
//    https://maps.mail.ru/osm/tools/overpass/api/interpreter, with this query:
//      [out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track)$"](14.3624,120.9541,14.3973,120.9836);out geom qt;
//    (the box is the barangay boundary plus about 200 m)
// 2. node scripts/roads/build.mjs <overpass.json>
//
// Street data: (c) OpenStreetMap contributors, ODbL. Rebuild when streets change.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/roads/build.mjs <overpass.json>');
  process.exit(1);
}
const data = JSON.parse(readFileSync(input, 'utf8'));
const round = (value) => Math.round(value * 1e6) / 1e6; // about 0.1 m
const roads = (data.elements || [])
  .filter((element) => element.type === 'way' && Array.isArray(element.geometry))
  .map((element) => [element.id, element.tags?.name || null, element.geometry.map(({ lat, lon }) => [round(lat), round(lon)])])
  .filter(([, , coordinates]) => coordinates.length >= 2);
if (roads.length < 100) {
  console.error(`Only ${roads.length} streets found: the download looks incomplete.`);
  process.exit(1);
}
const out = {
  source: 'OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright',
  osm_date: data.osm3s?.timestamp_osm_base || null,
  roads,
};
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/pb2_roads.json', JSON.stringify(out));
console.log(`Saved ${roads.length} streets to public/data/pb2_roads.json`);
