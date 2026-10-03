import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Review and verify findings on what a filed bill of sale states, each closed
 * with the case that showed it:
 *
 *   - a filing printed its answers (mileage statement, trade-in, payment
 *     method, warranty; the contract's rate and payments) from what the
 *     browser posted: a stale review tab or a hand-made request filed words
 *     the sale no longer held;
 *   - a contract or 130-U could state figures other than the current bill of
 *     sale's printed ones, and one filed in the moment of a void stayed
 *     current with the voided figures, uncounted;
 *   - Close The Sale took a different sale price on a filed cash deal
 *     ($12,345 in the verify walk) and marked the car sold at it;
 *   - Start A Sale with the same phone number renamed another open sale's
 *     buyer whose bill of sale was filed and signed;
 *   - Close The Sale's refusal printed at 2.10:1 contrast.
 */

const state = vi.hoisted(() => ({ role: "owner" as string }));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({
    ok: true,
    role: state.role,
    user: { id: "local-admin-preview", email: "owner@example.dev" },
    member: { id: "member-1", full_name: "Maria Lopez" },
  }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: state.role, member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
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

import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { encodeCompletedLink } from "@/lib/documents/customerPortal";
import { paperworkMoney, readPaperwork, type PaperworkMoney } from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";
import { answersDiffer, figuresDisagreeWithBillOfSale, withServerAnswers } from "@/lib/sales/refile-gates";
import { refileTypes, type AgreementRecord } from "@/lib/sales/filed-documents";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { completeSale } from "@/lib/actions/complete-sale";
import { startSale } from "@/lib/actions/start-sale";

type Row = Record<string, unknown>;
const DEAL = "paper-deal";

const BHPH = {
  languageConfirmed: { value: "en", at: "2026-10-02T13:00:00Z", by: "u1" },
  funding: { type: "inHouse", lenderId: null, lenderOther: null },
  money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "2000" },
  salePlan: { registrationBy: "dealer", titleSignedBy: "buyer", insuranceShown: true, inspectionBy: "done" },
  paperwork: {
    billOfSale: { tradeIn: "yes", tradeInAllowance: "2000", tradeInDescription: "2012 Honda Civic LX" },
    financing: { downPayment: "2000", paymentFrequency: "Monthly" },
  },
};
const money: PaperworkMoney = paperworkMoney(9000, readPaperwork(BHPH, "billOfSale"), readMoney(BHPH), "inHouse");

const CASH = {
  languageConfirmed: { value: "en", at: "2026-10-02T13:00:00Z", by: "u1" },
  funding: { type: "cash", lenderId: null, lenderOther: null },
  money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "9000" },
  salePlan: { registrationBy: "dealer", titleSignedBy: "buyer", insuranceShown: true, inspectionBy: "done" },
};

const printed = (dd: Row) => encodeCompletedLink("billOfSale", { buyerLicense: "12345678", vehiclePlate: "", ...dd }, {}, "https://x.test");
const filed = (id: string, type: string, extra: Row = {}): Row => ({
  id,
  document_type: type,
  status: "finalized",
  finalized_at: "2026-10-02T14:00:00.000Z",
  completed_at: "2026-10-02T14:00:00.000Z",
  has_buyer_signature: false,
  language: "en",
  ...extra,
});
const voided = (id: string, type: string): Row =>
  filed(id, type, { voided_at: "2026-10-02T15:00:00.000Z", void_reason: "The down payment changed", void_group_id: "g1", voided_by_name: "Maria Lopez" });

async function seed(stepData: Row, documents: Row[]) {
  const client = createMockSupabaseClient();
  await client.from("deals").insert({
    id: DEAL,
    status: "in_progress",
    language: "en",
    step_data: stepData,
    customers: { id: "paper-buyer", name: "Andrea Salinas", phone: "7135550188", id_number: "12345678" },
    vehicles: { id: "paper-car", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", title_status: "clean", sale_price: 9000 },
  });
  if (documents.length) await client.from("document_agreements").insert(documents.map((row) => ({ deal_id: DEAL, ...row })));
}

const file = (type: string, formData: Row) =>
  finalizePaperwork(DEAL, type, { buyerName: "Andrea Salinas", vehicleDescription: "2017 Ford Explorer", vehicleVin: "1FM5K8D80HGA00001", formData, signature: null });

beforeEach(() => {
  resetMockWrites();
  state.role = "owner";
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
});

describe("the answers a filing posts are the sale's own", () => {
  const server = { odometerStatus: "actual", tradeIn: "yes", tradeInDescription: "2012 Honda Civic LX", tradeInAllowance: "2000" };
  const moneyKeys = ["salePrice", "tradeInAllowance", "total"];

  it("passes the same answers, and fills one left out", () => {
    expect(answersDiffer({ ...server, salePrice: 9000 }, server, moneyKeys)).toBe(false);
    expect(answersDiffer({ tradeIn: "yes" }, server, moneyKeys)).toBe(false);
    expect(withServerAnswers({ tradeIn: "yes", salePrice: 9000 }, server, moneyKeys)).toEqual({ ...server, tradeInAllowance: undefined, salePrice: 9000 });
  });

  it("refuses a changed answer, or one the sale does not hold", () => {
    expect(answersDiffer({ ...server, tradeInDescription: "stale text" }, server, moneyKeys)).toBe(true);
    expect(answersDiffer({ ...server, odometerStatus: "not_actual" }, server, moneyKeys)).toBe(true);
    expect(answersDiffer({ ...server, paymentMethod: "Zelle" }, server, moneyKeys)).toBe(true);
    // A money key is the money check's, not this one's.
    expect(answersDiffer({ ...server, tradeInAllowance: 0 }, server, moneyKeys)).toBe(false);
  });

  it("refuses a bill of sale posted with answers the sale no longer holds, and writes nothing", async () => {
    await seed(BHPH, [voided("bos0", "billOfSale")]);
    expect(await file("billOfSale", { ...money, tradeInDescription: "stale text" })).toMatchObject({ ok: false, code: "figuresChanged" });
    expect(await file("billOfSale", { ...money, odometerStatus: "not_actual" })).toMatchObject({ ok: false, code: "figuresChanged" });
    expect(await file("billOfSale", { ...money, paymentMethod: "Zelle" })).toMatchObject({ ok: false, code: "figuresChanged" });
    expect(mockInserted("document_agreements").filter((row) => row.deal_id === DEAL)).toHaveLength(1);
  });

  it("files the sale's own answers when the request leaves them out", async () => {
    await seed(BHPH, [voided("bos0", "billOfSale")]);
    const result = await file("billOfSale", { ...money });
    expect(result).toMatchObject({ ok: true });
    const row = mockInserted("document_agreements").find((entry) => entry.id === result.agreementId);
    expect(row?.form_data).toMatchObject({ tradeIn: "yes", tradeInDescription: "2012 Honda Civic LX", odometerStatus: "actual", conditionType: "as_is" });
  });

  it("refuses a contract posted with a rate or a payment the sale did not agree", async () => {
    await seed(BHPH, [filed("bos", "billOfSale", { completed_link: printed({ salePrice: money.salePrice, tradeInAllowance: money.tradeInAllowance, tax: money.tax, amountPaidToday: money.paidToday }) })]);
    expect(await file("financing", { ...money, downPayment: "2000", apr: "99" })).toMatchObject({ ok: false, code: "figuresChanged" });
    expect(await file("financing", { ...money, downPayment: "2000", paymentAmount: "1" })).toMatchObject({ ok: false, code: "figuresChanged" });
    expect(await file("financing", { ...money, downPayment: "2000" })).toMatchObject({ ok: true });
  });
});

describe("a document printing the bill of sale's figures states the ones it printed", () => {
  it("compares the shared figures, and only the ones both carry", () => {
    const paper = { salePrice: 9000, tax: 618.75, tradeInAllowance: 2000, amountPaidToday: 2000, sellerLienEnabled: true, sellerLienAmount: 6045.5 };
    const posted = { salePrice: 9000, tax: 618.75, tradeInAllowance: 2000, paidToday: 2000, sellerLienAmount: 6045.5 };
    expect(figuresDisagreeWithBillOfSale("financing", posted, paper)).toBe(false);
    expect(figuresDisagreeWithBillOfSale("financing", { ...posted, paidToday: 1500 }, paper)).toBe(true);
    expect(figuresDisagreeWithBillOfSale("form130U", { ...posted, salePrice: 8000 }, paper)).toBe(true);
    expect(figuresDisagreeWithBillOfSale("financing", { ...posted, sellerLienAmount: 1 }, paper)).toBe(true);
    expect(figuresDisagreeWithBillOfSale("financing", { ...posted, sellerLienAmount: 1 }, { ...paper, sellerLienEnabled: false })).toBe(false);
    // The rebuilt disclosure comes before the bill of sale; nothing printed, nothing compared.
    expect(figuresDisagreeWithBillOfSale("rebuiltDisclosure", { salePrice: 1 }, paper)).toBe(false);
    expect(figuresDisagreeWithBillOfSale("financing", posted, null)).toBe(false);
  });

  it("refuses a 130-U whose figures the filed bill of sale does not state", async () => {
    await seed(BHPH, [filed("bos", "billOfSale", { completed_link: printed({ salePrice: 8000, tax: money.tax }) })]);
    expect(await file("form130U", { ...money })).toMatchObject({ ok: false, code: "figuresChanged" });
  });

  it("counts a contract filed while no bill of sale was current as owed again", () => {
    const rows = [
      voided("bos", "billOfSale"),
      voided("fin", "financing"),
      filed("fin2", "financing", { finalized_at: "2026-10-02T15:00:00.010Z" }),
    ];
    expect(refileTypes(rows as AgreementRecord[], ["billOfSale", "financing", "form130U"])).toEqual(["billOfSale", "financing"]);
    // Never on a deal that had no void.
    expect(refileTypes([filed("fin", "financing")] as AgreementRecord[], ["billOfSale", "financing"])).toEqual([]);
  });
});

describe("Close The Sale marks the car sold at the price the paper states", () => {
  it("refuses another price on a deal whose amount was typed, and closes at the printed one", async () => {
    await seed(CASH, [filed("bos", "billOfSale", { completed_link: printed({ salePrice: 9000 }) })]);
    expect(await completeSale({ dealId: DEAL, salePrice: 12345 })).toMatchObject({ success: false, code: "billOfSaleFrozen", field: "price" });
    const { data } = await createMockSupabaseClient().from("deals").select("status").eq("id", DEAL).maybeSingle();
    expect((data as { status?: string }).status).toBe("in_progress");
    expect(await completeSale({ dealId: DEAL, salePrice: 9000 })).toMatchObject({ success: true });
  });

  it("starts the panel from the printed price and prints its refusal in the danger colour", () => {
    const view = readFileSync("src/components/admin/SaleDetailView.tsx", "utf8");
    expect(view).toMatch(/salePrice=\{billOfSaleFiled && typedAmount \? printedPrice : \(sale\.vehicle\?\.salePrice \?\? null\)\}/);
    const panel = readFileSync("src/components/admin/CompleteSalePanel.tsx", "utf8");
    expect(panel).not.toMatch(/E7A38A/i);
    expect(panel).toMatch(/role="alert" className="[^"]*text-\[color:var\(--tj-danger\)\]/);
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/--tj-danger: #B00020;/);
  });
});

describe("Start A Sale never renames a buyer another sale's filed paperwork names", () => {
  async function seedHeldBuyer() {
    const client = createMockSupabaseClient();
    await client.from("customers").insert({ id: "held-buyer", name: "Andrea Salinas", phone: "+17135550188", email: null, profile_data: { dealership: { buyerProfile: { buyerLicense: "12345678" } } } });
    await client.from("vehicles").insert({ id: "car-2", year: 2019, make: "Toyota", model: "Camry", vin: "4T1B11HK5KU000002", title_status: "clean", sale_price: 15000, status: "available" });
    await client.from("deals").insert({ id: "held-deal", customer_id: "held-buyer", vehicle_id: "car-9", status: "in_progress", step_data: {} });
    await client.from("document_agreements").insert(filed("held-bos", "billOfSale", { deal_id: "held-deal", has_buyer_signature: true }));
  }
  const start = (buyerName: string) =>
    startSale({ vehicleId: "car-2", buyerName, buyerPhone: "713-555-0188", buyerIdNumber: "99999999", language: "en", titleStatus: "clean" } as Parameters<typeof startSale>[0]);
  const held = async () => {
    const { data } = await createMockSupabaseClient().from("customers").select("name, profile_data").eq("id", "held-buyer").maybeSingle();
    return data as { name?: string; profile_data?: { dealership?: { buyerProfile?: Record<string, unknown> } } } | null;
  };
  const heldName = async () => (await held())?.name;

  it("refuses a different name on the same phone number and leaves the other sale's buyer as filed", async () => {
    await seedHeldBuyer();
    const result = await start("Lucía Hernández");
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/belongs to Andrea Salinas, the buyer on another open sale whose paperwork is filed/);
    expect(await heldName()).toBe("Andrea Salinas");
  });

  it("lets the same buyer start a second sale without rewriting their record", async () => {
    // The new sale hands the desk a capture link, which is signed.
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-for-the-capture-link");
    await seedHeldBuyer();
    const result = await start("Andrea Salinas");
    expect(result, JSON.stringify(result)).toMatchObject({ success: true, customerId: "held-buyer" });
    expect(await heldName()).toBe("Andrea Salinas");
    // The licence the other sale's paper printed is not overwritten either.
    expect((await held())?.profile_data?.dealership?.buyerProfile?.buyerLicense).toBe("12345678");
  });
});
