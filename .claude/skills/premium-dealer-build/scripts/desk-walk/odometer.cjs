// The mileage statement on a sale nobody has answered, and the way to its reading.
// Usage: node odometer.cjs <outDir> <dealPath> <width> <height>
//   EXPECT_MILES=<printed reading, e.g. 100,000> or EXPECT_MILES=none (the car has no reading)
//   DOC=billOfSale (default) or salvageBillOfSale
//   FIXIT=1 (with EXPECT_MILES=none): the bill of sale review's Fix It beside the blank mileage
//     must open the reading question, and the old link target (/admin/inventory/<car>) must be
//     the desk's own not-found page with the way back to Handle A Sale.
// The statement must open with no card pressed, under the reading it swears to (English and
// Spanish); with no reading, no card can be tapped and the screen offers Enter The Reading.
// Prints THEME OK, PAGE ERRORS 0, CONTRAST FAILURES 0 and ODOMETER WALK OK, or ODOMETER WALK
// FAILED (n) and exits 1. It answers nothing: run it before the sale walk taps the statement.
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { guard, at, previewCookies, assertTheme } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

(async () => {
  const [out, deal, W, H] = process.argv.slice(2);
  const doc = process.env.DOC || 'billOfSale';
  const miles = process.env.EXPECT_MILES;
  if (!out || !deal || !W || !H || !miles) {
    console.error('usage: EXPECT_MILES=<n,nnn|none> node odometer.cjs <outDir> <dealPath> <w> <h>');
    process.exit(2);
  }
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
  await ctx.addCookies(previewCookies(process.env.PREVIEW_ADMIN || 'owner:owner@example.dev'));
  await guard(ctx);
  const p = await ctx.newPage();
  const errors = [];
  const contrast = [];
  const problems = [];
  p.on('pageerror', (e) => { errors.push(e.message.slice(0, 200)); console.log('PAGEERR', e.message.slice(0, 200)); });
  const check = (ok, what) => { console.log(`${ok ? 'CHECK OK' : 'CHECK FAILED'} ${what}`); if (!ok) problems.push(what); };
  let n = 0;
  const shot = async (label) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/odometer-${String(n).padStart(2, '0')}-${label}.png`, fullPage: true }); n++;
    for (const f of await p.evaluate(AUDIT)) contrast.push(`${label}: ${f}`);
  };
  const settle = async () => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(1200); };
  const statementUrl = at(`${deal}/paperwork/${doc}/odometerStatus`);
  const readingHref = `${deal}/paperwork/${doc}/odometerReading?change=odometerReading`;

  // The cards' state, read off the screen.
  const cards = () => p.evaluate(() => [...document.querySelectorAll('.ed-pay-row button')].map((el) => ({
    label: el.textContent.trim(), pressed: el.getAttribute('aria-pressed'), active: el.getAttribute('data-active'), disabled: el.disabled,
  })));
  const language = async (code) => {
    await p.locator('[aria-label="Language"] button', { hasText: new RegExp(`^${code}$`) }).first().click();
    await p.waitForTimeout(900);
  };

  await p.goto(statementUrl, { waitUntil: 'networkidle', timeout: 180000 });
  await settle();
  await assertTheme(p);
  check(/\/odometerStatus$/.test(p.url()), `the statement opens (${p.url()})`);
  const heading = (await p.locator('h1').first().innerText()).trim();
  check(heading === 'Is That The Real Mileage?', `heading "${heading}"`);
  const before = await cards();
  console.log('CARDS', JSON.stringify(before));
  check(before.length === 3, `three statement cards (${before.length})`);
  check(before.every((c) => c.pressed === 'false' && c.active === null), 'no card pressed (aria-pressed false, no data-active)');
  const line = (await p.locator('[data-odometer-reading]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  console.log('READING', JSON.stringify(line));
  if (miles === 'none') {
    check(before.every((c) => c.disabled), 'no card can be tapped without a reading');
    const link = p.getByRole('link', { name: 'Enter The Reading', exact: true });
    check((await link.count()) === 1, 'Enter The Reading offered');
    check((await link.first().getAttribute('href')) === readingHref, 'Enter The Reading opens the reading question');
  } else {
    check(line.startsWith(`The odometer reads ${miles} miles.`), `the reading shown: "${line}"`);
    check(before.every((c) => !c.disabled), 'the cards can be tapped');
    check((await p.getByRole('link', { name: 'Change The Reading', exact: true }).count()) === 1, 'Change The Reading offered');
  }
  await shot('statement-en');

  await language('ES');
  const es = (await p.locator('[data-odometer-reading]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  console.log('READING ES', JSON.stringify(es));
  if (miles === 'none') check(/Escribir la lectura/.test(es), `Spanish: "${es}"`);
  else check(es.startsWith(`El odómetro marca ${miles} millas.`), `Spanish: "${es}"`);
  check((await cards()).every((c) => c.pressed === 'false'), 'no card pressed in Spanish either');
  await shot('statement-es');
  await language('EN');

  if (miles === 'none') {
    await p.getByRole('link', { name: 'Enter The Reading', exact: true }).first().click();
    await p.waitForURL(/\/odometerReading/, { timeout: 60000 }).catch(() => {});
    await settle();
    const h = (await p.locator('h1').first().innerText()).trim();
    check(h === 'What Does The Odometer Read?', `Enter The Reading lands on "${h}"`);
    check((await p.locator('main input').first().inputValue()) === '', 'the reading box opens empty');
    await shot('reading-question');

    if (process.env.FIXIT === '1') {
      await p.goto(at(`${deal}/paperwork/${doc}/review`), { waitUntil: 'networkidle', timeout: 180000 });
      await settle();
      const row = p.locator('[data-row="vehicleMileage"]').first();
      check((await row.getAttribute('data-status')) === 'missing', 'the review marks the mileage missing');
      const fix = row.getByRole('link', { name: /^Fix it$/i });
      const href = await fix.getAttribute('href').catch(() => null);
      console.log('FIX IT', href);
      check(href === readingHref, `Fix It names the reading question (${href})`);
      await row.scrollIntoViewIfNeeded().catch(() => {});
      await shot('review-fixit');
      await fix.click();
      await p.waitForURL(/\/odometerReading/, { timeout: 60000 }).catch(() => {});
      await settle();
      const h2 = (await p.locator('h1').first().innerText()).trim();
      check(h2 === 'What Does The Odometer Read?', `Fix It lands on "${h2}"`);
      await shot('fixit-target');
      // The old target: no such page, answered by the desk's own not-found page.
      const car = process.env.CAR_ID || 'preview-vehicle-truck-1';
      await p.goto(at(`/admin/inventory/${car}`), { waitUntil: 'networkidle', timeout: 180000 });
      await settle();
      const h3 = (await p.locator('h1').first().innerText().catch(() => '')).trim();
      check(h3 === 'This Page Is Not On The Desk', `the old link's page reads "${h3}"`);
      check((await p.getByRole('link', { name: 'Back To Handle A Sale', exact: true }).first().getAttribute('href')) === '/admin/sales', 'the way back to Handle A Sale');
      await assertTheme(p);
      await shot('old-link-not-found');
    }
  }

  console.log('PAGE ERRORS', errors.length);
  console.log('CONTRAST FAILURES', contrast.length); for (const f of [...new Set(contrast)].slice(0, 15)) console.log('  ', f);
  const failed = errors.length + contrast.length + problems.length;
  console.log(failed ? `ODOMETER WALK FAILED (${failed})` : 'ODOMETER WALK OK');
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
