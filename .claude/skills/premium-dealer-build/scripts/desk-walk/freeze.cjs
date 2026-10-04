// Once the bill of sale is filed, every held screen refuses a change.
// Usage: node freeze.cjs <outDir> <dealPath> <width> <height>
//
// Run on a deal whose bill of sale is filed (sale.cjs first), NOT on the deal
// you mean to void: nothing here types a plate, but keep the two apart. For
// each held screen: the held note shows; a change is refused with the bill of
// sale's sentence, in English and then in Spanish; a reload shows the answer
// unchanged. DESK_BASE picks the server (default http://localhost:5190).
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at, previewCookies } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

// Screen, and the control that would change it. Chosen by position, not by
// label, so the same act works with the screen in English or in Spanish.
const SCREENS = [
  // Cash deal: the second payment choice (buy here pay here).
  { step: 'funding', act: (p) => p.locator('.ed-pay-choice').nth(1).click() },
  // "We do" is filed; the second choice is the customer.
  { step: 'plan:registration', act: (p) => p.locator('.ed-plan-choice').nth(1).click() },
  // "Yes, shown today" is filed; the second choice is no.
  { step: 'plan:insurance', act: (p) => p.locator('.ed-plan-choice').nth(1).click() },
  // The amount of the deal.
  {
    step: 'paid',
    act: async (p) => {
      await p.locator('main input').first().fill('12345');
      await p.locator('main button.ed-btn-dark, main button[type=submit]').first().click();
    },
  },
];

(async () => {
  const [out, deal, W, H] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
  await ctx.addCookies(previewCookies(process.env.PREVIEW_ADMIN || 'owner:owner@example.dev'));
  await guard(ctx);
  const p = await ctx.newPage();
  const errors = []; const failures = [];
  p.on('pageerror', (e) => { errors.push(e.message.slice(0, 200)); console.log('PAGEERR', e.message.slice(0, 200)); });
  let n = 0;
  const shot = async (label) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/freeze-${String(n++).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true });
    for (const f of await p.evaluate(AUDIT)) failures.push(label + ': ' + f);
  };
  const alert = async () => ((await p.locator('[role=alert]:not(#__next-route-announcer__)').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  const answer = async () => ((await p.locator('.ed-guide-answer').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 160);

  for (const screen of SCREENS) {
    for (const lang of ['EN', 'ES']) {
      await p.goto(at(`${deal}/guide/${encodeURIComponent(screen.step)}?from=summary`), { waitUntil: 'networkidle', timeout: 180000 });
      const toggle = p.locator('.ed-funnel-lang button', { hasText: lang }).first();
      if (await toggle.count()) { await toggle.click(); await p.waitForTimeout(500); }
      const before = await answer();
      const held = await p.locator('[data-held-by-bill-of-sale]').count();
      await screen.act(p).catch((e) => console.log('ACT FAILED', screen.step, e.message.split('\n')[0]));
      await p.waitForTimeout(2500);
      const said = await alert();
      await shot(`${screen.step}-${lang}`);
      await p.reload({ waitUntil: 'networkidle' });
      const after = await answer();
      console.log(`${screen.step} ${lang} :: held note ${held} :: refused ${JSON.stringify(said)} :: unchanged ${before === after}`);
    }
  }
  // Back to English for the next walk.
  const en = p.locator('.ed-funnel-lang button', { hasText: 'EN' }).first();
  if (await en.count()) await en.click();

  console.log('PAGE ERRORS', errors.length);
  console.log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 10)) console.log('  ', f);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
