import { describe, expect, it } from "vitest";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import { buildHandoffFields, handoffClipboardText, missingHandoffFields, splitHandoffZip } from "@/lib/sales/webdealer";

function sale(postal = "77002-0421", weight: number | null = 3265, typedWeight?: string): SaleDetail {
  return {
    id: "copy-test", buyer: { name: "Ana María Torres Ruiz", address: "1840 Oak St" },
    vehicle: { weightLbs: weight, vin: "1HGCM82633A004352", year: 2003, make: "Honda", model: "Accord", salePrice: 5000 },
    stepData: { buyerId: { mailing: { street: "1840 Oak St", city: "Houston", state: "TX", postal, county: "Harris" } },
      paperwork: { form130U: typedWeight === undefined ? {} : { emptyWeight: typedWeight } } },
    funding: { type: "cash" },
  } as unknown as SaleDetail;
}

describe("webDEALER copy fields match the destination boxes", () => {
  it("preserves the entire legal name in Name 1 and separates address parts", () => {
    const fields = buildHandoffFields(sale(), "P123456");
    const field = (key: string) => fields.find((item) => item.key === key);
    expect(field("buyerName")).toMatchObject({ label: "Name 1", value: "Ana María Torres Ruiz" });
    expect(field("buyerStreet")?.value).toBe("1840 Oak St");
    expect(field("buyerCity")?.value).toBe("Houston");
    expect(field("buyerState")?.value).toBe("TX");
    expect(field("buyerZip")?.value).toBe("77002");
    expect(field("buyerZipPlus4")?.value).toBe("0421");
  });

  it.each(["770020421", "77002-0421", "77002 0421"])("splits %s without losing leading zeros", (postal) => {
    expect(splitHandoffZip(postal)).toEqual({ zip: "77002", plus4: "0421" });
  });

  it.each(["7700", "77002-4", "77002-12345", "unknown", ""])("does not guess malformed ZIP %s", (postal) => {
    expect(splitHandoffZip(postal)).toEqual({ zip: null, plus4: null });
  });

  it("shows an absent extension as not supplied without calling it required", () => {
    const fields = buildHandoffFields(sale("77002"), null);
    expect(fields.find((item) => item.key === "buyerZipPlus4")).toMatchObject({ value: null, optional: true });
    expect(missingHandoffFields(fields).some((item) => item.key === "buyerZipPlus4")).toBe(false);
    expect(handoffClipboardText(fields)).toContain("ZIP +4: (not supplied)");
  });

  it("copies numeric empty weight and prefers the reviewed 130-U answer", () => {
    expect(buildHandoffFields(sale(), null).find((item) => item.key === "emptyWeight")?.value).toBe("3265");
    expect(buildHandoffFields(sale("77002", 3265, "3,480"), null).find((item) => item.key === "emptyWeight")?.value).toBe("3480");
  });

  it.each([null, 0, -20, Number.NaN])("does not invent an unknown or invalid vehicle weight %s", (weight) => {
    expect(buildHandoffFields(sale("77002", weight), null).find((item) => item.key === "emptyWeight")?.value).toBeNull();
  });

  it("does not conceal an invalid reviewed weight behind an old inventory value", () => {
    expect(buildHandoffFields(sale("77002", 3265, "not confirmed"), null).find((item) => item.key === "emptyWeight")?.value).toBeNull();
  });
});
