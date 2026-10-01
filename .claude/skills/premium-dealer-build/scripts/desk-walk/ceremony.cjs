// Sign every document through the ceremony. Usage: node ceremony.cjs <out> <dealPath> <w> <h>
const { chromium } = require(process.env.PWPATH);
const BASE = 'http://localhost:5190';
const { AUDIT } = require('./audit-fn.cjs');
const failures = [];
(async () => {
  const [out, deal, W, H] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, hasTouch: +W < 800 });
  await ctx.addCookies([{ name: 'tj-local-admin-preview', value: process.env.PREVIEW_ADMIN || 'owner:owner@example.dev', domain: 'localhost', path: '/' }]);
  const desk = await ctx.newPage();
  desk.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 200)));
  await desk.goto(BASE + deal + '/packet', { waitUntil: 'networkidle', timeout: 180000 });
  const href = await desk.getByRole('link', { name: /Open here/i }).first().getAttribute('href');
  console.log('SIGN LINK', href && href.replace(/[A-Za-z0-9_-]{20,}/, '<token>'));
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 200)));
  await p.goto(href.startsWith('http') ? href : BASE + href, { waitUntil: 'networkidle' });
  let n = 0;
  const shot = async (l) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/sign-${String(n++).padStart(2, '0')}-${l}.png`, fullPage: true }); for (const f of await p.evaluate(AUDIT)) failures.push(l + ': ' + f); };
  await shot('cover');
  const begin = p.getByRole('button', { name: /Begin|Empezar|Comenzar/i }); if (await begin.count()) { await begin.first().click(); await p.waitForTimeout(1200); }
  for (let i = 0; i < 12; i++) {
    const heading = (await p.locator('h1,h2').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/receipt|signed|all done|thank/i.test(heading) && !(await p.locator('canvas').count())) { await shot('receipt'); console.log('RECEIPT', heading); break; }
    // Read to the end: keep scrolling until the page stops asking for it.
    for (let tries = 0; tries < 12; tries++) {
    await p.evaluate(async () => {
      const els = [document.scrollingElement, ...document.querySelectorAll('*')].filter(e => e && e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible');
      for (const e of els) { for (let y = 0; y <= e.scrollHeight; y += 400) { e.scrollTop = y; await new Promise(r => setTimeout(r, 40)); } }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await p.waitForTimeout(900);
    if (!(await p.getByText(/Scroll to the end/i).count())) break;
    }
    await shot(`doc${i}-read`);
    const consent = p.locator('[data-sign-consent] input[type=checkbox]');
    if (await consent.count()) {
      // The first stroke is offered again behind a consent tick (SOP: reuse + consent recorded).
      await consent.first().check(); await p.waitForTimeout(400);
    } else {
      const c = p.locator('canvas').first();
      await c.scrollIntoViewIfNeeded();
      const bx = await c.boundingBox();
      await p.mouse.move(bx.x + bx.width * 0.15, bx.y + bx.height * 0.6); await p.mouse.down();
      for (let k = 0; k <= 30; k++) await p.mouse.move(bx.x + bx.width * (0.15 + k * 0.022), bx.y + bx.height * (0.6 - 0.25 * Math.sin(k / 3)));
      await p.mouse.up();
    }
    await shot(`doc${i}-signed`);
    await p.getByRole('button', { name: /Sign And (Continue|Finish)|Firmar/i }).first().click();
    await p.waitForTimeout(2500);
    console.log('SIGNED', i, heading);
  }
  await desk.reload({ waitUntil: 'networkidle' }); await desk.waitForTimeout(4000);
  await desk.screenshot({ path: `${out}/packet-after.png`, fullPage: true });
  console.log('PACKET', (await desk.locator('.packet-progress').innerText().catch(() => '')).replace(/\s+/g, ' '));
  console.log('CEREMONY CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 10)) console.log('  ', f);
  await b.close();
})().catch(e => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
