// Low-fidelity wireframes of PB2Link's key screens, each drawn at desktop and phone width.
// Layouts and labels follow the real pages (src/pages, src/Admin). Placeholders: grey bars = text,
// crossed boxes = images or maps, "000" = a number. Run: node wireframes.cjs  (writes SVG and JSX;
// PNGs are rendered from the SVGs).
const fs = require('fs');
const path = require('path');

const C = { ink: '#2B2B2B', line: '#6B6B6B', mid: '#9A9A9A', light: '#D4D4D4', fill: '#F1F1F1', band: '#E3E3E3', white: '#FFFFFF', dark: '#4A4A4A' };
const FONT = 'Arial, Helvetica, sans-serif';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tw = (s, size, bold = false) => String(s).length * size * (bold ? 0.64 : 0.53);          // rough text width

// ---------- primitives ----------
function R(x, y, w, h, o = {}) {
  const { fill = C.white, stroke = C.line, sw = 1.5, rx = 6, dash } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
function T(x, y, s, o = {}) {
  const { size = 15, weight = 'normal', anchor = 'start', color = C.ink, italic = false } = o;
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}"${italic ? ' font-style="italic"' : ''}>${esc(s)}</text>`;
}
function L(pts, o = {}) {
  const { stroke = C.line, sw = 1.5, dash } = o;
  return `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
function circ(cx, cy, r, o = {}) {
  const { fill = C.white, stroke = C.line, sw = 1.5 } = o;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}
// placeholder text lines
function bars(x, y, w, n = 2, o = {}) {
  const { h = 9, gap = 9, last = 0.6, color = C.light } = o;
  let s = '';
  for (let i = 0; i < n; i++) s += `<rect x="${x}" y="${y + i * (h + gap)}" width="${(i === n - 1 && n > 1 ? w * last : w).toFixed(0)}" height="${h}" rx="${h / 2}" fill="${color}"/>`;
  return s;
}
// image / map placeholder
function img(x, y, w, h, label, o = {}) {
  const { size = 14 } = o;
  let s = R(x, y, w, h, { fill: '#EBEBEB', stroke: C.mid, rx: 4 }) + L([[x, y], [x + w, y + h]], { stroke: C.light }) + L([[x + w, y], [x, y + h]], { stroke: C.light });
  if (label) {
    const lines = Array.isArray(label) ? label : [label];
    const lw = Math.max(...lines.map(l => tw(l, size))) + 20, lh = lines.length * (size + 4) + 12;
    s += R(x + w / 2 - lw / 2, y + h / 2 - lh / 2, lw, lh, { fill: C.white, stroke: C.light, rx: 4 });
    lines.forEach((l, i) => { s += T(x + w / 2, y + h / 2 - lh / 2 + 6 + (i + 1) * (size + 4) - 4, l, { size, anchor: 'middle', color: C.line }); });
  }
  return s;
}
function btn(x, y, w, h, label, dark = false, size = 15) {
  return R(x, y, w, h, { fill: dark ? C.dark : C.white, stroke: dark ? C.dark : C.line, rx: 7 }) +
    T(x + w / 2, y + h / 2 + size * 0.36, label, { size, weight: 'bold', anchor: 'middle', color: dark ? C.white : C.ink });
}
function inp(x, y, w, h, ph, o = {}) {
  const { size = 15, select = false, icon = false } = o;
  let s = R(x, y, w, h, { rx: 6 });
  const tx = icon ? x + 38 : x + 12;
  if (icon) s += circ(x + 19, y + h / 2 - 2, 7, { stroke: C.mid, sw: 2 }) + L([[x + 24, y + h / 2 + 3], [x + 29, y + h / 2 + 8]], { stroke: C.mid, sw: 2 });
  s += T(tx, y + h / 2 + size * 0.36, ph, { size, color: C.mid });
  if (select) s += T(x + w - 14, y + h / 2 + size * 0.36, '▾', { size, anchor: 'end', color: C.line });
  return s;
}
function lbl(x, y, s, size = 14) { return T(x, y, s, { size, weight: 'bold', color: C.ink }); }
function chip(x, y, label, on = false, size = 14) {
  const w = tw(label, size) + 28;
  return { w, svg: R(x, y, w, 30, { rx: 15, fill: on ? C.dark : C.white, stroke: on ? C.dark : C.line }) + T(x + w / 2, y + 20, label, { size, anchor: 'middle', color: on ? C.white : C.ink }) };
}
function chips(x, y, labels, onIdx = -1, maxX = 1e9, size = 14, gap = 8) {
  let s = '', cx = x, cy = y;
  labels.forEach((l, i) => {
    const w = tw(l, size) + 28;
    if (cx + w > maxX && cx > x) { cx = x; cy += 38; }
    const c = chip(cx, cy, l, i === onIdx, size); s += c.svg; cx += c.w + gap;
  });
  return s;
}
function pill(x, y, label, o = {}) {
  const { size = 12, dark = false, anchor = 'start' } = o;
  const w = tw(label, size, true) + 18, x0 = anchor === 'end' ? x - w : x;
  return R(x0, y, w, 22, { rx: 11, fill: dark ? C.dark : C.band, stroke: dark ? C.dark : C.mid, sw: 1 }) + T(x0 + w / 2, y + 15, label, { size, weight: 'bold', anchor: 'middle', color: dark ? C.white : C.ink });
}
function card(x, y, w, h, title, o = {}) {
  const { size = 17, fill = C.white } = o;
  return R(x, y, w, h, { fill, stroke: C.mid, rx: 10 }) + (title ? T(x + 18, y + 30, title, { size, weight: 'bold' }) : '');
}
function ico(cx, cy, r = 9) { return circ(cx, cy, r, { fill: C.band, stroke: C.mid, sw: 1.2 }); }
function radio(x, y, label, on, size = 15) {
  return circ(x + 8, y - 5, 8) + (on ? circ(x + 8, y - 5, 4, { fill: C.dark, stroke: C.dark }) : '') + T(x + 24, y, label, { size });
}
function check(x, y, label, on = true, size = 14) {
  return R(x, y - 13, 15, 15, { rx: 3, fill: on ? C.dark : C.white, stroke: on ? C.dark : C.line }) + (on ? T(x + 7.5, y - 1, '✓', { size: 12, anchor: 'middle', color: C.white, weight: 'bold' }) : '') + T(x + 23, y, label, { size });
}
function flag(x, y, shade) { return L([[x, y], [x, y - 26]], { stroke: C.ink, sw: 2 }) + `<rect x="${x}" y="${y - 26}" width="16" height="11" fill="${shade}" stroke="${C.ink}" stroke-width="1"/>`; }
function stepper(cx, y, xs, labels, active, size = 14, r = 18) {
  let s = L([[xs[0], y], [xs[xs.length - 1], y]], { stroke: C.light, sw: 3 });
  if (active > 0) s += L([[xs[0], y], [xs[active], y]], { stroke: C.dark, sw: 3 });
  xs.forEach((x, i) => {
    const done = i < active, cur = i === active;
    s += circ(x, y, r, { fill: done ? C.dark : C.white, stroke: done || cur ? C.dark : C.mid, sw: cur ? 3 : 1.5 });
    s += T(x, y + 5, done ? '✓' : String(i + 1), { size: size + 1, weight: 'bold', anchor: 'middle', color: done ? C.white : C.ink });
    s += T(x, y + r + 20, labels[i], { size, anchor: 'middle', weight: cur ? 'bold' : 'normal', color: cur || done ? C.ink : C.line });
  });
  return s;
}

// ---------- page chrome ----------
const DW = 1040, DH = 700, PW = 320, PH = 660;
function hdrD(active, signedIn = false) {
  let s = R(0, 0, DW, 60, { rx: 0, fill: C.white, stroke: C.light });
  s += circ(36, 30, 16, { fill: C.band }) + T(60, 27, 'Pasong Buaya II', { size: 16, weight: 'bold' }) + T(60, 43, 'DIGITAL BARANGAY PORTAL', { size: 10, weight: 'bold', color: C.line });
  const nav = [['Home'], ['Services', 1], ['Community', 1], ['About']];
  let x = 380;
  nav.forEach(([n, dd]) => {
    const w = tw(n, 15) + (dd ? 18 : 0) + 20;
    if (n === active) s += R(x - 6, 16, w, 30, { rx: 15, fill: C.band, stroke: C.band });
    s += T(x + 4, 36, n + (dd ? ' ▾' : ''), { size: 15, weight: n === active ? 'bold' : 'normal' });
    x += w + 8;
  });
  if (signedIn) s += T(842, 36, 'My Requests', { size: 15 }) + circ(965, 30, 16, { fill: C.band }) + T(988, 36, '▾', { size: 13 });
  else s += T(842, 36, 'Log In', { size: 15, weight: 'bold' }) + btn(912, 15, 104, 32, 'Register', true, 14);
  return s;
}
function hdrP(signedIn = false) {
  let s = R(0, 0, PW, 54, { rx: 0, fill: C.white, stroke: C.light });
  s += circ(28, 27, 14, { fill: C.band }) + T(50, 25, 'Pasong Buaya II', { size: 14, weight: 'bold' }) + T(50, 39, 'DIGITAL BARANGAY PORTAL', { size: 8, weight: 'bold', color: C.line });
  if (signedIn) s += circ(256, 27, 13, { fill: C.band });
  [19, 27, 35].forEach(y => { s += L([[284, y], [304, y]], { stroke: C.ink, sw: 2.2 }); });
  return s;
}
function floats(w, h, r = 22) {
  return circ(r + 14, h - r - 14, r, { fill: C.dark, stroke: C.dark }) + T(r + 14, h - r - 8, 'A', { size: 16, weight: 'bold', anchor: 'middle', color: C.white }) +
    circ(w - r - 14, h - r - 14, r, { fill: C.dark, stroke: C.dark }) + T(w - r - 14, h - r - 8, '?', { size: 18, weight: 'bold', anchor: 'middle', color: C.white });
}
function pageHead(cx, y, kicker, title, sub, o = {}) {
  const { tsize = 30, w = DW } = o;
  let s = '';
  if (kicker) { const kw = tw(kicker, 12, true) + 22; s += R(cx - kw / 2, y, kw, 24, { rx: 12, fill: C.dark, stroke: C.dark }) + T(cx, y + 16, kicker, { size: 12, weight: 'bold', anchor: 'middle', color: C.white }); }
  s += T(cx, y + 34 + tsize, title, { size: tsize, weight: 'bold', anchor: 'middle' });
  if (sub) s += bars(cx - sub / 2, y + 50 + tsize, sub, 2, { last: 0.75 });
  return s;
}
// admin layout
const SIDE = [['Dashboard'], ['Residents', '3'], ['Address List'], ['#REQUESTS AND SERVICES'], ['Document Requests'], ['Services Management'], ['Incident'], ['Amenities'], ['User Profiles', '2'],
  ['Waste Management'], ['Announcements'], ['Disaster Risk'], ['Issue Map', '1'], ['Payments'], ['#SUPER ADMIN'], ['Manage Admins'], ['Audit Log']];
function adminShell(active, title) {
  let s = R(0, 0, 220, DH, { rx: 0, fill: '#E9E9E9', stroke: C.light });
  s += circ(34, 32, 15, { fill: C.white }) + T(58, 30, 'PB2Link', { size: 16, weight: 'bold' }) + T(58, 45, 'Admin side', { size: 11, color: C.line });
  let y = 82;
  SIDE.forEach(([n, badge]) => {
    if (n.startsWith('#')) { s += T(18, y + 4, n.slice(1), { size: 10, weight: 'bold', color: C.line }); y += 26; return; }
    if (n === active) s += R(10, y - 16, 200, 30, { rx: 6, fill: C.dark, stroke: C.dark });
    s += R(22, y - 8, 12, 12, { rx: 3, fill: n === active ? C.white : C.light, stroke: 'none', sw: 0 }) + T(44, y + 3, n, { size: 14, color: n === active ? C.white : C.ink, weight: n === active ? 'bold' : 'normal' });
    if (badge) s += circ(196, y - 2, 10, { fill: C.ink, stroke: C.ink }) + T(196, y + 2, badge, { size: 11, weight: 'bold', anchor: 'middle', color: C.white });
    y += 33;
  });
  s += R(220, 0, DW - 220, 60, { rx: 0, fill: C.white, stroke: C.light }) + T(246, 38, title, { size: 22, weight: 'bold' });
  s += circ(850, 30, 11, { fill: C.band }) + circ(888, 30, 16, { fill: C.band }) + T(912, 27, 'Admin name', { size: 13, weight: 'bold' }) + T(912, 42, 'Super Admin', { size: 11, color: C.line });
  return s;
}
function adminPhoneBar(title) {
  let s = R(0, 0, PW, 54, { rx: 0, fill: '#E9E9E9', stroke: C.light });
  [19, 27, 35].forEach(y => { s += L([[16, y], [36, y]], { stroke: C.ink, sw: 2.2 }); });
  s += T(52, 33, title, { size: 17, weight: 'bold' }) + circ(296, 27, 13, { fill: C.white });
  return s;
}

// ---------- screens ----------
const SCREENS = [];
function screen(file, title, url, desktop, phone) { SCREENS.push({ file, title, url, desktop, phone }); }

// 1. Home
screen('wf_home', 'Home page', 'pb2link.com', () => {
  let s = hdrD('Home');
  s += R(0, 60, DW, 300, { rx: 0, fill: C.band, stroke: 'none', sw: 0 });
  s += R(60, 84, 250, 30, { rx: 15, stroke: C.line }) + circ(80, 99, 7, { fill: C.light }) + T(96, 104, 'OFFICIAL GOVERNMENT PORTAL', { size: 12, weight: 'bold' });
  s += T(60, 168, 'Governance at', { size: 42, weight: 'bold' }) + T(60, 214, 'Your Fingertips.', { size: 42, weight: 'bold' });
  s += bars(60, 232, 420, 2, { last: 0.7 });
  s += inp(60, 270, 470, 46, 'What do you need today? Try “clearance” or a tracking code', { size: 14, icon: true });
  s += T(60, 340, 'New here? Create an account · Already registered? Log in', { size: 13 });
  s += img(565, 84, 190, 250, ['Live map:', 'boundary, centers,', 'open issues'], { size: 13 });
  [['ADVISORY', 'No active advisory'], ['WEATHER', '00°C · 00% rain'], ['GARBAGE TODAY', 'Type, time'], ['OPEN ISSUES', '0 reported']].forEach(([k, v], i) => {
    const x = 775 + (i % 2) * 130, y = 100 + Math.floor(i / 2) * 104;
    s += R(x, y, 122, 92, { rx: 10, stroke: C.line }) + ico(x + 20, y + 24, 9) + T(x + 12, y + 56, k, { size: 10, weight: 'bold', color: C.line }) + T(x + 12, y + 74, v, { size: 11, weight: 'bold' });
  });
  // My Barangay
  s += pill(30, 378, 'THURSDAY, NOVEMBER 12, 2026') + T(30, 432, 'My Barangay', { size: 28, weight: 'bold' }) + T(230, 428, 'Your barangay today. Tap any tile to see more.', { size: 13, color: C.line }) + btn(640, 404, 120, 34, 'Customize', false, 14);
  s += card(30, 452, 470, 104, 'Advisory') + T(480, 482, 'Disaster risk →', { size: 13, anchor: 'end' }) + pill(48, 500, 'CLEAR') + T(116, 516, 'No active advisory', { size: 15, weight: 'bold' }) + bars(48, 532, 380, 1);
  s += card(515, 452, 245, 104, 'Weather today') + ico(545, 510, 16) + T(580, 516, '00°C', { size: 26, weight: 'bold' }) + bars(580, 530, 140, 1);
  s += card(30, 570, 230, 130, 'My Requests') + bars(48, 618, 190, 3);
  s += card(272, 570, 228, 130, 'My street') + bars(290, 618, 190, 3);
  s += card(515, 570, 245, 130, 'Garbage today') + bars(533, 618, 205, 3);
  // announcements panel
  s += card(778, 378, 242, 300, 'Announcements') + [945, 972, 999].map(x => R(x - 11, 392, 22, 22, { rx: 4 })).join('');
  s += chips(794, 424, ['All', 'Unread', 'For me'], 0, 1010, 13, 6);
  [470, 530, 590].forEach(y => { s += circ(804, y + 6, 4, { fill: C.dark, stroke: C.dark }) + bars(816, y, 186, 2, { h: 8, gap: 8 }); });
  s += T(794, 662, 'See all announcements →', { size: 13, weight: 'bold' });
  return s;
}, () => {
  let s = hdrP();
  s += R(0, 54, PW, 400, { rx: 0, fill: C.band, stroke: 'none', sw: 0 });
  s += R(16, 70, 222, 26, { rx: 13, stroke: C.line }) + T(30, 88, 'OFFICIAL GOVERNMENT PORTAL', { size: 10, weight: 'bold' });
  s += T(16, 136, 'Governance at', { size: 28, weight: 'bold' }) + T(16, 168, 'Your Fingertips.', { size: 28, weight: 'bold' });
  s += bars(16, 184, 280, 2);
  s += inp(16, 218, 288, 42, 'What do you need today?', { size: 13, icon: true });
  s += T(16, 280, 'New here? Create an account', { size: 12 });
  [['ADVISORY', 'None active'], ['WEATHER', '00°C'], ['GARBAGE TODAY', 'Type, time'], ['OPEN ISSUES', '0 reported']].forEach(([k, v], i) => {
    const x = 16 + (i % 2) * 148, y = 296 + Math.floor(i / 2) * 76;
    s += R(x, y, 140, 68, { rx: 10, stroke: C.line }) + ico(x + 18, y + 20, 8) + T(x + 12, y + 44, k, { size: 9, weight: 'bold', color: C.line }) + T(x + 12, y + 59, v, { size: 11, weight: 'bold' });
  });
  s += T(16, 490, 'My Barangay', { size: 22, weight: 'bold' }) + btn(214, 470, 90, 28, 'Customize', false, 12);
  s += card(16, 512, 288, 96, 'Advisory', { size: 15 }) + pill(32, 552, 'CLEAR') + T(98, 568, 'No active advisory', { size: 13, weight: 'bold' }) + bars(32, 582, 240, 1);
  s += card(16, 620, 288, 100, 'Weather today', { size: 15 });
  return s;
});

// 2. Registration, step 1
screen('wf_register', 'Registration form (step 1: valid ID)', 'pb2link.com/register', () => {
  let s = hdrD(null) + R(0, 60, DW, DH, { rx: 0, fill: C.band, stroke: 'none', sw: 0 });
  s += R(100, 80, 840, 660, { rx: 16, stroke: C.mid });
  s += T(520, 116, 'Resident Registration', { size: 28, weight: 'bold', anchor: 'middle' }) + T(520, 140, 'Create your Barangay Pasong Buaya II account.', { size: 14, anchor: 'middle', color: C.line });
  s += stepper(520, 172, [220, 420, 620, 820], ['Valid ID', 'Profile', 'Address & Contact', 'Review'], 0);
  s += R(130, 222, 780, 38, { rx: 6, fill: C.fill, stroke: C.light }) + circ(152, 241, 12, { fill: C.dark, stroke: C.dark }) + T(152, 246, '1', { size: 13, weight: 'bold', anchor: 'middle', color: C.white }) + T(174, 247, 'Your Valid ID', { size: 17, weight: 'bold' });
  s += T(130, 280, 'Under 18? A parent or guardian requests documents for you from their own account.', { size: 13, color: C.line });
  s += lbl(130, 304, 'Type of Valid ID *') + inp(130, 312, 360, 40, 'Select ID type', { select: true });
  s += lbl(510, 304, 'Front of your ID *') + R(510, 312, 230, 40, { dash: '6 4' }) + T(524, 337, 'Choose file', { size: 14, color: C.line }) + btn(752, 312, 158, 40, 'Use Camera', true, 14);
  s += R(130, 362, 780, 70, { rx: 8, fill: C.fill, stroke: C.light }) + R(148, 370, 86, 54, { rx: 6, stroke: C.line }) + R(160, 379, 62, 36, { rx: 3, stroke: C.mid, dash: '4 3' });
  s += T(258, 386, 'Capture guide for best accuracy', { size: 14, weight: 'bold' }) + bars(258, 398, 460, 2, { last: 0.8 });
  s += lbl(130, 452, 'What to scan:', 13);
  let cx = 130; ['Name', 'Date of Birth', 'Sex', 'Address', 'ID Number'].forEach(l => { s += R(cx, 460, tw(l, 13) + 46, 28, { rx: 14 }) + check(cx + 10, 480, l, true, 13); cx += tw(l, 13) + 54; });
  s += lbl(130, 510, 'Back of your ID *') + R(130, 518, 360, 38, { dash: '6 4' }) + T(144, 542, 'Choose file', { size: 14, color: C.line });
  s += lbl(510, 510, 'Selfie holding the same ID *') + R(510, 518, 400, 38, { dash: '6 4' }) + T(524, 542, 'Choose file or take a photo', { size: 14, color: C.line });
  s += R(130, 568, 780, 72, { rx: 8, fill: C.white, stroke: C.mid }) + T(146, 590, 'Read from your ID: check and correct before continuing', { size: 14, weight: 'bold' });
  [['Full name', 146, 300], ['Date of birth', 460, 200], ['ID number', 674, 220]].forEach(([l, x, w]) => { s += inp(x, 600, w, 32, l, { size: 13 }); });
  s += btn(130, 652, 110, 36, 'Back', false, 14) + btn(780, 652, 130, 36, 'Continue', true, 14);
  return s;
}, () => {
  let s = hdrP() + R(0, 54, PW, PH, { rx: 0, fill: C.band, stroke: 'none', sw: 0 });
  s += R(8, 64, 304, 640, { rx: 14, stroke: C.mid });
  s += T(160, 96, 'Resident Registration', { size: 20, weight: 'bold', anchor: 'middle' });
  s += stepper(160, 126, [48, 125, 202, 280], ['Valid ID', 'Profile', 'Address', 'Review'], 0, 11, 13);
  s += R(20, 166, 280, 34, { rx: 6, fill: C.fill, stroke: C.light }) + T(32, 189, '1  Your Valid ID', { size: 15, weight: 'bold' });
  s += bars(20, 210, 270, 2, { h: 7, gap: 6 });
  s += lbl(20, 246, 'Type of Valid ID *', 13) + inp(20, 254, 280, 38, 'Select ID type', { select: true, size: 14 });
  s += lbl(20, 312, 'Front of your ID *', 13) + R(20, 320, 280, 38, { dash: '6 4' }) + T(32, 344, 'Choose file', { size: 13, color: C.line });
  s += btn(20, 366, 280, 38, 'Use Camera', true, 14);
  s += R(20, 414, 280, 70, { rx: 8, fill: C.fill, stroke: C.light }) + R(32, 426, 60, 44, { rx: 5, stroke: C.line }) + T(104, 440, 'Capture guide', { size: 13, weight: 'bold' }) + bars(104, 450, 180, 2, { h: 7, gap: 6 });
  s += lbl(20, 504, 'What to scan:', 12) + chips(20, 512, ['Name', 'Birth date', 'Sex', 'Address', 'ID No.'], -1, 300, 12, 6);
  s += R(20, 596, 280, 58, { rx: 8, stroke: C.mid }) + T(32, 616, 'Read from your ID', { size: 13, weight: 'bold' }) + inp(32, 624, 256, 24, 'Full name', { size: 12 });
  return s;
});

// 3. Request form, review and payment
screen('wf_request', 'Request form (last step: review and payment)', 'pb2link.com/barangay-clearance', () => {
  let s = hdrD('Services', true) + R(0, 60, DW, DH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += T(520, 106, 'Barangay Clearance', { size: 28, weight: 'bold', anchor: 'middle' }) + T(520, 130, 'Request a Barangay Clearance online.', { size: 14, anchor: 'middle', color: C.line });
  s += stepper(520, 166, [260, 433, 606, 780], ['Identity', 'Residency', 'Verification', 'Review'], 3);
  s += card(40, 222, 590, 470, 'Review your request');
  const row = (y, k, w) => lbl(62, y, k, 13) + bars(230, y - 10, w, 1);
  s += T(62, 274, 'Applicant', { size: 15, weight: 'bold' }) + L([[62, 282], [610, 282]], { stroke: C.light });
  s += lbl(62, 304, 'Requested for', 13) + T(230, 304, 'Myself', { size: 14 }) + row(330, 'Full name', 260) + row(356, 'Purpose', 200);
  s += T(62, 394, 'Residency', { size: 15, weight: 'bold' }) + L([[62, 402], [610, 402]], { stroke: C.light });
  s += row(424, 'Address', 330) + row(450, 'Years of residency', 80);
  s += T(62, 488, 'Verification', { size: 15, weight: 'bold' }) + L([[62, 496], [610, 496]], { stroke: C.light });
  s += R(62, 508, 548, 76, { rx: 8, fill: C.fill, stroke: C.light }) + img(76, 518, 84, 56) + T(176, 538, 'Valid ID on file', { size: 15, weight: 'bold' }) + T(176, 560, 'The ID from your registration is used. No new upload needed.', { size: 13, color: C.line });
  s += T(62, 614, 'Additional questions', { size: 15, weight: 'bold' }) + bars(62, 626, 520, 2);
  s += card(648, 222, 352, 404, 'Payment') + T(666, 270, 'This document has a fee set by the barangay ordinance.', { size: 11, color: C.line }) + T(666, 296, 'Fee: ₱ 0.00', { size: 16, weight: 'bold' });
  s += radio(666, 322, 'Pay online (e-wallet)', true) + radio(666, 347, 'Pay at the barangay hall', false) + radio(666, 372, 'I’m exempt from the fee', false);
  s += img(666, 384, 96, 96, 'QR', { size: 13 }) + T(776, 404, 'Account name', { size: 12, color: C.line }) + bars(776, 412, 190, 1) + T(776, 442, 'Account number', { size: 12, color: C.line }) + bars(776, 450, 150, 1);
  s += inp(666, 494, 150, 34, 'Reference no.', { size: 13 }) + inp(826, 494, 156, 34, 'Amount paid', { size: 13 }) + inp(666, 536, 150, 34, 'Date paid', { size: 13 });
  s += R(826, 536, 156, 34, { dash: '6 4' }) + T(838, 558, 'Receipt screenshot', { size: 13, color: C.line }) + T(666, 600, 'A staff member checks the payment.', { size: 12, color: C.line });
  s += R(648, 638, 352, 54, { rx: 8, fill: C.band, stroke: C.light }) + T(664, 660, 'When to expect an update', { size: 13, weight: 'bold' }) + T(664, 680, 'Within the day (Mon to Fri, 8 AM to 5 PM)', { size: 12 });
  return s;
}, () => {
  let s = hdrP(true) + R(0, 54, PW, PH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += T(160, 90, 'Barangay Clearance', { size: 21, weight: 'bold', anchor: 'middle' });
  s += stepper(160, 118, [48, 125, 202, 280], ['Identity', 'Residency', 'Verify', 'Review'], 3, 11, 13);
  s += card(12, 158, 296, 220, 'Review your request', { size: 15 });
  s += lbl(28, 206, 'Requested for', 12) + T(140, 206, 'Myself', { size: 13 }) + lbl(28, 230, 'Full name', 12) + bars(140, 222, 140, 1) + lbl(28, 254, 'Purpose', 12) + bars(140, 246, 110, 1) + lbl(28, 278, 'Address', 12) + bars(140, 270, 150, 1);
  s += R(28, 292, 264, 70, { rx: 8, fill: C.fill, stroke: C.light }) + img(38, 302, 60, 48) + T(108, 322, 'Valid ID on file', { size: 13, weight: 'bold' }) + bars(108, 332, 160, 2, { h: 7, gap: 6 });
  s += card(12, 390, 296, 264, 'Payment', { size: 15 }) + T(28, 444, 'Fee: ₱ 0.00', { size: 14, weight: 'bold' });
  s += radio(28, 472, 'Pay online (e-wallet)', true, 13) + radio(28, 496, 'Pay at the barangay hall', false, 13) + radio(28, 520, 'I’m exempt from the fee', false, 13);
  s += img(28, 534, 80, 80, 'QR', { size: 12 }) + inp(118, 536, 174, 30, 'Reference no.', { size: 12 }) + inp(118, 574, 174, 30, 'Amount paid', { size: 12 });
  return s;
});

// 4. Track Request
screen('wf_track', 'Track Request page', 'pb2link.com/track-request', () => {
  let s = hdrD(null, true) + R(0, 60, DW, DH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += pageHead(520, 70, null, 'Status Tracker', 460, { tsize: 30 });
  s += inp(210, 200, 480, 44, 'Enter tracking code (e.g., CLR-2026...)', { icon: true, size: 14 }) + btn(702, 200, 128, 44, 'Search', true);
  s += chips(40, 266, ['Documents', 'Incident reports'], 0, 640, 14);
  [['Barangay Clearance', 'CLR-0000000', 'Processing', 'Paid'], ['Certificate of Residency', 'RES-0000000', 'Ready for Pick Up', 'Paid'], ['Facility booking', 'BKG-0000000', 'Pending', ''], ['Certificate of Indigency', 'IND-0000000', 'Pending', 'For Verification']].forEach(([t, c, st, pay], i) => {
    const y = 312 + i * 94;
    s += R(40, y, 610, 82, { rx: 10, stroke: C.mid }) + ico(72, y + 41, 16) + T(102, y + 32, t, { size: 16, weight: 'bold' }) + T(102, y + 54, c + '  ·  Submitted 00/00/2026', { size: 13, color: C.line });
    s += pill(630, y + 18, st, { anchor: 'end', dark: true }) + (pay ? pill(630, y + 46, 'Payment: ' + pay, { anchor: 'end' }) : '') + T(102, y + 74, 'View details →', { size: 12, weight: 'bold' });
  });
  s += card(670, 312, 330, 210, 'When to Expect an Update', { size: 16 });
  [['Documents and bookings', 'Within the day'], ['Incident reports', 'Within 24 hours'], ['Profile updates', 'Within 24 hours'], ['Community issues', '24 hours to 3 days']].forEach(([k, v], i) => { s += T(688, 368 + i * 36, k, { size: 13, weight: 'bold' }) + T(984, 368 + i * 36, v, { size: 13, anchor: 'end' }); });
  s += card(670, 536, 330, 70, 'Need Support?', { size: 15 }) + T(688, 590, 'Contact the barangay hall for urgent inquiries.', { size: 12 });
  s += card(670, 616, 330, 72, 'Status Updates', { size: 15 }) + T(688, 670, 'We email and text you when the status changes.', { size: 12 });
  return s;
}, () => {
  let s = hdrP(true) + R(0, 54, PW, PH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += T(160, 100, 'Status Tracker', { size: 24, weight: 'bold', anchor: 'middle' }) + bars(40, 114, 240, 1);
  s += inp(16, 140, 288, 40, 'Tracking code', { icon: true, size: 13 }) + btn(16, 188, 288, 38, 'Search', true, 14);
  s += chips(16, 240, ['Documents', 'Incident reports'], 0, 304, 12, 6);
  [['Barangay Clearance', 'Processing'], ['Certificate of Residency', 'Ready for Pick Up'], ['Facility booking', 'Pending'], ['Certificate of Indigency', 'Pending']].forEach(([t, st], i) => {
    const y = 286 + i * 92;
    s += R(16, y, 288, 82, { rx: 10, stroke: C.mid }) + T(30, y + 26, t, { size: 14, weight: 'bold' }) + T(30, y + 46, 'XXX-0000000', { size: 12, color: C.line }) + pill(30, y + 54, st, { dark: true, size: 11 });
  });
  return s;
});

// 5. Community Issue Map
function mapBody(x, y, w, h, flags = true) {
  let s = img(x, y, w, h);
  const px = (a, b) => [x + a * w, y + b * h];
  s += L([px(.26, .08), px(.42, .1), px(.47, .3), px(.43, .52), px(.6, .9), px(.48, .96), px(.36, .62), px(.29, .3), px(.26, .08)], { stroke: C.ink, sw: 2.5, dash: '8 5' });
  if (flags) [[.38, .3, '#E0E0E0'], [.44, .45, '#B5B5B5'], [.4, .62, '#7A7A7A'], [.5, .82, '#4A4A4A'], [.33, .2, '#E0E0E0']].forEach(([a, b, c]) => { const [fx, fy] = px(a, b); s += flag(fx, fy, c); });
  s += R(x + 10, y + 10, 28, 56, { rx: 4 }) + T(x + 24, y + 31, '+', { size: 18, anchor: 'middle', weight: 'bold' }) + T(x + 24, y + 58, '−', { size: 18, anchor: 'middle', weight: 'bold' });
  return s;
}
screen('wf_issue_map', 'GIS-based Community Issue Map', 'pb2link.com/issue-map', () => {
  let s = hdrD('Community') + R(0, 60, DW, DH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += pageHead(520, 76, 'COMMUNITY', 'Community Issue Map', 520, { tsize: 30 });
  s += chips(40, 186, ['All', 'Broken Streetlight', 'Illegal Dumping', 'Road Damage', 'Flooding', 'Stray Animals', 'Noise Complaint', 'Fire Hazard'], 0, 1010, 13, 7);
  s += check(40, 248, 'Show recently resolved or rejected', false, 13);
  [['1 report', '#E0E0E0'], ['2–4 reports', '#B5B5B5'], ['5–9 reports', '#7A7A7A'], ['10+ reports', '#4A4A4A']].forEach(([l, c], i) => { const x = 330 + i * 110; s += `<rect x="${x}" y="236" width="14" height="14" rx="3" fill="${c}" stroke="${C.ink}" stroke-width="1"/>` + T(x + 20, 248, l, { size: 13 }); });
  s += btn(840, 226, 160, 36, 'Report an issue', true, 14);
  s += mapBody(40, 276, 660, 424);
  s += card(716, 276, 284, 410, 'How it works', { size: 16 });
  ['Tap a flag to see the problem.', 'Seen it too? Add your report.', 'New problem? Report an issue.'].forEach((t, i) => { s += T(734, 334 + i * 44, (i + 1) + '. ' + t, { size: 13 }) + bars(752, 342 + i * 44, 210, 1, { h: 7 }); });
  s += T(734, 470, 'Names are never shown to residents.', { size: 12, color: C.line, italic: true });
  s += T(734, 506, 'Most reported', { size: 16, weight: 'bold' });
  [0, 1, 2].forEach(i => { const y = 522 + i * 50; s += flag(746, y + 32, ['#4A4A4A', '#7A7A7A', '#B5B5B5'][i]) + bars(772, y + 10, 150, 2, { h: 8, gap: 7 }) + pill(984, y + 10, '0', { anchor: 'end', dark: true }); });
  return s;
}, () => {
  let s = hdrP() + R(0, 54, PW, PH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += T(160, 98, 'Community Issue Map', { size: 21, weight: 'bold', anchor: 'middle' }) + bars(30, 112, 260, 2, { h: 7, gap: 6 });
  s += chips(16, 144, ['All', 'Streetlight', 'Dumping', 'Flooding'], 0, 400, 12, 6);
  s += btn(16, 186, 288, 36, 'Report an issue', true, 14);
  s += mapBody(16, 232, 288, 290);
  s += T(16, 550, 'Most reported', { size: 15, weight: 'bold' });
  [0, 1].forEach(i => { const y = 562 + i * 48; s += R(16, y, 288, 40, { rx: 8, stroke: C.light }) + flag(32, y + 32, ['#4A4A4A', '#7A7A7A'][i]) + bars(56, y + 12, 170, 2, { h: 7, gap: 6 }) + pill(292, y + 9, '0', { anchor: 'end', dark: true }); });
  return s;
});

// 6. Disaster Risk
screen('wf_disaster_risk', 'GIS-based disaster risk page', 'pb2link.com/disaster-risk', () => {
  let s = hdrD('Community') + R(0, 60, DW, DH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += pageHead(520, 76, 'DISASTER RISK REDUCTION & MANAGEMENT (DRRM)', 'Disaster Risk & Evacuation', 560, { tsize: 30 });
  s += R(40, 182, 960, 86, { rx: 12, stroke: C.ink, sw: 2.5 }) + pill(62, 198, 'STATUS: NORMAL / ALL CLEAR', { dark: true }) + T(300, 214, 'English | Filipino', { size: 13, weight: 'bold' });
  s += T(62, 246, 'No Active Advisory', { size: 20, weight: 'bold' }) + bars(270, 236, 400, 1);
  s += R(40, 280, 960, 54, { rx: 10, stroke: C.mid, fill: C.white }) + ico(64, 307, 10) + T(84, 302, 'Get emergency alerts on this phone', { size: 15, weight: 'bold' }) + bars(84, 312, 300, 1, { h: 7 }) + btn(858, 290, 126, 34, 'Turn on alerts', true, 14);
  s += card(40, 346, 960, 170, 'Live hazard monitor', { size: 16 }) + T(56, 392 - 0, 'Read automatically from PAGASA, PHIVOLCS and GDACS.', { size: 12, color: C.line });
  ['Tropical cyclone', 'Earthquakes near Imus', 'Rainfall outlook'].forEach((t, i) => {
    const x = 56 + i * 315;
    s += R(x, 402, 300, 102, { rx: 8, stroke: C.light }) + T(x + 14, 424, t, { size: 14, weight: 'bold' });
    if (i === 1) [0, 1].forEach(j => { s += pill(x + 14, 436 + j * 30, 'M0.0') + bars(x + 70, 442 + j * 30, 200, 1, { h: 8 }); });
    else if (i === 2) ['Today', 'Tomorrow', 'Next day'].forEach((d, j) => { s += T(x + 14, 450 + j * 20, d, { size: 12 }) + R(x + 90, 442 + j * 20, 120, 8, { rx: 4, fill: C.light, stroke: 'none', sw: 0 }) + T(x + 286, 450 + j * 20, '0 mm · 0%', { size: 12, anchor: 'end' }); });
    else s += bars(x + 14, 440, 260, 3, { h: 8, gap: 9 });
  });
  s += T(40, 548, 'Disaster Map', { size: 18, weight: 'bold' }) + btn(706, 526, 294, 34, 'Find my nearest evacuation center', true, 13);
  s += chips(170, 530, ['Flood-prone areas', 'Rain radar'], -1, 700, 12, 6);
  s += mapBody(40, 570, 640, 130, false);
  [0, 1, 2].forEach(i => { s += circ(140 + i * 160, 610 + (i % 2) * 40, 7, { fill: C.dark, stroke: C.dark }); });
  s += card(696, 570, 304, 130, 'Evacuation centers', { size: 15 });
  [0, 1].forEach(i => { s += bars(712, 612 + i * 38, 180, 2, { h: 7, gap: 6 }) + pill(984, 608 + i * 38, 'Open', { anchor: 'end' }); });
  return s;
}, () => {
  let s = hdrP() + R(0, 54, PW, PH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += T(160, 96, 'Disaster Risk & Evacuation', { size: 19, weight: 'bold', anchor: 'middle' });
  s += R(12, 112, 296, 96, { rx: 12, stroke: C.ink, sw: 2.5 }) + pill(26, 124, 'STATUS: NORMAL / ALL CLEAR', { dark: true, size: 10 }) + T(26, 172, 'No Active Advisory', { size: 16, weight: 'bold' }) + bars(26, 184, 250, 1, { h: 7 });
  s += R(12, 218, 296, 88, { rx: 10, stroke: C.mid }) + T(26, 242, 'Get emergency alerts', { size: 14, weight: 'bold' }) + btn(26, 256, 268, 36, 'Turn on alerts', true, 13);
  s += card(12, 318, 296, 150, 'Live hazard monitor', { size: 14 }) + R(26, 362, 268, 92, { rx: 8, stroke: C.light }) + T(38, 384, 'Tropical cyclone', { size: 13, weight: 'bold' }) + bars(38, 396, 240, 3, { h: 7, gap: 7 });
  s += btn(12, 480, 296, 36, 'Find my nearest evacuation center', true, 12);
  s += mapBody(12, 526, 296, 134, false);
  return s;
});

// 7. Admin Dashboard
screen('wf_admin_dashboard', 'Admin side: Dashboard', 'pb2link.com/admin/dashboard', () => {
  let s = adminShell('Dashboard', 'Dashboard') + R(220, 60, DW - 220, DH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  ['Active residents', 'Registrations to review', 'Open requests', 'Payments to verify'].forEach((k, i) => {
    const x = 244 + i * 194;
    s += R(x, 82, 180, 96, { rx: 10, stroke: C.mid }) + ico(x + 24, 108, 11) + T(x + 16, 150, '000', { size: 26, weight: 'bold' }) + T(x + 16, 168, k, { size: 12, color: C.line });
  });
  s += card(244, 196, 470, 300, 'To do', { size: 17 });
  ['Review registrations', 'Check profile changes', 'Verify payments', 'Process document requests', 'Check held issue posts', 'Confirm the active advisory'].forEach((t, i) => {
    const y = 250 + i * 40;
    s += circ(266, y - 5, 9) + T(286, y, t, { size: 14 }) + pill(612, y - 16, '0', { anchor: 'end' }) + T(696, y, 'Open →', { size: 13, weight: 'bold', anchor: 'end' });
  });
  s += card(730, 196, 288, 300, 'Disaster readiness', { size: 17 }) + pill(748, 216 + 26, 'NO ACTIVE ADVISORY') + bars(748, 280, 240, 2);
  s += T(748, 342, 'Detected by the live feeds', { size: 13, weight: 'bold' }) + bars(748, 354, 240, 2, { h: 8 }) + btn(748, 398, 150, 34, 'Review & publish', false, 13);
  s += T(748, 460, 'Evacuation centers: 0 open', { size: 13 });
  s += card(244, 512, 774, 172, null) + chips(262, 528, ['Requests', 'Residents', 'Amenities', 'Issues'], 0, 1000, 13, 6);
  [0, 1, 2].forEach(i => { const y = 580 + i * 34; s += bars(262, y, 220, 1, { h: 9 }) + bars(520, y, 140, 1, { h: 9 }) + pill(1000, y - 6, 'Pending', { anchor: 'end' }); });
  return s;
}, () => {
  let s = adminPhoneBar('Dashboard') + R(0, 54, PW, PH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  ['Active residents', 'To review', 'Open requests', 'Payments'].forEach((k, i) => {
    const x = 12 + (i % 2) * 152, y = 68 + Math.floor(i / 2) * 92;
    s += R(x, y, 144, 82, { rx: 10, stroke: C.mid }) + T(x + 14, y + 42, '000', { size: 22, weight: 'bold' }) + T(x + 14, y + 64, k, { size: 11, color: C.line });
  });
  s += card(12, 256, 296, 270, 'To do', { size: 15 });
  ['Review registrations', 'Check profile changes', 'Verify payments', 'Document requests', 'Held issue posts'].forEach((t, i) => { const y = 314 + i * 42; s += circ(32, y - 5, 8) + T(48, y, t, { size: 13 }) + pill(292, y - 16, '0', { anchor: 'end' }); });
  s += card(12, 538, 296, 116, 'Disaster readiness', { size: 15 }) + pill(28, 572, 'NO ACTIVE ADVISORY', { size: 11 }) + bars(28, 606, 250, 2, { h: 7 });
  return s;
});

// 8. Admin Residents
screen('wf_admin_residents', 'Admin side: Residents page', 'pb2link.com/admin/profiling', () => {
  let s = adminShell('Residents', 'Residents') + R(220, 60, DW - 220, DH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += chips(244, 78, ['All 000', 'Needs review 0', 'Active', 'Action Required', 'Archived'], 1, 800, 12, 5);
  s += btn(812, 74, 206, 36, 'Register at the Hall', true, 14);
  s += inp(244, 126, 290, 38, 'Search name, control no., email, mobile', { icon: true, size: 11 });
  ['Subdivision', 'Street', 'Sector', 'Needs attention'].forEach((f, i) => { s += inp(544 + i * 120, 126, 114, 38, f, { select: true, size: 11 }); });
  s += R(244, 180, 774, 470, { rx: 10, stroke: C.mid });
  s += R(244, 180, 774, 40, { rx: 10, fill: C.band, stroke: C.mid });
  [['Name', 262], ['Control No.', 470], ['Address', 600], ['Status', 760], ['Checks', 916]].forEach(([h, x]) => { s += T(x, 205, h, { size: 13, weight: 'bold' }); });
  ['Active', 'Pending', 'Active', 'Action Required', 'Active', 'Pending', 'Active', 'Archived'].forEach((st, i) => {
    const y = 220 + i * 53;
    s += L([[244, y + 53], [1018, y + 53]], { stroke: C.light }) + circ(278, y + 26, 13, { fill: C.band }) + bars(300, y + 21, 140, 1, { h: 9 }) + bars(470, y + 21, 110, 1, { h: 9 }) + bars(600, y + 21, 150, 1, { h: 9 });
    s += pill(760, y + 15, st, { size: 11, dark: st === 'Pending' }) + [0, 1, 2].map(j => R(916 + j * 20, y + 19, 15, 15, { rx: 3, fill: (i + j) % 4 ? C.light : C.dark, stroke: C.mid, sw: 1 })).join('') + T(1008, y + 31, 'Open', { size: 12, weight: 'bold', anchor: 'end' });
  });
  s += T(244, 676, 'Showing 1–8 of 000', { size: 13, color: C.line }) + btn(870, 658, 70, 30, 'Prev', false, 12) + btn(948, 658, 70, 30, 'Next', false, 12);
  return s;
}, () => {
  let s = adminPhoneBar('Residents') + R(0, 54, PW, PH, { rx: 0, fill: C.fill, stroke: 'none', sw: 0 });
  s += btn(12, 66, 296, 38, 'Register at the Hall', true, 14);
  s += chips(12, 116, ['All', 'Needs review 0', 'Active'], 1, 400, 12, 6);
  s += inp(12, 158, 296, 38, 'Search name or control no.', { icon: true, size: 12 });
  ['Active', 'Pending', 'Action Required', 'Active', 'Archived'].forEach((st, i) => {
    const y = 210 + i * 88;
    s += R(12, y, 296, 78, { rx: 10, stroke: C.mid }) + circ(40, y + 39, 15, { fill: C.band }) + bars(66, y + 18, 150, 1, { h: 9 }) + bars(66, y + 36, 110, 1, { h: 8 }) + pill(66, y + 50, st, { size: 10, dark: st === 'Pending' }) + T(296, y + 26, 'Open', { size: 12, weight: 'bold', anchor: 'end' });
  });
  return s;
});

// ---------- composition ----------
const M = 36, GAP = 56;
const DX = M, DY = 96, PX = M + DW + GAP, PY = 96, DEV = 12;
const CW = PX + PW + DEV * 2 + M, CH = DY + 36 + DH + 40;
function compose(sc) {
  const s = [];
  s.push(`<rect width="${CW}" height="${CH}" fill="#FFFFFF"/>`);
  s.push(T(M, 46, sc.title, { size: 26, weight: 'bold' }));
  s.push(T(DX, DY - 14, 'Desktop', { size: 16, weight: 'bold', color: C.line }) + T(PX, PY - 14, 'Phone', { size: 16, weight: 'bold', color: C.line }));
  // browser
  s.push(R(DX, DY, DW, DH + 36, { rx: 10, stroke: C.ink, sw: 2.5 }) + `<rect x="${DX + 1.25}" y="${DY + 1.25}" width="${DW - 2.5}" height="34" rx="9" fill="${C.band}"/>`);
  s.push([20, 38, 56].map(x => circ(DX + x, DY + 18, 6, { fill: C.white, stroke: C.mid })).join('') + R(DX + 84, DY + 7, 520, 22, { rx: 11, stroke: C.mid }) + T(DX + 100, DY + 23, sc.url, { size: 13, color: C.line }));
  s.push(`<clipPath id="${sc.file}-d"><rect x="0" y="0" width="${DW}" height="${DH}"/></clipPath>`);
  s.push(`<g transform="translate(${DX},${DY + 36})"><g clip-path="url(#${sc.file}-d)">${sc.desktop()}</g></g>`);
  s.push(L([[DX, DY + 36], [DX + DW, DY + 36]], { stroke: C.ink, sw: 1.5 }));
  // phone
  const ph = PH + 70;
  s.push(R(PX, PY, PW + DEV * 2, ph, { rx: 34, stroke: C.ink, sw: 3, fill: '#FAFAFA' }) + R(PX + PW / 2 - 28, PY + 12, 80, 8, { rx: 4, fill: C.light, stroke: 'none', sw: 0 }));
  s.push(`<clipPath id="${sc.file}-p"><rect x="0" y="0" width="${PW}" height="${PH}"/></clipPath>`);
  s.push(`<g transform="translate(${PX + DEV},${PY + 30})"><g clip-path="url(#${sc.file}-p)">${sc.phone()}</g></g>`);
  s.push(R(PX + DEV, PY + 30, PW, PH, { rx: 4, fill: 'none', stroke: C.mid, sw: 1 }));
  s.push(R(PX + PW / 2 - 40 + DEV, PY + ph - 22, 80, 6, { rx: 3, fill: C.light, stroke: 'none', sw: 0 }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}">${s.join('')}</svg>`;
}

// SVG markup -> JSX component (camelCase attributes)
function toJsx(svg, name) {
  const body = svg
    .replace(/ (font-family|font-size|font-weight|font-style|text-anchor|stroke-width|stroke-dasharray|stroke-linejoin|clip-path)=/g, (m, a) => ' ' + a.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + '=')
    .replace(/></g, '>\n<');
  return `// ${name}: low-fidelity wireframe of PB2Link (desktop and phone). Generated by paper_diagrams/wireframes.cjs.\n` +
    `export default function ${name}() {\n  return (\n${body}\n  );\n}\n`;
}

if (require.main === module) {
  const root = path.join(__dirname, 'wireframes');
  for (const d of ['svg', 'png', 'jsx']) fs.mkdirSync(path.join(root, d), { recursive: true });
  for (const sc of SCREENS) {
    const svg = compose(sc);
    fs.writeFileSync(path.join(root, 'svg', sc.file + '.svg'), svg);
    const comp = sc.file.replace(/^wf_/, '').split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('') + 'Wireframe';
    fs.writeFileSync(path.join(root, 'jsx', comp + '.jsx'), toJsx(svg, comp));
    console.log(sc.file, CW + 'x' + CH, '->', comp + '.jsx');
  }
}
module.exports = { SCREENS, compose };
