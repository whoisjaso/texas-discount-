// First sign-in for the preview member: sign in on the form, then onboarding.
// Usage: node onboard.cjs <outDir> <width> <height> <First> <Last> [cleared|cannot-sign]
//
// Run against a server started with DESK_PREVIEW_MEMBER=fresh (or
// fresh-temporary-password / fresh-reset, which add Choose A Password first).
// The member's row then carries the typed name and signature for the rest of
// that server's life, which is what a void needs: the record names who voided.
// DESK_BASE picks the server (default http://localhost:5190).
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

const NEW_PASSWORD = process.env.NEW_PASSWORD || 'a preview password of mine';

(async () => {
  const [out, W, H, first, last, mode = 'cleared'] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
  await guard(ctx);
  const p = await ctx.newPage();
  const errors = []; const failures = [];
  p.on('pageerror', (e) => { errors.push(e.message.slice(0, 200)); console.log('PAGEERR', e.message.slice(0, 200)); });
  let n = 0;
  const shot = async (label) => {
    await p.waitForTimeout(800);
    const h1 = (await p.locator('h1').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    await p.screenshot({ path: `${out}/onboard-${String(n++).padStart(2, '0')}-${label}.png`, fullPage: true });
    const bad = await p.evaluate(AUDIT);
    for (const f of bad) failures.push(label + ': ' + f);
    console.log(`SHOT ${label} :: ${p.url().replace(BASE, '')} :: h1="${h1}" :: contrast=${bad.length}`);
  };
  const question = () => p.locator('h1#onboarding-question');

  await p.goto(at('/admin/sales'), { waitUntil: 'networkidle', timeout: 180000 });
  console.log('NO SESSION ->', p.url().replace(BASE, ''));
  await shot('sign-in');
  await p.locator('input#email').fill('owner@example.dev');
  await p.locator('input#password').fill('preview-only');
  await p.getByRole('button', { name: 'Sign In', exact: true }).click();
  await p.waitForURL(/\/admin\/account\/onboarding/, { timeout: 120000 });
  await p.waitForLoadState('networkidle').catch(() => {});
  await question().waitFor({ timeout: 60000 });

  if (/Choose A Password/.test(await question().innerText())) {
    await shot('password');
    await p.locator('input[name=password]').fill(NEW_PASSWORD);
    await p.locator('input[name=confirmPassword]').fill(NEW_PASSWORD);
    await p.getByRole('button', { name: 'Save Password', exact: true }).click();
    await question().filter({ hasNotText: 'Choose A Password' }).waitFor({ timeout: 60000 });
    console.log('PASSWORD CHOSEN ->', p.url().replace(BASE, ''));
  }

  await p.locator('input[name=firstName]').fill(first);
  await p.locator('input[name=lastName]').fill(last);
  await shot('name');
  await p.getByRole('button', { name: 'Next', exact: true }).click();
  await question().filter({ hasText: mode === 'cleared' ? 'Draw Your Signature' : 'You Are All Set' }).waitFor({ timeout: 60000 });
  if (mode === 'cleared') {
    const c = p.locator('canvas').first();
    await c.scrollIntoViewIfNeeded();
    const bx = await c.boundingBox();
    await p.mouse.move(bx.x + bx.width * 0.12, bx.y + bx.height * 0.62); await p.mouse.down();
    for (let k = 0; k <= 36; k++) await p.mouse.move(bx.x + bx.width * (0.12 + k * 0.02), bx.y + bx.height * (0.6 - 0.28 * Math.sin(k / 3)));
    await p.mouse.up();
    await shot('signature');
    await p.getByRole('button', { name: 'Save Signature', exact: true }).click();
    await question().filter({ hasText: 'You Are All Set' }).waitFor({ timeout: 60000 });
  }
  await shot('done');
  await p.getByRole('button', { name: 'Start Working', exact: true }).click();
  await p.waitForURL((u) => !/onboarding/.test(u.pathname), { timeout: 120000 });
  await p.waitForLoadState('networkidle').catch(() => {});
  console.log('AFTER START WORKING ->', p.url().replace(BASE, ''));
  await shot('handle-a-sale');
  console.log('PAGE ERRORS', errors.length);
  console.log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 15)) console.log('  ', f);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
