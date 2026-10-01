"use client";

import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react";
import FunnelLanguageToggle from "@/components/admin/funnel/FunnelLanguageToggle";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate, funnelDollars } from "@/lib/sales/i18n";
import {
  buildSaleSummary,
  nextOpenSummaryRow,
  summaryProgress,
  type SummaryFacts,
  type SummaryValue,
} from "@/lib/sales/sale-summary";

/**
 * The whole sale on one page, for the dealer who does this ten times a day.
 *
 * The corridor is the default and stays the default. This is the accelerator
 * beside it, and NN/g's rule for an accelerator is the one that shaped the
 * screen: readily available, easy to ignore, and never something you have to
 * find in order to work. So nothing sends anybody here; the corridor offers
 * it, the deal page offers it, and a dealer who never taps it loses nothing.
 *
 * Every line is a link into the question that owns the answer, and that
 * question sends the reader back here rather than onward, which is the half
 * of the Check Answers pattern that makes it a fast lane instead of a nicer
 * dead end. The whole row is the target, not the value at the end of it:
 * GOV.UK's own 2023 iteration found people aiming at the status rather than
 * the link, and widened the hit area rather than teaching them to aim.
 *
 * Nothing here writes. Changing an answer goes back through the screen that
 * owns it, so the validation, the derivation and the branching are the
 * corridor's, exactly once.
 */

export default function SummaryScreen({
  facts,
  saleHref,
  guideHref,
}: {
  facts: SummaryFacts;
  saleHref: string;
  guideHref: string;
}) {
  const { t, lang } = useFunnel();
  const s = t.summary;

  const groups = buildSaleSummary(facts);
  const progress = summaryProgress(groups);
  const open = nextOpenSummaryRow(groups);
  const remaining = progress.total - progress.done;

  /** A described value turned into words, in the reader's own language. */
  const say = (value: SummaryValue): string => {
    switch (value.kind) {
      case "none":
        return s.notAnswered;
      case "text":
        return value.text;
      case "date":
        return new Date(`${value.date}T12:00:00`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      case "money":
        return funnelDollars(value.amount, lang);
      case "word":
        return s.words[value.word];
      case "document":
        return s.documentStates[value.state];
    }
  };

  /**
   * A row's statement.
   *
   * Document rows name the document itself, so they read from the same
   * catalogue entry the corridor and the packet use rather than repeating
   * six titles in a third place.
   */
  const label = (labelKey: string): string => {
    if (labelKey.startsWith("document:")) {
      const type = labelKey.slice("document:".length);
      return (t.documents as Record<string, string>)[type] ?? type;
    }
    return (s.rows as Record<string, string>)[labelKey] ?? labelKey;
  };

  return (
    <div className="ed-guide ed-sum">
      <header className="ed-guide-head">
        <Link className="ed-guide-exit" href={saleHref}>
          {t.chrome.leave}
        </Link>
        <p className="ed-sum-count" role="status">
          {fillTemplate(t.chrome.countOf, {
            current: progress.done,
            total: progress.total,
          })}
        </p>
        <FunnelLanguageToggle />
      </header>

      <main className="ed-guide-body ed-sum-body">
        <p className="ed-guide-car">{facts.vehicleLabel ?? ""}</p>
        <h1 className="ed-guide-question ed-sum-title">{s.title}</h1>
        <p className="ed-sum-lead">{s.lead}</p>

        {groups.map((group) => (
          <section key={group.id} className="ed-sum-group">
            <h2 className="ed-sum-group-title">
              {(s.groups as Record<string, string>)[group.titleKey] ?? group.titleKey}
            </h2>
            <ul className="ed-sum-rows">
              {group.rows.map((row) => {
                const body = (
                  <>
                    <span className="ed-sum-label">{label(row.labelKey)}</span>
                    <span
                      className="ed-sum-value"
                      data-empty={row.value.kind === "none" ? "true" : undefined}
                    >
                      {say(row.value)}
                    </span>
                    {row.href ? (
                      <span className="ed-sum-action" aria-hidden="true">
                        {row.done ? <Check size={15} weight="bold" /> : <ArrowRight size={15} />}
                      </span>
                    ) : (
                      <span className="ed-sum-action" aria-hidden="true" />
                    )}
                  </>
                );

                return (
                  <li key={row.key} className="ed-sum-row" data-done={row.done ? "true" : undefined}>
                    {row.href ? (
                      /* The whole row is the target. A link that is only the
                         value at the end of the line is a link people miss. */
                      <Link className="ed-sum-link" href={row.href}>
                        {body}
                        <span className="sr-only">{t.chrome.change}</span>
                      </Link>
                    ) : (
                      <div className="ed-sum-static">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <div className="ed-sum-foot">
          {open ? (
            <>
              {/* Two sentences rather than one with a number in it. Spanish
                  agrees its verb with the count ("falta una" against "faltan
                  tres"), so a single template would be wrong half the time
                  in the language this corridor exists to serve. */}
              <p className="ed-sum-remaining">
                {remaining === 1
                  ? s.stillOpenOne
                  : fillTemplate(s.stillOpen, { count: remaining })}
              </p>
              {/* One button that always goes to the next thing waiting. Once
                  nothing is waiting it stops being a continue button, which
                  is the hub and spoke rule rather than a flourish. */}
              <Link className="ed-btn ed-btn-dark ed-sum-go" href={open.href!}>
                {s.goTo}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              <p className="ed-sum-remaining">{s.allAnswered}</p>
              <Link className="ed-btn ed-btn-dark ed-sum-go" href={saleHref}>
                {t.chrome.finish}
              </Link>
            </>
          )}

          {/* The guided lane, always reachable from inside the fast one. */}
          <Link className="ed-sum-guided" href={guideHref}>
            {s.openGuide}
          </Link>
        </div>
      </main>
    </div>
  );
}
