import { notFound } from "next/navigation";
import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import GovernmentFeesForm from "@/components/admin/fees/GovernmentFeesForm";
import { getSaleDetail, vehicleLabel } from "@/lib/admin/sale-desk";
import { resolveAdminLanguageWithUser } from "@/lib/admin/server-language";
import { dealership } from "@/lib/dealership-config";
import { registersNothing } from "@/lib/dealership-fees";
import { businessDateToday } from "@/lib/documents/us-date";
import { readBuyerId } from "@/lib/sales/buyer-id";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import { governmentEstimate, readGovernmentFees } from "@/lib/sales/government-fees";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { readPaperwork, texasCountyForCity } from "@/lib/sales/paperwork";

export const dynamic = "force-dynamic";
export const metadata = { title: `Government Fees - ${dealership.name}` };

interface Props {
  params: Promise<{ dealId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * This sale's government fees, recorded from webDEALER (government-fees.ts):
 * the title fee, the registration side, the inspection program replacement
 * fee and the license plate fee, for the buyer's county. Every government
 * line on the paper must be the amount paid to the state (Tex. Fin. Code
 * §348.005), and a document printing them is not filed until they are
 * recorded here. The desk's own estimate is shown beside each box as a
 * check; webDEALER's figure is the one saved.
 */
export default async function GovernmentFeesPage({ params, searchParams }: Props) {
  const { dealId } = await params;
  const query = (await searchParams) ?? {};
  const sale = await getSaleDetail(dealId);
  if (!sale) notFound();

  const saleHref = `/admin/sales/${encodeURIComponent(sale.id)}`;
  // Back where the person came from, when that is this sale's own screen.
  const backParam = typeof query.back === "string" ? query.back : "";
  const back = backParam.startsWith(`${saleHref}/`) || backParam === saleHref ? backParam : `${saleHref}/guide`;

  const today = businessDateToday();
  const recorded = readGovernmentFees(sale.stepData);
  const mailing = readBuyerId(sale.stepData).mailing;
  const county =
    (recorded.kind === "valid" ? recorded.fees.county : "") ||
    (readPaperwork(sale.stepData, "form130U").countyOfResidence ?? "").trim() ||
    texasCountyForCity(mailing.city ?? "") ||
    "";
  const filed = await filedBillOfSaleOn(sale.id).catch(() => null);
  const { lang, userId } = await resolveAdminLanguageWithUser();

  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
      <GovernmentFeesForm
        dealId={sale.id}
        vehicle={vehicleLabel(sale.vehicle)}
        buyerName={sale.buyer?.name ?? ""}
        initialCounty={county}
        recorded={recorded.kind === "valid" ? recorded.fees : null}
        estimate={governmentEstimate(county, sale.vehicle?.weightLbs ?? null, today)}
        weightLbs={sale.vehicle?.weightLbs ?? null}
        today={today}
        locked={filed ? "billOfSaleFiled" : registersNothing(sale) ? "towAway" : sale.status !== "in_progress" ? "closed" : null}
        backHref={back}
        saleHref={saleHref}
      />
    </FunnelLocaleProvider>
  );
}
