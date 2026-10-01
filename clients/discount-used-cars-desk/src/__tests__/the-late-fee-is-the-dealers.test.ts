import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The late-handling fee is Discount's own fact, and nobody has supplied it.
 *
 * The Vehicle Responsibility Acknowledgment must carry "the figure and late
 * fee if it comes back to the dealer" (SOP "Legal content each document must
 * carry"), but the $100 it printed was another dealer's policy carried over
 * in the port. A dealer fact nobody supplied is null and prints its visible
 * marker, and the one document that prints it cannot be filed until it is.
 */

const facts = {
  buyerName: "Ernesto Salinas",
  buyerIdNumber: "50011234",
  buyerPhone: "(713) 555-0190",
  buyerAddress: "2200 Broadway St, Pearland, TX, 77581",
  vehicleDescription: "2011 Ford Flex",
  vin: "1FMHK6D8XBGA12345",
  saleDate: "2026-10-01",
  quotedRegistrationAmount: 545.5,
};

async function fresh(fee: string, allowUnset = "") {
  vi.stubEnv("NEXT_PUBLIC_DEALER_LATE_HANDLING_FEE", fee);
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", allowUnset);
  vi.resetModules();
  const config = await import("@/lib/dealership-config");
  const responsibility = await import("@/lib/documents/vehicleResponsibility");
  const { default: VehicleResponsibilityDocument } = await import("@/components/documents/VehicleResponsibilityDocument");
  const html = renderToStaticMarkup(createElement(VehicleResponsibilityDocument, { data: facts }));
  return { config, responsibility, html };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("while the owner has not supplied the fee", () => {
  it("is null and prints the marker, never $100", async () => {
    const { config, responsibility, html } = await fresh("");
    expect(config.dealerFees.lateHandlingFee).toBeNull();
    const clause = responsibility.buildReturnClause("en", 545.5);
    expect(clause).toContain("[Not set: late-handling fee]");
    expect(clause).not.toContain("$100");
    expect(html).toContain("[Not set: late-handling fee]");
    expect(html).not.toContain("$100");
    expect(html).not.toContain("$645.50");
  });

  it("refuses to file the Vehicle Responsibility Acknowledgment, and only it", async () => {
    const { config } = await fresh("");
    expect(config.documentFilingBlockedReason("vehicleResponsibility")).toMatch(/Late-handling fee/);
    for (const other of ["billOfSale", "form130U", "financing", "insuranceAcknowledgment", "powerOfAttorney"]) {
      expect(config.documentFilingBlockedReason(other)).toBeNull();
    }
    // Never a packet-wide refusal.
    expect(config.missingDealerFacts().join(" ")).not.toMatch(/late/i);
  });

  it("is lifted for demos exactly as the other unset facts are, and the marker still prints", async () => {
    const { config, html } = await fresh("", "true");
    expect(config.documentFilingBlockedReason("vehicleResponsibility")).toBeNull();
    expect(html).toContain("[Not set: late-handling fee]");
  });
});

describe("once the owner supplies it", () => {
  it("prints the figure and the total with it", async () => {
    const { config, responsibility, html } = await fresh("75");
    expect(config.dealerFees.lateHandlingFee).toBe(75);
    expect(config.documentFilingBlockedReason("vehicleResponsibility")).toBeNull();
    expect(responsibility.buildReturnClause("en", 545.5)).toContain("$75.00");
    expect(html).toContain("$75.00");
    expect(html).toContain("$620.50");
    expect(html).not.toContain("[Not set: late-handling fee]");
  });
});

describe("in the source", () => {
  it("holds no late-fee figure of its own", () => {
    const source = readFileSync("src/lib/documents/vehicleResponsibility.ts", "utf8");
    expect(source).not.toMatch(/LATE_HANDLING_FEE\w*\s*=\s*\d/);
    expect(source).not.toMatch(/lateFee[^=\n]*=\s*\d/);
  });

  it("is checked by the filing action, after the dealer-facts gate", () => {
    const source = readFileSync("src/lib/actions/paperwork.ts", "utf8");
    const facts = source.indexOf("filingBlockedReason()");
    const doc = source.indexOf("documentFilingBlockedReason(documentType)");
    expect(facts).toBeGreaterThan(-1);
    expect(doc).toBeGreaterThan(facts);
    expect(doc).toBeLessThan(source.indexOf('.from("document_agreements")'));
  });
});
