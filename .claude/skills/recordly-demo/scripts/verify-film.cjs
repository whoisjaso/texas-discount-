#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * verify-film.cjs — the gates a rendered film must pass before it is sent (references/verification.md).
 *
 *   node verify-film.cjs --project clients/<slug>-demo --mp4 out/demo-v1.mp4 --out $SCRATCH/verify
 *                        [--allow-spikes 812,1203] [--allow-onsets 1450] [--allow-cut 238] [--no-stills]
 *   node verify-film.cjs --project clients/<slug>-demo --plan          (print the plan, no film needed)
 *   node verify-film.cjs --project clients/<slug>-demo --cuts-only --out DIR   (after capture, before the render)
 *
 * Every frame number comes from the project itself: src/demo/timeline.ts, src/components/Sfx.tsx (shotCues), the
 * camera and window math, bundled with the project's own esbuild, plus public/shots/<id>/cursor.json. Nothing here
 * re-types the running order, so the checks follow the film when part B or new timings go in.
 *
 * Writes <out>/stills/<frame>_<label>.png, <out>/contact-sheet.png, <out>/cuts/*.png (last | first | diff ×8),
 * <out>/report.json, and prints PASS / FAIL per gate. Exit 1 on any FAIL. Read-only on the project.
 *
 * --plan prints the derived plan (timeline, segments, the phone shot, stills, cuts, expected sound cues, and any
 * double-brace placeholder left in src/project.ts or storyboard.json) and exits: use it before rendering.
 *
 * Cut rule: last vs first frame PSNR ≥ 45 dB, same cursor point, shape and scroll. Every cut also prints where the two
 * frames differ beyond codec noise (the "changed region", CSS px). A cut under 45 dB fails unless you looked at its
 * diff image, it shows only the site's own small animation, and you pass --allow-cut <film frame>: the allowance holds
 * only when PSNR ≥ 40 dB and the changed region fits in one box of at most 64 × 64 CSS px.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { execFileSync, spawnSync } = require('child_process');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const n = process.argv[i + 1];
  if (n === undefined || n.startsWith('--')) args[a.slice(2)] = true;
  else { args[a.slice(2)] = n; i++; }
}
const PROJECT = path.resolve(args.project || '.');
const OUT = path.resolve(args.out || path.join(PROJECT, 'out', 'verify'));
const MP4 = args.mp4 ? path.resolve(args.mp4) : null;
const listArg = (k) => new Set(String(args[k] || '').split(',').filter(Boolean).map(Number));

const results = [];
const gate = (ok, name, detail) => {
  results.push({ gate: name, ok, detail });
  console.log(`${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};

// ------------------------------------------------------------------ the plan, from the project's own code
function loadProjectModule() {
  const req = Module.createRequire(path.join(PROJECT, 'package.json'));
  const esbuild = req('esbuild');
  const entry = [
    "export { buildTimeline, partASegments, partBSegments } from './src/demo/timeline';",
    "export { shotCues } from './src/components/Sfx';",
    "export { theme, toFrames } from './src/theme';",
    "export { project } from './src/project';",
    "export { windowPose, windowPoint } from './src/scenes/DesktopScene';",
    "export { windowLayout } from './src/components/MacWindow';",
    "export { computeTracks } from './src/lib/shot';",
    "export { cameraAt } from './src/components/Camera';",
  ].join('\n');
  const out = esbuild.buildSync({
    stdin: { contents: entry, resolveDir: PROJECT, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', logLevel: 'error',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'remotion'],
  });
  const m = new Module(path.join(PROJECT, '__verify__.cjs'));
  m.filename = path.join(PROJECT, '__verify__.cjs');
  m.paths = Module._nodeModulePaths(PROJECT);
  m._compile(out.outputFiles[0].text, m.filename);
  return m.exports;
}

/** Double-brace placeholders left in the files the film and the capture read (a film must never show "{{phone}}"). */
function placeholderHoles() {
  const holes = [];
  for (const f of ['src/project.ts', 'storyboard.json']) {
    const p = path.join(PROJECT, f);
    if (!fs.existsSync(p)) continue;
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => { if (/\{\{[^{}]*\}\}/.test(line)) holes.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`); });
  }
  return holes;
}

function phoneShotId() {
  const src = fs.readFileSync(path.join(PROJECT, 'src', 'Demo.tsx'), 'utf8');
  const m = src.match(/<PhoneScene\s+shot="([^"]+)"/);
  return m ? m[1] : null;
}

function buildPlan() {
  const M = loadProjectModule();
  const { theme, toFrames } = M;
  const fps = theme.fps;
  const sec = (s) => toFrames(s, fps);
  const T = M.buildTimeline(M.partBSegments);
  const shots = {};
  const loadShot = (id) => (shots[id] = shots[id] || JSON.parse(fs.readFileSync(path.join(PROJECT, 'public', 'shots', id, 'cursor.json'), 'utf8')));
  const phoneId = phoneShotId();

  // desktop segments laid out in film frames
  const segs = [];
  const lay = (list, from, part) => {
    let at = from;
    list.forEach((s) => {
      segs.push({ part, shot: s.shot, from: at, durationInFrames: s.durationInFrames, trim: Math.round((s.trimSec || 0) * fps), eventCues: s.eventCues || [], cues: s.cues || [], sceneFrom: from, url: s.url });
      at += s.durationInFrames;
    });
  };
  lay(M.partASegments, T.desktopA.from, 'A');
  lay(M.partBSegments, T.desktopB.from, 'B');
  for (const s of segs) loadShot(s.shot);
  if (phoneId) loadShot(phoneId);

  // expected sound cues: the same calls DesktopScene, PhoneScene and Demo make
  const cues = [];
  for (const part of ['A', 'B']) {
    let zoomsSoFar = 0;
    for (const s of segs.filter((x) => x.part === part)) {
      const d = shots[s.shot];
      for (const c of M.shotCues(d, { trimFrames: s.trim, durationInFrames: s.durationInFrames, zoomIndexOffset: zoomsSoFar })) cues.push({ frame: c.frame + s.from, file: c.file, why: `${s.shot} auto` });
      zoomsSoFar += d.zooms.length;
      for (const c of s.cues) cues.push({ frame: c.frame + s.from, file: c.file, why: `${s.shot} cue` });
      for (const ec of s.eventCues) {
        const ev = d.events.filter((e) => e.type === ec.type)[ec.index];
        if (ev) cues.push({ frame: ev.frame - s.trim + s.from + Math.round((ec.offsetSec || 0) * fps), file: ec.file, why: `${s.shot} ${ec.type} #${ec.index}` });
      }
    }
  }
  if (phoneId && T.phone.durationInFrames) for (const c of M.shotCues(shots[phoneId], { trimFrames: 0, durationInFrames: T.phone.durationInFrames })) cues.push({ frame: c.frame + T.phone.from, file: c.file, why: `${phoneId} auto` });
  const S = theme.sfx;
  cues.push({ frame: T.intro.from + 1, file: S.intro.file, why: 'intro (Demo.tsx)' });
  cues.push({ frame: T.desktopA.from - sec(S.open.leadSec), file: S.open.file, why: 'window opens (Demo.tsx)' });
  if (phoneId) cues.push({ frame: T.phone.from - sec(S.open.leadSec), file: S.open.file, why: 'phone slides in (Demo.tsx)' });
  cues.push({ frame: T.outro.from + sec(theme.outro.linesDelaySec) - sec(S.click.leadSec), file: S.outro.file, why: 'outro lines (Demo.tsx)' });
  cues.sort((a, b) => a.frame - b.frame);

  // stills: the moments every defect so far sat on
  const stills = [];
  const add = (f, label) => { if (f >= 0 && f < T.total) stills.push({ frame: Math.round(f), label }); };
  const I = T.intro;
  add(sec(1.0), 'intro-1.0s');
  add(I.handoffAt, 'handoff-start');
  add(Math.round((I.handoffAt + I.landAt) / 2), 'handoff-mid');
  add(I.landAt, 'sting-landed');
  add(I.landAt + I.fadeFrames, 'sting-dissolved');
  const first = segs[0];
  if (first) add(first.from + sec(3.0) - first.trim, 'hero-curtain');
  segs.forEach((s, i) => {
    const d = shots[s.shot];
    const toFilm = (cf) => s.from + cf - s.trim;
    const inSeg = (f) => f >= s.from && f < s.from + s.durationInFrames;
    d.zooms.forEach((z, k) => { const f = toFilm(z.startFrame + z.inFrames + 6); if (inSeg(f)) add(f, `${s.shot}-zoom${k}-${z.depth}x`); });
    const clicks = d.events.filter((e) => e.type === 'click');
    clicks.forEach((e, k) => { if (inSeg(toFilm(e.frame))) { add(toFilm(e.frame) + 2, `${s.shot}-click${k}-ring`); add(toFilm(e.frame) + 26, `${s.shot}-click${k}-after`); } });
    const typed = d.events.filter((e) => e.type === 'type' && inSeg(toFilm(e.frame)));
    if (typed.length) add(toFilm(typed[typed.length - 1].frame), `${s.shot}-typed-no-pointer`);
    const scrolls = d.events.filter((e) => e.type === 'scroll');
    for (let k = 1; k < scrolls.length; k++) {
      const gap = scrolls[k].frame - scrolls[k - 1].endFrame;
      if (gap >= 0 && gap < sec(theme.recordly.scrollMergeSec)) add(toFilm(Math.round((scrolls[k - 1].endFrame + scrolls[k].frame) / 2)), `${s.shot}-between-scrolls-no-cursor`);
    }
    if (i > 0) {
      add(s.from - sec(0.3), `cut${i}-minus0.3`);
      add(s.from - 1, `cut${i}-last`);
      add(s.from, `cut${i}-first`);
      add(s.from + sec(0.3), `cut${i}-plus0.3`);
    }
  });
  add(T.cutPoint - sec(0.3), 'cutpoint-minus0.3');
  add(T.cutPoint - 1, 'cutpoint-last-desktop');
  if (T.desktopB.durationInFrames) { add(T.desktopB.from, 'partB-first'); add(T.phone.from - 1, 'partB-last'); }
  if (phoneId && T.phone.durationInFrames) {
    const P = T.phone;
    add(P.from, 'phone-first');
    add(P.from + 2, 'phone-enter-2');
    add(P.from + 5, 'phone-enter-5');
    add(P.from + sec(0.3), 'phone-plus0.3');
    const touches = shots[phoneId].events.filter((e) => e.type === 'touch');
    if (touches[0]) add(P.from + touches[0].frame + 5, 'phone-swipe1-drag');
    add(P.from + Math.round(P.durationInFrames * 0.75), 'phone-mid');
    const end = P.from + P.durationInFrames;
    add(end - sec(theme.phone.exitSec) - 1, 'phone-exit-start');
    add(end - 7, 'phone-exit-mid');
    add(end - 3, 'phone-exit-late');
  }
  const O = T.outro;
  add(O.from + 6, 'outro-under');
  add(O.from + 9, 'outro-logo');
  add(O.from + sec(1.9), 'outro-lines');
  add(T.total - sec(0.57), 'outro-exit');
  add(T.total - 1, 'last-frame');
  const seen = new Set();
  const stillsU = stills.filter((s) => (seen.has(s.frame) ? false : seen.add(s.frame))).sort((a, b) => a.frame - b.frame);

  // in-window cuts: last capture frame of one segment vs first of the next
  const cuts = [];
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1], b = segs[i];
    if (a.part !== b.part) continue; // the A→B boundary is checked separately (it is part B's own recipe)
    cuts.push({ film: b.from, a: a.shot, aFrame: a.trim + a.durationInFrames - 1, b: b.shot, bFrame: b.trim });
  }
  return { M, T, fps, segs, shots, phoneId, cues, stills: stillsU, cuts, holes: placeholderHoles() };
}

// ------------------------------------------------------------------ media helpers
const ff = (argv, opts = {}) => spawnSync('ffmpeg', ['-nostdin', '-hide_banner', ...argv], Object.assign({ maxBuffer: 1 << 28 }, opts));
const seekT = (f, fps) => Math.max(0, (f - 0.5) / fps).toFixed(4);
function grab(mp4, frame, fps, png, vf) {
  const r = ff(['-v', 'error', '-y', '-ss', seekT(frame, fps), '-i', mp4, '-frames:v', '1', ...(vf ? ['-vf', vf] : []), png]);
  if (r.status !== 0 || !fs.existsSync(png)) throw new Error(`could not extract frame ${frame} of ${mp4}: ${r.stderr}`);
}
function rgbMean(mp4, frame, fps, [x, y, w, h]) {
  const r = ff(['-v', 'error', '-ss', seekT(frame, fps), '-i', mp4, '-frames:v', '1', '-vf', `crop=${Math.round(w)}:${Math.round(h)}:${Math.round(x)}:${Math.round(y)},format=rgb24`, '-f', 'rawvideo', '-']);
  const b = r.stdout;
  let s = [0, 0, 0];
  for (let i = 0; i + 2 < b.length; i += 3) { s[0] += b[i]; s[1] += b[i + 1]; s[2] += b[i + 2]; }
  const n = b.length / 3;
  return n ? s.map((v) => v / n) : null;
}
function psnr(pngA, pngB) {
  const r = ff(['-v', 'info', '-i', pngA, '-i', pngB, '-lavfi', 'psnr', '-f', 'null', '-']);
  const m = String(r.stderr).match(/average:(inf|[\d.]+)/);
  return m ? (m[1] === 'inf' ? Infinity : Number(m[1])) : NaN;
}

/**
 * Where two frames differ beyond codec noise: the max-channel |a − b|, box-blurred over 11 × 11 device px, above 12
 * levels. Returns the bounding box in CSS px (null when nothing is above the noise) and the device-px count.
 * Calibrated on the approved film: cut 1 (45.1 dB) → only the hero's bobbing scroll arrow, a 16 × 10 px box; cuts 2
 * and 3 → nothing.
 */
function changedRegion(pa, pb, dsf) {
  const dims = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const [w, h] = dims(pa);
  const r = ff(['-v', 'error', '-i', pa, '-i', pb, '-lavfi', '[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]blend=all_mode=difference,format=rgb24', '-f', 'rawvideo', '-']);
  const px = r.stdout;
  if (!px || px.length !== w * h * 3) return { error: 'could not diff the two frames' };
  const m = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < m.length; i++, j += 3) m[i] = Math.max(px[j], px[j + 1], px[j + 2]);
  const R = 5, K = (2 * R + 1) * (2 * R + 1);
  const hs = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -R; x < w + R; x++) {
      if (x + R < w) acc += m[row + Math.min(w - 1, x + R)];
      if (x - R - 1 >= 0) acc -= m[row + x - R - 1];
      if (x >= 0 && x < w) hs[row + x] = acc;
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -R; y < h + R; y++) {
      if (y + R < h) acc += hs[(y + R) * w + x];
      if (y - R - 1 >= 0) acc -= hs[(y - R - 1) * w + x];
      if (y >= 0 && y < h && acc > 12 * K) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (!n) return { box: null, px: 0 };
  const q = (v) => Math.round((v / dsf) * 10) / 10;
  return { box: [q(x0), q(y0), q((x1 - x0 + 1)), q((y1 - y0 + 1))], px: n };
}

// ------------------------------------------------------------------ gates
/**
 * Cut continuity from the captures alone: pixels (PSNR ≥ 45 dB, or --allow-cut for a small site animation) and
 * cursor / scroll from both cursor.json files.
 */
function checkCuts({ cuts, shots, fps }) {
  const allowCut = listArg('allow-cut');
  for (const c of cuts) {
    const A = path.join(PROJECT, 'public', 'shots', c.a, 'shot.mp4'), B = path.join(PROJECT, 'public', 'shots', c.b, 'shot.mp4');
    const pa = path.join(OUT, 'cuts', `${c.film}_${c.a}_last.png`), pb = path.join(OUT, 'cuts', `${c.film}_${c.b}_first.png`);
    grab(A, c.aFrame, fps, pa);
    grab(B, c.bFrame, fps, pb);
    const db = psnr(pa, pb);
    ff(['-v', 'error', '-y', '-i', pa, '-i', pb, '-lavfi', 'blend=all_mode=difference,lutrgb=r=val*8:g=val*8:b=val*8', path.join(OUT, 'cuts', `${c.film}_diff_x8.png`)]);
    const fa = shots[c.a].frames[c.aFrame], fb = shots[c.b].frames[c.bFrame];
    const dCur = Math.hypot(fa.x - fb.x, fa.y - fb.y), dScroll = Math.abs(fa.scrollY - fb.scrollY);
    const reg = changedRegion(pa, pb, (shots[c.a].viewport && shots[c.a].viewport.deviceScaleFactor) || 1);
    c.psnr = db === Infinity ? 'inf' : Math.round(db * 10) / 10;
    c.changed = reg;
    const where = reg.error ? reg.error : reg.box ? `changed region [${reg.box.join(', ')}] CSS px (x, y, w, h)` : 'no change above codec noise';
    let ok = db >= 45, note = '';
    if (!ok && allowCut.has(c.film)) {
      const small = !reg.error && (!reg.box || (reg.box[2] <= 64 && reg.box[3] <= 64));
      if (db >= 40 && small) { ok = true; note = '; ALLOWED by --allow-cut (a small site animation: name it in the report)'; }
      else note = `; --allow-cut REFUSED: it needs PSNR ≥ 40 dB and a changed region of at most 64 × 64 CSS px`;
    }
    gate(ok, `cut f${c.film} ${c.a}→${c.b} pixels`, `PSNR ${db === Infinity ? 'inf' : db.toFixed(1)} dB (≥ 45); ${where}; look at cuts/${c.film}_diff_x8.png${note}`);
    gate(dCur <= 0.5 && dScroll <= 0.5 && (fa.c || 'a') === (fb.c || 'a'), `cut f${c.film} ${c.a}→${c.b} cursor`, `(${fa.x}, ${fa.y}) ${fa.c || 'a'} scroll ${fa.scrollY} → (${fb.x}, ${fb.y}) ${fb.c || 'a'} scroll ${fb.scrollY}`);
  }
}

function run() {
  const plan = buildPlan();
  const { T, fps, segs, shots, cues, stills, cuts, M } = plan;
  if (args.plan) {
    const phone = plan.phoneId ? { shot: plan.phoneId, from: T.phone.from, durationInFrames: T.phone.durationInFrames } : null;
    console.log(JSON.stringify({ timeline: T, segments: segs.map(({ eventCues, cues: c, ...s }) => s), phone, cuts, stills, cues, holes: plan.holes }, null, 1));
    return 0;
  }
  fs.mkdirSync(path.join(OUT, 'cuts'), { recursive: true });
  gate(plan.holes.length === 0, 'no placeholders left', plan.holes.length ? plan.holes.join(' | ') : 'src/project.ts and storyboard.json hold no double-brace values');
  if (args['cuts-only']) {
    checkCuts(plan);
    const failedCuts = results.filter((r) => r.ok === false);
    console.log(failedCuts.length ? `CUTS FAIL (${failedCuts.length})` : 'CUTS PASS');
    return failedCuts.length ? 1 : 0;
  }
  if (!MP4) throw new Error('--mp4 is required (or --plan / --cuts-only)');
  fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true });

  // 1. container
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,pix_fmt,sample_rate,channels:format=duration,size', '-of', 'json', MP4]).toString());
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const a = probe.streams.find((s) => s.codec_type === 'audio');
  gate(v && v.codec_name === 'h264' && v.width === M.theme.width && v.height === M.theme.height && v.r_frame_rate === `${fps}/1`, 'video stream', v ? `${v.codec_name} ${v.width}x${v.height} ${v.r_frame_rate} ${v.pix_fmt}` : 'none');
  gate(Number(v && v.nb_read_frames) === T.total, 'frame count', `${v && v.nb_read_frames} frames, timeline.total ${T.total} (${(T.total / fps).toFixed(3)} s)`);
  gate(!!a && a.codec_name === 'aac', 'audio stream', a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : 'none');

  // 2. luma scan: one-frame spikes are mount / decode glitches that stills never show
  const st = ff(['-v', 'error', '-i', MP4, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-an', '-f', 'null', '-']);
  const yavg = String(st.stdout).split('\n').filter((l) => l.includes('YAVG=')).map((l) => Number(l.split('=')[1]));
  const allowSpikes = listArg('allow-spikes');
  const spikes = [];
  for (let i = 1; i < yavg.length - 1; i++) {
    const dPrev = yavg[i] - yavg[i - 1], dNext = yavg[i] - yavg[i + 1];
    if (Math.abs(dPrev) > 10 && Math.abs(dNext) > 10 && Math.sign(dPrev) === Math.sign(dNext) && Math.abs(yavg[i - 1] - yavg[i + 1]) < 6) spikes.push(i);
  }
  const unexplained = spikes.filter((f) => !allowSpikes.has(f));
  gate(yavg.length === T.total && unexplained.length === 0, 'luma scan (one-frame spikes)', `${yavg.length} frames scanned; spikes at [${spikes.join(', ')}]${allowSpikes.size ? ` (allowed: ${[...allowSpikes].join(', ')})` : ''}`);
  const last = yavg[yavg.length - 1];
  gate(last !== undefined && last < 20, 'last frame is black', `YAVG ${last && last.toFixed(1)}`);
  fs.writeFileSync(path.join(OUT, 'yavg.txt'), yavg.map((y, i) => `${i} ${y}`).join('\n'));

  // 3. cut continuity: pixels (PSNR ≥ 45 dB) and cursor / scroll from both cursor.json files
  checkCuts(plan);

  // 4. white level: the recording is never graded, so a white page reads white right to the window's edges
  const vp = shots[segs[0].shot].viewport;
  const W = M.theme.width, H = M.theme.height;
  const boxes = [[24, vp.height - 54, 30, 30], [vp.width / 2 - 15, vp.height - 54, 30, 30], [vp.width - 54, vp.height - 54, 30, 30]];
  const white = [];
  for (const s of segs.filter((x) => x.part === 'A')) {
    const d = shots[s.shot];
    const tracks = M.computeTracks(d);
    const L = M.windowLayout(vp.width, vp.height, W, H);
    let found = 0;
    for (let k = 45; k < s.durationInFrames - 3 && found < 3; k += 9) {
      const sceneFrame = s.from - s.sceneFrom + k;
      if (sceneFrame < 45) continue;
      const cf = s.trim + k;
      const cam = M.cameraAt(d, tracks, cf, L.contentW, L.contentH);
      if (cam.s > 1.0005) continue;
      const pose = M.windowPose(sceneFrame, fps, { enter: true, camScale: cam.s });
      const fr = d.frames[cf];
      for (const b of boxes) {
        if (Math.hypot(fr.x - (b[0] + 15), fr.y - (b[1] + 15)) < 90) continue;
        const capRect = b.map((q) => q * vp.deviceScaleFactor);
        const cap = rgbMean(path.join(PROJECT, 'public', 'shots', s.shot, 'shot.mp4'), cf, fps, capRect);
        if (!cap || Math.min(...cap) < 250) continue;
        const p0 = M.windowPoint([b[0], b[1]], pose, vp.width, vp.height, W, H), p1 = M.windowPoint([b[0] + b[2], b[1] + b[3]], pose, vp.width, vp.height, W, H);
        const film = rgbMean(MP4, s.from + k, fps, [p0[0] + 4, p0[1] + 4, p1[0] - p0[0] - 8, p1[1] - p0[1] - 8]);
        white.push({ film: s.from + k, box: b, capture: cap.map((q) => Math.round(q)), render: film.map((q) => Math.round(q)), ok: Math.min(...film) >= Math.min(...cap) - 4 });
        found++;
      }
    }
  }
  if (white.length) gate(white.every((w) => w.ok), 'white page reads white at the window edges', white.map((w) => `f${w.film} [${w.box.map(Math.round).join(',')}] ${Math.min(...w.capture)}→${Math.min(...w.render)}`).join('; '));
  else {
    const look = stills.filter((x) => /^cut1-first$|-zoom0-/.test(x.label)).slice(0, 2).map((x) => `${String(x.frame).padStart(5, '0')}_${x.label}.png`);
    gate(null, 'white page at the window edges', `no white page corner at 1x in the sampled frames, so this gate is by eye: open ${look.join(' and ') || 'the cut and zoom stills'} at 100% and confirm page white stays white (255) right to the window's edge; say so in the report`);
  }

  // 5. audio: true peak, loudness, and every onset on an on-screen event
  const eb = ff(['-v', 'info', '-nostats', '-i', MP4, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const ebs = String(eb.stderr);
  const tp = Number((ebs.match(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf)/) || [])[1]);
  const lufs = Number((ebs.match(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+)/) || [])[1]);
  const vd = String(ff(['-v', 'info', '-nostats', '-i', MP4, '-vn', '-af', 'volumedetect', '-f', 'null', '-']).stderr);
  const maxVol = Number((vd.match(/max_volume:\s*(-?[\d.]+)/) || [])[1]);
  gate(tp < -1 && maxVol <= -1, 'audio peak', `true peak ${tp} dBTP (< −1), max ${maxVol} dBFS (≤ −1), integrated ${lufs} LUFS`);
  const as = ff(['-v', 'error', '-i', MP4, '-vn', '-af', 'aresample=44100,asetnsamples=n=1470:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-', '-f', 'null', '-']);
  const lv = String(as.stdout).split('\n').filter((l) => l.includes('Peak_level=')).map((l) => { const x = l.split('=')[1]; return /inf/.test(x) ? -120 : Number(x); });
  const onsets = [];
  for (let i = 1; i < lv.length; i++) if (lv[i] > -55 && lv[i] - Math.max(...lv.slice(Math.max(0, i - 3), i)) > 9) onsets.push(i);
  const blips = [];
  for (let i = 4; i < lv.length - 4; i++) if (lv[i] > -60 && Math.max(...lv.slice(i - 4, i)) < -80 && Math.max(...lv.slice(i + 1, i + 5)) < -80) blips.push(i);
  const allowOn = listArg('allow-onsets');
  const explain = (o) => cues.filter((c) => o >= c.frame - 1 && o <= c.frame + 12);
  const stray = onsets.filter((o) => !explain(o).length && !allowOn.has(o));
  gate(stray.length === 0, 'onset map: every sound sits on an on-screen event', `${onsets.length} onsets [${onsets.join(', ')}]; ${cues.length} expected cues; unexplained [${stray.join(', ')}]`);
  gate(blips.length === 0, 'no isolated blips', `[${blips.join(', ')}]`);

  // 6. stills + contact sheet (look at every one)
  if (!args['no-stills']) {
    for (const s of stills) grab(MP4, s.frame, fps, path.join(OUT, 'stills', `${String(s.frame).padStart(5, '0')}_${s.label}.png`), null);
    // the very last frame: a seek right at the end can come back empty, so select it by index
    const lastPng = path.join(OUT, 'stills', `${String(T.total - 1).padStart(5, '0')}_last-frame.png`);
    ff(['-v', 'error', '-y', '-sseof', '-0.2', '-i', MP4, '-vf', `select=gte(n\\,0)`, '-update', '1', lastPng]);
    const py = [
      'import sys,glob,os',
      'from PIL import Image,ImageDraw,ImageFont',
      'src,out=sys.argv[1],sys.argv[2]',
      'fs=sorted(glob.glob(os.path.join(src,"*.png")))',
      'cols,tw,th=4,480,270',
      'rows=(len(fs)+cols-1)//cols',
      'W=Image.new("RGB",(cols*tw,rows*th),(255,0,255))',
      'try: font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",15)',
      'except Exception: font=ImageFont.load_default()',
      'for i,f in enumerate(fs):',
      '  im=Image.open(f).convert("RGB").resize((tw,th)); d=ImageDraw.Draw(im); lab=os.path.basename(f)[:-4]',
      '  d.rectangle((0,0,10+9*len(lab),20),fill=(255,230,0)); d.text((4,2),lab,fill=(0,0,0),font=font)',
      '  W.paste(im,((i%cols)*tw,(i//cols)*th))',
      'W.save(out); print(len(fs))',
    ].join('\n');
    const r = spawnSync('python3', ['-c', py, path.join(OUT, 'stills'), path.join(OUT, 'contact-sheet.png')]);
    gate(null, 'stills', `${stills.length} labelled stills in ${path.join(OUT, 'stills')}${r.status === 0 ? `; contact sheet ${path.join(OUT, 'contact-sheet.png')}` : ' (no contact sheet: python3 + PIL missing)'}. Look at every one, and at the zoom stills at 100%.`);
  }

  const failed = results.filter((r) => r.ok === false);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ mp4: MP4, project: PROJECT, timeline: T, results, cuts, stills, cues, onsets, blips, spikes, white, holes: plan.holes }, null, 1));
  console.log(failed.length ? `VERIFY FAIL (${failed.length} gates) → ${path.join(OUT, 'report.json')}` : `VERIFY PASS → ${path.join(OUT, 'report.json')}`);
  return failed.length ? 1 : 0;
}

try {
  process.exit(run());
} catch (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exit(2);
}
