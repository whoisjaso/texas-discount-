// Screenshot a built public site at desktop and phone sizes, the way a person
// would see it after the intro loader. Usage:
//   PWPATH=$(npm root -g)/playwright node site_screens.cjs <outDir> [baseUrl] [/path ...]
// Defaults: baseUrl http://localhost:5181, paths / /inventory /glass /financing /visit.
// Home is captured one viewport at a time down the page; other paths at the top
// and one screen down. Reveal animations are forced visible so nothing is
// captured mid-fade. Set CHROME_PATH if Playwright cannot find Chromium.
const { chromium } = require(process.env.PWPATH || 'playwright');
const fs = require('fs');

(async () => {
  const [out, base = 'http://localhost:5181', ...rest] = process.argv.slice(2);
  const paths = rest.length ? rest : ['/inventory', '/glass', '/financing', '/visit'];
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const [w, h, t] of [[1440, 900, 'd'], [390, 844, 'm']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    // Skip the once-per-session intro so every shot shows the page itself.
    // INTRO_KEY = the Loader's SEEN_KEY in src/components/Loader.tsx.
    await ctx.addInitScript((key) => { try { sessionStorage.setItem(key, '1'); } catch {} }, process.env.INTRO_KEY || 'vegas.intro.seen');
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('PAGEERR', e.message));
    const reveal = () => p.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-visible')));

    await p.goto(base + '/', { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    await reveal();
    const H = await p.evaluate(() => document.body.scrollHeight);
    for (let i = 0; i < Math.ceil(H / h); i++) {
      await p.evaluate((y) => window.scrollTo(0, y), i * h);
      await p.waitForTimeout(900);
      await p.screenshot({ path: `${out}/${t}-home-${String(i).padStart(2, '0')}.png` });
    }
    for (const path of paths) {
      await p.goto(base + path, { waitUntil: 'load' });
      await p.waitForTimeout(1800);
      await reveal();
      const name = path.replace(/[^a-z0-9]+/gi, '_');
      await p.screenshot({ path: `${out}/${t}-page${name}.png` });
      await p.evaluate(() => window.scrollTo(0, window.innerHeight * 0.9));
      await p.waitForTimeout(900);
      await p.screenshot({ path: `${out}/${t}-page${name}-2.png` });
    }
    await ctx.close();
  }
  await b.close();
  console.log('screens in', out);
})();
