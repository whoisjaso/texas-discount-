// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Walked on 5190, 2026-10-04: an /admin address no screen answers (the old
 * Fix It link to /admin/inventory/<id>) got Next's own unstyled 404, black on
 * white with no way back; and the refusal for a screen a role does not open
 * read "This screen is not assigned to this role." as its heading, a
 * sentence, where every other heading on the desk is in Title Case.
 */

const APP = path.join(process.cwd(), "src", "app", "admin");

afterEach(() => cleanup());

/** Title Case as the desk writes headings: every word capitalised, no closing full stop. */
function isTitleCase(text: string): boolean {
  return !/[.]$/.test(text.trim()) && text.split(/\s+/).every((word) => /^[A-Z0-9]/.test(word));
}

describe("a desk address that leads nowhere says so, in the desk's clothes", () => {
  it("answers an unknown /admin address with the desk's own not-found page", async () => {
    expect(existsSync(path.join(APP, "not-found.tsx"))).toBe(true);
    const missing = path.join(APP, "[...missing]", "page.tsx");
    expect(existsSync(missing)).toBe(true);
    expect(readFileSync(missing, "utf8")).toMatch(/notFound\(\)/);
    const { default: MissingAdminPage } = await import("@/app/admin/[...missing]/page");
    // notFound() throws Next's not-found signal: the page renders nothing of its own.
    expect(() => MissingAdminPage()).toThrow();
  });

  it("titles the page in Title Case and offers the way back to Handle A Sale", async () => {
    const { default: NotFound } = await import("@/app/admin/not-found");
    render(<NotFound />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(isTitleCase(heading.textContent ?? ""), heading.textContent ?? "").toBe(true);
    const back = screen.getByRole("link", { name: "Back To Handle A Sale" });
    expect(back.getAttribute("href")).toBe("/admin/sales");
  });

  it("titles the refusal for a screen the role does not open in Title Case", async () => {
    const { default: AccessDenied } = await import("@/components/admin/AccessDenied");
    render(<AccessDenied />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("This Screen Is Not Part Of Your Role");
    expect(isTitleCase(heading.textContent ?? "")).toBe(true);
    expect(readFileSync(path.join(APP, "layout.tsx"), "utf8")).not.toMatch(/not assigned to this role/);
  });
});
