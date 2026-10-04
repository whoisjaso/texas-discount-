import { describe, expect, it } from "vitest";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl, encodeCompletedLink } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { FIELD_MAPPINGS } from "@/lib/fill-130u/field-mapping";
import { routeSale } from "./fixtures/sales";

/**
 * Box 27 enrols the buyer in the state's renewal emails only when they said
 * yes. It used to tick for anybody with an email on file.
 */
const box27 = (data: ReturnType<typeof buildAgreementData>) =>
  FIELD_MAPPINGS.find((mapping) => mapping.fieldId === "Yes Provide Email in 26")?.getValue(data);

describe("renewal reminders are asked, not assumed", () => {
  const filed = (answer: string | undefined) => {
    const sale = routeSale(`r-${answer}`);
    const link = corridorCompletedLink(sale, "form130U", { salePrice: 9000, ...(answer ? { renewalReminders: answer } : {}) }, "https://x.test");
    return buildAgreementData(decodeCompletedLinkFromUrl(link!)!, {}, null);
  };

  it("ticks box 27 on a yes, and not on a no or an unasked question", () => {
    expect(box27(filed("yes"))).toBe(true);
    expect(box27(filed("no"))).toBe(false);
    expect(box27(filed(undefined))).toBe(false);
  });

  it("re-renders a copy filed before the question exactly as it was filed", () => {
    const legacy = encodeCompletedLink("form130U", { buyerEmail: "a@b.co", vehicleVin: "1G1ZD5ST8MF345678" }, {}, "https://x.test");
    expect(box27(buildAgreementData(decodeCompletedLinkFromUrl(legacy)!, {}, null))).toBe(true);
  });
});
