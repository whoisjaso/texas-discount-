# Vega's Auto Sales & Glass Co. — website

Standalone Vite + React + TypeScript site for Vega's Auto Sales & Glass Co.,
7722 Galveston Rd, Houston, TX 77034 · (713) 941-1622.

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # typecheck + production build to dist/
```

Deploys as a static SPA (`vercel.json` rewrites every route to `index.html`).

## Structure

- `src/data/business.ts`: verified public business facts (address, hours, phone, rating, review quotes).
- `src/data/inventory.ts`: **sample inventory for design review only.** Replace before launch.
- `src/lib/inventoryStore.ts`: the single read path for inventory. The admin dashboard swaps this for a live query.
- `src/lib/leads.ts`: every form posts here. Set `VITE_LEADS_ENDPOINT` to deliver leads; without it they are kept in the browser (demo mode).
- `src/components/`: brand mark, intro loader, SVG car silhouettes (stand-ins until real photos exist), the windshield before/after slider.

## Before launch

1. Replace sample inventory with real units and photos (`photos` on each vehicle replaces the silhouette).
2. Set `VITE_LEADS_ENDPOINT`, or connect forms to the admin dashboard.
3. Confirm the copy with the owner (glass services offered, financing language).
