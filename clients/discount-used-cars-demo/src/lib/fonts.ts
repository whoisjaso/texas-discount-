// Loads the brand face from public/fonts once per render tab, holding the render until it is ready.
import { continueRender, delayRender, staticFile } from "remotion";
import { theme } from "../theme";

let started = false;

export const ensureFonts = () => {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("Loading brand fonts");
  Promise.all(
    theme.fonts.files.map((f) =>
      new FontFace(theme.fonts.display, `url(${staticFile(f.file)}) format("woff2")`, {
        weight: String(f.weight),
        style: "normal",
      })
        .load()
        .then((face) => document.fonts.add(face)),
    ),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error("Font load failed", err);
      continueRender(handle);
    });
};

ensureFonts();
