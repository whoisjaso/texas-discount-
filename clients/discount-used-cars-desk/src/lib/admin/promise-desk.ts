import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { daysBetween, graceEndsOn, type PaymentPromise } from "@/lib/collections/promise";

/**
 * What the Promises screen shows.
 *
 * Fetch and shape only. Every judgement about what a promise means lives in
 * `promise.ts`, which is tested against plain objects.
 */

export type PromiseRow = {
  id: string;
  customerName: string;
  customerId: string;
  amountCents: number;
  promisedFor: string;
  quote: string;
  source: PaymentPromise["source"];
  byAi: boolean;
  /** Negative when the promise is already past its grace period. */
  daysUntil: number;
  /** True once the grace period has run out and nothing has landed. */
  overdue: boolean;
};

export type PromiseBoard = {
  open: PromiseRow[];
  /** Kept against broken, across every settled promise on the book. */
  kept: number;
  broken: number;
};

const today = (): string => new Date().toISOString().slice(0, 10);

export async function getPromiseBoard(): Promise<PromiseBoard> {
  const supabase = await createAdminDataClient();
  const now = today();

  const { data, error } = await supabase
    .from("payment_promises")
    .select("id, customer_id, amount_cents, promised_for, quote, source, captured_by, status, customers(name)")
    .order("promised_for", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    customer_id: string;
    amount_cents: number;
    promised_for: string;
    quote: string;
    source: PaymentPromise["source"];
    captured_by: string;
    status: PaymentPromise["status"];
    customers: { name: string | null } | null;
  }[];

  const open = rows
    .filter((row) => row.status === "open")
    .map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      // A promise against a customer with no name on file is still a promise;
      // it says so rather than being dropped off the list.
      customerName: row.customers?.name?.trim() || "Name not on file",
      amountCents: row.amount_cents,
      promisedFor: row.promised_for,
      quote: row.quote,
      source: row.source,
      byAi: row.captured_by === "ai",
      daysUntil: daysBetween(now, row.promised_for),
      overdue: daysBetween(graceEndsOn(row.promised_for), now) > 0,
    }));

  return {
    open,
    kept: rows.filter((row) => row.status === "kept").length,
    broken: rows.filter((row) => row.status === "broken").length,
  };
}
