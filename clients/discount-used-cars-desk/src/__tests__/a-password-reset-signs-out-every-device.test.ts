import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

/**
 * A password reset signs out every device (owner's decision 10/02/2026; SOP
 * Security, and "First sign-in: onboarding").
 *
 * When an owner resets a member's access, the account records the moment
 * (app_metadata.password_reset_at). From then on a session counts only if it
 * signed in after that moment: the desk's own device cookie, minted by every
 * sign-in path and by nothing else, carries the sign-in time and is the
 * guarantee; the session's earliest authentication time (amr, from
 * getClaims) can only add a refusal. A stale session is signed out (the
 * local sign-out is the SDK's best effort) and sent to sign in with a
 * one-line notice. Nothing more is read for an account with no reset.
 */

const state = vi.hoisted(() => ({
  preview: false,
  cookies: new Map<string, string>(),
  cookieReads: 0,
  user: null as null | Record<string, unknown>,
  claims: null as null | Record<string, unknown>,
  claimsCalls: 0,
  claimsThrow: false,
  signOuts: [] as Array<unknown>,
  member: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/auth/local-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/local-admin")>()),
  isLocalAdminPreviewEnabled: () => state.preview,
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    state.cookieReads += 1;
    return {
      get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
      getAll: () => [...state.cookies].map(([name, value]) => ({ name, value })),
      set: () => {},
    };
  },
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
      getClaims: async () => {
        state.claimsCalls += 1;
        if (state.claimsThrow) throw new Error("no claims");
        return { data: state.claims ? { claims: state.claims } : null, error: null };
      },
      signOut: async (options: unknown) => {
        state.signOuts.push(options);
        return { error: null };
      },
    },
  }),
}));
vi.mock("@/lib/supabase/service", async () => {
  const { createMockSupabaseClient } = await import("@/lib/supabase/mock");
  const fake = () => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      update: () => chain,
      maybeSingle: async () => ({ data: state.member, error: null }),
    });
    return { from: () => chain };
  };
  return { createServiceClient: () => (state.preview ? createMockSupabaseClient() : fake()) };
});

import {
  AMR_SKEW_MS,
  SIGNED_OUT_RESET_API_ERROR,
  SIGNED_OUT_RESET_MESSAGE,
  SIGNED_OUT_RESET_PATH,
  earliestAuthenticationMs,
  passwordResetAtMs,
  previewSignedInAtMs,
  sessionPredatesReset,
} from "@/lib/auth/password-reset-cutoff";
import {
  ADMIN_DEVICE_SESSION_COOKIE,
  adminDeviceSessionIssuedAt,
  createAdminDeviceSessionCookie,
} from "@/lib/auth/admin-device-session";
import { LOCAL_ADMIN_SESSION_COOKIE, LOCAL_ADMIN_SIGNED_IN_COOKIE } from "@/lib/auth/local-admin";
import { getCurrentAdminAccess, requireAdminActionPermission } from "@/lib/admin/current-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { resetMockWrites } from "@/lib/supabase/mock";

const NOW = Date.now();
const RESET_AT = new Date(NOW - 60 * 60 * 1000).toISOString();
const RESET_MS = Date.parse(RESET_AT);

/** A device cookie as a sign-in would have minted it at `at`. */
async function deviceCookieAt(at: number): Promise<string> {
  const spy = vi.spyOn(Date, "now").mockReturnValue(at);
  try {
    return await createAdminDeviceSessionCookie();
  } finally {
    spy.mockRestore();
  }
}

function staff(appMetadata: Record<string, unknown> = {}) {
  return {
    id: "auth-1",
    email: "maria@example.test",
    app_metadata: { access_status: "active", desk_role: "sales", ...appMetadata },
    user_metadata: {},
  };
}

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "a-test-secret-that-is-long-enough-for-hmac");
  vi.stubEnv("ADMIN_EMAIL", "owner@example.test");
  state.preview = false;
  state.cookies = new Map();
  state.cookieReads = 0;
  state.user = staff({ password_reset_at: RESET_AT });
  state.claims = null;
  state.claimsCalls = 0;
  state.claimsThrow = false;
  state.signOuts = [];
  state.member = { id: "member-1", auth_user_id: "auth-1", email: "maria@example.test", status: "active", role: "sales", full_name: "Maria Lopez" };
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/* -------------------------------------------------------------------- */
/* The cutoff                                                            */
/* -------------------------------------------------------------------- */

describe("the cutoff", () => {
  it("reads the reset time off the account, and nothing else as one", () => {
    expect(passwordResetAtMs({ password_reset_at: RESET_AT })).toBe(RESET_MS);
    expect(passwordResetAtMs({})).toBeNull();
    expect(passwordResetAtMs(null)).toBeNull();
    expect(passwordResetAtMs({ password_reset_at: "" })).toBeNull();
    expect(passwordResetAtMs({ password_reset_at: "not a time" })).toBeNull();
    expect(passwordResetAtMs({ password_reset_at: 12345 })).toBeNull();
  });

  it("takes the EARLIEST authentication time, in either amr format", () => {
    expect(earliestAuthenticationMs([{ method: "password", timestamp: 2000 }, { method: "otp", timestamp: 1000 }])).toBe(1_000_000);
    expect(earliestAuthenticationMs([{ method: "otp", timestamp: 1000 }, { method: "password", timestamp: 2000 }])).toBe(1_000_000);
    expect(earliestAuthenticationMs(["password"])).toBeNull();
    expect(earliestAuthenticationMs([])).toBeNull();
    expect(earliestAuthenticationMs(undefined)).toBeNull();
    expect(earliestAuthenticationMs([{ method: "password", timestamp: "soon" }])).toBeNull();
  });

  it("says stale exactly when the session signed in before the reset", () => {
    const after = RESET_MS + 60_000;
    // No reset recorded: never stale, whatever else is missing.
    expect(sessionPredatesReset({ resetAtMs: null, deviceIssuedAtMs: null })).toBe(false);
    // A reset: no (or no valid) device cookie is stale.
    expect(sessionPredatesReset({ resetAtMs: RESET_MS, deviceIssuedAtMs: null })).toBe(true);
    // Signed in before the reset.
    expect(sessionPredatesReset({ resetAtMs: RESET_MS, deviceIssuedAtMs: RESET_MS - 1 })).toBe(true);
    // After it, with the session's own sign-in after it too.
    expect(sessionPredatesReset({ resetAtMs: RESET_MS, deviceIssuedAtMs: after, authenticatedAtMs: after })).toBe(false);
    // A new device cookie on a session that authenticated before the reset.
    expect(sessionPredatesReset({ resetAtMs: RESET_MS, deviceIssuedAtMs: after, authenticatedAtMs: RESET_MS - AMR_SKEW_MS - 1 })).toBe(true);
    // Within the clock skew is not a refusal.
    expect(sessionPredatesReset({ resetAtMs: RESET_MS, deviceIssuedAtMs: after, authenticatedAtMs: RESET_MS - AMR_SKEW_MS + 1 })).toBe(false);
    // No amr to read: the device cookie decides.
    expect(sessionPredatesReset({ resetAtMs: RESET_MS, deviceIssuedAtMs: after, authenticatedAtMs: null })).toBe(false);
  });

  it("reads the device's sign-in time only off a valid cookie", async () => {
    const at = NOW - 5 * 60 * 1000;
    const cookie = await deviceCookieAt(at);
    expect(await adminDeviceSessionIssuedAt(cookie)).toBe(at);
    const [issued, signature] = cookie.split(".");
    expect(await adminDeviceSessionIssuedAt(`${Number(issued) + 1}.${signature}`)).toBeNull();
    expect(await adminDeviceSessionIssuedAt(`${issued}.${signature.slice(1)}x`)).toBeNull();
    expect(await adminDeviceSessionIssuedAt(await deviceCookieAt(NOW - 400 * 24 * 60 * 60 * 1000))).toBeNull();
    expect(await adminDeviceSessionIssuedAt("")).toBeNull();
    expect(await adminDeviceSessionIssuedAt(undefined)).toBeNull();
  });

  it("reads the preview's own sign-in cookie as a time or nothing", () => {
    expect(previewSignedInAtMs(String(NOW))).toBe(NOW);
    expect(previewSignedInAtMs("")).toBeNull();
    expect(previewSignedInAtMs("yesterday")).toBeNull();
    expect(previewSignedInAtMs(undefined)).toBeNull();
  });
});

/* -------------------------------------------------------------------- */
/* Enforcement                                                           */
/* -------------------------------------------------------------------- */

describe("the current-admin check", () => {
  it("signs out a session whose device signed in before the reset, and calls the local sign-out", async () => {
    state.cookies.set(ADMIN_DEVICE_SESSION_COOKIE, await deviceCookieAt(RESET_MS - 60_000));
    const access = await getCurrentAdminAccess();
    expect(access).toMatchObject({ user: null, member: null, role: null, signedOut: "passwordReset" });
    expect(state.signOuts).toEqual([{ scope: "local" }]);
  });

  it("signs out a session with no device cookie at all once a reset is recorded", async () => {
    expect(await getCurrentAdminAccess()).toMatchObject({ user: null, signedOut: "passwordReset" });
  });

  it("signs out a new device cookie on a session that authenticated before the reset", async () => {
    state.cookies.set(ADMIN_DEVICE_SESSION_COOKIE, await deviceCookieAt(RESET_MS + 60_000));
    state.claims = { amr: [{ method: "password", timestamp: Math.floor((RESET_MS - 10 * 60_000) / 1000) }] };
    expect(await getCurrentAdminAccess()).toMatchObject({ user: null, signedOut: "passwordReset" });
  });

  it("lets in a session that signed in after the reset", async () => {
    state.cookies.set(ADMIN_DEVICE_SESSION_COOKIE, await deviceCookieAt(RESET_MS + 60_000));
    state.claims = { amr: [{ method: "password", timestamp: Math.floor((RESET_MS + 60_000) / 1000) }] };
    const access = await getCurrentAdminAccess();
    expect(access.signedOut).toBeUndefined();
    expect(access.user).toMatchObject({ id: "auth-1" });
    expect(access.role).toBe("sales");
    expect(state.signOuts).toEqual([]);
  });

  it("lets the device cookie decide when the claims cannot be read", async () => {
    state.cookies.set(ADMIN_DEVICE_SESSION_COOKIE, await deviceCookieAt(RESET_MS + 60_000));
    state.claimsThrow = true;
    expect((await getCurrentAdminAccess()).signedOut).toBeUndefined();
  });

  it("reads no cookie and no claims for an account with no reset recorded", async () => {
    state.user = staff();
    const access = await getCurrentAdminAccess();
    expect(access.role).toBe("sales");
    expect(state.cookieReads).toBe(0);
    expect(state.claimsCalls).toBe(0);
  });

  it("refuses a replayed action from a stale device with the reset's own sentence", async () => {
    state.cookies.set(ADMIN_DEVICE_SESSION_COOKIE, await deviceCookieAt(RESET_MS - 60_000));
    expect(await requireAdminActionPermission("sales:manage")).toEqual({
      ok: false,
      error: SIGNED_OUT_RESET_MESSAGE,
      code: "passwordReset",
    });
  });
});

describe("the preview, with DESK_PREVIEW_MEMBER=fresh-reset", () => {
  beforeEach(() => {
    state.preview = true;
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh-reset");
    state.cookies.set(LOCAL_ADMIN_SESSION_COOKIE, "sales:maria@example.test");
  });

  it("signs out a preview session with no signed-in time, or one older than the reset", async () => {
    expect(await getCurrentAdminAccess()).toMatchObject({ user: null, signedOut: "passwordReset" });
    state.cookies.set(LOCAL_ADMIN_SIGNED_IN_COOKIE, String(Date.now() - 60 * 60 * 1000));
    expect(await getCurrentAdminAccess()).toMatchObject({ user: null, signedOut: "passwordReset" });
  });

  it("lets in a preview session that signed in after the reset", async () => {
    await getCurrentAdminAccess(); // the reset is fixed the first time it is read
    state.cookies.set(LOCAL_ADMIN_SIGNED_IN_COOKIE, String(Date.now() + 1000));
    const access = await getCurrentAdminAccess();
    expect(access.signedOut).toBeUndefined();
    expect(access.user).toMatchObject({ id: "local-admin-preview" });
    expect(access.user?.app_metadata?.password_reset_at).toEqual(expect.any(String));
  });

  it("leaves every other preview member alone", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh-temporary-password");
    resetMockWrites();
    const access = await getCurrentAdminAccess();
    expect(access.signedOut).toBeUndefined();
    expect(access.user?.app_metadata?.password_reset_at).toBeUndefined();
  });
});

describe("the API guard", () => {
  const request = (cookies: Record<string, string>) =>
    new NextRequest("http://localhost/api/documents/agreements/x/pdf", {
      headers: { cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ") },
    });

  it("answers 401 to a device signed in before the reset", async () => {
    const response = await requireAdmin(request({ [ADMIN_DEVICE_SESSION_COOKIE]: await deviceCookieAt(RESET_MS - 60_000) }), "documents:read");
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: SIGNED_OUT_RESET_API_ERROR });
  });

  it("lets through a device signed in after it", async () => {
    const response = await requireAdmin(request({ [ADMIN_DEVICE_SESSION_COOKIE]: await deviceCookieAt(RESET_MS + 60_000) }), "documents:read");
    expect(response).toBeNull();
  });

  it("answers 401 in the preview too", async () => {
    state.preview = true;
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh-reset");
    const stale = await requireAdmin(request({ [LOCAL_ADMIN_SESSION_COOKIE]: "owner:owner@example.dev" }), "documents:read");
    expect(stale?.status).toBe(401);
    expect(await stale?.json()).toEqual({ error: SIGNED_OUT_RESET_API_ERROR });
    const fresh = await requireAdmin(
      request({ [LOCAL_ADMIN_SESSION_COOKIE]: "owner:owner@example.dev", [LOCAL_ADMIN_SIGNED_IN_COOKIE]: String(Date.now() + 1000) }),
      "documents:read",
    );
    expect(fresh).toBeNull();
  });
});

describe("the pages and the proxy", () => {
  it("send a stale session to sign in with the notice, from the layout and the template", () => {
    expect(SIGNED_OUT_RESET_PATH).toBe("/admin/login?notice=signed-out-reset");
    for (const file of ["src/app/admin/layout.tsx", "src/app/admin/template.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/access\.signedOut === "passwordReset"\)[\s\S]{0,40}redirect\("\/admin\/login\?notice=signed-out-reset"\)/);
    }
    // A layout redirect target must be a page that renders.
    expect(readFileSync("src/app/admin/login/page.tsx", "utf8")).toMatch(/notice === "signed-out-reset"/);
  });

  it("show the notice on the sign-in page in English and Spanish", () => {
    expect(en.funnel.onboarding.signedOutReset).toBe(SIGNED_OUT_RESET_MESSAGE);
    expect(es.funnel.onboarding.signedOutReset).toMatch(/restableci/i);
    const login = readFileSync("src/app/admin/login/page.tsx", "utf8");
    expect(login).toMatch(/getFunnelStrings\("en"\)\.onboarding\.signedOutReset[\s\S]*getFunnelStrings\("es"\)\.onboarding\.signedOutReset/);
  });

  it("is enforced in the proxy: checked only with a reset, local sign-out, device cookie cleared, never a bounce from sign-in", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toMatch(/const resetAtMs = passwordResetAtMs\(user\.app_metadata\);\s*if \(resetAtMs !== null\)/);
    expect(proxy).toMatch(/sessionPredatesReset\(\{ resetAtMs, deviceIssuedAtMs, authenticatedAtMs \}\)/);
    expect(proxy).toMatch(/supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
    expect(proxy).toMatch(/signedOut\.cookies\.delete\(ADMIN_DEVICE_SESSION_COOKIE\)/);
    expect(proxy).toMatch(/pathname === "\/admin\/login" \|\| pathname === "\/admin\/signup"\s*\?\s*response/);
    expect(proxy).toMatch(/NextResponse\.redirect\(new URL\(SIGNED_OUT_RESET_PATH, request\.url\)\)/);
    // The JWT's iat is never the sign-in time: a refresh re-issues it.
    const cutoff = readFileSync("src/lib/auth/password-reset-cutoff.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(cutoff).not.toMatch(/\biat\b/);
  });
});
