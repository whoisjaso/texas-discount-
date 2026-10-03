#!/usr/bin/env node
// make-demo-card.mjs --out <project>/public/narrated [--zxing-dir $SCRATCH/zxing]          (runbook N7)
//
// The narrated cut's demo licence (references/narration.md §9): the desk's own scanner reads it through a test camera
// feed, so the PDF417 on its back must be a real AAMVA barcode for the house demo buyer (James Carter, licence
// 41927365, DOB 06/14/1988, issuer IIN 636015 = Texas). Never a real person's licence.
//   1. zxing-wasm@3.1.3 (the version the desk's scanner uses) is installed into --zxing-dir (default $SCRATCH/zxing)
//      with `npm i --prefix`, once: never into the desk, the skill or the project.
//   2. the AAMVA string is encoded as PDF417 (6 columns, scale 4) and decoded back: DAQ, DCS and DAC must read back.
//   3. scripts/card/demo-card.py draws the front and back (bundled DejaVu Sans) as 1920x1080 camera frames
//      card-front.png / card-back.png, and the back frame is decoded once more (what the camera feed will show).
// Prints "CARD DECODES: DAQ41927365 DCSCARTER DACJAMES". fill-client.cjs long-storyboard injects the two frames into
// the camera feed (assets/narrated/camera-feed.js).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('--out');
if (!OUT) { console.error('usage: make-demo-card.mjs --out <project>/public/narrated [--zxing-dir DIR]'); process.exit(2); }
const ZX = path.resolve(opt('--zxing-dir', path.join(process.env.SCRATCH || '/tmp', 'zxing')));
const VERSION = '3.1.3';
const BUYER = { last: 'CARTER', first: 'JAMES', number: '41927365', dob: '06141988', exp: '06142030' };

const pkg = path.join(ZX, 'node_modules', 'zxing-wasm', 'package.json');
if (!fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg, 'utf8')).version !== VERSION) {
  console.log(`installing zxing-wasm@${VERSION} into ${ZX} (scratch only)`);
  fs.mkdirSync(ZX, { recursive: true });
  const r = spawnSync('npm', ['i', '--prefix', ZX, `zxing-wasm@${VERSION}`, '--no-audit', '--no-fund', '--loglevel=error'], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('npm i failed (registry? proxy?): see above'); process.exit(1); }
}
const req = createRequire(path.join(ZX, 'package.json'));
const load = (sub) => import(pathToFileURL(req.resolve(`zxing-wasm/${sub}`)).href);
const { writeBarcode } = await load('writer');
const { readBarcodes } = await load('reader');

const LF = '\n';
const data = '@' + LF + '\x1e\r' + 'ANSI 636015090002DL00410120ZT01610010' + 'DL' + LF + LF +
  `DAQ${BUYER.number}` + LF + `DCS${BUYER.last}` + LF + `DAC${BUYER.first}` + LF + 'DADNONE' + LF +
  `DBB${BUYER.dob}` + LF + `DBA${BUYER.exp}` + LF + 'DCGUSA' + LF + '\r';
const want = [`DAQ${BUYER.number}`, `DCS${BUYER.last}`, `DAC${BUYER.first}`];
const decodes = async (buf, what) => {
  const got = await readBarcodes(buf, { formats: ['PDF417'], tryHarder: true });
  const text = got[0] && got[0].text;
  const ok = !!text && want.every((w) => text.includes(w));
  if (!ok) { console.error(`CARD FAIL: the ${what} does not decode to ${want.join(' ')} (read: ${JSON.stringify(text)})`); process.exit(1); }
};

fs.mkdirSync(OUT, { recursive: true });
const r = await writeBarcode(data, { format: 'PDF417', scale: 4, options: 'columns=6' });
if (r.error) { console.error('PDF417 encode failed:', r.error); process.exit(1); }
const pdf417 = path.join(OUT, 'card-pdf417.png');
fs.writeFileSync(pdf417, Buffer.from(await r.image.arrayBuffer()));
await decodes(fs.readFileSync(pdf417), 'barcode');
const py = spawnSync('python3', [path.join(HERE, 'card', 'demo-card.py'), '--pdf417', pdf417, '--out', OUT], { stdio: 'inherit' });
if (py.status !== 0) { console.error('demo-card.py failed (python3 with PIL; scripts/setup.sh --check)'); process.exit(1); }
await decodes(fs.readFileSync(path.join(OUT, 'card-back.png')), 'back camera frame');
console.log(`CARD DECODES: ${want.join(' ')} (barcode and the back camera frame) -> ${OUT}/card-front.png, card-back.png`);
