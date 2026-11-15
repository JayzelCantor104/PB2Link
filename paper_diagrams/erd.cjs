// Figure 4. Entity relationship diagram of PB2Link
// Column lists come from the barangay_bims database (key columns only).
const { NAVY, FONT, esc, wrap, text, rect, line, svgDoc } = require('./lib.cjs');

const W = 1740, H = 2010, TW = 330, HEAD = 30, ROW = 20;

// [name, x, y, fields]  field = [key ('PK' | 'FK' | ''), column]
const tables = [
  ['pending_profile_changes', 40, 40, [['PK', 'change_id'], ['FK', 'user_id'], ['', 'field_name'], ['', 'new_value'], ['', 'status']]],
  ['users', 40, 230, [['PK', 'user_id'], ['', 'control_num'], ['', 'email (nullable)'], ['', 'password_hash']]],
  ['residents', 40, 420, [['PK', 'resident_id'], ['FK', 'user_id'], ['', 'control_num'], ['', 'fName, mName, lName'], ['', 'birth_date'], ['', 'residing_since'], ['', 'id_verification_status'], ['', 'status'], ['', 'approval_method'], ['FK', 'registered_by'], ['', 'two_factor_enabled'], ['', 'two_factor_channel']]],
  ['incident_reports', 480, 40, [['PK', 'id'], ['FK', 'user_id'], ['', 'track_code'], ['', 'incident_class'], ['', 'status'], ['FK', 'processed_by']]],
  ['req_barangay_clearance *', 480, 230, [['PK', 'request_id'], ['', 'tracking_code'], ['FK', 'resident_id'], ['', 'purpose'], ['', 'status'], ['', 'source'], ['FK', 'encoded_by'], ['FK', 'processed_by']]],
  ['service_submissions', 480, 460, [['PK', 'request_id'], ['FK', 'service_id'], ['FK', 'resident_id'], ['', 'tracking_code'], ['', 'status'], ['', 'source'], ['FK', 'encoded_by'], ['FK', 'processed_by']]],
  ['req_amenity_reservation', 480, 690, [['PK', 'request_id'], ['FK', 'amenity_id'], ['FK', 'resident_id'], ['', 'reservation_date'], ['', 'start_time, end_time'], ['', 'status'], ['FK', 'processed_by']]],
  ['request_payments', 480, 900, [['PK', 'payment_id'], ['FK', 'resident_id'], ['', 'request_type, request_id'], ['', 'fee_key'], ['', 'amount_due'], ['', 'status'], ['', 'or_number'], ['', 'receipt_sha256'], ['FK', 'verified_by']]],
  ['resident_residency_proofs', 480, 1150, [['PK', 'proof_id'], ['FK', 'resident_id'], ['', 'proof_type'], ['', 'status'], ['FK', 'reviewed_by']]],
  ['trusted_devices', 920, 40, [['PK', 'device_id'], ['', 'tier'], ['', 'subject_id'], ['', 'token_hash'], ['', 'expires_at']]],
  ['admins', 920, 1100, [['PK', 'admin_id'], ['', 'username'], ['', 'email'], ['', 'role'], ['', 'position']]],
  ['admin_audit_log', 920, 1320, [['PK', 'log_id'], ['', 'actor_admin_id'], ['', 'event_type'], ['', 'target_entity_type'], ['', 'created_at']]],
  ['service_fields', 1360, 240, [['PK', 'field_id'], ['FK', 'service_id'], ['', 'builtin_key'], ['', 'field_label'], ['', 'field_type']]],
  ['services', 1360, 440, [['PK', 'service_id'], ['', 'title'], ['', 'is_active'], ['FK', 'created_by']]],
  ['amenities', 1360, 640, [['PK', 'amenity_id'], ['', 'name'], ['', 'category'], ['', 'total_quantity']]],
  ['request_fees', 1360, 880, [['PK', 'fee_key'], ['', 'amount'], ['', 'waiver settings']]],
  ['disaster_alerts', 1360, 1140, [['PK', 'id'], ['', 'title'], ['', 'alert_level'], ['', 'is_active']]],
  ['evacuation_centers', 1360, 1300, [['PK', 'id'], ['', 'name'], ['', 'capacity_families'], ['', 'latitude, longitude']]],
  ['community_issue_reports', 40, 1560, [['PK', 'report_id'], ['FK', 'issue_id'], ['FK', 'resident_id'], ['', 'comment'], ['', 'photo_path'], ['', 'held_at, removed_at'], ['', 'flag_count']]],
  ['community_issues', 480, 1560, [['PK', 'issue_id'], ['FK', 'created_by'], ['', 'category'], ['', 'latitude, longitude'], ['', 'status'], ['', 'report_count']]],
  ['community_issue_updates', 920, 1560, [['PK', 'update_id'], ['FK', 'issue_id'], ['FK', 'admin_id'], ['', 'new_status']]],
  ['community_issue_flags', 40, 1820, [['PK', 'flag_id'], ['FK', 'report_id'], ['FK', 'resident_id'], ['', 'reason']]],
  ['issue_map_suspensions', 480, 1820, [['PK', 'suspension_id'], ['FK', 'resident_id'], ['FK', 'report_id'], ['', 'ends_at'], ['FK', 'created_by']]],
];

function table([name, x, y, fields]) {
  const h = HEAD + fields.length * ROW + 12;
  const s = [rect(x, y, TW, h, { rx: 4, sw: 1.6 })];
  s.push(`<path d="M${x + 4},${y} H${x + TW - 4} Q${x + TW},${y} ${x + TW},${y + 4} V${y + HEAD} H${x} V${y + 4} Q${x},${y} ${x + 4},${y} Z" fill="${NAVY}"/>`);
  s.push(text(x + TW / 2, y + HEAD / 2, name, { size: 15, weight: 'bold', color: '#FFFFFF' }));
  fields.forEach(([k, f], i) => {
    const cy = y + HEAD + 6 + i * ROW + ROW / 2;
    if (k) s.push(text(x + 14, cy, k, { size: 12, weight: 'bold', anchor: 'start', color: '#475569' }));
    s.push(`<text x="${x + 50}" y="${cy + 4.5}" font-family="${FONT}" font-size="13" fill="#1F2937"${k === 'PK' ? ' text-decoration="underline"' : ''}>${esc(f)}</text>`);
  });
  return s.join('');
}

// Crow's foot markers drawn at point p; (dx, dy) points from the table along the line.
function bar(p, d, dist) {
  const [x, y] = [p[0] + d[0] * dist, p[1] + d[1] * dist], n = [-d[1], d[0]];
  return line([[x + n[0] * 8, y + n[1] * 8], [x - n[0] * 8, y - n[1] * 8]], { width: 1.6 });
}
function marker(p, d, kind) {
  const n = [-d[1], d[0]];
  if (kind === 'one') return bar(p, d, 9) + bar(p, d, 15);
  if (kind === 'zeroOne') {
    const c = [p[0] + d[0] * 22, p[1] + d[1] * 22];
    return bar(p, d, 9) + `<circle cx="${c[0]}" cy="${c[1]}" r="5.5" fill="#FFFFFF" stroke="${NAVY}" stroke-width="1.6"/>`;
  }
  // many (one or more): crow's foot plus a bar
  const t = [p[0] + d[0] * 16, p[1] + d[1] * 16];
  return line([[p[0] + n[0] * 9, p[1] + n[1] * 9], t, [p[0] - n[0] * 9, p[1] - n[1] * 9]], { width: 1.6 }) +
    line([p, t], { width: 1.6 }) + bar(p, d, 21);
}
function unit(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }

// [points (parent end first), parent marker, child marker, dashed?]
const links = [
  [[[205, 230], [205, 182]], 'one', 'many'],                                   // users - pending_profile_changes
  [[[205, 352], [205, 420]], 'one', 'one'],                                    // users - residents
  [[[370, 260], [425, 260], [425, 100], [480, 100]], 'one', 'many'],           // users - incident_reports
  [[[370, 440], [400, 440], [400, 316], [480, 316]], 'one', 'many'],           // residents - clearance
  [[[370, 470], [410, 470], [410, 546], [480, 546]], 'one', 'many'],           // residents - service_submissions
  [[[370, 500], [420, 500], [420, 776], [480, 776]], 'one', 'many'],           // residents - amenity reservation
  [[[370, 530], [430, 530], [430, 966], [480, 966]], 'one', 'many'],           // residents - payments
  [[[370, 560], [440, 560], [440, 1216], [480, 1216]], 'one', 'many'],         // residents - residency proofs
  [[[100, 702], [100, 1560]], 'one', 'many'],                                  // residents - issue reports
  [[[160, 702], [160, 1500], [560, 1500], [560, 1560]], 'one', 'many'],        // residents - community_issues
  [[[40, 600], [20, 600], [20, 1900], [40, 1900]], 'one', 'many'],             // residents - flags
  [[[220, 702], [220, 1480], [455, 1480], [455, 1880], [480, 1880]], 'one', 'many'], // residents - suspensions
  [[[1360, 526], [810, 526]], 'one', 'many'],                                  // services - service_submissions
  [[[1525, 440], [1525, 382]], 'zeroOne', 'many'],                             // services - service_fields (built-in questions have no service)
  [[[1360, 726], [810, 726]], 'one', 'many'],                                  // amenities - reservations
  [[[1360, 946], [810, 946]], 'one', 'many', true],                            // request_fees - payments (kept by the system)
  [[[920, 1115], [835, 1115], [835, 180], [810, 180]], 'one', 'many'],         // admins - incident processed_by
  [[[920, 1135], [845, 1135], [845, 416], [810, 416]], 'one', 'many'],         // admins - clearance processed_by
  [[[920, 1155], [855, 1155], [855, 646], [810, 646]], 'one', 'many'],         // admins - submissions processed_by
  [[[920, 1175], [865, 1175], [865, 856], [810, 856]], 'one', 'many'],         // admins - reservation processed_by
  [[[920, 1195], [875, 1195], [875, 1106], [810, 1106]], 'one', 'many'],       // admins - payments verified_by
  [[[920, 1215], [885, 1215], [885, 1276], [810, 1276]], 'one', 'many'],       // admins - proofs reviewed_by
  [[[1250, 1120], [1300, 1120], [1300, 540], [1360, 540]], 'one', 'many'],     // admins - services created_by
  [[[1085, 1242], [1085, 1320]], 'one', 'many', true],                         // admins - audit log (kept by the system)
  [[[1250, 1200], [1290, 1200], [1290, 1640], [1250, 1640]], 'one', 'many'],   // admins - issue updates
  [[[920, 1230], [900, 1230], [900, 1940], [810, 1940]], 'one', 'many'],       // admins - suspensions created_by
  [[[960, 1242], [960, 1306], [460, 1306], [460, 646], [370, 646]], 'zeroOne', 'many'],   // admins - residents registered_by (hall)
  [[[980, 1100], [980, 396], [810, 396]], 'zeroOne', 'many'],                  // admins - clearance encoded_by (walk-in)
  [[[1010, 1100], [1010, 626], [810, 626]], 'zeroOne', 'many'],                // admins - submissions encoded_by (walk-in)
  [[[480, 1620], [370, 1620]], 'one', 'many'],                                 // community_issues - reports
  [[[810, 1620], [920, 1620]], 'one', 'many'],                                 // community_issues - updates
  [[[205, 1742], [205, 1820]], 'one', 'many'],                                 // reports - flags
  [[[370, 1700], [420, 1700], [420, 1900], [480, 1900]], 'one', 'many'],       // reports - suspensions
];

function legend(x, y) {
  const s = [rect(x, y, TW + 40, 285, { rx: 4, fill: '#E8EEF6', sw: 1.4 })];
  s.push(text(x + 18, y + 24, 'Legend', { size: 16, weight: 'bold', anchor: 'start' }));
  s.push(text(x + 18, y + 50, 'PK  primary key', { size: 13, anchor: 'start' }));
  s.push(text(x + 18, y + 70, 'FK  foreign key', { size: 13, anchor: 'start' }));
  const rows = [['one', 'many', 'one to many'], ['one', 'one', 'one to one'], ['zeroOne', 'many', 'zero or one to many']];
  rows.forEach(([a, b, label], i) => {
    const ly = y + 100 + i * 30, x1 = x + 22, x2 = x + 110;
    s.push(line([[x1, ly], [x2, ly]]), marker([x1, ly], [1, 0], a), marker([x2, ly], [-1, 0], b));
    s.push(text(x + 125, ly, label, { size: 13, anchor: 'start' }));
  });
  const dy = y + 190;
  s.push(line([[x + 22, dy], [x + 110, dy]], { dash: '6 5' }), text(x + 125, dy, 'link kept by the system', { size: 13, anchor: 'start' }));
  s.push(text(x + 18, y + 226, wrap('* The six document request tables share these key columns; each adds the fields of its own form. trusted_devices points to a resident or an admin through tier and subject_id.', 58), { size: 11, anchor: 'start', color: '#475569', lineH: 1.3 }));
  return s.join('');
}

function build() {
  const s = [];
  for (const [pts, a, b, dashed] of links) s.push(line(pts, { dash: dashed ? '7 6' : null }));
  for (const t of tables) s.push(table(t));
  for (const [pts, a, b] of links) {
    s.push(marker(pts[0], unit(pts[0], pts[1]), a));
    const n = pts.length;
    s.push(marker(pts[n - 1], unit(pts[n - 1], pts[n - 2]), b));
  }
  s.push(legend(1340, 1700));
  return svgDoc(W, H, s.join(''));
}

module.exports = { name: 'Figure 4 - Entity relationship diagram', file: 'entity_relationship_diagram', width: W, height: H, build };
