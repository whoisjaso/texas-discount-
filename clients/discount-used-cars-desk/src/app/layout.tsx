import type { Viewport } from "next";
import { getLocale } from "next-intl/server";
import { GeistMono } from "geist/font/mono";
// Vega's one face, the public site's narrow grotesk, self hosted so the desk
// makes no third party font request.
import "@fontsource/barlow-semi-condensed/400.css";
import "@fontsource/barlow-semi-condensed/500.css";
import "@fontsource/barlow-semi-condensed/600.css";
import { routePrepaintScript } from "@/lib/route-prepaint";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#000000",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={GeistMono.variable}
      // The pre-paint script below stamps data-tj-loader on this element
      // before React hydrates, which React then reports as a mismatch it
      // "won't patch up" on every single page load. That warning is correct
      // and the behaviour is intended: the whole point of the script is to run
      // first. Suppressing it here is the sanctioned answer for an element a
      // pre-paint script owns, and it stops a real warning from being
      // permanent background noise that hides the next real one.
      suppressHydrationWarning
    >
      <head>
        {/* Runs before first paint, and decides two things that both have to
            be settled before anything is on screen.

            The first is the old one: the branded first-paint loader never
            flashes for a repeat view in the same session or for anyone who
            asked for reduced motion.

            The second is the held screen between pages. It is stamped only
            when this arrival follows a page already seen in this session,
            which is what makes it a move within the site rather than somebody
            landing here from a search. Deciding it here is not a preference:
            several internal links are plain anchors, so a move between pages
            is a whole new document, and anything decided after hydration is
            decided after the new page has already painted.

            Kept inline and tiny on purpose. It has to resolve before the
            overlay would paint. */}
        <script
          dangerouslySetInnerHTML={{ __html: routePrepaintScript }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
