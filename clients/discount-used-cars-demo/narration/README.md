# The narrated long cut

A guided tour of the site and one whole sale on the desk, laid against the approved voice-over (`script-v1.md`,
24 lines, Kokoro-82M `af_heart` at speed 0.95). Composition **`Narrated`** (`src/narrated/`); the approved `Demo` film
is untouched. Recipe: `.claude/skills/recordly-demo/references/narration.md`.

- **Master:** `out/discount-demo-narrated.mp4`: 1920×1080, 30 fps, 6901 frames (3:50.0), h264 CRF 17 + AAC 192k,
  +faststart, SIZE_MASTER.
- **Share copy:** `out/discount-demo-narrated-share.mp4`: same picture size and sound, +faststart, SIZE_SHARE (under
  40 MB).
- **Levels:** LEVELS_LINE The film's own sounds play 6 dB lower while a line speaks. No music.

## Running order

| Scene | Film | Lines | Picture |
|---|---|---|---|
| 1 · The site | 0–27.5 s | 01-03 | Part A as approved: the match cut, the hero, the lineup, the visit card, the finder, We Buy Cars |
| 2 · Sign in once | 27.5–44.4 s | 04-06 | The Admin row, Team Access, the name, the signature drawn and held |
| 3 · The car | 44.4–78.7 s | 07-09 | Start A Sale: the Camry, the odometer corrected, Español then English, Clean title |
| 4 · The buyer | 78.7–107.5 s | 10-13 | The licence scan, the address and its autofill, the county, the read-back and Hold To Confirm |
| 5 · The money | 107.5–147.4 s | 14-16 | Cash, the price (No: tax and fees on top), the receipt and the balance owed; the bill of sale and the 130-U naming the dealership as lienholder |
| 6 · The plan | 147.4–169.3 s | 17-18 | Who files (We Do), plate, signer, the inspection's three answers, insurance |
| 7 · The payoff | 169.3–198.6 s | 19-21 | The 130-U: box 19's county, the seller line with Maria Lopez's printed name and signature, the caption |
| 8 · Signed and stored | 198.6–219.2 s | 22-23 | The packet's code, the buyer signing on the phone, 2 / 2 signed, Past Sales → Carter → the signed PDF |
| 9 · Close | 218.7–230.0 s | 24 | The outro (facts only), fade to black |

## Timing: every line and what is on screen

The gap is the silence before a line. Each line is placed by its key word (`LINES` in `src/narrated/plan.ts`): the
plan puts the line where that word lands on its capture frame or document key. `node scripts/narrated-check.cjs`
prints this table from the code.

| Line | Film (s) | Gap before (s) | Key word @ film s | On screen |
|---|---|---|---|---|
| 01-site-a | 2.60–10.17 | – | Freeway @ 5.88 | The DISCOUNT mark match-cuts onto the site's loader; the hero, 1.5x on the headline "… At 8108 Gulf Freeway" as "Gulf Freeway" is said; the scroll to the lineup starts on "showroom" |
| 02-site-b | 10.70–21.63 | 0.53 | truck @ 11.01 | The lineup (Trucks, Coupes …) lands on "truck"; 2.0x on the Trucks card to "one tap away" (the header's phone icon in frame); the visit card (Open Now, the hours, Get Directions) on "Fewer tire-kickers calling"; the finder: Search clicked and "F-150" typed on "more buyers walking in knowing what they want" |
| 03-site-c | 22.30–27.77 | 0.67 | trade @ 24.84 | "We Buy Cars, Too.": 2.0x on the We Buy Trucks tile on "trade-in" |
| 04-signin-a | 28.57–32.43 | 0.80 | desk @ 31.79 | Menu, the drawer; 1.8x on "Admin · Staff Sign-In To The Sale Desk" on "sale desk" |
| 05-signin-b | 33.60–39.67 | 1.17 | type @ 36.08 | Team Access: email (privacy-blurred), password, Sign In 0.2 s after "signs in"; "What Is Your Name?": Maria Lopez typed from 0.5 s after "type"; Draw Your Signature opens 1.2 s after "draw", the pen starts on "Once." |
| 06-signin-c | 40.60–43.73 | 0.93 | signature @ 41.25 | The pen at 1.8x on the pad: the last stroke lands on "signature" and is held; Save Signature, "You Are All Set" |
| 07-car-a | 45.43–51.23 | 1.70 | Pick @ 45.49 | Start A Sale: the lot at 2.0x (both columns); the pointer goes to the 2019 Toyota Camry SE on "Pick"; the Camry is clicked on "Nobody types them" |
| 08-car-b | 52.60–61.90 | 1.37 | correct @ 57.09 | "Which Car Is It?": the odometer (89432 from inventory) at 2.0x on "brings in the number"; clicked 0.2 s after "correct"; 89517 typed on "what the dash says today" |
| 09-car-c | 62.53–76.00 | 0.63 | Spanish @ 66.36 | The language select opens 0.3 s after "Spanish" and Español is chosen; on "English-speaking buyer" the menu opens again; English chosen 0.4 s after "English"; Next on "keep moving" (then Clean title, Next) |
| 10-buyer-a | 78.77–86.50 | 2.77 | Scan @ 78.83 | "What ID Did The Buyer Bring?": Scan ID 0.5 s after "Scan"; the camera sheet shoots the DEMO card; on "the name and number fill in" the form shows Driver Licence, TX - Texas, 41927365 beside the card's pictures; 1.6x on pictures and fields on "check them against the card" |
| 11-buyer-b | 87.47–91.80 | 0.97 | street @ 87.86 | "Where Do We Mail The Title?" at 1.5x: "10418 Almeda Genoa Rd" typed on "Type the street"; "Filled in from …" with Houston, 77034, Harris on "city, the ZIP, and the county" |
| 12-buyer-c | 92.83–95.37 | 1.03 | county @ 93.42 | 2.2x on County (Harris) and Start Sale on "county" |
| 13-buyer-d | 96.97–112.23 | 1.60 | hold @ 103.87 | Start Sale; the read-back card ("Is This The Mailing Address? 10418 Almeda Genoa Rd, Houston, TX 77034, Harris County") at 2.0x on "read the mailing address back"; Hold To Confirm pressed 0.17 s after "hold", fills to 100%, released |
| 14-money-a | 112.97–119.07 | 0.73 | advertise @ 113.72 | "How Are They Paying?": Cash (just before the line); "How Much Are They Paying?" at 1.8x under "advertise out the door … price plus tax and fees" |
| 15-money-b | 120.03–135.27 | 0.97 | inside @ 123.74 | 9500 typed on "the number you shook hands on"; Next; the tax-and-fees question: No, tapped 0.23 s after "inside"; the receipt rows at 2.0x (car, sales tax, title fee, doc fee blurred, reg fee) on "the math"; the pan to Total $10,201.75 and Balance owed; "They are paying some other amount today", 6000 typed: Balance owed $4,201.75 on "exactly what's still owed" |
| 16-money-c | 135.93–146.93 | 0.67 | owing @ 136.59 | The bill of sale (page 2 of the deal's own PDF) opens: push onto "3. Total Amount Due $10,201.75 / Balance secured by seller lien $4,201.75" on "owing"; the Seller Lien / Balance Owed section on "bill of sale"; the 130-U opens over it on "title application": boxes 33-34, the dealership as first lienholder, on "lienholder" |
| 17-plan-a | 148.70–157.47 | 1.77 | tap @ 150.42 | "Who Files The Title And Registration?" at 1.45x: the pointer on We Do ("We file it through webDEALER") on "One tap", on The Customer Does on "the responsibility form when they do"; We Do tapped as the line ends |
| 18-plan-b | 159.90–168.37 | 2.43 | yours @ 165.00 | (No plate yet and The Buyer, Here Today tapped in the gap) "Where Does The Inspection Stand?"; the pointer on Already Passed on "done", We Are Doing It on "yours", The Customer Will on "theirs"; Already Passed tapped as the line ends (then Yes, Shown Today) |
| 19-payoff-a | 169.63–175.77 | 1.27 | county @ 171.84 | The 130-U (page 1 of the deal's own PDF) opens; push onto boxes 18-19, the county "Harris" spotlit, on "county" |
| 20-payoff-b | 176.40–191.97 | 0.63 | seller @ 176.67 | Push onto the CERTIFICATION block on "seller line"; onto the printed "Discount Used Cars And Trucks, LLC (Maria Lopez)" on "prints"; onto her drawn signature on "with the signature" |
| 21-payoff-c | 192.57–196.63 | 0.60 | signed @ 193.67 | Back to the whole block, signed and named, on "signed"; caption "Signed Once. On Every Title Application." |
| 22-stored-a | 199.50–203.20 | 2.87 | code @ 200.40 | The packet: 2.82x on Scan To Sign (the code, Open here) on "code"; the phone slides in on "signs every page": Begin, the bill of sale read and signed |
| 23-stored-b | 205.60–217.10 | 2.40 | search @ 213.83 | The phone: the 130-U signed, Sign And Finish, All Signed. on "every signed document"; the desk: Ready To Print 2 / 2 signed at 1.62x on "stays with the sale"; Finish; Past Sales; "Carter" typed on "search their name"; the sale opened on "pull up the paperwork"; Open / Print |
| 24-close | 218.70–226.13 | 1.60 | discount @ 223.81 | The signed bill of sale (page 4: buyer's and seller's signatures) dissolves into the outro: the logo, www.discountusedcarsandtrucks.com, (713) 900-5050 · 8108 Gulf Fwy, Houston, Tue – Sat 10 AM – 7 PM |

Gaps over 1 s sit on a picture beat of its own, a tap or a page landing in silence: 05 (the sign-in card), 07 (Start
Working, Start A Sale), 08 (the Camry's step), 10 (Next, Clean title, Next), 12 (the push onto the county), 13 (a
pause after "We'll come back to it"), 17 (the documents closing), 18 (No plate yet, The Buyer Here Today), 19 (Yes,
Shown Today, the 130-U opening), 22 (the caption, the packet), 23 (the phone signing), 24 (the signed PDF). Lines
never overlap and no word is cut.

## Lip to picture: the key nouns

Word times are faster-whisper's (`words.json`) as the plan places them; action times are the captures' events. The
rule is the word first, then the action within about 0.3 s; the exceptions are marked.

| Line | Word said | Film s | On screen / the action | Action at (after the word) |
|---|---|---|---|---|
| 01 | Gulf Freeway | 5.70 | The hero headline at 1.5x ("… At 8108 Gulf Freeway") | in frame |
| 02 | truck | 11.01 | The lineup lands (Trucks, Coupes) | 11.0 (0.0) |
| 02 | searchable | 12.55 | The Trucks card at 2.0x | **late by design:** the search comes on "more buyers … knowing what they want" (Search 18.83, "F-150" 19.13) |
| 02 | number … one tap away | 14.71 | The Trucks card; the header's phone icon in frame | – |
| 03 | trade-in | 24.84 | We Buy Trucks at 2.0x | in frame |
| 04 | sale desk | 31.51 | "Admin · Staff Sign-In To The Sale Desk" at 1.8x | in frame |
| 05 | signs in | 34.86 | Team Access | Sign In 35.46 (+0.18 after "in") |
| 05 | type … legal name | 36.08 | "What Is Your Name?" | typing 36.57 (+0.49) |
| 05 | draw … signature | 37.40 | The name page | **late:** Draw Your Signature 38.57 (+1.17), the pen 39.07 on "Once." |
| 06 | signature | 41.25 | The pen's last stroke at 1.8x | stroke ends 41.27 (+0.02) |
| 07 | Pick | 45.49 | The lot at 2.0x; the pointer leaves for the Camry | 45.5 (0.0); the Camry clicked 50.64 on "Nobody types them" (50.24) |
| 08 | number from inventory | 55.05 | Odometer 89432 at 2.0x | in frame |
| 08 | correct | 57.09 | The odometer field | click 57.30 (+0.21), "517" typed 57.97 |
| 09 | Spanish (mark the sale Spanish) | 66.36 | The language select | menu opens 66.67 (+0.31), Español 67.44 |
| 09 | English-speaking buyer | 72.34 | The language select | menu opens 73.07 (+0.05 after "buyer") |
| 09 | English (leave it in English) | 74.44 | The menu | English chosen 74.87 (+0.43) |
| 09 | keep moving | 75.12 | English set | Next 76.14 (+1.0) |
| 10 | Scan | 78.83 | "What ID Did The Buyer Bring?" | Scan ID 79.30 (+0.47), shutter 80.20 |
| 10 | name and number fill in | 80.63 | The camera sheet | the filled form 81.73 (+0.08 after "in") |
| 10 | check … card | 82.61 | The card's pictures beside the fields | 1.6x lands 83.4 |
| 11 | street | 87.86 | The street field at 1.5x | typing 87.74 (−0.12) |
| 11 | city, ZIP, county | 89.52 | "Filled in from …" | Houston, 77034, Harris fill 89.70 (+0.18) |
| 12 | county | 93.42 | County: Harris at 2.2x | in frame |
| 13 | read … mailing address back | 101.71 | The read-back card at 2.0x | the card 100.97 (−0.7: up as the sentence turns to it) |
| 13 | hold | 103.87 | Hold To Confirm | press 104.04 (+0.17) |
| 14 | advertise | 113.72 | "How Much Are They Paying?" at 1.8x | in frame |
| 15 | number you shook hands on | 120.44 | The price field | "9500" typed 120.40 (−0.04) |
| 15 | inside | 123.74 | The tax-and-fees question | No 123.97 (+0.23) |
| 15 | math | 128.48 | The receipt rows at 2.0x | in frame |
| 15 | still owed | 130.64 | Balance owed $4,201.75 | "6000" typed 129.9; the balance on screen |
| 16 | owing | 136.59 | Bill of sale page 2: the total and "Balance secured by seller lien" | push from 136.24, landing with the word |
| 16 | bill of sale | 137.95 | The Seller Lien / Balance Owed section | push 137.75 (−0.2) |
| 16 | title application | 139.11 | The 130-U opens over it | 138.76 (−0.35) |
| 16 | lienholder | 141.55 | 130-U boxes 33-34: Discount Used Cars And Trucks, LLC as lienholder | push 139.73 (on "name your dealership") |
| 17 | tap | 150.42 | The pointer on We Do | **late by design:** We Do tapped 156.90, after The Customer Does is shown |
| 18 | Inspection | 159.96 | "Where Does The Inspection Stand?" | the page 159.37 (−0.59) |
| 18 | done / yours / theirs | 164.48 / 165.00 / 165.58 | Already Passed / We Are Doing It / The Customer Will | the pointer on each at 164.27 / 165.00 / 165.57 |
| 19 | county | 171.84 | 130-U box 19: Harris | push from 171.39, landing with the word |
| 20 | seller line | 176.67 | The certification block | push 176.32 |
| 20 | prints | 181.65 | "Discount Used Cars And Trucks, LLC (Maria Lopez)" | push 181.55 |
| 20 | signature | 188.15 | Maria Lopez's drawn signature | push 187.26 (on "with") |
| 21 | signed and named | 193.67 | The block, signed and named | push 192.67; caption 193.47 |
| 22 | code | 200.40 | Scan To Sign at 2.82x | in frame |
| 22 | phone | 202.62 | The buyer's phone: Begin, the bill of sale | the phone in 200.67 |
| 23 | signed document | 206.11 | All Signed. on the phone | 205.63 |
| 23 | stays with the sale | 206.91 | Ready To Print · 2 / 2 signed at 1.62x | 207.07 (+0.16) |
| 23 | search | 213.83 | Past Sales: "Carter" typed | typing 213.76 (−0.07) |
| 23 | paperwork | 215.73 | The sale opened from Past Sales | row click 215.60 (−0.13); Open / Print 217.16, the PDF 217.3 |
| 24 | Discount Used Cars and Trucks | 223.81 | The outro: logo, URL, phone, address, hours | outro from 218.7 |

## Shown another way than the line says

- **10 · the licence scan.** The desk's real scanner decodes a card printed "DEMO CARD" for James Carter, through a
  test camera feed (`getUserMedia` returns a canvas stream of the card's front, then back) with a PDF417 AAMVA barcode
  generated for the demo. No real licence is used. The shutter is clicked (the scanner's quality gate never passes on
  a synthetic frame).
- **10 · "You check them against the card".** Shown on the scan step, where the desk puts the card's pictures beside
  the filled fields ("Read the name and ID number off the card. Check it against the ID."). The guide's separate
  "Check What The Card Says" review was confirmed off camera (the preview mock keeps no uploaded images, so its
  pictures would be broken) and is cut: the read-back jump-cuts to "How Are They Paying?". The name and phone steps
  are also cut (filled before the capture).
- **9 · the language menu.** Headless Chromium paints no native select popup, so a stand-in menu is drawn where the
  OS menu opens; the value is set on the desk's real select.
- **15 · "doc fee math".** The owner has not set a doc fee, so the desk shows "[Not set: doc fee]"; it is blurred on
  the receipt, and the bill of sale prints Documentary Fee $0.00. The total on screen is price + tax + title +
  registration.
- **17 · "One tap".** The pointer rests on We Do on "One tap" and on The Customer Does on "the responsibility form
  when they do"; We Do is tapped as the line ends.
- **22 · "scans a code".** The code is shown; the phone's signing session was opened from the same link. The 130-U is
  signed in a second phone session (the first signed the bill of sale) with the same hand drawn slightly changed (the
  desk refuses a pixel-identical stroke). That drawing is cut: the phone shows the 130-U signed, Sign And Finish, All
  Signed.
- **23 · "If a customer files a complaint …".** Not shown (a hypothetical); the search and the signed PDF are.

## Facts, data, privacy

- On screen: www.discountusedcarsandtrucks.com, desk.discountusedcarsandtrucks.com (the URL pill), (713) 900-5050,
  8108 Gulf Fwy, Houston, Tue – Sat 10 AM – 7 PM, GDN P145000 and Discount Used Cars And Trucks, LLC (the documents),
  plus demo deal data: staff Maria Lopez, buyer James Carter (licence 41927365 on the DEMO card; phone
  (713) 555-0142, a fictional 555 number, on the 130-U), the mock lot's 2019 Toyota Camry SE, and the address
  10418 Almeda Genoa Rd, Houston 77034 (a street the Census geocoder knows; no home listing found at that number).
  Past Sales also lists the mock's seeded Aaliyah Stone sale; seeded "Example" rows are hidden by capture CSS.
- Blurred: the sign-in email and the sidebar's identity handle; on documents the VIN (130-U box 1, bill of sale page
  4) and the licence number (130-U box 14); the unset doc fee.
- Money is shown on the bill of sale and the 130-U: lines 14-16 are about it (demo deal data).
- The documents are the deal's own PDFs at 300 dpi: `public/docs/narr-bos-p2.png` (bill of sale page 2),
  `narr-130u-p1.png` (130-U page 1, the seller line signed by Maria Lopez), `narr-bos-p4-signed.png` (bill of sale
  page 4 after the buyer signed). They print 10/02/2026, the film's clock, and the Preview windows' titles use that date too
  (`…_20261002.pdf`; the desk named the files by its server's UTC date, `…_20261003.pdf`).

## Voice: the transcribe-back check

faster-whisper hears every line as written except: 02 "walking **and** knowing" (written "in"), 09 "the **sales**
Spanish" (written "sale"), 17 "130U" (spoken "one-thirty-U", as intended) and 20 "The seller line" (written "And the
seller line": the opening "And" is not heard). The takes are the approved ones and were not re-voiced; listen to 02,
09 and 20 before sending.

## Re-make

```bash
cd clients/discount-used-cars-demo
# the voice (only if a line changes): Kokoro + faster-whisper in a venv (references/narration.md §2-3), then
python3 scripts/prepare-vo.py          # public/vo/*.wav + src/narrated/vo-lines.ts
# captures (only if the desk changes): the order and the off-camera steps are in narration/storyboard-long.json's
# notes; the desk on :5190 only, with NODE_USE_ENV_PROXY=1 for the address lookup; kill it by PID
node scripts/narrated-check.cjs        # PLAN OK: gaps, overlaps, every cut's pointer and camera
node scripts/narrated-frames.cjs       # the frames to look at; render them with scripts/stills.cjs <dir> Narrated:<frames>
nice -n 15 npx remotion render src/index.ts Narrated out/discount-demo-narrated-raw.mp4 --codec h264 --crf 17 \
  --audio-codec aac --audio-bitrate 192k --concurrency 3 --offthreadvideo-cache-size-in-bytes 1500000000 \
  --browser-executable=<chromium_headless_shell>/headless_shell
ffmpeg -i out/discount-demo-narrated-raw.mp4 -c copy -movflags +faststart out/discount-demo-narrated.mp4
SHARE_CMD
node scripts/narrated-verify.cjs --mp4 out/discount-demo-narrated.mp4 --out out/verify-narrated
```

The render took about 80 minutes at concurrency 3 on a 4-core box shared with other work.

## Verification

VERIFY_BLOCK
