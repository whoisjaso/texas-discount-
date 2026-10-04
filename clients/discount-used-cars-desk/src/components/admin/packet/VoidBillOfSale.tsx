"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Prohibit } from "@phosphor-icons/react";
import HoldToConfirmButton from "@/components/admin/HoldToConfirmButton";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";
import { localizeDocumentTitle } from "@/lib/sales/question-i18n";
import { voidBillOfSaleAction } from "@/lib/actions/void-bill-of-sale";
import { VOID_REASON_MAX, VOID_REASON_MIN, cleanVoidReason, type VoidRefusalCode } from "@/lib/sales/void-bill-of-sale";
import "@/styles/void-freeze.css";

/**
 * Void the filed bill of sale (owner's decision 10/02/2026).
 *
 * A quiet outline action on the filed bill of sale's row, never the accent and
 * never red: it is rare and deliberate. For a role that cannot void, or a sale
 * the rules refuse (closed, title already at the county), it is disabled and
 * says who can, or why not.
 *
 * The dialog reads the void back before anything happens: the buyer and the
 * car, what is voided with it and what stays on file, that nothing is
 * deleted, how many signatures stop counting, the required reason and the
 * title question. "Keep It" is focused; voiding is a hold, and the hold only
 * arms once the reason is long enough and the title answer is "Not Yet".
 */

export type VoidCandidate = { id: string; documentType: string; title: string; signed: boolean };

export default function VoidBillOfSale({
  dealId,
  root,
  voids,
  stays,
  canVoid,
  refusal,
  buyerName,
  vehicle,
  openOnLoad = false,
  returnTo = null,
}: {
  dealId: string;
  /** The current filed bill of sale. */
  root: { id: string; documentType: string };
  /** Every current filed copy voided with it, the root included. */
  voids: VoidCandidate[];
  /** Current filed copies that stay (the power of attorney). */
  stays: VoidCandidate[];
  /** Owner or Manager. */
  canVoid: boolean;
  /** Why the rules refuse a void on this sale right now, if they do. */
  refusal: VoidRefusalCode | null;
  buyerName: string;
  vehicle: string;
  openOnLoad?: boolean;
  /** The guide step the void was asked from, to land back on. */
  returnTo?: string | null;
}) {
  const { t } = useFunnel();
  const v = t.void;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const noteId = useId();
  const reasonId = useId();
  const helpId = useId();
  const titleId = useId();
  // Opened straight away when a refusal's "Void The Bill Of Sale" link sent
  // the operator here and the rules allow it.
  const [open, setOpen] = useState(() => openOnLoad && canVoid && refusal === null);
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState<"notYet" | "submitted" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [holdKey, setHoldKey] = useState(0);

  const blocked = !canVoid || refusal !== null;
  const errors = v.errors as Record<string, string>;
  const say = (code: string, fallback?: string) =>
    fillTemplate(errors[code] ?? fallback ?? v.errors.voidFailed, { min: VOID_REASON_MIN, max: VOID_REASON_MAX });
  const blockedLine = !canVoid ? t.freeze.whoCan : refusal ? say(refusal) : null;

  // The same rule the action and the database apply, so Hold To Void is never
  // offered on a reason the server will refuse.
  const reasonOk = cleanVoidReason(reason).ok;
  const armed = reasonOk && title === "notYet" && !pending && !done;
  const signedCount = voids.filter((entry) => entry.signed).length;
  const salvage = root.documentType === "salvageBillOfSale";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      keepRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!pending) setOpen(false);
    };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  }, [pending]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await voidBillOfSaleAction(dealId, {
        rootId: root.id,
        reason,
        titleApplication: title,
        returnTo,
      });
      if (!result.ok) {
        setError(say(result.code, result.error));
        setHoldKey((key) => key + 1);
        return;
      }
      setDone(true);
      router.push(result.next);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="ed-btn ed-btn-outline ed-packet-action ed-void-action"
        onClick={() => setOpen(true)}
        disabled={blocked}
        aria-disabled={blocked}
        aria-describedby={blockedLine ? noteId : undefined}
        data-void-control
      >
        <Prohibit size={15} aria-hidden="true" />
        {v.action}
      </button>
      {blockedLine ? (
        <p id={noteId} className="ed-packet-gloss ed-void-who">
          {blockedLine}
        </p>
      ) : null}

      <dialog
        ref={dialogRef}
        className="ed-ask ed-void-ask"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget && !pending) setOpen(false);
        }}
      >
        {open ? (
          <div className="ed-ask-body ed-void-body">
            <h2 id={titleId} className="ed-ask-question">
              {salvage ? v.titleSalvage : v.title}
            </h2>
            <p className="ed-ask-address ed-void-readback">
              {[buyerName, vehicle].filter(Boolean).join(" · ")}
            </p>

            <p className="ed-void-heading">{v.voidedWith}</p>
            <ul className="ed-void-list">
              {voids.map((entry) => (
                <li key={entry.id}>
                  <span>{localizeDocumentTitle(t, entry.documentType, entry.title)}</span>
                  <span className="ed-void-state">
                    {entry.signed ? t.packet.signedByBuyer : t.packet.filedUnsigned}
                  </span>
                </li>
              ))}
            </ul>

            {stays.length > 0 ? (
              <>
                <p className="ed-void-heading">{v.stays}</p>
                <ul className="ed-void-list">
                  {stays.map((entry) => (
                    <li key={entry.id}>
                      <span>{localizeDocumentTitle(t, entry.documentType, entry.title)}</span>
                    </li>
                  ))}
                </ul>
                <p className="ed-ask-detail">{v.staysNote}</p>
              </>
            ) : null}

            <p className="ed-ask-detail">{v.kept}</p>
            {signedCount > 0 ? (
              <p className="ed-ask-detail">{fillTemplate(v.signaturesStop, { count: signedCount })}</p>
            ) : null}

            <label className="ed-void-label" htmlFor={reasonId}>
              {v.reasonLabel}
            </label>
            <textarea
              id={reasonId}
              className="ed-input ed-void-reason"
              value={reason}
              maxLength={VOID_REASON_MAX + 50}
              rows={3}
              aria-describedby={helpId}
              disabled={pending || done}
              onChange={(event) => setReason(event.target.value)}
            />
            <p id={helpId} className="ed-ask-detail">
              {fillTemplate(v.reasonHelp, { min: VOID_REASON_MIN })}
            </p>

            <fieldset className="ed-void-title" disabled={pending || done}>
              <legend className="ed-void-label">{v.titleQuestion}</legend>
              <label className="ed-void-radio">
                <input
                  type="radio"
                  name="titleApplication"
                  value="notYet"
                  checked={title === "notYet"}
                  onChange={() => setTitle("notYet")}
                />
                <span>{v.titleNotYet}</span>
              </label>
              <label className="ed-void-radio">
                <input
                  type="radio"
                  name="titleApplication"
                  value="submitted"
                  checked={title === "submitted"}
                  onChange={() => setTitle("submitted")}
                />
                <span>{v.titleSent}</span>
              </label>
            </fieldset>
            {title === "submitted" ? (
              <p className="ed-paper-error" role="alert">
                {say("voidTitleSubmitted")}
              </p>
            ) : null}

            {error ? (
              <p className="ed-paper-error" role="alert">
                {error}
              </p>
            ) : null}
            <p className="sr-only" role="status">
              {done ? v.done : ""}
            </p>

            <div className="ed-ask-actions ed-void-actions">
              <button
                type="button"
                ref={keepRef}
                className="tj-action-base tj-action-secondary tj-action-md"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {v.keep}
              </button>
              {armed ? (
                <HoldToConfirmButton
                  key={holdKey}
                  labels={{
                    hold: v.hold,
                    holding: v.holding,
                    release: v.release,
                    preparing: v.preparing,
                    ready: v.ready,
                    hint: v.hint,
                  }}
                  confirm={v.hold}
                  onConfirm={submit}
                  className="tj-action-base tj-action-danger tj-action-md"
                />
              ) : (
                <button type="button" className="tj-action-base tj-action-danger tj-action-md ed-void-hold-off" disabled>
                  {pending ? t.chrome.saving : v.hold}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
