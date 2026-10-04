import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeBuyerProfile,
  readBuyerProfile,
  toE164,
} from "@/lib/admin/buyer-profile";
import {
  SALE_DOCUMENTS,
  describeDocumentState,
  documentStateFor,
  outstandingRequiredDocuments,
  saleDocumentHref,
  vehicleLabel,
  type SaleDocumentState,
} from "@/lib/admin/sale-desk";

describe("buyer details carried between documents", () => {
  it("reads the ID number and address off the customer profile", () => {
    const profile = {
      dealership: {
        buyerProfile: {
          buyerLicense: "TX12345678",
          buyerAddress: "1 Main St, Houston, TX",
        },
      },
    };

    expect(readBuyerProfile(profile)).toEqual({
      idNumber: "TX12345678",
      address: "1 Main St, Houston, TX",
    });
  });

  it("treats blank and missing details the same — as not recorded", () => {
    expect(readBuyerProfile(undefined)).toEqual({
      idNumber: undefined,
      address: undefined,
    });
    expect(
      readBuyerProfile({ dealership: { buyerProfile: { buyerLicense: "   " } } }),
    ).toEqual({ idNumber: undefined, address: undefined });
  });

  it("survives a profile that is not an object at all", () => {
    for (const value of ["nonsense", 42, null, [1, 2]]) {
      expect(() => readBuyerProfile(value)).not.toThrow();
    }
  });

  it("keeps details a previous sale recorded when a new one adds to them", () => {
    const prior = {
      birthday: "1990-04-02",
      dealership: {
        portalStartedAt: "2026-01-01",
        buyerProfile: {
          buyerLicense: "TX12345678",
          buyerAddress: "1 Main St",
        },
      },
    };

    const merged = mergeBuyerProfile(prior, { buyerPhone: "+18324009760" });

    // Nothing the first sale wrote may be lost by the second.
    expect(merged.birthday).toBe("1990-04-02");
    const dealership = merged.dealership as Record<string, unknown>;
    expect(dealership.portalStartedAt).toBe("2026-01-01");
    expect(dealership.buyerProfile).toEqual({
      buyerLicense: "TX12345678",
      buyerAddress: "1 Main St",
      buyerPhone: "+18324009760",
    });
  });

  it("overwrites only the field being corrected", () => {
    const merged = mergeBuyerProfile(
      { dealership: { buyerProfile: { buyerLicense: "OLD", buyerAddress: "1 Main St" } } },
      { buyerLicense: "NEW" },
    );

    expect(
      (merged.dealership as Record<string, Record<string, unknown>>).buyerProfile,
    ).toEqual({ buyerLicense: "NEW", buyerAddress: "1 Main St" });
  });
});

describe("buyer phone normalisation", () => {
  it("stores every way a desk types a US number the same way", () => {
    for (const typed of [
      "8324009760",
      "(832) 400-9760",
      "832-400-9760",
      "1 832 400 9760",
      "+18324009760",
    ]) {
      expect(toE164(typed)).toBe("+18324009760");
    }
  });

  it("leaves an already-international number alone", () => {
    expect(toE164(" +52 55 1234 5678 ")).toBe("+52 55 1234 5678");
  });
});

describe("the sale packet", () => {
  const none: Record<string, SaleDocumentState> = {};

  it("lists the documents the sale actually needs", () => {
    // In the order the corridor walks them. The rebuilt disclosure is first
    // because Texas wants it signed before any instrument of sale.
    const titles = SALE_DOCUMENTS.map((entry) => entry.title);
    expect(titles).toEqual([
      "Rebuilt Title Disclosure",
      "Bill Of Sale",
      "Buyer's Guide",
      "Form 130-U",
      "Vehicle Responsibility",
      "Insurance Acknowledgment",
      "Power Of Attorney",
      "Financing Contract",
      // The tow-away packet, last: shown only on a salvage car the sale
      // has chosen to sell as salvage, in the order the buyer signs them.
      "Salvage Bill Of Sale",
      "Tow-Away Acknowledgment",
      "Buyer Responsibility Statement",
    ]);
  });

  it("carries the sale into every document link", () => {
    for (const entry of SALE_DOCUMENTS) {
      expect(saleDocumentHref(entry, "abc-123")).toBe(
        `${entry.href}?dealId=abc-123`,
      );
    }
  });

  it("escapes a deal id rather than pasting it into the URL raw", () => {
    expect(saleDocumentHref(SALE_DOCUMENTS[0], "a b&c")).toContain("a%20b%26c");
  });

  it("never claims a document is signed when nothing is on file", () => {
    for (const entry of SALE_DOCUMENTS) {
      expect(documentStateFor(entry, none)).toBe("none");
    }
  });

  it("distinguishes a saved draft from a filed copy from a signed one", () => {
    /*
      Three states, and the middle one is new because the old wording lied.

      `finalizePaperwork` writes a finalized row whether or not a signature
      came with it, so "Signed and on file" was announced for documents
      nobody had put a name to. On a packet whose entire value is
      evidentiary, that is the one sentence that must not be generous.
      Filing is still done; it is simply not signing.
    */
    const billOfSale = SALE_DOCUMENTS.find((entry) => entry.title === "Bill Of Sale")!;
    expect(describeDocumentState(billOfSale, "draft")).toBe(
      "Draft saved. Not signed yet",
    );
    expect(describeDocumentState(billOfSale, "filed")).toBe(
      "Filed. No signature yet",
    );
    expect(describeDocumentState(billOfSale, "signed")).toBe(
      "Signed and on file",
    );
    expect(describeDocumentState(billOfSale, "none")).toBe("Not started");
  });

  it("only claims signed when a buyer signature is actually recorded", () => {
    // The three columns any of which means a person signed, and the absence
    // of all three meaning we merely generated the document.
    expect(saleDesk).toContain("has_buyer_signature");
    expect(saleDesk).toContain("signature_svg");
    expect(saleDesk).toContain("signed_at");
    expect(saleDesk).toMatch(/buyerSigned\s*$|buyerSigned$|buyerSigned/m);
  });

  it("says the buyer's guide is printed rather than showing it as missing", () => {
    const buyersGuide = SALE_DOCUMENTS.find(
      (entry) => entry.title === "Buyer's Guide",
    )!;
    expect(buyersGuide.documentType).toBeUndefined();
    expect(describeDocumentState(buyersGuide, "none")).toBe(
      "Print when you need it",
    );
  });

  it("does not chase optional documents that were never needed", () => {
    // Every exception document is optional: the buyer registering the car
    // themselves, no insurance shown, a rebuilt title, and us signing the
    // application for an absent buyer. The plan adds each one to the deals
    // that owe it. What every deal owes is the bill of sale and the 130-U,
    // which the buyer at the desk signs themselves; the power of attorney
    // was chased on every sale and could not lawfully be used on most.
    const outstanding = outstandingRequiredDocuments(none).map((e) => e.title);
    expect(outstanding).not.toContain("Vehicle Responsibility");
    expect(outstanding).not.toContain("Insurance Acknowledgment");
    expect(outstanding).not.toContain("Rebuilt Title Disclosure");
    expect(outstanding).not.toContain("Financing Contract");
    expect(outstanding).not.toContain("Power Of Attorney");
    // Nor the buyer's guide, which leaves no record to check against.
    expect(outstanding).not.toContain("Buyer's Guide");
    // And the two every sale needs are chased.
    expect(outstanding).toContain("Bill Of Sale");
    expect(outstanding).toContain("Form 130-U");
  });

  it("clears a document from the outstanding list once it is signed", () => {
    const signed: Record<string, SaleDocumentState> = {
      billOfSale: "finalized",
      form130U: "draft",
    };
    const outstanding = outstandingRequiredDocuments(signed).map((e) => e.title);

    expect(outstanding).not.toContain("Bill Of Sale");
    // A draft is not a signature.
    expect(outstanding).toContain("Form 130-U");
  });
});

describe("vehicle labelling", () => {
  it("reads back as it would be spoken", () => {
    expect(
      vehicleLabel({
        id: "1",
        titleStatus: null,
      year: 2021,
        make: "Chevrolet",
        model: "Malibu",
        vin: null,
        status: null,
        salePrice: null,
        bodyStyle: null,
        mileage: null,
        exteriorColor: null,
        trim: null,
        weightLbs: null,
      }),
    ).toBe("2021 Chevrolet Malibu");
  });

  it("says so plainly when there is no vehicle rather than printing blanks", () => {
    expect(vehicleLabel(null)).toBe("Vehicle not set");
    expect(
      vehicleLabel({
        id: "1",
        titleStatus: null,
      year: null,
        make: null,
        model: null,
        vin: null,
        status: null,
        salePrice: null,
        bodyStyle: null,
        mileage: null,
        exteriorColor: null,
        trim: null,
        weightLbs: null,
      }),
    ).toBe("Vehicle not set");
  });
});

const startSale = readFileSync(
  join(process.cwd(), "src/lib/actions/start-sale.ts"),
  "utf8",
);
const saleDesk = readFileSync(
  join(process.cwd(), "src/lib/admin/sale-desk.ts"),
  "utf8",
);

describe("starting a sale", () => {
  it("requires the operator to be signed in before writing anything", () => {
    expect(startSale).toContain("supabase.auth.getUser()");
    expect(startSale).toContain('error: "Unauthorized"');
  });

  it("reuses a returning buyer instead of creating a second record", () => {
    expect(startSale).toContain('.eq("phone", buyerPhone)');
    expect(startSale).toContain(".maybeSingle()");
  });

  it("points at the open sale when a vehicle already has one", () => {
    expect(startSale).toContain('dealError?.code === "23505"');
    expect(startSale).toContain("existingDealId");
  });

  it("takes the buyer for an ID correction from the deal, not the caller", () => {
    // The correction moved into complete_sale_atomic: the RPC is given a
    // deal id and reads the customer from that deal in-transaction, so it
    // cannot be pointed at somebody else's record — and the correction can
    // no longer commit while the completion fails (round 3, finding 5).
    const completeSale = readFileSync("src/lib/actions/complete-sale.ts", "utf8");
    expect(completeSale).toContain('rpc("complete_sale_atomic"');
    expect(completeSale).toContain("p_buyer_id_number");
    // The old standalone two-step writer is gone.
    expect(startSale).not.toContain("updateSaleBuyerIdNumber");
  });
});

describe("reading a sale", () => {
  it("counts a document as signed only when the record says so", () => {
    expect(saleDesk).toContain("finalized_at");
    expect(saleDesk).toContain("completed_at");
    expect(saleDesk).toContain('agreement.status === "completed"');
  });

  it("keeps the strongest state when a deal holds several attempts", () => {
    // Ranked rather than boolean now: a filed copy must not hide a signed
    // one, which a plain "finalized beats everything" check could not say.
    expect(saleDesk).toMatch(/rank\s*=\s*\{[^}]*signed:\s*3/);
    expect(saleDesk).toContain("rank[state] > rank[held]");
  });
});
