// Download every filed PDF of a packet via the packet screen's own Open/Print links.
const { chromium } = require(process.env.PWPATH);
const fs = require('fs');
(async () => {
  const [out, deal] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await b.newContext();
  await ctx.addCookies([{ name: 'tj-local-admin-preview', value: process.env.PREVIEW_ADMIN || 'owner:owner@example.dev', domain: 'localhost', path: '/' }]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5190' + deal + '/packet', { waitUntil: 'networkidle', timeout: 180000 });
  const links = await p.$$eval('a', (as) => as.map((a) => ({ t: a.innerText.trim(), h: a.getAttribute('href') })).filter((x) => x.h && /\/api\/documents\/agreements\/[^/]+\/pdf/.test(x.h)));
  const seen = new Set();
  for (const { h } of links) {
    const id = h.match(/agreements\/([^/]+)\/pdf/)[1]; if (seen.has(id)) continue; seen.add(id);
    const r = await ctx.request.get('http://localhost:5190' + h, { timeout: 180000 });
    const buf = await r.body();
    const name = (r.headers()['content-disposition'] || '').match(/filename="?([^";]+)/)?.[1] || id + '.pdf';
    fs.writeFileSync(`${out}/${name}`, buf);
    console.log(r.status(), r.headers()['content-type'], buf.length, name);
  }
  await b.close();
})();
