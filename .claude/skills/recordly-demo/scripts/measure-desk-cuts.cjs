#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * measure-desk-cuts.cjs — part B's three cut points, measured on this run's desk captures (runbook B5;
 * references/verification.md §7). Replaces reading contact sheets by eye; the cut gates in verify-film.cjs stay the
 * judge (`--cuts-only` must still print CUTS PASS after the values are filled).
 *
 *   node measure-desk-cuts.cjs --project $P [--into $I] [--hold-ms 1200] [--desk $DESK_DIR] [--ratio 0.94] [--json]
 *
 * Edge density per capture frame, the same measure verify-film's "first frame painted" gate uses: the frame scaled to
 * 720 px wide, grey, neighbour steps > 40 levels (right and down) per 1000 px. A blank page, a skeleton loader or a
 * dialog's close reads ~0; a painted desk page 11-28.
 *   signinPainted        6-desk-signin: the first frame after the opening blank run at >= ratio × the settled density
 *                        (the sign-in card has finished fading in).
 *   saleSkeleton [a, b]  8-desk-sale-start: a = the first blank (skeleton) frame after the Start A Sale click;
 *                        b = the first frame after it at >= ratio × settled ("Which Car Is It?" painted).
 *   readbackRelease [a,b] 10-desk-readback: a = the hold's start + the hold time (CONFIRM_HOLD_MS, 1200 ms: the first
 *                        frame reading "Release To Confirm 100%") + 15 (the 0.5 s of 100% the film keeps);
 *                        b = the first frame after the release's blank run at >= ratio × settled.
 * "settled" = the density once the page stops changing (two frame steps in a row under 0.05). Discount's captures give 11, [42, 55],
 * [108, 134]; the shipped film used 12 for signinPainted (picked by eye; 11 and 12 read 14.2 and 14.3, both painted).
 * --into writes partB.cuts into client-inputs.json (keeps partB's other keys). Exit 1 when a shot or its event is
 * missing, or a value cannot be found.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const P = path.resolve(opt('--project', '') || (console.error('usage: measure-desk-cuts.cjs --project <dir> [--into client-inputs.json]'), process.exit(2)));
const INTO = opt('--into', null);
const RATIO = Number(opt('--ratio', '0.94'));
const W = 720;

function holdMs() {
  if (opt('--hold-ms')) return Number(opt('--hold-ms'));
  const desk = opt('--desk', process.env.DESK_DIR || '');
  const f = desk && path.join(desk, 'src/components/admin/HoldToConfirmButton.tsx');
  if (f && fs.existsSync(f)) {
    const m = fs.readFileSync(f, 'utf8').match(/CONFIRM_HOLD_MS\s*=\s*(\d+)/);
    if (m) return Number(m[1]);
  }
  return 1200;
}

function shot(id) {
  const dir = path.join(P, 'public', 'shots', id);
  const mp4 = path.join(dir, 'shot.mp4'), cj = path.join(dir, 'cursor.json');
  if (!fs.existsSync(mp4) || !fs.existsSync(cj)) { console.error(`missing ${dir}/shot.mp4 or cursor.json: capture ${id} first`); process.exit(1); }
  const cursor = JSON.parse(fs.readFileSync(cj, 'utf8'));
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', mp4]).stdout.toString().trim().split(',').map(Number);
  const H = Math.round((probe[1] * W) / probe[0] / 2) * 2;
  const raw = spawnSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-i', mp4, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 2 ** 31 }).stdout;
  const n = Math.floor(raw.length / (W * H));
  const d = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    const o = f * W * H; let e = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = raw[o + y * W + x];
      if (x + 1 < W && Math.abs(v - raw[o + y * W + x + 1]) > 40) e++;
      if (y + 1 < H && Math.abs(v - raw[o + (y + 1) * W + x]) > 40) e++;
    }
    d[f] = (e / (W * H)) * 1000;
  }
  return { id, cursor, d, fps: cursor.fps || 30 };
}

const BLANK = 1.0;
/** the first blank run at or after `from`: [start, end] */
function blankRun(d, from) {
  let a = -1;
  for (let f = from; f < d.length; f++) {
    if (d[f] < BLANK && a < 0) a = f;
    if (a >= 0 && d[f] >= BLANK) return [a, f - 1];
  }
  return a >= 0 ? [a, d.length - 1] : null;
}
/** the first frame after a blank run whose density reaches RATIO × the settled level */
function painted(d, afterBlankEnd) {
  // settled: the density once it stops changing (two steps in a row under 0.05) after the page starts to paint
  let settled = null;
  for (let f = afterBlankEnd + 1; f + 2 < d.length; f++) {
    if (d[f] >= BLANK && Math.abs(d[f + 1] - d[f]) < 0.05 && Math.abs(d[f + 2] - d[f + 1]) < 0.05) { settled = d[f]; break; }
  }
  if (settled == null) return null;
  for (let f = afterBlankEnd + 1; f < d.length; f++) if (d[f] >= RATIO * settled) return { frame: f, settled };
  return null;
}
const show = (d, a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => `${a + k}:${d[a + k].toFixed(1)}`).join(' ');

const out = {}; const notes = [];
let bad = 0;

// 6-desk-signin
{
  const s = shot('6-desk-signin');
  const run = s.d[0] < BLANK ? blankRun(s.d, 0) : [-1, -1];
  const p = painted(s.d, run[1]);
  if (!p) { console.error('6-desk-signin: never paints'); bad++; }
  else {
    out.signinPainted = p.frame;
    notes.push(`6-desk-signin  blank 0..${run[1]}, settled ${p.settled.toFixed(1)}; signinPainted = ${p.frame}   [${show(s.d, Math.max(0, p.frame - 4), p.frame + 3)}]`);
  }
}
// 8-desk-sale-start
{
  const s = shot('8-desk-sale-start');
  const click = (s.cursor.events || []).find((e) => e.type === 'click');
  if (!click) { console.error('8-desk-sale-start: no click event (the Start A Sale click)'); bad++; }
  else {
    const run = blankRun(s.d, click.frame);
    const p = run && painted(s.d, run[1]);
    if (!run || !p) { console.error(`8-desk-sale-start: no skeleton / paint after the click at ${click.frame}`); bad++; }
    else {
      out.saleSkeleton = [run[0], p.frame];
      notes.push(`8-desk-sale-start  click ${click.frame}; skeleton ${run[0]}..${run[1]}; settled ${p.settled.toFixed(1)}; saleSkeleton = [${run[0]}, ${p.frame}]   [${show(s.d, run[0] - 2, run[0] + 1)} … ${show(s.d, p.frame - 2, p.frame + 2)}]`);
    }
  }
}
// 10-desk-readback
{
  const s = shot('10-desk-readback');
  const hold = (s.cursor.events || []).find((e) => e.type === 'hold');
  if (!hold || hold.endFrame == null) { console.error('10-desk-readback: no hold event with an endFrame (Hold To Confirm)'); bad++; }
  else {
    const ms = holdMs();
    const full = hold.frame + Math.round((ms / 1000) * s.fps);
    const a = full + Math.round(0.5 * s.fps);
    // cross-check: the label's change to "Release To Confirm 100%" is the last density step inside the hold
    let step = -1;
    for (let f = hold.frame + 1; f < Math.min(hold.endFrame, s.d.length); f++) if (Math.abs(s.d[f] - s.d[f - 1]) >= 0.2) step = f;
    if (a >= hold.endFrame) { console.error(`10-desk-readback: the hold is released at ${hold.endFrame}, before 0.5 s of 100% (${a}): the storyboard's holdSec is too short`); bad++; }
    const run = blankRun(s.d, hold.endFrame);
    const p = run && painted(s.d, run[1]);
    if (!run || !p) { console.error(`10-desk-readback: no blank / paint after the release at ${hold.endFrame}`); bad++; }
    else {
      out.readbackRelease = [a, p.frame];
      notes.push(`10-desk-readback  hold ${hold.frame}..${hold.endFrame}, ${ms} ms -> 100% at ${full} (last label change seen at ${step}); +15 -> a ${a}; blank ${run[0]}..${run[1]}; settled ${p.settled.toFixed(1)}; readbackRelease = [${a}, ${p.frame}]`);
      if (step >= 0 && Math.abs(step - full) > 2) notes.push(`  WARN the label changed at ${step}, not at ${full}: look at frames ${full - 2}..${step + 2} (the "100%" frame) and set a = that frame + 15 by hand`);
    }
  }
}

for (const n of notes) console.log(n);
if (bad) { console.log(`\n${bad} value(s) not found`); process.exit(1); }
console.log(`\npartB.cuts = ${JSON.stringify(out)}`);
if (args.includes('--json')) console.log(JSON.stringify(out));
if (INTO) {
  const inp = JSON.parse(fs.readFileSync(INTO, 'utf8'));
  inp.partB = Object.assign({}, inp.partB || {}, { cuts: out });
  fs.writeFileSync(INTO, JSON.stringify(inp, null, 2) + '\n');
  console.log(`wrote partB.cuts into ${INTO}; then: fill-client.cjs check --stage post, fill-client.cjs project, verify-film.cjs --cuts-only`);
}
