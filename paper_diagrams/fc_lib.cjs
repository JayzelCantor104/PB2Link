// Shared node helpers for the flowcharts and activity diagrams.
// Flowchart symbols: term (terminator), proc (process), io (input/output), dec (decision).
// Activity symbols: act (action), init (initial node), final (activity final), flowfinal, merge (small diamond), bar (fork/join).
const { NAVY, FILL, MUTED, wrap, text, rect, line, arrow, svgDoc } = require('./lib.cjs');

const FS = 16;          // node text size
const LH = 1.25;

function sizeFor(kind, label, w) {
  if (kind === 'term') return [w || 150, 46];
  if (kind === 'dec') return [w || 270, 128];
  if (kind === 'merge') return [40, 40];
  if (kind === 'init' || kind === 'final' || kind === 'flowfinal') return [30, 30];
  const width = w || 300;
  const chars = Math.floor((width - (kind === 'io' ? 70 : 28)) / 8.3);
  const n = wrap(label, chars).length;
  return [width, Math.max(62, Math.round(n * FS * LH + 26))];
}

function node(kind, x, y, label = '', opt = {}) {
  const [w, h] = sizeFor(kind, label, opt.w);
  return { kind, x, y, w, h, label, opt,
    top: [x, y - h / 2], bottom: [x, y + h / 2], left: [x - w / 2, y], right: [x + w / 2, y] };
}

function draw(n) {
  const { kind, x, y, w, h, label } = n;
  const chars = Math.floor((w - (kind === 'io' ? 70 : 28)) / 8.3);
  switch (kind) {
    case 'term':
      return rect(x - w / 2, y - h / 2, w, h, { rx: h / 2, fill: NAVY, stroke: NAVY }) + text(x, y, label, { size: FS, weight: 'bold', color: '#FFFFFF' });
    case 'proc':
      return rect(x - w / 2, y - h / 2, w, h, { rx: 2 }) + text(x, y, wrap(label, chars), { size: FS, lineH: LH });
    case 'act':
      return rect(x - w / 2, y - h / 2, w, h, { rx: 18 }) + text(x, y, wrap(label, chars), { size: FS, lineH: LH });
    case 'io': {
      const s = 26, p = [[x - w / 2 + s, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2 - s, y + h / 2], [x - w / 2, y + h / 2]];
      return `<polygon points="${p.map(q => q.join(',')).join(' ')}" fill="#FFFFFF" stroke="${NAVY}" stroke-width="1.6"/>` + text(x, y, wrap(label, chars), { size: FS, lineH: LH });
    }
    case 'dec': {
      const p = [[x, y - h / 2], [x + w / 2, y], [x, y + h / 2], [x - w / 2, y]];
      return `<polygon points="${p.map(q => q.join(',')).join(' ')}" fill="#FFFFFF" stroke="${NAVY}" stroke-width="1.6"/>` + text(x, y, wrap(label, 19), { size: FS, lineH: LH });
    }
    case 'merge': {
      const p = [[x, y - 20], [x + 20, y], [x, y + 20], [x - 20, y]];
      return `<polygon points="${p.map(q => q.join(',')).join(' ')}" fill="#FFFFFF" stroke="${NAVY}" stroke-width="1.6"/>`;
    }
    case 'init':
      return `<circle cx="${x}" cy="${y}" r="14" fill="${NAVY}"/>`;
    case 'final':
      return `<circle cx="${x}" cy="${y}" r="15" fill="#FFFFFF" stroke="${NAVY}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="9" fill="${NAVY}"/>`;
    case 'flowfinal':
      return `<circle cx="${x}" cy="${y}" r="14" fill="#FFFFFF" stroke="${NAVY}" stroke-width="2"/>` +
        line([[x - 10, y - 10], [x + 10, y + 10]], { width: 2 }) + line([[x - 10, y + 10], [x + 10, y - 10]], { width: 2 });
    default: return '';
  }
}

// Fork / join bar between x1 and x2 at y.
function bar(x1, x2, y) { return `<rect x="${x1}" y="${y - 4}" width="${x2 - x1}" height="8" fill="${NAVY}"/>`; }

// Edge label (bold navy, small). lines may contain \n.
function lab(x, y, t, anchor = 'start') { return text(x, y, String(t).split('\n'), { size: 14, weight: 'bold', color: NAVY, anchor }); }
// Guard label for activity diagrams, e.g. [approved].
function guard(x, y, t, anchor = 'start') { return text(x, y, String(t).split('\n'), { size: 14, italic: true, color: NAVY, anchor }); }
// Dashed note box.
function note(x, y, w, t) {
  const ls = wrap(t, Math.floor((w - 24) / 7.6)); const h = ls.length * 14 * 1.3 + 20;
  return { svg: rect(x, y, w, h, { rx: 2, fill: '#FFFDF2', dash: '6 4', sw: 1.3 }) + text(x + w / 2, y + h / 2, ls, { size: 14, color: '#374151' }), h };
}

module.exports = { node, draw, bar, lab, guard, note, FS };
