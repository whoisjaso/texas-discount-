// Discount Used Cars and Trucks (Houston): the facts this film may show, and its assets.
// On-screen facts are limited to: the web address, (713) 900-5050, 8108 Gulf Fwy, Houston, Tue – Sat 10 AM – 7 PM.
export const project = {
  /** shown in the window's URL pill */
  domain: "discountusedcarsandtrucks.com",
  /**
   * The URL pill for part B (the sale desk). The desk host is NOT on the confirmed fact list: leave null (the pill then
   * keeps the public domain) until the owner confirms the host may be shown, e.g. "desk.discountusedcarsandtrucks.com".
   */
  partBDomain: null as string | null,
  /** public/ paths (copied from clients/discount-used-cars-site/public/brand) */
  mark: "brand/discount-mark.png", // the red car swoosh, 640 × 87
  logoReverse: "brand/discount-logo-reverse.png", // full-colour logo for dark backgrounds, 1402 × 540
  /** the word under the mark in the intro, set wide */
  word: "DISCOUNT",
  /**
   * The site's intro loader (src/components/Loader.tsx + .loader__* in global.css) at the 1440 × 900 capture
   * viewport, measured on the running preview (getBoundingClientRect). The intro sting is drawn in exactly this layout,
   * 600/360 times larger, so it can land on the loader in a match cut.
   */
  loader: {
    /** the capture viewport these rects were measured at (shots 1–4: 1440 × 900 CSS px, DSF 2) */
    viewport: [1440, 900],
    stage: [540, 378.53, 360, 142.94],
    mark: [540, 378.53, 360, 48.94],
    word: [607.5, 451.47, 240, 45],
    wordFont: { size: 30, lineHeight: 45, weight: 600, trackingEm: 0.5, color: "#FFFFFF" },
    /** hides the loader's mark and word inside the window until the sting has landed on them (the loader is #000) */
    cover: [520, 366, 400, 136],
    coverColor: "#000000",
    /** the loader's word has finished rising 1.5 s after the capture starts; its curtain lifts at 2.2 s */
    wordDoneSec: 1.5,
  },
  stingMarkWidth: 600,
  /** outro lines (first line large) */
  outroLines: ["www.discountusedcarsandtrucks.com", "(713) 900-5050 · 8108 Gulf Fwy, Houston", "Tue – Sat 10 AM – 7 PM"],
  /** capture ids in public/shots/ used by the preview compositions */
  sampleShot: "1-hero",
  samplePhoneShot: "5-phone",
} as const;
