import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The owner's rule for the intake: an asterisk on every field the sale
 * cannot start without, and no leaving the page until they are answered.
 *
 * Pinned at the source, because the shape is the promise: each required
 * control carries `required` (what a screen reader hears) and its label
 * carries the mark (what an eye sees), a legend says what the mark means,
 * and the stage's Next is disabled until `stageReady` says otherwise.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const SCREEN = read("src/components/admin/StartSale.tsx");
const CSS = read("src/app/globals.css");
const EN = JSON.parse(read("messages/en.json")) as { funnel: Record<string, Record<string, string>> };
const ES = JSON.parse(read("messages/es.json")) as { funnel: Record<string, Record<string, string>> };

/** Every control the intake will not proceed without, by its form name. */
const REQUIRED_CONTROLS = [
  "vin",
  "carYear",
  "carMake",
  "carModel",
  "mileage",
  "language",
  "carExterior",
  "carBodyStyle",
  "titleStatus",
  "buyerFirstName",
  "buyerLastName",
  "buyerPhone",
  "buyerIdNumber",
  "buyerStreet",
  "buyerCity",
  "buyerZip",
  "buyerCounty",
];

/** The label under which each of those controls is asked for. */
const MARKED_LABELS = [
  "t.start.vin",
  "t.start.year",
  "t.start.make",
  "t.start.model",
  "t.start.odometer",
  "t.saleLanguage.question",
  "t.start.exteriorColor",
  "t.start.bodyStyle",
  "t.start.titleWhat",
  "t.start.firstName",
  "t.start.lastName",
  "t.start.phone",
  "t.start.idNumber",
  "t.start.streetAddress",
  "t.start.city",
  "t.start.zip",
  "t.start.county",
];

/** What may stay empty, and so must not be marked. */
const OPTIONAL_LABELS = [
  "t.start.middleName",
  "t.start.suffix",
  "t.start.coBuyerName",
  "t.start.email",
  "t.start.interiorColor",
];

describe("the mark", () => {
  it("sits on every label the sale needs and on none it does not", () => {
    for (const label of MARKED_LABELS) {
      expect(SCREEN, label).toContain(`{${label}}<Req />`);
    }
    for (const label of OPTIONAL_LABELS) {
      expect(SCREEN, label).not.toContain(`{${label}}<Req />`);
    }
  });

  it("is decorative to a screen reader; the control's own required is the announcement", () => {
    expect(SCREEN).toMatch(/function Req\(\)[\s\S]*?className="ed-req" aria-hidden="true"/);
    for (const name of REQUIRED_CONTROLS) {
      // `required` sits inside the same opening tag as the name, within a
      // few attributes of it; the tag has not closed in between.
      expect(SCREEN, name).toMatch(new RegExp(`name="${name}"[^>]{0,160}\\n\\s*required\\b`));
    }
  });

  it("is explained once, in both languages, above the actions", () => {
    expect(SCREEN).toMatch(/className="ed-req-legend"[\s\S]{0,200}\{t\.chrome\.required\}/);
    expect(EN.funnel.chrome.required).toBeTruthy();
    expect(ES.funnel.chrome.required).toBeTruthy();
    expect(ES.funnel.chrome.required).not.toBe(EN.funnel.chrome.required);
  });

  it("is styled in the house copper", () => {
    expect(CSS).toMatch(/^\.ed-req \{/m);
    expect(CSS).toMatch(/^\.ed-req-legend \{/m);
    const rule = CSS.slice(CSS.indexOf(".ed-req {"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/--tj-copper/);
  });
});

describe("no leaving the page without it", () => {
  const readyStart = SCREEN.indexOf("const stageReady = ");
  const ready = SCREEN.slice(readyStart, SCREEN.indexOf("})();", readyStart));

  it("computes readiness for every stage", () => {
    for (const stage of ["car", "carDetails", "carTitle", "name", "contact", "identity", "address"]) {
      expect(ready, stage).toContain(`case "${stage}":`);
    }
    expect(ready).toMatch(/mileage\.trim\(\) !== ""/);
    expect(ready).toMatch(/\[buyerStreet, buyerCity, buyerZip, buyerCounty\]\.every/);
  });

  it("holds Next and Start Sale until the stage is ready", () => {
    expect(SCREEN).toContain("disabled={!stageReady}");
    expect(SCREEN).toContain("disabled={pending || !stageReady}");
  });

  it("still names what is wrong with a filled answer", () => {
    // A filled-but-wrong box gets a sentence, not a dead button.
    const validateStart = SCREEN.indexOf("function validateStage(");
    const validate = SCREEN.slice(validateStart, SCREEN.indexOf("function advance(", validateStart));
    expect(validate).toMatch(/reading === "" \|\| !Number\.isFinite\(parsed\)/);
    expect(validate).toMatch(/current === "carDetails" && \(carExterior === "" \|\| carBodyStyle === ""\)/);
    expect(validate).toMatch(/current === "identity" && !idNumber\.trim\(\)/);
    expect(validate).toMatch(/current === "address"/);
    expect(EN.funnel.start.fillRequired).toBeTruthy();
    expect(ES.funnel.start.fillRequired).not.toBe(EN.funnel.start.fillRequired);
  });

  it("runs the address guard on the final submit too", () => {
    expect(SCREEN).toMatch(/if \(!validateStage\("address", event\.currentTarget\)\) return;/);
  });
});

describe("the title question is asked on every sale", () => {
  it("is a stage on the lot route as well as the typed-in route", () => {
    expect(SCREEN).toMatch(/const LOT_STAGES[^=]*=\s*\["car",\s*"carTitle",/);
    expect(SCREEN).toMatch(/const MANUAL_STAGES[^=]*=\s*\[\s*"car",\s*"carDetails",\s*"carTitle",/);
  });

  it("arrives answered from inventory on a listed car, and open on one nobody verified", () => {
    const chooseStart = SCREEN.indexOf("function choose(vehicle: PickableVehicle)");
    const choose = SCREEN.slice(chooseStart, SCREEN.indexOf("async function lookUpVin", chooseStart));
    expect(choose).toMatch(/if \(!gate\.ok && gate\.reason === "unsellable"\)/);
    expect(choose).toContain('setTitleAnswer(gate.ok ? gate.status : "")');
    expect(SCREEN).toContain("{t.start.titleFromLot}");
    expect(EN.funnel.start.titleFromLot).toBeTruthy();
    expect(ES.funnel.start.titleFromLot).not.toBe(EN.funnel.start.titleFromLot);
  });

  it("is sent for every car, and the server writes a changed answer back to the vehicle", () => {
    expect(SCREEN).toContain("titleStatus: titleAnswer || undefined");
    const action = read("src/lib/actions/start-sale.ts");
    expect(action).toMatch(/answered && answered !== onRow/);
    expect(action).toContain('"Verified at the desk when the sale started"');
    expect(action).toMatch(/titleStatus: answered \?\? onRow/);
  });
});
