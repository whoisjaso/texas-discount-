// A password reset signs out every device signed in before it.
// Usage: node reset.cjs <outDir> <width> <height> [dealPath]
//
// Run against a server started with DESK_PREVIEW_MEMBER=fresh-reset: the
// preview account then carries a password reset, fixed the first time it is
// read. Checks, in order:
//   1. the preview cookie alone (no signed-in time): sent to sign in with the
//      notice, in English and Spanish;
//   2. a signed-in time older than the reset: the same, and an API call from
//      that device answers 401;
//   3. signing in on the form: Choose A Password, then the desk.
// DESK_BASE picks the server (default http://localhost:5190).
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
const { BASE, guard, at } = require('./desk-base.cjs');
const { AUDIT } = require('./audit-fn.cjs');

(async () => {
  const [out, W, H, deal] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const host = new URL(BASE).hostname;
  const failures = []; const errors = [];
  let n = 0;
  const open = async (cookies) => {
    const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800 });
    await ctx.addCookies(cookies.map(([name, value]) => ({ name, value, domain: host, path: '/' })));
    await guard(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { errors.push(e.message.slice(0, 200)); console.log('PAGEERR', e.message.slice(0, 200)); });
    return { ctx, p };
  };
  const shot = async (p, label) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/reset-${String(n++).padStart(2, '0')}-${label}.png`, fullPage: true });
    for (const f of await p.evaluate(AUDIT)) failures.push(label + ': ' + f);
  };
  const notice = async (p) => ((await p.getByText(/password was reset/i).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ');

  // 1. The preview cookie alone.
  {
    const { ctx, p } = await open([['tj-local-admin-preview', 'owner:owner@example.dev']]);
    await p.goto(at('/admin/sales'), { waitUntil: 'networkidle', timeout: 180000 });
    console.log('NO SIGNED-IN TIME ->', p.url().replace(BASE, ''), '::', JSON.stringify(await notice(p)));
    await shot(p, 'no-signed-in-time');
    await ctx.close();
  }

  // 2. A signed-in time from before the reset.
  {
    const old = String(Date.now() - 24 * 60 * 60 * 1000);
    const { ctx, p } = await open([['tj-local-admin-preview', 'owner:owner@example.dev'], ['tj-local-admin-signed-in', old]]);
    await p.goto(at('/admin/sales'), { waitUntil: 'networkidle', timeout: 180000 });
    console.log('OLD SIGNED-IN TIME ->', p.url().replace(BASE, ''), '::', JSON.stringify(await notice(p)));
    await shot(p, 'old-signed-in-time');
    if (deal) {
      const r = await ctx.request.get(at(`/api/admin/sales/${deal.split('/').pop()}/packet-status`));
      console.log('STALE DEVICE API', r.status(), JSON.stringify(await r.json().catch(() => null)));
    }
    await ctx.close();
  }

  // 3. A fresh sign-in on the form: Choose A Password, then the desk.
  {
    const { ctx, p } = await open([]);
    await p.goto(at('/admin/login'), { waitUntil: 'networkidle', timeout: 180000 });
    await p.locator('input#email').fill('owner@example.dev');
    await p.locator('input#password').fill('preview-only');
    await p.getByRole('button', { name: 'Sign In', exact: true }).click();
    await p.waitForURL(/\/admin\/account\/onboarding/, { timeout: 120000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    const q = (await p.locator('h1#onboarding-question').innerText().catch(() => '')).replace(/\s+/g, ' ');
    console.log('AFTER SIGN-IN ->', p.url().replace(BASE, ''), '::', JSON.stringify(q));
    await shot(p, 'choose-a-password');
    await p.locator('input[name=password]').fill('a preview password of mine');
    await p.locator('input[name=confirmPassword]').fill('a preview password of mine');
    await p.getByRole('button', { name: 'Save Password', exact: true }).click();
    await p.locator('h1#onboarding-question').filter({ hasNotText: 'Choose A Password' }).waitFor({ timeout: 60000 });
    console.log('PASSWORD SAVED ->', JSON.stringify((await p.locator('h1#onboarding-question').innerText()).replace(/\s+/g, ' ')));
    await shot(p, 'after-password');
    await ctx.close();
  }

  console.log('PAGE ERRORS', errors.length);
  console.log('CONTRAST FAILURES', failures.length); for (const f of [...new Set(failures)].slice(0, 10)) console.log('  ', f);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
