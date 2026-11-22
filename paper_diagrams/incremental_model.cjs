// Incremental development model with module-based reviews and a single final deployment (Chapter 3 / slides).
const { NAVY, FILL, MUTED, wrap, text, rect, line, arrow, svgDoc } = require('./lib.cjs');

const W = 1560, H = 1180;
const LX = 470, LW = 1040, LH = 150, GAP = 28, TOP = 40;
const INC = [
  ['Increment 1: Core e-services', 'June–July 2026', 'Reviewed by the Barangay Secretary'],
  ['Increment 2: Admin dashboard and resident records', 'August 2026', 'Reviewed by the Barangay Secretary'],
  ['Increment 3: Notifications, payments, and staff access rules', 'August–September 2026', 'Reviewed by the Barangay Secretary and the Asst. VAWC Desk Officer'],
  ['Increment 4: GIS-based Community Issue Map and waste management', 'September 2026', 'Reviewed by the technical critic'],
  ['Increment 5: GIS-based disaster risk, preparedness, and accessibility', 'October 2026', 'Reviewed by the Barangay Secretary, Asst. VAWC Desk Officer, technical critic, and adviser'],
];
const STEPS = ['Detailed design', 'Coding', 'Testing with earlier modules', 'Module review'];

function box(x, y, w, h, label, opt = {}) {
  return rect(x, y, w, h, { rx: 10, fill: opt.fill || '#FFFFFF', sw: opt.sw || 2 }) +
    text(x + w / 2, y + h / 2, wrap(label, opt.wrap || 18), { size: opt.size || 17, weight: opt.weight || 'bold' });
}

function build() {
  const s = [];
  // left column: requirements and design
  const cx = 60, cw = 330;
  s.push(box(cx, TOP + 10, cw, 110, 'Requirements gathering and analysis (May 2026)', { fill: FILL, wrap: 24, size: 18 }));
  s.push(arrow([[cx + cw / 2, TOP + 120], [cx + cw / 2, TOP + 170]]));
  s.push(box(cx, TOP + 170, cw, 110, 'System design and increment planning (May 2026)', { fill: FILL, wrap: 24, size: 18 }));
  s.push(arrow([[cx + cw, TOP + 225], [LX - 40, TOP + 225], [LX - 40, TOP + 75], [LX, TOP + 75]]));
  s.push(text(cx + cw / 2, TOP + 330, wrap('Each increment is designed, coded, tested with the modules before it, and reviewed. Feedback is applied before the next increment starts.', 34), { size: 15, color: MUTED, italic: true }));

  // increments
  const bw = 210, bh = 64, bgap = (LW - 40 - 4 * bw) / 3;
  INC.forEach(([title, period, who], i) => {
    const y = TOP + i * (LH + GAP);
    s.push(rect(LX, y, LW, LH, { rx: 12, fill: '#F7F9FC', sw: 1.4 }));
    s.push(text(LX + 20, y + 22, title, { size: 17, weight: 'bold', anchor: 'start', color: NAVY }));
    s.push(text(LX + LW - 20, y + 22, period, { size: 15, anchor: 'end', color: MUTED }));
    const by = y + 42;
    STEPS.forEach((st, k) => {
      const bx = LX + 20 + k * (bw + bgap);
      s.push(box(bx, by, bw, bh, st, { size: 15, wrap: 20, fill: k === 3 ? FILL : '#FFFFFF' }));
      if (k < 3) s.push(arrow([[bx + bw, by + bh / 2], [bx + bw + bgap, by + bh / 2]]));
    });
    // feedback loop: review -> design
    const rx = LX + 20 + 3 * (bw + bgap) + bw / 2, dx = LX + 20 + bw / 2, ly = by + bh + 22;
    s.push(arrow([[rx, by + bh], [rx, ly], [dx, ly], [dx, by + bh]], { dash: '7 5' }));
    s.push(text((rx + dx) / 2, ly - 10, who, { size: 13, italic: true, color: MUTED }));
    if (i < INC.length - 1) s.push(arrow([[LX + LW - 60, y + LH], [LX + LW - 60, y + LH + GAP]]));
  });

  // final stages
  const fy = TOP + 5 * (LH + GAP) + 40, fw = 300, fh = 100, fgap = (LW - 3 * fw) / 2;
  const lastBottom = TOP + 4 * (LH + GAP) + LH;
  s.push(arrow([[LX + LW - 60, lastBottom], [LX + LW - 60, lastBottom + 20], [LX + fw / 2, lastBottom + 20], [LX + fw / 2, fy]]));
  const fin = ['System testing and user acceptance testing (Oct–Nov 2026)', 'Single deployment at pb2link.com (early Nov 2026)', 'Evaluation with ISO/IEC 9126 (Nov 5–7, 2026)'];
  fin.forEach((t, k) => {
    const x = LX + k * (fw + fgap);
    s.push(box(x, fy, fw, fh, t, { fill: k === 1 ? NAVY : FILL, wrap: 26, size: 16 }));
    if (k < 2) s.push(arrow([[x + fw, fy + fh / 2], [x + fw + fgap, fy + fh / 2]]));
  });
  // white text on the deployment box
  const dx = LX + fw + fgap;
  s.push(rect(dx, fy, fw, fh, { rx: 10, fill: NAVY, stroke: NAVY, sw: 2 }));
  s.push(text(dx + fw / 2, fy + fh / 2, wrap(fin[1], 26), { size: 16, weight: 'bold', color: '#FFFFFF' }));
  s.push(text(LX + LW / 2, fy + fh + 30, 'Modules are not released one at a time: the complete website is tested and deployed once.', { size: 15, italic: true, color: MUTED }));
  return svgDoc(W, H, s.join(''));
}

module.exports = { name: 'Incremental model', file: 'incremental_model', width: W, height: H, build };
