import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { requiredDocumentTypes } from "@/lib/sales/deal-type";
import { SALE_DOCUMENTS } from "@/lib/admin/sale-desk";

/**
 * Two screens, one answer to "how many documents does this sale owe".
 *
 * The sale list counted against a fixed list of the non-optional documents,
 * which is three. The walkthrough derives its list from how the sale is being
 * paid for, which on a Buy Here Pay Here deal is four: our financing contract
 * is required and the guide walks it.
 *
 * So the same sale read "0 of 3 signed" on the list and "of 8" in the guide,
 * and the dangerous end of that was the finish line. A financed deal would
 * have shown "3 of 3 signed" on the list, which reads as done, while the
 * contract that actually collects the money was still unsigned.
 *
 * `requiredDocumentTypes` is the one place that knows. This file pins both the
 * counts it produces and the fact that the list still asks it.
 */

/** The same filter the list applies: only documents that leave a record. */
function recorded(type: string): boolean {
  return SALE_DOCUMENTS.some((entry) => entry.documentType === type);
}

describe("what each kind of sale owes", () => {
  /*
    Two, three and two. The counts were three, four and three while the
    power of attorney sat on every list; it is the sale plan's to add now,
    only when we sign the application for a buyer who is not here, so the
    funding-only count is the bill of sale, the 130-U, and our contract on
    the deals we carry.
  */
  it("a cash sale owes two, and neither is a financing contract", () => {
    const types = requiredDocumentTypes("cash").filter(recorded);
    expect(types).toHaveLength(2);
    expect(types).not.toContain("financing");
  });

  it("a buy here pay here sale owes three, including our contract", () => {
    const types = requiredDocumentTypes("inHouse").filter(recorded);
    expect(types).toHaveLength(3);
    expect(types).toContain("financing");
  });

  it("a bank financed sale owes two, because the contract is theirs", () => {
    // Signing ours alongside theirs would be signing the same debt twice on
    // two different sets of terms.
    const types = requiredDocumentTypes("lender").filter(recorded);
    expect(types).toHaveLength(2);
    expect(types).not.toContain("financing");
  });

  it("a sale with no answer yet owes the two that are always owed", () => {
    const types = requiredDocumentTypes(null).filter(recorded);
    expect(types).toHaveLength(2);
    expect(types).not.toContain("financing");
  });
});

describe("the list asks rather than assumes", () => {
  const page = readFileSync("src/app/admin/sales/page.tsx", "utf8");

  it("reads the requirement from the deal's funding", () => {
    expect(page).toContain("requiredDocumentTypes");
    expect(page).toContain("readFunding");
  });

  it("selects step_data, without which it cannot know", () => {
    // The funding answer lives in that column. Dropping it from the query is
    // how this regresses silently: every deal would read as unfunded and the
    // count would quietly go back to three.
    expect(page).toMatch(/select\(\s*\n?\s*"[^"]*step_data/);
  });

  it("no longer counts against a fixed list of non-optional documents", () => {
    expect(page).not.toMatch(/SALE_DOCUMENTS\.filter\(\s*\n?\s*\(entry\)\s*=>\s*entry\.documentType\s*&&\s*!entry\.optional/);
  });
});
