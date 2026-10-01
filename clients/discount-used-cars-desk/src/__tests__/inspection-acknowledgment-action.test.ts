import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveSalePlanAnswer } from "@/lib/actions/sale-plan";
import { INSPECTION_NOTICE_VERSION } from "@/lib/sales/sale-plan";

const state = vi.hoisted(() => ({ stepData: {} as Record<string, unknown>, writes: 0 }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/current-admin", () => ({ requireAdminActionPermission: async () => ({ ok: true, user: { id: "staff-test" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ not: async () => ({ data: [] }) }) }) }) }) }));
vi.mock("@/lib/sales/step-data-write", () => ({ casMergeStepData: async (_client: unknown, _id: string, build: (current: Record<string, unknown>) => Record<string, unknown> | null) => {
  const patch = build(state.stepData);
  if (patch) { state.stepData = { ...state.stepData, ...patch }; state.writes++; }
  return { ok: true, version: state.writes, stepData: state.stepData };
} }));

beforeEach(() => {
  state.writes = 0;
  state.stepData = { salePlan: { registrationBy: "dealer", titleSignedBy: "buyer", insuranceShown: null, inspectionBy: null } };
});

describe("inspection confirmation cannot be skipped through the server action", () => {
  it("rejects the customer answer without the explicit acknowledgment", async () => {
    const result = await saveSalePlanAnswer("sale-test", { questionId: "inspectionBy", value: "buyer" });
    expect(result).toMatchObject({ ok: false });
    expect(state.writes).toBe(0);
  });
  it("stamps the confirmed customer answer with the authenticated staff and server time", async () => {
    const result = await saveSalePlanAnswer("sale-test", { questionId: "inspectionBy", value: "buyer", inspectionAcknowledged: true });
    expect(result).toMatchObject({ ok: true, next: "insuranceShown" });
    expect(state.stepData.salePlan).toMatchObject({ inspectionBy: "buyer", inspectionAcknowledgment: { by: "staff-test", version: INSPECTION_NOTICE_VERSION } });
    expect(Number.isFinite(Date.parse((state.stepData.salePlan as { inspectionAcknowledgment: { at: string } }).inspectionAcknowledgment.at))).toBe(true);
  });
  it("does not require or store an acknowledgment when the dealer completes the inspection", async () => {
    const result = await saveSalePlanAnswer("sale-test", { questionId: "inspectionBy", value: "dealer" });
    expect(result).toMatchObject({ ok: true });
    expect(state.stepData.salePlan).not.toHaveProperty("inspectionAcknowledgment");
  });
});
