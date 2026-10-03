"use client";

import { useMemo, useState } from "react";
import { US_STATES } from "@/lib/forms/us-states";
import { TEXAS_COUNTIES, BODY_STYLES } from "@/lib/forms/vehicle-catalog";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";

/**
 * A long list as taps: the states, the counties, the body styles.
 *
 * Typing two letters for a state invited "Tx", "tex" and "TX ", and the
 * answer was then dropped anyway. A list is a tap: the likely answer first
 * as a big card, a search box that narrows the rest, and every row a button.
 * A county the region list does not carry is still one tap away: the search
 * itself becomes the answer ("Use Lubbock").
 */

type Row = { value: string; label: string };

export function listRows(list: "usStates" | "texasCounties" | "bodyStyles"): Row[] {
  if (list === "usStates") {
    // Texas first: nearly every licence at this desk is a Texas one.
    const texas = US_STATES.find((state) => state.code === "TX");
    const rest = US_STATES.filter((state) => state.code !== "TX");
    return [texas, ...rest]
      .filter((state): state is NonNullable<typeof state> => Boolean(state))
      .map((state) => ({ value: state.code, label: `${state.name} (${state.code})` }));
  }
  if (list === "texasCounties") return TEXAS_COUNTIES.map((county) => ({ value: county, label: county }));
  return BODY_STYLES.map((style) => ({ value: style, label: style }));
}

export default function ListPickStep({
  list,
  current,
  pending,
  choosing,
  onPick,
}: {
  list: "usStates" | "texasCounties" | "bodyStyles";
  /** The likely answer: what the deal holds, or its starting value. */
  current: string;
  pending: boolean;
  choosing: string | null;
  onPick: (value: string) => void;
}) {
  const { t } = useFunnel();
  const [search, setSearch] = useState("");
  const rows = useMemo(() => listRows(list), [list]);
  const likely = rows.find((row) => row.value.toLowerCase() === current.trim().toLowerCase());
  const needle = search.trim().toLowerCase();
  const shown = rows
    .filter((row) => row.value !== likely?.value)
    .filter((row) => !needle || row.label.toLowerCase().includes(needle) || row.value.toLowerCase() === needle);
  // A county outside the region list: what was typed is the answer.
  const exact = rows.some((row) => row.value.toLowerCase() === needle || row.label.toLowerCase() === needle);
  const typedCounty = list === "texasCounties" && needle.length > 2 && !exact ? search.trim() : "";

  return (
    <div className="ed-list-pick">
      {likely ? (
        <button
          type="button"
          className="ed-pay-choice ed-list-likely"
          data-active="true"
          disabled={pending}
          onClick={() => onPick(likely.value)}
        >
          <span className="ed-pay-choice-label">{likely.label}</span>
          <span className="ed-pay-choice-gloss">{pending && choosing === likely.value ? t.chrome.saving : t.chrome.likelyAnswer}</span>
        </button>
      ) : null}
      <label className="ed-paper-field ed-list-search">
        <span className="sr-only">{t.chrome.search}</span>
        <input
          className="ed-input ed-paper-input"
          type="search"
          value={search}
          placeholder={t.chrome.search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={pending}
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <div className="ed-list-rows" role="list">
        {typedCounty ? (
          <button type="button" role="listitem" className="ed-list-row" disabled={pending} onClick={() => onPick(typedCounty)}>
            {t.chrome.useTyped.replace("{value}", typedCounty)}
          </button>
        ) : null}
        {shown.map((row) => (
          <button
            key={row.value}
            type="button"
            role="listitem"
            className="ed-list-row"
            disabled={pending}
            data-active={current === row.value ? "true" : undefined}
            onClick={() => onPick(row.value)}
          >
            {pending && choosing === row.value ? t.chrome.saving : row.label}
          </button>
        ))}
      </div>
    </div>
  );
}
