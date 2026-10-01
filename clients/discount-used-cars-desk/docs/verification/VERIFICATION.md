# Verification

Run on the local dev server after deleting `.next`, with the in-memory preview
mock (no Supabase) and `DESK_ALLOW_UNSET_FACTS=true`. Dealer facts that are
still unknown print as `[Not set: …]`, and the documentary fee is unset ($0,
marked "Not set").

## 1. Static checks

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint .` | 0 errors, 4 warnings (unused variables, present in the reference as shipped) |
| `vitest run` | 120 files, **1,396 tests passed** (`test-output.txt`) |
| `next build` | compiled successfully, 38 routes |
| Migration | applied cleanly to Postgres (PGlite), with Supabase `auth` and `storage` stubbed |

The SOP's money vectors pass verbatim (`src/__tests__/sop-test-vectors.test.ts`,
using a $400 fee-stack fixture):

- **$4,000 out the door:** car $3,388.24, tax $211.76, fees $400, total $4,000.
- **$3,500 vehicle only:** tax $218.75, total $4,118.75, balance $618.75.
- **$4,000 vehicle only:** total $4,650.
- **$10,000 vehicle only with a $3,000 trade-in:** tax $437.50, total $7,837.50.
- **Any lender deal:** balance $0.
- **Buy here pay here with no down payment:** the note equals the total.

## 2. Five sales, end to end, at 1440×900 and 390×844

Each walk runs Start A Sale, the whole corridor and every document, then signs
the packet through the buyer's ceremony: read to the end, sign, and reuse the
first stroke with consent. Contact sheets of every screen are in `walks/`.

| # | Sale | Packet | 1440 | 390 |
|---|---|---|---|---|
| 1 | Cash, out the door, dealer files, buyer signs, insurance shown | Bill of sale, 130-U | 2 / 2 signed | 2 / 2 signed |
| 2 | Cash, vehicle only, partial payment (balance and lien) | Bill of sale, 130-U | 2 / 2 signed | 2 / 2 signed |
| 3 | Buy here pay here with a trade-in | Bill of sale, 130-U, financing | 3 / 3 signed | 3 / 3 signed |
| 4 | Bank financing (Chase Auto Finance) | Bill of sale, 130-U (no dealer contract) | 2 / 2 signed | 2 / 2 signed |
| 5 | Buyer files, no insurance shown | Bill of sale, vehicle responsibility, insurance ack. (no 130-U) | 3 / 3 signed | 3 / 3 signed |

On every walk:

- **Theme assertion:** before any screenshot was trusted, the walker asserted
  three computed styles: the current answer's border is the accent
  `rgb(214, 183, 122)`, the ground is `rgb(11, 11, 12)`, and the question
  header is set in Bodoni Moda.
- **Contrast audit:** every visible text node on every desk and ceremony
  screen was measured against its real background. There were **0 WCAG AA
  failures** across all 20 runs.
- **Ceiling (walk 3):** $400 × 36 was agreed, which implied a rate above the
  Texas ch. 348 ceiling. The rate was held at 25.98% and the payment
  recomputed to $329.11.

## 3. The printed packet

Every PDF was downloaded through the same route the packet's Open/Print
button uses, then rasterised (`packet-pages/`) and read (`packet-checks.txt`):

- **130-U filled fields, by name:** VIN, year, make, odometer, applicant, ID
  number with the licence box ticked, ID state, county of residence (19), sales
  price, the seller printed name, and the dates.
- **Lienholder (box 34):**
  - Walk 1, paid in full: none.
  - Walk 2, cash with a balance: the dealer.
  - Walk 3, buy here pay here: the dealer.
  - Walk 4, bank: "Chase Auto Finance", with no dealer address anywhere on the form.
- **Bill of sale:** the figures sum to the total. Walk 3: $9,000 − $2,000
  trade-in + $545.50 fees and tax = $7,545.50.
- **Odometer:** identical on every document in a packet (for example,
  118,340 on walk 3's bill of sale, financing contract and 130-U).
- **Business date:** 09/26/2026 on every document and signature line.
- **No invented facts:** the website still prints as `[Not set: …]` (the
  legal name, licence and county now come from the TxDMV record), and the dev
  host appears on no document.

## Re-verified on the site theme and the TxDMV facts

The desk was re-dressed to match the public site (pale grey ground, white
cards, black ink and actions, Barlow Semi Condensed, black rail with the
emblem), and the legal name, GDN and county were loaded from the TxDMV licence
record. All five walks were run again at both sizes, every packet signed
through the ceremony:

| Walk | 1440 | 390 |
|---|---|---|
| Cash, out the door | 2 / 2 signed | 2 / 2 signed |
| Cash with a balance | 2 / 2 signed | 2 / 2 signed |
| Buy here pay here with a trade-in | 3 / 3 signed | 3 / 3 signed |
| Bank financing | 2 / 2 signed | 2 / 2 signed |
| Buyer files | 3 / 3 signed | 3 / 3 signed |

- **Theme assertion** on every walk: current answer border `rgb(0, 0, 0)`,
  ground `rgb(238, 239, 242)`, headings in Barlow Semi Condensed.
- **Contrast:** 0 WCAG AA failures on every desk and ceremony screen, all 20
  runs.
- **Packet (buy here pay here):** the bill of sale, 130-U and financing
  contract all print *Constantino Vega DBA Vega's Auto Sales*, GDN P113248 and
  Harris County, with no Not-set marker for any of them.
- **Tests:** 1,396 passed.

## Deviations from the SOP, on purpose

- **Sale language:** required with no default (the SOP's rule). The
  reference defaults to English at its owner's request; Vega's serves a
  bilingual clientele.
- **County on the 130-U:** still asked, but prefilled from the address. The
  reference's newer behaviour, kept because a buyer can live across a county
  line from their post town.
- **"Balance":** the code calls it `lien`. A cash balance is the seller's lien.
- **`customers.name`:** the code uses `name`, not the SOP's `full_name`. The
  migration follows the code.
