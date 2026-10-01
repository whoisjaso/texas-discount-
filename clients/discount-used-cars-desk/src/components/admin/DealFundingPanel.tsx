"use client";

import { useMemo, useState, useTransition, useId } from "react";
import { ArrowSquareOut, MagnifyingGlass } from "@phosphor-icons/react";
import { saveDealFunding } from "@/lib/actions/sale-funding";
import {
  DEAL_TYPES,
  type DealFunding,
  type DealType,
} from "@/lib/sales/deal-type";
import {
  findLender,
  lenderTag,
  searchLenders,
  type Lender,
} from "@/lib/sales/lenders";

/**
 * How is this being paid for.
 *
 * One question, three answers, asked once. It sits above the packet because it
 * decides what the packet is: pick Cash and the financing contract stops being
 * an "Optional" row someone has to interpret, and disappears.
 *
 * The lender list only appears under Outside Lender. Showing a search box for
 * finance companies on a cash sale is the kind of always-there control that
 * makes a screen feel like a form to be worked through rather than a question
 * to be answered.
 */

export default function DealFundingPanel({
  dealId,
  funding,
  lenders,
  disabled,
}: {
  dealId: string;
  funding: DealFunding;
  lenders: Lender[];
  disabled?: boolean;
}) {
  const [type, setType] = useState<DealType | null>(funding.type);
  const [lenderId, setLenderId] = useState<string | null>(funding.lenderId);
  const [lenderOther, setLenderOther] = useState(funding.lenderOther ?? "");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const searchId = useId();
  const otherId = useId();

  const results = useMemo(
    () => searchLenders(lenders, query),
    [lenders, query],
  );
  const chosen = findLender(lenders, lenderId);

  function submit() {
    setError(null);
    const data = new FormData();
    if (type) data.set("dealType", type);
    if (lenderId) data.set("lenderId", lenderId);
    if (lenderOther.trim()) data.set("lenderOther", lenderOther.trim());

    startTransition(async () => {
      const result = await saveDealFunding(dealId, data);
      if (result.ok) {
        setSaved(true);
        return;
      }
      setError(result.error ?? "Could not save that.");
    });
  }

  const dirty =
    type !== funding.type ||
    lenderId !== funding.lenderId ||
    lenderOther.trim() !== (funding.lenderOther ?? "");

  return (
    <section aria-label="How this is paid for" className="mt-10">
      <h2 className="ed-admin-label">How is this paid for</h2>

      <div className="ed-admin-panel mt-4 p-6 md:p-7">
        <div className="ed-fund-choices" role="group" aria-label="Payment type">
          {DEAL_TYPES.map((entry) => {
            const active = type === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                className="ed-fund-choice"
                data-active={active ? "true" : undefined}
                aria-pressed={active}
                disabled={disabled || pending}
                onClick={() => {
                  setType(entry.value);
                  setSaved(false);
                  if (entry.value !== "lender") {
                    setLenderId(null);
                    setLenderOther("");
                  }
                }}
              >
                <span className="ed-fund-choice-label">{entry.label}</span>
                {entry.gloss ? (
                  <span className="ed-fund-choice-gloss">{entry.gloss}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {type === "lender" ? (
          <div className="ed-fund-lenders">
            {chosen ? (
              <div className="ed-fund-chosen">
                <div className="min-w-0">
                  <p className="ed-fund-chosen-name">{chosen.name}</p>
                  {chosen.gloss ? (
                    <p className="ed-fund-chosen-gloss">{chosen.gloss}</p>
                  ) : null}
                </div>
                {chosen.portal ? (
                  <a
                    className="ed-btn ed-btn-outline"
                    href={chosen.portal}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open portal
                    <ArrowSquareOut size={15} aria-hidden="true" />
                  </a>
                ) : (
                  <span className="ed-fine text-[color:var(--tj-muted)]">
                    Add the portal link in settings
                  </span>
                )}
                <button
                  type="button"
                  className="ed-fine ed-fund-change"
                  onClick={() => {
                    setLenderId(null);
                    setSaved(false);
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <label className="ed-fine" htmlFor={searchId}>
                  Which lender
                </label>
                <div className="ed-fund-search">
                  <MagnifyingGlass size={16} aria-hidden="true" />
                  <input
                    id={searchId}
                    name="lenderSearch"
                    type="search"
                    className="ed-input"
                    placeholder="Search lenders"
                    autoComplete="off"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    disabled={disabled || pending}
                  />
                </div>

                {/* A scroll box that clips at a row edge reads as a complete
                    list, and someone looking for a lender that is three rows
                    down concludes it is not carried. The count is the cheapest
                    honest signal, and it doubles as confirmation that a search
                    matched something. */}
                <p className="ed-fund-count">
                  {query.trim().length > 0
                    ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
                    : `${results.length} lenders`}
                </p>

                <ul className="ed-fund-results">
                  {results.map((lender) => (
                    <li key={lender.id}>
                      <button
                        type="button"
                        className="ed-fund-result"
                        disabled={disabled || pending}
                        onClick={() => {
                          setLenderId(lender.id);
                          setLenderOther("");
                          setSaved(false);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="ed-fund-result-name">
                            {lender.name}
                          </span>
                          <span className="ed-fund-result-gloss">
                            {lender.gloss}
                          </span>
                        </span>
                        {lenderTag(lender.kind) ? (
                          <span className="ed-doc-tag">
                            {lenderTag(lender.kind)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>

                {results.length === 0 ? (
                  <p className="ed-fine mt-3 text-[color:var(--tj-muted)]">
                    No lender by that name in the list.
                  </p>
                ) : null}

                <label className="ed-fine mt-4 block" htmlFor={otherId}>
                  Or type a lender that is not listed
                </label>
                <input
                  id={otherId}
                  name="lenderOther"
                  type="text"
                  className="ed-input mt-1"
                  value={lenderOther}
                  onChange={(event) => {
                    setLenderOther(event.target.value);
                    setSaved(false);
                  }}
                  disabled={disabled || pending}
                />
              </>
            )}
          </div>
        ) : null}

        {error ? (
          <p className="ed-fine mt-4 text-[color:var(--tj-danger,#8c2f1f)]" role="alert">
            {error}
          </p>
        ) : null}

        {type && dirty ? (
          <button
            type="button"
            className="ed-btn ed-btn-dark mt-5"
            onClick={submit}
            disabled={disabled || pending}
          >
            {pending ? "Saving" : "Save"}
          </button>
        ) : null}

        {saved && !dirty ? (
          <p className="ed-fine mt-4 text-[color:var(--tj-muted)]">Saved.</p>
        ) : null}
      </div>
    </section>
  );
}
