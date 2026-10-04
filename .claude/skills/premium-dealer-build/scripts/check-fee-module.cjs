#!/usr/bin/env node
// Diffs a desk's Texas fee module against the rulebook's machine-readable
// limits (references/texas-dealer-fees.md, section 5.10), and the desk's
// fee migration against the module's two caps.
//
// Run it on every build (Phase 0, after the rulebook re-check) and every
// January (new Fee Chart 1C). The desk's own test
// (the-legal-limits-carry-their-citations) pins the same pairs inside vitest;
// this script lets the skill check a desk without running its test suite.
//
// Usage: node check-fee-module.cjs [deskDir]
//   deskDir defaults to clients/discount-used-cars-desk under the current
//   directory (run it from the repository root, or pass the desk's path).
//   The rulebook is read from this skill's own references/ folder, wherever
//   the skill is installed.
//   Reads <deskDir>/src/lib/legal/texas-dealer-fees.ts, transpiled with the
//   desk's own typescript package (no install), and
//   <deskDir>/supabase/migrations/*_dealer_fee_schedule.sql.
// Exit 0 when every pair agrees; exit 1 with each difference listed.
//
// The script never supplies a figure. When a pair differs, the rulebook is
// the source: correct the rulebook first if the law changed (with its
// citation and effective date), then the module, then rerun.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.cwd();
const RULEBOOK = path.join(__dirname, '..', 'references', 'texas-dealer-fees.md');
const desk = path.resolve(process.argv[2] || 'clients/discount-used-cars-desk');
const MODULE = path.join(desk, 'src/lib/legal/texas-dealer-fees.ts');

function fail(message) {
  console.error(`check-fee-module: ${message}`);
  process.exit(2);
}

function rulebookLimits() {
  if (!fs.existsSync(RULEBOOK)) fail(`no rulebook at ${RULEBOOK}`);
  const text = fs.readFileSync(RULEBOOK, 'utf8');
  const start = text.indexOf('### 5.10 Machine-readable limits');
  if (start < 0) fail('the rulebook has no section 5.10');
  const open = text.indexOf('```json', start);
  const close = text.indexOf('```', open + 7);
  return JSON.parse(text.slice(open + 7, close));
}

function loadModule() {
  if (!fs.existsSync(MODULE)) fail(`no fee module at ${MODULE}`);
  let ts;
  try {
    ts = require(path.join(desk, 'node_modules/typescript'));
  } catch {
    fail(`the desk's typescript package is missing (${desk}/node_modules/typescript); install the desk's dependencies first`);
  }
  const source = fs.readFileSync(MODULE, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: () => fail('the fee module must import nothing') });
  return module.exports;
}

const limits = rulebookLimits();
const m = loadModule();
const dealer = limits.dealerSet;
const state = limits.stateSet;
const differences = [];
let checked = 0;

function same(label, moduleValue, rulebookValue, names = ['module', 'rulebook']) {
  checked += 1;
  const a = JSON.stringify(moduleValue);
  const b = JSON.stringify(rulebookValue);
  if (a !== b) differences.push(`${label}\n    ${`${names[0]}:`.padEnd(10)}${a}\n    ${`${names[1]}:`.padEnd(10)}${b}`);
}

// As of, and the known re-check dates.
same('asOf', m.RULEBOOK_AS_OF, limits.asOf);
same('recheck.knownDates', (m.RECHECK_DATES || []).map((e) => [e.date, e.what]), limits.recheck.knownDates.map((e) => [e.date, e.what]));

// Dealer-set limits.
same('docFee.presumedReasonableMaxCents', m.DOC_FEE.presumedReasonableMaxCents, dealer.docFee.presumedReasonableMaxCents);
same('docFee.aboveMaxRequires', [...m.DOC_FEE.aboveMaxRequires], dealer.docFee.aboveMaxRequires);
same('docFee.bucketIncludesAnyChargeFor', [...m.DOC_FEE.bucketIncludesAnyChargeFor], dealer.docFee.bucketIncludesAnyChargeFor);
same('docFee.taxable', m.DOC_FEE.taxable, dealer.docFee.taxable);
same('docFee.editablePerDeal', m.DOC_FEE.editablePerDeal, dealer.docFee.editablePerDeal);
same('docFee.citation', m.DOC_FEE.citation, dealer.docFee.citation);
same('docFee.effective', m.DOC_FEE.effective, dealer.docFee.effective);
same('docFeeCh345.maxCentsLandOnlyOrWatercraftOnly', m.DOC_FEE_CH345.maxCentsLandOnlyOrWatercraftOnly, dealer.docFeeCh345.maxCentsLandOnlyOrWatercraftOnly);
same('docFeeCh345.maxCentsLandAndWatercraft', m.DOC_FEE_CH345.maxCentsLandAndWatercraft, dealer.docFeeCh345.maxCentsLandAndWatercraft);
same('docFeeCh345.filingException', m.DOC_FEE_CH345.filingException, dealer.docFeeCh345.filingException);
same('docFeeCh345.citation', m.DOC_FEE_CH345.citation, dealer.docFeeCh345.citation);
same('docFeeCh345.effective', m.DOC_FEE_CH345.effective, dealer.docFeeCh345.effective);
same('dealerDeputyTitleFee.maxCents', m.DEALER_DEPUTY_TITLE_FEE.maxCents, dealer.dealerDeputyTitleFee.maxCents);
same('dealerDeputyTitleFee.defaultCents', m.DEALER_DEPUTY_TITLE_FEE.defaultCents, dealer.dealerDeputyTitleFee.defaultCents);
same('dealerDeputyTitleFee.citation', m.DEALER_DEPUTY_TITLE_FEE.citation, dealer.dealerDeputyTitleFee.citation);
same('dealerDeputyTitleFee.effective', m.DEALER_DEPUTY_TITLE_FEE.effective, dealer.dealerDeputyTitleFee.effective);
same('plateDatabaseFee.statutoryMaxCents', m.PLATE_DATABASE_FEE.statutoryMaxCents, dealer.plateDatabaseFee.statutoryMaxCents);
same('plateDatabaseFee.platformMaxCents', m.PLATE_DATABASE_FEE.platformMaxCents, dealer.plateDatabaseFee.platformMaxCents);
same('plateDatabaseFee.citation', m.PLATE_DATABASE_FEE.citation, dealer.plateDatabaseFee.citation);
same('vitReimbursement.maxFormula', m.VIT_REIMBURSEMENT.maxFormula, dealer.vitReimbursement.maxFormula);
same('vitReimbursement.zeroWhen', [...m.VIT_REIMBURSEMENT.zeroWhen], dealer.vitReimbursement.zeroWhen);
same('vitReimbursement.label', m.VIT_REIMBURSEMENT.label, dealer.vitReimbursement.label);
same('vitReimbursement.citation', m.VIT_REIMBURSEMENT.citation, dealer.vitReimbursement.citation);
same('otherDealerCharges.separateLineMaxCents', m.OTHER_DEALER_CHARGES.separateLineMaxCents, dealer.otherDealerCharges.separateLineMaxCents);
same('otherDealerCharges.citation', m.OTHER_DEALER_CHARGES.citation, dealer.otherDealerCharges.citation);
same('combinedOnTopOfPrice.statutoryAggregateCap', m.COMBINED.statutoryAggregateCap, dealer.combinedOnTopOfPrice.statutoryAggregateCap);
same('combinedOnTopOfPrice.withNothingElseRecordedCents', m.COMBINED.withNothingElseRecordedCents, dealer.combinedOnTopOfPrice.withNothingElseRecordedCents);
same('combinedOnTopOfPrice.formula', m.COMBINED.formula, dealer.combinedOnTopOfPrice.formula);
same('combinedOnTopOfPrice.citation', m.COMBINED.citation, dealer.combinedOnTopOfPrice.citation);

// State-set figures (shown read-only; the desk never asks for them).
const fees = m.STATE_FEES_2026;
same('salesTax.rate', fees.salesTax.rate, state.salesTax.rate);
same('titleFee.cents', fees.titleFee.cents, state.titleFee.cents);
same('titleFee.affectedCounties', [...m.AFFECTED_COUNTIES], state.titleFee.affectedCounties);
same('titleFee.confirmed33ByNonattainment', [...fees.titleFee.confirmed33ByNonattainment], state.titleFee.confirmed33ByNonattainment);
same('titleFee.nonattainmentListComplete', fees.titleFee.nonattainmentListComplete, state.titleFee.nonattainmentListComplete);
same('titleFee.citation', fees.titleFee.citation, state.titleFee.citation);
same('registrationBase.upTo6000lb', fees.registrationBase.cents.upTo6000lb, state.registrationBase.cents.upTo6000lb);
same('registrationBase.6001to10000lb', fees.registrationBase.cents.from6001to10000lb, state.registrationBase.cents['6001to10000lb']);
same('registrationBase.motorcycleOrMoped', fees.registrationBase.cents.motorcycleOrMoped, state.registrationBase.cents.motorcycleOrMoped);
same('texasSureFee.cents', fees.texasSureFee.cents, state.texasSureFee.cents);
same('localCountyFee.statutoryMaxCents', fees.localCountyFee.statutoryMaxCents, state.localCountyFee.statutoryMaxCents);
same('localCountyFee.known2026Cents', fees.localCountyFee.known2026Cents, state.localCountyFee.known2026Cents);
same('processingHandlingFee.cents', fees.processingHandlingFee.cents, state.processingHandlingFee.cents);
same('inspectionReplacementFee.cents', fees.inspectionReplacementFee.cents, state.inspectionReplacementFee.cents);
same('emissionsFeeAtRegistration.ruleCentsNonLirap', fees.emissionsFeeAtRegistration.ruleCentsNonLirap, state.emissionsFeeAtRegistration.ruleCentsNonLirap);
same('emissionsFeeAtRegistration.publishedCents', fees.emissionsFeeAtRegistration.publishedCents, state.emissionsFeeAtRegistration.publishedCents);
same('emissionsFeeAtRegistration.hardCode', fees.emissionsFeeAtRegistration.hardCode, state.emissionsFeeAtRegistration.hardCode);
same('emissionsCounties.current', [...m.EMISSIONS_COUNTIES.current], state.emissionsCounties.current);
same('emissionsCounties.addedOn', m.EMISSIONS_COUNTIES.addedOn, state.emissionsCounties.addedOn);
same('buyerPlateFee.cents', fees.buyerPlateFee.cents, state.buyerPlateFee.cents);
same('evFee.cents', fees.evFee.cents, state.evFee.cents);

// The migration repeats the module's two caps, and no other cap figure.
const migrations = path.join(desk, 'supabase/migrations');
const feeMigration = fs.existsSync(migrations) ? fs.readdirSync(migrations).find((f) => /_dealer_fee_schedule\.sql$/.test(f)) : null;
if (!feeMigration) {
  differences.push('migration: no *_dealer_fee_schedule.sql in supabase/migrations');
} else {
  const sql = fs.readFileSync(path.join(migrations, feeMigration), 'utf8').replace(/--.*$/gm, '');
  const presumed = m.DOC_FEE.presumedReasonableMaxCents;
  const deputy = m.DEALER_DEPUTY_TITLE_FEE.maxCents;
  for (const needle of [
    `occc_filed_max_cents > ${presumed}`,
    `deputy_fee_cents between 0 and ${deputy}`,
    `v_doc > ${presumed} and v_max is null`,
    `v_deputy_fee > ${deputy}`,
  ]) {
    checked += 1;
    if (!sql.includes(needle)) differences.push(`migration ${feeMigration}: missing "${needle}"`);
  }
  const figures = new Set(
    [...sql.matchAll(/(?:_cents|v_doc|v_max|v_deputy_fee)\s*(?:<=|>=|<|>|between 0 and)\s*(\d+)/g)].map((match) => Number(match[1])),
  );
  figures.delete(0);
  same(`migration ${feeMigration}: cap figures`, [...figures].sort((a, b) => a - b), [deputy, presumed].sort((a, b) => a - b), ['sql', 'module']);
}

// The rulebook's re-check is due once the calendar year passes its as-of date.
const today = new Date().toISOString().slice(0, 10);
const due = today.slice(0, 4) > String(limits.asOf).slice(0, 4);

if (differences.length) {
  console.log(`check-fee-module: ${differences.length} of ${checked} checks differ (${path.relative(ROOT, MODULE)} vs rulebook 5.10, as of ${limits.asOf})`);
  for (const d of differences) console.log(`  - ${d}`);
  process.exit(1);
}
console.log(`check-fee-module: OK, ${checked} checks agree (${path.relative(ROOT, MODULE)} vs rulebook 5.10, as of ${limits.asOf})`);
if (due) console.log(`check-fee-module: the rulebook is from ${limits.asOf}; run its section 6.3 re-checks for ${today.slice(0, 4)} before trusting these figures`);
