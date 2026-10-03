import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Law review, 2026-10-03 (major): every sale copied a flat $33 title fee
 * and a $75 "Registration Fee", the filing accepted $33 for any buyer, the
 * $7.50 inspection program replacement fee was folded into the registration
 * line, and the $10 plate fee had no line at all. So a government line could
 * state an amount other than what is paid to the county: a buyer outside the
 * emissions program with a $10 local fee pays $74.00 in registration but was
 * charged $75.00, and a buyer in a $28 county was charged $33. Tex. Fin. Code
 * §348.005(1), (3); OCCC Agreed Order L25-087 ("cease and desist charging
 * title and registration fees in amounts that are not actually paid to
 * public officials"); OCCC Bulletin B25-1 (the replacement fee "is not a
 * motor vehicle registration fee"); 43 TAC §215.155(e) ($10 plate fee).
 *
 * Now a person records the sale's government fees from webDEALER (title,
 * registration side, inspection fee, plate fee), checked against the cited
 * lines, and a bill of sale, contract or responsibility form is not filed
 * until they are. The paper prints the inspection fee and the plate fee on
 * lines of their own. DESK_ALLOW_UNSET_FACTS (demos only) lifts the
 * "not recorded" refusal alone; a record the desk did not write is refused
 * whatever the flag says.
 */

const held = vi.hoisted(() => {
  // A desk address, so the dealer facts are complete without the demo flag.
  process.env.NEXT_PUBLIC_SITE_URL = "https://desk.example.test";
  return { failActivity: false };
});

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "owner", user: { id: "local-admin-preview", email: "owner@example.dev" }, member: { id: "member-1", full_name: "Maria Lopez" } }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: "owner", member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({
  getStaffSignature: async () => ({ signerName: "Maria Lopez", hasMember: true, canSign: true, fullName: "Maria Lopez" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { createMockSupabaseClient } = await import("@/lib/supabase/mock");
  return {
    createClient: async () => {
      const client = createMockSupabaseClient(null);
      const from = client.from.bind(client);
      return new Proxy(client, {
        get(target, prop) {
          if (prop !== "from") return Reflect.get(target, prop);
          return (table: string) => {
            const builder = from(table);
            if (table !== "team_activity_events" || !held.failActivity) return builder;
            return new Proxy(builder, {
              get(inner, key) {
                if (key === "insert") return () => Promise.resolve({ data: null, error: { message: "activity log unavailable" } });
                return Reflect.get(inner, key);
              },
            });
          };
        },
      });
    },
  };
});

import { CASH_SALE, FEE_DEAL, feeCopy, filedRow, seedFeeDeal } from "./helpers/fee-filing";
import { feeFields, saveThroughMock } from "./helpers/fees";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { confirmGovernmentFeesAction } from "@/lib/actions/government-fees";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { dealFeeLinesForSale } from "@/lib/dealership-fees";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { saleMoney } from "@/lib/sales/money";
import { writeDealFees } from "@/lib/sales/fee-schedule";
import {
  REGISTRATION_BOUNDS_CENTS,
  governmentEstimate,
  governmentFeesFilingProblem,
  parseGovernmentFeesInput,
  validateGovernmentFees,
  type GovernmentFeesInput,
} from "@/lib/sales/government-fees";
import BillOfSalePreview from "@/components/documents/BillOfSalePreview";
import type { BillOfSaleData } from "@/lib/documents/billOfSale";

/** webDEALER's figures for a Harris buyer of a car under 6,000 lb (rulebook 2.2, less the inspection and plate lines). */
const HARRIS: GovernmentFeesInput = {
  county: "Harris",
  titleFee: "33",
  registrationFee: "70.75",
  inspectionFee: "7.50",
  plateFee: "10",
  exemptFromRegistrationFees: false,
};

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  held.failActivity = false;
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://desk.example.test");
  resetMockWrites();
});
afterAll(() => {
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

/** The cash sale with today's fee copy ($150) and, optionally, its recorded government fees. */
async function seedSale(extra: Record<string, unknown> = {}, documents: Array<Record<string, unknown>> = []) {
  expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
  const stepData = { ...writeDealFees(CASH_SALE, feeCopy()), ...extra };
  await seedFeeDeal(stepData, documents);
  return stepData;
}

/** File a document the way the review screen does: the server's own money and answers. */
async function file(type: string, county = "Harris") {
  const sale = (await getSaleDetail(FEE_DEAL))!;
  const fees = await dealFeeLinesForSale(sale);
  const { money } = paperworkFilingContext(sale, type, county, fees);
  return finalizePaperwork(FEE_DEAL, type, {
    buyerName: "Andrea Salinas",
    vehicleDescription: "2017 Ford Explorer",
    vehicleVin: "1FM5K8D80HGA00001",
    formData: { ...money, ...(type === "form130U" ? { countyOfResidence: county } : {}) },
    signature: null,
  });
}

describe("the figures are checked against the cited lines", () => {
  it("takes webDEALER's figures for a Harris buyer", () => {
    expect(parseGovernmentFeesInput(HARRIS).problems).toEqual([]);
  });

  it("refuses $28 for a county known to pay $33, and anything but $33 or $28", () => {
    expect(parseGovernmentFeesInput({ ...HARRIS, titleFee: "28" }).problems.map((p) => p.code)).toEqual(["govTitleFeeCounty"]);
    expect(parseGovernmentFeesInput({ ...HARRIS, county: "Travis County", titleFee: "28" }).problems.map((p) => p.code)).toEqual(["govTitleFeeCounty"]);
    expect(parseGovernmentFeesInput({ ...HARRIS, titleFee: "30" }).problems.map((p) => p.code)).toEqual(["govTitleFeeNotState"]);
    // A county the rulebook cannot vouch for takes webDEALER's $28.
    expect(parseGovernmentFeesInput({ ...HARRIS, county: "Brazos", titleFee: "28" }).problems).toEqual([]);
  });

  it("keeps the registration side inside the cited lines, the inspection fee to its figures, and the plate fee at exactly $10", () => {
    expect(REGISTRATION_BOUNDS_CENTS).toEqual({ least: 5650, most: 30075 });
    expect(parseGovernmentFeesInput({ ...HARRIS, registrationFee: "45" }).problems.map((p) => p.code)).toEqual(["govRegistrationOutOfRange"]);
    expect(parseGovernmentFeesInput({ ...HARRIS, registrationFee: "300.76" }).problems.map((p) => p.code)).toEqual(["govRegistrationOutOfRange"]);
    expect(parseGovernmentFeesInput({ ...HARRIS, inspectionFee: "5" }).problems.map((p) => p.code)).toEqual(["govInspectionFee"]);
    expect(parseGovernmentFeesInput({ ...HARRIS, plateFee: "15" }).problems.map((p) => p.code)).toEqual(["govPlateFee"]);
    expect(parseGovernmentFeesInput({ ...HARRIS, plateFee: "0" }).problems.map((p) => p.code)).toEqual(["govPlateFee"]);
    // Exempt from registration fees: no plate fee, and a $0 registration may stand.
    expect(parseGovernmentFeesInput({ ...HARRIS, plateFee: "0", registrationFee: "0", exemptFromRegistrationFees: true }).problems).toEqual([]);
    expect(parseGovernmentFeesInput({ ...HARRIS, county: " " }).problems.map((p) => p.code)).toEqual(["govCountyMissing"]);
    expect(validateGovernmentFees({ ...parseGovernmentFeesInput(HARRIS).figures, titleFee: Number.NaN }).map((p) => p.code)).toEqual(["govNotDollars"]);
  });

  it("estimates what it can, and leaves the rest to webDEALER", () => {
    // Outside the emissions program, in the 2026 table, with a weight: computed.
    expect(governmentEstimate("Cameron", 4500, "2026-10-03")).toMatchObject({ titleFee: null, registrationFee: 50.75 + 1 + 21.5 + 4.75, inspectionFee: 7.5, plateFee: 10 });
    // An emissions county: only webDEALER can say.
    expect(governmentEstimate("Harris", 4500, "2026-10-03")).toMatchObject({ titleFee: 33, registrationFee: null, emissions: true });
  });
});

describe("the money and the paper carry the lines of their own", () => {
  it("adds the inspection and plate fees to the total, and only when charged", () => {
    const lines = { titleFee: 33, docFee: 150, registrationFee: 70.75, inspectionFee: 7.5, plateFee: 10 };
    const money = saleMoney(9000, { priceBasis: "vehicleOnly", amount: "9000" }, 0, "cash", lines);
    expect(money).toMatchObject({ inspectionFee: 7.5, plateFee: 10, feeTotal: 271.25, total: 9000 + 562.5 + 271.25 });
    const without = saleMoney(9000, { priceBasis: "vehicleOnly", amount: "9000" }, 0, "cash", { titleFee: 33, docFee: 150, registrationFee: 75 });
    expect(without).not.toHaveProperty("inspectionFee");
    expect(without).not.toHaveProperty("plateFee");
  });

  it("prints them on the bill of sale, never inside the registration line", () => {
    const data = {
      saleDate: "2026-10-03", salePrice: 9000, tradeInAllowance: 0, tradeInPayoff: 0, tax: 562.5, titleFee: 33, docFee: 150,
      registrationFee: 70.75, inspectionFee: 7.5, plateFee: 10, otherFees: 0, otherFeesDescription: "", paymentMethod: "Cash",
    } as unknown as BillOfSaleData;
    const page = renderToStaticMarkup(createElement(BillOfSalePreview, { data, signatures: {} as never }));
    expect(page).toContain("d. Registration Fee");
    expect(page).toContain("$70.75");
    expect(page).toContain("e. Government Vehicle Inspection Program Replacement Fee");
    expect(page).toContain("f. License Plate Fee");
    expect(page).toContain("$9,833.75");
  });
});

describe("filing waits for the recorded figures", () => {
  it("refuses a bill of sale whose government fees are not recorded", async () => {
    await seedSale();
    const result = await file("billOfSale");
    expect(result).toMatchObject({ ok: false, code: "governmentFeesUnconfirmed" });
    expect(result.error).toMatch(/Tex\. Fin\. Code §348\.005/);
    expect(mockInserted("document_agreements")).toEqual([]);
  });

  it("files it once they are recorded, with each line as webDEALER computed it", async () => {
    await seedSale();
    expect(await confirmGovernmentFeesAction(FEE_DEAL, HARRIS)).toEqual({ ok: true });
    const event = mockInserted("team_activity_events").find((row) => row.event_type === "deal_government_fees_confirmed");
    expect(event?.body).toMatch(/Maria Lopez recorded this sale's government fees from webDEALER for Harris County: title \$33\.00, registration \$70\.75, inspection program \$7\.50, license plate \$10\.00\./);

    const result = await file("billOfSale");
    expect(result).toMatchObject({ ok: true });
    const [row] = mockInserted("document_agreements");
    const dd = decodeCompletedLinkFromUrl(String(row.completed_link))!.dd as Record<string, unknown>;
    expect(dd).toMatchObject({ titleFee: 33, registrationFee: 70.75, inspectionFee: 7.5, plateFee: 10, docFee: 150 });
  });

  it("refuses a 130-U for a county other than the one the fees were recorded for", async () => {
    await seedSale();
    expect(await confirmGovernmentFeesAction(FEE_DEAL, HARRIS)).toEqual({ ok: true });
    expect(await file("billOfSale")).toMatchObject({ ok: true });
    expect(await file("form130U", "Fort Bend")).toMatchObject({ ok: false, code: "governmentFeesCountyChanged" });
  });

  it("lets a demo file without them, but never a record the desk did not write", async () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
    await seedSale();
    expect(await file("billOfSale")).toMatchObject({ ok: true });
    resetMockWrites();
    await seedSale({ governmentFees: { titleFee: 33, registrationFee: 1, inspectionFee: 0, plateFee: 0, county: "Harris", source: "webDEALER", confirmedAt: "x", confirmedByName: "x" } });
    expect(await file("billOfSale")).toMatchObject({ ok: false, code: "governmentFeesInvalid" });
  });

  it("is the pure rule the filing applies", () => {
    const base = { stepData: {}, registersNothing: false, allowUnset: false };
    expect(governmentFeesFilingProblem({ ...base, documentType: "billOfSale" })).toBe("governmentFeesUnconfirmed");
    expect(governmentFeesFilingProblem({ ...base, documentType: "financing" })).toBe("governmentFeesUnconfirmed");
    expect(governmentFeesFilingProblem({ ...base, documentType: "vehicleResponsibility" })).toBe("governmentFeesUnconfirmed");
    expect(governmentFeesFilingProblem({ ...base, documentType: "insuranceAcknowledgment" })).toBeNull();
    // A tow-away sale registers nothing.
    expect(governmentFeesFilingProblem({ ...base, documentType: "salvageBillOfSale", registersNothing: true })).toBeNull();
    expect(governmentFeesFilingProblem({ ...base, documentType: "billOfSale", allowUnset: true })).toBeNull();
  });
});

describe("recording them", () => {
  it("is refused while a bill of sale is filed, and on a closed sale", async () => {
    await seedSale({}, [filedRow("bos-1", "billOfSale")]);
    expect(await confirmGovernmentFeesAction(FEE_DEAL, HARRIS)).toMatchObject({ ok: false, code: "voidFirst" });
    resetMockWrites();
    await seedSale();
    await createMockSupabaseClient().from("deals").update({ status: "completed" }).eq("id", FEE_DEAL);
    expect(await confirmGovernmentFeesAction(FEE_DEAL, HARRIS)).toMatchObject({ ok: false, code: "saleClosed" });
  });

  it("refuses figures outside the cited lines, with the reason", async () => {
    await seedSale();
    const result = await confirmGovernmentFeesAction(FEE_DEAL, { ...HARRIS, titleFee: "28" });
    expect(result).toMatchObject({ ok: false, code: "govTitleFeeCounty" });
  });

  it("puts the record back when its activity event cannot be written", async () => {
    await seedSale();
    held.failActivity = true;
    expect(await confirmGovernmentFeesAction(FEE_DEAL, HARRIS)).toMatchObject({ ok: false, code: "couldNotSave" });
    const sale = await getSaleDetail(FEE_DEAL);
    expect((sale?.stepData as Record<string, unknown>).governmentFees ?? null).toBeNull();
  });

  it("cannot be written by any other step_data write", async () => {
    await seedSale();
    const result = await casMergeStepData(createMockSupabaseClient(), FEE_DEAL, () => ({ governmentFees: { titleFee: 33 } }));
    expect(result).toEqual({ ok: false, error: "fees-protected" });
  });
});
