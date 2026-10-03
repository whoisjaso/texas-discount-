import fs from "fs";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setCrf(16); // masters: platforms re-compress, give headroom (and less banding in dark gradients)
// Shots are 2880x1800 videos: keep parallel tabs modest so frame extraction does not starve.
Config.setConcurrency(3);

// Use Playwright's headless shell when it exists: HEADLESS_SHELL, else the first chromium_headless_shell-* under
// PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers). Without one, Remotion downloads its own Chrome on first use
// (`npx remotion browser ensure`, only with the user's OK; recordly-demo scripts/setup.sh --check).
const headlessShell = (() => {
  if (process.env.HEADLESS_SHELL && fs.existsSync(process.env.HEADLESS_SHELL)) return process.env.HEADLESS_SHELL;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    const dir = fs.readdirSync(root).find((n) => n.startsWith("chromium_headless_shell-"));
    return dir ? `${root}/${dir}/chrome-linux/headless_shell` : null;
  } catch {
    return null;
  }
})();
if (headlessShell) Config.setBrowserExecutable(headlessShell);
