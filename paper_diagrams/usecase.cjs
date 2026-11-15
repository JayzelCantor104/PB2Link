// Figure 3. Use case diagram of PB2Link
const { NAVY, FILL, wrap, text, rect, line, arrowHead, svgDoc } = require('./lib.cjs');

const W = 1920, H = 1780;
const LEFT_CX = 590, RIGHT_CX = 1330, MID_CX = 960, RX = 168, RY = 40;

const guestCases = [
  'View announcements and About page',
  'Browse services',
  'View waste collection schedules',
  'View disaster map and advisories',
  'View preparedness and emergency page',
  'View Community Issue Map',
  'Register an account (18 years old or above)',
];
const residentCases = [
  'Log in',
  'Manage profile',
  'Request documents and services',
  'Book amenities',
  'File incident reports',
  'Report community issues',
  'Track requests',
];
const staffCases = [
  'Review registrations and profile changes',
  'Process document and service requests',
  'Verify payments',
  'Manage amenity bookings',
  'Handle incident reports',
  'Update and moderate community issues',
  'Post advisories and send SMS',
  'Manage announcements, schedules, services, and preparedness information',
  'Register residents at the barangay hall',
  'Encode walk-in requests',
];
const superCases = ['Manage admin accounts', 'Set tab access', 'View audit log', 'Change system settings'];

function useCase(cx, cy, label, rx = RX) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${RY}" fill="${FILL}" stroke="${NAVY}" stroke-width="1.8"/>` +
    text(cx, cy, wrap(label, 30), { size: 16 });
}

// Stick figure; returns its drawing and the shoulder point used for association lines.
function actor(x, top, label) {
  const s = [];
  s.push(`<circle cx="${x}" cy="${top + 20}" r="20" fill="#FFFFFF" stroke="${NAVY}" stroke-width="2.5"/>`);
  s.push(line([[x, top + 40], [x, top + 105]], { width: 2.5 }));
  s.push(line([[x - 38, top + 65], [x + 38, top + 65]], { width: 2.5 }));
  s.push(line([[x - 30, top + 155], [x, top + 105], [x + 30, top + 155]], { width: 2.5 }));
  s.push(text(x, top + 182, label, { size: 22, weight: 'bold' }));
  return s.join('');
}

function build() {
  const s = [];
  // System boundary
  s.push(rect(370, 40, 1180, H - 80, { rx: 4, sw: 2 }));
  s.push(text(960, 75, 'PB2Link', { size: 26, weight: 'bold' }));

  // Public services (Guest)
  s.push(text(LEFT_CX, 128, 'Public services', { size: 17, italic: true, color: '#475569' }));
  const guestY = guestCases.map((_, i) => 190 + i * 100);
  guestCases.forEach((c, i) => s.push(useCase(LEFT_CX, guestY[i], c)));

  // Resident services
  s.push(text(LEFT_CX, 958, 'Resident services', { size: 17, italic: true, color: '#475569' }));
  const resY = residentCases.map((_, i) => 1020 + i * 100);
  residentCases.forEach((c, i) => s.push(useCase(LEFT_CX, resY[i], c)));

  // Include and extend
  const incY = 900, extY = 1380;
  s.push(useCase(MID_CX, incY, 'Verify identity (OCR ID scan, selfie, one-time codes)', 175));
  s.push(line([[LEFT_CX + 95, guestY[6] + 33], [MID_CX - 70, incY - 37]], { dash: '8 6' }));
  s.push(arrowHead([LEFT_CX + 95, guestY[6] + 33], [MID_CX - 70, incY - 37], { open: true, filled: false }));
  s.push(text(820, 818, '«include»', { size: 15, italic: true, color: '#475569' }));

  s.push(useCase(MID_CX, extY, 'Pay fees online or at the hall', 175));
  s.push(line([[MID_CX - 90, extY - 35], [LEFT_CX + 95, resY[2] + 33]], { dash: '8 6' }));
  s.push(arrowHead([MID_CX - 90, extY - 35], [LEFT_CX + 95, resY[2] + 33], { open: true, filled: false }));
  s.push(text(925, 1312, '«extend»', { size: 15, italic: true, color: '#475569' }));

  // Staff services
  s.push(text(RIGHT_CX, 128, 'Staff services', { size: 17, italic: true, color: '#475569' }));
  const staffY = staffCases.map((_, i) => 190 + i * 100);
  staffCases.forEach((c, i) => s.push(useCase(RIGHT_CX, staffY[i], c)));
  s.push(text(RIGHT_CX, 1248, 'Super Admin only', { size: 17, italic: true, color: '#475569' }));
  const superY = superCases.map((_, i) => 1310 + i * 100);
  superCases.forEach((c, i) => s.push(useCase(RIGHT_CX, superY[i], c)));

  // Actors and associations
  const guest = { x: 175, top: 330 }, resident = { x: 175, top: 1170 };
  const staff = { x: 1745, top: 460 }, superA = { x: 1745, top: 1360 };
  guestY.forEach(y => s.push(line([[guest.x + 42, guest.top + 65], [LEFT_CX - RX, y]], { width: 1.3 })));
  resY.forEach(y => s.push(line([[resident.x + 42, resident.top + 65], [LEFT_CX - RX, y]], { width: 1.3 })));
  staffY.forEach(y => s.push(line([[staff.x - 42, staff.top + 65], [RIGHT_CX + RX, y]], { width: 1.3 })));
  superY.forEach(y => s.push(line([[superA.x - 42, superA.top + 65], [RIGHT_CX + RX, y]], { width: 1.3 })));
  s.push(actor(guest.x, guest.top, 'Guest'));
  s.push(actor(resident.x, resident.top, 'Resident'));
  s.push(actor(staff.x, staff.top, 'Standard Admin'));
  s.push(actor(superA.x, superA.top, 'Super Admin'));

  // Generalization: Resident is a Guest; Super Admin is a Standard Admin
  s.push(line([[resident.x, resident.top], [guest.x, guest.top + 215]]));
  s.push(arrowHead([guest.x, resident.top], [guest.x, guest.top + 200], { open: true, size: 18 }));
  s.push(line([[superA.x, superA.top], [staff.x, staff.top + 215]]));
  s.push(arrowHead([staff.x, superA.top], [staff.x, staff.top + 200], { open: true, size: 18 }));

  return svgDoc(W, H, s.join(''));
}

module.exports = { name: 'Figure 3 - Use case diagram', file: 'use_case_diagram', width: W, height: H, build };
