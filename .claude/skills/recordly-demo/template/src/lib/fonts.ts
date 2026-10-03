// Loads the brand face from public/fonts once per render tab, holding the render until it is ready. A face that
// fails to load cancels the render: a film silently set in the fallback font is worse than no film.
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
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
    .catch((err) => cancelRender(err));
};

ensureFonts();
