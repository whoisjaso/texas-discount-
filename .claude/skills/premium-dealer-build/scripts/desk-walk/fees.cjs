// Your Fees after first sign-in: the settings screen, a sale keeping the fees
// it started with, a stale second tab, the OCCC filing, and the posted notice
// (Walks C, D and F; references/texas-dealer-fees.md 5.2, 5.4, 5.5).
//
// Usage: node fees.cjs <outDir> <width> <height> <openDealPath>
//
// Run after onboard.cjs saved FEE_NOW, against a server started with
// DESK_PREVIEW_MEMBER=fresh, and after `STOP_AT=document:billOfSale node
// sale.cjs ...` started <openDealPath> with nothing filed. Make the open sale
// one of the run's own scenarios (cash-balance, say) and finish it afterwards
// with RESUME_DEAL: a separate open sale on a car another scenario sells is
// two open sales on one car, which the database refuses (the preview mock
// does not). Walk inputs, never
// figures typed in code: FEE_NOW (what onboarding saved), FEE_CHANGE (the
// new fee), FEE_OVER (above $225, refused until a filing is recorded). The
// OCCC filing the walk records is labelled WALK INPUT so no screenshot can
// pass for a real one. That an open sale relying on a removed filing is
// refused at filing is walked with fee-set.cjs and try-file.cjs
// (references/verification.md, fees walk).
// DESK_BASE picks the server (default http://localhost:5190).
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at, previewCookies } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is a walk input: pass it (the walk never invents a fee)`);
  return value;
};
const money = (value) => `$${Number(value).toFixed(2)}`;

(async () => {
  const [out, W, H, openDeal] = process.argv.slice(2);
  const FEE_NOW = need('FEE_NOW');
  const FEE_CHANGE = need('FEE_CHANGE');
  const FEE_OVER = need('FEE_OVER');
  if (!openDeal) throw new Error('pass the open sale started before the change (sale.cjs with STOP_AT)');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
  await ctx.addCookies(previewCookies(process.env.PREVIEW_ADMIN || 'owner:owner@example.dev'));
  await guard(ctx);
  const errors = []; const failures = [];
  const check = (ok, what) => { console.log(ok ? `OK ${what}` : `FAILED ${what}`); if (!ok) failures.push(what); };
  const open = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { errors.push(e.message.slice(0, 200)); console.log('PAGEERR', e.message.slice(0, 200)); });
    return p;
  };
  let n = 0;
  const shot = async (p, label) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/fees-${String(n++).padStart(2, '0')}-${label}.png`, fullPage: true });
    for (const f of await p.evaluate(AUDIT)) failures.push(`${label}: contrast ${f}`);
  };
  const settings = async (p) => {
    await p.goto(at('/admin/dealership/fees'), { waitUntil: 'networkidle', timeout: 180000 });
    await p.locator('[data-fees-settings]').waitFor({ timeout: 60000 });
  };
  const changeDocFee = async (p) => {
    await p.locator('.ed-fee-change').first().click();
    await p.locator('[data-fees-screen="docFee"]').waitFor({ timeout: 30000 });
  };
  const toReviewAndSave = async (p) => {
    for (let i = 0; i < 4; i++) {
      await p.locator('[data-fees-next]').click();
      await p.waitForTimeout(250);
    }
    await p.locator('[data-fees-screen="review"]').waitFor({ timeout: 30000 });
    await p.getByRole('button', { name: 'Save Fees', exact: true }).click();
  };
  const reviewFee = async (p) => {
    await p.goto(at(`${openDeal}/paperwork/billOfSale/review`), { waitUntil: 'networkidle', timeout: 180000 });
    const line = p.locator('dt', { hasText: 'Doc Fee' }).locator('xpath=following-sibling::dd[1]');
    return (await line.first().innerText().catch(() => '')).trim();
  };

  // Walk C: the settings screen, a change on record, the open sale keeps its fee.
  const a = await open();
  await settings(a);
  const before = await a.locator('[data-dealer-charges]').innerText();
  check(before.includes(`${money(FEE_NOW)} of $225.00`), `settings shows ${money(FEE_NOW)} of $225.00 :: ${before}`);
  await shot(a, 'settings');
  const stale = await open();
  await settings(stale);

  check((await reviewFee(a)) === money(FEE_NOW), `the open sale's bill of sale review shows ${money(FEE_NOW)} before the change`);
  await settings(a);
  await changeDocFee(a);
  await a.locator('input[name=docFee]').fill(String(FEE_CHANGE));
  await shot(a, 'change-doc-fee');
  await toReviewAndSave(a);
  await a.locator('[data-fees-settings]').waitFor({ timeout: 60000 });
  await a.waitForTimeout(800);
  const history = await a.locator('[data-fee-history]').innerText().catch(() => '');
  check(history.includes(`documentary fee ${money(FEE_NOW)} to ${money(FEE_CHANGE)}`), `history records ${money(FEE_NOW)} to ${money(FEE_CHANGE)}`);
  await shot(a, 'changed-history');

  const kept = await reviewFee(a);
  check(kept === money(FEE_NOW), `the open sale keeps ${money(FEE_NOW)} after the change (shows ${kept})`);
  await shot(a, 'open-sale-keeps');
  await a.goto(at(openDeal), { waitUntil: 'networkidle', timeout: 180000 });
  const offer = a.locator('[data-apply-fees]');
  check((await offer.count()) === 1, 'the sale page offers Apply Today\'s Fees');
  await shot(a, 'apply-offered');
  await offer.getByRole('button', { name: "Apply Today's Fees" }).click();
  await a.waitForTimeout(2000);
  await a.waitForLoadState('networkidle').catch(() => {});
  check((await a.locator('[data-apply-fees]').count()) === 0, 'the offer is gone once applied');
  const applied = await reviewFee(a);
  check(applied === money(FEE_CHANGE), `the open sale shows ${money(FEE_CHANGE)} once today's fees are applied (shows ${applied})`);

  // A stale second tab is refused, never allowed to overwrite.
  await changeDocFee(stale);
  await stale.locator('input[name=docFee]').fill(String(Number(FEE_CHANGE) - 1));
  await toReviewAndSave(stale);
  const refusal = stale.locator('[data-fee-refusal="feesStale"]');
  await refusal.waitFor({ timeout: 30000 }).catch(() => {});
  check((await refusal.count()) === 1, `the stale tab is refused :: ${await refusal.innerText().catch(() => '')}`);
  await shot(stale, 'stale-refused');

  // Walk D: over $225 is refused until a complete OCCC filing is recorded.
  await settings(a);
  await changeDocFee(a);
  await a.locator('input[name=docFee]').fill(String(FEE_OVER));
  await a.locator('[data-fee-refusal="docFeeOverPresumed"]').waitFor({ timeout: 30000 });
  check(await a.locator('[data-fees-next]').isDisabled(), `${money(FEE_OVER)} without a filing is refused`);
  await shot(a, 'over-refused');
  await a.getByRole('button', { name: 'I Filed A Higher Maximum With The OCCC' }).click();
  await a.locator('input[name=occcMax]').fill(String(FEE_OVER));
  await a.locator('input[name=occcFiledOn]').fill('2026-09-01');
  await a.locator('input[name=occcEffectiveOn]').fill('2026-09-02');
  await a.locator('input[name=occcLicense]').fill('WALK INPUT');
  check((await a.locator('[data-fee-refusal="occcFilingIncomplete"]').count()) === 1, 'a filing missing its location is refused');
  await a.locator('input[name=occcLocation]').fill('WALK INPUT');
  await a.waitForTimeout(300);
  check((await a.locator('[data-fee-refusal]').count()) === 0, `${money(FEE_OVER)} is accepted with a complete filing`);
  await shot(a, 'occc-filing');
  await toReviewAndSave(a);
  await a.locator('[data-fees-settings]').waitFor({ timeout: 60000 });
  await a.waitForTimeout(800);
  const filed = await a.locator('[data-dealer-charges]').innerText();
  check(filed.includes(`${money(FEE_OVER)} of ${money(FEE_OVER)}`), `the limit is the filed maximum :: ${filed}`);
  await shot(a, 'occc-saved');

  // And back under the presumed limit, the filing removed.
  await changeDocFee(a);
  await a.getByRole('button', { name: 'I Filed A Higher Maximum With The OCCC' }).click();
  await a.locator('[data-fee-refusal="docFeeOverPresumed"]').waitFor({ timeout: 30000 });
  await a.locator('input[name=docFee]').fill(String(FEE_CHANGE));
  await toReviewAndSave(a);
  await a.locator('[data-fees-settings]').waitFor({ timeout: 60000 });

  // Walk F: the posted notice.
  await a.goto(at('/admin/dealership/fees/notice'), { waitUntil: 'networkidle', timeout: 180000 });
  const notice = await a.locator('[data-posted-notice]').innerText();
  check(/A DOCUMENTARY FEE IS NOT AN OFFICIAL FEE\. A DOCUMENTARY FEE IS NOT REQUIRED BY LAW, BUT MAY BE CHARGED/.test(notice), 'the posted notice prints the English notice word for word');
  check(/UN CARGO DOCUMENTAL NO ES UN CARGO OFICIAL\./.test(notice), 'the posted notice prints the approved Spanish notice');
  await shot(a, 'posted-notice');

  console.log('PAGE ERRORS', errors.length);
  console.log('FAILURES', failures.length); for (const f of failures.slice(0, 20)) console.log('  ', f);
  await b.close();
  if (failures.length || errors.length) process.exit(1);
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
