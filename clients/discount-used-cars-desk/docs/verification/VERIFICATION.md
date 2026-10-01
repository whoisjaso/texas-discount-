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

- **Temporary passwords:** approving or resetting a member sets
  `requires_password_change` and nothing clears it, so an approved member
  cannot finish onboarding or file until the owner decides whether
  onboarding gains a "Choose A Password" screen.
- **Down payment after the bill of sale is filed:** refuse or accept.
  Separately, the skill's `bhph-trade.json` should enter the $1,500 on the
  money step; it is not edited without permission.
- **VTR-61 printed name:** whether it also becomes
  `Discount Used Cars And Trucks, LLC (First Last)`.
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
