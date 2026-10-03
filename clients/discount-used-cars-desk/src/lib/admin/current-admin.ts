import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  createLocalAdminUser,
  isLocalAdminPreviewEnabled,
  LOCAL_ADMIN_SESSION_COOKIE,
  LOCAL_ADMIN_SIGNED_IN_COOKIE,
  parseLocalAdminPreviewValue,
} from "@/lib/auth/local-admin";
import { ADMIN_DEVICE_SESSION_COOKIE, adminDeviceSessionIssuedAt } from "@/lib/auth/admin-device-session";
import {
  earliestAuthenticationMs,
  passwordResetAtMs,
  previewSignedInAtMs,
  sessionPredatesReset,
  SIGNED_OUT_RESET_MESSAGE,
} from "@/lib/auth/password-reset-cutoff";
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
  /**
   * Set when this session signed in before the account's last password
   * reset (owner's decision 10/02/2026): the session is treated as signed
   * out, and the layout sends it to sign in again with a one-line notice.
   */
  signedOut?: "passwordReset";
};

/** A session the account's password reset ended. */
function signedOutByReset(): CurrentAdminAccess {
  return { user: null, member: null, role: null, service: null, isConfiguredOwner: false, signedOut: "passwordReset" };
}

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

/**
 * The preview session's own roster row, when the preview mock holds one.
 *
 * Preview only (the caller is inside the preview branch, and the service
 * client is the in-memory mock there). The mock holds a row only when
 * DESK_PREVIEW_MEMBER asks for one, so with the flag unset this is null and
 * preview behaves exactly as before. With it set, a fresh member (no name,
 * no signature, onboarding not completed) can be walked through onboarding
 * and on into a sale, as the SOP asks ("First sign-in: onboarding").
 */
async function previewTeamMember(user: User): Promise<TeamMember | null> {
  try {
    const { data } = await createServiceClient()
      .from("team_members")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    return (data as TeamMember | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * The preview account's app_metadata as the preview mock's auth holds it,
 * laid over the built-in preview user. Preview only, like the row above:
 * empty unless DESK_PREVIEW_MEMBER asks for an account still on a temporary
 * password, so the onboarding password screen can be walked and its write
 * (which clears the flag) seen by the layout.
 */
async function previewAppMetadata(user: User): Promise<Record<string, unknown>> {
  try {
    const { data } = await createServiceClient().auth.admin.getUserById(user.id);
    const held = data?.user?.app_metadata;
    return held && typeof held === "object" ? (held as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function getCurrentAdminAccess(
  options: {
    /**
     * The device cookie this very request is minting, for a sign-in path that
     * checks the team before the response carries it (the OAuth callback).
     * Without it, a reset account's first OAuth sign-in read the request's old
     * or missing cookie and was signed straight back out as "not on team".
     */
    deviceCookie?: string;
  } = {},
): Promise<CurrentAdminAccess> {
  if (isLocalAdminPreviewEnabled()) {
    const cookieStore = await cookies();
    const previewValue = cookieStore.get(LOCAL_ADMIN_SESSION_COOKIE)?.value;
    if (previewValue) {
      const preview = parseLocalAdminPreviewValue(previewValue);
      const built = createLocalAdminUser(preview.email, preview.role);
      const user: User = {
        ...built,
        app_metadata: { ...built.app_metadata, ...(await previewAppMetadata(built)) },
      };
      /*
        Preview's stand-in for the device cookie: when this browser signed in
        (tj-local-admin-signed-in). Read only when the preview account has a
        password reset recorded (DESK_PREVIEW_MEMBER=fresh-reset).
      */
      const resetAtMs = passwordResetAtMs(user.app_metadata);
      if (
        resetAtMs !== null &&
        sessionPredatesReset({
          resetAtMs,
          deviceIssuedAtMs: previewSignedInAtMs(cookieStore.get(LOCAL_ADMIN_SIGNED_IN_COOKIE)?.value),
        })
      ) {
        return signedOutByReset();
      }
      return {
        user,
        member: await previewTeamMember(user),
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

  /*
    A password reset signs out every device signed in before it (owner's
    decision 10/02/2026; password-reset-cutoff.ts). Only when the account has
    a reset recorded are the device cookie and the session's claims read, so
    every other request costs nothing more. The device cookie's issue time is
    the guarantee; the earliest authentication time in the session's claims
    only ever adds a refusal, and when it cannot be read the cookie decides.
    The local sign-out is the revocation the SDK offers, best effort.
  */
  const resetAtMs = passwordResetAtMs(user.app_metadata);
  if (resetAtMs !== null) {
    const deviceCookie = options.deviceCookie ?? (await cookies()).get(ADMIN_DEVICE_SESSION_COOKIE)?.value;
    // Bound to this account: another account's cookie never vouches for it.
    const deviceIssuedAtMs = await adminDeviceSessionIssuedAt(deviceCookie, user.id);
    let authenticatedAtMs: number | null = null;
    try {
      const { data } = await authClient.auth.getClaims();
      authenticatedAtMs = earliestAuthenticationMs((data?.claims as { amr?: unknown } | undefined)?.amr);
    } catch {
      authenticatedAtMs = null;
    }
    if (sessionPredatesReset({ resetAtMs, deviceIssuedAtMs, authenticatedAtMs })) {
      try {
        await authClient.auth.signOut({ scope: "local" });
      } catch {
        // The time check is the guarantee; the sign-out is best effort.
      }
      return signedOutByReset();
    }
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

  if (access.signedOut === "passwordReset") return { ok: false, error: SIGNED_OUT_RESET_MESSAGE };
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
  | { ok: false; error: string; code?: "signIn" | "role" | "passwordReset" }
> {
  const access = await getCurrentAdminAccess();
  // A replayed action from a device the password reset signed out.
  if (access.signedOut === "passwordReset") {
    return { ok: false, error: SIGNED_OUT_RESET_MESSAGE, code: "passwordReset" };
  }
  if (!access.user) return { ok: false, error: "Sign in first.", code: "signIn" };

  const wanted = Array.isArray(anyOf) ? anyOf : [anyOf];
  if (!wanted.some((permission) => hasTeamPermission(access.role, permission))) {
    return { ok: false, error: "This role is not allowed to do that.", code: "role" };
  }
  return { ...access, ok: true };
}
