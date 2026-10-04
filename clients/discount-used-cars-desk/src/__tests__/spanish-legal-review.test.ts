import { describe, expect, it } from "vitest";
import {
  SPANISH_LEGAL_REVIEWED,
  SPANISH_REVIEW_CAVEAT_ES,
  withSpanishReviewCaveat,
} from "@/lib/documents/translation-status";
import {
  getAdminWarningBanner,
  getLegalBody,
} from "@/lib/documents/vehicleResponsibility";

describe("Spanish legal copy, flag flipped 28 August 2026", () => {
  it("no longer caveats the Spanish document now the flag is on", () => {
    // English was always the approved original. With the flag flipped the
    // Spanish banner drops the lawyer caveat too — that is the mechanism
    // working, and the flip's record lives on the flag itself.
    expect(getAdminWarningBanner("en")).not.toContain("abogado");
    expect(getAdminWarningBanner("es")).not.toContain("abogado");
  });

  it("keeps the original registration warning either way", () => {
    // The registration-amount warning was never the review caveat; it
    // stays whatever the flag says.
    const banner = getAdminWarningBanner("es");
    expect(banner).toContain("monto de registro");
    expect(banner).not.toContain(SPANISH_REVIEW_CAVEAT_ES);
  });

  it("never puts the caveat on the buyer's copy", () => {
    // The banner is admin-only. The signed clauses must not carry a note
    // telling the buyer their contract is unreviewed.
    const body = getLegalBody("es");
    const printed = [
      body.heading,
      body.intro,
      ...body.clauses,
      body.attestation,
      body.returnClauseTemplate,
    ].join(" ");
    expect(printed).not.toContain("abogado");
    expect(printed).not.toContain(SPANISH_REVIEW_CAVEAT_ES);
  });

  it("clears everywhere from the one flag, which is now flipped", () => {
    // Flipped 28 August 2026 at the owner's direction, ahead of the
    // counsel review it was written to gate — the flag's own comment
    // carries the record. What this test now pins is the mechanism: with
    // the flag on, the caveat is gone everywhere at once.
    expect(SPANISH_LEGAL_REVIEWED).toBe(true);
    expect(withSpanishReviewCaveat("Base.", "en")).toBe("Base.");
    expect(withSpanishReviewCaveat("Base.", "es")).toBe("Base.");
  });

  it("still says the Spanish clauses match the English ones structurally", () => {
    const en = getLegalBody("en");
    const es = getLegalBody("es");
    expect(es.clauses).toHaveLength(en.clauses.length);
  });
});
