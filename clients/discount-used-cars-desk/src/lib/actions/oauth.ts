"use server";

import { redirect } from "next/navigation";
import { isLocalAdminPreviewEnabled } from "@/lib/auth/local-admin";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/dealership-config";

/**
 * Continue with Google. Apple is intentionally deferred.
 *
 * Supabase Auth runs the provider dance; this action only asks it for the
 * provider's page and sends the browser there. The provider sends the
 * browser back to `/admin/auth/callback`, which trades the code for a
 * session and decides whether the person is on the team.
 *
 * Google must be switched on in the Supabase dashboard with its Google
 * Cloud client credentials. Until it is, Supabase answers with an error
 * and the screen says so in
 * plain words rather than bouncing to a broken page.
 */

export type OAuthState = { error?: string };

/*
  A "use server" module may export only async functions. The provider list
  and the callback path live in `@/lib/auth/oauth-providers`, which the
  callback route and the tests read too.
*/
import { OAUTH_CALLBACK_PATH, isOAuthProvider } from "@/lib/auth/oauth-providers";

export async function startOAuthSignIn(_prev: OAuthState, formData: FormData): Promise<OAuthState> {
  const provider = formData.get("provider");
  if (!isOAuthProvider(provider)) return { error: "Choose Google, or use your password or an emailed code." };

  if (isLocalAdminPreviewEnabled()) {
    redirect(`/admin/login?notice=oauth-preview&provider=${provider}`);
  }

  const label = "Google";
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${SITE_URL}${OAUTH_CALLBACK_PATH}`,
        // The browser is sent by this action, not by the client library.
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data?.url) {
      return { error: `${label} sign-in is not switched on for this deployment yet. Use your password or an emailed code.` };
    }
    redirect(data.url);
  } catch (thrown) {
    // `redirect` throws to navigate; let that through.
    if (thrown && typeof thrown === "object" && "digest" in thrown) throw thrown;
    return { error: `${label} sign-in is unavailable right now. Use your password or an emailed code.` };
  }
}
