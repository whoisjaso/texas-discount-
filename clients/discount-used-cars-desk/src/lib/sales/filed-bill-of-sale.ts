import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { filedBillOfSale, isFiledAgreement, type FiledAgreementRow } from "@/lib/sales/down-payment-freeze";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";

/**
 * Whether this deal's bill of sale is filed, and what the freeze needs to
 * measure a change (down-payment-freeze.ts, bill-of-sale-freeze.ts): the
 * vehicle row's price, which the figures fall back to only on a deal with no
 * typed amount, and what the filed copy printed for the two facts compared
 * against the paper itself (the plate, and the licence Close The Sale may
 * correct).
 *
 * "Filed" is the desk's own word for it, the rule `getSaleDetail` draws the
 * packet with (`isFiledAgreement`): a row the desk filed (finalized), and also
 * a deal-linked bill of sale the older e-sign path completed, which carries
 * `completed_at` and status "completed" but no `finalized_at`. A voided copy
 * is not filed (owner's decision 10/02/2026): once the bill of sale is voided
 * nothing it stated is held any more.
 *
 * Read through the admin data client, the one `getSaleDetail` reads the deal
 * with: the operator's own session in production, the shared preview store in
 * preview. Fails closed: a lookup that errors throws, and the action refuses
 * the save rather than let a figure move past a bill of sale nobody could
 * check.
 */
export type FiledBillOfSale = {
  type: string;
  advertised: number | null;
  /** The current filed copy. */
  agreementId?: string;
  filedAt?: string | null;
  /** The language it was filed in. */
  language?: string | null;
  /** What the filed copy printed, for the facts compared against the paper. */
  printed?: { plate: string; buyerLicense: string; salePrice?: number | null };
};

type Row = FiledAgreementRow & {
  id?: string | null;
  created_at?: string | null;
  language?: string | null;
};

const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

export async function filedBillOfSaleOn(dealId: string): Promise<FiledBillOfSale | null> {
  const supabase = await createAdminDataClient();
  const { data, error } = await supabase
    .from("document_agreements")
    .select("id, document_type, status, completed_at, finalized_at, voided_at, language, created_at")
    .eq("deal_id", dealId);
  if (error) throw new Error("Filed documents could not be checked.");

  const filed = ((data ?? []) as Row[]).filter(isFiledAgreement);
  const types = filed.map((row) => row.document_type).filter((type): type is string => Boolean(type));
  const type = filedBillOfSale(types);
  if (!type) return null;

  // The newest current copy of that bill of sale.
  const when = (row: Row) => Date.parse(row.finalized_at ?? row.completed_at ?? row.created_at ?? "") || 0;
  const copy = filed
    .filter((row) => row.document_type === type)
    .reduce<Row | null>((best, row) => (!best || when(row) > when(best) ? row : best), null);

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("vehicles(sale_price)")
    .eq("id", dealId)
    .maybeSingle();
  if (dealError) throw new Error("The sale could not be checked.");
  const vehicles = (deal as { vehicles?: unknown } | null)?.vehicles;
  const vehicle = (Array.isArray(vehicles) ? vehicles[0] : vehicles) as { sale_price?: unknown } | null | undefined;
  const price = Number(vehicle?.sale_price);

  /*
    What it printed, read off its own payload: one row's link, fetched alone,
    because a deal's links carry signature images and every freeze lookup
    reading all of them would be the expensive half of a save.
  */
  let printed: FiledBillOfSale["printed"] = { plate: "", buyerLicense: "" };
  if (copy?.id) {
    const { data: linkRow, error: linkError } = await supabase
      .from("document_agreements")
      .select("completed_link")
      .eq("id", copy.id)
      .maybeSingle();
    if (linkError) throw new Error("Filed documents could not be checked.");
    const link = (linkRow as { completed_link?: unknown } | null)?.completed_link;
    const decoded = typeof link === "string" ? decodeCompletedLinkFromUrl(link) : null;
    const dd = (decoded?.dd ?? {}) as Record<string, unknown>;
    const price = typeof dd.salePrice === "number" ? dd.salePrice : Number(text(dd.salePrice).replace(/[$,\s]/g, ""));
    printed = {
      plate: text(dd.vehiclePlate),
      buyerLicense: text(dd.buyerLicense || dd.buyerIdNumber),
      // The price the paper states, which the car is marked sold at.
      salePrice: text(dd.salePrice).trim() !== "" && Number.isFinite(price) ? price : null,
    };
  }

  return {
    type,
    advertised: Number.isFinite(price) ? price : null,
    agreementId: copy?.id ?? undefined,
    filedAt: copy ? (copy.finalized_at ?? copy.completed_at ?? copy.created_at ?? null) : null,
    language: copy?.language ?? null,
    printed,
  };
}
