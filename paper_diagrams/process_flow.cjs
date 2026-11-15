// Figure 6. Process flow of PB2Link (A. Registration and document request, B. Community issue report)
const { NAVY, FILL, MUTED, wrap, text, rect, line, arrow, svgDoc } = require('./lib.cjs');

const W = 1380, LANE = { R: 250, S: 690, T: 1130 };
const BW = 236, BH = 70, DW = 248, DH = 116, TW = 146, TH = 44;

function node(kind, lane, y, label) {
  const x = LANE[lane];
  const [w, h] = kind === 'box' ? [BW, BH] : kind === 'dia' ? [DW, DH] : [TW, TH];
  return { kind, x, y, w, h, label,
    top: [x, y - h / 2], bottom: [x, y + h / 2], left: [x - w / 2, y], right: [x + w / 2, y] };
}
function draw(n) {
  if (n.kind === 'box') return rect(n.x - BW / 2, n.y - BH / 2, BW, BH, { rx: 4 }) + text(n.x, n.y, wrap(n.label, 30), { size: 15 });
  if (n.kind === 'dia') {
    const p = [[n.x, n.y - DH / 2], [n.x + DW / 2, n.y], [n.x, n.y + DH / 2], [n.x - DW / 2, n.y]];
    return `<polygon points="${p.map(q => q.join(',')).join(' ')}" fill="#FFFFFF" stroke="${NAVY}" stroke-width="1.6"/>` +
      text(n.x, n.y, wrap(n.label, 20), { size: 15 });
  }
  return rect(n.x - TW / 2, n.y - TH / 2, TW, TH, { rx: 22, fill: NAVY, stroke: NAVY }) + text(n.x, n.y, n.label, { size: 15, weight: 'bold', color: '#FFFFFF' });
}
function label(x, y, t, anchor = 'start') { return text(x, y, t, { size: 14, weight: 'bold', color: NAVY, anchor }); }

function lanes(oy, title, height) {
  const s = [text(30, oy + 14, title, { size: 19, weight: 'bold', anchor: 'start' })];
  const top = oy + 36;
  s.push(rect(470, top, 440, height, { rx: 0, fill: FILL, sw: 0, stroke: FILL }));
  s.push(rect(30, top, 1320, height, { rx: 0, fill: 'none', sw: 1.6 }));
  s.push(line([[470, top], [470, top + height]], { width: 1.2 }), line([[910, top], [910, top + height]], { width: 1.2 }));
  s.push(rect(30, top, 1320, 36, { rx: 0, fill: NAVY, stroke: NAVY }));
  [['Resident', 250], ['PB2Link website', 690], ['Barangay staff', 1130]].forEach(([t, x]) => s.push(text(x, top + 18, t, { size: 16, weight: 'bold', color: '#FFFFFF' })));
  return s.join('');
}

function flowA(oy) {
  const N = (k, l, y, t) => node(k, l, oy + y, t);
  const n = {
    start: N('term', 'R', 118, 'Start'),
    upload: N('box', 'R', 206, 'Upload the valid ID and selfie, then fill in the details and address'),
    scan: N('box', 'S', 206, 'Scan the ID (OCR) to fill in the form and check the selfie'),
    age: N('dia', 'S', 335, '18 years old or above?'),
    minor: N('box', 'R', 335, 'Told to ask a parent or guardian to request documents from their own account'),
    endMinor: N('term', 'R', 435, 'End'),
    codes: N('box', 'S', 460, 'Send a code to each email or mobile number given'),
    enter: N('box', 'R', 560, 'Enter the codes, then submit'),
    checks: N('dia', 'S', 680, 'All checks pass and auto-approval is on?'),
    review: N('box', 'T', 680, 'Review the registration and the failed checks'),
    decision: N('dia', 'T', 815, 'Staff decision'),
    activate: N('box', 'S', 815, 'Activate the account'),
    ask: N('box', 'T', 945, 'Ask the resident to fix items online or to visit the hall'),
    fix: N('box', 'R', 945, 'Fix the items through the restricted account and resubmit'),
    request: N('box', 'R', 1095, 'Sign in and request a document (form filled from the profile)'),
    archive: N('box', 'T', 1095, 'Archive the account with a reason (the record is kept)'),
    endArch: N('term', 'T', 1195, 'End'),
    pay: N('box', 'R', 1205, 'If there is a fee: pay online, pay at the hall, or claim an exemption'),
    save: N('box', 'S', 1205, 'Save the request, give a tracking code, send SMS and email notice'),
    verify: N('box', 'T', 1320, 'Verify the payment or exemption, and record the O.R. number when paid'),
    process: N('box', 'T', 1435, 'Process the request and update its status'),
    notify: N('box', 'S', 1435, 'Send each status change by SMS and email'),
    track: N('box', 'R', 1550, 'Track the request and claim the document at the hall'),
    end: N('term', 'R', 1650, 'End'),
  };
  const e = [];
  const A = pts => e.push(arrow(pts));
  A([n.start.bottom, n.upload.top]);
  A([n.upload.right, n.scan.left]);
  A([n.scan.bottom, n.age.top]);
  A([n.age.left, n.minor.right]); e.push(label(n.age.left[0] - 34, n.age.y - 10, 'No'));
  A([n.minor.bottom, n.endMinor.top]);
  A([n.age.bottom, n.codes.top]); e.push(label(n.age.x + 10, n.age.bottom[1] + 15, 'Yes'));
  A([n.codes.bottom, [n.codes.x, n.enter.y], n.enter.right]);
  A([n.enter.bottom, [n.enter.x, n.checks.y], n.checks.left]);
  A([n.checks.bottom, n.activate.top]); e.push(label(n.checks.x + 10, n.checks.bottom[1] + 15, 'Yes'));
  A([n.checks.right, n.review.left]); e.push(label(n.checks.right[0] + 14, n.checks.y - 10, 'No'));
  A([n.review.bottom, n.decision.top]);
  A([n.decision.left, n.activate.right]); e.push(label(n.decision.left[0] - 14, n.decision.y - 10, 'Approve', 'end'));
  A([n.decision.bottom, n.ask.top]); e.push(label(n.decision.x + 10, n.decision.bottom[1] + 15, 'Ask for action'));
  A([n.decision.right, [1305, n.decision.y], [1305, n.archive.y], n.archive.right]); e.push(label(1262, n.decision.y - 12, 'Archive'));
  A([n.archive.bottom, n.endArch.top]);
  A([n.ask.left, n.fix.right]);
  A([n.fix.bottom, [n.fix.x, n.fix.y + 62], [1338, n.fix.y + 62], [1338, n.review.y], n.review.right]);
  e.push(text(1080, n.fix.y + 52, 'Resubmitted for review', { size: 13, italic: true, color: MUTED }));
  A([n.activate.bottom, [n.activate.x, n.request.y], n.request.right]);
  A([n.request.bottom, n.pay.top]);
  A([n.pay.right, n.save.left]);
  A([n.save.bottom, [n.save.x, n.verify.y], n.verify.left]);
  A([n.verify.bottom, n.process.top]);
  A([n.process.left, n.notify.right]);
  A([n.notify.bottom, [n.notify.x, n.track.y], n.track.right]);
  A([n.track.bottom, n.end.top]);
  return lanes(oy, 'A. Registration and document request', 1665) + e.join('') + Object.values(n).map(draw).join('');
}

function flowB(oy) {
  const N = (k, l, y, t) => node(k, l, oy + y, t);
  const n = {
    start: N('term', 'R', 100, 'Start'),
    pin: N('box', 'R', 200, 'Agree to the posting rules, then pin an issue with a type, comment, and optional photo'),
    check: N('box', 'S', 200, 'Refuse pins outside the barangay; look for open issues of the same type within 30 m'),
    near: N('dia', 'S', 330, 'Same type within\n30 m?'),
    vote: N('box', 'R', 330, 'Add the report to that pin (a vote) or confirm a new pin'),
    screen: N('box', 'S', 460, 'Screen the comment and landmark'),
    blocked: N('dia', 'S', 590, 'Phone number, email, or offensive word?'),
    edit: N('box', 'R', 590, 'Edit the comment and send it again'),
    held: N('dia', 'S', 730, 'May name a person, or review mode on?'),
    staffCheck: N('box', 'T', 730, 'Check the held report (not yet shown or counted)'),
    post: N('dia', 'T', 865, 'Post it?'),
    save: N('box', 'S', 865, 'Save the pin or report and update the flag color'),
    remove: N('box', 'T', 995, 'Remove it, email the resident the reason, and pause posting if abusive'),
    endT: N('term', 'T', 1095, 'End'),
    update: N('box', 'T', 1200, 'Review the issue and update its status with a public remark'),
    notify: N('box', 'S', 1315, 'Notify reporters by email, and by SMS when resolved if they chose SMS'),
    end: N('term', 'R', 1315, 'End'),
  };
  const e = [];
  const A = pts => e.push(arrow(pts));
  A([n.start.bottom, n.pin.top]);
  A([n.pin.right, n.check.left]);
  A([n.check.bottom, n.near.top]);
  A([n.near.left, n.vote.right]); e.push(label(n.near.left[0] - 34, n.near.y - 10, 'Yes'));
  A([n.near.bottom, n.screen.top]); e.push(label(n.near.x + 10, n.near.bottom[1] + 15, 'No'));
  A([n.vote.bottom, [n.vote.x, n.screen.y - 12], [n.screen.left[0], n.screen.y - 12]]);
  A([n.screen.bottom, n.blocked.top]);
  A([n.blocked.left, n.edit.right]); e.push(label(n.blocked.left[0] - 34, n.blocked.y - 10, 'Yes'));
  A([n.edit.left, [75, n.edit.y], [75, n.screen.y + 14], [n.screen.left[0], n.screen.y + 14]]);
  A([n.blocked.bottom, n.held.top]); e.push(label(n.blocked.x + 10, n.blocked.bottom[1] + 15, 'No'));
  A([n.held.right, n.staffCheck.left]); e.push(label(n.held.right[0] + 12, n.held.y - 10, 'Yes (held)'));
  A([n.held.bottom, n.save.top]); e.push(label(n.held.x + 10, n.held.bottom[1] + 15, 'No'));
  A([n.staffCheck.bottom, n.post.top]);
  A([n.post.left, n.save.right]); e.push(label(n.post.left[0] - 14, n.post.y - 10, 'Yes', 'end'));
  A([n.post.bottom, n.remove.top]); e.push(label(n.post.x + 10, n.post.bottom[1] + 15, 'No'));
  A([n.remove.bottom, n.endT.top]);
  A([n.save.bottom, [n.save.x, n.update.y], n.update.left]);
  A([n.update.bottom, [n.update.x, n.notify.y], n.notify.right]);
  A([n.notify.left, n.end.right]);
  return lanes(oy, 'B. Community issue report', 1330) + e.join('') + Object.values(n).map(draw).join('');
}

const OB = 1760, H = OB + 1400;
function build() { return svgDoc(W, H, flowA(20) + flowB(OB)); }

module.exports = { name: 'Figure 6 - Process flow', file: 'process_flow', width: W, height: H, build };
