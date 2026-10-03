# {{CLIENT}}: build status

<!--
  Copied from premium-dealer-build/assets/STATUS-template.md at kickoff to clients/{{SLUG}}-STATUS.md.
  Update it at every review gate: tick the box, write the date, link the deliverables, quote the user's
  words, then commit it with the phase's work and push the session branch. Never tick a box whose exit
  criteria were not checked. A soft gate passed on "keep going" says so. Replace every {{...}}.
-->

| | |
|---|---|
| Client | {{CLIENT}} (`{{SLUG}}`) |
| Folders | `clients/{{SLUG}}-site`, `clients/{{SLUG}}-desk`, `clients/{{SLUG}}-demo` |
| Branch / draft PR | `{{BRANCH}}` / {{PR_LINK}} |
| Started | {{YYYY-MM-DD}} |
| Last updated | {{YYYY-MM-DD}}, at gate {{GATE}} |
| Now working on | {{PHASE / STEP}} |
| Waiting on the user for | {{GATE QUESTION, or "nothing"}} |

How to read this: the phases run in order, 0 to 7. Each ends at a review gate. **Hard** gates always wait for
your go; **soft** gates wait too unless you said "keep going", and then the line says so. `[x]` done and
checked, `[ ]` not yet, `[~]` started, `[!]` blocked (the reason is on the line).

## Phases and gates

### Phase 0: Intake and research
- [ ] Kickoff message received (logo, TxDMV screenshot, collages)
- [ ] Facts researched with sources (table below); facts only the owner can give listed
- [ ] Fee rulebook as-of date checked; `check-fee-module.cjs` exit 0 on the desk to fork
- [ ] Video kickoff answers: onboarding to film, demo fee and its source, desk address in the address bar,
      seller lien (BHPH), Spanish, sell band
- [ ] **G0 (hard): the Phase 0 report** · sent {{date}} · go {{date}}: "{{user's words}}" · {{link}}

### Phase 1: Brand and public site
- [ ] Site forked from the newest build; reference dealer's facts and assets replaced
- [ ] Design system with the client's logo; fixed hero; headline in the left gutter; Title Case; fonts
      self-hosted; Admin link in the menu
- [ ] Build clean; screenshots at 1440, 1920 and 390 looked at
- [ ] **G1 (hard): site screenshots** · sent {{date}} · go {{date}}: "{{user's words}}" · {{links}}
- [ ] Draft PR opened: {{PR_LINK}}

### Phase 2: The image brief
- [ ] Brief published as a shared doc: {{doc link}}
- [ ] **G2 (soft): the brief's link** · sent {{date}} · {{go / passed on "keep going"}}
- [ ] Images placed: {{n}} of {{N}} slots (each with its screenshot; generated stand-ins flagged)

### Phase 3: Real inventory
- [ ] Collages cropped, contact sheet checked; only stated values filled; sample list deleted
- [ ] **G3 (soft): the lineup and a vehicle page** · sent {{date}} · {{go / passed on "keep going"}}

### Phase 4: The Handle A Sale desk
- [ ] 4.1 Fork, facts and config (guard list; website vs desk origin; fee module check)
- [ ] 4.2 Theme (theme assertion values: accent {{}}, ground {{}}, font {{}})
- [ ] 4.3 Team, signers and first sign-in onboarding, one unit: approval and reset, Choose A Password with
      the reset sign-out, the name, the signature, Your Fees (Owner only, Texas limits), Done; the
      onboarding walk at 1440 and 390
- [ ] 4.4 Start A Sale and the corridor (co-buyer kept; county from the address lookup)
- [ ] 4.5 Money and fees on every sale (per-deal copy, government fees, the notice)
- [ ] 4.6 Automatic empty weight (box 11 with its source)
- [ ] 4.7 Documents, page by page (field maps, taps, read-back, filing refuses a fillable blank; the person
      on the 130-U and VTR-61)
- [ ] 4.8 Signing (ceremony to N / N signed)
- [ ] 4.9 The bill of sale's lock; void and file again
- [ ] 4.10 Every walk once at 1440; typecheck, lint, tests, build
- [ ] Phase 4 exit: every standard present with its tests
- [ ] **G4 (soft): the desk's screens** · sent {{date}} · {{go / passed on "keep going"}} · {{links}}

### Phase 5: Verify
- [ ] Site build and screenshots; desk tsc / eslint / vitest ({{files}} files, {{tests}} tests) / next build
- [ ] Walks at 1440×900 and 390×844: N / N signed, 0 contrast failures, 0 page errors
- [ ] One packet read back; the onboarding walk; the fees walk; `check-fee-module.cjs`
- [ ] `docs/verification/VERIFICATION.md` written
- [ ] **G5 (hard): the verification evidence** · sent {{date}} · go {{date}}: "{{user's words}}"

### Phase 6: The demo videos (recordly-demo)
- [ ] 6a Short cut rendered and verified ({{length}}; gates {{passed}}); runbook S0-B11
- [ ] **G6a (soft): the short cut** · sent {{date}} · {{go / passed on "keep going"}}
- [ ] 6b Script filled and fact-checked on the desk (corridor commit {{sha}}, walk report {{path}})
- [ ] **G6b (hard): script approval** · sent {{date}} · approved {{date}}: "{{user's words}}"
- [ ] 6c Voiced (Kokoro af_heart) and transcribed back
- [ ] **G6c (hard): voice preview** · sent {{date}} · approved {{date}}: "{{user's words}}"
- [ ] 6c Narrated cut rendered, verified and sent ({{length}})
- [ ] **G6d (hard): the narrated film** · sent {{date}} · accepted {{date}}: "{{user's words}}"
- [ ] Demo project inputs committed (never `public/shots/` or `out/`)

### Phase 7: Deliver and deploy
- [ ] Draft PR up to date: {{PR_LINK}}
- [ ] Public site deployed to Vercel: {{URL}}
- [ ] Desk deployed (only with its own Supabase project and secrets): {{URL or "waiting on the owner"}}
- [ ] Owner's list sent
- [ ] **G7 (hard): final delivery** · sent {{date}} · accepted {{date}}: "{{user's words}}"

## Facts (sourced or missing)

| Fact | Value | Source |
|---|---|---|
| Legal name | {{}} | {{}} |
| Display name | {{}} | {{}} |
| Dealer licence (GDN) | {{}} | {{}} |
| County | {{}} | {{}} |
| Address | {{}} | {{}} |
| Phone | {{}} | {{}} |
| Hours | {{}} | {{}} |
| Website domain | {{}} | {{}} |
| Languages | {{}} | {{}} |
| Authorised signer | {{}} | {{}} |

## Open owner items

Only the owner can supply these; each stays open (and its marker prints) until it is given.

- [ ] Documentary fee (Your Fees at the owner's first sign-in; above $225.00 only with an OCCC filing)
- [ ] Late-handling fee (`NEXT_PUBLIC_DEALER_LATE_HANDLING_FEE`)
- [ ] Supabase project; migrations applied in filename order; secrets set
- [ ] {{other missing facts}}

## Decisions recorded

| Date | Decision | Who | Where it was said |
|---|---|---|---|
| {{}} | {{}} | {{}} | {{}} |

## Deliverables index

| Gate | What | Where |
|---|---|---|
| {{}} | {{}} | {{}} |
