import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMockWrites } from "@/lib/supabase/mock";
import { saleMoney } from "@/lib/sales/money";
import { dealFeeLines } from "@/lib/sales/fee-schedule";
import { loadDealFees, registersNothing } from "@/lib/dealership-fees";
import { writeSalvagePlan } from "@/lib/sales/salvage-plan";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { billOfSaleStatement } from "@/lib/sales/bill-of-sale-freeze";
import type { SaleDetail } from "@/lib/admin/sale-desk";

/**
 * A tow-away salvage sale registers nothing, so its fees carry no
 * registration line. Until now the out-the-door split took the registration
 * fee out while the salvage bill of sale (which prints no registration line)
 * left it out of its total: a $3,000 out-the-door tow-away sale printed a
 * $2,925 total. Its fee lines now carry no registration fee, so the split, the
 * total and the paper agree on the figure two people agreed to.
 */

const copy = { titleFee: 33, docFee: 150, registrationFee: 75 };

beforeEach(() => resetMockWrites());
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("a $3,000 out-the-door tow-away sale", () => {
  const lines = dealFeeLines(copy, { noRegistration: true });
  const money = saleMoney(3000, { amount: "3000", priceBasis: "outTheDoor", paidTodayAmount: "" }, 0, "cash", lines);

  it("splits into a price, its tax, the title fee and the doc fee that add up to $3,000", () => {
    expect(lines.registrationFee).toBe(0);
    expect(money.registrationFee).toBe(0);
    expect(Math.round((money.salePrice + money.tax + money.titleFee + money.docFee) * 100) / 100).toBe(3000);
    expect(money.total).toBe(3000);
  });

  it("prints a $3,000 total on the salvage bill of sale", () => {
    const sale = {
      id: "tow", status: "in_progress", language: "en", plate: null, plateAsked: false,
      buyer: { id: "c1", name: "Andrea Salinas", phone: "7135550188", email: null, idNumber: "12345678", idState: "TX", idKind: "stateLicence", address: "7400 Metz St" },
      vehicle: { id: "v1", year: 2012, make: "Honda", model: "Civic", vin: "2HGFB2F50CH000001", salePrice: 3000, bodyStyle: "Sedan", titleStatus: "salvage_unrebuilt", mileage: 150000 },
      documents: {}, registration: null, funding: { type: "cash", lenderId: null, lenderOther: null },
      stepData: writeSalvagePlan({}, { path: "towAway", decidedAt: "2026-10-03T13:00:00.000Z" }),
    } as unknown as SaleDetail;
    expect(registersNothing(sale)).toBe(true);
    const link = corridorCompletedLink(sale, "salvageBillOfSale", { ...money, paidToday: money.paidToday }, "https://x.test");
    expect((decodeCompletedLinkFromUrl(link!)!.dd as Record<string, unknown>).total).toBe(3000);
  });

  it("is what the freeze measures the filed salvage bill of sale by", () => {
    const stepData = { money: { amount: "3000", priceBasis: "outTheDoor", paidTodayAmount: "" }, funding: { type: "cash", lenderId: null, lenderOther: null } };
    const statement = billOfSaleStatement(stepData, { advertised: 3000, rootType: "salvageBillOfSale", fees: { ...copy, docFeeSet: true } as never });
    const figures = statement.money.split("|");
    // salePrice, tax, title, doc, registration (none), trade-in (none), total.
    expect(figures[4]).toBe("0.00");
    expect(figures[6]).toBe("3000.00");
  });

  it("is what the server resolves for a tow-away sale, and only for one", async () => {
    const towAway = writeSalvagePlan({ fees: { ...copy, docFeeCapCents: 22500, occcFiling: null, scheduleVersion: 0, source: "config", takenAt: "2026-10-03T13:00:00.000Z", rulebookAsOf: "2026-10-03" } }, { path: "towAway", decidedAt: "2026-10-03T13:00:00.000Z" });
    const tow = await loadDealFees({ id: "tow", stepData: towAway, vehicle: { titleStatus: "salvage_unrebuilt" } });
    expect(tow.ok && tow.lines.registrationFee).toBe(0);
    const clean = await loadDealFees({ id: "tow", stepData: towAway, vehicle: { titleStatus: "clean" } });
    expect(clean.ok && clean.lines.registrationFee).toBe(75);
  });
});
