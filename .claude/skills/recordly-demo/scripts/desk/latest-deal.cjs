#!/usr/bin/env node
// latest-deal.cjs [--buyer Carter] [--out FILE] — the deal a capture just made (21-buyer's Start Sale makes it on camera):
// the newest sale on the desk's sales list whose row names the buyer. Prints /admin/sales/<id> (what deal.txt holds;
// capture vars take its last part: --var deal=$(basename …)).
'use strict';
const fs = require('fs');
const { open, at, arg, die } = require('./lib.cjs');
(async () => {
  const buyer = arg('--buyer', 'Carter');
  const { browser, page: p } = await open();
  await p.goto(at('/admin/sales'), { waitUntil: 'networkidle', timeout: 180000 });
  const links = await p.$$eval('a[href^="/admin/sales/"]', (as) => as.map((a) => ({ h: a.getAttribute('href'), t: a.innerText })));
  await browser.close();
  const deals = [...new Set(links.filter((l) => /^\/admin\/sales\/[^/?#]+$/.test(l.h) && !/\/(new|past)$/.test(l.h) && new RegExp(buyer, 'i').test(l.t)).map((l) => l.h))];
  if (!deals.length) die(`no sale for "${buyer}" on /admin/sales`);
  const num = (h) => Number((h.match(/(\d+)$/) || [])[1] || -1);
  const deal = deals.sort((a, b) => num(b) - num(a))[0];
  if (arg('--out')) fs.writeFileSync(arg('--out'), deal + '\n');
  console.log(deal);
})().catch((e) => die(e.message.split('\n')[0]));
