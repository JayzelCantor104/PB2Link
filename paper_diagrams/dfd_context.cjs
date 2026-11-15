// Appendix: Context diagram (DFD Level 0) of PB2Link
// External entities and flows follow the website's real users and outside services (see CLAUDE.md, backend/api).
const { NAVY, FILL, MUTED, wrap, text, rect, line, arrowHead, svgDoc } = require('./lib.cjs');

const W = 1500, H = 1180;
const CX = 750, CY = 590, CR = 175;

function entity(x, y, label, w = 290) {
  const ls = wrap(label, Math.floor((w - 20) / 8.6)); const h = Math.max(70, ls.length * 21 + 26);
  return { x, y, w, h, svg: rect(x - w / 2, y - h / 2, w, h, { rx: 0, sw: 2 }) + text(x, y, ls, { size: 17, weight: 'bold' }) };
}
// Point on the edge of a rectangle centred at (x,y) toward point p.
function edge(e, p) {
  const dx = p[0] - e.x, dy = p[1] - e.y, sx = (e.w / 2) / Math.abs(dx || 1e-9), sy = (e.h / 2) / Math.abs(dy || 1e-9), s = Math.min(sx, sy);
  return [e.x + dx * s, e.y + dy * s];
}
function circleEdge(p) { const dx = p[0] - CX, dy = p[1] - CY, d = Math.hypot(dx, dy); return [CX + dx / d * CR, CY + dy / d * CR]; }

// One flow between an entity and the process; dir 'in' = entity -> process. off = sideways offset of the line.
function halo(x, y, lines, anchor) {
  const fs = 14, lh = 1.25, h = lines.length * fs * lh, y0 = y - h / 2 + fs * 0.95;
  return lines.map((l, i) => {
    const yy = (y0 + i * fs * lh).toFixed(1), t = l.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<text x="${x}" y="${yy}" font-family="Arial" font-size="${fs}" font-style="italic" text-anchor="${anchor}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round">${t}</text>` +
      `<text x="${x}" y="${yy}" font-family="Arial" font-size="${fs}" font-style="italic" text-anchor="${anchor}" fill="#1F3A5F">${t}</text>`;
  }).join('');
}
// One flow between an entity and the process; dir 'in' = entity -> process. off = sideways offset of the line;
// the label sits at the middle of the line, on the same side as the offset. t = position along the line (0 entity, 1 circle).
function flow(e, dir, label, off, t = 0.5, side = 0) {
  const a0 = edge(e, [CX, CY]), b0 = circleEdge([e.x, e.y]);
  const dx = b0[0] - a0[0], dy = b0[1] - a0[1], d = Math.hypot(dx, dy), ux = -dy / d, uy = dx / d;
  const a = [a0[0] + ux * off, a0[1] + uy * off], b = [b0[0] + ux * off, b0[1] + uy * off];
  const [p, q] = dir === 'in' ? [a, b] : [b, a];
  const sgn = side || Math.sign(off) || 1;
  const ls = wrap(label, 24), D = 18 + ls.length * 9;
  const mx = a[0] + (b[0] - a[0]) * t + ux * sgn * D, my = a[1] + (b[1] - a[1]) * t + uy * sgn * D;
  return { line: line([p, q]) + arrowHead(p, q), label: halo(mx, my, ls, 'middle') };
}
function build() {
  const s = [];
  const E = {
    guest: entity(190, 270, 'Guest'),
    resident: entity(190, 910, 'Resident'),
    staff: entity(1310, 270, 'Barangay staff (Standard Admin)'),
    superA: entity(1310, 910, 'Super Admin'),
    vision: entity(470, 75, 'Google Cloud Vision'),
    sms: entity(1030, 75, 'PhilSMS'),
    email: entity(470, 1105, 'Email server (SMTP)'),
    hazard: entity(1030, 1105, 'Hazard data sources (PAGASA, PHIVOLCS, GDACS, USGS, Open-Meteo)', 400),
    maps: entity(190, 590, 'Map services (OpenStreetMap, RainViewer)'),
    push: entity(1310, 590, 'Web push services'),
  };
  // flows: [entity, dir, label, offset, label x, label y, anchor]
  // flows: [entity, dir, label, offset, position along the line, label side]
  const F = [
    [E.guest, 'in', 'registration details, ID photos, selfie, verification codes', -16, 0.5],
    [E.guest, 'out', 'public pages, advisories, schedules, Issue Map', 16, 0.5],
    [E.resident, 'in', 'requests, payments, bookings, reports, issue pins, profile changes', 16, 0.5],
    [E.resident, 'out', 'tracking codes, statuses, notices', -16, 0.5],
    [E.staff, 'in', 'decisions, walk-in requests, payment checks, status updates, advisories', 16, 0.5],
    [E.staff, 'out', 'registrations, requests, payments, and reports to act on', -16, 0.5],
    [E.superA, 'in', 'admin accounts, tab access, system settings', -16, 0.5],
    [E.superA, 'out', 'audit log, CSV exports', 16, 0.5],
    [E.vision, 'out', 'ID and selfie images', -14, 0.5],
    [E.vision, 'in', 'text lines, faces', 14, 0.5],
    [E.sms, 'out', 'codes, notices, and advisories by SMS', 14, 0.5],
    [E.sms, 'in', 'send results', -14, 0.5],
    [E.email, 'out', 'codes and notices by email', 0, 0.5, 1],
    [E.hazard, 'in', 'bulletins, earthquakes, cyclones, forecasts', 0, 0.5, -1],
    [E.maps, 'in', 'map tiles, road data, rain radar', 0, 0.5, -1],
    [E.push, 'out', 'device alerts', 0, 0.5, 1],
  ];
  const drawn = F.map(f => flow(...f));
  drawn.forEach(d => s.push(d.line));
  s.push(`<circle cx="${CX}" cy="${CY}" r="${CR}" fill="${FILL}" stroke="${NAVY}" stroke-width="2.4"/>`);
  s.push(text(CX, CY - 52, '0', { size: 26, weight: 'bold' }));
  s.push(line([[CX - 120, CY - 28], [CX + 120, CY - 28]], { width: 1.4 }));
  s.push(text(CX, CY + 30, ['PB2Link website', '(pb2link.com)'], { size: 20, weight: 'bold' }));
  Object.values(E).forEach(e => s.push(e.svg));
  drawn.forEach(d => s.push(d.label));
  return svgDoc(W, H, s.join(''));
}

module.exports = { name: 'DFD - context diagram', file: 'dfd_context', width: W, height: H, build };
