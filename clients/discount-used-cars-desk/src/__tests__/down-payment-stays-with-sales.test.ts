import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readMoney } from "@/lib/sales/money";
import { readPaperwork } from "@/lib/sales/paperwork";

/**
 * The contract's down payment reaches the money step only where it belongs.
 *
 * The down payment is one fact with two homes (SOP "Money"; financing: "never
 * asked twice"), so on a buy here pay here deal the contract's answer is
 * written to `money.paidTodayAmount` as well. But the money step belongs to
 * sales (saveSaleMoney requires sales:manage), and the paperwork action also
 * serves the registration role, which holds paperwork:manage and not
 * sales:manage. A registration member must not move a deal's balance through
 * the contract, and nobody may move a cash deal's balance or 130-U lien
 * through a contract that is not in its packet.
 */

const state = vi.hoisted(() => ({
  role: "sales" as string,
  transforms: [] as Array<(current: unknown) => unknown>,
}));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: state.role, user: { id: "u1" }, member: null }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/sales/step-data-write", () => ({
  casMergeStepData: async (_client: unknown, _dealId: string, transform: (current: unknown) => unknown) => {
    state.transforms.push(transform);
    return { ok: true };
  },
}));

import { savePaperworkAnswer } from "@/lib/actions/paperwork";

function deal(type: "cash" | "inHouse" | "lender") {
  return {
    funding: { type, lenderId: null, lenderOther: null },
    money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
    paperwork: { financing: { paymentFrequency: "Monthly" } },
  };
}

async function answerDownPayment(stepData: unknown, value: string) {
  state.transforms = [];
  const result = await savePaperworkAnswer("deal-1", "financing", "downPayment", value);
  expect(result.ok).toBe(true);
  expect(state.transforms).toHaveLength(1);
  return state.transforms[0](stepData);
}

beforeEach(() => {
  state.role = "sales";
});

describe("the financing down payment", () => {
  it("moves the money step for sales on a buy here pay here deal", async () => {
    const after = await answerDownPayment(deal("inHouse"), "1500");
    expect(readMoney(after).paidTodayAmount).toBe("1500");
    expect(readPaperwork(after, "financing").downPayment).toBe("1500");
  });

  it.each(["cash", "lender"] as const)("never moves a %s deal's money step", async (type) => {
    const after = await answerDownPayment(deal(type), "0");
    expect(readMoney(after).paidTodayAmount).toBe("");
    expect(readPaperwork(after, "financing").downPayment).toBe("0");
  });

  it("never lets the registration role move the money step", async () => {
    state.role = "registration";
    const after = await answerDownPayment(deal("inHouse"), "1500");
    expect(readMoney(after).paidTodayAmount).toBe("");
    // The contract keeps its own answer, exactly as before the join.
    expect(readPaperwork(after, "financing").downPayment).toBe("1500");
  });
});

describe("the money step's reverse write", () => {
  it("only rewrites the contract on a buy here pay here deal", () => {
    const source = readFileSync("src/lib/actions/sale-money.ts", "utf8");
    const call = source.slice(source.indexOf("casMergeStepData("), source.indexOf("withDownPayment(written"));
    expect(call).toMatch(/readFunding\(current\)\.type === "inHouse"/);
  });
});
