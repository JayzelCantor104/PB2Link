// Appendix: Activity diagram of reporting a community issue
// Based on issue_map.php (report), issue_map_common.php (boundary, 30 m duplicate check, 5 pins a day, live/held
// rules, PB2_ISSUE_TRANSITIONS), issue_map_screen.php (blocked and held wording) and admin_issue_map.php
// (approve / remove, status updates with a public remark, notices to reporters).
const { NAVY, FILL, text, rect, line, arrow, svgDoc } = require('./lib.cjs');
const { node, draw, guard, note } = require('./fc_lib.cjs');

const W = 1380, H = 1700;
const R = 250, S = 690, T = 1130;

function lanes(top, height) {
  const s = [];
  s.push(rect(470, top, 440, height, { rx: 0, fill: FILL, sw: 0, stroke: FILL }));
  s.push(rect(30, top, 1320, height, { rx: 0, fill: 'none', sw: 1.6 }));
  s.push(line([[470, top], [470, top + height]], { width: 1.2 }), line([[910, top], [910, top + height]], { width: 1.2 }));
  s.push(rect(30, top, 1320, 38, { rx: 0, fill: NAVY, stroke: NAVY }));
  [['Resident', R], ['PB2Link website', S], ['Barangay staff', T]].forEach(([t, x]) => s.push(text(x, top + 19, t, { size: 17, weight: 'bold', color: '#FFFFFF' })));
  return s.join('');
}

function build() {
  const w = 270;
  const n = {
    init: node('init', R, 80),
    pin: node('act', R, 170, 'Tap a spot inside the barangay, or use the current location, and pick a category', { w }),
    near: node('act', S, 170, 'Look for an open issue of the same category within 30 meters', { w }),
    d1: node('merge', S, 280),
    join: node('act', R, 280, 'Add a report to that issue, or confirm that it is a new problem', { w }),
    write: node('act', R, 420, 'Write a comment, add a landmark or photo if wanted, and agree to the posting rules', { w }),
    check: node('act', S, 420, 'Check the account (Active, not paused), the boundary, the limit of 5 new pins a day, and screen the text', { w }),
    d2: node('merge', S, 535),
    fix: node('act', R, 535, 'Read the message and edit the text', { w }),
    save: node('act', S, 640, 'Save the report; a held report is not public and not counted yet', { w }),
    d3: node('merge', S, 745),
    review: node('act', T, 745, 'Check the held report', { w }),
    d4: node('merge', T, 850),
    remove: node('act', T, 960, 'Keep it off the map, record the reason, and email the resident', { w }),
    fRemove: node('final', T, 1045),
    live: node('act', S, 960, 'Show the flag on the map; its color follows the number of live reports', { w }),
    status: node('act', T, 1150, 'Update the status (Acknowledged, In Progress, Resolved, or Rejected) with a public remark', { w }),
    timeline: node('act', S, 1280, 'Add the update to the public timeline and notify the reporters (SMS only when Resolved)', { w }),
    see: node('act', R, 1410, 'See the status and the staff updates on the map', { w }),
    fEnd: node('final', R, 1500),
  };
  const e = [];
  const A = (pts) => e.push(arrow(pts));
  A([n.init.bottom, n.pin.top]);
  A([n.pin.right, n.near.left]);
  A([n.near.bottom, n.d1.top]);
  A([n.d1.left, n.join.right]); e.push(guard(n.d1.left[0] - 10, n.d1.y - 14, '[one is nearby]', 'end'));
  A([n.join.bottom, n.write.top]);
  A([n.d1.bottom, [S, 345], [R + 90, 345], [R + 90, n.write.top[1]]]); e.push(guard(S + 12, n.d1.bottom[1] + 15, '[none nearby]'));
  A([n.write.right, n.check.left]);
  A([n.check.bottom, n.d2.top]);
  A([n.d2.left, n.fix.right]); e.push(guard(n.d2.left[0] - 10, n.d2.y - 30, '[blocked: phone, email,\nor offensive word]', 'end'));
  A([n.fix.left, [62, n.fix.y], [62, n.write.y], n.write.left]);
  A([n.d2.bottom, n.save.top]); e.push(guard(S + 12, n.d2.bottom[1] + 15, '[passes]'));
  A([n.save.bottom, n.d3.top]);
  A([n.d3.right, n.review.left]); e.push(guard(n.d3.right[0] + 10, n.d3.y - 30, '[held: may name a person,\nor review mode is on]'));
  A([n.review.bottom, n.d4.top]);
  A([n.d4.bottom, n.remove.top]); e.push(guard(T + 12, n.d4.bottom[1] + 15, '[don’t post]'));
  A([n.remove.bottom, n.fRemove.top]);
  A([n.d4.left, [S + 70, n.d4.y], [S + 70, n.live.top[1]]]); e.push(guard(n.d4.left[0] - 10, n.d4.y - 14, '[post it]', 'end'));
  A([n.d3.bottom, n.live.top]); e.push(guard(S - 12, n.d3.bottom[1] + 15, '[live]', 'end'));
  A([n.live.bottom, [S, 1090], [T, 1090], n.status.top]);
  A([n.status.bottom, [T, n.timeline.y], n.timeline.right]);
  A([n.timeline.bottom, [S, n.see.y], n.see.right]);
  A([n.see.bottom, n.fEnd.top]);
  const nt = note(70, 1000, 360, 'Residents’ names are never shown on the public map. Other residents may report a comment; three reports hide it until staff check it. Staff may also merge a duplicate pin or pause a resident’s posting.');
  e.push(nt.svg);
  return svgDoc(W, H, lanes(20, 1650) + e.join('') + Object.values(n).map(draw).join(''));
}

module.exports = { name: 'Activity diagram - community issue', file: 'activity_issue', width: W, height: H, build };
