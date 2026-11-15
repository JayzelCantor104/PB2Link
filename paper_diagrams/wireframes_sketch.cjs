// Hand-drawn style wireframe of PB2Link (Home page): wobbly ink lines and a handwriting font (Ink Free),
// shown on a hand-drawn laptop and phone. Same layout as wireframes_line.cjs.
// Run: node wireframes_sketch.cjs  (writes wireframes_sketch/svg and wireframes_sketch/jsx)
const fs = require('fs');
const path = require('path');

const K = '#1F2A55', FONT = "'Ink Free', 'Segoe Print', 'Comic Sans MS', cursive", SW = 1.7;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// seeded random so every run draws the same wobble
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const jit = a => (rnd() * 2 - 1) * a;

// a slightly curved, slightly overshooting stroke between two points
function stroke(x1, y1, x2, y2, sw = SW) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const o = Math.min(3, len * 0.012), over = Math.min(4, len * 0.02);
  const ax = x1 - ux * jit(over) + jit(0.8), ay = y1 - uy * jit(over) + jit(0.8);
  const bx = x2 + ux * jit(over) + jit(0.8), by = y2 + uy * jit(over) + jit(0.8);
  const mx = (ax + bx) / 2 - uy * jit(o), my = (ay + by) / 2 + ux * jit(o);
  return `<path d="M${ax.toFixed(1)},${ay.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}" fill="none" stroke="${K}" stroke-width="${sw}" stroke-linecap="round"/>`;
}
// closed hand-drawn outline through sampled points (rounded rectangle or ellipse)
function outline(pts, sw = SW) {
  const n = pts.length, ph = rnd() * 6, amp = 1.1;
  const p = pts.map(([x, y], i) => [x + Math.sin(i * 0.35 + ph) * amp + jit(0.35), y + Math.cos(i * 0.31 + ph) * amp + jit(0.35)]);
  p.push([p[0][0] + jit(2), p[0][1] + jit(2)], [p[1][0] + jit(1.5), p[1][1] + jit(1.5)]);   // pen overlaps the start
  return `<polyline points="${p.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}" fill="none" stroke="${K}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
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
const box = (x, y, w, h, rx = 3, sw = SW) => outline(rrPts(x, y, w, h, rx), sw);
const ln = (x1, y1, x2, y2, sw = SW) => stroke(x1, y1, x2, y2, sw);
const ring = (cx, cy, r, sw = SW) => { const n = Math.max(14, Math.round(r * 1.6)); return outline(Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }), sw); };
const txt = (x, y, s, size = 15, o = {}) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${(size * 1.12).toFixed(1)}" font-weight="${o.bold ? 'bold' : 'normal'}" text-anchor="${o.anchor || 'start'}" fill="${K}">${esc(s)}</text>`;
const xbox = (x, y, w, h, label, size = 14) => box(x, y, w, h) + ln(x + 3, y + 3, x + w - 3, y + h - 3, 1.3) + ln(x + w - 3, y + 3, x + 3, y + h - 3, 1.3) +
  (label ? `<rect x="${x + w / 2 - label.length * size * 0.3 - 8}" y="${y + h / 2 - size}" width="${label.length * size * 0.6 + 16}" height="${size * 1.6}" fill="#FFFFFF"/>` + txt(x + w / 2, y + h / 2 + size * 0.35, label, size, { anchor: 'middle' }) : '');
const lines = (x, y, w, n = 2, gap = 14) => Array.from({ length: n }, (_, i) => ln(x, y + i * gap, x + (i === n - 1 && n > 1 ? w * 0.6 : w), y + i * gap, 1.4)).join('');
const button = (x, y, w, h, label, size = 14) => box(x, y, w, h, 5) + txt(x + w / 2, y + h / 2 + size * 0.38, label, size, { anchor: 'middle', bold: true });
const field = (x, y, w, h, label, size = 13) => box(x, y, w, h, 3) + ring(x + 18, y + h / 2 - 1, 6, 1.4) + ln(x + 22, y + h / 2 + 3, x + 27, y + h / 2 + 8, 1.4) + txt(x + 36, y + h / 2 + size * 0.38, label, size);
const tab = (x, y, label, size = 13) => { const w = label.length * size * 0.56 + 22; return { w, s: box(x, y, w, 26, 13) + txt(x + w / 2, y + 18, label, size, { anchor: 'middle' }) }; };
const tile = (x, y, w, h, title, size = 15, n = 2) => box(x, y, w, h, 4) + txt(x + 14, y + 27, title, size, { bold: true }) + lines(x + 14, y + 50, w - 28, n);

// ---------- desktop content (1040 x 700) ----------
function desktop() {
  const s = [];
  s.push(ln(0, 60, 1040, 60), ring(36, 30, 15), txt(60, 27, 'Pasong Buaya II', 15, { bold: true }), txt(60, 44, 'Digital Barangay Portal', 11));
  [['Home', 380], ['Services v', 450], ['Community v', 545], ['About', 665]].forEach(([n, x]) => s.push(txt(x, 36, n, 15)));
  s.push(ln(378, 43, 424, 43, 2), txt(842, 36, 'Log In', 15, { bold: true }), button(912, 15, 104, 32, 'Register'));
  s.push(ln(0, 360, 1040, 360));
  s.push(box(60, 84, 240, 28, 14), txt(180, 103, 'Official Government Portal', 12, { anchor: 'middle' }));
  s.push(txt(60, 166, 'Governance at', 38, { bold: true }), txt(60, 210, 'Your Fingertips.', 38, { bold: true }), lines(60, 238, 420, 2));
  s.push(field(60, 268, 470, 44, 'What do you need today? Try "clearance" or a tracking code'));
  s.push(txt(60, 338, 'New here? Create an account  |  Already registered? Log in', 13));
  s.push(xbox(565, 84, 190, 250, 'Live map'));
  ['Advisory', 'Weather', 'Garbage today', 'Open issues'].forEach((k, i) => {
    const x = 775 + (i % 2) * 130, y = 100 + Math.floor(i / 2) * 104;
    s.push(box(x, y, 122, 92, 5), ring(x + 20, y + 24, 9), txt(x + 12, y + 56, k, 12, { bold: true }), lines(x + 12, y + 72, 96, 1));
  });
  s.push(txt(30, 395, 'Thursday, November 12, 2026', 12), txt(30, 432, 'My Barangay', 26, { bold: true }), lines(220, 425, 240, 1), button(640, 404, 120, 34, 'Customize'));
  s.push(tile(30, 452, 470, 104, 'Advisory', 15, 2), tile(515, 452, 245, 104, 'Weather today', 15, 2));
  s.push(tile(30, 570, 230, 120, 'My Requests', 15, 3), tile(272, 570, 228, 120, 'My street', 15, 3), tile(515, 570, 245, 120, 'Garbage today', 15, 3));
  s.push(box(778, 378, 242, 312, 5), txt(794, 406, 'Announcements', 16, { bold: true }));
  let cx = 794; ['All', 'Unread', 'For me'].forEach(l => { const t = tab(cx, 422, l); s.push(t.s); cx += t.w + 6; });
  [470, 528, 586].forEach(y => s.push(ring(802, y + 2, 4, 1.4), lines(814, y, 188, 2, 14)));
  s.push(txt(794, 664, 'See all announcements >', 13, { bold: true }));
  return s.join('');
}

// ---------- phone content (320 x 660) ----------
function phone() {
  const s = [];
  s.push(ln(0, 54, 320, 54), ring(28, 27, 13), txt(48, 25, 'Pasong Buaya II', 14, { bold: true }), txt(48, 41, 'Digital Barangay Portal', 9));
  [19, 27, 35].forEach(y => s.push(ln(282, y, 304, y, 2)));
  s.push(box(16, 70, 210, 26, 13), txt(121, 88, 'Official Government Portal', 11, { anchor: 'middle' }));
  s.push(txt(16, 132, 'Governance at', 26, { bold: true }), txt(16, 164, 'Your Fingertips.', 26, { bold: true }), lines(16, 188, 280, 2));
  s.push(field(16, 214, 288, 40, 'What do you need today?'));
  s.push(txt(16, 276, 'New here? Create an account', 12));
  ['Advisory', 'Weather', 'Garbage today', 'Open issues'].forEach((k, i) => {
    const x = 16 + (i % 2) * 148, y = 292 + Math.floor(i / 2) * 76;
    s.push(box(x, y, 140, 68, 5), ring(x + 18, y + 20, 8), txt(x + 12, y + 46, k, 11, { bold: true }), lines(x + 12, y + 58, 100, 1));
  });
  s.push(ln(0, 454, 320, 454), txt(16, 490, 'My Barangay', 21, { bold: true }), button(214, 470, 90, 28, 'Customize', 12));
  s.push(tile(16, 512, 288, 96, 'Advisory', 14, 2), tile(16, 620, 288, 100, 'Weather today', 14, 2));
  return s.join('');
}

// ---------- hand-drawn devices ----------
const DW = 1040, DH = 700, PW = 320, PH = 660, M = 40;
const BZ = 22;                                   // laptop bezel
const LX = M + 30, LY = 100;                     // laptop screen outer top-left
const LW = DW + BZ * 2, LH = DH + 36 + BZ * 2;   // screen outer size (content + browser bar)
const PX = LX + LW + 90, PY = 120, PBW = PW + 28, PBH = PH + 130;
const CW = PX + PBW + M, CH = LY + LH + 90;
function compose() {
  const s = [`<rect width="${CW}" height="${CH}" fill="#FFFFFF"/>`];
  s.push(txt(M, 52, 'Home page', 28, { bold: true }), txt(LX, LY - 18, 'Laptop', 18, { bold: true }), txt(PX, PY - 18, 'Phone', 18, { bold: true }));
  // laptop: lid, screen, camera, base
  s.push(box(LX, LY, LW, LH, 18, 2.2), ring(LX + LW / 2, LY + BZ / 2, 3.5, 1.4));
  const sx = LX + BZ, sy = LY + BZ;
  s.push(box(sx, sy, DW, DH + 36, 3), ln(sx, sy + 36, sx + DW, sy + 36));
  [20, 38, 56].forEach(x => s.push(ring(sx + x, sy + 18, 5, 1.4)));
  s.push(box(sx + 84, sy + 7, 520, 22, 11, 1.5), txt(sx + 100, sy + 24, 'pb2link.com', 13));
  s.push(`<clipPath id="sd"><rect width="${DW}" height="${DH}"/></clipPath><g transform="translate(${sx},${sy + 36})"><g clip-path="url(#sd)">${desktop()}</g></g>`);
  const by = LY + LH;
  s.push(ln(LX - 50, by + 30, LX + LW + 50, by + 30, 2.2), ln(LX - 50, by + 30, LX, by, 2.2), ln(LX + LW, by, LX + LW + 50, by + 30, 2.2));
  s.push(ln(LX - 50, by + 30, LX - 44, by + 44, 2), ln(LX - 44, by + 44, LX + LW + 44, by + 44, 2), ln(LX + LW + 44, by + 44, LX + LW + 50, by + 30, 2));
  s.push(box(LX + LW / 2 - 90, by + 6, 180, 14, 7, 1.5));
  // phone: body, speaker, screen, home button
  s.push(box(PX, PY, PBW, PBH, 38, 2.2), box(PX + PBW / 2 - 34, PY + 26, 68, 7, 3.5, 1.5), ring(PX + PBW / 2 - 52, PY + 29, 4, 1.4));
  s.push(box(PX + 14, PY + 52, PW, PH, 3), ring(PX + PBW / 2, PY + PBH - 38, 18, 2));
  s.push(`<clipPath id="sp"><rect width="${PW}" height="${PH}"/></clipPath><g transform="translate(${PX + 14},${PY + 52})"><g clip-path="url(#sp)">${phone()}</g></g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}">${s.join('')}</svg>`;
}

const svg = compose();
const root = path.join(__dirname, 'wireframes_sketch');
for (const d of ['svg', 'png', 'jsx']) fs.mkdirSync(path.join(root, d), { recursive: true });
fs.writeFileSync(path.join(root, 'svg', 'wfs_home.svg'), svg);
const jsx = svg.replace(/ (font-family|font-size|font-weight|text-anchor|stroke-width|stroke-linecap|stroke-linejoin|clip-path)=/g, (m, a) => ' ' + a.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + '=')
  .replace(/fontFamily="([^"]*)"/g, (m, f) => `fontFamily={"${f}"}`).replace(/></g, '>\n<');
fs.writeFileSync(path.join(root, 'jsx', 'HomeSketchWireframe.jsx'), `// Hand-drawn style wireframe of the PB2Link Home page (laptop and phone). Generated by paper_diagrams/wireframes_sketch.cjs.\nexport default function HomeSketchWireframe() {\n  return (\n${jsx}\n  );\n}\n`);
console.log('wfs_home', CW + 'x' + CH);
