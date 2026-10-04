"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { saveSalvagePath } from "@/lib/actions/salvage-plan";
import { SALVAGE_PATHS, type SalvagePath } from "@/lib/sales/salvage-plan";
import { tapHaptic } from "@/lib/haptics";

/**
 * The salvage question, three cards, answered on press.
 *
 * Same interaction as the prescreen: tapping the answer is the submit, the
 * press paints synchronously, the save leaves at once, and the move happens
 * when the write lands. Where it goes next is the guide's own front door,
 * because the answer changes which steps exist (the tow-away path has no
 * prescreen at all) and only the server knows the list after the write.
 *
 * "Not sure yet" is a real card, not a skip: it saves, the badge on the
 * sale says the path is undecided, and the documents wait. The corridor
 * keeps this step open, so the question is asked again next time in.
 */

export default function SalvagePathStep({
  dealId,
  current,
  words,
  guideHref,
  returnHref = null,
  savingLabel,
  onNavigate,
}: {
  dealId: string;
  current: SalvagePath | null;
  /** The catalogue's `funnel.plan` slice, for the three labels and glosses. */
  words: Record<string, string>;
  guideHref: string;
  returnHref?: string | null;
  savingLabel: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<SalvagePath | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const key = (path: SalvagePath) =>
    path === "rebuild" ? "Rebuild" : path === "towAway" ? "TowAway" : "Undecided";

  function pick(path: SalvagePath) {
    if (locked.current) return;
    locked.current = true;
    setChosen(path);
    setError(null);
    setBusy(true);
    tapHaptic();
    void (async () => {
      const result = await saveSalvagePath(dealId, path);
      if (!alive.current) return;
      if (!result.ok) {
        setChosen(current);
        setError(result.error);
        setBusy(false);
        locked.current = false;
        return;
      }
      onNavigate();
      router.push(returnHref ?? guideHref);
    })();
  }

  return (
    <div data-tj-stagger>
      {words.salvagePathHelp ? <p className="ed-fine text-[color:var(--tj-muted)]">{words.salvagePathHelp}</p> : null}
      <div role="group" aria-busy={busy} className="ed-plan-choices ed-salvage-choices" data-tj-stagger>
        {SALVAGE_PATHS.map((path) => {
          const isChosen = chosen === path;
          return (
            <button
              key={path}
              type="button"
              aria-pressed={isChosen}
              disabled={busy}
              data-chosen={isChosen ? "true" : "false"}
              data-salvage-path={path}
              onClick={() => pick(path)}
              className="tj-choice tj-action-base tj-action-ghost ed-plan-choice"
            >
              {isChosen ? <Check size={14} weight="bold" aria-hidden="true" /> : null}
              <span>
                {words[`salvagePath${key(path)}`]}
                {words[`salvagePath${key(path)}Gloss`] ? (
                  <span className="ed-fine block text-[color:var(--tj-muted)]">
                    {words[`salvagePath${key(path)}Gloss`]}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? savingLabel : ""}
      </p>
      {error ? (
        <p role="alert" className="ed-start-error mt-6">
          {error}
        </p>
      ) : null}
    </div>
  );
}
