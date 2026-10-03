# {{CLIENT}}: site demo video

A Recordly / Screen Studio style demo of the public site ({{WWW}}), made with the `recordly-demo` skill
(`.claude/skills/recordly-demo/SKILL.md`): the house cut that was approved for Discount Used Cars, re-captured on this
site. The site sits in a macOS window on a charcoal wallpaper, with auto-zooms, a smoothed macOS cursor, an iPhone cut
and iOS sounds. Recordly's code is AGPL and is not used; only its tuning numbers are.

- **Output:** `out/demo-v1.mp4` (1920×1080, 30 fps, h264 CRF 16 + AAC) and `out/demo-v1-chat.mp4` (≤ 28 MB, for chat; `scripts/share.sh`). With the desk the film is `out/{{SLUG}}-demo.mp4`.
- **Inputs:** `client-inputs.json` → `src/project.ts`, `storyboard.json` and this README (scripts/fill-client.cjs).
  Edit the JSON and refill; do not hand-edit the generated files.
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

## Re-capture, render, verify

The recordly-demo runbook does all of it, step by step, under any agent: `node <skill>/scripts/runbook.cjs next`
(after `bash <skill>/scripts/env.sh --slug {{SLUG}} --scratch <absolute scratch dir>` and `source <scratch>/demo.env`).
The commands it runs, in short:

```bash
source $SCRATCH/demo.env
bash $S/scripts/site-server.sh build-start                                   # :5183 only, own process group
node $S/scripts/measure-site.cjs --storyboard $P/storyboard.json --rects     # must print PREFLIGHT CLEAN
bash $S/scripts/bg.sh start capture -- bash $S/scripts/capture-all.sh $P/storyboard.json 1-hero 2-scroll 3-buy 4-menu 5-phone
node $S/scripts/verify-film.cjs --project $P --cuts-only --out $SCRATCH/cuts && bash $S/scripts/site-server.sh stop
bash $S/scripts/render.sh $P {{SLUG}}-demo --check                             # preflight + typecheck
bash $S/scripts/bg.sh start render -- bash $S/scripts/render.sh $P {{SLUG}}-demo   # master + the <= 28 MB chat copy
bash $S/scripts/bg.sh start verify -- bash $S/scripts/verify.sh $P out/{{SLUG}}-demo.mp4 $SCRATCH/verify
```

Re-capturing shot N means re-capturing every later shot too, in order (each starts from the previous capture's
cursor); `capture-all.sh … --from <id>` refuses otherwise. Never run `playwright install`; never use another port.
Every by-eye look, approval and allowance is recorded in `verify-decisions.md` (`runbook.cjs mark`).

## Part B (the sale desk)

It goes in at `demoTimeline.cutPoint` (`partBSegments` in `src/demo/timeline.ts`) once captured (the skill's runbook
B0-B7, references/desk-capture.md). The URL pill keeps `{{DOMAIN}}` until the owner confirms the desk host may be shown.

## Decisions to confirm with the owner

- **Site copy in the zooms** (class (b), house-recipe §14). The film's own overlays show only the facts above, but each
  zoom magnifies the site's own copy. Measured by `measure-site.cjs --storyboard … --into client-inputs.json`; follow
  zooms are approximate. If any of it counts as a claim, re-aim the zoom.
{{ZOOM_COPY}}
- **Video-only CSS** (`captureCss` in storyboard.json): the "Open Now" dot is drawn in the text colour, Chromium's blue
  search-clear × is hidden, the hours line is centre-aligned. The same three rules would fix the live site.
- **Hidden content.** Shot 2 hides the lineup's finance fine print; shots 2 and 5 hide any lineup price chips and
  "From $" lines (`visibility: hidden`, layout unchanged). Nothing is blurred.
- **Featured content:** the {{BODY}} card, the query "{{FINDER_QUERY}}", the service tile "{{SERVICE_TILE}}".
- **Outro logo:** {{LOGO_WIDTH}} px wide (`theme.outro.logoWidth` = min(760, round(300 × the logo's width / height))).
- **Timing overrides** (`client-inputs.json` → `overrides`; each re-verified):
{{OVERRIDES}}
- **Desk host:** not shown in the URL pill until confirmed (`partBDomain`).
- **Sounds:** the house kit's iOS sounds are cleared for showing this demo to the dealer only. Before the film runs as a
  paid ad, the sounds need replacing (`assets/sfx/SOURCES.md` in the skill); that is the user's call.

## Files

```
client-inputs.json        the one file edited per client (facts, logos, loader, storyboard values, overrides)
storyboard.json           the capture storyboard (filled from the skill's house template)
src/Demo.tsx              the film (layers, intro match cut, phone, outro, SFX cues)
src/demo/timeline.ts      running order: segments, cut point, part B
src/project.ts            domain, logos, loader geometry, outro facts, part-B domain (generated)
src/theme.ts              colours, motion, Recordly tuning, sound map (all timings in seconds)
src/scenes/DesktopScene   one macOS window, several captures, hard cuts, camera, cursor
src/scenes/PhoneScene     iPhone cut (status-bar tint, home indicator, swipes, drop exit)
src/components/           MatchSting, LogoSting, Wallpaper/Backdrop, MacWindow, IPhone, Camera, Cursor,
                          TapRipple, Sfx, Overlays, Title
scripts/stills.cjs        bundle once, render many stills (preview frames before the full render)
public/shots/<id>/        captures (regenerated, git-ignored)
public/sfx/               the skill's bundled kit (assets/sfx, see SOURCES.md)
public/fonts/             Barlow Semi Condensed (OFL)
out/                      renders (git-ignored)
```

Commit `client-inputs.json`, `storyboard.json`, `src/`, `public/sfx`, `public/fonts`, `public/brand` and this README.
Never commit `public/shots/` or `out/` (about 40 MB per film).
