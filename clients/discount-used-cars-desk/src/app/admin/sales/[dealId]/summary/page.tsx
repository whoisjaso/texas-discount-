import { notFound } from "next/navigation";
import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import SummaryScreen from "@/components/admin/summary/SummaryScreen";
import { getSaleDetail, documentStateFor, SALE_DOCUMENTS, vehicleLabel } from "@/lib/admin/sale-desk";
import { buildGuideSteps } from "@/lib/sales/guide";
import { readSalePlan } from "@/lib/sales/sale-plan";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import { readTitleOrigin } from "@/lib/vehicles/title-kinds";
import { readMoney, saleMoney } from "@/lib/sales/money";
import { readBuyerId } from "@/lib/sales/buyer-id";
import { financingTerms, readPaperwork } from "@/lib/sales/paperwork";
import { isProblem, paidOffOn } from "@/lib/documents/terms";
import { buildLenderDirectory } from "@/lib/sales/lenders";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { resolveAdminLanguageWithUser } from "@/lib/admin/server-language";
import { dealership } from "@/lib/dealership-config";
import type { SummaryDocumentState, SummaryFacts } from "@/lib/sales/sale-summary";

export const dynamic = "force-dynamic";
export const metadata = { title: `The Whole Sale - ${dealership.shortName} Auto` };

interface Props {
  params: Promise<{ dealId: string }>;
}

/**
 * The expert lane's one page: every answer this sale holds, each a link back
 * into the question that owns it.
 *
 * The server's whole job here is to turn a `SaleDetail` into plain facts. The
 * words are chosen in the browser, from the catalogue, so the language toggle
 * reprints the page without a navigation. That split is why the fact object
 * carries numbers and enum names rather than sentences.
 *
 * The step list is the corridor's own. Nothing on this page decides whether
 * an answer counts; it asks `buildGuideSteps` and reports what it says.
 */
export default async function SaleSummaryPage({ params }: Props) {
  const { dealId } = await params;

  const sale = await getSaleDetail(dealId);
  if (!sale) notFound();

  const steps = buildGuideSteps(sale);
  const plan = readSalePlan(sale.stepData);
  const buyerId = readBuyerId(sale.stepData);
  const answers = readMoney(sale.stepData);

  /*
    The trade-in comes off the bill of sale rather than being asked again,
    exactly as the money screens read it, so the total on this page and the
    total on that one cannot disagree.
  */
  const billOfSale = readPaperwork(sale.stepData, "billOfSale");
  const tradeIn =
    billOfSale.tradeIn === "yes" ? Number(billOfSale.tradeInAllowance) || 0 : 0;
  const money = saleMoney(
    sale.vehicle?.salePrice ?? 0,
    answers,
    tradeIn,
    sale.funding.type,
  );

  /*
    The lender by name, not by id. The directory is the same one the lender
    step searches, and a deal that recorded a lender the directory does not
    carry kept the typed name instead.
  */
  const lenderName = (() => {
    if (sale.funding.lenderId) {
      const found = buildLenderDirectory(dealership.lenders).find(
        (entry) => entry.id === sale.funding.lenderId,
      );
      if (found) return found.name;
    }
    const other = sale.funding.lenderOther;
    return other && other !== "Not chosen yet" ? other : null;
  })();

  /*
    Documents, taken from the step list rather than from the catalogue of all
    documents, so the page shows the ones THIS sale requires. The step list
    already applied the funding rules and the plan's own additions and
    removals; re-deriving them here would be a second opinion.
  */
  const documents = steps
    .filter((step) => step.key.startsWith("document:"))
    .map((step) => {
      const type = step.key.slice("document:".length);
      const entry = SALE_DOCUMENTS.find((candidate) => candidate.documentType === type);
      const state: SummaryDocumentState = entry
        ? (documentStateFor(entry, sale.documents) as SummaryDocumentState)
        : "none";
      return { type, state };
    });

  const facts: SummaryFacts = {
    dealId: sale.id,
    vehicleLabel: vehicleLabel(sale.vehicle),
    vin: sale.vehicle?.vin ?? null,
    buyerName: sale.buyer?.name?.trim() || null,
    dealLanguage: sale.language === "es" ? "es" : sale.language === "en" ? "en" : null,
    licenceOnFile: Boolean(buyerId.image),
    funding: sale.funding.type,
    lenderName,
    money: {
      amount: answers.amount,
      priceBasis: answers.priceBasis,
      total: money.total,
      paidToday: money.paidToday,
      lien: money.lien,
    },
    plan,
    titleStatus: sale.vehicle ? (sale.vehicle.titleStatus ?? "unknown") : null,
    titleOriginState: readTitleOrigin(sale.stepData).state,
    salvagePath: readSalvagePlan(sale.stepData).path,
    documents,
    plate: sale.plate,
    steps: steps.map((step) => ({ key: step.key, done: step.done })),
    // The earlier of the two dates the deal carries, so the clock is never
    // read as longer than it is.
    deliveredOn: (sale.startedAt ?? sale.createdAt)?.slice(0, 10) ?? null,
    financing: (() => {
      if (sale.funding.type !== "inHouse") return null;
      const note = readPaperwork(sale.stepData, "financing");
      const terms = financingTerms(note, {
        dealTotal: money.total,
        vehicleYear: sale.vehicle?.year ?? null,
        saleYear: Number((sale.startedAt ?? sale.createdAt).slice(0, 4)) || undefined,
        paidToday: money.paidToday > 0 ? money.paidToday : null,
      });
      if (!terms || isProblem(terms)) return null;
      return {
        payment: terms.payment,
        count: terms.count,
        apr: terms.apr,
        paidOffOn: note.firstPaymentDate ? paidOffOn(note.firstPaymentDate, terms.count, terms.frequency) : null,
      };
    })(),
  };

  const { lang, userId } = await resolveAdminLanguageWithUser();
  const saleHref = `/admin/sales/${encodeURIComponent(sale.id)}`;

  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
      <SummaryScreen facts={facts} saleHref={saleHref} guideHref={`${saleHref}/guide`} />
    </FunnelLocaleProvider>
  );
}
