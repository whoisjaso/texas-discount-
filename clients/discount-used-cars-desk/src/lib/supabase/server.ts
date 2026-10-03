import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  createLocalAdminUser,
  isLocalAdminPreviewEnabled,
  LOCAL_ADMIN_SESSION_COOKIE,
} from "@/lib/auth/local-admin";
import { withAdminAuthCookiePersistence } from "@/lib/supabase/auth-cookies";
import { createMockSupabaseClient } from "@/lib/supabase/mock";

export async function createClient() {
  const cookieStore = await cookies();
  if (isLocalAdminPreviewEnabled()) {
    const email = cookieStore.get(LOCAL_ADMIN_SESSION_COOKIE)?.value;
    return createMockSupabaseClient(email ? createLocalAdminUser(email) : null);
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(
                name,
                value,
                withAdminAuthCookiePersistence(options, value),
              )
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
