# Build the Handle A Sale desk into this dealership's website

You are adding a complete dealership sale desk to the website in this
repository. The admin team uses it to take a car sale from "who is buying"
to a signed, printable packet and a title filing, one question per screen,
with every figure computed and nothing typed twice. The same system runs in
production at Triple J Auto Investment (thetriplejauto.com). You are
reproducing its structure, logic, routing, data model, documents and signing
exactly, dressed in THIS site's visual identity.

Two rules outrank everything else in this prompt:

1. **Structure and logic are fixed; the look is the client's.** Routes, the
   step engine, the money math, the document rules, the signing flow and the
   data model are specified below and are not yours to redesign. Colours,
   fonts, logo, spacing scale and component styling come from the existing
   site. Never restyle the client's public pages.
2. **Never invent a fact.** A dealer licence number, legal name, address,
   county, fee, tax rate, lienholder or form field that is not in the FACTS
   block or the repository is a question for the owner. Stop and ask.

## FACTS (filled in by the owner before pasting)

```
Dealer legal name:             <not provided: ask the owner>
DBA / display name:            <not provided: ask the owner>
Street, city, state, ZIP:      <not provided: ask the owner>
County:                        <not provided: ask the owner>
Phone / email:                 <not provided: ask the owner>
Website domain:                <not provided: ask the owner>
Dealer licence (GDN) number:   <not provided: ask the owner>
State:                         <not provided: ask the owner>
Business time zone:            <not provided: ask the owner>
Owner / authorised signer:     <not provided: ask the owner>
Funding offered:               <not provided: ask the owner>
Languages:                     <not provided: ask the owner>
Documentary fee:               <not provided: ask the owner>
Logo files:                    <not provided: ask the owner>
SMS provider for signing texts:<not provided: ask the owner>
Reference repo attached:       <not provided: ask the owner>
```

## Phase 0. Look before you build, then stop and report

Do all of this before writing any feature code:

1. Run `git status`. If there are uncommitted changes, list them and do not
   touch those files.
2. Identify the stack: framework and router, language, styling system,
   database, auth, file storage, i18n, test runner, package manager, hosting.
3. Find the design system: CSS variables or Tailwind theme, fonts, logo
   files, button/input/card components, the admin area if one exists.
   Write down the client's equivalents of these eight roles:
   `ground` (page background), `panel` (raised surface), `well` (inputs,
   table heads), `line` (1px rules), `ink` (primary text and primary fill),
   `muted` (secondary text), `faint` (placeholder), `accent` (the single
   brand accent). Also the display font and the body font.
4. Find how staff sign in. The sale desk lives behind that sign-in under
   `/admin`. If there is no admin sign-in, propose Supabase Auth with
   email + one-time code and wait for approval.
5. If the reference repository `whoisjaso/thetriplejauto` is attached, read
   `docs/SALE_PROCESS_DESIGN.md`, `src/lib/sales/`, `src/lib/documents/`,
   `src/lib/fill-130u/` and `src/lib/nhtsa.ts` first. Where this prompt and
   that code disagree, the code is newer and wins; say so in the report.
6. Report back in one short message and STOP:
   - the stack, and the target stack below it maps to
   - the eight colour roles and two fonts you found, with file paths
   - which parts of the data model already exist (vehicles, customers)
   - every FACTS blank still empty
   - anything in this prompt that cannot work on this stack, and your plan

**Target stack.** Next.js App Router + TypeScript + Supabase (Postgres, Auth,
Storage) + server actions. If the site is Next.js on anything else, keep
Next.js and add Supabase for the sale desk only. If the site is not Next.js,
say so in the report and propose the least disruptive route: usually a
Next.js admin app on a subdomain (`desk.<domain>`) sharing the brand tokens.
Do not rewrite the client's site.

**State check.** If the state is not Texas, stop at the report. Everything in
the Texas block below (130-U, VTR-271/271-A, VTR-61, rebuilt disclosure,
webDEALER, 6.25% tax, $33 title fee, $75 registration fee, Texas Finance Code
rate ceilings) must be replaced with that state's forms and law, and that is
the owner's decision, not configuration.

Wait for the owner to say "go" before Phase 1.

## Porting from the reference repository

When the reference repo is attached, PORT these files rather than rewriting
them. Keep their tests and port those too. Replace every Triple J fact with
a read from your dealer config.

| Concern | Reference path |
|---|---|
| Deal types, required documents | `src/lib/sales/deal-type.ts` |
| Sale plan questions and document effects | `src/lib/sales/sale-plan.ts` |
| Salvage paths | `src/lib/sales/salvage-plan.ts` |
| Money model | `src/lib/sales/money.ts`, constants in `src/lib/documents/billOfSale.ts` |
| Step engine | `src/lib/sales/guide.ts` |
| Per-document questions | `src/lib/sales/paperwork.ts` |
| Financing terms and rate ceilings | `src/lib/documents/terms.ts` |
| Buyer ID (read vs confirmed) | `src/lib/sales/buyer-id.ts`, `src/lib/forms/id-document.ts` |
| Licence barcode (AAMVA PDF417) | `src/lib/sales/aamva.ts` |
| Licence front OCR fallback | `src/lib/sales/licence-ocr.ts`, `src/lib/sales/licence-front.ts` |
| Capture and signing tokens | `src/lib/sales/capture-token.ts`, `src/lib/sales/signing-token.ts` |
| Ceremony order and rules | `src/lib/sales/signing-ceremony.ts`, `src/lib/actions/packet-signing.ts` |
| Filed-document payload | `src/lib/sales/corridor-link.ts` |
| 130-U official PDF filling | `src/lib/fill-130u/*`, `public/forms/130-U.pdf` |
| Other official forms | `public/forms/VTR-271.pdf`, `VTR-61.pdf`, `ENF-MV-RBLT-DSCLMR.pdf`, `buyers-guide-ftc-*.pdf` |
| Summary (expert lane) | `src/lib/sales/sale-summary.ts` |
| Sale timing | `src/lib/sales/elapsed.ts` |
| webDEALER handoff | `src/lib/sales/webdealer.ts` |
| Lender directory | `src/lib/sales/lenders.ts` |
| VIN decode | `src/lib/nhtsa.ts`, `src/app/api/vin-decode/route.ts` |
| Business date | `src/lib/documents/us-date.ts` |
| Screens | `src/app/admin/sales/**`, `src/app/sign/packet/[token]/*`, `src/components/admin/{guide,paperwork,packet,summary}/*` |

Port the logic files verbatim first, get their tests green, then build the
screens on top in the client's styling.

## The architecture, in six rules

1. **A sale is one record.** The buyer is entered once, the car is entered
   once, and every document, figure, text and filing after that is derived
   from the record. Nothing is retyped anywhere.
2. **Answers live in named keys of one JSONB column**, `deals.step_data`:
   `funding`, `money`, `salePlan`, `salvagePlan`, `buyerId`, `paperwork`,
   `languageConfirmed`, `plate`, `plateAsked`, `saleClock`. Each writer
   reads the current blob and merges its own key only; it never sends a
   whole copy back. A new dealer inherits new questions with no migration.
3. **"Done" is never stored.** Every step's done-ness is computed from the
   record by one pure function (`buildGuideSteps`). The desk, the corridor,
   the summary and the sales list all call it, so they cannot disagree.
4. **One question per screen. The answer is the submit.** Tapping a choice
   saves and advances. Back works. A refresh lands on the same step. A step
   that does not apply does not exist (there is no "Skip"). Completed steps
   stay in the list.
5. **Nothing a formula can produce is a question.** Tax, totals, balances,
   payments, APR within the ceiling, county from city: computed, never asked.
6. **Pure logic, thin screens.** Everything in rules 1 to 5 lives in pure
   TypeScript modules with unit tests. Server actions validate and write.
   Components only render.

## Data model

Create what does not exist; extend what does. Use additive migrations only.

```sql
-- Vehicles (extend the site's inventory table if it has one)
alter table vehicles add column if not exists vin text;
alter table vehicles add column if not exists year int;
alter table vehicles add column if not exists make text;
alter table vehicles add column if not exists model text;
alter table vehicles add column if not exists body_style text;
alter table vehicles add column if not exists price numeric(12,2);
alter table vehicles add column if not exists mileage int;          -- written at Start A Sale
alter table vehicles add column if not exists empty_weight int;     -- 130-U box 11
alter table vehicles add column if not exists title_status text not null default 'unknown'
  check (title_status in ('clean','rebuilt_salvage','bonded','salvage_unrebuilt',
                          'nonrepairable','export_only','unknown'));

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text, email text,
  address text, city text, state text, zip text, county text,
  created_at timestamptz not null default now()
);

create type deal_status as enum ('in_progress','completed','abandoned');

create table deals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  status deal_status not null default 'in_progress',
  step_data jsonb not null default '{}',
  language text not null default 'en' check (language in ('en','es')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
-- One open sale per car.
create unique index deals_vehicle_active_idx on deals (vehicle_id) where status = 'in_progress';

create table document_agreements (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete set null,
  document_type text not null check (document_type in (
    'billOfSale','form130U','financing','vehicleResponsibility','insuranceAcknowledgment',
    'powerOfAttorney','rebuiltDisclosure','salvageBillOfSale','towAwayAcknowledgment',
    'buyerResponsibilityStatement')),
  state text not null default 'draft' check (state in ('draft','filed')),
  language text not null default 'en',
  buyer_name text, buyer_phone text, buyer_email text,
  vehicle_description text, vehicle_vin text,
  form_data jsonb,                 -- the corridor's answers and computed figures
  completed_link text,             -- the encoded render payload every print path reads
  has_buyer_signature boolean not null default false,
  has_dealer_signature boolean not null default false,
  finalized_at timestamptz,
  signed_at timestamptz,
  signed_ip text,
  pdf_path text,
  created_at timestamptz not null default now()
);
create index on document_agreements (deal_id);
```

Signature evidence is written onto the document's own row, inside
`form_data`: `signature` (the PNG data URL), `signedAt`, `signedVia`
(`desk` or `ceremony`), `signedUserAgent` (first 240 characters),
`readToEndAt`, `signatureReused`, and `signatureReuseConsentAt` when the
first stroke was reused. One row then carries intent, attribution,
association and retention, and nothing else has to be joined to prove a
signature.

Row level security on all three tables: staff (authenticated, with an admin
role check if the site has roles) can read and write; anonymous users get
nothing. The buyer's signing page never uses the anon key against these
tables; it goes through server actions that verify a signed token and use
the service role.

Storage buckets, all **private**: `buyer-ids` (licence photos),
`documents` (filed PDFs). Serve files only through signed URLs that expire
in 10 minutes, and never cache the pages that mint them.

Dealer facts live in ONE file, `src/lib/dealership-config.ts`: legal name,
DBA, address, county, phone, email, licence number, time zone, signer name
and title, fee lines, tax rate, brand tokens. Add a unit test that fails if
any of those values is typed anywhere else in `src/`.

## Routes

All under the site's existing admin sign-in.

| Route | Screen |
|---|---|
| `/admin/sales` | Open sales. Each row: buyer, car, "N of M signed" against the documents THIS sale owes, the next open step, a badge (e.g. "Salvage: Waiting On Title"). One primary action: Start A Sale. |
| `/admin/sales/new` | Start A Sale (below). Starts the sale clock on first render. |
| `/admin/sales/[dealId]` | The desk: the sale as a state, for the expert. Optional documents appear only when this sale owes them. |
| `/admin/sales/[dealId]/guide` | Redirects to the first open step. |
| `/admin/sales/[dealId]/guide/[step]` | One corridor question. `step` is the step key, URL-encoded (`plan%3Aregistration`, `document%3AbillOfSale`). |
| `/admin/sales/[dealId]/paperwork/[doc]/[q]` | One question inside one document, then `.../[doc]/review` for read-back, pad and preview. |
| `/admin/sales/[dealId]/summary` | Check Answers: the whole sale on one page, every row a link back into its question. |
| `/admin/sales/[dealId]/packet` | Everything filed: open, print, download, start the signing ceremony, text the buyer. |
| `/admin/sales/past` | Completed sales, newest first, searchable. |
| `/admin/sales/times` | Optional: sale times board (see Sale clock). |
| `/admin/sales/promises` | Optional: balances promised and due, soonest first. |
| `/capture/[token]` | Phone page that photographs a licence for one deal. No site chrome. |
| `/sign/packet/[token]` | The buyer's signing ceremony. No site chrome, no nav, no footer. |
| `GET /api/vin-decode?vin=` | NHTSA decode (below). |
| `POST /api/capture` | Licence photo upload with a capture token. |
| `GET /api/documents/agreements/[id]/pdf` | Renders a filed document to PDF. Staff session or a valid signing token for that deal. |
| `GET /api/admin/sales/[dealId]/packet-status` | Public-safe packet facts for the desk's live refresh. |

Server actions, one per decision: `startSale`, `setDealLanguage`,
`saveBuyerId`, `setFunding`, `saveMoney`, `answerPlanQuestion`,
`setSalvagePath`, `setPlate`, `answerPaperwork`, `finalizeDocument`,
`signDocumentAtDesk`, `openSigningCeremony`, `signPacketDocument`,
`completeSale`, `deleteSale`. Each: verify the session (or token), validate
the value against the pure module's `isValidAnswer`, read the current
`step_data`, merge ONE key, write with an `updated_at` compare-and-swap
(retry once on conflict), revalidate the route.

## Start A Sale

One screen, read back before anything is written.

1. **The car.** Pick from the lot (search by stock number, year, make, model,
   VIN), or type a VIN at the desk and decode it. A typed VIN creates the
   vehicle row from the decode.
2. **Odometer.** Required. Written to `vehicles.mileage` and read from there
   by the bill of sale, the financing contract and the 130-U, so the three
   documents can never disagree about the one number federal law makes the
   seller swear to.
3. **Title status.** Prefilled from inventory, confirmed here: clean,
   rebuilt salvage, salvage (not rebuilt), other.
4. **Language of the sale.** English or Spanish, required, no default. Stored
   on `deals.language` with `step_data.languageConfirmed = {by, at}`. FTC
   455.5 and Tex. Fin. Code §348.006 key required disclosures to it.
5. **Buyer.** Full name, mobile phone, email (optional), ID type (driver's
   licence, state ID, passport, military ID) and ID number, address with
   autocomplete. County is derived from the city (keep a city-to-county table
   for the dealer's state) and asked only when it cannot be derived.
6. **Read back** everything on one panel, then Start. Creates customer and
   deal, writes the car's mileage, stamps the sale clock, lands on the first
   corridor step.

### VIN decoding

- Validate first: `/^[A-HJ-NPR-Z0-9]{17}$/i` (no I, O, Q). Also compute the
  check digit (position 9) and show a warning, never a block, on mismatch.
- Call NHTSA vPIC server-side:
  `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json`
  with a 10 second timeout. Free, no key.
- Read `Results[0]` and normalise: make (title-case, keep BMW, GMC, RAM
  upper-case), model (`Model` + `Trim`), year (`ModelYear` as int), body
  style (`BodyClass` folded to Sedan, SUV, Truck, Coupe, Convertible, Wagon,
  Hatchback, Van, Crossover), drivetrain (`DriveType` to AWD, 4WD, RWD, FWD,
  2WD), transmission, fuel, engine (`{DisplacementL}L V{cylinders}` or
  `{cylinders}-Cylinder`), doors, plant country, GVWR, curb weight (lbs).
  Treat `"Not Applicable"` and empty strings as null.
- Curb weight, when present, prefills the 130-U empty-weight question. Body
  style decides whether carrying capacity is asked (trucks and vans only).
- Show the decoded car for confirmation. A decode failure never blocks: the
  desk can type year, make and model.

## The buyer's ID: read by a machine, confirmed by a person

Three columns per field, kept separate: what the camera saw (the image and
when), what the machine read (`read`, a guess), and what a person confirmed
(`confirmed`, the only value documents may print). Stored in
`step_data.buyerId` as `{ image, back, fields: { key: {read, confirmed} },
mailing: {...}, mailingConfirmed, idType }`.

Three ways to get the card on file, all equal:

1. **Phone capture.** The desk shows a QR code and a link. The token is an
   HMAC-signed `{dealId, purpose:"capture", exp}` (15 minutes), signed with
   the admin session secret, never stored. It authorises one thing: attaching
   a photo to that one deal. The phone page `/capture/[token]` has no chrome,
   takes front and back, checks sharpness and glare before upload, and posts
   to `/api/capture`. The desk screen updates live (realtime subscription on
   `deals`, or poll every 3 seconds).
2. **Upload** a scan from the office.
3. **Type it.**

Reading, all on your own server (a licence never goes to a third-party API):

- **Back first: the PDF417 barcode** (use `zxing-wasm`, wasm file served
  from `/public`). Parse AAMVA elements: `DCS` last name, `DAC` first, `DAD`
  middle, `DAQ` licence number, `DBB` date of birth, `DBA` expiry, `DAG`
  street, `DAI` city, `DAJ` state, `DAK` postal (5 digits, drop the
  zero-padded +4), `DCG` country. Dates are MMDDCCYY for US cards and
  CCYYMMDD for Canadian ones. Treat the literal `NONE` as empty. AAMVA has
  no issuing-state element, so the issuing state is asked if intake did not
  capture it.
- **Front as fallback: offline OCR** (`tesseract.js` with language data served
  from `/public/tessdata`). Anchor on the SHAPE of values (dates, the licence
  number pattern) and the AAMVA numbered fields (1, 2, 3, 4b, 4d, 8); never
  trust OCR'd label text.
- Every value read lands in `read` only. The review step shows the photo
  beside the fields and a person confirms each one.
- **The mailing address gets its own explicit confirmation**, and the flow
  does not continue without it. It is the value most often different from the
  card, and the one whose error is silent: plates go to an address the buyer
  left months ago.
- Validate ID numbers against the issuing state's published format and a
  passport against the ICAO 9-character ceiling, as a warning that never
  blocks.

## The corridor: the steps, in order

`buildGuideSteps(sale)` returns the steps this sale has, in this order, each
with `{key, question, done}`. Questions are written the way a person asks
them out loud, and every word is capitalised.

| # | Key | Question | Exists when | Done when |
|---|---|---|---|---|
| 1 | `language` | What Language Is The Sale In? | only on a deal with no confirmed language | confirmed |
| 2 | `plan:salvage` | What Happens With The Salvage Title? | title is `salvage_unrebuilt` | path is `rebuild` or `towAway` |
| 3 | `buyer` | Who Is Buying The Car? | always | buyer has a name |
| 4 | `buyerId` | Put The Licence On File. (or Check What The Card Says. once a photo exists) | always | every ID field confirmed and mailing confirmed |
| 5 | `funding` | How Are They Paying? | always | a type is chosen |
| 6 | `lender` | Which Lender Is Funding It? | funding is `lender` | a lender id or a real name (not a placeholder) |
| 7 | `paid` | How Much Are They Paying? | always | the amount box is answered |
| 8 | `price` | Does That Include Tax And Fees? | always | basis chosen |
| 9 | `plan:registration` | Who Files The Title And Registration? | not tow-away | answered |
| 9a | `plate` | What Plate Is Going On It? | we file | a plate, or "Not Yet" answered |
| 9b | `plan:title-signer` | Who Signs The Title Application? | we file | answered |
| 9c | `plan:price-includes` | Does The Price Include Registration? | buyer files | answered (false is an answer) |
| 10 | `plan:inspection` | Where Does The Inspection Stand? | not tow-away | answered |
| 11 | `plan:insurance` | Did They Show Proof Of Insurance? | not tow-away | answered (false is an answer) |
| 12 | `titleWork` | Rebuild The Title First. | salvage on the rebuild path, title not yet rebuilt | never, until the vehicle's title flips to rebuilt |
| 13 | `document:<type>` | Sign The <Document Title>. | one per document this sale owes, only once the plan is complete | filed (signed or not) |
| 14 | `title` | File The Title And Get Plates. | not tow-away | a plate is on the deal (the plate is the proof) |
| 15 | `packet` | Print Or Save The Paperwork. | always, last | any document filed |

Rules with guard tests:

- A step that does not apply is absent, never skippable.
- Completed steps stay in the list; progress reads "7 Of 15".
- Document steps do not exist until every plan question is answered.
  The packet is a function of the answers and cannot be built before them.
- `nextOpenStep` is the first not-done step; `/guide` redirects there.
- `isPlanQuestionAnswered` treats `false` as an answer. Never use a
  truthiness check on an answer.

## Funding

`step_data.funding = { type: 'cash' | 'inHouse' | 'lender' | null, lenderId,
lenderOther }`. Labels: **Cash**, **Buy Here Pay Here** (gloss "In-House
Financing"), **Bank Financing**. Never infer the type from money; `null`
means ask.

| | Cash | Buy Here Pay Here | Bank Financing |
|---|---|---|---|
| Who carries the note | nobody | the dealer | the lender |
| Documents | bill of sale, 130-U | bill of sale, 130-U, dealer financing contract | bill of sale, 130-U |
| Must NOT use | financing contract | nothing | the dealer financing contract (the lender's contract is the contract; two would sign the same debt twice) |
| Lien on the 130-U | the dealer's, only if a balance is owed | the dealer's, for the note | the lender's, named from the lender answer, never the dealer's |
| Payment method on the bill of sale | asked: Cash, Zelle, Cash App, Venmo, Card, Check | "Financing" | "Financing", lender named |

The lender step offers a searchable directory (banks and credit unions
first, then everything else, alphabetical inside each group; tags for
"Aggregator" and "Dealer Capital") plus free text for a lender not listed.

## Money

Two answers, one per screen, in `step_data.money = { amount, paidTodayAmount,
priceBasis }`:

- **How Much Are They Paying?** An open dollar box, prefilled from the
  vehicle price but the dealer's answer outranks the inventory (cars get
  listed at $0). `paidTodayAmount` is an optional override for a partial
  payment.
- **Does That Include Tax And Fees?** `outTheDoor` (tax and fees inside it)
  or `vehicleOnly` (tax and fees go on top). This screen shows the live
  receipt.

Texas constants (from dealer config): tax 6.25%; title fee $33; registration
fee $75; doc fee = total fees ($400 at Triple J) minus title minus
registration ($292). The doc fee absorbs any statutory change so the quoted
total holds.

```
cents(x) = round(x * 100) / 100
FEES = title + doc + registration

vehicleOnly:  salePrice = amount
              tax = cents(0.0625 * max(0, amount - tradeIn))   // Tax Code 152.021: tax after trade-in
outTheDoor:   beforeTax = cents(amount) - FEES
              salePrice = cents(beforeTax / 1.0625)
              tax = cents(beforeTax - salePrice)               // remainder, so the lines sum exactly
registrationCost = cents(tax + FEES)
total = max(0, cents(salePrice - tradeIn + registrationCost))

impliedPaid:  lender or inHouse          -> 0
              amount/basis unanswered    -> total   (an unvisited screen never creates a balance)
              outTheDoor                 -> total
              vehicleOnly                -> min(total, salePrice - tradeIn)
paidToday = override typed ? clamp(override, 0, total) : impliedPaid
balance   = funding == lender ? 0 : max(0, cents(total - paidToday))
```

Parse money boxes by stripping `$`, `,` and spaces BEFORE testing for empty
(`Number("")` is 0, which would put the whole deal on the title as a
balance). Empty means unanswered; a typed 0 is an answer.

Test vectors your unit tests must hit exactly:

| Case | Result |
|---|---|
| $4,000 out the door, cash | sale price $3,388.24, tax $211.76, fees $400.00, total $4,000.00, balance $0.00 |
| $3,500 vehicle only, cash, nothing else typed | tax $218.75, total $4,118.75, paid $3,500.00, balance $618.75 |
| $4,000 vehicle only, cash | tax $250.00, total $4,650.00 |
| $10,000 vehicle only, $3,000 trade | tax $437.50, total $7,837.50 |
| any lender deal | balance $0.00 |
| buy here pay here, no down payment yet | paid $0.00, note = total |

A cash balance becomes the dealer's lien on the 130-U, and the bill of sale
states it as "Balance owed by the buyer to the seller under this bill of
sale", in one figure the buyer can point at.

## The sale plan (the prescreen)

`step_data.salePlan = { registrationBy, titleSignedBy,
priceIncludesRegistration, insuranceShown, inspectionBy }`.

The question chain is DERIVED, never fixed:

```
planQuestions(plan):
  ['registrationBy']
  + (registrationBy == 'dealer' ? ['titleSignedBy'] : [])
  + (registrationBy == 'buyer'  ? ['priceIncludesRegistration'] : [])
  + ['inspectionBy', 'insuranceShown']
```

Choices: registration by **Us** (default under Texas HB 718: since July 2025
the dealer files title and registration through webDEALER) or **The Buyer**;
title application signed by **The Buyer, Here Today** or **Us, For Them**;
inspection **We Take It**, **They Take It** or **Already Done**; insurance
**Yes, Shown** or **No**; price includes registration **Yes** or **No**.

Answering applies ONE field to the stored plan (`applyPlanAnswer`), with
its invalidation: switching registration to the buyer clears
`titleSignedBy`; switching to the dealer clears `priceIncludesRegistration`.

What the plan does to the packet (`planDocumentEffect`):

- title status `rebuilt_salvage` → add `rebuiltDisclosure`
- buyer files → remove `form130U`, add `vehicleResponsibility`
- we file and WE sign for an absent buyer → add `powerOfAttorney` (the ONLY
  route that owes one)
- insurance not shown → add `insuranceAcknowledgment`

Power of attorney instrument: vehicle age (sale year minus model year) of 20
or more → plain VTR-271 (printed official form); under 20 → the county's
secure VTR-271-A, signed in ink, recorded as used. Unknown year → ask.

**Freeze.** Once any plan-derived document is finalized
(`powerOfAttorney`, `form130U`, `vehicleResponsibility`,
`insuranceAcknowledgment`, `rebuiltDisclosure`, or a tow-away sheet), every
plan answer is locked and the screen names the document holding it. A
signed document must never silently reattach to changed terms.

## Salvage

On a `salvage_unrebuilt` car, `step_data.salvagePlan.path`:

- `rebuild`: the title work happens first (the `titleWork` step holds all
  documents until the vehicle's title is rebuilt), then it sells as a
  rebuilt car with its disclosure.
- `towAway`: sold as-is on the salvage title, towed off, no plates, nothing
  filed with the state. Packet: `salvageBillOfSale`,
  `towAwayAcknowledgment`, `buyerResponsibilityStatement` (+ `financing` on
  buy here pay here). No prescreen, no title step, and none of bill of sale,
  130-U, vehicle responsibility, insurance acknowledgment, POA, rebuilt
  disclosure. State on the choice that salvage dealing is separately licensed
  (Tex. Occ. Code ch. 2302).
- `undecided`: everything is captured, documents wait, badge says why.

## The documents

`requiredDocumentTypes(funding, plan, titleStatus, salvagePath)` is the ONE
function that assembles a packet. Base lists: cash and lender = bill of sale +
130-U; buy here pay here = those + financing. Then apply the plan effect,
append added types, de-duplicate.

Walk order (the corridor and the ceremony both use it): Rebuilt Title
Disclosure (first, before any instrument of sale, 43 TAC 215.160), Bill Of
Sale, Form 130-U, Vehicle Responsibility, Insurance Acknowledgment, Power Of
Attorney, Financing Contract (last). The FTC Buyer's Guide is printed for the
window and never stored, so it is never a required document.

Per-document questions (only what the record does not already hold):

- **Bill of sale:** Is That The Real Mileage? (Real / Rolled Over / Not The
  Real Mileage), How Are They Paying Today? (cash deals only), Is There A
  Trade-In? → What Are They Trading In? → What Are We Allowing For It?, Sold
  As-Is Or With A Warranty? → How Long Is The Warranty?
- **130-U:** Which State Issued Their Licence? (only if unknown), Which County
  Do They Live In? (only if not derived), What Are We Applying For? (Title And
  Registration / Title Only / Registration Only), Is The Buyer A Person Or A
  Business?, What Is The Empty Weight? (prefilled from the decode), What Is
  The Carrying Capacity? (trucks and vans only, "Not Applicable" allowed).
- **Financing:** How Much Are They Putting Down? (prefilled from what the
  money step says crossed the desk; never asked twice), How Often Do They
  Pay? (Weekly / Every Two Weeks / Monthly), What Did You Agree On? (The
  Payment / The Number Of Payments / Both), then the one or two figures, What
  Is The Rate? (when not both), When Is The First Payment Due?. The rest is
  solved: amortise at the agreed figures, hold the APR to the Texas Finance
  Code ch. 348 ceiling for the vehicle's class (never below the 18%
  optional ceiling, §303.009), and if the implied rate exceeds it, bring the
  rate down and recompute the payment at the ceiling. Encode no ceiling
  number the owner has not confirmed.
- **Review-only** (no questions, everything comes from the sale): Power Of
  Attorney, Insurance Acknowledgment, Rebuilt Title Disclosure, the tow-away
  sheets. Vehicle Responsibility has no questions either; it prints
  `registrationCost` as the figure the buyer owes if the filing comes back.

Each document ends at a **review screen**: the facts read back, the live
preview of the exact sheet that will print, the signature pad for the buyer
(and the dealer's saved signature for the dealer line), and File. Filing
writes `form_data` (answers and computed figures), builds `completed_link`
(the render payload every print path reads), and sets `finalized_at`. Filing unsigned and printing for ink is always
allowed; that is how a sale closes on the day the pad breaks.

### How the paper looks

Every document the dealer authors prints on one design: the dealer's
letterhead (logo, legal name, address, phone, licence number), hairline
rules, the display font above 18px only (titles and major headings), the body
font for everything else at 9 to 10pt, figures in a monospaced or tabular face,
the one sentence that matters in red, and the same signature grid. The
client's brand supplies the logo, the accent and the fonts.

Official state and federal forms (130-U, VTR-271, VTR-61, the FTC Buyer's
Guide) are printed FROM THE OFFICIAL PDF with no added branding: fill the
AcroForm fields by name with `pdf-lib` (map every field name deliberately,
e.g. `16 Applicant First Name or Entity Name Middle Name Last Name Suffix if
any`), draw the buyer's stroke onto the applicant signature band, and flatten.
Box 15 ticks the licence, passport or military box from the stored ID type.

On the paper, every figure is read off the sale once (price, tax, fees,
odometer, balance, lien). Every date, on documents and signatures, is the
BUSINESS date in the dealer's time zone, never the server's UTC date (UTC
rolls over at 7 pm in Houston). Page groups may break between rows; a
checklist row, a notice, the signature block and an acknowledgment are kept
whole. No blank sheets.

Legal content each document must carry:

- **Bill of sale:** price, tax and fees line by line; the odometer reading and
  its federal qualification; as-is or warranty (FTC); payment method; any
  balance and the lien that secures it.
- **130-U:** the application in the buyer's hand, the seller line signed by
  the dealer, the lien section written from the funding answer.
- **Insurance acknowledgment:** no proof shown, the law requires it, they will
  get it before driving, the dealer is not their insurer, and registration
  waits on proof.
- **Rebuilt disclosure:** the brand in writing before anything else, the
  chance to inspect, that the brand is permanent and affects value, and the
  state's Form ENF-MV-RBLT DSCLMR sentence word for word in the purchaser's
  voice over year, make and VIN.
- **Vehicle responsibility:** the buyer took the filing on, the 30-day
  window, the figure and late fee if it comes back to the dealer.

Spanish documents are translations of the approved English text and carry
a visible "translation pending counsel review" status until the owner marks
them approved. On a Spanish sale the English original prints under the
translation where the law requires it.

## Signing

### At the desk

On a review screen the buyer draws on the pad (`signature_pad`, exported as
a PNG data URL, rejected if under 200 characters). One stroke per document,
filed with the record, rendered onto the printed page.

### The signing ceremony

When every required document is filed, the packet screen offers **Sign The
Packet**:

1. `openSigningCeremony(dealId)` mints an HMAC-signed token
   `{dealId, purpose:"packet-signing", exp}` valid **20 minutes**, stateless,
   revoked by re-minting. It lets its holder read that one deal's filed
   documents and sign them. It cannot edit anything, see another deal, or
   reach the admin.
2. The desk shows three ways in: a large QR code, **Open Here** (turn the
   iPad around), and **Text It** (sends the link through the SMS provider, only
   to a number with recorded consent).
3. `/sign/packet/[token]`: a cover with the buyer's name, the car, "4
   Documents To Sign", the language toggle and **Begin**. Then one document
   per screen in walk order, rendered as the exact sheet that will print, at
   reading size. **The pad does not unlock until the sheet has been scrolled
   to its end**; the scroll is the reading and it is recorded. Under the sheet:
   the one sentence the document means ("This is the bill of sale. It says
   what you paid and that the car is sold as is."), the pad, Clear, **Sign And
   Continue**. The first stroke is offered on later documents as **Use My
   Signature** behind a consent tick, with a fresh pad one tap away. Last: a
   receipt listing every document with a tick and the time.
4. `signPacketDocument(token, agreementId, dataUrl, {scrolledToEnd, reused,
   reuseConsent})`: verify the token; refuse a row not on that deal; refuse
   without scroll-to-end; rebuild `completed_link` with the stroke and the
   business date; set `has_buyer_signature` and `signed_at`; write the
   evidence keys into `form_data` (`signedVia: "ceremony"`, user agent,
   `readToEndAt`, reuse and consent). Intent, attribution, association and
   retention (ESIGN/UETA) all sit in that one row.
5. The packet screen polls `packet-status` every few seconds (back off on
   failure) and flips each row from "Filed, Not Yet Signed" to "Signed By The
   Buyer".

Never in the ceremony: drafts, rows with no `completed_link`, and the power
of attorney (its odometer disclosure is a wet signature on a state form).
Spanish e-signature stays off until the owner records counsel approval; a
Spanish ceremony shows the sheets and ends with Print For Ink.

## After the paperwork

- **Title and plates (webDEALER).** Not an integration (that needs TxDMV's
  approved-vendor access). One screen gathers every field webDEALER asks for
  from the deal, each with a copy button, and names the screen that fills any
  missing field. Nothing is left blank for memory. Typing the issued plate
  (stored as `step_data.plate`) completes the `title` step.
- **The packet.** Every filed document, openable and printable from any
  device through the PDF route (what prints is what was signed, never a
  regeneration from today's rows), the licence photos (signed URLs), the
  Buyer's Guide in both languages, and Text The Buyer Their Copies (consented
  numbers only). Never cached.
- **Complete Sale** marks the deal completed, sets `completed_at`, marks the
  vehicle sold, and moves it to Past Sales.
- **Summary (the expert lane).** A second RENDERING of the same step list,
  never a second way to store answers. Grouped (Buyer, Money, Plan,
  Documents, Title); each row shows what it was answered with and links into
  that question's screen; the next open row is one button away.

### Sale clock (optional, recommended)

The clock starts when Start A Sale first renders (the client reports the
time; the server clamps it; a start older than 12 hours is ignored). Elapsed
time is always shown raw. A sale longer than 4 hours is excluded from
averages and marked, and the board says how many it set aside. Standings
rank staff by median time on fair sales.

## Bilingual

Every word on the corridor, the ceremony and the summary comes from a
message catalogue (`en` and, if the dealer sells in Spanish, `es`). The
toggle swaps every word in place with no navigation and no lost input.
Add a guard test that fails if a string literal renders in those components
outside the catalogue. The document language follows `deals.language`, not
the staff member's toggle.

## The screens, in the client's clothes

Every operate screen follows the same anatomy, whatever the brand:

- **One job, one primary action.** A screen offers exactly one primary
  button (filled with `ink`, or the client's primary). Everything else is
  secondary or a text link.
- **The question is the header**, in the client's display font, every word
  capitalised ("Who Files The Title And Registration?").
- **Choices are large stacked buttons**, full width on mobile, at least 56px
  tall, the label in the body font at 17 to 18px, an optional one-line gloss
  in `muted`. Tapping one saves and advances. The current answer is marked
  with the accent and a check, not colour alone.
- **Money and numbers** in a big input with the figure in a tabular face,
  and a live receipt beneath (Price, Tax, Title, Doc Fee, Registration,
  Trade-In, Total, Paid Today, Balance) that updates as they type.
- **Progress and way back:** "Step 7 Of 15" and a Back link above the
  question; a quiet link to the Summary.
- **Under 60 visible words** per screen excluding data. No explanatory
  paragraphs: if a control needs a sentence, fix the control. One optional
  note line only where a question cannot be answered without it.
- **The accent is scarce:** the live figure, the current focus, the primary
  action. If two things on a screen use the accent, one is wrong.
- **Paper-like surfaces:** `ground` background, `panel` cards with 1px `line`
  rules, `well` for inputs and table heads. No heavy shadows, no gradients.
- **Mobile first at 390px.** A sale must be runnable start to finish on a
  phone standing next to the car. Tap targets 44px minimum, inputs 16px text
  (no iOS zoom), safe-area padding, the primary button reachable by thumb.
- **Status always carries a word** (Filed, Signed, Waiting On Title), never
  only a colour. Text meets WCAG AA on every ground.
- Titles and headings capitalise every word; body, labels and errors stay
  sentence case.

Add the sale desk to the admin navigation as **Handle A Sale**, with **Past
Sales** beneath it (and **Sale Times** and **Promises** if built).

## Security

- Server actions and API routes check the staff session (and role, if the
  site has roles) before every read and write. The buyer-facing routes check
  the signed token and nothing else, and use the service role only on the
  server, scoped to the token's deal.
- Tokens are HMAC-SHA256 over `{dealId, purpose, exp}` with the admin
  session secret, compared in constant time, purpose-checked (a capture token
  must not open a ceremony).
- Buckets are private; every file link is a signed URL of 10 minutes or less.
- Licence images and OCR stay on your server. No third-party vision API.
- Validate every upload's type and size; strip EXIF from licence photos.
- Rate-limit `/api/capture` and `signPacketDocument` per token.
- No secret, key or licence data in client bundles, logs or URLs other than
  the opaque token.

## Tests you must write (pure modules, no database)

- Money: every test vector above, plus "$" and "$3,000.00" parsing, empty vs 0,
  paid clamp, lender balance always 0.
- Plan: the derived chain on both branches; `false` counts as answered;
  invalidation on switching registration; each document effect; the freeze
  list; POA instrument at 19, 20 and unknown years.
- Documents: `requiredDocumentTypes` for all 3 fundings × both registration
  branches × insurance yes/no × title clean/rebuilt, and the three salvage
  paths; lender never includes `financing`.
- Guide: step lists for a cash dealer-files sale, a buy here pay here sale, a
  bank sale, a buyer-files sale, a rebuilt car and a tow-away; no document
  step before the plan completes; `nextOpenStep`.
- Tokens: expiry, tampering, wrong purpose.
- AAMVA: US and Canadian date orders, `NONE`, 9-digit ZIP.
- VIN: valid, invalid characters, wrong length, check digit.
- Guards: dealer facts only in the config file; no untranslated literal in
  corridor components; every requirable document type has a question set or
  review screen, a renderer, and is allowed by the database check constraint.
  Guard tests assert on syntax, never on bare words (a comment mentioning a
  word must not fail the guard).

## Verification (required before you say done)

1. Typecheck, lint, unit tests, production build: all clean.
2. On the local dev server (after deleting the build cache so CSS is fresh),
   with Playwright, at **390x844 and 1440x900**, walk five sales end to end:
   - cash, out the door, dealer files, buyer signs, insurance shown
   - cash, vehicle only with a partial payment (a balance and a lien)
   - buy here pay here with a trade-in (financing contract, ceiling holds)
   - bank financing (lender named as lienholder, no dealer lien anywhere)
   - buyer files and no insurance shown (vehicle responsibility and insurance
     acknowledgment appear, 130-U does not)
   On each: screenshot every step, sign every document through the ceremony,
   and finish at a packet reading "N Of N Signed".
3. Before trusting any screenshot, assert one computed style the client's
   theme sets (for example the accent colour on the current answer) and fail
   if it is wrong.
4. Download every PDF of one full packet through the same route the Open
   button uses, rasterise the pages, and read them: the 130-U's filled fields
   dumped by name (applicant, address, county, licence, odometer, lienholder),
   the bill of sale's figures summing to its total, the odometer identical on
   every document, and today's business date on every signature.

## Delivery

Work on a new branch. Open one pull request containing: what was built, the
route list, the migrations as files (do not run them against production),
screenshots of all five walks at both sizes, the rasterised packet pages, and
the test output. End the PR with the owner's manual steps: run the
migrations, create the private buckets, set the admin session secret and the
SMS credentials, confirm the fee and tax lines, upload the dealer's
signature, and approve any Spanish translation.

**Never:** invent a dealer fact or a legal number; change the wording of an
official form; put the dealer financing contract on a bank deal; print a
dealer lien on a lender deal; let a signature land on a document the buyer
could not scroll through; put the power of attorney in the e-sign ceremony;
store "done"; ask a question the record already answers; restyle the
client's public site; run destructive database operations.