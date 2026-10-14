// Turns the extracted NOAH flood polygons into one transparent PNG overlay
// (about 3 m per pixel) plus a small JSON with its bounds.
//   node rasterize.mjs <in.geojson> <out.png> <out.json>
// Pixel colour = NOAH's own scheme: low yellow, medium orange, high red
// (the highest level wins where shapes overlap). Pure Node: scanline polygon
// fill + a hand-written PNG encoder (zlib + CRC32), no native dependencies.
import fs from 'node:fs';
import zlib from 'node:zlib';

const [, , inPath, pngPath, metaPath] = process.argv;
const g = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const [w, s, e, n] = g.bbox;

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos(((s + n) / 2) * Math.PI / 180);
const PX_M = 3;
const W = Math.ceil(((e - w) * M_PER_DEG_LNG) / PX_M);
const H = Math.ceil(((n - s) * M_PER_DEG_LAT) / PX_M);
const level = new Uint8Array(W * H);

const toPx = ([lng, lat]) => [((lng - w) / (e - w)) * W, ((n - lat) / (n - s)) * H];

// Even-odd scanline fill across all rings of a polygon (holes subtract).
for (const f of g.features) {
  const lv = f.properties.level;
  const rings = f.geometry.coordinates.map((r) => r.map(toPx));
  let minY = Infinity, maxY = -Infinity;
  for (const r of rings) for (const [, y] of r) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let py = Math.max(0, Math.floor(minY)); py <= Math.min(H - 1, Math.ceil(maxY)); py++) {
    const yc = py + 0.5;
    const xs = [];
    for (const r of rings) {
      for (let i = 0; i < r.length - 1; i++) {
        const [x1, y1] = r[i], [x2, y2] = r[i + 1];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.round(xs[k])), to = Math.min(W - 1, Math.round(xs[k + 1]) - 1);
      for (let px = from; px <= to; px++) {
        const idx = py * W + px;
        if (lv > level[idx]) level[idx] = lv;
      }
    }
  }
}

// RGBA rows with a filter byte per row.
const COLORS = { 1: [250, 204, 21], 2: [249, 115, 22], 3: [220, 38, 38] };
const raw = Buffer.alloc((W * 4 + 1) * H);
const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const lv = level[y * W + x];
    counts[lv]++;
    const o = y * (W * 4 + 1) + 1 + x * 4;
    if (lv) { const [r, gg, b] = COLORS[lv]; raw[o] = r; raw[o + 1] = gg; raw[o + 2] = b; raw[o + 3] = 255; }
  }
}

const crcTable = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(pngPath, png);

const meta = {
  // Leaflet ImageOverlay bounds: [[south, west], [north, east]]
  bounds: [[s, w], [n, e]],
  width: W,
  height: H,
  metersPerPixel: PX_M,
  colors: { low: COLORS[1], medium: COLORS[2], high: COLORS[3] },
  source: g.source,
  license: g.license,
};
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
const tot = W * H;
console.log(`${W}x${H} px, PNG ${(png.length / 1024).toFixed(0)} KB; share of area: none ${(counts[0] / tot * 100).toFixed(1)}%, low ${(counts[1] / tot * 100).toFixed(1)}%, medium ${(counts[2] / tot * 100).toFixed(1)}%, high ${(counts[3] / tot * 100).toFixed(1)}%`);
