import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No documentary fee, and no Texas fee limit, is typed in code (rulebook
 * texas-dealer-fees.md 5.1, "One source of numbers"). The dealer's own fee is
 * the owner's (saved at onboarding; the config holds only the environment
 * seed); the limits live in one legal module the rulebook pins. A figure typed
 * anywhere else is one nobody checks when the law or the owner changes it.
 *
 * Added beside the dealer-facts guard (no-hardcoded-dealer-facts), which is
 * untouched.
 */

const SKIP = new Set(["__tests__", "node_modules", ".next"]);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

/** Comments removed, so a note quoting a figure is not mistaken for one. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ALLOWED = new Set(["src/lib/dealership-config.ts", "src/lib/legal/texas-dealer-fees.ts"]);
const FILES = sources("src").filter((file) => !ALLOWED.has(file));

describe("a documentary fee typed in code", () => {
  it("finds files to check", () => {
    expect(FILES.length).toBeGreaterThan(300);
    expect(FILES).toContain("src/lib/sales/fee-schedule.ts");
    expect(FILES).toContain("src/lib/supabase/packet-preview-fixtures.ts");
  });

  it("is nowhere outside the config and the legal module", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      code(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, index) => {
          if (/\bdocFee(?:Cents)?\s*[:=]\s*['"]?\d/.test(line)) offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 120)}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("and no Texas fee limit is typed outside the legal module", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      code(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, index) => {
          // $225.00 in cents, $10.00 deputy cap, the Ch. 345 caps.
          if (/\b(?:22500|20000|25000)\b/.test(line) && /cents|cap|limit|fee/i.test(line)) {
            offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 120)}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
