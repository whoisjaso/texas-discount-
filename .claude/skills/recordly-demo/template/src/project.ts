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
