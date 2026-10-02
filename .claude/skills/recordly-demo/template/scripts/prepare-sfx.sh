#!/usr/bin/env bash
# Copies the jason-video-editor sound kit into public/sfx/ and cuts the derived clips the theme uses:
#   key_1..7.wav   single keystrokes sliced from ui/macbook_keyboard.wav (onsets measured from its envelope)
#   whoosh_short.wav  the first 0.45 s of whoosh.wav with a 120 ms fade-out (peak at 0.3 s)
#   whoosh_short_lo/_hi.wav  the same, pitched 1.5 semitones down / up, so repeated zooms do not repeat one sample
#   open_ui.wav    cut to 0.6 s with a 50 ms fade: the kit's file ends (0.97 s) in a lone tick after 8 frames of
#                  digital silence, which plays as a click with no click on screen
# Usage: scripts/prepare-sfx.sh [KIT_DIR]   (run from the project root)
set -euo pipefail
KIT="${1:-/home/user/whoisjaso/VideoEdit/.claude/skills/jason-video-editor/assets/sfx}"
OUT="public/sfx"
mkdir -p "$OUT"
for f in ios/ios_tink.wav ios/ios_note.wav ios/ios_received.wav ios/ios_success.wav ios/ios_key.wav \
         ui/macbook_keyboard.wav ui/open_ui.wav ui/success_ui.wav whoosh.wav swoosh.wav click.wav; do
  cp "$KIT/$f" "$OUT/$(basename "$f")"
done
# Single key hits: start 12 ms before each measured peak, 95 ms long, 15 ms fade-out.
i=1
for start in 0.108 0.668 0.888 1.388 1.538 1.688 2.478; do
  ffmpeg -v error -y -ss "$start" -t 0.095 -i "$OUT/macbook_keyboard.wav" -af "afade=t=out:st=0.08:d=0.015" "$OUT/key_$i.wav"
  i=$((i + 1))
done
ffmpeg -v error -y -t 0.45 -i "$OUT/whoosh.wav" -af "afade=t=out:st=0.33:d=0.12" "$OUT/whoosh_short.wav"
ffmpeg -v error -y -i "$OUT/whoosh_short.wav" -af "asetrate=44100*0.917,aresample=44100" "$OUT/whoosh_short_lo.wav"
ffmpeg -v error -y -i "$OUT/whoosh_short.wav" -af "asetrate=44100*1.0905,aresample=44100" "$OUT/whoosh_short_hi.wav"
ffmpeg -v error -y -i "$KIT/ui/open_ui.wav" -af "atrim=0:0.6,afade=t=out:st=0.55:d=0.05" "$OUT/open_ui.wav"
echo "sfx ready in $OUT:"; ls "$OUT"
