"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPacketStatusDocument, packetPollDelay, packetProgress, packetRevision, type PacketStatusDocument } from "@/lib/sales/packet-status";

export type PacketConnection = "checking" | "live" | "retrying" | "offline" | "expired";

/** One reader per mounted packet. Notifications accelerate the same fallback reader. */
export function usePacketStatus(dealId: string, initial: PacketStatusDocument[], dealerSignsTitle: boolean) {
  const [documents, setDocuments] = useState(initial);
  const [connection, setConnection] = useState<PacketConnection>("checking");
  const latest = useRef(initial);
  const dealer = useRef(dealerSignsTitle);
  const refresh = useRef<() => void>(() => {});
  const initialRevision = packetRevision(initial);

  useEffect(() => {
    dealer.current = dealerSignsTitle;
  }, [dealerSignsTitle]);
  useEffect(() => {
    latest.current = initial;
    setDocuments(initial);
    // Server facts can also arrive after an action or navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRevision]);

  useEffect(() => {
    let disposed = false;
    let running = false;
    let failures = 0;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const visible = () => document.visibilityState !== "hidden";
    const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
    const schedule = (delay: number) => {
      clear();
      if (!disposed && !expired && visible() && navigator.onLine) timer = setTimeout(() => void read(), delay);
    };
    const read = async () => {
      if (disposed || running || expired || !visible()) return;
      if (!navigator.onLine) { setConnection("offline"); return; }
      clear();
      running = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8_000);
      try {
        const response = await fetch(`/api/admin/sales/${encodeURIComponent(dealId)}/packet-status`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401 || response.status === 403) {
          expired = true;
          if (!disposed) setConnection("expired");
          return;
        }
        if (!response.ok) throw new Error("Status unavailable");
        const body: unknown = await response.json();
        const next = body && typeof body === "object" ? (body as { documents?: unknown }).documents : null;
        if (!Array.isArray(next) || !next.every(isPacketStatusDocument)) throw new Error("Invalid status");
        if (disposed || !visible()) return;
        failures = 0;
        setConnection("live");
        if (packetRevision(next) !== packetRevision(latest.current)) {
          latest.current = next;
          setDocuments(next);
        }
      } catch {
        if (!disposed && visible()) {
          failures += 1;
          setConnection(navigator.onLine ? "retrying" : "offline");
        }
      } finally {
        clearTimeout(timeout);
        running = false;
        const progress = packetProgress(latest.current, dealer.current);
        schedule(packetPollDelay(failures, progress.pending > 0 || progress.drafts > 0 || progress.filed === 0));
      }
    };
    const checkNow = () => { if (!running) { failures = 0; schedule(0); } };
    const visibility = () => { if (visible()) checkNow(); else { clear(); controller?.abort(); } };
    const offline = () => { clear(); controller?.abort(); setConnection("offline"); };
    refresh.current = checkNow;
    window.addEventListener("focus", checkNow);
    window.addEventListener("online", checkNow);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);
    // The subscription is optional. Some projects publish deals but not agreements;
    // neither a missing publication nor a websocket outage disables polling.
    let client: ReturnType<typeof createClient> | undefined;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | undefined;
    try {
      client = createClient();
      channel = client.channel(`packet-status-${dealId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "document_agreements", filter: `deal_id=eq.${dealId}` }, checkNow)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "deals", filter: `id=eq.${dealId}` }, checkNow)
        .subscribe();
    } catch { /* The authenticated HTTP reader remains available. */ }
    void read();
    return () => {
      disposed = true;
      clear();
      controller?.abort();
      refresh.current = () => {};
      window.removeEventListener("focus", checkNow);
      window.removeEventListener("online", checkNow);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [dealId]);

  return { documents, connection, checkNow: () => refresh.current() };
}
