import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHandoffFields, handoffClipboardText, isUnconfirmedHandoffValue, missingHandoffFields } from "@/lib/sales/webdealer";
import { makeSale, TITLE_ON_FILE } from "./helpers/empty-weight";

/**
 * webDEALER is the real state filing. Review finding 6: a legacy weight on
 * the vehicle that nobody recorded the source of was refused on the 130-U
 * but still pasted into webDEALER by Copy All. The figure stays on screen
 * (the pinned webdealer-copy-fields test, untouched, still sees it as the
 * field's value), but it is never copied, it counts as missing, and the row
 * links to the 130-U to settle it.
 */

const weightField = (sale: ReturnType<typeof makeSale>) =>
  buildHandoffFields(sale, null).find((f) => f.key === "emptyWeight")!;

describe("an empty weight nobody vouched for", () => {
  it("is shown, but not copied", () => {
    const sale = makeSale({}, { weightLbs: 3765 });
    const field = weightField(sale);
    expect(field.value).toBe("3765");
    expect(isUnconfirmedHandoffValue(field)).toBe(true);
    const text = handoffClipboardText(buildHandoffFields(sale, null));
    expect(text).toContain("Empty weight (lbs.): (not confirmed; settle it on the 130-U)");
    expect(text).not.toContain("3765");
  });

  it("counts as missing, so the handoff is not ready", () => {
    const fields = buildHandoffFields(makeSale({}, { weightLbs: 3765 }), null);
    expect(missingHandoffFields(fields).map((f) => f.key)).toContain("emptyWeight");
  });

  it("offers the 130-U instead of a copy button on the screen", () => {
    const screen = readFileSync("src/components/admin/WebDealerHandoff.tsx", "utf8");
    expect(screen).toContain("isUnconfirmedHandoffValue(field)");
    expect(screen).toMatch(/if \(!field\.value \|\| unconfirmed\) return;/);
  });
});

describe("a weight somebody settled", () => {
  it.each([
    ["a confirmed estimate", makeSale({ emptyWeight: "3500", _emptyWeightSource: "estimate_epa", _emptyWeightBy: "Jo Smith" })],
    ["a document on the vehicle", makeSale({}, TITLE_ON_FILE)],
    ["a typed title", makeSale({ emptyWeight: "3400", _emptyWeightSource: "texas_title", _emptyWeightBy: "Jo Smith" })],
  ])("copies %s as before", (_name, sale) => {
    const fields = buildHandoffFields(sale, null);
    const field = fields.find((f) => f.key === "emptyWeight")!;
    expect(isUnconfirmedHandoffValue(field)).toBe(false);
    expect(handoffClipboardText(fields)).toContain(`Empty weight (lbs.): ${field.value}`);
    expect(missingHandoffFields(fields).map((f) => f.key)).not.toContain("emptyWeight");
  });
});
