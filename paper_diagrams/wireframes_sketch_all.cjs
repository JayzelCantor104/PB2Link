// Hand-drawn versions of the other seven PB2Link wireframes. It reuses the screen layouts in wireframes.cjs
// and swaps its drawing primitives and frame for hand-drawn ones (same style as wireframes_sketch.cjs, which
// draws the Home page). Run: node wireframes_sketch_all.cjs  (writes wireframes_sketch/svg and /jsx)
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'wireframes.cjs'), 'utf8');
const cut = (a, b) => [src.indexOf(a), b ? src.indexOf(b) : src.length];
const [p0, p1] = cut('// ---------- primitives ----------', '// ---------- page chrome ----------');
const [c0] = cut('// ---------- composition ----------');
const stepperSrc = src.slice(src.indexOf('function stepper('), p1);

const SKETCH = String.raw`
// ---------- hand-drawn primitives (same names and arguments as wireframes.cjs) ----------
const K = '#1F2A55', SFONT = "'Ink Free', 'Segoe Print', 'Comic Sans MS', cursive";
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const jit = a => (rnd() * 2 - 1) * a;
const dashAttr = d => d ? ' stroke-dasharray="' + d + '"' : '';
function stroke(x1, y1, x2, y2, sw = 1.7, dash) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const o = Math.min(3, len * 0.012), over = Math.min(4, len * 0.02);
  const ax = x1 - ux * jit(over) + jit(0.8), ay = y1 - uy * jit(over) + jit(0.8);
  const bx = x2 + ux * jit(over) + jit(0.8), by = y2 + uy * jit(over) + jit(0.8);
  const mx = (ax + bx) / 2 - uy * jit(o), my = (ay + by) / 2 + ux * jit(o);
  return '<path d="M' + ax.toFixed(1) + ',' + ay.toFixed(1) + ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + bx.toFixed(1) + ',' + by.toFixed(1) +
    '" fill="none" stroke="' + K + '" stroke-width="' + sw + '" stroke-linecap="round"' + dashAttr(dash) + '/>';
}
function outline(pts, sw = 1.7, dash, fill) {
  const ph = rnd() * 6, amp = 1.1;
  const p = pts.map(([x, y], i) => [x + Math.sin(i * 0.35 + ph) * amp + jit(0.35), y + Math.cos(i * 0.31 + ph) * amp + jit(0.35)]);
  if (!fill) p.push([p[0][0] + jit(2), p[0][1] + jit(2)], [p[1][0] + jit(1.5), p[1][1] + jit(1.5)]);
  return '<polyline points="' + p.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ') + '" fill="' + (fill || 'none') + '" stroke="' + K +
    '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"' + dashAttr(dash) + '/>';
}
function rrPts(x, y, w, h, r) {
  r = Math.max(2, Math.min(r, w / 2, h / 2));
  const pts = [], step = 6;
  const edge = (x1, y1, x2, y2) => { const l = Math.hypot(x2 - x1, y2 - y1), k = Math.max(1, Math.round(l / step)); for (let i = 0; i < k; i++) pts.push([x1 + (x2 - x1) * i / k, y1 + (y2 - y1) * i / k]); };
  const arc = (cx, cy, a0) => { for (let i = 0; i < 6; i++) { const a = a0 + i * Math.PI / 12; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  edge(x + r, y, x + w - r, y); arc(x + w - r, y + r, -Math.PI / 2);
  edge(x + w, y + r, x + w, y + h - r); arc(x + w - r, y + h - r, 0);
  edge(x + w - r, y + h, x + r, y + h); arc(x + r, y + h - r, Math.PI / 2);
  edge(x, y + h - r, x, y + r); arc(x + r, y + r, Math.PI);
  return pts;
}
const ringPts = (cx, cy, r) => { const n = Math.max(14, Math.round(r * 1.6)); return Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }); };
const sw2 = sw => (sw >= 2.5 ? 2.4 : sw >= 2 ? 2 : 1.6);

function R(x, y, w, h, o = {}) {
  const { fill = C.white, stroke: st = C.line, sw = 1.5, rx = 6, dash } = o;
  if (st === 'none' && fill === C.light && h <= 10) return stroke(x, y + h / 2, x + w, y + h / 2, 1.4);   // small bar (rainfall)
  if (st === 'none') return '';                                   // page backgrounds and decoration
  if (fill === C.dark && w <= 20 && h <= 20) return outline(rrPts(x, y, w, h, rx), 1.4, null, K);
  return outline(rrPts(x, y, w, h, rx), sw2(sw), dash);
}
function T(x, y, s, o = {}) {
  const { size = 15, weight = 'normal', anchor = 'start', color = C.ink, italic = false } = o;
  const faded = color === C.mid || color === C.line;
  return '<text x="' + x + '" y="' + y + '" font-family="' + SFONT + '" font-size="' + (size * 1.1).toFixed(1) + '" font-weight="' + weight + '" text-anchor="' + anchor +
    '" fill="' + K + '"' + (faded ? ' fill-opacity="0.7"' : '') + (italic ? ' font-style="italic"' : '') + '>' + esc(s) + '</text>';
}
function L(pts, o = {}) {
  const { sw = 1.5, dash } = o; let s = '';
  for (let i = 1; i < pts.length; i++) s += stroke(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], sw2(sw), dash);
  return s;
}
function circ(cx, cy, r, o = {}) {
  const { fill = C.white, stroke: st = C.line, sw = 1.5 } = o;
  if (st === 'none') return '';
  if (fill === C.dark && r <= 8) return outline(ringPts(cx, cy, r), 1.2, null, K);
  return outline(ringPts(cx, cy, r), sw2(sw), null, r > 8 ? '#FFFFFF' : null);
}
function bars(x, y, w, n = 2, o = {}) {
  const { h = 9, gap = 9, last = 0.6 } = o; let s = '';
  for (let i = 0; i < n; i++) { const yy = y + i * (h + gap) + h / 2; s += stroke(x, yy, x + (i === n - 1 && n > 1 ? w * last : w), yy, 1.4); }
  return s;
}
function img(x, y, w, h, label, o = {}) {
  const { size = 14 } = o;
  let s = outline(rrPts(x, y, w, h, 3), 1.6) + stroke(x + 3, y + 3, x + w - 3, y + h - 3, 1.2) + stroke(x + w - 3, y + 3, x + 3, y + h - 3, 1.2);
  if (label) {
    const ls = Array.isArray(label) ? label : [label];
    const lw = Math.max(...ls.map(l => tw(l, size))) + 20, lh = ls.length * (size + 4) + 12;
    s += '<rect x="' + (x + w / 2 - lw / 2) + '" y="' + (y + h / 2 - lh / 2) + '" width="' + lw + '" height="' + lh + '" fill="#FFFFFF"/>';
    ls.forEach((l, i) => { s += T(x + w / 2, y + h / 2 - lh / 2 + 6 + (i + 1) * (size + 4) - 4, l, { size, anchor: 'middle' }); });
  }
  return s;
}
function btn(x, y, w, h, label, dark = false, size = 15) {
  return outline(rrPts(x, y, w, h, 7), dark ? 2.4 : 1.6) + T(x + w / 2, y + h / 2 + size * 0.38, label, { size, weight: 'bold', anchor: 'middle' });
}
function inp(x, y, w, h, ph, o = {}) {
  const { size = 15, select = false, icon = false } = o;
  let s = outline(rrPts(x, y, w, h, 4), 1.6);
  const tx = icon ? x + 38 : x + 12;
  if (icon) s += circ(x + 19, y + h / 2 - 2, 7) + stroke(x + 24, y + h / 2 + 3, x + 29, y + h / 2 + 8, 1.6);
  s += T(tx, y + h / 2 + size * 0.36, ph, { size, color: C.mid });
  if (select) s += T(x + w - 14, y + h / 2 + size * 0.36, 'v', { size, anchor: 'end' });
  return s;
}
function lbl(x, y, s, size = 14) { return T(x, y, s, { size, weight: 'bold' }); }
function chip(x, y, label, on = false, size = 14) {
  const w = tw(label, size) + 28;
  return { w, svg: outline(rrPts(x, y, w, 30, 15), on ? 2.4 : 1.5) + T(x + w / 2, y + 20, label, { size, anchor: 'middle', weight: on ? 'bold' : 'normal' }) };
}
function chips(x, y, labels, onIdx = -1, maxX = 1e9, size = 14, gap = 8) {
  let s = '', cx = x, cy = y;
  labels.forEach((l, i) => { const w = tw(l, size) + 28; if (cx + w > maxX && cx > x) { cx = x; cy += 38; } const c = chip(cx, cy, l, i === onIdx, size); s += c.svg; cx += c.w + gap; });
  return s;
}
function pill(x, y, label, o = {}) {
  const { size = 12, dark = false, anchor = 'start' } = o;
  const w = tw(label, size, true) + 18, x0 = anchor === 'end' ? x - w : x;
  return outline(rrPts(x0, y, w, 22, 11), dark ? 2.2 : 1.3) + T(x0 + w / 2, y + 15, label, { size, weight: 'bold', anchor: 'middle' });
}
function card(x, y, w, h, title, o = {}) {
  const { size = 17 } = o;
  return outline(rrPts(x, y, w, h, 8), 1.6) + (title ? T(x + 18, y + 30, title, { size, weight: 'bold' }) : '');
}
function ico(cx, cy, r = 9) { return circ(cx, cy, r, { sw: 1.2 }); }
function radio(x, y, label, on, size = 15) {
  return circ(x + 8, y - 5, 8) + (on ? circ(x + 8, y - 5, 4, { fill: C.dark, stroke: C.dark }) : '') + T(x + 24, y, label, { size });
}
function check(x, y, label, on = true, size = 14) {
  return outline(rrPts(x, y - 13, 15, 15, 2), 1.4) + (on ? T(x + 7.5, y - 1, '✓', { size: 13, anchor: 'middle', weight: 'bold' }) : '') + T(x + 23, y, label, { size });
}
function flag(x, y, shade) {
  const v = parseInt(shade.slice(1, 3), 16) / 255, op = (1 - v) * 1.4;
  return stroke(x, y, x, y - 26, 2) + outline(rrPts(x, y - 26, 16, 11, 1), 1.3, null, 'rgba(31,42,85,' + Math.min(0.95, op + 0.05).toFixed(2) + ')');
}
`;

const COMPOSE = String.raw`
// ---------- hand-drawn laptop and phone ----------
const BZ = 22, MG = 40, LX = MG + 30, LY = 100, LW = DW + BZ * 2, LH = DH + 36 + BZ * 2;
const PX = LX + LW + 90, PY = 120, PBW = PW + 28, PBH = PH + 130, CW = PX + PBW + MG, CH = LY + LH + 90;
function compose(sc) {
  const s = ['<rect width="' + CW + '" height="' + CH + '" fill="#FFFFFF"/>'];
  s.push(T(MG, 52, sc.title, { size: 26, weight: 'bold' }), T(LX, LY - 18, 'Laptop', { size: 17, weight: 'bold' }), T(PX, PY - 18, 'Phone', { size: 17, weight: 'bold' }));
  s.push(outline(rrPts(LX, LY, LW, LH, 18), 2.2), circ(LX + LW / 2, LY + BZ / 2, 3.5, { sw: 1.2 }));
  const sx = LX + BZ, sy = LY + BZ;
  s.push(outline(rrPts(sx, sy, DW, DH + 36, 3), 1.7), stroke(sx, sy + 36, sx + DW, sy + 36));
  [20, 38, 56].forEach(x => s.push(circ(sx + x, sy + 18, 5, { sw: 1.2 })));
  s.push(outline(rrPts(sx + 84, sy + 7, 520, 22, 11), 1.5), T(sx + 100, sy + 23, sc.url, { size: 12 }));
  s.push('<clipPath id="' + sc.file + '-d"><rect width="' + DW + '" height="' + DH + '"/></clipPath><g transform="translate(' + sx + ',' + (sy + 36) + ')"><g clip-path="url(#' + sc.file + '-d)">' + sc.desktop() + '</g></g>');
  const by = LY + LH;
  s.push(stroke(LX - 50, by + 30, LX + LW + 50, by + 30, 2.2), stroke(LX - 50, by + 30, LX, by, 2.2), stroke(LX + LW, by, LX + LW + 50, by + 30, 2.2));
  s.push(stroke(LX - 50, by + 30, LX - 44, by + 44, 2), stroke(LX - 44, by + 44, LX + LW + 44, by + 44, 2), stroke(LX + LW + 44, by + 44, LX + LW + 50, by + 30, 2));
  s.push(outline(rrPts(LX + LW / 2 - 90, by + 6, 180, 14, 7), 1.5));
  s.push(outline(rrPts(PX, PY, PBW, PBH, 38), 2.2), outline(rrPts(PX + PBW / 2 - 34, PY + 26, 68, 7, 3.5), 1.5), circ(PX + PBW / 2 - 52, PY + 29, 4, { sw: 1.2 }));
  s.push(outline(rrPts(PX + 14, PY + 52, PW, PH, 3), 1.7), circ(PX + PBW / 2, PY + PBH - 38, 18, { sw: 2 }));
  s.push('<clipPath id="' + sc.file + '-p"><rect width="' + PW + '" height="' + PH + '"/></clipPath><g transform="translate(' + (PX + 14) + ',' + (PY + 52) + ')"><g clip-path="url(#' + sc.file + '-p)">' + sc.phone() + '</g></g>');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + CW + '" height="' + CH + '" viewBox="0 0 ' + CW + ' ' + CH + '">' + s.join('') + '</svg>';
}
module.exports = { SCREENS, compose };
`;

const code = src.slice(0, p0) + SKETCH + stepperSrc + src.slice(p1, c0) + COMPOSE;
const m = new module.constructor(path.join(__dirname, 'wireframes.cjs'));
m.paths = module.paths;
m._compile(code, path.join(__dirname, 'wireframes.cjs'));
const { SCREENS, compose } = m.exports;

const root = path.join(__dirname, 'wireframes_sketch');
for (const d of ['svg', 'png', 'jsx']) fs.mkdirSync(path.join(root, d), { recursive: true });
for (const sc of SCREENS) {
  if (sc.file === 'wf_home') continue;            // the Home page is drawn by wireframes_sketch.cjs
  const svg = compose(sc), name = sc.file.replace(/^wf_/, 'wfs_');
  fs.writeFileSync(path.join(root, 'svg', name + '.svg'), svg);
  const comp = sc.file.replace(/^wf_/, '').split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('') + 'SketchWireframe';
  const jsx = svg.replace(/ (font-family|font-size|font-weight|font-style|fill-opacity|text-anchor|stroke-width|stroke-dasharray|stroke-linecap|stroke-linejoin|clip-path)=/g, (x, a) => ' ' + a.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + '=')
    .replace(/fontFamily="([^"]*)"/g, (x, f) => 'fontFamily={"' + f + '"}').replace(/></g, '>\n<');
  fs.writeFileSync(path.join(root, 'jsx', comp + '.jsx'), '// Hand-drawn style wireframe of PB2Link: ' + sc.title + '. Generated by paper_diagrams/wireframes_sketch_all.cjs.\nexport default function ' + comp + '() {\n  return (\n' + jsx + '\n  );\n}\n');
  console.log(name, '->', comp + '.jsx');
}
