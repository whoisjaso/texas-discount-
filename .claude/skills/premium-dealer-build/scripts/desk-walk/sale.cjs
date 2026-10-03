// One full sale through the desk. Usage: node sale.cjs <outDir> <scenario.json> <width> <height>
// DESK_BASE picks the server (default http://localhost:5190). RESUME_DEAL=<dealPath>
// skips Start A Sale and walks that deal's corridor from /guide, answering and
// filing whatever is open (filing again after a void). STOP_AT=<step> stops
// when the corridor reaches that step (e.g. document:billOfSale), leaving an
// open sale with nothing filed: the fees walk (fees.cjs) needs one.
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at, previewCookies } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');
const failures = [];
(async () => {
  const [out, scenarioPath, W, H] = process.argv.slice(2);
  const sc = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
  await ctx.addCookies(previewCookies(process.env.PREVIEW_ADMIN || 'owner:owner@example.dev'));
  await guard(ctx);
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

  let dealUrl;
  if (process.env.RESUME_DEAL) {
    // ---- Resume a deal: its corridor from wherever it stands.
    dealUrl = at(process.env.RESUME_DEAL);
    await p.goto(dealUrl + '/guide', { waitUntil: 'networkidle', timeout: 180000 });
    await settle();
    log('RESUME', dealUrl.replace(BASE, ''), '->', p.url().replace(BASE, ''));
  } else {
    // ---- Start A Sale
    await p.goto(at('/admin/sales/new'), { waitUntil: 'networkidle', timeout: 180000 });
    await shot('start-car');
    if (sc.vin) {
      // A car that is not on the lot: typed by VIN ("Not on the lot? Enter a
      // VIN"), taken from the decode, then its mileage and details by hand.
      const decoded = p.locator('.ed-start-lotvin button.ed-pick').first();
      await p.locator('#tj-lot-vin').fill(sc.vin);
      await decoded.waitFor({ timeout: 90000 });
      await shot('start-vin');
      await decoded.click(); await p.waitForTimeout(500);
      if (sc.model) await p.locator('input[name=carModel]').fill(sc.model);
      await p.locator('input[name=mileage]').fill(String(sc.mileage ?? 100000));
    } else {
      await p.getByText(sc.car).first().click(); await p.waitForTimeout(500);
    }
    await p.locator('select[name=language]').selectOption(sc.language || 'en');
    await shot('start-odometer-language');
    await btn('Next', true).click(); await p.waitForTimeout(600);
    if (sc.vin) {
      await p.locator('select[name=carExterior]').selectOption(sc.exterior || 'White');
      await p.locator('select[name=carBodyStyle]').selectOption(sc.bodyStyle || 'Sedan');
      await shot('start-car-details');
      await btn('Next', true).click(); await p.waitForTimeout(600);
    }
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
    // A start the desk refuses (for example a phone number that belongs to
    // another open sale's filed buyer) is said on screen: report it and stop.
    const started = await p.waitForURL(/\/guide\//, { timeout: 60000 }).then(() => true).catch(() => false);
    if (!started) {
      const said = ((await p.locator('[role=alert]:not(#__next-route-announcer__)').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
      await shot('start-refused');
      log('START REFUSED', JSON.stringify(said));
      log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 15)) log('  ', f);
      await b.close();
      process.exit(2);
    }
    await settle();
    dealUrl = p.url().replace(/\/guide\/.*/, '');
    log('DEAL', dealUrl.replace(BASE, ''));
  }

  // ---- The corridor: answer whatever question is on screen, per the scenario's answer map.
  for (let guard = 0; guard < 60; guard++) {
    const url = p.url();
    const step = decodeURIComponent((url.match(/\/(guide|paperwork)\/(.+)$/) || [])[2] || '');
    await shot(step || 'screen');
    if (/\/packet$/.test(url) || step === 'packet') break;
    if (process.env.STOP_AT && step === process.env.STOP_AT) { log('STOPPED AT', step); break; }
    // A scenario may name text a screen must show (e.g. box 11's source on
    // the 130-U review, or the empty-weight question's own state).
    const want = (sc.expect || {})[step];
    if (want) {
      const seen = await p.getByText(want, { exact: false }).count();
      log(seen ? `EXPECT OK ${step} :: ${want}` : `EXPECT FAILED ${step} :: ${want}`);
      if (!seen) failures.push(`${step}: expected "${want}" on screen`);
    }
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
      // The review names what the page would print blank or what a sworn
      // statement still needs; File stays disabled until it is fixed.
      const fileBtn = btn(/^File The /);
      if (await fileBtn.isDisabled().catch(() => false)) {
        const why = ((await p.locator('[role=alert]:not(#__next-route-announcer__)').allInnerTexts().catch(() => [])) || []).join(' | ').replace(/\s+/g, ' ');
        log('FILE BLOCKED', step, JSON.stringify(why));
        failures.push(`${step}: File blocked: ${why}`);
        break;
      }
      await fileBtn.click();
      await p.waitForURL((u) => u.href !== url, { timeout: 90000 }).catch(() => {});
      await settle(); continue;
    }
    if (a === undefined && (/(^|\/)(after:.*|start)$/.test(step) || (!step && /\/(guide|paperwork\/[^/]+)$/.test(url)))) {
      // An in-between page that sends itself on (paperwork/<doc>/after:<key>,
      // paperwork/<doc>/start, or the bare guide that redirects to its step).
      // Read mid-redirect it has no answer; wait for it to move instead.
      await p.waitForURL((u) => u.href !== url, { timeout: 90000 }).catch(() => {});
      await settle();
      if (p.url() !== url) continue;
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
