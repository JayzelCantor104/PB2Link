// Shared drawing helpers for the PB2Link paper diagrams.
// Every diagram file returns an SVG string; build.js saves it and renders a PNG.

const NAVY = '#1F3A5F';
const FILL = '#E8EEF6';
const TEXT = '#1F2937';
const MUTED = '#475569';
const FONT = 'Arial, Helvetica, sans-serif';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Splits text into lines of at most maxChars characters, breaking between words.
function wrap(text, maxChars) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const w of para.split(' ')) {
      if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    }
    lines.push(cur);
  }
  return lines;
}

// Draws lines of text whose block is vertically centred on y.
function text(x, y, lines, opt = {}) {
  const { size = 15, weight = 'normal', anchor = 'middle', color = TEXT, italic = false, lineH = 1.25 } = opt;
  if (!Array.isArray(lines)) lines = [lines];
  const h = lines.length * size * lineH;
  const y0 = y - h / 2 + size * 0.95;
  return lines.map((l, i) =>
    `<text x="${x}" y="${(y0 + i * size * lineH).toFixed(1)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}"` +
    `${italic ? ' font-style="italic"' : ''} text-anchor="${anchor}" fill="${color}">${esc(l)}</text>`).join('');
}

function rect(x, y, w, h, opt = {}) {
  const { fill = '#FFFFFF', stroke = NAVY, sw = 1.6, rx = 6, dash = null } = opt;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

function line(pts, opt = {}) {
  const { color = NAVY, width = 1.6, dash = null } = opt;
  return `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}"` +
    `${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>`;
}

// Arrowhead at q, pointing in the direction p -> q. open = hollow (UML generalization or dependency).
function arrowHead(p, q, opt = {}) {
  const { size = 11, open = false, color = NAVY, filled = true } = opt;
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const bx = q[0] - ux * size, by = q[1] - uy * size;
  const a = [bx + nx * size * 0.55, by + ny * size * 0.55], b = [bx - nx * size * 0.55, by - ny * size * 0.55];
  if (open && !filled) return line([a, q, b], { color, width: 1.6 });
  return `<polygon points="${a.join(',')} ${q.join(',')} ${b.join(',')}" fill="${open ? '#FFFFFF' : color}" stroke="${color}" stroke-width="1.6"/>`;
}

// A line with an arrowhead at its last point.
function arrow(pts, opt = {}) {
  const n = pts.length;
  return line(pts, opt) + arrowHead(pts[n - 2], pts[n - 1], opt);
}

function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#FFFFFF"/>${body}</svg>`;
}

module.exports = { NAVY, FILL, TEXT, MUTED, FONT, esc, wrap, text, rect, line, arrowHead, arrow, svgDoc };
