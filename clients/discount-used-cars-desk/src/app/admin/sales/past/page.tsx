import AdminDataNotice from "@/components/admin/AdminDataNotice";
import PastSalesList from "@/components/admin/PastSalesList";
import { getPastSales } from "@/lib/admin/past-sales-data";
import type { PastSale } from "@/lib/admin/past-sales";
import { dealership } from "@/lib/dealership-config";

export const metadata = { title: `Past Sales - ${dealership.shortName} Auto` };
export const dynamic = "force-dynamic";

/**
 * What this lot has sold, and who at the desk sold it.
 *
 * `/admin/sales` answers "what still owes something" and so lists only the
 * open ones. This answers the other question, the one that gets asked out loud
 * on a small lot all day: who bought that car, when, and which of us handled
 * it. Until now the answer lived in somebody's memory.
 *
 * Everyone's sales, not the signed-in person's. A dealership is one book, and
 * a screen that showed you only your own would be answering a question nobody
 * at a two-person lot is asking.
 *
 * A row opens the packet rather than the deal summary, because a finished sale
 * is a thing you go looking for in order to print something out of it.
 *
 * The header carries a count and no sentence. DESIGN.md's rule for an operate
 * screen is zero explanatory prose, and "every finished sale, and who handled
 * it" was exactly that: a line describing what the rows underneath already
 * say. A count is data and earns its place.
 */
export default async function PastSalesPage() {
  let sales: PastSale[] = [];
  let dataError: string | null = null;

  try {
    sales = await getPastSales();
  } catch (error) {
    dataError =
      error instanceof Error
        ? error.message
        : "Could not load past sales. Try again in a moment.";
  }

  return (
    <div className="ed-admin ed-past-page">
      <header className="ed-past-head">
        <h1 className="ed-past-title">Past Sales</h1>
        {dataError ? null : (
          <p className="ed-past-count">
            {sales.length} {sales.length === 1 ? "sale" : "sales"}
          </p>
        )}
      </header>

      {dataError ? <AdminDataNotice message={dataError} /> : <PastSalesList sales={sales} />}
    </div>
  );
}
