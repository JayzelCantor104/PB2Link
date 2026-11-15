// Appendix: Level 1 data flow diagram of PB2Link (Gane-Sarson notation)
// Processes, stores and flows follow backend/api (register.php, login.php, the submit_* endpoints, payment_common.php,
// amenity_common.php, issue_map_common.php, disaster_risk.php, hazard_feeds_common.php, notify.php, sms.php,
// advisory_push.php, admin_manage.php, audit_log.php). Entities and stores drawn twice carry a duplicate mark.
const { NAVY, FILL, FONT, esc, wrap, text, rect, line, arrowHead, svgDoc } = require('./lib.cjs');

const W = 1760;
const EX = 170, EW = 220, EH = 62;          // external entities
const PX = 640, PW = 290;                   // processes
const SX = 1110, SW = 290, SH = 48;         // data stores
const XX = 1575, XW = 260, XH = 62;         // outside services
const SLOT = 106, BUS = 818;

const STORES = {
  D1: 'Residents and accounts', D2: 'Requests and payments', D3: 'Amenities, bookings, and incidents',
  D4: 'Community issues and reports', D5: 'Advisories, centers, and hazard readings',
  D6: 'Admins, settings, and audit log', D7: 'Announcements, schedules, and About page',
};

// [number, name, entities, stores, services]; each link: [name, forward label (left to right), back label]
const ROWS = [
  ['1.0', 'Register and verify residents',
    [['Guest', 'registration details, ID photos, selfie, codes', 'account result'],
     ['Barangay staff', 'approve, return, archive, or register at the hall', 'registrations to review']],
    [['D1', 'resident record and ID files', 'possible duplicates']],
    [['Google Cloud Vision', 'ID and selfie images', 'text lines, faces']]],
  ['2.0', 'Sign in and manage profiles',
    [['Resident', 'sign-in with a one-time code, profile changes, proofs', 'session, change status'],
     ['Barangay staff', 'decisions, change requests', 'changes to review']],
    [['D1', 'approved changes', 'profile and account status']], []],
  ['3.0', 'Process requests and payments',
    [['Resident', 'requests, payment receipts', 'tracking codes, statuses'],
     ['Barangay staff', 'walk-in requests, status updates, payment checks, O.R. numbers', 'requests and payments to act on']],
    [['D2', 'requests, payments', 'fees, saved requests'], ['D1', null, 'profile, ID on file']], []],
  ['4.0', 'Manage bookings and incident reports',
    [['Resident', 'bookings, incident reports', 'availability, statuses'],
     ['Barangay staff', 'booking and report decisions', 'bookings and reports to act on']],
    [['D3', 'bookings, reports', 'amenities, times and units taken']], []],
  ['5.0', 'Manage community issues',
    [['Resident', 'pins, reports, comment flags', 'issues, flags, staff updates'],
     ['Barangay staff', 'status updates, moderation', 'issues and held posts']],
    [['D4', 'pins, reports, updates', 'open issues within 30 m']], []],
  ['6.0', 'Manage disaster risk and advisories',
    [['Guest', 'location or tapped spot', 'advisories, nearest center, flood level'],
     ['Barangay staff', 'advisories, evacuation centers', 'detections, review flags']],
    [['D5', 'advisories, readings', 'centers, active advisories']],
    [['Hazard data sources', null, 'bulletins, earthquakes, forecasts'],
     ['Map services', null, 'map tiles, rain radar']]],
  ['7.0', 'Send notifications',
    [],
    [['D1', null, 'mobile number, email, chosen channel']],
    [['PhilSMS', 'text messages', 'send results'], ['Email server', 'emails', null], ['Web push services', 'device alerts', null]]],
  ['8.0', 'Administer the website',
    [['Guest', null, 'announcements, schedules'],
     ['Barangay staff', 'announcements, schedules, About page', 'admin tabs they may open'],
     ['Super Admin', 'admin accounts, tab access, settings', 'audit log, CSV exports']],
    [['D6', 'accounts, access, settings', 'permissions, log entries'], ['D7', 'posts and schedules', null]], []],
];

function lab(x, y, t, below) {
  if (!t) return '';
  const ls = wrap(t, 24), fs = 13, lh = 1.22;
  const h = ls.length * fs * lh, top = below ? y + 6 : y - 6 - h;
  return ls.map((l, i) => {
    const yy = (top + fs * 0.95 + i * fs * lh).toFixed(1);
    return `<text x="${x}" y="${yy}" font-family="${FONT}" font-size="${fs}" font-style="italic" text-anchor="middle" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round">${esc(l)}</text>` +
      `<text x="${x}" y="${yy}" font-family="${FONT}" font-size="${fs}" font-style="italic" text-anchor="middle" fill="${NAVY}">${esc(l)}</text>`;
  }).join('');
}
// A pair of opposite flows between x1 (left) and x2 (right) at slot y; labels centred at lx.
function link(x1, x2, y, fwd, back, lx) {
  const s = [];
  if (fwd) s.push(line([[x1, y - 9], [x2, y - 9]]), arrowHead([x1, y - 9], [x2, y - 9], { size: 10 }), lab(lx, y - 9, fwd, false));
  if (back) s.push(line([[x2, y + 9], [x1, y + 9]]), arrowHead([x2, y + 9], [x1, y + 9], { size: 10 }), lab(lx, y + 9, back, true));
  return s.join('');
}

function build() {
  const seen = {};
  const dup = (k) => { seen[k] = (seen[k] || 0) + 1; return seen[k] > 1; };
  const s = [], over = [], gaps = [], stubs = [];
  let y = 30, row7Top = 0;
  for (const [num, name, ents, stores, svcs] of ROWS) {
    const right = stores.length + svcs.length, n = Math.max(ents.length, right, 1);
    const ph = n * SLOT + 24, cy = y + ph / 2;
    const slots = (k) => Array.from({ length: k }, (_, i) => cy - ((k - 1) * SLOT) / 2 + i * SLOT);
    // process
    over.push(rect(PX - PW / 2, y, PW, ph, { rx: 12, fill: FILL, sw: 2 }));
    over.push(line([[PX - PW / 2, y + 34], [PX + PW / 2, y + 34]], { width: 1.4 }));
    over.push(text(PX, y + 18, num, { size: 16, weight: 'bold' }));
    over.push(text(PX, cy + 17, wrap(name, 24), { size: 17, weight: 'bold' }));
    if (num === '7.0') row7Top = y;
    else if (num !== '8.0') stubs.push(y + ph - 10);
    // entities
    slots(ents.length).forEach((sy, i) => {
      const [en, f, b] = ents[i];
      over.push(rect(EX - EW / 2, sy - EH / 2, EW, EH, { rx: 0, sw: 2 }), text(EX, sy, wrap(en, 22), { size: 15, weight: 'bold' }));
      if (dup('E:' + en)) over.push(line([[EX - EW / 2, sy - EH / 2 + 14], [EX - EW / 2 + 14, sy - EH / 2]], { width: 1.6 }));
      s.push(link(EX + EW / 2, PX - PW / 2, sy, f, b, (EX + EW / 2 + PX - PW / 2) / 2));
    });
    // stores (top slots) and services (below)
    const rs = slots(right);
    stores.forEach(([id, f, b], i) => {
      const sy = rs[i], x0 = SX - SW / 2;
      over.push(`<rect x="${x0}" y="${sy - SH / 2}" width="${SW}" height="${SH}" fill="#FFFFFF" stroke="none"/>`);
      over.push(line([[x0 + SW, sy - SH / 2], [x0, sy - SH / 2], [x0, sy + SH / 2], [x0 + SW, sy + SH / 2]], { width: 2 }));
      over.push(line([[x0 + 46, sy - SH / 2], [x0 + 46, sy + SH / 2]], { width: 1.6 }));
      if (dup('S:' + id)) over.push(line([[x0 + 9, sy - SH / 2], [x0 + 9, sy + SH / 2]], { width: 1.4 }));
      over.push(text(x0 + 23, sy, id, { size: 15, weight: 'bold' }), text(x0 + 56, sy, wrap(STORES[id], 26), { size: 14, anchor: 'start' }));
      s.push(link(PX + PW / 2, x0, sy, f, b, (PX + PW / 2 + x0) / 2 + 12));
      gaps.push(sy);
    });
    svcs.forEach(([sv, f, b], i) => {
      const sy = rs[stores.length + i];
      over.push(rect(XX - XW / 2, sy - XH / 2, XW, XH, { rx: 0, sw: 2 }), text(XX, sy, wrap(sv, 22), { size: 15, weight: 'bold' }));
      s.push(link(PX + PW / 2, XX - XW / 2, sy, f, b, (SX + SW / 2 + XX - XW / 2) / 2));
      gaps.push(sy);
    });
    y += ph + 44;
  }
  // notices from processes 1.0 to 6.0 flow into 7.0 (bus broken where it crosses other flows)
  const busTop = stubs[0], busEnd = row7Top - 24;
  stubs.forEach(sy => s.push(line([[PX + PW / 2, sy], [BUS, sy]])));
  const cuts = gaps.filter(g => g > busTop && g < busEnd).sort((a, b) => a - b);
  let from = busTop;
  for (const g of cuts) { s.push(line([[BUS, from], [BUS, g - 17]])); from = g + 17; }
  s.push(line([[BUS, from], [BUS, busEnd], [PX + 90, busEnd]]), line([[PX + 90, busEnd], [PX + 90, row7Top]]), arrowHead([PX + 90, busEnd], [PX + 90, row7Top], { size: 10 }));
  s.push(lab(BUS + 120, busEnd, 'notices to send from 1.0 to 6.0', false));
  // legend
  const ly = y + 6;
  const lg = [rect(40, ly, W - 80, 118, { rx: 4, fill: '#F7F9FC', sw: 1.2 }), text(60, ly + 22, 'Legend', { size: 15, weight: 'bold', anchor: 'start' })];
  lg.push(rect(60, ly + 44, 70, 34, { rx: 0, sw: 2 }), text(142, ly + 61, 'External entity', { size: 14, anchor: 'start' }));
  lg.push(rect(320, ly + 40, 70, 42, { rx: 9, fill: FILL, sw: 2 }), text(402, ly + 61, 'Process', { size: 14, anchor: 'start' }));
  lg.push(line([[600, ly + 44], [530, ly + 44], [530, ly + 78], [600, ly + 78]], { width: 2 }), line([[556, ly + 44], [556, ly + 78]]), text(612, ly + 61, 'Data store', { size: 14, anchor: 'start' }));
  lg.push(line([[760, ly + 61], [840, ly + 61]]), arrowHead([760, ly + 61], [840, ly + 61], { size: 10 }), text(852, ly + 61, 'Data flow', { size: 14, anchor: 'start' }));
  lg.push(text(60, ly + 100, 'A short diagonal mark (entity) or extra line (data store) shows an item drawn more than once. Every staff action is also written to the audit log in D6, and uploaded files are kept with their records.', { size: 13, anchor: 'start', color: '#374151' }));
  const H = ly + 140;
  return { svg: svgDoc(W, H, s.join('') + over.join('') + lg.join('')), H };
}

const out = build();
module.exports = { name: 'DFD - Level 1', file: 'dfd_level1', width: W, height: out.H, build: () => out.svg };
