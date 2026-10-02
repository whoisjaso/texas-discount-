# Sound kit: the 15 files the film plays

These files are byte-identical to the `public/sfx/` files the approved Discount film (`demo-v1.mp4`) played. They are
exactly the set `theme.sfx` names, nothing more. `scripts/new-project.sh` copies them into `public/sfx/`, so a new
project needs neither the external kit nor `prepare-sfx.sh`.

All files are 44.1 kHz s16 WAV. Levels are set in `theme.sfx` (in dB, before `masterDb` +10).

| File | theme.sfx key | Origin (jason-video-editor kit) | Processing | md5 |
|---|---|---|---|---|
| `ios_tink.wav` | `click` (−12 dB), `tap` (−16 dB) | `ios/ios_tink.wav` | none | f25f7b19043cc2b380af6f06cdab1084 |
| `ios_note.wav` | `intro` (−8 dB) | `ios/ios_note.wav` | none | 869cc777e34fc1290ef6040283e80e43 |
| `ios_received.wav` | `outro` (−4 dB) | `ios/ios_received.wav` | none | 43004d66012e0e99df6b95292c3cdff7 |
| `ios_success.wav` | `success` (−10 dB) | `ios/ios_success.wav` | none. Not played in part A; reserved for an app segment's "N / N signed" moment | 01b3eba8b01633ddb29f57ef27a18ab4 |
| `open_ui.wav` | `open` (−14 dB; phone −16) | `ui/open_ui.wav` | `atrim=0:0.6,afade=t=out:st=0.55:d=0.05`. The kit file ends in a lone tick at 0.97 s, after 8 frames of silence, which plays as a click with nothing on screen | 755e07de6a00f15109fe510e990f511c |
| `key_1.wav` … `key_7.wav` | `type` (−18 dB ±1.5) | `ui/macbook_keyboard.wav` | 95 ms slices starting 0.108 / 0.668 / 0.888 / 1.388 / 1.538 / 1.688 / 2.478 s (12 ms before each measured peak), `afade=t=out:st=0.08:d=0.015` | 5e38b924… 0071688a… cd77743e… 4ebae022… b174570a… f0db43e9… 7e8edb5e… |
| `whoosh_short.wav` | `zoomIn` (−20 dB) | `whoosh.wav` | first 0.45 s, `afade=t=out:st=0.33:d=0.12`; its peak is 0.3 s in | 0bdd0a006ce131cee827f66889267aa3 |
| `whoosh_short_lo.wav` | `zoomIn` | from `whoosh_short.wav` | `asetrate=44100*0.917,aresample=44100` (−1.5 semitones) | 26221b2688bbb30bf5dfcc2cdf72535b |
| `whoosh_short_hi.wav` | `zoomIn` | from `whoosh_short.wav` | `asetrate=44100*1.0905,aresample=44100` (+1.5 semitones) | 4c295c35ced5c23f1ce0b7f238410697 |

The kit lives in another repo: `/home/user/whoisjaso/VideoEdit/.claude/skills/jason-video-editor/assets/sfx`.
`template/scripts/prepare-sfx.sh [KIT_DIR]` re-derives the same cuts from it, plus some unused extras. You only need it
to swap a sound.

## Licences: read before a paid ad

- `ios_*` are Apple system sounds (via github.com/extratone/iOSSystemSounds). They are fine in a demo the agency shows
  to a dealer. Swap them for non-Apple sounds before the film runs as a paid ad.
- The `ui/*` sources (`open_ui`, `macbook_keyboard`) were cut from a creator's SFX-pack reel. Their licence is
  unverified, so treat them like the Apple sounds.
- The origin of `whoosh.wav` is unrecorded.

If you swap a file, keep its name and its timing role (whoosh peak 0.3 s in; keys under 100 ms with a hard attack).
Then run the onset map in `references/verification.md` again.
