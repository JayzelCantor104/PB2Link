// Appendix: Flowchart of the admin side of PB2Link
// Based on admin_login.php (pause, audit log, email on pause), AdminLayout/admin_access (tab access) and audit_log.php.
const { svgDoc, arrow } = require('./lib.cjs');
const { node, draw, lab, note } = require('./fc_lib.cjs');

const W = 1120, H = 1730;
const M = 430, R = 860, LX = 95;

function build() {
  const n = {
    start: node('term', M, 45, 'Start'),
    open: node('io', M, 145, 'Open the admin sign-in page and enter the email and password'),
    paused: node('dec', M, 300, 'Is this email paused?'),
    pmsg: node('proc', R, 300, 'Show the wait time; record the pause in the audit log and email the admin'),
    correct: node('dec', M, 455, 'Is the password correct?'),
    fmsg: node('proc', R, 455, 'Count the failed try and record it in the audit log'),
    twofa: node('io', M, 630, 'Enter the one-time code sent by email or SMS, unless two-step sign-in is off or the device is remembered'),
    dash: node('proc', M, 765, 'Open the Dashboard with the counts and tasks of the tabs this admin may open'),
    tab: node('proc', M, 885, 'Open a tab'),
    allowed: node('dec', M, 1015, 'Is this tab allowed for this admin?'),
    deny: node('proc', R, 1015, 'Show "no access"; the server refuses the data and records the attempt'),
    work: node('proc', M, 1165, 'Review, approve, update, or publish in the module'),
    save: node('proc', M, 1290, 'Save the change, notify the resident when needed, and record it in the audit log'),
    more: node('dec', M, 1440, 'More work?'),
    out: node('proc', M, 1585, 'Sign out'),
    end: node('term', M, 1675, 'End'),
  };
  const e = [];
  const A = (pts) => e.push(arrow(pts));
  A([n.start.bottom, n.open.top]);
  A([n.open.bottom, n.paused.top]);
  A([n.paused.right, n.pmsg.left]); e.push(lab(n.paused.right[0] + 12, n.paused.y - 14, 'Yes'));
  A([n.pmsg.top, [R, n.open.y], [n.open.right[0] - 13, n.open.y]]);
  A([n.paused.bottom, n.correct.top]); e.push(lab(M + 12, n.paused.bottom[1] + 16, 'No'));
  A([n.correct.right, n.fmsg.left]); e.push(lab(n.correct.right[0] + 12, n.correct.y - 14, 'No'));
  e.push(require('./lib.cjs').line([n.fmsg.right, [1090, n.fmsg.y], [1090, n.open.y], [R, n.open.y]]));
  A([n.correct.bottom, n.twofa.top]);
  A([n.twofa.bottom, n.dash.top]); e.push(lab(M + 12, n.correct.bottom[1] + 16, 'Yes'));
  A([n.dash.bottom, n.tab.top]);
  A([n.tab.bottom, n.allowed.top]);
  A([n.allowed.right, n.deny.left]); e.push(lab(n.allowed.right[0] + 12, n.allowed.y - 14, 'No'));
  A([n.deny.top, [R, n.dash.y], n.dash.right]);
  A([n.allowed.bottom, n.work.top]); e.push(lab(M + 12, n.allowed.bottom[1] + 16, 'Yes'));
  A([n.work.bottom, n.save.top]);
  A([n.save.bottom, n.more.top]);
  A([n.more.left, [LX, n.more.y], [LX, n.tab.y], n.tab.left]); e.push(lab(n.more.left[0] - 12, n.more.y - 14, 'Yes', 'end'));
  A([n.more.bottom, n.out.top]); e.push(lab(M + 12, n.more.bottom[1] + 16, 'No'));
  A([n.out.bottom, n.end.top]);
  const nt = note(700, 1140, 360, 'Super Admin: every tab, plus Manage Admins, the Audit Log, and the system settings. Standard Admin: the standard access, plus what their position adds, with Allow or Deny set for each admin (Deny wins).');
  e.push(nt.svg);
  e.push(require('./lib.cjs').line([[700, 1140 + nt.h / 2], [640, 1140 + nt.h / 2], [565, n.allowed.y + 30]], { dash: '6 4', width: 1.3 }));
  return svgDoc(W, H, e.join('') + Object.values(n).map(draw).join(''));
}

module.exports = { name: 'Flowchart - admin side', file: 'flowchart_admin', width: W, height: H, build };
