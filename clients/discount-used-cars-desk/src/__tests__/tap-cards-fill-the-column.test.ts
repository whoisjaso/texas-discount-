import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The paperwork's taps look like Handle A Sale's. `.ed-paper-answer` centred
 * and shrank its content to 460px, so a No/Yes pair was two 50 to 62px
 * cards under a left-set heading while the guide's own taps fill the column
 * two-up. A tap question now stretches its cards across the column.
 */
const css = readFileSync("src/app/globals.css", "utf8");
const answer = readFileSync("src/components/admin/paperwork/AnswerStep.tsx", "utf8");

function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
}

describe("tap cards fill the column", () => {
  it("stretches a tap question to the column's width", () => {
    const taps = rule(".ed-paper-answer.ed-paper-taps");
    expect(taps).toMatch(/max-width:\s*none/);
    expect(taps).toMatch(/align-items:\s*stretch/);
    expect(css).toMatch(/\.ed-paper-taps > \.ed-pay-row,[\s\S]*?width:\s*100%/);
  });

  it("puts every tap question in it: choices, dates, lists and several-at-once", () => {
    expect(answer.match(/className="ed-paper-answer ed-paper-taps"/g)).toHaveLength(3);
    expect(answer).not.toContain('<div className="ed-paper-answer">');
  });

  it("keeps the guide's own two-up grid for the cards", () => {
    expect(rule(".ed-pay-row")).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  });
});
