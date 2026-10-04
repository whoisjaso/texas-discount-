import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHandoffFields, handoffClipboardText } from "@/lib/sales/webdealer";
import { makeEstimate, makeSale, TITLE_ON_FILE } from "./helpers/empty-weight";

/**
 * webDEALER is typed from the desk's handoff, and its empty weight is a
 * filing. So the handoff carries only a figure somebody settled: the 130-U's
 * answer or the vehicle's weight. An estimate never appears there, and the
 * figure carries a fine-print line saying where it came from, which never
 * enters the clipboard text. (The original copy-fields test, pinning the
 * figure itself, is untouched.)
 */

const field = (sale: ReturnType<typeof makeSale>) => buildHandoffFields(sale, null).find((f) => f.key === "emptyWeight")!;

describe("the empty weight on the webDEALER handoff", () => {
  it("is missing, with the way to settle it, when only an estimate exists", () => {
    const f = field(makeSale({}, { weightEstimate: makeEstimate() }));
    expect(f.value).toBeNull();
    expect(f.fixHref).toBe("/admin/sales/deal-1/guide/document:form130U");
    expect(f.source).toBeUndefined();
  });

  it("shows a confirmed estimate with its source line", () => {
    const f = field(
      makeSale({
        emptyWeight: "3500",
        _emptyWeightSource: "estimate_epa",
        _emptyWeightBy: "Jo Smith",
        _emptyWeightAt: "2026-10-02T15:00:00.000Z",
      }),
    );
    expect(f.value).toBe("3500");
    expect(f.source).toEqual({ kind: "estimate_epa", by: "Jo Smith", at: "2026-10-02T15:00:00.000Z" });
  });

  it("shows a document on the vehicle as that document", () => {
    const f = field(makeSale({}, TITLE_ON_FILE));
    expect(f.value).toBe("3300");
    expect(f.source).toEqual({ kind: "texas_title", by: "Jo Smith", at: "2026-10-01T15:00:00.000Z" });
  });

  it("says a legacy weight's source was not recorded", () => {
    const f = field(makeSale({}, { weightLbs: 3765 }));
    expect(f.value).toBe("3765");
    expect(f.source).toEqual({ kind: "notRecorded", by: null, at: null });
  });

  it("keeps the source out of the clipboard text", () => {
    const fields = buildHandoffFields(makeSale({ emptyWeight: "3500", _emptyWeightSource: "estimate_epa", _emptyWeightBy: "Jo Smith" }), null);
    const text = handoffClipboardText(fields);
    expect(text).toContain("Empty weight (lbs.): 3500");
    expect(text).not.toMatch(/Estimate|EPA|Jo Smith/);
  });

  it("says 'not recorded' on the screen in both languages", () => {
    const screen = readFileSync("src/components/admin/WebDealerHandoff.tsx", "utf8");
    expect(screen).toContain("t.weight.handoff.notRecorded");
    expect(screen).toContain("weightSourceLine(t, field.source)");
  });
});
