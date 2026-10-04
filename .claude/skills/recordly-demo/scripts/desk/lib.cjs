// Shared by the off-camera desk helpers (scripts/desk/*.cjs). Everything comes from the environment (source demo.env):
//   PWPATH       Playwright's package dir (default: $(npm root -g)/playwright)
//   CHROME_PATH  the chromium the walks drive (default: the first under $PLAYWRIGHT_BROWSERS_PATH or /opt/pw-browsers)
//   PDB          premium-dealer-build (default: the skill beside this one); its desk-walk/desk-base.cjs keeps every walk
//                on DESK_BASE (default http://localhost:5190) and refuses any other local server
//   DESK_COOKIE  the preview session: owner@example.dev (an owner) or sales:sales@example.dev (a salesperson); the
//                runbook sets it from client-inputs.json → partB.onboarding
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILL = path.resolve(__dirname, '..', '..');
const PDB = process.env.PDB || path.resolve(SKILL, '..', 'premium-dealer-build');
const deskBase = require(path.join(PDB, 'scripts', 'desk-walk', 'desk-base.cjs'));
const { penPlan } = require(path.join(SKILL, 'scripts', 'capture.cjs'));

function playwright() {
  const p = process.env.PWPATH || path.join(execSync('npm root -g').toString().trim(), 'playwright');
  return require(p);
}
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const d = fs.existsSync(root) ? fs.readdirSync(root).find((n) => /^chromium-\d+$/.test(n)) : null;
  return d ? path.join(root, d, 'chrome-linux', 'chrome') : undefined;
}
const COOKIE = () => process.env.DESK_COOKIE || 'owner@example.dev';

/** A browser and a page on DESK_BASE with the preview session cookie and the walk guard. */
async function open({ width = 1440, height = 900, cookie = COOKIE(), touch = false } = {}) {
  const { chromium } = playwright();
  const browser = await chromium.launch({ executablePath: chromePath() });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch });
  if (cookie) await ctx.addCookies(deskBase.previewCookies(cookie));
  await deskBase.guard(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 200)));
  return { browser, ctx, page };
}

/** Read a strokes file (assets/sig/*.json): { w, h, inkSec, liftSec, strokes: [[[x, y], …], …] } in pad px. */
function strokes(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(j.strokes) || !j.w || !j.h) throw new Error(`${file}: not a strokes file ({ w, h, strokes })`);
  return j;
}

/**
 * Draw a signature into a canvas the way a hand does: capture.cjs's pen engine (penPlan), 180 samples a second of pen
 * time, one pointer move per 17 ms (the desk's pad keeps one move per 16 ms). Never a sine wave: it prints on paper.
 */
async function drawStrokes(page, canvas, sig) {
  await canvas.scrollIntoViewIfNeeded();
  const bx = await canvas.boundingBox();
  const s = Math.min(bx.width / sig.w, bx.height / sig.h);
  const ox = bx.x + (bx.width - sig.w * s) / 2, oy = bx.y + (bx.height - sig.h * s) / 2;
  const plan = penPlan(sig.strokes, { inkSec: sig.inkSec || 1.5, liftSec: sig.liftSec ?? 0.14 });
  let down = false;
  for (let t = 0; t <= plan.total + 1e-6; t += 1 / 180) {
    const q = plan.at(t);
    await page.mouse.move(ox + q.x * s, oy + q.y * s);
    if (q.down && !down) { await page.mouse.down(); down = true; }
    else if (!q.down && down) { await page.mouse.up(); down = false; }
    await page.waitForTimeout(17);
  }
  if (down) await page.mouse.up();
}

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const die = (msg) => { console.error('FAIL', msg); process.exit(1); };

module.exports = { SKILL, PDB, ...deskBase, playwright, chromePath, open, strokes, drawStrokes, arg, die, COOKIE };
