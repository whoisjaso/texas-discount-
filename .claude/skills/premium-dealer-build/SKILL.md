---
name: premium-dealer-build
description: End-to-end playbook for onboarding a new car dealership client: research the dealer's real facts, build a Porsche-grade public website (fixed hero photo, black-and-white marque design, Title Case, real inventory), write the ChatGPT image-generation brief for the team and place the returned images, and port the Handle A Sale admin sale desk (Next.js + Supabase, Texas paperwork, e-signing) in the same theme, then verify and deploy. Use this whenever the user onboards a dealership or auto business, asks to "do what we did for Vega's" or Triple J, wants a luxury dealer site, a sale desk / admin dashboard for a dealer, image prompts for a dealer site, or to load a dealer's Facebook inventory, even if they only name one of those parts.
---

# Premium dealer build

This is the repeatable version of the Vega's Auto Sales & Glass Co. build
(`clients/vegas-auto-sales` = public site, `clients/vegas-desk` = sale desk,
PR whoisjaso/xlnc-perception#2). A new client gets the same three things:

1. **A public website** that feels like porsche.com/usa: one fixed hero photo,
   black and white with the client's logo as the only colour, one narrow
   grotesk in Title Case, rounded photo tiles, quiet motion, real inventory.
2. **The Handle A Sale desk**: the owner's SOP, ported with its logic
   unchanged, wearing the site's clothes.
3. **An image brief** the team runs in ChatGPT, with Claude placing every
   returned image and tracking what's left.

Two rules outrank everything, because the dealership's name goes on legal
paper and its customers drive to the address on the site:

- **Never invent a fact.** No legal name, licence, county, fee, year, price,
  mileage, review or claim that isn't sourced. Missing facts stay `null`,
  print `[Not set: …]`, and are listed in every report. See
  `references/facts-research.md`.
- **Never pass off a generated image as the dealer's.** Generated pictures
  are brand and mood only (no badges, no plates). Vehicles for sale, the lot,
  staff and customers are real photos. See `references/image-brief.md`.

## Kicking off a new client

`NEW-CLIENT-PROMPT.md` is the fill-in-the-blanks message the user pastes to
start a new build. When it arrives, follow it: it names this skill and the
facts to collect.

## Start from the last build, not from zero

Copy `clients/vegas-auto-sales` → `clients/<client>-site` and
`clients/vegas-desk` → `clients/<client>-desk`. They are clean, tested and
already free of the reference dealer's facts; every dealer fact lives in one
file (`src/data/business.ts` for the site, `src/lib/dealership-config.ts` for
the desk). Then:

- replace every Vega's fact and asset (grep for `Vega`, `7722`, `941-1622`,
  `P113248`, `Galveston`, `Constantino`) and add those strings to the desk's
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
3. Report: facts found with sources, facts missing (doc fee, signer, domain
   always), the hero concept, the stack plan. Wait for "go". If the user says
   "I don't know those, go", proceed with nulls and markers.

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

### Phase 5: Verify
Everything in `references/verification.md`: builds, tests, site screenshots at
1440/1920/390, five desk walks at two sizes signed N/N with zero contrast
failures, one packet PDF read back.

### Phase 6: Deliver and deploy
Commit on the session branch with clear messages, push, open or update the PR
(draft), send screenshots, and deploy the public site to Vercel as its own
project (`references/verification.md`, Deploy). List what only the owner can
still supply. Don't deploy the desk until it has its own Supabase project and
secrets.

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

## Scripts

- `scripts/prepare_image.py`: delivered image → web-ready slot file (resize,
  trim transparent margins, hero phone crop).
- `scripts/crop_collage.py`: Facebook collage → individual inventory photos
  plus a contact sheet to check.
- `scripts/site_screens.cjs`: desktop and phone screenshots of the public site.
- `scripts/desk-walk/`: `sale.cjs`, `ceremony.cjs`, `pdfs.cjs`, `audit-fn.cjs`
  and five sale scenarios: full end-to-end desk walks with the theme assertion
  and WCAG contrast audit, the signing ceremony, and packet PDF download.
