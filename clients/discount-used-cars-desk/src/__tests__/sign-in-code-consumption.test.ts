import { beforeEach, describe, expect, it, vi } from "vitest";
import { codeHash } from "@/lib/auth/sign-in-codes";

const state = vi.hoisted(() => ({
  row: null as null | { id: string; code_hash: string; expires_at: string; attempts: number; consumed_at: string | null },
  readError: false,
  writeError: false,
  sent: { state: "accepted", providerId: "test-message" } as Record<string, string>,
}));
vi.mock("@/lib/auth/signing-secret", () => ({ adminSigningSecret: () => "unit-test-signing-secret" }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => state.sent) }));
vi.mock("@/lib/email/templates", () => ({
  signInCodeEmail: () => ({ subject: "Code", html: "", text: "" }),
  verifyEmailCodeEmail: () => ({ subject: "Code", html: "", text: "" }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      let patch: Record<string, unknown> | undefined;
      const equal = new Map<string, unknown>();
      const nullable = new Map<string, unknown>();
      let expiry = "";
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        eq: (key: string, value: unknown) => { equal.set(key, value); return query; },
        is: (key: string, value: unknown) => { nullable.set(key, value); return query; },
        gt: (_key: string, value: string) => { expiry = value; return query; },
        update: (value: Record<string, unknown>) => { patch = value; return query; },
        maybeSingle: async () => {
          if (!patch) return { data: state.row ? { ...state.row } : null, error: state.readError ? { code: "unavailable" } : null };
          if (state.writeError) return { data: null, error: { code: "unavailable" } };
          const row = state.row;
          if (!row || [...equal].some(([key, value]) => row[key as keyof typeof row] !== value) ||
              [...nullable].some(([key, value]) => row[key as keyof typeof row] !== value) ||
              (expiry && row.expires_at <= expiry)) return { data: null, error: null };
          Object.assign(row, patch);
          return { data: { id: row.id }, error: null };
        },
      };
      return query;
    },
  }),
}));
import { issueCode, verifyCode } from "@/lib/auth/code-store";

beforeEach(() => {
  state.row = {
    id: "test-code", code_hash: codeHash("staff@example.test", "sign_in", "123456", "unit-test-signing-secret"),
    expires_at: new Date(Date.now() + 60_000).toISOString(), attempts: 0, consumed_at: null,
  };
  state.readError = false;
  state.writeError = false;
});

describe("durable one-time-code consumption", () => {
  it("allows exactly one concurrent success for the same code", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => verifyCode("staff@example.test", "sign_in", "123456")));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(state.row?.consumed_at).toBeTruthy();
    expect(await verifyCode("staff@example.test", "sign_in", "123456")).toEqual({ ok: false, reason: "consumed" });
  });

  it("does not let concurrent guesses overwrite the attempt count", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => verifyCode("staff@example.test", "sign_in", String(800000 + index))));
    expect(results.filter(result => !result.ok && result.reason === "wrong")).toHaveLength(1);
    expect(state.row?.attempts).toBe(1);
    for (let attempt = 1; attempt < 5; attempt += 1) await verifyCode("staff@example.test", "sign_in", "999999");
    expect(state.row?.attempts).toBe(5);
    expect(await verifyCode("staff@example.test", "sign_in", "123456")).toEqual({ ok: false, reason: "locked" });
  });

  it("allows a correct fifth attempt and consumes it atomically", async () => {
    state.row!.attempts = 4;
    expect(await verifyCode("staff@example.test", "sign_in", "123456")).toEqual({ ok: true });
    expect(state.row?.attempts).toBe(5);
    expect(state.row?.consumed_at).toBeTruthy();
  });

  it.each(["readError", "writeError"] as const)("fails closed on %s without issuing a session", async key => {
    state[key] = true;
    expect(await verifyCode("staff@example.test", "sign_in", "123456")).toEqual({ ok: false, reason: "unavailable" });
    expect(state.row?.consumed_at).toBeNull();
  });

  it.each(["pending", "rejected", "sent_unknown", "skipped"])("does not call a duplicate %s email accepted", async priorState => {
    state.sent = { state: "duplicate", priorState };
    expect((await issueCode("staff@example.test", "sign_in", "en")).ok).toBe(false);
  });
});
