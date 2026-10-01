"use client";

import { useEffect, useState } from "react";
import { ChatCircleText } from "@phosphor-icons/react";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { sendPacketSigningText, readPacketSigningText } from "@/lib/actions/packet-signing-text";
import type { SigningTextResult } from "@/lib/sales/signing-text";
import { tapHaptic } from "@/lib/haptics";

export default function TextSigningLink({ dealId, enabled, hasPhone }: { dealId: string; enabled: boolean; hasPhone: boolean }) {
  const { t } = useFunnel();
  const s = t.signingText;
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SigningTextResult | null>(null);
  const id = result?.ok ? result.id : null;
  const awaiting = result?.ok && (result.status === "accepted" || result.status === "pending");
  useEffect(() => {
    if (!id || !awaiting) return;
    let disposed = false;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (document.hidden || attempts >= 24) return;
      attempts++;
      void readPacketSigningText(dealId, id).then((next) => { if (!disposed && next.ok) setResult(next); }).catch(() => {});
    }, 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [dealId, id, awaiting]);
  if (!enabled) return null;
  async function send(resend = false) {
    if (busy) return;
    tapHaptic();
    setBusy(true);
    try { setResult(await sendPacketSigningText(dealId, { attested, resend })); }
    catch { setResult({ ok: false, code: "generic" }); }
    finally { setBusy(false); }
  }
  const errors: Record<string, string> = { ...t.sendText.errors, ...s.errors };
  return (
    <div className="ed-packet-send ed-packet-signing-text">
      {hasPhone ? <>
        <label className="ed-packet-attest">
          <input type="checkbox" checked={attested} disabled={busy} onChange={(event) => setAttested(event.target.checked)} />
          <span>{s.attest}</span>
        </label>
        <button type="button" className="ed-btn ed-btn-dark" disabled={busy} onClick={() => void send()}>
          <ChatCircleText size={17} aria-hidden="true" />{busy ? t.sendText.sending : s.button}
        </button>
        {result?.ok ? <div className="ed-packet-sent" role="status">
          <p>{s.status[result.status]}</p>
          {(result.status === "accepted" || result.status === "delivered") && <p className="ed-fine">{s.expiry}</p>}
          {result.status !== "pending" && <button type="button" className="ed-start-quiet" disabled={busy} onClick={() => void send(true)}>{t.sendText.resend}</button>}
        </div> : result ? <p className="ed-paper-error" role="alert">{errors[result.code] ?? t.sendText.errors.generic}</p> : null}
      </> : <p className="ed-fine">{t.sendText.noPhone}</p>}
    </div>
  );
}
