import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decompressFromEncodedURIComponent } from "lz-string";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { paperworkAnswers, paperworkMoney, readPaperwork } from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";
import { readBuyerId } from "@/lib/sales/buyer-id";
import type { SaleDetail } from "@/lib/admin/sale-desk";

/**
 * A default nobody walked past is still what the paper says.
 *
 * `paperworkDefault` was read in exactly one place: the starting value of an
 * input box. That made a default something the SCREEN knew and the RECORD did
 * not. Walk the corridor and it became an answer; preview or file without
 * walking it and the box printed blank.
 *
 * The 130-U's county was the visible casualty and the reason these tests
 * exist. Intake asks for the county, the deal stores it, the default resolves
 * it, and the printed form still had an empty county box because nobody had
 * opened that one screen. On a title application that is not a cosmetic gap.
 *
 * The tests below build the payload exactly the way the preview action does,
 * so they fail if the resolution ever moves back into the component.
 */

const sale = {
  id: "d1", status: "active", language: "en", plate: null, plateAsked: false,
  buyer: { id: "c1", name: "Marcus Reed", phone: "7135550142", email: "m@example.com",
           idNumber: "12345678", idState: "TX", address: "4802 Telephone Rd, Houston, TX 77087" },
  vehicle: { id: "v1", year: 2019, make: "BMW", model: "530i", vin: "WBAJA5C50KB123456",
             salePrice: 28500, bodyStyle: "sedan", titleStatus: "clean", mileage: 61000 },
  documents: {}, registration: null,
  funding: { type: "cash", lenderId: null, lenderOther: null },
  stepData: { buyerId: {
    mailing: { street: "4802 Telephone Rd", city: "Houston", state: "TX", postal: "77087", county: "Harris" },
    name: { read: null, confirmed: "Marcus Reed" },
    licenseNumber: { read: null, confirmed: "12345678" },
  } },
} as unknown as SaleDetail;

/** Exactly what the preview action now builds. */
function filed(documentType: string) {
  const answers = readPaperwork(sale.stepData, documentType);
  const money = paperworkMoney(sale.vehicle?.salePrice, answers, readMoney(sale.stepData), sale.funding.type);
  const held = readBuyerId(sale.stepData);
  const resolved = paperworkAnswers(documentType, {
    funding: sale.funding.type,
    bodyStyle: (sale.vehicle?.bodyStyle ?? "").toLowerCase(),
    licenceState: sale.buyer?.idState ?? "",
    paidToday: money.paidToday > 0 ? money.paidToday : null,
    buyerCity: held.mailing.city ?? "",
    buyerCounty: held.mailing.county ?? "",
    answers,
  });
  const formData: Record<string, unknown> = {
    ...resolved, ...money,
    ...(documentType === "vehicleResponsibility"
      ? { quotedRegistrationAmount: money.registrationCost } : {}),
  };
  const link = corridorCompletedLink(sale, documentType, formData, "https://x.test") ?? "";
  const blob = link.slice(link.lastIndexOf("/") + 1);
  // The decoded render payload is untyped JSON the assertions walk into.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { formData, payload: JSON.parse(decompressFromEncodedURIComponent(blob) || "{}") as any };
}

describe("the county the dealer typed reaches the 130-U", () => {
  it("prints the typed county, not a blank box", () => {
    const { payload } = filed("form130U");
    expect(payload.dd.countyOfResidence).toBe("Harris");
  });

  it("still carries the address it always did", () => {
    const { payload } = filed("form130U");
    expect({
      street: payload.dd.buyerAddress, city: payload.dd.buyerCity,
      state: payload.dd.buyerState, zip: payload.dd.buyerZip,
    }).toEqual({ street: "4802 Telephone Rd", city: "Houston", state: "TX", zip: "77087" });
  });

  it("fills the 130-U's other unwalked defaults too", () => {
    const { formData } = filed("form130U");
    expect(formData.applicationType).toBe("titleAndRegistration");
    expect(formData.applicantType).toBe("Individual");
  });

  it("does not overwrite an answer somebody gave", () => {
    const answered = paperworkAnswers("form130U", {
      funding: "cash", bodyStyle: "sedan", licenceState: "TX", paidToday: null,
      buyerCity: "Houston", buyerCounty: "Harris",
      answers: { countyOfResidence: "Fort Bend" },
    });
    expect(answered.countyOfResidence).toBe("Fort Bend");
  });
});

describe("the vehicle responsibility figure is a real number", () => {
  it("carries tax, title, registration and the doc fee onto the form", () => {
    const { formData } = filed("vehicleResponsibility");
    const quoted = formData.quotedRegistrationAmount as number;
    expect(typeof quoted).toBe("number");
    expect(quoted).toBeGreaterThan(0);
  });

  it("is the same figure the money step computed, not a second opinion", () => {
    const { formData } = filed("vehicleResponsibility");
    const money = paperworkMoney(28500, {}, readMoney(sale.stepData), "cash");
    expect(formData.quotedRegistrationAmount).toBe(money.registrationCost);
  });
});

describe("the responsibility sheet is typeset as the bill of sale is", () => {
  /*
    Not a screenshot comparison, which would fail on a word change. These
    assert the two documents draw from the same stylesheet vocabulary, which
    is the thing that makes a packet read as one product rather than a pile of
    forms printed by different hands.

    The reckoning block is the one that matters. The quoted registration is
    what the buyer agrees to owe if the filing comes back to us, and it used
    to appear only inside a red paragraph and again in grey under the
    signatures: stated twice, set nowhere.
  */
  const VR = readFileSync("src/components/documents/VehicleResponsibilityDocument.tsx", "utf8");
  const BOS = readFileSync("src/components/documents/BillOfSalePreview.tsx", "utf8");
  const COPY = readFileSync("src/lib/documents/vehicleResponsibility.ts", "utf8");

  it("reckons its money in the bill of sale's own block", () => {
    for (const cls of ["bos-reckoning-wrap", "doc-reckoning", "doc-reckoning-row",
                       "doc-reckoning-total", "bos-live-figure"]) {
      expect(BOS, `${cls} is the bill of sale's`).toContain(cls);
      expect(VR, `${cls} is missing from the responsibility sheet`).toContain(cls);
    }
  });

  it("shares the letterhead and the page system", () => {
    for (const token of ["DocumentLetterhead", "bos-print doc-sheet", "bos-page"]) {
      expect(VR).toContain(token);
    }
  });

  it("names itself the way the bill of sale names itself", () => {
    // "Bill Of Sale", not "BILL OF SALE". The letterhead sets both titles in
    // the same serif at the same size, so an all-caps heading on a long name
    // wrapped to two lines and swallowed the top of the page.
    expect(COPY).not.toMatch(/heading: "[A-ZÁÉÍÓÚÑ ]{8,}"/);
    expect(COPY).toContain('heading: "Vehicle Responsibility Acknowledgment"');
    expect(COPY).toContain('heading: "Reconocimiento De Responsabilidad Del Vehículo"');
  });

  it("states the figure it turns on exactly once", () => {
    // It was in the return clause and repeated in the footer helper line.
    const footer = VR.slice(VR.indexOf("bos-signature-agreement"));
    expect(footer).not.toContain("quotedRegistrationAmount");
  });

  it("keeps both languages' money labels in step", () => {
    for (const key of ["quotedLabel", "feeLabel", "owedTotalLabel"]) {
      expect((COPY.match(new RegExp(`${key}:`, "g")) ?? []).length,
        `${key} needs a type, an English value and a Spanish one`).toBe(3);
    }
  });
});
