import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import {
  ADMIN_DEVICE_SESSION_COOKIE,
  isValidAdminDeviceSession,
} from "./lib/auth/admin-device-session";
import { LOCAL_ADMIN_SESSION_COOKIE } from "./lib/auth/local-admin";
import { withAdminAuthCookiePersistence } from "./lib/supabase/auth-cookies";

const intlMiddleware = createIntlMiddleware(routing);
const NEXT_INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(
              name,
              value,
              withAdminAuthCookiePersistence(options, value),
            )
          );
        },
      },
    }
  );
}

function hasLocalePrefix(pathname: string): boolean {
  return routing.locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
}

function getLocalePrefix(pathname: string): string | undefined {
  return routing.locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Propagate pathname to downstream server components / getRequestConfig so
  // they can scope behavior by route without re-parsing.
  // Used by src/i18n/request.ts to strip admin-only message namespaces
  // (documents, paperwork) from the public RSC payload.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const localePrefix = getLocalePrefix(pathname);
  if (localePrefix) {
    requestHeaders.set(NEXT_INTL_LOCALE_HEADER, localePrefix);
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const isLocalAdminPreview =
    process.env.NODE_ENV !== "production" &&
    (process.env.LOCAL_ADMIN_PREVIEW === "true" ||
      request.cookies.has(LOCAL_ADMIN_SESSION_COOKIE));
  const hasSupabaseEnv =
    !isLocalAdminPreview &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabaseEnv) {
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/documents") ||
      pathname.startsWith("/payment") ||
      pathname.startsWith("/rental") ||
      pathname.startsWith("/sign") ||
      pathname.startsWith("/capture") ||
      pathname.startsWith("/paperwork") ||
      pathname.startsWith("/decisions")
    ) {
      return response;
    }

    if (hasLocalePrefix(pathname)) {
      return response;
    }

    return intlMiddleware(request);
  }

  // Refresh Supabase session on every matched request
  const supabase = createMiddlewareClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasValidDeviceSession = user
    ? await isValidAdminDeviceSession(
        request.cookies.get(ADMIN_DEVICE_SESSION_COOKIE)?.value,
      )
    : false;

  // Admin routes: auth check, skip i18n routing
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login" || pathname === "/admin/signup") {
      if (user && hasValidDeviceSession) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
      return response;
    }

    // Google and Apple send the browser here with a code and no session;
    // the route trades the code for one and mints the device cookie itself.
    if (pathname === "/admin/auth/callback") {
      return response;
    }

    if (!user || !hasValidDeviceSession) {
      const redirectResponse = NextResponse.redirect(
        new URL("/admin/login", request.url),
      );
      if (user && !hasValidDeviceSession) {
        redirectResponse.cookies.delete(ADMIN_DEVICE_SESSION_COOKIE);
      }
      return redirectResponse;
    }

    return response;
  }

  // Document portal + signed-customer portal + rental signing/decision portals
  // + the phone's licence capture screen: public, no i18n routing (tokenized
  // URLs must not get locale prefix rewrites, and the pages render bilingually
  // from a stored language field).
  //
  // /capture belongs here rather than under a locale because the URL is carried
  // in a QR code and an HMAC-signed token. A locale redirect rewrites the path
  // the token was minted for, and the phone lands on a 404 with a customer
  // holding out their licence.
  if (
    pathname.startsWith("/documents") ||
    pathname.startsWith("/payment") ||
    pathname.startsWith("/rental") ||
    pathname.startsWith("/sign") ||
    pathname.startsWith("/capture") ||
    // /paperwork is the texted buyer-copy link: same reasoning as /capture —
    // the URL carries a token minted for that exact path, and a locale
    // redirect turns a nervous buyer's one link into a 404. The persona walk
    // found exactly that.
    pathname.startsWith("/paperwork") ||
    pathname.startsWith("/decisions")
  ) {
    return response;
  }

  // Public routes with locale already in URL: no intl redirect needed.
  // Return our response directly so the x-pathname request header survives.
  if (hasLocalePrefix(pathname)) {
    return response;
  }

  // No locale prefix present — let intl middleware redirect/rewrite.
  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except:
  // - /api, /_next, /_vercel
  // - /r/, the short link a text carries, which redirects to the bridge and
  //   has no locale of its own to be sent to. The trailing slash keeps this
  //   off /rental and anything else beginning with an r.
  // - files with dots (e.g. favicon.ico, images)
  matcher: "/((?!api|r/|_next|_vercel|.*\\..*).*)",
};
