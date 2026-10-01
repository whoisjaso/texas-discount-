// One full sale through the desk. Usage: node sale.cjs <outDir> <scenario.json> <width> <height>
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const BASE = 'http://localhost:5190';
const { AUDIT } = require('./audit-fn.cjs');
const failures = [];
(async () => {
  const [out, scenarioPath, W, H] = process.argv.slice(2);
  const sc = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
  await ctx.addCookies([{ name: 'tj-local-admin-preview', value: process.env.PREVIEW_ADMIN || 'owner:owner@example.dev', domain: 'localhost', path: '/' }]);
  const p = await ctx.newPage();
  const log = (...a) => console.log(...a);
  p.on('pageerror', e => log('PAGEERR', e.message.slice(0, 200)));
  let n = 0;
  const shot = async (label) => {
    await p.waitForTimeout(700);
    const h = (await p.locator('h1').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    const file = `${out}/${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`;
    await p.screenshot({ path: file, fullPage: true }); n++;
    const bad = await p.evaluate(AUDIT);
    for (const f of bad) failures.push(label + ': ' + f);
    log(`[${n}] ${p.url().replace(BASE, '')} :: ${h}`);
  };
  const btn = (name, exact = false) => p.getByRole('button', { name, exact }).first();
  const clickText = async (t) => { await p.getByText(t, { exact: true }).first().click(); };
  const settle = async () => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(1200); };

  // ---- Start A Sale
  await p.goto(BASE + '/admin/sales/new', { waitUntil: 'networkidle', timeout: 180000 });
  await shot('start-car');
  await p.getByText(sc.car).first().click(); await p.waitForTimeout(500);
  await p.locator('select[name=language]').selectOption(sc.language || 'en');
  await shot('start-odometer-language');
  await btn('Next', true).click(); await p.waitForTimeout(600);
  await p.getByText(sc.title || 'Clean title', { exact: true }).first().click();
  await shot('start-title');
  // SOP verification step 3: assert a computed style Vega's theme sets before trusting screenshots.
  const theme = await p.evaluate(() => ({
    answer: getComputedStyle(document.querySelector('.ed-title-kind[data-on="true"]')).borderTopColor,
    ground: getComputedStyle(document.body).backgroundColor,
    display: getComputedStyle(document.querySelector('h1')).fontFamily,
  }));
  // Set these to the client's theme before trusting any screenshot.
  const want = { answer: process.env.THEME_ACCENT || 'rgb(0, 0, 0)', ground: process.env.THEME_GROUND || 'rgb(238, 239, 242)', font: new RegExp(process.env.THEME_FONT || 'Barlow') };
  if (theme.answer !== want.answer || theme.ground !== want.ground || !want.font.test(theme.display)) {
    throw new Error('THEME ASSERTION FAILED ' + JSON.stringify(theme));
  }
  log('THEME OK', JSON.stringify(theme));
  await btn('Next', true).click(); await p.waitForTimeout(600);
  await p.locator('input[name=buyerFirstName]').fill(sc.first);
  await p.locator('input[name=buyerLastName]').fill(sc.last);
  await shot('start-buyer');
  await btn('Next', true).click(); await p.waitForTimeout(600);
  await p.locator('input[name=buyerPhone]').fill(sc.phone);
  await shot('start-contact');
  await btn('Next', true).click(); await p.waitForTimeout(600);
  await p.locator('select[name=buyerIdKind]').selectOption('stateLicence'); await p.waitForTimeout(300);
  await p.locator('select[name=buyerIdState]').selectOption('TX');
  await p.locator('input[name=buyerIdNumber]').fill(sc.idNumber || '12345678');
  await shot('start-id');
  await btn('Next', true).click(); await p.waitForTimeout(600);
  await p.locator('input[name=buyerStreet]').fill(sc.street);
  await p.locator('input[name=buyerCity]').fill(sc.city);
  await p.locator('input[name=buyerZip]').fill(sc.zip);
  const county = p.locator('input[name=buyerCounty]');
  if (await county.count() && !(await county.inputValue())) await county.fill(sc.county);
  await shot('start-address');
  await btn('Start Sale', true).click(); await p.waitForTimeout(800);
  await shot('start-readback');
  const hb = await btn('Hold To Confirm').boundingBox();
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.waitForTimeout(2600); await p.mouse.up();
  await p.waitForURL(/\/guide\//, { timeout: 60000 }); await settle();
  const dealUrl = p.url().replace(/\/guide\/.*/, '');
  log('DEAL', dealUrl.replace(BASE, ''));

  // ---- The corridor: answer whatever question is on screen, per the scenario's answer map.
  for (let guard = 0; guard < 60; guard++) {
    const url = p.url();
    const step = decodeURIComponent((url.match(/\/(guide|paperwork)\/(.+)$/) || [])[2] || '');
    await shot(step || 'screen');
    if (/\/packet$/.test(url) || step === 'packet') break;
    const a = sc.answers[step] ?? sc.answers[step.split('/').pop()];
    if (step.startsWith('document:') || ['title', 'titleWork'].includes(step)) {
      const filed = await p.getByText('Filed', { exact: true }).count();
      if (filed || step === 'title') { await p.getByRole('link', { name: /^Next/ }).or(p.getByRole('button', { name: /^Next/ })).first().click(); }
      else { await p.getByRole('link', { name: /^Open/ }).first().click(); }
      await p.waitForURL((u) => u.href !== url, { timeout: 90000 }).catch(() => {});
      await settle(); continue;
    }
    if (step.endsWith('/review')) {
      if (sc.signAtDesk) { /* signatures happen in the ceremony */ }
      await btn(/^File The /).click();
      await p.waitForURL((u) => u.href !== url, { timeout: 90000 }).catch(() => {});
      await settle(); continue;
    }
    if (a === undefined) { log('NO ANSWER FOR', step); break; }
    for (const act of [].concat(a)) {
      if (act.fill) { await p.locator(act.fill).first().fill(String(act.value)); await p.waitForTimeout(300); }
      else if (act.button) { await btn(act.button, act.exact ?? false).click(); }
      else if (act.text) { await clickText(act.text); }
      else if (act.link) { await p.getByRole('link', { name: act.link }).first().click(); }
      else if (act.press) { await p.keyboard.press(act.press); }
      await p.waitForTimeout(500);
    }
    await p.waitForURL((u) => u.href !== url, { timeout: 90000 }).catch(() => {});
    await settle();
    if (p.url() === url && !(Array.isArray(a) && a.some(x => x.stay))) { log('STUCK AT', step); await shot('stuck'); break; }
  }
  fs.writeFileSync(`${out}/deal.txt`, dealUrl.replace(BASE, ''));
  log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 15)) log('  ', f);
  await b.close();
})().catch(e => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
