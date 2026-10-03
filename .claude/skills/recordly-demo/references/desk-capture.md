# Capturing the sale desk (part B and the narrated cut)

The desk is the premium-dealer-build Handle A Sale app, the same code for every dealer, run locally as `next dev` with
its preview mock (no Supabase). Everything on it is demo data except the dealership's own facts on the paperwork. This
file is the recipe behind runbook steps B0-B7 and N7-N9; the scripts do each part.

## Contents

1. The decisions first (B0)
2. The server
3. Sessions, members and the onboarding paths
4. The clock and the demo data
5. The storyboard: merge, preflight, the commit stamp
6. Capture order and the off-camera steps
7. Signatures: hold and draw
8. The deal's documents
9. When the desk changes under the video

## 1. The decisions first (B0)

`fill-client.cjs check $I --stage desk` refuses until client-inputs.json has:

- `partB.onboarding`: **the user's answer** to "Film the owner's first sign-in including Your Fees (I type a fee
  figure you give me), or film a salesperson's first sign-in (no fees screen)?". Never chosen for them.
  - `owner-fees`: `partB.demoFee {cents, source: "owner" | "user-approved", note}`; the fee is typed on camera in
    7b-desk-fees and named as a demo input in the project README and the send note, never on screen.
  - `sales`: a salesperson cleared to sign (`DESK_PREVIEW_MEMBER=fresh-sales`, cookie `sales:sales@example.dev`).
- `deskClock`: the capture day at 14:00 local with the zone offset: the date the server stamps on the documents.
- `demo.phone` (a 555 number in the dealer's area code) and `demo.addressPartB` (a street number that does not exist:
  lesson B13, with how it was checked). The narrated cut adds `demo.addressNarrated` (one the Census geocoder knows and
  that is no household: lesson N2) in N7.

## 2. The server

`scripts/desk/desk-server.sh start | stop | restart | status` (needs DESK_DIR and SCRATCH from demo.env):

```bash
setsid env PORT=5190 DESK_PREVIEW_MEMBER=<fresh|fresh-sales> DESK_ALLOW_UNSET_FACTS=true [NODE_USE_ENV_PROXY=1] \
  ADMIN_SESSION_SECRET=<random> INTERNAL_RENDER_TOKEN=<random> CHROME_PATH=<chromium> npx next dev -p 5190
```

- :5190 only; refuses when it is taken. Own process group; stop by group; `next-env.d.ts` saved and restored by copy.
- `DESK_ALLOW_UNSET_FACTS=true`: the demo deal meets owner facts that are not set (the doc fee on a desk whose owner
  has not set fees); the paper prints the `[Not set: …]` marker, which is blurred on camera.
- `NODE_USE_ENV_PROXY=1` when HTTPS_PROXY is set: the address step's Census lookup goes out through the proxy
  (lesson N1); without it the city, ZIP and county never fill.
- The two secrets are random, on the command line only. CHROME_PATH lets the desk render its PDFs.
- First compile takes 1-2 minutes; the script polls `/admin/login` for 180 s.
- `restart` is the reset between takes: a fresh member (un-onboarded) and no deals.

## 3. Sessions, members and the onboarding paths

- The preview session is the cookie `tj-local-admin-preview` on localhost: `owner@example.dev` (an owner) or
  `sales:sales@example.dev` (a salesperson). Every desk shot carries `{{DESK_COOKIE}}`, filled from the onboarding
  path; 6-desk-signin types `{{DESK_EMAIL}}` (blurred) into the real sign-in form.
- `fresh` is an owner with no name, no signature and no fees: after the signature the corridor goes on to Your Fees
  (owner-fees path: 7 ends on Save Signature's navigation and `7b-desk-fees` films the fee screens, Done and Start
  Working). `fresh-sales` never meets Your Fees: 7 ends on Done as in the Discount film.
- `7b-desk-fees` and the owner-fees variant of 7 were written from the desk's fee screens but not yet captured
  (`verified: false`). The composition has no 7b segment yet either: the first owner-fees run adds it to
  `template/src/demo/timeline.ts` (a 7b `deskSegment` after 7, 7's pad zoom pulled out before its cut so the camera
  matches 7b's first frame, the Save Fees click's success cue) and tunes it on those captures with the cut gate and
  the part-B stills; until then `render.sh` refuses an owner-fees storyboard. Say so to the user when they choose the
  owner path (B0), and in the send note.
- Off camera (the narrated cut's fresh server): `scripts/desk/onboard.cjs` signs in the member with the SAME strokes
  7 draws (`assets/sig/member-maria-lopez.json`), so every document carries one hand; FEES=<dollars> on the owner path.

## 4. The clock and the demo data

- Each desk shot's clock is `{{DESK_CLOCK}}` = `deskClock`, never the site's Wednesday clock: the pad's "Signed:" date
  and the documents' dates then agree (Discount had to re-capture 7 when they did not).
- Demo people and car are house values: staff Maria Lopez, buyer James Carter (licence 41927365, DOB 06/14/1988), the
  preview lot's 2019 Toyota Camry SE. The phone and the addresses come from `demo`.
- Scenario files (`assets/desk-scenarios/*.json`) are filled with `fill-client.cjs scenario` into $SCRATCH; the desk
  walks read them (premium-dealer-build `scripts/desk-walk/sale.cjs`; `RESUME_DEAL` walks an existing deal, `STOP_AT`
  stops at a step).

## 5. The storyboard: merge, preflight, the commit stamp

- `fill-client.cjs desk-storyboard $I --into $P/storyboard.json` merges the filled desk shots after 4-menu
  (idempotent), applies the onboarding path, and stamps the template's `deskCommit` (the desk commit the shots were
  last captured on).
- `node $S/scripts/desk/theme.cjs --into $SCRATCH/demo.env` reads the desk's computed theme (accent, ground, font)
  for the walks' theme assertion; the narrated stand-in menu uses THEME_FONT.
- `measure-site.cjs --desk --storyboard … --desk-dir $DESK_DIR` replays every desk shot's actions instantly (its own
  base, cookies, css and clock) and fails on any selector or label that does not resolve. Clean, it stamps
  `deskPreflight {commit, dirty}`. It makes deals and onboards the member: **restart the desk after it**.
- `runbook.cjs run B4 / N9` refuses while the desk's commit (or its uncommitted change count in src/lib/sales and
  src/components/admin) differs from the clean preflight's.

## 6. Capture order and the off-camera steps

Part B, `scripts/capture-desk.sh` (one fresh desk; each shot's cursor starts where the previous one ended):

1. 6-desk-signin, 7-desk-onboard, [7b-desk-fees], 8-desk-sale-start, 9-desk-buyer
2. the scenarios filled and validated (`desk/validate-scenario.cjs`: refuses an answer key the desk no longer asks)
3. the B4 set-up deal: `sale.cjs` with james-carter-to-registration (STOP_AT plan:registration) → 11-desk-guide
   `--var deal=<last part of deal.txt>`
4. 10-desk-readback (makes its own deal; captured after 11 on purpose)
5. the complete sale: `sale.cjs` james-carter, `desk/ceremony-hand.cjs` (the buyer's hand) → 12-desk-signed
6. `pdfs.cjs` → `partB.docFileName` (the 130-U's downloaded name) and `raster-docs.sh … --find CERTIFICATION`

The narrated cut, `scripts/capture-narrated.sh`: onboard off camera; 20-car; 21-buyer (its Start Sale makes the deal:
`desk/latest-deal.cjs`); the licence review confirmed off camera (`desk/review-confirm.cjs`); 22-money and 23-plan;
the rest of the guide off camera (RESUME_DEAL with carter-balance); the PDFs before signing; 24-desk-qr; the signing
link (`desk/signing-link.cjs`) into 26-phone-sign, a second session's into 26b-phone-sign; Mark Sold And Close
(`desk/close-sale.cjs`); 27-desk-stored; the PDFs after signing; the overlay pages by text.

Both scripts restart the desk and run their whole order once more on any failure (lesson N6); a second failure stops.

## 7. Signatures: hold and draw

- `hold` (capture action): presses for `holdSec`; the desk's Hold To Confirm reaches 100% after CONFIRM_HOLD_MS
  (1200 ms); the film keeps 0.5 s of "Release To Confirm 100%" (measure-desk-cuts.cjs computes the cut from it).
- `draw`: strokes in pad px drawn through capture.cjs `penPlan` (cursive speed, pen-up gaps, felt-tip cue). The member
  signs `assets/sig/member-maria-lopez.json`; the buyer `buyer-j-carter.json`; a second signing session uses
  `buyer-j-carter-alt.json` (5% smaller and shifted: the desk refuses a pixel-identical stroke, lesson N5). Never a
  sine wave: the signatures print on the 130-U and the bill of sale the film shows.

## 8. The deal's documents

- `node $PDB/scripts/desk-walk/pdfs.cjs <out> <deal>` downloads every filed PDF through the packet's own links.
- `scripts/raster-docs.sh <pdf> <out.png> --find "<text>"` picks the page by its text (pages move when the paperwork
  templates change) and writes exactly `<out.png>` at 300 dpi (`pdftoppm -singlefile`).
- render.sh refuses to start when a `docs/*.png` that project.ts or src/narrated references is missing.
- Overlay boxes (pushes, spotlights, privacy) are page px: find them with `pdftotext -bbox` on the anchor text, not by
  eye, and re-find them whenever the desk's document layout changes.

## 9. When the desk changes under the video

The paperwork corridor changes (page-by-page templates, typed answers turned into taps, facts asked once). The desk
keeps its own list of what moved in `docs/verification/paperwork-pages/corridor-changes.md` (step / key / old screen
→ new screen). On every desk change:

1. `desk/validate-scenario.cjs --strict` on the three scenarios (the capture scripts run it strict): it refuses a
   stale answer key, an answer whose shape no longer fits its question (a typed value for a question that became a
   tap), an unanswered sworn question, and a scenario not walked on this corridor (`deskCorridor`, the content hash
   `desk/corridor.cjs <desk>` prints). For each refused one: read corridor-changes.md, update the answer in
   `assets/desk-scenarios/<name>.json` (a tap is `{ "button": "<label>" }`, a typed box `{ "fill": "main input",
   "value": … }`), walk it once with premium-dealer-build desk-walk `sale.cjs` to the packet, then
   `validate-scenario.cjs --stamp` records the corridor hash and commit.
2. The desk preflight (B3 / N8): update a shot whose selector or label no longer resolves, in the house template
   (`assets/storyboard-desk.json`, `assets/storyboard-long.template.json`), and say so in the send note.
3. `fill-narration.cjs check --desk $DESK_DIR` refuses a script checked on another corridor commit
   (`narration.checked.commit`) or without the walk's evidence (`checked.evidence`: the desk walk's folder with its
   `walk-report.json`): re-walk the features and re-check lines 14-18 (the money, who files, the inspection).
4. Re-find document boxes by text (section 8).
