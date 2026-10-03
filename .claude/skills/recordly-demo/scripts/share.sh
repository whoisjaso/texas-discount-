#!/usr/bin/env bash
# share.sh <master.mp4> [capMB=28] [--out <file>] [--check]   the copy that is sent in chat (render.sh; runbook B10 / N14)
#
# Every file sent in chat is <= 28 MB: the chat's upload limit is 30 MB, and 28 keeps a margin. One recipe for both
# cuts: two-pass libx264 (-preset slow, yuv420p) at the bitrate that fills the cap, AAC 128k, +faststart, same picture
# size and frame count as the master. The master itself is never sent.
#   video kb/s = floor(cap bytes × 8 × 0.94 / duration / 1000) − 128     (0.94: container overhead and rate-control slack)
# Asserts: size <= cap (one retry 8% lower, then exit 1) and frame count = the master's (else exit 1).
# Writes <master dir>/<master name>-chat.mp4 unless --out. A chat copy already made from this master (newer than it,
# within the cap, the master's frame count; render.sh makes one after every render) is judged, not encoded again:
# SHARE OK at once. --check only judges (exit 1 when there is no such copy) and never encodes. A new copy is encoded
# beside the old one and replaces it only once both asserts pass, so a killed encode never leaves a broken chat copy.
# Long (a 3:50 film takes about 8-15 min on 4 shared cores): run it through bg.sh, never in a foreground call.
set -euo pipefail
POS=(); OUT=""; CHECK=0
while [ $# -gt 0 ]; do case "$1" in --out) OUT="$2"; shift 2 ;; --check) CHECK=1; shift ;; *) POS+=("$1"); shift ;; esac; done
IN="$(realpath "${POS[0]:?usage: share.sh <master.mp4> [capMB=28] [--out file] [--check]}")"
CAP_MB="${POS[1]:-28}"
[ -f "$IN" ] || { echo "no file $IN" >&2; exit 2; }
OUT="${OUT:-${IN%.mp4}-chat.mp4}"
case "$OUT" in "$IN") echo "refusing to overwrite the master" >&2; exit 2 ;; esac
CAP=$((CAP_MB * 1024 * 1024))
AUDIO_K=128
frames() { ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of default=nw=1:nk=1 "$1" | head -1; }
mframes="$(frames "$IN")"
mbOf() { awk -v s="$(stat -c %s "$1")" 'BEGIN{printf "%.1f", s / 1048576}'; }

# A chat copy made from this master already: judged, never encoded again.
if [ -f "$OUT" ] && [ "$OUT" -nt "$IN" ] && [ "$(stat -c %s "$OUT")" -le "$CAP" ] && [ "$(frames "$OUT")" = "$mframes" ]; then
  echo "SHARE OK: $OUT  $(mbOf "$OUT") MB (<= ${CAP_MB}), ${mframes} frames = the master (already made from this master; not encoded again)"
  exit 0
fi
if [ "$CHECK" = 1 ]; then
  echo "SHARE FAIL: $OUT is missing, older than the master, over ${CAP_MB} MB or not the master's ${mframes} frames: make it through bg.sh (bash <skill>/scripts/bg.sh start share -- bash <skill>/scripts/share.sh $IN $CAP_MB)" >&2
  exit 1
fi

dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")"
vk="$(awk -v c="$CAP" -v d="$dur" -v a="$AUDIO_K" 'BEGIN{ printf "%d", (c * 8 * 0.94 / d / 1000) - a }')"
[ "$vk" -ge 300 ] || { echo "the film is too long for ${CAP_MB} MB at a watchable rate (${vk} kb/s video): send a link or a shorter cut" >&2; exit 1; }
TMP="$(mktemp -d)"
NEW="$(dirname "$OUT")/.$(basename "${OUT%.mp4}").encoding.mp4"   # beside OUT, so the final move is a rename
trap 'rm -rf "$TMP"; rm -f "$NEW"' EXIT
encode() {
  echo "== two-pass libx264 at ${1} kb/s video + AAC ${AUDIO_K}k (${dur%.*} s, ${mframes} frames, cap ${CAP_MB} MB)"
  nice -n 15 ffmpeg -nostdin -v error -y -i "$IN" -c:v libx264 -preset slow -b:v "${1}k" -pass 1 -passlogfile "$TMP/x264" \
    -pix_fmt yuv420p -an -f null /dev/null
  nice -n 15 ffmpeg -nostdin -v error -y -i "$IN" -c:v libx264 -preset slow -b:v "${1}k" -pass 2 -passlogfile "$TMP/x264" \
    -pix_fmt yuv420p -c:a aac -b:a "${AUDIO_K}k" -movflags +faststart -f mp4 "$NEW"
}
encode "$vk"
size="$(stat -c %s "$NEW")"
if [ "$size" -gt "$CAP" ]; then
  vk=$((vk * 92 / 100)); echo "over the cap ($size bytes): once more at ${vk} kb/s"; encode "$vk"; size="$(stat -c %s "$NEW")"
fi
cframes="$(frames "$NEW")"
mb="$(mbOf "$NEW")"
if [ "$size" -gt "$CAP" ]; then echo "SHARE FAIL: the new copy is $mb MB (> ${CAP_MB} MB); send the master's path instead, never the master" >&2; exit 1; fi
if [ "$cframes" != "$mframes" ]; then echo "SHARE FAIL: $cframes frames, the master has $mframes" >&2; exit 1; fi
mv -f "$NEW" "$OUT"
echo "SHARE OK: $OUT  $mb MB (<= ${CAP_MB}), ${cframes} frames = the master, ${vk} kb/s video + AAC ${AUDIO_K}k, +faststart"
