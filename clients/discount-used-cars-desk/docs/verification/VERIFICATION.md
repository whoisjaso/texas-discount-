# Verification

Discount Used Cars and Trucks sale desk, verified 10/01/2026 (business date,
America/Chicago).

Every run used the local dev server on port 5190, started after deleting
`.next`. It ran on the in-memory preview mock (no Supabase) with
`DESK_ALLOW_UNSET_FACTS=true`, so dealer facts that are still unknown print as
`[Not set: …]`. The walk server also needed four throwaway local values,
passed on the command line and never written to a file:

- `ADMIN_SESSION_SECRET`, because Start A Sale issues a capture token;
- `INTERNAL_RENDER_TOKEN`, `CHROME_PATH` and `PORT=5190`, because the PDF
  route renders through headless Chrome.

The desk this one was forked from has the same requirements.

## 00000000. Paperwork, page by page: the fix round, walked (10/03/2026)

The page-by-page paperwork (README "Paperwork, page by page"; SOP
"Document templates, page by page") went through a live verify at both
sizes (13 problems) and a code review (13 findings). This section records
what was fixed, the test for each, and this round's walks. The verify
round's own screenshots stay in `docs/verification/paperwork-pages/`; this
round's are in `docs/verification/paperwork-pages-fix/` (910 screenshots,
compressed with PIL to at most 1600 px wide, 128 colours: 51.6 MB to
19.5 MB; the designed sheets' PDFs; the 130-U PDFs, 2.3 MB each, are
rasterised in `paper/` and read back in the logs instead of committed).

**Servers.** The local dev server on port **5190** only, started fresh
(`.next` deleted) in its own process group (`setsid`) and stopped by its
PGID, the port checked free after each; `next-env.d.ts` restored by copy
after every stop and build. Four servers: one per size for the walks, one
for the co-buyer walk again at 1440 and recordly-demo's scenarios, one for
those scenarios again. All on the preview mock with
`DESK_ALLOW_UNSET_FACTS=true`, `DESK_PREVIEW_MEMBER=fresh`, the owner
preview cookie, throwaway `ADMIN_SESSION_SECRET` and `INTERNAL_RENDER_TOKEN`,
and `NODE_USE_ENV_PROXY=1` so the address lookup reaches the Census
geocoder. Onboarding with the fees left for later, so the documentary fee
is unset and prints its marker: no figure was typed for it.

### Static checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` | 0 errors; the same 4 warnings, in files this round did not touch (`paper-palette-contrast.test.ts`, `the-photograph-lands-before-it-is-read.test.ts`, `the-price-means-one-thing.test.ts`, `Form130UPreview.tsx`) |
| `npx vitest run --maxWorkers=2` | 268 files, 2,936 tests, all passed (`test-output.txt`); 246 and 2,771 at the end of the build |
| `npx next build` | compiled; `next-env.d.ts`, rewritten by the build, restored by copy |

### What the verify and the review found, and what was done (a test each)

| Finding | Fix | Test |
|---|---|---|
| A co-buyer typed at Start A Sale reached no paper (verify 1) | The name is kept on the sale (`step_data.coBuyer`, `sales/co-buyer.ts`, written by Start A Sale) and printed on the bill of sale, the contract and the 130-U's box 17; the co-buyer's details and signature are left for ink | `the-co-buyer-named-at-intake-is-on-the-paper` |
| The contract printed an empty CO-BUYER box and signature line on every financed sale (verify 2) | The block and line are rendered only with a co-buyer, on screen and on the printed letter page | `no-empty-co-buyer-box-prints-on-the-contract` |
| The 130-U review showed stored codes (verify 3, review 12) | The review words each 130-U box as the form does ("Title & Registration", "Individual", "Actual Mileage") | `the-130u-review-says-what-the-form-says` |
| A business applicant's review contradicted the filed page (verify 4) | Box 13, 14, 15, 16 and the printed-name line read back as the page prints them: the entity name and FEIN, no photo ID or name parts; each row on its condition | `the-130u-review-says-what-the-form-says`, `a-box-the-sale-requires-is-refused-blank` |
| The review called the dealer's printed name blank (verify 5, review 5) | The review passes the filer's onboarding name, saved signature, the sale date and the fee setting, as the filing does | `the-review-prints-the-filers-name`, `the-review-reads-back-the-page` |
| The paperwork's tap cards were narrow and centred (verify 6) | They fill the column two-up, as Handle A Sale's do | `tap-cards-fill-the-column` |
| No Back on a document's first question or on a Change trip (verify 7) | Back goes to the previous question, the guide, or the review | `every-paperwork-screen-has-a-way-back` |
| An unset documentary fee printed $0.00 (verify 8) | Filing stamps `docFeeUnset`; the sheets, the contract and the review print `[Not set: doc fee]` | `an-unset-doc-fee-prints-its-marker` |
| Wrong source chips; the rate without its % (verify 9) | "From Start Sale" for what the intake took down, "Worked out" for a solved rate, the rate with % | `the-chips-say-where-it-came-from` |
| A Spanish review was half in English (verify 10) | Headings, chips, the desk's own values and the marker in the screen's language; a line says the box labels quote the English paper | `the-spanish-review-speaks-spanish` |
| The trade-in VIN was asked before the description, against the docs (verify 11) | The order is kept (the car is identified before it is described) and the docs now say so (`corridor-changes.md`, the SOP) | `every-question-is-for-a-box-on-its-document` ("asks the trade-in's VIN right after the trade-in") |
| A cash sale's review listed 74 boxes, co-buyer and lien rows among them (verify 12) | A box on a condition the sale does not meet is not read back (the test's paid-in-full cash bill of sale: 55 rows, no co-buyer or lien rows) | `the-review-lists-only-this-sales-boxes` |
| Bills of sale filed before the change reprinted a different Total Paid and a new ink date (review 1, 13a) | Only the change's own stamp (`pageLayout`) switches the reading; an old copy prints its total due and its old ink date | `an-old-bill-of-sale-reprints-as-it-was-signed`, `a-filed-copy-renders-as-it-was-filed` |
| A bank deal's Total Paid read as the down payment alone (review 2) | The total due, with "Financed by <lender>" for the lender's share | `a-bank-deal-is-paid-in-full` |
| A filed power of attorney reprinted the sale as it is now (review 3) | The reprint reads `form_data.printed`, what was signed | `a-filed-power-of-attorney-reprints-what-was-signed` |
| A `when` condition was prose nothing evaluated (review 4) | Conditions are predicates (`field-maps/conditions.ts`); a box a condition requires is refused blank (`fieldMissing`), so a business with no name or FEIN does not file | `a-box-the-sale-requires-is-refused-blank` |
| The 130-U's printed name dropped the suffix (review 6) | Stamped copies print the whole name, as box 16, the bill of sale and the VTR-271 do; an old copy keeps its name | `the-130u-keeps-the-suffix` (changed, see below), `one-buyer-one-printed-name` |
| A map box the paper lacked (warranty kind); shares asked with no box (review 7) | The warranty kind is the Buyers Guide's row; the shares are carried for the Buyers Guide and read back under it | `every-printed-box-is-on-the-paper`, `every-question-is-for-a-box-on-its-document` |
| Coverage gaps: worked-out figures, question paths (review 8) | Every figure a renderer works out is on its map and the read-back; every 130-U field written is mapped; every Change link opens its question; fixtures for the intake gaps | `every-printed-box-is-on-the-paper`, `nothing-the-130u-writes-is-left-off-its-map`, `every-change-link-opens-its-question` |
| The rebuilt disclosure asked the licence state for a box it does not print (review 9) | Borrowing reads only boxes a document prints | `every-question-is-for-a-box-on-its-document` |
| Map sources the code did not use (review 10) | The licence state reads the intake, then the answer (`fallback`); the late-handling fee is the dealer's fact; the complaints contact is the form's words | `the-sources-the-maps-name-are-the-ones-the-paper-reads` |
| Taps with no way in for a real answer (review 11) | A typed place behind the state list, "Another Way" for the payment method, a first payment before the contract date refused | `a-real-answer-has-a-way-in` |
| The Buyers Guide fell back to AS IS when its sale could not be read (review 13b) | Refused instead | `a-buyers-guide-states-its-sale-or-is-refused` |
| **Found in this round's walks:** the 130-U's printed-name line, for a business, read back as "From the licence" | Two rows on one box, as box 14: the person's name, or the entity name from the answer | `the-130u-review-says-what-the-form-says` |

Also changed: the county starts only from the intake's address lookup; the
county a city usually lies in is offered as the likely card and filed only
when tapped (south Amarillo is Randall, not Potter).

**Tests changed, and why** (each assertion replaced by an equal or stronger one):

- `the-130u-keeps-the-suffix`: the printed name now keeps the suffix
  (review 6). The old expectation ("Avery J Collins") is kept for a copy
  filed before the stamp; the new one ("Avery J Collins Jr") is added.
- `a-filed-copy-renders-as-it-was-filed`: its list of new stamps named
  `amountPaidToday`, `stockNumber` and `tradeInVin`, which every corridor
  copy already carried (review 1); it now names the change's own stamps
  (`pageLayout`, `docFeeUnset`) and also asserts an old copy's Total Paid
  equals its total due.
- `the-review-reads-back-the-page`: the review's `readBack` call now passes
  the filer's name, stroke and fee setting; the pattern matches that and
  checks each.
- `every-state-form-box-is-on-its-map`: a row may name several AcroForm
  boxes (`acroFields`, box 13's kinds); coverage counts them.
- `the-bill-of-sale-holds-everything-it-states`: the key list also covers a
  filing with the doc fee unset.
- `filing-again-goes-through-the-same-gates`, `a-filed-bill-of-sale-keeps-its-own-fees`:
  the county comes from the intake or a tap, never from a city guess; the
  fixtures say which.
- `the-130u-review-says-what-the-form-says` (new this round): the business
  printed name is the entity row, with its source.

### Walks (each at 1440×900 and 390×844; 0 page errors, 0 contrast failures)

| Walk | What it asserts | 1440 | 390 |
|---|---|---|---|
| Owner onboarding, fees later | name, signature, the finance question, Done | pass | pass |
| Estimate confirm, cash out the door, cash with a balance, buy here pay here with a trade, bank, buyer files | to the packet, every document signed (2 / 2 or 3 / 3) | pass | pass |
| Co-buyer (buy here pay here, "Marco Ruiz" added at Start A Sale) | 3 / 3 signed; the name on the bill of sale, the contract and the 130-U box 17 | pass (on the second server: the first try was refused because its phone belonged to the bank walk's buyer) | pass |
| Void the buy-here-pay-here bill of sale, file again with $2,000 down | voided with the reason; old link refused; filed again, 3 / 3 signed | pass | pass |
| Tap check, English, business applicant | every paperwork question, Back on each document's second question, review, file | pass | pass |
| Tap check, Spanish, with a co-buyer | the same in Spanish; the co-buyer on the paper | pass | pass |
| Questions asked (`asked-*.log`) | no fact asked twice, none asked that the record holds | pass | pass |

### The paper, read back

Every filed copy (70: both sizes, voided copies included) was read with an
independent reader (PyMuPDF text and AcroForm widgets against each map row,
not the desk's own probe): 0 boxes missing, 0 differing, 0 unfilled, 0 not
found in the text (`readback-*.log`). The only `[Not set: …]` text is the
documentary fee (30 copies: the walks left the owner's fees unset) and the
late-handling fee (the buyer-files Vehicle Responsibility sheet), both
owner facts. In `paper/`:

| Page | Read |
|---|---|
| `bank-bill-of-sale-total-paid.png` | Total Amount Due $15,514.25; "Financed by Chase Auto Finance $15,514.25"; the acknowledgment's Total Paid $15,514.25 beside the lender |
| `cash-balance-bill-of-sale-paid-today.png`, `-acknowledgment.png` | Total Amount Due $3,826.75; Paid Today $3,500.00; balance secured by seller lien $326.75; Total Paid $3,500.00 |
| `unset-doc-fee-marker.png` | Documentary Fee `[Not set: doc fee]`, never $0.00 |
| `co-buyer-contract-p1.png`, `no-co-buyer-contract-p1.png` | CO-BUYER INFORMATION: Marco Ruiz; without a co-buyer, no co-buyer block at all |
| `co-buyer-bill-of-sale-co-buyer.png`, `-signatures.png`, `co-buyer-contract-signatures-p5.png` | the co-buyer's name, an ink line for their signature |
| `co-buyer-130u-box17.png` | box 17: Marco / Ruiz in the form's columns; the additional applicant's printed name |
| `business-130u-p1.png` | Business ticked; 12-3456789 in box 14; Ruiz Landscaping LLC alone in box 16; box 15 blank |

### recordly-demo's scenarios, walked on this corridor

The demo film's off-camera scenarios were walked once on this desk at
1440×900 (`recordly-demo-scenarios/`, each with `walk-report.json`): the
set-up deal to `plan:registration`, the complete sale to the packet, and
the balance sale to the packet. Box 11 is now answered with the desk's own
estimate ("Confirm This Weight"): a typed weight needs the document it was
read from since the empty-weight change, and `validate-scenario.cjs` now
refuses one typed without it. The three are stamped with this corridor
(`deskCorridor 16c80f4cffcce9c4`, desk `bec3e0f` plus the uncommitted
changes) and pass `validate-scenario.cjs --strict`.

### Not done, and why

- The late-handling fee prints `[Not set: late-handling fee]` on the
  buyer-files sheet (verify 13): it is the owner's figure
  (`NEXT_PUBLIC_DEALER_LATE_HANDLING_FEE`); none is invented.
- The trade-in VIN's order was kept rather than moved after the
  description (verify 11): the docs were wrong, not the corridor.

### Open items

- The owner sets the documentary fee (Your Fees) and the late-handling fee
  before real sales; with the demo flag off, filing refuses until then.
- The Discount narration's `checked` record predates this corridor: before
  the next narrated render, re-check lines 14-18 against the desk and
  record the walk's commit and `walk-report.json`.
- The demo storyboards' desk shots were last captured on `2b7bb85`; the
  next capture's preflight (recordly-demo B3) names any paperwork screen
  that moved (`corridor-changes.md`).

## 0000000. Dealer fees: the review fixes, walked (10/03/2026)

The dealer-fee build (owner sets the fees at onboarding, the Texas limits
enforced; README "Dealer fees") went through a law review and a code
review. This section records the fixes and their verification. The walks of
the build itself, before the reviews, are the screenshots in
`docs/verification/fees/`; this round's are in
`docs/verification/fees-fix/{1440,390,paper}` (684 walk screenshots and 5
paper pages, compressed with PIL to at most 1600 px wide, 128 colours:
13.5 MB). Every legal figure below is the rulebook's
(`.claude/skills/premium-dealer-build/references/texas-dealer-fees.md`, as
of 2026-10-03) with its citation.

**Servers.** The local dev server on port **5190** only, each in its own
process group (`setsid`), stopped by its PGID and the port checked free
after each: server A (`DESK_ALLOW_UNSET_FACTS=true`,
`DESK_PREVIEW_MEMBER=fresh`), one fresh per size; a salesperson server
(`DESK_PREVIEW_MEMBER=fresh-sales`), one per size; server B (the flag OFF,
`NEXT_PUBLIC_SITE_URL=http://localhost:5190`), one per size. All on the
preview mock with throwaway `ADMIN_SESSION_SECRET` and
`INTERNAL_RENDER_TOKEN` and `CHROME_PATH` for the PDF renderer.

**Walk inputs (never Discount's figures).** Documentary fee $150.00 at
onboarding, then $175.00; $300.00 under an OCCC filing labelled
`WALK INPUT` (filed 2026-09-01, effective 2026-09-02); $225.01 typed to
see it refused. Government fees from the rulebook's worked example 2.2
(Harris County, gasoline car of 6,000 lb or less, Harris County Tax Office
MV-065 Rev 08/25): title $33.00, registration side $70.75 (the $78.25
published registration total less the $7.50 inspection fee, which has its
own line), inspection program $7.50, plate $10.00.

### Static checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx eslint .` | 0 errors; 4 warnings, all in files this round did not touch (`paper-palette-contrast.test.ts`, `the-photograph-lands-before-it-is-read.test.ts`, `the-price-means-one-thing.test.ts`, `Form130UPreview.tsx`) |
| `npx vitest run --maxWorkers=2` | 211 files, 2,477 tests, all passed (`test-output.txt`); 209 and 2,472 before this session's two new files |
| `npx next build` | compiled; `/admin/sales/[dealId]/government-fees` listed; `next-env.d.ts`, rewritten by the build, restored with `git checkout` |
| public site `npx tsc --noEmit` | 0 errors |
| `node .claude/skills/premium-dealer-build/scripts/check-fee-module.cjs` | OK, 57 checks agree with rulebook 5.10 |

### What the reviews found, and what was done (a test each)

| Finding (severity) | Fix | Test |
|---|---|---|
| The contract's notice was clause 16, two pages from the fee (blocker; Fin. Code §348.006(c)(3)(B) wants it in reasonable proximity on the buyer's order and the contract) | Stamped copies itemize the documentary fee as its own item after the cash price with the notice directly under it; clause 16 kept; unstamped copies print as filed | `the-contract-prints-the-notice-beside-the-fee` |
| An OCCC filing dated in the future counted at once (major; 7 TAC §84.205(c)(3), (c)(5)(A)) | Screen, action and database refuse a future filing date, an effective date before the filing date, and a fee above $225.00 before the effective date; at filing a filing counts only once filed and in effect | `an-occc-filing-counts-only-once-it-is-in-force` |
| Government lines were desk defaults ($33 for everyone, $75 "registration" with the $7.50 inspection fee inside it, no plate line) (major; Fin. Code §348.005, OCCC L25-087, B25-1, 43 TAC §215.155(e)) | Per-sale Government Fees screen recorded from webDEALER; filing refused until recorded (lifted by the demo flag alone), on a county change, or on a malformed record; inspection and plate on their own lines on the bill of sale and contract; both new keys frozen with the bill of sale | `the-state-lines-are-webdealers-figures`, `a-forged-registration-line-does-not-file` |
| A browser session could rewrite a sale's fee copy; two first saves could both log version 1; dates unchecked in the database; roles without sales:read fell back to the seed (major and minors) | `deal_fee_copy_guard` trigger, one advisory lock per save and a unique version index, the date checks in `save_dealer_fee_schedule`, schedule readable by every team role | `the-database-keeps-the-fee-copy-honest` (PGlite, real migrations, `set role authenticated`) |
| A forged registration line in the copy passed every gate (major) | Filing refuses a copy whose government lines are not the desk's own (`feeRecordTampered`) | `a-forged-registration-line-does-not-file` |
| Out-the-door with a trade-in taxed the whole price (major; Tax Code §152.021(b), §152.002(b)(5)) | The split taxes price less trade-in; webDEALER's sales price uses the bill of sale's trade-in | `an-out-the-door-trade-in-is-taxed-on-the-difference` |
| A Ch. 345 vehicle (motorcycle, ATV, moped, towable RV, boat) could file at the Ch. 348 limit (major; 7 TAC §86.201(c)-(e), Fin. Code §345.251) | Bill of sale, salvage bill of sale and contract refused for one (`chapter345Vehicle`), with or without the flag | `a-motorcycle-is-not-this-desks-paperwork` |
| After a fee was lowered an open sale could still file at the higher one (minor; desk policy on §348.006(c)(1)) | `feeAboveToday` refuses it until today's fees are applied; the sale page says why | `one-documentary-fee-for-every-buyer` |
| The older agreements routes skipped undecodable links, portal data and PATCH (minor) | Every fee-document payload checked against the deal's fees; undecodable POSTed link refused; filed copies stamped; `/complete` refuses an unstamped documentary fee | `the-older-routes-check-every-fee-document` |
| Apply Today's Fees reported success without its record, rewrote closed sales, raced a filing; legacy copy unlogged; change-log source from the browser (minor) | Copy and record together (put back on failure or a concurrent filing); closed sales refused; `deal_fees_copied` logged; source derived on the server | `a-fee-change-on-a-sale-keeps-its-record` |
| A salvage copy filed before the tow-away change was re-figured at $0 registration (minor) | Unstamped salvage copies keep the registration their figures rest on | `a-tow-away-copy-filed-before-keeps-its-figures` |
| Wording: deputy limit stated as a title-fee ban, LIRAP emissions figure missing, Ch. 345 credited to the statute alone, over-limit message wrong under a filing, desk policy stated as law, "dealer fees" on the public site; UI: no way back to Your Fees, disabled Next looked live, gap under review sub-headings (minors) | Each sentence corrected in both languages; Your Fees in the sidebar for the owner alone; disabled style; gap closed | `the-fee-words-say-what-the-law-says` |
| The OCCC seed could raise the limit in production (minor) | Ignored in production | `an-occc-filing-counts-only-once-it-is-in-force` ("the environment cannot raise the cap in production") |
| **Found in this round's walks:** saving the government fees left a blank review with "Failed to execute 'removeChild' on 'Node'" (every time at 390, once at 1440) | The action no longer revalidates (every reading screen is per request), and the form only navigates after a save; the instrumented probe named the node (`.ed-workspace`, removed twice while the chrome swapped to the sale corridor) | `saving-the-government-fees-goes-back-cleanly` (jsdom), `the-government-fees-save-leaves-the-screen-alone`; each fails on the old code |

### Walks (each at 1440×900 and 390×844; 0 page errors, 0 contrast failures)

| Walk | What it asserts | 1440 | 390 |
|---|---|---|---|
| Owner onboarding, `FEES=150 FEES_TRY=225.01` | Your Fees after the signature; $225.01 refused in English and Spanish; six screens; Done | pass | pass |
| Cash out the door, signed, PDFs | filed at $150.00 | pass | pass |
| Cash with a balance, opened, then `fees.cjs` (150 → 175, 300) | settings $150.00 of $225.00; history "documentary fee $150.00 to $175.00"; the open sale keeps $150.00, Apply Today's Fees shows $175.00; stale tab refused; $300.00 refused without a filing, a filing missing its location refused, $300.00 of $300.00 with one; posted notice word for word in both languages | pass | pass |
| The same sale finished, signed, PDFs | $175.00 | pass | pass |
| `fee-set` $300 with a filing, buyer-files sale opened, `fee-set` $175 without it, `try-file` | refused: "above what Texas allows without an OCCC filing in force ($225.00, 7 TAC §84.205(b)(1))"; sale page offers today's $175.00; files once applied | pass | pass |
| Void the cash out-the-door bill of sale, file again | voided with the reason and name; the new copy keeps $150.00 (today's fee is $175.00) | pass | pass |
| Bank sale, signed, PDFs | $175.00 | pass | pass |
| Buy here pay here with a trade, opened, `gov.cjs` with `TRY_TITLE=28`, finished, signed, PDFs | $28.00 refused for Harris County; saved; the review shows Inspection Fee $7.50 and Plate Fee $10.00; the sale page names who recorded them | pass (after the fix) | pass (after the fix) |
| Spanish sale, signed, PDFs | both notices beside the fee | pass | pass |
| Flag OFF: onboarding, cash sale, `gov.cjs EXPECT_REFUSAL=1`, finished, signed, PDFs | "Record this sale's government fees from webDEALER first … (Tex. Fin. Code §348.005)"; its link opens the screen; files once recorded | pass | pass |
| Owner's sidebar | Your Fees listed (under More on a phone) | pass | pass |
| Salesperson onboarding, `FEES=none` | no fees step; Your Fees refused; not in the sidebar or More | pass | pass |

### The paper, read back (PyMuPDF; the same at both sizes)

| Document | Pages | Read |
|---|---|---|
| Cash out the door bill of sale, before and after the void | 3 | Documentary Fee $150.00, total $4,000.00, English notice once |
| Cash with a balance bill of sale (flag on) | 4 | $175.00, total $4,001.75 |
| Cash with a balance bill of sale (flag off, government fees recorded) | 4 | a. tax $218.75, b. title $33.00, c. documentary fee $150.00 with the notice directly under it, d. registration $70.75, e. inspection program $7.50, f. license plate $10.00; total $3,990.00 |
| Buyer-files bill of sale | 3 | $175.00, total $11,000.00 |
| Bank bill of sale | 4 | $175.00, total $15,689.25 |
| Buy here pay here bill of sale | 4 | after a $2,000 trade: tax $437.50 on $7,000; e. $7.50, f. $10.00; total $7,733.75; seller lien $6,233.75 |
| Buy here pay here contract | 5 | 1. $9,000.00; a.-e. tax, title, registration, inspection, plate; 2. $9,558.75; 3. Documentary Fee $175.00 with the notice under it; 4. down $3,500.00 ($2,000 trade, $1,500 cash); 5. Amount Financed $6,233.75 (equals the bill of sale's lien); clause 16 kept |
| Spanish bill of sale | 4 | $175.00; English and Spanish notices |
| 130-U, insurance, responsibility forms | 2 each | no fee lines |

`paper/` holds the pages: `bhph-trade-contract-itemization-p2.png`,
`bhph-trade-bill-of-sale-fee-lines-p2.png`,
`flag-off-cash-balance-bill-of-sale-p2.png`,
`spanish-bill-of-sale-notices-p2.png`, `cash-otd-refiled-keeps-150-p2.png`.

### Not done, and why

- A soft ceiling on a very high filed maximum: the rule sets none
  (§84.205(d) caps the fee at the filed amount); the dates are enforced.
- Stamping the notice inside `/complete`: an existing test pins the exact
  data it encodes; `/complete` refuses an unstamped documentary fee instead.
- A check of the fee version at Start A Sale: the database trigger makes it
  moot (a copy can only ever be the schedule as it stands).
- Your Fees in the command palette: the palette is not role-filtered.
- Moving the Government Fees screen into the sale corridor's chrome: not
  needed for the fix, and a layout change; it keeps the workspace chrome.

### Open items

- A tow-away salvage sale charges the state title fee but registers
  nothing; whether its title line should be recorded per sale too is for
  the owner and counsel.
- A sale whose bill of sale was filed before this version has no recorded
  government fees: with the flag off, its remaining documents file only
  after a void, the record, and a new filing (README, "The migration").
- Counsel: the advertised price and the FTC's documentary-fee position;
  the late-handling fee; the contract form; the Spanish notice option.
- The Harris County figures in the walks are the rulebook's worked example,
  not a live webDEALER receipt: confirm the screen against a real one on the
  first sale.

## 000000. Merge: void, lock and reset with the automatic empty weight (10/03/2026)

This section records the merge of `claude/desk-void-and-freeze` (sections
00000 and the first 0000 below) and `claude/desk-empty-weight` (the second
0000 below), which were built in parallel on 10/02/2026. It supersedes them
only where the two met; everything else in each still stands. Port **5193**
only (5190, 5191 and 5192 were not touched; every walk script refuses any
other local port).

**Where the two met, and how they were joined.** Nothing either side does
was dropped: every refusal, guard, test and walk feature of both is kept.

1. **`finalizePaperwork`** (`src/lib/actions/paperwork.ts`). The void
   branch files from answers the server resolves itself
   (`paperworkFilingContext` then `paperworkAnswers`) and adds the
   `billOfSaleAlreadyFiled`, `billOfSaleFirst` and `figuresChanged`
   refusals; the weight branch refuses a 130-U whose box 11 nobody settled
   (or whose sale cannot be read) and writes box 11 with its nine
   `_emptyWeight*` keys from the server's own read. Joined: the filing
   context now carries the empty-weight context, so box 11 and its record
   are among the server-derived answers (a review screen that posted a box
   11 or a record the sale no longer holds is refused as `figuresChanged`);
   the box 11 guard and overwrite run after the refiling gates, so the
   provenance keys it writes blank are never mistaken for answers the sale
   does not hold. A 130-U still refuses without its sale or a settled box 11.
2. **`savePaperworkAnswer`**: the freeze check on the bill of sale's
   answers and the box 11 guard (only the empty-weight screen writes
   `emptyWeight` and `_emptyWeight*`) both stand.
3. **Screens**: `PaperworkScreen` takes both `freeze` and
   `weightPrompt`/`suggestionNote`; `SaleDetailView` keeps the void link,
   the printed licence and price for Close The Sale, and the empty-weight
   line; `ReviewStep` had `Link` imported by both sides, now once.
4. **Migrations**: both branches named theirs `20261002000000_*`, one
   version for two files (the Supabase CLI records a migration by its
   version, so the second could not be recorded). The
   empty-weight one is now `20261002000001_vehicle_empty_weight.sql`
   (unchanged inside; the two are independent). README owner step 2 lists
   all three in order.
5. **Walk scripts**: one `DESK_BASE` reading, in `desk-base.cjs` (default
   `http://localhost:5190`), with its guard against other local ports; the
   ceremony follows a signing link to the same path on `DESK_BASE`
   (`follow()` in `desk-base.cjs`) and saves it to `signing-url.txt`, and
   keeps the Spanish prompt and receipt; `sale.cjs` keeps `RESUME_DEAL`, the refused
   start, the `vin` start through "Not on the lot?" and the `expect` checks;
   `bhph-void.json` taps "Texas Title" after typing box 11, like the
   scenario it follows.
6. **Docs**: SKILL.md and the SOP carry every rule of both once; the SOP
   keeps "Empty weight (130-U box 11)" and "Voiding and filing again" as
   their own subsections and states the joined filing rule in each.

**Tests.** One existing test needed the merged rule: in
`filing-again-goes-through-the-same-gates`, a 130-U now files only with a
settled box 11, so the fixture's deal carries one (typed off a Texas title,
as the empty-weight screen writes it), and the re-filed 130-U is also
checked to carry it. Two new cases there: a 130-U posted with a box 11 or a
box 11 source the sale does not hold is refused as `figuresChanged`, and one
past every refiling gate with no settled box 11 still does not file; and a
130-U whose box 11 is the car's own title figure files when posted the way
the review screen posts it (it fails if the filing context drops the
empty-weight context, or if the box 11 overwrite runs before the gates). The
migration rename moved one path in `the-public-site-never-sees-a-weight`.
Nothing was skipped, weakened or deleted.

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | 0 errors, the same 4 pre-existing warnings |
| `npx vitest run` (default workers, first run after the merge, before the last new case) | **176 files, 2,235 tests passed** (void 155 / 2,010 and weight 161 / 1,960 over a common 140 / 1,736, plus one new case) |
| `npx vitest run` (default workers, three later runs, load average 11 to 13 from other work on the machine) | every test passed but one timeout by time alone per run, each a different fact of `no-hardcoded-dealer-facts` (5,040, 5,152 and 6,458 ms against its 5,000 ms limit; the known loaded case in section 0000 below); alone it passes 28 / 28 |
| `npx vitest run --maxWorkers=2` (final) | **176 files, 2,236 tests passed**; `test-output.txt` |
| `npx next build` | exit 0; `next-env.d.ts` restored with `git checkout` |

### Live (port 5193, preview mock)

`.next` deleted, then

```
setsid env PORT=5193 NEXT_PUBLIC_SITE_URL=http://localhost:5193 \
  DESK_ALLOW_UNSET_FACTS=true DESK_PREVIEW_MEMBER=fresh \
  ADMIN_SESSION_SECRET=<throwaway> INTERNAL_RENDER_TOKEN=<throwaway> \
  CHROME_PATH=<chromium> node_modules/.bin/next dev -p 5193
```

stopped with `kill -- -<PGID>`. Walks with `DESK_BASE=http://localhost:5193`,
all at 1440×900, on one server, in this order:

| Walk | Result |
|---|---|
| `onboard.cjs` as Maria Lopez | name, signature, "You Are All Set", Handle A Sale |
| `estimate-confirm` sale, then ceremony (first, before any walk types a weight for the Camry) | `EXPECT OK form130U/review :: Estimate (EPA test data), confirmed by`; **2 / 2 signed**, Ready To Print |
| `cash-otd` sale (typed 3340, Texas Title), then ceremony | **2 / 2 signed**, Ready To Print |
| `freeze.cjs` on the cash-otd deal | funding and the amount refused with the bill of sale's sentence, registration and insurance with `planFrozen` (the filed 130-U), each EN and ES; held note shown; reload unchanged |
| `bhph-trade` sale (typed 4400, Texas Title), then ceremony | **3 / 3 signed**, Ready To Print |
| `void.cjs` as sales | Void disabled, "Only an owner or a manager can void it." |
| `void.cjs` as owner, `NEW_DOWN=2000`, with the ceremony's link | "Void The Bill Of Sale?", three documents "Signed by the buyer", Keep It focused; summary banner; "Waiting For The New Copies 0 on file · 3 to file again"; the notice with who, when and the quoted reason; Voided Copies (3); old link "This link was replaced." and its buyer route **410**; Down today 2000 saved, no refusal |
| `sale.cjs` with `RESUME_DEAL` and `bhph-void.json`, then ceremony with the new link | bill of sale, 130-U (box 11 not asked again: settled on the deal) and contract filed again; **3 / 3 signed**, Ready To Print; "Replaces the copy voided" on all three |

`follow()` was moved into `desk-base.cjs` after these walks (the ceremony
had done the same rewrite inline); on a second fresh server `onboard.cjs`,
then `cash-otd` and its ceremony with the final scripts: **2 / 2 signed**,
the saved link on port 5193.

Every walk: **0 contrast failures, 0 page errors**. Server log: no
TypeError and no failed write; three `Error: aborted` (`ECONNRESET`) lines
when `freeze.cjs` closed its browser with a request in flight.

**Read back** (`GET /api/documents/agreements/<id>`, and the PDFs through
the packet's own links, PyMuPDF):

| Filing | Box 11 | `_emptyWeightSource` | Reading | Rule | From | By | Keys |
|---|---|---|---|---|---|---|---|
| `estimate-confirm` 130-U | 3500 | `estimate_epa` | 3325 | `plus100RoundUp` | deal | Maria Lopez | 9 |
| `cash-otd` 130-U | 3400 | `texas_title` | 3340 | `roundUp` | deal | Maria Lopez | 9 |
| `bhph-trade` 130-U, voided | 4400 | `texas_title` | 4400 | `roundUp` | deal | Maria Lopez | 9 |
| `bhph-trade` 130-U, filed again (parent: the voided one) | 4400 | `texas_title` | 4400 | `roundUp` | deal | Maria Lopez | 9 |

On the voided deal: the two 130-U PDFs print `11 Empty Weight` 4400, the
voided one stamped VOID on both pages; the three voided PDFs are named
`…_VOIDED_20261002.pdf` and stamped on every page; the voided bill of sale
and contract state the lien and amount financed **$6,045.50** (down
$1,500), the new ones **$5,545.50** (down $2,000), as in the void branch's
own run.

**Not run again here** (each branch ran them at both sizes, and none of
their code paths changed in the merge beyond what the walks above cover):
the 390×844 walks, the Spanish void, `reset.cjs`, and the `title-on-file`,
`no-source`, `cash-balance`, `bank` and `buyer-files` scenarios.

**Seen, not changed:** neither branch holds box 11 once the 130-U is filed.
The void's lock covers what the bill of sale prints, and box 11 is not on
it, so the empty-weight screen can still change the deal's box 11 after the
130-U is filed (the filed copy keeps its own). Whether a filed 130-U should
hold it is the owner's call.

## 00000. Review and verify fixes to the void, the freeze and the reset (10/02/2026)

This section records the latest run and supersedes section 0000 and below
where they differ. Port **5191** only (5190, 5181 and 5183 were not touched;
every walk script refuses any other local port).

**What the reviews and the live verification found, and what changed.** Each
fix has a test; no existing test was edited, skipped or deleted.

1. **Only the void function voids** (review, major). An owner or manager could
   void a row with a direct `UPDATE` through the API (any name as who voided,
   the power of attorney, one document without the rest, no audit event, the
   links left alive), and a sales user could `INSERT` a row already "voided"
   in 2099, which no one could delete and which killed every signing link of
   the deal. **Fixed in the migration:** a row is never inserted with a void
   column; a signed-in session (`authenticated` or `anon`) writing `voided_at`
   is refused, even an owner's; only the security-definer
   `void_filed_documents` voids; the power of attorney is never voided, even
   inside the database. Test: `only-the-void-function-voids-and-a-reset-reaches-the-database`
   (PGlite, both migrations). The review's own probe now answers
   `voided_on_insert` and `not_voidable`.
2. **The function took its cascade and its names from the caller** (review,
   major). **Fixed:** `p_types` must be exactly the fixed set (every corridor
   document but the power of attorney), the "Not Yet" attestation is required
   in the database (`title_question`), and the audit's `memberId` and
   `memberName` are always the session's own team row. Same test file.
3. **A filing printed its answers from what the browser posted** (review,
   major): the mileage statement, trade-in, payment method, warranty, how a
   salvage car leaves, and the contract's rate, count and payments.
   **Fixed:** `finalizePaperwork` resolves the answers the way the review
   screen does (`paperworkAnswers` through `paperworkFilingContext`), refuses
   a posted answer that differs or one the sale does not hold
   (`figuresChanged`), and fills a left-out one from the sale. Test:
   `the-paper-holds-the-filing-the-close-and-the-next-sale`.
4. **A contract or 130-U filed at the moment of a void stayed current with the
   voided figures** (review, minor). **Fixed:** a `BEFORE INSERT` trigger
   refuses filing a financing contract, 130-U, vehicle responsibility or
   tow-away sheet while no bill of sale is current, locking the deal row
   `FOR SHARE` so it waits for the void's `FOR UPDATE`; the filing also
   compares its figures with the ones the current bill of sale PRINTED (read
   off its completed link); and the re-file count holds a dependent filed
   while no bill of sale was current. Tests: the two files above.
5. **An old signing link minted just before the void committed could
   survive it** (review, minor). **Fixed:** the void is dated the later of
   the app's time and the database's clock at the moment of voiding, and a
   link minted after a void is dated just after it (`signingIssueTime`), so
   it is never born revoked. Test: `a-void-says-why-and-the-new-link-is-born-alive`.
6. **The audit's "was it signed" was read before the rows were locked**
   (review, minor). **Fixed:** every row the void takes is locked `FOR
   UPDATE` before the audit list is read.
7. **The void reason** was counted in UTF-16 units while the database counts
   characters, and ten zero-width spaces or a bidi override passed as a
   reason (both reviews, minor). **Fixed:** counted in code points; control
   characters become spaces and invisible format characters are dropped, in
   the dialog, the action and the database alike. Tests: the two files above.
8. **The device cookie vouched for any account** (both reviews, major): a
   fresh cookie from one's own sign-in could carry another member's pre-reset
   session past the cutoff. **Fixed:** the cookie is
   `<issuedAtMs>.<userId>.<sig>`, minted with the account at every sign-in
   path, and a cookie bound to another account counts as no cookie. Test:
   `a-reset-account-signs-in-again-and-a-cookie-vouches-for-one-account`.
9. **After any reset, Google and Apple sign-in never worked again** (auth
   review, major): the callback judged the new session by the old cookie and
   signed it out as "not on the team". **Fixed:** every sign-in path mints
   the cookie first and hands it to the team check. Same test file.
10. **A reset did not end the stale session at the database** (auth review,
    major). **Fixed:** every stamping path calls the service-only
    `end_sessions_before` (best effort; it deletes the account's older auth
    sessions, so their refresh tokens die), and `private.current_team_role()`
    gives no role to a session whose earliest amr time predates the reset, so
    RLS and the void function refuse a stale device that goes around the
    desk. A reset time nobody can read signs nobody out and is logged as an
    error. Tests: the PGlite file and the cookie file.
11. **The older agreements route** could rewrite, trash or duplicate a sale's
    filed bill of sale (auth review, minor, pre-existing). **Fixed:** 409 for
    a filed or voided sale document; a second filed bill of sale is refused.
    Test: `a-filed-document-keeps-its-name-and-its-place`,
`the-packet-dates-are-the-business-date`.
12. **Close The Sale took another price on a filed deal** (verify): the cash
    out-the-door deal closed at $12,345. **Fixed:** on a deal whose amount was
    typed, the car is marked sold at the price the bill of sale printed; the
    panel starts from it. Test plus the live walk below.
13. **Contrast failure on Close The Sale's refusal** (verify; 2.10:1).
    **Fixed:** it uses the danger token (#B00020). Live: 0 failures.
14. **Start A Sale renamed a filed sale's buyer** (verify): a new sale on the
    same phone number rewrote the customer row another open sale's filed
    paperwork names. **Fixed:** while such paperwork is filed the row is not
    rewritten; the same buyer still starts a second sale, and a different
    name on that phone number is refused with the other buyer's name and the
    way out. Test plus the live walk below.
15. **A Spanish buyer's file name** downloaded as "130-U_HernÃ¡ndez" or lost
    its letters ("Luca_Hernndez"). **Fixed:** RFC 6266 `filename*` with a
    plain accent-folded `filename`. Live: `130-U_Hernandez_…pdf`,
    `Discount_BillOfSale_Lucia_Hernandez_…pdf`, header
    `filename*=UTF-8''130-U_Hern%C3%A1ndez_…`.
16. **Walk scripts:** `ceremony.cjs` now reads the Spanish "read to the end"
    prompt and the Spanish receipt and waits longer for the 130-U;
    `void.cjs` and `freeze.cjs` ignore Next's route announcer; `void.cjs`
    takes `VOID_LANG=es`; `sale.cjs` reports a refused start
    (`START REFUSED`) instead of timing out. Throwaway token files
    (`sign-actions.json`, `ctx1-*.json`, `signing-url.txt`) were removed from
    the evidence, and the unvoided 130-U PDFs (2.3 MB each) were dropped.

17. **The packet's dates were the viewer's day, not the business day**
    (found in this run): a void at 7:30 pm Central read "Voided Oct 3, 2026"
    on the packet while the voided PDF's band said 10/02/2026. **Fixed:** the
    void notice, Voided Copies, and the packet's Signed, Filed and "Replaces
    the copy voided" dates are formatted on the dealership's clock
    (`dealership.timeZone`). Test: `the-packet-dates-are-the-business-date`;
    live: "Voided Oct 2, 2026" and "Reemplaza la copia anulada el 2 oct 2026"
    after 00:00 UTC.

Not changed, and why: a margin on the signing-link cutoff (finding 5) was not
added; dating the void by the database's clock closes the case found, and a
skew between two app servers is the only window left. A signing link a stale
session minted before a reset lives out its 20 minutes (one deal's
documents, not admin access). The legacy two-part device cookie is still read
(every one predates any reset this round records).

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | 0 errors, the same 4 pre-existing warnings |
| `npx vitest run --maxWorkers=1` | **155 files, 2,010 tests passed** (was 149 / 1,956); `test-output.txt` |
| `npx next build` | exit 0; `next-env.d.ts` restored with `git checkout` |

Under a parallel run on this shared machine one PDF-stamping case of
`a-voided-copy-prints-marked-void` timed out once at 5 s under load; it runs
in 254 ms alone and passes in the one-worker run.

New tests this round: `only-the-void-function-voids-and-a-reset-reaches-the-database`,
`the-paper-holds-the-filing-the-close-and-the-next-sale`,
`a-void-says-why-and-the-new-link-is-born-alive`,
`a-reset-account-signs-in-again-and-a-cookie-vouches-for-one-account`,
`a-filed-document-keeps-its-name-and-its-place`.

### Live (port 5191, preview mock)

Server as in section 0000 (`.next` deleted; `PORT=5191`,
`NEXT_PUBLIC_SITE_URL=http://localhost:5191`, `DESK_ALLOW_UNSET_FACTS=true`,
throwaway secrets; `setsid`, stopped with `kill -- -<PGID>`).

S1 (`DESK_PREVIEW_MEMBER=fresh`, onboarded as Maria Lopez):

| Walk | Result |
|---|---|
| regressions, sale + ceremony, 1440×900 | cash-otd 2/2, cash-balance 2/2, bank 2/2, buyer-files 3/3 |
| regressions, sale + ceremony, 390×844 | cash-otd 2/2, cash-balance 2/2, bank 2/2, buyer-files 3/3, bhph-trade 3/3 |
| Start A Sale, Lucía Hernández on Andrea Salinas's phone (Andrea's bhph sale filed), both sizes | refused: "This phone number belongs to Andrea Salinas, the buyer on another open sale whose paperwork is filed. Start this sale with the buyer's own phone number, or close or void that sale's paperwork first." |
| `freeze.cjs` on the cash-otd deals, both sizes | funding and the amount refused with the bill of sale's sentence, registration and insurance with `planFrozen` (the filed 130-U), each EN and ES; held note shown; reload unchanged |
| Close The Sale on the cash-otd deals, both sizes | the panel starts at $3,663.06 (the printed price of the $4,000 out-the-door deal); $12,345 refused with "The bill of sale is already filed with the price it states…"; $3,663.06 closes ("Filed against Maria Delgado. Past Sales"); 0 contrast failures |

S1 also ran the Spanish void round trip; its sale and ceremony output
filtered page errors out, so S3 below ran every sale, ceremony and void walk
again with them kept.

S2 (`DESK_PREVIEW_MEMBER=fresh-reset`, a fresh server per size), `reset.cjs`
at 1440×900 and 390×844: the preview cookie alone, and a signed-in time a
day old, land on `/admin/login?notice=signed-out-reset` with the EN · ES
notice; the stale device's API call answers **401** "Signed out: the password
was reset. Sign in again."; a fresh sign-in reaches Choose A Password, saves
it and goes on to "What Is Your Name?".

S3 (`DESK_PREVIEW_MEMBER=fresh`, onboarded again; page errors kept in every
walk's output):

| Walk | 1440×900, English (Andrea Salinas) | 390×844, desk in Spanish (Lucía Hernández) |
|---|---|---|
| bhph-trade sale, then ceremony | 3 / 3 signed | 3 / 3 signed, the ceremony in Spanish to "Todo firmado." |
| `void.cjs` as sales | Void disabled, "Only an owner or a manager can void it." | "Solo el dueño o un gerente puede anularla." |
| `void.cjs` as owner | "Void The Bill Of Sale?", three documents "Signed by the buyer", Keep It focused; after the hold: the summary banner, "Waiting For The New Copies 0 on file · 3 to file again", the notice with who, when and the quoted reason, Voided Copies (3) | `VOID_LANG=es`: "¿Anular La Factura De Venta?", "Firmado por el comprador" ×3, "Conservarla" focused; after Mantén Para Anular: "Se anuló la factura de venta…", "Esperando Las Copias Nuevas 0 en el expediente · 3 por archivar de nuevo", "Anulada el 2 oct 2026 por Maria Lopez…", Copias Anuladas (3) |
| the old signing link | "This link was replaced. · Este enlace fue reemplazado." page; buyer route **410** | same |
| Down today 1500 → 2000 | saved, no refusal | saved, no refusal |
| file again (`RESUME_DEAL`, `bhph-void.json`), new link | bill of sale, 130-U, contract filed again; 3 / 3 signed, Ready To Print, each "Replaces the copy voided Oct 2, 2026." | 3 / 3, "Listos Para Imprimir 3 / 3 firmados", "Reemplaza la copia anulada el 2 oct 2026." |
| regressions, sale + ceremony | cash-otd 2/2, cash-balance 2/2, bank 2/2, buyer-files 3/3 | cash-otd 2/2, cash-balance 2/2, bank 2/2, buyer-files 3/3, bhph-trade 3/3 |

Page errors across S3: **0** (no `PAGEERR` line in any walk).

**PDF read-back** (PyMuPDF): on both void deals the three voided PDFs are
named `…_VOIDED_20261002.pdf` and carry VOID on every page with the band
("Voided 10/02/2026 by Maria Lopez: …" in English, "Anulado el 10/02/2026 por
Maria Lopez: …" with ANULADO on the Spanish deal). Voided bill of sale lien
**$6,045.50** = voided contract amount financed **$6,045.50** (down $1,500);
new bill of sale lien **$5,545.50** = new contract amount financed
**$5,545.50** (down $2,000), on both deals.

Every walk: 0 page errors, 0 contrast failures.

Evidence: `review-fixes/` (`0-onboard/`, `void-en-1440x900/`,
`void-es-390x844/` with `8-pdfs/`, `regressions/`, `held-buyer-*/`,
`freeze-*/`, `close-*/`, `reset-*/`).

### Still open

- **Live Supabase is unverified** (source only; check on staging before
  go-live): an admin password update ends every session, `getUser()` rejects
  a deleted session, amr timestamps survive a refresh, the migration applies
  over the real schema (PGlite in the tests), the `postgres` role may delete
  from `auth.sessions` (`end_sessions_before`), and the per-request cost of
  the amr check inside `current_team_role()` is acceptable.
- Two bills of sale filed at the very same instant are not stopped by the
  database (a partial unique index of one current bill of sale per deal is a
  hardening follow-up; the desk's own gate and the re-file count catch it
  afterwards).
- The owner resetting a member from the team screen cannot run in preview
  (the preview member is the owner); the stamping paths are covered by unit
  tests, and the live reset walks use the `fresh-reset` preview member.
- Pre-existing, not fixed: the bill of sale's "Which State Issued Their
  Licence?" answer never prints; a trade-in allowance typed "2,000" reads as
  no allowance; `signPacketDocument` does not refuse re-signing a signed
  row; `setVehicleTitleStatus` and an inventory price edit can change a
  vehicle mid-sale; `logoutAdmin` signs out every device; a PDF's file name
  carries the UTC day it was downloaded (`…_20261003.pdf` for a copy filed
  on the evening of 10/02/2026), not the business date its `_VOIDED_` part
  uses.
- The new Spanish strings need a native speaker's or counsel's review.

## 0000. Void and file again, the wider freeze, reset sign-out (10/02/2026)

This section records the latest run and supersedes the sections below where
they differ. It was run on port **5191** (the worktree's server); 5190, 5181
and 5183 were not touched, and every walk script now refuses any local port
other than `DESK_BASE`.

**What the owner decided, and what the desk now does.**

1. **Void and file again.** An Owner or a Manager voids the filed bill of
   sale from the packet with a typed reason (10 to 500 characters), a "Not
   Yet" answer to "Has The Title Application Gone To The County?" and Hold
   To Void. Every current filed copy of the bill of sale and of every
   document its figures, plan or buyer reached is voided with it (never the
   power of attorney), with who, when and why; nothing is deleted. The
   voided copies stay under Voided Copies and print stamped VOID; their
   signatures stop counting; the old signing link is refused; the packet
   waits for the new copies, the corridor files them again (one current
   bill of sale, the bill of sale first, the server's own figures), and
   Complete Sale waits too. Refused for a closed sale, a plate recorded
   after filing (the title application went to the county), a "Yes", or a
   person with no team row. New migration
   `supabase/migrations/20261002000000_void_filed_documents.sql` (additive;
   the owner applies it).
2. **The bill of sale holds everything it states.** Price, what it
   includes, funding, lender, trade-in, payment method, mileage statement,
   warranty, how a salvage car leaves, the buyer's name, ID and address, the
   plan's Still To Do, the printed plate, the language, and Close The Sale's
   price and ID: every server action that can write one refuses a change
   with `billOfSaleFrozen` and the field, in English and Spanish, failing
   closed. A plan answer held by another filed document now says so with
   `planFrozen` in both languages and points at the same void.
3. **A reset signs out every device.** Every owner reset or approval stamps
   `app_metadata.password_reset_at`; the proxy, the current-admin check, the
   API guard, the layout, the template and Choose A Password refuse a
   session that signed in before it (the desk's device cookie is the
   guarantee; the earliest amr can only add a refusal), with a one-line
   notice on the sign-in page in both languages.

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` | 0 errors, the same 4 pre-existing warnings |
| `npx vitest run` | **149 files, 1,956 tests passed** (was 140 / 1,736); `test-output.txt` |
| `npx next build` | exit 0; `next-env.d.ts` restored with `git checkout`, no diff |

`test-output.txt` is a run with `--maxWorkers=1`. On this shared 4-core
machine (load average 12 to 15 from other jobs) a default parallel run has
timed out 1 to 7 cases of `no-hardcoded-dealer-facts` at vitest's 5 s
default (each re-parses every source file); the same file passes alone
(28/28) and the whole suite passes in one worker. Nothing in it fails.

New tests (no existing test edited, skipped or deleted):
`a-voided-document-stays-on-record-and-stops-counting`,
`voiding-the-bill-of-sale-takes-what-it-fed`,
`the-void-is-final-in-the-database` (the migration run on PGlite: the
trigger, the function's refusals, the audit event),
`filing-again-goes-through-the-same-gates`,
`an-old-signing-link-dies-with-the-void`, `a-voided-copy-prints-marked-void`,
`the-bill-of-sale-holds-everything-it-states` (92: the statement, the
renderer key guard, both catalogues, every writer refusing, saving the same
answer, moving before filing and after a void, failing closed, the power of
attorney, `planFrozen`), `a-password-reset-signs-out-every-device` (21) and
`a-password-reset-is-recorded-on-the-account` (9).

### Live (port 5191, preview mock)

Server: `.next` deleted, then

```
setsid env PORT=5191 NEXT_PUBLIC_SITE_URL=http://localhost:5191 \
  DESK_ALLOW_UNSET_FACTS=true DESK_PREVIEW_MEMBER=<fresh|fresh-reset> \
  ADMIN_SESSION_SECRET=<throwaway> INTERNAL_RENDER_TOKEN=<throwaway> \
  CHROME_PATH=<chromium> node_modules/.bin/next dev -p 5191
```

stopped with `kill -- -<PGID>`. Walks with `DESK_BASE=http://localhost:5191`.

- **S1** (`DESK_PREVIEW_MEMBER=fresh`; the void needs the voider's roster
  row, so the member onboarded first as Maria Lopez with `onboard.cjs`).
  Two servers: the first ran the onboarding at 1440×900, the void round
  trip at both sizes and the 1440×900 freeze and regressions; the second
  (a fresh store) the onboarding at 390×844, then the 390×844 freeze and
  regressions:

| Walk | 1440×900 | 390×844 |
|---|---|---|
| bhph-trade sale, then ceremony | 3 / 3 signed | 3 / 3 signed |
| `void.cjs` as sales | Void disabled, "Only an owner or a manager can void it." | same |
| `void.cjs` as owner | dialog read-back (3 documents, signed), Keep It focused; after the hold: summary banner, "Waiting For The New Copies · 3 to file again", the notice (who, when, the quoted reason), Voided Copies (3) | same |
| the old signing link | "This link was replaced. · Este enlace fue reemplazado." page; its buyer document route **410** | same |
| Down today 1500 → 2000 after the void | saved, back to the summary, no refusal | same |
| `sale.cjs` with `RESUME_DEAL` and `bhph-void.json` | bill of sale, 130-U, contract filed again | same |
| ceremony with the new link | 3 / 3 signed, Ready To Print | same |
| cash-otd sale, then `freeze.cjs` | the funding and the amount refused with the bill of sale's sentence, registration and insurance with `planFrozen` (the filed 130-U holds them), each in EN and ES; held note shown; reload unchanged | same (and the sale's ceremony 2 / 2) |
| cash-balance, bank, buyer-files (sale + ceremony) | 2/2, 2/2, 3/3 signed | 2/2, 2/2, 3/3 signed |

- **S2** (`DESK_PREVIEW_MEMBER=fresh-reset`, a fresh server per size):
  `reset.cjs` at 1440×900 and 390×844. The preview cookie alone, and a
  signed-in time a day old, both land on
  `/admin/login?notice=signed-out-reset` with "Your password was reset, so
  this device was signed out. Sign in again. · Se restableció su contraseña,
  así que este dispositivo cerró la sesión. Vuelva a iniciar sesión."; an
  API call from the stale device answers **401** "Signed out: the password
  was reset. Sign in again."; a fresh sign-in on the form reaches Choose A
  Password, saves it and goes on to the name.

Every walk: **0 page errors, 0 contrast failures**.

**PDF read-back** (PyMuPDF, `pdfs.cjs` on the voided deal, 1440×900 and
390×844): six files each, the three voided ones named `…_VOIDED_20261002.pdf`
and carrying "VOID" and the band "Voided 10/02/2026 by Maria Lopez: The down
payment was 2000, not 1500, so the figures change" on every page. The voided
bill of sale's seller lien is **$6,045.50**, equal to the voided contract's
amount financed ($6,045.50, down $3,500 = $1,500 + the $2,000 trade); the
new bill of sale's lien is **$5,545.50**, equal to the new contract's amount
financed ($5,545.50, down $4,000 = $2,000 + the trade).

Evidence: `void-and-refile/` (`1440x900/` and `390x844/`: the disabled
control, the dialog open and ready, the summary banner, Voided Copies, the
replaced link, the re-filed packet; `freeze-1440x900/` and
`freeze-390x844/`; `reset-1440x900/`
and `reset-390x844/`; `pdfs/` holds the stamped voided bill of sale).

### Still open

- **Live Supabase behaviour is unverified** (checked against the source
  only; check on a staging project before go-live): that an admin password
  update ends every session including the current one (Choose A Password
  then signs the member straight back in), that `getUser()` rejects a
  deleted session, that amr timestamps survive a refresh, and that the
  migration applies cleanly over the real schema (it runs on PGlite in the
  tests).
- A device that never contacts the desk again keeps its refresh token
  against the database until it does; supabase-js has no sign-out by user
  id. An RLS amr check is a follow-up.
- A reset still does not change an existing account's password (earlier
  decision); README keeps "set the member inactive" for a known password.
- Race windows are narrowed, not closed (a filing at the same instant as a
  void is caught by the re-file count and Complete Sale); a partial unique
  index of one current bill of sale per deal is a hardening follow-up.
- Pre-existing, found and not fixed: the bill of sale's "Which State Issued
  Their Licence?" answer is never printed (the profile state or TX prints);
  a trade-in allowance typed as "2,000" reads as no allowance (the money
  reader takes plain figures; the freeze measures what prints, so it calls
  that a change); `signPacketDocument` does not refuse re-signing a signed
  row; `startSale` for a returning buyer rewrites the customer row other
  open deals read; `setVehicleTitleStatus` and an inventory price edit can
  change a vehicle mid-sale; `logoutAdmin` signs out every device (global
  scope).
- The new Spanish strings (freeze, void, ceremony, reset, `planFrozen`) need
  a native speaker's or counsel's review.

## 0000. The 130-U empty weight, automatic and sourced (10/02/2026)

This section records the empty-weight change and supersedes the sections
below where they differ. How the weight is found and what staff see is in
the README ("The 130-U empty weight (box 11)"); the standard every desk ships
with is in the SOP ("Empty weight (130-U box 11)").

The runs used the desk's own dev server on port 5192, started fresh for each
screen size, on the in-memory preview mock (no Supabase) with
`DESK_ALLOW_UNSET_FACTS=true` and throwaway `ADMIN_SESSION_SECRET` and
`INTERNAL_RENDER_TOKEN` values passed on the command line. This sandbox has
no Chrome, so the bill of sale's HTML-to-PDF route answers 500 "Chrome not
found"; that route is not part of this change. The 130-U PDF is filled on the
server and was read back field by field.

**What the desk does now.**

- A document figure on the car (Texas title, out-of-state title, MCO, weight
  certificate, KBB or JD Power) skips the 130-U question and is affixed with
  its source.
- Otherwise a sourced estimate is offered for one tap: EPA test weight less
  300 lb from a bundled table, cross-checked against Transport Canada and the
  VIN decode, rounded per TxDMV, with the sentence that says which EPA models
  it stands on.
- Pickups, work vans, cab-chassis, heavy duty, buses, a vehicle whose kind
  nobody recorded, a low-confidence estimate no second source supports, and
  anything within 300 lb of 6,000 lb need a document; the estimate is shown
  as a hint only.
- Nothing known: the question is asked exactly as before.
- A 130-U with box 11 unsettled does not file. Filing rewrites box 11 and
  its `_emptyWeight*` record in `form_data` from the server's own read.

**What the review found, and what changed.**

1. **A pickup with no body style and no decode got the one-tap Confirm and
   the passenger +100** (2018 F-150, Gladiator, Frontier, Ranger, Maverick,
   Santa Cruz). **Fixed:** an unknown class needs a document
   (`classUnknown`); a pickup or work van is also known by name
   (`workVehicleByName`, whole words, so a Range Rover is never a Ranger and
   a Mercedes E 350 is never a Ford E-350) and by an EPA match named PICKUP,
   CAB or CHASSIS; a pickup by name is a truck for the rounding, so its MCO
   gets no +100; a lot body style of "Van" or "Cargo Van" is a work van.
   Test: `an-unknown-vehicle-is-never-a-car`.
2. **One vPIC timeout fixed a car's class for the life of the table** (the
   lot-row estimate was stored and reused). **Fixed:** only an estimate made
   from a decode (or for a car with no VIN) is stored; a lot-row stand-in is
   held in memory for 5 minutes and the decode is tried again; a stored
   lot-row estimate is decoded over. Test:
   `a-weight-estimate-follows-the-car`.
3. **A stored estimate outlived a corrected vehicle row.** **Fixed:** the
   estimate carries the row's fingerprint (VIN, year, make, model, trim, body
   style, engine, drive, fuel) and is worked out again when it no longer
   matches, written over only where the old one still stands. Test:
   `a-weight-estimate-follows-the-car`.
4. **Short names matched longer, different vehicles at medium confidence**
   (ProMaster as PROMASTER CITY, Bronco with BRONCO SPORT, Range Rover with
   EVOQUE, Transit with TRANSIT CONNECT). **Fixed:** the query's own model
   wins over names that add a different-vehicle word; a match on such names
   only is `+partial`; `+partial`, a range wider than 600 lb, or a lot row
   with no engine size is low confidence, and low confidence no second source
   supports within 250 lb needs a document. **Added this run:** the
   reviewer's 2018 Civic whose decode Series is "Type R" still blended in the
   plain Civic's rows (2,700 lb). A query that names the variant now keeps
   only the rows that carry it (`+variant`): 3,075 lb, against a published
   curb weight of about 3,117. Measured on all 1,706 crash-test vehicles
   before adopting it: no vehicle changed (coverage 1,534, 89.9%; median
   error 67 lb; p95 346 lb), and the regenerated fixture is byte-identical.
   Adding POLICE to the different-vehicle words was tried and left out: it
   moved Crown Victoria and Explorer away from their lab weights. Test:
   `the-estimate-names-what-epa-tested` (the new case fails without the
   rule).
5. **The method sentence named the car being sold as what EPA tested.**
   **Fixed:** it names the EPA models it stands on ("EPA tested the Camry,
   Camry LE/SE and Camry XLE/XSE (2019) at 3,625 lb"), and the confirmed
   record keeps them. Test: `the-estimate-names-what-epa-tested`.
6. **webDEALER's Copy All pasted a weight nobody recorded the source of.**
   **Fixed:** that figure is shown with "Source not recorded; confirm it on
   the 130-U", has no copy button (a link to the 130-U instead), reads "(not
   confirmed; settle it on the 130-U)" in Copy All, and counts as missing.
   The pinned `webdealer-copy-fields` test (3265 shown) is unchanged. Test:
   `an-unsourced-weight-is-never-pasted`.
7. **With the sale unreadable, the filing skipped the weight gate.**
   **Fixed:** a 130-U whose sale the server cannot read does not file. Test:
   `a-130u-without-its-sale-does-not-file`.
8. **The table build took its dates from file times.** **Fixed:** it reads a
   manifest (URL, sha256, download date) written by `--download`, stops on a
   file the manifest does not name or whose bytes changed, and never reads a
   file time. Test: `the-epa-table-rebuilds-the-same`.
9. **A VIN that decodes to another make of the same year drove the
   estimate.** **Fixed:** the decode is used only when it agrees with the lot
   row on year and make (FORD and Ford, RAM and Dodge are one make). Test:
   `a-weight-estimate-follows-the-car`.

The verification's own notes, settled:

- *A decoder curb weight does not skip the question.* By design: it is an
  estimate, and an estimate needs a person's confirmation before it is
  filed. Only a document figure skips the question.
- *The "Not on any record" state was never seen live.* It is now: the new
  `no-source` walk starts a sale for a 1991 Geo Storm through "Not on the
  lot? Enter a VIN". EPA's table starts at MY1995, Transport Canada returns
  nothing for it, and vPIC has no curb weight before 2015. The question
  reads "Not on any record. Read it off the title; without one, a weight
  certificate is needed.", the input starts empty, and the typed title
  figure (2,340) files as 2,400 with its source.
- *The Camry range reads 3,137 to 3,388 lb around 3,325.* Correct as shown:
  EPA tested the 2019 Camry 2.5 twice at ETW 3,500 (the L) and six times at
  3,625. The median gives 3,325, and the range runs from the lighter class's
  floor to the heavier class's ceiling. Box 11 is 3,500 either way.
- *`form_data` was not dumped.* It is now, below, from
  `GET /api/documents/agreements/<id>` on the running preview.
- *The override script logged "REFUSAL NONE".* The script read only the
  first alert node (Next's route announcer). It now reads every alert; the
  screenshots show the refusal at both sizes.

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` | 0 errors, the same 4 warnings, all in files this change does not touch |
| `npx vitest run` | 161 files, 1960 tests passed (was 140 and 1736); 21 new files, no existing test file changed; `test-output.txt` |
| `npx next build` | exit 0; `next-env.d.ts` restored afterwards |
| EPA table in the client bundle | 0 files in `.next/static` carry it; 4 server chunks do |
| Crash-test accuracy (Python reference, all 1,706 vehicles) | coverage 1,534 (89.9%), median error 67 lb, p95 346 lb |
| TypeScript port against the reference | equal on every fixture row (parity test); fixture regenerated byte-identical after the `+variant` rule |

The first full test run after a machine restart failed one check by time
alone: `no-hardcoded-dealer-facts` "does not hardcode the phone number" took
5,027 ms against its 5,000 ms limit while every file was compiled cold
(imports 55 s against 30 s warm). Two warm runs passed 161 of 161 at the
default worker count, and the check passes alone in about 1.9 s. The guard
re-parses every script once per fact; the new empty-weight files add about
65 ms (about 6%) to each 1.1 s pass, most of which is existing code. The
test was not changed.

### Walks, at 390×844 and 1440×900

Eight scenarios at each size, each on a fresh server, each signed through
the ceremony to its packet:

| Scenario | 390×844 | 1440×900 |
|---|---|---|
| `estimate-confirm` (2019 Camry, one-tap EPA estimate; review shows "Estimate (EPA test data), confirmed by") | 2 / 2 signed | 2 / 2 signed |
| `title-on-file` (2020 Altima, Texas title on the car; no weight screen; review shows "Texas title") | 2 / 2 signed | 2 / 2 signed |
| `no-source` (1991 Geo Storm by VIN; question reads "Not on any record"; typed title figure) | 2 / 2 signed | 2 / 2 signed |
| unfiled Camry (stopped at the weight question; refused at filing; settled; filed) | 2 / 2 signed | 2 / 2 signed |
| `cash-otd` | 2 / 2 signed | 2 / 2 signed |
| `bank` | 2 / 2 signed | 2 / 2 signed |
| `bhph-trade` | 3 / 3 signed | 3 / 3 signed |
| `buyer-files` (no 130-U) | 3 / 3 signed | 3 / 3 signed |
| `cash-balance` | 2 / 2 signed | 2 / 2 signed |

Every `expect` check passed, 0 contrast failures in the sales and the
ceremonies, 0 page errors in the walks and the direct scripts. Server logs:
no TypeError, no unhandled error, no failed weight write; the only errors
are the bill of sale's "Chrome not found" (8 per run).

### Box 11 on paper and on the record

Read back from each filing's `form_data` (`GET /api/documents/agreements/<id>`),
identical at both sizes, and, for the first four, from the filed 130-U PDFs
(field `11 Empty Weight`, PyMuPDF):

| Sale | PDF box 11 | `_emptyWeightSource` | Reading | Rule | From | By |
|---|---|---|---|---|---|---|
| `estimate-confirm` (Camry) | 3500 | `estimate_epa` | 3325 | `plus100RoundUp` | deal | owner@example.dev |
| `title-on-file` (Altima) | 3300 | `texas_title` | 3252 | `roundUp` | vehicle | Preview Fixture |
| `no-source` (Geo Storm) | 2400 | `texas_title` | 2340 | `roundUp` | deal | owner@example.dev |
| unfiled, then settled (Camry) | 3500 | `estimate_epa` | 3325 | `plus100RoundUp` | deal | owner@example.dev |
| `cash-otd` (Camry) and `bank` (CR-V), typed | 3400 | `texas_title` | 3340 | `roundUp` | deal | owner@example.dev |
| `bhph-trade` (Explorer), typed | 4400 | `texas_title` | 4400 | `roundUp` | deal | owner@example.dev |
| `cash-balance` (Malibu), typed | 3100 | `texas_title` | 3100 | `roundUp` | deal | owner@example.dev |

Each confirmed estimate also keeps `_emptyWeightEstimate`: EPA 2019, ETW
3,625, the models CAMRY, CAMRY LE/SE and CAMRY XLE/XSE, the EPA file
(`19tstcar-2020-10-02.xlsx`), Transport Canada 3,472 lb, the VIN decode
3,572 lb, confidence high, table built 10/02/2026. Every filing carries
`_emptyWeightAt`. The state form prints only the number. The rasterised box
is in `empty-weight/pdf-box11-*.png`.

### What the screens showed (both sizes)

Screenshots in `docs/verification/empty-weight/` (each at 390 and 1440),
with the full log in `walk-summary.txt`:

- **Estimate** (`b1-estimate-card`): "Estimate 3,500 lb", the method
  sentence naming the EPA models, "Transport Canada lists 3,472 lb. The VIN
  decode lists 3,572 lb.", one Confirm This Weight.
- **Unsettled** (`b2`, `b3`): the review reads "Empty Weight: Not settled
  yet · Settle It", and File The Form 130-U is refused with "Settle the
  empty weight (box 11) first: confirm it, or type it from the title." After
  one tap (`b4`) the review reads "3,500 lb · Estimate (EPA test data),
  confirmed by owner@example.dev on 10/02/2026" and it files (`b5`).
- **Nothing known** (`d-no-source-vin`, `d-no-source-question`,
  `d-no-source-review`): the decoded card shows no weight line; the question
  reads "Not on any record. Read it off the title; without one, a weight
  certificate is needed." with an empty input; the review reads "2,400 lb ·
  Texas title, entered by owner@example.dev on 10/02/2026".
- **Pickup** (`01` to `04`): "This one needs the weight from a document ...
  A pickup or work truck is never filed on an estimate. For reference only:
  estimated at about 4,950 lb." with no Confirm; 5012 from a Texas title
  reads "Box 11 will read 5,100 lb"; carrying capacity starts at 1000,
  labelled "TxDMV minimum for this empty weight (Registration Manual Table
  2-1)".
- **Weight with no recorded source** (`05`, `06`, `bmw-handoff-row`): "On
  the vehicle record: 3,765 lb. Where it came from was not recorded.", the
  input starts empty; the webDEALER row shows 3765 with "Source not
  recorded; confirm it on the 130-U", no copy button and a link to the
  130-U; the sale page reads "About 3,950 lb · Estimate, not confirmed (EPA
  test data)".
- **Override with a reason** (`10` to `14`): the Altima review shows "3,300
  lb · Texas title, entered by Preview Fixture on 10/01/2026"; Change
  reopens with "On file: 3,300 lb (Texas title)."; 3400 with no reason is
  refused ("Say why it is different from the document on file."); with "Title
  reissued after a bed liner was fitted" it saves, and the review, sale page
  and handoff all show 3,400 with its source and reason.
- **Handoff and sale page** (`*-handoff-row`, `*-sale-page`): the same
  figure and source line as the review and the PDF for every sale above.

### Open items

1. **Apply the migration before deploying** this version:
   `supabase/migrations/20261002000001_vehicle_empty_weight.sql` (README
   owner step 14). The sale pages read the new columns.
2. **Two questions for the county**, recorded in the SOP: whether +100
   applies to a passenger-truck vehicle registered Passenger from a web curb
   weight, and how RTB 010-16's +100 sits with the 2026 guideline. The
   confirm step keeps a person in the loop meanwhile.
3. **Walk and demo data:** a typed weight must name its document, so the
   five standard scenarios tap "Texas Title" after typing it, and any
   recorded demo that files a 130-U needs the same tap. A title figure typed
   on one sale is written to the car, so walk `estimate-confirm` first on a
   fresh preview server (SOP, Verification).
4. **The bill of sale PDF** could not be rendered here (no Chrome); the
   130-U PDFs were.
5. **Merge:** the void/freeze work also edits `finalizePaperwork` in
   `src/lib/actions/paperwork.ts`; this change adds 14 lines there, plus a
   5-line guard in `savePaperworkAnswer` and one import.

## 000. Review fixes to the four decisions (10/02/2026)

This section records the latest run and supersedes sections 00 and below
where they differ.

**What the review found, and what changed.**

1. **A negative down payment slipped past the freeze** and changed the
   contract's amount financed after the bill of sale was filed ("-500" on a
   nothing-down deal: the bill of sale lien stayed $6,775.00, the contract
   financed $7,275.00). **Fixed:** both actions (`saveSaleMoney`,
   `savePaperworkAnswer` for financing/downPayment) now store the down
   payment as one plain figure (`canonicalPaidToday` in
   `src/lib/sales/down-payment-freeze.ts`: "$1,500.00" is stored as "1500",
   an empty box stays empty) and refuse a figure below zero or one that is
   not a dollar amount, filed or not, with code `paidTodayInvalid` ("Type a
   dollar amount, like 1500. It cannot be less than zero.", Spanish too).
   The freeze compares figures unclamped, so a different figure above the
   total is a change too.
2. **"1,500" for 1500 went through the freeze but solved the note on $0
   down** (the solver read `Number("1,500")` as nothing; principal $6,775.00
   and payment $244.93 against a printed amount financed of $5,275.00).
   **Fixed:** the stored figure is plain, and `financingTerms` and the review
   screen now strip "$", "," and spaces the way the contract's itemisation
   always did, so a deal saved earlier with "1,500" reads the same. The
   arithmetic is unchanged.
3. **The VTR-61 read another spelling of the dealership as a stranger**
   ("Discount Used Cars & Trucks LLC", "…, L.L.C.", no "LLC"): it printed the
   entity alone beside the dealer's signature and asked for no signer.
   **Fixed:** `vtr61DealerParties` recognises the legal or trading name
   however typed (case, spacing, "&", punctuation, a closing LLC), and the
   dealership's entity rows then print the legal name.
4. **The freeze's "filed" missed a bill of sale completed through the older
   e-sign path** (`completed_at`, status completed, no `finalized_at`).
   **Fixed:** `filedBillOfSaleOn` uses the packet's own rule
   (`isFiledAgreement`, the same test `getSaleDetail` draws the packet with).
   Not widened: the price, its basis, the funding and the bill of sale's
   trade-in are still not frozen (an owner's decision; README and SOP say
   so).
5. **The password write spread a stale copy of app_metadata.** **Fixed:**
   onboarding and the recovery link send only `requires_password_change:
   false`; the auth server merges keys, so an owner's change made in between
   is never overwritten. The tests now pin the exact single-key payload.
   Not changed (documented in README step 9 and the SOP): a reset does not
   sign out a device already signed in, which can then choose the new
   password without the old one.
6. **README step 9** now says the signing default applies at approval only:
   members approved earlier keep their value, so existing Owner, Manager and
   Registration rows must be checked.
7. **The VTR-61 refusal only showed as raw JSON in a new tab.** **Fixed:**
   title work shows a "Before You Print" notice above the checklist with the
   same reason, and Finish Onboarding when the fix is the member's own.
8. **Walk script race** (`scripts/desk-walk/sale.cjs` read an
   `after:<key>` page mid-redirect and stopped with NO ANSWER): it now waits
   for such a page to move on. It did not recur in this run.

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` | 0 errors, the same 4 pre-existing warnings |
| `npx vitest run` | 140 files, 1736 tests passed (was 1703); `test-output.txt` |
| `npx next build` | exit 0 on the final code; `next-env.d.ts` restored, `git diff` empty |

New tests (no existing test skipped or deleted): the plain figure and the
invalid refusal on both actions and both screens, the note unchanged after
a "same figure" save, the unclamped compare, the legacy "1,500" read, the
filed rule (in `the-down-payment-holds-once-the-bill-of-sale-is-filed` and
`the-filed-bill-of-sale-is-looked-up-on-the-deal`); six spellings of the
dealership on both VTR-61 routes, a different entity kept apart, and the
title-work notice (in `the-vtr-61-names-who-prints-it`). Two expectations in
`a-temporary-password-is-replaced-at-onboarding` changed from the spread
payload to the exact single-key payload, with an added check that merging
it keeps every other key.

### Live (dev server on 5190, preview mock)

Three servers, each started fresh and stopped by its process group; port
5190 is closed. 5181 and 5183 were not touched.

- **F1** (`fresh-temporary-password`, `DESK_ALLOW_UNSET_FACTS=true`):
  onboarding at 1440×900 (22/22, `onboarding-password/fix-1440x900`), then
  all ten sales, then the freeze walk at both sizes.
- **F2** (`fresh-cannot-sign`, no override): onboarding (11/11), then the
  title-work notice at both sizes (8/8).
- **F3** (`fresh-temporary-password`, no override): the VTR-61 routes before
  onboarding, onboarding at 390×844 (22/22,
  `onboarding-password/fix-390x844`), the routes again, and title work with
  no notice (6/6).

| Sale | 1440×900 | 390×844 |
|---|---|---|
| bhph-trade | preview-deals-4, 3/3 signed | preview-deals-8, 3/3 signed |
| cash-otd | preview-deals-13, 2/2 | preview-deals-16, 2/2 |
| cash-balance | preview-deals-20, 2/2 | preview-deals-23, 2/2 |
| bank | preview-deals-27, 2/2 | preview-deals-30, 2/2 |
| buyer-files | preview-deals-34, 3/3 | preview-deals-38, 3/3 |

Every sale: THEME OK, sale exit 0, ceremony exit 0, 0 contrast failures, no
page errors (`walks/walks-summary-1002.log`).

**bhph-trade packets, read back at both sizes** (`walks/bhph-trade-*-packet`,
`walks/bhph-trade-packets-read.log`): bill of sale sales tax $437.50, total
amount due $7,545.50, balance secured by seller lien **$6,045.50**; contract
sales tax $437.50, down payment $3,500.00 (cash $1,500.00 + trade), amount
financed **$6,045.50**; 130-U Seller Name `Discount Used Cars And Trucks, LLC
(Maria Lopez)`, box 36 `2012 Honda Civic LX`, trade-in amount 2000.00.

**Freeze walk, 17/17 at each size** (`down-payment-freeze/fix-*`): Down today
2000 refused with the sentence (box and receipt back to $1,500.00 down,
$6,045.50 owed), in Spanish too; "-500" refused as no dollar amount and
"abc" refused in Spanish, nothing saved; "$1,500.00" goes through and reads
back as `1500`; the contract's 2000 refused (English and Spanish), its
"-500" refused (English and Spanish), its answer unchanged after reload, and
the money step still at 1500.

**VTR-61** (`vtr-61/fix-routes`, `vtr-61/fix-notice`): before onboarding,
POST with the owner typed "Discount Used Cars & Trucks LLC", "Discount Used
Cars And Trucks, L.L.C." and "discount used cars and trucks", and GET with
that rebuilder: all 403 ("Add your first and last name before printing the
VTR-61…"). After onboarding as Maria Lopez: all 200; both entity rows
`Discount Used Cars And Trucks, LLC`, both printed names `Discount Used Cars
And Trucks, LLC (Maria Lopez)` at 9.5pt; with `rebuilder=Bayou Auto Repair`
the shop keeps its own name. Title work, for a member not cleared to sign:
the notice "Before You Print / Your Name Beside The Dealer's Signature /
Only a member cleared to sign can print the VTR-61…" above the checklist,
no Finish Onboarding button (the fix is an owner's), and the link answers
403; for the onboarded, cleared member no notice and the link answers 200.

**Still open:** the money screen's receipt is drawn from what is in the
box, so while "-500" sits there refused it shows $0.00 down until the box is
corrected (nothing is saved); the step counter reads Step 2 Of 4 after the
password and Step 1 Of 3 after a reload on the name screen; the Spanish
strings need review; the "Total Paid" label on the bill of sale's buyer
acknowledgment is legal copy for the owner or counsel.

## 00. The owner's four decisions (10/01/2026), built 10/02/2026

This section records the latest run. Where the sections below differ, this
one supersedes them.

**What changed.**

1. **Temporary passwords.** Onboarding starts with **Choose A Password** only
   for an account still flagged `requires_password_change` (approval or
   reset). At least 10 characters (the constant recovery now shares,
   `src/lib/auth/password-rules.ts`), typed twice, Show/Hide for both boxes,
   English and Spanish. Saving replaces the password and clears the flag in
   one `auth.admin.updateUserById` call on the session's own account (every
   other app_metadata key kept), logs `team_member_password_chosen` (never
   the password), and continues to the name; the counter reads Step 1 Of 4,
   then Step 2 Of 4. Done still refuses while the flag is set. A password
   chosen through the emailed recovery link clears the flag too.
2. **Down payment after a filed bill of sale.** Refused, from the money
   step's Down today and from the contract's down-payment question (whoever
   answers it), with "Void the bill of sale and file it again before
   changing the down payment" (Spanish on the Spanish corridor). Only a
   change to the figure is refused. `scripts/desk-walk/scenarios/bhph-trade.json`
   now types the $1,500 in Down today before anything is filed.
3. **VTR-61.** Wherever the dealership is the owner or the rebuilder, its
   "Printed Name (Same as Signature)" is
   `Discount Used Cars And Trucks, LLC (First Last)` for the cleared,
   onboarded member printing it, with the 130-U seller line's fit rules and
   two-line layout (shared in `src/lib/forms/dealer-printed-name-field.ts`).
   Anyone else is refused the form (403, with the reason).
4. **Signing rights at approval.** Owner, Manager and Registration start
   cleared to sign; every other role starts not cleared. A reset keeps the
   person's own clearance.

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` | 0 errors, the same 4 pre-existing warnings |
| `npx vitest run` | 140 files, 1703 tests passed (was 134 and 1625) |
| `npx next build` | exit 0; `next-env.d.ts` restored, `git diff` empty |

### Walks (dev server on 5190, preview mock)

Three dev servers, each started fresh and stopped by its process group;
port 5190 is closed.

- **A** (`DESK_PREVIEW_MEMBER=fresh-temporary-password`, no
  `DESK_ALLOW_UNSET_FACTS`): the VTR-61 refusal before onboarding, then the
  VTR-61 prints after onboarding (below).
- **B** (`fresh-temporary-password`, `DESK_ALLOW_UNSET_FACTS=true`): the
  onboarding walk at 1440×900 (`onboarding-password/1440x900`), then six
  sales with `sale.cjs` and `ceremony.cjs` as the onboarded Maria Lopez, then
  the down-payment freeze walk at both sizes.
- **C** (as A): the onboarding walk again at 390×844
  (`onboarding-password/390x844`) on the final code.

Onboarding, both sizes: sent to onboarding from `/admin/sales`; **Choose A
Password** is Step 1 Of 4 with Save disabled until both boxes are typed and
no Back; 9 characters refused ("Use at least 10 characters."), a mismatch
refused, Show turns both boxes to text (aria-pressed true) and Hide back;
in Spanish "Elija Una Contraseña", "Paso 1 de 4" and the Spanish mismatch
sentence. Saving goes to **What Is Your Name?** at Step 2 Of 4 with no Back
to the password; a hard reload stays on the name (Step 1 Of 3, the password
is done). Name, signature, You Are All Set, Start Working lands on
`/admin/sales`; a hard load of `/admin/sales` stays there and
`/admin/account/onboarding` sends the finished member back to it: no loop
(3 document loads of the onboarding page in the whole walk). 0 page errors,
0 contrast failures.

| Sale | Size | Deal | Sale | Ceremony |
|---|---|---|---|---|
| bhph-trade | 1440×900 | preview-deals-4 | exit 0, THEME OK, 0 contrast failures | 3/3 signed, exit 0 |
| bhph-trade | 390×844 | preview-deals-8 | exit 0, THEME OK, 0 contrast failures | 3/3 signed, exit 0 |
| cash-otd | 1440×900 | preview-deals-13 | exit 0, THEME OK, 0 contrast failures | 2/2 signed, exit 0 |
| cash-balance | 1440×900 | preview-deals-17 | exit 0, THEME OK, 0 contrast failures | 2/2 signed, exit 0 |
| bank | 1440×900 | preview-deals-21 | exit 0, THEME OK, 0 contrast failures | 2/2 signed, exit 0 |
| buyer-files | 1440×900 | preview-deals-25 | exit 0, THEME OK, 0 contrast failures | 3/3 signed, exit 0 |

No page errors in any sale or ceremony log. The 390×844 folders of the four
other sales are the previous round's and were not re-run.

### The bhph-trade packet, read back (deal preview-deals-4, 1440×900)

Read with PyMuPDF from `walks/bhph-trade-1440x900-packet/`:

| Figure | Bill of sale | Financing contract |
|---|---|---|
| Sales tax | $437.50 (on $7,000 after the $2,000 trade) | $437.50 |
| Total | $7,545.50 | Total cash price $9,545.50, less $3,500.00 down (trade $2,000.00 + cash $1,500.00) |
| Balance | **$6,045.50** secured by seller lien | Amount financed **$6,045.50** |
| Dealer line | Discount Used Cars And Trucks, LLC (Maria Lopez) | Discount Used Cars And Trucks, LLC (Maria Lopez) |

The 130-U: Seller Name `Discount Used Cars And Trucks, LLC (Maria Lopez)`,
box 36 `2012 Honda Civic LX`, trade-in amount 2000.00. The bill of sale's
balance and the contract's amount financed now agree; the previous round's
run (scenario unchanged) printed $7,545.50 against $6,045.50.

Seen and not changed (pre-existing since the starting copy, 7121d43): the
bill of sale's buyer acknowledgment copy labels the total due "Total Paid"
($7,545.50) above "Seller lien balance acknowledged $6,045.50". On a deal
with a balance that label reads wrong; it is legal copy for the owner or
counsel.

### Down-payment freeze, in the browser (deal preview-deals-4)

`down-payment-freeze/1440x900` and `390x844`: Down today changed to 2000
is refused with the sentence and the box and receipt go back to $1,500.00
down, $6,045.50 balance; 1,500 again goes through to the next step; the
contract's question changed to 2000 is refused in English and in Spanish
("Anule la factura de venta y vuelva a archivarla antes de cambiar el
enganche."). 0 page errors, 0 contrast failures.

### VTR-61, live

On a server without `DESK_ALLOW_UNSET_FACTS`, `GET /api/documents/vtr-61?vehicleId=mock-4`
before onboarding: **403** "Add your first and last name before printing
the VTR-61: it prints the dealer as Discount Used Cars And Trucks, LLC
(First Last). Use Finish Onboarding on Handle A Sale."
(`vtr-61/refused-before-onboarding.json`). After onboarding as Maria Lopez:
200, both printed names `Discount Used Cars And Trucks, LLC (Maria Lopez)`
at 9.5pt, entity rows the entity alone. With `&rebuilder=Bayou Auto Repair`:
the rebuilder's printed name stays `Bayou Auto Repair`, the owner's is the
pairing. Renders: `vtr-61/*-printed-names-200dpi.png`, including the
two-line case (a 50-character name) between each box's rule and the text
above.

## 0. This change: signer name, onboarding, website and hours (10/01/2026)

This section records the latest run. Where sections 1 to 8 below (an earlier
run) differ, this section supersedes them.

**What changed.** The owner's facts (OWNER source, 10/01/2026): hours
Tuesday to Saturday 10:00 to 19:00, Sunday and Monday closed; public website
www.discountusedcarsandtrucks.com printed on documents; phone (713) 900-5050
confirmed. The user's requirements: the 130-U seller line prints
`Discount Used Cars And Trucks, LLC (First Last)`, and a staff member's first
sign-in asks their first and last name and their signature, which is then on
the 130-U they file. The review round then fixed:

- a name too long for the 130-U seller box is refused at onboarding and at
  filing, and the fill throws rather than clip it;
- a finished member can no longer reopen onboarding to rewrite the legal
  name (a correction needs an owner; there is no rename screen yet); name
  writes are logged; Done needs a name the name screen would accept;
- the name is kept exactly as typed (no re-capitalising);
- onboarding refusals come from the message catalogue (Spanish screens show
  Spanish), and swap in place with the language toggle;
- the Buyer's Guide Email box prints `[Not set: dealer email]`, never the
  website;
- the contract's down payment reaches the money step only for a caller with
  `sales:manage` on a buy here pay here deal (the registration role, or a
  cash deal, can no longer move a balance or 130-U lien through it);
- the review-screen preview prints the viewer's name on the dealer line, as
  the filed sheet will;
- filing is refused if the desk address and the website are one host;
- the late-handling fee is read like a money box (`$100`, `1,000`), and a
  bad or negative value keeps the document refused with the reason;
- sender mailboxes are null until `RESEND_FROM_EMAIL` / `SUPPORT_FROM_EMAIL`
  are set (no mailbox built from the website);
- a filed 130-U names its signer only from what the filing recorded
  (`form_data.dealerSignerMemberId`), so a link written by the legacy
  agreements API cannot name one;
- the "Before You File" notice names the fix in words and carries a
  **Finish Onboarding** button instead of a raw path.

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` | 0 errors, the same 4 warnings as below (untouched files) |
| `npx vitest run` | **134 files, 1,625 tests passed**, 0 failed (`test-output.txt`) |
| `npx next build` | compiled; `/admin/account/onboarding` is a route (next-env.d.ts restored afterwards, no diff) |

### Five sales at both sizes

Dev server on 5190, preview mock, `DESK_ALLOW_UNSET_FACTS=true`,
`DESK_PREVIEW_MEMBER=fresh`. The member onboarded at 1440×900 as
"Maria Lopez" (cleared to sign) and then walked every sale with
`sale.cjs` and `ceremony.cjs`, scenario files unchanged. Every walk printed
`THEME OK` (accent `rgb(0, 0, 0)`, ground `rgb(238, 239, 242)`, Barlow Semi
Condensed), `sale exit 0`, `ceremony exit 0`, no page errors, no stuck step.

| Sale | Size | Deal | Signed | Contrast failures (desk / ceremony) |
|---|---|---|---|---|
| `cash-otd` | 1440×900 | preview-deals-3 | 2 / 2 | 0 / 0 |
| `cash-otd` | 390×844 | preview-deals-24 | 2 / 2 | 0 / 0 |
| `cash-balance` | 1440×900 | preview-deals-21 | 2 / 2 | 0 / 0 |
| `cash-balance` | 390×844 | preview-deals-38 | 2 / 2 | 0 / 0 |
| `bhph-trade` | 1440×900 | preview-deals-7 | 3 / 3 | 0 / 0 |
| `bhph-trade` | 390×844 | preview-deals-27 | 3 / 3 | 0 / 0 |
| `bank` | 1440×900 | preview-deals-17 | 2 / 2 | 0 / 0 |
| `bank` | 390×844 | preview-deals-35 | 2 / 2 | 0 / 0 |
| `buyer-files` | 1440×900 | preview-deals-12 | 3 / 3 | 0 / 0 |
| `buyer-files` | 390×844 | preview-deals-31 | 3 / 3 | 0 / 0 |

Screens are in `walks/<scenario>-<w>x<h>/` and `walks/<scenario>-<w>x<h>-cer/`.

### The 130-U seller line, read back

The cash-otd and bhph-trade 1440×900 packets were pulled with `pdfs.cjs` and
read with PyMuPDF (`packet-checks.txt`, final run):

- **Seller printed name:** the 130-U field `Seller  Name` is exactly
  **`Discount Used Cars And Trucks, LLC (Maria Lopez)`** on both, at 9.49pt
  inside the box [293.5, 688.2, 514.6, 712.0].
- **Signature:** the stroke drawn at onboarding is one image on the seller
  band (x 96.5 to 213.5, y 689 to 711), beside the printed name. Rasterised at
  300 dpi: `packet-pages/130-U_Delgado_812345-p1-seller-line-300dpi.png` and
  `packet-pages/130-U_Salinas_A98765-p1-seller-line-300dpi.png`.
- **Every dealer line** (bill of sale, contract, vehicle responsibility,
  insurance acknowledgment) prints the same pairing.
- **Website:** www.discountusedcarsandtrucks.com prints on the bill of sale
  (2×), the contract and the other sheets; no `localhost`, no
  desk.discountusedcarsandtrucks.com anywhere. Phone (713) 900-5050.
- **Markers:** none on the cash-otd and bhph-trade packets; on buyer-files
  only `[Not set: late-handling fee]` (owner has not supplied it).
- **Box 36:** "2012 Honda Civic LX", trade-in amount 2000.00
  (`packet-pages/130-U_Salinas_A98765-p1-box36-300dpi.png`).
- **Hours:** no document prints opening hours; the config holds Tuesday to
  Saturday, 10:00 to 19:00, Sunday and Monday closed.
- **Money (reported, not changed):** bhph-trade still shows a bill of sale
  balance of $7,545.50 against $6,045.50 financed, because the unchanged
  scenario types the $1,500 down payment only at the financing question,
  after the bill of sale is filed. Tax is $437.50 on both. This is an open
  owner decision ("Still open" below).

### Onboarding screens

Each run on its own fresh server (onboarding changes the mock member).
0 page errors and 0 contrast failures on every screen. In every run a hard
load of `/admin/sales` before Done goes back to onboarding, Done lands on
Handle A Sale, a reload stays there, and opening `/admin/account/onboarding`
afterwards goes straight back to `/admin/sales`.

| Member | Size | Screens (`onboarding/`) |
|---|---|---|
| Cleared to sign, "Maria Lopez" | 1440×900 | `cleared-1440x900-00` sign in, `-01` name (Next disabled while empty), `-02`/`-03` a 64-character name refused in English and in Spanish, `-04` name, `-05`/`-06` Draw Your Signature, `-07` You Are All Set ("Documents you file will read Discount Used Cars And Trucks, LLC (Maria Lopez), with your saved signature on the dealer line."), `-08`/`-09` Handle A Sale |
| Cleared to sign, "Maria Lopez" | 390×844 | `cleared-390x844-00` to `-09`, the same screens |
| Not cleared, "Daniel Reyes" | 1440×900 | `cannot-sign-1440x900-00` to `-05`: Step 1 of 2 name, Step 2 of 2 done ("Your name is saved as Daniel Reyes."), no signature screen; Handle A Sale shows "Only a member cleared to sign can file…" with no button |
| Not cleared, "Daniel Reyes" | 390×844 | `cannot-sign-390x844-00` to `-05`, the same |

The signer notice for a member cleared to sign with no name (server with
`DESK_ALLOW_UNSET_FACTS` not set): `refusal/notice-1440x900.png` and
`refusal/notice-390x844.png` show "Add your first and last name before
filing: the 130-U prints the seller as Discount Used Cars And Trucks, LLC
(First Last). Use Finish Onboarding on Handle A Sale." with a **Finish
Onboarding** button, which opens What Is Your Name?. The server-side filing
refusal screens in `refusal/unnamed-*/` are from the earlier run (same
refusal, the older wording with the raw path).

### Still open (owner's decisions)

- Temporary passwords, the down payment after a filed bill of sale, the
  VTR-61 printed name and the signing default were decided on 10/01/2026
  and are built (section 00).
- **Facts still to supply:** late-handling fee, documentary fee, dealer
  email, sender mailboxes, and `NEXT_PUBLIC_SITE_URL` (recommended
  `https://desk.discountusedcarsandtrucks.com`).

## 1. Static checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` | 0 errors, 4 warnings: the unused variables the reference desk shipped with (`paper-palette-contrast.test.ts`, `the-photograph-lands-before-it-is-read.test.ts`, `the-price-means-one-thing.test.ts`, `Form130UPreview.tsx`) |
| `npx vitest run` | 121 files, **1,415 tests passed**, 0 failed (full output in `test-output.txt`) |
| `npx next build` | compiled, TypeScript passed, 38 routes plus `/icon.png`, no Supabase settings needed |

### The fact guard (`src/__tests__/no-hardcoded-dealer-facts.test.ts`, 27 tests)

- **This dealer's facts may be typed only in `src/lib/dealership-config.ts`:**
  - the name and legal name;
  - both phone numbers;
  - 8108 Gulf, 77017 and P145000;
  - the Facebook page;
  - the venue county ("Harris County", "Condado de Harris").

  The guard reads `src/`, `messages/`, `supabase/` and the root config files.
  The TypeScript parser removes comments first, so a `//` inside a string is
  never mistaken for one.
- **The earlier dealers' facts may appear nowhere outside `src/__tests__/`.**
  That covers phones, streets, ZIPs, licences, names, the domain, the
  Facebook page, the emblem file names, the glass business and the old
  monogram, and it includes comments, the config, `README.md`,
  `.env.example`, `docs/`, `verification/` and `public/`. The one exception is
  the two stored vehicle-location identifiers in the fixed data model
  (`src/types/database.ts`).
- **Two more refusals:**
  - an environment variable falling back to a dealer value through `||`,
    `??` or `?.trim() ||`;
  - the short name followed by "Auto", an invented trading name.
- **Proof that it fails:**
  - The reviewer's misses were planted in a scratch copy of the repository.
    They were the old emblem path, the old name in capitals and in lower case,
    the old Facebook id, the glass segment, the old monogram, this dealer's
    name and Facebook page outside the config, `??` and `?.trim() ||`
    fallbacks, and `"a // b"` followed by a foreign phone number on one line.
  - Further plants were the short name plus "Auto", a typed venue county, a
    phone and street in a comment, a foreign street in a `.sql` file and in an
    `.html` file, and an old name appended to the README.
  - 14 of the 27 guard tests failed, and every planted line was named as an
    offender. The copy was then deleted; nothing was planted in the
    repository itself.

## 2. Five sales, end to end, at 1440×900 and 390×844

Each walk ran the whole sale with `scripts/desk-walk/sale.cjs`: Start A Sale,
the corridor and every document. Then `ceremony.cjs` signed the packet as the
buyer: it read each document to the end, signed it, and reused the first
stroke with consent. Every screen is in `walks/<scenario>-<w>x<h>/`, and the
ceremony is in `walks/<scenario>-<w>x<h>-cer/`.

| Sale | Size | Deal | Signed | Contrast failures (desk / ceremony) |
|---|---|---|---|---|
| Cash, out the door, dealer files (`cash-otd`) | 1440×900 | preview-deals-2 | 2 / 2 | 0 / 0 |
| Cash, out the door, dealer files (`cash-otd`) | 390×844 | preview-deals-5 | 2 / 2 | 0 / 0 |
| Cash, vehicle only, balance and lien (`cash-balance`) | 1440×900 | preview-deals-7 | 2 / 2 | 0 / 0 |
| Cash, vehicle only, balance and lien (`cash-balance`) | 390×844 | preview-deals-14 | 2 / 2 | 0 / 0 |
| Buy here pay here with a trade-in (`bhph-trade`) | 1440×900 | preview-deals-13 | 3 / 3 | 0 / 0 |
| Buy here pay here with a trade-in (`bhph-trade`) | 390×844 | preview-deals-20 | 3 / 3 | 0 / 0 |
| Bank financing, Chase Auto Finance (`bank`) | 1440×900 | preview-deals-22 | 2 / 2 | 0 / 0 |
| Bank financing, Chase Auto Finance (`bank`) | 390×844 | preview-deals-28 | 2 / 2 | 0 / 0 |
| Buyer files, no insurance shown (`buyer-files`) | 1440×900 | preview-deals-30 | 3 / 3 | 0 / 0 |
| Buyer files, no insurance shown (`buyer-files`) | 390×844 | preview-deals-36 | 3 / 3 | 0 / 0 |

The packets:

- cash sales: bill of sale and 130-U;
- buy here pay here: bill of sale, 130-U and retail installment contract;
- bank: bill of sale and 130-U, with no dealer contract;
- buyer files: bill of sale, vehicle responsibility and insurance
  acknowledgment, with no 130-U.

On every walk:

- **Theme assertion:** the walker checked three computed styles before it
  trusted any screenshot. The current answer's border was `rgb(0, 0, 0)`, the
  ground was `rgb(238, 239, 242)`, and the question header was set in Barlow
  Semi Condensed. All 10 walks printed `THEME OK`.
- **Contrast audit:** every visible text node on every desk and ceremony
  screen was measured against its real background. There were 0 WCAG AA
  failures in all 20 runs.
- **Clean runs:** `sale exit 0`, `ceremony exit 0`, and no page errors.
- **Brand:**
  - The sign-in page and the buyer's signing cover show the colour logo on
    the light ground.
  - The black rail shows the red swoosh over a white, letter-spaced
    "DISCOUNT / USED CARS AND TRUCKS".
  - The sign-in page prints the legal name "Discount Used Cars And Trucks,
    LLC". It was re-shot for this run in
    `brand-screens/1440x900_admin_login.png` and `390x844_admin_login.png`.
  - Its HTML contains no earlier dealer's name and no invented "… Auto" name.

## 3. The printed packet, read back

Every PDF of all five 1440×900 packets was downloaded through the packet
screen's own Open/Print route (`pdfs.cjs`). Each was read with PyMuPDF: the
text, plus the 130-U's filled fields by name. The buy here pay here packet
(11 pages) is rasterised in `packet-pages/` and was read page by page. Full
results are in `packet-checks.txt`: **131 automated checks pass, 0 fail.**

- **Dealer:**
  - "Discount Used Cars And Trucks, LLC" is on every document, in one casing
    throughout. On the 130-U it is the box 20 previous owner and the seller's
    printed name. No document prints the lower-case "and" form.
  - GDN P145000 is on every document, including 130-U box 21.
  - The venue on the bill of sale (the governing-law clause and the Texas-law
    acknowledgment) and on the contract reads "Harris County, Texas", now
    taken from `dealership.county`.
- **Lienholder** (130-U box 34 and the bill of sale):
  - cash out the door: none;
  - cash with a balance: the dealer, with a $326.75 seller lien;
  - buy here pay here: the dealer, at 8108 Gulf Fwy, Houston, TX 77017, with
    lien date 10/01/2026;
  - bank: Chase Auto Finance, with no dealer address on the 130-U, no seller
    lien and no dealer contract.
- **Odometer:** identical on every document in each packet: 89432, 64280,
  118340, 102587 and 95710.
- **Money:**
  - Bill of sale: $9,000.00 − $2,000.00 + $545.50 = $7,545.50.
  - Contract: 25.98% APR held at the ceiling. That gives $329.11 × 35 plus a
    final $328.97 = $11,847.82, with $8,170.50 financed.
  - Every bill of sale's figures sum to its total.
- **Dates:** 10/01/2026 is the only date on any document.
- **Hosts and facts:**
  - No localhost or dev host appears on any document.
  - No earlier dealer's fact appears, and no private fact (founder's email,
    mailing address, EIN, taxpayer number) appears either.
  - The only `[Not set]` on paper is the website domain.
- **Ink:**
  - The letterhead pages have 0 coloured pixels: bill of sale p1, contract p1
    and both 130-U pages.
  - The only colour in the packet is the reference desk's red on open
    balances and the rust down-payment figure.

## 4. Dealer facts and their sources

All of these are in `src/lib/dealership-config.ts`, each with its source
beside it.

| Fact | Value | Source |
|---|---|---|
| Display name | Discount Used Cars and Trucks | TxDMV (DBA on GDN P145000); Google listing at 8108 Gulf Fwy |
| Short name / wordmark | Discount | The dealer's logo |
| Legal name | Discount Used Cars And Trucks, LLC | TxDMV dealer list, current 10/01/2026, and Texas SOS file 0802832466 (domestic LLC, formed 10/09/2017), both in capitals. It is written in the casing the 130-U name normaliser produces, so every document prints one identical name |
| Dealer licence (GDN) | P145000 | TxDMV: Active, Motor Vehicle (independent), active since 11/06/2017, expires 09/30/2027 |
| County | Harris | TxDMV |
| Address | 8108 Gulf Fwy, Houston, TX 77017 | TxDMV, Comptroller and Google listing (ZIP+4 77017-3620, no suite) |
| Phone | (713) 900-5050 | Google listing and the dealer's sign, pending the owner's confirmation. The TxDMV licence record lists (713) 203-3890, which is noted in a comment only |
| Time zone | America/Chicago | Houston |
| Hours | Monday to Friday, 10:00 AM to 5:00 PM; Saturday and Sunday closed | Google listing, read 10/01/2026, pending the owner's confirmation |
| Languages | English and Spanish | "Se Habla Español" on the dealer's sign (historic), pending the owner's confirmation |
| Facebook | https://www.facebook.com/Discountusedcars/ | The dealer's page |
| What it sells | Pre-owned cars, trucks and SUVs (no glass business) | |

**Still `null`, printing `[Not set: …]` until the owner supplies them:**

- owner, authorised signer, documentary fee;
- website domain (`NEXT_PUBLIC_SITE_URL`) and email;
- payment destinations (Zelle, Cash App, Apple Pay, PayPal);
- SMS provider, salvage dealer licence and lenders;
- map position, price range and service area.

A likely domain is named only as a comment in `.env.example`, never as a
default. Customer emails now print `[Not set: dealer email]` where they used
to print a mailbox built from the site host.

## 5. What this round changed

Fixes from the review, each kept to brand, facts or copy:

- **130-U prefill:** `form130U.ts` is back to the reference desk's logic, with
  no special case for the dealer's name. Only the previous owner's city and
  state now come from the config. The legal name is written in the casing
  that logic produces ("And"), so the existing test passes unchanged.
- **Support email:** it no longer invents an address. Customer emails print
  the dealer's email or its marker.
- **County:** read from the config everywhere it prints. That covers the bill
  of sale's two venue lines, the contract, the rental agreement and the
  VTR-271 grantee.
- **Rental agreement:** the reference dealer's monogram watermark is removed,
  and the header ring and legal name are now black ink.
- **Earlier dealers in comments and docs:** their phone, street, domain and
  name were replaced with neutral wording in comments. The README and this
  report no longer name the desk this was forked from.
- **Email previews:** the sample links use example.com.
- **Other values:**
  - The preview mock's seeded text reads the short name from the config.
  - The local preview identity is `local-admin@example.invalid`.
  - `serviceArea` is null.
- **SMS assistant prompt:** it states only supplied facts.
- **Fact guard:** strengthened as described in section 1.
- **README:** lists every deliberate code change.

Not changed, with the reason:

- **Stored identifiers:** the two inherited vehicle-location values in
  `src/types/database.ts` stay. They are stored identifiers in the fixed data model, and
  renaming one is a data migration. They are noted in the code and exempted
  narrowly in the guard.
- **Page titles:** they keep the full name ("… - Discount Used Cars and
  Trucks") rather than the short name. Both come from the config.
- **Sender addresses:** `mailFrom` and `supportFrom` stay sender settings.
  They are not printed, and mail sends only once a provider is configured.

## 6. Owner's manual steps

The full, current list is in `README.md` ("Owner's manual steps before going
live"). The essentials:

1. Create a new Supabase project for this dealer; never reuse another
   dealer's. Apply `supabase/migrations/20260926000000_discount_sale_desk.sql`.
2. Set the secrets in the host: Supabase URL and keys, `ADMIN_SESSION_SECRET`
   and `INTERNAL_RENDER_TOKEN`.
3. Set the desk's own address, never printed:
   `NEXT_PUBLIC_SITE_URL=https://desk.discountusedcarsandtrucks.com`.
   Documents print the public website, www.discountusedcarsandtrucks.com.
4. Supply the missing facts: documentary fee, late-handling fee, dealer
   email, and the sender mailboxes `RESEND_FROM_EMAIL` / `SUPPORT_FROM_EMAIL`.
   The phone, the hours and the website were confirmed on 10/01/2026.
5. Clear the members who file (`can_sign_contracts`; on by default only for
   Manager and Registration) and have every staff member complete onboarding
   (name, signature if cleared, done). Decide the temporary-password step
   first (section 0, "Still open").
6. Confirm the statutory fee lines and the financing rate ceilings with
   counsel before selling buy here pay here.
7. Approve the Spanish documents and the Spanish onboarding strings. Spanish
   e-signature stays off until then.
8. Keep signing texts off until an SMS provider and a registered campaign
   exist.
9. Renew the GDN before 09/30/2027.

## 7. Images still needed (prompts for the team)

No image was generated for the desk. The email templates embed two files
that neither this desk nor the one it was forked from has. Until they exist,
emails go out without the marks.

1. **`public/brand/email-wordmark.png`** (drawn at 196 × 48, so the file is
   392 × 96): "The supplied Discount Used Cars and Trucks full-colour logo
   (red car swoosh, red italic DISCOUNT, navy USED CARS AND TRUCKS LLC, road
   line), unchanged, centred on a transparent 392 × 96 px PNG and scaled to
   fill the height (about 249 × 96 px). No new lettering, no effects, no
   shadow, no background."
2. **`public/brand/email-monogram.png`** (drawn at 36 × 55, so the file is
   72 × 110): "The red italic D from the Discount app icon, colour #9A1414
   unchanged, centred on a transparent 72 × 110 px PNG, about 64 px wide, with
   no white square behind it and no other marks."

## 8. Open items

- **Facts behind the site:** see step 4 above. The desk was verified on the
  facts it was given.
- **Legal name casing:** the documents print "Discount Used Cars And Trucks,
  LLC". The licence and SOS records hold the name in capitals, so either
  casing is sourced. "And" is the one the reference desk's 130-U normaliser
  produces, which keeps that logic unchanged. If the owner wants a lower-case
  "and" on paper, that needs an approved change to the 130-U prefill rule.
- **Email links:** each email links its mark to the site URL, which is the
  local development address until `NEXT_PUBLIC_SITE_URL` is set. This is the
  reference desk's link logic, so it was not changed.
- **Rental agreement:** it still has gold-tinted boxes in its body. It is not
  part of the sale flow, and this dealer has no rental business.
- **Test fixtures:** tests still carry the reference dealership's sample data
  (names, phones, a street and a domain used as inputs). The guard exempts
  tests by design, and these tests came with the reference desk.

## Known issues carried over from the reference (not changed)

Money math and document rules are fixed, so these are reported, not changed:

- **Trade-in on a buy here pay here sale:**
  - The bill of sale credits the trade and taxes $7,000. The retail
    installment contract taxes the full $9,000 and has no trade-in line.
  - The bill of sale's seller-lien balance ignores the $1,500 down payment.
  - 130-U box 36 (trade-in) is left blank.
- **Contract colour:** the contract prints the down payment in rust
  (#8A3A1C).
