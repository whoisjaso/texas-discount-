import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { readMoney } from "@/lib/sales/money";
import { readPaperwork } from "@/lib/sales/paperwork";
import {
  BILL_OF_SALE_TYPES,
  DOWN_PAYMENT_FROZEN_MESSAGE,
  downPaymentChanges,
  filedBillOfSale,
} from "@/lib/sales/down-payment-freeze";

/**
 * The down payment is frozen once the bill of sale is filed (owner's decision
 * 10/01/2026; SOP "The sale plan", Freeze).
 *
 * The bill of sale states what crossed the desk and the balance left, and on
 * buy here pay here that balance is the note the contract finances. A change
 * to the down payment after the bill of sale is filed, from the money step's
 * "Down today" or from the contract's down-payment answer that writes back
 * to it, is refused with the way out: void the bill of sale and file it
 * again. The same figure saved again is not a change.
 */

const state = vi.hoisted(() => ({
  role: "sales" as string,
  filed: null as null | { type: string; advertised: number | null },
  lookupFails: false,
  lookups: 0,
  current: {} as Record<string, unknown>,
  written: [] as Array<unknown>,
}));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: state.role, user: { id: "u1" }, member: null }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/sales/filed-bill-of-sale", () => ({
  filedBillOfSaleOn: async () => {
    state.lookups += 1;
    if (state.lookupFails) throw new Error("Filed documents could not be checked.");
    return state.filed;
  },
}));
// The real merge, run once against the deal as the test holds it: a null
// patch is "nothing written", exactly as casMergeStepData treats it.
vi.mock("@/lib/sales/step-data-write", () => ({
  casMergeStepData: async (_client: unknown, _dealId: string, transform: (current: unknown) => unknown) => {
    const patch = transform(state.current);
    if (patch) state.written.push(patch);
    return { ok: true, stepData: patch ?? state.current };
  },
}));

import { saveSaleMoney } from "@/lib/actions/sale-money";
import { savePaperworkAnswer } from "@/lib/actions/paperwork";

/** A buy here pay here deal: $9,000 car alone, $2,000 trade, $1,500 down. */
function bhph(paidTodayAmount = "1500") {
  return {
    funding: { type: "inHouse", lenderId: null, lenderOther: null },
    money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount },
    paperwork: {
      billOfSale: { tradeIn: "yes", tradeInAllowance: "2000", tradeInDescription: "2012 Honda Civic LX" },
      financing: { downPayment: paidTodayAmount, paymentFrequency: "Monthly" },
    },
  };
}

beforeEach(() => {
  state.role = "sales";
  state.filed = { type: "billOfSale", advertised: 9000 };
  state.lookupFails = false;
  state.lookups = 0;
  state.current = bhph();
  state.written = [];
});

describe("which filed sheet holds the down payment", () => {
  it("is the bill of sale, or the salvage bill of sale on a tow-away sale", () => {
    expect([...BILL_OF_SALE_TYPES]).toEqual(["billOfSale", "salvageBillOfSale"]);
    expect(filedBillOfSale(["form130U", "billOfSale"])).toBe("billOfSale");
    expect(filedBillOfSale(["towAwayAcknowledgment", "salvageBillOfSale"])).toBe("salvageBillOfSale");
    expect(filedBillOfSale(["form130U", "insuranceAcknowledgment", "financing"])).toBeNull();
    expect(filedBillOfSale([])).toBeNull();
  });
});

describe("what counts as a change", () => {
  it("measures the figure, not the typing", () => {
    for (const same of ["1500", "1,500", "$1,500.00", " 1500 "]) {
      expect(downPaymentChanges({ advertised: 9000, stepData: bhph(), to: same }), same).toBe(false);
    }
    expect(downPaymentChanges({ advertised: 9000, stepData: bhph(), to: "2000" })).toBe(true);
    expect(downPaymentChanges({ advertised: 9000, stepData: bhph(), to: "" })).toBe(true);
  });

  it("reads nothing down on a financed deal as $0.00, typed or not", () => {
    expect(downPaymentChanges({ advertised: 9000, stepData: bhph(""), to: "0" })).toBe(false);
    expect(downPaymentChanges({ advertised: 9000, stepData: bhph("0"), to: "" })).toBe(false);
    expect(downPaymentChanges({ advertised: 9000, stepData: bhph(""), to: "1500" })).toBe(true);
  });
});

describe("the money step's Down today", () => {
  it("is refused once the bill of sale is filed, with the way out, and nothing is written", async () => {
    const result = await saveSaleMoney("deal-1", { paidTodayAmount: "2500" });
    expect(result).toEqual({ ok: false, error: DOWN_PAYMENT_FROZEN_MESSAGE, code: "downPaymentFrozen" });
    expect(result.error).toMatch(/Void the bill of sale and file it again/);
    expect(state.written).toEqual([]);
  });

  it("is refused on a tow-away sale whose salvage bill of sale is filed", async () => {
    state.filed = { type: "salvageBillOfSale", advertised: 9000 };
    expect((await saveSaleMoney("deal-1", { paidTodayAmount: "0" })).ok).toBe(false);
    expect(state.written).toEqual([]);
  });

  it("goes through when the same down payment is saved again (every Next resends it)", async () => {
    const result = await saveSaleMoney("deal-1", { priceBasis: "vehicleOnly", paidTodayAmount: "1,500" });
    expect(result).toEqual({ ok: true });
    expect(state.written).toHaveLength(1);
  });

  it("is free to change before the bill of sale is filed, and moves the contract with it", async () => {
    state.filed = null;
    const result = await saveSaleMoney("deal-1", { paidTodayAmount: "2500" });
    expect(result).toEqual({ ok: true });
    expect(readMoney(state.written[0]).paidTodayAmount).toBe("2500");
    expect(readPaperwork(state.written[0], "financing").downPayment).toBe("2500");
  });

  it("is not looked up for a save that carries no down payment", async () => {
    const result = await saveSaleMoney("deal-1", { priceBasis: "vehicleOnly" });
    expect(result).toEqual({ ok: true });
    expect(state.lookups).toBe(0);
  });

  it("fails closed when the filed documents cannot be checked", async () => {
    state.lookupFails = true;
    const result = await saveSaleMoney("deal-1", { paidTodayAmount: "2500" });
    expect(result.ok).toBe(false);
    expect(state.written).toEqual([]);
  });
});

describe("the financing contract's down payment", () => {
  it.each(["sales", "registration"])("is refused for %s once the bill of sale is filed, and nothing is written", async (role) => {
    state.role = role;
    const result = await savePaperworkAnswer("deal-1", "financing", "downPayment", "2500");
    expect(result).toEqual({ ok: false, error: DOWN_PAYMENT_FROZEN_MESSAGE, code: "downPaymentFrozen" });
    expect(state.written).toEqual([]);
  });

  it("goes through with the figure the bill of sale already states", async () => {
    const result = await savePaperworkAnswer("deal-1", "financing", "downPayment", "1500");
    expect(result).toEqual({ ok: true });
    expect(state.written).toHaveLength(1);
  });

  it("writes back to the money step before the bill of sale is filed, as it always did", async () => {
    state.filed = null;
    state.current = bhph("");
    const result = await savePaperworkAnswer("deal-1", "financing", "downPayment", "1500");
    expect(result).toEqual({ ok: true });
    expect(readMoney(state.written[0]).paidTodayAmount).toBe("1500");
  });

  it("leaves every other answer alone", async () => {
    const result = await savePaperworkAnswer("deal-1", "financing", "paymentFrequency", "Weekly");
    expect(result).toEqual({ ok: true });
    expect(state.lookups).toBe(0);
  });
});

describe("the refusal on screen", () => {
  it("is said in both languages and names the way out", () => {
    expect(en.funnel.money.downPaymentFrozen).toMatch(/Void the bill of sale and file it again/);
    expect(es.funnel.money.downPaymentFrozen).toMatch(/Anule la factura de venta y vuelva a archivarla/);
  });

  it("is shown by both screens that take a down payment", () => {
    const money = readFileSync("src/components/admin/guide/MoneyStep.tsx", "utf8");
    const answer = readFileSync("src/components/admin/paperwork/AnswerStep.tsx", "utf8");
    expect(money).toMatch(/if \(result\.code === "downPaymentFrozen"\) \{[\s\S]*?return t\.money\.downPaymentFrozen;/);
    // Nothing was saved, so the box and the receipt go back to the filed figure.
    expect(money).toMatch(/if \(result\.code === "downPaymentFrozen"\) \{\s*(?:\/\/[^\n]*\n\s*)*setAdjustTyped\(initial\.paidTodayAmount\);/);
    expect(answer).toMatch(/result\.code === "downPaymentFrozen"\s*\?\s*t\.money\.downPaymentFrozen/);
  });
});
