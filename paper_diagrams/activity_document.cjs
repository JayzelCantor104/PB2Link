// Appendix: Activity diagram of a document request and payment verification
// Based on the submit_* endpoints (pb2_builtin_require_open, residency_requirement.php, pb2_builtin_extra_or_fail,
// pb2_payment_prepare_or_fail), admin_payments.php (verify / reject / waive), payment_resident.php (resubmit) and
// update_document_request.php (pb2_residency_release_block, pb2_payment_release_block, notices by email and SMS).
// The six document types share this flow; each form only asks its own details.
const { NAVY, FILL, text, rect, line, arrow, svgDoc } = require('./lib.cjs');
const { node, draw, bar, guard, note } = require('./fc_lib.cjs');

const W = 1380, H = 1990;
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
    choose: node('act', R, 165, 'Choose a document and who it is for: myself or someone else', { w }),
    open: node('act', S, 165, 'Open the form filled in from the profile; for myself, use the valid ID on file', { w }),
    enter: node('act', R, 310, 'Fill in the purpose and details, attach the needed files, and choose to pay online, at the hall, or with an exemption', { w }),
    check: node('act', S, 310, 'Check that the service is open, the residency rule, the extra questions, and the payment details', { w }),
    d1: node('merge', S, 425),
    fix: node('act', R, 425, 'Read the message and correct the form', { w }),
    save: node('act', S, 530, 'Save the request as Pending with its tracking code and the payment record', { w }),
    notify: node('act', S, 700, 'Send the "request received" notice by email and SMS', { w }),
    fNotify: node('flowfinal', S, 785),
    verify: node('act', T, 700, 'Match the reference number and amount with the e-wallet history, or check the exemption', { w }),
    d2: node('merge', T, 815),
    reject: node('act', S, 905, 'Mark the payment Rejected with the reason; notify the resident', { w }),
    resub: node('act', R, 905, 'Upload a new receipt from Track Request', { w }),
    paid: node('act', T, 960, 'Record the treasurer’s O.R. number (Paid) or waive the fee', { w }),
    process: node('act', T, 1080, 'Set the request to Processing and prepare the document', { w }),
    gate: node('act', S, 1200, 'Before release, check that the payment is Paid or Waived and any needed residency proof is verified', { w }),
    d3: node('merge', S, 1315),
    settle: node('act', T, 1315, 'Settle the payment or verify the residency proof first', { w }),
    ready: node('act', T, 1430, 'Mark the request Ready for Pick Up and print the document', { w }),
    notify2: node('act', S, 1545, 'Notify the resident by email and SMS', { w }),
    claim: node('act', R, 1655, 'Claim the document at the barangay hall', { w }),
    claimed: node('act', T, 1765, 'Mark the request Claimed', { w }),
    fEnd: node('final', T, 1860),
  };
  const e = [];
  const A = (pts) => e.push(arrow(pts));
  A([n.init.bottom, n.choose.top]);
  A([n.choose.right, n.open.left]);
  A([n.open.bottom, [S, 240], [R, 240], n.enter.top]);
  A([n.enter.right, n.check.left]);
  A([n.check.bottom, n.d1.top]);
  A([n.d1.left, n.fix.right]); e.push(guard(n.d1.left[0] - 10, n.d1.y - 14, '[a check fails]', 'end'));
  A([n.fix.left, [62, n.fix.y], [62, n.enter.y], n.enter.left]);
  A([n.d1.bottom, n.save.top]); e.push(guard(S + 12, n.d1.bottom[1] + 15, '[all checks pass]'));
  e.push(bar(S - 40, T + 40, 625));
  A([n.save.bottom, [S, 621]]);
  A([[S, 629], n.notify.top]);
  A([[T, 629], n.verify.top]);
  A([n.notify.bottom, n.fNotify.top]);
  A([n.verify.bottom, n.d2.top]);
  A([n.d2.left, [S + 60, n.d2.y], [S + 60, n.reject.top[1]]]); e.push(guard(n.d2.left[0] - 10, n.d2.y - 14, '[does not match]', 'end'));
  A([n.reject.left, n.resub.right]);
  A([n.resub.bottom, [R, 1022], [1325, 1022], [1325, n.verify.y], n.verify.right]);
  A([n.d2.bottom, n.paid.top]); e.push(guard(T + 12, n.d2.bottom[1] + 15, '[matches or exempt]'));
  A([n.paid.bottom, n.process.top]);
  A([n.process.bottom, [T, 1140], [S, 1140], n.gate.top]);
  A([n.gate.bottom, n.d3.top]);
  A([n.d3.right, n.settle.left]); e.push(guard(n.d3.right[0] + 10, n.d3.y - 14, '[not settled]'));
  A([n.settle.top, [T, 1250], [n.gate.right[0] + 30, 1250], [n.gate.right[0] + 30, n.gate.y], n.gate.right]);
  A([n.d3.bottom, [S, 1380], [T - 60, 1380], [T - 60, n.ready.top[1]]]); e.push(guard(S + 12, n.d3.bottom[1] + 15, '[cleared]'));
  A([n.ready.bottom, [T, n.notify2.y], n.notify2.right]);
  A([n.notify2.bottom, [S, n.claim.y], n.claim.right]);
  A([n.claim.bottom, [R, n.claimed.y], n.claimed.left]);
  A([n.claimed.bottom, n.fEnd.top]);
  const nt = note(70, 1080, 360, 'The six document types follow this same flow; each form asks for its own details. A pay-at-hall request may be Ready for Pick Up before payment, but not Claimed. Staff may reject a request with a reason that the resident sees.');
  e.push(nt.svg);
  return svgDoc(W, H, lanes(20, 1940) + e.join('') + Object.values(n).map(draw).join(''));
}

module.exports = { name: 'Activity diagram - document request', file: 'activity_document', width: W, height: H, build };
