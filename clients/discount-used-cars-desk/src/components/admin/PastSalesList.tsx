"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import {
  orderPastSales,
  searchPastSales,
  type PastSale,
  type PastSaleOrder,
} from "@/lib/admin/past-sales";

/**
 * Every sale that is over, searched and sorted in the browser.
 *
 * The whole list is already here, so both are instant: a letter typed shows
 * its matches on the same frame rather than after a round trip. That is what
 * somebody expects from a box with a magnifying glass in it, and a search that
 * lags behind the typing gets abandoned mid-word.
 *
 * The list is keyed on the query and the order together, which looks like a
 * detail and is the whole animation. Changing either remounts the rows, so
 * they play their entrance again and a filter reads as the list rearranging
 * itself rather than as text being swapped underneath the cursor.
 *
 * It holds up to five hundred sales, which is a decade of trading for a lot
 * this size. Past that the fix is paging, and `getPastSales` says so at the
 * cap rather than here.
 */

const ORDERS: Array<{ value: PastSaleOrder; label: string }> = [
  { value: "recent", label: "Newest" },
  { value: "customer", label: "Customer" },
  { value: "vehicle", label: "Vehicle" },
];

/**
 * How many rows get a staggered entrance.
 *
 * A stagger is what makes a list feel like it arrived rather than appeared,
 * and past a dozen it stops reading as rhythm and starts reading as waiting.
 * Row thirteen onward comes in with row twelve.
 */
const STAGGER_ROWS = 12;
const STAGGER_MS = 26;

export default function PastSalesList({ sales }: { sales: PastSale[] }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<PastSaleOrder>("recent");

  const shown = useMemo(
    () => orderPastSales(searchPastSales(sales, query), order),
    [sales, query, order],
  );

  return (
    <div className="ed-past">
      <div className="ed-past-controls">
        <label className="ed-past-search">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <span className="sr-only">Search past sales</span>
          <input
            className="ed-past-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, car, or plate"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            type="search"
          />
        </label>

        {/* One object with three segments, not three loose pills. The lit
            segment slides, so switching reads as one control changing state
            rather than as two buttons blinking. */}
        <div
          className="ed-past-orders"
          role="group"
          aria-label="Sort by"
          data-lit={order}
        >
          <span className="ed-past-lit" aria-hidden="true" />
          {ORDERS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className="ed-past-order"
              aria-pressed={order === entry.value}
              onClick={() => setOrder(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="ed-past-empty">
          {sales.length === 0
            ? "No finished sales yet."
            : "Nothing matches that."}
        </p>
      ) : (
        <ul
          className="ed-past-list"
          // Remounted when either changes, which is what replays the entrance.
          key={`${order}:${query}`}
        >
          {shown.map((sale, index) => (
            <li
              key={sale.id}
              className="ed-past-row"
              style={{ animationDelay: `${Math.min(index, STAGGER_ROWS) * STAGGER_MS}ms` }}
            >
              {/* The packet when a deal was run; the car's record when it was
                  not. Most sales on this lot predate the deal flow, and a row
                  that linked to a packet that does not exist would be a door
                  onto nothing. */}
              {sale.href ? (
                <Link className="ed-past-link" href={sale.href}>{row(sale)}</Link>
              ) : (
                <div className="ed-past-link">{row(sale)}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The date a person would say, not an ISO string. */
function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function row(sale: PastSale) {
  return (
    <>
                <span className="ed-past-main">
                  <span className="ed-past-who">{sale.customer}</span>
                  <span className="ed-past-what">
                    {sale.vehicle}
                    {sale.plate ? ` · ${sale.plate}` : ""}
                  </span>
                </span>

                <span className="ed-past-meta">
                  {/* Nothing rather than a date the record does not hold.
                      `updated_at` is when somebody last touched the row, and
                      printing it as the day the car sold would be a wrong
                      answer given confidently. */}
                  {sale.closedAt ? (
                    <span className="ed-past-when">{when(sale.closedAt)}</span>
                  ) : null}
                  {/* Only when it is known. An invented attribution is worse
                      than a quiet gap, and on a lot with a brother at the desk
                      this line is the whole reason the screen exists. */}
                  {sale.handledBy ? (
                    <span className="ed-past-by">{sale.handledBy}</span>
                  ) : null}
                </span>

                {sale.href ? <ArrowRight size={17} aria-hidden="true" className="ed-past-go" /> : null}
</>
  );
}
