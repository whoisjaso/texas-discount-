---
name: premium-dealer-build
description: >-
  End-to-end playbook for onboarding a new car dealership client: research the dealer's real facts,
  build a Porsche-grade public website (fixed hero photo, black-and-white marque design, Title Case,
  real inventory), write the ChatGPT image-generation brief for the team and place the returned
  images, and port the Handle A Sale admin sale desk (Next.js + Supabase, Texas paperwork, e-signing,
  the dealer's own fees set by the owner at first sign-in and capped by Texas law) in the same theme,
  verify and deploy, then make the house demo video (short showcase cut plus the narrated
  walkthrough, via the recordly-demo skill). Use this whenever the user onboards a dealership or auto
  business, asks to "do what we did for Vega's" or Triple J, wants a luxury dealer site, a sale desk /
  admin dashboard for a dealer, a dealer's doc fee or Texas fee limits, image prompts for a dealer
  site, a demo video for a dealer, or to load a dealer's Facebook inventory, even if they only name
  one of those parts.
---

# Premium dealer build

This is the repeatable version of the Vega's Auto Sales & Glass Co. build
(`clients/vegas-auto-sales` = public site, `clients/vegas-desk` = sale desk,
PR whoisjaso/xlnc-perception#2), brought up to date by the Discount Used Cars
and Trucks build (`clients/discount-used-cars-site`, `-desk`, `-demo`,
whoisjaso/texas-discount- PR #1), which is now the reference. A new client gets
the same four things:

1. **A public website** that feels like porsche.com/usa: one fixed hero photo,
   black and white with the client's logo as the only colour, one narrow
   grotesk in Title Case, rounded photo tiles, quiet motion, real inventory.
2. **The Handle A Sale desk**: the owner's SOP, ported with its logic
   unchanged, wearing the site's clothes.
3. **An image brief** the team runs in ChatGPT, with Claude placing every
   returned image and tracking what's left.
4. **A demo video** made with the `recordly-demo` skill: the short
   Recordly-style showcase (site, then the desk, then the iPhone cut) and the
   narrated walkthrough that sells the desk to the dealer in money made and
   time saved. Every claim in the narration is checked against the desk.

Two rules outrank everything, because the dealership's name goes on legal
paper and its customers drive to the address on the site:

- **Never invent a fact.** No legal name, licence, county, fee, year, price,
  mileage, review or claim that isn't sourced. Missing facts stay `null`,
  print `[Not set: …]`, and are listed in every report. See
  `references/facts-research.md`.
- **Never pass off a generated image as the dealer's.** Generated pictures
  are brand and mood only (no badges, no plates). Vehicles for sale, the lot,
  staff and customers are real photos. See `references/image-brief.md`.

## The sequence (every client, in this order)

Every client goes through these ten steps in this order. Each step ends with
something sent to the user, who is usually showing it to the dealer: send it
before starting the next step. The phases below say how to do each one.

1. **Kick-off.** The user pastes `NEW-CLIENT-PROMPT.md` with the logo, the
   TxDMV screenshot and any collages. Fork the newest build (Start from the
   last build, below) and add the reference dealer's strings to the desk's
   guard list. The doc fee is optional there: the owner enters the fees
   at first sign-in.
2. **Facts and the fee rulebook (Phase 0).** Research every fact with its
   source, check the rulebook's as-of date and run `check-fee-module.cjs`.
   *Send:* the report (facts with sources, facts missing, the hero concept,
   the stack plan, the rulebook's as-of date, and one question for the
   owner: did they file a documentary fee above $225.00 with the OCCC?
   7 TAC §84.205(b)(1), (c), in force since 2024-07-11). **Stop until the
   user says go.**
3. **The site (Phase 1).** *Send:* desktop and phone screenshots.
4. **The image brief (Phase 2).** *Send:* the shared doc's link for the
   team; then, as images come back, a screenshot of each placed one, and a
   flag on any generated image standing in for something that must be real.
5. **Real inventory (Phase 3).** *Send:* the lineup and a vehicle page, the
   contact sheet, and what was left out because the post did not state it.
6. **The desk (Phase 4).** The reference dealer's facts out, this client's
   in, the site's theme on, every Phase 4 standard present, Your Fees left
   empty for the owner. *Send:* desk screenshots: sign-in, the owner's first
   sign-in through Your Fees, Handle A Sale.
7. **Verify (Phase 5).** *Send:* the test, build and walk results (N / N
   signed, 0 contrast failures, at 1440 and 390), a few walk shots, one
   packet page read back, and the fees walk.
8. **Deliver and deploy (Phase 6).** *Send:* the draft PR link, the live
   site URL, and the owner's list (Supabase project, migrations in filename
   order, secrets, facts still missing, Your Fees at their first sign-in).
9. **The short cut (Phase 7, `recordly-demo`).** The house film, about 80 s,
   no voice, on this client's site and desk. Only `client-inputs.json`
   changes: address, phone, hours, clock, logos and the measured framing.
   *Send:* the share MP4 with its length, running order and gates passed.
10. **The narrated walkthrough (Phase 7, `recordly-demo`).** The house
    script (`recordly-demo/assets/narration/script-template.md`) filled
    with this client's variables by `fill-narration.cjs`: the road, the
    stock, the fees its receipt prints, the legal name as said, the demo
    people and deal, and the optional lines (Spanish, sell band, seller
    lien). The wording stays house. Every line is checked against this
    client's desk, and the paperwork on screen is this dealership's own on
    a demo deal. *Send:* `script.md` first and voice it only after the user
    approves it; then the MP4 with its gates.

**Done:** the site is live, the desk is verified on a draft PR with the
owner's list, and both MP4s are in the chat, with every fact sourced or
listed as missing.

## Kicking off a new client

`NEW-CLIENT-PROMPT.md` is the fill-in-the-blanks message the user pastes to
start a new build. When it arrives, follow it: it names this skill and the
facts to collect.

## Start from the last build, not from zero

Copy the newest build: `clients/discount-used-cars-site` → `clients/<client>-site`
and `clients/discount-used-cars-desk` → `clients/<client>-desk` (repo
whoisjaso/texas-discount-). It carries every desk standard listed under
Phase 4; the older Vega's copies (`clients/vegas-auto-sales`, `clients/vegas-desk`)
do not, so use them only if the Discount build is unavailable, and then port
the Phase 4 standards in. Both are clean, tested and free of the reference
dealer's facts; every dealer fact lives in one file (`src/data/business.ts`
for the site, `src/lib/dealership-config.ts` for the desk). Then:

- replace every reference dealer's fact and asset (Discount: grep for
  `Discount`, `900-5050`, `203-3890`, `P145000`, `8108`, `Gulf Fw`, `Park Place`,
  `discountusedcarsandtrucks`; Vega's: `Vega`, `7722`, `941-1622`, `P113248`,
  `Galveston`, `Constantino`) and add those strings to the desk's
  `no-hardcoded-dealer-facts` guard list so they can never leak into the new
  client;
- rename the Loader SEEN_KEY, the photo files and `package.json` names;
- empty `public/photos/` and the inventory list: the new client starts with
  drawn stand-ins until their own images arrive.

If the client already has a website repository, the desk SOP's Phase 0 applies
as written: find its stack and design system and do not restyle their public
pages without being asked.

## The phases

Work in this order. Each phase ends with something the user can see
(screenshots, a doc link, a PR), because they are usually showing it to the
dealer.

### Phase 0: Intake and research, then report and STOP
1. Collect: dealer name, logo file, city, what they sell (trucks? glass?
   BHPH?), languages, and any links (Facebook, Google).
2. Research facts per `references/facts-research.md`: public listings for
   name/address/phone/hours/reviews; the state licence record for legal name,
   GDN and county (ask the user for a screenshot of the TxDMV dealer search).
3. Report: facts found with sources, facts missing (signer, domain
   always), the hero concept, the stack plan. Wait for "go". If the user says
   "I don't know those, go", proceed with nulls and markers. The documentary
   fee is not a research fact: the owner sets it at first sign-in (Your
   Fees); ask only whether it is above $225.00, which needs an OCCC filing
   (7 TAC §84.205(b)(1), (c), in force since 2024-07-11).
4. Re-check the Texas fee rulebook before every build
   (`references/texas-dealer-fees.md`, section 6.3, and its as-of date), then
   run `node scripts/check-fee-module.cjs <desk dir>` so the desk's legal
   module matches it.

### Phase 1: Brand and public site
Apply the design system (`references/design-system.md`) with the client's
logo: logo assets and favicon/OG from the logo, `business.ts`, the hero
headline in the client's real offer, and Title Case. Build, screenshot desktop
and phone, send the user the shots.

### Phase 2: The image brief
Write the prompts (`references/image-brief.md`): hero first (derive it from
the logo and the stock mix), then the 15-slot list with one house-style line.
Publish it as a shared doc the team can work from (Claude Docs when available)
and tell the user to share it with the team. As images arrive, place each one
(prepare → map slot + focus → screenshot → commit → mark done in the doc).
Flag any generated image standing in for something that must be real.

### Phase 3: Real inventory
From the dealer's Facebook collages and post screenshots
(`references/inventory-intake.md`): crop the cells, fill only what is visible,
leave year/price/miles out when not stated, delete the sample list, add the
thumbnail gallery and cover focus points.

### Phase 4: The Handle A Sale desk
Follow `references/handle-a-sale-desk-sop.md` (the owner's SOP, verbatim:
routes, step engine, money, documents, signing, security, tests, Texas
block). Starting from `clients/vegas-desk` means the port is done; the work is
the config swap, the theme (desk section of the design system), the facts,
and verification. The SOP's rules still hold: structure and logic fixed, no
invented facts, filing refused while a legal fact is missing, no destructive
database operations, the client creates their own Supabase project.

Every desk ships with these standards (each is a section of the SOP, with its
tests; a build missing one is not done):
- **First sign-in onboarding**: Choose A Password when the account is on a
  temporary one, then the legal name, then the signature drawn once (SOP,
  First sign-in: onboarding).
- **The person on the paper**: the 130-U seller line and the VTR-61 printed
  name read `<Legal Name> (<First Last>)` with the onboarded signature;
  Owner, Manager and Registration are cleared to sign by default.
- **The bill of sale locks what it states**: once filed, the price, basis,
  down payment, funding, trade-in, buyer details and every other printed
  answer are refused in every server action until it is voided and filed
  again (SOP, The sale plan: Freeze).
- **Void and file again**: owners and managers void a filed bill of sale
  with a reason; every document carrying its figures is voided with it,
  nothing is deleted, old signing links die, the new copies are signed again
  (SOP, Voiding and filing again).
- **A password reset signs out every device** signed in before it (SOP,
  Security).
- **Automatic empty weight** for 130-U box 11 with its source (SOP, Empty
  weight).
- **Dealer fees at owner onboarding, Texas limits enforced at save and at
  filing** (Your Fees; SOP, Fees; `references/texas-dealer-fees.md`). The
  fees are the dealer's, never code; the limits are the rulebook's, through
  the desk's one legal module:
  - *Onboarding:* the owner sets the documentary fee once (Your Fees, after
    the signature, Owner role only; other roles skip it). Texas has no
    combined cap (rulebook section 4), so each dealer charge is capped on
    its own and every paperwork charge, whatever its name, is the
    documentary fee: $225.00 or less (7 TAC §84.205(b)(1), in force since
    2024-07-11), more only up to a recorded OCCC filing, which counts only
    once in force. The limits are the same for franchised and independent
    dealers (rulebook section 2.4); the split is by vehicle, and a Ch. 345
    vehicle (motorcycle, ATV, moped, towable RV, boat) is refused on this
    desk's paper (Fin. Code §345.251; 7 TAC §86.201, in force since
    2024-09-05). No free-form dealer fee line exists.
  - *Refused, never trimmed,* at the screen, the server action and the
    database.
  - *Settings:* the owner changes a fee later under Your Fees
    (`/admin/dealership/fees`, Owner only, one Change per fee); a stale tab
    is refused.
  - *Audit:* every change is logged and listed with who, when, from and to;
    the posted notice prints from the same page.
  - *New deals only:* each sale keeps the fees it started with; an open
    sale takes a change only through Apply Today's Fees, and a filed one
    only after void and file again.
  - *Per sale:* each sale's government fees are recorded from webDEALER
    before its paper files, and the exact notice prints beside the fee on
    the bill of sale and in the contract's itemization.
Apply the desk's migrations in filename order on the client's project.

### Phase 5: Verify
Everything in `references/verification.md`: builds, tests, site screenshots at
1440/1920/390, five desk walks at two sizes signed N/N with zero contrast
failures, one packet PDF read back, and the fees walk (owner onboarding
through Your Fees, a fee over its limit refused, a removed OCCC filing
refused at filing, a sale's government fees recorded, the sale and its
paper carrying the saved fee, the notice and the government lines).

### Phase 6: Deliver and deploy
Commit on the session branch with clear messages, push, open or update the PR
(draft), send screenshots, and deploy the public site to Vercel as its own
project (`references/verification.md`, Deploy). List what only the owner can
still supply (with the fee migration and Your Fees at their first sign-in).
Don't deploy the desk until it has its own Supabase project and secrets.

### Phase 7: The demo videos
Use the `recordly-demo` skill (install it alongside this one). It makes two
cuts from the verified site and the desk's preview, short first:
- **The short cut** (about 80 s, no voice): the site in a macOS window,
  the Admin click into the desk, first sign-in (Your Fees included), a sale
  to N / N signed, the 130-U close-up, the iPhone cut, the facts-only outro.
  For social and for the owner's first look. The fee typed on screen is the
  owner's figure or one the user approved, labelled as a demo input. The
  house desk storyboard predates Your Fees (its onboarding shot ends on
  Done), so filming the step is a storyboard change: agree it with the user
  before capture (recordly-demo, Part B).
- **The narrated walkthrough** (about 4 min): the whole Handle A Sale corridor,
  unhurried, with a voice that tells the dealer what each step makes them or
  saves them. The script is the house script, already in money-made /
  time-saved terms: fill it with this client's variables
  (recordly-demo `assets/narration/script-template.md` and
  `scripts/fill-narration.cjs`; the wording changes only as a template
  change), fact-check every line against this client's desk before voicing
  it (never narrate a feature that is not shipped), have the user approve
  the script, voice it with the free Kokoro-82M model (the user's pick was
  `af_heart`) and transcribe it back before cutting. Your Fees gets the line
  "set once, used on every sale, and the desk refuses a fee Texas does not
  allow" only as a template change behind a flag, once the step is walked on
  the client's desk, checked against the shipped code like every other line.
Demo data is fictional and realistic (no "Example" anywhere on screen);
identity emails are blurred; only the dealer's confirmed facts appear, and
the paperwork on screen is this dealership's own on a demo deal. Send both
MP4s in chat, then commit the demo projects' inputs (recordly-demo runbook,
step 10) to the same PR.

## Things that went wrong once and shouldn't again

- The user wants a **fixed** hero (one photo every visitor lands on), not a
  rotating carousel.
- Title Case on headings, subtitles, buttons and labels; sentences stay
  sentences.
- The desk must match the site's theme, not keep a separate dark style.
- Claude cannot log into the user's accounts (ChatGPT, Facebook) and should
  not ask for passwords: write the prompts and ask for the uploads.
- Stock photo sites and Google Fonts are blocked in the container: self-host
  fonts, and use the team's generated images or the dealer's real photos.
- A generated "dealership lot" on the Visit page will be recognised as fake
  by the owner: flag it and ask for a real phone photo.
- Collage seams aren't white; crop with an inset and check the contact sheet.
- Headlines over a hero must be pinned to the left gutter so they never cross
  the vehicle on wide screens.
- The 130-U seller line must read `<Legal Name> (<First Last>)`: the entity
  alone is now rejected at the county. The person's name comes from their
  onboarding, and their saved signature sits on the same line.
- The first-login onboarding page (name, then signature) must ship with the
  desk: the Vega's port redirected new members to a route that did not exist.
- The website printed on documents is the public domain; the desk's origin is
  only for signing links. Keep them as two values.
- Empty weight is resolved automatically with its source, on every desk: a
  title, MCO or scale figure on the car skips the 130-U question; otherwise a
  bundled EPA estimate (test weight less 300 lb, matched to the model's own
  EPA rows, cross-checked against Transport Canada) is offered for one tap,
  rounded per TxDMV; pickups and work vans (known by name too), heavy duty,
  buses, a class nobody recorded, an unsupported low-confidence estimate and
  anything within 300 lb of 6,000 lb need a document; with no source at all
  the question is asked as before. A failed decode is never stored, an
  unsourced weight is never filed or pasted into webDEALER, and filing writes
  box 11's source into `form_data` (SOP, Empty weight).
- Demo videos come from the `recordly-demo` skill, exactly as the approved
  Discount film (Phase 7), not from a fresh edit. The dealer buys on money and
  time: a silent showcase is not enough on its own, so the narrated cut ships
  too.
- Fees are the dealer's, entered at onboarding and capped by law; never
  hardcode them. The owner types them in Your Fees; the limits come from
  `references/texas-dealer-fees.md` through the desk's one legal module; a
  doc fee is never backed out of a quoted total (rulebook section 5.3).
- Never generate images for the user's team: write the prompts and hand them
  over; the team runs them and sends the files back.
- A credential pasted into chat is never used: ask for it in the
  environment's settings instead, and suggest rotating the pasted one.

## Scripts

- `scripts/prepare_image.py`: delivered image → web-ready slot file (resize,
  trim transparent margins, hero phone crop).
- `scripts/crop_collage.py`: Facebook collage → individual inventory photos
  plus a contact sheet to check.
- `scripts/site_screens.cjs`: desktop and phone screenshots of the public site.
- `scripts/desk-walk/`: `sale.cjs`, `ceremony.cjs`, `pdfs.cjs`, `audit-fn.cjs`
  and eight sale scenarios (the five SOP walks plus `estimate-confirm`,
  `title-on-file` and `no-source` for box 11): full end-to-end desk walks
  with the theme assertion and WCAG contrast audit, the signing ceremony, and
  packet PDF download. A scenario's `expect` map names text a screen must
  show, and a scenario with a `vin` starts the sale through "Not on the lot?"
  instead of a lot car. Also `onboard.cjs` (first sign-in, Your Fees with
  `FEES=<walk input>|later|none`), `fees.cjs` (Your Fees settings, the
  per-deal copy, a stale tab, the OCCC filing, the posted notice),
  `fee-set.cjs` and `try-file.cjs` (set the fee with or without a filing;
  press File and assert the refusal, `APPLY=1` applies today's fees),
  `gov.cjs` (a sale's government fees from webDEALER; `EXPECT_REFUSAL=1` on
  a server with the flag off), `void.cjs` (void
  the filed bill of sale, `VOID_LANG=es` for the Spanish desk;
  `bhph-void.json` with `RESUME_DEAL` files again), `freeze.cjs` (held
  screens refuse, EN and ES) and `reset.cjs` (a reset signs out old devices).
  Every script reads `DESK_BASE` (default `http://localhost:5190`) through
  `desk-base.cjs`, which aborts any request to another local port.
- `scripts/check-fee-module.cjs [deskDir]`: diffs the desk's
  `src/lib/legal/texas-dealer-fees.ts` (and its fee migration's caps) against
  the rulebook's section 5.10 JSON. Run it on every build and every January;
  it exits 1 with each difference. It never supplies a figure: fix the
  rulebook first (with the citation and effective date), then the module.
