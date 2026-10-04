import { describe, expect, it } from "vitest";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { routeSale } from "./fixtures/sales";

/**
 * The state that issued the licence, when the intake did not say, is asked
 * on the bill of sale, and that answer is what every document prints. It
 * used to be stored and dropped: the bill of sale and the 130-U printed
 * "TX" whatever had been answered.
 */
const dd = (sale: ReturnType<typeof routeSale>, type: string) =>
  decodeCompletedLinkFromUrl(corridorCompletedLink(sale, type, { salePrice: 9000 }, "https://x.test")!)!;

describe("the licence state reaches the paper", () => {
  const answered = routeSale("ok-licence", {
    buyer: { idState: null },
    stepData: { paperwork: { billOfSale: { buyerLicenseState: "OK" } } },
  });

  it("prints the answer on the bill of sale and in 130-U box 15", () => {
    expect(dd(answered, "billOfSale").dd.buyerLicenseState).toBe("OK");
    const decoded = dd(answered, "form130U");
    expect(buildAgreementData(decoded, {}, null).buyer_dl_state).toBe("OK");
  });

  it("prints the intake's state when the intake recorded one", () => {
    const intake = routeSale("ok-intake", { buyer: { idState: "LA" }, stepData: { paperwork: { billOfSale: { buyerLicenseState: "OK" } } } });
    expect(dd(intake, "billOfSale").dd.buyerLicenseState).toBe("LA");
  });

  it("keeps the old Texas reading only for a record that never said", () => {
    const legacy = routeSale("legacy", { buyer: { idState: null } });
    expect(dd(legacy, "billOfSale").dd.buyerLicenseState).toBe("TX");
  });
});
