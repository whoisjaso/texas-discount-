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
   `supabase/migrations/20261002000000_vehicle_empty_weight.sql` (README
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
