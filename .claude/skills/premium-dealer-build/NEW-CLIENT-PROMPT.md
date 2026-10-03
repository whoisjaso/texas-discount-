# New client prompt

Paste everything below the line into a new Claude Code session on the
repository that holds the newest build (`whoisjaso/texas-discount-`). Fill in the brackets; leave a line as
`unknown` when you don't have it (never guess: the build marks it missing).
Attach the logo file and any Facebook collages or lot photos with the message.

---

Use the premium-dealer-build skill. Onboard a new dealership client by
replicating the newest build exactly: copy `clients/discount-used-cars-site`
to `clients/[client-slug]-site` and `clients/discount-used-cars-desk` to
`clients/[client-slug]-desk` (whoisjaso/texas-discount-). Keep the design system untouched (the
porsche.com/usa grammar: one fixed full-screen hero photo, black and white
with the client's logo as the only colour, Barlow Semi Condensed self-hosted,
Title Case on headings, subtitles, buttons and labels, frosted buttons,
rounded photo tiles, the black lineup band, the split visit card, the finder,
the service band, Discover tiles, the black footer, the phone dock). Change
only the brand inputs.

Keep the Admin link in the menu drawer: it opens the sale desk's staff
sign-in (`VITE_DESK_URL` + `/admin/login`) and appears once the desk URL is set.

The admin desk is the Handle A Sale desk already built in `clients/discount-used-cars-desk`
(first sign-in onboarding, the person's name on the 130-U, the bill of sale's
lock, void and file again, reset sign-out, automatic empty weight):
keep its logic and flow exactly as written in the skill's
`references/handle-a-sale-desk-sop.md`, re-dressed in this client's site theme.

Client:
- Business name: [name as customers know it]
- Logo: [attached]
- Address: [street, city, ZIP]
- Phone: [number]
- Hours: [days and times]
- What they sell most: [trucks / SUVs / sedans / mix]; financing: [BHPH / easy credit / banks / cash]
- Second line of business for the service band: [auto glass / detailing / repair / tint / none]
- Languages spoken: [English / Español]
- Facebook page: [link]; Google listing: [link]
- TxDMV dealer search screenshot: [attached, gives legal name, GDN and county]
- Doc fee: [amount or unknown]; authorised signer: [name or unknown]; domain: [domain or unknown]
- Inventory: [attached Facebook collages / CarGurus link / none yet]

Work through the skill's phases in order. After Phase 0, report the facts you
found with sources, what's missing and the hero concept, then wait for my go.
Then build the site, send me desktop and phone screenshots, write the image
brief as a shared doc for my team to run in ChatGPT, place the images as they
come back, load the real inventory, re-theme and verify the desk, push to the
session branch with a draft PR, and deploy the site to Vercel so I can show the
owner. Then make the demo videos with the recordly-demo skill: the short
showcase and the narrated walkthrough (show me the script before it is
voiced), and put both MP4s in the chat.
