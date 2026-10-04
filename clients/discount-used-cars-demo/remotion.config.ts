import fs from "fs";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setCrf(16); // masters: platforms re-compress, give headroom (and less banding in dark gradients)
// Shots are 2880x1800 videos: keep parallel tabs modest so frame extraction does not starve.
Config.setConcurrency(3);

// Cloud containers have no Chrome download: use Playwright's headless shell when it exists
// (same as passing --browser-executable=/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell).
const headlessShell = (() => {
  try {
    const dir = fs.readdirSync("/opt/pw-browsers").find((n) => n.startsWith("chromium_headless_shell-"));
    return dir ? `/opt/pw-browsers/${dir}/chrome-linux/headless_shell` : null;
  } catch {
    return null;
  }
})();
if (headlessShell) Config.setBrowserExecutable(headlessShell);
