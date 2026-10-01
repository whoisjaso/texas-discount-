"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setDealLanguage } from "@/lib/actions/deal-language";
import type { DealLanguage } from "@/lib/sales/deal-language";
import { tapHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";

/**
 * What language the sale is conducted in — asked of deals that predate the
 * question at StartSale. Two buttons, same contract as the funding step:
 * answering saves and moves on. The answer drives which documents the packet
 * legally requires (FTC 455.5; Tex. Fin. Code §348.006), which is why the
 * documents gate on it rather than on a default nobody chose.
 */
export default function LanguageStep({
  dealId,
  nextHref,
  onNavigate,
}: {
  dealId: string;
  nextHref: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { t } = useFunnel();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState<DealLanguage | null>(null);
  const [error, setError] = useState<string | null>(null);

  function choose(language: DealLanguage) {
    tapHaptic();
    setError(null);
    setChoosing(language);
    startTransition(async () => {
      const result = await setDealLanguage(dealId, language);
      if (!result.ok) {
        setError(t.chrome.couldNotSave);
        setChoosing(null);
        return;
      }
      onNavigate();
      router.push(nextHref);
    });
  }

  const button = (language: DealLanguage, label: string) => (
    <button
      type="button"
      className="ed-pay-choice"
      disabled={pending}
      onClick={() => choose(language)}
    >
      <span className="ed-pay-choice-label">{label}</span>
      {pending && choosing === language ? (
        <span className="ed-pay-choice-gloss">{t.chrome.saving}</span>
      ) : null}
    </button>
  );

  return (
    <div className="ed-pay" data-tj-stagger>
      <div className="ed-pay-row" data-tj-stagger>
        {button("en", t.saleLanguage.english)}
        {button("es", t.saleLanguage.spanish)}
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
