"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveDealFunding } from "@/lib/actions/sale-funding";
import { DEAL_TYPES, type DealType } from "@/lib/sales/deal-type";
import { tapHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";

/**
 * How are they paying.
 *
 * Three buttons and nothing else. The earlier version put this question at the
 * top of the sale and unfolded a lender search underneath when you chose Bank
 * Financing, which meant the answer to one question grew a second question in
 * place and the screen stopped being a question at all.
 *
 * Choosing saves and moves on. There is no Save button because there is
 * nothing else on the screen to save alongside it, and a confirm step after a
 * three-way choice is a click that buys nothing. Changing the answer later is
 * a matter of walking back to this step, which the flow allows.
 *
 * The arrangement is deliberate and is not a grid that happened to wrap. Cash
 * and Buy Here Pay Here sit side by side because they are the two the lot
 * closes itself; Bank Financing sits centred beneath them because it is the
 * one that hands the deal to somebody else.
 */

export default function FundingStep({
  dealId,
  current,
  nextHref,
  onNavigate,
}: {
  dealId: string;
  current: DealType | null;
  nextHref: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { t } = useFunnel();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState<DealType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The three answers, in the operator's language. Values stay the stored
  // enum; only what a person reads changes. "Buy Here Pay Here" is the
  // trade's phrase and is kept in English in both languages, with the
  // Spanish gloss underneath doing the explaining.
  const wording: Record<DealType, { label: string; gloss?: string }> = {
    cash: { label: t.funding.cash },
    inHouse: { label: t.funding.bhph, gloss: t.funding.bhphGloss },
    lender: { label: t.funding.bank },
  };

  function choose(type: DealType) {
    // Confirms the tap on a phone before the page has moved. tapHaptic is
    // already gated on the admin opt-in, so this stays silent for anyone who
    // has not asked for it.
    tapHaptic();
    setError(null);
    setChoosing(type);

    const data = new FormData();
    data.set("dealType", type);

    startTransition(async () => {
      const result = await saveDealFunding(dealId, data);
      if (!result.ok) {
        setError(result.error ?? t.chrome.couldNotSave);
        setChoosing(null);
        return;
      }
      /*
        A bank deal goes to the lender question, by name.

        `nextHref` was computed on the server before this answer existed, from
        a step list that had no lender step in it, so following it skipped the
        question entirely. The step also used to be marked answered by a
        placeholder written here, so nothing ever came back to it: the flow
        auditor found lender deals reaching the packet with no lender on
        record. The placeholder is gone and the destination is named.
      */
      onNavigate();
      router.push(
        type === "lender"
          ? `/admin/sales/${encodeURIComponent(dealId)}/guide/lender`
          : nextHref,
      );
    });
  }

  const cash = DEAL_TYPES[0];
  const inHouse = DEAL_TYPES[1];
  const bank = DEAL_TYPES[2];

  const button = (entry: (typeof DEAL_TYPES)[number]) => {
    const active = current === entry.value;
    const busy = pending && choosing === entry.value;
    const words = wording[entry.value];
    return (
      <button
        type="button"
        className="ed-pay-choice"
        data-active={active ? "true" : undefined}
        aria-pressed={active}
        disabled={pending}
        onClick={() => choose(entry.value)}
      >
        <span className="ed-pay-choice-label">{words.label}</span>
        {busy || words.gloss ? (
          <span className="ed-pay-choice-gloss">
            {busy ? t.chrome.saving : words.gloss}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="ed-pay" data-tj-stagger>
      <div className="ed-pay-row" data-tj-stagger>
        {button(cash)}
        {button(inHouse)}
      </div>
      <div className="ed-pay-row ed-pay-row-single" data-tj-stagger>
        {button(bank)}
      </div>

      {error ? (
        <p
          className="ed-fine mt-6 text-center text-[color:var(--tj-danger,#8c2f1f)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
