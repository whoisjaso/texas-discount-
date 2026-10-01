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

- **Documentary fee** (the dealer's own; bills of sale show $0 "Not set" until then)
- **Authorised signer** (name and title on the dealer signature line; the licence holder is the usual answer, but confirm)
- **Website domain** (prints on documents)
- Email, payment destinations (Zelle, Cash App…), SMS provider for signing texts
- Salvage dealer licence, if held

## Texas statutory defaults (not facts, but confirm)

6.25% motor vehicle sales tax, $33 title fee, $75 registration fee, Tex. Fin.
Code ch. 348 rate ceilings (never below the 18% §303.009 floor). Outside
Texas the whole Texas block of the desk SOP must be replaced with that state's
forms and law: stop and report, it is the owner's decision.

## What the public site may show

Business name, address, cross streets, phone, text link, hours (with a live
open/closed dot in the business time zone), payment methods, rating and a
couple of real review quotes (with source), and the footer line
`<Legal Name> · Texas Dealer License (GDN) <number>` once the licence is known.
Never invent review quotes, ratings, years in business, awards or claims.
