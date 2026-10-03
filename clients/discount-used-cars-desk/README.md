# Discount Used Cars and Trucks sale desk (Handle A Sale)

The admin sale desk for Discount Used Cars and Trucks, LLC (8108 Gulf Fwy,
Houston). It takes a car sale from "who is buying" to a signed, printable
packet and a title filing, one question per screen, with every figure
computed and nothing typed twice.

It is a fork of the desk built for an earlier dealer, which is itself a port
of the desk that runs in production at the reference dealership. The routes,
step engine, money math, document rules, signing flow and data model are
unchanged. The brand inputs, the dealer facts, the fact guard and the copy
that names the dealer differ, plus these deliberate code changes, each of
which only moves a dealer fact into the config or stops a missing one from
being invented:

- **Hours formatter** (`hoursLines` in `dealership-config.ts`): lists every
  closed day ("Saturday And Sunday: Closed"), not only Sunday, and prints
  `[Not set: business hours]` when no open rule exists instead of a typed
  09:00 to 18:00.
- **Venue county:** the bill of sale's governing-law clause and its Texas-law
  acknowledgment (a `{dealerCounty}` message token), the financing contract,
  the rental agreement and the VTR-271 grantee read `dealership.county`
  instead of a typed "Harris". The printed text is unchanged.
- **130-U prefill:** the previous owner's city and state come from the
  config's address instead of a typed "Houston", "TX".
- **Support email:** customer emails print the dealer's email, or
  `[Not set: dealer email]`, instead of a `support@<site host>` mailbox nobody
  confirmed.
- **SMS assistant prompt:** states only supplied facts. It no longer says the
  dealer "finances", and it leaves out the owner and offers lines while they
  are unset.
- **Rental agreement:** the reference dealer's monogram watermark is gone, and
  the header ring and legal name are black ink like every other document.

The look is the public site's: a pale grey ground, white cards, black ink and
black actions, one narrow grotesk (Barlow Semi Condensed, self-hosted) in
Title Case, and a black rail carrying the red car swoosh over a wide
"DISCOUNT" wordmark. The logo is the only colour. Light screens (sign-in, the
buyer's signing pages) carry the full-colour logo; printed documents carry
the black-ink logo only, because a photocopier turns red and navy to mud.

| File in `public/brand/` | Use |
|---|---|
| `discount-logo-sm.png` / `.webp` | Full-colour logo, light grounds (`NEXT_PUBLIC_BRAND_LOGO`) |
| `discount-logo-reverse-sm.png` / `.webp` | Same with the navy turned white, black grounds (`NEXT_PUBLIC_BRAND_LOGO_REVERSE`) |
| `discount-mark.png` / `.webp` | The red car swoosh alone, set over the drawn name in the rail (`NEXT_PUBLIC_BRAND_MARK`) |
| `discount-logo-ink-sm.png`, `discount-mark-ink.png` | Black ink, printed documents only (`NEXT_PUBLIC_BRAND_LOGO_INK`, `NEXT_PUBLIC_BRAND_MARK_INK`) |
| `discount-icon-512.png` | Square app icon; `src/app/icon.png` is made from it |

The public site (`clients/discount-used-cars-site`, Vite) is a separate app.
The desk is a separate Next.js app, meant to be served at `desk.<domain>`.

## Run it

```bash
npm install          # .npmrc sets legacy-peer-deps; versions follow the reference lockfile
cp .env.example .env.local
npm run dev          # http://localhost:5190/admin/login
npm test             # unit tests (vitest)
npm run lint && npx tsc --noEmit && npm run build
```

With no Supabase variables set, the desk runs on an in-memory preview mock
(local only). Any email signs in. Set `DESK_ALLOW_UNSET_FACTS=true` in
`.env.local` to walk a sale all the way to a signed packet before the dealer
facts exist.

To walk a new member's first sign-in in preview, set
`DESK_PREVIEW_MEMBER=fresh` (cleared to sign), `fresh-cannot-sign`, or
`fresh-temporary-password` (cleared to sign, and still on the temporary
password an approval issues, so onboarding starts with Choose A Password).
The preview session then has a roster row with no name, no signature and
onboarding not completed, and is sent to `/admin/account/onboarding` first.
What onboarding saves lasts until the dev server restarts. Leave it empty for
the ordinary preview. It is ignored in production.

The preview "fresh" member is an Owner, so its first sign-in includes Your
Fees (see "Dealer fees" below) after Draw Your Signature. Set
`DESK_PREVIEW_MEMBER=fresh-sales` and the preview cookie `sales:<email>` to
walk a salesperson's first sign-in instead: it has no fees step, and
`/admin/dealership/fees` is refused to it.

`DESK_ALLOW_UNSET_FACTS=true` lets a missing fact print as `[Not set: …]`
for a demo, and lets a sale file before its government fees are recorded
(the desk's defaults print instead). It never lifts a fee limit: a
documentary fee above $225.00 without an OCCC filing in force, a fee above
the filed maximum or above today's fee, a dealer-deputy fee above $10.00, a
Ch. 345 vehicle, or any other dealer fee line is refused at filing with or
without it.

`NEXT_PUBLIC_DEALER_OCCC_FILED_MAX`, `_FILED_ON`, `_EFFECTIVE_ON`, `_LICENSE`
and `_LOCATION` seed a documentary fee maximum filed with the OCCC, for a
dealer that filed one, outside production only (in production a filing
counts only from the owner's audited save). All five or none; they are
empty by default and no filing is ever assumed. The test suite sets them to
a fixture labelled `TEST FIXTURE` (`vitest.config.ts`) so its $292
arithmetic vectors still file; that is not Discount's filing.

The browser walks the verification uses
(`.claude/skills/premium-dealer-build/scripts/desk-walk/`) need a dev server
on 5190 started with `ADMIN_SESSION_SECRET` and `INTERNAL_RENDER_TOKEN`
set (any long random value locally) and `CHROME_PATH` pointing at a
Chromium for the PDF renderer; `docs/verification/VERIFICATION.md` lists the
exact commands.

## Dealer facts: nothing is invented

Every dealer fact is in `src/lib/dealership-config.ts` and nowhere else. A
guard test (`src/__tests__/no-hardcoded-dealer-facts.test.ts`) enforces it:

- **This dealer's facts** (name, legal name, phone, both phone numbers,
  street, ZIP, GDN, Facebook page, venue county, public website) may appear only in the
  config. It reads `src/`, `messages/`, `supabase/` and the root config
  files, with comments removed by the TypeScript parser. Tests and this
  documentation are not checked for them.
- **The earlier dealers' facts** (phones, streets, ZIPs, licences, names,
  domain, Facebook page, emblem files, the glass business, the reference
  monogram) may appear nowhere outside `src/__tests__/`. That includes
  comments, the config, this README, `.env.example`, `docs/`,
  `verification/` and `public/`. The one exception is the two stored
  vehicle-location values in the fixed data model (`src/types/database.ts`).
- An environment variable may not fall back to a dealer's value
  (`||`, `??` or `?.trim() ||`), and the short name followed by "Auto" is
  refused as an invented trading name.

Verified 10/01/2026:

| Fact | Value | Source |
|---|---|---|
| Display name | Discount Used Cars and Trucks | TxDMV (DBA on GDN P145000); Google listing at 8108 Gulf Fwy |
| Short name / wordmark | Discount | The dealer's logo |
| Legal name | Discount Used Cars And Trucks, LLC | TxDMV Independent (GDN) Motor Vehicle Dealers List, current 10/01/2026; Texas SOS file 0802832466 (domestic LLC, formed 10/09/2017). Both hold it in capitals ("DISCOUNT USED CARS AND TRUCKS, LLC"); the desk writes it in the casing its document name normaliser produces, so the bill of sale and the 130-U print the same name |
| Dealer licence (GDN) | P145000 | TxDMV: Active, Motor Vehicle (independent), active since 11/06/2017, expires 09/30/2027 |
| County | Harris | TxDMV |
| Address | 8108 Gulf Fwy, Houston, TX 77017 | TxDMV, Comptroller, Google listing (ZIP+4 77017-3620, no suite) |
| Phone | (713) 900-5050 | Owner: billboard artwork and texts, confirmed 10/01/2026 (also the Google listing and the "713 900 50/50" sign). The TxDMV licence record lists (713) 203-3890, which is not printed |
| Time zone | America/Chicago | Houston |
| Hours | Tuesday to Saturday, 10:00 AM to 7:00 PM; Sunday and Monday closed | Owner: billboard artwork and texts, 10/01/2026 (supersedes the Google listing) |
| Public website | www.discountusedcarsandtrucks.com | Owner: billboard artwork and texts, 10/01/2026. Printed on documents; never a base for links |
| Languages | English and Spanish | "Se Habla Español" on the dealer's sign (historic), pending the owner's confirmation |
| Facebook | https://www.facebook.com/Discountusedcars/ | The dealer's page |
| What it sells | Pre-owned cars, trucks and SUVs | |

**`null` until the owner supplies them:** owner, documentary fee,
late-handling fee (Vehicle Responsibility Acknowledgment), email (the
Buyer's Guide's Email box prints `[Not set: dealer email]`, never the
website), the sender mailboxes customers receive mail from
(`RESEND_FROM_EMAIL`, `SUPPORT_FROM_EMAIL`; Resend mail stays unsent until
they are set, and none is built from the website's domain), payment
destinations (Zelle, Cash App, Apple Pay, PayPal), SMS provider, salvage
dealer licence, lenders and map position.

Until a fact is supplied, every screen and document prints `[Not set: …]` in
its place, and filing a document is refused while a legal fact (legal name,
licence, county, documentary fee, website domain) is missing, and while the
desk's own address (`NEXT_PUBLIC_SITE_URL`, "Desk address") is unset. The
Vehicle Responsibility Acknowledgment alone is also refused until the
late-handling fee is supplied (typed as dollars: `100`, `$100` and `1,000`
all read; anything else, or a negative figure, keeps it refused with the
reason). Filing is also refused if the desk's address and the public website
are the same host, in either direction. The Handle A Sale screen lists what
is missing.

**Who signs for the dealer** is not a config fact. The 130-U seller line
prints the legal name followed by the filing member's own name in
parentheses, `Discount Used Cars And Trucks, LLC (First Last)`, and every
dealer signature line prints the same pairing (owner's instruction
10/01/2026: county offices no longer accept the entity alone). The name is
the one the member entered at onboarding, exactly as typed (casing
included), and their saved signature goes on the line. Filing is refused for
a member who is not cleared to sign or has no usable name on record; with
`DESK_ALLOW_UNSET_FACTS=true` it files and prints `[Not set: signer name]`
instead. A name whose "(First Last)" would not fit the 130-U seller box at
the form's smallest size (7.25pt) is refused at onboarding and at filing,
never printed cut off. The VTR-61 (Rebuilt Vehicle Statement, printed from
title work) prints the same pairing in the owner's and the rebuilder's
"Printed Name (Same as Signature)" wherever the dealership is that party,
naming the member who prints it, by the same fit rules; a member who is not
cleared to sign or not named is refused the form (owner's decision
10/01/2026). The title work screen says so before the link, with Finish
Onboarding when the fix is the member's own. On the standalone form the
dealership is recognised however its name is typed ("&" for "And", with or
without "LLC" or the punctuation), and its entity rows then print the legal
name.

**The down payment goes on the money step**, in "Down today", before any
document is filed. Once the bill of sale is filed, the down payment is
frozen: changing it on the money step or on the financing contract is
refused until the bill of sale is voided and filed again (owner's decision
10/01/2026). That keeps the bill of sale's balance and the contract's amount
financed one figure. The desk stores the down payment as a plain figure
("$1,500.00" is saved as 1500), so the same amount typed another way is not a
change, and it refuses a figure below zero or one that is not a dollar
amount, filed or not. "Filed" here is what the packet shows as filed or
signed, including a bill of sale completed through the older e-sign path.
**Once the bill of sale is filed it holds everything it states** (owner's
decision 10/02/2026). Besides the down payment, a change to any of these is
refused, on the screen and in the server, with "The bill of sale is already
filed with ... Void the bill of sale and file it again before changing ..."
in English or Spanish: the price and whether it includes tax and fees, how
the buyer pays (cash, buy here pay here, a bank) and the lender, the
trade-in (whether there is one, the vehicle and the allowance; the payoff is
never asked and prints as zero), how the money was paid on a cash deal, the
mileage statement, the warranty, how a salvage car leaves the lot, the
buyer's name, ID number, licence state and mailing address, the plan's Still
To Do (who files the title and registration, where the inspection stands,
whether proof of insurance was shown), the plate the bill of sale printed,
and the language of the sale. Close The Sale keeps the price and the ID
number the bill of sale printed (on a deal whose amount was typed at the
money step, the car is marked sold at the price the bill of sale states).
Start A Sale never renames a buyer another open sale's filed paperwork names:
the same buyer can start a second sale, but a different name typed with the
same phone number is refused with the other buyer's name and the way out. The same answer saved again goes through,
a figure typed another way is not a change, and a bill of sale filed with
"no plate yet" still lets the title step record the issued plate. Every
check reads the filed documents first and refuses if they cannot be read.
A filed 130-U, power of attorney or acknowledgment holds the plan answers it
depends on in the same way, and a filed power of attorney (ink on the
county's form, never voided at the desk) also holds the buyer's name and
address. The way out is to void the bill of sale and file it again (below).

### Voiding a filed bill of sale

An **Owner or a Manager** voids the filed bill of sale from the packet
(**Void** on the bill of sale's row, or **Void The Bill Of Sale** beside a
refusal or on the sale's page). Other roles see the control disabled with
"Only an owner or a manager can void it." The dialog reads back the buyer
and the car, what is voided and what stays on file, and asks two things:
**why** (10 to 500 characters, kept on the record) and **Has The Title
Application Gone To The County?** Only **Not Yet** lets it go ahead (the
answer is recorded); then **Hold To Void**.

- **What is voided:** every current filed copy of the bill of sale (or the
  salvage bill of sale) and of every document its figures, its plan or its
  buyer reached: the financing contract, the 130-U, vehicle responsibility,
  the insurance acknowledgment, the rebuilt disclosure and the tow-away
  sheets, each with the same reason. **What stays:** the power of attorney,
  which is ink on the county's form.
- **The reason must say something:** invisible characters (zero-width
  spaces, direction overrides) are dropped before the 10 characters are
  counted, by the desk and by the database alike.
- **Nothing is deleted.** Each voided copy stays in the packet under
  **Voided Copies**, with who voided it, when and why; Open and Print hand
  it out stamped VOID across every page with that line on top. The stored
  record is never changed. One `sale_documents_voided` event is written to
  `team_activity_events`.
- **Signatures on the voided copies stop counting,** and the packet's
  "N / N signed" counts the current copies only. The old signing link stops
  working (the buyer sees "This link was replaced" in both languages) and
  a texted copy of the old paperwork is revoked; the packet shows a new
  link, and Text It sends the new one.
- **Then change what needed changing and file again.** The summary opens
  with a banner, and a void asked from a refused screen lands back on that
  screen. The corridor files the documents again through its normal steps:
  the bill of sale first (the documents that print its figures wait for
  it), with the figures AND the answers the server works out itself: a
  review screen left open while something changed, or a request made by
  hand, is refused with "The figures changed since this screen opened". The
  contract, the 130-U and the other documents that print the bill of sale's
  figures must state the figures the current bill of sale printed, and the
  database refuses filing one while no bill of sale is current (so one
  filed at the very moment of a void can never stay current). The packet reads
  **Waiting For The New Copies** until every voided document the sale still
  owes is filed again, and **Close The Sale is refused** until then.
- **When it is refused:** the sale is closed (completed or abandoned); a
  plate was recorded on the sale after the bill of sale was filed (the desk
  reads that as the title application having gone to the county); the
  answer to the title question is "Yes"; or the person has no team row (the
  record must name who voided). Those corrections go through the county
  first; ask the owner.
- **A sale holding voided records cannot be deleted** (abandon it instead).
- **Only the desk's void function voids.** The database refuses a row
  written already voided, a voided_at written straight through the API (even
  by an owner), a void of the power of attorney, and a direct call that names
  fewer documents than the full set or skips the "Not Yet" answer; who voided
  is always the signed-in session's own team row. The older document routes
  cannot rewrite, trash or duplicate a sale's filed bill of sale either.

## Dealer fees: set once, used on every sale

The figures and citations below are the agency rulebook's
(`.claude/skills/premium-dealer-build/references/texas-dealer-fees.md`, as
of 2026-10-03), mirrored in `src/lib/legal/texas-dealer-fees.ts`. A test pins
the module to the rulebook's machine-readable block, and the skill's
`scripts/check-fee-module.cjs` diffs them on every build and every January.

### Owner steps

**1. Enter the fees at onboarding.** Apply the migration first (below). The
Owner's first sign-in asks **Your Fees** after Draw Your Signature and before
Done. Six screens, each with its citation on one quiet line:

1. *Do You Write Finance Contracts?* (optional NMLS ID and legacy ALECS
   licence). Charging every buyer the same documentary fee is the desk's
   policy; the law requires the fee be charged to cash and credit buyers
   alike (Fin. Code §348.006(c)(1)).
2. *What Is Your Documentary Fee?* One dollar box. Above $225.00 it is
   refused live (7 TAC §84.205(b)(1), in force since 2024-07-11) unless you
   press **I Filed A Higher Maximum With The OCCC** and record all five
   facts of that filing: the maximum, the date you filed it, the date it took
   effect, your licence or NMLS ID and the location. A filing dated in the
   future, one whose effective date is before its filing date, or one not yet
   in effect for a fee above $225.00 is refused: a notification counts only
   once the OCCC has received it (§84.205(c)(3)), and charging above $225.00
   before that is a violation (§84.205(c)(5)(A)). The fee may never be above
   the filed maximum (§84.205(d)).
3. *Are You A Dealer Deputy?* Only if your county deputized the dealership:
   the title convenience fee the county approved, $10.00 at most (43 TAC
   §217.168(b)(2)). Recorded; charged $0 until a later update charges it.
   The state's own title fee applies to every sale either way.
4. *Vehicle Inventory Tax.* In business on January 1, passed on, and the
   unit property tax factor (Tax Code §23.121-.122). Recorded, not charged.
5. *Do You Finance Motorcycles, ATVs, Mopeds Or Towable RVs?* A yes is
   recorded with a warning. Their fee is capped at $200.00, or $250.00 on a
   contract that also covers land or watercraft (7 TAC §86.201(c)-(e); Fin.
   Code §345.251), and this desk does not write their paperwork: a bill of
   sale or contract for one is refused at filing (`chapter345Vehicle`).
6. *Review.* Each fee with its limit and citation, "Dealer charges on top of
   the price: $X of $Y allowed", the state's lines for your county
   (read-only), then **Save Fees**.

"Set These Later" finishes onboarding without them; until a documentary fee
is saved (or seeded in the environment outside production), filing stays
refused ("Documentary fee").

**2. Change them later.** **Your Fees** in the sidebar (under More on a
phone), or `/admin/dealership/fees`, Owner only: managers and salespeople do
not see the link and are refused the page and the save. Each fee has a
Change button that opens the same screens; Save Fees records who changed
what, from and to, and shows it in the history on that page. A second tab
saved earlier is refused, never allowed to overwrite. Print
`/admin/dealership/fees/notice` and post it at every desk where sales close
(Fin. Code §348.006(d)).

A change applies to sales started after it. A sale in progress keeps the
fees it started with; while nothing is filed on it, its page offers **Apply
Today's Fees** (logged). If you lower the fee, remove an OCCC filing, or a
filing's maximum changes, a sale that started under the old figure is
refused at filing until you apply today's fees to it (`feeOverLimit`, or
`feeAboveToday` when it is above today's fee). A sale whose bill of sale is
filed keeps its own figures until it is voided.

**3. Record each sale's government fees.** On every sale, before the bill
of sale, contract or vehicle responsibility form is filed, open
**Government Fees** (the review's refusal links to it, and so does the sale
page) and copy webDEALER's computed fees for that sale: the buyer's county,
the title fee ($33.00 or $28.00 by county, Transp. Code §501.138(a)), the
registration side (everything webDEALER lists there: registration with
TexasSure, the county's local fees, processing and handling, and the
emissions fee where it applies), the inspection program replacement fee
($7.50, or $0 for an exempt vehicle; its own line, OCCC Bulletin B25-1) and
the license plate fee ($10.00, or $0 for a vehicle exempt from registration
fees; 43 TAC §215.155(e)). The desk shows its own estimate beside each box
as a check; webDEALER's figure is the one saved. A government line on paper
must be the amount paid to the state (Fin. Code §348.005; OCCC Agreed Order
L25-087), so filing is refused until they are recorded
(`governmentFeesUnconfirmed`), refused if the 130-U names another county
(`governmentFeesCountyChanged`), and refused if the record is malformed or
outside the cited lines (`governmentFeesInvalid`). The screen locks once the bill of sale is filed:
void it to change them. A tow-away salvage sale registers nothing and never
asks. `DESK_ALLOW_UNSET_FACTS` (demos only) lifts the "not recorded" refusal
alone, never a limit.

### The limits, each on its own (there is no combined cap)

- **Documentary fee:** $225.00 or less is presumed reasonable (7 TAC
  §84.205(b)(1); Fin. Code §348.006(f)), the same for franchised and
  independent dealers. More only up to a maximum filed with the OCCC and in
  force (above). Every charge for paperwork, whatever it is called, is the
  documentary fee.
- **Dealer-deputy title convenience fee:** $10.00 at most, and only for a
  county-deputized dealer (43 TAC §217.168(b)(2), in force since 2025-07-01).
- **Vehicle inventory tax:** at most the net sales price times the unit
  property tax factor, only for a dealer in business on January 1 (Tax Code
  §23.121-.122).
- **No other dealer fee line exists.** Any other dealer charge belongs in the
  taxed vehicle price (Fin. Code §348.005; 43 TAC §215.250(a)). Texas law has
  no single cap on dealer fees (the rulebook's absence finding, 2026-10-03).
- **Government fees** pass through at the amount paid (above). Sales tax is
  6.25% of the price less any trade-in (Tax Code §152.021, §152.002(b)(5)),
  including on an out-the-door price with a trade-in.

### How it is enforced

**Refused, never trimmed.** The screen, the server action
(`saveDealerFeesAction`) and the database function
(`save_dealer_fee_schedule`) each refuse a value over its limit, and the
OCCC filing's dates, with the same codes; none lowers it. The save is
compare-and-set on a version number under a transaction lock.

**Each sale keeps the fees it started with.** Start A Sale copies the
schedule into the deal (`step_data.fees`); the money step, the bill of sale,
the contract and the webDEALER hand-off read that copy, with the sale's
recorded government fees (`step_data.governmentFees`) in place of the desk's
title and registration defaults. Neither key can be written by the generic
step-data writer (`fees-protected`), and the database refuses a fee copy
that is not the schedule as it stands (`trg_deal_fee_copy_guard`). Filing
re-checks the copy against the law, against today's fee, against the logged
change it came from and against the desk's own government defaults, and
refuses (`feeOverLimit`, `feeAboveToday`, `otherDealerFee`,
`feeRecordTampered`, `titleFeeNotState`, `feeSettingsUnreadable`,
`chapter345Vehicle`, and the three government codes above).

**On record.** `dealer_fee_schedule` is one row; every save adds a row to
`dealer_fee_schedule_changes` (append-only, one row per version) and a
`team_activity_events` line naming who changed what, from and to. Applying
today's fees to a sale, a legacy sale's one-time copy, and each government
fee record are logged on the sale too.

**The notice.** The exact statutory notice (Fin. Code §348.006(c)(3)(B))
prints in bold capitals beside the documentary fee: on the bill of sale and
the salvage bill of sale directly under the fee line, and on the finance
contract directly under item 3, Documentary Fee, in the itemization (the
contract's itemization lists the fee as its own item after the cash price,
so the notice sits beside it; clause 16 still repeats it). On a Spanish
deal the OCCC-approved Spanish notice (Bulletin B09-3, Option 2) prints
beside it. A copy filed before the notice existed prints exactly as filed.
The older agreements routes stamp the notice on a fee document they file,
and refuse one completed without it, one whose link cannot be read, or one
over the limit.

### The migration

`supabase/migrations/20261003000000_dealer_fee_schedule.sql` (additive;
apply after `20261002000001_vehicle_empty_weight.sql`, `supabase db push`)
creates:

- `dealer_fee_schedule` (one row; CHECKs repeat the caps, the filing is
  whole or absent and its effective date is on or after its filing date),
  readable by every team role, written by nothing but the save function;
- `dealer_fee_schedule_changes` (append-only; a unique index on the version
  each row saved), readable by the owner;
- `save_dealer_fee_schedule` (owner only; same validation codes as the desk,
  including the OCCC filing's dates on the dealership's clock,
  America/Chicago; compare-and-set; one transaction under an advisory
  lock), and `dealer_fee_record` (the logged doc fee and filing of a
  version, for the filing's tamper check);
- `deal_fee_copy_guard` on `deals` (a sale's fee copy is the current
  schedule or nothing).

It changes no existing row. Sales already in progress when it is applied
carry no fee copy: the first time their money is saved, while nothing is
filed, they take today's fees (logged as `deal_fees_copied`); a sale with a
filed bill of sale reads the fees that paper printed. A sale whose bill of
sale was filed before this version has no recorded government fees; to file
its remaining documents with the flag off, void the bill of sale, record the
government fees, and file again. Until the migration is applied, the desk
reads the environment seed (`NEXT_PUBLIC_DEALER_DOC_FEE`; the OCCC seed is
ignored in production) and the owner's save fails; a fee record that exists
but cannot be read refuses filing (`feeSettingsUnreadable`).

## The 130-U empty weight (box 11)

The desk finds the empty weight by itself and fills box 11 with it, and every
figure it files carries its source. It never files a number nobody vouched for.

**How the weight is found, in order.**

1. **A document on the car.** A Texas title, an out-of-state title, an MCO, a
   weight certificate or a KBB / JD Power figure that someone typed and named
   on an earlier sale is stored on the vehicle (`weight_lbs` plus
   `weight_source`, the reading, the rounding rule, who and when). The 130-U
   skips the question and affixes it.
2. **An estimate, worked out on the server** (`src/lib/vehicles/empty-weight/`)
   when the sale page or the 130-U first needs one, and when Start A Sale
   decodes a VIN:
   - **EPA test data, bundled.** EPA's yearly Test Car List gives each tested
     vehicle's Equivalent Test Weight, which is curb weight plus 300 lb
     (40 CFR 86.1803-01; 1066.805). The estimate is ETW less 300 lb, matched
     on year, make, model, engine size, hybrid or EV, and drive. Measured on
     1,706 crash-test cars with lab-weighed curb weights: about 90% covered,
     median error 67 lb.
   - **Transport Canada** (live, through vPIC, 4 s limit), as a cross-check
     or when EPA has nothing.
   - **The VIN decode's curb weight**, last and as a cross-check only: it
     often reads the heaviest version (+139 lb median, up to about 700 lb).
3. **Nothing.** The question is asked as it always was: read it off the title.

Rounding follows TxDMV: up to the next 100; a manufacturer figure (MCO, KBB,
JD Power or an estimate) on a passenger car, SUV or van first gets +100; a
title or weight certificate never does, and neither does a truck.

**What staff see.**

- A car with a document on file: no weight question. The review shows
  "3,300 lb · Texas title, entered by Jo Smith on 10/01/2026", with a Change
  link.
- A car with a good estimate: a card with box 11 ("3,500 lb"), one sentence
  saying which EPA models it stands on and how ("EPA tested the Camry,
  Camry LE/SE and Camry XLE/XSE (2019) at 3,625 lb ..."), the cross-checks,
  and **Confirm This Weight**. One tap records who confirmed it and when.
- A car that needs a document: the estimate is shown as a hint only, with
  the reason, and no Confirm. That is every pickup or work truck, cargo or
  work van, cab-chassis, heavy-duty vehicle (GVWR 8,001 lb or more, 2500 /
  3500 / HD), bus, any estimate within 300 lb of the 6,000 lb registration
  line (a house rule), any car whose kind nobody recorded (no body style and
  no decode: it could be a pickup), and any low-confidence estimate no second
  source supports.
- Always: one box to type the figure from a document and buttons to say
  which document. A figure that differs from a document already on file needs
  a reason, which is kept.
- A weight on the vehicle with no recorded source is shown ("Where it came
  from was not recorded") and never pre-filled, never filed and never copied
  into webDEALER until someone settles it on the 130-U.

A 130-U with box 11 unsettled does not file. At filing the server rewrites
box 11 and its record (`_emptyWeight*` in `form_data`: source, reading, rule,
by, at, reason, and the estimate as shown) from its own read; the state form
prints only the number.

**Keeping the EPA table current.** The table is
`src/lib/vehicles/empty-weight/epa-etw-table.generated.js` (server-only,
MY1995 to 2026). When EPA posts a new model year (data page:
https://www.epa.gov/compliance-and-fuel-economy-data/data-cars-used-testing-fuel-economy):

```
pip install openpyxl
python3 scripts/empty-weight/build_epa_table.py --download --cache /tmp/epa-test-car
python3 scripts/empty-weight/make_fixtures.py --crash <crash-test research folder>
npx vitest run
```

`--download` records each file's URL, sha256 and download date in
`/tmp/epa-test-car/manifest.json`; the build reads only that manifest (never
file times), so the same files always give the same table, and it stops if a
file has no URL or its bytes changed. Commit the regenerated table (and the
fixture when it was rebuilt). Stored estimates made against an older table
are worked out again on their own.

## Paperwork, page by page

Every document is a field map (`src/lib/documents/field-maps/`): its pages,
and on each page every box the paper prints with its one source (the
dealership, the fees, the car, the licence step, Start A Sale, an answer, a
worked-out figure, a date, a signature). The corridor asks only what the
pages leave open, once per sale, as taps unless the answer is free-form
(`src/lib/sales/deal-facts.ts`). The review reads the page back before it is
filed, and the filing refuses a box the sale could fill and left blank
(`fieldMissing`). Screens that changed for anyone filming or scripting the
desk are listed in `docs/verification/paperwork-pages/corridor-changes.md`.
The SOP section "Document templates, page by page" is the full rule.

What the review and the paper do now (the fix round of 10/03/2026, each with
a test; `docs/verification/VERIFICATION.md`, section 00000000):

- **The co-buyer** typed at Start A Sale ("Add a co-buyer") is kept on the
  sale and prints on the bill of sale, the contract and the 130-U's box 17;
  the co-buyer signs in ink. A sale with no co-buyer prints no co-buyer box,
  on the contract's printed page too.
- **Conditions are predicates** (`field-maps/conditions.ts`): a business
  applicant's name and FEIN, a limited warranty's shares and a trade-in's
  lines are required exactly on the sales they apply to, and a cash sale's
  review lists no co-buyer or lien rows.
- **Total Paid**: on a new bill of sale it is what was paid today on a
  balance sale, and the total due with the lender's line on a bank deal. A
  copy filed before this change still prints its total due (the `pageLayout`
  stamp tells them apart), and its ink lines keep the date they had.
- **The review reads back what files**: the filer's printed name and
  signature, an unset documentary fee as its `[Not set: …]` marker (never
  $0.00), the 130-U in the form's words, the chips' real sources, Spanish
  headings and chips on a Spanish screen.
- **Taps for real cases**: the licence state list takes a typed place, the
  payment method has "Another Way", the county starts only from the intake's
  address lookup (a city's usual county is offered, filed only when tapped), a
  first payment before the contract date is refused, every paperwork screen
  has Back, and the tap cards fill the column as Handle A Sale's do.
- **Reprints**: a filed power of attorney reprints what was signed; the
  130-U's printed name keeps the suffix, as box 16 and the bill of sale do; a
  Buyer's Guide is refused when its sale cannot be read.

Still the owner's: the late-handling fee (`NEXT_PUBLIC_DEALER_LATE_HANDLING_FEE`)
prints `[Not set: late-handling fee]` on the buyer-files Vehicle
Responsibility sheet until it is set, and the documentary fee is set at the
owner's first sign-in (Your Fees). With `DESK_ALLOW_UNSET_FACTS=true` (demos
only) the markers print instead of a refusal.

## Owner's manual steps before going live

1. **Create a new Supabase project for Discount Used Cars and Trucks.** Do not
   reuse another dealership's database.
2. **Review and apply the migrations, in order:**
   `supabase/migrations/20260926000000_discount_sale_desk.sql`, then
   `supabase/migrations/20261002000000_void_filed_documents.sql`, then
   `supabase/migrations/20261002000001_vehicle_empty_weight.sql` (step 16),
   then `supabase/migrations/20261003000000_dealer_fee_schedule.sql` (step 8)
   (`supabase db push`). All are additive. The first creates the tables,
   RLS, the role-permission map, the step-data merge and complete-sale
   functions, the public inventory view, realtime on `deals`, and the three
   **private** buckets (`buyer-ids`, `documents`, `title-work`). The second
   adds the void columns to `document_agreements` (who, when, why, the
   group), triggers that make a voided row final (never updated, never
   deleted, never inserted already voided, voided only through the
   function), a trigger that refuses filing a contract, 130-U, vehicle
   responsibility or tow-away sheet while no bill of sale is current, and
   the `void_filed_documents` function the desk calls (it voids a fixed set
   and names who voided from the session). It also adds the reset's
   database half: `end_sessions_before` (service role only), and a
   `private.current_team_role` that gives no role to a session first signed
   in before the account's last password reset.
3. **Confirm the languages.** The desk prints English and Spanish from the
   dealer's historic sign. The phone, the hours and the public website were
   confirmed by the owner on 10/01/2026.
4. **Renew the GDN before 09/30/2027** and update `NEXT_PUBLIC_DEALER_LICENSE`
   if the number ever changes.
5. **Set secrets in the host:** Supabase URL and keys,
   `ADMIN_SESSION_SECRET`, `INTERNAL_RENDER_TOKEN`, and the SMS credentials
   once a provider is chosen.
6. **Supply the remaining dealer facts** in `.env.example`
   (`NEXT_PUBLIC_DEALER_*`): late-handling fee and email, and the sender
   mailboxes `RESEND_FROM_EMAIL` and `SUPPORT_FROM_EMAIL`
   (verified in Resend) before any email is expected to go out.
   Set the desk's own address before any link is sent:

   ```
   NEXT_PUBLIC_SITE_URL=https://desk.discountusedcarsandtrucks.com
   ```

   Until it is set, links the desk builds point at the local development
   address and filing is refused ("Desk address"). That address is never
   printed; documents print the public website,
   www.discountusedcarsandtrucks.com. Never set the two to the same host:
   filing is refused if they match.

   The documentary fee is no longer an environment fact: the owner sets it
   in the desk (step 8). `NEXT_PUBLIC_DEALER_DOC_FEE` and the five
   `NEXT_PUBLIC_DEALER_OCCC_*` values are an optional seed until then,
   checked against the same limits.
7. **Record the government fees on every sale.** Sales tax is 6.25% of
   the price less any trade-in (Tax Code §152.021(b), §152.002(b)(5)). The
   title fee is $33 in the nonattainment and affected counties and $28
   elsewhere, by the buyer's county (Transp. Code §501.138(a)). The
   registration side (base registration, TexasSure, the county's local fee,
   processing and handling, emissions where it applies), the $7.50
   inspection program replacement fee and the $10 plate fee vary by county
   and vehicle: copy them from webDEALER's computed fees into the sale's
   Government Fees screen ("Dealer fees", Owner steps 3). The $33 title and
   $75 registration the money screens start with are desk defaults
   (`src/lib/dealership-config.ts`, overridable in `.env.example`), shown
   only until a sale's fees are recorded; nothing is filed on them.
8. **Set your fees (owner).** Apply
   `supabase/migrations/20261003000000_dealer_fee_schedule.sql` first ("The
   migration" under "Dealer fees"). Then sign in as the Owner: the first
   sign-in asks Your Fees after the signature (or open Your Fees in the
   sidebar, `/admin/dealership/fees`).
   - The documentary fee: $225.00 or less, or record the OCCC filing (all
     five facts) that allows more, and never more than the filed maximum.
     A filing counts from the day it is in effect, never before; record it
     once the OCCC has received it. The filing channel is moving from ALECS
     to NMLS: ask the OCCC how to file.
   - Dealer deputy: only if the county deputized the dealership; the
     county-approved fee, $10.00 at most.
   - Vehicle inventory tax: whether the dealership was in business on
     January 1, and its unit property tax factor.
   - Print `/admin/dealership/fees/notice` and post it at every desk where
     sales close.
   - Re-check the rulebook before every build and every January
     (`node .claude/skills/premium-dealer-build/scripts/check-fee-module.cjs`
     from the agency repository); its next known dates are 2026-10-16,
     2026-11-01 and 2027-01-01.
9. **Ask counsel** before go-live:
   - *Advertised prices:* the public site (`Home.tsx`, `VehicleDetail.tsx`)
     and the desk's `legal.pricing` text in `src/lib/dealership-config.ts`
     now say advertised prices exclude tax, title, license, registration and the
     documentary fee (no longer "dealer fees": the documentary fee is the
     only dealer charge allowed on top of the price). FTC staff (Automobile
     Industry Pricing Transparency FAQs, September 2026) say the advertised
     price must include a documentary fee the dealer requires any buyer to
     pay; whether to fold it into the advertised price is counsel's call.
   - *The late-handling fee* on the Vehicle Responsibility Acknowledgment:
     no legal basis was found (Transp. Code §501.0234(c), §501.146(a)). It
     stays unset and that document stays refused until counsel answers.
   - *The finance contract form:* whether it is an OCCC model contract or a
     plain-language-approved form decides whether its wording (including
     the notice) may be edited.
   - *The Spanish notice:* the desk prints Option 2 of OCCC Bulletin B09-3;
     Option 1 is equally approved and is one constant to change
     (`src/lib/legal/doc-fee-notice.ts`).
10. **Confirm the financing rate ceilings** in `src/lib/documents/terms.ts`
   (Tex. Fin. Code ch. 348, never below the 18% optional ceiling of §303.009)
   with counsel before selling buy here pay here.
11. **Clear the signers and onboard every staff member.**
   - *Who is cleared to sign:* approval turns signing on for the Owner,
     Manager and Registration roles by default (owner's decision
     10/01/2026). Every other role (a salesperson, say) starts not cleared;
     if that person will file sale documents or print the VTR-61, an owner
     turns `can_sign_contracts` on for that one person on their
     `team_members` row in Supabase (or off for someone cleared by default).
     A reset keeps that per-person choice. Only a cleared member can file:
     the dealer line carries the filer's own name and signature. The default
     applies at approval only: members approved before 10/01/2026 keep the
     value they have (an Owner approved earlier started not cleared), so
     check the existing Owner, Manager and Registration rows and turn
     `can_sign_contracts` on for each person who should sign.
   - *Each staff member completes onboarding:* their first sign-in goes to
     `/admin/account/onboarding`. An account still on the temporary password
     an approval or a reset issued starts with **Choose A Password** (at
     least 10 characters, typed twice, with Show/Hide; the same rule as
     account recovery); saving it replaces the temporary password and clears
     the flag for that account only. Nobody else sees that screen, and a
     password chosen through the emailed invite link clears the flag too.
     **A reset signs out every device** that signed in to the account
     before it (owner's decision 10/02/2026): the account records the
     moment (`password_reset_at`), and on its next request such a device is
     signed out and sent to sign in with "Your password was reset, so this
     device was signed out. Sign in again." (English and Spanish). Only a
     device that signs in after the reset reaches Choose A Password, and
     choosing it keeps that device signed in. A reset does not change the
     password of an account that already has one (the emailed link does),
     so if the old password itself may be known to someone else, set that
     member's `team_members.status` to something other than `active` first
     (the password screen refuses an inactive member). To sign out every
     device of a member without the team screen, run in the SQL editor,
     with that member's auth user id:

     ```sql
     update auth.users
        set raw_app_meta_data = raw_app_meta_data
            || jsonb_build_object('password_reset_at', now())
      where id = '<auth user id>';
     ```

     That snippet only records the time; to end the member's older sessions
     at the database as the team screen does, also run
     `select public.end_sessions_before('<auth user id>', now());`.

     The database holds the line too: the reset ends the account's older
     auth sessions (so their refresh tokens stop working), and a request
     whose session first signed in before the reset holds no team role, so
     row-level security and the void function refuse it. An old access token
     that carries no sign-in time (an older token format) is refused by the
     desk on its next page, action or document, and ends when it expires
     (an hour, by Supabase's default).
     Google and Apple sign-in work again right after a reset (the new
     sign-in is what is checked).
     Then **What Is Your Name?** (first and last
     name, their legal name as on their ID, kept exactly as typed),
     **Draw Your Signature** (cleared members only; the same stored
     signature as `/admin/account/signature`), then **You Are All Set**, which
     goes to Handle A Sale. Their documents then read
     `Discount Used Cars And Trucks, LLC (First Last)` with their stroke on
     the dealer line.
   - *After onboarding the name is the owner's to change:* a finished member
     cannot rewrite their own name (the screen sends them back to work). The
     desk has no rename screen yet, so a correction is an owner (team:manage)
     editing that member's `full_name` ("First Last") and `display_name`
     (first name) row in Supabase. The member's own name write at onboarding
     is logged in `team_activity_events`.
   - *An owner who signs in through `ADMIN_EMAIL`* without a team row has no
     name to print and cannot file until a row is added for them.
12. **Upload the dealer's signature** at `/admin/account/signature`. It prints
    on the dealer line of every document that person files.
13. **Approve the Spanish documents.** They carry "translation pending counsel
    review" until the owner records approval. Spanish e-signature stays off
    until then.
14. **Salvage.** The tow-away path is salvage dealing (Tex. Occ. Code ch. 2302).
    Supply `NEXT_PUBLIC_SALVAGE_DEALER_LICENSE` only if the dealer holds that
    licence.
15. **Signing texts** stay off (`PAPERWORK_TEXTS_ENABLED=false`) until an SMS
    provider and a registered sending campaign exist.

16. **Apply the empty-weight migration before deploying this version:**
    `supabase/migrations/20261002000001_vehicle_empty_weight.sql`. It is
    additive (new `vehicles.weight_*` columns), and the sale pages read them,
    so the code needs it in place. Once a year, refresh the EPA table (see
    "The 130-U empty weight" above).
17. **Supply the two email images.** The email templates embed
    `public/brand/email-monogram.png` and `public/brand/email-wordmark.png`,
    which do not exist yet (the desk this was forked from lacked them too).
    Until they are added, emails go out without the marks. The prompts are in
    `docs/verification/VERIFICATION.md`.

`docs/verification/VERIFICATION.md` records the checks run for this dealer.
