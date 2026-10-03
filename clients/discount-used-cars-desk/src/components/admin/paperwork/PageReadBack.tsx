"use client";

import Link from "next/link";
import type { ReadBackPage } from "@/lib/documents/field-maps/resolve";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";

/**
 * The page, read back before it is filed.
 *
 * Every box the document prints, page by page, with the value it will
 * print and where that value came from: the car, the licence, the
 * dealership, the fees, an answer given here (with Change), or worked out.
 * A box the sale should fill and does not is red, with the place it is
 * fixed, and the filing refuses it; a box left for a pen or for the tax
 * office says so. The person filing sees the paper, not a list of answers.
 */
export default function PageReadBack({ pages }: { pages: ReadBackPage[] }) {
  const { t } = useFunnel();
  const words = t.review.page;
  if (pages.length === 0) return null;
  return (
    <div className="ed-readback" data-page-readback="">
      <p className="ed-fine ed-readback-what">{words.what}</p>
      {pages.map((page, index) => (
        <section key={page.page} className="ed-readback-page" aria-label={page.title}>
          <h2 className="ed-readback-heading">
            <span>{fillTemplate(words.heading, { n: index + 1, total: pages.length })}</span>
            <span className="ed-readback-title">{page.title}</span>
          </h2>
          <dl className="ed-paper-summary">
            {page.rows.map((row) => {
              const chip =
                row.status === "ink" || row.status === "office" || row.status === "marker" || row.status === "blankAllowed"
                  ? words.statuses[row.status]
                  : (words.sources as Record<string, string>)[row.source] ?? "";
              return (
                <div key={row.id} className="ed-paper-line ed-readback-row" data-status={row.status}>
                  <dt className="ed-fine">{row.label}</dt>
                  <dd>
                    {row.status === "missing" ? (
                      <span className="ed-readback-missing">{words.missing}</span>
                    ) : (
                      row.value || <span className="ed-readback-blank">{words.blank}</span>
                    )}
                    <span className="ed-readback-chip">{chip}</span>
                    {row.changeHref && (row.status === "missing" || row.status === "asked") ? (
                      <Link className="ed-weight-change" href={row.changeHref}>
                        {row.status === "missing" ? words.fixIt : words.change}
                      </Link>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
