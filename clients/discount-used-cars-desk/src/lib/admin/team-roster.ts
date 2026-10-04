import type { CurrentAdminAccess } from "@/lib/admin/current-admin";
import { isLocalAdminPreviewEnabled } from "@/lib/auth/local-admin";
import { dealership } from "@/lib/dealership-config";
import { onboardedSignerName } from "@/lib/documents/dealer-signer";
import { onboardingNameParts } from "@/lib/onboarding/staff-name";
import { isSelf, type TeamActor } from "@/lib/onboarding/team-rules";
import { isTeamRole, ROLE_LABELS, roleSignsByDefault, type TeamRole } from "@/lib/operations/team";
import type { TeamMember } from "@/lib/operations/types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * What the team screen shows: the access requests waiting for an owner or a
 * manager, the team, the people whose access was removed, and the last team
 * changes on record (team_activity_events), each already in words.
 *
 * Read with the service client after the page has checked `team:manage`
 * (route-permissions.ts and the page itself). In local preview the session has
 * no service client, so the in-memory mock is read instead; preview is
 * always off in production.
 */

export type TeamPerson = {
  id: string;
  /** The legal name as it stands on the row ("First Last" once onboarding saved it). */
  name: string;
  email: string | null;
  role: TeamRole;
  roleLabel: string;
  status: "pending" | "active" | "inactive";
  canSign: boolean;
  /** For a request: whether the requested role starts cleared to sign. */
  roleSignsByDefault: boolean;
  onboardingFinished: boolean;
  /** Whether a filing by this person would print their name on the dealer line today. */
  printsOnPaper: boolean;
  signatureOnFile: boolean;
  /** The two parts onboarding saved, for Correct Name's boxes (never guessed from a signup name). */
  first: string;
  last: string;
  /** When the request (or the row) was made, in the dealership's time zone. */
  since: string;
  /** The same moment as stored, for ordering. */
  createdAt: string;
  note: string | null;
  isSelf: boolean;
};

export type TeamHistoryLine = { id: string; at: string; body: string };

export type TeamRoster = {
  ok: boolean;
  requests: TeamPerson[];
  members: TeamPerson[];
  removed: TeamPerson[];
  activeOwners: number;
  history: TeamHistoryLine[];
};

function when(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    timeZone: dealership.timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function person(member: TeamMember, actor: TeamActor): TeamPerson | null {
  if (!isTeamRole(member.role)) return null;
  const status = member.status === "active" || member.status === "inactive" ? member.status : "pending";
  const parts = onboardingNameParts(member);
  return {
    id: member.id,
    name: member.full_name?.trim() ?? "",
    email: member.email?.trim() || null,
    role: member.role,
    roleLabel: ROLE_LABELS[member.role],
    status,
    canSign: member.can_sign_contracts === true,
    roleSignsByDefault: roleSignsByDefault(member.role),
    onboardingFinished: Boolean(member.onboarding_completed_at),
    printsOnPaper: Boolean(onboardedSignerName(member)),
    signatureOnFile: Boolean(member.signature_data_url),
    first: parts.first,
    last: parts.last,
    since: when(member.created_at),
    createdAt: member.created_at ?? "",
    note: member.last_invite_error?.trim() || null,
    isSelf: isSelf(actor, member),
  };
}

const byName = (a: TeamPerson, b: TeamPerson) => (a.name || a.email || "").localeCompare(b.name || b.email || "");

export async function getTeamRoster(access: CurrentAdminAccess): Promise<TeamRoster> {
  const empty: TeamRoster = { ok: false, requests: [], members: [], removed: [], activeOwners: 0, history: [] };
  let service = access.service;
  if (!service && isLocalAdminPreviewEnabled()) service = createServiceClient();
  if (!service) return empty;

  const actor: TeamActor = {
    role: access.role,
    memberId: access.member?.id ?? null,
    authUserId: access.user?.id ?? null,
    email: access.user?.email ?? null,
  };

  const { data, error } = await service.from("team_members").select("*").order("created_at", { ascending: true });
  if (error) return empty;
  const people = ((data ?? []) as TeamMember[])
    .map((member) => person(member, actor))
    .filter((entry): entry is TeamPerson => entry !== null);

  const requests = people
    .filter((entry) => entry.status === "pending")
    // Oldest first: the one waiting longest is at the top.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const members = people.filter((entry) => entry.status === "active").sort(byName);
  const removed = people.filter((entry) => entry.status === "inactive").sort(byName);

  let history: TeamHistoryLine[] = [];
  try {
    const { data: events } = await service
      .from("team_activity_events")
      .select("id, created_at, body, event_type")
      .eq("entity_type", "team_member")
      .order("created_at", { ascending: false })
      .limit(25);
    history = ((events ?? []) as Array<{ id: string; created_at: string; body: string }>)
      .filter((event) => typeof event.body === "string" && event.body.trim())
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, 25)
      .map((event) => ({ id: event.id, at: when(event.created_at), body: event.body.trim() }));
  } catch {
    history = [];
  }

  return {
    ok: true,
    requests,
    members,
    removed,
    activeOwners: members.filter((entry) => entry.role === "owner").length,
    history,
  };
}
