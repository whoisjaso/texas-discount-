import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The licence scanner told nobody anything.
 *
 * Three separate silences, all of them noticed on a real phone at a desk:
 *
 * The aiming frame was card-shaped on both passes. A PDF417 is about two
 * thirds of a licence wide, so a card held to fill a card-shaped cutout puts
 * roughly five hundred camera pixels across the barcode, and this decoder
 * needs somewhere north of seven hundred before it reads at all. Measured, on
 * the same footage the component sees. The frame was quietly asking for the
 * one distance that cannot work.
 *
 * The confirmation was mounted and unmounted in the same tick, because the
 * parent swapped the scanner out the instant the barcode decoded. It was in
 * the markup and it had never once been on a screen.
 *
 * And success buzzed the same five milliseconds as a button tap, against the
 * back of a card, while the operator was looking at the card.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
const SCANNER = readFileSync("src/components/sales/LicenceScanner.tsx", "utf8");
const CLIENT = readFileSync("src/app/capture/[token]/CaptureClient.tsx", "utf8");
const HAPTICS = readFileSync("src/lib/haptics.ts", "utf8");
const FEEDBACK = readFileSync("src/lib/paperwork/feedback.ts", "utf8");

/** Pulls one declaration out of one rule, so a moved rule fails loudly. */
function declaration(selector: string, property: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `${selector} is not in globals.css`).toBeGreaterThan(-1);
  const body = CSS.slice(start, CSS.indexOf("}", start));
  const match = new RegExp(`(?:^|\\s)${property}:\\s*([^;]+);`).exec(body);
  expect(match, `${selector} has no ${property}`).not.toBeNull();
  return match![1].trim();
}

/** `min(94vw, 520px)` at a 390px screen, which is the phone this is for. */
function widthAt(expression: string, viewport: number): number {
  const inner = /min\(([^)]+)\)/.exec(expression);
  expect(inner, `not a min() width: ${expression}`).not.toBeNull();
  const values = inner![1].split(",").map((part) => {
    const text = part.trim();
    if (text.endsWith("vw")) return (Number.parseFloat(text) / 100) * viewport;
    return Number.parseFloat(text);
  });
  return Math.min(...values);
}

function aspect(expression: string): number {
  const [w, h] = expression.split("/").map((part) => Number.parseFloat(part.trim()));
  return w / h;
}

describe("the frame asks for the distance that actually decodes", () => {
  const PHONE = 390;

  const frontWidth = widthAt(declaration(".ed-scan-cutout", "width"), PHONE);
  const backWidth = widthAt(declaration('.ed-scan-cutout[data-stage="back"]', "width"), PHONE);

  it("widens for the barcode instead of staying card-shaped", () => {
    // The entire fix. A back frame no wider than the front one would be
    // decoration: it would change what is drawn and not what is held.
    expect(backWidth).toBeGreaterThan(frontWidth);
  });

  it("gives the barcode nearly the whole screen", () => {
    expect(backWidth / PHONE).toBeGreaterThan(0.9);
  });

  it("is shaped like a barcode, not like a card", () => {
    const card = aspect(declaration(".ed-scan-cutout", "aspect-ratio"));
    const back = aspect(declaration('.ed-scan-cutout[data-stage="back"]', "aspect-ratio"));
    // A licence is about 1.6 wide to tall; the code on its back is about 3.4.
    expect(card).toBeLessThan(2);
    expect(back).toBeGreaterThan(3);
  });

  it("draws the frame so it survives a pale card behind it", () => {
    // A white line on a cream licence is not a line. Found by measuring a
    // screenshot, not by reading the rule.
    expect(declaration(".ed-scan-cutout", "box-shadow")).toMatch(/inset[^,]*rgba\(0, 0, 0/);
  });
});

describe("the confirmation is on screen long enough to be seen", () => {
  it("keeps the scanner up while the photograph uploads", () => {
    expect(CLIENT).toMatch(/status === "sending" && viaScanner/);
  });

  it("does not hold the scanner over the picker's upload", () => {
    // The fallback path has no camera. Mounting the scanner over it would
    // send it straight back out through onFallback.
    expect(CLIENT).toMatch(/setViaScanner\(false\);/);
    expect(CLIENT).toMatch(/setViaScanner\(true\);/);
  });

  it("decides that from state, not from a ref read during render", () => {
    // A ref would work right up until the two updates landed in different
    // ticks, and then the confirmation would flicker for one person once.
    expect(CLIENT).toMatch(/const \[viaScanner, setViaScanner\] = useState/);
  });

  it("draws the check inside the frame the card is in", () => {
    const veil = SCANNER.slice(SCANNER.indexOf("ed-scan-veil"), SCANNER.indexOf("ed-scan-copy"));
    expect(veil).toContain("ed-scan-got");
  });
});

describe("what the hand is told, when the eyes are elsewhere", () => {
  it("answers a decode with the pattern, not the tap", () => {
    const decode = SCANNER.slice(SCANNER.indexOf("read = await decodeLicence("));
    expect(decode).toContain("capturedHaptic()");
  });

  it("keeps a single tap for merely turning the card over", () => {
    const front = SCANNER.slice(
      SCANNER.indexOf("front.current = blob"),
      SCANNER.indexOf("read = await decodeLicence("),
    );
    expect(front).toContain("tapHaptic()");
    expect(front).not.toContain("capturedHaptic()");
  });

  it("is a pattern with a gap in it, not one longer buzz", () => {
    // A single pulse of any length reads as a knock against the handset.
    const captured = /captured\(options\?: HapticOptions\): void \{\s*vibrate\(\[([^\]]+)\]/.exec(FEEDBACK);
    expect(captured, "Haptic.captured is gone or no longer a pattern").not.toBeNull();
    expect(captured![1].split(",").length).toBeGreaterThan(2);
  });

  it("still asks the admin's own preference before buzzing", () => {
    // The dealer's switch has to survive the new call site.
    expect(HAPTICS).toMatch(/export function capturedHaptic\(\): void \{\s*if \(!allowed\(\)\) return;/);
  });
});
