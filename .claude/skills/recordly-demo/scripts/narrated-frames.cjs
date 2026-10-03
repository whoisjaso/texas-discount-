// Film frames worth a still in the narrated cut: every zoom at full depth (start + in + 6 frames), every document push
// landed, every segment's first frame, every overlay's open and close (runbook N11).
//   node $S/scripts/narrated-frames.cjs --project $P [--csv]     prints "<frame> <label>" lines; --csv: one comma list
// Render them: (cd $P && nice -n 15 node scripts/stills.cjs $SCRATCH/n-stills Narrated:$(node … --csv)).
const path = require('path'), fs = require('fs'), Module = require('module');
const ai = process.argv.indexOf('--project');
const PROJECT = path.resolve(ai > 0 ? process.argv[ai + 1] : process.cwd());
/** A capture's cursor.json, or one line naming the missing capture and the runbook step that makes it (exit 2). */
const readCursor = (project, id) => {
  const f = require('path').join(project, 'public', 'shots', id, 'cursor.json');
  if (!require('fs').existsSync(f)) {
    const n = parseInt(id, 10);
    const step = n <= 5 ? 'A6, capture-all.sh' : n < 20 ? 'B4, capture-desk.sh' : 'N9, capture-narrated.sh';
    console.error(`no capture ${id}: ${f} is missing; capture it first (runbook ${step})`);
    process.exit(2);
  }
  return JSON.parse(require('fs').readFileSync(f, 'utf8'));
};
const req = Module.createRequire(path.join(PROJECT, 'package.json'));
const out = req('esbuild').buildSync({ stdin: { contents: "export { narratedPlan } from './src/narrated/plan'; export * as DS from './src/scenes/DesktopScene';", resolveDir: PROJECT, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', logLevel: 'error', external: ['react', 'react-dom', 'react/jsx-runtime', 'remotion'] });
const m = new Module('f'); m.paths = Module._nodeModulePaths(PROJECT); m._compile(out.outputFiles[0].text, path.join(PROJECT, 'f.cjs'));
const P = m.exports.narratedPlan; const fps = 30;
if (!P.total || !P.segments.length) { console.error('the narrated plan is empty (src/narrated/plan.ts is still the template): write it first (runbook N10)'); process.exit(2); }
const raw = P.segments.map((g) => readCursor(PROJECT, g.shot));
const data = m.exports.DS.prepareData(raw, P.segments);
const list = [];
let at = P.deskFrom;
P.segments.forEach((g, i) => {
  const trim = Math.round((g.trimSec || 0) * fps);
  list.push([at + 1, `${P.segKeys[i]}-first`]);
  if (!g.hold) data[i].zooms.forEach((z, k) => {
    const f = z.startFrame + z.inFrames + 6 - trim;
    if (z.depth > 1.01 && f >= 0 && f < g.durationInFrames && z.startFrame >= trim - 2) list.push([at + f, `${P.segKeys[i]}-zoom${k}-${z.depth}x`]);
  });
  at += g.durationInFrames;
});
for (const o of P.overlays) {
  list.push([o.from + 12, `${o.key}-open`]);
  for (const [j, d] of (o.docs || []).entries()) d.keys.forEach((k, n) => list.push([o.from + Math.round((k.at + (k.dur || 1.5) + 0.15) * fps), `${o.key}${j}-key${n}`]));
}
list.sort((a, b) => a[0] - b[0]);
if (process.argv.includes('--csv')) console.log([...new Set(list.map((x) => x[0]))].join(','));
else for (const [f, l] of list) console.log(f, l);

