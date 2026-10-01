"use client";

import Link from "next/link";
import { useState, useTransition, useId } from "react";
import { ArrowSquareOut, Copy, Check } from "@phosphor-icons/react";
import { saveSalePlate } from "@/lib/actions/sale-funding";
import { handoffClipboardText, type HandoffField } from "@/lib/sales/webdealer";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate, type FunnelStrings } from "@/lib/sales/i18n";
import "@/styles/webdealer-handoff.css";

/** The row's name in the reader's language; the clipboard keeps English. */
function fieldLabel(t: FunnelStrings, field: HandoffField): string {
  const words = t.handoff.fields as Record<string, string>;
  return words[field.key] ?? field.label;
}

function fixLabelFor(t: FunnelStrings, field: HandoffField): string {
  if (field.fixLabel === "Add on the sale") return t.handoff.addOnSale;
  if (field.fixLabel === "Name the lender") return t.handoff.nameTheLender;
  if (field.key === "emptyWeight") return t.handoff.addOn130U;
  return field.fixLabel ?? t.handoff.addIt;
}

/**
 * Filing the title, without retyping the deal.
 *
 * The handoff is deliberately dumb: it does not talk to webDEALER, because
 * writing into webDEALER means holding TxDMV's Web Service Access permission
 * as an approved vendor. What it removes is the part that actually goes wrong,
 * which is not the typing but the hunting: seven values that live on four
 * different screens, copied across two windows, with a VIN in the middle.
 *
 * A field the deal does not hold is shown as missing and links to the screen
 * that fills it. The alternative, a blank box, invites someone to fill it from
 * memory, and a title application is the wrong place to be remembering a
 * driver's licence number.
 */

function FieldRow({ field }: { field: HandoffField }) {
  const { t } = useFunnel();
  const [copied, setCopied] = useState(false);
  const named = fieldLabel(t, field);
  // "None" on the lienholder row is a value the builder writes, not a label;
  // it reads in the operator's language like everything else on the screen.
  const shown = field.value === "None" ? t.handoff.none : field.value;

  async function copy() {
    if (!field.value) return;
    try {
      await navigator.clipboard.writeText(field.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be refused (insecure context, denied permission). The
      // value is on screen and selectable either way, so this stays quiet
      // rather than throwing an error at someone mid-filing.
    }
  }

  return (
    <li className="ed-handoff-row" data-field={field.key}>
      <span className="ed-handoff-label">{named}</span>

      {field.value ? (
        <>
          <span className="ed-handoff-value">{shown}</span>
          <button
            type="button"
            className="ed-handoff-copy"
            onClick={copy}
            aria-label={fillTemplate(t.handoff.copyField, { label: named })}
            data-copied={copied}
          >
            {copied ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
          </button>
        </>
      ) : (
        <span className="ed-handoff-missing">
          {field.optional ? t.handoff.notSupplied : t.handoff.missing}
          {field.fixHref ? (
            <>
              {" "}
              <Link href={field.fixHref}>{fixLabelFor(t, field)}</Link>
            </>
          ) : null}
        </span>
      )}
      <span className="sr-only" role="status">{copied ? fillTemplate(t.handoff.copiedField, { label: named }) : ""}</span>
    </li>
  );
}

export default function WebDealerHandoff({
  dealId,
  fields,
  webDealerUrl,
  plate,
  heading = true,
}: {
  dealId: string;
  fields: HandoffField[];
  webDealerUrl: string | null;
  plate: string | null;
  heading?: boolean;
}) {
  const { t } = useFunnel();
  const [copiedAll, setCopiedAll] = useState(false);
  const [value, setValue] = useState(plate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const plateId = useId();

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(handoffClipboardText(fields));
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1400);
    } catch {
      // Same as the single field: silent, the values are all on screen.
    }
  }

  function savePlate() {
    setError(null);
    const data = new FormData();
    data.set("plate", value);
    startTransition(async () => {
      const result = await saveSalePlate(dealId, data);
      if (!result.ok) setError(result.error ?? t.handoff.couldNotSavePlate);
    });
  }

  return (
    <section aria-label={t.handoff.sectionLabel} className={heading ? "mt-10" : undefined}>
      {heading ? <h2 className="ed-admin-label">{t.handoff.sectionLabel}</h2> : null}

      <div className={`ed-admin-panel p-6 md:p-7${heading ? " mt-4" : ""}`}>
        <div className="ed-handoff-actions">
          <button type="button" className="ed-btn ed-btn-outline" onClick={copyAll}>
            {copiedAll ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            {t.handoff.copyAll}
          </button>
          {webDealerUrl ? (
            <a
              className="ed-btn ed-btn-dark"
              href={webDealerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.handoff.openWebDealer}
              <ArrowSquareOut size={15} aria-hidden="true" />
            </a>
          ) : null}
        </div>

        <ul className="ed-handoff-list">
          {fields.map((field) => (
            <FieldRow key={field.key} field={field} />
          ))}
        </ul>

        <div className="ed-handoff-plate">
          <label className="ed-fine" htmlFor={plateId}>
            {t.handoff.plateIssued}
          </label>
          <div className="ed-handoff-plate-row">
            <input
              id={plateId}
              name="plate"
              type="text"
              className="ed-input"
              value={value}
              autoComplete="off"
              onChange={(event) => setValue(event.target.value)}
              disabled={pending}
            />
            {value.trim() && value.trim().toUpperCase() !== (plate ?? "") ? (
              <button
                type="button"
                className="ed-btn ed-btn-outline"
                onClick={savePlate}
                disabled={pending}
              >
                {pending ? t.handoff.saving : t.handoff.save}
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="ed-fine mt-2 text-[color:var(--tj-danger,#8c2f1f)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
