import type { PromiseRow } from "@/lib/admin/promise-desk";

/**
 * Promises the lot is waiting on.
 *
 * DESIGN.md's rules for an operate screen apply: one job, zero explanatory
 * prose, under sixty visible words. So there is no paragraph here about how
 * promises work — the rows say who, how much, and when, and the customer's
 * own words sit under each one because that sentence is the evidence and the
 * thing a person reads before picking up the phone.
 */

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/** When it comes due, in the words somebody would use out loud. */
function when(row: PromiseRow): string {
  if (row.overdue) return "Broke";
  if (row.daysUntil < 0) return "Grace";
  if (row.daysUntil === 0) return "Today";
  if (row.daysUntil === 1) return "Tomorrow";
  return new Date(`${row.promisedFor}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function PromiseList({ rows }: { rows: PromiseRow[] }) {
  if (rows.length === 0) {
    // Four words. Not a tour of what a promise is.
    return <p className="ed-times-empty">No promises outstanding.</p>;
  }

  return (
    <ol className="ed-promise-list">
      {rows.map((row) => (
        <li key={row.id} className="ed-promise-row" data-overdue={row.overdue ? "true" : undefined}>
          <span className="ed-promise-main">
            <span className="ed-promise-who">{row.customerName}</span>
            {/*
              Their sentence, exactly as they sent it. Never tidied, because a
              tidied quote is our words wearing theirs.

              `data-user-content` is the marker scripts/measure-screens.mjs
              uses to tell the screen's own words from real data. It was added
              when seven customer enquiries on the leads screen measured as
              eighty-seven words of explanatory prose — a number that argues
              for deleting the enquiries. These quotes are the same thing: what
              a customer typed, not copy anybody wrote.
            */}
            <span className="ed-promise-quote" data-user-content>
              &ldquo;{row.quote}&rdquo;
            </span>
            <span className="ed-promise-meta">
              {money(row.amountCents)}
              {row.byAi ? " · caught by text" : " · taken at the desk"}
            </span>
          </span>
          <span className="ed-promise-when" data-overdue={row.overdue ? "true" : undefined}>
            {when(row)}
          </span>
        </li>
      ))}
    </ol>
  );
}
