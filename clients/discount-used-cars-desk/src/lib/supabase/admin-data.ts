import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createLocalAdminUser, isLocalAdminPreviewEnabled } from "@/lib/auth/local-admin";
import { createMockSupabaseClient } from "@/lib/supabase/mock";
import { createClient } from "@/lib/supabase/server";

export function hasAdminSupabaseDataEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function hasAdminSupabaseServiceEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export class AdminSupabaseDataError extends Error {
  constructor(message = "Supabase backend is not configured for admin data.") {
    super(message);
    this.name = "AdminSupabaseDataError";
  }
}

export async function createAdminDataClient(): Promise<SupabaseClient> {
  if (isLocalAdminPreviewEnabled()) {
    return createMockSupabaseClient(createLocalAdminUser());
  }

  if (!hasAdminSupabaseDataEnv()) {
    throw new AdminSupabaseDataError(
      "Supabase backend is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.",
    );
  }

  return createClient();
}

export function createAdminServiceDataClient(): SupabaseClient {
  if (isLocalAdminPreviewEnabled()) {
    return createMockSupabaseClient(createLocalAdminUser());
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new AdminSupabaseDataError(
      "Supabase service access is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local, then restart the dev server.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
