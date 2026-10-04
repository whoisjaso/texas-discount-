"use client";

import { useEffect, useState } from "react";
import { FAIR_COMPARISON_LIMIT_MS, readClock } from "@/lib/sales/elapsed";

/**
 * How long this sale has been running.
 *
 * ## Why it ticks
 *
 * A number rendered once on the server is stale the moment it arrives and
 * wrong by however long the page stayed open. On a desk left up all afternoon
 * that is the difference between "12m" and the truth. A clock that does not
 * move is not a clock.
 *
 * ## Why it renders nothing on the first paint
 *
 * The server does not know when the browser will read this, so it must not
 * guess: rendering a time on the server and a different one a tick later is a
 * hydration mismatch, and rendering the server's time and never correcting it
 * is a lie. So the first paint is a dash and the first effect fills it in.
 *
 * ## Why it is not on the question screens
 *
 * Deliberately absent from the guide. That corridor gives the whole viewport
 * to one question, and a counter ticking in the corner of a title-status or
 * mailing-address question is pressure applied at exactly the wrong moment —
 * those answers put a title in somebody's letterbox. The clock runs and is
 * recorded either way; it is shown where the work is reviewed, not where it
 * is being done.
 */
export default function SaleClock({
  startedAt,
  className,
}: {
  startedAt: string | null;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    // The first read is on the next frame rather than synchronously here: a
    // setState in an effect body cascades a second render before paint, and
    // the frame this costs is not visible while a whole page is arriving.
    const first = requestAnimationFrame(() => setNow(Date.now()));
    // Then once a second, because the display shows seconds below the hour.
    // A faster tick would repaint the same characters.
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelAnimationFrame(first);
      window.clearInterval(timer);
    };
  }, [startedAt]);

  // An untimed sale is not a fast sale, so it never renders a zero. Every
  // deal from before the clock existed lands here.
  if (!startedAt) return null;

  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;

  // Nothing until the first tick. Rendering an empty element would still draw
  // its divider, so the row would show a rule with no number beside it for one
  // frame. The effect above runs whether or not anything is returned here.
  if (now === null) return null;

  const ms = Math.max(0, now - started);
  // Past the fair-comparison line it is almost certainly a sale somebody left
  // open rather than one that took this long, and the tone says so instead of
  // the desk reading a large red-looking number as a performance.
  const stale = ms > FAIR_COMPARISON_LIMIT_MS;

  return (
    <span
      className={className}
      data-sale-clock
      data-stale={stale ? "true" : undefined}
      title={stale ? "Open long enough that it was probably left, not worked" : "Time on this sale"}
    >
      {readClock(ms)}
    </span>
  );
}
