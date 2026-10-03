import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Review finding 7: finalizePaperwork took box 11 from the server's own read
 * only when that read found the sale. With the sale unreadable the gate was
 * skipped and the client's formData.emptyWeight, with any _emptyWeight* keys
 * it chose to send, went into form_data as it came. A 130-U now refuses to
 * file without the sale, before anything is written.
 */

const source = readFileSync("src/lib/actions/paperwork.ts", "utf8");

describe("a 130-U files only from the server's own read", () => {
  it("refuses when the sale cannot be read, before the weight gate and before any write", () => {
    const block = source.indexOf('if (documentType === "form130U") {');
    expect(block).toBeGreaterThan(-1);
    const refusal = source.indexOf("if (!sale) return { ok: false, error: \"That sale could not be found.", block);
    const gate = source.indexOf("emptyWeightForFiling(sale)", block);
    expect(refusal).toBeGreaterThan(block);
    expect(refusal).toBeLessThan(gate);
    expect(gate).toBeLessThan(source.indexOf('.from("document_agreements")'));
  });

  it("no longer gates the 130-U weight on the sale having been found", () => {
    expect(source).not.toContain('if (sale && documentType === "form130U")');
  });
});
