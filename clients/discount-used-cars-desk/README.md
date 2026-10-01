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

## Dealer facts: nothing is invented

Every dealer fact is in `src/lib/dealership-config.ts` and nowhere else. A
guard test (`src/__tests__/no-hardcoded-dealer-facts.test.ts`) enforces it:

- **This dealer's facts** (name, legal name, phone, both phone numbers,
  street, ZIP, GDN, Facebook page, venue county) may appear only in the
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
| Phone | (713) 900-5050 | Google listing and the dealer's "713 900 50/50" sign, pending the owner's confirmation. The TxDMV licence record lists (713) 203-3890 |
| Time zone | America/Chicago | Houston |
| Hours | Monday to Friday, 10:00 AM to 5:00 PM; Saturday and Sunday closed | Google listing, read 10/01/2026, pending the owner's confirmation |
| Languages | English and Spanish | "Se Habla Español" on the dealer's sign (historic), pending the owner's confirmation |
| Facebook | https://www.facebook.com/Discountusedcars/ | The dealer's page |
| What it sells | Pre-owned cars, trucks and SUVs | |

**`null` until the owner supplies them:** owner, authorised signer,
documentary fee, website domain, email, payment destinations (Zelle, Cash
App, Apple Pay, PayPal), SMS provider, salvage dealer licence, lenders and
map position.

Until a fact is supplied, every screen and document prints `[Not set: …]` in
its place, and filing a document is refused while a legal fact (legal name,
licence, county, documentary fee, authorised signer, website domain) is
missing. The Handle A Sale screen lists what is missing.

## Owner's manual steps before going live

1. **Create a new Supabase project for Discount Used Cars and Trucks.** Do not
   reuse another dealership's database.
2. **Review and apply the migration:** `supabase/migrations/20260926000000_discount_sale_desk.sql`
   (`supabase db push`). It is additive. It creates the tables, RLS, the
   role-permission map, the step-data merge and complete-sale functions,
   the public inventory view, realtime on `deals`, and the three **private**
   buckets (`buyer-ids`, `documents`, `title-work`).
3. **Confirm the phone the desk prints.** It defaults to (713) 900-5050 from
   the Google listing and the sign; the TxDMV licence record lists
   (713) 203-3890. Set `NEXT_PUBLIC_DEALER_PHONE` if it should be the other.
4. **Confirm the hours and the languages.** The desk prints the Google
   listing's hours (Monday to Friday, 10:00 AM to 5:00 PM). The public site
   has since taken Tuesday to Saturday, 10 AM to 7 PM from the owner's
   billboard artwork. Once the owner confirms which is right, update `hours`
   in `src/lib/dealership-config.ts` and `src/__tests__/dealer-hours.test.ts`.
5. **Renew the GDN before 09/30/2027** and update `NEXT_PUBLIC_DEALER_LICENSE`
   if the number ever changes.
6. **Set secrets in the host:** Supabase URL and keys,
   `ADMIN_SESSION_SECRET`, `INTERNAL_RENDER_TOKEN`, and the SMS credentials
   once a provider is chosen.
7. **Supply the remaining dealer facts** in `.env.example`
   (`NEXT_PUBLIC_DEALER_*`): documentary fee, authorised signer (name and
   title), website domain (`NEXT_PUBLIC_SITE_URL`) and email. Set the domain
   before any email is sent: until it is set, links the desk builds point at
   the local development address.
8. **Confirm the fee and tax lines.** Texas 6.25% tax, $33 title fee and $75
   registration fee are the statutory defaults. The documentary fee is the
   dealer's own and must be supplied.
9. **Confirm the financing rate ceilings** in `src/lib/documents/terms.ts`
   (Tex. Fin. Code ch. 348, never below the 18% optional ceiling of §303.009)
   with counsel before selling buy here pay here.
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
