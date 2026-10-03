// Set the documentary fee under Your Fees, with or without an OCCC filing.
//
// Usage: node fee-set.cjs <outDir> <width> <height>
//
// Walk inputs, never figures typed in code: FEE (dollars). FILING=1 records
// an OCCC filing whose maximum is FEE, filed FILED_ON and in effect
// EFFECTIVE_ON (both on or before today), labelled WALK INPUT; FILING=0 takes
// a recorded filing off (FEE must then be $225.00 or less). Used to start a
// sale under a filed maximum and then remove the filing, so the filing of
// that open sale is refused (references/texas-dealer-fees.md 5.4).
// DESK_BASE picks the server (default http://localhost:5190).
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { guard, at, previewCookies } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is a walk input: pass it (the walk never invents a fee)`);
  return value;
};

(async () => {
  const [out, W, H] = process.argv.slice(2);
  const FEE = need('FEE');
  const FILING = need('FILING');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
  await ctx.addCookies(previewCookies(process.env.PREVIEW_ADMIN || 'owner:owner@example.dev'));
  await guard(ctx);
  const p = await ctx.newPage();
  const errors = []; const failures = [];
  p.on('pageerror', (e) => { errors.push(e.message.slice(0, 200)); console.log('PAGEERR', e.message.slice(0, 200)); });
  const shot = async (label) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/fee-set-${label}.png`, fullPage: true });
    for (const f of await p.evaluate(AUDIT)) failures.push(`${label}: contrast ${f}`);
  };

  await p.goto(at('/admin/dealership/fees'), { waitUntil: 'networkidle', timeout: 180000 });
  await p.locator('[data-fees-settings]').waitFor({ timeout: 60000 });
  await p.locator('.ed-fee-change').first().click();
  await p.locator('[data-fees-screen="docFee"]').waitFor({ timeout: 30000 });
  const toggle = p.getByRole('button', { name: 'I Filed A Higher Maximum With The OCCC' });
  const open = (await toggle.getAttribute('aria-pressed')) === 'true';
  if (FILING === '1') {
    if (!open) await toggle.click();
    await p.locator('input[name=occcMax]').fill(FEE);
    await p.locator('input[name=occcFiledOn]').fill(need('FILED_ON'));
    await p.locator('input[name=occcEffectiveOn]').fill(need('EFFECTIVE_ON'));
    await p.locator('input[name=occcLicense]').fill('WALK INPUT');
    await p.locator('input[name=occcLocation]').fill('WALK INPUT');
  } else if (open) {
    await toggle.click();
  }
  await p.locator('input[name=docFee]').fill(FEE);
  await p.waitForTimeout(300);
  const refused = await p.locator('[data-fee-refusal]').count();
  if (refused) failures.push(`refused: ${await p.locator('[data-fee-refusal]').first().innerText()}`);
  await shot(`doc-fee-${FEE}-filing-${FILING}`);
  for (let i = 0; i < 4; i++) {
    await p.locator('[data-fees-next]').click();
    await p.waitForTimeout(250);
  }
  await p.locator('[data-fees-screen="review"]').waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: 'Save Fees', exact: true }).click();
  await p.locator('[data-fees-settings]').waitFor({ timeout: 60000 });
  await p.waitForTimeout(800);
  console.log('NOW', (await p.locator('[data-dealer-charges]').innerText()).replace(/\s+/g, ' '));
  await shot(`saved-${FEE}-filing-${FILING}`);

  console.log('PAGE ERRORS', errors.length);
  console.log('FAILURES', failures.length); for (const f of failures.slice(0, 20)) console.log('  ', f);
  await b.close();
  if (failures.length || errors.length) process.exit(1);
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
