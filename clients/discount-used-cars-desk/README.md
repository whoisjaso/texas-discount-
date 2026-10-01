# Vega's sale desk (Handle A Sale)

The admin sale desk for Vega's Auto Sales & Glass Co. It takes a car sale from
"who is buying" to a signed, printable packet and a title filing, one question
per screen, with every figure computed and nothing typed twice.

It is a port of the desk that runs in production at the reference dealership.
The routes, step engine, money math, document rules, signing flow and data
model are unchanged. The look is the public site's: a pale grey ground, white
cards, black ink and black actions, one narrow grotesk (Barlow Semi
Condensed, self-hosted) in Title Case, and a black rail carrying the owner's
emblem beside a wide "VEGA’S" wordmark. The emblem is the only colour.
Printed documents keep the lone star in ink. Set `NEXT_PUBLIC_BRAND_LOGO` to
replace the emblem (default `/brand/vegas-logo-sm.png`).

The public site (`clients/vegas-auto-sales`, Vite) stays as it is. The desk is
a separate Next.js app, meant to be served at `desk.<domain>`.

## Run it

```bash
npm install          # .npmrc sets legacy-peer-deps; versions follow the reference lockfile
cp .env.example .env.local
npm run dev          # http://localhost:5190/admin/login
npm test             # 1,396 unit tests
npm run lint && npx tsc --noEmit && npm run build
```

With no Supabase variables set, the desk runs on an in-memory preview mock
(local only). Any email signs in. Set `DESK_ALLOW_UNSET_FACTS=true` in
`.env.local` to walk a sale all the way to a signed packet before the dealer
facts exist.

## Dealer facts: nothing is invented

Every dealer fact is in `src/lib/dealership-config.ts` and nowhere else. A
guard test fails if one is typed anywhere else, or if any fact from the
reference dealership appears.

- **From the Texas DMV licence record** (Independent GDN dealer list, current
  09/26/2026): legal name *Constantino Vega DBA Vega's Auto Sales*, GDN
  **P113248** (Active, expires 01/31/2027), county **Harris**. The record
  also confirms the address and phone.
- **From Vega's public listings, pending the owner's confirmation:** trading
  name, hours and time zone.
- **`null` until the owner supplies them:** documentary fee, authorised
  signer, website domain, email, payment destinations and SMS provider.

Until a fact is supplied, every screen and document prints
`[Not set: …]` in its place, and filing a document is refused. The Handle A
Sale screen lists what is missing.

## Owner's manual steps before going live

1. **Create a new Supabase project for Vega's.** Do not reuse the reference
   dealership's database.
2. **Review and apply the migration:** `supabase/migrations/20260926000000_vegas_sale_desk.sql`
   (`supabase db push`). It is additive. It creates the tables, RLS, the
   role-permission map, the step-data merge and complete-sale functions,
   the public inventory view, realtime on `deals`, and the three **private**
   buckets (`buyer-ids`, `documents`, `title-work`).
3. **Renew the GDN before 01/31/2027** and update `NEXT_PUBLIC_DEALER_LICENSE`
   if the number ever changes.
4. **Set secrets in the host:** Supabase URL and keys,
   `ADMIN_SESSION_SECRET`, `INTERNAL_RENDER_TOKEN`, and the SMS credentials
   once a provider is chosen.
5. **Supply the remaining dealer facts** in `.env.example` (`NEXT_PUBLIC_DEALER_*`): documentary fee, authorised signer and website domain.
6. **Confirm the fee and tax lines.** Texas 6.25% tax, $33 title fee and $75
   registration fee are the statutory defaults. The documentary fee is
   Vega's own and must be supplied.
7. **Confirm the financing rate ceilings** in `src/lib/documents/terms.ts`
   (Tex. Fin. Code ch. 348, never below the 18% optional ceiling of §303.009)
   with counsel before selling buy here pay here.
8. **Upload the dealer's signature** at `/admin/account/signature`. It prints
   on the dealer line of every document that person files.
9. **Approve the Spanish documents.** They carry "translation pending counsel
   review" until the owner records approval. Spanish e-signature stays off
   until then.
10. **Salvage.** The tow-away path is salvage dealing (Tex. Occ. Code ch. 2302).
   Supply `NEXT_PUBLIC_SALVAGE_DEALER_LICENSE` if Vega's holds that licence.
11. **Signing texts** stay off (`PAPERWORK_TEXTS_ENABLED=false`) until an SMS
    provider and a registered sending campaign exist.

See `docs/verification/` for the five end-to-end walks, the rasterised
packets and the test output.
