// Extracts Project NOAH 100-year flood hazard polygons around Pasong Buaya II
// from the flood_100yr PMTiles (zoom 14), clipped to each tile's own bounds so
// neighbouring tiles don't overlap, and writes a compact GeoJSON.
//   node extract.mjs <boundary.js path> <out.geojson>
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const [, , boundaryPath, outPath] = process.argv;
const { PB2_BOUNDARY } = await import(pathToFileURL(boundaryPath).href);

const URL = 'https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps/resolve/main/PMTiles/layers/flood_100yr.pmtiles';
const Z = 14;

// Barangay bounds padded by 25% (same as the map's pan limit).
const lats = PB2_BOUNDARY.map((p) => p[0]);
const lngs = PB2_BOUNDARY.map((p) => p[1]);
let [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
const padLat = (n - s) * 0.25, padLng = (e - w) * 0.25;
[s, n, w, e] = [s - padLat, n + padLat, w - padLng, e + padLng];

const lon2x = (lon) => ((lon + 180) / 360) * 2 ** Z;
const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z; };
const x2lon = (x) => (x / 2 ** Z) * 360 - 180;
const y2lat = (y) => { const k = Math.PI - (2 * Math.PI * y) / 2 ** Z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))); };

const x0 = Math.floor(lon2x(w)), x1 = Math.floor(lon2x(e));
const y0 = Math.floor(lat2y(n)), y1 = Math.floor(lat2y(s));
console.log(`bbox lat ${s.toFixed(5)}..${n.toFixed(5)} lng ${w.toFixed(5)}..${e.toFixed(5)}; tiles x ${x0}-${x1}, y ${y0}-${y1}`);

// Sutherland-Hodgman clip of one ring to a lng/lat rectangle.
const clipRing = (ring, [minX, minY, maxX, maxY]) => {
  const edges = [
    (p) => p[0] >= minX, (p) => p[0] <= maxX, (p) => p[1] >= minY, (p) => p[1] <= maxY,
  ];
  const cut = [
    (a, b) => [minX, a[1] + ((b[1] - a[1]) * (minX - a[0])) / (b[0] - a[0])],
    (a, b) => [maxX, a[1] + ((b[1] - a[1]) * (maxX - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (minY - a[1])) / (b[1] - a[1]), minY],
    (a, b) => [a[0] + ((b[0] - a[0]) * (maxY - a[1])) / (b[1] - a[1]), maxY],
  ];
  let out = ring;
  for (let k = 0; k < 4 && out.length; k++) {
    const input = out; out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      const ci = edges[k](cur), pi = edges[k](prev);
      if (ci) { if (!pi) out.push(cut[k](prev, cur)); out.push(cur); }
      else if (pi) out.push(cut[k](prev, cur));
    }
  }
  return out.length >= 3 ? out : null;
};

const round = (v) => Math.round(v * 1e6) / 1e6;
const p = new PMTiles(URL);
const features = [];
let tiles = 0;
for (let x = x0; x <= x1; x++) {
  for (let y = y0; y <= y1; y++) {
    const res = await p.getZxy(Z, x, y);
    if (!res) continue;
    tiles++;
    const vt = new VectorTile(new Pbf(new Uint8Array(res.data)));
    const layer = vt.layers.flood_100yr;
    if (!layer) continue;
    const box = [x2lon(x), y2lat(y + 1), x2lon(x + 1), y2lat(y)];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i).toGeoJSON(x, y, Z);
      const level = Number(f.properties.Var);
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      for (const poly of polys) {
        const rings = poly.map((r) => clipRing(r.slice(0, -1), box)).filter(Boolean);
        if (!rings.length || !clipRing(poly[0].slice(0, -1), box)) continue;
        features.push({
          type: 'Feature',
          properties: { level },
          geometry: { type: 'Polygon', coordinates: rings.map((r) => [...r, r[0]].map(([lo, la]) => [round(lo), round(la)])) },
        });
      }
    }
  }
}

const out = {
  type: 'FeatureCollection',
  // Attribution and license travel with the data (ODbL share-alike).
  source: 'Project NOAH 100-year rain return flood hazard map (PAGASA / UP NOAH Center), via data.bettergov.ph PMTiles (flood_100yr, zoom 14)',
  license: 'Open Data Commons Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1.0/',
  levels: { 1: 'Low (up to 0.5 m)', 2: 'Medium (0.5-1.5 m)', 3: 'High (over 1.5 m)' },
  bbox: [round(w), round(s), round(e), round(n)],
  features,
};
fs.writeFileSync(outPath, JSON.stringify(out));
const counts = features.reduce((c, f) => ((c[f.properties.level] = (c[f.properties.level] || 0) + 1), c), {});
console.log(`tiles read ${tiles}, polygons ${features.length}, by level ${JSON.stringify(counts)}, size ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
