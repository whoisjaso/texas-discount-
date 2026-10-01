import AdminDataNotice from "@/components/admin/AdminDataNotice";
import SaleBoard from "@/components/admin/SaleBoard";
import { getSaleBoard, type Board } from "@/lib/admin/sale-timing-data";
import { dealership } from "@/lib/dealership-config";

export const metadata = { title: `Sale Times - ${dealership.shortName} Auto` };
export const dynamic = "force-dynamic";

/**
 * How long a sale takes, per person.
 *
 * ## Why this is a page and not a panel
 *
 * It shipped as the seventh section of the analytics dashboard, under the
 * money. That screen answers "where the money went and what the lot is worth",
 * and DESIGN.md's first rule is that a screen states ONE job — so a
 * leaderboard about people was a second job wedged into a screen that already
 * had one, reachable only by scrolling past four other things.
 *
 * The sidebar already says how this lot thinks: Past Sales sits directly under
 * Handle A Sale because they are two halves of one question asked in that
 * order. This is the third. What is open, what is done, how long it takes.
 * One screen each, one click each, no scrolling to find it.
 *
 * ## The header carries a count and no sentence
 *
 * Same rule the Past Sales header follows, and for the same reason: a line
 * describing what the rows underneath already say is prose, and a count is
 * data and earns its place. The owner's whole point in asking for this was
 * competition, and people do not compete against a methodology note.
 */
export default async function SaleTimesPage() {
  let board: Board | null = null;
  let dataError: string | null = null;

  try {
    board = await getSaleBoard();
  } catch (error) {
    dataError =
      error instanceof Error
        ? error.message
        : "Could not load sale times. Try again in a moment.";
  }

  const ranked = board?.rows.filter((row) => row.medianMs !== null).length ?? 0;

  return (
    <div className="ed-admin ed-past-page">
      <header className="ed-past-head">
        <h1 className="ed-past-title">Sale Times</h1>
        {board && ranked > 0 ? (
          <p className="ed-past-count">
            {ranked} {ranked === 1 ? "person" : "people"}
          </p>
        ) : null}
      </header>

      {dataError ? <AdminDataNotice message={dataError} /> : <SaleBoard rows={board?.rows ?? []} />}
    </div>
  );
}
