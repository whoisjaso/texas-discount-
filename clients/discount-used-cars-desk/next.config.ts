import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  experimental: {
    // Opt out during broad local browser walks on machines with limited disk.
    turbopackFileSystemCacheForDev: process.env.NEXT_DISABLE_DEV_CACHE !== "1",
    // Next ships lucide-react in its default optimizePackageImports list but
    // not Phosphor, so importing from the barrel would pull all 1512 icons at
    // six weights into every bundle that touches one. Opting in restores the
    // per-icon tree-shake we had before the swap.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  // The floating dev-tools badge overlaps the mobile bottom nav during
  // on-device testing; errors still surface in the console/overlay.
  devIndicators: false,
  async redirects() {
    // The link the desk texts a Marketplace lead: short, and it lands on the
    // pre-approval page in either language.
    return [
      { source: "/apply", destination: "/en/financing", permanent: false },
      { source: "/en/apply", destination: "/en/financing", permanent: false },
      { source: "/es/apply", destination: "/es/financing", permanent: false },
      { source: "/solicitar", destination: "/es/financing", permanent: false },
      // The link inside a text. A message is charged by the character and
      // read on a lock screen, so it carries this instead of the bridge's
      // query string: our own domain, which is also what carriers want to
      // see rather than a public shortener.
      {
        source: "/r/:token",
        destination: "/api/credit-application/start?invite=:token",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sign/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // The texted-paperwork flow: never cached, never leaks a referrer.
        // The route handlers set these too; this covers the rendered pages,
        // which cannot set response headers themselves.
        source: "/paperwork/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  turbopack: {
    root: appRoot,
  },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "*.localhost",
    "10.*.*.*",
    "172.*.*.*",
    "192.168.*.*",
  ],
  images: {
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  outputFileTracingIncludes: {
    "/api/sign/packet/*/documents/*": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./public/forms/*.pdf",
    ],
    "/admin/sales/*/packet": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./public/forms/*.pdf",
    ],
    "/api/documents/agreements/*/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/admin/rentals/*/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/documents/finalize": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/rental/sign": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    /*
      The offer letter needs the browser AND its own faces.

      Both are read at request time by a path the tracer cannot follow: the
      binary through `@sparticuz/chromium`, and the five woff2 files through
      `join(process.cwd(), "public", ...)`. Without these two lines the
      function deploys without either, `offerLetterPdf` answers null, and the
      failure is silent by design — it returns null rather than throwing so a
      browser that will not start never stops an email.

      Which is exactly what happened. The attachment shipped with no entry
      here at all and every offer sent from production went WITHOUT its
      document, reported as "the letter would not render" and nothing louder.
      The route below is listed for the same reason, and answers 500 instead,
      because there the document IS the response.
    */
    "/admin/team": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./public/fonts/document/*.woff2",
    ],
    "/api/documents/offer-letter": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./public/fonts/document/*.woff2",
    ],
    // The licence reader loads three things from disk at request time: its own
    // worker script, the wasm core, and the vendored language data. None of
    // them are reachable by a static import, so the tracer cannot find them on
    // its own and the deployed function would ship without them.
    //
    // The route survives their absence, by design: the photograph is attached
    // before anything is read, so a reader that cannot start costs the fields
    // and never the picture. This is what lets it do its job instead.
    "/api/capture": [
      "./node_modules/tesseract.js/src/worker-script/node/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./public/tessdata/**/*",
    ],
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
