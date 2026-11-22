// Builds every diagram: writes an SVG and renders a PNG (2x scale) with headless Edge or Chrome.
// Usage: node build.js            (all diagrams)
//        node build.js erd        (one diagram, by file name prefix)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const diagrams = ['usecase', 'erd', 'architecture', 'process_flow', 'class_diagram', 'flowchart_resident', 'flowchart_admin',
  'dfd_context', 'dfd_level1', 'activity_amenity', 'activity_advisory', 'activity_document', 'activity_issue', 'incremental_model']
  .filter(f => fs.existsSync(path.join(__dirname, f + '.cjs'))).map(f => require('./' + f + '.cjs'));
const outDir = path.join(__dirname, 'output');
fs.mkdirSync(outDir, { recursive: true });

const browsers = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = browsers.find(p => fs.existsSync(p));

const only = process.argv[2];
for (const d of diagrams) {
  if (only && !d.file.startsWith(only)) continue;
  const svg = d.build();
  const svgPath = path.join(outDir, d.file + '.svg');
  fs.writeFileSync(svgPath, svg);
  // An HTML wrapper sized to the drawing, so the screenshot has no margins.
  const htmlPath = path.join(outDir, d.file + '.html');
  fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style></head><body>${svg}</body></html>`);
  const pngPath = path.join(outDir, d.file + '.png');
  if (browser) {
    execFileSync(browser, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
      `--window-size=${d.width},${d.height}`, `--screenshot=${pngPath}`, 'file:///' + htmlPath.replace(/\\/g, '/')], { stdio: 'ignore' });
  }
  fs.unlinkSync(htmlPath);
  console.log(`${d.name}: ${path.relative(__dirname, svgPath)}${browser ? ', ' + path.relative(__dirname, pngPath) : ' (no browser found for PNG)'}`);
}
