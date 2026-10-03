// The narrated cut's plan, checked from the project's own code (src/narrated/plan.ts, bundled with the project's esbuild):
//   node $S/scripts/narrated-check.cjs --project $P [--json out.json]           (runbook N10, before any still or render)
// Prints the running order, every voice line with its gap to the previous line and its key word (film seconds, with
// the picture under it), and, at every cut between two desk captures, the pointer and camera on both sides. Exits 1 on
// an overlap, a gap outside the landing rules (references/narration.md §7: 0.5-3.0 s; under 0.5 s only between two
// lines of one sentence, listed in client-inputs.json → narration.exceptions), or a failed cut (pointer <= 2 px within
// one capture / 3.5 px across captures, camera scale delta <= 0.01, pan <= 3 px). Exit 2: no plan (the template's
// empty plan.ts: fill it first).
const path = require('path');
const fs = require('fs');
const Module = require('module');

const ai = process.argv.indexOf('--project');
const PROJECT = path.resolve(ai > 0 ? process.argv[ai + 1] : process.cwd());
if (!fs.existsSync(path.join(PROJECT, 'src', 'narrated', 'plan.ts'))) { console.error(`no src/narrated/plan.ts in ${PROJECT} (--project <dir>; new-project.sh --narrated copies the template's)`); process.exit(2); }
const req = Module.createRequire(path.join(PROJECT, 'package.json'));
const esbuild = req('esbuild');
const entry = [
  "export { narratedPlan, LINES } from './src/narrated/plan';",
  "export { VO_LINES } from './src/narrated/vo-lines';",
  "export * as DS from './src/scenes/DesktopScene';",
  "export { computeTracks } from './src/lib/shot';",
  "export { cameraAt } from './src/components/Camera';",
  "export { windowLayout } from './src/components/MacWindow';",
  "export { theme } from './src/theme';",
].join('\n');
const out = esbuild.buildSync({
  stdin: { contents: entry, resolveDir: PROJECT, loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', logLevel: 'error',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'remotion'],
});
const m = new Module(path.join(PROJECT, '__narrated__.cjs'));
m.filename = path.join(PROJECT, '__narrated__.cjs');
m.paths = Module._nodeModulePaths(PROJECT);
m._compile(out.outputFiles[0].text, m.filename);
const M = m.exports;

const P = M.narratedPlan;
const fps = M.theme.fps;
if (!P.total) { console.error('the narrated plan is empty (src/narrated/plan.ts is still the template): write it first (runbook N10)'); process.exit(2); }
const EXC = (() => {
  try { return (JSON.parse(fs.readFileSync(path.join(PROJECT, 'client-inputs.json'), 'utf8')).narration || {}).exceptions || {}; } catch { return {}; }
})();
const s = (f) => (f / fps).toFixed(2);
let bad = 0;

console.log(`total ${P.total} frames = ${s(P.total)} s; desk ${s(P.deskFrom)}-${s(P.deskEnd)}; outro from ${s(P.outro.from)}`);
console.log('\nSEGMENTS');
let at = P.deskFrom;
P.segments.forEach((g, i) => {
  const trim = Math.round((g.trimSec || 0) * fps);
  console.log(`  ${P.segKeys[i].padEnd(4)} ${g.shot.padEnd(18)} film ${s(at).padStart(7)}-${s(at + g.durationInFrames).padStart(7)}  ${g.hold ? `hold @${trim}` : `capture ${trim}-${trim + g.durationInFrames - 1}`}`);
  at += g.durationInFrames;
});
console.log('\nOVERLAYS');
for (const o of P.overlays) console.log(`  ${o.key.padEnd(6)} film ${s(o.from)}-${s(o.from + o.durationInFrames)} on ${o.hold}`);

console.log('\nLINES (film seconds; gap = silence before the line)');
const rows = [];
let prevEnd = null;
for (const L of P.lines) {
  const v = M.VO_LINES.find((x) => x.id === L.id);
  const gap = prevEnd === null ? null : (L.from - prevEnd) / fps;
  const plan = M.LINES.find((x) => x.id === L.id);
  const key = v.words[plan.word];
  const gapOk = gap === null || (gap <= 3.0 && (gap >= 0.5 || (gap >= 0.35 && EXC[L.id])));
  if (!gapOk) bad++;
  console.log(`  ${L.id.padEnd(12)} ${s(L.from).padStart(7)}-${s(L.from + L.durationInFrames).padStart(7)} gap ${gap === null ? '  -  ' : gap.toFixed(2).padStart(5)}${gapOk ? ' ' : '!'} "${key[0]}" @ ${s(L.from + key[1] * fps)}  ${L.why}`);
  rows.push({ id: L.id, start: +(L.from / fps).toFixed(2), end: +((L.from + L.durationInFrames) / fps).toFixed(2), gap: gap === null ? null : +gap.toFixed(2), key: key[0], keyAt: +((L.from + key[1] * fps) / fps).toFixed(2), picture: L.why, words: v.words.map(([w, t]) => [w, +((L.from / fps) + t).toFixed(2)]) });
  prevEnd = L.from + L.durationInFrames;
}

console.log('\nCUTS between desk captures (edited data: pointer CSS px, camera scale / pan display px)');
const shots = {};
const load = (id) => (shots[id] = shots[id] || JSON.parse(fs.readFileSync(path.join(PROJECT, 'public', 'shots', id, 'cursor.json'), 'utf8')));
const raw = P.segments.map((g) => load(g.shot));
const data = M.DS.prepareData(raw, P.segments);
const tracks = data.map((d) => M.computeTracks(d));
const L = M.windowLayout(1440, 900, 1920, 1080);
const frameOf = (i, last) => {
  const g = P.segments[i];
  const trim = Math.round((g.trimSec || 0) * fps);
  return g.hold ? trim : trim + (last ? g.durationInFrames - 1 : 0);
};
for (let i = 1; i < P.segments.length; i++) {
  const a = P.segments[i - 1], b = P.segments[i];
  if (a.shot === b.shot && (a.hold || b.hold)) continue; // a hold continues its own capture
  if (a.hold) { console.log(`  ${(P.segKeys[i - 1] + '>' + P.segKeys[i]).padEnd(10)} (under an overlay)`); continue; }
  const fa = frameOf(i - 1, true), fb = frameOf(i, false);
  const pa = tracks[i - 1].cursor.pos[fa], pb = tracks[i].cursor.pos[fb];
  // a camera in motion is compared with where it would have been one frame on (the next frame of the outgoing data)
  const fa1 = Math.min(data[i - 1].frames.length - 1, fa + 1);
  const ca0 = M.cameraAt(data[i - 1], tracks[i - 1], fa, L.contentW, L.contentH);
  const ca1 = M.cameraAt(data[i - 1], tracks[i - 1], fa1, L.contentW, L.contentH);
  const cb = M.cameraAt(data[i], tracks[i], fb, L.contentW, L.contentH);
  const step = Math.abs(ca1.s - ca0.s) + Math.hypot(ca1.tx - ca0.tx, ca1.ty - ca0.ty) / 100;
  const ca = step > 0.002 && a.shot === b.shot ? ca1 : ca0;
  const hidden = tracks[i - 1].cursor.opacity[fa] < 0.05 && tracks[i].cursor.opacity[fb] < 0.05;
  const dp = hidden ? 0 : Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
  const ds = Math.abs(ca.s - cb.s);
  const dt = Math.hypot(ca.tx - cb.tx, ca.ty - cb.ty);
  const same = a.shot === b.shot;
  const ok = dp <= (same ? 2 : 3.5) && ds <= 0.01 && dt <= 3;
  const crossShot = !same;
  // across different captures of the site (part A) the pixel gate is the skill's verify-film; here: pointer + camera
  if (!ok) bad++;
  console.log(`  ${(P.segKeys[i - 1] + '>' + P.segKeys[i]).padEnd(10)} ${ok ? 'PASS' : 'FAIL'} pointer ${dp.toFixed(2)} scale ${ca.s.toFixed(3)}/${cb.s.toFixed(3)} pan ${dt.toFixed(1)}${crossShot ? '' : ' (same capture)'}${hidden ? ' (pointer hidden)' : ''}`);
}

const ji = process.argv.indexOf('--json');
if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify({ total: P.total, lines: rows }, null, 1));
console.log(bad ? `\n${bad} problem(s)` : '\nPLAN OK');
process.exit(bad ? 1 : 0);
