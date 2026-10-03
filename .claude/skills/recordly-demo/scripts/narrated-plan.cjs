#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * narrated-plan.cjs — the narrated cut's lip-to-picture table, generated and gated (runbook N10, after narrated-check).
 *
 *   node $S/scripts/narrated-plan.cjs --project $P [--inputs $I] [--write]
 *
 * For every voice line the plan places (src/narrated/plan.ts, bundled with the project's esbuild), the key word's film
 * time is compared with the time of the action that word names, read from the captures' own events (cursor.json) or
 * the overlays' document pushes, as client-inputs.json → narration.anchors says:
 *   "anchors": { "<line id>": { "seg": "<plan segment key>", "event": "click" | "type" | "hold" | "draw" | "scroll" | "zoom",
 *                               "nth": 0, "end": false },                    a pointer event, nth of its type in the segment
 *                               { "overlay": "<overlay key>", "event": "doc", "doc": 0, "key": 1 },   a document push
 *                               { "seg": "<key>" | "overlay": "<key>" | "outro": true, "event": "frame" } } "in frame": the
 *                                                                           picture already shows it when the word is said
 * Landing windows (references/narration.md §7): a pointer action 0 to 0.5 s AFTER its word; a document push starts 0.6 s
 * before to 0.1 s after its word (the page lands on the word); a zoom ±0.5 s; "frame": the anchored segment, overlay or
 * outro is on screen at the word. A line outside its window fails unless narration.exceptions["<line id>"] gives the
 * reason (it is printed in the table). A line with no anchor fails.
 * Writes $P/narration/lip-to-picture.md; --write also replaces the block between <!-- lip-to-picture:start --> and
 * <!-- lip-to-picture:end --> in $P/narration/README.md (appending it when absent). Exit 1 on a failed row, 2 on no plan.
 *
 * What it does not do (yet): write plan.ts from the anchors. plan.ts stays hand-written to the landing rules; this
 * script is its gate and its table.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const PROJECT = path.resolve(opt('--project', process.cwd()));
const INPUTS = path.resolve(opt('--inputs', path.join(PROJECT, 'client-inputs.json')));
if (!fs.existsSync(path.join(PROJECT, 'src/narrated/plan.ts'))) { console.error(`no src/narrated/plan.ts in ${PROJECT}`); process.exit(2); }

const req = Module.createRequire(path.join(PROJECT, 'package.json'));
const out = req('esbuild').buildSync({
  stdin: { contents: "export { narratedPlan, LINES } from './src/narrated/plan'; export { VO_LINES } from './src/narrated/vo-lines'; export { theme } from './src/theme';", resolveDir: PROJECT, loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', logLevel: 'error',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'remotion', '@remotion/*'],
});
const m = new Module(path.join(PROJECT, '__nplan__.cjs'));
m.paths = Module._nodeModulePaths(PROJECT);
m._compile(out.outputFiles[0].text, path.join(PROJECT, '__nplan__.cjs'));
const { narratedPlan: P, LINES, VO_LINES, theme } = m.exports;
if (!P.total) { console.error('the narrated plan is empty (src/narrated/plan.ts is still the template)'); process.exit(2); }
const fps = theme.fps;
const nar = fs.existsSync(INPUTS) ? (JSON.parse(fs.readFileSync(INPUTS, 'utf8')).narration || {}) : {};
const anchors = nar.anchors || {};
const exceptions = nar.exceptions || {};

const segIndex = Object.fromEntries(P.segKeys.map((k, i) => [k, i]));
const trimOf = (g) => Math.round((g.trimSec || 0) * fps);
const cursorOf = {};
const cursor = (shot) => (cursorOf[shot] = cursorOf[shot] || JSON.parse(fs.readFileSync(path.join(PROJECT, 'public', 'shots', shot, 'cursor.json'), 'utf8')));
const segAt = (f) => { // the desktop segment playing at film frame f
  for (let i = 0; i < P.segments.length; i++) { const a = P.segStarts[P.segKeys[i]]; if (f >= a && f < a + P.segments[i].durationInFrames) return P.segKeys[i]; }
  return null;
};
const overlayAt = (f) => P.overlays.find((o) => f >= o.from && f < o.from + o.durationInFrames);
const s2 = (f) => (f / fps).toFixed(2);

function action(id, a) {
  if (!a) return { err: 'no anchor (client-inputs.json → narration.anchors)' };
  if (a.event === 'frame') {
    return { kind: 'frame', label: a.seg ? `segment ${a.seg} on screen` : a.overlay ? `overlay ${a.overlay} on screen` : 'the outro on screen', a };
  }
  if (a.event === 'doc') {
    const o = P.overlays.find((x) => x.key === a.overlay);
    const d = o && o.docs && o.docs[a.doc || 0];
    const k = d && d.keys[a.key || 0];
    if (!k) return { err: `no document key ${a.overlay}.docs[${a.doc || 0}].keys[${a.key || 0}]` };
    return { kind: 'doc', film: o.from + Math.round(k.at * fps), label: `${a.overlay} push ${a.doc || 0}.${a.key || 0} starts (lands +${(k.dur || 1.5).toFixed(1)} s)` };
  }
  const i = segIndex[a.seg];
  if (i === undefined) return { err: `no segment "${a.seg}" in the plan` };
  const g = P.segments[i];
  const t0 = trimOf(g), t1 = g.hold ? t0 + 1 : t0 + g.durationInFrames;
  const c = cursor(g.shot);
  if (a.event === 'zoom') {
    const z = (c.zooms || [])[a.nth || 0];
    if (!z) return { err: `no zoom ${a.nth || 0} in ${g.shot}` };
    const f = a.end ? z.startFrame + z.inFrames : z.startFrame;
    if (f < t0 || f >= t1) return { err: `zoom ${a.nth || 0} of ${g.shot} (capture ${f}) is outside segment ${a.seg} (${t0}-${t1 - 1})` };
    return { kind: 'zoom', film: P.segStarts[a.seg] + f - t0, label: `${g.shot} zoom ${a.nth || 0} ${a.end ? 'lands' : 'starts'}` };
  }
  const evs = (c.events || []).filter((e) => e.type === a.event && e.frame >= t0 && e.frame < t1);
  const e = evs[a.nth || 0];
  if (!e) return { err: `no ${a.event} #${a.nth || 0} inside segment ${a.seg} (${g.shot} capture ${t0}-${t1 - 1}; it has ${evs.length})` };
  const f = a.end && e.endFrame != null ? e.endFrame : e.frame;
  return { kind: 'pointer', film: P.segStarts[a.seg] + f - t0, label: `${g.shot} ${a.event}${a.end ? ' end' : ''} #${a.nth || 0}${e.char ? ` "${e.char}"` : ''}` };
}

const WIN = { pointer: [0, 0.5], doc: [-0.6, 0.1], zoom: [-0.5, 0.5] };
const rows = [];
let bad = 0;
for (const L of P.lines) {
  const plan = LINES.find((x) => x.id === L.id);
  const v = VO_LINES.find((x) => x.id === L.id);
  const word = v.words[plan.word][0].replace(/[^\w'-]/g, '');
  const wordF = L.anchorFilm;
  const a = anchors[L.id];
  const r = action(L.id, a);
  let delta = null, ok, note = '';
  if (r.err) { ok = false; note = r.err; }
  else if (r.kind === 'frame') {
    const seg = segAt(wordF), ov = overlayAt(wordF);
    ok = a.outro ? wordF >= P.outro.from : a.overlay ? !!ov && ov.key === a.overlay : seg === a.seg && !ov;
    note = ok ? 'in frame' : `at the word the film shows ${ov ? `overlay ${ov.key}` : seg ? `segment ${seg}` : 'the outro'}, not ${a.seg || a.overlay || 'the outro'}`;
  } else {
    delta = (r.film - wordF) / fps;
    const [lo, hi] = WIN[r.kind];
    ok = delta >= lo - 1e-9 && delta <= hi + 1e-9;
    note = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} s (window ${lo} to +${hi})`;
  }
  const exc = exceptions[L.id];
  const status = ok ? 'PASS' : exc ? 'EXCEPTION' : 'FAIL';
  if (status === 'FAIL') bad++;
  rows.push({ id: L.id, word, wordS: s2(wordF), label: r.label || '-', actS: r.film != null ? s2(r.film) : '-', note, status, exc, why: L.why });
}

const md = [
  '<!-- lip-to-picture:start -->',
  '## Lip to picture: the key words',
  '',
  `Generated by recordly-demo scripts/narrated-plan.cjs from src/narrated/plan.ts, the captures' cursor.json events and`,
  'client-inputs.json → narration.anchors / exceptions. Word times are faster-whisper\'s as the plan places them.',
  '',
  '| Line | Word | Film s | The action / picture | Action s | Landing | Result |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.word} | ${r.wordS} | ${r.label}: ${r.why} | ${r.actS} | ${r.note} | ${r.status}${r.exc ? `: ${r.exc}` : ''} |`),
  '<!-- lip-to-picture:end -->',
].join('\n');
fs.mkdirSync(path.join(PROJECT, 'narration'), { recursive: true });
fs.writeFileSync(path.join(PROJECT, 'narration', 'lip-to-picture.md'), md + '\n');
if (argv.includes('--write')) {
  const readme = path.join(PROJECT, 'narration', 'README.md');
  const old = fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8') : '# The narrated long cut\n';
  const re = /<!-- lip-to-picture:start -->[\s\S]*?<!-- lip-to-picture:end -->/;
  fs.writeFileSync(readme, re.test(old) ? old.replace(re, md) : old.trimEnd() + '\n\n' + md + '\n');
}
for (const r of rows) console.log(`${r.status.padEnd(9)} ${r.id.padEnd(13)} "${r.word}" @ ${r.wordS.padStart(7)}  ${r.label.padEnd(44)} ${r.note}${r.exc ? `  [${r.exc}]` : ''}`);
console.log(`\nwrote ${path.join(PROJECT, 'narration', 'lip-to-picture.md')}`);
console.log(bad ? `\nLIP-TO-PICTURE FAIL (${bad})` : `\nLIP-TO-PICTURE OK (${rows.filter((r) => r.status === 'EXCEPTION').length} exception(s), each with its reason)`);
process.exit(bad ? 1 : 0);
