import { describe, expect, it } from "vitest";
import { corridorCompletedLink, oneLineAddress } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { ROUTES } from "./fixtures/sales";

/** "Houston, TX 77034", not "Houston, TX, 77034", on every one-line address. */
describe("an address reads city, state ZIP", () => {
  it("joins the parts the way people write them", () => {
    expect(oneLineAddress("8810 Coronation Dr", "Houston", "TX", "77034")).toBe("8810 Coronation Dr, Houston, TX 77034");
    expect(oneLineAddress("8810 Coronation Dr", "Houston", "", "")).toBe("8810 Coronation Dr, Houston");
  });

  for (const [route, type] of [
    ["bhphTrade", "financing"],
    ["buyerFilesNoInsurance", "vehicleResponsibility"],
    ["buyerFilesNoInsurance", "insuranceAcknowledgment"],
    ["rebuilt", "rebuiltDisclosure"],
    ["towAway", "towAwayAcknowledgment"],
  ] as const) {
    it(`${type}`, () => {
      const dd = decodeCompletedLinkFromUrl(corridorCompletedLink(ROUTES[route], type, { salePrice: 9000 }, "https://x.test")!)!.dd;
      expect(dd.buyerAddress).toBe("8810 Coronation Dr, Houston, TX 77034");
    });
  }
});
