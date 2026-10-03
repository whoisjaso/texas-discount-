#!/usr/bin/env node
// signing-link.cjs <dealPath> [--out FILE]  — the packet's own signing link (Open here), on DESK_BASE.
// For the narrated phone captures: `--var sign=$(cat $SCRATCH/sign.txt)` on 26-phone-sign, and a second call (a new
// session) for 26b's `--var sign2=`. Prints the URL (its token is a one-off preview token; never commit it).
'use strict';
const fs = require('fs');
const { open, at, follow, arg, die } = require('./lib.cjs');
(async () => {
  const deal = process.argv[2];
  if (!deal || !/^\/admin\/sales\//.test(deal)) die('usage: signing-link.cjs /admin/sales/<deal> [--out FILE] (the path deal.txt holds)');
  const { browser, page: p } = await open();
  await p.goto(at(deal + '/packet'), { waitUntil: 'networkidle', timeout: 180000 });
  const href = await p.getByRole('link', { name: /Open here/i }).first().getAttribute('href').catch(() => null);
  await browser.close();
  if (!href) die('no "Open here" signing link on the packet (is every document filed?)');
  const url = follow(href);
  if (arg('--out')) fs.writeFileSync(arg('--out'), url + '\n');
  console.log(url);
})().catch((e) => die(e.message.split('\n')[0]));
