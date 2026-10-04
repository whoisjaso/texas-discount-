import Link from "next/link";
import AdminDataNotice from "@/components/admin/AdminDataNotice";
import SaleDetailView from "@/components/admin/SaleDetailView";
import { getSaleDetail, type SaleDetail } from "@/lib/admin/sale-desk";
import { CaretLeft } from "@phosphor-icons/react/ssr";
import { dealership } from "@/lib/dealership-config";
import { resolveVehicleWeight } from "@/lib/vehicles/empty-weight/ensure";
import type { WeightEstimate } from "@/lib/vehicles/empty-weight/types";
import { applyFeesOffer, dealFeeLinesForSale } from "@/lib/dealership-fees";

export const metadata = { title: `Sale - ${dealership.name}` };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ dealId: string }>;
}

export default async function SaleDetailPage({ params }: Props) {
  const { dealId } = await params;

  let sale: SaleDetail | null = null;
  let dataError: string | null = null;

  try {
    sale = await getSaleDetail(dealId);
  } catch (error) {
    dataError =
      error instanceof Error
        ? error.message
        : "Could not load this sale. Try again in a moment.";
  }

  const backLink = (
    <Link
      href="/admin/sales"
      className="ed-fine inline-flex items-center gap-2 text-[color:var(--tj-muted)] transition-colors hover:text-[color:var(--tj-ink)]"
    >
      <CaretLeft size={14} aria-hidden="true" />
      Sale
    </Link>
  );

  if (dataError) {
    return (
      <div className="ed-admin px-5 py-8 md:px-10 md:py-12">
        {backLink}
        <div className="mt-6">
          <AdminDataNotice message={dataError} />
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="ed-admin px-5 py-8 md:px-10 md:py-12">
        {backLink}
        <div className="ed-admin-panel mt-6 px-6 py-14 text-center">
          <p className="ed-body text-[color:var(--tj-muted)]">That sale no longer exists.</p>
        </div>
      </div>
    );
  }

  /*
    The car's empty weight, as the sale knows it: worked out the first time
    the sale is opened (and kept on the vehicle), silent on failure, and held
    to four seconds here so a slow lookup never holds the sale page. The
    lookup carries on and is cached for the 130-U.
  */
  const estimate: WeightEstimate | null = await Promise.race([
    resolveVehicleWeight(sale.vehicle, { network: true }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]).catch(() => null);

  // The sale's own fees (the copy it started with), and whether to offer
  // today's in their place.
  const fees = await dealFeeLinesForSale(sale);
  const applyFees = await applyFeesOffer(sale);

  return <SaleDetailView sale={sale} backLink={backLink} weightEstimate={estimate} fees={fees} applyFees={applyFees} />;
}
