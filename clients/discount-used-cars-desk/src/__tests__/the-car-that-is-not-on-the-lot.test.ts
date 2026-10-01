import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The car nobody added to inventory.
 *
 * The selector could already reach a VIN decode, in theory: the search box
 * matched on VIN, and a text link under the grid put the screen into manual
 * mode. Both were wrong in a way that only shows on a real lot.
 *
 * The search box renders above SEARCH_APPEARS_ABOVE cars. This dealership has
 * five. So on the screen the owner actually uses there was no VIN field on the
 * selector at all, and the only way in was to notice a quiet link and learn
 * that the screen has two modes before typing anything.
 *
 * These tests pin the field that replaced it: always on screen whatever the lot
 * holds, decoded against NHTSA where it was typed, and what comes back is
 * another car to pick rather than a change of mode.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const SCREEN = read("src/components/admin/StartSale.tsx");
const CSS = read("src/app/globals.css");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EN = (require("../../messages/en.json") as { funnel: { start: Record<string, string> } }).funnel.start;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ES = (require("../../messages/es.json") as { funnel: { start: Record<string, string> } }).funnel.start;

/** The markup of the VIN block, so a match cannot come from elsewhere. */
function lotVinBlock(): string {
  const start = SCREEN.indexOf('<div className="ed-start-lotvin">');
  expect(start).toBeGreaterThan(-1);
  const end = SCREEN.indexOf("</div>", SCREEN.lastIndexOf("t.start.enterByHand"));
  return SCREEN.slice(start, end);
}

describe("the VIN field is on the selector, at every lot size", () => {
  it("is not behind the search box, which a small lot never renders", () => {
    // The bug that made the old path unreachable: the search input only exists
    // above this many cars, and this dealership sells from five.
    expect(SCREEN).toMatch(/const SEARCH_APPEARS_ABOVE = \d+/);
    expect(SCREEN).toMatch(/sorted\.length > SEARCH_APPEARS_ABOVE \?/);

    // The VIN field sits outside that conditional entirely.
    const guard = SCREEN.indexOf("sorted.length > SEARCH_APPEARS_ABOVE ?");
    const field = SCREEN.indexOf('<div className="ed-start-lotvin">');
    const searchEnds = SCREEN.indexOf(") : null}", guard);
    expect(field).toBeGreaterThan(searchEnds);
  });

  it("is a labelled input, not a link that changes mode", () => {
    const block = lotVinBlock();
    expect(block).toMatch(/htmlFor="tj-lot-vin"/);
    expect(block).toMatch(/<input\b[\s\S]*id="tj-lot-vin"/);
    expect(block).toMatch(/value=\{lotVin\}/);
  });

  it("takes a VIN however it is typed", () => {
    // Pasted VINs arrive lower case, spaced, or hyphenated from a phone photo.
    expect(SCREEN).toMatch(/const asVin[\s\S]{0,200}toUpperCase\(\)\.replace\(\/\[\\s-\]\/g, ""\)/);
    expect(SCREEN).toMatch(/VIN_PATTERN\.test\(candidate\) \? candidate : null/);
  });

  it("counts the characters while the VIN is still short, and stops when it is whole", () => {
    // Seventeen is not a number anybody counts by eye, and sixteen looks the
    // same. The count must disappear once the field holds a real VIN, or it
    // reads as an unmet requirement on a finished answer.
    const block = lotVinBlock();
    expect(block).toMatch(/lotVin\.trim\(\)\.length > 0 && !asVin\(lotVin\)/);
    expect(block).toContain("t.start.vinCount.replace");
  });
});

describe("what it does with the VIN", () => {
  it("asks the app's own decoder, which is NHTSA", () => {
    expect(SCREEN).toContain("/api/vin-decode?vin=");
    const route = read("src/app/api/vin-decode/route.ts");
    expect(route).toMatch(/from "@\/lib\/nhtsa"/);
  });

  it("waits before asking, so a paste is one request and not seventeen", () => {
    const decode = SCREEN.indexOf("/api/vin-decode?vin=");
    expect(decode).toBeGreaterThan(-1);
    const at = SCREEN.lastIndexOf("setTimeout(", decode);
    const debounced = SCREEN.slice(at, SCREEN.indexOf("clearTimeout(timer)", decode));
    expect(debounced).toContain("/api/vin-decode?vin=");
    expect(debounced).toMatch(/\}, \d{3}\);/);
  });

  it("does not decode a VIN that is already on the lot", () => {
    // The filter above finds it. A lookup would spend a request to be told
    // what the grid is already showing.
    expect(SCREEN).toMatch(/queriedVin && shown\.length === 0 \? queriedVin : asVin\(lotVin\)/);
  });

  it("does not name its own result as a dependency", () => {
    /*
      The bug this replaced, measured on the screen: `vinProbe?.vin` was in the
      dependency list, so setting "looking" re-ran the effect, and the cleanup
      flipped the in-flight fetch's `alive` flag. The answer came back and was
      discarded, the already-out guard refused a second try, and the field said
      "Looking up this VIN" forever. The guard reads a ref instead.
    */
    const decode = SCREEN.indexOf("/api/vin-decode?vin=");
    const deps = SCREEN.slice(decode, SCREEN.indexOf("]);", decode) + 3);
    expect(deps).toMatch(/\}, \[stage, carSettled, queriedVin, lotVin, shown\.length\]\);/);
    expect(deps).not.toContain("vinProbe");
    expect(SCREEN).toMatch(/if \(probedVin\.current === wanted\) return;/);
    expect(SCREEN).toMatch(/const probedVin = useRef<string \| null>\(null\)/);
  });

  it("does not decode while the car is already settled", () => {
    expect(SCREEN).toMatch(/if \(stage !== "car" \|\| carSettled \|\| !wanted\)/);
  });

  it("hands back a car to pick, in the same grid the lot cars use", () => {
    const block = lotVinBlock();
    expect(block).toMatch(/className="ed-pick-grid/);
    expect(block).toMatch(/onClick=\{useDecodedVin\}/);
  });

  it("carries the decoded facts into the sale rather than only the VIN", () => {
    for (const setter of ["setVin(vinProbe.vin)", "setCarYear(", "setCarMake(", "setCarModel("]) {
      expect(SCREEN, setter).toContain(setter);
    }
    // A decode is a proposal, and somebody is standing next to the car.
    expect(SCREEN).toContain("setDecodeNote(t.start.checkAgainstCar)");
  });

  it("leaves the by-hand route open when the decoder says nothing", () => {
    const block = lotVinBlock();
    expect(block).toMatch(/vinProbe\?\.status === "none"/);
    expect(block).toContain("t.start.vinNoDecode");
    expect(block).toContain("t.start.enterByHand");
  });

  it("treats an unreachable decoder as nothing found, not as an error", () => {
    // A VIN service outage must not be the reason a sale cannot start.
    expect(SCREEN).toMatch(/\.catch\(\(\) => \{[\s\S]{0,300}status: "none"/);
  });
});

describe("it speaks from the catalogue, in both languages", () => {
  const KEYS = [
    "notOnLot",
    "vinPlaceholder",
    "vinCount",
    "vinLookingUp",
    "vinNotOnLot",
    "vinUseThis",
    "vinNoDecode",
    "enterByHand",
  ];

  it("has every key the block reads", () => {
    for (const key of KEYS) {
      expect(SCREEN, key).toContain(`t.start.${key}`);
      expect(EN[key], `en ${key}`).toBeTruthy();
      expect(ES[key], `es ${key}`).toBeTruthy();
    }
  });

  it("says something different in Spanish", () => {
    // A key copied across untranslated is the failure this guards.
    for (const key of KEYS) {
      expect(ES[key], key).not.toBe(EN[key]);
    }
  });

  it("keeps the count placeholder in both bundles", () => {
    expect(EN.vinCount).toContain("{count}");
    expect(ES.vinCount).toContain("{count}");
  });
});

describe("it is styled, not just rendered", () => {
  it("has its own rule, and sits in the finders row ahead of the cars", () => {
    expect(CSS).toMatch(/^\.ed-start-lotvin \{/m);
    // The row it shares with the search box is what the rule under it
    // belongs to: one line separating both finders from the cars below.
    const row = CSS.slice(CSS.indexOf(".ed-start-finders {"));
    expect(row.slice(0, row.indexOf("}"))).toMatch(/border-bottom:/);
    expect(row.slice(0, row.indexOf("}"))).toMatch(/flex-wrap: wrap/);
  });

  it("comes before the car grid in the markup, so a phone shows it first", () => {
    /*
      The bug this pins: the field sat under the whole grid. On a phone the
      grid is one column, so with twenty-five cars the only VIN field on the
      screen was three thousand pixels down, and the owner reported it as
      missing. Above the grid, it is in the first viewport at every lot size.
    */
    const field = SCREEN.indexOf('<div className="ed-start-lotvin">');
    const grid = SCREEN.indexOf('<ul className="ed-pick-grid list-none p-0">');
    expect(field).toBeGreaterThan(-1);
    expect(grid).toBeGreaterThan(-1);
    expect(field).toBeLessThan(grid);
  });

  it("uses Tailwind v4's individual properties, not a combined transform", () => {
    const at = CSS.indexOf(".ed-start-lotvin {");
    const block = CSS.slice(at, at + 900);
    expect(block).not.toMatch(/^\s*transform:/m);
  });
});
