"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyCurrentFeesToSaleAction } from "@/lib/actions/dealer-fees";
import { tapHaptic } from "@/lib/haptics";

/**
 * "Apply Today's Fees" on one open sale (dealer-fees.ts): offered when the
 * sale's own copy of its fees is over today's Texas limit or older than the
 * owner's latest save. The sale keeps the fees it started with until someone
 * presses this; a filed bill of sale refuses it (void it first).
 */
export default function ApplyTodaysFees({
  dealId,
  message,
}: {
  dealId: string;
  message: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply() {
    tapHaptic();
    setError(null);
    startTransition(async () => {
      const result = await applyCurrentFeesToSaleAction(dealId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="ed-admin-panel mt-6 px-5 py-5" data-apply-fees="">
      <p className="ed-fine">{message}</p>
      <button
        type="button"
        className="tj-action-base tj-action-primary tj-action-md mt-4"
        disabled={pending}
        onClick={apply}
      >
        {pending ? "Saving" : "Apply Today's Fees"}
      </button>
      {error ? (
        <p role="alert" className="ed-fine mt-3 text-[color:var(--tj-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
