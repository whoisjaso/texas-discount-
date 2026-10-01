# Photos for the Vega's site

Every picture on the site is a named slot in `src/data/media.ts`. A slot with
no photo shows a drawn stand-in, so nothing is ever broken while images are
pending. Send a finished image with its number and it is cropped, compressed
and mapped.

**Vehicles for sale always come from Vega's own photos** (Facebook posts or the
lot). The generated images below are mood and brand pictures: no badges, no
plates, nothing that claims to be a car in stock.

## House style (paste at the end of every prompt)

> Photorealistic automotive advertising photograph. Golden-hour Texas light,
> low warm sun, crisp reflections, rich contrast, subtle film grain. Full-frame
> camera, 50mm lens, f/2.8, eye level. Premium and cinematic, like a Porsche or
> Range Rover campaign. No text, no logos, no badges or emblems on any vehicle,
> no licence plate lettering, no people unless described.

For any shot with a truck, upload `public/photos/hero-truck.jpg` to ChatGPT
first and add: *"Use the same black truck and the same light as this image."*

## Page banners — wide landscape, subject right, left 45% calm and darker

1. `inventory` — A black full-size SUV and a silver four-door sedan parked side by side at a slight angle on the right of the frame, on clean pale concrete beside a low stucco wall with live oak shadows. The left side is open wall and sky.
2. `glass` — Close-up of the windshield and A-pillar of a black pickup truck, the glass perfectly clean and reflecting a warm sunset sky and oak branches, a thin bead of black urethane visible along the edge. Subject on the right, dark soft background on the left.
3. `financing` — A hand holding a single car key in an open palm, sharp on the right of the frame, a black pickup truck softly out of focus behind it at golden hour. Only the hand and wrist are visible.
4. `visit` — Best as a real phone photo of the lot. If generating: a quiet Houston street at blue hour, warm streetlights and palm trees, glowing tail-lights receding, no storefronts, no signs.
5. `not-found` — An empty two-lane Texas road at dusk curving away into the distance, fence posts and live oaks on the right, a warm orange horizon, no vehicles.

## Body-type cards — square, same dark showroom, vehicle in the lower middle, top quarter empty and dark

A real vehicle's photo replaces these automatically once that body type is in stock.

6. `body-suv` — A black full-size three-row SUV, three-quarter front view, in a dark showroom with three long ceiling light strips reflecting on its roof and hood, on a polished dark floor with a soft reflection.
7. `body-sedan` — A silver four-door executive sedan, three-quarter front view, in the same dark showroom with ceiling light strips and a polished dark floor.
8. `body-truck` — A white crew-cab pickup truck, three-quarter front view, in the same dark showroom with ceiling light strips and a polished dark floor.
9. `body-coupe` — A deep red two-door sports coupe, three-quarter front view, in the same dark showroom with ceiling light strips and a polished dark floor.

## Glass tiles — landscape 4:3, dark and moody, glass is the subject

10. `glass-windshield` — A new windshield on a black truck seen from a low front angle, the glass spotless and mirror-like, reflecting a sunset sky, the hood edge in the foreground, dark background.
11. `glass-door` — A close side view of a black vehicle's front door with the window glass half lowered, crisp reflections of oak branches on the glass, dark background.
12. `glass-back` — The rear window of a black crew-cab pickup truck seen from behind at a slight angle, the glass clean with thin defroster lines catching the light, dark background.

## Before and after — make these as a pair, same frame, landscape 5:3

13. `glass-after` — The windshield of a black truck seen straight on from slightly above the hood, filling the frame, the glass perfectly clean and reflecting a warm sunset sky.
14. `glass-before` — Upload image 13 back to ChatGPT and say: *"Edit this image: add a realistic stone-chip impact with long cracks spreading across the lower left of the windshield. Change nothing else."*

## Inventory search

15. `finder` — Three vehicles in white paint (a crew-cab pickup truck, a mid-size SUV and a four-door sedan), side profile facing left, staggered and overlapping from back to front, the pickup largest in front, on a transparent background, soft natural contact shadows. **Ask for a transparent PNG.**

## Already in place

- `hero` / `hero-mobile`: the black truck at sunset (brand image, not a vehicle in stock).
