# The image brief: prompts for the team, images back into slots

Claude cannot log into the user's ChatGPT (or any) account, stock photo sites
are usually blocked from the build container, and an image-generation
connector may have no credits. So the working loop is: **Claude writes the
prompts → the team generates in ChatGPT → the user uploads the results → Claude
places them.** Deliver the prompts as a shared living doc (Claude Docs when the
connector is present; otherwise a markdown file in the client folder), mark
each image done as it lands, and keep the list honest about what is left.

## What may be generated, and what may not

- **Generated = brand and mood only.** Hero, page banners, body-type showroom
  cards, service close-ups, before/after, cut-outs. No brand badges, emblems,
  logos or licence plate text on any vehicle; no text in the image; no people
  unless described.
- **Never generated:** a vehicle presented as for sale (inventory is the
  dealer's own photos only), the dealership's lot or building (the Visit
  image must be a real phone photo; a generated lot is only a flagged
  stand-in until then, and the owner will spot it immediately), staff,
  customers, reviews.
- Mark generated images in `media.ts` comments ("brand image, not a vehicle in
  stock") and give them neutral alt text ("A black pickup truck parked at
  sunset", never "Vega's truck").

## Choosing the hero

Ask what the dealership sells most and how the brand looks (the logo is the
tell: Vega's emblem = Texas flag + black muscle car → a black crew-cab truck).
Write the hero prompt first, get it approved, and derive every other prompt's
light and palette from it ("upload the hero and say: use the same truck and
the same light").

## The house style line (appended to every prompt; adapt the setting to the city)

> Photorealistic automotive advertising photograph. Golden-hour Texas light,
> low warm sun, crisp reflections, rich contrast, subtle film grain. Full-frame
> camera, 50mm lens, f/2.8, eye level. Premium and cinematic, like a Porsche or
> Range Rover campaign. No text, no logos, no badges or emblems on any vehicle,
> no licence plate lettering, no people unless described.

## The slot list (numbered; file name = number + slot)

| # | Slot | Shape | Prompt pattern |
|---|---|---|---|
| 0 | `hero` (+ `hero-mobile` crop) | wide 16:9 | A [colour] [hero vehicle], clean and polished, three-quarter front angle on the RIGHT of the frame facing slightly left. Golden-hour light raking across the body. A quiet concrete lot beside a low stucco wall with live oak shadows. The LEFT 45% calm and slightly darker, no objects, room for a headline. |
| 1 | `inventory` | wide | A black full-size SUV and a silver four-door sedan side by side at a slight angle on the right, pale concrete, stucco wall with oak shadows, open wall and sky on the left. |
| 2 | `glass` (service banner) | wide | Close-up of the windshield and A-pillar of a black pickup, glass clean and reflecting a warm sunset sky and oak branches, thin bead of urethane on the edge. Subject right, dark soft left. |
| 3 | `financing` | wide | A hand holding a single car key in an open palm, sharp on the right, a black pickup softly out of focus behind at golden hour. Only hand and wrist. |
| 4 | `visit` | wide | **Real phone photo of the lot at dusk from across the street.** Stand-in only if needed: a quiet [city] street at blue hour, warm streetlights, no storefronts, no signs. |
| 5 | `not-found` | wide | An empty two-lane [state] road at dusk curving away, fence posts and live oaks on the right, warm orange horizon, no vehicles. |
| 6–9 | `body-suv` / `body-sedan` / `body-truck` / `body-coupe` | square (wide is fine; focus crops it) | A [black three-row SUV / silver executive sedan / white crew-cab pickup / deep red two-door coupe], three-quarter front view, in a dark showroom with three long ceiling light strips reflecting on its roof and hood, polished dark floor with a soft reflection. Same showroom in all four. |
| 10–12 | `glass-windshield` / `glass-door` / `glass-back` | wide | New windshield on a black truck from a low front angle reflecting sunset / close side view of a front door window half lowered with oak reflections / rear window of a black crew-cab with defroster lines catching the light. Dark backgrounds. |
| 13 | `glass-after` | wide | The windshield of a black truck seen straight on from slightly above the hood, filling the frame, glass perfectly clean, reflecting a warm sunset sky. |
| 14 | `glass-before` | same frame | Upload 13 back and say: "Edit this image: add a realistic stone-chip impact with long cracks spreading across the lower left of the windshield. Change nothing else." (Two separate generations will not line up in the drag-to-compare.) |
| 15 | `finder` | **transparent PNG** | Three vehicles in white paint (crew-cab pickup, mid-size SUV, four-door sedan), side profile facing left, staggered and overlapping back to front, the pickup largest in front, transparent background, soft contact shadows. |

Swap rows 2, 10–14 for the client's own second line of business (detailing,
tyres, rentals, service) when it isn't auto glass; keep the same shapes.

## Placing an image

1. Save the upload, then `scripts/prepare_image.py <in> public/photos/<slot>.webp`
   (`--trim` for the transparent cut-out; `--mobile-crop … --focus-x 0.6` for
   the hero's phone version).
2. Map it in `src/data/media.ts` (`photos`) and add a focus point in
   `photoFocus` (where the subject sits, e.g. `'72% 50%'`), so narrow screens
   crop to it.
3. Rebuild, screenshot that section at 1440 and 390 (`scripts/site_screens.cjs`
   or an element screenshot), look at it, fix the focus if the subject is cut.
4. Commit, push, send the user the screenshot, and mark the row done in the
   shared brief ("Done and live: 1, 2, 3. Still needed: …").
