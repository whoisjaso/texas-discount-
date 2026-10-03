// Press File on a document's review and assert what happens.
//
// Usage: node try-file.cjs <outDir> <width> <height> <dealPath> <documentType> <expect>
//
// <expect> is "filed", or a pattern the refusal must match (for example
// "without an OCCC filing in force"). APPLY=1, after an expected refusal,
// presses Apply Today's Fees on the sale page and files again, expecting it
// to file. Used for the refusals no screen can show by walking forward: an
// open sale whose OCCC filing was removed, with DESK_ALLOW_UNSET_FACTS on
// (it never lifts a limit). DESK_BASE picks the server.
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at, previewCookies } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

(async () => {
  const [out, W, H, deal, type, expect] = process.argv.slice(2);
  if (!expect) throw new Error('usage: node try-file.cjs <out> <w> <h> <dealPath> <documentType> <filed|pattern>');
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
    await p.screenshot({ path: `${out}/try-file-${String(n++).padStart(2, '0')}-${label}.png`, fullPage: true });
    for (const f of await p.evaluate(AUDIT)) failures.push(`${label}: contrast ${f}`);
  };
  const file = async () => {
    await p.goto(at(`${deal}/paperwork/${type}/review`), { waitUntil: 'networkidle', timeout: 180000 });
    await p.locator('.ed-paper-file').click();
    await Promise.race([
      p.locator('.ed-paper-error').waitFor({ timeout: 90000 }),
      p.waitForURL((u) => !/\/review$/.test(u.pathname), { timeout: 90000 }),
    ]).catch(() => {});
    await p.waitForTimeout(800);
    return (await p.locator('.ed-paper-error').innerText().catch(() => '')).trim();
  };

  const said = await file();
  if (expect === 'filed') {
    check(!said, `${type} files :: ${said || p.url().replace(BASE, '')}`);
  } else {
    check(new RegExp(expect).test(said), `${type} is refused: ${said}`);
    await shot('refused');
    if (process.env.APPLY === '1') {
      await p.goto(at(deal), { waitUntil: 'networkidle', timeout: 180000 });
      const offer = p.locator('[data-apply-fees]');
      check((await offer.count()) === 1, `the sale page offers Apply Today's Fees :: ${(await offer.innerText().catch(() => '')).replace(/\s+/g, ' ')}`);
      await shot('apply-offered');
      await offer.getByRole('button', { name: "Apply Today's Fees" }).click();
      await p.waitForTimeout(2000);
      await p.waitForLoadState('networkidle').catch(() => {});
      const again = await file();
      check(!again, `${type} files once today's fees are applied :: ${again || p.url().replace(BASE, '')}`);
    }
  }
  console.log('PAGE ERRORS', errors.length);
  console.log('FAILURES', failures.length); for (const f of failures.slice(0, 20)) console.log('  ', f);
  await b.close();
  if (failures.length || errors.length) process.exit(1);
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
