import { describe, expect, it } from "vitest";
import { readBuyerId, writeBuyerId, applyConfirmation, EMPTY_BUYER_ID } from "@/lib/sales/buyer-id";
import { EMPTY_ADDRESS } from "@/lib/sales/aamva";
import { buildHandoffFields } from "@/lib/sales/webdealer";
import { paperworkDefault } from "@/lib/sales/paperwork";
import type { SaleDetail } from "@/lib/admin/sale-desk";

/**
 * The address is collected in pieces and every consumer wants it in pieces.
 *
 * webDEALER has separate inputs for street, city, state and ZIP. The 130-U
 * prints City, County, State and Zip as four boxes. Intake asks for all five
 * in five boxes. The only thing that ever wanted one line was the customer
 * row, and joining for its benefit was quietly costing everybody else.
 */

describe("the county survives", () => {
  it("comes back out of step data after being written", () => {
    const buyerId = applyConfirmation(EMPTY_BUYER_ID, {
      mailing: { street: "4521 Telephone Rd", city: "Houston", state: "tx", postal: "77087", county: "Harris" },
    });
    expect(readBuyerId(writeBuyerId({}, buyerId)).mailing.county).toBe("Harris");
  });

  it("is not dropped when somebody confirms the address", () => {
    // applyConfirmation rebuilds the mailing object field by field, which is
    // where the county used to disappear: it was simply not one of the fields
    // being copied across, so confirming an address erased it.
    const first = applyConfirmation(EMPTY_BUYER_ID, {
      mailing: { ...EMPTY_ADDRESS, city: "Katy", county: "Fort Bend" },
    });
    const second = applyConfirmation(first, {
      mailing: { ...first.mailing, street: "112 Pin Oak Rd" },
    });
    expect(second.mailing.county).toBe("Fort Bend");
    expect(second.mailing.street).toBe("112 Pin Oak Rd");
  });

  it("is null on a scanned card, because no barcode carries it", () => {
    expect(EMPTY_ADDRESS.county).toBeNull();
  });
});

describe("the 130-U county", () => {
  const context = {
    funding: "cash" as const,
    paidToday: null,
    bodyStyle: "",
    licenceState: "TX",
    answers: {},
  };

  it("uses what the operator typed, not what the city implies", () => {
    // Katy straddles a county line, which is exactly the case a lookup gets
    // wrong and a person gets right.
    expect(
      paperworkDefault("form130U", "countyOfResidence", {
        ...context,
        buyerCity: "Katy",
        buyerCounty: "Fort Bend",
      }),
    ).toBe("Fort Bend");
  });

  it("still falls back to the city when nobody typed a county", () => {
    expect(
      paperworkDefault("form130U", "countyOfResidence", {
        ...context,
        buyerCity: "Houston",
        buyerCounty: "",
      }),
    ).toBe("Harris");
  });
});

describe("the webDEALER handoff", () => {
  function sale(mailing: Record<string, string>): SaleDetail {
    return {
      id: "deal-1",
      stepData: { buyerId: { mailing } },
      buyer: { name: "Ada Lovelace", address: "one flattened line", phone: null, email: null, idNumber: null, idState: null },
      vehicle: { vin: "1HGBH41JXMN109186", year: 2009, make: "Honda", model: "Civic", salePrice: 6000, bodyStyle: null, titleStatus: null },
      funding: { type: "cash", lenderId: null, lenderOther: null },
      plate: null, plateAsked: false,
    } as unknown as SaleDetail;
  }

  it("gives each part its own row, so nothing is split by hand", () => {
    const fields = buildHandoffFields(
      sale({ street: "4521 Telephone Rd", city: "Houston", state: "TX", postal: "77087", county: "Harris" }),
      "P123456",
    );
    const value = (key: string) => fields.find((f) => f.key === key)?.value;

    expect(value("buyerStreet")).toBe("4521 Telephone Rd");
    expect(value("buyerCity")).toBe("Houston");
    expect(value("buyerState")).toBe("TX");
    expect(value("buyerZip")).toBe("77087");
    expect(value("buyerCounty")).toBe("Harris");
  });

  it("no longer offers one combined address row to copy", () => {
    const fields = buildHandoffFields(
      sale({ street: "4521 Telephone Rd", city: "Houston", state: "TX", postal: "77087", county: "Harris" }),
      "P123456",
    );
    expect(fields.some((f) => f.key === ("buyerAddress" as never))).toBe(false);
  });

  it("falls back to the customer row's line for a deal with no mailing record", () => {
    const fields = buildHandoffFields(sale({}), "P123456");
    expect(fields.find((f) => f.key === "buyerStreet")?.value).toBe("one flattened line");
    // The parts genuinely are unknown, so they read as missing rather than
    // being invented out of the joined string.
    expect(fields.find((f) => f.key === "buyerCity")?.value).toBeNull();
  });
});
