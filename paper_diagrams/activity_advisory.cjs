// Appendix: Activity diagram of publishing a disaster advisory
// Based on hazard_feeds_common.php (modes off / draft / auto; rainfall stays a draft), disaster_risk.php save_alert
// (PB2_ADVISORY_BLANK, is_practice), advisory_sms.php pb2_advisory_went_live() and advisory_push.php.
const { NAVY, FILL, text, rect, line, arrow, svgDoc } = require('./lib.cjs');
const { node, draw, bar, guard, note } = require('./fc_lib.cjs');

const W = 1560, H = 1640;
const L = 230, S1 = 640, S2 = 960, R = 1345;   // Staff | Website (two columns) | Residents

function lanes(top, height) {
  const s = [];
  s.push(rect(430, top, 740, height, { rx: 0, fill: FILL, sw: 0, stroke: FILL }));
  s.push(rect(30, top, 1500, height, { rx: 0, fill: 'none', sw: 1.6 }));
  s.push(line([[430, top], [430, top + height]], { width: 1.2 }), line([[1170, top], [1170, top + height]], { width: 1.2 }));
  s.push(rect(30, top, 1500, 38, { rx: 0, fill: NAVY, stroke: NAVY }));
  [['Barangay staff', L], ['PB2Link website', 800], ['Residents', R]].forEach(([t, x]) => s.push(text(x, top + 19, t, { size: 17, weight: 'bold', color: '#FFFFFF' })));
  return s.join('');
}

function build() {
  const w = 280;
  const n = {
    initW: node('init', S1, 85),
    read: node('act', S1, 175, 'Read PAGASA, PHIVOLCS, GDACS, USGS, and Open-Meteo when a page is opened or on schedule', { w }),
    detect: node('act', S1, 300, 'Record a serious reading: a Cavite wind signal, a nearby earthquake, a strong storm, or heavy rain', { w }),
    dMode: node('merge', S1, 405),
    feedsOnly: node('act', S2, 405, 'Show the readings on the hazard cards only', { w }),
    fOff: node('flowfinal', S2, 480),
    auto: node('act', S1, 540, 'Publish the advisory as the system', { w }),
    initS: node('init', L, 85),
    write: node('act', L, 175, 'Write an advisory, from a template if needed, with an optional Filipino version', { w }),
    review: node('act', L, 405, 'Review the detection and open the advisory form filled in from it', { w }),
    mStaff: node('merge', L, 520),
    save: node('act', L, 610, 'Save the advisory as live or as practice', { w }),
    blanks: node('act', S2, 610, 'Check for blanks such as {AREAS} left unfilled', { w }),
    dBlank: node('merge', S2, 705),
    fill: node('act', L, 705, 'Fill in the blanks', { w }),
    dPractice: node('merge', S2, 800),
    practice: node('act', S2, 900, 'Show it to staff only; text verified staff mobiles and push to staff devices', { w }),
    fPractice: node('final', S2, 990),
    mLive: node('merge', S1, 800),
    show: node('act', S1, 900, 'Show it on the public pages and the offline emergency page', { w }),
    push: node('act', S1, 1115, 'Send device alerts (once per alert level)', { w }),
    dSms: node('merge', S2, 1115),
    text: node('act', S2, 1225, 'Text every Active resident in their chosen language (once per alert level)', { w }),
    manual: node('act', L, 1225, 'Send an SMS from the dispatcher if needed', { w }),
    receive: node('act', R, 1425, 'Receive the advisory on the website, the emergency page, by SMS, or as a device alert', { w: 270 }),
    fEnd: node('final', R, 1535),
  };
  const e = [];
  const A = (pts) => e.push(arrow(pts));
  // automatic path
  A([n.initW.bottom, n.read.top]);
  A([n.read.bottom, n.detect.top]);
  A([n.detect.bottom, n.dMode.top]);
  A([n.dMode.right, n.feedsOnly.left]); e.push(guard(n.dMode.right[0] + 10, n.dMode.y - 14, '[mode: off]'));
  A([n.feedsOnly.bottom, n.fOff.top]);
  A([n.dMode.left, n.review.right]); e.push(guard(n.dMode.left[0] - 10, n.dMode.y - 14, '[mode: draft, or rainfall]', 'end'));
  A([n.dMode.bottom, n.auto.top]); e.push(guard(S1 + 12, n.dMode.bottom[1] + 15, '[mode: automatic]'));
  A([n.auto.bottom, n.mLive.top]);
  // staff path
  A([n.initS.bottom, n.write.top]);
  A([n.write.left, [52, n.write.y], [52, n.mStaff.y], n.mStaff.left]);
  A([n.review.bottom, n.mStaff.top]);
  A([n.mStaff.bottom, n.save.top]);
  A([n.save.right, n.blanks.left]);
  A([n.blanks.bottom, n.dBlank.top]);
  A([n.dBlank.left, n.fill.right]); e.push(guard(n.dBlank.left[0] - 10, n.dBlank.y - 14, '[blanks left]', 'end'));
  A([n.fill.left, [62, n.fill.y], [62, n.save.y], n.save.left]);
  A([n.dBlank.bottom, n.dPractice.top]); e.push(guard(S2 + 12, n.dBlank.bottom[1] + 15, '[all filled]'));
  A([n.dPractice.bottom, n.practice.top]); e.push(guard(S2 + 12, n.dPractice.bottom[1] + 15, '[practice]'));
  A([n.practice.bottom, n.fPractice.top]);
  A([n.dPractice.left, n.mLive.right]); e.push(guard(n.dPractice.left[0] - 10, n.dPractice.y - 14, '[live]', 'end'));
  A([n.mLive.bottom, n.show.top]);
  // fork into push and SMS
  e.push(bar(S1 - 60, S2 + 60, 1040));
  A([n.show.bottom, [S1, 1036]]);
  A([[S1, 1044], n.push.top]);
  A([[S2, 1044], n.dSms.top]);
  A([n.dSms.bottom, n.text.top]); e.push(guard(S2 + 12, n.dSms.bottom[1] + 15, '[SMS mode: automatic]'));
  A([n.dSms.left, [S1 + 160, n.dSms.y], [S1 + 160, 1160], [L + 60, 1160], [L + 60, n.manual.top[1]]]); e.push(guard(S1 + 175, 1146, '[SMS mode: manual]'));
  // join
  e.push(bar(L - 60, S2 + 60, 1325));
  A([n.push.bottom, [S1, 1321]]);
  A([n.text.bottom, [S2, 1321]]);
  A([n.manual.bottom, [L, 1321]]);
  A([[S2 + 60, 1325], [R, 1325], n.receive.top]);
  A([n.receive.bottom, n.fEnd.top]);
  const nt = note(80, 1400, 600, 'A live advisory that is not confirmed as still accurate within 24 hours is flagged for staff review. Advisories stay active until staff deactivate them.');
  e.push(nt.svg);
  return svgDoc(W, H, lanes(20, 1590) + e.join('') + Object.values(n).map(draw).join(''));
}

module.exports = { name: 'Activity diagram - advisory publishing', file: 'activity_advisory', width: W, height: H, build };
