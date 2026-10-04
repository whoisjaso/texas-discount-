import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rulebookLimits } from "./helpers/fees";
import {
  AFFECTED_COUNTIES,
  COMBINED,
  DEALER_DEPUTY_TITLE_FEE,
  DOC_FEE,
  DOC_FEE_CH345,
  EMISSIONS_COUNTIES,
  LEGAL_FIGURES,
  OTHER_DEALER_CHARGES,
  PLATE_DATABASE_FEE,
  RECHECK_DATES,
  RULEBOOK_AS_OF,
  STATE_FEES_2026,
  STATE_TITLE_FEE_DOLLARS,
  VIT_REIMBURSEMENT,
  isEmissionsCounty,
  localFeeCentsForCounty,
  rulebookRecheckDue,
  titleFeeCentsForCounty,
} from "@/lib/legal/texas-dealer-fees";

/**
 * The desk's legal figures are the rulebook's, each with its citation, the
 * date it took effect and its status, and none of its own (rulebook
 * texas-dealer-fees.md, section 5.10, the machine-readable block). If the law
 * changes, the rulebook changes first and this module second; this test fails
 * until they agree. The database's CHECK constraints repeat the caps, and are
 * pinned here too.
 */

type Json = Record<string, unknown>;
const limits = rulebookLimits() as Json;
const dealer = limits.dealerSet as Record<string, Json>;
const state = limits.stateSet as Record<string, Json>;

describe("every figure carries its source", () => {
  it("has a citation, the date it took effect and a status", () => {
    const statuses = ["confirmed", "corrected", "agencyGuidance", "unverified", "platformPolicy", "conflicting"];
    for (const [name, figure] of Object.entries(LEGAL_FIGURES)) {
      expect(figure.citation.trim().length, name).toBeGreaterThan(5);
      expect(String(figure.effective).trim().length, name).toBeGreaterThan(0);
      expect(statuses, name).toContain(figure.status);
    }
  });

  it("is as of the rulebook's own date, with its re-check dates", () => {
    expect(RULEBOOK_AS_OF).toBe("2026-10-03");
    expect(limits.asOf).toBe(RULEBOOK_AS_OF);
    const known = ((limits.recheck as Json).knownDates as Json[]).map((entry) => [entry.date, entry.what]);
    expect(RECHECK_DATES.map((entry) => [entry.date, entry.what])).toEqual(known);
    expect(rulebookRecheckDue("2026-12-31")).toBe(false);
    expect(rulebookRecheckDue("2027-01-01")).toBe(true);
  });
});

describe("the dealer-set limits are the rulebook's", () => {
  it("documentary fee", () => {
    const rule = dealer.docFee;
    expect(DOC_FEE.presumedReasonableMaxCents).toBe(rule.presumedReasonableMaxCents);
    expect(DOC_FEE.presumedReasonableMaxCents).toBe(22500);
    expect([...DOC_FEE.aboveMaxRequires]).toEqual(rule.aboveMaxRequires);
    expect([...DOC_FEE.bucketIncludesAnyChargeFor]).toEqual(rule.bucketIncludesAnyChargeFor);
    expect(DOC_FEE.citation).toBe(rule.citation);
    expect(DOC_FEE.effective).toBe(rule.effective);
    expect(DOC_FEE.taxable).toBe(rule.taxable);
    expect(DOC_FEE.editablePerDeal).toBe(rule.editablePerDeal);
    expect(DOC_FEE.sameForFranchisedAndIndependent).toBe(true);
  });

  it("Ch. 345 documentary fee", () => {
    const rule = dealer.docFeeCh345;
    expect(DOC_FEE_CH345.maxCentsLandOnlyOrWatercraftOnly).toBe(rule.maxCentsLandOnlyOrWatercraftOnly);
    expect(DOC_FEE_CH345.maxCentsLandAndWatercraft).toBe(rule.maxCentsLandAndWatercraft);
    expect(DOC_FEE_CH345.filingException).toBe(rule.filingException);
    expect(DOC_FEE_CH345.citation).toBe(rule.citation);
    expect(DOC_FEE_CH345.effective).toBe(rule.effective);
  });

  it("dealer-deputy title fee", () => {
    const rule = dealer.dealerDeputyTitleFee;
    expect(DEALER_DEPUTY_TITLE_FEE.maxCents).toBe(rule.maxCents);
    expect(DEALER_DEPUTY_TITLE_FEE.defaultCents).toBe(rule.defaultCents);
    expect(DEALER_DEPUTY_TITLE_FEE.citation).toBe(rule.citation);
    expect(DEALER_DEPUTY_TITLE_FEE.effective).toBe(rule.effective);
  });

  it("plate-database fee", () => {
    const rule = dealer.plateDatabaseFee;
    expect(PLATE_DATABASE_FEE.statutoryMaxCents).toBe(rule.statutoryMaxCents);
    expect(PLATE_DATABASE_FEE.platformMaxCents).toBe(rule.platformMaxCents);
    expect(PLATE_DATABASE_FEE.citation).toBe(rule.citation);
  });

  it("inventory tax, other charges and the combined line", () => {
    expect(VIT_REIMBURSEMENT.maxFormula).toBe(dealer.vitReimbursement.maxFormula);
    expect([...VIT_REIMBURSEMENT.zeroWhen]).toEqual(dealer.vitReimbursement.zeroWhen);
    expect(VIT_REIMBURSEMENT.label).toBe(dealer.vitReimbursement.label);
    expect(VIT_REIMBURSEMENT.citation).toBe(dealer.vitReimbursement.citation);
    expect(OTHER_DEALER_CHARGES.separateLineMaxCents).toBe(dealer.otherDealerCharges.separateLineMaxCents);
    expect(OTHER_DEALER_CHARGES.citation).toBe(dealer.otherDealerCharges.citation);
    expect(COMBINED.statutoryAggregateCap).toBe(dealer.combinedOnTopOfPrice.statutoryAggregateCap);
    expect(COMBINED.withNothingElseRecordedCents).toBe(dealer.combinedOnTopOfPrice.withNothingElseRecordedCents);
    expect(COMBINED.formula).toBe(dealer.combinedOnTopOfPrice.formula);
    expect(COMBINED.citation).toBe(dealer.combinedOnTopOfPrice.citation);
  });
});

describe("the state-set figures are the rulebook's", () => {
  it("tax, title and registration", () => {
    expect(STATE_FEES_2026.salesTax.rate).toBe(state.salesTax.rate);
    expect(STATE_FEES_2026.titleFee.cents).toEqual(state.titleFee.cents);
    expect([...AFFECTED_COUNTIES]).toEqual(state.titleFee.affectedCounties);
    expect([...STATE_FEES_2026.titleFee.confirmed33ByNonattainment]).toEqual(state.titleFee.confirmed33ByNonattainment);
    expect(STATE_FEES_2026.titleFee.nonattainmentListComplete).toBe(state.titleFee.nonattainmentListComplete);
    expect(STATE_FEES_2026.titleFee.citation).toBe(state.titleFee.citation);
    const reg = state.registrationBase.cents as Json;
    expect(STATE_FEES_2026.registrationBase.cents.upTo6000lb).toBe(reg.upTo6000lb);
    expect(STATE_FEES_2026.registrationBase.cents.from6001to10000lb).toBe(reg["6001to10000lb"]);
    expect(STATE_FEES_2026.registrationBase.cents.motorcycleOrMoped).toBe(reg.motorcycleOrMoped);
    expect(STATE_FEES_2026.texasSureFee.cents).toBe(state.texasSureFee.cents);
    expect(STATE_TITLE_FEE_DOLLARS).toEqual([33, 28]);
  });

  it("county, processing, inspection, emissions, plate and EV fees", () => {
    expect(STATE_FEES_2026.localCountyFee.statutoryMaxCents).toBe(state.localCountyFee.statutoryMaxCents);
    expect(STATE_FEES_2026.localCountyFee.known2026Cents).toEqual(state.localCountyFee.known2026Cents);
    expect(STATE_FEES_2026.processingHandlingFee.cents).toBe(state.processingHandlingFee.cents);
    expect(STATE_FEES_2026.inspectionReplacementFee.cents).toEqual(state.inspectionReplacementFee.cents);
    expect(STATE_FEES_2026.inspectionReplacementFee.ownLine).toBe(true);
    expect(STATE_FEES_2026.emissionsFeeAtRegistration.ruleCentsNonLirap).toBe(state.emissionsFeeAtRegistration.ruleCentsNonLirap);
    expect(STATE_FEES_2026.emissionsFeeAtRegistration.publishedCents).toBe(state.emissionsFeeAtRegistration.publishedCents);
    expect(STATE_FEES_2026.emissionsFeeAtRegistration.hardCode).toBe(false);
    expect([...EMISSIONS_COUNTIES.current]).toEqual((state.emissionsCounties as Json).current);
    expect(EMISSIONS_COUNTIES.addedOn).toEqual((state.emissionsCounties as Json).addedOn);
    expect(STATE_FEES_2026.buyerPlateFee.cents).toBe(state.buyerPlateFee.cents);
    expect(STATE_FEES_2026.evFee.cents).toEqual(state.evFee.cents);
  });

  it("answers by county, and says so when it cannot", () => {
    expect(titleFeeCentsForCounty("Harris")).toBe(3300);
    expect(titleFeeCentsForCounty("Travis County")).toBe(3300);
    // No primary-source list of $28 counties was compiled: webDEALER decides.
    expect(titleFeeCentsForCounty("Lubbock")).toBeNull();
    expect(localFeeCentsForCounty("harris")).toBe(1150);
    expect(localFeeCentsForCounty("Lubbock")).toBeNull();
    expect(isEmissionsCounty("Harris", "2026-10-03")).toBe(true);
    expect(isEmissionsCounty("Bexar", "2026-10-31")).toBe(false);
    expect(isEmissionsCounty("Bexar", "2026-11-01")).toBe(true);
  });
});

describe("the database repeats the caps", () => {
  const sql = readFileSync("supabase/migrations/20261003000000_dealer_fee_schedule.sql", "utf8").replace(/--.*$/gm, "");

  it("with the module's own figures", () => {
    const presumed = DOC_FEE.presumedReasonableMaxCents;
    const deputy = DEALER_DEPUTY_TITLE_FEE.maxCents;
    expect(sql).toContain(`occc_filed_max_cents > ${presumed}`);
    expect(sql).toContain(`doc_fee_cents <= ${presumed} or (occc_filed_max_cents is not null and doc_fee_cents <= occc_filed_max_cents)`);
    expect(sql).toContain(`deputy_fee_cents between 0 and ${deputy}`);
    expect(sql).toContain(`v_doc > ${presumed} and v_max is null`);
    expect(sql).toContain(`v_max <= ${presumed}`);
    expect(sql).toContain(`v_deputy_fee > ${deputy}`);
    // No other cap figure is typed in the migration: every cents comparison
    // is against one of the two, or zero.
    const figures = new Set(
      [...sql.matchAll(/(?:_cents|v_doc|v_max|v_deputy_fee)\s*(?:<=|>=|<|>|between 0 and)\s*(\d+)/g)].map((match) => Number(match[1])),
    );
    figures.delete(0);
    expect([...figures].sort((a, b) => a - b)).toEqual([deputy, presumed].sort((a, b) => a - b));
  });
});
