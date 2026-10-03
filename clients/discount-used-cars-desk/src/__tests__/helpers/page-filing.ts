import { createMockSupabaseClient } from "@/lib/supabase/mock";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { paperworkMoney, readPaperwork, type PaperworkMoney } from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";
import { WALKED_BUYER_ID } from "./fee-filing";

/**
 * A walked sale on the preview store, for the page-by-page refusals. The
 * test file mocks current-admin, staff-signature, next/cache, next/server
 * and next/headers the way the other filing tests do.
 */
export const PAGE_DEAL = "page-filing-deal";

export type Row = Record<string, unknown>;

export const WALKED_CASH: Row = {
  languageConfirmed: { value: "en", at: "2026-10-03T13:00:00Z", by: "u1" },
  funding: { type: "cash", lenderId: null, lenderOther: null },
  money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "9000" },
  salePlan: { registrationBy: "dealer", titleSignedBy: "buyer", insuranceShown: true, inspectionBy: "done" },
  buyerId: WALKED_BUYER_ID,
  paperwork: { billOfSale: { odometerStatus: "actual", paymentMethod: "Cash", tradeIn: "no", conditionType: "as_is" } },
};

export const CAR: Row = {
  id: "page-car", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", title_status: "clean",
  sale_price: 9000, mileage: 118340, body_style: "SUV", exterior_color: "White",
};

export async function seedPageDeal(stepData: Row, vehicle: Row = {}, documents: Row[] = []) {
  const client = createMockSupabaseClient();
  await client.from("deals").insert({
    id: PAGE_DEAL,
    status: "in_progress",
    language: "en",
    step_data: stepData,
    customers: { id: "page-buyer", name: "Andrea Salinas", phone: "7135550188" },
    vehicles: { ...CAR, ...vehicle },
  });
  if (documents.length) await client.from("document_agreements").insert(documents.map((row) => ({ deal_id: PAGE_DEAL, language: "en", ...row })));
}

export function moneyOf(stepData: Row, funding: "cash" | "inHouse" | "lender" = "cash"): PaperworkMoney {
  return paperworkMoney(9000, readPaperwork(stepData, "billOfSale"), readMoney(stepData), funding);
}

export const filePage = (type: string, formData: Row) =>
  finalizePaperwork(PAGE_DEAL, type, {
    buyerName: "Andrea Salinas",
    vehicleDescription: "2017 Ford Explorer",
    vehicleVin: "1FM5K8D80HGA00001",
    formData,
    signature: null,
  });

export const filedPage = (id: string, type: string, extra: Row = {}): Row => ({
  id,
  document_type: type,
  status: "finalized",
  finalized_at: "2026-10-03T14:00:00.000Z",
  completed_at: "2026-10-03T14:00:00.000Z",
  has_buyer_signature: false,
  ...extra,
});
