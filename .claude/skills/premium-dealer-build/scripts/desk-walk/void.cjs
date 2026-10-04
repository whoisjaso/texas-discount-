// Void the filed bill of sale from the packet, then change the down payment.
// Usage: node void.cjs <outDir> <dealPath> <width> <height> [oldSigningUrlFile]
//
// PREVIEW_ADMIN=sales:sales@example.dev (any role but owner or manager): checks
// the Void control is disabled with the who-can line, and stops.
// As owner or manager: opens the dialog, types the reason, answers Not Yet,
// holds to void, then checks the summary banner, the packet's notice, the
// "Waiting For The New Copies" heading and Voided Copies; tries the old signing
// link (oldSigningUrlFile, written by ceremony.cjs) and its buyer document
// route; and, with NEW_DOWN set, saves that Down today on the price step.
// The void needs the voider's roster row: run the server with
// DESK_PREVIEW_MEMBER=fresh and onboard first (onboard.cjs).
// VOID_LANG=es switches the desk to Spanish (the ES toggle) before the packet
// is read, and answers the dialog with its Spanish labels.
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at, previewCookies } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

const REASON = process.env.VOID_REASON || 'The down payment was 2000, not 1500, so the figures change';
const ES = process.env.VOID_LANG === 'es';
const NOT_YET = ES ? 'Todavía No' : 'Not Yet';
const HOLD = ES ? /Mantén Para Anular/ : /Hold To Void/;

(async () => {
  const [out, deal, W, H, oldUrlFile] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
  const role = process.env.PREVIEW_ADMIN || 'owner:owner@example.dev';
  await ctx.addCookies(previewCookies(role));
  await guard(ctx);
  const p = await ctx.newPage();
  const errors = [];
  const failures = [];
  p.on('pageerror', (e) => { errors.push(e.message.slice(0, 200)); console.log('PAGEERR', e.message.slice(0, 200)); });
  let n = 0;
  const shot = async (label, page = p) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/void-${String(n++).padStart(2, '0')}-${label}.png`, fullPage: true });
    for (const f of await page.evaluate(AUDIT)) failures.push(label + ': ' + f);
  };
  const text = async (locator) => ((await locator.first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

  // The desk's own language toggle, when the walk is in Spanish.
  const spanish = async () => {
    if (!ES) return;
    const t = p.locator('.ed-funnel-lang button', { hasText: 'ES' }).first();
    if (await t.count()) { await t.click(); await p.waitForTimeout(800); }
  };
  if (process.env.ONLY_NEW_DOWN) return newDown();
  await p.goto(at(deal + '/packet'), { waitUntil: 'networkidle', timeout: 180000 });
  await spanish();
  await shot('packet-before');
  const control = p.locator('[data-void-control]').first();
  console.log('VOID CONTROL', await control.count(), 'disabled', await control.isDisabled().catch(() => null));

  if (!/^(owner|manager):/.test(role)) {
    console.log('WHO CAN', JSON.stringify(await text(p.locator('.ed-void-who'))));
    console.log('PAGE ERRORS', errors.length);
    console.log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 10)) console.log('  ', f);
    await b.close();
    return;
  }

  // The dialog: read back, reason, title question, hold.
  await control.click();
  const dialog = p.locator('dialog.ed-void-ask');
  await dialog.waitFor({ state: 'visible', timeout: 30000 });
  console.log('DIALOG', JSON.stringify(await text(dialog.locator('h2'))));
  console.log('VOIDED WITH', JSON.stringify((await dialog.locator('.ed-void-list').first().innerText()).replace(/\s+/g, ' ')));
  console.log('FOCUSED', JSON.stringify(await p.evaluate(() => document.activeElement && document.activeElement.textContent)));
  await shot('dialog-open');
  await dialog.locator('textarea').fill(REASON);
  await dialog.getByText(NOT_YET, { exact: true }).click();
  await shot('dialog-ready');
  const hold = dialog.getByRole('button', { name: HOLD }).last();
  const box = await hold.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down(); await p.waitForTimeout(1700); await p.mouse.up();
  await p.waitForURL((u) => !/\/packet/.test(u.pathname), { timeout: 90000 });
  await p.waitForLoadState('networkidle').catch(() => {});
  console.log('AFTER VOID ->', p.url().replace(BASE, ''));
  console.log('SUMMARY BANNER', JSON.stringify(await text(p.locator('[data-void-banner]'))));
  await shot('summary-banner');

  // The packet now: the notice, the waiting heading, the voided copies.
  await p.goto(at(deal + '/packet'), { waitUntil: 'networkidle', timeout: 180000 });
  await spanish();
  console.log('PROGRESS', JSON.stringify(await text(p.locator('.packet-progress'))));
  console.log('NOTICE', JSON.stringify(await text(p.locator('[data-void-notice]'))));
  const copies = p.locator('[data-voided-copies]');
  console.log('VOIDED COPIES', await copies.getAttribute('data-voided-copies').catch(() => null));
  await copies.locator('summary').click().catch(() => {});
  console.log('VOIDED LINE', JSON.stringify(await text(copies.locator('.ed-void-line'))));
  await shot('packet-after');
  const voidedIds = await copies.locator('a[href*="/api/documents/agreements/"]').evaluateAll((as) =>
    [...new Set(as.map((a) => (a.getAttribute('href').match(/agreements\/([^/]+)\/pdf/) || [])[1]).filter(Boolean))],
  );
  fs.writeFileSync(`${out}/voided-ids.txt`, voidedIds.join('\n'));

  // The old signing link: replaced, in both languages, and its buyer route 410.
  if (oldUrlFile && fs.existsSync(oldUrlFile)) {
    const oldUrl = at(fs.readFileSync(oldUrlFile, 'utf8').trim());
    const buyer = await ctx.newPage();
    await buyer.goto(oldUrl, { waitUntil: 'networkidle', timeout: 120000 });
    console.log('OLD LINK', JSON.stringify(await text(buyer.locator('body'))).slice(0, 300));
    await shot('old-link', buyer);
    const token = (oldUrl.match(/\/sign\/packet\/([^/?#]+)/) || [])[1];
    if (token && voidedIds[0]) {
      const r = await ctx.request.get(at(`/api/sign/packet/${token}/documents/${voidedIds[0]}`));
      console.log('OLD LINK BUYER ROUTE', r.status(), JSON.stringify(await r.json().catch(() => null)));
    }
    await buyer.close();
  }

  // Change what needed changing: Down today on the price step.
  async function newDown() {
    await p.goto(at(deal + '/guide/price?from=summary'), { waitUntil: 'networkidle', timeout: 180000 });
    await shot('price-step');
    // "No: tax and fees go on top", whose stage then asks Down today.
    const no = p.getByRole('button', { name: /^No\b/ });
    if (await no.count()) { await no.first().click(); await p.waitForTimeout(600); }
    await p.locator('.ed-money-adjust-field input').first().fill(process.env.NEW_DOWN);
    await p.getByRole('button', { name: 'Next', exact: true }).first().click();
    await p.waitForTimeout(2500);
    await p.waitForLoadState('networkidle').catch(() => {});
    // Not Next's route announcer, which is also role=alert and reads the page title.
    const refusal = await text(p.locator('[role=alert]:not(#__next-route-announcer__)'));
    console.log('NEW DOWN', process.env.NEW_DOWN, '->', p.url().replace(BASE, ''), 'refusal:', JSON.stringify(refusal));
    await shot('price-saved');
    console.log('PAGE ERRORS', errors.length);
    console.log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 10)) console.log('  ', f);
    await b.close();
  }
  if (process.env.NEW_DOWN) {
    await newDown();
    return;
  }

  console.log('PAGE ERRORS', errors.length);
  console.log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 10)) console.log('  ', f);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
