import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { readMoney } from "@/lib/sales/money";
import { financingTerms, paperworkMoney, readPaperwork } from "@/lib/sales/paperwork";
import { contractFigures, type ContractData } from "@/lib/documents/finance";
import {
  BILL_OF_SALE_TYPES,
  DOWN_PAYMENT_FROZEN_MESSAGE,
  PAID_TODAY_INVALID_MESSAGE,
  canonicalPaidToday,
  downPaymentChanges,
  filedBillOfSale,
  isFiledAgreement,
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

/*
  Review round 10/02/2026. The down payment is stored as one plain figure, so
  every reader of it reads the same text: the bill of sale's balance (which
  strips and clamps), the contract's itemisation (which strips, never clamps)
  and the note's payment solver (which did neither, reading "1,500" as
  nothing down). A figure that is not a dollar amount of zero or more is
  refused outright, with nothing written, filed or not.
*/

/** The note's principal and payment as the contract would solve them. */
function noteOn(stepData: unknown) {
  const money = paperworkMoney(9000, readPaperwork(stepData, "billOfSale"), readMoney(stepData), "inHouse");
  const terms = financingTerms(
    { termsBy: "count", numberOfPayments: "36", apr: "18", paymentFrequency: "Monthly", ...readPaperwork(stepData, "financing") },
    { dealTotal: money.total, vehicleYear: 2015, saleYear: 2026, paidToday: money.paidToday },
  ) as { principal: number; payment: number };
  return { lien: money.lien, principal: terms.principal, payment: terms.payment };
}

describe("the down payment as one plain figure", () => {
  it("is digits and cents, an empty box stays empty, and anything else is no figure", () => {
    expect(canonicalPaidToday("1,500")).toBe("1500");
    expect(canonicalPaidToday("$1,500.00")).toBe("1500");
    expect(canonicalPaidToday(" 1500 ")).toBe("1500");
    expect(canonicalPaidToday("1500.5")).toBe("1500.5");
    expect(canonicalPaidToday(".75")).toBe("0.75");
    expect(canonicalPaidToday("0")).toBe("0");
    // Empty is "nothing typed", which the money math reads differently from $0.
    expect(canonicalPaidToday("")).toBe("");
    expect(canonicalPaidToday("$")).toBe("");
    for (const typed of ["-500", "-0.01", "abc", "1e3", "12-3", "1,500 dollars", "0x10"]) {
      expect(canonicalPaidToday(typed), typed).toBeNull();
    }
  });

  it("is stored plain from the money step, so the note is solved on the balance the bill of sale states", async () => {
    state.filed = null;
    state.current = bhph("");
    const result = await saveSaleMoney("deal-1", { paidTodayAmount: "$1,500.00" });
    expect(result).toEqual({ ok: true });
    expect(readMoney(state.written[0]).paidTodayAmount).toBe("1500");
    expect(readPaperwork(state.written[0], "financing").downPayment).toBe("1500");
    expect(noteOn(state.written[0])).toEqual(noteOn(bhph("1500")));
    expect(noteOn(state.written[0]).principal).toBe(noteOn(state.written[0]).lien);
  });

  it("is stored plain from the contract, so its two homes hold the same text", async () => {
    state.filed = null;
    state.current = bhph("");
    const result = await savePaperworkAnswer("deal-1", "financing", "downPayment", "1,500");
    expect(result).toEqual({ ok: true });
    expect(readMoney(state.written[0]).paidTodayAmount).toBe("1500");
    expect(readPaperwork(state.written[0], "financing").downPayment).toBe("1500");
  });

  it("leaves the note exactly as it was when the same figure is typed again after filing", async () => {
    const before = noteOn(state.current);
    for (const same of ["1,500", "$1,500.00"]) {
      state.written = [];
      const result = await saveSaleMoney("deal-1", { paidTodayAmount: same });
      expect(result, same).toEqual({ ok: true });
      expect(readMoney(state.written[0]).paidTodayAmount).toBe("1500");
      expect(readPaperwork(state.written[0], "financing").downPayment).toBe("1500");
      expect(noteOn(state.written[0])).toEqual(before);
    }
  });

  it.each([["filed", true], ["not yet filed", false]])(
    "refuses a negative or non-numeric figure from the money step with the bill of sale %s, and writes nothing",
    async (_label, filed) => {
      if (!filed) state.filed = null;
      state.current = bhph("");
      for (const typed of ["-500", "abc"]) {
        const result = await saveSaleMoney("deal-1", { paidTodayAmount: typed });
        expect(result, typed).toEqual({ ok: false, error: PAID_TODAY_INVALID_MESSAGE, code: "paidTodayInvalid" });
      }
      expect(state.written).toEqual([]);
    },
  );

  it.each(["sales", "registration"])("refuses a negative or non-numeric contract down payment for %s, and writes nothing", async (role) => {
    state.role = role;
    state.current = bhph("");
    for (const typed of ["-500", "abc"]) {
      const result = await savePaperworkAnswer("deal-1", "financing", "downPayment", typed);
      expect(result, typed).toEqual({ ok: false, error: PAID_TODAY_INVALID_MESSAGE, code: "paidTodayInvalid" });
    }
    expect(state.written).toEqual([]);
    expect(state.lookups).toBe(0);
  });

  it("is said in both languages on both screens", () => {
    expect(en.funnel.money.paidTodayInvalid).toBe(PAID_TODAY_INVALID_MESSAGE);
    expect(es.funnel.money.paidTodayInvalid).toMatch(/cantidad en dólares/);
    const money = readFileSync("src/components/admin/guide/MoneyStep.tsx", "utf8");
    const answer = readFileSync("src/components/admin/paperwork/AnswerStep.tsx", "utf8");
    expect(money).toMatch(/if \(result\.code === "paidTodayInvalid"\) return t\.money\.paidTodayInvalid;/);
    expect(answer).toMatch(/result\.code === "paidTodayInvalid"\s*\?\s*t\.money\.paidTodayInvalid/);
  });

  it("counts a figure above the total as a different down payment: the contract prints what was typed", () => {
    expect(downPaymentChanges({ advertised: 9000, stepData: bhph("50000"), to: "60000" })).toBe(true);
    expect(downPaymentChanges({ advertised: 9000, stepData: bhph("50000"), to: "50,000" })).toBe(false);
  });

  it("reads a down payment saved before it was stored plain the way the contract prints it", () => {
    // "1,500" from an older save: the solver now finances the same balance the
    // contract's itemisation and the bill of sale state.
    expect(noteOn(bhph("1,500"))).toEqual(noteOn(bhph("1500")));
    const contract = (downPayment: string) =>
      contractFigures({
        cashPrice: 9000, downPayment: Number(downPayment.replace(/[$,\s]/g, "")), tax: 0, titleFee: 0, registrationFee: 0,
        docFee: 0, apr: 18, numberOfPayments: 36, paymentFrequency: "Monthly", tradeInAllowance: 2000,
      } as ContractData).amountFinanced;
    expect(contract("1,500")).toBe(contract("1500"));
  });
});

describe("what counts as a filed bill of sale", () => {
  it("is the desk's own rule: filed here, or completed through the older e-sign path", () => {
    expect(isFiledAgreement({ document_type: "billOfSale", finalized_at: "2026-10-01T15:00:00Z" })).toBe(true);
    expect(isFiledAgreement({ document_type: "billOfSale", status: "finalized" })).toBe(true);
    expect(isFiledAgreement({ document_type: "billOfSale", status: "completed", completed_at: "2026-10-01T15:00:00Z", finalized_at: null })).toBe(true);
    expect(isFiledAgreement({ document_type: "billOfSale", completed_at: "2026-10-01T15:00:00Z" })).toBe(true);
    expect(isFiledAgreement({ document_type: "billOfSale", status: "pending", completed_at: null, finalized_at: null })).toBe(false);
    expect(isFiledAgreement({ document_type: "billOfSale", status: "sent" })).toBe(false);
  });

  it("is the rule the packet is drawn with", () => {
    const desk = readFileSync("src/lib/admin/sale-desk.ts", "utf8");
    expect(desk).toMatch(/Boolean\(agreement\.finalized_at\) \|\|\s*Boolean\(agreement\.completed_at\) \|\|\s*agreement\.status === "completed" \|\|\s*agreement\.status === "finalized"/);
  });
});
