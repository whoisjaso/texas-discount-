# {{CLIENT}}: site demo video

A Recordly / Screen Studio style demo of the public site ({{WWW}}), made with the `recordly-demo` skill
(`.claude/skills/recordly-demo/SKILL.md`): the house cut that was approved for Discount Used Cars, re-captured on this
site. The site sits in a macOS window on a charcoal wallpaper, with auto-zooms, a smoothed macOS cursor, an iPhone cut
and iOS sounds. Recordly's code is AGPL and is not used; only its tuning numbers are.

- **Output:** `out/demo-v1.mp4` (1920×1080, 30 fps, h264 CRF 16 + AAC) and `out/demo-v1-share.mp4` (≤ 24 MB, for chat).
- **Inputs:** `client-inputs.json` → `src/project.ts` and `storyboard.json` (scripts/fill-client.cjs).
- **On-screen facts:** {{FACTS_LINE}}. No prices, no claims.

## Running order (the house cut)

| Film | What | Source |
|---|---|---|
| 0–1.9 s | The loader's mark wipes in and the word staggers in. From 1.4 s the sting shrinks onto the site's own loader as the window springs in (a match cut), then dissolves into it | `MatchSting` + `project.loader` |
| 1.4–7.9 s | The loader's curtain lifts on the hero. The cursor comes in; 1.5x zoom on the headline | `1-hero` (plays the loader: `{{INTRO_KEY}}` not preset) |
| 7.9–24.9 s | Lineup band, 2.0x on the {{BODY}} card, the visit card at 1.8x ("Open Now"), the finder: click, type "{{FINDER_QUERY}}" | `2-scroll` |
| 24.9–30.6 s | The service band, 2.0x on "{{SERVICE_TILE}}" | `3-buy` |
| 30.6–36.6 s | Menu → drawer → held 1.8x on "Admin · Staff Sign-In To The Sale Desk". **Cut point for part B** | `4-menu` |
| 36.6–45.6 s | An iPhone slides in while the desktop recedes; three iOS swipes; it drops out of frame | `5-phone` |
| 45.4–49.2 s | Outro: logo, URL, phone and address, hours; slow push; fade to black | `LogoSting` |

Seconds hold while part B is empty; part B moves everything after the cut point back by its length.

## Re-capture

Run from the repo root with `SCRATCH` set. Never run `playwright install`; never use another workflow's ports.

```bash
cd {{SITE_DIR}}
VITE_DESK_URL={{DESK_URL}} npx vite build --outDir $SCRATCH/dist-demo --emptyOutDir
./node_modules/.bin/vite preview --outDir $SCRATCH/dist-demo --port 5183 --strictPort &  echo $! > $SCRATCH/preview.pid
cd -
node .claude/skills/recordly-demo/scripts/measure-site.cjs --storyboard clients/{{SLUG}}-demo/storyboard.json
for id in 1-hero 2-scroll 3-buy 4-menu 5-phone; do
  node .claude/skills/recordly-demo/scripts/capture.cjs --storyboard clients/{{SLUG}}-demo/storyboard.json \
    --shot $id --out $SCRATCH/captures/$id --publish clients/{{SLUG}}-demo/public/shots --clean
done
kill $(cat $SCRATCH/preview.pid)
```

## Render and verify

```bash
.claude/skills/recordly-demo/scripts/render.sh clients/{{SLUG}}-demo demo-v1
.claude/skills/recordly-demo/scripts/verify.sh clients/{{SLUG}}-demo out/demo-v1.mp4 $SCRATCH/verify-v1
```

## Part B (the sale desk)

Empty. It goes in at `demoTimeline.cutPoint` (`partBSegments` in `src/demo/timeline.ts`); see the skill's SKILL.md,
"Part B slot". The URL pill keeps `{{DOMAIN}}` until the owner confirms the desk host may be shown.

## Decisions to confirm with the owner

- **Site copy in the zooms.** The hero lede, the visit-card text, the finder lede and the drawer notes are the site's
  own copy. The film's overlays show only the facts above. If any of that copy counts as a claim, re-aim the zoom.
- **Video-only CSS** (`captureCss` in storyboard.json): the "Open Now" dot is drawn in the text colour, Chromium's blue
  search-clear × is hidden, the hours line is centre-aligned. The same three rules would fix the live site.
- **Fine print.** Shot 2 hides the lineup's finance fine print.
