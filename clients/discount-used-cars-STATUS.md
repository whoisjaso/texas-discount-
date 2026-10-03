# Discount Used Cars and Trucks: build status

<!--
  Made from premium-dealer-build/assets/STATUS-template.md on 2026-10-03, after the build. This build ran before
  the gated process existed, so its gates are recorded as they happened, with the dates and commits the record
  shows; where the user's exact words were not kept in the repository, the line says so instead of quoting.
  From now on, update it at every gate and commit it with the work.
-->

| | |
|---|---|
| Client | Discount Used Cars and Trucks (`discount-used-cars`) |
| Folders | `clients/discount-used-cars-site`, `clients/discount-used-cars-desk`, `clients/discount-used-cars-demo` |
| Branch / draft PR | `claude/discount-used-cars-build` / https://github.com/whoisjaso/texas-discount-/pull/1 (draft, open) |
| Started | 2026-10-01 (`7121d43`, forked from the Vega's build) |
| Last updated | 2026-10-03, after the paperwork page-by-page fix round |
| Now working on | The skills (the gated process); the desk's code is unchanged by it |
| Waiting on the user for | G5's go on the paperwork round's evidence; then G7 (deploy) |

How to read this: the phases run in order, 0 to 7. Each ends at a review gate. **Hard** gates always wait for
your go; **soft** gates wait too unless you said "keep going". `[x]` done and checked, `[ ]` not yet, `[~]`
started, `[!]` blocked (the reason is on the line).

## Phases and gates

### Phase 0: Intake and research
- [x] Kickoff message received (logo, TxDMV record, the owner's billboard artwork and texts)
- [x] Facts researched with sources (table below); facts only the owner can give listed (Open owner items)
- [x] Fee rulebook (`references/texas-dealer-fees.md`, read 2026-10-03); `check-fee-module.cjs` exit 0
- [~] Video kickoff answers: the owner's onboarding was filmed (ending on Done, before Your Fees existed); the
      voice is `af_heart`, the user's pick. Not asked yet under the new process: owner or salesperson path for
      the next capture, the demo fee figure for Your Fees on screen
- [x] **G0 (hard): the Phase 0 report** · sent and go 2026-10-01 (the user's words were not kept in the repo)

### Phase 1: Brand and public site
- [x] Site forked from the Vega's build and re-branded (`9d8ad49`); the owner's hours and domain from the
      billboard artwork (`ae7dc1a`)
- [x] Design system with the logo; fixed hero; headline in the left gutter; Title Case; fonts self-hosted;
      Admin link in the menu (shows once `VITE_DESK_URL` is set)
- [x] Build clean; screenshots at desktop and phone sizes
- [x] **G1 (hard): site screenshots** · 2026-10-01; the user's changes (hours, domain, the Visit card image)
      applied the same day
- [x] Draft PR opened: https://github.com/whoisjaso/texas-discount-/pull/1

### Phase 2: The image brief
- [x] Brief published as a shared doc: https://claude.ai/code/artifact/c0d9d2fc-1a4d-469f-b04f-9cc5632937f2
      (linked from `clients/discount-used-cars-site/PHOTOS.md`)
- [x] **G2 (soft): the brief's link** · 2026-10-01 (`f7375ef`)
- [x] Images placed: all 15 brief slots, plus the hero's phone crop (`1dabec8` to `a7fe9d6`, 2026-10-01). The
      Visit card is a mood picture of the area, never the lot, at the owner's request (10/01/2026)

### Phase 3: Real inventory
- [!] Blocked on the owner: no current inventory is listed anywhere online (10/01/2026), so
      `src/data/inventory.ts` is empty and the site says so plainly instead of showing sample cars
- [ ] **G3 (soft): the lineup and a vehicle page** · when the owner's photos or collages arrive

### Phase 4: The Handle A Sale desk
- [x] 4.1 Fork, facts and config: every fact in `src/lib/dealership-config.ts`; the guard test lists the
      earlier dealers' facts; the public website and the desk's own address are two values
- [x] 4.2 Theme: the site's clothes; walk theme assertion and 0 contrast failures at both sizes
- [x] 4.3 Team, signers and first sign-in onboarding: approval and reset with a temporary password, Choose A
      Password with the reset sign-out, the name, the signature, Your Fees (Owner only, Texas limits), Done;
      Owner, Manager and Registration cleared to sign by default (owner's decisions 10/01 and 10/02/2026)
- [x] 4.4 Start A Sale and the corridor: the co-buyer kept on the sale; the county from the address lookup
- [x] 4.5 Money and fees on every sale: the per-deal copy, webDEALER's government fees, the notice beside the fee
- [x] 4.6 Automatic empty weight (box 11 with its source)
- [x] 4.7 Documents, page by page: field maps, taps, read-back, filing refuses a fillable blank; the person
      on the 130-U and VTR-61
- [x] 4.8 Signing: the ceremony to N / N signed
- [x] 4.9 The bill of sale's lock; void and file again
- [x] 4.10 Every walk; typecheck, lint, tests, build
- [x] Phase 4 exit: every standard present with its tests
- [x] **G4 (soft): the desk's screens** · sent with each round, 2026-10-01 to 2026-10-03

### Phase 5: Verify
- [x] Site build and screenshots; desk `tsc` 0 errors, `eslint` 0 errors (4 old warnings), `vitest` 268 files /
      2,936 tests passed, `next build` compiled (2026-10-03)
- [x] Walks at 1440×900 and 390×844 on port 5190: estimate-confirm, cash-otd, cash-balance, bhph-trade, bank,
      buyer-files and co-buyer to the packet N / N signed; bhph void and file again 3 / 3; 0 page errors, 0
      contrast failures
- [x] Packets read back (70 filed copies against every map row: 0 missing, 0 differing); the onboarding and
      fees walks (fees round, 2026-10-03); `check-fee-module.cjs`
- [x] `clients/discount-used-cars-desk/docs/verification/VERIFICATION.md` §00000000 written
- [~] **G5 (hard): the verification evidence** · ready 2026-10-03 · waiting for your go on this round

### Phase 6: The demo videos (recordly-demo)
- [x] 6a Short cut: `out/discount-demo.mp4`, 82.5 s, parts A and B (`c48995a`, 2026-10-02)
- [x] **G6a (soft): the short cut** · 2026-10-02 (the approved house film)
- [x] 6b Script checked against the desk: `narration/script-v1.md`, 24 lines (`1607cfd`, 2026-10-02)
- [x] **G6b (hard): script approval** · 2026-10-02 (approved before voicing; the words were not kept in the repo)
- [x] 6c Voiced with Kokoro-82M `af_heart` at 0.95 and transcribed back word-perfect (`ae4288a`)
- [x] **G6c (hard): voice preview** · 2026-10-02 (the approved voice-over, `narration/README.md`)
- [x] 6c Narrated cut: `out/discount-demo-narrated.mp4`, 3:50 (`18bfad4`, 2026-10-03)
- [~] **G6d (hard): the narrated film** · sent 2026-10-03 · the user's yes is not recorded in the repo
- [x] Demo project inputs committed (never `public/shots/` or `out/`)
- [ ] Re-capture before the next render: the films' desk shots predate the paperwork pages (last captured on
      `2b7bb85`); recordly-demo's B3/N8 preflight names the shots that moved (`corridor-changes.md`). Re-check
      narration lines 14-18 on the current desk and record `checked.commit` and the walk's `walk-report.json`
- [ ] Your Fees on film: the house storyboard ends onboarding on Done; filming the fees step is a storyboard
      change to agree with the user first (owner path, a demo fee figure from the owner or the user)

### Phase 7: Deliver and deploy
- [~] Draft PR up to date: https://github.com/whoisjaso/texas-discount-/pull/1 (this round's work is not yet
      committed)
- [ ] Public site deployed to Vercel and `discountusedcarsandtrucks.com` pointed at it (not recorded as done)
- [ ] Desk deployed: waiting on the owner (its own Supabase project, migrations, secrets)
- [ ] Owner's list sent with the final delivery
- [ ] **G7 (hard): final delivery**

## Facts (sourced or missing)

| Fact | Value | Source |
|---|---|---|
| Legal name | Discount Used Cars And Trucks, LLC | TxDMV GDN list (current 10/01/2026); Texas SOS file 0802832466 |
| Display name | Discount Used Cars and Trucks | TxDMV (DBA on GDN P145000); Google listing |
| Dealer licence (GDN) | P145000 (active, expires 09/30/2027) | TxDMV |
| County | Harris | TxDMV |
| Address | 8108 Gulf Fwy, Houston, TX 77017 | TxDMV, Comptroller, Google listing |
| Phone | (713) 900-5050 | Owner (billboard artwork and texts, 10/01/2026) |
| Hours | Tue–Sat 10 AM–7 PM; Sun and Mon closed | Owner (billboard artwork, 10/01/2026) |
| Website domain | www.discountusedcarsandtrucks.com | Owner (billboard artwork, 10/01/2026) |
| Time zone | America/Chicago | Houston |
| Languages | English and Spanish | "Se Habla Español" on the dealer's sign; pending the owner's confirmation |
| Signers | Each cleared member's own onboarded name, `Discount Used Cars And Trucks, LLC (First Last)` | Owner's decision 10/01/2026 |

## Open owner items

- [ ] Documentary fee: Your Fees at the owner's first sign-in (above $225.00 only with an OCCC filing); until
      then filing refuses ("Documentary fee") with the demo flag off, and the paper prints its marker
- [ ] Late-handling fee (`NEXT_PUBLIC_DEALER_LATE_HANDLING_FEE`): the Vehicle Responsibility sheet prints
      `[Not set: late-handling fee]` until given
- [ ] A Supabase project of their own; the four migrations applied in filename order; the secrets (Supabase
      URL and keys, `ADMIN_SESSION_SECRET`, `INTERNAL_RENDER_TOKEN`, SMS credentials once a provider is chosen)
- [ ] The desk's own address (`NEXT_PUBLIC_SITE_URL`, a host other than the public website)
- [ ] The dealer's email and the sender mailboxes (`RESEND_FROM_EMAIL`, `SUPPORT_FROM_EMAIL`)
- [ ] The current lot: photos, collages or a DMS export (Phase 3)
- [ ] Confirm Spanish; counsel's review of the Spanish documents before go-live
- [ ] Left off the site until confirmed: a number customers can text, payment methods, financing specifics,
      the 30-day warranty
- [ ] `VITE_LEADS_ENDPOINT`, `VITE_DESK_URL` once the desk is live, and the domain pointed at Vercel
- [ ] Renew the GDN before 09/30/2027

## Decisions recorded

| Date | Decision | Who | Where it is written |
|---|---|---|---|
| 2026-10-01 | Phone, hours and website from the billboard artwork | Owner | Site README; desk README |
| 2026-10-01 | An enhanced area image on the Visit card, never the lot | Owner | `PHOTOS.md` |
| 2026-10-01 | Temporary password replaced at onboarding; the VTR-61 printed name; Owner, Manager and Registration cleared to sign by default; the down-payment freeze | Owner | SOP; VERIFICATION.md §00 |
| 2026-10-02 | The filed bill of sale holds what it states; void and file again; a reset signs out every device | Owner | SOP; VERIFICATION.md §0000 |
| 2026-10-02 | The voice: Kokoro-82M `af_heart` | User | `narration/README.md` |
| 2026-10-03 | The dealer's own fees set at owner onboarding, held to Texas law | User | SOP "Fees"; desk README |
| 2026-10-03 | Paperwork filled page by page; the trade-in's VIN asked right after the trade-in | User | SOP; VERIFICATION.md §00000000 |
| 2026-10-03 | The skills follow a phase-gated process with review gates and this status file | User | premium-dealer-build `SKILL.md` |

## Deliverables index

| Gate | What | Where |
|---|---|---|
| G1 | Site screenshots | `clients/discount-used-cars-site` (README, facts table) |
| G2 | The image brief | https://claude.ai/code/artifact/c0d9d2fc-1a4d-469f-b04f-9cc5632937f2 |
| G4, G5 | Desk walks, packets, verification | `clients/discount-used-cars-desk/docs/verification/` (VERIFICATION.md, `paperwork-pages-fix/`) |
| G6a | The short cut | `clients/discount-used-cars-demo/out/discount-demo.mp4` (82.5 s; share copy beside it) |
| G6b, G6c | Script and voice | `clients/discount-used-cars-demo/narration/` (`script-v1.md`, `narration-preview.mp3`) |
| G6c | The narrated cut | `clients/discount-used-cars-demo/out/discount-demo-narrated.mp4` (3:50) |
| G7 | Draft PR | https://github.com/whoisjaso/texas-discount-/pull/1 |
