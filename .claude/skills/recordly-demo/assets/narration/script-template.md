# The narrated walkthrough: one script for every client

This is the house script for the narrated long cut (`references/narration.md`). Every client gets the same 24
lines, in the same order, with the same lens: every line is money made or time saved. Only the double-brace
variables change: the dealer's name, the road customers drive to, what the lot sells, which optional features
the dealer uses, and the demo people and deal on screen. The wording was approved for Discount Used Cars and Trucks
(checked against the desk 10/02/2026, shipped 10/03/2026).

- `lines-template.json` beside this file is the machine copy of the same script. `scripts/fill-narration.cjs`
  fills it from the client's `client-inputs.json` → `narration`. It writes `narration/lines.json`, what Kokoro voices,
  and `narration/script.md`, the same lines with what is on screen, for the owner to read before voicing.
- Filling it with `examples/discount-used-cars/client-inputs.json` gives Discount's approved 24 lines exactly:
  `node scripts/fill-narration.cjs selftest` checks it, together with every refusal below.
- Change a line's wording only as a template change. Edit both files, bump `version`, and re-run the selftest. A new
  line goes in behind a flag that is false for Discount, so the approved 24 still come out exactly.

```bash
node $S/scripts/fill-narration.cjs init   $I                               # adds an empty narration block to fill
node $S/scripts/fill-narration.cjs check  $I                               # every refusal, nothing written
node $S/scripts/fill-narration.cjs lines  $I --out $P/narration/lines.json
node $S/scripts/fill-narration.cjs script $I --out $P/narration/script.md
```

## Variables

**Said** variables are spoken, so they are spelled the way the voice must say them: "Gulf Freeway", not "Gulf Fwy";
"L L C", not "LLC"; "and", not "&". The fill refuses those abbreviations. **Shown** variables are only on screen, in
the cues and in `script.md`. **Flags** are `true` or `false`; they decide the conditional lines. **Derived** values
are read from the rest of `client-inputs.json` and are not typed again.

| Variable | Kind | Used in | What it is | Where the value comes from | Discount's value |
|---|---|---|---|---|---|
| `ROAD_SAID` | said | 01 | The road or area customers drive to, as said aloud | The site's `business.ts` street and the hero copy that names it. The 1.5x hero zoom must show it as it is said. Spell it out: Fwy → Freeway | Gulf Freeway (the hero lede prints "8108 Gulf Freeway, Houston") |
| `STOCK_SAID` | said | 02 | What the lot sells, singular, as a list | The client's real inventory (premium-dealer-build phase 3) and the desk's `dealership-config.ts` `profile.segment`. The first word must be `storyboard.BODY`, because the line's first word lands on that lineup card | truck, car and SUV |
| `FEES_SAID` | said | 15 | What the desk's receipt adds up, as said | The client's desk receipt: `src/lib/sales/money.ts` with `dealerFees` in `dealership-config.ts`, or the owner's fee schedule if the desk has the onboarding fee step. Name a fee only if the receipt prints a row for it | tax, title, registration and doc fee (the doc fee was not set, so its row was blurred) |
| `LEGAL_NAME_SAID` | said | 20 | The legal name the 130-U seller line prints, spelled for the voice | `LEGAL_NAME` with its entity suffix spelled out (LLC → L L C). The fill refuses anything else: only spacing and punctuation may differ | Discount Used Cars And Trucks, L L C |
| `DEALER_NAME_SAID` | said | 24 | The dealer's name as customers say it (the DBA) | The site's `business.ts` `name`, which is also `dealership-config.ts` `name` (the DBA on the GDN record) | Discount Used Cars and Trucks |
| `CLOSE_TAGLINE` | said | 24 | The three payoffs before the name | The house line. Use another only if the owner gives it, and never a price, rate, rating or "best" (the fill refuses them) | More buyers through the door. Less time on paperwork. Fewer mistakes that cost you money. |
| `SELL_BAND_NAME` | shown | cue 03 | The site's sell band, as the site names it | The site's `Layout.tsx` nav label and the `Home.tsx` band | We Buy Cars |
| `LEGAL_NAME` | shown | cues 16, 20 | The legal name exactly as the documents print it | The desk's `dealership-config.ts` `legalName` (TxDMV GDN record, Texas SOS) | Discount Used Cars And Trucks, LLC |
| `DEMO_STAFF` | shown | cues 05, 20 | The demo salesperson typed at onboarding and printed on the seller line | House demo data. Never a real person | Maria Lopez |
| `DEMO_BUYER` | shown | cues 10, 23 | The demo buyer on the DEMO card | House demo data, never a real person; the card is made for the demo (lesson N3) | James Carter |
| `DEMO_CAR` | shown | cue 07 | The car picked off the lot | The desk's preview mock lot, `src/lib/mock-vehicles.ts` | 2019 Toyota Camry SE |
| `DEMO_ADDRESS` | shown | cue 11 | The buyer's mailing address typed on screen | A real street near the dealer that the Census geocoder resolves and that is not a listed household (lessons N2, B13) | 10418 Almeda Genoa Rd, Houston 77034 |
| `DEMO_COUNTY` | shown | cues 11, 12, 19 | The county the desk looks up for that address | The desk's address lookup on `DEMO_ADDRESS` | Harris |
| `SELL_BAND` | flag | line 03 | The site has the sell band and its trade-in lead form | The site's `Home.tsx` band and `pages/Sell.tsx` | true |
| `SPANISH_DOCS` | flag | line 09 | The dealer sells in Spanish, so the Spanish documents are worth a line | The owner's answer, with `business.ts` `spanish` and `dealership-config.ts` `languages` | true (the lot's "Se Habla Español" sign) |
| `SELLER_LIEN` | flag | line 16 | The dealer lets a buyer drive off owing part of the price | The owner's answer. The desk always supports it | true |
| `CLIENT` | derived | script.md title | The client's name | `client-inputs.json` `client` | Discount Used Cars and Trucks (Houston) |
| `BODY` | derived | cue 02 | The lineup card the camera lands on | `client-inputs.json` `storyboard.BODY` | Truck |
| `FINDER_QUERY` | derived | cue 02 | The model typed in the finder | `client-inputs.json` `storyboard.FINDER_QUERY` | F-150 |
| `SERVICE_TILE` | derived | cue 03 | The sell band's middle tile | `client-inputs.json` `storyboard.SERVICE_TILE` | We buy trucks |
| `OUTRO_FACTS` | derived | cue 24 | The outro's facts | `client-inputs.json` `outroLines`, joined with " · " | www.discountusedcarsandtrucks.com · (713) 900-5050 · 8108 Gulf Fwy, Houston · Tue – Sat 10 AM – 7 PM |

The `narration` block also holds three records:

- **`checked`**: `{ "on": "YYYY-MM-DD", "how": "...", "features": [...], "commit": "...", "evidence": "..." }`. These
  are the features from the table further down that were seen working on this client's desk, with the date, what was
  walked or read, the desk's corridor commit at the walk, and the walk's folder (its `walk-report.json`, written by
  premium-dealer-build's desk-walk `sale.cjs`). `check --desk` refuses another commit and "not walked" wording.
- **`cut`**: `[{ "id": "...", "why": "..." }]`. A line the desk cannot back is cut here, with its reason.
- **`speak`**: `{ "<line id>": "..." }`. A voice-only spelling for one line, so a refill keeps it.

## Conditional lines

| Line | Plays only when | When the flag is false |
|---|---|---|
| `03-site-c` | `SELL_BAND` is true | Left out. Scene 1 ends on line 02; the band is still filmed as in the house cut, or cut short |
| `09-car-c` | `SPANISH_DOCS` is true | Left out. The language step is answered (English) off camera or in the gap after line 08 |
| `16-money-c` | `SELLER_LIEN` is true | Left out. Film the deal paid in full, so no document shows a balance or a seller lien |

### Kickoff answers to flags

The flags and the band name are set from what the owner said at kickoff (premium-dealer-build `NEW-CLIENT-PROMPT.md`)
and what the site and desk ship, never guessed:

| Kickoff answer or fact | Sets | What else follows |
|---|---|---|
| Buyers may drive off owing part of the price (in-house financing, buy here pay here, "we finance") | `SELLER_LIEN` true | The long cut films carter-balance (a balance owed, the seller lien on the bill of sale and the 130-U). The house script has no BHPH payment-plan line; one is a template change behind a new flag, after it is walked on the desk |
| Cash or outside lenders only: nobody leaves owing the dealer | `SELLER_LIEN` false | Line 16 is left out. `fill-client.cjs long-storyboard` refuses: 22-money and carter-balance film a balance, and a paid-in-full variant is a template change agreed with the user |
| Sells in Spanish (staff, a "Se Habla Español" sign, Spanish paperwork) | `SPANISH_DOCS` true | Line 09 and 20-car's language menu (the long storyboard's `when: SPANISH_DOCS` actions) |
| English only | `SPANISH_DOCS` false | Line 09 and the language-menu actions are dropped from the script and the long storyboard |
| The site has a sell / trade-in band and form | `SELL_BAND` true, `SELL_BAND_NAME` its nav label | Line 03; cue 03 names the band |
| No sell band | `SELL_BAND` false | Line 03 is left out; the house cut's 3-buy still films the service band as it is |
| The service band's tile names financing ("Financing", "Easy Payments") | No flag | `storyboard.SERVICE_TILE_CHECK`: read what the tile prints; class (a) text (a payment, APR, %, term) never enters the frame, and `fill-client.cjs check` asks the user before A5 |
| The owner set a documentary fee | `FEES_SAID` names "doc fee" | Only when the desk's receipt prints a row for it |

Any line can also be cut in `narration.cut`, with its reason, when the client's desk cannot back it. Some lines are
a setup and its payoff, and they stand or fall together. The fill refuses to keep one without the other:

| Line | Needs these lines too | Why |
|---|---|---|
| `06-signin-c` | `05-signin-b`, `20-payoff-b` | "Remember that signature" is paid off on the seller line |
| `12-buyer-c` | `11-buyer-b`, `19-payoff-a` | "Remember that county. We'll come back to it." is paid off on box 19 |
| `19-payoff-a` | `11-buyer-b`, `13-buyer-d` | "That's the one you confirmed at the start" |
| `20-payoff-b` | `05-signin-b` | "The signature they drew on day one. That's why we asked for it." |
| `21-payoff-c` | `20-payoff-b` | "Signed and named" closes the seller line |

## The script

Bracketed lines are what's on screen; the line id comes before each spoken line. Discount's 24 lines are 574 words: 3:13
of speech (Kokoro, speed 0.95, trimmed) in a 3:50 film.

**1 · The site**

[The logo match-cuts onto the site's loader; the hero at 1.5x on the headline that names {{ROAD_SAID}}]
`01-site-a` Your customers find you on their phone before they ever drive to {{ROAD_SAID}}. So the first thing they see is a showroom, not a lot.

[The lineup lands on the {{BODY}} card; the visit card; the finder: Search, "{{FINDER_QUERY}}"]
`02-site-b` Every {{STOCK_SAID}}, searchable in seconds, with your number one tap away. Fewer tire-kickers calling to ask what you have. More buyers walking in knowing what they want.

[The {{SELL_BAND_NAME}} band: 2.0x on "{{SERVICE_TILE}}"] *Only when `SELL_BAND` is true.*
`03-site-c` And when somebody wants to sell, the site takes the trade-in lead for you, while you're with another customer.

**2 · Sign in once**

[Menu → Admin → sign in → onboarding: {{DEMO_STAFF}} typed, the signature drawn]
`04-signin-a` Behind the site is the part that pays for itself: your sale desk.
`05-signin-b` The first time your salesperson signs in, they type their legal name, and draw their signature. Once.
`06-signin-c` Remember that signature. You're going to see why it matters.

**3 · The car**

[Start A Sale: the {{DEMO_CAR}}; the odometer corrected]
`07-car-a` Pick the car off your lot. Year, make, model, VIN. Already on every form. Nobody types them.
`08-car-b` Miles change, so the desk brings in the number from inventory, and lets you correct it to what the dash says today. Every document prints that same number.

[The language select: Español, then English] *Only when `SPANISH_DOCS` is true.*
`09-car-c` A lot of your buyers are more comfortable in Spanish. Mark the sale Spanish, and their signing screens, their acknowledgments and the Buyer's Guide come up in Spanish. English-speaking buyer? Leave it in English, and keep moving.

**4 · The buyer**

[Scan ID: the DEMO card for {{DEMO_BUYER}}; the name and number fill in]
`10-buyer-a` Scan the back of the license, and the name and number fill in. You check them against the card. Only what you confirm goes on paper.

[{{DEMO_ADDRESS}} typed; the city, the ZIP and {{DEMO_COUNTY}} fill in]
`11-buyer-b` Type the street, and the desk looks up the city, the ZIP, and the county for you.
`12-buyer-c` Remember that county. We'll come back to it.

[The read-back card; Hold To Confirm]
`13-buyer-d` The address on an ID isn't always where somebody lives. So the desk makes you read the mailing address back to them, and hold to confirm. The title goes to the right door the first time. No returned mail. No angry phone call three weeks later.

**5 · The money**

[How Are They Paying? · How Much Are They Paying? · Does That Include Tax And Fees?]
`14-money-a` Sometimes you advertise out the door. Sometimes it's price plus tax and fees. You know how it goes.
`15-money-b` Type the number you shook hands on, and tap whether tax and fees were inside it. The desk does the {{FEES_SAID}} math, and shows you exactly what's still owed. No calculator. No mistakes that come out of your pocket.

[The bill of sale's seller lien; the 130-U naming {{LEGAL_NAME}} as lienholder] *Only when `SELLER_LIEN` is true.*
`16-money-c` And if they leave owing you money, the bill of sale and the title application name your dealership as lienholder, automatically. Your money is protected on paper before they drive off.

**6 · The plan**

[Who Files The Title And Registration? · Where Does The Inspection Stand?]
`17-plan-a` Who files the title? One tap, and the desk builds the right packet. The 130-U when you file it, the responsibility form when they do.
Voice: "Who files the title? One tap, and the desk builds the right packet. The one-thirty-U when you file it, the responsibility form when they do."
`18-plan-b` Inspection? Tap where it stands, and the buyer's copy says in writing whether it's done, yours, or theirs. If it's theirs, it's on paper.

**7 · The payoff**

[The 130-U: box 19, {{DEMO_COUNTY}}; the seller line "{{LEGAL_NAME}} ({{DEMO_STAFF}})" and the drawn signature]
`19-payoff-a` Here's the title application. The county? Already filled in. That's the one you confirmed at the start.
`20-payoff-b` And the seller line. The county now wants the company and the person who signed. So it prints {{LEGAL_NAME_SAID}}, and the salesperson's name in parentheses, with the signature they drew on day one. That's why we asked for it.
`21-payoff-c` Every document, signed and named, without anybody touching a pen.

**8 · Signed and stored**

[Scan To Sign; the buyer signs on the phone → 2 / 2 signed; Past Sales → {{DEMO_BUYER}} → the signed PDF]
`22-stored-a` The buyer scans a code, and signs every page on their own phone.
`23-stored-b` And every signed document stays with the sale. If a customer files a complaint, or somebody comes asking questions months from now, search their name, and pull up the paperwork in seconds.

**9 · Close**

[The outro, facts only: {{OUTRO_FACTS}}]
`24-close` {{CLOSE_TAGLINE}} {{DEALER_NAME_SAID}}.

The full per-line picture (which word each action lands on) is the `cue` of each line in `lines-template.json`, and
it is printed in the filled `script.md`.

## What each line claims, and where to check it

Each line names the features it narrates (`needs` in `lines-template.json`). The fill refuses a playing line whose
features are not all in `narration.checked.features`. A feature goes on that list only after it is seen working on
this client's own desk, or this client's own site.

| Feature | Lines | What must be true | Where to look |
|---|---|---|---|
| `site-hero-road` | 01 | The hero's headline or lede names `ROAD_SAID`, so the hero zoom shows it as it is said | Site: `src/pages/Home.tsx` hero, `business.ts` street |
| `site-lineup-finder` | 02 | The lineup by body type, the finder's search, and the header's call button | Site: `Home.tsx` lineup and finder, `Layout.tsx` header |
| `site-sell-band` | 03 | The sell band and its page take a trade-in lead | Site: `Home.tsx` band, `pages/Sell.tsx`, `lib/leads.ts` |
| `desk-admin-row` | 04 | The site's drawer has the Admin row to the sale desk | Site: `Layout.tsx` drawer (`VITE_DESK_URL`) |
| `onboarding-signature` | 05, 06, 20 | The first sign-in asks the member's legal name and a drawn signature, once | Desk: `src/app/admin/account/onboarding` |
| `car-from-inventory` | 07 | The car is picked off the lot; year, make, model and VIN are on every form | Desk: `StartSale.tsx`, the packet |
| `odometer-from-inventory` | 08 | The odometer comes from inventory, can be corrected, and prints the same everywhere | Desk: `StartSale.tsx`, the packet |
| `spanish-documents` | 09 | A Spanish sale gives Spanish signing screens, acknowledgments and Buyer's Guide | Desk: `StartSale.tsx` language select, `src/lib/sales/deal-language.ts` |
| `id-scan` | 10 | The licence's barcode fills the name and number; only what is confirmed prints | Desk: `src/components/sales/LicenceScanner.tsx`, `src/lib/sales/aamva.ts` |
| `address-lookup` | 11, 12 | The street fills the city, the ZIP and the county | Desk: `src/lib/admin/address-lookup.ts` (`NODE_USE_ENV_PROXY=1` behind a proxy, lesson N1) |
| `address-readback` | 13 | The mailing address is read back and held to confirm | Desk: `StartSale.tsx` read-back |
| `price-and-fees-question` | 14, 15 | "How Much Are They Paying?" then "Does That Include Tax And Fees?" | Desk: `src/lib/sales/guide.ts` |
| `receipt-math` | 15 | The receipt computes the fees in `FEES_SAID` and the balance still owed | Desk: `src/lib/sales/money.ts`, `dealerFees` or the owner's fee schedule |
| `seller-lien` | 16 | A balance owed names the dealership as lienholder on the bill of sale and the 130-U | Desk: `src/lib/documents/lien.ts`, a deal with a balance |
| `who-files` | 17 | We Do builds the 130-U packet; The Customer Does builds the responsibility form | Desk: `guide.ts` `registrationBy`, `src/lib/sales/sale-plan.ts` |
| `inspection-status` | 18 | The inspection's three answers print on the buyer's copy | Desk: `guide.ts` `inspectionBy`, the buyer's copy |
| `130u-county` | 12, 19 | 130-U box 19's county is the one from the address step | Desk: `src/lib/fill-130u`, a filled 130-U |
| `130u-seller-line` | 06, 20, 21 | The seller line prints "`LEGAL_NAME` (the member's name)" with the drawn signature | Desk: `dealerSignerPrintedName` in `dealership-config.ts`, `fill-130u/seller-line-fit.ts`, the SOP's 130-U rule |
| `phone-signing` | 22 | The buyer scans the packet's code and signs every page on their phone | Desk: `src/app/sign/packet/[token]` |
| `past-sales` | 23 | Past Sales finds the sale by the buyer's name and opens its signed PDFs | Desk: `src/app/admin/sales/past` |

## How to fill and fact-check

1. **Fill the values from their sources.** Run `fill-narration.cjs init $I`, then copy every value from the source
   its row names, character for character, and spell the said ones for the voice. Set every flag from the owner's
   answer, never a guess. Nothing comes from Discount's example: for any other client, the fill refuses Discount's
   road, name and legal name.
2. **Re-check every line against the client's desk before voicing.** Use the build the film will capture: `next dev`
   on :5190 in its own process group, `DESK_PREVIEW_MEMBER=fresh`, `DESK_ALLOW_UNSET_FACTS=true` for the demo deal,
   and `NODE_USE_ENV_PROXY=1` behind a proxy. Walk one whole sale through every step the script names. Read the code
   wherever a line promises something about paper.
   - List each feature seen working in `checked.features`, with `checked.on` (the date) and `checked.how` (what was
     walked or read, and where that is written down).
   - The script is checked again on the day of capture if the desk changed since `checked.on`.
3. **Never narrate an unshipped feature.** A line the desk cannot back is cut in `narration.cut` with its reason, not
   softened; its setup or payoff goes with it.
   - A desk change still in progress (for example the owner's fee step at onboarding, or a new document) is narrated
     only after it ships on this client's desk and is walked.
   - Until then the house lines stand as written. A new line is a template change (see the top of this file).
   - If the onboarding gains a step, re-check lines 05-06 and their capture.
4. **The paperwork on screen is the client's real dealership, on a demo deal.**
   - The people and the deal are demo data: `DEMO_STAFF`, `DEMO_BUYER`, the mock lot's `DEMO_CAR`, `DEMO_ADDRESS`.
   - Every document prints the client's own facts from its `dealership-config.ts`: the legal name, GDN, county and
     website.
   - Before capture, open the demo deal's bill of sale and 130-U. Check that the seller line reads
     "`LEGAL_NAME` (`DEMO_STAFF`)", that the lien boxes name the client, and that no page carries another dealer's
     name, GDN, address or phone.
   - A fact the owner has not set prints its "[Not set: …]" marker: blur it on screen and say so in the narration
     README. Never type a value in for the film (Discount: the doc fee, blurred on the receipt and printed $0.00 on
     the bill of sale).
5. **Claims that rest on a rule, not on the desk.**
   - Line 20's "The county now wants the company and the person who signed" is the SOP's 130-U rule: county tax
     offices reject the entity name alone, per the owner's instruction of 10/01/2026. Keep the line while the SOP says
     so.
   - Line 09's "A lot of your buyers are more comfortable in Spanish" is the owner's to confirm: that is
     `SPANISH_DOCS`.
   - `FEES_SAID` names only fees the receipt prints, and says no amounts.
6. **Fill, then have it read.** `fill-narration.cjs lines` and `script` write `narration/lines.json` and
   `narration/script.md`. Both refuse: a leftover placeholder, a missing or unknown variable, a flag that is not
   true/false, an unspelled abbreviation, an unchecked feature, and half a setup/payoff pair. The user (for the owner)
   reads `script.md` before anything is voiced.
7. **Voice it** (`references/narration.md` §2-3). Each difference the transcribe-back check hears is decided by
   listening. A voice-only spelling goes in `narration.speak`, never into the generated `lines.json`, so a refill keeps
   it.
