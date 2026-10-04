"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HoldToConfirmButton, { type HoldConfirmLabels } from "@/components/admin/HoldToConfirmButton";

/**
 * Asking before something cannot be undone.
 *
 * `window.confirm` is the other half of the alert problem: unstyled, thread
 * blocking, and it renders "Move Ana to trash?" under a hostname. But unlike a
 * result, a destructive question genuinely does need protected focus, so this
 * stays a dialog. It is just ours.
 *
 * Built on the native <dialog> element, which brings the focus trap, Escape to
 * cancel, and the inert backdrop with it, rather than reimplementing three
 * things browsers already do correctly.
 *
 * Usage keeps the shape of the call it replaces:
 *
 *   if (!(await ask({ question: "Move this to trash?", confirm: "Move" }))) return;
 */

export interface DeskConfirmRequest {
  question: string;
  /** A value important enough to be read back before the action continues. */
  address?: string;
  /** The consequence, when it is not obvious from the question. */
  detail?: string;
  /** Names the action, never "OK". */
  confirm: string;
  cancel?: string;
  destructive?: boolean;
  /** Deliberate read-back confirmations; routine actions stay instant. */
  hold?: HoldConfirmLabels;
}

type Pending = DeskConfirmRequest & { resolve: (answer: boolean) => void };

export function useDeskConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback(
    (request: DeskConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...request, resolve });
      }),
    [],
  );

  const answer = useCallback(
    (value: boolean) => {
      setPending((current) => {
        current?.resolve(value);
        return null;
      });
    },
    [],
  );

  return { pending, ask, answer };
}

export function DeskConfirm({
  pending,
  onAnswer,
}: {
  pending: DeskConfirmRequest | null;
  onAnswer: (answer: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [session, setSession] = useState({ request: pending, key: 0 });
  // A replacement question is a new intent, even while the dialog stays open.
  // React retries this render before committing children with the new key.
  if (session.request !== pending) setSession({ request: pending, key: session.key + 1 });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal();
    if (!pending && dialog.open) dialog.close();
    if (!pending) return;
    // showModal() puts focus on the first control in the dialog, so where the
    // Return key lands is decided by source order unless it is said out loud.
    // Say it: a destructive question opens on Cancel, so Return never deletes
    // anything; an ordinary one opens on the action, so Return does the thing
    // the person came for.
    const landing = pending.destructive ? cancelRef.current : confirmRef.current;
    landing?.focus();
  }, [pending]);

  // Escape, the backdrop, and the close button all mean the same thing: no.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      onAnswer(false);
    };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  }, [onAnswer]);

  return (
    <dialog
      ref={ref}
      className="ed-ask"
      aria-labelledby="ed-ask-question"
      onClick={(event) => {
        if (event.target === event.currentTarget) onAnswer(false);
      }}
    >
      {pending ? (
        <div className="ed-ask-body">
          <p id="ed-ask-question" className="ed-ask-question">
            {pending.question}
          </p>
          {pending.address ? (
            <p className="ed-ask-address">
              “{pending.address}”
            </p>
          ) : null}
          {pending.detail ? <p className="ed-ask-detail">{pending.detail}</p> : null}
          <div className="ed-ask-actions">
            <button
              type="button"
              ref={cancelRef}
              onClick={() => onAnswer(false)}
              className="tj-action-base tj-action-secondary tj-action-md"
            >
              {pending.cancel ?? "Cancel"}
            </button>
            {pending.hold ? <HoldToConfirmButton
              key={session.key}
              buttonRef={confirmRef}
              labels={pending.hold}
              confirm={pending.confirm}
              onConfirm={() => onAnswer(true)}
              className={`tj-action-base tj-action-${pending.destructive ? "danger" : "primary"} tj-action-md`}
            /> : <button
              type="button"
              ref={confirmRef}
              onClick={() => onAnswer(true)}
              className={`tj-action-base tj-action-${pending.destructive ? "danger" : "primary"} tj-action-md`}
            >
              {pending.confirm}
            </button>}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
