"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { deleteSaleAction } from "@/lib/actions/delete-sale";

/**
 * Removing a sale that should not be on the list.
 *
 * This used to be hidden entirely on any sale with a signature, on the
 * reasoning that a control which is going to refuse is worse than no control.
 * What that produced was worse still: the owner, looking at six of his own
 * test sales reading "1 of 3 signed", had no button at all and no way to
 * learn why. An absent control explains nothing.
 *
 * So it is always here now. On a clean draft it is two taps. On a sale with
 * signed paperwork it is three, and the middle one says out loud what is
 * about to be destroyed, because that is a real record and the owner is the
 * only person the server will let past it.
 *
 * Taps rather than a dialog. A confirmation box is a thing to read, and this
 * needs to be harder to do by accident rather than more explained. Each step
 * is a different word, so muscle memory from the first does not carry.
 */
export default function DeleteSaleButton({
  dealId,
  buyerName,
  hasSignedPaperwork = false,
}: {
  dealId: string;
  buyerName: string;
  /** Drives the wording only. The server decides what is actually allowed. */
  hasSignedPaperwork?: boolean;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  /** Raised once the server has said this one destroys a signed record. */
  const [confirmingSigned, setConfirmingSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(confirmSigned: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await deleteSaleAction(dealId, { confirmSigned });
      if (!result.ok) {
        if (result.needsSignedConfirmation) {
          // Not a failure: the heavier path, asked for out loud.
          setConfirmingSigned(true);
          setError(result.error ?? null);
          return;
        }
        setArmed(false);
        setConfirmingSigned(false);
        setError(result.error ?? "That sale could not be removed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="ed-sale-remove">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirmingSigned) return remove(true);
          if (armed) return remove(false);
          setArmed(true);
        }}
        /* Blur disarms the first step only. Once the server has said a signed
           record is at stake, that warning stays put: losing it to a stray tap
           elsewhere would silently drop the operator back to a button that
           looks like the harmless one. */
        onBlur={() => {
          if (!confirmingSigned) setArmed(false);
        }}
        /* Names the buyer, because a screen reader hears this row's controls
           out of the context that makes "Delete" mean anything. */
        aria-label={
          confirmingSigned
            ? `Permanently destroy the signed sale for ${buyerName}`
            : armed
              ? `Confirm removing the sale for ${buyerName}`
              : `Remove the sale for ${buyerName}`
        }
        className={armed || confirmingSigned ? "ed-sale-remove-armed" : "ed-sale-remove-idle"}
      >
        {confirmingSigned ? (
          pending ? "Destroying…" : "Destroy The Record"
        ) : armed ? (
          pending ? "Removing…" : hasSignedPaperwork ? "Delete Anyway" : "Delete For Good"
        ) : (
          <Trash size={15} weight="regular" aria-hidden="true" />
        )}
      </button>

      {error ? (
        <span role="alert" className="ed-sale-remove-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
