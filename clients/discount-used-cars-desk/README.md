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
10/01/2026).

**The down payment goes on the money step**, in "Down today", before any
document is filed. Once the bill of sale is filed, the down payment is
frozen: changing it on the money step or on the financing contract is
refused until the bill of sale is voided and filed again (owner's decision
10/01/2026). That keeps the bill of sale's balance and the contract's amount
financed one figure.

## Owner's manual steps before going live

1. **Create a new Supabase project for Discount Used Cars and Trucks.** Do not
   reuse another dealership's database.
2. **Review and apply the migration:** `supabase/migrations/20260926000000_discount_sale_desk.sql`
   (`supabase db push`). It is additive. It creates the tables, RLS, the
   role-permission map, the step-data merge and complete-sale functions,
   the public inventory view, realtime on `deals`, and the three **private**
   buckets (`buyer-ids`, `documents`, `title-work`).
3. **Confirm the languages.** The desk prints English and Spanish from the
   dealer's historic sign. The phone, the hours and the public website were
   confirmed by the owner on 10/01/2026.
4. **Renew the GDN before 09/30/2027** and update `NEXT_PUBLIC_DEALER_LICENSE`
   if the number ever changes.
5. **Set secrets in the host:** Supabase URL and keys,
   `ADMIN_SESSION_SECRET`, `INTERNAL_RENDER_TOKEN`, and the SMS credentials
   once a provider is chosen.
6. **Supply the remaining dealer facts** in `.env.example`
   (`NEXT_PUBLIC_DEALER_*`): documentary fee, late-handling fee and email,
   and the sender mailboxes `RESEND_FROM_EMAIL` and `SUPPORT_FROM_EMAIL`
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
7. **Confirm the fee and tax lines.** Texas 6.25% tax, $33 title fee and $75
   registration fee are the statutory defaults. The documentary fee is the
   dealer's own and must be supplied.
8. **Confirm the financing rate ceilings** in `src/lib/documents/terms.ts`
   (Tex. Fin. Code ch. 348, never below the 18% optional ceiling of §303.009)
   with counsel before selling buy here pay here.
9. **Clear the signers and onboard every staff member.**
   - *Who is cleared to sign:* approval turns signing on for the Owner,
     Manager and Registration roles by default (owner's decision
     10/01/2026). Every other role (a salesperson, say) starts not cleared;
     if that person will file sale documents or print the VTR-61, an owner
     turns `can_sign_contracts` on for that one person on their
     `team_members` row in Supabase (or off for someone cleared by default).
     A reset keeps that per-person choice. Only a cleared member can file:
     the dealer line carries the filer's own name and signature.
   - *Each staff member completes onboarding:* their first sign-in goes to
     `/admin/account/onboarding`. An account still on the temporary password
     an approval or a reset issued starts with **Choose A Password** (at
     least 10 characters, typed twice, with Show/Hide; the same rule as
     account recovery); saving it replaces the temporary password and clears
     the flag for that account only. Nobody else sees that screen, and a
     password chosen through the emailed invite link clears the flag too.
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
10. **Upload the dealer's signature** at `/admin/account/signature`. It prints
    on the dealer line of every document that person files.
11. **Approve the Spanish documents.** They carry "translation pending counsel
    review" until the owner records approval. Spanish e-signature stays off
    until then.
12. **Salvage.** The tow-away path is salvage dealing (Tex. Occ. Code ch. 2302).
    Supply `NEXT_PUBLIC_SALVAGE_DEALER_LICENSE` only if the dealer holds that
    licence.
13. **Signing texts** stay off (`PAPERWORK_TEXTS_ENABLED=false`) until an SMS
    provider and a registered sending campaign exist.

14. **Supply the two email images.** The email templates embed
    `public/brand/email-monogram.png` and `public/brand/email-wordmark.png`,
    which do not exist yet (the desk this was forked from lacked them too).
    Until they are added, emails go out without the marks. The prompts are in
    `docs/verification/VERIFICATION.md`.

`docs/verification/VERIFICATION.md` records the checks run for this dealer.
