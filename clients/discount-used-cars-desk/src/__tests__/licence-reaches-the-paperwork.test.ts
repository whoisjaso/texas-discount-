import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The confirmed licence has to reach the documents.
 *
 * Everything upstream of this already worked. A phone photographs the card, a
 * barcode or OCR proposes values, a person checks each one against the card in
 * their hand and confirms it. And then the bill of sale prefilled from the
 * customer row instead, so the same values were typed again by hand.
 *
 * `settled()` existed for exactly this and had no production caller at all.
 * The identity work was done and nothing consumed it.
 *
 * Two failures worth keeping fixed, both found in the first version of this
 * merge rather than in review:
 *
 *  - Passing a customerId made the customer row win wholesale, so the licence
 *    was discarded on precisely the screens that pass both.
 *  - Returning a prefill object of nothing but undefined reads as truthy, and
 *    a page uses that truthiness to decide whether a deal carried anything.
 */

const from = vi.fn();
vi.mock("@/lib/supabase/admin-data", () => ({
  createAdminDataClient: async () => ({ from }),
}));

const getCustomerById = vi.fn();
vi.mock("@/lib/supabase/queries/payments", () => ({
  getCustomerById: (...args: unknown[]) => getCustomerById(...args),
}));

/** A deal row, with whatever licence state the case needs. */
function dealRow(stepData: unknown, customer: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: {
            vehicle_id: "v1",
            customer_id: "c1",
            step_data: stepData,
            vehicles: {
              year: 2012,
              make: "NISSAN",
              model: "SENTRA",
              vin: "3N1AB6AP4CL778468",
              trim: null,
              mileage: 154559,
              exterior_color: "BLUE",
              body_style: "4D",
              license_plate: null,
              sale_price: 2500,
              stock_number: null,
            },
            customers: customer,
          },
          error: null,
        }),
      }),
    }),
  };
}

const CONFIRMED = {
  buyerId: {
    image: "deal/1.jpg",
    capturedAt: "2026-08-24T00:00:00.000Z",
    name: { read: "Marisol Andrea Guerrero", confirmed: "Marisol Andrea Guerrero" },
    licenseNumber: { read: "38291746", confirmed: "38291746" },
    dateOfBirth: { read: "1989-03-14", confirmed: "1989-03-14" },
    expires: { read: "2031-03-14", confirmed: "2031-03-14" },
    address: { read: "4412 Aldine Mail Rd, Houston, TX 77039", confirmed: "4412 Aldine Mail Rd, Houston, TX 77039" },
    mailingAddress: "PO Box 220, Houston, TX 77039",
    mailingConfirmed: true,
  },
};

/** The stale customer row the documents used to prefill from. */
const STALE_CUSTOMER = {
  name: "M. Guerrero",
  phone: "713-555-0101",
  email: "marisol@example.com",
  // The real storage shape, not a convenient one: the ID number and address
  // live under dealership.buyerProfile, which is what the sale portal writes.
  profile_data: {
    dealership: {
      buyerProfile: {
        buyerLicense: "OLD-11111",
        buyerAddress: "12 Somewhere Else, Dallas, TX 75201",
      },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getCustomerById.mockResolvedValue(null);
});

async function prefill(args: { dealId?: string; customerId?: string }) {
  const { getDocumentPrefill } = await import("@/lib/admin/document-prefill");
  return getDocumentPrefill(args);
}

describe("a confirmed licence reaches the document", () => {
  it("overrides the customer row that was typed months ago", async () => {
    from.mockReturnValue(dealRow(CONFIRMED, STALE_CUSTOMER));

    const result = await prefill({ dealId: "d1" });

    expect(result.buyerPrefill?.name).toBe("Marisol Andrea Guerrero");
    expect(result.buyerPrefill?.idNumber).toBe("38291746");
  });

  it("keeps the customer details the licence does not carry", async () => {
    from.mockReturnValue(dealRow(CONFIRMED, STALE_CUSTOMER));

    const result = await prefill({ dealId: "d1" });

    // A licence has no phone number or email on it.
    expect(result.buyerPrefill?.phone).toBe("713-555-0101");
    expect(result.buyerPrefill?.email).toBe("marisol@example.com");
  });

  it("wins even when a customer file is named as well", async () => {
    // The bill of sale passes both. An earlier version let the customer lookup
    // win wholesale, which discarded the licence on the one screen that
    // matters most.
    from.mockReturnValue(dealRow(CONFIRMED, STALE_CUSTOMER));
    getCustomerById.mockResolvedValue({
      id: "c1",
      name: "M. Guerrero",
      phone: "713-555-0101",
      email: "marisol@example.com",
      profile_data: {
        dealership: { buyerProfile: { buyerLicense: "OLD-11111" } },
      },
    });

    const result = await prefill({ dealId: "d1", customerId: "c1" });

    expect(result.buyerPrefill?.idNumber).toBe("38291746");
    expect(result.buyerPrefill?.name).toBe("Marisol Andrea Guerrero");
  });
});

describe("which address goes on the paperwork", () => {
  it("uses the mailing address once somebody has confirmed it", async () => {
    // Where post actually goes, not what is printed on the card. Plates go to
    // the mailing address, and people move faster than licences do.
    from.mockReturnValue(dealRow(CONFIRMED, STALE_CUSTOMER));

    const result = await prefill({ dealId: "d1" });
    expect(result.buyerPrefill?.address).toBe("PO Box 220, Houston, TX 77039");
  });

  it("falls back to the licence address when the mailing one is unconfirmed", async () => {
    // A filled box nobody answered out loud is not a confirmation, and using
    // it would defeat the gate that exists to catch exactly this.
    const unconfirmed = {
      buyerId: { ...CONFIRMED.buyerId, mailingConfirmed: false },
    };
    from.mockReturnValue(dealRow(unconfirmed, STALE_CUSTOMER));

    const result = await prefill({ dealId: "d1" });
    expect(result.buyerPrefill?.address).toBe("4412 Aldine Mail Rd, Houston, TX 77039");
  });
});

describe("an unconfirmed reading never reaches a document", () => {
  it("ignores values the machine read but nobody checked", async () => {
    // The whole safety property of the identity step. A wrong licence number
    // on a title application is a rejected filing, not a typo somebody spots.
    const readOnly = {
      buyerId: {
        ...CONFIRMED.buyerId,
        name: { read: "Marisol Andrea Guerrer0", confirmed: null },
        licenseNumber: { read: "3829I746", confirmed: null },
        address: { read: "4412 Aldine Mail Rd, Houston, TX 77039", confirmed: null },
        mailingAddress: null,
        mailingConfirmed: false,
      },
    };
    from.mockReturnValue(dealRow(readOnly, STALE_CUSTOMER));

    const result = await prefill({ dealId: "d1" });

    expect(result.buyerPrefill?.name).toBe("M. Guerrero");
    expect(result.buyerPrefill?.idNumber).toBe("OLD-11111");
    expect(result.buyerPrefill?.address).toBe("12 Somewhere Else, Dallas, TX 75201");
  });
});

describe("a deal that carries nothing", () => {
  it("returns no prefill rather than an object of blanks", async () => {
    // A page tests this for truthiness to decide whether the deal brought
    // anything worth showing. An object of undefined values is truthy and
    // would quietly turn that check into "always yes".
    from.mockReturnValue(dealRow({}, null));

    const result = await prefill({ dealId: "d1" });
    expect(result.buyerPrefill).toBeUndefined();
  });

  it("still returns the vehicle, which came from a different row", async () => {
    from.mockReturnValue(dealRow({}, null));

    const result = await prefill({ dealId: "d1" });
    expect(result.vehiclePrefill?.vin).toBe("3N1AB6AP4CL778468");
  });

  it("survives step_data that is not shaped like a licence at all", async () => {
    for (const junk of [null, undefined, "not an object", 42, { buyerId: "nope" }]) {
      from.mockReturnValue(dealRow(junk, null));
      await expect(prefill({ dealId: "d1" })).resolves.toBeDefined();
    }
  });
});
