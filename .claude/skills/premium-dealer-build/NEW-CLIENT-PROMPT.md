# New client prompt

Paste everything below the line into a new Claude Code session on the
repository that holds the newest build (`whoisjaso/texas-discount-`). Fill in the brackets; leave a line as
`unknown` when you don't have it (never guess: the build marks it missing).
Attach the logo file and any Facebook collages or lot photos with the message.
The agent (Claude or any other coding agent) then follows the skill's gated
phases in order and stops at each review gate for your go, keeping
`clients/<slug>-STATUS.md` so you can see where the build stands.

---

Read `.claude/skills/premium-dealer-build/SKILL.md` in this repository first and follow it (not an account
copy of the skill); its `references/`, `scripts/` and `assets/` paths are relative to that folder. The video
skill is `.claude/skills/recordly-demo/SKILL.md`.

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
(first sign-in onboarding with Your Fees: the owner enters the dealer's fees
at first sign-in and the desk refuses any fee over its Texas limit from
`references/texas-dealer-fees.md`; the person's name on the 130-U and VTR-61;
the default signers; paperwork filled page by page; the bill of sale's lock;
void and file again; reset sign-out; automatic empty weight):
keep its logic and flow exactly as written in the skill's
`references/handle-a-sale-desk-sop.md`, re-dressed in this client's site theme.
Never type a fee into the code.

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
- The owner (the desk's first Owner account; every staff member signs the paperwork as themselves): [name and email, or unknown; never a password]; domain: [domain or unknown]
- Late-handling fee on the Vehicle Responsibility sheet: not asked as an amount. The build asks counsel's question about its legal basis (fee rulebook 6.1, question 6) and keeps that sheet unfiled until counsel answers.
- Fees: the owner enters the dealer's own fees (the doc fee; the deputy title fee and inventory tax if they apply) at their first sign-in (Your Fees), and each sale's state fees come from webDEALER. Filed a doc fee above $225 with the OCCC (7 TAC §84.205): [yes / no / unknown]. The doc fee the build's walks and the films type: [the owner's figure, or your OK for one at or under $225.00]. It is checked against the limit and used only as the walk and demo input; it never goes into the code.
- Inventory: [attached Facebook collages / CarGurus link / none yet]
- Demo video (asked now so the video phase never waits): film the owner's first sign-in with Your Fees, or a salesperson's [owner / salesperson] (salesperson is the house film as approved; owner adds a Your Fees segment the video runbook does not script yet, built by hand on this run); may the desk's own web address show in the film's address bar [yes / no]; can buyers drive off owing part of the price [yes / no] (no: the narrated film needs a paid-in-full version, a template change agreed with you before the script)

Follow the skill's gated phases in order (0 to 7, and the desk's steps 4.1 to
4.10), never starting a phase before its prerequisites are met. Stop at every
review gate: show me the deliverables in the chat and wait for my go. Hard
gates always wait (the Phase 0 report, the site screenshots, the desk's
verification, the narration script before it is voiced, the voice before it
is cut, the narrated film, the final delivery);
soft gates wait too unless I have said "keep going". If I ask you to jump
ahead, tell me which prerequisite is missing and offer to do it first. Keep
`clients/[client-slug]-STATUS.md` (from the skill's template) up to date and
committed at every gate so I can check progress any time.

The phases: after Phase 0, report the facts you found with sources, what's
missing and the hero concept, then wait for my go. Then build the site and
send me desktop and phone screenshots; write the image brief as a shared doc
for my team to run in ChatGPT and place the images as they come back; load
the real inventory; build the desk step by step in this client's theme
(onboarding, Your Fees and the signers as one unit before Start A Sale) and
verify it. Then make the demo videos with the recordly-demo skill: the short
showcase, then the narrated walkthrough from the house script filled with
this client's details (show me the script before it is voiced, then the
voice before it is cut), and put both MP4s in the chat. Last, bring the
draft PR up to date and deploy the site to Vercel so I can show the owner.
