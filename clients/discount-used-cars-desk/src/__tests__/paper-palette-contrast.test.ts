import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`token --${name} not found in globals.css`);
  return match[1];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Compositing happens in sRGB, which is how the browser paints a tint.
function over(fg: string, alpha: number, bg: string): string {
  const px = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
  const [f, b] = [px(fg), px(bg)];
  return `#${f.map((c, i) => Math.round(alpha * c + (1 - alpha) * b[i]).toString(16).padStart(2, "0")).join("")}`;
}

// WCAG 2.1 SC 1.4.3. Body copy needs 4.5:1; nothing in this product's admin
// is large enough to earn the 3:1 exemption, so one bar applies to all of it.
const AA_BODY = 4.5;

// Vega's desk grounds: the page, the raised panel and the well. All three are
// obsidian, so every text colour is measured against the dark end.
const GROUNDS = [
  ["ground", "tj-surface"],
  ["panel", "tj-plane"],
  ["well", "tj-cream-warm"],
] as const;

// Printed documents stay white paper whatever the screen theme; the status
// ramp is the colour set for paper, so it is measured against paper.
const PAPER = "#ffffff";

describe("Vega's palette contrast", () => {
  // Every colour the product sets on text, and the grounds it can land on.
  // The previous sweep checked these at 2.2:1, which is not a standard —
  // text at 4.0:1 passed that bar and was still unreadable in practice.
  const TEXT_TOKENS = ["tj-ink", "tj-muted", "tj-muted-light", "tj-copper", "tj-copper-light"];

  for (const name of TEXT_TOKENS) {
    for (const [label, ground] of GROUNDS) {
      it(`--${name} clears WCAG AA on ${label}`, () => {
        expect(ratio(token(name), token(ground))).toBeGreaterThanOrEqual(AA_BODY);
      });
    }
  }

  // The ramp has two halves and they answer different questions. 50-200 are
  // tints you put BEHIND something; 400-800 are values you set type IN. The
  // first version of this ramp collapsed the light end onto the dark end,
  // which made `bg-red-50 text-red-700` one colour on itself at 1.00:1 and
  // erased every error banner in the customer portal. These assertions are
  // what would have caught that.
  const STATUS = [
    "emerald",
    "amber",
    "red",
    "blue",
    "violet",
    "rose",
    "orange",
    "cyan",
  ];

  for (const hue of STATUS) {
    it(`${hue}: text on its own tint clears WCAG AA`, () => {
      const tint50 = token(`color-${hue}-50`);
      const tint100 = token(`color-${hue}-100`);
      const text700 = token(`color-${hue}-700`);
      const text800 = token(`color-${hue}-800`);
      expect(ratio(text700, tint50)).toBeGreaterThanOrEqual(AA_BODY);
      expect(ratio(text700, tint100)).toBeGreaterThanOrEqual(AA_BODY);
      expect(ratio(text800, tint100)).toBeGreaterThanOrEqual(AA_BODY);
    });

    it(`${hue}: the tint stays a tint and the text stays text`, () => {
      const paper = PAPER;
      // A tint must be light enough to read dark type on.
      expect(ratio(token(`color-${hue}-50`), paper)).toBeLessThan(1.5);
      // Text values must clear AA on both paper grounds.
      for (const step of ["400", "700"]) {
        expect(ratio(token(`color-${hue}-${step}`), paper)).toBeGreaterThanOrEqual(AA_BODY);
      }
    });

    it(`${hue}: carries white text when used as a solid fill`, () => {
      for (const step of ["500", "700"]) {
        expect(ratio(token("tj-white"), token(`color-${hue}-${step}`))).toBeGreaterThanOrEqual(AA_BODY);
      }
    });
  }

  it("keeps the base ground on paper, not the retired dark theme", () => {
    expect(css).toContain("background-color: var(--tj-warm-white)");
    expect(css).not.toContain("background-color: #000000");
  });

  it("has retired the legacy dark-theme brand palette", () => {
    // tj-cream was a heading colour on near-black and tj-gold its accent.
    // Both are gone; ed-ink and ed-copper replace them.
    expect(css).not.toContain("--color-tj-cream");
    expect(css).not.toContain("--color-tj-gold");
  });
});
