import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Review findings on the reset sign-out, closed:
 *
 *   - after any reset, Google or Apple sign-in never worked again for that
 *     account: the callback checked the team before it minted the device
 *     cookie, so the new session was judged by the old (or missing) cookie,
 *     signed straight back out and reported "not on the team";
 *   - the device cookie was not tied to an account: a cookie from signing in
 *     to one's own account, paired with another member's pre-reset session,
 *     passed the cutoff whenever the session's claims could not be read;
 *   - a reset ended nothing at the database: the sessions an account started
 *     before it are now ended there too (end_sessions_before), best effort;
 *   - a hand-typed reset time nobody can read silently signed nobody out; it
 *     is now said out loud.
 */

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  user: null as null | Record<string, unknown>,
  member: null as null | Record<string, unknown>,
  signOuts: [] as unknown[],
}));

vi.mock("@/lib/auth/local-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/local-admin")>()),
  isLocalAdminPreviewEnabled: () => false,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    getAll: () => [...state.cookies].map(([name, value]) => ({ name, value })),
    set: () => {},
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ data: { user: state.user, session: null }, error: null }),
      getUser: async () => ({ data: { user: state.user }, error: null }),
      getClaims: async () => ({ data: null, error: { message: "no claims here" } }),
      signOut: async (options: unknown) => {
        state.signOuts.push(options ?? "global");
        return { error: null };
      },
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    eq: () => chain,
    update: () => chain,
    maybeSingle: async () => ({ data: state.member, error: null }),
  });
  return { createServiceClient: () => ({ from: () => chain }) };
});

import {
  ADMIN_DEVICE_SESSION_COOKIE,
  adminDeviceSessionIssuedAt,
  createAdminDeviceSessionCookie,
  isValidAdminDeviceSession,
} from "@/lib/auth/admin-device-session";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { passwordResetAtMs } from "@/lib/auth/password-reset-cutoff";
import { endSessionsBefore } from "@/lib/auth/end-sessions";
import { GET as callback } from "@/app/admin/auth/callback/route";

const RESET_AT = new Date(Date.now() - 60 * 60 * 1000).toISOString();

async function cookieAt(at: number, userId?: string): Promise<string> {
  const spy = vi.spyOn(Date, "now").mockReturnValue(at);
  try {
    return await createAdminDeviceSessionCookie(userId);
  } finally {
    spy.mockRestore();
  }
}

function account(id: string, appMetadata: Record<string, unknown> = { password_reset_at: RESET_AT }) {
  return { id, email: `${id}@example.test`, app_metadata: { access_status: "active", desk_role: "sales", ...appMetadata }, user_metadata: {} };
}

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "a-test-secret-that-is-long-enough-for-hmac");
  vi.stubEnv("ADMIN_EMAIL", "owner@example.test");
  state.cookies = new Map();
  state.user = account("auth-1");
  state.member = { id: "member-1", auth_user_id: "auth-1", email: "auth-1@example.test", status: "active", role: "sales", full_name: "Maria Lopez", onboarding_completed_at: "2026-10-01T00:00:00Z" };
  state.signOuts = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("the device cookie vouches for one account", () => {
  it("names the account it was minted for, and is still a valid device cookie", async () => {
    const cookie = await createAdminDeviceSessionCookie("auth-1");
    expect(cookie.split(".")).toHaveLength(3);
    expect(cookie.split(".")[1]).toBe("auth-1");
    expect(await isValidAdminDeviceSession(cookie)).toBe(true);
    expect(await adminDeviceSessionIssuedAt(cookie, "auth-1")).toBeGreaterThan(0);
  });

  it("never vouches for another account, and cannot be re-pointed at one", async () => {
    const cookie = await createAdminDeviceSessionCookie("auth-2");
    expect(await adminDeviceSessionIssuedAt(cookie, "auth-1")).toBeNull();
    const [at, , signature] = cookie.split(".");
    expect(await adminDeviceSessionIssuedAt(`${at}.auth-1.${signature}`, "auth-1")).toBeNull();
    expect(await isValidAdminDeviceSession(`${at}.auth-1.${signature}`)).toBe(false);
  });

  it("signs out a stale session paired with a fresh cookie from another account, even with no claims to read", async () => {
    state.cookies.set(ADMIN_DEVICE_SESSION_COOKIE, await cookieAt(Date.now(), "auth-2"));
    const access = await getCurrentAdminAccess();
    expect(access).toMatchObject({ user: null, signedOut: "passwordReset" });
    // Its own fresh cookie lets it in.
    state.cookies.set(ADMIN_DEVICE_SESSION_COOKIE, await cookieAt(Date.now(), "auth-1"));
    expect((await getCurrentAdminAccess()).user).toMatchObject({ id: "auth-1" });
  });

  it("is minted with the account at every sign-in path", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== "__tests__") walk(path);
        } else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
      }
    };
    walk("src");
    const calls = files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/createAdminDeviceSessionCookie\(([^)]*)\)/g)]
        .filter((match) => !/export async function/.test(readFileSync(file, "utf8").slice(Math.max(0, match.index! - 40), match.index!)))
        .map((match) => ({ file, args: match[1].trim() })),
    );
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const call of calls) expect(call.args, call.file).not.toBe("");
  });
});

describe("Google and Apple sign-in after a reset", () => {
  const arrive = () => callback(new NextRequest("https://desk.example/admin/auth/callback?code=abc"));

  it("signs the member in with a new device cookie instead of 'not on the team'", async () => {
    // The browser arrives with no device cookie, or one from before the reset.
    state.cookies.set(ADMIN_DEVICE_SESSION_COOKIE, await cookieAt(Date.parse(RESET_AT) - 60_000, "auth-1"));
    const response = await arrive();
    const location = response.headers.get("location") ?? "";
    expect(location).not.toMatch(/not-on-team/);
    expect(state.signOuts).toEqual([]);
    const minted = response.cookies.get(ADMIN_DEVICE_SESSION_COOKIE)?.value ?? "";
    expect(await adminDeviceSessionIssuedAt(minted, "auth-1")).toBeGreaterThan(Date.parse(RESET_AT));
  });

  it("still turns away someone who is not on the team", async () => {
    state.user = { id: "stranger", email: "stranger@gmail.example", app_metadata: {}, user_metadata: {} };
    state.member = null;
    const response = await arrive();
    expect(response.headers.get("location")).toMatch(/error=not-on-team/);
  });
});

describe("a reset reaches the database, and an unreadable one is said out loud", () => {
  it("ends the account's older sessions through the service function, best effort", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await endSessionsBefore({ rpc }, "auth-1", RESET_AT);
    expect(rpc).toHaveBeenCalledWith("end_sessions_before", { p_user: "auth-1", p_at: RESET_AT });
    // A failure, or a client with no rpc, never stops the reset.
    await expect(endSessionsBefore({ rpc: async () => { throw new Error("offline"); } }, "auth-1", RESET_AT)).resolves.toBeUndefined();
    await expect(endSessionsBefore({}, "auth-1", RESET_AT)).resolves.toBeUndefined();
    await endSessionsBefore({ rpc }, null, RESET_AT);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("is called by every path that records a reset", () => {
    const source = readFileSync("src/lib/actions/team-access.ts", "utf8");
    expect(source.match(/await endSessionsBefore\(/g)).toHaveLength(3);
    expect(source.match(/password_reset_at: passwordResetAt,/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("logs a reset time nobody can read rather than passing over it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(passwordResetAtMs({ password_reset_at: "not a time" })).toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/password_reset_at is not a time/));
    spy.mockClear();
    expect(passwordResetAtMs({ password_reset_at: RESET_AT })).toBe(Date.parse(RESET_AT));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
