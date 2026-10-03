import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SOLE_ADMIN_WORKSPACE, isAdminWorkspace } from "@/lib/admin/workspace";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (src: string) =>
  src.replace(/^[ \t]*\{?\/\*[\s\S]*?\*\/\}?/gm, "").replace(/^\s*\/\/.*$/gm, "");

const PROVIDER = read("src/components/admin/AdminWorkspaceProvider.tsx");

/**
 * An infinite redirect loop, and the reason it survived.
 *
 * A browser with no workspace cookie was sent to `/admin`, which redirects to
 * the dealership desk, where the same check ran again and sent it back. The
 * two addresses volleyed forever. It was reachable by anybody signing in on a
 * new device, which as of this week includes a newly promoted owner.
 *
 * It survived because the symptom was patched one path at a time. The provider
 * carried an `isWorkspaceOptionalPath` allowlist, and its comment named the
 * bug exactly: "opening the link in a browser that has not picked a workspace
 * yet bounces to /admin and lands somewhere else entirely." Signature was
 * added to the list. Profile never was, so Settings linked to a screen that
 * threw you back to the desk.
 *
 * The cause was that the shell asked which workspace to use after rentals were
 * removed and only one was left. A browser with nothing stored has not failed
 * to choose; there is nothing to choose.
 */
describe("no admin route bounces a browser that has chosen nothing", () => {
  it("has exactly one workspace, so there is no choice to present", () => {
    expect(SOLE_ADMIN_WORKSPACE).toBe("dealership");
    expect(isAdminWorkspace(SOLE_ADMIN_WORKSPACE)).toBe(true);
    // A second value would make the fallback below a guess rather than a fact.
    expect(isAdminWorkspace("rental")).toBe(false);
  });

  it("falls back to that workspace instead of redirecting to /admin", () => {
    const src = code(PROVIDER);
    expect(src).toContain("SOLE_ADMIN_WORKSPACE");
    // The loop itself: a replace to the entry route, which redirects back here.
    expect(src).not.toMatch(/router\.replace\(\s*["']\/admin["']\s*\)/);
  });

  it("keeps no allowlist of paths spared from the bounce", () => {
    // The allowlist was the patch. With no bounce there is nothing to spare,
    // and a list like this is how Profile got missed in the first place.
    expect(code(PROVIDER)).not.toContain("isWorkspaceOptionalPath");
  });

  it("still normalises a short alias to its canonical route", () => {
    // The one redirect worth keeping. Removing the loop must not remove this.
    expect(code(PROVIDER)).toContain("getCanonicalWorkspaceRoute");
  });
});
