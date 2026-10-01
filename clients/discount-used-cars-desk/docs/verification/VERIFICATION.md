# Verification

Discount Used Cars and Trucks sale desk, verified 10/01/2026. Run on the local
dev server on port 5190 after deleting `.next`, on the in-memory preview mock
(no Supabase), with `DESK_ALLOW_UNSET_FACTS=true`. Dealer facts that are still
unknown print as `[Not set: …]`.

The walk server also needs three throwaway local values:

- `ADMIN_SESSION_SECRET`: Start A Sale issues a capture token and fails
  without a signing secret.
- `INTERNAL_RENDER_TOKEN` and `CHROME_PATH`: PDF generation needs them, and
  `PORT=5190` lets the PDF renderer find the dev server.

The Vega's desk has the same requirements; none of these values is committed.

## 1. Static checks

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint` | 0 errors, 4 warnings (the unused variables the reference shipped with) |
| `vitest run` | 121 files, **1,407 tests passed** |
| `next build` | compiled successfully, 38 routes plus `icon.png`, no Supabase settings needed |

## 2. Five sales, end to end, at 1440×900 and 390×844

Each walk ran the whole sale with `scripts/desk-walk/sale.cjs`: Start A Sale,
the corridor and every document. `ceremony.cjs` then signed the packet as the
buyer: it read each document to the end, signed it, and reused the first
stroke with consent. Every screen is in `walks/<scenario>-<w>x<h>/`, and the
signing ceremony is in `walks/<scenario>-<w>x<h>-cer/`.

| # | Sale | Packet | 1440×900 | 390×844 |
|---|---|---|---|---|
| 1 | Cash, out the door, dealer files, insurance shown (`cash-otd`) | Bill of sale, 130-U | 2 / 2 signed | 2 / 2 signed |
| 2 | Cash, vehicle only, partial payment (`cash-balance`) | Bill of sale, 130-U | 2 / 2 signed | 2 / 2 signed |
| 3 | Buy here pay here with a trade-in (`bhph-trade`) | Bill of sale, 130-U, financing | 3 / 3 signed | 3 / 3 signed |
| 4 | Bank financing, Chase Auto Finance (`bank`) | Bill of sale, 130-U (no dealer contract) | 2 / 2 signed | 2 / 2 signed |
| 5 | Buyer files, no insurance shown (`buyer-files`) | Bill of sale, vehicle responsibility, insurance ack. (no 130-U) | 3 / 3 signed | 3 / 3 signed |

On every walk:

- **Theme assertion:** the walker checked three computed styles before it
  trusted any screenshot. The current answer's border is
  `rgb(0, 0, 0)`, the ground is `rgb(238, 239, 242)`, and the question header
  is set in Barlow Semi Condensed. All 10 walks printed `THEME OK`.
- **Contrast audit:** every visible text node on every desk screen and every
  ceremony screen was measured against its real background. There were
  **0 WCAG AA failures** in all 20 runs (10 desk, 10 ceremony).
- **Brand:**
  - The sign-in page and the buyer's signing cover show the colour logo on the
    light ground.
  - The black rail shows the red swoosh over a white, letter-spaced
    "DISCOUNT / USED CARS AND TRUCKS".
  - The phone tab bar carries no logo, the same as the reference.
  - No page's HTML contains "Vega", the Vega's address or licence, or "Discount
    Auto". Page titles read "… - Discount Used Cars and Trucks".
  - Screenshots are in `brand-screens/`.

## 3. The printed packet

Every PDF of all five 1440×900 packets was downloaded through the packet
screen's own Open/Print route (`pdfs.cjs`) and read with PyMuPDF. That covers
the text and the 130-U's filled fields by name. The buy here pay here packet is
rasterised in `packet-pages/` and was read page by page. Full results are in
`packet-checks.txt`, where all 117 automated checks pass.

- **Dealer:** "Discount Used Cars and Trucks, LLC" appears on every document.
  On the 130-U it is in box 20 and on the seller line, in its exact licensed
  casing. GDN P145000 is on every document, including 130-U box 21. The venue
  is Harris County on the bill of sale and the contract.
- **Lienholder (130-U box 34 and the bill of sale):**
  - Walk 1 (paid in full): none.
  - Walk 2 (cash with a balance): the dealer, with a $326.75 seller lien.
  - Walk 3 (buy here pay here): the dealer, at 8108 Gulf Fwy.
  - Walk 4 (bank): Chase Auto Finance. The dealer's address is not on the
    130-U, and there is no seller lien and no dealer contract.
- **Odometer:** identical on every document in each packet. For example,
  walk 3 prints 118340 on the bill of sale, the 130-U and the contract.
- **Bill of sale:** the figures sum to the total. For walk 3, $9,000.00 −
  $2,000.00 + $545.50 = $7,545.50.
- **Dates:** 10/01/2026, the business date, is the only date on any document.
- **Hosts and facts:** no localhost or dev host appears on any document. No
  Vega's, Triple J or private fact appears either. The only `[Not set]` on
  paper is the website domain.
- **Ink:** the letterheads and the logo are black ink only. The letterhead
  pages had 0 coloured pixels: page 1 of the bill of sale, page 1 of the
  contract, and both 130-U pages. The only colour in the packet is the
  existing red marking open balances, plus the rust down-payment figure.

## Open: desk facts behind the site

The public site has since taken the owner's billboard artwork (10/01/2026):

- hours Tuesday to Saturday, 10 AM to 7 PM, with Sunday and Monday closed;
- the domain www.discountusedcarsandtrucks.com.

The desk was verified on the facts it was given:

- hours Monday to Friday, 10:00 to 17:00, from the Google listing;
- no domain, so every document prints `[Not set: website domain]`.

To bring the desk into line, update `hours` in `src/lib/dealership-config.ts`
and `src/__tests__/dealer-hours.test.ts`, and set `NEXT_PUBLIC_SITE_URL` once
the owner's confirmation is recorded.

## Known issues carried over from the reference (not changed)

Reported, not changed, because money math and document rules are fixed:

- **Trade-in on a buy here pay here sale:**
  - The bill of sale credits the trade and taxes $7,000. The retail installment
    contract taxes the full $9,000 and has no trade-in line.
  - The bill of sale's seller-lien balance ignores the down payment.
  - 130-U box 36 (trade-in) is left blank.
- **Contract colour:** the contract prints the down payment in a rust colour.
- **Late-handling fee:** the vehicle-responsibility form prints a hard-coded
  $100 late-handling fee that the owner has not confirmed.
