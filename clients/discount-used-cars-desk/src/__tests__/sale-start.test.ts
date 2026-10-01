import { requiredDocumentTypes } from "@/lib/sales/deal-type";
import { SALE_DOCUMENTS } from "@/lib/admin/sale-desk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * This file used to assert the shape of a nine-step sale: the order of the
 * steps, which were mandatory, and that "5 of 9" read correctly. That flow is
 * gone. Six of its nine screens asked nothing at all — a document icon, a
 * status line, and Continue — so the counter was measuring screens rather than
 * work, and two of the nine were skippable, which made the fraction a lie.
 *
 * The tests below were rewritten against what replaced it rather than deleted,
 * because the thing they were really protecting still matters: a sale must not
 * lose its way, and a car entered by VIN must land in inventory. The VIN block
 * at the bottom is unchanged.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const startSaleScreen = read("src/components/admin/StartSale.tsx");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EN = (require("../../messages/en.json") as { funnel: Record<string, Record<string, string>> }).funnel;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ES = (require("../../messages/es.json") as { funnel: Record<string, Record<string, string>> }).funnel;
const startSale = read("src/lib/actions/start-sale.ts");
const retiredStep = read("src/app/admin/sales/[dealId]/step/[stepKey]/page.tsx");
const retiredBuyer = read("src/app/admin/sales/new/buyer/page.tsx");
const saleView = read("src/components/admin/SaleDetailView.tsx");

const startStages = ["car", "carDetails", "carTitle", "name", "contact", "identity", "address"] as const;

function stageSource(stage: (typeof startStages)[number]): string {
  const marker = `data-start-stage="${stage}"`;
  const start = startSaleScreen.indexOf(marker);
  if (start < 0) return "";
  const later = startStages
    .map((candidate) => startSaleScreen.indexOf(`data-start-stage="${candidate}"`, start + marker.length))
    .filter((at) => at > start);
  const fieldsetEnd = startSaleScreen.indexOf("</fieldset>", start);
  const end = Math.min(...later, fieldsetEnd > start ? fieldsetEnd : startSaleScreen.length);
  return startSaleScreen.slice(start, end);
}

const namedControl = (name: string) =>
  new RegExp(`<(?:input|select)[^>]*\\bname="${name}"`);

describe("starting a sale asks one answer group at a time", () => {
  it("derives six lot stages and seven manual VIN stages", () => {
    // The title question is on both routes: a listed car arrives with
    // inventory's answer chosen, a typed-in car with the question open.
    expect(startSaleScreen).toMatch(
      /const LOT_STAGES[^=]*=\s*\["car",\s*"carTitle",\s*"name",\s*"contact",\s*"identity",\s*"address"\]/,
    );
    expect(startSaleScreen).toMatch(
      /const MANUAL_STAGES[^=]*=\s*\[\s*"car",\s*"carDetails",\s*"carTitle",\s*"name",\s*"contact",\s*"identity",\s*"address",?\s*\]/,
    );
    expect(startSaleScreen).toMatch(/const stages = manual \? MANUAL_STAGES : LOT_STAGES/);
    expect(startSaleScreen).toMatch(/current:\s*stageIndex \+ 1,\s*total:\s*stages\.length/);
  });

  it("gives every stage its own translated question", () => {
    const questionKeys = [
      "whichCar",
      "carDetailsQuestion",
      "carTitleQuestion",
      "buyerNameQuestion",
      "buyerContactQuestion",
      "buyerIdentityQuestion",
      "buyerAddressQuestion",
    ];
    for (const key of questionKeys) {
      expect(EN.start[key]).toBeTruthy();
      expect(ES.start[key]).toBeTruthy();
      expect(ES.start[key]).not.toBe(EN.start[key]);
      expect(startSaleScreen).toMatch(new RegExp(`t\\.start\\.${key}\\b`));
    }
  });

  it("keeps every named control on the stage that asks for it", () => {
    const fieldsByStage = {
      car: ["vin", "carYear", "carMake", "carModel", "mileage", "language"],
      carDetails: ["carExterior", "carInterior", "carBodyStyle"],
      carTitle: ["titleStatus"],
      name: ["buyerFirstName", "buyerMiddleName", "buyerLastName", "buyerSuffix", "coBuyerName"],
      contact: ["buyerPhone", "buyerEmail"],
      identity: ["buyerIdKind", "buyerIdState", "buyerIdNumber"],
      address: ["buyerStreet", "buyerCity", "buyerAddrState", "buyerZip", "buyerCounty"],
    } satisfies Record<(typeof startStages)[number], string[]>;

    for (const [stage, owned] of Object.entries(fieldsByStage)) {
      const source = stageSource(stage as (typeof startStages)[number]);
      expect(source).toMatch(new RegExp(`data-start-stage="${stage}"`));
      for (const field of owned) expect(source).toMatch(namedControl(field));
      for (const [otherStage, otherFields] of Object.entries(fieldsByStage)) {
        if (otherStage === stage) continue;
        for (const field of otherFields) expect(source).not.toMatch(namedControl(field));
      }
    }
  });

  it("runs each explicit guard only on the stage that owns it", () => {
    const validateStart = startSaleScreen.indexOf("function validateStage(");
    const validateEnd = startSaleScreen.indexOf("function advance(", validateStart);
    const validate = startSaleScreen.slice(validateStart, validateEnd);

    expect(validate).toMatch(/if \(current === "car"\)[\s\S]*?VIN_PATTERN\.test/);
    expect(validate).toMatch(/if \(current === "car"\)[\s\S]*?saleLanguage === ""/);
    expect(validate).toMatch(/if \(current === "carTitle"\)[\s\S]*?gateTitleStatus\(titleAnswer\)/);
    expect(validate).toMatch(/if \(current === "name"\)[\s\S]*?buyerFirstName\.trim\(\)/);
    expect(validate).toMatch(/if \(current === "name"\)[\s\S]*?buyerLastName\.trim\(\)/);
    expect(validate).toMatch(/current === "contact" && buyerPhone\.replace/);
    expect(validate).toMatch(/return form\.reportValidity\(\)/);
    expect(startSaleScreen).toMatch(/if \(!validateStage\(stage, form\)\) return/);
  });

  it("records motion and changes stage in the same tick", () => {
    const moveStart = startSaleScreen.indexOf("function moveStage(");
    const moveEnd = startSaleScreen.indexOf("useLayoutEffect(", moveStart);
    const move = startSaleScreen.slice(moveStart, moveEnd);

    expect(move).toMatch(/shell\.dataset\.direction = nextDirection/);
    expect(move).toMatch(/shell\.dataset\.leaving = nextDirection/);
    expect(move).toMatch(/setStage\(next\)/);
    expect(move).not.toMatch(/setTimeout|animationend|transitionend/);

    const advanceStart = startSaleScreen.indexOf("function advance(");
    const advanceEnd = startSaleScreen.indexOf("async function submit(", advanceStart);
    const advance = startSaleScreen.slice(advanceStart, advanceEnd);
    expect(advance).toMatch(/if \(next\) moveStage\(next, "forward"\)/);
    expect(advance).not.toMatch(/setTimeout|animationend|transitionend/);

    const actionsStart = startSaleScreen.indexOf("{stageIndex > 0 ? (");
    const actionsEnd = startSaleScreen.indexOf("{stageIndex < stages.length - 1 ? (", actionsStart);
    const back = startSaleScreen.slice(actionsStart, actionsEnd);
    expect(back).toMatch(/if \(previous\) moveStage\(previous, "back"\)/);
    expect(back).not.toMatch(/setTimeout|animationend|transitionend/);
  });

  it("lands in the funnel rather than on the packet", () => {
    /**
     * This test used to assert the opposite, and the reversal came from the
     * dealer using it.
     *
     * The earlier reasoning was sound as far as it went: a sale had been
     * presented as nine steps and six of them asked nothing, so the counter
     * was measuring tolls rather than work. Collapsing them was right.
     *
     * What it got wrong was the destination. Starting a sale landed on the
     * deal summary, which lists the whole packet at once, and the operator's
     * report was blunt: "everything is in one page, it's too confusing". The
     * step-by-step guide existed the entire time and nothing walked anybody
     * into it.
     *
     * So the collapse stays where it belongs, on the intake, and the funnel
     * gets the arrival. The guide entry route works out the first unanswered
     * question rather than hardcoding a step, which is what keeps this from
     * becoming a fixed nine again.
     */
    // Every push out of this screen goes to a guide route and nowhere else.
    // Written as a sweep rather than one literal, because the destination is
    // now built once and used from three places: straight through when nothing
    // was scanned, after the ID is filed, and from the link offered when it
    // could not be.
    const destinations = [...startSaleScreen.matchAll(/\/admin\/sales\/\$\{[^}]+\}\/([a-z]+)/g)].map(
      (m) => m[1],
    );
    expect(destinations.length).toBeGreaterThan(0);
    expect(new Set(destinations)).toEqual(new Set(["guide"]));
    // Not a hardcoded step. The route asks the deal what is still open.
    expect(startSaleScreen).not.toMatch(/\/guide\/[a-z]/i);
  });

  it("offers exactly one action per screen", () => {
    /**
     * The rule is one primary action in front of the operator, not one in the
     * file. There are two primary actions in the source and never two on
     * screen: Next while another question remains, then Start Sale on the
     * final address stage.
     *
     * Asserted structurally rather than by counting, because a count of two
     * would pass just as happily if somebody put both buttons on the same
     * screen, which is the thing this is guarding against.
     */
    const submits = startSaleScreen.match(/type="submit"/g) ?? [];
    expect(submits).toHaveLength(1);

    const primaries = [...startSaleScreen.matchAll(/tj-action-primary/g)].map((m) => m.index!);
    expect(primaries).toHaveLength(2);

    // Both live inside the one conditional that picks between them, so
    // rendering one always means not rendering the other.
    const branch = startSaleScreen.indexOf("{stageIndex < stages.length - 1 ? (");
    expect(branch).toBeGreaterThan(-1);
    expect(primaries.every((at) => at > branch)).toBe(true);
  });

  it("collects the car's own facts on the car's screen", () => {
    // The odometer and the paperwork language were being asked three questions
    // later, on the buyer's screen, along with the VIN and the year and make
    // and model of the car that had supposedly already been chosen.
    const carScreen = stageSource("car");
    expect(EN.start.odometer).toBe("Odometer (miles)");
    expect(carScreen).toContain("t.start.odometer");
    // Vega's: required, NO default (SOP). A bilingual lot cannot let the
    // Spanish-first duty (FTC 455.5, Tex. Fin. Code 348.006) ride on a default.
    expect(EN.saleLanguage.question).toBe("What Language Is The Sale In?");
    expect(startSaleScreen).toMatch(
      /useState<"" \| "en" \| "es">\(""\)/,
    );
    expect(carScreen).toContain("t.saleLanguage.question");
    // Controlled, never read from FormData: the select lives on the car
    // screen and is unmounted by the time the buyer screen submits, so an
    // uncontrolled `defaultValue` select loses the answer with the element.
    // That shipped once — the operator chose English on screen one and the
    // server refused the sale for a missing language on screen two.
    expect(carScreen).toMatch(/name="language"[\s\S]{0,60}value=\{saleLanguage\}[\s\S]{0,40}required/);
    expect(startSaleScreen).not.toMatch(/read\("language"\)/);
    // And answered before the screen that holds it can be left.
    expect(startSaleScreen).toContain("setError(t.saleLanguage.mustChoose)");
    expect(startSaleScreen).toMatch(/language:\s*saleLanguage === "" \? undefined : saleLanguage/);
    expect(EN.start.vin).toBe("VIN");
    expect(carScreen).toContain('<span className="ed-field-label">{t.start.vin}<Req /></span>');
  });

  it("asks for the buyer's name on the name screen", () => {
    const nameScreen = stageSource("name");
    /*
      The name is asked in the four boxes the state forms print, not as one
      string. A single box meant every document downstream had to work out
      where the surname began, and that cannot be done correctly: "Ana Maria
      Garcia" and "John Michael Smith" are the same shape.
    */
    expect(EN.start.firstName).toBe("First name");
    expect(EN.start.lastName).toBe("Last name");
    for (const key of ["firstName", "middleName", "lastName", "suffix"]) {
      expect(nameScreen).toMatch(new RegExp(`t\\.start\\.${key}\\b`));
    }
    // The four boxes are what gets submitted, so no single name input remains.
    expect(nameScreen).not.toMatch(/name="buyerName"/);
    expect(EN.start.idKind).toBe("Kind of ID");
    expect(stageSource("identity")).toMatch(/t\.start\.idKind\b/);
  });

  it("keeps unmounted answers in React state for the final payload", () => {
    expect(startSaleScreen).not.toMatch(/read\("(?:buyerPhone|buyerEmail|buyerIdNumber|coBuyerName)"\)/);
    expect(startSaleScreen).toMatch(/buyerPhone,[\s\S]*?buyerIdNumber:\s*idNumber,/);
    expect(startSaleScreen).toMatch(/buyerEmail,[\s\S]*?buyerAddress:/);
    expect(startSaleScreen).toMatch(/buyerIdNumber:\s*idNumber/);
    expect(startSaleScreen).toMatch(/coBuyerName:\s*coBuyer \? coBuyerName : undefined/);
  });

  it("names the action on the button, not the state", () => {
    /*
      The label used to become "Scan It Again" once a card had been read, which
      is a sentence about state on a control whose job is to name an action.
      The owner read it on a screen where nothing had been scanned and it
      claimed otherwise. One label, always.
    */
    expect(EN.start.scanId).toBe("Scan ID");
    expect(stageSource("identity")).toMatch(/\{t\.start\.scanId\}/);
    expect(startSaleScreen).not.toMatch(/scan\.current\s*\?[\s\S]*?:/);
  });

  it("shows both sides back so they can be seen, not just claimed", () => {
    // A line of text saying both sides were photographed asks to be believed.
    // Two thumbnails let somebody catch a thumb over a corner while the
    // customer is still at the desk holding the card.
    expect(startSaleScreen).toContain("ed-start-shots");
    expect(EN.start.front).toBe("Front");
    expect(startSaleScreen).toContain(">{t.start.front}<");
    expect(EN.start.back).toBe("Back");
    expect(startSaleScreen).toContain(">{t.start.back}<");
    // A card whose barcode never read sends no back, and that is said out loud
    // rather than left as a gap nobody notices.
    expect(EN.start.noBack).toBe("No back. The barcode never read.");
    expect(startSaleScreen).toContain("t.start.noBack");
  });

  it("draws what to photograph before anything has been", () => {
    /*
      An empty pair of slots cannot say "both sides". A card with a face on it
      and a card with a barcode on it can, in the places their photographs will
      land, without a sentence of instruction.
    */
    // The rendered element, not the import: an import survives the component
    // being dropped from the JSX, which is exactly how this would rot.
    expect(startSaleScreen).toContain("<IdCardFront />");
    expect(startSaleScreen).toContain("<IdCardBack />");
    expect(startSaleScreen).toContain("ed-start-shots-hint");
  });

  it("draws the cards rather than shipping a picture of a real one", () => {
    /*
      A real licence is somebody's identity document and a photographic
      facsimile of a Texas card is not a thing this product has any business
      carrying. The diagram gives the layout, which is all the instruction
      needs: where the face sits, where the barcode sits, that there are two
      sides.
    */
    const diagram = readFileSync("src/components/sales/IdCardDiagram.tsx", "utf8");
    expect(diagram).not.toMatch(/\.(png|jpe?g|webp|avif)/i);
    expect(diagram).not.toContain("<img");
    // Card proportions, the same ones the scanner's own cutout uses, so the
    // shape here is the shape a card is lined up in a minute later.
    expect(diagram).toContain("85.6");
  });

  it("hands the preview URLs back to the browser", () => {
    // createObjectURL keeps the blob alive until it is revoked. Three sales in
    // a row would otherwise leave six licence photographs in the tab.
    expect(startSaleScreen).toContain("URL.revokeObjectURL");
  });

  it("reads the licence here, where the card is on the counter", () => {
    /*
      This screen is the first ID step of a sale and the scan belongs on it.
      What it must not have is its own scanner: it used to carry a second,
      worse one, back of the card only, a plain rectangle to aim at, a Close
      button, and no photograph kept at all. Being on the entry screen made it
      the scanner every sale reached first.

      So the button is here and the component behind it is the shared one.
    */
    expect(startSaleScreen).toContain('from "@/components/sales/LicenceScanner"');
    expect(startSaleScreen).not.toContain("LicenceScanButton");
    expect(startSaleScreen).not.toContain("getUserMedia");
  });

  it("attaches both sides to the sale the moment it exists", () => {
    // The card is photographed before there is a deal to hang it on, so the
    // blobs wait in the browser and go up against the token the action returns.
    expect(startSaleScreen).toContain("attachLicence(result.captureToken)");
    expect(startSaleScreen).toContain('body.set("back"');
    expect(startSaleScreen).toContain('fetch("/api/capture"');
  });

  it("opens the camera on the tap that was already made", () => {
    // The button press is the user activation the browser wants before it will
    // vibrate, so the scanner's own ready screen would be a second tap for
    // nothing. The phone, arriving from a QR code untouched, still needs it.
    expect(startSaleScreen).toContain("activated");
  });

  it("does not ask for a mailing address", () => {
    // One box holding street, city, state and postal code is the jumble the
    // licence step was rebuilt to stop producing, and asking here as well
    // would leave the sale holding two addresses with no rule for which wins.
    expect(startSaleScreen).not.toContain("AddressAutocomplete");
    expect(startSaleScreen).not.toContain("Street, city, state, ZIP");
    expect(startSaleScreen).not.toContain('name="buyerAddress"');
  });

  it("puts the cursor on the next answer once the car is chosen", () => {
    // Picking the route keeps the operator inside the current car question.
    expect(startSaleScreen).toMatch(/mileageRef\.current\?\.focus\(\)/);
    expect(startSaleScreen).toMatch(/vinRef\.current\?\.focus\(\)/);
  });
});

describe("links written before the rebuild", () => {
  it("sends an old step link to the sale it belonged to", () => {
    expect(retiredStep).toContain("redirect(");
    expect(retiredStep).toContain("/admin/sales/${encodeURIComponent(dealId)}");
  });

  it("sends the old buyer screen back to the one that replaced it", () => {
    expect(retiredBuyer).toContain('redirect("/admin/sales/new")');
  });
});

describe("what the sale counts", () => {
  it("measures signed documents, not screens visited", () => {
    expect(saleView).toContain("signed} of {required.length} signed");
  });

  /**
   * These two used to pin the literal `entry.documentType && !entry.optional`.
   * That string went when the packet stopped being one fixed list and became a
   * function of how the sale is paid for, and pinning it would have forced the
   * old shape back. The intent behind it did not change, so it is asserted
   * against the rule itself rather than against the syntax that happened to
   * express it.
   */
  it("never counts a document that leaves no record", () => {
    // The buyer's guide is a window sticker. Nothing writes a row for it, so
    // it cannot be part of a fraction that claims to know what is signed. It
    // has no document type, and only document types can be required.
    for (const type of ["cash", "inHouse", "lender"] as const) {
      for (const required of requiredDocumentTypes(type)) {
        expect(required.length).toBeGreaterThan(0);
        expect(SALE_DOCUMENTS.some((e) => e.documentType === required)).toBe(true);
      }
    }
    const guide = SALE_DOCUMENTS.find((e) => e.title === "Buyer's Guide");
    expect(guide?.documentType).toBeUndefined();
    expect(saleView).toContain("entry.documentType && requiredTypes.includes");
  });
});

describe("a car entered by VIN", () => {
  it("is added to inventory rather than left floating", () => {
    // Typing a VIN means the car is ours but was never listed, so it becomes
    // a real vehicle row instead of a detail hanging off the deal.
    expect(startSale).toContain('.from("vehicles")');
    expect(startSale).toContain("resolveVehicle");
  });

  it("enters as a car under contract, never as one for sale", () => {
    // Available would list it on the public inventory page at $0 with no
    // photographs for the length of the sale. Pending is what a car under
    // contract is, and the completion writes Sold over it.
    expect(startSale).toMatch(/status:\s*"Pending"/);
    expect(startSale).not.toMatch(/status:\s*"Available"/);
  });

  it("reuses an existing VIN instead of creating a duplicate", () => {
    expect(startSale).toContain('.eq("vin", input.vin)');
    expect(startSale).toContain("existing?.id");
  });

  it("records the odometer read at the sale, for either route", () => {
    expect(startSale).toContain("mileageUpdate");
  });

  it("still guesses nothing, and stores only what a person confirmed", () => {
    // This used to assert the resolver contained no year, make or model at
    // all, which was a proxy for the thing that actually matters: the server
    // must not infer a car's identity from its VIN. It no longer needs to be
    // a proxy. The start screen looks the VIN up, shows what came back in
    // editable fields, and the operator submits what they see. So the
    // resolver writes those three only when the caller passes them, and a
    // blank stays blank.
    const resolver = startSale.slice(
      startSale.indexOf("async function resolveVehicle"),
    );
    expect(resolver).toContain("...(input.year != null ? { year: input.year } : {})");
    expect(resolver).toContain("...(input.make ? { make: input.make } : {})");
    expect(resolver).toContain("...(input.model ? { model: input.model } : {})");
    // Nothing anywhere in the action decodes or infers.
    expect(startSale).not.toContain("decodeVin");
    expect(startSale).not.toContain("vin-decode");
  });

  it("asks the VIN service on the screen, where a person can correct it", () => {
    const screen = read("src/components/admin/StartSale.tsx");
    expect(screen).toContain("/api/vin-decode?vin=");
    // The three fields are editable, and the note tells the operator to check
    // them rather than presenting a decode as settled fact.
    expect(screen).toContain("setCarYear");
    expect(screen).toContain("setCarMake");
    expect(screen).toContain("setCarModel");

    /*
      The two notes now come from the catalogue rather than from literals in
      this component, because a Spanish dealer typing a VIN was reading them
      in English. The behaviour is what it always was, so the assertion moved
      with the words instead of being dropped: the screen still sets a note
      after a decode and after a failure, and both notes still say the thing
      that makes them worth having.
    */
    expect(screen).toContain("setDecodeNote(t.start.checkAgainstCar)");
    expect(screen).toContain("t.start.vinServiceUnreachable");

    const en = JSON.parse(read("messages/en.json")).funnel.start;
    const es = JSON.parse(read("messages/es.json")).funnel.start;
    expect(en.checkAgainstCar).toContain("Check these against the car");
    // A failed lookup is not a dead end: the fields are already there.
    expect(en.vinServiceUnreachable).toContain("Fill the three fields in yourself.");
    expect(es.checkAgainstCar).toBeTruthy();
    expect(es.vinServiceUnreachable).toBeTruthy();
  });
});
