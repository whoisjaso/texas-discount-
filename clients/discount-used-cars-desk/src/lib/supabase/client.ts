import { createBrowserClient } from "@supabase/ssr";
import { supabaseAuthCookieOptions } from "@/lib/supabase/auth-cookies";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseAuthCookieOptions,
    }
  );
}
