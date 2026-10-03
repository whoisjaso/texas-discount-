import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

/**
 * The bill of sale holds everything it states (owner's decision 10/02/2026;
 * SOP "The sale plan", Freeze).
 *
 * Once a bill of sale is filed, a change to anything it prints that the desk
 * lets staff edit is refused, in code, by every action that can write it,
 * with the way out: void the bill of sale and file it again. The same answer
 * saved again is not a change, a figure typed another way is not a change,
 * and everything moves freely before filing and again after a void. Every
 * lookup fails closed.
 */

const state = vi.hoisted(() => ({ role: "owner" as string, adminDataFails: false }));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({
    ok: true,
    role: state.role,
    user: { id: "local-admin-preview", email: "owner@example.dev" },
    member: { id: "member-1", full_name: "Maria Lopez" },
  }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: state.role, member: { id: "member-1" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "tj-local-admin-preview" ? { value: "owner@example.dev" } : undefined),
    set: () => {},
    getAll: () => [],
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/supabase/admin-data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/admin-data")>();
  return {
    ...original,
    createAdminDataClient: async () => {
      if (state.adminDataFails) throw new Error("database unavailable");
      return original.createAdminDataClient();
    },
  };
});

import {
  BILL_OF_SALE_PRINTED_KEYS,
  FREEZE_FIELDS,
  FREEZE_MESSAGES,
  billOfSaleStatement,
  frozenFieldsChanged,
  idPrintedConflict,
  platePrintedConflict,
  statementInputsChanged,
} from "@/lib/sales/bill-of-sale-freeze";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl, encodeCompletedLink } from "@/lib/documents/customerPortal";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import { createMockSupabaseClient, resetMockWrites } from "@/lib/supabase/mock";
import { saveSaleMoney } from "@/lib/actions/sale-money";
import { saveDealFunding, saveSalePlate } from "@/lib/actions/sale-funding";
import { saveSalePlanAnswer } from "@/lib/actions/sale-plan";
import { savePaperworkAnswer } from "@/lib/actions/paperwork";
import { saveConfirmedId } from "@/lib/actions/buyer-id";
import { setDealLanguage } from "@/lib/actions/deal-language";
import { completeSale } from "@/lib/actions/complete-sale";

/* -------------------------------------------------------------------- */
/* The statement                                                         */
/* -------------------------------------------------------------------- */

type Blob = Record<string, unknown>;

/** A cash sale with every answer the bill of sale prints given. */
function cashDeal(): Blob {
  return {
    languageConfirmed: { value: "en", at: "2026-10-02T13:00:00.000Z", by: "u1" },
    funding: { type: "cash", lenderId: null, lenderOther: null },
    money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
    salePlan: { registrationBy: "dealer", titleSignedBy: "buyer", insuranceShown: true, inspectionBy: "done" },
    buyerId: {
      name: { read: null, confirmed: "Andrea Salinas" },
      licenseNumber: { read: null, confirmed: "12345678" },
      mailing: { street: "7400 Metz St", city: "Houston", state: "TX", postal: "77034" },
      mailingConfirmed: true,
      nameParts: { first: "Andrea", middle: null, last: "Salinas", suffix: null },
    },
    paperwork: {
      billOfSale: { odometerStatus: "actual", paymentMethod: "Cash", tradeIn: "no", conditionType: "as_is" },
      salvageBillOfSale: { odometerStatus: "actual", paymentMethod: "Cash", howLeaving: "towTruck" },
    },
  };
}

/** A deep change to one path of a deal. */
function edit(base: Blob, path: string, value: unknown): Blob {
  const copy = JSON.parse(JSON.stringify(base)) as Blob;
  const keys = path.split(".");
  let at = copy as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    at[key] = { ...((at[key] as Record<string, unknown>) ?? {}) };
    at = at[key] as Record<string, unknown>;
  }
  at[keys[keys.length - 1]] = value;
  return copy;
}

const statement = (data: Blob, rootType = "billOfSale", advertised: number | null = 9000) =>
  billOfSaleStatement(data, { advertised, rootType });
const changed = (a: Blob, b: Blob, rootType = "billOfSale") => frozenFieldsChanged(statement(a, rootType), statement(b, rootType));

describe("what the filed bill of sale states", () => {
  const base = cashDeal();

  it.each([
    ["money.amount", "9500", "price"],
    ["money.priceBasis", "outTheDoor", "priceBasis"],
    ["paperwork.billOfSale.odometerStatus", "not_actual", "odometer"],
    ["paperwork.billOfSale.paymentMethod", "Zelle", "paymentMethod"],
    ["paperwork.billOfSale.tradeIn", "yes", "tradeIn"],
    ["paperwork.billOfSale.conditionType", "warranty", "warranty"],
    ["paperwork.billOfSale.buyerLicenseState", "OK", "buyerId"],
    ["buyerId.name", { read: null, confirmed: "Andrea Salinas Lopez" }, "buyerName"],
    ["buyerId.nameParts", { first: "Andrea", middle: "Maria", last: "Salinas", suffix: null }, "buyerName"],
    ["buyerId.licenseNumber", { read: null, confirmed: "87654321" }, "buyerId"],
    ["buyerId.mailing", { street: "100 Main St", city: "Houston", state: "TX", postal: "77034" }, "buyerAddress"],
    ["salePlan.registrationBy", "buyer", "registration"],
    ["salePlan.inspectionBy", "dealer", "inspection"],
    ["salePlan.insuranceShown", false, "insurance"],
  ])("changes when %s becomes %j (names %s)", (path, value, field) => {
    const after = edit(base, path, value);
    expect(statementInputsChanged(base, after)).toBe(true);
    expect(changed(base, after)[0]).toBe(field);
  });

  it("changes with the down payment (which keeps its own refusal), the funding and the lender", () => {
    expect(changed(base, edit(base, "money.paidTodayAmount", "1000"))).not.toEqual([]);
    expect(changed(base, edit(base, "funding", { type: "inHouse", lenderId: null, lenderOther: null }))[0]).toBe("funding");
    const bank = edit(base, "funding", { type: "lender", lenderId: null, lenderOther: "First Bank" });
    expect(changed(bank, edit(bank, "funding.lenderOther", "Second Bank"))).toEqual(["lender"]);
  });

  it("changes with the trade-in's vehicle and allowance, and the warranty's term", () => {
    const traded = edit(edit(edit(base, "paperwork.billOfSale.tradeIn", "yes"), "paperwork.billOfSale.tradeInDescription", "2012 Honda Civic LX"), "paperwork.billOfSale.tradeInAllowance", "2000");
    expect(changed(traded, edit(traded, "paperwork.billOfSale.tradeInDescription", "2013 Honda Civic LX"))).toEqual(["tradeIn"]);
    expect(changed(traded, edit(traded, "paperwork.billOfSale.tradeInAllowance", "2500"))).toEqual(["tradeIn"]);
    const warranty = edit(edit(base, "paperwork.billOfSale.conditionType", "warranty"), "paperwork.billOfSale.warrantyDuration", "30 days");
    expect(changed(warranty, edit(warranty, "paperwork.billOfSale.warrantyDuration", "60 days"))).toEqual(["warranty"]);
  });

  it("states how a salvage car leaves on the salvage bill of sale", () => {
    expect(changed(base, edit(base, "paperwork.salvageBillOfSale.howLeaving", "trailer"), "salvageBillOfSale")).toEqual(["howLeaving"]);
    expect(changed(base, edit(base, "paperwork.salvageBillOfSale.odometerStatus", "exceeds"), "salvageBillOfSale")).toEqual(["odometer"]);
  });

  it("holds an open Still To Do row as it printed: answering it after filing is a change", () => {
    const open = edit(base, "salePlan.insuranceShown", null);
    expect(changed(open, edit(open, "salePlan.insuranceShown", true))).toEqual(["insurance"]);
  });

  it("does not change for the same figure typed differently, or an empty amount that is the car's price", () => {
    expect(changed(base, edit(base, "money.amount", "$9,000.00"))).toEqual([]);
    // An out-the-door deal whose amount was left to the car's price prints
    // the same figures as one that typed it. (On a car-alone deal it does
    // not: the spoken amount is what was paid today, so typing it changes
    // the balance, and that is refused.)
    const otd = edit(base, "money.priceBasis", "outTheDoor");
    expect(changed(otd, edit(otd, "money.amount", ""))).toEqual([]);
    expect(changed(base, edit(base, "money.amount", ""))).toEqual(["price"]);
    const traded = edit(edit(base, "paperwork.billOfSale.tradeIn", "yes"), "paperwork.billOfSale.tradeInAllowance", "2000");
    expect(changed(traded, edit(traded, "paperwork.billOfSale.tradeInAllowance", "2000.00"))).toEqual([]);
    // Measured as the paper prints it: the money reader takes "2,000" as no
    // allowance at all, so that retyping WOULD change the figures, and is the
    // trade-in's to name.
    expect(changed(traded, edit(traded, "paperwork.billOfSale.tradeInAllowance", "2,000"))).toEqual(["tradeIn"]);
    expect(changed(base, edit(base, "buyerId.name", { read: null, confirmed: "  andrea   SALINAS " }))).toEqual([]);
  });

  it("does not change for an answer that does not print: not applicable, who signs the title, or whether the price includes registration", () => {
    const bhph = edit(base, "funding", { type: "inHouse", lenderId: null, lenderOther: null });
    expect(changed(bhph, edit(bhph, "paperwork.billOfSale.paymentMethod", "Zelle"))).toEqual([]);
    expect(changed(base, edit(base, "paperwork.billOfSale.warrantyDuration", "30 days"))).toEqual([]);
    expect(changed(base, edit(base, "salePlan.titleSignedBy", "dealer"))).toEqual([]);
    const buyerFiles = edit(base, "salePlan.registrationBy", "buyer");
    expect(changed(buyerFiles, edit(buyerFiles, "salePlan.priceIncludesRegistration", true))).toEqual([]);
    // A trade-in is not on the salvage bill of sale.
    expect(changed(base, edit(base, "paperwork.billOfSale.tradeIn", "yes"), "salvageBillOfSale")).toEqual([]);
  });

  it("holds the plate and the licence against what the filed copy printed", () => {
    expect(platePrintedConflict("", "XYZ9999")).toBe(false);
    expect(platePrintedConflict(null, "XYZ9999")).toBe(false);
    expect(platePrintedConflict("ABC1234", "abc 1234")).toBe(false);
    expect(platePrintedConflict("ABC1234", "XYZ9999")).toBe(true);
    expect(platePrintedConflict("ABC1234", "")).toBe(true);
    expect(idPrintedConflict("12345678", "")).toBe(false);
    expect(idPrintedConflict("12345678", " 12345678 ")).toBe(false);
    expect(idPrintedConflict("12345678", "87654321")).toBe(true);
  });
});

/* -------------------------------------------------------------------- */
/* Every key the renderer prints is classified                           */
/* -------------------------------------------------------------------- */

describe("every key the filed bill of sale prints", () => {
  const sale = (funding: { type: string; lenderId: string | null; lenderOther: string | null }) =>
    ({
      id: "d1",
      status: "in_progress",
      language: "en",
      plate: "abc1234",
      plateAsked: true,
      buyer: { id: "c1", name: "Andrea Salinas", phone: "7135550188", email: null, idNumber: "12345678", idState: "TX", idKind: "stateLicence", address: "7400 Metz St" },
      vehicle: { id: "v1", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", salePrice: 9000, bodyStyle: "SUV", titleStatus: "clean", mileage: 88000, exteriorColor: "White", trim: "XLT" },
      documents: {},
      registration: null,
      funding,
      stepData: { ...cashDeal(), funding },
    }) as unknown as SaleDetail;

  const keysOf = (type: string, funding: Parameters<typeof sale>[0], formData: Record<string, unknown>) => {
    const link = corridorCompletedLink(sale(funding), type, formData, "https://x.test", { dealerSignerName: "Maria Lopez" });
    return Object.keys((decodeCompletedLinkFromUrl(link!)!.dd ?? {}) as Record<string, unknown>);
  };

  const money = { salePrice: 9000, tax: 562.5, titleFee: 33, docFee: 150, registrationFee: 75, total: 9820.5, paidToday: 5000, sellerLienEnabled: true, sellerLienAmount: 4820.5 };
  const printed = new Set([
    ...keysOf("billOfSale", { type: "cash", lenderId: null, lenderOther: null }, money),
    ...keysOf("billOfSale", { type: "lender", lenderId: null, lenderOther: "First Bank" }, { ...money, sellerLienEnabled: false }),
    ...keysOf("billOfSale", { type: "inHouse", lenderId: null, lenderOther: null }, money),
    ...keysOf("salvageBillOfSale", { type: "cash", lenderId: null, lenderOther: null }, { ...money, howLeaving: "towTruck" }),
  ]);

  it("is classified as frozen or fixed, with a reason", () => {
    const unclassified = [...printed].filter((key) => !(key in BILL_OF_SALE_PRINTED_KEYS));
    expect(unclassified).toEqual([]);
    for (const [key, why] of Object.entries(BILL_OF_SALE_PRINTED_KEYS)) {
      expect(why, key).toMatch(/^(frozen|fixed):\S/);
      if (why.startsWith("frozen:")) {
        const fields = why.slice("frozen:".length).split(" ")[0].split(",");
        for (const field of fields) expect(FREEZE_FIELDS as readonly string[], `${key}: ${field}`).toContain(field);
      }
    }
  });

  it("names no key the renderer does not print", () => {
    expect(Object.keys(BILL_OF_SALE_PRINTED_KEYS).filter((key) => !printed.has(key))).toEqual([]);
  });
});

/* -------------------------------------------------------------------- */
/* The refusal, said in both languages                                   */
/* -------------------------------------------------------------------- */

describe("the refusal's words", () => {
  const fields = [...FREEZE_FIELDS, "generic"] as const;

  it("exist for every field in English and Spanish, each naming the way out", () => {
    for (const field of fields) {
      const english = (en.funnel.freeze as Record<string, string>)[field];
      const spanish = (es.funnel.freeze as Record<string, string>)[field];
      expect(english, field).toMatch(/Void the bill of sale and file it again/);
      expect(spanish, field).toMatch(/Anule la factura de venta y vuelva a archivarla/);
      expect(english, field).not.toMatch(/[–—]/);
      expect(spanish, field).not.toMatch(/[–—]/);
    }
    for (const key of ["heldByPowerOfAttorney", "heldNote", "voidLink", "whoCan"]) {
      expect((en.funnel.freeze as Record<string, string>)[key], key).toBeTruthy();
      expect((es.funnel.freeze as Record<string, string>)[key], key).toBeTruthy();
    }
  });

  it("is the server's own sentence in English", () => {
    for (const field of fields) {
      expect((en.funnel.freeze as Record<string, string>)[field], field).toBe(FREEZE_MESSAGES[field]);
    }
  });

  it("is shown by every screen that edits what the bill of sale states, from the code and field", () => {
    const held = readFileSync("src/components/admin/guide/HeldByBillOfSale.tsx", "utf8");
    expect(held).toMatch(/result\.code !== "billOfSaleFrozen"/);
    expect(held).toMatch(/t\.freeze as Record<string, string>/);
    expect(held).toMatch(/t\.freeze\.heldByPowerOfAttorney/);
    for (const file of [
      "src/components/admin/guide/FundingStep.tsx",
      "src/components/admin/guide/LenderStep.tsx",
      "src/components/admin/guide/PlateStep.tsx",
      "src/components/admin/guide/PlanQuestionStep.tsx",
      "src/components/admin/guide/BuyerIdStep.tsx",
      "src/components/admin/guide/LanguageStep.tsx",
      "src/components/admin/paperwork/AnswerStep.tsx",
      "src/components/admin/WebDealerHandoff.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/useFreezeRefusal\(\)/);
      expect(source, file).toMatch(/freeze(Refusal\.text|Text)\(result\)/);
      expect(source, file).toMatch(/<FreezeWayOut/);
    }
    const money = readFileSync("src/components/admin/guide/MoneyStep.tsx", "utf8");
    expect(money).toMatch(/if \(result\.code === "billOfSaleFrozen"\) \{[\s\S]*?return frozenRefusalText\(t, result\);/);
  });
});

/* -------------------------------------------------------------------- */
/* Every writer refuses, in code                                         */
/* -------------------------------------------------------------------- */

const DEAL = "freeze-deal";
const FILED_AT = "2026-10-02T14:00:00.000Z";

const printedLink = (dd: Record<string, unknown> = {}) =>
  encodeCompletedLink("billOfSale", { buyerLicense: "12345678", vehiclePlate: "", ...dd }, {}, "https://x.test");

type Row = Record<string, unknown>;
const billOfSale = (extra: Row = {}): Row => ({
  id: "bos",
  document_type: "billOfSale",
  status: "finalized",
  finalized_at: FILED_AT,
  completed_at: FILED_AT,
  has_buyer_signature: false,
  language: "en",
  completed_link: printedLink(),
  ...extra,
});
/** A bill of sale the older e-sign path completed: no finalized_at at all. */
const legacyBillOfSale = (): Row => ({ ...billOfSale(), finalized_at: null, status: "completed" });
const voidedBillOfSale = (): Row => ({ ...billOfSale(), voided_at: "2026-10-02T15:00:00.000Z", void_reason: "The price was wrong on it", void_group_id: "g1", voided_by_name: "Maria Lopez" });

async function seed(documents: Row[], stepData: Blob = cashDeal(), salePrice = 9000) {
  const client = createMockSupabaseClient();
  await client.from("deals").insert({
    id: DEAL,
    status: "in_progress",
    language: "en",
    step_data: stepData,
    customers: { id: "freeze-buyer", name: "Andrea Salinas", phone: "7135550188", id_number: "12345678" },
    vehicles: { id: "freeze-car", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", title_status: "clean", sale_price: salePrice },
  });
  if (documents.length) await client.from("document_agreements").insert(documents.map((row) => ({ deal_id: DEAL, ...row })));
}

async function stepDataNow(): Promise<Blob> {
  const { data } = await createMockSupabaseClient().from("deals").select("step_data").eq("id", DEAL).maybeSingle();
  return ((data as { step_data?: Blob } | null)?.step_data ?? {}) as Blob;
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

/** Every writer, one change each, and the field its refusal names. */
const WRITERS: Array<{ name: string; field: string; run: () => Promise<unknown>; same?: () => Promise<unknown>; stepData?: () => Blob }> = [
  { name: "saveSaleMoney (amount)", field: "price", run: () => saveSaleMoney(DEAL, { amount: "9500" }), same: () => saveSaleMoney(DEAL, { amount: "9,000.00" }) },
  { name: "saveSaleMoney (price basis)", field: "priceBasis", run: () => saveSaleMoney(DEAL, { priceBasis: "outTheDoor" }), same: () => saveSaleMoney(DEAL, { priceBasis: "vehicleOnly" }) },
  { name: "saveDealFunding (type)", field: "funding", run: () => saveDealFunding(DEAL, form({ dealType: "inHouse" })), same: () => saveDealFunding(DEAL, form({ dealType: "cash" })) },
  {
    name: "saveDealFunding (lender)",
    field: "lender",
    stepData: () => edit(cashDeal(), "funding", { type: "lender", lenderId: null, lenderOther: "First Bank" }),
    run: () => saveDealFunding(DEAL, form({ dealType: "lender", lenderOther: "Second Bank" })),
    same: () => saveDealFunding(DEAL, form({ dealType: "lender", lenderOther: "First Bank" })),
  },
  { name: "saveSalePlanAnswer (registration)", field: "registration", run: () => saveSalePlanAnswer(DEAL, { questionId: "registrationBy", value: "buyer" }), same: () => saveSalePlanAnswer(DEAL, { questionId: "registrationBy", value: "dealer" }) },
  { name: "saveSalePlanAnswer (inspection)", field: "inspection", run: () => saveSalePlanAnswer(DEAL, { questionId: "inspectionBy", value: "dealer" }), same: () => saveSalePlanAnswer(DEAL, { questionId: "inspectionBy", value: "done" }) },
  { name: "saveSalePlanAnswer (insurance)", field: "insurance", run: () => saveSalePlanAnswer(DEAL, { questionId: "insuranceShown", value: false }), same: () => saveSalePlanAnswer(DEAL, { questionId: "insuranceShown", value: true }) },
  { name: "savePaperworkAnswer (odometer)", field: "odometer", run: () => savePaperworkAnswer(DEAL, "billOfSale", "odometerStatus", "not_actual"), same: () => savePaperworkAnswer(DEAL, "billOfSale", "odometerStatus", "actual") },
  { name: "savePaperworkAnswer (licence state)", field: "buyerId", run: () => savePaperworkAnswer(DEAL, "billOfSale", "buyerLicenseState", "OK") },
  { name: "savePaperworkAnswer (payment method)", field: "paymentMethod", run: () => savePaperworkAnswer(DEAL, "billOfSale", "paymentMethod", "Zelle"), same: () => savePaperworkAnswer(DEAL, "billOfSale", "paymentMethod", "Cash") },
  { name: "savePaperworkAnswer (trade-in)", field: "tradeIn", run: () => savePaperworkAnswer(DEAL, "billOfSale", "tradeIn", "yes"), same: () => savePaperworkAnswer(DEAL, "billOfSale", "tradeIn", "no") },
  {
    name: "savePaperworkAnswer (trade-in vehicle)",
    field: "tradeIn",
    stepData: () => edit(edit(cashDeal(), "paperwork.billOfSale.tradeIn", "yes"), "paperwork.billOfSale.tradeInAllowance", "2000"),
    run: () => savePaperworkAnswer(DEAL, "billOfSale", "tradeInDescription", "2012 Honda Civic LX"),
  },
  {
    name: "savePaperworkAnswer (trade-in allowance)",
    field: "tradeIn",
    stepData: () => edit(edit(cashDeal(), "paperwork.billOfSale.tradeIn", "yes"), "paperwork.billOfSale.tradeInAllowance", "2000"),
    run: () => savePaperworkAnswer(DEAL, "billOfSale", "tradeInAllowance", "2500"),
    same: () => savePaperworkAnswer(DEAL, "billOfSale", "tradeInAllowance", "2000.00"),
  },
  { name: "savePaperworkAnswer (condition)", field: "warranty", run: () => savePaperworkAnswer(DEAL, "billOfSale", "conditionType", "warranty"), same: () => savePaperworkAnswer(DEAL, "billOfSale", "conditionType", "as_is") },
  {
    name: "savePaperworkAnswer (warranty term)",
    field: "warranty",
    stepData: () => edit(edit(cashDeal(), "paperwork.billOfSale.conditionType", "warranty"), "paperwork.billOfSale.warrantyDuration", "30 days"),
    run: () => savePaperworkAnswer(DEAL, "billOfSale", "warrantyDuration", "60 days"),
  },
  { name: "saveConfirmedId (name)", field: "buyerName", run: () => saveConfirmedId(DEAL, form({ name: "Andrea Salinas Lopez" })), same: () => saveConfirmedId(DEAL, form({ name: "Andrea Salinas" })) },
  { name: "saveConfirmedId (licence)", field: "buyerId", run: () => saveConfirmedId(DEAL, form({ licenseNumber: "87654321" })), same: () => saveConfirmedId(DEAL, form({ licenseNumber: "12345678" })) },
  {
    name: "saveConfirmedId (mailing)",
    field: "buyerAddress",
    run: () => saveConfirmedId(DEAL, form({ "mailing.street": "100 Main St", "mailing.city": "Houston", "mailing.state": "TX", "mailing.postal": "77034" })),
    same: () => saveConfirmedId(DEAL, form({ "mailing.street": "7400 Metz St", "mailing.city": "Houston", "mailing.state": "TX", "mailing.postal": "77034" })),
  },
  { name: "setDealLanguage", field: "language", run: () => setDealLanguage(DEAL, "es"), same: () => setDealLanguage(DEAL, "en") },
];

beforeEach(() => {
  resetMockWrites();
  state.role = "owner";
  state.adminDataFails = false;
});

describe("once the bill of sale is filed, every writer refuses a change and writes nothing", () => {
  it.each(WRITERS.map((writer) => [writer.name, writer] as const))("%s", async (_name, writer) => {
    await seed([billOfSale()], writer.stepData?.() ?? cashDeal());
    const before = await stepDataNow();
    const result = (await writer.run()) as { ok: boolean; code?: string; field?: string; error?: string };
    expect(result).toMatchObject({ ok: false, code: "billOfSaleFrozen", field: writer.field });
    expect(result.error).toBe(FREEZE_MESSAGES[writer.field as keyof typeof FREEZE_MESSAGES]);
    expect(await stepDataNow()).toEqual(before);
  });

  it.each(WRITERS.filter((writer) => writer.same).map((writer) => [writer.name, writer] as const))(
    "%s: the same answer saved again goes through",
    async (_name, writer) => {
      await seed([billOfSale()], writer.stepData?.() ?? cashDeal());
      const result = (await writer.same!()) as { ok: boolean; code?: string };
      expect(result.ok, JSON.stringify(result)).toBe(true);
    },
  );

  it("holds every answer the salvage bill of sale prints", async () => {
    for (const [key, value, field] of [
      ["odometerStatus", "exceeds", "odometer"],
      ["paymentMethod", "Card", "paymentMethod"],
      ["howLeaving", "trailer", "howLeaving"],
      ["buyerLicenseState", "NM", "buyerId"],
    ] as const) {
      resetMockWrites();
      await seed([billOfSale({ document_type: "salvageBillOfSale" })]);
      const before = await stepDataNow();
      expect(await savePaperworkAnswer(DEAL, "salvageBillOfSale", key, value), key).toMatchObject({ ok: false, code: "billOfSaleFrozen", field });
      expect(await stepDataNow()).toEqual(before);
    }
  });

  it("holds the plate the filed copy printed, and lets the title step record one on a bill of sale filed without", async () => {
    await seed([billOfSale({ completed_link: printedLink({ vehiclePlate: "ABC1234" }) })], { ...cashDeal(), plate: "ABC1234" });
    const before = await stepDataNow();
    expect(await saveSalePlate(DEAL, form({ plate: "XYZ9999" }))).toMatchObject({ ok: false, code: "billOfSaleFrozen", field: "plate" });
    expect(await stepDataNow()).toEqual(before);
    expect((await saveSalePlate(DEAL, form({ plate: "abc1234" }))).ok).toBe(true);

    resetMockWrites();
    await seed([billOfSale()]);
    expect((await saveSalePlate(DEAL, form({ plate: "XYZ9999" }))).ok).toBe(true);
    const after = await stepDataNow();
    expect(after.plate).toBe("XYZ9999");
    // Recorded with its time: the desk's evidence the title went to the county.
    expect(typeof after.plateRecordedAt).toBe("string");
  });

  it("holds Close The Sale's price on a deal with no typed amount, and the licence the bill of sale printed", async () => {
    await seed([billOfSale()], edit(cashDeal(), "money.amount", ""));
    expect(await completeSale({ dealId: DEAL, salePrice: 9500 })).toMatchObject({ success: false, code: "billOfSaleFrozen", field: "price" });
    expect(await completeSale({ dealId: DEAL, buyerIdNumber: "87654321" })).toMatchObject({ success: false, code: "billOfSaleFrozen", field: "buyerId" });
    const { data } = await createMockSupabaseClient().from("deals").select("status").eq("id", DEAL).maybeSingle();
    expect((data as { status?: string }).status).toBe("in_progress");
    expect(await completeSale({ dealId: DEAL, salePrice: 9000, buyerIdNumber: "12345678" })).toMatchObject({ success: true });
  });

  it("holds the same way for a bill of sale the older e-sign path completed", async () => {
    for (const writer of WRITERS) {
      resetMockWrites();
      await seed([legacyBillOfSale()], writer.stepData?.() ?? cashDeal());
      expect(await writer.run(), writer.name).toMatchObject({ ok: false, code: "billOfSaleFrozen", field: writer.field });
    }
  });
});

describe("a plan answer a filed document holds", () => {
  const filedRow = (id: string, type: string): Row => ({ id, document_type: type, status: "finalized", finalized_at: FILED_AT, completed_at: FILED_AT, language: "en" });

  it("names the documents and the way out: void the bill of sale and file it again", async () => {
    await seed([billOfSale(), filedRow("t130", "form130U")]);
    const before = await stepDataNow();
    const result = await saveSalePlanAnswer(DEAL, { questionId: "registrationBy", value: "buyer" });
    expect(result).toMatchObject({ ok: false, code: "planFrozen", blockedBy: ["form130U"], heldBy: "billOfSale" });
    expect((result as { error: string }).error).toBe(
      "This answer is on the filed paperwork (Form 130-U). Void the bill of sale and file it again before changing it.",
    );
    expect(await stepDataNow()).toEqual(before);
  });

  it("says a filed power of attorney needs a new one, since the desk cannot void ink", async () => {
    await seed([voidedBillOfSale(), filedRow("poa", "powerOfAttorney")], edit(cashDeal(), "salePlan.titleSignedBy", "dealer"));
    const result = await saveSalePlanAnswer(DEAL, { questionId: "registrationBy", value: "buyer" });
    expect(result).toMatchObject({ ok: false, code: "planFrozen", heldBy: "powerOfAttorney" });
  });

  it("is said in both languages", () => {
    expect(en.funnel.freeze.planHeld).toMatch(/\{documents\}[\s\S]*Void the bill of sale and file it again/);
    expect(es.funnel.freeze.planHeld).toMatch(/\{documents\}[\s\S]*Anule la factura de venta y vuelva a archivarla/);
    expect(en.funnel.freeze.planHeldByPowerOfAttorney).toMatch(/power of attorney/);
    expect(es.funnel.freeze.planHeldByPowerOfAttorney).toMatch(/carta poder/);
    const held = readFileSync("src/components/admin/guide/HeldByBillOfSale.tsx", "utf8");
    expect(held).toMatch(/result\.code === "planFrozen"/);
    expect(held).toMatch(/fillTemplate\(t\.freeze\.planHeld, \{ documents \}\)/);
  });
});

describe("before filing and after a void, everything moves", () => {
  it.each([
    ["with nothing filed", () => []],
    ["after the bill of sale was voided", () => [voidedBillOfSale()]],
  ])("%s", async (_label, documents) => {
    for (const writer of WRITERS) {
      resetMockWrites();
      await seed(documents() as Row[], writer.stepData?.() ?? cashDeal());
      const before = await stepDataNow();
      const result = (await writer.run()) as { ok: boolean };
      expect(result.ok, `${writer.name}: ${JSON.stringify(result)}`).toBe(true);
      if (writer.name !== "setDealLanguage") expect(await stepDataNow(), writer.name).not.toEqual(before);
    }
  });

  it("lets Close The Sale move the price and the licence before filing, and waits for a re-filing after a void", async () => {
    await seed([], edit(cashDeal(), "money.amount", ""));
    expect(await completeSale({ dealId: DEAL, salePrice: 9500, buyerIdNumber: "87654321" })).toMatchObject({ success: true });
    resetMockWrites();
    await seed([voidedBillOfSale()], edit(cashDeal(), "money.amount", ""));
    expect(await completeSale({ dealId: DEAL, salePrice: 9500, buyerIdNumber: "87654321" })).toMatchObject({ success: false, code: "voidedNotRefiled" });
  });

  it("keeps the buyer's name and address while a power of attorney is filed, ink on the county's form", async () => {
    await seed([voidedBillOfSale(), { id: "poa", document_type: "powerOfAttorney", status: "finalized", finalized_at: FILED_AT, completed_at: FILED_AT, language: "en" }]);
    const before = await stepDataNow();
    expect(await saveConfirmedId(DEAL, form({ name: "Andrea Salinas Lopez" }))).toMatchObject({ ok: false, code: "billOfSaleFrozen", field: "buyerName", heldBy: "powerOfAttorney" });
    expect(
      await saveConfirmedId(DEAL, form({ "mailing.street": "100 Main St", "mailing.city": "Houston", "mailing.state": "TX", "mailing.postal": "77034" })),
    ).toMatchObject({ ok: false, field: "buyerAddress", heldBy: "powerOfAttorney" });
    expect(await stepDataNow()).toEqual(before);
    // The licence number is not on the power of attorney.
    expect((await saveConfirmedId(DEAL, form({ licenseNumber: "87654321" }))).ok).toBe(true);
  });
});

describe("every lookup fails closed", () => {
  it.each(WRITERS.map((writer) => [writer.name, writer] as const))("%s refuses and writes nothing when the filed documents cannot be read", async (_name, writer) => {
    // A bill of sale only the lookup finds, so every writer has to look.
    await seed([legacyBillOfSale()], writer.stepData?.() ?? cashDeal());
    const before = await stepDataNow();
    state.adminDataFails = true;
    const result = (await writer.run()) as { ok: boolean };
    state.adminDataFails = false;
    expect(result.ok).toBe(false);
    expect(await stepDataNow()).toEqual(before);
  });

  it("Close The Sale refuses when the paperwork cannot be read", async () => {
    await seed([billOfSale()]);
    state.adminDataFails = true;
    const result = await completeSale({ dealId: DEAL, salePrice: 9000 });
    state.adminDataFails = false;
    expect(result).toMatchObject({ success: false, code: "couldNotCheck" });
  });
});
