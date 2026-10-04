import { describe, expect, it } from "vitest";
import { ADMIN_DESTINATIONS, searchDestinations } from "@/lib/admin/destinations";

/**
 * Nobody should have to learn our vocabulary to find a screen.
 */
describe("going somewhere by typing", () => {
  const first = (q: string) => searchDestinations(q)[0]?.label;

  it("does not let a coincidence beat the word you meant", () => {
    // "title" is a word inside other destinations' text; the title screen wins.
    expect(first("title")).toBe("Title Status");
    expect(first("salvage")).toBe("Title Status");
  });

  it("finds a screen by what it is for, not what it is called", () => {
    expect(first("owed")).toBe("Promises");
    expect(first("history")).toBe("Past Sales");
    expect(first("clock")).toBe("Sale Times");
  });

  it("still prefers the name when you type the name", () => {
    expect(first("promises")).toBe("Promises");
    expect(first("past sales")).toBe("Past Sales");
    expect(first("start a sale")).toBe("Start A Sale");
  });

  it("still answers to the name a screen used to have", () => {
    // Triple J called the open-sales list "Sales In Progress".
    expect(first("in progress")).toBe("Handle A Sale");
  });

  it("returns everything when nothing is typed", () => {
    expect(searchDestinations("")).toHaveLength(ADMIN_DESTINATIONS.length);
    expect(searchDestinations("   ")).toHaveLength(ADMIN_DESTINATIONS.length);
  });

  it("says nothing rather than something wrong", () => {
    expect(searchDestinations("zzzzz")).toEqual([]);
  });

  it("points every destination at a route that exists", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dead = ADMIN_DESTINATIONS.filter(
      (d) => !existsSync(join(process.cwd(), "src/app", d.href, "page.tsx")),
    ).map((d) => `${d.label} -> ${d.href}`);
    expect(dead).toEqual([]);
  });
});

describe("mounting", () => {
  it("mounts exactly once", async () => {
    // Two copies were mounted, one in the shell and one in the rail. Both
    // listened for Cmd+K, so both opened: two dialogs, two result lists, and
    // thirty-one rows on screen for a two-result query.
    const { readdirSync, statSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = process.cwd();
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(join(root, dir))) {
        const rel = `${dir}/${entry}`;
        if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
        else if (/\.tsx$/.test(entry) && !/\.test\./.test(entry)) out.push(rel);
      }
      return out;
    };
    const mounts = [...walk("src/app"), ...walk("src/components")].filter((f) =>
      /<CommandPalette[\s/>]/.test(readFileSync(join(root, f), "utf8")),
    );
    expect(mounts).toEqual(["src/components/admin/AdminSidebar.tsx"]);
  });
});
