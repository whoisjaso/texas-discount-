// Per-project constants. The template ships placeholders; a project instance fills these in.
// Only facts the client has confirmed go on screen.
export const project = {
  /** shown in the window's URL pill */
  domain: "example.com",
  /** the URL pill for part B (e.g. an admin desk) once the client confirms its host may be shown; null keeps `domain` */
  partBDomain: null as string | null,
  /** public/ paths */
  mark: "brand/mark.png",
  logoReverse: "brand/logo-reverse.png",
  /** the word under the mark in the intro */
  word: "BRAND",
  /**
   * The site's own intro loader, if it has one and the first desktop shot shows it: measure it on the running site at
   * the capture viewport (getBoundingClientRect of the stage, the mark <img> and the word; the word's computed font) and
   * the Demo hands the intro sting off to it in a MATCH CUT. null = a plain sting that exits before the window enters.
   */
  loader: null as null | {
    viewport: readonly [number, number];
    stage: readonly [number, number, number, number];
    mark: readonly [number, number, number, number];
    word: readonly [number, number, number, number];
    wordFont: { size: number; lineHeight: number; weight: number; trackingEm: number; color: string };
    /** a patch (CSS px) that hides the loader's mark + word in the window until the sting lands; and its colour */
    cover: readonly [number, number, number, number];
    coverColor: string;
    /** seconds after capture start when the loader's mark and word are at rest (the landing must come after) */
    wordDoneSec: number;
  },
  /** the intro sting's mark width in frame px (with a loader, the sting is the loader scaled by markWidth / loader.mark[2]) */
  stingMarkWidth: 600,
  /** outro lines (first line large): only confirmed facts */
  outroLines: ["www.example.com", "(000) 000-0000 · Street, City", "Mon – Fri 9 AM – 5 PM"],
  /** capture ids in public/shots/ used by the preview compositions */
  sampleShot: "sample-desktop",
  samplePhoneShot: "sample-phone",
};
