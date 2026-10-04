// Bundle once, render many stills: node scripts/stills.cjs out/stills Intro:12,30,55 ShotPreview:5,80 ...
// (verification loop of the remotion-motion-graphics skill; deletes its webpack bundle when done)
const path = require('path');
const fs = require('fs');
const { bundle } = require('@remotion/bundler');
const { renderStill, selectComposition } = require('@remotion/renderer');

const headlessShell = (() => {
  try {
    const d = fs.readdirSync('/opt/pw-browsers').find((n) => n.startsWith('chromium_headless_shell-'));
    return d ? `/opt/pw-browsers/${d}/chrome-linux/headless_shell` : undefined;
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
