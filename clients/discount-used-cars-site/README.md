# Discount Used Cars and Trucks — website

Standalone Vite + React + TypeScript site for Discount Used Cars and Trucks,
8108 Gulf Fwy, Houston, TX 77017 · (713) 900-5050. Built from the Vega's
build (the porsche.com/usa grammar: one fixed hero photo, black and white with
the logo as the only colour, Barlow Semi Condensed, Title Case).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
```

Deploys as a static SPA (`vercel.json` rewrites every route to `index.html`).

## Structure

- `src/data/business.ts`: every dealer fact the site prints, each with its source.
- `src/data/inventory.ts`: the dealer's own vehicles. **Empty until the owner sends the current lot**; the home page and the Collection say so plainly instead of showing sample cars.
- `src/data/media.ts`: the photo slots. Each slot shows a drawn stand-in until its image arrives (see `PHOTOS.md`).
- `src/lib/inventoryStore.ts`: the single read path for inventory. The admin desk can swap this for a live query.
- `src/lib/leads.ts`: every form posts here. Set `VITE_LEADS_ENDPOINT` to deliver leads; without it they are kept in the browser (demo mode).
- `src/pages/Sell.tsx`: We Buy Cars, the service band's page (the dealer has no second line of business; "We Buy Cars" is on its own banner).

## Facts and where they came from

| Fact | Value | Source |
|---|---|---|
| Legal name | Discount Used Cars and Trucks, LLC | TxDMV GDN list, current 10/01/2026 |
| Dealer licence | GDN P145000, Active, expires 09/30/2027 | TxDMV |
| Address | 8108 Gulf Fwy, Houston, TX 77017 | TxDMV, Comptroller, Google listing |
| Phone | (713) 900-5050 | Google listing, the dealer's "713 900 50/50" sign |
| Hours | Mon–Fri 10 AM–5 PM, Sat–Sun closed | Google listing (pending owner) |
| Rating | 4.8 from 24 Google reviews | Google listing before the move to Gulf Fwy |
| Spanish | Se habla español | the dealer's lot sign (pending owner) |

Left out until the owner confirms them: a number customers can text (the Text
buttons stay hidden), payment methods, financing specifics, the 30-day
warranty.

## Before launch

1. Real inventory: the owner's photos into `public/photos/inventory/<slug>/`, records in `src/data/inventory.ts`.
2. The images in `PHOTOS.md`, and a real phone photo of the lot for the Visit card.
3. `VITE_LEADS_ENDPOINT` so forms deliver, and `VITE_DESK_URL` once the sale desk is live (shows the Admin link in the menu).
4. Point the domain (likely `discountusedcarsandtrucks.com`) at the Vercel project.
