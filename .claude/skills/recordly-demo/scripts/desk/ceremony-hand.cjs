#!/usr/bin/env node
// ceremony-hand.cjs <dealPath> [--strokes assets/sig/buyer-j-carter.json] [--strokes2 assets/sig/buyer-j-carter-alt.json]
//                   [--out DIR] [--width 1440 --height 900]
// The buyer's signing ceremony done OFF camera (part B's complete sale before 12-desk-signed, runbook B4): the packet's
// own signing link, every document read to the end and signed with the buyer's HAND (capture.cjs penPlan over a strokes
// file), never the sine wave premium-dealer-build's ceremony.cjs draws: the signature prints on the 130-U and the bill
// of sale the film shows. A document offered with the reuse-consent tick is ticked (SOP: reuse + consent recorded); a
// second drawing on the same deal uses --strokes2 (the desk refuses a pixel-identical stroke, lesson N5).
// Writes <out>/signing-url.txt and screenshots; prints "PACKET <progress>" (expect "2 / 2 signed" or similar).
'use strict';
const fs = require('fs');
const path = require('path');
const { open, at, follow, arg, die, strokes, drawStrokes, SKILL } = require('./lib.cjs');
(async () => {
  const deal = process.argv[2];
  if (!deal || !/^\/admin\/sales\//.test(deal)) die('usage: ceremony-hand.cjs /admin/sales/<deal> [--strokes FILE] [--strokes2 FILE] [--out DIR]');
  const first = strokes(arg('--strokes', path.join(SKILL, 'assets/sig/buyer-j-carter.json')));
  const second = strokes(arg('--strokes2', path.join(SKILL, 'assets/sig/buyer-j-carter-alt.json')));
  const out = arg('--out', path.join(process.env.SCRATCH || '.', 'ceremony'));
  fs.mkdirSync(out, { recursive: true });
  const W = Number(arg('--width', 1440)), H = Number(arg('--height', 900));
  const { browser, ctx, page: desk } = await open({ width: W, height: H, touch: W < 800 });
  await desk.goto(at(deal + '/packet'), { waitUntil: 'networkidle', timeout: 180000 });
  const href = await desk.getByRole('link', { name: /Open here/i }).first().getAttribute('href').catch(() => null);
  if (!href) die('no "Open here" signing link on the packet (is every document filed?)');
  const url = follow(href);
  fs.writeFileSync(path.join(out, 'signing-url.txt'), url + '\n');
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 200)));
  await p.goto(url, { waitUntil: 'networkidle' });
  let n = 0, drawn = 0;
  const shot = async (l) => { await p.waitForTimeout(700); await p.screenshot({ path: path.join(out, `sign-${String(n++).padStart(2, '0')}-${l}.png`), fullPage: true }); };
  await shot('cover');
  const begin = p.getByRole('button', { name: /Begin|Empezar|Comenzar/i });
  if (await begin.count()) { await begin.first().click(); await p.waitForTimeout(1200); }
  for (let i = 0; i < 14; i++) {
    const heading = (await p.locator('h1,h2').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/receipt|signed|all done|thank|todo firmado|gracias/i.test(heading) && !(await p.locator('canvas').count())) { await shot('receipt'); console.log('RECEIPT', heading); break; }
    for (let tries = 0; tries < 40; tries++) { // read to the end (the 130-U is the state's PDF and can be slow)
      await p.evaluate(async () => {
        const els = [document.scrollingElement, ...document.querySelectorAll('*')].filter((e) => e && e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible');
        for (const e of els) for (let y = 0; y <= e.scrollHeight; y += 400) { e.scrollTop = y; await new Promise((r) => setTimeout(r, 40)); }
        window.scrollTo(0, document.body.scrollHeight);
      });
      await p.waitForTimeout(900);
      if (!(await p.getByText(/Scroll to the end|Baje hasta el final|Desplácese/i).count())) break;
    }
    await shot(`doc${i}-read`);
    const consent = p.locator('[data-sign-consent] input[type=checkbox]');
    if (await consent.count()) { await consent.first().check(); await p.waitForTimeout(400); }
    else { await drawStrokes(p, p.locator('canvas').first(), drawn ? second : first); drawn++; }
    await shot(`doc${i}-signed`);
    await p.getByRole('button', { name: /Sign And (Continue|Finish)|Firmar/i }).first().click();
    await p.waitForTimeout(2500);
    console.log('SIGNED', i, heading);
  }
  await desk.reload({ waitUntil: 'networkidle' }); await desk.waitForTimeout(4000);
  await desk.screenshot({ path: path.join(out, 'packet-after.png'), fullPage: true });
  console.log('PACKET', (await desk.locator('.packet-progress').innerText().catch(() => '')).replace(/\s+/g, ' '));
  await browser.close();
})().catch((e) => die(e.message.split('\n')[0]));
