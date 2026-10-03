# Facts: research, record, never invent

Every fact the site and the desk print (name, address, phone, hours, licence,
county, fees, signer, domain) is either sourced or `null`. A null prints a
visible `[Not set: …]` marker and blocks filing; a guess prints a lie on a
legal document. That asymmetry is the whole rule.

## Where facts come from (in order of authority)

| Source | Gives you | How |
|---|---|---|
| **The owner** | anything, and the final word | Ask. Record the date. |
| **State licence record** (Texas: TxDMV Independent (GDN) Motor Vehicle Dealers List, `texasdmv.my.salesforce-sites.com/dealers/motorvehicledealerliststaging`) | legal name (Business Name), DBA, **GDN licence number**, status, expiry, **county**, licensed address, phone, licence type | The page is a JS search app; automated fetches usually fail. Ask the user to search by DBA + city + county and send a screenshot, or download the full list spreadsheet from the same page. |
| **Business's own listings** (Google Business via Birdeye, Facebook page, Yelp, MapQuest, Waze) | display name, address, phone, hours, reviews, services | Web search + scrape. Facebook blocks scrapers: ask the user for screenshots. |
| **The repository** | anything already configured | Read `dealership-config.ts` / `business.ts`. |

Record each fact with its source in a comment beside the value
(`// TXDMV: …, current as of 09/26/2026`, `// PUBLIC: Facebook + Google`).
Public-listing facts are "pending the owner's confirmation"; state-record
facts are authoritative for legal name, licence and county.

## Legal name format

Sole proprietor with a DBA: `<Owner Name> DBA <Dealership Name>`, e.g.
`Constantino Vega DBA Vega's Auto Sales`. Use the capital-letter form `DBA`,
not `d/b/a`: the 130-U title-cases every field and turns `d/b/a` into `D/B/A`,
while `DBA` survives untouched. An LLC or corporation uses the entity name
exactly as licensed.

## Facts only the owner can give

These are never on public record; leave them `null` and list them in every
report until supplied:

- **Documentary fee** (the dealer's own; the owner sets it at first sign-in,
  in the desk's Your Fees step, and filing is refused until it is set).
  $225.00 or less is presumed reasonable (7 TAC §84.205(b)(1), in force since
  2024-07-11); more only up to a maximum the dealer filed with the OCCC. Ask
  whether the dealer filed one, and ask for the doc fee the build's walks and
  the films type: the owner's figure, or one the user approves, $225.00 or
  less unless a filing is recorded. Record it and its source in the status
  file; it is a walk and demo input only and never goes into code. See
  `references/texas-dealer-fees.md`.
- **The first Owner's name and email** (the owner account the desk is
  bootstrapped with: SOP, First sign-in, item 1; never a password). There is
  no separate "authorised signer" fact: each member cleared to sign prints as
  themselves, `<Legal Name> (<First Last>)`, from their own onboarding (step 4.3)
- **Website domain** (prints on documents)
- **Late-handling fee** (the figure the Vehicle Responsibility sheet quotes
  when a buyer who files their own title brings it back late; the desk's
  `NEXT_PUBLIC_DEALER_LATE_HANDLING_FEE`). No legal basis for it was found
  (`references/texas-dealer-fees.md` 5.8 item 9), so it is NOT asked as an
  amount: put rulebook 6.1 question 6 (its legal basis) in the Phase 0 report
  as a counsel item. Until counsel answers, the variable stays unset, the
  sheet stays refused at filing, and the variable never goes on the owner's
  list of values to supply.
- Email, payment destinations (Zelle, Cash App…), SMS provider for signing texts
- Salvage dealer licence, if held

## Texas fees and tax (from the rulebook, not facts; confirm every build)

Every Texas fee figure, limit and citation is in
`references/texas-dealer-fees.md` (with its as-of date and re-check
schedule); do not restate them from memory. In short: 6.25% motor vehicle
sales tax (Tax Code §152.021); the title fee is $33 or $28 by the buyer's
county (Transp. Code §501.138(a)); registration is several state and county
lines that vary by county and vehicle. The desk's $75 registration is a desk
default until it computes them, never a statutory figure: confirm each sale
against webDEALER. Tex. Fin. Code ch. 348 rate ceilings never go below the
18% §303.009 floor. Outside Texas the whole Texas block of the desk SOP and
the rulebook must be replaced with that state's forms and law: stop and
report, it is the owner's decision.

## What the public site may show

Business name, address, cross streets, phone, text link, hours (with a live
open/closed dot in the business time zone), payment methods, rating and a
couple of real review quotes (with source), and the footer line
`<Legal Name> · Texas Dealer License (GDN) <number>` once the licence is known.
Never invent review quotes, ratings, years in business, awards or claims.
