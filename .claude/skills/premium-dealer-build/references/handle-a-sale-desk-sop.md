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
-- 130-U box 11, the empty weight, with its source (section "Empty weight").
-- weight_lbs is box 11 as a person confirmed it FROM A DOCUMENT, rounding
-- applied. An estimate never goes in weight_lbs: it lives in weight_estimate.
alter table vehicles add column if not exists weight_lbs int;
alter table vehicles add column if not exists weight_source text check (weight_source in
  ('texas_title','out_of_state_title','mco','weight_certificate','kbb_jdpower'));
alter table vehicles add column if not exists weight_reading_lbs int;   -- as printed, before rounding
alter table vehicles add column if not exists weight_rule text check (weight_rule in ('roundUp','plus100RoundUp'));
alter table vehicles add column if not exists weight_confirmed_by uuid;
alter table vehicles add column if not exists weight_confirmed_by_name text;
alter table vehicles add column if not exists weight_confirmed_at timestamptz;
alter table vehicles add column if not exists weight_note text;         -- the reason for an override
alter table vehicles add column if not exists weight_estimate jsonb;    -- source, method, range, confidence,
                                                                        -- and the row it was made for (fingerprint)
alter table vehicles add column if not exists weight_estimated_at timestamptz;
-- weight_estimate is written only for an estimate made from a VIN decode (or
-- for a car with no VIN), only over nothing or over the exact estimate read,
-- and is stale once the row's VIN, year, make, model, trim, body style,
-- engine, drive or fuel no longer match its fingerprint.
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

**Voiding (a second additive migration, owner's decision 10/02/2026).** A
filed document is never deleted or rewritten; a filed bill of sale can be
voided, which marks rows rather than removing them:

```sql
alter table document_agreements add column if not exists voided_at timestamptz;
alter table document_agreements add column if not exists voided_by uuid;           -- auth user id
alter table document_agreements add column if not exists voided_by_member_id uuid; -- team_members.id
alter table document_agreements add column if not exists voided_by_name text;      -- name snapshot
alter table document_agreements add column if not exists void_reason text;         -- 10 to 500 chars
alter table document_agreements add column if not exists void_group_id uuid;       -- one per void
alter table document_agreements add column if not exists voided_with_id uuid;     -- the bill of sale; null on it
-- No foreign keys on these: no foreign-key action may ever write a voided row.
-- Check: all null, or voided_at + void_reason (10..500 after trim) + void_group_id set.
-- Partial index (deal_id, document_type) where voided_at is null.
-- Trigger (BEFORE UPDATE OR DELETE, named to fire after the null-expiry one):
--   a voided row is final (never updated, never deleted, so a deal holding
--   one cannot be deleted either); setting voided_at needs documents:manage,
--   may change only the void columns (plus expires_at), is refused to a
--   signed-in session writing it straight through the API (current_user
--   authenticated or anon: only the function below voids), and is refused
--   for the power of attorney.
-- Trigger (BEFORE INSERT): no row is ever inserted already voided.
-- Trigger (BEFORE INSERT): a filed financing, form130U, vehicleResponsibility
--   or towAwayAcknowledgment needs a current filed bill of sale on the deal;
--   it locks the deal FOR SHARE (security definer), so it serialises with a
--   void's FOR UPDATE and a dependent can never be filed across a void.
-- Function void_filed_documents(p_deal_id, p_root_id, p_types, p_reason,
--   p_at, p_detail), security definer, execute to authenticated only: one
--   transaction that checks documents:manage and an active roster row (who
--   voided comes from auth.uid(), never the caller; a memberId or memberName
--   in p_detail is overwritten with the session's own), voids a FIXED set
--   (p_types must equal every corridor type but the power of attorney, else
--   'not_voidable'), refuses a reason outside 10..500 characters after
--   dropping control and invisible format characters, p_at more than 5
--   minutes off the database clock, a missing 'Not Yet' attestation
--   (p_detail.titleApplication; 'title_question'), a closed sale (deal
--   locked FOR UPDATE), a stale or non-bill-of-sale root, and the plate
--   evidence below; locks the rows it voids before reading whether they were
--   signed; dates the void greatest(p_at, clock_timestamp()); voids every
--   current filed row of the set with one group id; deactivates
--   packet_signing_texts; revokes active paperwork_invites (a 'revoked'
--   event each); and writes one team_activity_events row
--   'sale_documents_voided' with the reason, the attestation, the documents
--   and how many were signed.
-- Function end_sessions_before(p_user, p_at), service role only: deletes
--   the account's auth.sessions started before the reset (their refresh
--   tokens go with them).
-- private.current_team_role() gives no role to a request whose session
--   first authenticated (earliest amr time in its JWT) more than 3 seconds
--   before the account's password_reset_at, so every policy and the void
--   function refuse it (no amr time, no reset, or an unreadable reset: no
--   change).
```

A copy filed again after a void sets the existing `parent_agreement_id` to
the newest voided copy of its type. `step_data.plateRecordedAt` (ISO) is
written with the plate when the plate changes: a plate recorded at or after
the bill of sale was filed is the desk's evidence that the title application
went to the county (no recorded time counts as evidence). The auth account's
`app_metadata.password_reset_at` (ISO) records an owner's reset (Security).

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

### First sign-in: onboarding

A new staff member's first sign-in lands on `/admin/account/onboarding`
before anything else (the admin layout redirects there while
`team_members.onboarding_completed_at` is null, or while the account is still
flagged `requires_password_change`). One question per screen, the same
corridor styling, the counter counting only the screens this member gets
("Step 1 Of 4"), English and Spanish:

0. **Choose A Password.** Shown first, and ONLY to an account still on the
   temporary password an approval or a reset issued it
   (`requires_password_change` on the auth account; owner's decision
   10/01/2026). Nobody without the flag ever sees it. Account recovery's
   rule (at least 10 characters, one shared constant), typed twice (new and
   confirm), with a Show/Hide control for both boxes. Saving replaces the
   password and clears the flag in one write, on the signed-in account only
   (resolved from the session, never named by the form). The write sends
   the flag key alone: the auth server merges app_metadata key by key, so
   every other key stays as it is at write time, and a copy read earlier
   (an access_status or desk_role an owner changed meanwhile) is never
   written back. It logs the replacement (never the password) in
   `team_activity_events`, and goes on to the name, the counter carrying on
   from the screens the visit started with ("Step 2 Of 4"; a reload counts
   from the name). There is no Back to it once saved. A member who had already finished onboarding (a reset) gets
   this screen and Done only. Choosing a password through the emailed
   recovery link clears the flag too, so the invite link is not followed by
   a second password screen. **A reset signs out every device signed in
   before it** (owner's decision 10/02/2026; Security): only a session that
   signed in after the reset reaches this screen, a stale one is refused
   ("This device signed in before the password was reset. Sign in again
   first."), and after the save the member is signed straight back in on
   the server with a new device cookie, because the auth server's admin
   password write ends every session, this one included. The screen also
   refuses a roster row that is not active; a reset does not change the
   password of an account that already has one, so an owner who suspects
   the password itself is known sets the member inactive.
1. **What Is Your Name?** First name and last name, two fields, required.
   Saved as `full_name` ("First Last") and `display_name` (first name). This
   is the name that prints in parentheses on the 130-U and under the dealer
   signature lines, so it is the person's legal name, not a nickname. Kept
   exactly as typed (trimmed, spaces collapsed, never re-cased). Refused,
   with the reason, when a part is over 60 characters, holds anything but
   letters, spaces, apostrophes, periods and hyphens, holds a character the
   state form's font (Helvetica, WinAnsi) cannot print, or when
   "(First Last)" would not fit the 130-U seller box at the 7.25pt floor.
2. **Draw Your Signature.** Shown only when the member is cleared to sign
   (`can_sign_contracts`): the signature pad, saved through the same action
   as `/admin/account/signature` (one stored signature, reused on every
   dealer line). Members not cleared to sign skip it.
3. **Done.** Sets `onboarding_completed_at` (never moved once set) and goes
   to Handle A Sale (a role that cannot open it goes to its signature page).
   Refused until the saved name is one step 1 would accept and, for a member
   cleared to sign, a signature is saved, and while the account is still on
   a temporary password (step 0 comes first).

The writes touch only the signed-in member's own row (the service client
replaces the RLS check that needs `team:manage`), and every name write is
logged in `team_activity_events`. Onboarding asks once: a member who has
finished it with a usable name is sent back to work from the page, and the
name action refuses them, so a later change to the name that prints on every
document goes through an owner. The page stays open to a finished member
only while their saved name is one step 1 would refuse, which is where the
filing refusal sends them (a "Finish Onboarding" button on Handle A Sale).
Every refusal carries a code the screen renders from the message catalogue,
so the Spanish corridor never shows an English sentence.

The page must exist before the redirect is deployed: a redirect to a missing
route locks every new member out. Test it with a fresh member in the preview
mock (no name, no signature, onboarding not completed), and with one still
on a temporary password (`DESK_PREVIEW_MEMBER=fresh-temporary-password`).
The page never sends an account on a temporary password away (that would
loop with the layout); step 0 clears the flag, and once onboarding is done
nothing sends the account back, so Handle A Sale opens.

**Who is cleared to sign** (`can_sign_contracts`) is a per-person fact. Its
starting value, written when an owner approves the member, is cleared for
the Owner, Manager and Registration roles and not cleared for every other
role (owner's decision 10/01/2026). An owner turns it on or off for one
person afterwards; a reset never rewrites that choice (the auth account's
mirror of it keeps the person's value, not the role's). The default applies
at approval only: nothing backfills members approved before it, so an Owner
approved earlier stays not cleared until an owner turns signing on for them.

### The website on paper versus the desk's own address

The dealer's public website (e.g. `www.dealer.com`) is a dealer fact that
prints on documents. The desk's own origin (`desk.dealer.com`) is where
signing links and capture QR codes point. They are two values: never print
the desk origin as the website, and never build links from the public
website.

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
| `/admin/sales/[dealId]/packet` | Everything filed: open, print, download, start the signing ceremony, text the buyer; void the filed bill of sale (`?void=billOfSale&return=<step>` opens the dialog from a refusal) and the Voided Copies history. |
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
`voidBillOfSale` (owner or manager; calls the `void_filed_documents`
function), `completeSale`, `deleteSale`. Each: verify the session (or token), validate
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
- For the empty-weight estimate the decode also keeps the raw `Model`,
  `Series`, `DisplacementL`, `DriveType`, `ElectrificationLevel`, `BodyClass`,
  `VehicleType` and the GVWR class code (`Class 1C` gives `1C`), and the
  decode route answers with a sourced estimate beside the decode (see "Empty
  weight (130-U box 11)"). Start A Sale shows it read-only, labelled as an
  estimate; nothing it decoded is submitted.
- The decode is used for the weight only when it agrees with the lot row on
  the year and the make (FORD and Ford, RAM and Dodge are one make). A VIN
  that decodes to another car (a typo) is ignored and the lot row is used.
- A decode that fails or times out never fixes the car's class for good: the
  estimate made from the lot row instead is shown, held for a few minutes and
  never stored, and the decode is tried again on the next screen. Only a
  decoded estimate (or one for a car with no VIN) is kept on the vehicle.
- `CurbWeightLB` is a VIN-pattern value, often the heaviest version of the
  model: measured against crash-test scales it reads +139 lb at the median,
  p95 686 lb, and it is missing before MY2015 and for whole makes (Chevrolet,
  GMC, Kia, Jeep, BMW, Lincoln). It is a cross-check only, never box 11.
  vPIC's GVWR is a class range and is never used for carrying capacity. Body
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
plan answer is locked and the screen names the document holding it. **The
down payment freezes the same way once the bill of sale is filed**
(`billOfSale`, or `salvageBillOfSale` on a tow-away sale; owner's decision
10/01/2026): any change to it, from the money step's "Down today"
(`money.paidTodayAmount`) or from the financing contract's "How Much Are
They Putting Down?" (which writes back to it, whoever answers it), is
refused with "Void the bill of sale and file it again before changing the
down payment", in the corridor's language. Only a change to the figure is
refused: the same amount typed again ("1,500" for 1500), or $0.00 typed on a
financed deal with nothing down, goes through. The figure is compared as
typed, never clamped to the total (the contract prints what was typed). Both
homes store the down payment as one plain figure ("$1,500.00" is saved as
"1500"; an empty box stays empty, which is not $0.00), so the bill of sale's
balance, the contract's itemisation and the note's payment read the same
text; a figure below zero or one that is not a dollar amount is refused
outright, filed or not. "Filed" is the packet's own rule: finalized at the
desk, or completed through the older e-sign path, and never a voided copy.
The check fails closed when the filed documents cannot be read.

**The filed bill of sale holds everything it states** (owner's decision
10/02/2026). Besides the down payment (which keeps its own code and
sentence), every server action that can write something the bill of sale
prints refuses a change with code `billOfSaleFrozen`, the field, and "The
bill of sale is already filed with … Void the bill of sale and file it
again before changing …" (Spanish: "… Anule la factura de venta y vuelva a
archivarla antes de …"); the screens only display it, with **Void The Bill
Of Sale** for an owner or a manager and "Only an owner or a manager can void
it." for everyone else. Held, and the writers that hold them:

- the price and whether it includes tax and fees (`saveSaleMoney`);
- how the buyer pays and the lender (`saveDealFunding`);
- the trade-in (yes/no, the vehicle, the allowance), how the money was paid
  on a cash deal, the mileage statement, the warranty, the bill of sale's
  licence-state answer, and how a salvage car leaves (`savePaperworkAnswer`,
  every bill-of-sale and salvage-bill-of-sale answer);
- the buyer's confirmed name and name parts, ID number and mailing address
  (`saveConfirmedId`); while a power of attorney is filed it holds the name
  and address on its own (it is ink and is never voided at the desk);
- the plan's Still To Do as printed: who files the title and registration,
  where the inspection stands, whether proof of insurance was shown, an
  open row included (`saveSalePlanAnswer`);
- the plate, against the plate the filed copy PRINTED (a bill of sale filed
  with no plate lets the title step record the issued one;
  `saveSalePlate`);
- the language of the sale (`setDealLanguage`);
- at Close The Sale, the ID number against the printed licence, and the
  price: through the vehicle row on a deal with no typed amount (the row is
  what the figures are drawn from), and against the price the bill of sale
  printed on a deal whose amount was typed (the car is marked sold at the
  paper's price; the panel starts from it) (`completeSale`);
- at Start A Sale, the buyer's customer row while another open sale of that
  customer has current filed paperwork: the same buyer starts a second sale
  without the row being rewritten, and a different name with the same phone
  number is refused, naming the other buyer (`startSale`).

Measured as the paper prints it (`billOfSaleStatement`): the same answer
saved again goes through, the same figure typed another way is not a
change, an answer that does not print (a payment method on a financed deal,
who signs the title, whether the price includes registration) is not held.
Pass 1 compares the raw inputs with no lookup; only when one moved is the
filed bill of sale looked up and pass 2 compares what prints, inside the
same version-checked merge. Every lookup fails closed. A guard test
classifies every key the bill of sale's renderer prints as frozen or fixed.
A plan answer held by another filed document (the 130-U, the
acknowledgments, the power of attorney) is refused with code `planFrozen`,
naming the documents and the same way out (a power of attorney needs a new
one). So the down payment, and the rest, belong on their screens before
anything is filed: that is what makes the bill of sale's balance and the
contract's amount financed one figure. A signed document must never
silently reattach to changed terms; the way out is the void below (The
documents, Voiding and filing again).

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
  Business?, What Is The Empty Weight? (skipped when a title, MCO or
  weight-certificate figure is on the vehicle; a one-tap confirmation of a
  sourced estimate; otherwise typed with its source; see "Empty weight (130-U
  box 11)"), What Is The Carrying Capacity? (trucks and vans only, "Not
  Applicable" allowed; starts at the TxDMV minimum for a truck).
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

### Empty weight (130-U box 11)

The state classes the registration fee by box 11 and the county returns an
application without it. The desk works it out and affixes it, and every
figure it files carries its source. Code: `src/lib/vehicles/empty-weight/`.

**Sources, in this order** (measured against 1,706 NHTSA crash-test vehicles
with lab-measured curb weights, MY1996 to 2026):

1. A document a person holds, typed with its kind: Texas title (WEIGHT),
   out-of-state title, MCO, weight certificate, KBB or JD Power (TxDMV
   accepts these). The only source that skips the question.
2. EPA test weight less 300 lb, from a bundled table: coverage 89.9%
   (1,534 of 1,706), median error 67 lb, p95 346 lb. EPA's Equivalent Test Weight is the inertia class
   of loaded vehicle weight, and loaded vehicle weight is curb weight plus 300
   lb (40 CFR 86.1803-01; 40 CFR 1066.805, Table 1 and paragraph (b)), so the
   estimate is the median ETW less 300 with half a class either side (62.5 lb
   to ETW 4,000, 125 to 5,500, 250 above).
3. Transport Canada's curb weight (vPIC `GetCanadianVehicleSpecifications`),
   live, median trim: median error 84 lb. Also the cross-check.
4. vPIC `CurbWeightLB` from the decode: last resort and cross-check (it
   reads high; its range runs 700 lb DOWN from the figure).
5. Nothing: the question is asked exactly as before.

Agreement is a confidence hint, never an approval: EPA and Canada within 150
lb put EPA within 150 lb of the scale 86% of the time; more than 250 lb apart
and the screen shows both figures and the spread. The EPA match is strict
about the engine (displacement within 0.1 L: a V6 never borrows a V8's
weight), matches an EV only to EVs, prefers the hybrid, then the query's own
model, then the drive, tries the model year then Y-1, Y-2, Y+1, and needs the
same series number in the EPA name for a heavy-duty vehicle. "The query's own
model" means an EPA name that adds a different-vehicle word (SPORT, CITY,
CONNECT, EVOQUE, VELAR, CLUBMAN, COUNTRYMAN, GRAND, CROSS, TYPE, PRIME, MAX,
XL, ESV and the like) loses to one that does not: a Bronco is never weighed
as a Bronco Sport, a Cherokee never as a Grand Cherokee. Trim words (LE, SE,
XLE) are not on that list. When only such names match, the match level says
`+partial`. The other way round, a query that names the variant itself (a
Civic whose decode Series is Type R) keeps only the EPA rows that carry it
(`+variant`), so a Type R is weighed as a Type R (3,075 lb), never blended
with the plain Civic's 2,700. Every change to these rules is measured on the
crash-test set before it ships: this one moved none of the 1,706 vehicles,
while adding POLICE to the list made Crown Victoria and Explorer worse and
was left out. The Python reference (`scripts/empty-weight/reference_estimate.py`)
and the TypeScript port apply the same rules and the parity test holds them
equal on every crash-test row.

**Confidence** is low when only vPIC has a figure, when EPA and Canada are
more than 250 lb apart, when the match is `+partial`, when the range is wider
than 600 lb (it spans different vehicles, not one car's trims), when a lot
row with no engine size was matched (every engine blended), or when a
neighbouring year was used with the drive unmatched. High needs EPA same-year
with the drive matched and Canada within 150 lb, from a decode.

**Texas rounding** (applied on the server, shown live on the screen):
round up to the next 100 (VTR-130-UIF box 11). A Texas or out-of-state title
and a weight certificate get nothing added (Vehicle Weight Verification
Guidelines, June 2026; Title Manual 10-4, 10-5). An MCO, KBB or JD Power
figure, and an estimate (a manufacturer-style curb weight), get +100 lb for a
passenger or passenger-truck class vehicle, not for a truck or bus (Transp.
Code 502.055(d)(1); RTB 010-16). Vectors: MCO 3,589 is 3,700; the Title
Manual's 6,415 is 6,600; title 4,200 is 4,200; certificate 3,765 is 3,800.

**The screen, by state:** a document on the vehicle skips the question and is
affixed with its source; a sourced estimate is shown as box 11 with the
sentence that explains it, naming the EPA models it actually stands on, not
the car being sold ("Estimate from EPA test data for the 2019 Toyota Camry
2.5 L: EPA tested the Camry, Camry LE/SE and Camry XLE/XSE (2019) at 3,625
lb, which is the car plus 300 lb, so about 3,325 lb") and the cross-checks,
for one tap (Confirm This Weight); otherwise the figure is typed off a document
and its kind chosen. The input never starts with an unsourced figure. A
legacy `weight_lbs` with no source is shown as "where it came from was not
recorded", never defaulted.

**Gates** (no one-tap confirm; the estimate is a labelled hint and a title,
MCO or scale ticket is needed): a pickup or work truck, a cargo or work van,
a cab-chassis (`INCOMPLETE VEHICLE`), heavy duty (GVWR class 2G, 8,001 lb,
or more, or 2500/3500/HD/Super Duty in the name; 250/350 only on a truck), a
bus, a vehicle whose class nobody knows (no body style on the lot row and no
VehicleType from a decode: it could be a pickup, and an unknown class is
never treated as a passenger car), a low-confidence estimate that no second
source supports within 250 lb, and, as a HOUSE RULE, an estimate whose box
11 at the top of its range is within 300 lb of the 6,000 lb registration
line (5,700 or more). About 1 pickup estimate in 10 lands on the wrong side
of a Texas weight line.

A pickup or work van is known by NAME as well as by body style and vPIC's
VehicleType (`rules.ts` `workVehicleByName`: F-150 to F-450, Silverado,
Sierra, Ram 1500 to 3500, Tundra, Tacoma, Frontier, Titan, Ranger, Colorado,
Canyon, Gladiator, Ridgeline, Maverick, Santa Cruz and the rest; Transit,
ProMaster, Sprinter, Express, Savana, NV, E-Series and the rest), and by an
EPA match named PICKUP, CAB or CHASSIS. Matched on whole words, so a Range
Rover is never a Ranger and a Mercedes E 350 is never a Ford E-350. A lot
body style of "Van" or "Cargo Van" is a work van; "Minivan" is not. A pickup
is a truck for the rounding too: no +100 on its MCO.

**Override with a reason:** the review's Change link reopens the question. A
typed figure whose box 11 differs from a document already on the deal or the
vehicle needs a reason, which is kept. An estimate never replaces a document.
A typed document is also written to the vehicle (`weight_*`) when the caller
may edit vehicles, so the next sale of that car skips the question.

**The record:** the deal carries `emptyWeight` plus `_emptyWeightSource`
(a document kind, `estimate_epa`, `estimate_canada`, `estimate_vpic`, or
`typed_unrecorded` for an answer from before sources were recorded),
`_emptyWeightFrom`, `_emptyWeightReading`, `_emptyWeightRule`,
`_emptyWeightBy`, `_emptyWeightById`, `_emptyWeightAt`, `_emptyWeightReason`
and `_emptyWeightEstimate` (the estimate as shown). The ordinary answer
action refuses those keys; only the empty-weight screen's action writes them.
Filing the 130-U overwrites them in `form_data` from the server's own read
and REFUSES a 130-U whose box 11 nobody settled, and a 130-U whose sale the
server cannot read (there is nothing to take box 11 from, and the client's
figure is never written as it came). Box 11 and its record are among the
answers the filing resolves for itself (`paperworkFilingContext` carries the
empty-weight context), so a review screen that posted a box 11 or a record
the sale no longer holds is refused as `figuresChanged` (Voiding and filing
again); the overwrite comes after that check and after the refiling gates.
The source is shown on the
desk (question, review, webDEALER handoff, sale page) and never printed on
the state form. A weight on the vehicle with no recorded source is shown on
the webDEALER handoff as "Source not recorded; confirm it on the 130-U", has
no copy button (a link to the 130-U instead), is left out of Copy All, and
counts as missing: webDEALER is the filing. The door jamb shows GVWR, not the empty weight: say so in the
question's note.

**Carrying capacity:** a truck starts at the Registration Manual Table 2-1
minimum for its box 11 (1,000 lb up to 6,000 lb empty, then 1,500, 2,000,
3,000, 4,000, 5,000, 6,000, 7,000 to 33,000), labelled as that, on the screen
only, never a default.

**The yearly step:** when EPA posts a new model year's Test Car List, run
`python3 scripts/empty-weight/build_epa_table.py --download` and
`python3 scripts/empty-weight/make_fixtures.py --crash <research dir>`, commit
the regenerated table and fixture, and run the tests. `--download` writes a
`manifest.json` beside the files (URL, sha256 and download date per file;
the same bytes keep their first date). The build reads only the manifest,
never file times, takes `built` as its newest date, and stops on a file the
manifest does not name or whose sha256 changed, so the same files always give
the same table byte for byte. A folder fetched by hand gets its first
manifest from `--urls urls.txt --downloaded YYYY-MM-DD`. The table records
each file's URL, sha256 and download date, ships as one JSON string in a
server-only module, and never reaches a client bundle. Stored estimates made
against an older table are worked out again on their own.

**Open questions for the county** (the confirm step keeps a person in the
loop meanwhile): whether +100 applies to a passenger-truck vehicle registered
as Passenger from a web curb weight, and how RTB 010-16's +100 sits with the
2026 guideline, which mentions it only for MCOs.

### Voiding and filing again

The owner's decision of 10/02/2026: a filed bill of sale can be voided and
filed again; nothing is ever deleted.

- **Who and where.** An Owner or a Manager (`documents:manage`), from the
  packet's **Void** on the filed bill of sale (also linked beside a freeze
  refusal, on the desk page and on the bill of sale's own step). Other roles
  see it disabled with "Only an owner or a manager can void it." The record
  must name a person, so an `ADMIN_EMAIL` owner with no roster row is
  refused.
- **The dialog** (a native dialog like the desk's other confirmations; a
  full-width sheet at 390px): the buyer and the car, "These are voided with
  it:" with each one's state, "These stay on file:" (the power of attorney),
  that nothing is deleted, how many signatures stop counting, the required
  reason (10 to 500 characters, cleaned, kept), the title question **Has
  The Title Application Gone To The County?** (only **Not Yet** goes ahead;
  "Yes" is refused), **Keep It** focused, and **Hold To Void** (the hold
  only arms once the reason and Not Yet are given).
- **What a void takes:** every current filed copy of the bill of sale (or
  salvage bill of sale) and of every document its figures, plan or buyer
  reached: `financing`, `form130U`, `vehicleResponsibility`,
  `insuranceAcknowledgment`, `rebuiltDisclosure`, `towAwayAcknowledgment`,
  `buyerResponsibilityStatement`, all with one group id and the same
  reason. Never the power of attorney (ink on a state form). A guard test
  keeps every document type in exactly one of the two lists.
- **Refused** (each writes nothing): not an owner or manager; no roster
  row; reason outside 10 to 500 characters (counted in characters as the
  database counts them, after dropping control characters and invisible
  format characters such as zero-width spaces and bidi overrides, the same
  rule in the dialog, the action and the database); title question unanswered or
  "Yes"; a plate recorded at or after the bill of sale was filed (the
  desk's evidence the title application went to the county; a plate with no
  recorded time counts too); a completed or abandoned sale; nothing current
  filed or a stale copy; the documents could not be read (fail closed). The
  database function re-checks them under the deal's lock. The safer rule
  was chosen over a stronger warning: once the county or the buyer has the
  paperwork, the correction starts there, with the owner.
- **The record.** Voided rows stay readable under **Voided Copies (n)**,
  grouped by void ("Voided {date} by {name}: {reason}"), each "Was signed by
  the buyer {date}" or "Was filed, not signed", with Open and Print handing
  out the stored document stamped **VOID** (**VOID · ANULADO** on a Spanish
  copy) on every page with that line across the top; the file name carries
  `_VOIDED_<date>`. The row, its payload and its signature are never
  changed. A re-filed copy says "Replaces the copy voided {date}." Every
  date the packet shows (filed, signed, voided, replaces) is the business
  date on the dealership's clock (`dealership.timeZone`), the same day the
  band prints; a void at 7:30 pm in Houston once read as the next day.
- **Counting.** `isFiledAgreement` answers false for a voided row, so every
  reader (the packet, the desk, the sales list, the guide, the texted
  copies, the ceremony) skips it; its guide step opens again ("Voided. File
  it again"). The packet's `refile` count holds what must be filed again (a
  voided type the sale still owes with no current copy, and a document
  printing the bill of sale's figures filed before the current bill of
  sale, or filed while no bill of sale of its kind was current); it reads
  **Waiting For The New Copies** and is never "Ready To Print" while it is
  above zero.
- **Filing again** goes through the corridor's normal steps and three more
  refusals: `billOfSaleAlreadyFiled` (one current bill of sale per sale; the
  older agreements route enforces it too), `billOfSaleFirst` (the documents
  that print its figures, `financing`, `form130U` and
  `vehicleResponsibility`, or `financing` and `towAwayAcknowledgment` on a
  tow-away sale, wait for it; the rebuilt disclosure never does; the
  database refuses the same filing while no bill of sale is current, which
  closes the race with a void) and `figuresChanged`. That last one covers
  three things: the server recomputes the figures and refuses a review
  screen's that differ; it resolves the answers the way the review screen
  does (`paperworkAnswers`, through `paperworkFilingContext`) and refuses a
  posted answer that differs or one the sale does not hold, filling any left
  out with the sale's own, so the mileage statement, trade-in, payment
  method, warranty, how a salvage car leaves, the 130-U's box 11 with its
  source record, and the contract's rate, count and payments are the sale's;
  and a document printing the bill of sale's
  figures must state the figures the current bill of sale PRINTED (read off
  its own completed link). After the void the summary opens with a banner,
  or the screen the void was asked from opens again with `?from=summary`.
- **A filed document is never rewritten in place** anywhere: the older
  agreements route refuses (409) rewriting a sale's filed or voided row's
  payload or status, and trashing it.
- **Complete Sale** is refused while anything voided is not filed again,
  and a sale holding voided records cannot be deleted (abandon it).

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
  **Seller printed name = the dealer's legal name followed by the signing
  person's own name in parentheses**, e.g. `Triple J Auto Investment LLC
  (First Last)`. County tax offices now reject the entity name alone on
  the seller line. The person is whoever's saved signature lands on the
  seller signature band (the staff member filing it, who must be cleared to
  sign), named exactly as they entered it at onboarding (first and last
  name). If that person has no name on record, the parentheses print the
  visible `[Not set: signer name]` marker and filing is refused, never the
  entity name alone (a filer not cleared to sign is refused too;
  `DESK_ALLOW_UNSET_FACTS=true` lifts both for demos and the marker still
  prints). The filer's name and member id are stored on the row
  (`form_data.dealerSignerName`, `dealerSignerMemberId`) and in the
  completed link; a filed 130-U prints only that recorded name, never a
  later viewer's, and a row the filing did not record prints the marker.
  Drafts and previews show the viewer's own name and stroke. A pairing too
  long for one line prints on two at the 7.25pt floor (entity, then the
  person in parentheses), never smaller and never clipped: a name that would
  still not fit is refused at onboarding and at filing, and the fill throws
  rather than cut it off. The same pairing (entity, then the person in
  parentheses) is used wherever a state form asks for the dealer's printed
  name beside a dealer signature, and under the dealer line of every
  dealer-authored sheet (bill of sale, contract, vehicle responsibility,
  insurance acknowledgment, rebuilt disclosure, tow-away sheets) whose
  filing recorded a name.
  **Box 11 (empty weight)** is rounded up to the next 100 per the rules in
  "Empty weight (130-U box 11)", and its source (the document, or the
  confirmed estimate, who confirmed it and when) is recorded in `form_data`,
  never printed on the form. A 130-U with box 11 unsettled does not file.
- **VTR-61 (Rebuilt Vehicle Statement):** printed from title work and signed
  in ink. Wherever the dealership is the owner or the rebuilder, that
  party's "Printed Name (Same as Signature)" is the same pairing,
  `Legal Name, LLC (First Last)`, naming the cleared, onboarded member who
  prints it (owner's decision 10/01/2026): the same name source, the same fit
  rules (9.5pt down to the 7.25pt floor) and the same two-line layout as the
  130-U seller line, at baselines measured between each box's rule and the
  text above it. The entity rows stay the entity alone. The dealership is
  recognised however its name was typed on the standalone form (case,
  spacing, "&" for "and", punctuation, a closing "LLC" or "L.L.C.", its legal
  or trading name), and its entity rows then print the legal name: a
  spelling read as a stranger would print the entity alone beside the
  dealer's signature and ask for no signer. Title work says before the link
  why a member cannot print it, with Finish Onboarding when the fix is
  theirs, rather than leaving the refusal to a bare tab. Printing is refused
  (with the reason) for a member who is not cleared to sign or not named,
  rather than handing over a form with the `[Not set: signer name]` marker;
  `DESK_ALLOW_UNSET_FACTS=true` lifts it for a demo and the marker prints. A
  party that is not the dealership (a repair shop, a private owner) prints
  its own name as typed and needs no signer.
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
   `{dealId, purpose:"packet-signing", exp}` valid **20 minutes**,
   stateless. Minting a new one does not revoke the old one; a **void**
   does: the token's issue time is its expiry less the 20 minutes, and a
   token issued at or before the deal's latest void is refused everywhere
   (the ceremony page says "This link was replaced" in both languages, the
   buyer's document routes answer 410, `signPacketDocument` answers
   `replaced`), and a voided row is never shown or signed (404 /
   `voided`). The void is dated the later of the app's time and the
   database's clock at the moment of voiding, so a link minted while the
   void was on its way is dated before it and dies too; a link minted after
   a void is dated just after it (`signingIssueTime`), so it is never born
   revoked. The void also switches off the texted link, so Text It sends
   a new one. It lets its holder read that one deal's filed
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
  vehicle sold, and moves it to Past Sales. It is refused while anything
  voided with the bill of sale is not filed again ("Some paperwork was
  voided and has not been filed again: … File it before closing the
  sale."), and once a bill of sale is filed it keeps the price and the ID
  number the bill of sale printed (the ID box starts from the printed
  licence). The check reads the documents fail closed.
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
- **A password reset signs out every device** (owner's decision
  10/02/2026). Every owner path that resets an account or issues it a
  temporary password stamps `app_metadata.password_reset_at` (ISO) and logs
  it. From then on a session counts only if it signed in after that
  moment. The guarantee is the desk's own HMAC device cookie
  (`<issuedAtMs>.<userId>.<sig>`, minted by every sign-in path and by
  nothing else, and bound to the account that signed in): missing, invalid,
  issued before the reset, or minted for another account means signed out
  (so a fresh cookie from one's own account can never carry another
  member's pre-reset session past the cutoff; the older two-part form is
  still read, and every one of those predates any reset). The
  session's EARLIEST authentication time (`amr` from `getClaims()`, 3 s of
  skew) can only add a refusal; when it cannot be read the cookie decides.
  The JWT's `iat` is never used (a refresh re-issues it). Checked only when
  a reset is recorded, in the proxy (a local `signOut`, the best effort the
  SDK offers since it has no sign-out by user id; the auth cookies and the
  device cookie cleared; a redirect to `/admin/login?notice=signed-out-reset`,
  never a bounce from the sign-in page), in the current-admin check
  (`signedOut: "passwordReset"`; the layout and template redirect, actions
  refuse with "Your password was reset, so this device was signed out. Sign
  in again."), in the API guard (401) and at Choose A Password. Every
  sign-in path mints the cookie BEFORE it asks whether the person is on the
  team and hands it to that check (the OAuth callback once judged a reset
  account's new sign-in by the old cookie and signed it straight back out
  as "not on the team", for good). The database holds the line as well:
  every stamping path calls `end_sessions_before` (best effort), which ends
  the account's older auth sessions and their refresh tokens, and
  `private.current_team_role()` gives no role to a session whose earliest
  amr time predates the reset, so RLS and the void function refuse a stale
  device that goes around the desk with the public key. A reset time nobody
  can read signs nobody out and is logged as an error. The preview mock
  supports it (`DESK_PREVIEW_MEMBER=fresh-reset`, with the preview's own
  signed-in-time cookie standing in for the device cookie). Left: an access
  token with no amr time (an older format) is refused by the desk and ends
  at its expiry; a signing link a stale session minted lives out its 20
  minutes (it signs one deal's documents, it is not admin access).

## Tests you must write (pure modules, no database)

- Money: every test vector above, plus "$" and "$3,000.00" parsing, empty vs 0,
  paid clamp, lender balance always 0.
- Plan: the derived chain on both branches; `false` counts as answered;
  invalidation on switching registration; each document effect; the freeze
  list; POA instrument at 19, 20 and unknown years.
- Down-payment freeze: a filed bill of sale (or salvage bill of sale) refuses
  a changed down payment from the money step and from the contract, with no
  write; the same figure typed differently, and $0.00 on a financed deal
  with nothing down, go through, stored as the plain figure with the note's
  principal and payment unchanged; "-500" and "abc" are refused with no
  write; a bill of sale completed through the older e-sign path freezes too.
- The bill of sale holds everything it states: the statement changes for
  every held field and not for the same figure typed differently, an empty
  amount that resolves to the same figures, or an answer that does not
  print; every writer returns `billOfSaleFrozen` with the field and writes
  nothing once filed, saves the same answer, moves freely before filing and
  after a void, and fails closed when the lookup throws; a filed power of
  attorney holds the name and address; every key the renderer prints is
  classified; the refusal exists in both languages with the way out.
- Void and file again: the cascade covers every document type exactly once
  and never the power of attorney; each refusal writes nothing; the void
  marks rows with one group and deletes nothing; the mock and the database
  (a real Postgres run of the migration) refuse any write to a voided row;
  voided rows stop counting and their steps reopen; an old signing link is
  refused once the deal has a later void; the voided PDF is stamped and the
  stored bytes are not; the three filing refusals; Complete Sale and delete.
  And on the database (a real Postgres run): a row inserted already voided
  is refused; a signed-in session writing voided_at through the API is
  refused, even an owner's; the power of attorney is never voided; the
  function refuses a shorter or longer list of types and a missing "Not
  Yet", writes the session's own name whatever the caller passes, drops
  invisible characters from the reason, and dates the void no earlier than
  now; a dependent document cannot be filed while no bill of sale is
  current. In the app: the reason rule counts code points and ignores
  format characters; a filing posted with an answer the sale does not hold
  is refused and a left-out answer filled (a 130-U posted with a box 11 or
  a box 11 source the sale does not hold too, and one past every refiling
  gate with no settled box 11 still does not file); a dependent whose figures the
  current bill of sale did not print is refused; Close The Sale's price on a
  typed-amount deal must be the printed one; Start A Sale refuses a
  different name on a held customer's phone and never rewrites the row; the
  older agreements route never rewrites, trashes or duplicates a sale's
  filed document; an accented buyer name reaches the file name intact;
  the packet's dates are formatted on the dealership's clock.
- Password reset: the cutoff's truth table (no reset, no cookie, cookie
  before, after, amr before beyond the skew, within it); the earliest amr;
  every reset and approval path stamps the time; the current-admin check,
  the API guard and the preview sign out a stale session and let a fresh
  one in; Choose A Password refuses a stale device, keeps its single pinned
  write, and signs the member back in. The device cookie names its account
  and never vouches for another (a stale session paired with a fresh cookie
  from another account is signed out even with no claims to read); every
  sign-in path mints it with the account; the OAuth callback lets a reset
  account back in with a new cookie and still turns away a stranger; every
  stamping path ends the older sessions at the database; on Postgres, a
  session whose earliest amr predates the reset holds no team role, and an
  unreadable reset changes nothing and is logged.
- Onboarding: "Choose A Password" only with `requires_password_change`; the
  10-character floor and the confirmation; the write goes to the session's
  own account and clears the flag; Done refuses until it is cleared; signing
  clearance at approval is Owner, Manager and Registration only.
- VTR-61: the dealership recognised however its name is typed, on both
  routes; the dealer's printed name is the pairing in one line or two at the
  floor, the marker when nobody is named, refused for a member not cleared
  or not named.
- Documents: `requiredDocumentTypes` for all 3 fundings × both registration
  branches × insurance yes/no × title clean/rebuilt, and the three salvage
  paths; lender never includes `financing`.
- Guide: step lists for a cash dealer-files sale, a buy here pay here sale, a
  bank sale, a buyer-files sale, a rebuilt car and a tow-away; no document
  step before the plan completes; `nextOpenStep`.
- Tokens: expiry, tampering, wrong purpose.
- AAMVA: US and Canadian date orders, `NONE`, 9-digit ZIP.
- VIN: valid, invalid characters, wrong length, check digit.
- Empty weight: box 11 rounding vectors (MCO 3,589 to 3,700; 6,415 to 6,600;
  title 4,200; certificate 3,765 to 3,800; no +100 on a truck) and Table
  2-1; the TypeScript EPA estimate equal to the Python reference on a
  crash-test fixture, with coverage at least 85%, median error at most 75 lb
  and p95 at most 400 lb; a Silverado 2500 never matching a light-duty or
  Suburban row; a 3.6 V6 getting no V8 weight; EVs only to EVs; an estimate
  or legacy weight never a default and never filed unconfirmed; a document
  on the vehicle skipping the question and affixing its source; the gates
  (pickup, cargo van, cab-chassis, heavy duty, bus, unknown class, low
  confidence uncorroborated, near 6,000 lb) refusing a one-tap confirm on the
  server; a bare pickup row (no body style, no decode: 2018 F-150, Gladiator,
  Frontier, Ranger, Maverick, Santa Cruz) coming out a truck with no +100,
  and Range Rover, E 350, B 250 and Camry never read as work vehicles; a
  Bronco never weighed as a Bronco Sport and a Cherokee never as a Grand
  Cherokee, a ProMaster matched only to PROMASTER CITY marked `+partial` and
  low confidence, a Civic whose Series is Type R weighed on the Type R rows
  only (`+variant`) while a plain Civic never takes them, and the method
  sentence naming the EPA models; a failed
  decode's lot-row estimate never stored and retried after minutes; a stored
  estimate stale once the row's VIN, year, make or model change; a decode
  for another make ignored; an unsourced vehicle weight never in webDEALER's
  Copy All and counted as missing; a 130-U refused when its sale cannot be
  read; the table build reading no file times and stopping on an unmapped
  file; an override needing a reason; the printer never
  using an estimate or an unsourced weight; webDEALER never showing an
  estimate; the lookup silent on failure and never writing `weight_lbs`; the
  public site never seeing a weight column; every weight string in both
  languages with no banned dash.
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
   And four for box 11: a car with an EPA estimate confirmed with one tap,
   a car with a title figure on file (no empty-weight screen; the review
   names "Texas title"), a car no source knows, entered by VIN through
   "Not on the lot?" (`no-source`: a 1991 Geo Storm, which EPA's table,
   Transport Canada and vPIC all lack; the question is asked exactly as
   before, reading "Not on any record", and the typed title figure files
   with its source), and a pickup (the screen asks for a document and
   shows the estimate as a hint; after a title figure, carrying capacity
   starts at the Table 2-1 minimum). On the estimate card, check the method
   sentence names the EPA models it stands on; on a car with a weight but no
   recorded source, check the webDEALER handoff shows it with a link to the
   130-U and no copy button.
   A title figure typed on one sale is written to the car, so every later
   sale of that car skips the question, as it should. The in-memory preview
   reuses the same few cars across walks: walk the estimate confirm first on
   a freshly started server, before any walk that types a weight for the
   same car (the scenarios' 2019 Camry is also `cash-otd`'s).
   On each: screenshot every step, sign every document through the ceremony,
   and finish at a packet reading "N Of N Signed".
3. Before trusting any screenshot, assert one computed style the client's
   theme sets (for example the accent colour on the current answer) and fail
   if it is wrong.
4. Download every PDF of one full packet through the same route the Open
   button uses, rasterise the pages, and read them: the 130-U's filled fields
   dumped by name (applicant, address, county, licence, odometer, lienholder,
   and `11 Empty Weight` beside the filed `form_data._emptyWeightSource`,
   `_emptyWeightReading`, `_emptyWeightRule`, `_emptyWeightBy` and
   `_emptyWeightAt`, read from `GET /api/documents/agreements/<id>`; the
   two must agree, and the source must be the one the review named),
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
store "done"; ask a question the record already answers; file an estimated
weight nobody confirmed; restyle the client's public site; run destructive
database operations.