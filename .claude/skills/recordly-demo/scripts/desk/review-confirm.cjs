#!/usr/bin/env node
// review-confirm.cjs <dealPath> [--shots PREFIX] — off camera: confirm the licence review step(s) of a deal (Check What
// The Card Says, Hold To Confirm / Next) until the guide moves past buyerId. The narrated cut films the scan and cuts
// the review (the preview mock keeps no uploaded images, so its pictures would be broken on camera).
'use strict';
const { open, at, arg, die, BASE } = require('./lib.cjs');
(async () => {
  const deal = process.argv[2];
  if (!deal || !/^\/admin\/sales\//.test(deal)) die('usage: review-confirm.cjs /admin/sales/<deal> [--shots PREFIX]');
  const pre = arg('--shots');
  const { browser, page: p } = await open();
  await p.goto(at(deal + '/guide/buyerId'), { waitUntil: 'networkidle', timeout: 180000 });
  for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(1200);
    const url = p.url();
    console.log(i, url.replace(BASE, ''), '::', (await p.locator('h1').allInnerTexts()).join(' | '));
    if (pre) await p.screenshot({ path: `${pre}-${i}.png`, fullPage: true });
    if (!/buyerId/.test(url)) { console.log(`REVIEW CONFIRMED -> ${url.replace(BASE, '')}`); await browser.close(); return; }
    const hold = p.locator('[data-confirm-hold]');
    if (await hold.count() && await hold.first().isVisible()) {
      const hb = await hold.first().boundingBox();
      await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.waitForTimeout(2200); await p.mouse.up();
      continue;
    }
    const next = p.getByRole('button', { name: /^(Next|Confirm|Continue)$/ });
    if (await next.count()) { await next.last().click(); continue; }
    break;
  }
  await browser.close();
  die('the guide is still on buyerId: no Hold To Confirm or Next found (the desk changed: look at the screenshots with --shots)');
})().catch((e) => die(e.message.split('\n')[0]));
