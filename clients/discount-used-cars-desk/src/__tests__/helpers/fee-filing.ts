import { createMockSupabaseClient } from "@/lib/supabase/mock";
import { dealFeeLines, type DealFees } from "@/lib/sales/fee-schedule";
import { paperworkMoney, readPaperwork, type PaperworkMoney } from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";

/**
 * A cash sale ready to file its bill of sale, for the filing tests of the
 * dealer-fee gates. The test file mocks current-admin, staff-signature,
 * next/cache, next/server and next/headers the way the other filing tests do.
 */
export const FEE_DEAL = "fee-filing-deal";

export const CASH_SALE = {
  languageConfirmed: { value: "en", at: "2026-10-03T13:00:00Z", by: "u1" },
  funding: { type: "cash", lenderId: null, lenderOther: null },
  money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "9000" },
  salePlan: { registrationBy: "dealer", titleSignedBy: "buyer", insuranceShown: true, inspectionBy: "done" },
  paperwork: {
    form130U: {
      emptyWeight: "4500",
      _emptyWeightSource: "texas_title",
      _emptyWeightFrom: "deal",
      _emptyWeightReading: "4500",
      _emptyWeightRule: "roundUp",
      _emptyWeightBy: "Maria Lopez",
      _emptyWeightById: "member-1",
      _emptyWeightAt: "2026-10-03T13:30:00.000Z",
      _emptyWeightReason: "",
      _emptyWeightEstimate: "",
    },
  },
};

/** A sale's fee copy as Start A Sale writes it. */
export function feeCopy(over: Partial<DealFees> = {}): DealFees {
  return {
    titleFee: 33,
    registrationFee: 75,
    docFee: 150,
    docFeeCapCents: 22500,
    occcFiling: null,
    scheduleVersion: 1,
    source: "owner",
    takenAt: "2026-10-03T13:00:00.000Z",
    rulebookAsOf: "2026-10-03",
    ...over,
  };
}

/** The sale with this copy of its fees (or none), and these filed documents. */
export async function seedFeeDeal(stepData: Record<string, unknown>, documents: Array<Record<string, unknown>> = []) {
  const client = createMockSupabaseClient();
  await client.from("deals").insert({
    id: FEE_DEAL,
    status: "in_progress",
    language: "en",
    step_data: stepData,
    customers: { id: "fee-buyer", name: "Andrea Salinas", phone: "7135550188" },
    vehicles: { id: "fee-car", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", title_status: "clean", sale_price: 9000 },
  });
  if (documents.length) await client.from("document_agreements").insert(documents.map((row) => ({ deal_id: FEE_DEAL, language: "en", ...row })));
}

/** The money the review screen would post for this sale's fees. */
export function moneyFor(stepData: Record<string, unknown>, fees: Pick<DealFees, "titleFee" | "docFee" | "registrationFee">): PaperworkMoney {
  return paperworkMoney(9000, readPaperwork(stepData, "billOfSale"), readMoney(stepData), "cash", dealFeeLines(fees));
}

export const filedRow = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  document_type: type,
  status: "finalized",
  finalized_at: "2026-10-03T14:00:00.000Z",
  completed_at: "2026-10-03T14:00:00.000Z",
  has_buyer_signature: true,
  ...extra,
});
