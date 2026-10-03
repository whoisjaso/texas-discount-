// The narrated long cut ("Narrated"): the running order, laid out against the voice.
//
// The voice drives the edit. Every line is placed by an anchor: one of its words (faster-whisper word timestamps,
// vo-lines.ts) lands on a frame of the picture that shows what the word names (a capture frame of a desktop segment,
// or a moment of an overlay). The captures were made for these lines (narration/storyboard-long.json), so the gaps
// between lines come out natural; holds (a capture frame held as a still) absorb what is left. scripts/narrated-check.cjs
// prints the table: every line, its gap to the previous one, and its key words with the picture under them.
//
//   intro sting ⇢ site (1-hero, 2-scroll, 3-buy, 4-menu: lines 01-04) → sign-in and onboarding (6, 7: 04-06)
//   → Handle A Sale (8a) → the car, odometer, language, title (20-car: 07-09) → the licence scan, the address that
//   fills itself, the read-back and Hold To Confirm (21-buyer: 10-13) → Cash, the price, tax and fees, the balance
//   (22-money: 13-15) → [doc A: the bill of sale's seller lien, then the 130-U's lienholder: 16] → who files, plate,
//   who signs, inspection, insurance (23-plan: 17-18) → [doc B: the 130-U, county and the seller line: 19-21]
//   → the packet's code (24-desk-qr: 22) → [the buyer signs on the phone: 22-23] → 2 / 2 signed, Past Sales, search,
//   the packet (27-desk-stored: 23) → [doc C: the signed bill of sale] → outro (24).
import { theme } from "../theme";
import { project } from "../project";
import { DesktopSegment } from "../scenes/DesktopScene";
import { partASegments, partBSegments } from "../demo/timeline";
import { VO_LINES, VoLine } from "./vo-lines";

const fps = theme.fps;
const sec = (s: number) => Math.round(s * fps);
const S = theme.sfx;
const DESK = project.partBDomain ?? project.domain;

export type Seg = DesktopSegment & { key: string };

/** capture frames [a, b) of a desk capture */
const cap = (key: string, shot: string, a: number, b: number, more: Partial<DesktopSegment> = {}): Seg => ({
  key,
  shot,
  url: DESK,
  trimSec: a / fps,
  durationInFrames: b - a,
  ...more,
});
/** capture frame f held as a still for n frames */
const hold = (key: string, shot: string, f: number, n: number, url: string = DESK): Seg => ({ key, shot, url, trimSec: f / fps, durationInFrames: n, hold: true });
/**
 * The click (by index among the capture's clicks) whose ring was running when the previous segment ended (on capture
 * frame `lastShown`), moved so that it runs on across the cut from `start`, the next segment's first frame.
 */
const ringOn = (index: number, clickFrame: number, lastShown: number, start: number) => ({
  type: "click" as const,
  index,
  frame: start - (lastShown - clickFrame) - 1,
});


// ---- holds that let a line finish on its picture (frames), tuned against the table the check script prints
export const HOLDS = {
  finder: sec(0.3), // 2-scroll: the typed F-150, zoomed, while "knowing what they want" finishes
  signature: sec(0.6), // 7: the finished signature at 1.8x, "Remember that signature"
};

const A = partASegments;
const B = partBSegments;
const seg7 = B[1];

const SEGMENTS: Seg[] = [
  // ---- the site (shots 1-4 as approved; 2-scroll loses its visit-card stop so the finder follows the lineup)
  { ...A[0], key: "1" },
  // the visit card's zoom (index 1) would start on 2a's last frames: silenced (2b joins on the same scroll position)
  { shot: "2-scroll", key: "2a", durationInFrames: 264, zoomFocus: { 1: { point: [400, 422], depth: 1 } } },
  // the pointer stays hidden across the cut (both sides are in self-scrolls; the skipped stretch is spanned)
  {
    shot: "2-scroll",
    key: "2b",
    trimSec: 366 / fps,
    durationInFrames: 469 - 366 + 1,
    edit: { addEvents: [{ type: "scroll", frame: 264, endFrame: 366, fromY: 2949, toY: 2949, cursor: "hide" }] },
  },
  hold("2h", "2-scroll", 469, HOLDS.finder, project.domain),
  { shot: "2-scroll", key: "2c", trimSec: 470 / fps, durationInFrames: 40 },
  { ...A[2], key: "3" },
  // 4-menu ends 1 s earlier than in Demo (the Admin row is held 1.3 s at 1.8x, not 2.3 s); the Admin click is drawn
  // 6 frames before the cut, as withCutClick does at 180
  { ...A[3], key: "4", durationInFrames: 135, edit: { addClicks: [{ frame: 129 }] } },
  // ---- sign in once (part B's 6 and 7; 7 holds on the finished signature)
  // the sign-in loses most of the (privacy-blurred) email typing: the pointer is hidden by the typing on both sides
  { ...B[0], key: "6", durationInFrames: 60 - 12 },
  { ...B[0], key: "6b", trimSec: 66 / fps, durationInFrames: 125 - 66, cues: [] },
  { ...seg7, key: "7a", durationInFrames: 182, eventCues: (seg7.eventCues ?? []).filter((c) => c.type === "draw") },
  hold("7h", "7-desk-onboard", 181, HOLDS.signature),
  { ...seg7, key: "7b", trimSec: 182 / fps, durationInFrames: 245 - 182, eventCues: (seg7.eventCues ?? []).filter((c) => c.type !== "draw") },
  { ...B[2], key: "8a" },
  // ---- the car: the Camry, the odometer corrected, Spanish then English, the title (Start A Sale's ring runs on)
  // ends on the title step's Next (the name and phone steps that follow are cut: 21 opens on the licence)
  cap("20", "20-car", 0, 999, {
    edit: { addClicks: [{ frame: -4 }] },
    // the whole lot (both columns) with the Camry under the pointer; the odometer step without its Next; the car line, the
    // odometer and the language with its menu
    zoomFocus: { 0: { point: [720, 600], depth: 2.0 }, 1: { point: [720, 440], depth: 2.0 }, 2: { point: [720, 552], depth: 2.1 } },
  }),
  // ---- the buyer: the scan (front, back, the barcode read), the number filled in, the address, the county,
  // the read-back and Hold To Confirm. The blank frames between the scanner and the form, and between the steps,
  // are cut out; each click's ring runs on across its cut.
  // the pointer glides from the Clean title tap (20's last frame) into 21's path to Scan ID
  cap("21a", "21-buyer", 0, 92, { zoomShift: { 0: { startSec: 6 / fps } }, }),
  cap("21b", "21-buyer", 97, 230, {
    zoomShift: { 0: { startSec: 6 / fps } },
    zoomFocus: { 0: { point: [720, 571], depth: 1.6 } }, // the card pictures to the ID number (Scan ID just out of frame)
    edit: { moveEvents: [ringOn(3, 89, 91, 97)] },
  }),
  cap("21c", "21-buyer", 234, 875, {
    zoomFocus: { 1: { point: [720, 550], depth: 1.5 }, 2: { point: [720, 600], depth: 2.2 }, 3: { point: [720, 460], depth: 2.0 } }, // 3: the read-back (the page's heading just out of frame)
    edit: {
      moveEvents: [ringOn(4, 227, 229, 234), { type: "hold", index: 0, endFrame: 873 }],
      nudge: { dx: 45, dy: 0, in: [752, 766], out: [880, 890] },
    },
    eventCues: [
      { type: "hold", index: 0, file: S.click.file, db: S.click.db, offsetSec: -S.click.leadSec },
      { type: "hold", index: 0, file: S.holdRise.file, db: S.holdRise.db },
      { type: "hold", index: 0, at: "end", file: S.tap.file, db: S.tap.db, offsetSec: -S.tap.leadSec },
    ],
  }),
  // ---- the money (the licence review the guide asks next was confirmed off camera: a jump-cut to How Are They Paying?)
  // the read-back's 2.0x camera and the pressed-off-the-label pointer run on across the cut, then ease back
  cap("22a", "22-money", 0, 142, {
    zoomFocus: { 0: { point: [720, 445], depth: 1.8 } },
    edit: {
      nudge: { dx: 45, dy: 0, in: [-2, -1], out: [6, 22] },
      addZooms: [{ startFrame: -45, inFrames: 45, outFrame: 0, outFrames: 30, depth: 2.0, follow: false, focus: { point: [720, 460] }, sfx: false }],
    },
  }),
  cap("22b", "22-money", 146, 500, { edit: { moveEvents: [ringOn(0, 137, 141, 146)] }, zoomFocus: { 0: { point: [720, 445], depth: 1.8 } } }),
  cap("22c", "22-money", 503, 856, {
    edit: {
      moveEvents: [ringOn(3, 497, 499, 503)],
      addZooms: [{ startFrame: 650, inFrames: 45, outFrame: 810, outFrames: 30, depth: 2.05, follow: false, focus: { point: [720, 624.5] }, sfx: false }],
    },
    zoomShift: { 0: { outSec: 3 / fps }, 1: { startSec: 3 / fps } },
    // the receipt's rows (J), then a pan down to the total and the balance owed (K, Next in frame), then a slight push in
    // as the amount handed over is typed (K2: the field in, Next out)
    zoomFocus: { 0: { point: [720, 445], depth: 1.8 }, 1: { point: [720, 420], depth: 2.0 }, 2: { point: [720, 640], depth: 2.0 } },
  }),
  hold("22h", "22-money", 855, 0), // doc A (its length is set below)
  // ---- the plan
  cap("23a", "23-plan", 0, 291, { zoomFocus: { 0: { point: [720, 470], depth: 1.45 } } }),
  cap("23b", "23-plan", 296, 332, { edit: { moveEvents: [ringOn(0, 284, 290, 296)] }, zoomFocus: { 0: { point: [720, 470], depth: 1.45 } } }),
  cap("23c", "23-plan", 336, 367, { edit: { moveEvents: [ringOn(1, 326, 331, 336)] }, zoomFocus: { 0: { point: [720, 470], depth: 1.45 } } }),
  cap("23d", "23-plan", 371, 637, { edit: { moveEvents: [ringOn(2, 362, 366, 371)] }, zoomFocus: { 0: { point: [720, 470], depth: 1.45 } } }),
  cap("23e", "23-plan", 640, 671, { edit: { moveEvents: [ringOn(3, 632, 636, 640)] }, zoomFocus: { 0: { point: [720, 470], depth: 1.45 } } }),
  hold("23h", "23-plan", 670, 0), // doc B
  // ---- signed and stored
  cap("24", "24-desk-qr", 0, 62, { zoomFocus: { 0: { point: [575, 520], depth: 2.82 } } }), // the Scan To Sign card: code, words, Open here
  hold("24h", "24-desk-qr", 61, 0), // the phone
  cap("27a", "27-desk-stored", 20, 103, {
    zoomFocus: { 0: { point: [720, 356], depth: 1.62 } },
    eventCues: [{ type: "zoom", index: 0, at: "end", file: S.success.file, db: S.success.db, offsetSec: -0.2 }],
  }),
  cap("27b", "27-desk-stored", 112, 166, { edit: { moveEvents: [ringOn(0, 99, 102, 112)] } }),
  cap("27c", "27-desk-stored", 175, 295, { edit: { moveEvents: [ringOn(1, 162, 165, 175)] }, zoomFocus: { 1: { point: [800, 330], depth: 1.35 } } }),
  cap("27d", "27-desk-stored", 298, 348, { edit: { moveEvents: [ringOn(2, 294, 294, 298)] }, zoomShift: { 1: { outSec: 3 / fps } }, zoomFocus: { 1: { point: [800, 330], depth: 1.35 } } }),
  hold("27h", "27-desk-stored", 347, 0), // doc C
];

// ---- the voice: each line's anchor word on its picture
type Anchor =
  | { seg: string; capture: number } // a capture frame of a desktop segment
  | { overlay: string; at: number } // seconds into an overlay
  | { outro: number } // seconds into the outro
  | { gap: number }; // after the previous line, this many seconds of silence
type LinePlan = { id: string; word: number; anchor: Anchor; why: string };

const word = (id: string, w: string, nth = 0): number => {
  const line = VO_LINES.find((l) => l.id === id)!;
  const hits = line.words.map((x, i) => [x[0].toLowerCase().replace(/[^a-z0-9'-]/g, ""), i] as const).filter(([x]) => x === w.toLowerCase());
  if (!hits[nth]) throw new Error(`no word "${w}" in ${id}`);
  return hits[nth][1];
};

export const LINES: LinePlan[] = [
  { id: "01-site-a", word: word("01-site-a", "freeway"), anchor: { seg: "1", capture: 166 }, why: "the headline, zoomed: '... At 8108 Gulf Freeway'" },
  { id: "02-site-b", word: word("02-site-b", "truck"), anchor: { seg: "2a", capture: 92 }, why: "the lineup lands: trucks, cars, SUVs" },
  { id: "03-site-c", word: word("03-site-c", "trade"), anchor: { seg: "3", capture: 90 }, why: "We Buy Trucks, zoomed" },
  { id: "04-signin-a", word: word("04-signin-a", "desk"), anchor: { seg: "4", capture: 128 }, why: "Admin · Staff Sign-In To The Sale Desk" },
  { id: "05-signin-b", word: word("05-signin-b", "type"), anchor: { seg: "7a", capture: 14 }, why: "the first name is clicked and typed" },
  { id: "06-signin-c", word: word("06-signin-c", "signature"), anchor: { seg: "7a", capture: 170 }, why: "the signature's last stroke, at 1.8x" },
  { id: "07-car-a", word: word("07-car-a", "pick"), anchor: { seg: "20", capture: 4 }, why: "the pointer heads for the Camry" },
  { id: "08-car-b", word: word("08-car-b", "correct"), anchor: { seg: "20", capture: 352 }, why: "the odometer is clicked to be corrected (the click 0.2 s after the word)" },
  { id: "09-car-c", word: word("09-car-c", "spanish", 1), anchor: { seg: "20", capture: 630 }, why: "the language menu opens: Español, then English" },
  { id: "10-buyer-a", word: word("10-buyer-a", "scan"), anchor: { seg: "21a", capture: 5 }, why: "Scan ID" },
  { id: "11-buyer-b", word: word("11-buyer-b", "street"), anchor: { seg: "21c", capture: 285 }, why: "the street is typed" },
  { id: "12-buyer-c", word: word("12-buyer-c", "county"), anchor: { seg: "21c", capture: 452 }, why: "the county field, zoomed" },
  { id: "13-buyer-d", word: word("13-buyer-d", "hold"), anchor: { seg: "21c", capture: 765 }, why: "Hold To Confirm is pressed (the press 0.17 s after the word)" },
  { id: "14-money-a", word: word("14-money-a", "advertise"), anchor: { seg: "22b", capture: 190 }, why: "How Much Are They Paying?" },
  { id: "15-money-b", word: word("15-money-b", "inside"), anchor: { seg: "22b", capture: 490 }, why: "No: tax and fees go on top" },
  { id: "16-money-c", word: word("16-money-c", "owing"), anchor: { overlay: "docA", at: 0.75 }, why: "the bill of sale opens" },
  { id: "17-plan-a", word: word("17-plan-a", "tap"), anchor: { seg: "23a", capture: 90 }, why: "the pointer reaches We Do" },
  { id: "18-plan-b", word: word("18-plan-b", "yours"), anchor: { seg: "23d", capture: 540 }, why: "the pointer on We Are Doing It (done, yours, theirs: on each answer as it is said)" },
  { id: "19-payoff-a", word: word("19-payoff-a", "county"), anchor: { overlay: "docB", at: 0.35 }, why: "the 130-U opens" },
  { id: "20-payoff-b", word: word("20-payoff-b", "seller"), anchor: { overlay: "docB", at: -1 }, why: "after 19 (placed by gap)" },
  { id: "21-payoff-c", word: word("21-payoff-c", "signed"), anchor: { overlay: "docB", at: -1 }, why: "after 20 (placed by gap)" },
  { id: "22-stored-a", word: word("22-stored-a", "code"), anchor: { seg: "24", capture: 54 }, why: "the packet's Scan To Sign code, zoomed" },
  { id: "23-stored-b", word: word("23-stored-b", "search"), anchor: { seg: "27c", capture: 241 }, why: "'Carter' typed into Past Sales" },
  { id: "24-close", word: word("24-close", "discount"), anchor: { outro: 0.0 }, why: "the outro" },
];
/** natural gaps the lines placed by gap use (seconds between one line's end and the next one's start) */
const GAP = { "20-payoff-b": 0.65, "21-payoff-c": 0.6 } as Record<string, number>;

// ---- overlays over held desk frames
export type DocKey = { at: number; x: number; y: number; ds: number; dur?: number; landY?: number };
export type DocSpot = { from: number; to: number; box: [number, number, number, number] };
export type DocSpec = {
  src: string;
  size: [number, number];
  fileName: string;
  page: number;
  pages: number;
  privacy: [number, number, number, number][];
  keys: DocKey[];
  spots: DocSpot[];
  caption?: { text: string; at: number; exitAt: number };
  /** seconds into the overlay when this window starts to open and to close */
  openAt: number;
  closeAt: number;
  offset?: [number, number];
};
export type Overlay = { key: string; hold: string; from: number; durationInFrames: number; docs?: DocSpec[]; phone?: PhoneSpec };
export type PhoneSpec = {
  /** [shot, first, last exclusive] capture ranges played in order */
  parts: [string, number, number][];
  /** a finger flick drawn where the capture scrolled an inner sheet by script: [shot, frame, frames, x, y0, y1] */
  flicks: [string, number, number, number, number, number][];
  /** frames the last capture frame is held, under the exit */
  tail: number;
};

const vo = (id: string) => VO_LINES.find((l) => l.id === id) as VoLine;
const w = (id: string, name: string, nth = 0) => vo(id).words[word(id, name, nth)][1];

const U130 = { src: "docs/narr-130u-p1.png", size: [2550, 3300] as [number, number], fileName: "130-U_Carter_812345.pdf", page: 1, pages: 2 };
const U130_PRIVACY: [number, number, number, number][] = [
  [84, 397, 445, 44], // box 1, the VIN
  [1722, 620, 210, 45], // box 14, the licence number
];

/** doc A, laid against line 16 (t = seconds into the overlay; L16 starts at `l16`) */
const docA = (l16: number, len: number): DocSpec[] => {
  const t = (name: string) => l16 + w("16-money-c", name);
  return [
    {
      src: "docs/narr-bos-p2.png",
      size: [2550, 3300],
      fileName: "Discount_BillOfSale_James_Carter_20261002.pdf",
      page: 2,
      pages: 4,
      privacy: [],
      openAt: 0,
      closeAt: len - 0.45,
      keys: [
        { at: t("owing") - 0.35, x: 1275, y: 930, ds: 0.7, dur: 1.2 }, // the itemization (the page's full width): total, balance secured by seller lien
        { at: t("bill") - 0.2, x: 1276, y: 2190, ds: 0.66, dur: 1.2 }, // the Seller Lien / Balance Owed section
      ],
      spots: [
        { from: t("owing") - 0.35, to: t("bill") - 0.2, box: [150, 835, 1100, 195] },
        { from: t("bill") - 0.2, to: len, box: [150, 1880, 2250, 610] },
      ],
    },
    {
      ...U130,
      privacy: U130_PRIVACY,
      openAt: t("title") - 0.35,
      closeAt: len - 0.45,
      offset: [56, 26],
      keys: [{ at: t("name") - 0.3, x: 1276, y: 1860, ds: 0.74, dur: 1.3 }], // box 33 first lien date, box 34 the dealership as lienholder
      spots: [{ from: t("name") - 0.3, to: len, box: [70, 1742, 2410, 240] }],
    },
  ];
};

/** doc B, laid against lines 19-21 (their starts in seconds into the overlay) */
const docB = (l19: number, l20: number, l21: number, len: number): DocSpec => {
  const a = (name: string, nth = 0) => l19 + w("19-payoff-a", name, nth);
  const b = (name: string, nth = 0) => l20 + w("20-payoff-b", name, nth);
  return {
    ...U130,
    privacy: U130_PRIVACY,
    openAt: 0,
    closeAt: len - 0.45,
    keys: [
      { at: a("county") - 0.45, x: 1276, y: 1121, ds: 0.72, dur: 1.3 }, // box 18 mailing address + box 19 county: Harris
      { at: b("seller") - 0.35, x: 1278, y: 2905, ds: 0.8, dur: 1.3 }, // the certification block
      { at: b("prints") - 0.1, x: 1700, y: 2921, ds: 1.22, dur: 1.2 }, // "Discount Used Cars And Trucks, LLC (Maria Lopez)"
      { at: b("with") - 0.15, x: 600, y: 2905, ds: 1.6, dur: 1.1 }, // her signature
      { at: l21 + 0.1, x: 1278, y: 2905, ds: 0.8, dur: 1.2 }, // the block again: signed and named
    ],
    spots: [
      { from: a("county") - 0.45, to: b("seller") - 0.35, box: [75, 1058, 2400, 126] },
      { from: b("seller") - 0.35, to: b("prints") - 0.1, box: [81, 2700, 2394, 410] },
      { from: b("prints") - 0.1, to: b("with") - 0.15, box: [1208, 2885, 1190, 64] },
      { from: b("with") - 0.15, to: l21 + 0.1, box: [90, 2848, 1110, 104] },
      { from: l21 + 0.1, to: len, box: [81, 2700, 2394, 410] },
    ],
    caption: { text: project.doc.caption, at: l21 + 0.9, exitAt: len - 0.6 },
  };
};

/** doc C: the signed bill of sale's last page, opened from the packet */
const docC = (len: number): DocSpec => ({
  src: "docs/narr-bos-p4-signed.png",
  size: [2550, 3300],
  fileName: "Discount_BillOfSale_James_Carter_20261002.pdf",
  page: 4,
  pages: 4,
  privacy: [[1543, 365, 404, 52]],
  openAt: 0,
  closeAt: len + 1,
  keys: [{ at: 0.45, x: 1276, y: 2120, ds: 0.6, dur: 1.5 }],
  spots: [{ from: 0.45, to: len + 1, box: [170, 1950, 2220, 280] }],
});

const PHONE: PhoneSpec = {
  parts: [
    ["26-phone-sign", 10, 30], // the cover: Sign The Paperwork., Begin
    ["26-phone-sign", 36, 54], // the bill of sale; the finger starts reading
    ["26-phone-sign", 80, 112], // the end of the sheet, the swipe up to the pad
    ["26-phone-sign", 117, 186], // the signature, Sign And Continue
    ["26b-phone-sign", 160, 198], // signed: Sign And Finish, All Signed.
  ],
  flicks: [["26-phone-sign", 44, 12, 205, 600, 300]],
  tail: 0,
};

// ---- build
export const buildNarrated = () => {
  const handoffAt = sec(theme.sting.handoffAtSec);
  const landAt = handoffAt + sec(theme.sting.handoffSec);
  const intro = { from: 0, handoffAt, landAt, fadeFrames: sec(theme.sting.fadeSec), durationInFrames: landAt + sec(theme.sting.fadeSec) + 1 };
  const deskFrom = handoffAt;

  const segs = SEGMENTS.map((s) => ({ ...s }));
  const starts = () => {
    const m: Record<string, number> = {};
    let at = deskFrom;
    for (const s of segs) {
      m[s.key] = at;
      at += s.durationInFrames;
    }
    return { m, end: at };
  };
  const trimOf = (s: Seg) => Math.round((s.trimSec ?? 0) * fps);
  const byKey = (k: string) => segs.find((s) => s.key === k) as Seg;
  const filmOf = (k: string, capture: number) => {
    const s = byKey(k);
    return starts().m[k] + (s.hold ? capture : capture - trimOf(s));
  };

  // overlay lengths, from the voice they carry
  const L = (id: string) => vo(id);
  const pad = 0.25;
  // doc A: line 16 starts so "owing" lands 0.75 s in; the windows close 0.55 s after it ends
  const l16 = 0.75 - w("16-money-c", "owing");
  const docALen = l16 + L("16-money-c").sec + 0.55;
  byKey("22h").durationInFrames = sec(docALen);
  // doc B: 19 at 0.35 s, 20 and 21 after natural gaps, 0.6 s after 21
  const l19 = 0.35;
  const l20 = l19 + L("19-payoff-a").sec + GAP["20-payoff-b"];
  const l21 = l20 + L("20-payoff-b").sec + GAP["21-payoff-c"];
  const docBLen = l21 + L("21-payoff-c").sec + 2.0;
  byKey("23h").durationInFrames = sec(docBLen);
  // the phone: its parts, then a still on All Signed. while line 23 starts; it drops away as "signed" is said
  const partFrames = PHONE.parts.reduce((a, p) => a + (p[2] - p[1]), 0);
  const phoneTail = sec(0.5);
  const phone = { ...PHONE, tail: phoneTail };
  const phoneLen = partFrames + phoneTail + sec(theme.phone.exitSec);
  // the desk under the phone cuts to 27a as the phone starts to drop away
  byKey("24h").durationInFrames = partFrames + phoneTail;
  // doc C
  const docCLen = 1.9;
  byKey("27h").durationInFrames = sec(docCLen);

  const { m, end: deskEnd } = starts();
  const overlays: Overlay[] = [
    { key: "docA", hold: "22h", from: m["22h"], durationInFrames: sec(docALen), docs: docA(l16, docALen) },
    { key: "docB", hold: "23h", from: m["23h"], durationInFrames: sec(docBLen), docs: [docB(l19, l20, l21, docBLen)] },
    { key: "phone", hold: "24h", from: m["24h"], durationInFrames: phoneLen, phone },
    { key: "docC", hold: "27h", from: m["27h"], durationInFrames: sec(docCLen), docs: [docC(docCLen)] },
  ];
  // the outro: drawn under the desk, which dissolves away over its first 0.5 s
  const outro = { from: deskEnd - sec(0.5), durationInFrames: sec(L("24-close").sec + 3.9) }; // 3.9 s after the last word: the lines, a breath, the fade
  const total = outro.from + outro.durationInFrames;

  // the lines
  const placed: { id: string; from: number; durationInFrames: number; sec: number; anchorFilm: number; why: string }[] = [];
  for (const lp of LINES) {
    const line = L(lp.id);
    const wordT = line.words[lp.word][1];
    let anchorFilm: number;
    const a = lp.anchor;
    if ("gap" in a) {
      const prev = placed[placed.length - 1];
      anchorFilm = prev.from + sec(prev.sec + a.gap) + sec(wordT);
    } else if ("seg" in a) anchorFilm = filmOf(a.seg, a.capture);
    else if ("outro" in a) anchorFilm = outro.from + sec(a.outro) + sec(wordT);
    else {
      const o = overlays.find((x) => x.key === a.overlay) as Overlay;
      if (a.at === -1) {
        const prev = placed[placed.length - 1];
        anchorFilm = prev.from + sec(prev.sec + GAP[lp.id]) + sec(wordT);
      } else if (a.at === -2) {
        // line 23: "signed" as All Signed. comes up (the last phone part's 13th frame)
        anchorFilm = o.from + partFrames - (PHONE.parts[PHONE.parts.length - 1][2] - PHONE.parts[PHONE.parts.length - 1][1]) + 9;
      } else if (a.overlay === "docB" && lp.id === "19-payoff-a") anchorFilm = o.from + sec(l19) + sec(wordT);
      else if (a.overlay === "docA") anchorFilm = o.from + sec(l16 + wordT);
      else anchorFilm = o.from + sec(a.at);
    }
    placed.push({ id: lp.id, from: anchorFilm - sec(wordT), durationInFrames: Math.ceil(line.sec * fps), sec: line.sec, anchorFilm, why: lp.why });
  }

  return { intro, deskFrom, segments: segs as DesktopSegment[], segKeys: segs.map((s) => s.key), segStarts: m, deskEnd, overlays, outro, total, lines: placed, pad };
};

export type NarratedPlan = ReturnType<typeof buildNarrated>;
export const narratedPlan = buildNarrated();
