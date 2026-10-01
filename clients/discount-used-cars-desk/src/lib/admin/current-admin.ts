import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  createLocalAdminUser,
  isLocalAdminPreviewEnabled,
  LOCAL_ADMIN_SESSION_COOKIE,
  parseLocalAdminPreviewValue,
} from "@/lib/auth/local-admin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  hasTeamPermission,
  isTeamRole,
  type TeamPermission,
  type TeamRole,
} from "@/lib/operations/team";
import type { TeamMember } from "@/lib/operations/types";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type CurrentAdminAccess = {
  user: User | null;
  member: TeamMember | null;
  role: TeamRole | null;
  service: ServiceClient | null;
  isConfiguredOwner: boolean;
};

function normalizedEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

function isActiveTeamMember(value: TeamMember | null): value is TeamMember {
  return !!value && value.status === "active" && isTeamRole(value.role);
}

function roleFromAppMetadata(user: User): TeamRole | null {
  const status = user.app_metadata?.access_status;
  const role = user.app_metadata?.desk_role;

  if (status !== "active" || typeof role !== "string" || !isTeamRole(role)) {
    return null;
  }

  return role;
}

async function findTeamMember(
  service: ServiceClient,
  user: User,
): Promise<TeamMember | null> {
  const byUser = await service
    .from("team_members")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (byUser.error?.code === "PGRST205") return null;
  if (byUser.error) throw new Error("Team access could not be checked.");
  if (byUser.data) return byUser.data as TeamMember;

  const email = normalizedEmail(user.email);
  if (!email) return null;

  const byEmail = await service
    .from("team_members")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (byEmail.error) throw new Error("Team access could not be checked.");
  if (!byEmail.data) return null;

  const member = byEmail.data as TeamMember;
  if (!member.auth_user_id && member.status === "active") {
    const { data } = await service
      .from("team_members")
      .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
      .eq("id", member.id)
      .select("*")
      .maybeSingle();
    return (data as TeamMember | null) ?? member;
  }

  return member;
}

export async function getCurrentAdminAccess(): Promise<CurrentAdminAccess> {
  if (isLocalAdminPreviewEnabled()) {
    const cookieStore = await cookies();
    const previewValue = cookieStore.get(LOCAL_ADMIN_SESSION_COOKIE)?.value;
    if (previewValue) {
      const preview = parseLocalAdminPreviewValue(previewValue);
      return {
        user: createLocalAdminUser(preview.email, preview.role),
        member: null,
        role: preview.role,
        service: null,
        isConfiguredOwner: preview.role === "owner",
      };
    }
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return {
      user: null,
      member: null,
      role: null,
      service: null,
      isConfiguredOwner: false,
    };
  }

  const email = normalizedEmail(user.email);
  const configuredOwnerEmail = normalizedEmail(process.env.ADMIN_EMAIL);
  const isConfiguredOwner = !!email && email === configuredOwnerEmail;

  let service: ServiceClient | null = null;
  try {
    service = createServiceClient();
  } catch {
    return {
      user,
      member: null,
      role: isConfiguredOwner ? "owner" : roleFromAppMetadata(user),
      service: null,
      isConfiguredOwner,
    };
  }

  let member: TeamMember | null;
  try {
    member = await findTeamMember(service, user);
  } catch {
    return { user, member: null, role: isConfiguredOwner ? "owner" : null, service, isConfiguredOwner };
  }

  if (isActiveTeamMember(member)) {
    return { user, member, role: member.role, service, isConfiguredOwner };
  }

  if (isConfiguredOwner) {
    return { user, member, role: "owner", service, isConfiguredOwner };
  }

  // A roster decision is authoritative even if Auth metadata is older.
  if (member) return { user, member, role: null, service, isConfiguredOwner };

  const metadataRole = roleFromAppMetadata(user);
  if (metadataRole) {
    return { user, member, role: metadataRole, service, isConfiguredOwner };
  }

  return { user, member, role: null, service, isConfiguredOwner };
}

export async function requireCurrentAdminPermission(
  permission: TeamPermission,
): Promise<
  | (CurrentAdminAccess & { ok: true; service: ServiceClient })
  | { ok: false; error: string }
> {
  const access = await getCurrentAdminAccess();

  if (!access.user || !access.service) {
    return { ok: false, error: "Not signed in." };
  }

  if (!hasTeamPermission(access.role, permission)) {
    return { ok: false, error: "Owner or authorized manager access required." };
  }

  return { ...access, ok: true, service: access.service };
}

/**
 * The permission check every mutating server action calls, in-preview or
 * live.
 *
 * `requireCurrentAdminPermission` above demands the service client, which
 * local preview mode does not have — so actions that must work in preview
 * were left checking only `if (!access)`, which never fires because
 * `getCurrentAdminAccess` always returns an object. That decorative guard
 * was the rating's authorization finding. This one is the real thing: a
 * signed-in user whose role holds ANY of the named permissions, service
 * client or not.
 */
export async function requireAdminActionPermission(
  anyOf: TeamPermission | TeamPermission[],
): Promise<
  | (CurrentAdminAccess & { ok: true })
  | { ok: false; error: string }
> {
  const access = await getCurrentAdminAccess();
  if (!access.user) return { ok: false, error: "Sign in first." };

  const wanted = Array.isArray(anyOf) ? anyOf : [anyOf];
  if (!wanted.some((permission) => hasTeamPermission(access.role, permission))) {
    return { ok: false, error: "This role is not allowed to do that." };
  }
  return { ...access, ok: true };
}
