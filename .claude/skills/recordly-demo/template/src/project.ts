// Per-client values. This is the TEMPLATE copy (placeholders, never rendered): recordly-demo/scripts/new-project.sh
// overwrites it from the client's client-inputs.json (scripts/fill-client.cjs project). Edit that JSON, not this file.
// On-screen facts are limited to: www.example.com, (000) 000-0000, Street, City, Day – Day 0 AM – 0 PM.
export const project = {
  /** shown in the window's URL pill */
  domain: "example.com",
  /**
   * The URL pill for part B (the app / desk segment). The desk host is NOT on the confirmed fact list: leave null (the
   * pill then keeps the public domain) until the owner confirms the host may be shown.
   */
  partBDomain: null as string | null,
  /**
   * Part B (the sale desk, captures 6-12 of assets/storyboard-desk.json), or null for a part-A-only film. `cuts` are
   * frame numbers measured on THIS run's desk captures (references/verification.md, part B): the sign-in card's first
   * fully painted frame; 8's skeleton loader [last frame kept + 1, first painted "Which Car Is It?" frame]; 10's
   * [frame after the 100% dwell kept, first painted "How Are They Paying?" frame].
   */
  partB: null as PartB | null,
  /**
   * B6 (with a part B): the off-camera deal's filled Form 130-U page 1 at 300 dpi (pdftoppm -r 300), boxes [x, y, w, h]
   * in px of the PNG. The boxes are the TxDMV form's layout (house values, the same for every dealer): the seller band
   * (signature, printed name, date), the privacy blurs (box 14 licence number, box 1 VIN, box 38(a) money) and the
   * CERTIFICATION block the spotlight keeps lit. Re-measure only if TxDMV revises the form (Rev 01/25).
   */
  doc: {
    src: "docs/130u-p1.png",
    size: [2550, 3300],
    fileName: "130-U.pdf",
    page: 1,
    pages: 2,
    sellerBand: [392, 2860, 2000, 132],
    privacy: [
      [1722, 620, 210, 40],
      [78, 397, 452, 40],
      [1004, 2253, 258, 40],
    ],
    spotlight: [81, 2700, 2394, 410],
    caption: "Signed Once. On Every Title Application.",
  },
  /** public/ paths (copied from the site's public/brand) */
  mark: "brand/mark.png", // the image the site's loader shows (.loader__emblem img)
  logoReverse: "brand/logo-reverse.png", // full-colour logo that reads on the dark outro
  /** the word under the mark in the intro: the text of .loader__word */
  word: "BRAND",
  /**
   * The site's intro loader at the 1440 × 900 capture viewport, measured on the served build by scripts/measure-site.cjs
   * (getBoundingClientRect at rest). The intro sting is drawn in exactly this layout, stingMarkWidth / mark[2] times
   * larger, so it can land on the loader in a match cut.
   */
  loader: {
    viewport: [1440, 900],
    stage: [0, 0, 0, 0],
    mark: [0, 0, 0, 0],
    word: [0, 0, 0, 0],
    wordFont: { size: 30, lineHeight: 45, weight: 600, trackingEm: 0.5, color: "#FFFFFF" },
    /** hides the loader's mark and word inside the window until the sting has landed on them (the loader's background) */
    cover: [0, 0, 0, 0],
    coverColor: "#000000",
    /** the loader's mark and word are at rest this long after the capture starts (the sting lands one frame later) */
    wordDoneSec: 1.5,
  },
  /** the intro sting's mark width in frame px: the loader drawn 600/360 = 1.667 times larger (house-recipe.md §2) */
  stingMarkWidth: 600,
  /** outro lines (first line large): only confirmed facts */
  outroLines: ["www.example.com", "(000) 000-0000 · Street, City", "Day – Day 0 AM – 0 PM"],
  /** capture ids in public/shots/ used by the ShotPreview / PhonePreview compositions */
  sampleShot: "1-hero",
  samplePhoneShot: "5-phone",
} as const;

export type PartB = { cuts: { signinPainted: number; saleSkeleton: readonly [number, number]; readbackRelease: readonly [number, number] } };
