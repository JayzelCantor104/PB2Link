// Figure 7. Class diagram of PB2Link (domain classes)
// The back end is procedural PHP, so these classes model the website's main objects: attributes come from the
// database columns (backend/migrations) and operations from the actions the endpoints perform.
const { NAVY, FILL, FONT, esc, text, rect, line, arrowHead, svgDoc } = require('./lib.cjs');

const W = 2000, H = 1690, RH = 20, HEAD = 36;

const C = {
  User: [40, 40, 300, ['user_id', 'email', 'password_hash', 'last_login'], ['signIn()', 'verifySignInCode()', 'resetPassword()']],
  Resident: [430, 40, 380, ['resident_id', 'control_num', 'fName, mName, lName', 'birth_date', 'address', 'residing_since', 'status',
    'notify_channel', 'id_verification_status', 'selfie_check_status', 'approval_method', 'two_factor_enabled'], ['register()', 'editProfile()', 'chooseNotifyChannel()', 'turnOnTwoStepSignIn()', 'sendBackForReview()']],
  ResidencyProof: [40, 300, 300, ['proof_type', 'file_path', 'status'], ['upload()', 'verify()']],
  IncidentReport: [40, 540, 300, ['track_code', 'incident_class', 'description', 'status'], ['file()', 'updateStatus()']],
  AmenityReservation: [430, 520, 380, ['tracking_code', 'reservation_date', 'start_time, end_time', 'quantity', 'purpose', 'status'],
    ['book()', 'cancel()', 'approve()', 'decline()']],
  Amenity: [430, 870, 380, ['name', 'category', 'booking_mode', 'total_quantity', 'open_time, close_time', 'status'], ['checkAvailability()']],
  DocumentRequest: [1100, 40, 360, ['tracking_code', 'request_mode', 'purpose', 'status', 'id_source', 'source', 'encoded_by', 'processed_by', 'date_requested'],
    ['submit()', 'track()', 'updateStatus()', 'print()'], '«abstract»'],
  Service: [1500, 40, 270, ['title', 'category', 'is_active', 'closed_message'], ['addField()', 'open()', 'close()']],
  ServiceField: [1500, 288, 270, ['field_label', 'field_type', 'is_required', 'step_section'], []],
  Payment: [920, 575, 380, ['amount_due', 'method', 'status', 'reference_no', 'or_number', 'exemption', 'receipt_sha256'],
    ['uploadReceipt()', 'verify()', 'reject()', 'waive()']],
  CommunityIssue: [1400, 575, 260, ['category', 'latitude, longitude', 'status', 'report_count'], ['pin()', 'merge()', 'updateStatus()']],
  IssueUpdate: [1740, 575, 230, ['old_status', 'new_status', 'remarks', 'admin_id'], []],
  IssueReport: [1400, 860, 260, ['comment', 'photo_path', 'held_at', 'removed_at', 'flag_count'], ['addReport()', 'withdraw()', 'flag()']],
  AuditLogEntry: [430, 1140, 380, ['event_type', 'target_entity_type', 'outcome', 'created_at'], ['record()']],
  Announcement: [430, 1365, 380, ['title', 'caption', 'audience_type', 'is_pinned'], ['post()', 'pin()']],
  Admin: [920, 1140, 380, ['admin_id', 'username', 'email', 'role', 'position', 'permission_overrides'],
    ['signIn()', 'reviewRegistration()', 'registerAtHall()', 'encodeWalkIn()', 'verifyPayment()', 'publishAdvisory()']],
  SuperAdmin: [920, 1500, 380, [], ['manageAdmins()', 'setTabAccess()', 'viewAuditLog()', 'changeSettings()'], null, 'Super Admin'],
  DisasterAlert: [1410, 1140, 270, ['title', 'alert_level', 'affected_areas', 'is_active', 'is_practice'], ['publish()', 'confirmStillAccurate()', 'deactivate()']],
  EvacuationCenter: [1760, 1140, 220, ['name', 'capacity_families', 'current_families', 'status', 'latitude, longitude'], ['findNearest()']],
};
const SUBS = ['Barangay Clearance', 'Certificate of Residency', 'Barangay ID', 'Business Clearance', 'Certificate of Indigency', 'Volunteer Registration', 'Service Request'];

const B = {};
function cls(name, [x, y, w, attrs, ops, stereo, title]) {
  const sh = stereo ? 18 : 0, h1 = HEAD + sh, h2 = attrs.length * RH + 14, h3 = Math.max(ops.length * RH + 14, 14), h = h1 + h2 + h3;
  B[name] = { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h };
  const s = [rect(x, y, w, h, { rx: 0, sw: 1.8 }), rect(x, y, w, h1, { rx: 0, fill: FILL, sw: 1.8 })];
  if (stereo) s.push(text(x + w / 2, y + 15, stereo, { size: 14, italic: true }));
  s.push(text(x + w / 2, y + sh + HEAD / 2, title || name.replace(/([a-z])([A-Z])/g, '$1$2'), { size: 17, weight: 'bold', italic: !!stereo }));
  s.push(line([[x, y + h1 + h2], [x + w, y + h1 + h2]], { width: 1.4 }));
  attrs.forEach((a, i) => s.push(`<text x="${x + 12}" y="${y + h1 + 21 + i * RH}" font-family="${FONT}" font-size="15" fill="#1F2937">- ${esc(a)}</text>`));
  ops.forEach((o, i) => s.push(`<text x="${x + 12}" y="${y + h1 + h2 + 21 + i * RH}" font-family="${FONT}" font-size="15" fill="#1F2937">+ ${esc(o)}</text>`));
  return s.join('');
}
function assoc(pts, m1, m2, name, nameAt) {
  const s = [line(pts, { width: 1.5 })];
  const lab = (p, q, t, end2) => {   // multiplicity just off the end p; both ends on the same side of the line
    const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
    const k = end2 ? -1 : 1, tx = p[0] + ux * 16 - k * uy * 13, ty = p[1] + uy * 16 + k * ux * 13;
    return text(tx, ty, t, { size: 15, weight: 'bold', color: NAVY });
  };
  if (m1) s.push(lab(pts[0], pts[1], m1));
  if (m2) s.push(lab(pts[pts.length - 1], pts[pts.length - 2], m2, true));
  if (name) s.push(text(nameAt[0], nameAt[1], name, { size: 14, italic: true, color: '#374151' }));
  return s.join('');
}

function build() {
  const boxes = Object.entries(C).map(([n, c]) => cls(n, c)).join('');
  const s = [];
  // subclasses of DocumentRequest
  const sw = 140, gap = 14, sy = 470, sx0 = 892;
  const subs = SUBS.map((t, i) => {
    const x = sx0 + i * (sw + gap);
    return rect(x, sy, sw, 54, { rx: 0, fill: FILL, sw: 1.8 }) + text(x + sw / 2, sy + 27, t.split(' ').length > 2 ? [t.split(' ').slice(0, 2).join(' '), t.split(' ').slice(2).join(' ')] : t.split(' '), { size: 14, weight: 'bold' });
  });
  const D = B.DocumentRequest, trunk = 446;
  s.push(line([[D.cx, D.b + 16], [D.cx, trunk]], { width: 1.5 }), arrowHead([D.cx, trunk], [D.cx, D.b], { open: true, size: 16 }));
  s.push(line([[sx0 + sw / 2, trunk], [sx0 + 6 * (sw + gap) + sw / 2, trunk]], { width: 1.5 }));
  SUBS.forEach((_, i) => s.push(line([[sx0 + i * (sw + gap) + sw / 2, trunk], [sx0 + i * (sw + gap) + sw / 2, sy]], { width: 1.5 })));
  const srR = sx0 + 6 * (sw + gap) + sw;   // Service Request right edge
  // associations
  const R = B.Resident, U = B.User;
  s.push(assoc([[U.r, 110], [R.x, 110]], '1', '1', 'has', [(U.r + R.x) / 2, 96]));
  s.push(assoc([[R.r, 110], [D.x, 110]], '1', '0..*', 'makes', [(R.r + D.x) / 2, 96]));
  s.push(assoc([[R.x, 340], [B.ResidencyProof.r, 340]], '1', '0..*', 'files', [(R.x + B.ResidencyProof.r) / 2, 356]));
  s.push(assoc([[R.x, 372], [400, 372], [400, 600], [B.IncidentReport.r, 600]], '1', '0..*', 'reports', [372, 616]));
  s.push(assoc([[R.cx, R.b], [R.cx, B.AmenityReservation.y]], '1', '0..*', 'books', [R.cx + 40, (R.b + B.AmenityReservation.y) / 2]));
  s.push(assoc([[B.AmenityReservation.cx, B.AmenityReservation.b], [B.AmenityReservation.cx, B.Amenity.y]], '0..*', '1', 'reserves', [B.AmenityReservation.cx + 50, (B.AmenityReservation.b + B.Amenity.y) / 2]));
  s.push(assoc([[B.Payment.x, 630], [868, 630], [868, 250], [D.x, 250]], '0..1', '1', 'pays for', [985, 236]));
  s.push(assoc([[srR, sy + 27], [1978, sy + 27], [1978, 110], [B.Service.r, 110]], '0..*', '1', 'is for', [1940, 96]));
  s.push(assoc([[B.Service.cx, B.Service.b], [B.Service.cx, B.ServiceField.y]], '1', '0..*', 'asks', [B.Service.cx + 70, (B.Service.b + B.ServiceField.y) / 2]));
  s.push(assoc([[B.CommunityIssue.r, 630], [B.IssueUpdate.x, 630]], '1', '0..*', 'has', [(B.CommunityIssue.r + B.IssueUpdate.x) / 2, 616]));
  s.push(assoc([[B.CommunityIssue.cx, B.CommunityIssue.b], [B.CommunityIssue.cx, B.IssueReport.y]], '1', '1..*', 'counts', [B.CommunityIssue.cx + 44, (B.CommunityIssue.b + B.IssueReport.y) / 2]));
  s.push(assoc([[R.r, 372], [846, 372], [846, 1080], [1330, 1080], [1330, 1010], [B.IssueReport.x, 1010]], '1', '0..*', 'posts', [1230, 1066]));
  const A = B.Admin;
  s.push(assoc([[A.cx, A.y], [A.cx, B.Payment.b]], '1', '0..*', 'verifies', [A.cx + 44, (A.y + B.Payment.b) / 2]));
  s.push(assoc([[A.x, 1200], [B.AuditLogEntry.r, 1200]], '1', '0..*', 'records', [(A.x + B.AuditLogEntry.r) / 2, 1186]));
  s.push(assoc([[A.x, 1350], [868, 1350], [868, 1430], [B.Announcement.r, 1430]], '1', '0..*', 'posts', [868 - 24, 1392]));
  s.push(assoc([[A.r, 1200], [B.DisasterAlert.x, 1200]], '1', '0..*', 'publishes', [(A.r + B.DisasterAlert.x) / 2, 1186]));
  s.push(assoc([[B.DisasterAlert.r, 1200], [B.EvacuationCenter.x, 1200]], '0..*', '0..*', 'lists', [(B.DisasterAlert.r + B.EvacuationCenter.x) / 2, 1186]));
  // Super Admin is an Admin
  const SA = B.SuperAdmin;
  s.push(line([[SA.cx, SA.y], [SA.cx, A.b + 16]], { width: 1.5 }), arrowHead([SA.cx, SA.y], [SA.cx, A.b], { open: true, size: 16 }));
  // legend
  s.push(rect(1360, 1440, 600, 170, { rx: 4, fill: '#F7F9FC', sw: 1.2 }));
  s.push(text(1380, 1462, 'Legend', { size: 15, weight: 'bold', anchor: 'start' }));
  s.push(line([[1380, 1495], [1450, 1495]], { width: 1.5 }), text(1465, 1495, 'association, with multiplicity at each end', { size: 14, anchor: 'start' }));
  s.push(line([[1380, 1530], [1434, 1530]], { width: 1.5 }), arrowHead([1380, 1530], [1450, 1530], { open: true, size: 16 }), text(1465, 1530, 'generalization (is a kind of)', { size: 14, anchor: 'start' }));
  s.push(text(1380, 1568, '- attribute    + operation', { size: 14, anchor: 'start' }));
  s.push(text(1380, 1593, 'Attributes are the main database columns only.', { size: 13, anchor: 'start', color: '#475569' }));
  return svgDoc(W, H, s.join('') + boxes + subs.join(''));
}

module.exports = { name: 'Figure 7 - Class diagram', file: 'class_diagram', width: W, height: H, build };
