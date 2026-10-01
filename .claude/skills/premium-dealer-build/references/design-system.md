# Design system: a marque's grammar (porsche.com/usa)

The reference is porsche.com/usa. The feeling comes from a few disciplined
rules, not from decoration. The working implementation is
`clients/vegas-auto-sales/src/styles/global.css` and its components; copy it
and change only the brand inputs.

## The rules

1. **Photography carries the page.** Full-bleed pictures, rounded image tiles,
   text over the picture. Every large picture is a named **photo slot**
   (`src/data/media.ts`) with a drawn stand-in (`Scene`) until the real image
   arrives, plus a **focus point** (`photoFocus`) so phones crop to the subject.
2. **Black and white only.** `#000`, `#fff`, surface `#eeeff2`, lines
   `#e3e4e5`/`#c9cacb`, muted text `#5f6265` (on white) / `#a4a6a8` (on black).
   **The client's logo is the only colour.** A brand hue may appear once as a
   subtle tile gradient, never on buttons or text.
3. **One narrow grotesk.** Barlow Semi Condensed 400/500/600 (+600 italic for
   the body-type card signatures), **self-hosted via @fontsource**. Google
   Fonts is often blocked in the build container and the fallback looks cheap.
4. **Title Case** (every word capitalised) on headings, subtitles, buttons,
   navigation, labels, chips and card titles: `text-transform: capitalize` on
   those classes. Paragraphs, reviews, fine print and form help stay in
   sentence case.
5. **Buttons**: 54px tall, 6px radius, sentence of 1–3 words. Primary black on
   white, light (white) on black, **frost** (`rgba(255,255,255,.2)` + 14px
   backdrop blur) over photos. Round 40px frosted **arrow buttons** on tiles.
6. **Motion is quiet**: hero photo settles from 1.08 scale over 6s, headline
   lines rise in, sections fade up once on scroll (`.reveal`), tiles zoom 4%
   on hover. A short once-per-session **intro loader** (logo resolves, the name
   draws in wide capitals, hairline runs out). Respect reduced motion.

## Page anatomy (home)

1. **Header**: transparent over the hero with a top gradient; `☰ Menu` left,
   logo + NAME in wide caps (letter-spacing .42em) centred, open-now dot +
   call + directions right. Turns white/frosted after 40px of scroll (or at
   once on pages without a dark hero). Menu opens a left **drawer**: big
   links with one-line notes, then a quieter **Admin** link ("Staff sign-in to
   the sale desk") to `VITE_DESK_URL` + `/admin/login`, call/text buttons,
   hours. The Admin link is hidden until `VITE_DESK_URL` is set, so a site
   never ships a dead link before its desk is deployed.
2. **Hero**: ONE fixed full-screen photograph (like thetriplejauto.com and
   Porsche), not a carousel. Subject right of centre, calm left side; the
   headline (2 short lines) is pinned to the left gutter at every width so it
   never crosses the subject; one line of subtitle; primary light button +
   frost button; scroll arrow. Separate portrait crop for phones.
3. **Three featured vehicles** as rounded tiles (real inventory photos).
4. **Black lineup band**: "Find Your Fit." Four square cards (SUVs, Sedans,
   Trucks, Coupes) with an italic signature title, frosted chips (in-stock
   count or "Ask about availability", from $/mo), one line, "From $" and a
   round arrow. Showroom photos keep the four cards matched.
5. **Split visit card**: black text half with address, hours, directions
   button; picture half (a REAL photo of the lot).
6. **Finder**: "Find your next pre-owned vehicle." with a search box, and a
   transparent cut-out of white vehicles on the white band.
7. **Service band** (auto glass, or the client's second line of business):
   copy + a drag-to-compare before/after + three tiles.
8. **Discover**: three typographic tiles (easy credit $/mo, rating, language)
   and a rotating real review quote.
9. **Footer**: black, "Scroll up", four columns (Visit, Hours, Contact,
   Explore), logo, legal name + dealer licence, pricing disclaimer. A floating
   Call / Text / Directions dock on phones.

Inner pages share a shorter **PageHero** (photo, title low-left, subtitle)
then white/surface bands. Inventory = filter chips + grid of light cards
(photo, make, model, meta line, price or "Call for price", est. $/mo, black
round arrow). Vehicle page = gallery with thumbnails + sticky panel (price,
text/call/pre-qualify buttons, highlight chips) + specs + viewing form.

## Brand inputs to change per client

- Logo files → `public/brand/` (full, small, 512 icon, favicon, touch icon,
  OG 1200×630 made from the hero photo).
- `business.ts` (name, facts, hours, reviews) and the `Loader` SEEN_KEY.
- Hero headline: the client's real offer in two short lines
  (Vega's: "Trucks, cars / & SUVs." + "Easy credit and auto glass at …").
- Body-type lines, service band content, Discover tiles.
- Nothing else: resist restyling the system per client; the premium feel is
  the consistency.

## The admin desk wears the same clothes

Desk tokens (`--tj-*` roles in the desk's `globals.css`): ground `#eeeff2`,
panel `#fff`, well `#e4e5e8`, line `#d8d8db`, ink `#0b0b0c`, muted
`#5b5e61`, faint `#626568`, accent `#000`. Barlow Semi Condensed everywhere
(Title Case headings are already the desk's convention). The left rail and
phone tab bar are the site's black band: scope-flip the role tokens inside
`.ed-admin-rail, .ed-admin-tabs` to white-on-black, and put the logo beside a
wide wordmark there. Printed documents stay black ink only (a photocopier
turns colour logos to mud); set `color-scheme: light` and make sure no
dark-mode filter can flatten the colour logo to white.

## Gotchas already paid for

- A class name reused for two things (`.range` = slider AND grid) silently
  collapsed a grid to 26px. Grep before naming a class.
- Grid items sized only by `aspect-ratio` need `align-items: start` on the grid.
- `text-transform: capitalize` also capitalises after hyphens and slashes
  ("Pre-Owned", "/Mo"): accepted as part of Title Case.
- `document.fonts.check()` returns true when a font simply isn't declared;
  verify fonts by looking at a screenshot.
