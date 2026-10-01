import Link from "next/link";
import CompleteSalePanel from "@/components/admin/CompleteSalePanel";
import {
  SALE_DOCUMENTS,
  describeDocumentState,
  documentStateFor,
  isDocumentDone,
  hasRegistrationRecord,
  paperworkHref,
  saleDocumentHref,
  vehicleLabel,
  type SaleDetail,
  type SaleDocumentEntry,
  type SaleDocumentState,
} from "@/lib/admin/sale-desk";
import { ArrowRight, Check } from "@phosphor-icons/react/ssr";
import DealFundingPanel from "@/components/admin/DealFundingPanel";
import WebDealerHandoff from "@/components/admin/WebDealerHandoff";
import {
  dealTypeLabel,
  isDocumentExcluded,
  requiredDocumentTypes,
} from "@/lib/sales/deal-type";
import { settledPlan } from "@/lib/sales/sale-plan";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import { dealTitleBadge } from "@/lib/sales/deal-badge";
import DealBadge from "@/components/admin/DealBadge";
import { buildLenderDirectory } from "@/lib/sales/lenders";
import { buildHandoffFields } from "@/lib/sales/webdealer";
import { dealership, factOr } from "@/lib/dealership-config";

/**
 * A sale.
 *
 * This screen used to be one of two ways to look at the same thing. The other
 * was a nine-step flow that walked the operator through the packet one
 * document per screen, Continue at the bottom of each. Six of those screens
 * asked nothing: they showed an icon, a status line, and a button.
 *
 * The packet is not a sequence. Documents get signed in whatever order the
 * buyer and the printer allow, some get skipped, and one of them is a window
 * sticker that is never stored at all. So it is shown as what it is: a state.
 * Every document, its condition, and a way in. The operator picks.
 *
 * Presentational on purpose: it is handed a sale and renders it, so the same
 * view can be checked against a fixture without a database behind it.
 */

function DocumentRow({
  entry,
  state,
  dealId,
  required,
}: {
  entry: SaleDocumentEntry;
  state: SaleDocumentState;
  dealId: string;
  /** Owed on this sale, so the registry's "optional" is not this row's word. */
  required: boolean;
}) {
  const done = isDocumentDone(state);

  return (
    <li>
      {/* The corridor's own screen for this document, where the sale already
          holds the answers. The templates page is the fallback for the one
          document the corridor cannot ask for, and nothing else. */}
      <Link
        href={paperworkHref(entry, dealId) ?? saleDocumentHref(entry, dealId)}
        className="ed-doc-row group"
      >
        <span className="ed-doc-mark" data-state={done ? "done" : "open"}>
          {done ? <Check size={14} weight="regular" aria-hidden="true" /> : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="ed-doc-title">
            {entry.title}
            {entry.optional && !required ? <span className="ed-doc-tag">Optional</span> : null}
          </span>
          {/* Scent, not explanation. Three or four words so a new hire can tell
              the rows apart without opening one to find out. */}
          <span className="ed-doc-gloss">{entry.gloss}</span>
        </span>

        <span className="ed-doc-state">{describeDocumentState(entry, state)}</span>

        <ArrowRight
          size={18}
          className="ed-doc-go"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="ed-fact-label">{label}</dt>
      <dd className="ed-fact-value">{value}</dd>
    </div>
  );
}

export default function SaleDetailView({
  sale,
  backLink,
}: {
  sale: SaleDetail;
  backLink: React.ReactNode;
}) {
  const buyerName = sale.buyer?.name?.trim() || "Buyer not set";
  const completed = sale.status === "completed";

  const lenders = buildLenderDirectory(dealership.lenders);
  const fundingType = sale.funding.type;

  // The packet is now a function of how the sale is paid for. A cash deal does
  // not show a financing contract at all, and a lender deal does not show ours,
  // because theirs is the contract and signing both would be signing the same
  // debt twice. Rows are removed rather than greyed: a disabled row still reads
  // as work outstanding to someone who does not know the difference.
  // The plan decides the packet here too, not just in the corridor. These two
  // screens describing the same sale differently is how an operator learns not
  // to trust either of them.
  const salvagePath = readSalvagePlan(sale.stepData).path;
  const requiredTypes = requiredDocumentTypes(
    fundingType,
    settledPlan(sale.stepData),
    sale.vehicle?.titleStatus ?? null,
    salvagePath,
  );
  const badge = dealTitleBadge(sale.vehicle?.titleStatus, salvagePath);

  /*
    An optional document is shown only on a sale that owes it, or that has
    already filed one. The registry now carries four exception documents
    (buyer registers, no insurance shown, rebuilt title, we sign for an
    absent buyer), and listing all of them as "Not needed yet" on a clean
    cash deal is four rows of nothing between the operator and the three
    that matter. A step that does not apply does not exist.
  */
  /*
    And on a tow-away sale the ordinary sheets are not owed at all: the
    salvage answer swaps the packet, so the bill of sale and the 130-U
    leave the list rather than sitting on it as "Not started", which is
    the promise of plates in the form of a row. The buyer's guide stays;
    it is a window form on any used car offered for sale.
  */
  const visible = SALE_DOCUMENTS.filter((entry) => {
    if (isDocumentExcluded(entry.documentType, fundingType)) return false;
    if (!entry.documentType) return true;
    return (
      requiredTypes.includes(entry.documentType) ||
      isDocumentDone(documentStateFor(entry, sale.documents))
    );
  });
  const required = visible.filter(
    (entry) => entry.documentType && requiredTypes.includes(entry.documentType),
  );
  const outstanding = required.filter(
    (entry) => !isDocumentDone(documentStateFor(entry, sale.documents)),
  );
  const signed = required.length - outstanding.length;

  const handoffFields = buildHandoffFields(sale, factOr(dealership.license, "dealer licence (GDN)"));

  return (
    <div className="ed-admin px-5 py-8 md:px-10 md:py-12">
      {backLink}

      <header className="ed-sale-head">
        <div className="min-w-0">
          <h1 className="ed-admin-title">{buyerName}</h1>
          <p className="ed-sale-car">
            {vehicleLabel(sale.vehicle)}
            {sale.vehicle?.vin ? ` · VIN ${sale.vehicle.vin.toUpperCase()}` : ""}
          </p>
          {/* What the title lets this sale be, computed and never typed. */}
          <DealBadge badge={badge} label={badge.label} gloss={badge.gloss} compact={badge.tone === "ok"} />
        </div>
        {completed ? <span className="ed-sale-closed">Sold</span> : null}
      </header>

      {/* The fast lane, from the desk rather than from inside the corridor.
          A dealer who already knows this deal wants to see it, not walk it,
          and making them start the walkthrough to reach the summary would
          defeat the point of having one. */}
      <p className="ed-sale-summary-link">
        <Link href={`/admin/sales/${encodeURIComponent(sale.id)}/summary`}>
          See the whole sale on one page
        </Link>
      </p>

      <section aria-label="Buyer" className="ed-admin-panel mt-8 p-6 md:p-7">
        <dl className="ed-fact-row">
          <Fact label="Phone" value={sale.buyer?.phone?.trim() || "Not given"} />
          <Fact label="ID number" value={sale.buyer?.idNumber || "Not recorded"} />
          <Fact label="Address" value={sale.buyer?.address || "Not recorded"} />
          <Fact
            label="Language"
            value={sale.language === "es" ? "Español" : "English"}
          />
          <Fact label="Paid by" value={dealTypeLabel(sale.funding.type)} />
        </dl>
      </section>

      <DealFundingPanel
        dealId={sale.id}
        funding={sale.funding}
        lenders={lenders}
        disabled={completed}
      />

      <section aria-label="Packet" className="mt-10">
        <div
          className="ed-sale-progress"
          style={{
            ["--step-progress" as string]:
              required.length > 0
                ? `${Math.round((signed / required.length) * 100)}%`
                : "0%",
          }}
        >
          <h2 className="ed-sale-progress-label">Packet</h2>
          <span className="ed-step-track" aria-hidden="true" />
          <span className="ed-sale-progress-count">
            {signed} of {required.length} signed
          </span>
        </div>

        <ul className="mt-5 flex flex-col gap-3">
          {visible.map((entry) => (
            <DocumentRow
              key={entry.href}
              entry={entry}
              state={documentStateFor(entry, sale.documents)}
              dealId={sale.id}
              required={Boolean(entry.documentType && requiredTypes.includes(entry.documentType))}
            />
          ))}
        </ul>
      </section>

      <WebDealerHandoff
        dealId={sale.id}
        fields={handoffFields}
        webDealerUrl={dealership.webDealerUrl}
        plate={sale.plate}
      />

      {/* Only when the retired paperwork pipeline actually recorded something.
          A deal that never went through it shows no such section, which is a
          different statement from showing an empty one. */}
      {hasRegistrationRecord(sale.registration) ? (
        <section aria-label="Registration" className="mt-10">
          <h2 className="ed-admin-label">Registration</h2>
          <dl className="ed-fact-row ed-admin-panel mt-4 p-6 md:p-7">
            {sale.registration.reassignment ? (
              <Fact
                label="Title path"
                value={sale.registration.reassignment}
              />
            ) : null}
            {sale.registration.checklist ? (
              <Fact
                label="WebDealer"
                value={`${sale.registration.checklist.done} of ${sale.registration.checklist.total} checked`}
              />
            ) : null}
          </dl>
        </section>
      ) : null}

      <section aria-label="Close the sale" className="mt-10">
        {completed ? (
          <p className="ed-sale-done">
            Filed against {buyerName}.{" "}
            <Link href="/admin/sales/past">Past Sales</Link>
          </p>
        ) : (
          <CompleteSalePanel
            dealId={sale.id}
            buyerName={sale.buyer?.name?.trim() ?? ""}
            buyerIdNumber={sale.buyer?.idNumber ?? ""}
            salePrice={sale.vehicle?.salePrice ?? null}
          />
        )}
      </section>
    </div>
  );
}
