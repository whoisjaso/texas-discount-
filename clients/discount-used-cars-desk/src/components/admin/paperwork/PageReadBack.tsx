"use client";

import Link from "next/link";
import type { ReadBackPage, ReadBackRow } from "@/lib/documents/field-maps/resolve";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";

/**
 * The page, read back before it is filed.
 *
 * Every box the document prints on this sale, page by page, with the value
 * it will print and where that value came from: the car, the licence, Start
 * Sale, the dealership, the fees, an answer given here (with Change), or
 * worked out. A box the sale should fill and does not is red, with the place
 * it is fixed, and the filing refuses it; a box left for a pen or for the tax
 * office says so. Boxes that are not on this sale (no co-buyer, no lien) are
 * not listed. The person filing sees the paper, not a list of answers.
 *
 * The box labels and values quote the paper, which prints in English; the
 * desk's own words (Still To Do, an ID's kind, "Yes") and every heading and
 * chip follow the screen's language.
 */
export default function PageReadBack({ pages }: { pages: ReadBackPage[] }) {
  const { t } = useFunnel();
  const words = t.review.page;
  if (pages.length === 0) return null;
  const printedPages = pages.filter((page) => !page.carriedFor);
  const titles = (words.titles ?? {}) as Record<string, string>;
  const documents = (words.documents ?? {}) as Record<string, string>;
  const values = (words.values ?? {}) as Record<string, string>;
  const idKinds = (t.start?.idKinds ?? {}) as Record<string, string>;

  function shown(row: ReadBackRow): string {
    if (!row.valueKeys || row.valueKeys.length === 0) return row.value;
    const parts = row.valueKeys.map((key) =>
      key.startsWith("idKind.") ? idKinds[key.slice("idKind.".length)] ?? "" : values[key] ?? "",
    );
    return parts.every(Boolean) ? parts.join(" · ") : row.value;
  }

  return (
    <div className="ed-readback" data-page-readback="">
      <p className="ed-fine ed-readback-what">{words.what}</p>
      {words.quotesEnglish ? <p className="ed-fine ed-readback-what">{words.quotesEnglish}</p> : null}
      {pages.map((page) => {
        const index = printedPages.indexOf(page);
        const heading = page.carriedFor
          ? fillTemplate(words.carriedHeading, { document: documents[page.carriedFor] ?? page.title })
          : fillTemplate(words.heading, { n: index + 1, total: printedPages.length });
        return (
          <section
            key={page.carriedFor ? `carried-${page.carriedFor}` : page.page}
            className="ed-readback-page"
            aria-label={page.title}
            data-carried-for={page.carriedFor}
          >
            <h2 className="ed-readback-heading">
              <span>{heading}</span>
              {page.carriedFor ? null : <span className="ed-readback-title">{titles[page.title] ?? page.title}</span>}
            </h2>
            <dl className="ed-paper-summary">
              {page.rows.map((row) => {
                const chip =
                  row.status === "ink" || row.status === "office" || row.status === "marker" || row.status === "blankAllowed"
                    ? words.statuses[row.status]
                    : (words.sources as Record<string, string>)[row.source] ?? "";
                return (
                  <div key={row.id} className="ed-paper-line ed-readback-row" data-status={row.status} data-row={row.id}>
                    <dt className="ed-fine">{row.label}</dt>
                    <dd>
                      {row.status === "missing" ? (
                        <span className="ed-readback-missing">{words.missing}</span>
                      ) : (
                        shown(row) || <span className="ed-readback-blank">{words.blank}</span>
                      )}
                      <span className="ed-readback-chip" data-chip={row.source}>{chip}</span>
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
        );
      })}
    </div>
  );
}
