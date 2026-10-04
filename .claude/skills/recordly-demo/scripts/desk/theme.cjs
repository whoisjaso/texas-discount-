#!/usr/bin/env node
// theme.cjs [--into $SCRATCH/demo.env] — this desk's computed theme, for premium-dealer-build desk-walk sale.cjs.
// sale.cjs refuses to walk (exit before deal.txt) unless THEME_ACCENT / THEME_GROUND / THEME_FONT match what the desk
// draws: the chosen title card's border colour, the page ground and the display font. The video's off-camera walks
// read them from the running desk once (runbook B3) instead of guessing. Read-only: Start A Sale's first two steps,
// nothing filed, no deal made. Prints `export THEME_ACCENT='…'` lines; --into appends them to demo.env (replacing
// earlier THEME_ lines). Needs the desk on DESK_BASE (desk-server.sh start).
'use strict';
const fs = require('fs');
const { open, at, arg, die } = require('./lib.cjs');
(async () => {
  const { browser, page: p } = await open();
  await p.goto(at('/admin/sales/new'), { waitUntil: 'networkidle', timeout: 180000 });
  const pick = p.locator('button.ed-pick').first();
  if (!(await pick.count())) die('no car on the Start A Sale lot (button.ed-pick): is the preview mock running?');
  await pick.click(); await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Next', exact: true }).first().click(); await p.waitForTimeout(700);
  await p.locator('.ed-title-kind').first().click(); await p.waitForTimeout(500);
  const t = await p.evaluate(() => ({
    accent: getComputedStyle(document.querySelector('.ed-title-kind[data-on="true"]')).borderTopColor,
    ground: getComputedStyle(document.body).backgroundColor,
    font: getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
  }));
  await browser.close();
  const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
  const lines = [`export THEME_ACCENT=${q(t.accent)}`, `export THEME_GROUND=${q(t.ground)}`, `export THEME_FONT=${q(t.font)}`];
  console.log(lines.join('\n'));
  const into = arg('--into');
  if (into) {
    const kept = fs.existsSync(into) ? fs.readFileSync(into, 'utf8').split('\n').filter((l) => l && !/^export THEME_/.test(l)) : [];
    fs.writeFileSync(into, [...kept, ...lines].join('\n') + '\n');
    console.log(`THEME OK: appended to ${into}`);
  }
})().catch((e) => die(e.message.split('\n')[0]));
