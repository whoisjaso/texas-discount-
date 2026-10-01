import AdminDataNotice from "@/components/admin/AdminDataNotice";
import PromiseList from "@/components/admin/PromiseList";
import { getPromiseBoard, type PromiseBoard } from "@/lib/admin/promise-desk";
import { dealership } from "@/lib/dealership-config";

export const metadata = { title: `Promises - ${dealership.shortName} Auto` };
export const dynamic = "force-dynamic";

/**
 * Who said they would pay, and when.
 *
 * The work this screen exists for is one phone call a day: the promises
 * coming due today, and the ones that broke. Sorted soonest first, so the
 * top of the list is the work.
 *
 * The header carries a count and no sentence, the same rule Past Sales and
 * Sale Times follow. A kept-against-broken tally is data and earns its place;
 * a line explaining what a promise is would be prose.
 */
export default async function PromisesPage() {
  let board: PromiseBoard | null = null;
  let dataError: string | null = null;

  try {
    board = await getPromiseBoard();
  } catch (error) {
    dataError =
      error instanceof Error ? error.message : "Could not load promises. Try again in a moment.";
  }

  const settled = (board?.kept ?? 0) + (board?.broken ?? 0);

  return (
    <div className="ed-admin ed-past-page">
      <header className="ed-past-head">
        <h1 className="ed-past-title">Promises</h1>
        {board && settled > 0 ? (
          <p className="ed-past-count">
            {board.kept} kept of {settled}
          </p>
        ) : null}
      </header>

      {dataError ? <AdminDataNotice message={dataError} /> : <PromiseList rows={board?.open ?? []} />}
    </div>
  );
}
