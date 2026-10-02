import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { filedBillOfSale } from "@/lib/sales/down-payment-freeze";

/**
 * Whether this deal's bill of sale is filed, and what the down-payment freeze
 * needs to measure a change (down-payment-freeze.ts): the vehicle row's
 * price, which the figures fall back to only on a deal with no typed amount.
 *
 * Read through the admin data client, the one `getSaleDetail` reads the deal
 * with: the operator's own session in production, the shared preview store in
 * preview. Fails closed: a lookup that errors throws, and the action refuses
 * the save rather than let a down payment move past a bill of sale nobody
 * could check.
 */
export async function filedBillOfSaleOn(
  dealId: string,
): Promise<{ type: string; advertised: number | null } | null> {
  const supabase = await createAdminDataClient();
  const { data, error } = await supabase
    .from("document_agreements")
    .select("document_type")
    .eq("deal_id", dealId)
    .not("finalized_at", "is", null);
  if (error) throw new Error("Filed documents could not be checked.");

  const types = ((data ?? []) as Array<{ document_type: string | null }>)
    .map((row) => row.document_type)
    .filter((type): type is string => Boolean(type));
  const type = filedBillOfSale(types);
  if (!type) return null;

  const { data: deal } = await supabase
    .from("deals")
    .select("vehicles(sale_price)")
    .eq("id", dealId)
    .maybeSingle();
  const vehicles = (deal as { vehicles?: unknown } | null)?.vehicles;
  const vehicle = (Array.isArray(vehicles) ? vehicles[0] : vehicles) as { sale_price?: unknown } | null | undefined;
  const price = Number(vehicle?.sale_price);
  return { type, advertised: Number.isFinite(price) ? price : null };
}
