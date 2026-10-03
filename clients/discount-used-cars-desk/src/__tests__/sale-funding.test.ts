import { describe, expect, it } from "vitest";
import {
  isDocumentExcluded,
  readFunding,
  requiredDocumentTypes,
  writeFunding,
  EMPTY_FUNDING,
} from "@/lib/sales/deal-type";
import {
  buildLenderDirectory,
  findLender,
  lenderTag,
  searchLenders,
  LENDER_SEED,
  type Lender,
} from "@/lib/sales/lenders";
import {
  buildHandoffFields,
  handoffClipboardText,
  missingHandoffFields,
  readPlate,
  writePlate,
} from "@/lib/sales/webdealer";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import {
  buildGuideSteps,
  findGuideStep,
  guideProgress,
  nextOpenStep,
} from "@/lib/sales/guide";

describe("what each funding path requires", () => {
  it("keeps our financing contract off a cash sale", () => {
    expect(requiredDocumentTypes("cash")).not.toContain("financing");
    expect(isDocumentExcluded("financing", "cash")).toBe(true);
  });

  it("requires our financing contract when we carry the note", () => {
    expect(requiredDocumentTypes("inHouse")).toContain("financing");
    expect(isDocumentExcluded("financing", "inHouse")).toBe(false);
  });

  /**
   * The one that matters. An outside lender writes the retail instalment
   * contract on their own form in their own portal. Ours must not also be
   * signed, or the same debt is papered twice on two sets of terms.
   */
  it("excludes our financing contract when an outside lender funds it", () => {
    expect(isDocumentExcluded("financing", "lender")).toBe(true);
    expect(requiredDocumentTypes("lender")).not.toContain("financing");
  });

  it("still requires title paperwork on every path", () => {
    for (const type of ["cash", "inHouse", "lender"] as const) {
      expect(requiredDocumentTypes(type)).toContain("form130U");
      expect(requiredDocumentTypes(type)).toContain("billOfSale");
    }
  });

  it("excludes nothing before anyone has answered", () => {
    expect(isDocumentExcluded("financing", null)).toBe(false);
  });
});

describe("funding survives a round trip through step_data", () => {
  it("keeps the rest of the blob intact", () => {
    const existing = { "7": { plate_number: "ABC1234" }, current: 3 };
    const merged = writeFunding(existing, {
      type: "lender",
      lenderId: "westlake",
      lenderOther: null,
    });

    expect(merged["7"]).toEqual({ plate_number: "ABC1234" });
    expect(merged.current).toBe(3);
    expect(readFunding(merged).lenderId).toBe("westlake");
  });

  it("reads nothing out of a deal that was never asked", () => {
    expect(readFunding({})).toEqual(EMPTY_FUNDING);
    expect(readFunding(null)).toEqual(EMPTY_FUNDING);
    expect(readFunding({ funding: { type: "wire" } }).type).toBeNull();
  });

  it("drops a lender left behind when the type changes away", () => {
    const merged = writeFunding({}, {
      type: "cash",
      lenderId: null,
      lenderOther: null,
    });
    expect(readFunding(merged).lenderId).toBeNull();
  });
});

describe("the lender directory", () => {
  /**
   * Alphabetical, because finding a name you already know is what this screen
   * is for. Sorting by usefulness means reading the whole list to find out
   * where "Westlake" ended up.
   */
  it("is alphabetical", () => {
    const names = buildLenderDirectory().map((entry) => entry.name);
    const sorted = [...names].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" }),
    );
    expect(names).toEqual(sorted);
  });

  it("separates who funds the customer from who funds the lot", () => {
    const list = buildLenderDirectory();
    // Sending a buyer's application to a floor plan company wastes an
    // afternoon, so the kinds stay distinguishable on the row.
    expect(lenderTag("capital")).toBe("Funds the lot");
    expect(lenderTag("aggregator")).toBe("Submits to many");
    expect(lenderTag("lender")).toBeNull();
    expect(list.some((entry) => entry.kind === "capital")).toBe(true);
    expect(list.some((entry) => entry.kind === "aggregator")).toBe(true);
  });

  it("carries the lenders a Texas independent lot would actually meet", () => {
    const ids = buildLenderDirectory().map((entry) => entry.id);
    for (const expected of [
      "creditAcceptance",
      "westlake",
      "exeter",
      "globalLending",
      "santander",
      "unitedAutoCredit",
      "lobel",
      "prestige",
    ]) {
      expect(ids).toContain(expected);
    }
    expect(ids.length).toBeGreaterThanOrEqual(40);
  });

  it("lets a dealer override a seeded entry by id", () => {
    const mine: Lender = {
      id: "westlake",
      name: "Westlake Financial",
      kind: "lender",
      portal: "https://example.test/my-rep-link",
      gloss: "Our rep's link",
    };
    const list = buildLenderDirectory([mine]);
    expect(findLender(list, "westlake")?.portal).toBe(
      "https://example.test/my-rep-link",
    );
    expect(list.filter((entry) => entry.id === "westlake")).toHaveLength(1);
  });

  it("finds a lender by an alias someone would actually type", () => {
    const list = buildLenderDirectory();
    expect(searchLenders(list, "CPS").map((e) => e.id)).toContain(
      "consumerPortfolio",
    );
    expect(searchLenders(list, "credit union").map((e) => e.id)).toContain("cudl");
  });

  it("returns the whole directory for an empty query", () => {
    const list = buildLenderDirectory();
    expect(searchLenders(list, "   ")).toHaveLength(list.length);
  });

  /**
   * A wrong login URL is worse than none: someone covering the desk will trust
   * it. Entries we could not verify ship with null and render as "add the
   * link" instead.
   */
  it("never ships a portal that is not a real https URL", () => {
    for (const lender of LENDER_SEED) {
      if (lender.portal === null) continue;
      expect(lender.portal).toMatch(/^https:\/\//);
    }
  });
});

function fixture(overrides: Partial<SaleDetail> = {}): SaleDetail {
  return {
    id: "deal-1",
    status: "active",
    language: "en",
    createdAt: "2026-08-01T00:00:00Z",
    completedAt: null,
    buyer: {
      id: "c1",
      name: "Ana Ruiz",
      phone: "555",
      email: null,
      idNumber: "TX99",
      address: "1 Example St",
    },
    vehicle: {
      id: "v1",
      year: 2019,
      make: "Honda",
      model: "CR-V",
      vin: "abc123",
      status: "available",
      salePrice: 7500,
    },
    documents: {},
    registration: null,
    funding: EMPTY_FUNDING,
    plate: null, plateAsked: false,
    /*
      A settled sale plan by default.

      Document steps now derive from the plan as well as the funding, because
      the answers decide which documents a sale owes. A fixture that wants to
      assert anything about documents has to have answered them; tests about
      the plan itself override this.
    */
    stepData: {
      salePlan: {
        registrationBy: "dealer",
        titleSignedBy: "buyer",
        priceIncludesRegistration: null,
        inspectionBy: "done",
        insuranceShown: true,
      },
    },
    ...overrides,
  } as SaleDetail;
}

describe("the webDEALER handoff", () => {
  it("carries the VIN in upper case, the way the form wants it", () => {
    const vin = buildHandoffFields(fixture(), "P171632").find(
      (f) => f.label === "VIN",
    );
    expect(vin?.value).toBe("ABC123");
  });

  it("names a missing field instead of leaving a blank to fill from memory", () => {
    const fields = buildHandoffFields(
      fixture({ buyer: null }),
      "P171632",
    );
    const missing = missingHandoffFields(fields).map((f) => f.label);
    expect(missing).toContain("Name 1");
    expect(missing).toContain("Buyer ID number");
    expect(handoffClipboardText(fields)).toContain("Name 1: (missing)");
  });

  it("does not invent a dealer licence when config has none", () => {
    const gdn = buildHandoffFields(fixture(), null).find(
      (f) => f.label === "Dealer GDN",
    );
    expect(gdn?.value).toBeNull();
  });

  it("treats a zero sale price as missing rather than as free", () => {
    const price = buildHandoffFields(
      fixture({ vehicle: { ...fixture().vehicle!, salePrice: 0 } }),
      "P171632",
    ).find((f) => f.label === "Sales price");
    expect(price?.value).toBeNull();
  });

  it("stores a plate upper cased without disturbing the rest of the blob", () => {
    const merged = writePlate({ funding: { type: "cash" } }, " abc-1234 ");
    expect(readPlate(merged)).toBe("ABC-1234");
    expect((merged.funding as { type: string }).type).toBe("cash");
  });
});

describe("every question on the walkthrough is a header", () => {
  /**
   * The owner's standing instruction, written into DESIGN.md under
   * Capitalisation: titles and headings capitalise every word, including
   * "the", "is" and "and". Each walkthrough step renders its question as the
   * page h1, so each one is a header.
   *
   * This is a guard rather than a preference. The rule was broken twice in the
   * same file for the same reason: a question reads naturally in sentence case
   * when you write it, and the document steps built theirs by lowercasing a
   * title that was already correct.
   */
  const TITLE_CASE = /^[A-Z0-9]/;

  it("capitalises every word of every question", () => {
    const sale = fixture({
      funding: { type: "inHouse", lenderId: null, lenderOther: null },
    });
    const steps = buildGuideSteps(sale);
    expect(steps.length).toBeGreaterThan(3);

    for (const step of steps) {
      for (const word of step.question.split(/\s+/)) {
        // Product names keep their own casing: webDEALER is not WebDEALER.
        if (word.startsWith("web")) continue;
        expect(word, `not title case in "${step.question}": ${word}`)
          .toMatch(TITLE_CASE);
      }
    }
  });

  it("covers the lender question too, which only a bank deal creates", () => {
    const steps = buildGuideSteps(
      fixture({ funding: { type: "lender", lenderId: null, lenderOther: null } }),
    );
    const lender = steps.find((s) => s.key === "lender");
    expect(lender?.question).toBe("Which Lender Is Funding It?");
  });
});

describe("the walkthrough builds its steps from the deal", () => {
  const withFunding = (type: "cash" | "inHouse" | "lender") =>
    fixture({ funding: { type, lenderId: null, lenderOther: null } });

  it("asks the lender question only on a bank deal", () => {
    expect(buildGuideSteps(withFunding("lender")).map((s) => s.key)).toContain(
      "lender",
    );
    for (const type of ["cash", "inHouse"] as const) {
      expect(buildGuideSteps(withFunding(type)).map((s) => s.key)).not.toContain(
        "lender",
      );
    }
  });

  /**
   * The nine-step flow was retired because six of its screens asked nothing.
   * This is the guard against building that again: every step must be a real
   * question, so a cash sale never gets a financing document screen.
   */
  it("never creates a step for paperwork the funding path excludes", () => {
    for (const type of ["cash", "lender"] as const) {
      const keys = buildGuideSteps(withFunding(type)).map((s) => s.key);
      expect(keys).not.toContain("document:financing");
    }
    expect(
      buildGuideSteps(withFunding("inHouse")).map((s) => s.key),
    ).toContain("document:financing");
  });

  it("counts a step done only when the deal actually holds the answer", () => {
    const unanswered = buildGuideSteps(fixture());
    expect(findGuideStep(unanswered, "funding")?.done).toBe(false);

    // Asserted as the contract rather than as a step name, so inserting a new
    // question into the flow is not a test failure. What must hold is that the
    // desk is sent to the earliest thing still unanswered: the step it lands on
    // is open, and everything ahead of it is already done.
    const next = nextOpenStep(unanswered);
    expect(next?.done).toBe(false);
    const upTo = unanswered.slice(0, unanswered.findIndex((s) => s.key === next?.key));
    expect(upTo.every((s) => s.done)).toBe(true);

    // The plate is the only proof the title was filed, so nothing else stands
    // in for it.
    const filed = buildGuideSteps(
      fixture({ plate: "ABC1234", funding: { type: "cash", lenderId: null, lenderOther: null } }),
    );
    expect(findGuideStep(filed, "title")?.done).toBe(true);
  });

  it("keeps a finished step in the list rather than dropping it", () => {
    const steps = buildGuideSteps(
      fixture({ funding: { type: "cash", lenderId: null, lenderOther: null } }),
    );
    expect(findGuideStep(steps, "funding")?.done).toBe(true);
    expect(steps.map((s) => s.key)).toContain("funding");
    expect(guideProgress(steps).total).toBe(steps.length);
  });
});
