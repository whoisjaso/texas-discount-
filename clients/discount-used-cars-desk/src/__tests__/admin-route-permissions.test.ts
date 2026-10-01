import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  getAdminRouteVerdict,
  roleOpensAdminRoute,
} from "@/lib/admin/route-permissions";
import { TEAM_ROLES, type TeamRole } from "@/lib/operations/team";

/**
 * Deny-by-default, proven three ways.
 *
 * The 28-Aug rating's worst authorization finding was structural: the old
 * table's fallback granted `admin:read` — a permission every role holds —
 * to any path it did not know, and it did not know any of the live sale
 * routes. These tests make that failure impossible to reintroduce:
 * an unknown path is DENIED, every real page must resolve to a rule, and
 * a matrix of concrete UUID-shaped URLs pins who opens what.
 */

const DEAL = "3f2b8c1d-9a4e-4f6b-8c1d-2e5a7b9c0d1f";

describe("unknown admin paths are denied, not defaulted", () => {
  it.each([
    "/admin/definitely-not-a-screen",
    "/admin/sales-export",
    `/admin/deals/${DEAL}`,
    "/admin/api-console",
  ])("%s → deny", (path) => {
    expect(getAdminRouteVerdict(path)).toEqual({ kind: "deny" });
    for (const role of TEAM_ROLES) {
      expect(roleOpensAdminRoute(role, path)).toBe(false);
    }
  });

  it("exempts exactly the auth screens", () => {
    expect(getAdminRouteVerdict("/admin/login")).toEqual({ kind: "exempt" });
    expect(getAdminRouteVerdict("/admin/signup")).toEqual({ kind: "exempt" });
    // The provider return: a code and no session yet.
    expect(getAdminRouteVerdict("/admin/auth/callback")).toEqual({ kind: "exempt" });
    // Not their descendants — an exemption is not a prefix.
    expect(getAdminRouteVerdict("/admin/login/whatever")).toEqual({ kind: "deny" });
  });
});

describe("the concrete-URL matrix", () => {
  /**
   * Real URL shapes — segment ids included, because the prefix matcher
   * this replaced could not tell the deal list from a deal's corridor
   * (Codex round 1, finding 1).
   */
  const MATRIX: Array<[path: string, opens: TeamRole[], shut: TeamRole[]]> = [
    // The corridor: selling roles only.
    [`/admin/sales/new`, ["owner", "manager", "sales"], ["finance", "registration", "viewer", "mechanic", "social", "lot"]],
    [`/admin/sales/${DEAL}/guide/money`, ["owner", "manager", "sales"], ["finance", "registration", "viewer"]],
    [`/admin/sales/${DEAL}/step/paid`, ["owner", "manager", "sales"], ["viewer", "finance"]],
    // The document corridor: selling OR title work (either-predicate).
    [`/admin/sales/${DEAL}/paperwork/billOfSale/start`, ["owner", "manager", "sales", "registration"], ["finance", "viewer", "lot"]],
    // Read/print screens: the roles that process deals can open them.
    [`/admin/sales`, ["owner", "manager", "sales", "finance", "registration"], ["viewer", "mechanic", "social", "lot"]],
    [`/admin/sales/past`, ["owner", "manager", "sales", "finance", "registration"], ["viewer"]],
    [`/admin/sales/${DEAL}`, ["owner", "manager", "sales", "finance", "registration"], ["viewer", "social"]],
    [`/admin/sales/${DEAL}/packet`, ["owner", "manager", "sales", "finance", "registration"], ["viewer", "mechanic"]],
    // Money.
    [`/admin/reports/pnl`, ["owner", "manager"], ["sales", "finance", "viewer", "registration"]],
    [`/admin/dealership/payments`, ["owner", "manager", "finance"], ["mechanic", "social", "lot", "viewer"]],
    // People and metal.
    [`/admin/customers/new`, ["owner", "manager"], ["sales", "finance", "viewer"]],
    [`/admin/auction-intake`, ["owner", "manager"], ["sales", "viewer", "finance"]],
    [`/admin/dealership/inventory/mock-1/edit`, ["owner", "manager"], ["sales", "viewer", "lot"]],
    [`/admin/dealership/inventory`, ["owner", "manager", "sales", "mechanic", "registration", "social", "lot"], ["viewer"]],
    // Templates write dealership-wide defaults.
    [`/admin/templates`, ["owner", "manager"], ["sales", "registration", "viewer"]],
    [`/admin/documents/bill-of-sale`, ["owner", "manager"], ["sales", "viewer"]],
    // Team.
    [`/admin/team/api-keys`, ["owner", "manager"], ["sales", "finance", "viewer"]],
    // Everyone's screens.
    [`/admin/home`, [...TEAM_ROLES], []],
    [`/admin/account/signature`, [...TEAM_ROLES], []],
    [`/admin/start-here`, [...TEAM_ROLES], []],
  ];

  it.each(MATRIX)("%s", (path, opens, shut) => {
    for (const role of opens) {
      expect(roleOpensAdminRoute(role, path), `${role} should open ${path}`).toBe(true);
    }
    for (const role of shut) {
      expect(roleOpensAdminRoute(role, path), `${role} should NOT open ${path}`).toBe(false);
    }
    // Nobody without a role opens anything.
    expect(roleOpensAdminRoute(null, path)).toBe(false);
  });
});

describe("the filesystem never outruns the table", () => {
  /** Every page.tsx under /admin, as the URL it serves. */
  function* pages(dir: string, urlBase: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* pages(at, `${urlBase}/${entry.name}`);
      } else if (entry.name === "page.tsx") {
        yield urlBase;
      }
    }
  }

  it("resolves every live admin page to a rule or an exemption — never deny", () => {
    const missing: string[] = [];
    for (const route of pages("src/app/admin", "/admin")) {
      // Dynamic segments become UUID-shaped ids, which is what a real
      // request carries — testing the literal [dealId] would pass against
      // a matcher that fails every actual URL (Codex round 1, finding 1).
      const concrete = route.replace(/\[[^\]]+\]/g, DEAL);
      const verdict = getAdminRouteVerdict(concrete);
      if (verdict.kind === "deny") missing.push(`${route} (as ${concrete})`);
    }
    expect(missing).toEqual([]);
  });

  it("gives the owner every screen and the viewer only read-only surfaces", () => {
    for (const route of pages("src/app/admin", "/admin")) {
      const concrete = route.replace(/\[[^\]]+\]/g, DEAL);
      const verdict = getAdminRouteVerdict(concrete);
      if (verdict.kind !== "allow") continue;
      expect(roleOpensAdminRoute("owner", concrete), `owner blocked from ${concrete}`).toBe(true);
      // The viewer's whole role is "read-only training and visibility":
      // any screen it opens must be gated by a :read (or admin:read)
      // permission, never a :manage one.
      if (roleOpensAdminRoute("viewer", concrete)) {
        expect(
          verdict.anyOf.some((p) => p.endsWith(":read")),
          `viewer opens ${concrete} which requires only [${verdict.anyOf.join(", ")}]`,
        ).toBe(true);
      }
    }
  });
});
