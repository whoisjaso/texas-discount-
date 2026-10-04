// A sale's government fees, recorded from webDEALER (Government Fees screen;
// references/texas-dealer-fees.md 2 and 5.3-5.4).
//
// Usage: node gov.cjs <outDir> <width> <height> <dealPath>
//
// The figures are walk inputs, never typed in code: GOV_COUNTY, GOV_TITLE
// (33 or 28), GOV_REGISTRATION (the registration side of webDEALER's
// receipt: base and TexasSure, local fees, processing and handling, and the
// emissions fee where it applies), GOV_INSPECTION (7.50 or 0). The plate fee
// is the screen's own ($10, or $0 with GOV_EXEMPT=1). In a walk with no real
// webDEALER, take them from the rulebook's worked example (2.2) and say so.
//
// EXPECT_REFUSAL=1 first opens the bill of sale's review and presses File,
// asserting the "Record this sale's government fees" refusal and following
// its link (run the server WITHOUT DESK_ALLOW_UNSET_FACTS for this: the flag
// lifts that one refusal for demos). Then the screen is filled, saved, and
// the review is checked for the inspection and plate lines of their own.
// TRY_TITLE=28 first types a $28 title fee and asserts the county's refusal.
// DESK_BASE picks the server (default http://localhost:5190).
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at, previewCookies } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

const need = (name) => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is a walk input: pass it (the walk never invents a fee)`);
  return value;
};

(async () => {
  const [out, W, H, deal] = process.argv.slice(2);
  if (!deal) throw new Error('pass the sale: node gov.cjs <out> <w> <h> <dealPath>');
  const COUNTY = need('GOV_COUNTY');
  const TITLE = need('GOV_TITLE');
  const REGISTRATION = need('GOV_REGISTRATION');
  const INSPECTION = need('GOV_INSPECTION');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
  await ctx.addCookies(previewCookies(process.env.PREVIEW_ADMIN || 'owner:owner@example.dev'));
  await guard(ctx);
  const p = await ctx.newPage();
  const errors = []; const failures = [];
  p.on('pageerror', (e) => { errors.push(e.message.slice(0, 200)); console.log('PAGEERR', e.message.slice(0, 200)); });
  const check = (ok, what) => { console.log(ok ? `OK ${what}` : `FAILED ${what}`); if (!ok) failures.push(what); };
  let n = 0;
  const shot = async (label) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/gov-${String(n++).padStart(2, '0')}-${label}.png`, fullPage: true });
    for (const f of await p.evaluate(AUDIT)) failures.push(`${label}: contrast ${f}`);
  };
  const review = at(`${deal}/paperwork/billOfSale/review`);

  if (process.env.EXPECT_REFUSAL === '1') {
    await p.goto(review, { waitUntil: 'networkidle', timeout: 180000 });
    await p.getByRole('button', { name: /^File The Bill Of Sale$/ }).click();
    const error = p.locator('.ed-paper-error');
    await error.waitFor({ timeout: 60000 });
    const said = await error.innerText();
    check(/Record this sale's government fees from webDEALER first/.test(said), `filing is refused until the government fees are recorded :: ${said}`);
    await shot('refused-until-recorded');
    await p.locator('[data-record-government-fees]').click();
  } else {
    await p.goto(at(`${deal}/government-fees?back=${encodeURIComponent(`${deal}/paperwork/billOfSale/review`)}`), { waitUntil: 'networkidle', timeout: 180000 });
  }
  await p.locator('[data-government-fees]').waitFor({ timeout: 120000 });
  await p.waitForLoadState('networkidle').catch(() => {});
  await shot('screen');

  const choice = (label) => p.locator('.ed-pay-choice').filter({ has: p.locator('.ed-pay-choice-label', { hasText: label }) }).first();
  await p.locator('input[name=county]').fill(COUNTY);
  if (process.env.TRY_TITLE) {
    await choice(`$${Number(process.env.TRY_TITLE).toFixed(2)}`).click();
    await p.locator('input[name=registrationFee]').fill(REGISTRATION);
    await choice(`$${Number(INSPECTION).toFixed(2)}`).click();
    await p.locator('[data-government-save]').click();
    const refused = p.locator('[data-government-refusal="govTitleFeeCounty"]');
    await refused.waitFor({ timeout: 30000 }).catch(() => {});
    check((await refused.count()) === 1, `a $${process.env.TRY_TITLE} title fee is refused for ${COUNTY} County :: ${await refused.innerText().catch(() => '')}`);
    await shot('title-refused');
  }
  await choice(`$${Number(TITLE).toFixed(2)}`).click();
  await p.locator('input[name=registrationFee]').fill(REGISTRATION);
  await choice(`$${Number(INSPECTION).toFixed(2)}`).click();
  if (process.env.GOV_EXEMPT === '1') await p.locator('input[name=exemptFromRegistrationFees]').check();
  await shot('filled');
  await p.locator('[data-government-save]').click();
  await p.waitForURL((u) => !/government-fees/.test(u.pathname), { timeout: 120000 });
  await p.waitForLoadState('networkidle').catch(() => {});
  console.log('SAVED ->', p.url().replace(BASE, ''));

  // The review now carries the government lines of their own.
  if (!/paperwork\/billOfSale\/review/.test(p.url())) await p.goto(review, { waitUntil: 'networkidle', timeout: 180000 });
  const summary = (await p.locator('.ed-paper-money').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(summary.includes('Inspection Fee') && summary.includes(`$${Number(INSPECTION).toFixed(2)}`), `the review shows the inspection fee :: ${summary}`);
  check(summary.includes('Plate Fee') && summary.includes(process.env.GOV_EXEMPT === '1' ? '$0.00' : '$10.00'), 'the review shows the plate fee');
  await shot('review-with-lines');

  // And the sale page says they are recorded.
  await p.goto(at(deal), { waitUntil: 'networkidle', timeout: 180000 });
  const status = (await p.locator('[data-government-fees-status]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Government fees from webDEALER, recorded by/.test(status), `the sale page shows them recorded :: ${status}`);
  await shot('sale-page');

  console.log('PAGE ERRORS', errors.length);
  console.log('FAILURES', failures.length); for (const f of failures.slice(0, 20)) console.log('  ', f);
  await b.close();
  if (failures.length || errors.length) process.exit(1);
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
