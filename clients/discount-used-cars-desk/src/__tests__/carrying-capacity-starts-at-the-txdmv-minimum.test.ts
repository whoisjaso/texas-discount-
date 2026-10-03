import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { paperworkDefault, paperworkQuestions } from "@/lib/sales/paperwork";
import { carryingCapacityStart, emptyWeightContext } from "@/lib/vehicles/empty-weight/on-the-sale";
import { makeEstimate, makeSale } from "./helpers/empty-weight";
import { stripComments } from "./helpers/strip-comments";

/**
 * A truck's carrying capacity starts at TxDMV's minimum for its empty weight.
 *
 * Registration Manual Table 2-1: 1,000 lb for an empty weight of 6,000 lb or
 * less, and so on up the table, used when the applicant cannot supply a
 * figure and the door-jamb GVWR cannot be read. It is a starting value on
 * the screen, labelled as that, never a default (so never filed unseen), and
 * never computed from vPIC's GVWR, which is a class range.
 */

const truck = (box11: string, answers: Record<string, string> = {}) => {
  const sale = makeSale({ emptyWeight: box11, _emptyWeightSource: "texas_title", ...answers }, { bodyStyle: "Truck" });
  const ctx = emptyWeightContext(sale.vehicle, makeEstimate({ vehicle: { cls: "truck", gvwrClass: "2E" } }));
  return { ctx, filed: { emptyWeight: box11 }, stored: { emptyWeight: box11, ...answers } };
};

describe("the starting value", () => {
  it("is 1,000 lb for a truck whose box 11 is 5,100", () => {
    const { ctx, filed, stored } = truck("5100");
    expect(carryingCapacityStart(ctx, filed, stored)).toBe(1000);
  });

  it("follows the table up: 6,600 lb empty starts at 1,500", () => {
    const { ctx, filed, stored } = truck("6600");
    expect(carryingCapacityStart(ctx, filed, stored)).toBe(1500);
  });

  it("is never read from vPIC's GVWR: a Class 2E estimate changes nothing", () => {
    const { ctx, filed, stored } = truck("5100");
    expect(ctx.estimate?.vehicle.gvwrClass).toBe("2E");
    expect(carryingCapacityStart(ctx, filed, stored)).toBe(1000);
    const page = stripComments(readFileSync("src/app/admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx", "utf8"));
    expect(page).not.toMatch(/gvwr/i);
    const rule = stripComments(readFileSync("src/lib/vehicles/empty-weight/on-the-sale.ts", "utf8"));
    const start = rule.slice(rule.indexOf("export function carryingCapacityStart"));
    expect(start).not.toMatch(/gvwr/i);
  });

  it("is not offered to a passenger van, an SUV or a car", () => {
    for (const bodyStyle of ["Van", "SUV", "Sedan"]) {
      const sale = makeSale({ emptyWeight: "4200" }, { bodyStyle });
      const ctx = emptyWeightContext(sale.vehicle, null);
      expect(carryingCapacityStart(ctx, { emptyWeight: "4200" }, { emptyWeight: "4200" }), bodyStyle).toBeNull();
    }
  });

  it("waits for box 11, and never overwrites an answer", () => {
    const { ctx } = truck("5100");
    expect(carryingCapacityStart(ctx, {}, {})).toBeNull();
    expect(carryingCapacityStart(ctx, { emptyWeight: "5100" }, { carryingCapacity: "1800" })).toBeNull();
    expect(carryingCapacityStart(ctx, { emptyWeight: "5100" }, { carryingCapacity: "" })).toBeNull();
  });

  it("is never a default, so it is never filed unseen", () => {
    const { ctx } = truck("5100");
    const context = {
      funding: "cash" as const,
      bodyStyle: "truck",
      licenceState: "TX",
      paidToday: null,
      buyerCity: "Houston",
      buyerCounty: "Harris",
      emptyWeight: ctx,
      answers: { emptyWeight: "5100", _emptyWeightSource: "texas_title" },
    };
    expect(paperworkQuestions("form130U", context).map((q) => q.key)).toContain("carryingCapacity");
    expect(paperworkDefault("form130U", "carryingCapacity", context)).toBeUndefined();
  });
});

describe("the words on the screen", () => {
  it("label the starting value as the TxDMV minimum from Table 2-1", () => {
    expect(en.funnel.weight.capacityMinimum).toBe("TxDMV minimum for this empty weight (Registration Manual Table 2-1)");
    const page = readFileSync("src/app/admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx", "utf8");
    expect(page).toContain('suggestionNote={capacityStart !== null ? "capacityMinimum" : null}');
  });

  it("say the door jamb shows the GVWR, not the empty weight", () => {
    expect(en.funnel.paperwork.form130U.carryingCapacity.note).toMatch(/GVWR on the door jamb less the empty weight/);
    expect(en.funnel.paperwork.form130U.emptyWeight.note).toMatch(/door jamb shows GVWR, not the empty weight/);
  });
});
