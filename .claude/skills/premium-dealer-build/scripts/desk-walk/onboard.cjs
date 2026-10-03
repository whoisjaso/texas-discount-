// First sign-in for the preview member: sign in on the form, then onboarding.
// Usage: node onboard.cjs <outDir> <width> <height> <First> <Last> [cleared|cannot-sign]
//
// Run against a server started with DESK_PREVIEW_MEMBER=fresh (or
// fresh-temporary-password / fresh-reset, which add Choose A Password first).
// The member's row then carries the typed name and signature for the rest of
// that server's life, which is what a void needs: the record names who voided.
// DESK_BASE picks the server (default http://localhost:5190).
//
// The preview owner also meets Your Fees (after the signature, before Done;
// references/texas-dealer-fees.md 5.2). The walk never invents a doc fee, so
// it is a walk input: FEES=<dollars> (the owner's real figure, or one the
// user approved, labelled as a demo input) or FEES=later (Set These Later).
// FEES_TRY=225.01[,...] types each figure first and asserts the refusal, in
// English and then Spanish (the language toggle), before the real one.
// A salesperson (DESK_PREVIEW_MEMBER=fresh-sales, PREVIEW_ADMIN=sales:<email>)
// never meets the step; with FEES=none the walk asserts that, and that
// /admin/dealership/fees is refused to the member afterwards. PREVIEW_ADMIN
// sets the preview session cookie directly (the sign-in form always signs
// the preview in as an owner).
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at, previewCookies } = require('./desk-base.cjs');
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

  if (process.env.PREVIEW_ADMIN) {
    await ctx.addCookies(previewCookies(process.env.PREVIEW_ADMIN));
    await p.goto(at('/admin/sales'), { waitUntil: 'networkidle', timeout: 180000 });
    console.log(`PREVIEW SESSION ${process.env.PREVIEW_ADMIN} ->`, p.url().replace(BASE, ''));
  } else {
    await p.goto(at('/admin/sales'), { waitUntil: 'networkidle', timeout: 180000 });
    console.log('NO SESSION ->', p.url().replace(BASE, ''));
    await shot('sign-in');
    await p.locator('input#email').fill('owner@example.dev');
    await p.locator('input#password').fill('preview-only');
    await p.getByRole('button', { name: 'Sign In', exact: true }).click();
  }
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
  }

  // Your Fees, or straight to Done.
  const fees = p.locator('h1#fees-question');
  const done = question().filter({ hasText: 'You Are All Set' });
  await Promise.race([fees.waitFor({ timeout: 60000 }), done.waitFor({ timeout: 60000 })]);
  const FEES = process.env.FEES;
  if (await fees.isVisible().catch(() => false)) {
    if (FEES === 'none') throw new Error('Your Fees was shown to a member who should never see it');
    if (!FEES) throw new Error('Your Fees is on screen: pass FEES=<dollars> or FEES=later (the walk never invents a doc fee)');
    await walkFees(p, shot, FEES);
  } else if (FEES && FEES !== 'none') {
    throw new Error('FEES was given but the Your Fees step never appeared (an owner with no saved fees should see it)');
  }
  await done.waitFor({ timeout: 60000 });
  await shot('done');
  await p.getByRole('button', { name: 'Start Working', exact: true }).click();
  await p.waitForURL((u) => !/onboarding/.test(u.pathname), { timeout: 120000 });
  await p.waitForLoadState('networkidle').catch(() => {});
  console.log('AFTER START WORKING ->', p.url().replace(BASE, ''));
  await shot('handle-a-sale');
  if (FEES === 'none') {
    await p.goto(at('/admin/dealership/fees'), { waitUntil: 'networkidle', timeout: 180000 });
    const shown = await p.locator('[data-fees-settings]').count();
    console.log(`YOUR FEES PAGE FOR THIS MEMBER -> ${p.url().replace(BASE, '')} :: settings shown=${shown}`);
    if (shown) { console.log('FAILED /admin/dealership/fees opened for a member without admin:all'); process.exitCode = 1; }
    await shot('fees-refused');
  }
  console.log('PAGE ERRORS', errors.length);
  console.log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 15)) console.log('  ', f);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });

/**
 * The six Your Fees screens: finance contracts, the documentary fee (each
 * FEES_TRY figure refused in both languages first), deputy, inventory tax,
 * Ch. 345, then the review and Save Fees. Every yes/no is answered No: the
 * walk records no OCCC filing, deputy status or inventory tax it was not
 * given. FEES=later presses Set These Later on the first screen instead.
 */
async function walkFees(p, shot, FEES) {
  const choice = (label) =>
    p.locator('.ed-pay-choice').filter({ has: p.locator('.ed-pay-choice-label', { hasText: new RegExp(`^${label}$`) }) }).first();
  const next = () => p.locator('[data-fees-next]');
  const screen = async (name) => {
    await p.locator(`[data-fees-screen="${name}"]`).waitFor({ timeout: 60000 });
  };
  await screen('finance');
  await shot('fees-finance');
  if (FEES === 'later') {
    await p.locator('[data-fees-later]').click();
    return;
  }
  await choice('No').click();
  await next().click();

  await screen('docFee');
  const box = p.locator('input[name=docFee]');
  for (const tryFee of (process.env.FEES_TRY || '').split(',').map((v) => v.trim()).filter(Boolean)) {
    await box.fill(tryFee);
    const refusal = p.locator('[data-fee-refusal]');
    await refusal.waitFor({ timeout: 30000 });
    const said = await refusal.innerText();
    if (!(await next().isDisabled())) throw new Error(`Next stayed enabled at ${tryFee}`);
    console.log(`REFUSED ${tryFee} (EN) :: ${said}`);
    await shot(`fees-refused-${tryFee}-en`);
    await p.getByRole('button', { name: 'ES', exact: true }).first().click();
    await p.waitForTimeout(500);
    console.log(`REFUSED ${tryFee} (ES) :: ${await p.locator('[data-fee-refusal]').innerText()}`);
    await shot(`fees-refused-${tryFee}-es`);
    await p.getByRole('button', { name: 'EN', exact: true }).first().click();
    await p.waitForTimeout(500);
  }
  await box.fill(FEES);
  await p.waitForTimeout(400);
  if (await p.locator('[data-fee-refusal]').count()) throw new Error(`the doc fee ${FEES} was refused: ${await p.locator('[data-fee-refusal]').innerText()}`);
  await p.locator('[data-notice-preview]').waitFor({ timeout: 30000 });
  await shot('fees-doc-fee');
  await next().click();

  for (const name of ['deputy', 'vit', 'ch345']) {
    await screen(name);
    await choice('No').click();
    await shot(`fees-${name}`);
    await next().click();
  }

  await screen('review');
  const line = await p.locator('[data-dealer-charges]').innerText();
  console.log('REVIEW ::', line);
  await shot('fees-review');
  await p.getByRole('button', { name: 'Save Fees', exact: true }).click();
}
