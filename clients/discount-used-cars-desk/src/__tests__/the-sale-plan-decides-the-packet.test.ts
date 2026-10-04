import { describe, expect, it } from "vitest";
import { requiredDocumentTypes } from "@/lib/sales/deal-type";
import {
  PLAN_STEP_KEY,
  applyPlanAnswer,
  isPlanQuestionAnswered,
  isValidAnswer,
  planEditRefusal,
  planQuestionForStep,
  EMPTY_SALE_PLAN,
  isSalePlanComplete,
  nextUnanswered,
  outstandingFromPlan,
  planQuestions,
  planRefusal,
  poaInstrument,
  readSalePlan,
  writeSalePlan,
  type SalePlan,
} from "@/lib/sales/sale-plan";

/**
 * Three questions asked before the paperwork, and what they change.
 *
 * The owner's framing: a prescreening for what KIND of sale this is. It runs
 * before the bill of sale because the answers decide the packet, and a packet
 * nobody can know until they are three documents deep is a packet somebody
 * assembles wrong.
 */

const plan = (over: Partial<SalePlan> = {}): SalePlan => ({
  ...EMPTY_SALE_PLAN,
  ...over,
});

describe("reading a plan off a deal", () => {
  it("survives a round trip through step_data", () => {
    const written = writeSalePlan(
      { "3": { something: "else" } },
      plan({ registrationBy: "buyer", insuranceShown: true, inspectionBy: "done" }),
    );
    expect(readSalePlan(written)).toEqual({
      registrationBy: "buyer",
      titleSignedBy: null,
      priceIncludesRegistration: null,
      insuranceShown: true,
      inspectionBy: "done",
    });
    // And leaves the retired pipeline's numbered keys alone.
    expect(written["3"]).toEqual({ something: "else" });
  });

  it("treats an unanswered insurance question as unanswered, never as a no", () => {
    // The distinction matters on paper: "nobody asked" is not the same as
    // "this buyer drove off uninsured", and the checklist prints the claim.
    expect(readSalePlan({}).insuranceShown).toBeNull();
    expect(readSalePlan({ salePlan: { insuranceShown: "yes" } }).insuranceShown).toBeNull();
    expect(readSalePlan({ salePlan: { insuranceShown: false } }).insuranceShown).toBe(false);
  });

  it("refuses values it does not recognise rather than passing them on", () => {
    const read = readSalePlan({
      salePlan: { registrationBy: "somebody", inspectionBy: "maybe" },
    });
    expect(read.registrationBy).toBeNull();
    expect(read.inspectionBy).toBeNull();
  });

  it("knows when the packet is knowable", () => {
    expect(isSalePlanComplete(EMPTY_SALE_PLAN)).toBe(false);
    expect(
      isSalePlanComplete(
        plan({
          registrationBy: "dealer",
          titleSignedBy: "buyer",
          insuranceShown: false,
          inspectionBy: "buyer",
        }),
      ),
    ).toBe(true);
  });

  it("drops a stale signer answer on the buyer branch when reading", () => {
    // Only the dealer branch asks who signs. A value left over from before a
    // branch switch must not build a power of attorney into a buyer-files
    // packet.
    const read = readSalePlan({
      salePlan: { registrationBy: "buyer", titleSignedBy: "dealer" },
    });
    expect(read.titleSignedBy).toBeNull();
  });
});

describe("what the plan does to the packet", () => {
  it("leaves the HB 718 default alone when no plan has been given", () => {
    // We file, and the buyer at the desk signs the application. No power of
    // attorney: the plain VTR-271 was unlawful on every car under twenty
    // model years old, so requiring it ended every ordinary sale at a form
    // that could not be used.
    expect(requiredDocumentTypes("cash")).not.toContain("powerOfAttorney");
    expect(requiredDocumentTypes("cash")).toContain("form130U");
    expect(requiredDocumentTypes("cash")).not.toContain("vehicleResponsibility");
  });

  it("adds the power of attorney only when we sign the application for an absent buyer", () => {
    const present = requiredDocumentTypes(
      "cash",
      plan({ registrationBy: "dealer", titleSignedBy: "buyer" }),
    );
    expect(present).not.toContain("powerOfAttorney");
    expect(present).toContain("form130U");

    const absent = requiredDocumentTypes(
      "cash",
      plan({ registrationBy: "dealer", titleSignedBy: "dealer" }),
    );
    expect(absent).toContain("powerOfAttorney");
    expect(absent).toContain("form130U");
  });

  it("swaps the whole branch when the BUYER registers", () => {
    const docs = requiredDocumentTypes("cash", plan({ registrationBy: "buyer" }));
    // No application from us, and nothing for us to sign on their behalf.
    expect(docs).not.toContain("powerOfAttorney");
    expect(docs).not.toContain("form130U");
    expect(docs).toContain("vehicleResponsibility");
    expect(docs).toContain("billOfSale");
  });

  it("keeps our financing contract on an in-house deal either way", () => {
    expect(requiredDocumentTypes("inHouse", plan({ registrationBy: "buyer" }))).toContain(
      "financing",
    );
    expect(requiredDocumentTypes("inHouse", plan({ registrationBy: "dealer" }))).toContain(
      "financing",
    );
  });

  it("adds an insurance acknowledgment only when proof was NOT shown", () => {
    expect(
      requiredDocumentTypes("cash", plan({ insuranceShown: false })),
    ).toContain("insuranceAcknowledgment");
    expect(
      requiredDocumentTypes("cash", plan({ insuranceShown: true })),
    ).not.toContain("insuranceAcknowledgment");
    // Unanswered is not a no.
    expect(requiredDocumentTypes("cash", EMPTY_SALE_PLAN)).not.toContain(
      "insuranceAcknowledgment",
    );
  });

  it("never doubles a document", () => {
    const docs = requiredDocumentTypes(
      "cash",
      plan({ registrationBy: "buyer", insuranceShown: false }),
    );
    expect(new Set(docs).size).toBe(docs.length);
  });
});

describe("what the buyer carries out of here", () => {
  it("says nothing about a question nobody answered", () => {
    expect(outstandingFromPlan(EMPTY_SALE_PLAN)).toEqual({});
  });

  it("marks our work as ours and theirs as theirs", () => {
    expect(
      outstandingFromPlan(
        plan({ registrationBy: "dealer", insuranceShown: true, inspectionBy: "done" }),
      ),
    ).toEqual({
      registrationByDealer: true,
      insuranceShown: true,
      inspectionByDealer: false,
      inspectionDone: true,
    });
  });

  it("a buyer-run inspection is neither ours nor finished", () => {
    const out = outstandingFromPlan(plan({ inspectionBy: "buyer" }));
    expect(out.inspectionByDealer).toBe(false);
    expect(out.inspectionDone).toBe(false);
  });
});

describe("which power of attorney form, when one is owed at all", () => {
  const now = new Date("2026-08-29T00:00:00Z");
  const weSign = plan({ registrationBy: "dealer", titleSignedBy: "dealer" });

  it("names the secure form on a modern car", () => {
    // The plain power of attorney cannot assign title on a vehicle subject to
    // federal odometer disclosure. That needs the secure VTR-271-A, a county
    // form this product does not fill, so it is named at the plan and the
    // review screen files the record of it rather than refusing.
    expect(poaInstrument(weSign, 2019, now)).toBe("VTR-271-A");
    expect(planRefusal(weSign, 2019, now)).toBe("odometer-exempt-required");
  });

  it("allows the plain form on a vehicle old enough to be exempt", () => {
    expect(poaInstrument(weSign, 1998, now)).toBe("VTR-271");
    expect(planRefusal(weSign, 1998, now)).toBeNull();
  });

  it("owes no form at all when the buyer signs the application themselves", () => {
    // The ordinary sale. This was the dead end: a 2019 car, the buyer at
    // the desk, and a power of attorney nobody needed that could not be
    // used.
    expect(poaInstrument(plan({ registrationBy: "dealer", titleSignedBy: "buyer" }), 2019, now)).toBeNull();
    expect(planRefusal(plan({ registrationBy: "dealer", titleSignedBy: "buyer" }), 2019, now)).toBeNull();
  });

  it("does not apply when the buyer is registering", () => {
    expect(poaInstrument(plan({ registrationBy: "buyer" }), 2019, now)).toBeNull();
    expect(planRefusal(plan({ registrationBy: "buyer" }), 2019, now)).toBeNull();
  });

  it("says the year is missing rather than guessing a form", () => {
    expect(poaInstrument(weSign, null, now)).toBe("unknown-year");
    expect(planRefusal(weSign, null, now)).toBeNull();
  });
});

/**
 * The logic chain.
 *
 * The owner's rule, in his words: he does not want to say the customer is
 * registering the vehicle and then keep being asked things that do not
 * pertain to that route.
 */
describe("only the questions this sale actually has", () => {
  it("starts with the one that decides the branch", () => {
    expect(planQuestions(EMPTY_SALE_PLAN)[0]).toBe("registrationBy");
  });

  it("asks who signs the application only when WE are filing", () => {
    // The answer decides whether a power of attorney exists. When the buyer
    // files there is no application of ours to sign.
    expect(planQuestions(plan({ registrationBy: "dealer" }))).toContain("titleSignedBy");
    expect(planQuestions(plan({ registrationBy: "buyer" }))).not.toContain("titleSignedBy");
    expect(planQuestions(plan({ registrationBy: "dealer" }))[1]).toBe("titleSignedBy");
  });

  it("clears the signer answer when registration moves to the buyer", () => {
    const stored = plan({ registrationBy: "dealer", titleSignedBy: "dealer" });
    expect(applyPlanAnswer(stored, "registrationBy", "buyer").titleSignedBy).toBeNull();
  });

  it("asks about the price only when the BUYER is filing", () => {
    // That is the case where the figure becomes a quote they might owe us
    // later, and it is the number the Vehicle Responsibility form prints.
    expect(planQuestions(plan({ registrationBy: "buyer" }))).toContain(
      "priceIncludesRegistration",
    );
    // When we file, registration is simply part of what we do.
    expect(planQuestions(plan({ registrationBy: "dealer" }))).not.toContain(
      "priceIncludesRegistration",
    );
  });

  it("asks inspection and insurance on every sale", () => {
    for (const by of ["dealer", "buyer"] as const) {
      const ids = planQuestions(plan({ registrationBy: by }));
      expect(ids).toContain("inspectionBy");
      expect(ids).toContain("insuranceShown");
    }
  });

  it("cannot be completed while a question it owes is unanswered", () => {
    const buyerFiles = plan({
      registrationBy: "buyer",
      inspectionBy: "buyer",
      insuranceShown: true,
    });
    // The price question applies on this route and has not been answered.
    expect(isSalePlanComplete(buyerFiles)).toBe(false);
    expect(nextUnanswered(buyerFiles)).toBe("priceIncludesRegistration");
    expect(
      isSalePlanComplete({ ...buyerFiles, priceIncludesRegistration: false }),
    ).toBe(true);
  });

  it("is not blocked by a question this route never asks", () => {
    // Same missing field, but we are filing, so it was never owed.
    const weFile = plan({
      registrationBy: "dealer",
      titleSignedBy: "buyer",
      inspectionBy: "dealer",
      insuranceShown: true,
    });
    expect(weFile.priceIncludesRegistration).toBeNull();
    expect(isSalePlanComplete(weFile)).toBe(true);
    expect(nextUnanswered(weFile)).toBeNull();
  });
});

describe("a rebuilt title brings its own disclosure", () => {
  it("adds the document without anybody choosing it", () => {
    // Verified at acquisition and read here: the sale never asks.
    const docs = requiredDocumentTypes("cash", EMPTY_SALE_PLAN, "rebuilt_salvage");
    expect(docs).toContain("rebuiltDisclosure");
  });

  it("leaves a clean title alone", () => {
    expect(requiredDocumentTypes("cash", EMPTY_SALE_PLAN, "clean")).not.toContain(
      "rebuiltDisclosure",
    );
    expect(requiredDocumentTypes("cash", EMPTY_SALE_PLAN)).not.toContain(
      "rebuiltDisclosure",
    );
  });
});

/**
 * What the adversarial review caught, kept caught.
 *
 * Each of these is a bug that existed in code and was found by review rather
 * than by use. The tests are here so the fix cannot quietly regress.
 */
describe("one answer at a time, applied to what is stored", () => {
  it("applies only the submitted field", () => {
    const stored = plan({ registrationBy: "buyer", inspectionBy: "done" });
    const next = applyPlanAnswer(stored, "insuranceShown", true);
    // The sibling answers survive. The first version rewrote the whole plan
    // from the client's copy, so a retry could erase one that had already
    // committed.
    expect(next.registrationBy).toBe("buyer");
    expect(next.inspectionBy).toBe("done");
    expect(next.insuranceShown).toBe(true);
  });

  it("clears the price answer when registration goes back to the dealer", () => {
    const stored = plan({
      registrationBy: "buyer",
      priceIncludesRegistration: false,
    });
    const next = applyPlanAnswer(stored, "registrationBy", "dealer");
    // That question does not exist on this route, so a stale answer must not
    // ride along where planQuestions will never surface it for correction.
    expect(next.priceIncludesRegistration).toBeNull();
    expect(planQuestions(next)).not.toContain("priceIncludesRegistration");
  });

  it("refuses a value that is not an answer to that question", () => {
    expect(isValidAnswer("registrationBy", "dealer")).toBe(true);
    expect(isValidAnswer("registrationBy", true)).toBe(false);
    expect(isValidAnswer("insuranceShown", true)).toBe(true);
    expect(isValidAnswer("insuranceShown", "yes")).toBe(false);
    expect(isValidAnswer("inspectionBy", "maybe")).toBe(false);
  });

  it("counts a false answer as answered", () => {
    // priceIncludesRegistration: false is an ANSWER. A falsy check would
    // call it missing and hold the sale on a question already answered.
    const stored = plan({
      registrationBy: "buyer",
      priceIncludesRegistration: false,
    });
    expect(isPlanQuestionAnswered(stored, "priceIncludesRegistration")).toBe(true);
    expect(nextUnanswered(stored)).toBe("inspectionBy");
  });
});

describe("step identity", () => {
  it("maps every question to a key and back", () => {
    for (const id of planQuestions(plan({ registrationBy: "buyer" }))) {
      expect(planQuestionForStep(PLAN_STEP_KEY[id])).toBe(id);
    }
  });

  it("does not claim a document key as a plan question", () => {
    // The router's default branch used to treat any unknown key as a
    // document, so an unwired step rendered a document heading with no
    // controls: a dead end that looks like a working screen.
    expect(planQuestionForStep("document:billOfSale")).toBeNull();
    expect(planQuestionForStep("packet")).toBeNull();
  });
});

describe("a signed document freezes the answers that made it", () => {
  it("refuses when a plan-derived document is finalized", () => {
    const refusal = planEditRefusal(["billOfSale", "form130U"]);
    expect(refusal?.reason).toBe("documents-finalized");
    // Named, so the screen can say which one is holding it.
    expect(refusal?.blockedBy).toEqual(["form130U"]);
  });

  it("reaches wider than the two obvious documents", () => {
    // Insurance adds or removes an acknowledgment, and the price answer
    // feeds the figure printed on the Vehicle Responsibility form.
    expect(planEditRefusal(["insuranceAcknowledgment"])).not.toBeNull();
    expect(planEditRefusal(["vehicleResponsibility"])).not.toBeNull();
    expect(planEditRefusal(["rebuiltDisclosure"])).not.toBeNull();
  });

  it("lets an unrelated signed document alone", () => {
    expect(planEditRefusal(["billOfSale"])).toBeNull();
    expect(planEditRefusal([])).toBeNull();
  });
});
