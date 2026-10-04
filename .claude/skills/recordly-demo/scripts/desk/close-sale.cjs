#!/usr/bin/env node
// close-sale.cjs <dealPath> — off camera: Mark Sold And Close, so the sale is listed under Past Sales (the narrated
// cut's 27-desk-stored searches for it). Prints "CLOSED <deal>".
'use strict';
const { open, at, die } = require('./lib.cjs');
(async () => {
  const deal = process.argv[2];
  if (!deal || !/^\/admin\/sales\//.test(deal)) die('usage: close-sale.cjs /admin/sales/<deal>');
  const { browser, page: p } = await open();
  await p.goto(at(deal), { waitUntil: 'networkidle', timeout: 180000 });
  const btn = p.getByRole('button', { name: 'Mark Sold And Close' });
  if (!(await btn.count())) die('no "Mark Sold And Close" on the sale page (not every document filed and signed?)');
  await btn.click(); await p.waitForTimeout(4000);
  console.log(`CLOSED ${deal}`);
  await browser.close();
})().catch((e) => die(e.message.split('\n')[0]));
