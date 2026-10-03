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
 * --draft writes a STARTING plan, src/narrated/plan.draft.ts, from this run's material (it never touches plan.ts):
 *   the voice   src/narrated/vo-lines.ts (prepare-vo.py): each line's length and word times
 *   the anchors client-inputs.json → narration.anchors: { seg, event, nth, end, shot?, word? } per line. `shot` names
 *               the capture (else the capture whose folder starts with the seg key's number: "21c" → 21-buyer);
 *               `word` is the key word (else the line's first word, marked TODO)
 *   the events  public/shots/<shot>/cursor.json: the nth event of that type, or the nth zoom
 * Part A (1-4) and the part-B sign-in (6, 7) are the approved segments, as the house film plays them; every narrated
 * line anchored on a narrated capture (20 on) gets its own cap() around its event, the key word landing 0.15 s before
 * a pointer action (0 for a zoom), the line plus 0.8 s of picture after it. A line anchored on a document or the phone
 * is placed by a gap and left TODO (the overlay needs its page, its pushes and its boxes: narration.md §6, with
 * pdftotext -bbox on the anchor text); an outro line by { outro }. The draft typechecks as plan.ts; it is a start to
 * tune against narrated-check and this gate, never a finished cut. It also writes narration/anchors.draft.json: the
 * anchors re-keyed to the draft's cuts (seg = the cut, nth counted inside it, as this gate reads them; `draft` keeps
 * what --draft read, so drafting again from them gives the same plan). Copy the two in together.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const PROJECT = path.resolve(opt('--project', process.cwd()));
const INPUTS = path.resolve(opt('--inputs', path.join(PROJECT, 'client-inputs.json')));
if (!fs.existsSync(path.join(PROJECT, 'src/narrated/plan.ts'))) { console.error(`no src/narrated/plan.ts in ${PROJECT}: make the project with new-project.sh --narrated (runbook A4)`); process.exit(2); }

const req = Module.createRequire(path.join(PROJECT, 'package.json'));
if (argv.includes('--draft')) { draft(); process.exit(0); }

/** Bundle a TS entry of the project and return its exports. */
function load(entry) {
  const built = req('esbuild').buildSync({
    stdin: { contents: entry, resolveDir: PROJECT, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', logLevel: 'error',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'remotion', '@remotion/*'],
  });
  const mod = new Module(path.join(PROJECT, '__nload__.cjs'));
  mod.paths = Module._nodeModulePaths(PROJECT);
  mod._compile(built.outputFiles[0].text, path.join(PROJECT, '__nload__.cjs'));
  return mod.exports;
}

function draft() {
  const { VO_LINES, theme: th, partASegments: PA, partBSegments: PB } = load("export { VO_LINES } from './src/narrated/vo-lines'; export { theme } from './src/theme'; export { partASegments, partBSegments } from './src/demo/timeline';");
  if (!VO_LINES.length) { console.error('src/narrated/vo-lines.ts is empty: voice and prepare the lines first (runbook N3-N6)'); process.exit(2); }
  const fps = th.fps;
  const inputs = JSON.parse(fs.readFileSync(INPUTS, 'utf8'));
  const anchors = (inputs.narration || {}).anchors || {};
  const shotsDir = path.join(PROJECT, 'public', 'shots');
  const shots = fs.existsSync(shotsDir) ? fs.readdirSync(shotsDir) : [];
  const shotFor = (a) => a.shot || shots.find((x) => x === a.seg) || shots.find((x) => x.startsWith(`${String(a.seg || '').replace(/[a-z]+$/, '')}-`));
  const cur = {};
  const cursorOf = (shot) => (cur[shot] = cur[shot] || JSON.parse(fs.readFileSync(path.join(shotsDir, shot, 'cursor.json'), 'utf8')));
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9'-]/g, '');
  const PART = { '1-hero': 'A[0]', '2-scroll': 'A[1]', '3-buy': 'A[2]', '4-menu': 'A[3]', '6-desk-signin': 'B[0]', '7-desk-onboard': 'B[1]' };
  const segs = ['  { ...A[0], key: "1" },', '  { ...A[1], key: "2" },', '  { ...A[2], key: "3" },', '  { ...A[3], key: "4" },',
    '  ...(B.length ? [{ ...B[0], key: "6" }, { ...B[1], key: "7" }] : []),'];
  const partKey = { 'A[0]': '1', 'A[1]': '2', 'A[2]': '3', 'A[3]': '4', 'B[0]': '6', 'B[1]': '7' };
  const lines = [];
  const todo = [];
  const used = {};
  const caps = [];
  const lastCap = {};
  const conv = {}; // the anchors as the gate reads them against this draft: seg = the draft's cut, nth counted inside it
  const countIn = (c, type, a0, f) => (c.events || []).filter((x) => x.type === type && x.frame >= a0 && x.frame < f).length;
  const reanchor = (id, a, key, c, t0, E) => {
    const r = Object.assign({}, a, { seg: key, shot: shotFor(a) });
    // what the draft read (nth in the capture), kept so a later --draft reads the same anchors the same way
    r.draft = { seg: a.seg };
    if (a.nth != null) r.draft.nth = a.nth;
    if (a.event === 'frame') delete r.nth;
    else if (a.event !== 'zoom' && E !== null) r.nth = countIn(c, a.event, t0, E);
    conv[id] = r;
  };
  const LEAD = { pointer: 0.15, zoom: 0 };
  for (const v of VO_LINES) {
    const given = anchors[v.id];
    const a = given && given.draft ? Object.assign({}, given, given.draft, { draft: undefined }) : given;
    const words = v.words.map((w) => norm(w[0]));
    let wi = a && a.word ? words.indexOf(norm(a.word)) : -1;
    const wordNote = wi < 0 ? ' // TODO: name the key word (narration.anchors.' + v.id + '.word)' : '';
    if (wi < 0) wi = 0;
    const wt = v.words[wi] ? v.words[wi][1] : 0;
    const why = JSON.stringify(((a && a.why) || v.text).slice(0, 70));
    const wordExpr = `word(${JSON.stringify(v.id)}, ${JSON.stringify(v.words[wi] ? norm(v.words[wi][0]) : '')})`;
    if (a && (a.outro || a.overlay || a.event === 'doc')) conv[v.id] = a;
    if (!a) { lines.push(`  { id: ${JSON.stringify(v.id)}, word: ${wordExpr}, anchor: { gap: 0.8 }, why: ${why} }, // TODO: no anchor in narration.anchors`); todo.push(`${v.id}: no anchor`); continue; }
    if (a.outro) { lines.push(`  { id: ${JSON.stringify(v.id)}, word: ${wordExpr}, anchor: { outro: 0.6 }, why: ${why} },${wordNote}`); continue; }
    if (a.overlay || a.event === 'doc') {
      lines.push(`  { id: ${JSON.stringify(v.id)}, word: ${wordExpr}, anchor: { gap: 0.8 }, why: ${why} }, // TODO: overlay "${a.overlay}" (doc ${a.doc || 0}, key ${a.key || 0}): write it in OVERLAYS, then anchor { overlay: "${a.overlay}", at: <s> }`);
      todo.push(`${v.id}: overlay ${a.overlay}`);
      continue;
    }
    const shot = shotFor(a);
    if (!shot || !fs.existsSync(path.join(shotsDir, shot, 'cursor.json'))) {
      lines.push(`  { id: ${JSON.stringify(v.id)}, word: ${wordExpr}, anchor: { gap: 0.8 }, why: ${why} }, // TODO: no capture for seg "${a.seg}" (anchors.${v.id}.shot)`);
      todo.push(`${v.id}: no capture for ${a.seg}`);
      continue;
    }
    const c = cursorOf(shot);
    let E = null, F = null, kind = 'pointer'; // E the action's frame, F the event's own start (what nth counts)
    if (a.event === 'zoom') { const z = (c.zooms || [])[a.nth || 0]; if (z) { E = a.end ? z.startFrame + z.inFrames : z.startFrame; kind = 'zoom'; } }
    else if (a.event && a.event !== 'frame') { const e = (c.events || []).filter((x) => x.type === a.event)[a.nth || 0]; if (e) { E = a.end && e.endFrame != null ? e.endFrame : e.frame; F = e.frame; } }
    const lead = a.event === 'frame' || E === null ? 0 : Math.round(LEAD[kind] * fps);
    if (PART[shot]) {
      // an approved part-A/B segment: the line lands on its own capture frame there
      const g = (PART[shot][0] === 'A' ? PA : PB)[Number(PART[shot].slice(2, -1))];
      const t0 = g ? Math.round((g.trimSec || 0) * fps) : 0; // the approved segment's first capture frame
      const at = E === null ? t0 + Math.round(wt * fps) + Math.round(0.5 * fps) : E - lead;
      reanchor(v.id, a, partKey[PART[shot]], c, t0, F);
      lines.push(`  { id: ${JSON.stringify(v.id)}, word: ${wordExpr}, anchor: { seg: ${JSON.stringify(partKey[PART[shot]])}, capture: ${at} }, why: ${why} },${wordNote}${E === null && a.event !== 'frame' ? ` // TODO: no ${a.event} #${a.nth || 0} in ${shot}` : ''}`);
      continue;
    }
    const n = (used[a.seg] = (used[a.seg] || 0) + 1);
    const key = n === 1 ? String(a.seg) : `${a.seg}-${n}`;
    const total = c.frameCount || (c.frames || []).length;
    const pre = Math.round((wt + 0.3) * fps) + lead;
    // "in frame" (or an event the capture lacks): carry on from where this capture last left off, never back to its start
    const prev = lastCap[shot];
    const center = E === null ? (prev ? prev.to : 0) + Math.round(0.5 * fps) + pre : E;
    let from = Math.max(0, center - pre);
    // the same capture again: the earlier cut ends where this one starts, so no stretch of it plays twice
    if (prev && prev.to > from && from > prev.from) prev.to = from;
    else if (prev && from <= prev.from && E === null) from = prev.to;
    const to = Math.min(total, from + Math.round((v.sec + 0.8 + 0.3) * fps));
    const cut = { key, shot, from, to, note: E === null && a.event !== 'frame' ? ` // TODO: no ${a.event} #${a.nth || 0} in ${shot}` : '' };
    caps.push(cut);
    lastCap[shot] = cut;
    reanchor(v.id, a, key, c, from, F);
    lines.push(`  { id: ${JSON.stringify(v.id)}, word: ${wordExpr}, anchor: { seg: ${JSON.stringify(key)}, capture: ${E === null ? from + pre : E - lead} }, why: ${why} },${wordNote}`);
  }
  for (const k of caps) segs.push(`  cap(${JSON.stringify(k.key)}, ${JSON.stringify(k.shot)}, ${k.from}, ${k.to}),${k.note}`);
  const planFile = path.join(PROJECT, 'src', 'narrated', 'plan.ts');
  const tpl = fs.readFileSync(planFile, 'utf8');
  const start = tpl.indexOf('export const HOLDS');
  const end = tpl.indexOf('/** the outro runs this long');
  if (start < 0 || end < 0) { console.error(`${planFile} is not the template's shape (no HOLDS … OUTRO_TAIL_SEC block): draft from the template's plan.ts`); process.exit(2); }
  const block = [
    '// DRAFT written by scripts/narrated-plan.cjs --draft from this run\'s captures, voice and narration.anchors. Tune it: each',
    '// TODO below, the overlays (documents and the phone), the cuts between captures (cap ranges, ringOn), the cameras.',
    'export const HOLDS: Record<string, number> = {};',
    'const A = partASegments;',
    'const B = partBSegments;',
    'const SEGMENTS: Seg[] = [',
    ...segs,
    '];',
    'export const LINES: LinePlan[] = [',
    ...lines,
    '];',
    'const OVERLAYS: OverlayPlan[] = [];',
    '',
  ].join('\n');
  let out = tpl.slice(0, start) + block + tpl.slice(end);
  if (!/import \{ partASegments, partBSegments \} from "\.\.\/demo\/timeline";/.test(out)) {
    out = out.replace('import { theme } from "../theme";', 'import { theme } from "../theme";\nimport { partASegments, partBSegments } from "../demo/timeline";');
  }
  const dest = path.join(PROJECT, 'src', 'narrated', 'plan.draft.ts');
  fs.writeFileSync(dest, out);
  const anchorsOut = path.join(PROJECT, 'narration', 'anchors.draft.json');
  fs.mkdirSync(path.dirname(anchorsOut), { recursive: true });
  fs.writeFileSync(anchorsOut, JSON.stringify({ anchors: conv }, null, 2) + '\n');
  console.log(`wrote ${dest}: ${segs.length} segments, ${lines.length} lines${todo.length ? `; TODO ${todo.length}: ${todo.join('; ')}` : ''}`);
  console.log(`wrote ${anchorsOut}: the anchors re-keyed to this draft's cuts (the gate counts nth inside a segment).`);
  console.log('Read both. Copy the draft into src/narrated/plan.ts and its anchors into client-inputs.json → narration.anchors together,');
  console.log('write the overlays, then narrated-check.cjs and narrated-plan.cjs (the gate).');
}

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
const cursor = (shot) => (cursorOf[shot] = cursorOf[shot] || readCursor(PROJECT, shot));
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
