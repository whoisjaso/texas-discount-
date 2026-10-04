#!/usr/bin/env node
// onboard.cjs [--strokes assets/sig/member-maria-lopez.json] [--first Maria --last Lopez] [--out DIR]
// The preview member's first sign-in done OFF camera (the narrated cut's fresh server, or a restart between takes,
// lesson N6): onboarding's name, the signature drawn with the SAME strokes 7-desk-onboard draws on camera (so every
// document carries one hand), Your Fees when this member is an owner, then Start Working.
//   FEES=<dollars>  the owner's real doc fee, or one the user approved (client-inputs.json → partB.demoFee; the fee is
//                   named in the README and the send note as a demo input, never on screen). FEES=later presses
//                   Set These Later. A salesperson (DESK_COOKIE=sales:<email>, server --member fresh-sales) never sees
//                   the step: leave FEES unset. The walk never invents a fee: Your Fees on screen without FEES stops it.
// Every yes/no on Your Fees is answered No: the walk records no OCCC filing, deputy status or inventory tax it was not
// given (premium-dealer-build desk-walk onboard.cjs walks the same screens). Prints "ONBOARDED <first> <last>".
'use strict';
const fs = require('fs');
const path = require('path');
const { open, at, arg, die, strokes, drawStrokes, SKILL, BASE } = require('./lib.cjs');
(async () => {
  const sig = strokes(arg('--strokes', path.join(SKILL, 'assets/sig/member-maria-lopez.json')));
  const first = arg('--first', 'Maria'), last = arg('--last', 'Lopez');
  const out = arg('--out'); if (out) fs.mkdirSync(out, { recursive: true });
  const { browser, page: p } = await open();
  const shot = async (n) => { if (out) await p.screenshot({ path: path.join(out, `onboard-${n}.png`), fullPage: true }); };
  await p.goto(at('/admin/account/onboarding'), { waitUntil: 'networkidle', timeout: 180000 });
  const q = p.locator('h1#onboarding-question');
  if (!(await p.locator('input[name=firstName]').count())) {
    console.log(`NOTHING TO DO: ${p.url().replace(BASE, '')} has no name step (already onboarded on this server?)`);
    await browser.close(); return;
  }
  await p.locator('input[name=firstName]').fill(first);
  await p.locator('input[name=lastName]').fill(last);
  await shot('name');
  await p.getByRole('button', { name: 'Next', exact: true }).click();
  await q.filter({ hasText: 'Draw Your Signature' }).waitFor({ timeout: 60000 });
  await drawStrokes(p, p.locator('[data-onboarding-step="signature"] canvas, canvas').first(), sig);
  await shot('signature');
  await p.getByRole('button', { name: 'Save Signature', exact: true }).click();
  const fees = p.locator('h1#fees-question');
  const done = q.filter({ hasText: 'You Are All Set' });
  await Promise.race([fees.waitFor({ timeout: 60000 }), done.waitFor({ timeout: 60000 })]);
  const FEES = process.env.FEES;
  if (await fees.isVisible().catch(() => false)) {
    if (!FEES) die('Your Fees is on screen: pass FEES=<dollars> (client-inputs.json → partB.demoFee) or FEES=later; the walk never invents a fee');
    const choice = (label) => p.locator('.ed-pay-choice').filter({ has: p.locator('.ed-pay-choice-label', { hasText: new RegExp(`^${label}$`) }) }).first();
    const next = () => p.locator('[data-fees-next]');
    const screen = (name) => p.locator(`[data-fees-screen="${name}"]`).waitFor({ timeout: 60000 });
    await screen('finance');
    if (FEES === 'later') await p.locator('[data-fees-later]').click();
    else {
      await choice('No').click(); await next().click();
      await screen('docFee');
      await p.locator('input[name=docFee]').fill(String(FEES)); await p.waitForTimeout(400);
      if (await p.locator('[data-fee-refusal]').count()) die(`the desk refused the doc fee ${FEES}: ${await p.locator('[data-fee-refusal]').innerText()}`);
      await shot('fees-doc-fee');
      await next().click();
      for (const name of ['deputy', 'vit', 'ch345']) { await screen(name); await choice('No').click(); await next().click(); }
      await screen('review');
      await shot('fees-review');
      await p.getByRole('button', { name: 'Save Fees', exact: true }).click();
    }
  } else if (FEES && FEES !== 'none') die('FEES was given but this member never met Your Fees (a salesperson, or fees already saved)');
  await done.waitFor({ timeout: 60000 });
  await shot('done');
  await p.getByRole('button', { name: 'Start Working', exact: true }).click();
  await p.waitForURL((u) => !/onboarding/.test(u.pathname), { timeout: 120000 });
  console.log(`ONBOARDED ${first} ${last} -> ${p.url().replace(BASE, '')}`);
  await browser.close();
})().catch((e) => die(e.message.split('\n')[0]));
