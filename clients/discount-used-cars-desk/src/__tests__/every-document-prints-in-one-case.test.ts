import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { codeCase, fieldCase, vinCase } from "@/lib/documents/presentation-case";
import type { SaleDetail } from "@/lib/admin/sale-desk";

/**
 * The owner's standard, from a filled state form whose body style read
 * "pickup": the VIN is always capitals, and every other field starts each
 * word with a capital, however it was typed. One layer, at the corridor's
 * facts and at the 130-U builder, so no document can print its own casing.
 */

const sale = {
  id: "d1", status: "active", language: "en", plate: "abc1234", plateAsked: true,
  buyer: { id: "c1", name: "rosa villarreal", phone: "2815550166", email: null,
           idNumber: "g12345678", idState: "mx", idKind: "passport", address: "9910 bissonnet st" },
  vehicle: { id: "v1", year: 2004, make: "FORD", model: "f-150", vin: "1ftrw12w04kc00001",
             salePrice: 3500, bodyStyle: "pickup", titleStatus: "clean",
             mileage: 201500, exteriorColor: "WHITE", trim: "xlt" },
  documents: {}, registration: null,
  funding: { type: "cash", lenderId: null, lenderOther: null },
  stepData: { buyerId: {
    mailing: { street: "700 MAIN ST", city: "houston", state: "tx", postal: "77002", county: "harris" },
    name: { read: null, confirmed: "rosa villarreal" },
  } },
} as unknown as SaleDetail;

const filed = (type: string) => {
  const link = corridorCompletedLink(sale, type, { salePrice: 3500 }, "https://x.test");
  const decoded = decodeCompletedLinkFromUrl(link!)!;
  return { decoded, dd: decoded.dd as Record<string, unknown> };
};

describe("the casing rule itself", () => {
  it("capitalises every word of a value typed all one case", () => {
    expect(fieldCase("pickup")).toBe("Pickup");
    expect(fieldCase("WHITE")).toBe("White");
    expect(fieldCase("rosa villarreal")).toBe("Rosa Villarreal");
    expect(fieldCase("700 MAIN ST")).toBe("700 Main St");
  });

  it("leaves a value somebody cased on purpose alone", () => {
    expect(fieldCase("DeShawn")).toBe("DeShawn");
    expect(fieldCase("McDonald")).toBe("McDonald");
    expect(fieldCase("CR-V EX")).toBe("CR-V EX");
  });

  it("keeps a trim badge as the badge spells it", () => {
    expect(fieldCase("f-150 xlt")).toBe("F-150 XLT");
    expect(fieldCase("SENTRA SR")).toBe("Sentra SR");
  });

  it("puts a VIN, a plate and a state in capitals, always", () => {
    expect(vinCase("1ftrw12w04kc00001")).toBe("1FTRW12W04KC00001");
    expect(vinCase(" 1ftr-w12w 04kc00001 ")).toBe("1FTRW12W04KC00001");
    expect(codeCase("abc1234")).toBe("ABC1234");
    expect(codeCase("tx")).toBe("TX");
    expect(codeCase(null)).toBe("");
  });
});

describe("the corridor's facts are cased for paper once", () => {
  const { dd } = filed("billOfSale");

  it("prints the car in title case and the VIN in capitals", () => {
    expect(dd.vehicleMake).toBe("Ford");
    expect(dd.vehicleModel).toBe("F-150");
    expect(dd.vehicleBodyStyle).toBe("Pickup");
    expect(dd.vehicleColor).toBe("White");
    expect(dd.vehicleTrim).toBe("XLT");
    expect(dd.vehicleVin).toBe("1FTRW12W04KC00001");
    expect(dd.vehiclePlate).toBe("ABC1234");
  });

  it("prints the buyer and the address in title case, the codes in capitals", () => {
    expect(dd.buyerName).toBe("Rosa Villarreal");
    expect(dd.applicantFirstName).toBe("Rosa");
    expect(dd.applicantLastName).toBe("Villarreal");
    expect(dd.buyerAddress).toBe("700 Main St");
    expect(dd.buyerCity).toBe("Houston");
    expect(dd.buyerState).toBe("TX");
    expect(dd.buyerLicense).toBe("G12345678");
    expect(dd.buyerLicenseState).toBe("MX");
  });
});

describe("the state 130-U prints the same way", () => {
  it("cases the boxes from the corridor's record", () => {
    const { decoded } = filed("form130U");
    const form = buildAgreementData(decoded, {}, null);
    expect(form.vin).toBe("1FTRW12W04KC00001");
    expect(form.body_style).toBe("Pickup");
    expect(form.make).toBe("Ford");
    expect(form.major_color).toBe("White");
    expect(form.tx_plate_no).toBe("ABC1234");
    expect(form.buyer_first_name).toBe("Rosa");
    expect(form.buyer_dl_number).toBe("G12345678");
    expect(form.buyer_dl_state).toBe("MX");
  });

  it("cases a row the customer portal wrote, which never passed through the corridor", () => {
    const form = buildAgreementData(
      { s: "form130U", dd: { vehicleVin: "wbaja5c50kb123456", vehicleMake: "bmw", vehicleModel: "530i", vehicleBodyStyle: "SEDAN", vehicleColor: "black sapphire" }, cd: { buyerName: "MARCUS REED", buyerAddress: "4802 TELEPHONE RD", buyerCity: "HOUSTON", buyerState: "tx" } } as never,
      {},
      null,
    );
    expect(form.vin).toBe("WBAJA5C50KB123456");
    expect(form.make).toBe("BMW");
    expect(form.body_style).toBe("Sedan");
    expect(form.major_color).toBe("Black Sapphire");
    expect(form.buyer_first_name).toBe("Marcus");
    expect(form.buyer_last_name).toBe("Reed");
    expect(form.buyer_address).toBe("4802 Telephone Rd");
    expect(form.buyer_city).toBe("Houston");
    expect(form.buyer_state).toBe("TX");
  });
});

describe("the intake keeps the catalogue's spelling of a decoded body style", () => {
  it("matches the decode to the catalogue rather than lowercasing it", () => {
    const start = readFileSync("src/components/admin/StartSale.tsx", "utf8");
    expect(start).not.toMatch(/setCarBodyStyle\(vinProbe\.bodyStyle\.toLowerCase\(\)\)/);
    expect(start).toMatch(/BODY_STYLES\.find\(\(style\) => style\.toLowerCase\(\) === decoded\)/);
  });
});
