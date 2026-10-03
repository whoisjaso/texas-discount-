"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { Prohibit } from "@phosphor-icons/react";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate, type FunnelStrings } from "@/lib/sales/i18n";
import { localizeDocumentTitle } from "@/lib/sales/question-i18n";
import "@/styles/void-freeze.css";

/**
 * The filed bill of sale holds what it states (owner's decision 10/02/2026;
 * SOP Freeze), and the screens that edit those answers say so.
 *
 * The server decides: every writer refuses a change with code
 * `billOfSaleFrozen` and the field it would change, and a screen only shows
 * that refusal, in its own language, with the way out beside it: "Void The
 * Bill Of Sale" for an owner or a manager (it opens the void on the packet
 * and comes back to this screen), or who can, for everyone else. Controls
 * stay live; the same answer saved again goes through.
 */

export type FreezeContextValue = {
  dealId: string;
  /** The guide step this screen is, so the void can come back to it. */
  stepKey: string;
  /** Owner or Manager: can void the filed bill of sale. */
  canVoid: boolean;
  /** A current bill of sale is filed and states this screen's answer. */
  held: boolean;
};

const FreezeContext = createContext<FreezeContextValue | null>(null);

export function FreezeProvider({ value, children }: { value: FreezeContextValue | null; children: ReactNode }) {
  return <FreezeContext.Provider value={value}>{children}</FreezeContext.Provider>;
}

export function useFreeze(): FreezeContextValue | null {
  return useContext(FreezeContext);
}

/** A refusal the freeze returned, in the screen's language. */
export function frozenRefusalText(
  t: FunnelStrings,
  result: { field?: string | null; heldBy?: string | null },
): string {
  if (result.heldBy === "powerOfAttorney") return t.freeze.heldByPowerOfAttorney;
  const messages = t.freeze as Record<string, string>;
  return (result.field && messages[result.field]) || t.freeze.generic;
}

/**
 * A plan answer held by filed plan-derived documents (code `planFrozen`),
 * naming them in the screen's language.
 */
export function planFrozenText(
  t: FunnelStrings,
  result: { blockedBy?: readonly string[] | null; heldBy?: string | null },
): string {
  if (result.heldBy === "powerOfAttorney") return t.freeze.planHeldByPowerOfAttorney;
  const documents = (result.blockedBy ?? []).map((type) => localizeDocumentTitle(t, type, type)).join(", ");
  return fillTemplate(t.freeze.planHeld, { documents });
}

/**
 * A screen's freeze refusal: `text(result)` gives the refusal in the screen's
 * language when the server refused with `billOfSaleFrozen` or, for a plan
 * answer, `planFrozen` (and remembers it, so the way out shows), or null for
 * any other answer.
 */
export function useFreezeRefusal() {
  const { t } = useFunnel();
  const [heldBy, setHeldBy] = useState<string | null>(null);
  const text = useCallback(
    (result: {
      code?: string | null;
      field?: string | null;
      heldBy?: string | null;
      blockedBy?: readonly string[] | null;
    }): string | null => {
      if (result.code === "planFrozen") {
        setHeldBy(result.heldBy === "powerOfAttorney" ? "powerOfAttorney" : "billOfSale");
        return planFrozenText(t, result);
      }
      if (result.code !== "billOfSaleFrozen") {
        setHeldBy(null);
        return null;
      }
      setHeldBy(result.heldBy ?? "billOfSale");
      return frozenRefusalText(t, result);
    },
    [t],
  );
  return { heldBy, text, clear: () => setHeldBy(null) };
}

/** Where a void asked from this screen opens: the packet, with the dialog up. */
export function voidHref(dealId: string, stepKey: string): string {
  return `/admin/sales/${encodeURIComponent(dealId)}/packet?void=billOfSale&return=${encodeURIComponent(stepKey)}`;
}

/**
 * The way out of a refusal: the void link, or who can void it. Shown only
 * after a freeze refusal (`heldBy` set) or as part of the held note.
 */
export function FreezeWayOut({ heldBy = "billOfSale" }: { heldBy?: string | null }) {
  const { t } = useFunnel();
  const freeze = useFreeze();
  // A power of attorney is ink on the county's form: the desk cannot void it.
  if (!freeze || !heldBy || heldBy === "powerOfAttorney") return null;
  return freeze.canVoid ? (
    <p className="ed-freeze-way">
      <Link href={voidHref(freeze.dealId, freeze.stepKey)} className="ed-freeze-link">
        <Prohibit size={14} aria-hidden="true" />
        {t.freeze.voidLink}
      </Link>
    </p>
  ) : (
    <p className="ed-freeze-way ed-fine">{t.freeze.whoCan}</p>
  );
}

/** The quiet note on a screen whose answer the filed bill of sale states. */
export default function HeldByBillOfSale() {
  const { t } = useFunnel();
  const freeze = useFreeze();
  if (!freeze?.held) return null;
  return (
    <div className="ed-held-note" data-held-by-bill-of-sale>
      <p>{t.freeze.heldNote}</p>
      <FreezeWayOut />
    </div>
  );
}
