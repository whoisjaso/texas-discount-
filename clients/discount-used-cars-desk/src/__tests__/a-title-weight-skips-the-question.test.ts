import { describe, expect, it } from "vitest";
import {
  paperworkAnswers,
  paperworkDefault,
  paperworkQuestions,
  type PaperworkContext,
} from "@/lib/sales/paperwork";
import { emptyWeightContext, weightPrompt } from "@/lib/vehicles/empty-weight/on-the-sale";
import { makeEstimate, makeSale, TITLE_ON_FILE } from "./helpers/empty-weight";

/**
 * A weight read off a document and recorded on the car is box 11.
 *
 * The question is skipped and the figure is affixed with its source, so the
 * paper, the review and the filing all say "Texas title, entered by ...".
 * The review's Change link reopens it. A weight on the car with no recorded
 * source is not that: it is asked, shown as what it is, and never defaulted.
 */

function context(answers: Record<string, string>, vehicle: Parameters<typeof makeSale>[1], reopen?: string): PaperworkContext {
  const sale = makeSale(answers, vehicle);
  return {
    funding: "cash",
    bodyStyle: (sale.vehicle?.bodyStyle ?? "").toLowerCase(),
    licenceState: "TX",
    paidToday: null,
    buyerCity: "Houston",
    buyerCounty: "Harris",
    vehicleWeight: sale.vehicle?.weightLbs ?? null,
    emptyWeight: emptyWeightContext(sale.vehicle, null),
    ...(reopen ? { reopen } : {}),
    answers,
  };
}

const keys = (ctx: PaperworkContext) => paperworkQuestions("form130U", ctx).map((q) => q.key);

describe("a document on the vehicle", () => {
  it("removes the question", () => {
    expect(keys(context({}, TITLE_ON_FILE))).not.toContain("emptyWeight");
  });

  it("affixes box 11 with where it came from", () => {
    const filed = paperworkAnswers("form130U", context({}, TITLE_ON_FILE));
    expect(filed).toMatchObject({
      emptyWeight: "3300",
      _emptyWeightSource: "texas_title",
      _emptyWeightFrom: "vehicle",
      _emptyWeightReading: "3252",
      _emptyWeightRule: "roundUp",
      _emptyWeightBy: "Jo Smith",
      _emptyWeightAt: "2026-10-01T15:00:00.000Z",
    });
  });

  it("comes back when the review's Change reopens it, with the document as its starting answer", () => {
    const ctx = context({}, TITLE_ON_FILE, "emptyWeight");
    expect(keys(ctx)).toContain("emptyWeight");
    expect(paperworkDefault("form130U", "emptyWeight", ctx)).toBe("3300");
    // Reopened but not re-answered: still the vehicle's record, not a typed figure.
    expect(paperworkAnswers("form130U", ctx)._emptyWeightSource).toBe("texas_title");
    expect(weightPrompt(ctx.emptyWeight!, {}).state).toBe("onFile");
  });

  it("gives way to an answer stored on the deal", () => {
    const answers = { emptyWeight: "3400", _emptyWeightSource: "weight_certificate", _emptyWeightReason: "Scale ticket" };
    const ctx = context(answers, TITLE_ON_FILE);
    expect(keys(ctx)).toContain("emptyWeight");
    expect(paperworkAnswers("form130U", ctx)).toMatchObject({
      emptyWeight: "3400",
      _emptyWeightSource: "weight_certificate",
      _emptyWeightReason: "Scale ticket",
    });
  });

  it("is not a document when the source is an estimate's or unknown", () => {
    expect(keys(context({}, { weightLbs: 3300, weightSource: "estimate_epa" }))).toContain("emptyWeight");
    expect(keys(context({}, { weightLbs: 3300, weightSource: "door_jamb" }))).toContain("emptyWeight");
  });
});

describe("a legacy weight on the vehicle, source never recorded", () => {
  const legacy = { weightLbs: 3765 } as const;

  it("is asked", () => {
    expect(keys(context({}, legacy))).toContain("emptyWeight");
  });

  it("is not defaulted, and does not reach the paper", () => {
    const ctx = context({}, legacy);
    expect(paperworkDefault("form130U", "emptyWeight", ctx)).toBeUndefined();
    expect(paperworkAnswers("form130U", ctx).emptyWeight).toBeUndefined();
  });

  it("is shown for what it is", () => {
    const prompt = weightPrompt(context({}, legacy).emptyWeight!, {});
    expect(prompt.state).toBe("legacy");
    expect(prompt.legacyLbs).toBe(3765);
  });
});

describe("the screen's state follows what is known", () => {
  it("offers a confirm for a car with an estimate and nothing on file", () => {
    const sale = makeSale();
    const prompt = weightPrompt(emptyWeightContext(sale.vehicle, makeEstimate()), {});
    expect(prompt.state).toBe("estimate");
    expect(prompt.estimate?.box11).toBe(3500);
    expect(prompt.estimate?.rule).toBe("plus100RoundUp");
  });

  it("asks plainly when nothing at all is known", () => {
    const sale = makeSale();
    expect(weightPrompt(emptyWeightContext(sale.vehicle, null), {}).state).toBe("none");
  });

  it("says what the deal holds when reopened", () => {
    const sale = makeSale();
    const prompt = weightPrompt(emptyWeightContext(sale.vehicle, makeEstimate()), {
      emptyWeight: "3500",
      _emptyWeightSource: "estimate_epa",
      _emptyWeightBy: "Jo Smith",
    });
    expect(prompt.state).toBe("answered");
    expect(prompt.answered).toMatchObject({ box11: 3500, source: "estimate_epa", by: "Jo Smith" });
  });
});
