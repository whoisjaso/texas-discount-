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
  1440×900 and 390×844 with `scripts/desk-walk/`:
  `node sale.cjs <out> scenarios/<name>.json <w> <h>` then
  `node ceremony.cjs <out>-cer "$(cat <out>/deal.txt)" <w> <h>`.
  Set THEME_ACCENT / THEME_GROUND / THEME_FONT to the client's computed values:
  the walker refuses to trust screenshots until the theme assertion passes.
  Every walk must end `N / N signed` with `CONTRAST FAILURES 0`.
- Pull one packet with `node pdfs.cjs <out> <deal>` and read it (PyMuPDF): the
  legal name, licence, county present, the lienholder right for the funding
  type, the odometer identical across documents, no dev host, no `[Not set]`
  except for facts genuinely still missing.
- Write the results into the desk's `docs/verification/VERIFICATION.md`.

## Deploy

The public site is a static Vite build: deploy `clients/<client>-site` as its own
Vercel project (framework Vite, output `dist`, the SPA rewrite in
`vercel.json`). Once the desk is live, set `VITE_DESK_URL` on the
site's Vercel project and redeploy so the menu shows the Admin link. The desk needs its own Supabase project, the migration applied
and its secrets set before it is deployed; until then say so rather than
shipping a desk that errors on every screen.
