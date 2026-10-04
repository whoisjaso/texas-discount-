import { signerFitsSellerLine } from "@/lib/fill-130u/seller-line-fit";
import {
  checkStaffNamePart,
  staffFullName,
  STAFF_NAME_PART_MAX,
  type NamePartProblem,
} from "@/lib/onboarding/staff-name";
import {
  hasTeamPermission,
  ROLE_LABELS,
  roleSignsByDefault,
  TEAM_ROLES,
  type TeamRole,
} from "@/lib/operations/team";

/**
 * Who may change whose access on the team screen, as one set of pure rules.
 *
 * The team screen (/admin/dealership/team) hides a control a person may not
 * use, but hiding is not the rule: every action in team-access.ts asks these
 * functions again on the server, with the role read from the roster, and the
 * database refuses the same changes to a signed-in session that goes around
 * the desk (migration 20261004000000_team_member_guards.sql). SOP "First
 * sign-in: onboarding", items 1, 4 and 6:
 *
 * - `team:manage` (Owner, Manager) approves, denies, resets and removes.
 * - Only an owner makes an owner, or changes anything about an owner.
 * - The last active owner is never removed or demoted: the desk would be
 *   left with nobody who can set the fees or approve another owner.
 * - Nobody resets or removes themselves from the team screen.
 * - Who is cleared to sign, and the legal name that prints on the 130-U
 *   seller line and the VTR-61, are changed by an owner alone, and Remove
 *   Access then Approve Again is no way round that (`clearanceAtApproval`).
 */

export type TeamActor = {
  role: TeamRole | null;
  /** The actor's roster row id, when they have one. */
  memberId: string | null;
  authUserId: string | null;
  email: string | null;
};

export type TeamTarget = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  role: TeamRole;
  status: "pending" | "active" | "inactive";
  full_name?: string | null;
  /** The clearance an owner left on the row (SOP item 4). */
  can_sign_contracts?: boolean | null;
};

export type TeamRefusalCode =
  | "notTeamManager"
  | "ownerApprovesOwner"
  | "ownerChangesOwner"
  | "lastOwner"
  | "notYourselfReset"
  | "notYourselfRemove"
  | "ownerSetsSigning"
  | "ownerCorrectsName"
  | "alreadyActive"
  | "alreadyRemoved"
  | "notActive"
  | "ownerNotReset"
  | "needsEmail";

export type TeamRefusal = { code: TeamRefusalCode; error: string };

function personName(target: TeamTarget): string {
  return target.full_name?.trim() || target.email?.trim() || "This team member";
}

/** The sentence for each refusal. The first two are the actions' own, kept word for word. */
export function teamRefusalSentence(code: TeamRefusalCode, target?: TeamTarget): string {
  const name = target ? personName(target) : "This team member";
  switch (code) {
    case "notTeamManager":
      return "Owner or authorized manager access required.";
    case "ownerApprovesOwner":
      return "Only an owner can approve another owner.";
    case "ownerChangesOwner":
      return "Only an owner can change an owner's access.";
    case "lastOwner":
      return "This is the last active owner. Approve another owner first, so the desk is never left without one.";
    case "notYourselfReset":
      return "You cannot reset your own access. To change your password, use Forgot Your Password on the sign-in screen.";
    case "notYourselfRemove":
      return "You cannot remove your own access.";
    case "ownerSetsSigning":
      return "Only an owner can change who is cleared to sign.";
    case "ownerCorrectsName":
      return "Only an owner can correct a team member's name.";
    case "alreadyActive":
      return `${name} already has access.`;
    case "alreadyRemoved":
      return `${name} already has no access.`;
    case "notActive":
      return `${name} is not active yet.`;
    case "ownerNotReset":
      return "Owner accounts are not reset from the team screen.";
    case "needsEmail":
      return `${name} needs an email first.`;
  }
}

function refuse(code: TeamRefusalCode, target?: TeamTarget): TeamRefusal {
  return { code, error: teamRefusalSentence(code, target) };
}

function normalizedEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

/** Whether the person acting is the person the row belongs to. */
export function isSelf(actor: TeamActor, target: TeamTarget): boolean {
  if (actor.memberId && actor.memberId === target.id) return true;
  if (actor.authUserId && target.auth_user_id && actor.authUserId === target.auth_user_id) return true;
  const mine = normalizedEmail(actor.email);
  return Boolean(mine && mine === normalizedEmail(target.email));
}

function managesTeam(actor: TeamActor): boolean {
  return hasTeamPermission(actor.role, "team:manage");
}

function isOwner(actor: TeamActor): boolean {
  return hasTeamPermission(actor.role, "admin:all");
}

/**
 * Approving a request (or a person who had no access) with a role. An active
 * member is never re-approved: that would be a role change and a password
 * reset in one tap, and it is how a manager could demote an owner.
 */
export function approvalRefusal(actor: TeamActor, target: TeamTarget, role: TeamRole): TeamRefusal | null {
  if (!managesTeam(actor)) return refuse("notTeamManager", target);
  if (role === "owner" && !isOwner(actor)) return refuse("ownerApprovesOwner", target);
  if (target.role === "owner" && !isOwner(actor)) return refuse("ownerChangesOwner", target);
  if (target.status === "active") return refuse("alreadyActive", target);
  return null;
}

/**
 * Denying a request, or removing an active member's access (status
 * inactive). `otherActiveOwners` is how many active owners there are besides
 * this row; it matters only when the row is itself an active owner.
 */
export function removalRefusal(
  actor: TeamActor,
  target: TeamTarget,
  otherActiveOwners: number,
): TeamRefusal | null {
  if (!managesTeam(actor)) return refuse("notTeamManager", target);
  if (isSelf(actor, target)) return refuse("notYourselfRemove", target);
  if (target.role === "owner" && !isOwner(actor)) return refuse("ownerChangesOwner", target);
  if (target.role === "owner" && target.status === "active" && otherActiveOwners < 1) {
    return refuse("lastOwner", target);
  }
  if (target.status === "inactive") return refuse("alreadyRemoved", target);
  return null;
}

/**
 * Resetting a member's access (SOP item 1): an active member only, never an
 * owner account, never yourself.
 */
export function resetRefusal(actor: TeamActor, target: TeamTarget): TeamRefusal | null {
  if (!managesTeam(actor)) return refuse("notTeamManager", target);
  if (isSelf(actor, target)) return refuse("notYourselfReset", target);
  if (target.role === "owner") return refuse("ownerNotReset", target);
  if (!normalizedEmail(target.email)) return refuse("needsEmail", target);
  if (target.status !== "active") return refuse("notActive", target);
  return null;
}

/** Who is cleared to sign: an owner's choice, per person (SOP item 4). */
export function signingRefusal(actor: TeamActor, target: TeamTarget): TeamRefusal | null {
  if (!managesTeam(actor)) return refuse("notTeamManager", target);
  if (!isOwner(actor)) return refuse("ownerSetsSigning", target);
  if (target.status !== "active") return refuse("notActive", target);
  return null;
}

/** The legal name that prints on the dealer line: an owner corrects it (SOP item 6). */
export function nameCorrectionRefusal(actor: TeamActor, target: TeamTarget): TeamRefusal | null {
  if (!managesTeam(actor)) return refuse("notTeamManager", target);
  if (!isOwner(actor)) return refuse("ownerCorrectsName", target);
  if (target.status !== "active") return refuse("notActive", target);
  return null;
}

/**
 * The signing clearance an approval writes (SOP item 4). A new request starts
 * with its role's default (Owner, Manager and Registration cleared), whoever
 * approves it, and so does anyone an owner approves. A person who had access
 * before (No Access, approved again) keeps the clearance an owner left on
 * their row when anyone else approves them: only an owner changes who is
 * cleared to sign, so a manager's Remove Access then Approve Again, into the
 * same role or one that signs by default, changes neither way.
 */
export function clearanceAtApproval(actor: TeamActor, target: TeamTarget, role: TeamRole): boolean {
  return approvalKeepsClearance(actor, target) ? target.can_sign_contracts === true : roleSignsByDefault(role);
}

/** Whether an approval keeps the row's clearance rather than writing the role's default (above). */
export function approvalKeepsClearance(actor: TeamActor, target: TeamTarget): boolean {
  return !isOwner(actor) && target.status !== "pending";
}

/** The roles an approver may hand out, Owner only to an owner, each with its signing default. */
export function approvalRoleOptions(actorRole: TeamRole | null): Array<{
  role: TeamRole;
  label: string;
  signsByDefault: boolean;
}> {
  return TEAM_ROLES.filter((role) => role !== "owner" || actorRole === "owner").map((role) => ({
    role,
    label: ROLE_LABELS[role],
    signsByDefault: roleSignsByDefault(role),
  }));
}

export type CorrectedNameProblem = NamePartProblem | { code: "tooLongForForm" };

export type CorrectedName =
  | { ok: true; first: string; last: string; fullName: string }
  | { ok: false; problem: CorrectedNameProblem; error: string };

/** The owner-facing sentence for a refused name (the onboarding rules, said about someone else). */
export function correctedNameSentence(problem: CorrectedNameProblem): string {
  if (problem.code === "tooLongForForm") {
    return "That full name is too long to print in full on the state form's seller line. Enter it as it is printed on their ID.";
  }
  const label = problem.part === "last" ? "last name" : "first name";
  switch (problem.code) {
    case "empty":
      return `Enter the ${label}.`;
    case "tooLong":
      return `The ${label} is longer than ${problem.max} characters. Enter it as it is on their ID.`;
    case "badChars":
      return `Use only letters, spaces, apostrophes, periods and hyphens in the ${label}.`;
    case "unprintable":
      return `The state form cannot print "${problem.char}" in the ${label}. Type it the way it is printed on their ID.`;
  }
}

/**
 * The corrected legal name, by exactly the rules the onboarding name step
 * uses (staff-name.ts: two required parts, at most 60 characters each,
 * letters, spaces, apostrophes, periods and hyphens only, every character
 * printable in the state form's WinAnsi font, and "(First Last)" fitting the
 * 130-U seller box at the 7.25pt floor). Kept as typed: trimmed, spaces
 * collapsed, never re-cased.
 */
export function checkCorrectedName(rawFirst: unknown, rawLast: unknown): CorrectedName {
  const first = checkStaffNamePart(rawFirst, "first");
  if (!first.ok) {
    const { ok: _ok, ...problem } = first;
    void _ok;
    return { ok: false, problem, error: correctedNameSentence(problem) };
  }
  const last = checkStaffNamePart(rawLast, "last");
  if (!last.ok) {
    const { ok: _ok, ...problem } = last;
    void _ok;
    return { ok: false, problem, error: correctedNameSentence(problem) };
  }
  const fullName = staffFullName(first.value, last.value);
  if (!signerFitsSellerLine(fullName)) {
    const problem = { code: "tooLongForForm" } as const;
    return { ok: false, problem, error: correctedNameSentence(problem) };
  }
  return { ok: true, first: first.value, last: last.value, fullName };
}

export { STAFF_NAME_PART_MAX };
