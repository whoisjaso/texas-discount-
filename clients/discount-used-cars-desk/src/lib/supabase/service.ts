/**
 * Service-role Supabase client — bypasses RLS.
 *
 * Use ONLY in trusted server-side contexts where there is no auth session:
 *   - Webhook handlers (Stripe, Telnyx)
 *   - Cron jobs
 *
 * Do NOT use in admin pages or server actions — those have an auth session
 * and should use the cookie-based createClient() from ./server.ts.
 *
 * Resolves Phase 20 deferred item: "service_role client for cron/webhook routes"
 */

import { createClient } from '@supabase/supabase-js';
import { isLocalAdminPreviewEnabled } from '@/lib/auth/local-admin';
import { createMockSupabaseClient } from '@/lib/supabase/mock';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (isLocalAdminPreviewEnabled()) {
    return createMockSupabaseClient();
  }

  if (!url) {
    throw new Error('[supabase] NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  if (!key) {
    throw new Error('[supabase] SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
