import { describe, expect, it } from "vitest";
import { isPacketStatusDocument, packetPollDelay, packetProgress, packetRevision, type PacketStatusDocument } from "@/lib/sales/packet-status";

const document = (extra: Partial<PacketStatusDocument> = {}): PacketStatusDocument => ({ id: "bill", documentType: "billOfSale", title: "Bill Of Sale", gloss: "Sale", finalized: true, printable: true, signed: false, filedAt: "2026-09-08", ...extra });

describe("the desk follows the filed signature facts", () => {
  it("never equates filing with signing", () => {
    expect(packetProgress([document()])).toMatchObject({ filed: 1, total: 1, pending: 1, signed: 0, complete: false });
    expect(packetProgress([document({ signed: true })])).toMatchObject({ signed: 1, pending: 0, complete: true });
  });
  it("keeps a remaining draft visible after signatures finish", () => {
    expect(packetProgress([document({ signed: true }), document({ id: "title", documentType: "form130U", finalized: false })])).toMatchObject({ signed: 1, drafts: 1, complete: false });
  });
  it("does not ask for buyer strokes on the wet-signature POA or dealer-signed title", () => {
    const rows = [document({ signed: true }), document({ id: "poa", documentType: "powerOfAttorney", printable: false }), document({ id: "title", documentType: "form130U" })];
    expect(packetProgress(rows, true)).toMatchObject({ total: 1, signed: 1, complete: true });
    expect(packetProgress(rows, false)).toMatchObject({ total: 2, pending: 1, complete: false });
  });
  it("never calls an empty packet ready", () => {
    expect(packetProgress([]).complete).toBe(false);
  });
  it("does not let an older unsigned copy keep a newly signed packet waiting", () => {
    expect(packetProgress([document({ id: "new", signed: true }), document({ id: "old" }), document({ id: "draft", finalized: false })])).toMatchObject({ filed: 1, signed: 1, total: 1, drafts: 0, complete: true });
  });
  it("detects a new signed PDF without needing a changed document id", () => {
    expect(packetRevision([document()])).not.toBe(packetRevision([document({ signed: true })]));
    expect(packetRevision([document()])).toBe(packetRevision([document()]));
  });
  it("bounds retry traffic while checking pending signatures promptly", () => {
    expect(packetPollDelay(0, true)).toBe(2000);
    expect(packetPollDelay(0, false)).toBe(20000);
    expect([1, 2, 3, 4, 100].map((n) => packetPollDelay(n, true))).toEqual([4000, 8000, 16000, 30000, 30000]);
  });
  it("rejects incomplete or untyped responses instead of clearing the current packet", () => {
    expect(isPacketStatusDocument(document())).toBe(true);
    expect(isPacketStatusDocument({ id: "a", signed: "true" })).toBe(false);
    expect(isPacketStatusDocument(null)).toBe(false);
  });
});
