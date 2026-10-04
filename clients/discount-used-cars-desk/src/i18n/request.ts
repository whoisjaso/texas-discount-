import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { applyBrandTokens } from "@/lib/brand-messages";

const PRIVATE_NAMESPACES = ["documents", "paperwork"] as const;

function isPrivateRoute(pathname: string): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sign") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/documents")
  );
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale;
  }

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || "";
  const privateRoute = isPrivateRoute(pathname);

  const allMessages = applyBrandTokens(
    (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>,
  );

  const messages = privateRoute
    ? allMessages
    : Object.fromEntries(
        Object.entries(allMessages).filter(
          ([key]) => !(PRIVATE_NAMESPACES as readonly string[]).includes(key),
        ),
      );

  return { locale, messages };
});
