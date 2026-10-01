# Photos for the Discount Used Cars and Trucks site

Every picture on the site is a named slot in `src/data/media.ts`. A slot with
no photo shows a drawn stand-in, so nothing is ever broken while images are
pending. The team generates each image in ChatGPT from the prompts below and
sends it back named with its number and slot (e.g. `00-hero.png`); Claude
crops, compresses and maps it. The team's working copy, with a status column,
is the shared doc: https://claude.ai/code/artifact/c0d9d2fc-1a4d-469f-b04f-9cc5632937f2

**Vehicles for sale always come from the dealer's own photos** (the lot,
Facebook posts). The generated images are mood and brand pictures: no badges,
no plates, nothing that claims to be a car in stock. The owner asked for an
enhanced image on the Visit card instead of the current lot (10/01/2026), so 04
is a mood picture of the area that never shows a storefront or a sign.

## House style (paste at the end of every prompt)

> Photorealistic automotive advertising photograph. Golden-hour Texas light,
> low warm sun, crisp reflections, rich contrast, subtle film grain. Full-frame
> camera, 50mm lens, f/2.8, eye level. Premium and cinematic, like a Porsche or
> Range Rover campaign. No text, no logos, no badges or emblems on any vehicle,
> no licence plate lettering, no people unless described.

Make the hero first. For every later prompt with a vehicle or outdoor light,
upload the finished hero to ChatGPT first and add: *"Use the same light and
colour grade as this image."* (For 03, add *"and the same red truck."*)

## 00 · `hero` — first, wide 16:9, the largest size available

A deep candy-red full-size crew-cab pickup truck, clean and polished, parked on
the paved shoulder of a straight, empty two-lane Texas highway. The truck sits
on the RIGHT third of the frame at a three-quarter front angle, facing slightly
left toward the camera. The road's dashed centre line runs away from the camera
to a flat horizon just left of centre, with the low sun on that horizon raking
warm light across the hood and doors. Flat Gulf Coast prairie and a few distant
live oaks. The LEFT 45% of the frame is calm: open road and soft sky fading to
dusk, slightly darker, no objects, room for a headline. Nothing written on the
doors, grille or tailgate.

(The phone crop, `hero-mobile`, is made from this image; no separate prompt.)

## Page banners — wide landscape, subject right, left 45% calm and darker

01 · `inventory` — A silver four-door sedan and a white compact SUV parked side
by side at a slight angle on the RIGHT of the frame, on clean pale concrete
beside a low white stucco wall with live oak shadows. The LEFT side is open
wall and evening sky.

02 · `sell` — Close-up of two hands meeting over the hood of a dark grey pickup
truck, one passing a single car key to the other, sharp on the RIGHT of the
frame, golden-hour light on the paint. Only hands and forearms are visible. The
LEFT 45% is soft, dark and out of focus.

03 · `financing` — A hand holding a single car key in an open palm, sharp on
the RIGHT of the frame, the deep red pickup truck softly out of focus behind it
at golden hour. Only the hand and wrist are visible.

04 · `visit` — A Houston freeway frontage road beside the elevated Gulf
Freeway at blue hour, warm streetlights glowing, live oaks along a clean
sidewalk, the sky deep blue fading to orange at the horizon on the RIGHT. No
storefronts, no signs, no lettering, no vehicles. The LEFT side calm and
darker. (Owner's choice: an enhanced picture of the area, never a fake of the
lot itself.)

05 · `not-found` — An empty two-lane Texas highway at dusk running straight
toward the horizon and curving away at the end, dashed centre line, fence posts
and live oaks on the RIGHT, a warm red-orange horizon, no vehicles.

## Body-type cards — square, same dark showroom, vehicle in the lower middle, top quarter empty and dark

A real vehicle's photo replaces these automatically once that body type is in
stock. Make 06 first, then upload it with each of the others and add *"Same
showroom, same lighting, same camera angle."* Leave out the golden-hour part of
the house style line for these four.

06 · `body-suv` — A black full-size three-row SUV, three-quarter front view, in
a dark showroom with three long ceiling light strips reflecting on its roof and
hood, on a polished dark floor with a soft reflection.

07 · `body-sedan` — A silver four-door sedan, three-quarter front view, in the
same dark showroom with ceiling light strips and a polished dark floor.

08 · `body-truck` — A white crew-cab pickup truck, three-quarter front view, in
the same dark showroom with ceiling light strips and a polished dark floor.

09 · `body-coupe` — A deep red two-door sports coupe, three-quarter front view,
in the same dark showroom with ceiling light strips and a polished dark floor.

## We Buy Cars band — landscape, dark and moody

Make 11 first, then upload it with 12 and 13 and add *"Same asphalt, same dusk
light, same camera height."*

10 · `sell-band` (5:3) — A handshake over the open driver's door of a silver
four-door sedan at golden hour. Only the two hands and forearms are visible, the
door glass reflecting a warm sky, dark soft background.

11 · `sell-cars` (4:3) — A silver mid-size four-door sedan, three-quarter front
view, parked alone on dark wet asphalt at dusk, a warm rim light along its
roofline, dark background.

12 · `sell-trucks` (4:3) — A white crew-cab pickup truck, three-quarter rear view
showing the tailgate and bed, parked alone on dark wet asphalt at dusk, warm rim
light, dark background.

13 · `sell-suvs` (4:3) — A black mid-size SUV, three-quarter front view, parked
alone on dark wet asphalt at dusk, warm rim light along the roof rails, dark
background.

## Inventory search

14 · `finder` — Three vehicles in white paint (a crew-cab pickup truck, a
mid-size SUV and a four-door sedan), side profile facing left, staggered and
overlapping from back to front, the pickup largest in front, on a transparent
background, soft natural contact shadows. Photorealistic, studio lighting. No
text, no logos, no badges or emblems, no licence plate lettering. **Ask for a
transparent PNG** and skip the house style line.

## Status

Done and live: 00 hero (+ phone crop), 02 sell, 03 financing, 05 not-found,
06 body-suv, 07 body-sedan, 08 body-truck, 09 body-coupe, 10 sell-band.
Optional: 06 was made in a different room from 07–09 (redo it with 07 as the
reference so the four cards match).
01 inventory is placed but needs a redo (emblems on both grilles; the cars sit
too far left, so the title touches the SUV at 1440). Still needed: 01 redo, 04,
11–14.
