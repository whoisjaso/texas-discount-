// Discount Used Cars and Trucks (Houston): the facts this film may show, and its assets.
// On-screen facts are limited to: the web address, (713) 900-5050, 8108 Gulf Fwy, Houston, Tue – Sat 10 AM – 7 PM;
// part B adds the desk host desk.discountusedcarsandtrucks.com, GDN P145000 and Discount Used Cars And Trucks, LLC.
export const project = {
  /** shown in the window's URL pill */
  domain: "discountusedcarsandtrucks.com",
  /**
   * The URL pill for part B (the sale desk): the desk host being set up on the owner's domain
   * (clients/discount-used-cars-desk/.env.example, README). It is on the film's allowed fact list.
   */
  partBDomain: "desk.discountusedcarsandtrucks.com" as string | null,
  /**
   * Part B (the sale desk, captures 6-12 of the desk storyboard), or null for a part-A-only film. `cuts` are frame
   * numbers measured on THIS run's desk captures (the desk's paint timing varies with the machine), read from each
   * capture's frames (recordly-demo references/verification.md, part B): the sign-in card's first fully painted frame;
   * 8's skeleton loader [last frame kept + 1, first painted "Which Car Is It?" frame]; 10's [frame after the 100% dwell
   * kept, first painted "How Are They Paying?" frame].
   */
  partB: { cuts: { signinPainted: 12, saleSkeleton: [42, 55], readbackRelease: [108, 134] } } as PartB | null,
  /**
   * B6 (with a part B): the off-camera deal's filled Form 130-U, page 1 at 300 dpi (pdftoppm -r 300 of 130-U_Carter_812345.pdf from
   * the packet). Boxes are [x, y, w, h] in px of the PNG. The seller band holds Maria Lopez's drawn signature (the same
   * strokes as B2), the printed name "Discount Used Cars And Trucks, LLC (Maria Lopez)", the date and the labels.
   * `privacy`: identity and money on the page, always under a privacy blur.
   */
  doc: {
    src: "docs/130u-p1.png",
    size: [2550, 3300],
    fileName: "130-U_Carter_812345.pdf",
    page: 1,
    pages: 2,
    sellerBand: [392, 2860, 2000, 132],
    // identity and money under a privacy blur at every frame: box 14 (the buyer's licence number), box 1 (the VIN) and
    // box 38(a) ("$ 3663.06", from y 2253, below the SALES AND USE TAX COMPUTATION header, which ends at y 2247)
    privacy: [
      [1722, 620, 210, 40],
      [78, 397, 452, 40],
      [1004, 2253, 258, 40],
    ],
    /** the CERTIFICATION block, heading to the applicant's line: lit while the rest of the page dims */
    spotlight: [81, 2700, 2394, 410],
    caption: "Signed Once. On Every Title Application.",
  },
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

export type PartB = { cuts: { signinPainted: number; saleSkeleton: readonly [number, number]; readbackRelease: readonly [number, number] } };
