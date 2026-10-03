# Verification before "done"

Nothing is reported as done without evidence the user can see. Run the checks,
look at the screenshots yourself, then send the user a few of them.

## Public site

- `npm run build` (tsc + vite) clean.
- `vite preview --port 5181`, then `PWPATH=$(npm root -g)/playwright node
  scripts/site_screens.cjs <out> http://localhost:5181` (set INTRO_KEY to the
  Loader's SEEN_KEY). Look at every desktop and phone shot: headline never
  crossing the hero subject (check 1440 AND 1920 wide), no text on busy
  photo areas, cards not collapsed, fonts actually the grotesk (not Arial),
  Title Case applied, no drawn stand-in left where a photo was delivered.
- For one section use an element screenshot (`locator.screenshot`) after
  forcing `.reveal` visible; otherwise shots catch fades mid-way.

## Admin desk

- `npx tsc --noEmit`, `npx eslint`, `npx vitest run` (all green; the guard test
  must fail if any previous client's fact survives, so add the previous
  client's licence, address and phone to its forbidden list when forking).
- `next build`.
- Dev server on 5190 with `DESK_ALLOW_UNSET_FACTS=true` (production builds need
  Supabase; the in-memory preview mock is dev only), then the five walks at
  1440×900 and 390×844 with `scripts/desk-walk/`. On another port, start the
  server with `PORT` and `NEXT_PUBLIC_SITE_URL` set to it and run every walk
  with `DESK_BASE` pointing at it (signing and QR links follow
  `NEXT_PUBLIC_SITE_URL`; the walks refuse any other local port):
  `node sale.cjs <out> scenarios/<name>.json <w> <h>` then
  `node ceremony.cjs <out>-cer "$(cat <out>/deal.txt)" <w> <h>`.
  Set THEME_ACCENT / THEME_GROUND / THEME_FONT to the client's computed values:
  the walker refuses to trust screenshots until the theme assertion passes.
  Every walk must end `N / N signed` with `CONTRAST FAILURES 0`.
- Pull one packet with `node pdfs.cjs <out> <deal>` and read it (PyMuPDF): the
  legal name, licence, county present, the lienholder right for the funding
  type, the odometer identical across documents, no dev host, no `[Not set]`
  except for facts genuinely still missing.
- `node scripts/check-fee-module.cjs <desk dir>` (from the skill): the desk's
  legal fee module and its migration's caps equal the rulebook's section
  5.10. A difference stops the build until the rulebook and then the module
  are corrected.
- The fees walk (SOP, Verification, Fees; A to F), at both sizes, on a
  fresh server per size (the preview mock keeps what onboarding saved for
  the server's life). Every server needs `ADMIN_SESSION_SECRET` and
  `INTERNAL_RENDER_TOKEN` (any long random local values) and `CHROME_PATH`
  for the PDF renderer, passed on the command line, never written to a file:
  - start the server as `DESK_PREVIEW_MEMBER=fresh` (its own process group,
    stopped by its PGID) and run
    `FEES=<walk input> FEES_TRY=225.01 node onboard.cjs <out> <w> <h> <First> <Last>`:
    $225.01 refused in English and Spanish, the walk input saved, the
    review reading "$X of $225.00 allowed", Done to Handle A Sale. The walk
    input is the owner's figure or one the user approved, never invented;
  - `STOP_AT=document:billOfSale node sale.cjs ...` for an open sale, then
    `FEE_NOW=... FEE_CHANGE=... FEE_OVER=... node fees.cjs <out> <w> <h> <deal path>`
    (settings, history, the open sale keeping its fee until Apply Today's
    Fees, a stale tab refused, the OCCC filing, the posted notice). Make the
    open sale one of the run's own scenarios (cash-balance, say) and finish
    it afterwards with `RESUME_DEAL=<deal path>`: a separate open sale on a
    car another scenario sells is two open sales on one car, which the
    database refuses and the mock does not;
  - the removed filing: `FEE=<over 225> FILING=1 FILED_ON=... EFFECTIVE_ON=...
    node fee-set.cjs <out> <w> <h>` (both dates on or before today), open a
    sale with `STOP_AT`, `FEE=<225 or less> FILING=0 node fee-set.cjs ...`,
    then `APPLY=1 node try-file.cjs <out> <w> <h> <deal path> billOfSale
    "without an OCCC filing in force"`: refused, the sale page offers
    today's fees, files once applied;
  - void a filed cash sale (`void.cjs`) after the fee changed and file it
    again (`RESUME_DEAL`): the new copy keeps the sale's own fee;
  - the government fees: open a buy here pay here sale with `STOP_AT`, then
    `GOV_COUNTY=... GOV_TITLE=33 GOV_REGISTRATION=... GOV_INSPECTION=7.50
    TRY_TITLE=28 node gov.cjs <out> <w> <h> <deal path>` (figures from a
    real webDEALER receipt, or the rulebook's worked example 2.2, said so):
    the wrong county's title fee refused, the save going back to a review
    that shows the inspection and plate lines, with 0 page errors (a blank
    review with "removeChild" in the console is the revalidate-and-navigate
    race; the save must only navigate). Then, on a server with the flag
    OFF and `NEXT_PUBLIC_SITE_URL` set to it, `EXPECT_REFUSAL=1 node gov.cjs
    ...` on an open sale: filing refused until they are recorded, its link
    opening the screen;
  - file a cash sale, a buy here pay here sale and a Spanish sale to
    `N / N signed` and read the paper back: the doc fee is the saved one,
    the notice is the statute word for word directly under it on the bill of
    sale and under item 3 of the contract's itemization (clause 16 repeats
    it), Spanish beside it only on the Spanish deal, the inspection and
    plate fees on lines of their own once recorded, the contract's amount
    financed equal to the bill of sale's balance, and the page count equal
    to the same copy without the notice stamp, or the growth reported;
  - restart as `DESK_PREVIEW_MEMBER=fresh-sales` and run
    `PREVIEW_ADMIN=sales:<email> FEES=none node onboard.cjs ...`: no fees
    step, `/admin/dealership/fees` refused, and Your Fees absent from the
    sidebar and the phone's More sheet (the owner's lists it);
  - compress the screenshots before committing them (PIL: at most 1600 px
    wide, 128 colours) and keep signing links out of the evidence.
- Write the results into the desk's `docs/verification/VERIFICATION.md`.

## Deploy

The public site is a static Vite build: deploy `clients/<client>-site` as its own
Vercel project (framework Vite, output `dist`, the SPA rewrite in
`vercel.json`). Once the desk is live, set `VITE_DESK_URL` on the
site's Vercel project and redeploy so the menu shows the Admin link. The desk needs its own Supabase project, the migration applied
and its secrets set before it is deployed; until then say so rather than
shipping a desk that errors on every screen.
