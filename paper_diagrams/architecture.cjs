// Figure 5. System architecture of PB2Link
const { NAVY, FILL, MUTED, wrap, text, rect, line, arrow, svgDoc } = require('./lib.cjs');

const W = 2000, H = 1420;

function box(x, y, w, h, label, size = 16, chars = 32) {
  return rect(x, y, w, h, { rx: 6 }) + text(x + w / 2, y + h / 2, wrap(label, chars), { size });
}
function container(x, y, w, h, title, subtitle) {
  return rect(x, y, w, h, { rx: 10, fill: FILL, sw: 2 }) +
    text(x + 22, y + 28, title, { size: 21, weight: 'bold', anchor: 'start' }) +
    (subtitle ? text(x + 22, y + 54, subtitle, { size: 15, anchor: 'start', color: MUTED }) : '');
}
function note(x, y, t, anchor = 'start') { return text(x, y, t, { size: 14, italic: true, color: MUTED, anchor }); }

function build() {
  const s = [];
  // Users
  s.push(box(163, 36, 310, 72, 'Residents\n(phone or computer)', 17));
  s.push(box(582, 36, 310, 72, 'Guests\n(public pages)', 17));
  s.push(box(1000, 36, 310, 72, 'Barangay staff\n(admin side)', 17));
  s.push(arrow([[318, 108], [318, 172]]), arrow([[737, 108], [737, 172]]), arrow([[1155, 108], [1155, 172]]));

  // Client
  s.push(container(55, 173, 1326, 298, 'Client: web browser', 'React 19 and Vite single-page application, opened at pb2link.com'));
  const inner = [82, 405, 728, 1050];
  ['Resident side\n(residents and guests)', 'Admin side\n(staff, by tab access)',
   'Leaflet maps (issue map, disaster map with NOAH flood layer, waste routes)', 'Service worker\n(offline emergency page, device alerts)']
    .forEach((t, i) => s.push(box(inner[i], 273, 291, 163, t, 16, 30)));

  // Client <-> server
  s.push(arrow([[636, 471], [636, 581]]), note(648, 527, 'HTTPS requests'));
  s.push(arrow([[782, 581], [782, 472]]), note(794, 527, 'JSON responses'));

  // Server
  s.push(container(55, 582, 1326, 426, 'Server: Apache and PHP on Hostinger shared hosting', 'One PHP file per action, called by the browser through HTTPS'));
  [['Sessions, two-step\nsign-in, tab access', 'Registration and\nverification', 'E-services and\npayments', 'Notifications\n(SMS and email)'],
   ['Community Issue\nMap', 'Disaster risk and\nhazard feeds', 'Announcements, waste,\nand About page', 'Audit log and\nsystem settings']]
    .forEach((row, r) => row.forEach((t, i) => s.push(box(inner[i], r ? 836 : 682, 291, 127, t, 16, 30))));

  // Server -> data
  s.push(arrow([[718, 1008], [718, 1117]]), note(730, 1063, 'SQL queries and file reads/writes'));

  // Data
  s.push(container(55, 1118, 1326, 254, 'Data', ''));
  s.push(box(100, 1191, 581, 144, 'MySQL database (barangay_bims)\nresidents, requests, payments, issues,\nadvisories, admins, audit log', 16, 60));
  s.push(box(755, 1191, 581, 144, 'File storage\nIDs and selfies, uploads, private folder\nfor payment receipts and oaths', 16, 60));

  // Outside services
  s.push(text(1717, 183, 'Outside services', { size: 21, weight: 'bold' }));
  s.push(box(1491, 227, 453, 90, 'OpenStreetMap tiles and road data\nRainViewer rain radar', 16, 40));
  s.push(arrow([[1383, 326], [1490, 275]]), note(1390, 358, 'map, road, and radar data'));
  const outside = [[591, 'Google Cloud Vision\n(ID text and faces)'], [709, 'PhilSMS\n(text messages)'], [827, 'Email server (SMTP)\nthrough PHPMailer'],
    [945, 'PAGASA, PHIVOLCS, GDACS,\nUSGS, Open-Meteo'], [1063, 'Web push services\n(device alerts)']];
  outside.forEach(([y, t]) => { s.push(box(1491, y, 453, 90, t, 16, 40)); s.push(arrow([[1383, y + 45], [1490, y + 45]])); });
  s.push(note(1402, 577, 'server calls'));

  // Device alerts travel from the push services back to the browser
  s.push(arrow([[1717, 1153], [1717, 1208], [1963, 1208], [1963, 127], [1382, 127], [1382, 172]], { dash: '7 6' }));
  s.push(note(1705, 1190, 'alerts delivered to the device', 'end'));

  return svgDoc(W, H, s.join(''));
}

module.exports = { name: 'Figure 5 - System architecture', file: 'system_architecture', width: W, height: H, build };
