// Bundle once, render many stills: node scripts/stills.cjs out/stills Intro:12,30,55 ShotPreview:5,80 ...
// (verification loop of the remotion-motion-graphics skill; deletes its webpack bundle when done)
const path = require('path');
const fs = require('fs');
const { bundle } = require('@remotion/bundler');
const { renderStill, selectComposition } = require('@remotion/renderer');

// HEADLESS_SHELL, else Playwright's headless shell under PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers)
const headlessShell = (() => {
  if (process.env.HEADLESS_SHELL && fs.existsSync(process.env.HEADLESS_SHELL)) return process.env.HEADLESS_SHELL;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const d = fs.readdirSync(root).find((n) => n.startsWith('chromium_headless_shell-'));
    return d ? `${root}/${d}/chrome-linux/headless_shell` : undefined;
  } catch {
    return undefined;
  }
})();

(async () => {
  const [outDir, ...specs] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.resolve(__dirname, '../src/index.ts') });
  try {
    for (const spec of specs) {
      const [id, frames, propsJson] = spec.split(':');
      const inputProps = propsJson ? JSON.parse(Buffer.from(propsJson, 'base64').toString()) : {};
      const composition = await selectComposition({ serveUrl, id, inputProps, browserExecutable: headlessShell });
      for (const f of frames.split(',').map(Number)) {
        const output = path.join(outDir, `${id}_${String(f).padStart(4, '0')}.png`);
        await renderStill({ composition, serveUrl, output, frame: f, inputProps, browserExecutable: headlessShell, overwrite: true });
        console.log(output);
      }
    }
  } finally {
    fs.rmSync(serveUrl, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
