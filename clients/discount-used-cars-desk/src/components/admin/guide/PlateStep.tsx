"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveSalePlate, saveSalePlateLater } from "@/lib/actions/sale-funding";
import { tapHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";

/**
 * The plate, asked the moment we know we are filing.
 *
 * One box and one Next, and a second way out for the honest case: the
 * plate is not here yet. Typing it here means it prints on the bill of sale
 * and the 130-U and is waiting on the webDEALER screen at the end, typed
 * once. Saying "not yet" answers the question without inventing a plate; the
 * handoff screen still takes the one webDEALER issues.
 *
 * Uppercased as typed, because a plate is uppercase on the metal and on the
 * state form, and a lowercase one on a document reads as a typo.
 */
export default function PlateStep({
  dealId,
  current,
  nextHref,
  onNavigate,
}: {
  dealId: string;
  /** The plate already on the deal, when there is one. */
  current: string | null;
  nextHref: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { t } = useFunnel();
  const [typed, setTyped] = useState(current ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);

  const plate = typed.trim().toUpperCase();

  async function finish(save: () => Promise<{ ok: boolean; error?: string }>) {
    if (locked.current) return;
    locked.current = true;
    setError(null);
    setPending(true);
    tapHaptic();
    const result = await save();
    if (!result.ok) {
      setPending(false);
      locked.current = false;
      setError(result.error ?? t.chrome.couldNotSave);
      return;
    }
    onNavigate();
    router.push(nextHref);
  }

  return (
    <div className="ed-money" data-tj-stagger>
      <label className="ed-money-field">
        <span className="sr-only">{t.plate.srLabel}</span>
        <input
          className="ed-input ed-money-input ed-plate-input"
          value={typed}
          onChange={(event) => setTyped(event.target.value.toUpperCase())}
          placeholder={t.plate.placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          autoFocus
        />
      </label>

      <p className="ed-money-note">{t.plate.help}</p>

      <button
        type="button"
        className="ed-btn ed-btn-dark ed-money-next"
        disabled={pending || plate.length === 0}
        onClick={() => {
          const data = new FormData();
          data.set("plate", plate);
          void finish(() => saveSalePlate(dealId, data));
        }}
      >
        {pending ? t.chrome.saving : t.chrome.next}
      </button>

      <button
        type="button"
        className="ed-btn ed-btn-outline ed-plate-later"
        disabled={pending}
        onClick={() => void finish(() => saveSalePlateLater(dealId))}
      >
        {t.plate.notYet}
      </button>

      {error ? (
        <p className="ed-money-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
