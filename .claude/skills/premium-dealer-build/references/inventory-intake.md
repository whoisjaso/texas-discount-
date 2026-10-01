# Real inventory from the dealer's posts

Inventory is the one place the site must be the dealer's own truth. Sample
vehicles are a design scaffold only; the moment real vehicles arrive, delete
the whole sample list (a mix of real and fake is worse than either).

## Getting the photos

Facebook blocks automated access, so the user sends what they have: usually
Facebook-style **collages** (2×3 grids, or one big photo plus small cells) and
sometimes screenshots of the post text. Also check whether the dealer lists on
CarGurus (the CarGurus connector's listing search near the ZIP) before asking.

1. Cut each collage into single photos with `scripts/crop_collage.py`, listing
   the best exterior three-quarter shot FIRST (it becomes the cover), then
   front, side/rear, dash, seats. Seams are often not white, so estimate the
   cell boxes by eye (halves/thirds of the square), use the default 8px inset,
   and look at the contact sheet before using the crops.
2. Files land in `public/photos/inventory/<slug>/<n>.webp`.

## Filling in the record

Fill in only what the photos or the post actually show:

- **Make and model** from the badges (GMC, Terrain, Acura RDX, INFINITI Q70).
- **Trim/engine** only from a legible badge ("5.6" on the Q70 → trim `5.6`,
  engine `5.6L V8`; "AWD" badge → drivetrain `AWD`).
- **Exterior** as a plain colour word (Gray, Silver, Brown); **interior** as
  seen (Black leather, Beige leather).
- **Highlights** only for features visible in the photos (sunroof, leather,
  wood trim, parking sensors, touchscreen).
- **Year, price, miles, VIN, stock number:** only from the post text or the
  owner. When absent, leave them out: the site omits the year, shows "Call
  for price" and "Ask about easy credit", and hides the $/mo estimate. Never
  estimate a year from styling or a price from the market.
- `coverFocus` when the cover crop cuts the car (a left-facing car wants
  `'28% 55%'`), `featured: true` on the three to show on the home page.

Slug: `make-model-badge` (`gmc-terrain-awd`, `infiniti-q70-5-6`); add the year
once known. The data file header says where the vehicles came from and that
missing fields must not be guessed.

## When a body type has no stock

Keep its card on the home lineup with the showroom image and the chip "Ask
about availability"; the filtered inventory page shows the "tell us what
you're looking for" empty state. Don't hide the category the brand is built on.
