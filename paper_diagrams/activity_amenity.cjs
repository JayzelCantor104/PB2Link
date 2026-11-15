// Appendix: Activity diagram of amenity booking
// Based on submit_amenity_reservation.php, amenity_common.php (PB2_AMENITY_TRANSITIONS),
// update_reservation_status.php and cancel_amenity_reservation.php.
const { NAVY, FILL, text, rect, line, arrow, svgDoc } = require('./lib.cjs');
const { node, draw, bar, guard, note } = require('./fc_lib.cjs');

const W = 1380, H = 1700;
const R = 250, S = 690, T = 1130;   // lane centres: Resident, PB2Link website, Barangay staff

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
    choose: node('act', R, 160, 'Choose an amenity and a date', { w }),
    load: node('act', S, 160, 'Show the amenity, its hours, and what is still free that date', { w }),
    d1: node('merge', S, 260),
    hot: node('act', R, 260, 'Call the hotline number shown (ambulance)', { w }),
    fHot: node('final', R, 345),
    enter: node('act', R, 430, 'Enter the time (venue or vehicle) or the quantity (equipment), the purpose, and the destination of a vehicle', { w }),
    check: node('act', S, 430, 'Check the date (today up to 180 days ahead), the opening hours, and the limit of 2 active bookings', { w }),
    d2: node('merge', S, 540),
    why: node('act', R, 625, 'Read the reason and change the details', { w }),
    lock: node('act', S, 640, 'Lock the amenity, then check for a time overlap (venue, vehicle) or the units left (equipment)', { w }),
    d3: node('merge', S, 750),
    taken: node('act', R, 750, 'Read the times or units already taken', { w }),
    save: node('act', S, 850, 'Save the booking as Pending with a tracking code', { w }),
    notify: node('act', S, 980, 'Notify the resident by their chosen channel', { w }),
    fNotify: node('flowfinal', S, 1060),
    review: node('act', T, 980, 'Review the booking on the calendar', { w }),
    d4: node('merge', T, 1090),
    decline: node('act', S, 1180, 'Save the decline and the remark; notify the resident', { w }),
    fDecline: node('final', S, 1265),
    approve: node('act', T, 1190, 'Approve the booking', { w }),
    overlap: node('act', S, 1330, 'Decline the Pending bookings it overlaps; notify the residents', { w }),
    use: node('act', R, 1430, 'Use the amenity on the booked date', { w }),
    complete: node('act', T, 1520, 'Mark the booking Completed (or extend its end time for overtime)', { w }),
    fEnd: node('final', T, 1610),
  };
  const e = [];
  const A = (pts) => e.push(arrow(pts));
  A([n.init.bottom, n.choose.top]);
  A([n.choose.right, n.load.left]);
  A([n.load.bottom, n.d1.top]);
  A([n.d1.left, n.hot.right]); e.push(guard(n.d1.left[0] - 10, n.d1.y - 14, '[hotline amenity]', 'end'));
  A([n.hot.bottom, n.fHot.top]);
  A([n.d1.bottom, [S, 340], [R + 60, 340], [R + 60, n.enter.top[1]]]); e.push(guard(S + 10, 305, '[booked online]'));
  A([n.enter.right, n.check.left]);
  A([n.check.bottom, n.d2.top]);
  A([n.d2.left, [R + 90, n.d2.y], [R + 90, n.why.top[1]]]); e.push(guard(n.d2.left[0] - 10, n.d2.y - 14, '[a rule fails]', 'end'));
  A([n.why.left, [62, n.why.y], [62, n.enter.y], n.enter.left]);
  A([n.d2.bottom, n.lock.top]); e.push(guard(S + 12, n.d2.bottom[1] + 15, '[all rules pass]'));
  A([n.lock.bottom, n.d3.top]);
  A([n.d3.left, n.taken.right]); e.push(guard(n.d3.left[0] - 10, n.d3.y - 14, '[taken]', 'end'));
  A([n.taken.left, [62, n.taken.y], [62, n.enter.y + 30], [n.enter.left[0], n.enter.y + 30]]);
  A([n.d3.bottom, n.save.top]); e.push(guard(S + 12, n.d3.bottom[1] + 15, '[free]'));
  // fork after saving
  e.push(bar(S - 40, T + 40, 910));
  A([n.save.bottom, [S, 906]]);
  A([[S, 914], n.notify.top]);
  A([[T, 914], n.review.top]);
  A([n.notify.bottom, n.fNotify.top]);
  A([n.review.bottom, n.d4.top]);
  A([n.d4.left, [S + 60, n.d4.y], [S + 60, n.decline.top[1]]]); e.push(guard(n.d4.left[0] - 10, n.d4.y - 14, '[decline with a remark]', 'end'));
  A([n.decline.bottom, n.fDecline.top]);
  A([n.d4.bottom, n.approve.top]); e.push(guard(T + 12, n.d4.bottom[1] + 15, '[approve]'));
  A([n.approve.bottom, [T, n.overlap.y], n.overlap.right]);
  A([n.overlap.bottom, [S, n.use.y], n.use.right]);
  A([n.use.bottom, [R, n.complete.y], n.complete.left]);
  A([n.complete.bottom, n.fEnd.top]);
  const nt = note(940, 760, 380, 'While the booking is Pending, the resident may cancel it from Track Request. A resident may hold at most 2 Pending or Approved bookings.');
  e.push(nt.svg, line([[940, 760 + nt.h / 2], [n.save.right[0], n.save.y]], { dash: '6 4', width: 1.3 }));
  return svgDoc(W, H, lanes(20, 1650) + e.join('') + Object.values(n).map(draw).join(''));
}

module.exports = { name: 'Activity diagram - amenity booking', file: 'activity_amenity', width: W, height: H, build };
