// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePacketStatus } from "@/components/admin/packet/usePacketStatus";
import type { PacketStatusDocument } from "@/lib/sales/packet-status";

const realtime = vi.hoisted(() => ({ notify: undefined as undefined | (() => void), remove: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => {
  const channel = { on: (_kind: string, _filter: unknown, notify: () => void) => { realtime.notify = notify; return channel; }, subscribe: () => channel };
  return { channel: () => channel, removeChannel: realtime.remove };
} }));
const unsigned: PacketStatusDocument = { id: "agreement-1", documentType: "billOfSale", title: "Bill Of Sale", gloss: "Sale", filedAt: "2026-09-08", finalized: true, printable: true, signed: false };
const response = (signed = false) => ({ ok: true, status: 200, json: async () => ({ documents: [{ ...unsigned, signed }] }) });
let read: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  realtime.remove.mockClear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  read = vi.fn().mockResolvedValue(response());
  vi.stubGlobal("fetch", read);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("one live packet reader", () => {
  it("adopts a buyer's signed document without navigation or manual refresh", async () => {
    const { result } = renderHook(() => usePacketStatus("deal-1", [unsigned], false));
    await settle();
    read.mockResolvedValue(response(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.documents[0].signed).toBe(true);
    expect(result.current.connection).toBe("live");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("coalesces realtime and focus events into one in-flight request", async () => {
    renderHook(() => usePacketStatus("deal-1", [unsigned], false));
    await settle();
    let complete: ((value: ReturnType<typeof response>) => void) | undefined;
    read.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    await act(async () => { realtime.notify?.(); window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { realtime.notify?.(); window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(1000); });
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => { complete?.(response(true)); });
  });
  it("pauses while hidden and checks as soon as the dealer returns", async () => {
    renderHook(() => usePacketStatus("deal-1", [unsigned], false));
    await settle();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(60000); });
    expect(read).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("keeps the last packet during a failed read and backs off", async () => {
    const { result } = renderHook(() => usePacketStatus("deal-1", [unsigned], false));
    await settle();
    read.mockRejectedValue(new Error("offline"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.documents).toEqual([unsigned]);
    expect(result.current.connection).toBe("retrying");
    await act(async () => { await vi.advanceTimersByTimeAsync(3999); });
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("stops retrying a denied session and removes timers and subscription on exit", async () => {
    read.mockResolvedValue({ ok: false, status: 401 });
    const { result, unmount } = renderHook(() => usePacketStatus("deal-1", [unsigned], false));
    await settle();
    expect(result.current.connection).toBe("expired");
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(read).toHaveBeenCalledTimes(1);
    unmount();
    expect(realtime.remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
