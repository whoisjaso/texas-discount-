import { readSpan, type Standing } from "@/lib/sales/elapsed";

/**
 * How long each person's sales take.
 *
 * ## Why this has no paragraph on it
 *
 * The first version of this screen carried fifty words explaining medians and
 * four-hour cutoffs under every view. DESIGN.md's rule for an operate screen
 * is zero explanatory prose and sixty visible words total, and the harness in
 * `scripts/measure-screens.mjs` counts a sentence-shaped run of nine words or
 * more as prose on a measured route. That paragraph was me documenting my own
 * design decisions on a screen the floor has to read at a glance.
 *
 * The rules did not change; the reasoning lives in `elapsed.ts` and its tests,
 * where the people who need it are already looking. What survives on screen is
 * the part a salesperson acts on: who, how long, how many.
 *
 * ## The one fact that has to stay visible
 *
 * `2 over 4h` on a row. Sales past four hours are left out of the figure, and
 * an exclusion nobody can see is a cover-up: somebody whose month is three
 * good sales and one overnight must not quietly find their total is three. It
 * is DATA, three characters and a unit, not a sentence about methodology. The
 * long-form reason sits in the row's title attribute, which costs no words on
 * screen and arrives only when somebody is actually stuck on it.
 */

export default function SaleBoard({ rows }: { rows: Standing[] }) {
  if (rows.length === 0) {
    // Three words. The old version added a second sentence explaining when
    // timing starts, which is a tour, and DESIGN.md's rule is that help
    // arrives when a person is stuck rather than before.
    return <p className="ed-times-empty">Nothing timed yet.</p>;
  }

  return (
    <ol className="ed-times-list">
      {rows.map((row, index) => (
        <li key={row.personId ?? row.personName} className="ed-times-row">
          <span className="ed-times-rank" aria-hidden="true">
            {/* An unmeasured row gets no number, because numbering it would
                be a claim about a place it has not earned either way. */}
            {row.medianMs === null ? "" : index + 1}
          </span>

          <span className="ed-times-main">
            <span className="ed-times-who">{row.personName}</span>
            <span className="ed-times-what">
              {row.sales} {row.sales === 1 ? "sale" : "sales"}
              {row.bestMs !== null ? ` · best ${readSpan(row.bestMs)}` : ""}
              {row.setAside > 0 ? (
                <span title="Ran past four hours, so it is left out of the figure">
                  {` · ${row.setAside} over 4h`}
                </span>
              ) : null}
            </span>
          </span>

          <span className="ed-times-span">
            {row.medianMs === null ? (
              <span className="ed-times-none">Not timed</span>
            ) : (
              readSpan(row.medianMs)
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
