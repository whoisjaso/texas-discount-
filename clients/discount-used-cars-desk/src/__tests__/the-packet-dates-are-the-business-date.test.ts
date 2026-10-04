import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dealership } from "@/lib/dealership-config";

/**
 * The packet's dates are the business date (found in the live walk of
 * 10/02/2026): a void made at 7:30 pm in Houston showed "Voided Oct 3, 2026"
 * on the packet while the voided PDF's band, dated by the dealership's clock,
 * said 10/02/2026. The screens formatted in the viewer's (or the server's)
 * own zone. The void notice, the Voided Copies history and the packet's
 * "Signed", "Filed" and "Replaces the copy voided" dates now all read the
 * dealership's clock.
 */

const FILES = ["src/components/admin/packet/VoidNotice.tsx", "src/components/admin/packet/PacketScreen.tsx"];

/** Every toLocaleDateString options object in the file, as written. */
function dateOptions(source: string): string[] {
  const found: string[] = [];
  const pattern = /toLocaleDateString\([^,]+,\s*\{([^}]*)\}/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) found.push(match[1]);
  return found;
}

describe("the packet's dates", () => {
  it.each(FILES)("%s formats every date on the dealership's clock", (file) => {
    const options = dateOptions(readFileSync(file, "utf8"));
    expect(options.length).toBeGreaterThan(0);
    for (const written of options) expect(written).toMatch(/timeZone:\s*dealership\.timeZone/);
  });

  it("puts an evening void in Houston on that day, not on the UTC day after", () => {
    const at = new Date("2026-10-03T00:30:00Z"); // 7:30 pm, 10/02/2026, Central time
    const shown = at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: dealership.timeZone });
    expect(shown).toBe("Oct 2, 2026");
    const spanish = at.toLocaleDateString("es-US", { month: "short", day: "numeric", year: "numeric", timeZone: dealership.timeZone });
    expect(spanish).toMatch(/^2 oct\.? 2026$/);
  });
});
