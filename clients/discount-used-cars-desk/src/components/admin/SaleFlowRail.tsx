"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { List, X } from "@phosphor-icons/react";
import { useDeviceTier } from "@/hooks/useDeviceTier";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";

/**
 * The way out of the corridor, without putting a wall inside it.
 *
 * While a sale is being written there is nothing else to click, so the rail is
 * gone. But "gone" and "unreachable" are different things, and a flow you
 * cannot leave without finishing is a trap rather than a focus aid.
 *
 * So it comes back on a gesture: push the pointer at the left edge and it
 * slides out. A gesture rather than a visible target, because a strip of
 * permanent chrome down the side of a focused screen is the thing being
 * removed, and because somebody who wants to leave mid-sale already knows they
 * want to leave. Discovery is covered by the Leave link the flow shows anyway.
 *
 * Hover does not exist on a touch screen, so this renders only where a fine
 * pointer does. On a phone the flow's own Leave link is the way out, and it is
 * always visible.
 */

const DESTINATIONS = [
  { href: "/admin/sales", key: "sale" },
] as const;

/** How close to the edge counts as reaching for it. */
const EDGE_PX = 14;

export default function SaleFlowRail() {
  const { t } = useFunnel();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  /**
   * A hover gesture needs something that hovers.
   *
   * `useDeviceTier` already answers this for the whole product and does it
   * through useSyncExternalStore, which is what keeps a media query out of an
   * effect. Reading it with matchMedia here worked and tripped the
   * set-state-in-effect rule, which was right to complain.
   */
  const pointer = useDeviceTier() === "desktop";

  useEffect(() => {
    if (!pointer) return;

    function onMove(event: PointerEvent) {
      if (event.clientX <= EDGE_PX) {
        setOpen(true);
        return;
      }
      // Close once the pointer leaves the panel itself, not merely the edge,
      // or the rail would shut while somebody is reaching across it.
      const bounds = panel.current?.getBoundingClientRect();
      if (bounds && event.clientX > bounds.right + 24) setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [pointer]);

  if (!pointer) return null;

  return (
    <>
      {/* Keyboard and screen reader users get a real control, because a
          pointer gesture is not reachable by either. */}
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls="sale-flow-rail"
        className="ed-flowrail-toggle"
      >
        {open ? <X size={16} aria-hidden="true" /> : <List size={16} aria-hidden="true" />}
        <span className="sr-only">{open ? t.rail.closeMenu : t.rail.openMenu}</span>
      </button>

      <div
        id="sale-flow-rail"
        ref={panel}
        data-open={open ? "true" : "false"}
        className="ed-flowrail"
        aria-hidden={open ? undefined : true}
      >
        <nav aria-label={t.rail.leaveNav}>
          {DESTINATIONS.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href}
              tabIndex={open ? undefined : -1}
              className="ed-flowrail-link"
            >
              {t.rail[destination.key]}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
