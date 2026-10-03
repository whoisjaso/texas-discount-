---
name: premium-dealer-build
description: >-
  Phase-gated playbook for onboarding a new car dealership client: eight phases in a fixed order,
  each with prerequisites, deliverables shown to the user and a review gate, tracked in a status
  file. Research the dealer's real facts, build a Porsche-grade public website (fixed hero,
  black-and-white marque design, Title Case, real inventory), write the ChatGPT image brief and
  place the returned images, build the Handle A Sale sale desk (first sign-in onboarding with the
  owner's fees capped by Texas law, Texas paperwork filled page by page, e-signing) in the same
  theme, verify it, make the demo videos (via recordly-demo), then deliver and deploy. Use this
  whenever the user onboards a dealership or auto business, asks to "do what we did for Vega's" or
  Triple J, wants a luxury dealer site, a sale desk / admin dashboard for a dealer, a dealer's doc
  fee or Texas fee limits, image prompts for a dealer site, a demo video for a dealer, or to load a
  dealer's Facebook inventory, even if they only name one of those parts.
---

# Premium dealer build

This is the repeatable version of the Vega's Auto Sales & Glass Co. build (`clients/vegas-auto-sales` = public
site, `clients/vegas-desk` = sale desk, PR whoisjaso/xlnc-perception#2), brought up to date by the Discount
Used Cars and Trucks build (`clients/discount-used-cars-site`, `-desk`, `-demo`, whoisjaso/texas-discount- PR
#1), which is now the reference. A new client gets the same four things:

1. **A public website** that feels like porsche.com/usa: one fixed hero photo, black and white with the
   client's logo as the only colour, one narrow grotesk in Title Case, rounded photo tiles, quiet motion, real
   inventory.
2. **The Handle A Sale desk**: the owner's SOP, ported with its logic unchanged, wearing the site's clothes.
3. **An image brief** the team runs in ChatGPT, with Claude placing every returned image and tracking what's
   left.
4. **A demo video** made with the `recordly-demo` skill: the short Recordly-style showcase (site, then the
   desk, then the iPhone cut) and the narrated walkthrough that sells the desk to the dealer in money made and
   time saved. Every claim in the narration is checked against the desk.

Two rules outrank everything, because the dealership's name goes on legal paper and its customers drive to the
address on the site:

- **Never invent a fact.** No legal name, licence, county, fee, year, price, mileage, review or claim that
  isn't sourced. Missing facts stay `null`, print `[Not set: …]`, and are listed in every report. See
  `references/facts-research.md`.
- **Never pass off a generated image as the dealer's.** Generated pictures are brand and mood only (no badges,
  no plates). Vehicles for sale, the lot, staff and customers are real photos. See
  `references/image-brief.md`.

## How to run this skill (any agent, any model)

1. **Phase by phase, in order:** Phase 0 → 7, and inside Phase 4 the steps 4.1 → 4.10. Never start a phase or
   step before its **Prerequisites** are true. The order is the dependency order: the desk wears the site's
   theme, so it follows the approved site; the video films the verified site and desk, so it follows Phase 5;
   nothing is deployed before the user has seen it.
2. **Stop at every REVIEW GATE.** Show the phase's **Deliverables** in the chat (screenshots and files
   attached with your file-sending tool, links pasted), ask the gate's question as written, and wait for an
   explicit go. A **hard** gate always waits. A **soft** gate waits too, unless the user has said "keep going"
   (or the like) for this build: then send the deliverables, write "passed on 'keep going' (<date>)" in the
   status file, and carry on; the user can still stop you at any message.
3. **Asked to jump ahead** ("just do the video")? Say which prerequisite is missing ("the video films the
   verified desk, and Phase 5 isn't done") and offer to do that first. Never fake a prerequisite: no stand-in
   site, no unverified desk, no unapproved script.
4. **Keep the status file.** At kickoff create `clients/<slug>-STATUS.md` from `assets/STATUS-template.md`. At
   every gate tick its box, write the date, link the deliverables and the user's words, update the open owner
   items, and commit it with the phase's work on the session branch (pushed, so the draft PR shows it). The
   user reviews progress there at any time.
5. **Exit criteria are checked, not assumed.** A failed one is fixed inside its phase, never carried silently
   into the next.
6. **Maintaining this skill.** A new requirement is written into the phase or step where it is built, and into
   its SOP section and its tests; never only appended as a lesson. When a build learns something late, move it
   to the step that should have built it. "Lessons" below holds only rules that cut across phases.

| Phase | Builds | Review gate | Kind |
|---|---|---|---|
| 0 | Intake, facts, the fee rulebook, the kickoff answers | G0: the Phase 0 report | **Hard** |
| 1 | Brand and public site | G1: site screenshots | **Hard** |
| 2 | The image brief (images placed as they arrive) | G2: the brief's link | Soft |
| 3 | Real inventory | G3: the lineup and a vehicle page | Soft |
| 4 | The Handle A Sale desk, steps 4.1-4.10 | G4: the desk's screens | Soft |
| 5 | Verify the site and the desk | G5: the verification evidence | **Hard** |
| 6 | Demo video: 6a short cut, 6b narrated script, 6c voice and cut | G6a short cut (soft); G6b script approval (**hard**); G6c voice preview and G6d the narrated film (**hard**, recordly-demo's rules) | |
| 7 | Deliver and deploy | G7: final delivery | **Hard** |

## Phase 0: Intake and research

**Prerequisites:** the user's kickoff message (`NEW-CLIENT-PROMPT.md` filled in, with the logo, the TxDMV
dealer search screenshot and any collages). It names this skill and the facts to collect: follow it.

**Steps:**
1. Create `clients/<slug>-STATUS.md` from `assets/STATUS-template.md`.
2. Collect: dealer name, logo file, city, what they sell (trucks? glass? BHPH?), languages, and any links
   (Facebook, Google).
3. Research facts per `references/facts-research.md`: public listings for name/address/phone/hours/reviews;
   the state licence record for legal name, GDN and county (ask the user for a screenshot of the TxDMV dealer
   search). Claude cannot log into the user's accounts: ask for screenshots, never passwords.
4. The documentary fee is not a research fact: the owner sets it at first sign-in (Your Fees, step 4.3). Ask
   only whether it is above $225.00, which needs an OCCC filing (7 TAC §84.205(b)(1), (c), in force since
   2024-07-11). The other facts only the owner can give (the signer, the domain, the late-handling fee the
   Vehicle Responsibility sheet quotes; `references/facts-research.md`) are asked now, not found missing
   later.
5. Re-check the Texas fee rulebook (`references/texas-dealer-fees.md`, section 6.3, and its as-of date), then
   run this skill's `scripts/check-fee-module.cjs` on `clients/discount-used-cars-desk` (the desk you will
   fork) so its legal module matches it.
6. A client with its own website repository: the desk SOP's Phase 0 applies as written (find its stack and
   design system; never restyle their public pages unasked), and its findings join this report. A state other
   than Texas stops here (SOP, State check).
7. Ask the video's kickoff questions now, so Phase 6 never waits on them (recordly-demo B0 and the narration
   flags): film the owner's first sign-in with Your Fees (then a demo fee figure from the owner or the user)
   or a salesperson's; may the desk's own web address show in the film's address bar; may buyers drive off
   owing part of the price (BHPH, in-house); does the dealer sell in Spanish; does the site keep a sell /
   trade-in band.

**Deliverables:** the report: facts found with sources, facts missing (signer, domain and late-handling fee
listed until given), the hero concept, the stack plan, the rulebook's as-of date and the fee-module check, the
OCCC question, the video's kickoff questions, and the status file.

**REVIEW GATE G0 (hard):** "Here is what I found, with sources, and what is missing. Shall I build the site
with these facts (anything missing stays marked `[Not set]` until you have it)? And please answer the video
and fee questions at the end." If the user says "I don't know those, go", proceed with nulls and markers, and
list them in the status file.

**Exit:** every fact sourced or listed missing; the rulebook current and the module check at exit 0; the
kickoff answers (or "unknown") recorded; the go in the status file.

## Phase 1: Brand and public site

**Prerequisites:** G0 passed.

**Steps:**
1. Start from the last build, not from zero. Copy the newest build: `clients/discount-used-cars-site` →
   `clients/<client>-site` (and `clients/discount-used-cars-desk` → `clients/<client>-desk` beside it, for
   step 4.1). It carries every desk standard listed in Phase 4; the older Vega's copies
   (`clients/vegas-auto-sales`, `clients/vegas-desk`) do not, so use them only if the Discount build is
   unavailable, and then build each standard at its Phase 4 step. Both are clean and tested, and every dealer
   fact lives in one file (`src/data/business.ts` for the site, `src/lib/dealership-config.ts` for the desk).
   Then:
   - replace every reference dealer's fact and asset (Discount: grep for `Discount`, `900-5050`, `203-3890`,
     `P145000`, `8108`, `Gulf Fw`, `Park Place`, `discountusedcarsandtrucks`; Vega's: `Vega`, `7722`,
     `941-1622`, `P113248`, `Galveston`, `Constantino`);
   - rename the Loader SEEN_KEY, the photo files and `package.json` names;
   - empty `public/photos/` and the inventory list: the new client starts with drawn stand-ins until their own
     images arrive.
2. Apply the design system (`references/design-system.md`) with the client's logo: logo assets and favicon/OG
   from the logo, `business.ts`, the hero headline in the client's real offer. Built in, because each was a
   defect once:
   - a **fixed** hero (one photo every visitor lands on), never a carousel;
   - headlines over the hero pinned to the left gutter, so they never cross the vehicle on wide screens (check
     1440 and 1920);
   - Title Case on headings, subtitles, buttons and labels; sentences stay sentences;
   - fonts self-hosted: stock photo sites and Google Fonts are blocked in the container (use the team's
     generated images or the dealer's photos);
   - the Admin link in the menu drawer: it opens the desk's staff sign-in (`VITE_DESK_URL` + `/admin/login`)
     and appears once the desk URL is set.
3. Build, screenshot desktop and phone (`scripts/site_screens.cjs`), and look at every shot
   (`references/verification.md`, Public site).

**Deliverables:** desktop (1440 and 1920) and phone (390) screenshots.

**REVIEW GATE G1 (hard):** "Here is the site at desktop and phone sizes. Is this the look you want? The desk
will wear the same theme, so I'd like your go before the image brief and the desk." Then commit, push, and
open the draft PR so the user can follow the build there.

**Exit:** the build clean; every shot looked at (headline clear of the subject at 1440 and 1920, the grotesk
not Arial, Title Case, no stand-in where a photo was delivered); the user's go recorded.

## Phase 2: The image brief

**Prerequisites:** G1 passed (the slots are the approved site's).

**Steps:** write the prompts (`references/image-brief.md`): hero first (derive it from the logo and the stock
mix), then the 15-slot list with one house-style line. Publish it as a shared doc the team can work from
(Claude Docs when available) and tell the user to share it with the team. Never generate the images yourself
and never log into ChatGPT: the team runs the prompts and sends the files back. As images arrive, now or in
any later phase, place each one (`scripts/prepare_image.py` → map slot + focus → screenshot → commit → mark
done in the doc). Flag any generated image standing in for something that must be real: a generated
"dealership lot" on the Visit page will be recognised as fake by the owner, so ask for a real phone photo.

**Deliverables:** the doc's link; later, a screenshot of each placed image and any flag.

**REVIEW GATE G2 (soft):** "The brief is ready for your team: <link>. Send the images back here as they come;
I'll place each one. Shall I load the inventory meanwhile?"

**Exit:** the doc published with every slot and its status; each later placement noted in the status file.

## Phase 3: Real inventory

**Prerequisites:** G1 passed; the dealer's collages or post screenshots (or the user's word that none exist
yet: the drawn stand-ins stay and the status file lists inventory as an owner item).

**Steps:** from the dealer's Facebook collages and post screenshots (`references/inventory-intake.md`): crop
the cells (`scripts/crop_collage.py`; collage seams aren't white, so crop with an inset and check the contact
sheet), fill only what is visible, leave year/price/miles out when not stated, delete the sample list, add the
thumbnail gallery and cover focus points.

**Deliverables:** the lineup and a vehicle page, the contact sheet, and what was left out because the post did
not state it.

**REVIEW GATE G3 (soft):** "Here is the lineup and one vehicle page. Left out because the posts don't say:
<list>. Anything to correct before I build the desk?"

**Exit:** no sample vehicle left; every value shown is in the dealer's own post; the contact sheet checked
(or, with no posts yet, inventory recorded as an owner item in the status file).

## Phase 4: The Handle A Sale desk

**Prerequisites:** G1 passed (the theme is the approved site's); G2 and G3 passed or kept going; the G0 facts.

Follow `references/handle-a-sale-desk-sop.md` (the owner's SOP, verbatim: routes, step engine, money,
documents, signing, security, tests, Texas block). Forking the Discount desk means the port is done, but every
step below still names what must be present and how it is checked: work through them in order, building any
step the fork lacks. The SOP's rules hold throughout: structure and logic fixed, no invented facts, filing
refused while a legal fact is missing, no destructive database operations, the client creates their own
Supabase project. Each migration is applied in filename order as its step lands (the owner's list repeats them
at Phase 7). Each step is done when its SOP tests are green and its check passes.

**4.1 Fork, facts and config.** SOP: FACTS, Porting from the reference repository, The website on paper versus
the desk's own address. The desk copied at Phase 1, the reference dealer's facts out (the Phase 1 grep list)
and this client's in, in `src/lib/dealership-config.ts` only. Add the reference dealer's strings (and the
previous client's licence, address and phone) to the desk's `no-hardcoded-dealer-facts` guard list so they can
never leak. The website printed on documents is the public domain; the desk's origin is only for signing
links: keep them as two values. The fees are not config facts: they stay empty until the owner's first sign-in
(4.3). *Check:* the guard test fails on any surviving fact; `check-fee-module.cjs` on the fork exits 0.

**4.2 Theme.** SOP: The screens, in the client's clothes; `references/design-system.md`, The admin desk wears
the same clothes. The desk matches the site's theme, never a separate dark style: the eight role tokens, the
site's fonts, Title Case headings, the rail and tab bar as the site's black band, documents in black ink.
*Check:* record THEME_ACCENT / THEME_GROUND / THEME_FONT (the walker refuses screenshots until its theme
assertion passes) and 0 contrast failures at 1440 and 390.

**4.3 Team, signers and first sign-in onboarding: one unit.** SOP: First sign-in: onboarding (the complete
specification, items 1-9; build all of it here, before Start A Sale), with Security (the reset) and Fees (Your
Fees). In this order:
1. Where members come from: the access request, the approval (a temporary password, the role, and the default
   signers: Owner, Manager and Registration cleared to sign, every other role not), the reset.
2. The onboarding page, then the redirect to it: the page must exist first (the Vega's port redirected new
   members to a route that did not exist and locked them out).
3. Choose A Password, only on a temporary password, built with **a password reset signs out every device**
   signed in before it (the device cookie, the proxy, the current-admin check, the API guard, the database
   role), because this screen refuses a stale device and signs the member back in.
4. What Is Your Name?: the person's legal first and last name. It is **the person on the paper**: the 130-U
   seller line reads `<Legal Name> (<First Last>)` (the entity alone is now rejected at the county), the
   VTR-61 printed name is the same pairing, and it prints under every dealer line; a name that will not fit at
   the 7.25pt floor, or that the state form's font cannot print, is refused here.
5. Draw Your Signature, once, for members cleared to sign: the saved signature sits on the seller line and
   every dealer line.
6. **Your Fees (Owner only)**: the dealer's fees, set by the owner, never in code; the limits from the
   rulebook through the desk's one legal module (`src/lib/legal/texas-dealer-fees.ts`, the fee migration),
   **refused, never trimmed,** at the screen, the server action and the database. Texas has no combined cap
   (rulebook section 4), so each dealer charge is capped on its own and every paperwork charge, whatever its
   name, is the documentary fee: $225.00 or less (7 TAC §84.205(b)(1), in force since 2024-07-11), more only
   up to a recorded OCCC filing, which counts only once in force. The limits are the same for franchised and
   independent dealers (rulebook section 2.4); the split is by vehicle, and a Ch. 345 vehicle (motorcycle,
   ATV, moped, towable RV, boat) is refused on this desk's paper (Fin. Code §345.251; 7 TAC §86.201, in force
   since 2024-09-05). No free-form dealer fee line exists, and a doc fee is never backed out of a quoted total
   (rulebook section 5.3). "Set These Later" leaves filing refused ("Documentary fee") until the fees are set.
   Later changes: Your Fees settings (`/admin/dealership/fees`, Owner only, one Change per fee, a stale tab
   refused); every change logged and listed with who, when, from and to; the posted notice prints from the
   same page.
7. Done.

*Check:* the SOP's Onboarding, Password reset, VTR-61 and Fees (owner onboarding, owner only) tests; then the
guided end-to-end walk of the whole unit (SOP, onboarding item 9) at 1440 and 390: `fresh-temporary-password`,
`fresh` (`FEES_TRY=225.01` and the walk input, then `FEES=later`), `fresh-sales` (`FEES=none`),
`fresh-cannot-sign`, `fresh-reset` (`reset.cjs`), each on a fresh server, 0 page errors, 0 contrast failures.
The walk input is the owner's figure or one the user approved, never invented.

**4.4 Start A Sale and the corridor.** SOP: The architecture, in six rules; Routes; Start A Sale; VIN
decoding; The buyer's ID; The corridor; Funding; The sale plan; Salvage; Bilingual. One record, answers in
named keys, "done" never stored, one question per screen, nothing a formula can produce asked. Start A Sale
keeps a co-buyer typed there on the sale (`step_data.coBuyer`), takes the county from the address lookup
(never from the city alone), and refuses, under a different name, a phone that belongs to the buyer of another
open sale whose paperwork is filed. *Check:* the SOP's Plan, Documents, Guide, Tokens, AAMVA and VIN tests.

**4.5 Money and fees on every sale.** SOP: Money; Fees (the per-deal copy, government fees, the gates, the
notice); rulebook sections 5.3-5.5. New deals only: each sale copies the owner's fees at Start A Sale; an open
sale takes a change only through Apply Today's Fees, and a filed one only after void and file again (4.9).
Each sale's government fees are recorded from webDEALER before its paper files, and the exact notice prints
beside the fee on the bill of sale and in the contract's itemization. *Check:* the SOP's Money and Fees tests;
`check-fee-module.cjs` exits 0.

**4.6 Automatic empty weight (130-U box 11).** SOP: Empty weight (130-U box 11). Built before the documents,
because the 130-U's map names box 11's source. Resolved automatically with its source, on every desk: a title,
MCO or scale figure on the car skips the 130-U question; otherwise a bundled EPA estimate (test weight less
300 lb, matched to the model's own EPA rows, cross-checked against Transport Canada) is offered for one tap,
rounded per TxDMV; pickups and work vans (known by name too), heavy duty, buses, a class nobody recorded, an
unsupported low-confidence estimate and anything within 300 lb of 6,000 lb need a document; with no source at
all the question is asked as before. A failed decode is never stored, an unsourced weight is never filed or
pasted into webDEALER, and filing writes box 11's source into `form_data`. *Check:* the SOP's Empty weight
tests.

**4.7 Documents, page by page.** SOP: Document templates, page by page; The documents; How the paper looks.
Every document the desk files (bill of sale, salvage bill of sale, 130-U, VTR-271, VTR-61, power of attorney,
financing contract, FTC Buyer's Guide, vehicle responsibility, insurance acknowledgment, rebuilt disclosure,
tow-away sheets) is a field map: each box on each page names its one source (dealer facts and fees, the
vehicle, the buyer, the deal's answers). The corridor asks only what the pages leave open, once per sale, as
taps unless the answer is free-form; the review reads the page back; filing refuses a box the sale could fill
and left blank. Port `src/lib/documents/field-maps/*`, `src/lib/sales/deal-facts.ts` and their tests. Built
page by page, never question by question: a desk that asked "what somebody thought to ask" printed blank boxes
on signed legal records (the trade-in's VIN, the first payment date, the licence state, the AS IS box on a
warranty sale) until a title clerk found them. A box's condition (a co-buyer, a trade-in, a lien, an entity
applicant) is a predicate (`field-maps/conditions.ts`) the review, filing and tests all run, never words:
"when there is a co-buyer" in prose once let a co-buyer vanish from the paper, and a business applicant's
130-U print a licence number in the FEIN box. A value the map says is worked out (Total Paid, the lender line)
is probed on the real print path, and a filed copy re-renders from its own stamps. The person from 4.3 prints
here: the filer's pairing and saved signature on the 130-U seller line (recorded on the filed row), the VTR-61
printed name, and every dealer line. *Check:* the SOP's Field maps tests; file one 130-U and print one VTR-61
(from a rebuilt car's title work) as 4.3's walked member and see `<Legal Name> (<First Last>)` with the drawn
signature.

**4.8 Signing.** SOP: Signing (at the desk, the ceremony); After the paperwork. *Check:* the SOP's Tokens
tests; one sale signed through the ceremony to N / N signed.

**4.9 The bill of sale's lock, void and file again.** SOP: The sale plan (Freeze; The filed bill of sale holds
everything it states); Voiding and filing again; Data model (Voiding).
- **The bill of sale locks what it states:** once filed, the price, basis, down payment, funding, trade-in,
  buyer details and every other printed answer are refused in every server action until it is voided and filed
  again.
- **Void and file again:** owners and managers void a filed bill of sale with a reason; every document
  carrying its figures is voided with it, nothing is deleted, old signing links die, the new copies are signed
  again, and a refiled copy keeps the sale's own fees. The void function refuses a stale device (4.3's reset).

*Check:* the SOP's Down-payment freeze, The bill of sale holds everything it states, and Void and file again
tests; `freeze.cjs` and `void.cjs`.

**4.10 Walk the desk end to end.** SOP: Verification; `references/verification.md`, Admin desk. `npx tsc
--noEmit`, `npx eslint`, `npx vitest run`, `next build`; then every walk once at 1440 on the dev server (port
5190): the five SOP sales, `co-buyer`, the three box-11 walks, the ceremony to N / N signed, void, freeze,
reset, and the fees walk, each scenario with its own phone. Fix what fails here, so Phase 5 confirms rather
than discovers.

**Phase 4 exit (the standards; a desk missing one is not done):** first sign-in onboarding (4.3); the person
on the paper and the default signers (4.3, printed at 4.7); dealer fees at owner onboarding with the Texas
limits enforced at save and at filing (4.3, 4.5); automatic empty weight (4.6); document templates, page by
page (4.7); the bill of sale's lock (4.9); void and file again (4.9); a password reset signs out every device
(4.3).

**Deliverables:** desk screenshots: sign-in, the owner's first sign-in through Your Fees, Handle A Sale, one
paperwork question and its review.

**REVIEW GATE G4 (soft):** "Here is the desk in <client>'s theme: sign-in, the first sign-in through Your
Fees, Handle A Sale and a paperwork review. Anything to change before I run the full verification?"

## Phase 5: Verify

**Prerequisites:** the Phase 4 exit met.

**Steps:** everything in `references/verification.md`: the site's build and screenshots at 1440/1920/390; the
desk's typecheck, lint, tests and build; the walks at 1440×900 and 390×844 on fresh servers, signed N / N with
zero contrast failures; one packet PDF read back; the onboarding walk (4.3); the fees walk (owner onboarding
through Your Fees, a fee over its limit refused, a removed OCCC filing refused at filing, a sale's government
fees recorded, the sale and its paper carrying the saved fee, the notice and the government lines);
`check-fee-module.cjs`. Write the results into the desk's `docs/verification/VERIFICATION.md`.

**Deliverables:** the test, build and walk results (N / N signed, 0 contrast failures, at 1440 and 390), a few
walk shots, one packet page read back, the fees walk.

**REVIEW GATE G5 (hard):** "The desk is verified: <tests>, <walks>, <packet read back>. Here are the screens
and one packet page. May I go on to the demo video?"

**Exit:** every row of `references/verification.md` green, with its evidence in the desk's
`docs/verification/`.

## Phase 6: The demo videos (`recordly-demo`)

**Prerequisites:** G5 passed (the video films the verified site and desk); the G0 kickoff answers; the
`recordly-demo` skill installed alongside this one.

Follow recordly-demo's own gated steps and runbook (`node "$S/scripts/runbook.cjs" next` prints the next step:
A1-A8 and R1-R4 the site film, B0-B11 part B on the desk, N0-N14 the narrated cut). Per client only
`client-inputs.json` changes: the site's facts and framing, part B's decisions and demo data (B0, answered at
G0) and the narration block (N1). The films come from recordly-demo exactly as the approved Discount films,
never a fresh edit. Demo data is fictional and realistic (no "Example" anywhere on screen); identity emails
are blurred; only the dealer's confirmed facts appear, and the paperwork on screen is this dealership's own on
a demo deal. The dealer buys on money and time: a silent showcase is not enough on its own, so the narrated
cut ships too.

**6a. The short cut** (about 80 s, no voice; runbook S0-B11): the site in a macOS window, the Admin click into
the desk, first sign-in (with Your Fees when the user chose the owner path at G0), a sale to N / N signed, the
130-U close-up, the iPhone cut, the facts-only outro, for social and the owner's first look. Only
`client-inputs.json` changes: address, phone, hours, clock, logos and the measured framing. The fee typed on
screen is the owner's figure or one the user approved, labelled as a demo input. The house desk storyboard
predates Your Fees (its onboarding shot ends on Done), so filming the step is a storyboard change agreed with
the user before capture (asked at G0; recordly-demo, Part B). The paperwork screens changed with the
page-by-page templates (the licence state, county, payment count, rate and first payment date are taps; the
review reads back the page): film them from the shipped desk, never from an older storyboard, using the desk's
`docs/verification/paperwork-pages/corridor-changes.md` to see which shots moved. **Deliverables:** the share
MP4 (≤ 28 MB) with its length, running order, gates passed and contact sheet. **REVIEW GATE G6a (soft):**
"Here is the short cut (<length>). Anything to change before I write the narrated script?"

**6b. The narrated script** (runbook N0-N2): the house script
(`recordly-demo/assets/narration/script-template.md`) filled with this client's variables by
`fill-narration.cjs`: the road, the stock, the fees its receipt prints, the legal name as said, the demo
people and deal, and the optional lines (Spanish, sell band, seller lien) from the G0 answers. The wording
stays house (it changes only as a template change). Every line is fact-checked against this client's desk
(never narrate a feature that is not shipped). Your Fees gets the line "set once, used on every sale, and the
desk refuses a fee Texas does not allow" only as a template change behind a flag, once the step is walked on
the client's desk, checked against the shipped code like every other line. **Deliverable:**
`narration/script.md`. **REVIEW GATE G6b (hard):** "Here is the narrated script; every line is checked against
your desk. Approve it as written, or tell me what to change. Nothing is voiced until you approve."

**6c. Voice and the narrated cut** (runbook N3-N14): voiced with the free Kokoro-82M model (the user's pick
was `af_heart`), transcribed back and compared before cutting. **REVIEW GATE G6c (hard):** send `preview.mp3`
and `transcribe-diff.md`: "Here is the voice. Does it sound right, and do you accept the differences listed?"
**REVIEW GATE G6d (hard, recordly-demo's final gate):** send the narrated chat copy with its contact sheet and
lip-to-picture table: "Here is the narrated walkthrough (<length>). Is it ready to show the dealer?"

**Exit:** both MP4s in the chat with their send notes; the demo project's inputs committed to the same PR
(recordly-demo, What to send).

## Phase 7: Deliver and deploy

**Prerequisites:** G5 and G6b passed and the films sent (or the user's words that the videos come later,
recorded in the status file).

**Steps:** commit on the session branch with clear messages, push, and bring the draft PR up to date. Deploy
the public site to Vercel as its own project (`references/verification.md`, Deploy). Don't deploy the desk
until it has its own Supabase project and secrets. List what only the owner can still supply: the Supabase
project, the migrations in filename order, the secrets, the facts still missing, and Your Fees at their first
sign-in.

**Deliverables:** the draft PR link, the live site URL, the owner's list, the status file.

**REVIEW GATE G7 (hard):** "The site is live at <url>, the desk is verified on <PR> with your list of owner
steps, and both films are in the chat. Is anything left before I mark this build done?"

**Done:** the site is live, the desk is verified on a draft PR with the owner's list, and both MP4s are in the
chat, with every fact sourced or listed as missing, and every box of the status file ticked or named as an
owner item.

## Lessons that cut across phases

- Claude cannot log into the user's accounts (ChatGPT, Facebook) and should not ask for passwords: write the
  prompts and ask for the uploads.
- A credential pasted into chat is never used: ask for it in the environment's settings instead, and suggest
  rotating the pasted one.
- Fees are the dealer's, entered at onboarding and capped by law; never hardcode them anywhere (site, desk,
  video): the owner types them in Your Fees, and the limits come from `references/texas-dealer-fees.md`
  through the desk's one legal module.
- Every rule learned late in an earlier build now sits at the step that builds it (first sign-in onboarding,
  the person on the paper and the default signers, the lock, void and file again, the reset, empty weight,
  page-by-page paperwork, the demo videos). Keep it that way (How to run this skill, rule 6).

## Scripts

- `scripts/prepare_image.py`: delivered image → web-ready slot file (resize, trim transparent margins, hero
  phone crop).
- `scripts/crop_collage.py`: Facebook collage → individual inventory photos plus a contact sheet to check.
- `scripts/site_screens.cjs`: desktop and phone screenshots of the public site.
- `scripts/desk-walk/`: `sale.cjs`, `ceremony.cjs`, `pdfs.cjs`, `audit-fn.cjs` and the sale scenarios (the
  five SOP walks plus `co-buyer`, `estimate-confirm`, `title-on-file` and `no-source` for box 11, and
  `bhph-void`): full end-to-end desk walks with the theme assertion and WCAG contrast audit, the signing
  ceremony, and packet PDF download. A scenario's `expect` map names text a screen must show, a scenario with
  a `vin` starts the sale through "Not on the lot?" instead of a lot car, and `"coBuyer"` adds one at Start A
  Sale. Also `onboard.cjs` (first sign-in, Your Fees with `FEES=<walk input>|later|none`), `fees.cjs` (Your
  Fees settings, the per-deal copy, a stale tab, the OCCC filing, the posted notice), `fee-set.cjs` and
  `try-file.cjs` (set the fee with or without a filing; press File and assert the refusal, `APPLY=1` applies
  today's fees), `gov.cjs` (a sale's government fees from webDEALER; `EXPECT_REFUSAL=1` on a server with the
  flag off), `void.cjs` (void the filed bill of sale, `VOID_LANG=es` for the Spanish desk; `bhph-void.json`
  with `RESUME_DEAL` files again), `freeze.cjs` (held screens refuse, EN and ES) and `reset.cjs` (a reset
  signs out old devices). Every script reads `DESK_BASE` (default `http://localhost:5190`) through
  `desk-base.cjs`, which aborts any request to another local port.
- `scripts/check-fee-module.cjs [deskDir]`: diffs the desk's `src/lib/legal/texas-dealer-fees.ts` (and its fee
  migration's caps) against the rulebook's section 5.10 JSON. Run it on every build and every January; it
  exits 1 with each difference. It never supplies a figure: fix the rulebook first (with the citation and
  effective date), then the module.
- `assets/STATUS-template.md`: the status file every build keeps (`clients/<slug>-STATUS.md`).
