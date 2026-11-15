// Simple line-drawn wireframe of PB2Link (Home page): black outlines only, no fills or shading,
// boxes with an X for images and maps, short strokes for text. Desktop and phone side by side.
// Run: node wireframes_line.cjs  (writes wireframes_line/svg and wireframes_line/jsx)
const fs = require('fs');
const path = require('path');

const K = '#111111', FONT = 'Arial, Helvetica, sans-serif', SW = 1.6;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const box = (x, y, w, h, rx = 0, dash) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${K}" stroke-width="${SW}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const ln = (x1, y1, x2, y2, sw = SW) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${K}" stroke-width="${sw}"/>`;
const ring = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${K}" stroke-width="${SW}"/>`;
const txt = (x, y, s, size = 15, o = {}) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${o.bold ? 'bold' : 'normal'}" text-anchor="${o.anchor || 'start'}" fill="${K}">${esc(s)}</text>`;
const xbox = (x, y, w, h, label, size = 14) => box(x, y, w, h) + ln(x, y, x + w, y + h, 1) + ln(x + w, y, x, y + h, 1) +
  (label ? `<rect x="${x + w / 2 - label.length * size * 0.29 - 8}" y="${y + h / 2 - size}" width="${label.length * size * 0.58 + 16}" height="${size * 1.6}" fill="#FFFFFF"/>` + txt(x + w / 2, y + h / 2 + size * 0.35, label, size, { anchor: 'middle' }) : '');
// text placeholder: horizontal strokes
const lines = (x, y, w, n = 2, gap = 14) => Array.from({ length: n }, (_, i) => ln(x, y + i * gap, x + (i === n - 1 && n > 1 ? w * 0.6 : w), y + i * gap, 1.3)).join('');
const button = (x, y, w, h, label, size = 14) => box(x, y, w, h, 6) + txt(x + w / 2, y + h / 2 + size * 0.36, label, size, { anchor: 'middle', bold: true });
const field = (x, y, w, h, label, size = 13) => box(x, y, w, h, 4) + ring(x + 18, y + h / 2 - 1, 6) + ln(x + 22, y + h / 2 + 3, x + 27, y + h / 2 + 8) + txt(x + 36, y + h / 2 + size * 0.36, label, size);
const tab = (x, y, label, size = 13) => { const w = label.length * size * 0.56 + 22; return { w, s: box(x, y, w, 26, 13) + txt(x + w / 2, y + 18, label, size, { anchor: 'middle' }) }; };
const tile = (x, y, w, h, title, size = 15, n = 2) => box(x, y, w, h, 6) + txt(x + 14, y + 26, title, size, { bold: true }) + lines(x + 14, y + 48, w - 28, n);

// ---------- desktop (1040 x 700) ----------
function desktop() {
  const s = [];
  // header
  s.push(ln(0, 60, 1040, 60), ring(36, 30, 15), txt(60, 27, 'Pasong Buaya II', 15, { bold: true }), txt(60, 43, 'Digital Barangay Portal', 11));
  [['Home', 380], ['Services v', 450], ['Community v', 545], ['About', 665]].forEach(([n, x]) => s.push(txt(x, 36, n, 15)));
  s.push(ln(378, 42, 422, 42, 2), txt(842, 36, 'Log In', 15, { bold: true }), button(912, 15, 104, 32, 'Register'));
  // hero
  s.push(ln(0, 360, 1040, 360));
  s.push(box(60, 84, 240, 28, 14), txt(180, 103, 'Official Government Portal', 12, { anchor: 'middle' }));
  s.push(txt(60, 168, 'Governance at', 40, { bold: true }), txt(60, 212, 'Your Fingertips.', 40, { bold: true }), lines(60, 238, 420, 2));
  s.push(field(60, 268, 470, 44, 'What do you need today? Try "clearance" or a tracking code'));
  s.push(txt(60, 338, 'New here? Create an account  |  Already registered? Log in', 13));
  s.push(xbox(565, 84, 190, 250, 'Live map'));
  [['Advisory'], ['Weather'], ['Garbage today'], ['Open issues']].forEach(([k], i) => {
    const x = 775 + (i % 2) * 130, y = 100 + Math.floor(i / 2) * 104;
    s.push(box(x, y, 122, 92, 6), ring(x + 20, y + 24, 9), txt(x + 12, y + 56, k, 12, { bold: true }), lines(x + 12, y + 72, 96, 1));
  });
  // My Barangay
  s.push(txt(30, 395, 'Thursday, November 12, 2026', 12), txt(30, 432, 'My Barangay', 26, { bold: true }), lines(220, 425, 240, 1), button(640, 404, 120, 34, 'Customize'));
  s.push(tile(30, 452, 470, 104, 'Advisory', 15, 2), tile(515, 452, 245, 104, 'Weather today', 15, 2));
  s.push(tile(30, 570, 230, 120, 'My Requests', 15, 3), tile(272, 570, 228, 120, 'My street', 15, 3), tile(515, 570, 245, 120, 'Garbage today', 15, 3));
  // announcements panel
  s.push(box(778, 378, 242, 312, 6), txt(794, 406, 'Announcements', 16, { bold: true }));
  let cx = 794; ['All', 'Unread', 'For me'].forEach(l => { const t = tab(cx, 422, l); s.push(t.s); cx += t.w + 6; });
  [470, 528, 586].forEach(y => s.push(ring(802, y + 2, 4), lines(814, y, 188, 2, 14)));
  s.push(txt(794, 664, 'See all announcements >', 13, { bold: true }));
  return s.join('');
}

// ---------- phone (320 x 660) ----------
function phone() {
  const s = [];
  s.push(ln(0, 54, 320, 54), ring(28, 27, 13), txt(48, 25, 'Pasong Buaya II', 14, { bold: true }), txt(48, 40, 'Digital Barangay Portal', 9));
  [19, 27, 35].forEach(y => s.push(ln(282, y, 304, y, 2)));
  s.push(box(16, 70, 210, 26, 13), txt(121, 88, 'Official Government Portal', 11, { anchor: 'middle' }));
  s.push(txt(16, 134, 'Governance at', 27, { bold: true }), txt(16, 166, 'Your Fingertips.', 27, { bold: true }), lines(16, 188, 280, 2));
  s.push(field(16, 214, 288, 40, 'What do you need today?'));
  s.push(txt(16, 276, 'New here? Create an account', 12));
  ['Advisory', 'Weather', 'Garbage today', 'Open issues'].forEach((k, i) => {
    const x = 16 + (i % 2) * 148, y = 292 + Math.floor(i / 2) * 76;
    s.push(box(x, y, 140, 68, 6), ring(x + 18, y + 20, 8), txt(x + 12, y + 46, k, 11, { bold: true }), lines(x + 12, y + 58, 100, 1));
  });
  s.push(ln(0, 454, 320, 454), txt(16, 490, 'My Barangay', 21, { bold: true }), button(214, 470, 90, 28, 'Customize', 12));
  s.push(tile(16, 512, 288, 96, 'Advisory', 14, 2), tile(16, 620, 288, 100, 'Weather today', 14, 2));
  return s.join('');
}

// ---------- frame ----------
const DW = 1040, DH = 700, PW = 320, PH = 660, M = 36, GAP = 56;
const DX = M, DY = 96, PX = M + DW + GAP, PY = 96, CW = PX + PW + 24 + M, CH = DY + 36 + DH + 40;
function compose() {
  const s = [`<rect width="${CW}" height="${CH}" fill="#FFFFFF"/>`];
  s.push(txt(M, 46, 'Home page', 26, { bold: true }), txt(DX, DY - 14, 'Desktop', 16, { bold: true }), txt(PX, PY - 14, 'Phone', 16, { bold: true }));
  // browser window
  s.push(box(DX, DY, DW, DH + 36, 8), ln(DX, DY + 36, DX + DW, DY + 36));
  [20, 38, 56].forEach(x => s.push(ring(DX + x, DY + 18, 5)));
  s.push(box(DX + 84, DY + 7, 520, 22, 11), txt(DX + 100, DY + 23, 'pb2link.com', 13));
  s.push(`<clipPath id="ld"><rect width="${DW}" height="${DH}"/></clipPath><g transform="translate(${DX},${DY + 36})"><g clip-path="url(#ld)">${desktop()}</g></g>`);
  // phone body
  const ph = PH + 70;
  s.push(box(PX, PY, PW + 24, ph, 30), ln(PX + PW / 2 - 18, PY + 16, PX + PW / 2 + 42, PY + 16, 3), ln(PX + PW / 2 - 28, PY + ph - 18, PX + PW / 2 + 52, PY + ph - 18, 3));
  s.push(box(PX + 12, PY + 30, PW, PH));
  s.push(`<clipPath id="lp"><rect width="${PW}" height="${PH}"/></clipPath><g transform="translate(${PX + 12},${PY + 30})"><g clip-path="url(#lp)">${phone()}</g></g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}">${s.join('')}</svg>`;
}

const svg = compose();
const root = path.join(__dirname, 'wireframes_line');
for (const d of ['svg', 'png', 'jsx']) fs.mkdirSync(path.join(root, d), { recursive: true });
fs.writeFileSync(path.join(root, 'svg', 'wfl_home.svg'), svg);
const jsx = svg.replace(/ (font-family|font-size|font-weight|text-anchor|stroke-width|stroke-dasharray|clip-path)=/g, (m, a) => ' ' + a.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + '=').replace(/></g, '>\n<');
fs.writeFileSync(path.join(root, 'jsx', 'HomeLineWireframe.jsx'), `// Line-drawn wireframe of the PB2Link Home page (desktop and phone). Generated by paper_diagrams/wireframes_line.cjs.\nexport default function HomeLineWireframe() {\n  return (\n${jsx}\n  );\n}\n`);
console.log('wfl_home', CW + 'x' + CH);
