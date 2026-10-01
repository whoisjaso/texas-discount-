import Link from "next/link";
import AdminDataNotice from "@/components/admin/AdminDataNotice";
import DeleteSaleButton from "@/components/admin/DeleteSaleButton";
import SaleClock from "@/components/admin/SaleClock";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { SALE_DOCUMENTS } from "@/lib/admin/sale-desk";
import { readFunding, requiredDocumentTypes } from "@/lib/sales/deal-type";
import { settledPlan } from "@/lib/sales/sale-plan";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import { dealTitleBadge } from "@/lib/sales/deal-badge";
import DealBadge from "@/components/admin/DealBadge";
import { ArrowRight, Plus } from "@phosphor-icons/react/ssr";
import { dealership, missingDealerFacts } from "@/lib/dealership-config";

export const metadata = { title: `Sale - ${dealership.shortName} Auto` };
export const dynamic = "force-dynamic";

/**
 * Sales that are open.
 *
 * Each row used to say "Step 4", which counted screens in a flow that no
 * longer exists and never told anyone anything: step four of a sale where two
 * of the nine screens were skippable meant nothing you could act on.
 *
 * What an operator wants from this list is which sale still owes something. So
 * a row counts signatures against the documents that actually have to exist,
 * read from the records themselves.
 */

type SaleRow = {
  id: string;
  status: string;
  created_at: string;
  /** When the work began, which is before this row was written. */
  started_at: string | null;
  /** Carries the funding answer, which decides how many documents are owed. */
  step_data: unknown;
  customers: { name: string | null; phone: string | null } | null;
  vehicles: {
    year: number | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    /** The verified title, which with the salvage answer decides the row's badge. */
    title_status: string | null;
  } | null;
};

/**
 * How many documents this particular sale needs.
 *
 * This row used to count against a fixed list of the non-optional documents,
 * which is three, while the walkthrough derives the list from how the sale is
 * being paid for. On a Buy Here Pay Here deal that is four: our financing
 * contract is required, and the guide walks it. So the two screens disagreed
 * about the same sale, and the cheaper lie was on this one: a financed deal
 * could sit on the list reading "3 of 3 signed" with the contract that
 * actually collects the money still unsigned.
 *
 * Both now read from `requiredDocumentTypes`, which is the one place that
 * knows. The buyer's guide is still absent from every list on purpose: it is
 * an FTC window form that is printed and never stored, so it has no record to
 * count.
 */
function requiredFor(stepData: unknown, titleStatus: string | null): string[] {
  // The plan too, so this row counts against the same set the corridor walks.
  // Without it a buyer-registers deal read "2 of 4 signed" against a power of
  // attorney and a title application that sale does not owe at all. And the
  // title with its salvage answer, so a tow-away sale counts its own three.
  return requiredDocumentTypes(
    readFunding(stepData).type,
    settledPlan(stepData),
    titleStatus,
    readSalvagePlan(stepData).path,
  ).filter((type) => SALE_DOCUMENTS.some((entry) => entry.documentType === type));
}

async function getSalesInProgress(): Promise<{
  rows: SaleRow[];
  signedByDeal: Record<string, number>;
  error: string | null;
}> {
  try {
    const supabase = await createAdminDataClient();
    const { data, error } = await supabase
      .from("deals")
      .select(
        "id, status, created_at, started_at, step_data, customers(name, phone), vehicles(year, make, model, vin, title_status)",
      )
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    const rows = (data ?? []) as unknown as SaleRow[];

    // One query for every listed sale rather than one per row.
    const signedByDeal: Record<string, number> = {};
    if (rows.length > 0) {
      const { data: agreements, error: agreementError } = await supabase
        .from("document_agreements")
        .select("deal_id, document_type, status, completed_at, finalized_at")
        .in(
          "deal_id",
          rows.map((row) => row.id),
        );

      if (agreementError) throw agreementError;

      // What each deal actually owes, by its own funding answer.
      const requiredByDeal: Record<string, string[]> = {};
      for (const row of rows) {
        requiredByDeal[row.id] = requiredFor(row.step_data, row.vehicles?.title_status ?? null);
      }

      const seen: Record<string, Set<string>> = {};
      for (const raw of agreements ?? []) {
        const agreement = raw as unknown as {
          deal_id: string | null;
          document_type: string | null;
          status: string | null;
          completed_at: string | null;
          finalized_at: string | null;
        };
        if (!agreement.deal_id || !agreement.document_type) continue;

        const finalized =
          Boolean(agreement.finalized_at) ||
          Boolean(agreement.completed_at) ||
          agreement.status === "completed" ||
          agreement.status === "finalized";
        if (!finalized) continue;
        if (!requiredByDeal[agreement.deal_id]?.includes(agreement.document_type)) {
          continue;
        }

        // A deal can hold several attempts at one document. Count the
        // document, never the attempts.
        (seen[agreement.deal_id] ??= new Set()).add(agreement.document_type);
      }
      for (const [dealId, types] of Object.entries(seen)) {
        signedByDeal[dealId] = types.size;
      }
    }

    return { rows, signedByDeal, error: null };
  } catch (error) {
    return {
      rows: [],
      signedByDeal: {},
      error:
        error instanceof Error
          ? error.message
          : "Unable to load sales in progress.",
    };
  }
}

function vehicleLabel(vehicle: SaleRow["vehicles"]): string {
  if (!vehicle) return "Vehicle not set";
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Vehicle not set";
}

export default async function SalesPage() {
  const { rows, signedByDeal, error } = await getSalesInProgress();

  return (
    <div className="ed-admin px-5 py-8 md:px-10 md:py-12">
      <header className="ed-sale-head">
        <h1 className="ed-admin-title">Handle A Sale</h1>
        <Link
          href="/admin/sales/new"
          className="tj-action-base tj-action-primary tj-action-md shrink-0"
        >
          <Plus size={15} aria-hidden="true" />
          Start A Sale
        </Link>
      </header>

      {error ? (
        <div className="mt-8">
          <AdminDataNotice message={error} />
        </div>
      ) : null}

      {missingDealerFacts().length > 0 ? (
        <div className="mt-8">
          <AdminDataNotice
            label="Owner Details Needed"
            title="Dealer details missing"
            message={`Documents print "Not set" and cannot be filed until the owner supplies: ${missingDealerFacts().join(", ")}.`}
          />
        </div>
      ) : null}

      <section aria-label="Sales in progress" className="mt-10">
        {rows.length === 0 && !error ? (
          <p className="ed-desk-state">Nothing open.</p>
        ) : (
          <>
            <p className="ed-desk-state">
              <b>{rows.length}</b> open.
            </p>

            <ul className="mt-6 flex flex-col gap-3">
              {rows.map((row) => {
                const signed = signedByDeal[row.id] ?? 0;
                const badge = dealTitleBadge(
                  row.vehicles?.title_status ?? null,
                  readSalvagePlan(row.step_data).path,
                );
                return (
                  <li key={row.id} className="ed-sale-row-wrap">
                    <Link href={`/admin/sales/${row.id}`} className="ed-doc-row group">
                      <span className="min-w-0 flex-1">
                        <span className="ed-doc-title block">
                          {row.customers?.name?.trim() || "Buyer not set"}
                        </span>
                        <span className="ed-sale-row-car block">
                          {vehicleLabel(row.vehicles)}
                          {row.vehicles?.vin
                            ? ` · ${row.vehicles.vin.slice(-6).toUpperCase()}`
                            : ""}
                          {/* On this line rather than in `ed-doc-state`, which
                              is display:none under 600px — and the desk is
                              used on a phone. It renders nothing at all on a
                              sale nobody timed. */}
                          <SaleClock startedAt={row.started_at} className="ed-sale-clock" />
                        </span>
                        {/* Only when the title is holding or stopping the
                            sale. An ordinary row saying "Ready For Normal
                            Sale" fifty times is fifty lines of nothing. */}
                        {badge.tone === "ok" ? null : (
                          <DealBadge badge={badge} label={badge.label} compact />
                        )}
                      </span>

                      <span className="ed-doc-state">
                        {signed} of {requiredFor(row.step_data, row.vehicles?.title_status ?? null).length} signed
                      </span>

                      <ArrowRight size={18} className="ed-doc-go" aria-hidden="true" />
                    </Link>

                    {/* Beside the row rather than inside it: a button nested in
                        a link is neither valid nor clickable in the way anyone
                        expects. Always offered: hiding it on a signed sale left
                        the owner staring at his own test rows with no control
                        and no explanation. The server still decides who gets
                        past a signature. */}
                    <DeleteSaleButton
                      dealId={row.id}
                      buyerName={row.customers?.name?.trim() || "this buyer"}
                      hasSignedPaperwork={signed > 0}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
