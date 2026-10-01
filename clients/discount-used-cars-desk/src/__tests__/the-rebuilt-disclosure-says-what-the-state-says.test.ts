import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import RebuiltDisclosureDocument from "@/components/documents/RebuiltDisclosureDocument";
import { REBUILT_COPY_EN, REBUILT_COPY_ES, vehicleParts } from "@/lib/documents/rebuiltDisclosure";

/**
 * Our own Rebuilt Title Disclosure answers for the state's.
 *
 * The TxDMV's Form ENF-MV-RBLT DSCLMR is one sentence over a name and a
 * date, with the year, make and VIN above it. The owner's call was to
 * print that on our paper rather than staple the state's PDF behind ours,
 * so these tests hold the sheet to the state's content: the sentence word
 * for word, the purchaser's name set into it, the year and make on their
 * own lines, and the English original under the Spanish.
 */

const STATE_SENTENCE =
  "I, {name}, acknowledge that at the time of purchase, I am aware that this vehicle has been repaired, rebuilt, or reconstructed and was formerly titled as a salvage motor vehicle.";

const sale = {
  buyerName: "Ernesto Salinas",
  buyerIdNumber: "50011234",
  buyerPhone: "(713) 555-0190",
  buyerAddress: "2200 Broadway St, Pearland, TX, 77581",
  vehicleDescription: "2011 Ford Flex",
  vehicleYear: "2011",
  vehicleMake: "Ford",
  vehicleModel: "Flex",
  vin: "1FMHK6D8XBGA12345",
  saleDate: "2026-09-02",
};

describe("the state's sentence", () => {
  it("is the state's wording, word for word, in the English copy", () => {
    expect(REBUILT_COPY_EN.written).toBe(STATE_SENTENCE);
    expect(REBUILT_COPY_EN.writtenSource).toContain("ENF-MV-RBLT DSCLMR");
  });

  it("is translated in the Spanish copy with the English original kept under it", () => {
    expect(REBUILT_COPY_ES.written).toContain("{name}");
    expect(REBUILT_COPY_ES.written).not.toBe(REBUILT_COPY_EN.written);
    expect(REBUILT_COPY_ES.writtenOriginal).toBe(STATE_SENTENCE);
  });
});

describe("the sheet", () => {
  const html = (language: "en" | "es") =>
    renderToStaticMarkup(createElement(RebuiltDisclosureDocument, { data: sale, language }));

  it("sets the purchaser's name into the sentence", () => {
    const en = html("en");
    expect(en).toContain('<span class="bos-written-name">Ernesto Salinas</span>');
    expect(en.replace(/<[^>]+>/g, "")).toContain(
      "I, Ernesto Salinas, acknowledge that at the time of purchase",
    );
  });

  it("prints the year and make on their own lines and the VIN", () => {
    const text = html("en").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toMatch(/Year 2011/);
    expect(text).toMatch(/Make Ford/);
    expect(text).toMatch(/Model Flex/);
    expect(text).toContain("1FMHK6D8XBGA12345");
  });

  it("says it in Spanish and in the state's English on the Spanish sheet", () => {
    const text = html("es").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    expect(text).toContain("Yo, Ernesto Salinas, reconozco");
    expect(text).toContain("I, Ernesto Salinas, acknowledge that at the time of purchase");
  });

  it("stays one sheet: a marker section, no second page", () => {
    expect(html("en")).toContain("data-rebuilt-written");
    expect(html("en").match(/data-bos-page=/g)?.length).toBe(1);
  });
});

describe("older rows", () => {
  it("split the description into year, make and model when the parts are missing", () => {
    expect(vehicleParts({ ...sale, vehicleYear: undefined, vehicleMake: undefined, vehicleModel: undefined })).toEqual({
      year: "2011",
      make: "Ford",
      model: "Flex",
    });
    expect(vehicleParts({ ...sale, vehicleDescription: "Ford Flex", vehicleYear: undefined, vehicleMake: undefined, vehicleModel: undefined })).toEqual({
      year: "",
      make: "Ford",
      model: "Flex",
    });
  });
});

describe("the packet", () => {
  it("no longer staples the state's PDF; the sheet is ours", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/documents/agreements/[id]/pdf/route.ts"), "utf8");
    expect(route).not.toContain("rebuilt-state-form");
    expect(route).not.toContain("stapleInFront");
  });
});
