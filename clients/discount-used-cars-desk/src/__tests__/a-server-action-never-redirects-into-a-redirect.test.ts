import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";

/**
 * A Server Action must land the browser somewhere that renders.
 *
 * Found by walking the product rather than by reading it. Signing in for the
 * first time produced a blank page: an empty body, readyState complete, no
 * error anywhere, that never filled in. Reloading the same URL rendered it
 * perfectly, which is why it survived. Pressing Start Working at the end of
 * onboarding did the same thing. So did changing a password.
 *
 * All three had the same shape. The action called `redirect(A)`, and the page
 * at A was itself nothing but `redirect(B)`. One hop is fine; a second hop
 * evaluated while the browser is still following the first is not, and the
 * browser is left holding nothing.
 *
 * `/admin/home` and `/admin` are both kept deliberately as redirects, so that
 * old bookmarks and emailed links still land somewhere real. That is correct
 * for an ordinary navigation and fatal as a Server Action's destination. This
 * test knows the difference, so those pages can stay.
 */

const ACTIONS_DIR = "src/lib/actions";

/** Every literal path a redirect in these files can send somebody to. */
export function redirectTargets(source: string): string[] {
  const targets: string[] = [];
  for (const match of source.matchAll(/redirect\(\s*(DEALERSHIP_HOME|"([^"?#]+)[^"]*")\s*\)/g)) {
    targets.push(match[2] ?? DEALERSHIP_HOME);
  }
  // The destination helper returns rather than redirects; its answers are
  // redirect targets all the same.
  for (const match of source.matchAll(/return\s+(DEALERSHIP_HOME|"(\/admin[^"?#]*)")/g)) {
    targets.push(match[2] ?? DEALERSHIP_HOME);
  }
  return [...new Set(targets)];
}

/**
 * Whether the page at this path does nothing but redirect.
 *
 * Deliberately conservative: a page counts as a pure redirect only when it
 * calls `redirect` and returns no markup at all. A page that renders something
 * and redirects on one branch is not what broke.
 */
export function isRedirectOnly(routePath: string): boolean {
  const file = `src/app${routePath}/page.tsx`;
  if (!existsSync(file)) return false;
  const source = readFileSync(file, "utf8");
  if (!/\bredirect\(/.test(source)) return false;
  return !/return\s*\(/.test(source) && !/=>\s*\(/.test(source);
}

const actionFiles = readdirSync(ACTIONS_DIR).filter((name) => name.endsWith(".ts"));

describe("the check itself can fail", () => {
  it("reads a redirect target out of an action", () => {
    expect(redirectTargets('redirect("/admin/sales");')).toEqual(["/admin/sales"]);
    expect(redirectTargets("redirect(DEALERSHIP_HOME);")).toEqual([DEALERSHIP_HOME]);
  });

  it("ignores the query string, which is not part of the route", () => {
    expect(redirectTargets('redirect("/admin/rental/renewals?renewalStatus=sent");')).toEqual([
      "/admin/rental/renewals",
    ]);
  });

  it("still recognises the pages that are pure redirects", () => {
    // If this stops being true the sweep below would pass by knowing nothing.
    expect(isRedirectOnly("/admin")).toBe(true);
    expect(isRedirectOnly("/admin")).toBe(true);
  });

  it("does not mistake a real page for one", () => {
    expect(isRedirectOnly(DEALERSHIP_HOME)).toBe(false);
    expect(isRedirectOnly("/admin/sales")).toBe(false);
  });

  it("would have caught the bug that produced it", () => {
    // The exact line that was in team-onboarding.ts and account.ts, and the
    // exact reason pressing Start Working ended on an empty screen.
    expect(redirectTargets('redirect("/admin");').filter(isRedirectOnly)).toEqual([
      "/admin",
    ]);
  });

  it("found actions to sweep", () => {
    expect(actionFiles.length).toBeGreaterThan(10);
  });
});

describe("no action sends anybody to a page that redirects again", () => {
  it.each(actionFiles)("%s", (name) => {
    const source = readFileSync(`${ACTIONS_DIR}/${name}`, "utf8");
    const chained = redirectTargets(source).filter(isRedirectOnly);
    expect(chained).toEqual([]);
  });
});
