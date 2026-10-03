import { describe, expect, it } from "vitest";
import { applyPlanAnswer, EMPTY_SALE_PLAN, INSPECTION_NOTICE_VERSION, readSalePlan, writeSalePlan, outstandingFromPlan, type InspectionAcknowledgment } from "@/lib/sales/sale-plan";

const acknowledgment: InspectionAcknowledgment = { at: "2026-09-08T18:00:00.000Z", by: "staff-1", version: INSPECTION_NOTICE_VERSION };
const plan = { ...EMPTY_SALE_PLAN, inspectionBy: "buyer" as const, inspectionAcknowledgment: acknowledgment };

describe("the dealer inspection acknowledgment is an internal fact", () => {
  it("survives saving other plan answers and a step-data round trip", () => {
    const changed = applyPlanAnswer(plan, "insuranceShown", true);
    expect(readSalePlan(writeSalePlan({ money: { amount: "6000" } }, changed)).inspectionAcknowledgment).toEqual(acknowledgment);
  });
  it("drops the acknowledgment when the inspection answer changes and never resurrects it", () => {
    const changed = applyPlanAnswer(plan, "inspectionBy", "dealer");
    expect(changed.inspectionAcknowledgment).toBeUndefined();
    expect(applyPlanAnswer(changed, "inspectionBy", "buyer").inspectionAcknowledgment).toBeUndefined();
  });
  it("rejects stale, invalid and non-buyer acknowledgments on read", () => {
    expect(readSalePlan({ salePlan: { ...plan, inspectionBy: "done" } }).inspectionAcknowledgment).toBeUndefined();
    expect(readSalePlan({ salePlan: { ...plan, inspectionAcknowledgment: { ...acknowledgment, version: "old" } } }).inspectionAcknowledgment).toBeUndefined();
    expect(readSalePlan({ salePlan: { ...plan, inspectionAcknowledgment: { ...acknowledgment, at: "no date" } } }).inspectionAcknowledgment).toBeUndefined();
  });
  it("never attaches the staff notice to the bill-of-sale data", () => {
    expect(outstandingFromPlan(plan)).toEqual({ inspectionByDealer: false, inspectionDone: false });
  });
  it("does not change legacy plan completion or fabricate a historic acknowledgment", () => {
    expect(readSalePlan({ salePlan: { inspectionBy: "buyer" } }).inspectionAcknowledgment).toBeUndefined();
  });
});
