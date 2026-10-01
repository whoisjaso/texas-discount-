"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, useId } from "react";
import { ArrowSquareOut, MagnifyingGlass } from "@phosphor-icons/react";
import { saveDealFunding } from "@/lib/actions/sale-funding";
import { lenderTag, searchLenders, type Lender } from "@/lib/sales/lenders";
import { tapHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";

/**
 * Which lender.
 *
 * Its own screen, because it is its own question. It used to unfold underneath
 * the payment choice, which put a forty-two row list on the same screen as a
 * three-way decision.
 *
 * Choosing saves and moves on, like the step before it. The portal opens in a
 * new tab from here rather than replacing this screen, because the operator is
 * about to come back and carry on: the deal is not finished when the
 * application is submitted.
 */

export default function LenderStep({
  dealId,
  lenders,
  currentLenderId,
  nextHref,
  onNavigate,
}: {
  dealId: string;
  lenders: Lender[];
  currentLenderId: string | null;
  nextHref: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { t } = useFunnel();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const searchId = useId();

  const results = useMemo(() => searchLenders(lenders, query), [lenders, query]);

  function save(fields: Record<string, string>) {
    tapHaptic();
    setError(null);
    const data = new FormData();
    data.set("dealType", "lender");
    for (const [key, value] of Object.entries(fields)) data.set(key, value);

    startTransition(async () => {
      const result = await saveDealFunding(dealId, data);
      if (!result.ok) {
        setError(result.error ?? t.chrome.couldNotSave);
        return;
      }
      onNavigate();
      router.push(nextHref);
    });
  }

  function choose(lender: Lender) {
    save({ lenderId: lender.id });
  }

  return (
    <div className="ed-lender-step">
      <label className="sr-only" htmlFor={searchId}>
        {t.lender.searchLabel}
      </label>
      <div className="ed-fund-search">
        <MagnifyingGlass size={18} aria-hidden="true" />
        <input
          id={searchId}
          name="lenderSearch"
          type="search"
          className="ed-input"
          placeholder={t.lender.searchPlaceholder}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={pending}
        />
      </div>

      <p className="ed-fund-count">
        {query.trim().length > 0
          ? results.length === 1
            ? t.lender.matchOne
            : fillTemplate(t.lender.matches, { count: results.length })
          : fillTemplate(t.lender.lendersCount, { count: results.length })}
      </p>

      <ul className="ed-lender-list" data-tj-stagger>
        {results.map((lender) => {
          const tag = lenderTag(lender.kind);
          return (
            <li key={lender.id}>
              <div
                className="ed-lender-row"
                data-active={lender.id === currentLenderId ? "true" : undefined}
              >
                <button
                  type="button"
                  className="ed-lender-pick"
                  disabled={pending}
                  onClick={() => choose(lender)}
                >
                  <span className="ed-lender-name">{lender.name}</span>
                  <span className="ed-lender-gloss">{lender.gloss}</span>
                </button>

                {tag ? <span className="ed-doc-tag">{tag}</span> : null}

                {/* Opening the portal is not choosing the lender, so it is a
                    separate control. Merging them would mean a stray click on
                    a row name silently set the funding source. */}
                {lender.portal ? (
                  <a
                    className="ed-lender-portal"
                    href={lender.portal}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={fillTemplate(t.lender.openPortal, { name: lender.name })}
                  >
                    <ArrowSquareOut size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <span className="ed-lender-noportal">{t.lender.noPortal}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        The way out for a lender the list does not carry.

        This screen used to end at "No lender by that name." with nothing but
        Back, and the owner persona hit it exactly the way a real day would: a
        buyer standing at the desk with an approved credit-union check, the
        credit union not in the directory, and the deal unable to record who
        is paying. The typed name becomes the answer.
      */}
      {query.trim().length > 0 ? (
        <button
          type="button"
          className="ed-lender-use-typed"
          disabled={pending}
          onClick={() => save({ lenderOther: query.trim() })}
        >
          {fillTemplate(
            results.length === 0 ? t.lender.useTypedNone : t.lender.useTypedSome,
            { name: query.trim() },
          )}
        </button>
      ) : null}

      {error ? (
        <p className="ed-fine mt-4 text-[color:var(--tj-danger,#8c2f1f)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
