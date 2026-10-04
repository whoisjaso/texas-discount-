import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import table from "@/lib/vehicles/empty-weight/epa-etw-table.generated";
import { epaTableMeta } from "@/lib/vehicles/empty-weight/epa";

/**
 * The bundled EPA table says where every figure came from.
 *
 * Every estimate the desk shows has to be able to name its source down to
 * the file: the EPA Test Car List for that model year, its URL, its sha256
 * and the day it was downloaded. And the table is a server file: it is 1.3
 * MB, and nothing on a phone needs it.
 */

const YEARS = Array.from({ length: 2026 - 1995 + 1 }, (_, i) => String(1995 + i));

describe("the table's own record", () => {
  it("says when it was built and what relation it applies", () => {
    expect(table.built).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(table.v).toBe(1);
    expect(table.relation).toContain("ETW less 300 lb");
    expect(table.relation).toContain("40 CFR 86.1803-01");
    expect(table.relation).toContain("1066.805");
    expect(table.page).toBe("https://www.epa.gov/compliance-and-fuel-economy-data/data-cars-used-testing-fuel-economy");
  });

  it("names at least one EPA file, with its hash and download date, for every year 1995 to 2026", () => {
    for (const year of YEARS) {
      const sources = table.sources[year];
      expect(sources?.length, `sources for ${year}`).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source.url, `${year} url`).toMatch(/^https:\/\/www\.epa\.gov\/.+\.(csv|xlsx|zip)$/);
        expect(source.sha256, `${year} sha256`).toMatch(/^[0-9a-f]{64}$/);
        expect(source.downloaded, `${year} downloaded`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("has no empty year", () => {
    const counts = epaTableMeta().yearCounts;
    for (const year of YEARS) expect(counts[year], year).toBeGreaterThan(100);
  });
});

describe("the rows", () => {
  it("all match the row format", () => {
    expect(table.rowFormat).toHaveLength(6);
    const groups = new Set(Object.keys(table.groups));
    const bad: string[] = [];
    for (const year of YEARS) {
      for (const row of table.years[year]) {
        const [make, model, disp, drive, flags, etws] = row;
        const why =
          typeof make !== "string" || make.length === 0
            ? "make"
            : make.startsWith("@") && !groups.has(make)
              ? "unknown group"
              : typeof model !== "string" || model.length === 0 || model !== model.toUpperCase()
                ? "model"
                : /[\u2012-\u2015\u2212]/.test(model)
                  ? "dash in model"
                  : !(disp === null || (typeof disp === "number" && disp >= 0.1 && disp <= 50))
                    ? "displacement"
                    : ![0, 2, 4].includes(drive)
                      ? "drive"
                      : ![0, 1, 2, 3].includes(flags)
                        ? "flags"
                        : // An EV carries no displacement and every other row carries one.
                          ((flags & 2) === 2) !== (disp === null)
                          ? "EV flag"
                          : !Array.isArray(etws) ||
                              etws.length === 0 ||
                              etws.some((e, i) => !Number.isInteger(e) || e < 1000 || e > 10000 || (i > 0 && e < etws[i - 1]))
                            ? "ETW list"
                            : null;
        if (why) bad.push(`${year} ${JSON.stringify(row).slice(0, 80)}: ${why}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("where it may be imported", () => {
  const SRC = join(process.cwd(), "src");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry) && !full.includes("__tests__") && !entry.endsWith(".d.ts")) files.push(full);
    }
  };
  walk(SRC);

  it("is imported only by server-only modules", () => {
    const importers = files.filter((file) => /epa-etw-table\.generated/.test(readFileSync(file, "utf8")));
    expect(importers.length).toBeGreaterThan(0);
    for (const file of importers) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/^import "server-only";/m);
    }
  });

  it("is never reached from a client component", () => {
    const clientFiles = files.filter((file) => /^["']use client["'];?/m.test(readFileSync(file, "utf8")));
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/empty-weight\/(epa|estimate|ensure|canada)["']/);
      expect(source, file).not.toMatch(/epa-etw-table/);
    }
  });
});
