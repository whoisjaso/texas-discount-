// The team screen: approve, deny, clearance, Correct Name, reset, the
// refusals, and the approved member's first sign-in.
// Usage: node team.cjs <outDir> <width> <height>
//
// Run against a FRESH server started WITHOUT DESK_PREVIEW_MEMBER (the preview
// mock's fixture team: three access requests, five active members, one with
// no access; src/lib/supabase/mock.ts PREVIEW_TEAM). What the walk changes
// lasts for that server's life, so each size needs its own fresh server.
// DESK_BASE picks the server (default http://localhost:5190). Set
// THEME_ACCENT / THEME_GROUND / THEME_FONT to the client's computed values.
//
// 1. As the owner (preview cookie owner:owner@example.dev): /admin/team (the
//    access-request email's link) lands on /admin/dealership/team; Team is in
//    the sidebar (or the phone's More sheet); the theme is asserted. Approve
//    Diego Ramirez as Sales (Owner offered, "not cleared to sign by default",
//    a temporary password shown once because no account existed); deny Ashley
//    Nguyen with the hold; turn signing on for Jason Price; Correct Name for
//    Brenda Ortiz (a refused name first, then "Ortiz de la Cruz", kept as
//    typed); reset Jason Price (no temporary password: his account exists);
//    the last active owner's Remove Access forced on and refused BY THE
//    SERVER; the history names each change and who made it; the signature
//    page's "Open Team Access" lands here.
// 2. As a manager (manager:manager@example.dev): Team in the sidebar, Your
//    Fees not; Owner not offered; the clearance and Correct Name controls
//    disabled with the reason, then forced on and refused BY THE SERVER; an
//    owner's row not removable. Then Approve Again for Rob Hayes (No Access,
//    Sales, not cleared) as Registration, a role cleared by default: the
//    screen says he stays not cleared, as an owner left him, the server keeps
//    it so, and his existing account gets a new temporary password (its old
//    one no longer works); the history names the manager.
// 3. Diego Ramirez signs in on the form with the temporary password: Choose A
//    Password, his name, no signature screen (Sales starts not cleared), You
//    Are All Set, Handle A Sale.
// 4. Jason Price (reset) signs in: the reset sends him through onboarding,
//    Choose A Password first; then, because the owner turned his signing on
//    and he has no signature yet, Draw Your Signature (never his name again);
//    You Are All Set; Handle A Sale. (Turning signing on alone does not send
//    a finished member back to onboarding: they draw it on Your Signature.)
// Prints TEAM WALK OK, or TEAM WALK FAILED (n) and exits 1.
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at, previewCookies } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

const NEW_PASSWORD = process.env.NEW_PASSWORD || 'a preview password of mine';
const TEAM = '/admin/dealership/team';

(async () => {
  const [out, W, H] = process.argv.slice(2);
  if (!out || !W || !H) throw new Error('usage: node team.cjs <outDir> <width> <height>');
  fs.mkdirSync(out, { recursive: true });
  const phone = +W < 800;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const failed = []; const errors = []; const failures = [];
  const expect = (ok, what) => { if (ok) console.log('  ok', what); else { failed.push(what); console.log('FAILED', what); } };
  let n = 0;
  const text = async (loc) => ((await loc.first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

  const open = async (cookie) => {
    const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: phone });
    seen = 0;
    if (cookie) await ctx.addCookies(previewCookies(cookie));
    await guard(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { errors.push(e.message.slice(0, 200)); console.log('PAGEERR', e.message.slice(0, 200)); });
    return { ctx, p };
  };
  const shot = async (p, label) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/team-${String(n++).padStart(2, '0')}-${label}.png`, fullPage: true });
    const bad = await p.evaluate(AUDIT);
    for (const f of bad) failures.push(label + ': ' + f);
    console.log(`SHOT ${label} :: ${p.url().replace(BASE, '')} :: contrast=${bad.length}`);
  };
  const row = (p, kind, name) => p.locator(`[data-team-${kind}]`).filter({ has: p.locator('.ed-team-name', { hasText: name }) }).first();
  const result = (p) => p.locator('[data-team-result]');
  // Each answer carries a sequence number, so a new one is never confused with the last.
  let seen = 0;
  /** Waits for the action's next answer: "ok" or "refused", with its words. */
  const answer = async (p) => {
    await p.waitForFunction(
      (last) => Number(document.querySelector('[data-team-result]')?.getAttribute('data-team-seq') || 0) > last,
      seen,
      { timeout: 60000 },
    );
    seen = Number(await result(p).getAttribute('data-team-seq'));
    await p.waitForLoadState('networkidle').catch(() => {});
    return { kind: await result(p).getAttribute('data-team-result'), said: await text(result(p)) };
  };
  /** The desk's dialog: hold the destructive button until it commits. */
  const hold = async (p, verb) => {
    const dialog = p.locator('dialog.ed-ask');
    await dialog.waitFor({ state: 'visible', timeout: 30000 });
    console.log('  DIALOG', JSON.stringify(await text(dialog.locator('.ed-ask-question'))));
    const button = dialog.getByRole('button', { name: new RegExp(`Hold To ${verb}`) }).last();
    const box = await button.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.waitForTimeout(1700); await p.mouse.up();
  };
  /**
   * A control the screen shows disabled, pressed anyway, as a client that
   * ignores the disabled state would: its own click handler is called, which
   * calls the real server action, and the server must refuse. (React drops a
   * click on a disabled button even with the attribute removed, so the
   * handler is called directly.)
   */
  const force = async (loc) => {
    await loc.evaluate((el) => {
      const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      if (!key || typeof el[key].onClick !== 'function') throw new Error('no click handler to force');
      el[key].onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: el, target: el });
    });
  };
  /** What the refreshed screen shows: polled, since the refresh follows the answer. */
  const eventually = async (check, timeout = 30000) => {
    const until = Date.now() + timeout;
    for (;;) {
      if (await check().catch(() => false)) return true;
      if (Date.now() > until) return false;
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  const navHasTeam = async (p) => {
    if (!phone) return (await p.locator(`.ed-admin-rail a[href="${TEAM}"]`).count()) > 0;
    await p.locator('.ed-admin-tabs button', { hasText: 'More' }).click();
    const sheet = p.locator('.ed-admin-more');
    await sheet.waitFor({ timeout: 20000 });
    return (await sheet.locator(`a[href="${TEAM}"]`).count()) > 0;
  };
  const navHasFees = async (p) => {
    const where = phone ? p.locator('.ed-admin-more') : p.locator('.ed-admin-rail');
    return (await where.locator('a[href="/admin/dealership/fees"]').count()) > 0;
  };
  const closeSheet = async (p) => {
    if (phone) await p.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
  };

  // ---------------------------------------------------------------- owner
  console.log('OWNER');
  let temporary = '';
  {
    const { ctx, p } = await open('owner:owner@example.dev');
    await p.goto(at('/admin/team'), { waitUntil: 'networkidle', timeout: 180000 });
    expect(p.url().replace(BASE, '') === TEAM, `/admin/team (the access-request email's link) resolves to ${TEAM}: landed on ${p.url().replace(BASE, '')}`);
    await p.locator('[data-team-screen]').waitFor({ timeout: 60000 });

    // The theme, before trusting any screenshot.
    const theme = await p.evaluate(() => ({
      accent: getComputedStyle(document.querySelector('[data-cleared="yes"] svg')).color,
      ground: getComputedStyle(document.body).backgroundColor,
      display: getComputedStyle(document.querySelector('h1')).fontFamily,
      band: getComputedStyle(document.querySelector(window.innerWidth < 768 ? '.ed-admin-tabs' : '.ed-admin-rail')).backgroundColor,
    }));
    const want = { accent: process.env.THEME_ACCENT || 'rgb(0, 0, 0)', ground: process.env.THEME_GROUND || 'rgb(238, 239, 242)', font: new RegExp(process.env.THEME_FONT || 'Barlow') };
    if (theme.accent !== want.accent || theme.ground !== want.ground || !want.font.test(theme.display) || theme.band !== 'rgb(0, 0, 0)') {
      throw new Error('THEME ASSERTION FAILED ' + JSON.stringify(theme));
    }
    console.log('THEME OK', JSON.stringify(theme));
    expect(await navHasTeam(p), 'Team is in the owner\'s navigation');
    expect(await navHasFees(p), 'Your Fees sits beside it');
    await closeSheet(p);
    await shot(p, 'owner-team');

    // Approve Diego Ramirez as Sales.
    const diego = row(p, 'request', 'Diego Ramirez');
    const roles = await diego.locator('select[data-approve-role] option').evaluateAll((os) => os.map((o) => o.value));
    expect(roles.includes('owner'), `an owner is offered Owner (${roles.join(', ')})`);
    await diego.locator('select[data-approve-role]').selectOption('sales');
    expect((await diego.locator('[data-signs-by-default]').getAttribute('data-signs-by-default')) === 'no', 'Sales shows "not cleared to sign by default"');
    console.log('  DEFAULT', JSON.stringify(await text(diego.locator('[data-signs-by-default]'))));
    await diego.locator('[data-approve]').click();
    let a = await answer(p);
    console.log('  APPROVE', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'ok' && /Approved as Sales/.test(a.said), 'Diego Ramirez approved as Sales');
    temporary = (await text(p.locator('[data-temporary-password]'))) || '';
    expect(/^VG-/.test(temporary), 'a temporary password is shown once, because no account existed');
    await shot(p, 'owner-approved');
    await p.getByRole('button', { name: 'Done', exact: true }).click();
    expect((await p.locator('[data-temporary-password]').count()) === 0, 'the temporary password is gone once Done');
    expect(await eventually(async () => (await row(p, 'member', 'Diego Ramirez').count()) === 1), 'Diego Ramirez is on the team');
    expect((await row(p, 'member', 'Diego Ramirez').locator('[data-cleared]').getAttribute('data-cleared')) === 'no', 'and not cleared to sign (the Sales default)');

    // Deny Ashley Nguyen.
    await row(p, 'request', 'Ashley Nguyen').locator('[data-deny]').click();
    await shot(p, 'owner-deny-dialog');
    await hold(p, 'Deny');
    a = await answer(p);
    console.log('  DENY', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'ok' && /was denied/.test(a.said), 'Ashley Nguyen denied with the hold');
    expect(await eventually(async () => (await row(p, 'removed', 'Ashley Nguyen').count()) === 1), 'Ashley Nguyen is under No Access');

    // Turn signing on for Jason Price.
    await row(p, 'member', 'Jason Price').locator('[data-signing-toggle]').click();
    a = await answer(p);
    console.log('  SIGNING', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'ok' && /cleared to sign/.test(a.said), 'signing turned on for Jason Price');
    expect(await eventually(async () => (await row(p, 'member', 'Jason Price').locator('[data-cleared]').getAttribute('data-cleared')) === 'yes'), 'Jason Price reads Cleared To Sign');
    await shot(p, 'owner-signing-on');

    // Correct Name: Brenda Ortiz, a refused name first.
    const brenda = row(p, 'member', 'Brenda Ortiz');
    await brenda.locator('[data-correct-name]').click();
    const nameForm = brenda.locator('[data-correct-name-form]');
    await nameForm.waitFor({ timeout: 20000 });
    await nameForm.locator('input[name=firstName]').fill('Brenda');
    await nameForm.locator('input[name=lastName]').fill('Ortiz 2');
    await nameForm.locator('[data-save-name]').click();
    a = await answer(p);
    console.log('  NAME REFUSED', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'refused' && /only letters/.test(a.said), 'a name with a digit is refused with the onboarding rule');
    await shot(p, 'owner-name-refused');
    await nameForm.locator('input[name=lastName]').fill('Ortiz de la Cruz');
    await nameForm.locator('[data-save-name]').click();
    a = await answer(p);
    console.log('  NAME', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'ok' && /Brenda Ortiz de la Cruz/.test(a.said) && /already filed keep/.test(a.said), 'the name corrected, kept as typed, for paper filed from now on');
    expect(await eventually(async () => (await row(p, 'member', 'Brenda Ortiz de la Cruz').count()) === 1), 'the row reads Brenda Ortiz de la Cruz');
    await shot(p, 'owner-name-corrected');

    // Reset Jason Price: his account exists, so no temporary password.
    await row(p, 'member', 'Jason Price').locator('[data-reset-access]').click();
    await hold(p, 'Reset');
    a = await answer(p);
    console.log('  RESET', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'ok' && /Access reset/.test(a.said) && /not changed/.test(a.said), 'Jason Price reset, his password not changed');
    expect((await p.locator('[data-temporary-password]').count()) === 0, 'no temporary password for an account that exists');
    expect((await row(p, 'member', 'Jason Price').locator('[data-cleared]').getAttribute('data-cleared')) === 'yes', 'the reset kept his clearance');
    await shot(p, 'owner-reset');

    // The last active owner: the screen will not offer it; the server refuses it anyway.
    const maria = row(p, 'member', 'Maria Lopez');
    expect(await maria.locator('[data-remove-access]').isDisabled(), 'the last active owner\'s Remove Access is disabled');
    await force(maria.locator('[data-remove-access]'));
    await hold(p, 'Remove');
    a = await answer(p);
    console.log('  LAST OWNER', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'refused' && /last active owner/.test(a.said), 'the server refuses removing the last active owner');
    await shot(p, 'owner-last-owner-refused');

    // The record.
    const history = await text(p.locator('[data-team-history]'));
    console.log('  HISTORY', JSON.stringify(history.slice(0, 400)));
    for (const [words, what] of [
      [/owner@example\.dev approved Diego Ramirez as Sales/, 'the approval, and who approved'],
      [/owner@example\.dev denied Ashley Nguyen's access request/, 'the denial, and who denied'],
      [/turned signing on for Jason Price/, 'the clearance change'],
      [/corrected Brenda Ortiz's name to Brenda Ortiz de la Cruz/, 'the name correction, from and to'],
      [/Jason Price's access was reset/, 'the reset'],
    ]) expect(words.test(history), `the history names ${what}`);
    await p.locator('[data-team-history]').scrollIntoViewIfNeeded();
    await shot(p, 'owner-history');

    // The signature page's link lands here.
    await p.goto(at('/admin/account/signature'), { waitUntil: 'networkidle', timeout: 180000 });
    const link = p.getByRole('link', { name: 'Open Team Access' });
    expect((await link.count()) === 1, 'the signature page offers Open Team Access');
    await link.click();
    await p.waitForURL((u) => u.pathname === TEAM, { timeout: 60000 }).catch(() => {});
    expect(p.url().replace(BASE, '') === TEAM, `Open Team Access lands on ${TEAM}`);
    await ctx.close();
  }

  // -------------------------------------------------------------- manager
  console.log('MANAGER');
  {
    const { ctx, p } = await open('manager:manager@example.dev');
    await p.goto(at(TEAM), { waitUntil: 'networkidle', timeout: 180000 });
    await p.locator('[data-team-screen="manager"]').waitFor({ timeout: 60000 });
    expect(await navHasTeam(p), 'Team is in the manager\'s navigation');
    expect(!(await navHasFees(p)), 'Your Fees is not');
    await closeSheet(p);
    const kevin = row(p, 'request', 'Kevin Brooks');
    const roles = await kevin.locator('select[data-approve-role] option').evaluateAll((os) => os.map((o) => o.value));
    expect(!roles.includes('owner') && roles.includes('sales'), `a manager is not offered Owner (${roles.join(', ')})`);
    expect(await p.locator('[data-owner-only-note]').isVisible(), 'the reason is on screen');
    const brenda = row(p, 'member', 'Brenda Ortiz de la Cruz');
    expect(await brenda.locator('[data-signing-toggle]').isDisabled(), 'Turn Signing Off is disabled for a manager');
    expect(await brenda.locator('[data-correct-name]').isDisabled(), 'Correct Name is disabled for a manager');
    const maria = row(p, 'member', 'Maria Lopez');
    expect(await maria.locator('[data-remove-access]').isDisabled(), 'a manager cannot remove an owner');
    await shot(p, 'manager-team');

    await force(brenda.locator('[data-signing-toggle]'));
    let a = await answer(p);
    console.log('  SIGNING', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'refused' && /Only an owner can change who is cleared to sign/.test(a.said), 'the server refuses a manager\'s clearance change');
    await shot(p, 'manager-signing-refused');

    await force(brenda.locator('[data-correct-name]'));
    const nameForm = brenda.locator('[data-correct-name-form]');
    await nameForm.waitFor({ timeout: 20000 });
    await nameForm.locator('input[name=firstName]').fill('Brenda');
    await nameForm.locator('input[name=lastName]').fill('Ortiz');
    await nameForm.locator('[data-save-name]').click();
    a = await answer(p);
    console.log('  NAME', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'refused' && /Only an owner can correct/.test(a.said), 'the server refuses a manager\'s name correction');
    await shot(p, 'manager-name-refused');

    await force(maria.locator('[data-remove-access]'));
    await hold(p, 'Remove');
    a = await answer(p);
    console.log('  OWNER ROW', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'refused' && /Only an owner can change an owner/.test(a.said), 'the server refuses a manager removing an owner');
    expect((await row(p, 'member', 'Brenda Ortiz de la Cruz').count()) === 1, 'the name is unchanged');

    // Approve Again, by a manager, into a role cleared by default: the
    // clearance an owner left stays, and no known password comes back.
    const rob = row(p, 'removed', 'Rob Hayes');
    await rob.scrollIntoViewIfNeeded();
    await rob.locator('select[data-approve-role]').selectOption('registration');
    expect((await rob.locator('[data-keeps-clearance]').getAttribute('data-keeps-clearance').catch(() => null)) === 'no', 'a manager is told Rob Hayes stays not cleared, as an owner left him');
    console.log('  KEEPS', JSON.stringify(await text(rob.locator('[data-keeps-clearance]'))));
    await rob.locator('[data-approve]').click();
    a = await answer(p);
    console.log('  APPROVE AGAIN', a.kind, JSON.stringify(a.said));
    expect(a.kind === 'ok' && /Approved as Registration/.test(a.said) && /Signing stays off, as an owner left it/.test(a.said), 'Rob Hayes approved again as Registration, signing kept off');
    expect(/old password no longer works/.test(a.said), 'his existing account\'s old password no longer works');
    expect(/^VG-/.test((await text(p.locator('[data-temporary-password]'))) || ''), 'a new temporary password is shown once for his existing account');
    await shot(p, 'manager-approve-again');
    await p.getByRole('button', { name: 'Done', exact: true }).click();
    expect(await eventually(async () => (await row(p, 'member', 'Rob Hayes').locator('[data-cleared]').getAttribute('data-cleared')) === 'no'), 'Rob Hayes is on the team, still not cleared to sign');
    expect(await eventually(async () => /manager@example\.dev approved Rob Hayes as Registration/.test(await text(p.locator('[data-team-history]')))), 'the history names the manager who approved him');
    await ctx.close();
  }

  // ----------------------------------- the approved member's first sign-in
  const signIn = async (email, password, label) => {
    const { ctx, p } = await open(null);
    await p.goto(at('/admin/login'), { waitUntil: 'networkidle', timeout: 180000 });
    await p.locator('input#email').fill(email);
    await p.locator('input#password').fill(password);
    await p.getByRole('button', { name: 'Sign In', exact: true }).click();
    await p.waitForURL(/\/admin\/account\/onboarding/, { timeout: 120000 }).catch(() => {});
    await p.waitForLoadState('networkidle').catch(() => {});
    const q = await text(p.locator('h1#onboarding-question'));
    console.log(`  ${label} SIGNED IN ->`, p.url().replace(BASE, ''), '::', JSON.stringify(q));
    return { ctx, p, q };
  };
  const choosePassword = async (p) => {
    await p.locator('input[name=password]').fill(NEW_PASSWORD);
    await p.locator('input[name=confirmPassword]').fill(NEW_PASSWORD);
    await p.getByRole('button', { name: 'Save Password', exact: true }).click();
    await p.locator('h1#onboarding-question').filter({ hasNotText: 'Choose A Password' }).waitFor({ timeout: 60000 });
  };
  /**
   * You Are All Set, then Start Working. A member who had finished onboarding
   * before (a reset) is sent to work by the page itself once nothing is left
   * to ask ("Done is done"), so leaving onboarding on its own also counts.
   */
  const finish = async (p, label) => {
    const done = p.locator('h1#onboarding-question').filter({ hasText: 'You Are All Set' });
    const left = () => !/\/admin\/account\/onboarding/.test(new URL(p.url()).pathname);
    const until = Date.now() + 60000;
    while (!left() && !(await done.isVisible().catch(() => false)) && Date.now() < until) await p.waitForTimeout(300);
    if (!left()) {
      await shot(p, `${label}-done`);
      await p.getByRole('button', { name: 'Start Working', exact: true }).click().catch(() => {});
    } else {
      console.log(`  ${label} sent straight to work (onboarding finished before)`);
    }
    await p.waitForURL((u) => !/onboarding/.test(u.pathname), { timeout: 120000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    console.log(`  ${label} AFTER START WORKING ->`, p.url().replace(BASE, ''));
    return p.url().replace(BASE, '');
  };

  console.log('APPROVED MEMBER');
  {
    const { ctx, p, q } = await signIn('diego.ramirez@example.test', temporary || 'no temporary password was shown', 'DIEGO');
    expect(/Choose A Password/.test(q), `the approved member's first sign-in meets Choose A Password (${JSON.stringify(q)})`);
    await shot(p, 'diego-choose-a-password');
    await choosePassword(p);
    await p.locator('h1#onboarding-question').filter({ hasText: 'What Is Your Name' }).waitFor({ timeout: 60000 });
    await p.locator('input[name=firstName]').fill('Diego');
    await p.locator('input[name=lastName]').fill('Ramirez');
    await shot(p, 'diego-name');
    await p.getByRole('button', { name: 'Next', exact: true }).click();
    await p.locator('h1#onboarding-question').filter({ hasNotText: 'What Is Your Name' }).waitFor({ timeout: 60000 });
    const next = await text(p.locator('h1#onboarding-question'));
    expect(!/Draw Your Signature/.test(next), `no signature screen for Sales, not cleared by default (${JSON.stringify(next)})`);
    expect(/^\/admin\/sales/.test(await finish(p, 'diego')), 'Done lands on Handle A Sale');
    await shot(p, 'diego-handle-a-sale');
    await ctx.close();
  }

  console.log('RESET MEMBER');
  {
    const { ctx, p, q } = await signIn('jason.price@example.test', 'his own password', 'JASON');
    expect(/Choose A Password/.test(q), `the reset member's next sign-in meets Choose A Password (${JSON.stringify(q)})`);
    await shot(p, 'jason-choose-a-password');
    await choosePassword(p);
    // The owner turned his signing on above and he has no signature yet, so
    // onboarding asks for one before Done; his name is not asked again.
    const after = await text(p.locator('h1#onboarding-question'));
    expect(/Draw Your Signature/.test(after), `signing turned on brings Draw Your Signature, never the name again (${JSON.stringify(after)})`);
    if (/Draw Your Signature/.test(after)) {
      const c = p.locator('canvas').first();
      await c.scrollIntoViewIfNeeded();
      const bx = await c.boundingBox();
      await p.mouse.move(bx.x + bx.width * 0.12, bx.y + bx.height * 0.62); await p.mouse.down();
      for (let k = 0; k <= 36; k++) await p.mouse.move(bx.x + bx.width * (0.12 + k * 0.02), bx.y + bx.height * (0.6 - 0.28 * Math.sin(k / 3)));
      await p.mouse.up();
      await shot(p, 'jason-signature');
      await p.getByRole('button', { name: 'Save Signature', exact: true }).click();
    }
    expect(/^\/admin\/sales/.test(await finish(p, 'jason')), 'then Done, and Handle A Sale');
    await ctx.close();
  }

  console.log('PAGE ERRORS', errors.length);
  expect(errors.length === 0, '0 page errors');
  console.log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 15)) console.log('  ', f);
  expect(failures.length === 0, '0 contrast failures');
  console.log(failed.length ? `TEAM WALK FAILED (${failed.length})` : 'TEAM WALK OK');
  if (failed.length) process.exitCode = 1;
  await b.close();
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); console.log('TEAM WALK FAILED (error)'); process.exit(1); });
