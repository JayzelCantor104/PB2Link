// Weighted-mean analysis of the PB2Link ISO/IEC 9126 evaluation (Google Forms CSV).
// WM = Σ(f·x) / N, interpreted with the CvSU scale (4.51–5.00 Excellent ... 1.00–1.50 Poor).
const fs = require('fs');
const src = process.argv[2];
const outDir = process.argv[3];

// RFC 4180 CSV parser (quoted fields, doubled quotes, commas/newlines inside quotes)
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

const raw = fs.readFileSync(src, 'utf8').replace(/^﻿/, '');
const rows = parseCSV(raw);
const head = rows[0], data = rows.slice(1);
const log = [];
log.push(`columns: ${head.length}, responses: ${data.length}`);
data.forEach((r, i) => { if (r.length !== head.length) log.push(`ROW ${i + 2} has ${r.length} fields`); });

// Item codes in questionnaire order
const codes = [
  ...[1,2,3,4,5,6,7,8,9].map(n => 'F' + n), 'R1','R2','R3', 'U1','U2','U3','U4','U5', 'E1','E2','E3',
];
const itCodes = [...codes, 'M1','M2','M3','M4','P1','P2','P3','P4'];
// Block A: columns 7..26 (20 items) + comment 27, answered by staff and residents.
// Block B: columns 28..55 (28 items) + comment 56, answered by IT experts.
const A0 = 7, B0 = 28;
// Verify the item texts of both blocks match, item by item
const itemText = c => (c.match(/\[(.*)\]$/) || [, c])[1].trim();
for (let k = 0; k < 20; k++) {
  if (itemText(head[A0 + k]) !== itemText(head[B0 + k])) log.push(`TEXT MISMATCH item ${codes[k]}: "${itemText(head[A0 + k])}" vs "${itemText(head[B0 + k])}"`);
}
log.push(`block A first/last: ${itemText(head[A0])} | ${itemText(head[A0 + 19])}; comment col: ${head[A0 + 20]}`);
log.push(`block B items 21-28 start: ${itemText(head[B0 + 20])}; comment col: ${head[B0 + 28]}`);

const groupOf = g => g.startsWith('Barangay staff') ? 'Staff' : g.startsWith('Resident') ? 'Resident' : g.startsWith('IT expert') ? 'IT expert' : '?';
const resp = data.map((r, i) => {
  const group = groupOf(r[3]);
  const block = group === 'IT expert' ? B0 : A0;
  const list = group === 'IT expert' ? itCodes : codes;
  const ans = {};
  list.forEach((c, k) => {
    const v = r[block + k].trim();
    if (v === '') { log.push(`row ${i + 2} (${group}) ${c} BLANK`); return; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) log.push(`row ${i + 2} ${c} INVALID "${v}"`); else ans[c] = n;
  });
  // the other block must be empty
  const other = group === 'IT expert' ? r.slice(A0, A0 + 21) : r.slice(B0, B0 + 29);
  if (other.some(x => x.trim() !== '')) log.push(`row ${i + 2} has answers in the other block`);
  return { row: i + 2, time: r[0], group, eligibility: r[4], degree: r[5], years: r[6], ans,
    comment: (r[block + list.length] || '').trim() };
});
const groups = ['Staff', 'Resident', 'IT expert'];
groups.forEach(g => log.push(`${g}: ${resp.filter(x => x.group === g).length}`));

const interp = m => m >= 4.51 ? 'Excellent' : m >= 3.51 ? 'Very Good' : m >= 2.51 ? 'Good' : m >= 1.51 ? 'Fair' : 'Poor';
const r2 = m => Math.round((m + 1e-9) * 100) / 100;
function stats(list, code) {
  const vals = list.map(x => x.ans[code]).filter(v => v !== undefined);
  const f = [5,4,3,2,1].map(x => vals.filter(v => v === x).length);
  const sum = f.reduce((s, n, k) => s + n * (5 - k), 0);
  const N = vals.length;
  return { f, sum, N, wm: N ? sum / N : null };
}
const cats = { Functionality: codes.slice(0, 9), Reliability: ['R1','R2','R3'], Usability: ['U1','U2','U3','U4','U5'], Efficiency: ['E1','E2','E3'],
  Maintainability: ['M1','M2','M3','M4'], Portability: ['P1','P2','P3','P4'] };
const texts = {};
codes.forEach((c, k) => texts[c] = itemText(head[A0 + k]));
itCodes.slice(20).forEach((c, k) => texts[c] = itemText(head[B0 + 20 + k]));

const result = { items: {}, cats: {} };
const sets = { Staff: resp.filter(x => x.group === 'Staff'), Resident: resp.filter(x => x.group === 'Resident'), 'IT expert': resp.filter(x => x.group === 'IT expert'), All: resp };
for (const [cat, list] of Object.entries(cats)) {
  result.cats[cat] = {};
  for (const c of list) {
    result.items[c] = { text: texts[c] };
    for (const [g, s] of Object.entries(sets)) result.items[c][g] = stats(s, c);
  }
  for (const g of Object.keys(sets)) {
    const ms = list.map(c => result.items[c][g].wm).filter(v => v !== null);
    result.cats[cat][g] = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
  }
}
// Grand mean = mean of the characteristic means
result.grand = {};
for (const g of Object.keys(sets)) {
  const ms = Object.keys(cats).map(k => result.cats[k][g]).filter(v => v !== null);
  result.grand[g] = ms.reduce((a, b) => a + b, 0) / ms.length;
}
// Cross-check: mean of all individual ratings (differs only by weighting)
result.allRatingsMean = {};
for (const [g, s] of Object.entries(sets)) {
  const v = s.flatMap(x => Object.values(x.ans)); result.allRatingsMean[g] = v.reduce((a, b) => a + b, 0) / v.length;
}

// Report
const L = [];
const fmt = m => m === null ? '' : r2(m).toFixed(2);
for (const [cat, list] of Object.entries(cats)) {
  L.push(`\n== ${cat} ==`);
  for (const c of list) {
    const it = result.items[c];
    const parts = Object.keys(sets).map(g => it[g].N ? `${g}: f(5..1)=${it[g].f.join('/')} Σfx=${it[g].sum} N=${it[g].N} WM=${fmt(it[g].wm)} ${interp(r2(it[g].wm))}` : `${g}: -`);
    L.push(`${c} ${it.text}\n   ` + parts.join('\n   '));
  }
  L.push(`   CATEGORY MEAN: ` + Object.keys(sets).map(g => result.cats[cat][g] === null ? `${g} -` : `${g} ${fmt(result.cats[cat][g])} ${interp(r2(result.cats[cat][g]))}`).join(' | '));
}
L.push('\n== GRAND MEAN (mean of characteristic means) ==');
L.push(Object.keys(sets).map(g => `${g} ${fmt(result.grand[g])} ${interp(r2(result.grand[g]))} (unrounded ${result.grand[g].toFixed(4)})`).join('\n'));
L.push('\n== cross-check: mean of every single rating ==');
L.push(Object.keys(sets).map(g => `${g} ${result.allRatingsMean[g].toFixed(4)}`).join('\n'));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outDir + '/check_log.txt', log.join('\n'));
fs.writeFileSync(outDir + '/results.txt', L.join('\n'));
fs.writeFileSync(outDir + '/results.json', JSON.stringify({ result, respondents: resp.map(x => ({ row: x.row, time: x.time, group: x.group, eligibility: x.eligibility, degree: x.degree, years: x.years, n: Object.keys(x.ans).length, comment: x.comment })) }, null, 1));
console.log(log.join('\n'));
