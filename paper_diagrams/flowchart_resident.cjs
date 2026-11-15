// Appendix: Flowchart of the resident side of PB2Link
// Based on login.php (sign-in pause, status gate, restricted fix session) and App.jsx routes.
const { svgDoc, arrow, line } = require('./lib.cjs');
const { node, draw, lab } = require('./fc_lib.cjs');

const W = 1250, H = 1920;
const L = 190, M = 610, R = 1035;

function build() {
  const n = {
    start: node('term', M, 45, 'Start'),
    open: node('io', M, 135, 'Open pb2link.com'),
    pub: node('proc', M, 250, 'Show the public pages: Home, services list, announcements, waste schedules, disaster risk, preparedness, and Issue Map'),
    choose: node('dec', M, 405, 'Register, sign in, or browse?'),
    reg: node('proc', L, 405, 'Register (see Figure 6, Part A)'),
    endReg: node('term', L, 505, 'End'),
    endBrowse: node('term', R, 405, 'End'),
    login: node('io', M, 545, 'Enter the email or mobile number and the password'),
    paused: node('dec', M, 690, 'Is sign-in paused for this email or number?'),
    pmsg: node('proc', R, 690, 'Show the wait time: sign-in is paused for 15 minutes after 5 wrong tries'),
    correct: node('dec', M, 845, 'Is the password correct?'),
    fmsg: node('proc', R, 845, 'Count the failed try and show the tries left'),
    status: node('dec', M, 1005, 'Account status?'),
    restricted: node('proc', L, 1005, 'Open a restricted session that shows Edit Profile only'),
    fix: node('proc', L, 1135, 'Fix the items, then send the registration back for review'),
    endFix: node('term', L, 1250, 'End'),
    smsg: node('proc', R, 1005, 'Show the status message; no session is opened'),
    endMsg: node('term', R, 1115, 'End'),
    twofa: node('proc', M, 1160, 'If two-step sign-in is on, enter the one-time code sent by email or SMS'),
    pages: node('proc', M, 1280, 'Open the resident pages'),
    use: node('proc', M, 1410, 'Request documents and services, book amenities, file incident reports, report community issues, or edit the profile'),
    save: node('proc', M, 1550, 'Save it, give a tracking code, and send the notices'),
    track: node('proc', M, 1670, 'Track the request and read the notices'),
    out: node('proc', M, 1780, 'Sign out'),
    end: node('term', M, 1872, 'End'),
  };
  const e = [];
  const A = (pts) => e.push(arrow(pts));
  A([n.start.bottom, n.open.top]);
  A([n.open.bottom, n.pub.top]);
  A([n.pub.bottom, n.choose.top]);
  A([n.choose.left, n.reg.right]); e.push(lab(n.choose.left[0] - 12, n.choose.y - 14, 'Register', 'end'));
  A([n.reg.bottom, n.endReg.top]);
  A([n.choose.right, n.endBrowse.left]); e.push(lab(n.choose.right[0] + 12, n.choose.y - 14, 'Browse only'));
  A([n.choose.bottom, n.login.top]); e.push(lab(M + 12, n.choose.bottom[1] + 16, 'Sign in'));
  A([n.login.bottom, n.paused.top]);
  A([n.paused.right, n.pmsg.left]); e.push(lab(n.paused.right[0] + 12, n.paused.y - 14, 'Yes'));
  A([n.paused.bottom, n.correct.top]); e.push(lab(M + 12, n.paused.bottom[1] + 16, 'No'));
  // both "try again" paths return to the sign-in input
  A([n.pmsg.top, [R, 545], [n.login.right[0] - 13, 545]]);
  e.push(require('./lib.cjs').line([n.fmsg.right, [1222, n.fmsg.y], [1222, 545], [R, 545]]));
  A([n.correct.right, n.fmsg.left]); e.push(lab(n.correct.right[0] + 12, n.correct.y - 14, 'No'));
  A([n.correct.bottom, n.status.top]); e.push(lab(M + 12, n.correct.bottom[1] + 16, 'Yes'));
  A([n.status.left, n.restricted.right]); e.push(lab(n.status.left[0] - 10, n.status.y - 26, 'Action Required\n(fix online)', 'end'));
  A([n.restricted.bottom, n.fix.top]);
  A([n.fix.bottom, n.endFix.top]);
  A([n.status.right, n.smsg.left]); e.push(lab(n.status.right[0] + 10, n.status.y - 26, 'Pending, Archived,\nor visit the hall'));
  A([n.smsg.bottom, n.endMsg.top]);
  A([n.status.bottom, n.twofa.top]);
  A([n.twofa.bottom, n.pages.top]); e.push(lab(M + 12, n.status.bottom[1] + 16, 'Active'));
  A([n.pages.bottom, n.use.top]);
  A([n.use.bottom, n.save.top]);
  A([n.save.bottom, n.track.top]);
  A([n.track.bottom, n.out.top]);
  A([n.out.bottom, n.end.top]);
  return svgDoc(W, H, e.join('') + Object.values(n).map(draw).join(''));
}

module.exports = { name: 'Flowchart - resident side', file: 'flowchart_resident', width: W, height: H, build };
