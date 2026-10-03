// The narrated cut's numeric gates on the rendered film (the skill's verify-film, adapted to a voice-led film; runbook N13):
//   node $S/scripts/narrated-verify.cjs --project $P --mp4 out/<slug>-demo-narrated.mp4 --out <dir> [--allow-spikes 812,1203]
// Tolerances (references/narration.md §10): the voice set -16 +/- 0.5 LUFS integrated; the mix -16 +/- 1 LUFS; true
// peak <= -1.5 dBTP. An --allow-spikes frame needs its line in $P/verify-decisions.md (frame, what, why, who looked).
// 1. container: h264 1920x1080 30 fps, frame count = the plan's total, AAC
// 2. luma: no one-frame spike; the last frame black
// 3. audio: true peak <= -1.5 dBTP; integrated loudness of the mix and of the voice set alone
// 4. onset map: every onset is a cue the composition plays (desk, documents, phone, intro, outro) or inside a voice line
// 5. no isolated blips
// 6. stills: the frames narrated-frames.cjs lists, plus the last frame, into <out>/stills (look at every one)
// Writes <out>/report.json. Exits 1 on a failed gate.
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { spawnSync } = require('child_process');

const PROJECT = path.resolve(process.argv.includes('--project') ? process.argv[process.argv.indexOf('--project') + 1] : process.cwd());
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
if (!args.mp4) { console.error('usage: narrated-verify.cjs --project <dir> --mp4 <film> [--out <dir>]'); process.exit(2); }
const MP4 = path.resolve(PROJECT, args.mp4);
const OUT = path.resolve(args.out || path.join(PROJECT, 'out', 'verify-narrated'));
fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true });
const allowSpikes = new Set(String(args['allow-spikes'] || '').split(',').filter(Boolean).map(Number));
{ // every allowance needs its recorded decision (verify-decisions.md, scripts/decisions.cjs)
  const { allowed } = require('./decisions.cjs');
  const undecided = [...allowSpikes].filter((f) => !allowed(PROJECT, 'spike', f));
  if (undecided.length) { console.error(`--allow-spikes ${undecided.join(',')}: no "allow-spike" row naming it in ${path.join(PROJECT, 'verify-decisions.md')} (runbook.cjs mark <step> --allow spike:<frame> --why … --by-agent …)`); process.exit(2); }
}

const req = Module.createRequire(path.join(PROJECT, 'package.json'));
const entry = [
  "export { narratedPlan } from './src/narrated/plan';",
  "export { filmCues, docCues } from './src/narrated/Narrated';",
  "export { phoneCues, asTouch } from './src/narrated/NarratedPhone';",
  "export * as DS from './src/scenes/DesktopScene';",
  "export { theme } from './src/theme';",
].join('\n');
const built = req('esbuild').buildSync({
  stdin: { contents: entry, resolveDir: PROJECT, loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', logLevel: 'error',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'remotion', '@remotion/*'],
});
const m = new Module(path.join(PROJECT, '__nverify__.cjs'));
m.paths = Module._nodeModulePaths(PROJECT);
m._compile(built.outputFiles[0].text, path.join(PROJECT, '__nverify__.cjs'));
const M = m.exports;
const P = M.narratedPlan;
const fps = M.theme.fps;

const results = [];
const gate = (ok, name, detail) => {
  results.push({ ok, name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
};
const ff = (argv) => spawnSync('ffmpeg', ['-nostdin', '-hide_banner', ...argv], { maxBuffer: 1 << 28 });
const shot = (id) => JSON.parse(fs.readFileSync(path.join(PROJECT, 'public', 'shots', id, 'cursor.json'), 'utf8'));

// 1. container
const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,pix_fmt,sample_rate,channels:format=duration,size', '-of', 'json', MP4]).stdout.toString());
const v = probe.streams.find((s) => s.codec_type === 'video');
const a = probe.streams.find((s) => s.codec_type === 'audio');
gate(v && v.codec_name === 'h264' && v.width === 1920 && v.height === 1080 && v.r_frame_rate === `${fps}/1`, 'video stream', v ? `${v.codec_name} ${v.width}x${v.height} ${v.r_frame_rate} ${v.pix_fmt}` : 'none');
gate(Number(v && v.nb_read_frames) === P.total, 'frame count', `${v && v.nb_read_frames} frames, plan ${P.total} (${(P.total / fps).toFixed(2)} s)`);
gate(!!a && a.codec_name === 'aac', 'audio stream', a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : 'none');

// 2. luma
const st = ff(['-v', 'error', '-i', MP4, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-an', '-f', 'null', '-']);
const yavg = String(st.stdout).split('\n').filter((l) => l.includes('YAVG=')).map((l) => Number(l.split('=')[1]));
const spikes = [];
for (let i = 1; i < yavg.length - 1; i++) {
  const dPrev = yavg[i] - yavg[i - 1], dNext = yavg[i] - yavg[i + 1];
  if (Math.abs(dPrev) > 10 && Math.abs(dNext) > 10 && Math.sign(dPrev) === Math.sign(dNext) && Math.abs(yavg[i - 1] - yavg[i + 1]) < 6) spikes.push(i);
}
const strays = spikes.filter((f) => !allowSpikes.has(f));
gate(yavg.length === P.total && strays.length === 0, 'luma scan (one-frame spikes)', `${yavg.length} frames; spikes [${spikes.join(', ')}]`);
const last = yavg[yavg.length - 1];
gate(last !== undefined && last < 20, 'last frame is black', `YAVG ${last && last.toFixed(1)}`);
fs.writeFileSync(path.join(OUT, 'yavg.txt'), yavg.map((y, i) => `${i} ${y}`).join('\n'));

// 3. loudness and peak: the mix, and the voice set alone
const ebur = (input, pre = []) => {
  const s = String(ff(['-v', 'info', '-nostats', ...pre, '-i', input, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr);
  return { tp: Number((s.match(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf)/) || [])[1]), lufs: Number((s.match(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+)/) || [])[1]) };
};
const mix = ebur(MP4);
const list = path.join(OUT, 'vo-list.txt');
fs.writeFileSync(list, P.lines.map((l) => `file '${path.join(PROJECT, 'public', 'vo', l.id + '.wav')}'`).join('\n'));
const voice = ebur(list, ['-f', 'concat', '-safe', '0']);
gate(mix.tp <= -1.5, 'true peak', `${mix.tp} dBTP (<= -1.5)`);
gate(Math.abs(voice.lufs + 16) <= 0.5, 'voice loudness', `voice set ${voice.lufs} LUFS integrated (-16 +/- 0.5), true peak ${voice.tp} dBTP`);
gate(Math.abs(mix.lufs + 16) <= 1, 'mix loudness', `the mix ${mix.lufs} LUFS integrated (-16 +/- 1)`);

// 4. onsets: every one on a played cue, or inside a voice line
const segs = P.segments;
const raw = segs.map((g) => shot(g.shot));
const data = M.DS.prepareData(raw, segs);
const cues = [];
for (const c of M.DS.desktopCues(segs, data, fps, { autoSfx: true })) cues.push({ frame: c.frame + P.deskFrom, file: c.file, from: 'desk' });
for (const c of M.filmCues(P, fps)) cues.push({ frame: c.frame, file: c.file, from: 'film' });
for (const o of P.overlays.filter((x) => x.phone)) {
  const ids = [...new Set(o.phone.parts.map((p) => p[0]))];
  const pd = ids.map((id) => M.asTouch(shot(id), o.phone.flicks));
  for (const c of M.phoneCues(o.phone, pd, fps)) cues.push({ frame: c.frame + o.from, file: c.file, from: 'phone' });
}
const as = ff(['-v', 'error', '-i', MP4, '-vn', '-af', 'aresample=44100,asetnsamples=n=1470:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-', '-f', 'null', '-']);
const lv = String(as.stdout).split('\n').filter((l) => l.includes('Peak_level=')).map((l) => { const x = l.split('=')[1]; return /inf/.test(x) ? -120 : Number(x); });
const onsets = [];
for (let i = 1; i < lv.length; i++) if (lv[i] > -55 && lv[i] - Math.max(...lv.slice(Math.max(0, i - 3), i)) > 9) onsets.push(i);
const inLine = (o) => P.lines.find((l) => o >= l.from - 2 && o <= l.from + l.durationInFrames + 2);
const onCue = (o) => cues.filter((c) => o >= c.frame - 1 && o <= c.frame + 12);
const explained = onsets.map((o) => ({ frame: o, sec: +(o / fps).toFixed(2), cue: onCue(o).map((c) => `${c.from}:${path.basename(c.file)}`), line: inLine(o) ? inLine(o).id : null }));
const stray = explained.filter((x) => !x.cue.length && !x.line);
gate(stray.length === 0, 'onset map (a played cue or a voice line)', `${onsets.length} onsets, ${explained.filter((x) => x.line && !x.cue.length).length} inside lines only, ${cues.length} cues; unexplained [${stray.map((x) => `${x.frame} (${x.sec} s)`).join(', ')}]`);
const blips = [];
for (let i = 4; i < lv.length - 4; i++) if (lv[i] > -60 && Math.max(...lv.slice(i - 4, i)) < -80 && Math.max(...lv.slice(i + 1, i + 5)) < -80) blips.push(i);
gate(blips.length === 0, 'no isolated blips', `[${blips.join(', ')}]`);

// 6. stills
if (!args['no-stills']) {
  const fr = spawnSync('node', [path.join(__dirname, 'narrated-frames.cjs'), '--project', PROJECT]).stdout.toString().trim().split('\n').map((l) => l.split(' ')).map(([f, label]) => ({ frame: Number(f), label }));
  fr.push({ frame: P.total - 1, label: 'last-frame' });
  for (const s of fr) {
    const png = path.join(OUT, 'stills', `${String(s.frame).padStart(5, '0')}_${s.label}.png`);
    if (s.label === 'last-frame') ff(['-v', 'error', '-y', '-i', MP4, '-vf', `select=eq(n\\,${s.frame})`, '-frames:v', '1', png]);
    else ff(['-v', 'error', '-y', '-ss', (Math.max(0, s.frame - 0.5) / fps).toFixed(4), '-i', MP4, '-frames:v', '1', png]);
  }
  console.log(`stills: ${fr.length} in ${path.join(OUT, 'stills')}`);
}

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ mp4: MP4, total: P.total, results, mix, voice, spikes, onsets: explained, cues, blips }, null, 1));
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} gate(s) FAILED` : '\nALL GATES PASS');
process.exit(failed.length ? 1 : 0);
