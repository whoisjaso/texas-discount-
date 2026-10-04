import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { getAdminRouteVerdict, roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { TEAM_ROLES } from "@/lib/operations/team";

/**
 * Every place the admin layout and the sign-in destination send somebody is a
 * real page.
 *
 * The layout sent every active member who had not onboarded, and anyone on a
 * temporary password, to /admin/account/onboarding, and that page did not
 * exist: every new member's first sign-in landed on a 404. The SOP's own
 * warning ("First sign-in: onboarding"): a redirect to a missing route locks
 * every new member out. This fails the build if that ever happens again.
 *
 * The helpers are local copies of the redirect sweep's, so that file's tests
 * are not registered twice by importing it.
 */

function redirectTargets(source: string): string[] {
  const targets: string[] = [];
  for (const match of source.matchAll(/redirect\(\s*(DEALERSHIP_HOME|"([^"?#]+)[^"]*")\s*\)/g)) {
    targets.push(match[2] ?? DEALERSHIP_HOME);
  }
  for (const match of source.matchAll(/return\s+(DEALERSHIP_HOME|"(\/admin[^"?#]*)")/g)) {
    targets.push(match[2] ?? DEALERSHIP_HOME);
  }
  return [...new Set(targets)];
}

function pageFile(route: string): string {
  return `src/app${route}/page.tsx`;
}

function isRedirectOnly(route: string): boolean {
  const file = pageFile(route);
  if (!existsSync(file)) return false;
  const source = readFileSync(file, "utf8");
  if (!/\bredirect\(/.test(source)) return false;
  return !/return\s*\(/.test(source) && !/=>\s*\(/.test(source);
}

const LAYOUT = readFileSync("src/app/admin/layout.tsx", "utf8");
const DESTINATION = readFileSync("src/lib/auth/destination.ts", "utf8");

describe("the layout and the sign-in destination", () => {
  const targets = [...new Set([...redirectTargets(LAYOUT), ...redirectTargets(DESTINATION)])];

  it("found the onboarding redirect to check", () => {
    expect(targets).toContain("/admin/account/onboarding");
    expect(targets).toContain(DEALERSHIP_HOME);
  });

  it.each(targets)("sends people to %s, which is a page that renders", (route) => {
    expect(existsSync(pageFile(route)), `${pageFile(route)} is missing`).toBe(true);
    expect(isRedirectOnly(route)).toBe(false);
  });
});

describe("the onboarding route", () => {
  it("is allowed by the route table", () => {
    expect(getAdminRouteVerdict("/admin/account/onboarding")).toEqual({ kind: "allow", anyOf: ["admin:read"] });
  });

  it.each(TEAM_ROLES)("opens for %s", (role) => {
    expect(roleOpensAdminRoute(role, "/admin/account/onboarding")).toBe(true);
  });

  it("does not open without a role", () => {
    expect(roleOpensAdminRoute(null, "/admin/account/onboarding")).toBe(false);
  });
});
