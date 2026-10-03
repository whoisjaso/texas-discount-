import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The sign box on the review screen is centred: its button and the "or
 * print for ink" line sit on the box's centre line, and the pad itself
 * stays full width. Anchored to syntax, never to prose, per the house rule.
 */

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("the sign box is centred", () => {
  it("centres its buttons and its line of text", () => {
    const block = css.match(/\.ed-sign-box\s*\{[^}]*\}/)?.[0] ?? "";
    expect(block).toMatch(/justify-items:\s*center/);
    expect(block).toMatch(/text-align:\s*center/);
  });

  it("keeps the pad itself full width", () => {
    expect(css).toMatch(/\.ed-sign-box \.ed-sign-pad\s*\{[^}]*justify-self:\s*stretch/);
  });
});
