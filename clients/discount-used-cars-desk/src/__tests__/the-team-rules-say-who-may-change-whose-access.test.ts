import { describe, expect, it } from "vitest";
import {
  approvalRefusal,
  clearanceAtApproval,
  isSelf,
  nameCorrectionRefusal,
  removalRefusal,
  resetRefusal,
  signingRefusal,
  type TeamActor,
  type TeamTarget,
} from "@/lib/onboarding/team-rules";
import { roleSignsByDefault, TEAM_ROLES } from "@/lib/operations/team";

/**
 * The team screen's rules as pure functions (team-rules.ts), the ones every
 * team action asks on the server (SOP "First sign-in: onboarding", items 1, 4
 * and 6): team:manage acts; only an owner makes or changes an owner; the last
 * active owner stays; nobody resets or removes themselves; clearance and the
 * legal name are an owner's.
 */

const actor = (role: TeamActor["role"], over: Partial<TeamActor> = {}): TeamActor => ({
  role,
  memberId: `${role}-member`,
  authUserId: `${role}-auth`,
  email: `${role}@example.test`,
  ...over,
});

const target = (over: Partial<TeamTarget> = {}): TeamTarget => ({
  id: "t1",
  auth_user_id: "t1-auth",
  email: "t1@example.test",
  role: "sales",
  status: "active",
  full_name: "Jason Price",
  ...over,
});

const code = (refusal: { code: string } | null) => refusal?.code ?? null;

describe("team:manage", () => {
  it.each(TEAM_ROLES.filter((role) => role !== "owner" && role !== "manager"))("is refused to %s for every change", (role) => {
    const a = actor(role);
    expect(code(approvalRefusal(a, target({ status: "pending" }), "sales"))).toBe("notTeamManager");
    expect(code(removalRefusal(a, target(), 1))).toBe("notTeamManager");
    expect(code(resetRefusal(a, target()))).toBe("notTeamManager");
    expect(code(signingRefusal(a, target()))).toBe("notTeamManager");
    expect(code(nameCorrectionRefusal(a, target()))).toBe("notTeamManager");
  });

  it("is refused to a session with no role", () => {
    expect(code(approvalRefusal(actor(null), target({ status: "pending" }), "viewer"))).toBe("notTeamManager");
  });
});

describe("owners", () => {
  it("only an owner approves an owner, or approves an owner's row again", () => {
    expect(code(approvalRefusal(actor("manager"), target({ status: "pending" }), "owner"))).toBe("ownerApprovesOwner");
    expect(code(approvalRefusal(actor("owner"), target({ status: "pending" }), "owner"))).toBeNull();
    expect(code(approvalRefusal(actor("manager"), target({ status: "inactive", role: "owner" }), "sales"))).toBe("ownerChangesOwner");
    expect(code(approvalRefusal(actor("owner"), target({ status: "inactive", role: "owner" }), "sales"))).toBeNull();
  });

  it("never re-approves an active member, so an approval cannot demote anyone", () => {
    expect(code(approvalRefusal(actor("owner"), target({ role: "owner" }), "sales"))).toBe("alreadyActive");
    expect(code(approvalRefusal(actor("owner"), target(), "manager"))).toBe("alreadyActive");
  });

  it("only an owner removes an owner, and never the last active one", () => {
    const owner = target({ role: "owner" });
    expect(code(removalRefusal(actor("manager"), owner, 3))).toBe("ownerChangesOwner");
    expect(code(removalRefusal(actor("owner"), owner, 0))).toBe("lastOwner");
    expect(code(removalRefusal(actor("owner"), owner, 1))).toBeNull();
    // An owner with no access already is not the last active one.
    expect(code(removalRefusal(actor("owner"), target({ role: "owner", status: "inactive" }), 0))).toBe("alreadyRemoved");
  });

  it("never resets an owner's account from the team screen", () => {
    expect(code(resetRefusal(actor("owner"), target({ role: "owner" })))).toBe("ownerNotReset");
    expect(code(resetRefusal(actor("manager"), target({ role: "owner" })))).toBe("ownerNotReset");
  });
});

describe("yourself", () => {
  it.each([
    ["the roster row", { memberId: "t1" }],
    ["the account", { authUserId: "t1-auth" }],
    ["the address, in any case", { email: " T1@Example.test " }],
  ])("is known by %s", (_by, over) => {
    const me = actor("manager", { memberId: "x", authUserId: "y", email: "z@example.test", ...over });
    expect(isSelf(me, target())).toBe(true);
    expect(code(resetRefusal(me, target()))).toBe("notYourselfReset");
    expect(code(removalRefusal(me, target(), 1))).toBe("notYourselfRemove");
  });

  it("is never somebody else with no address or account", () => {
    expect(isSelf(actor("owner", { memberId: null, authUserId: null, email: null }), target({ auth_user_id: null, email: null }))).toBe(false);
  });

  it("an owner may set their own clearance and name", () => {
    const me = actor("owner", { memberId: "t1" });
    expect(code(signingRefusal(me, target({ role: "owner" })))).toBeNull();
    expect(code(nameCorrectionRefusal(me, target({ role: "owner" })))).toBeNull();
  });
});

describe("clearance and the legal name", () => {
  it("are an owner's alone, for an active member", () => {
    expect(code(signingRefusal(actor("manager"), target()))).toBe("ownerSetsSigning");
    expect(code(nameCorrectionRefusal(actor("manager"), target()))).toBe("ownerCorrectsName");
    expect(code(signingRefusal(actor("owner"), target()))).toBeNull();
    expect(code(nameCorrectionRefusal(actor("owner"), target()))).toBeNull();
    expect(code(signingRefusal(actor("owner"), target({ status: "pending" })))).toBe("notActive");
    expect(code(nameCorrectionRefusal(actor("owner"), target({ status: "inactive" })))).toBe("notActive");
  });
});

describe("a reset", () => {
  it("is for an active member with an email", () => {
    expect(code(resetRefusal(actor("manager"), target({ status: "pending" })))).toBe("notActive");
    expect(code(resetRefusal(actor("manager"), target({ email: null })))).toBe("needsEmail");
    expect(code(resetRefusal(actor("manager"), target()))).toBeNull();
  });
});

describe("the clearance an approval writes", () => {
  it.each(TEAM_ROLES)("is the role's default for a new request, whoever approves it (%s)", (role) => {
    for (const who of ["owner", "manager"] as const) {
      expect(clearanceAtApproval(actor(who), target({ status: "pending", can_sign_contracts: false }), role)).toBe(roleSignsByDefault(role));
    }
  });

  it("is the role's default when an owner approves somebody again", () => {
    expect(clearanceAtApproval(actor("owner"), target({ status: "inactive", can_sign_contracts: false }), "registration")).toBe(true);
    expect(clearanceAtApproval(actor("owner"), target({ status: "inactive", can_sign_contracts: true }), "sales")).toBe(false);
  });

  it("is what an owner left on the row when a manager approves somebody again (Remove Access, then Approve Again)", () => {
    // An owner turned signing off for a registration clerk: a manager's re-approval keeps it off.
    expect(clearanceAtApproval(actor("manager"), target({ status: "inactive", role: "registration", can_sign_contracts: false }), "registration")).toBe(false);
    // Sales, not cleared, approved again as Manager: still not cleared.
    expect(clearanceAtApproval(actor("manager"), target({ status: "inactive", can_sign_contracts: false }), "manager")).toBe(false);
    // An owner cleared a salesperson: approved again as Sales, still cleared.
    expect(clearanceAtApproval(actor("manager"), target({ status: "inactive", can_sign_contracts: true }), "sales")).toBe(true);
    // A row with no stored answer is not cleared.
    expect(clearanceAtApproval(actor("manager"), target({ status: "inactive" }), "registration")).toBe(false);
  });
});
