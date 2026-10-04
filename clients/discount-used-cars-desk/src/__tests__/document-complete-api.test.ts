import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  decodeCompletedLinkFromUrl,
  encodeCompletedLink,
} from "@/lib/documents/customerPortal";

type AgreementRow = {
  id: string;
  status: string;
  buyer_name: string | null;
  document_type: string;
  vehicle_description: string | null;
  parent_agreement_id: string | null;
  portal_data: Record<string, unknown> | null;
  customer_id: string | null;
  expires_at: string | null;
  deleted_at: string | null;
  signing_token: string | null;
  signing_token_expires_at: string | null;
  vehicles: null;
};

const mockUpdate = vi.fn();
let mockAgreement: AgreementRow;

function makeAgreement(overrides: Partial<AgreementRow> = {}): AgreementRow {
  return {
    id: "agreement-1",
    status: "pending",
    buyer_name: null,
    document_type: "billOfSale",
    vehicle_description: "2013 Acura ILX",
    parent_agreement_id: null,
    portal_data: {
      s: "billOfSale",
      d: {
        vehicleVin: "SERVER-VIN",
        salePrice: 12500,
      },
      ds: "dealer-signature",
      dd: "2026-05-01",
    },
    customer_id: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    deleted_at: null,
    signing_token: null,
    signing_token_expires_at: null,
    vehicles: null,
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/documents/agreements/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

vi.mock("@/lib/notifications/owner", () => ({
  notifyOwnerDocumentSigned: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: mockAgreement, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        mockUpdate(payload);
        const query = {
          eq: () => query,
          select: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { id: mockAgreement.id, status: payload.status },
                error: null,
              }),
          }),
        };
        return query;
      },
    }),
  })),
}));

const { POST } = await import("@/app/api/documents/agreements/complete/route");

describe("POST /api/documents/agreements/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgreement = makeAgreement();
  });

  it("rejects tokenized agreements when the signing token is missing", async () => {
    mockAgreement = makeAgreement({
      signing_token: "secure-token",
      signing_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const res = await POST(makeRequest({ id: mockAgreement.id }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid signing token" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects expired agreement links before writing customer data", async () => {
    mockAgreement = makeAgreement({
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const res = await POST(makeRequest({ id: mockAgreement.id }));

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "Agreement link expired" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects legacy pending agreements that do not have a signing token", async () => {
    mockAgreement = makeAgreement({ signing_token: null });

    const res = await POST(makeRequest({ id: mockAgreement.id }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Signing token required" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("completes a tokenized agreement when the token is valid", async () => {
    mockAgreement = makeAgreement({
      signing_token: "secure-token",
      signing_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const res = await POST(
      makeRequest({
        id: mockAgreement.id,
        signing_token: "secure-token",
        buyer_name: "Alexis",
        has_buyer_signature: true,
        buyer_signature: "buyer-signature",
        buyer_signature_date: "2026-05-27",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        buyer_name: "Alexis",
        has_buyer_signature: true,
      }),
    );
  });

  it("builds the completed link server-side from trusted dealer data", async () => {
    mockAgreement = makeAgreement({
      buyer_name: "Locked Buyer",
      signing_token: "secure-token",
      signing_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const attackerLink = encodeCompletedLink(
      "billOfSale",
      { vehicleVin: "ATTACKER-VIN", salePrice: 1 },
      { buyerName: "Mallory" },
      "https://evil.example",
      "fake-dealer-signature",
      "2026-01-01",
      "fake-buyer-signature",
      "2026-01-01",
      undefined,
      undefined,
      undefined,
      { inspected: false },
    );

    const res = await POST(
      makeRequest({
        id: mockAgreement.id,
        signing_token: "secure-token",
        completed_link: attackerLink,
        vehicleVin: "REQUEST-VIN",
        salePrice: 5,
        buyerName: "Mallory",
        buyer_phone: "832-555-0101",
        buyer_signature: "real-buyer-signature",
        buyer_signature_date: "2026-05-27",
        buyer_id_photo: "data:image/png;base64,id-front",
        acknowledgments: { inspected: true, smsConsent: true },
        has_buyer_signature: true,
      }),
    );
    const updatePayload = mockUpdate.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const decoded = decodeCompletedLinkFromUrl(String(updatePayload.completed_link));

    expect(res.status).toBe(200);
    expect(decoded).not.toBeNull();
    expect(decoded!.dd).toEqual({
      vehicleVin: "SERVER-VIN",
      salePrice: 12500,
    });
    expect(decoded!.dd.vehicleVin).not.toBe("ATTACKER-VIN");
    expect(decoded!.dd.vehicleVin).not.toBe("REQUEST-VIN");
    expect(decoded!.cd.buyerName).toBe("Locked Buyer");
    expect(decoded!.ds).toBe("dealer-signature");
    expect(decoded!.bs).toBe("real-buyer-signature");
    expect(decoded!.bsd).toBe("2026-05-27");
    expect(decoded!.bi).toBe("data:image/png;base64,id-front");
    expect(decoded!.ack?.inspected).toBe(true);
    expect(updatePayload.completed_link).not.toBe(attackerLink);
  });

  it("rejects completion when the raw buyer signature is missing", async () => {
    mockAgreement = makeAgreement({
      signing_token: "secure-token",
      signing_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const res = await POST(
      makeRequest({
        id: mockAgreement.id,
        signing_token: "secure-token",
        has_buyer_signature: true,
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Buyer signature required" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
