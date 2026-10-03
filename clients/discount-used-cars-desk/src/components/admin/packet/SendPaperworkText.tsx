"use client";

import { useState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";
import { localizeDocumentTitle } from "@/lib/sales/question-i18n";
import {
  sendPaperworkText,
  type SendPaperworkResult,
} from "@/lib/actions/paperwork-delivery";
import { clearSmsReviewHold } from "@/lib/actions/sms-review-hold";
import { tapHaptic } from "@/lib/haptics";

/**
 * The packet's send button, and every state it can honestly be in.
 *
 * The action derives everything server-side from the deal id; the only
 * inputs here are the deal, the optional buyer-asked attestation, and an
 * explicit resend. "Accepted is not delivered" is said in plain words, the
 * one-time access code (when the deal has no DOB/licence factor) is shown
 * once for the operator to read out loud, and a second press while a link
 * is live reuses it rather than texting twice.
 */
export default function SendPaperworkText({
  dealId,
  enabled,
  hasPhone,
}: {
  dealId: string;
  enabled: boolean;
  hasPhone: boolean;
}) {
  const { t } = useFunnel();
  const [pending, setPending] = useState(false);
  const [attested, setAttested] = useState(false);
  const [result, setResult] = useState<SendPaperworkResult | null>(null);

  if (!enabled) return null;

  const s = t.sendText;
  const errors = s.errors as Record<string, string>;

  async function send(resend: boolean) {
    if (pending) return;
    tapHaptic();
    setPending(true);
    try {
      setResult(await sendPaperworkText(dealId, { attested, resend }));
    } catch {
      setResult({ ok: false, code: "generic", error: "" });
    } finally {
      setPending(false);
    }
  }

  const documentList = (types: string[]) =>
    types.map((type) => localizeDocumentTitle(t, type, type)).join(", ");

  return (
    <div className="ed-packet-send">
      {!hasPhone ? (
        <p className="ed-packet-empty">{s.noPhone}</p>
      ) : (
        <>
          <label className="ed-packet-attest">
            {/* Optional and unchecked on purpose: consent is never a
                condition of the sale, and the box is the operator's
                attestation of what the buyer said, versioned by wording. */}
            <input
              type="checkbox"
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
              disabled={pending}
            />
            <span>{s.attest}</span>
          </label>

          <button
            type="button"
            className="ed-btn ed-btn-dark"
            disabled={pending}
            onClick={() => void send(false)}
          >
            <PaperPlaneTilt size={15} aria-hidden="true" />
            {pending ? s.sending : s.button}
          </button>

          {result && result.ok ? (
            <div className="ed-packet-sent" role="status">
              <p>
                {result.reused
                  ? s.reused
                  : result.status === "failed"
                    ? fillTemplate(s.failed, { reason: errors.generic })
                    : s.sent}
              </p>
              {result.accessCode ? (
                <p className="ed-packet-code">
                  {fillTemplate(s.accessCode, { code: result.accessCode })}
                </p>
              ) : null}
              <p className="ed-fine">
                {fillTemplate(s.carries, { list: documentList(result.documents) })}
              </p>
              {result.inkOnly.length > 0 ? (
                <p className="ed-fine">
                  {fillTemplate(s.inkOnly, { list: documentList(result.inkOnly) })}
                </p>
              ) : null}
              <p className="ed-fine">{s.convenience}</p>
              {result.reused || result.status === "failed" ? (
                <button
                  type="button"
                  className="ed-start-quiet"
                  disabled={pending}
                  onClick={() => void send(true)}
                >
                  {s.resend}
                </button>
              ) : null}
            </div>
          ) : null}

          {result && !result.ok ? (
            <div>
              <p className="ed-paper-error" role="alert">
                {errors[result.code] ?? result.error ?? errors.generic}
              </p>
              {/* The hold's whole point is that a person reads the reply.
                  So the reply is HERE, above the clear button: clearing
                  without reading takes deliberate effort. */}
              {result.code === "reviewHold" && result.customerId && result.heldAt ? (
                <>
                  {result.heldMessage ? (
                    <p className="ed-fine">
                      {fillTemplate(s.heldReply, { message: result.heldMessage })}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="ed-start-quiet"
                    disabled={pending}
                    onClick={() => {
                      const customerId = result.customerId!;
                      const heldAt = result.heldAt!;
                      setPending(true);
                      void clearSmsReviewHold(customerId, heldAt)
                        .then((cleared) => {
                          if (cleared.ok) setResult(null);
                        })
                        .finally(() => setPending(false));
                    }}
                  >
                    {s.clearHold}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
