import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { epaTableMeta } from "@/lib/vehicles/empty-weight/epa";

/**
 * Review finding 8: the table's dates came from file modification times, so
 * copying or re-downloading the same bytes changed `built` (and so staled
 * every stored estimate), and a file with no URL mapping silently fell back
 * to the EPA landing page. The generator now reads a manifest (URL, sha256,
 * download date per file) that --download writes, takes `built` from it, and
 * stops on a file the manifest does not name or whose bytes changed.
 *
 * Proven by hand on this build (docs/verification/VERIFICATION.md): the
 * table rebuilt from the same files and manifest is byte-identical, also
 * after every file's mtime was touched.
 */

const script = readFileSync("scripts/empty-weight/build_epa_table.py", "utf8");

describe("the table build", () => {
  it("never reads a file time", () => {
    expect(script).not.toMatch(/getmtime|fromtimestamp/);
  });

  it("reads URLs, hashes and dates from a manifest, and writes one on download", () => {
    expect(script).toContain("MANIFEST = 'manifest.json'");
    expect(script).toMatch(/def download\(cache\):[\s\S]*write_manifest\(cache, entries\)/);
    expect(script).toMatch(/built = a\.built or \(max\(used\)/);
  });

  it("stops on a file with no URL, or whose bytes changed since it was recorded", () => {
    expect(script).toContain("is not in %s: every file must say where it came from");
    expect(script).toContain("changed since it was recorded");
    expect(script).not.toMatch(/url_by_name\.get\(name, PAGE\)/);
  });

  it("names a real EPA file, never the landing page, for every source in the bundled table", () => {
    const meta = epaTableMeta();
    for (const [year, files] of Object.entries(meta.sources)) {
      for (const file of files) {
        expect(file.url, year).not.toBe(meta.page);
        expect(file.url, year).toMatch(/^https:\/\/www\.epa\.gov\/.+\.(csv|xlsx|zip)$/);
        expect(file.downloaded <= meta.built, year).toBe(true);
      }
    }
  });
});
