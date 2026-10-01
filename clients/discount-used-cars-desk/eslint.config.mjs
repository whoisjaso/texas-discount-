import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local agent/tooling artifacts are not deployable app source.
    ".claude/**",
    ".paul/**",
    "artifacts/**",
    "tmp/**",
    "triple-j-auto-investment-main/**",
    "supabase/.temp/**",
  ]),
  {
    // The editorial homepage serves pre-built, art-directed derivatives from
    // /public/home via <picture>/<img> on purpose: the four hero sources are
    // portrait and need per-breakpoint crops that next/image cannot express,
    // and keeping them as plain files means the page does not depend on an
    // image-optimization vendor (see docs/HOMEPAGE_IMPLEMENTATION.md).
    // Dimensions and lazy/priority hints are set explicitly on every image.
    files: ["src/components/home/**/*.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
