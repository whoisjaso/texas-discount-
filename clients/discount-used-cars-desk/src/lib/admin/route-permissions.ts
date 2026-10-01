import { hasTeamPermission, type TeamPermission, type TeamRole } from "@/lib/operations/team";

/**
 * Which permission opens which admin screen — deny by default.
 *
 * The old table was a list of literal prefixes with `admin:read` as the
 * fallback, and that fallback was the hole the 28-Aug rating named: every
 * live `/admin/sales/**` page missed the stale mappings and fell through
 * to the one permission every role holds. A prefix matcher also cannot
 * tell `/admin/sales` (the list — read) from `/admin/sales/<uuid>/guide`
 * (a mutation corridor), because the deal id is a path segment.
 *
 * So: compiled patterns, most specific first, each carrying the
 * permissions that open it — an ARRAY meaning any-of, because the
 * document corridor genuinely belongs to two roles (sales runs it under
 * sales:manage, registration under paperwork:manage, and neither may
 * borrow the other's unrelated authority — Codex round 4, finding 3).
 *
 * A path no rule knows is DENIED, and a route-matrix test walks every
 * page.tsx in the tree against this table, so the map cannot silently
 * fall behind the filesystem again.
 */

export type RouteVerdict =
  | { kind: "allow"; anyOf: TeamPermission[] }
  | { kind: "exempt" }
  | { kind: "deny" };

/** One path segment that is a record id rather than a literal. */
const ID = "[^/]+";

type Rule = { pattern: RegExp; anyOf: TeamPermission[] };

function rule(source: string, anyOf: TeamPermission[]): Rule {
  return { pattern: new RegExp(`^${source}(?:/|$)`), anyOf };
}

/**
 * Auth screens gate themselves (there is no role before sign-in), so the
 * permission system must not sit in front of them.
 */
const EXEMPT = [
  /^\/admin\/login$/,
  /^\/admin\/signup$/,
  /^\/admin\/recover$/,
  // Where Google and Apple send the browser back: no session exists yet.
  /^\/admin\/auth\/callback$/,
];

/**
 * Most specific first. The matcher takes the FIRST hit, so a deal's guide
 * must come before the deal, and the deal before the list.
 */
const RULES: Rule[] = [
  // ---- The sale corridor ----
  rule(`/admin/sales/new`, ["sales:manage"]),
  rule(`/admin/dealership/sales/new`, ["sales:manage"]), // retired; redirects to /admin/sales/new
  // The document corridor is document/title work: either scope opens it.
  rule(`/admin/sales/${ID}/paperwork`, ["sales:manage", "paperwork:manage"]),
  rule(`/admin/sales/${ID}/guide`, ["sales:manage"]),
  rule(`/admin/sales/${ID}/step`, ["sales:manage"]),
  // Detail and packet are read/print screens; finance and registration
  // must open the deals they process (Codex round 3, finding 1).
  rule(`/admin/sales/${ID}/packet`, ["sales:read"]),
  rule(`/admin/sales/past`, ["sales:read"]),
  // Above the ${ID} rule below it on purpose: "times" is not a UUID, so it
  // would otherwise fall through to the bare /admin/sales rule by accident
  // rather than by decision. Reading times is reading sales.
  rule(`/admin/sales/times`, ["sales:read"]),
  // Above the ${ID} rule for the same reason: "promises" is not a UUID.
  rule(`/admin/sales/promises`, ["sales:read"]),
  rule(`/admin/sales/${ID}`, ["sales:read"]),
  rule(`/admin/sales`, ["sales:read"]),

  // ---- Money ----
  rule(`/admin/reports/pnl`, ["payments:manage"]), // company financials: owner + manager
  rule(`/admin/dealership/payments`, ["payments:read"]),
  rule(`/admin/payments`, ["payments:read"]),
  rule(`/admin/dealership/financing`, ["payments:read"]),
  rule(`/admin/dealership/costs`, ["payments:read"]),
  rule(`/admin/dealership/money-check`, ["payments:read"]),
  rule(`/admin/dealership/analytics`, ["payments:read"]),
  rule(`/admin/analytics`, ["payments:read"]),

  // ---- People ----
  rule(`/admin/customers/new`, ["payments:manage"]),
  rule(`/admin/customers`, ["payments:read"]),
  rule(`/admin/dealership/customers`, ["payments:read"]),
  // Sending a pre-approval invitation creates a lead when the client is new.
  rule(`/admin/dealership/leads/pre-approval`, ["leads:manage", "leads:read"]),
  rule(`/admin/dealership/leads`, ["leads:read"]),
  rule(`/admin/leads/pre-approval`, ["leads:manage", "leads:read"]),
  rule(`/admin/leads`, ["leads:read"]),
  rule(`/admin/marketplace`, ["leads:read"]),

  // ---- Inventory ----
  rule(`/admin/inventory/new`, ["inventory:manage"]),
  // The title-status resolve screen the Start Sale gate points at: marking a
  // verified title is inventory authority, not sales authority.
  rule(`/admin/inventory/title-status`, ["inventory:manage"]),
  // A salvage car's path to a rebuilt title: the same inventory authority.
  rule(`/admin/inventory/${ID}/title-work`, ["inventory:manage"]),
  rule(`/admin/inventory/${ID}/edit`, ["inventory:manage"]),
  rule(`/admin/dealership/inventory/new`, ["inventory:manage"]),
  rule(`/admin/dealership/inventory/${ID}/edit`, ["inventory:manage"]),
  rule(`/admin/dealership/inventory`, ["inventory:read"]),
  rule(`/admin/inventory`, ["inventory:read"]),
  rule(`/admin/dealership/fleet-census`, ["inventory:manage"]),
  rule(`/admin/fleet-census`, ["inventory:manage"]),
  // Its own preview API already demands inventory:manage; the screen that
  // drives it demands the same (Codex round 1, finding 5).
  rule(`/admin/auction-intake/review/${ID}`, ["inventory:manage"]),
  // One auction house, and the upload by hand: the same authority as the queue.
  rule(`/admin/auction-intake/${ID}`, ["inventory:manage"]),
  rule(`/admin/auction-intake`, ["inventory:manage"]),

  // ---- Documents and templates ----
  rule(`/admin/dealership/records/new`, ["documents:manage"]),
  rule(`/admin/dealership/records`, ["documents:read"]),
  rule(`/admin/dealership/agreements`, ["documents:read"]),
  rule(`/admin/agreements`, ["documents:read"]),
  rule(`/admin/dealership/documents`, ["documents:read"]),
  // The template editors write dealership-wide document defaults.
  rule(`/admin/documents`, ["documents:manage"]),
  rule(`/admin/templates`, ["documents:manage"]),
  rule(`/admin/dealership/registration-training`, ["documents:read"]),
  rule(`/admin/videos`, ["documents:read"]),
  rule(`/admin/paperwork`, ["paperwork:read"]),

  // ---- Rentals (retired product, screens still reachable) ----
  rule(`/admin/rental/fleet-census`, ["inventory:manage"]),
  rule(`/admin/rentals/new`, ["rentals:manage"]),
  rule(`/admin/rentals/decisions`, ["rentals:manage"]),
  rule(`/admin/rentals/hardship`, ["rentals:manage"]),
  rule(`/admin/rental/new`, ["rentals:manage"]),
  rule(`/admin/rental`, ["rentals:read"]),
  rule(`/admin/rentals`, ["rentals:read"]),

  // ---- Team and account ----
  rule(`/admin/team/api-keys`, ["team:manage"]),
  rule(`/admin/team`, ["team:manage"]),
  rule(`/admin/dealership/team`, ["team:manage"]),
  rule(`/admin/dealership/settings`, ["admin:read"]),
  rule(`/admin/dealership/automation`, ["admin:read"]),
  rule(`/admin/automation`, ["admin:read"]),
  rule(`/admin/account/onboarding`, ["admin:read"]),
  rule(`/admin/account/password`, ["admin:read"]),
  // Their own photo, name, handle and bio: every active role has a face.
  rule(`/admin/account/profile`, ["admin:read"]),
  // Every active role reaches its own signature screen. Whether a
  // signature may be recorded is can_sign_contracts, a per-person fact
  // the action decides.
  rule(`/admin/account/signature`, ["admin:read"]),

  // ---- Working home ----
  rule(`/admin/hermes-os`, ["tasks:manage"]),
  /*
    Owner only. `admin:read` is the permission every role holds, so this
    screen opened for all nine of them. It generates a day's task list across
    money, paperwork and the lot, which is an owner's view of the business
    rather than any one lane's work, and the day's work that a lane actually
    needs now shows on the desk instead. `admin:all` is held by owner alone.
  */
  rule(`/admin/operations`, ["admin:all"]),
  rule(`/admin/start-here`, ["admin:read"]),
  rule(`/admin/home`, ["admin:read"]),
  rule(`/admin/dealership/dashboard`, ["admin:read"]),
  // The day's work, off the desk and on its own screen. Every one of the nine
  // roles holds admin:read, and the rows filter themselves: a job is drawn
  // only when the viewer can open the screen that closes it.
  rule(`/admin/what-to-do`, ["admin:read"]),
  rule(`/admin/dealership`, ["inventory:read"]),
];

const ROOT = /^\/admin$/;

export function getAdminRouteVerdict(pathname: string): RouteVerdict {
  const cleanPath = (pathname.split("?")[0] || "/admin").replace(/\/+$/, "") || "/admin";
  if (EXEMPT.some((pattern) => pattern.test(cleanPath))) return { kind: "exempt" };
  if (ROOT.test(cleanPath)) return { kind: "allow", anyOf: ["admin:read"] };
  const hit = RULES.find(({ pattern }) => pattern.test(cleanPath));
  if (hit) return { kind: "allow", anyOf: hit.anyOf };
  // Not the fallback permission — the fallback is the door staying shut.
  return { kind: "deny" };
}

/** Whether this role opens this path, deny-by-default. */
export function roleOpensAdminRoute(
  role: TeamRole | null | undefined,
  pathname: string,
): boolean {
  const verdict = getAdminRouteVerdict(pathname);
  if (verdict.kind === "exempt") return true;
  if (verdict.kind === "deny") return false;
  return verdict.anyOf.some((permission) => hasTeamPermission(role, permission));
}

