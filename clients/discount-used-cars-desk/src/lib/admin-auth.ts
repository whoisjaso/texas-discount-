import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_DEVICE_SESSION_COOKIE,
  isValidAdminDeviceSession,
} from '@/lib/auth/admin-device-session';
import {
  isLocalAdminPreviewEnabled,
  LOCAL_ADMIN_SESSION_COOKIE,
} from '@/lib/auth/local-admin';
import { hasTeamPermission, isTeamRole, type TeamPermission } from '@/lib/operations/team';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

export async function requireAdmin(
  req: NextRequest,
  permission: TeamPermission = 'admin:read',
): Promise<NextResponse | null> {
  if (isLocalAdminPreviewEnabled() && req.cookies.get(LOCAL_ADMIN_SESSION_COOKIE)?.value) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasDeviceSession = await isValidAdminDeviceSession(
      req.cookies.get(ADMIN_DEVICE_SESSION_COOKIE)?.value,
    );
    if (!hasDeviceSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = normalizeEmail(user.email);
    const configuredOwnerEmail = normalizeEmail(process.env.ADMIN_EMAIL);
    if (email && configuredOwnerEmail && email === configuredOwnerEmail) {
      return null;
    }

    const service = createServiceClient();
    const byUser = await service
      .from('team_members')
      .select('role,status')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (byUser.error && byUser.error.code !== 'PGRST205') {
      return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 });
    }
    let member = byUser.data;
    if (!member && email && !byUser.error) {
      const byEmail = await service
        .from('team_members')
        .select('role,status')
        .eq('email', email)
        .maybeSingle();
      if (byEmail.error) return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 });
      member = byEmail.data;
    }
    const role = typeof member?.role === 'string' && isTeamRole(member.role) ? member.role : null;

    // The roster wins over older Auth metadata, including revocation and role changes.
    if (!member) {
      const metadataStatus = user.app_metadata?.access_status;
      const metadataRole = user.app_metadata?.desk_role;
      if (metadataStatus === 'active' && typeof metadataRole === 'string' &&
          isTeamRole(metadataRole) && hasTeamPermission(metadataRole, permission)) {
        return null;
      }
    }

    if (member?.status !== 'active' || !hasTeamPermission(role, permission)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return null;
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 });
  }
}
