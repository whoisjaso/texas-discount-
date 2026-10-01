import type { User } from "@supabase/supabase-js";
import { isTeamRole, type TeamRole } from "@/lib/operations/team";

export const LOCAL_ADMIN_SESSION_COOKIE = "tj-local-admin-preview";

export const localAdminSessionCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 8,
};

export function hasSupabaseBrowserEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function hasSupabaseServiceEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isLocalAdminPreviewEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.LOCAL_ADMIN_PREVIEW === "true") return true;
  return !hasSupabaseBrowserEnv();
}

export function parseLocalAdminPreviewValue(value?: string | null): {
  email: string | null;
  role: TeamRole;
} {
  const raw = value?.trim();
  if (!raw) return { email: null, role: "owner" };

  const separatorIndex = raw.indexOf(":");
  if (separatorIndex <= 0) return { email: raw, role: "owner" };

  const role = raw.slice(0, separatorIndex);
  const email = raw.slice(separatorIndex + 1).trim() || null;
  return isTeamRole(role) ? { email, role } : { email: raw, role: "owner" };
}

export function createLocalAdminUser(
  email?: string | null,
  role: TeamRole = "owner",
): User {
  const resolvedEmail =
    email?.trim().toLowerCase() ||
    process.env.ADMIN_EMAIL?.trim().toLowerCase() ||
    "local-admin@vegas.dev";

  return {
    id: "local-admin-preview",
    aud: "authenticated",
    role: "authenticated",
    email: resolvedEmail,
    app_metadata: {
      access_status: "active",
      desk_role: role,
      provider: "local-preview",
    },
    user_metadata: {
      name: "Local Admin",
    },
    identities: [],
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  } as User;
}
