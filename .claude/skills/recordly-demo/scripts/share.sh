#!/usr/bin/env bash
# share.sh <master.mp4> [capMB=28] [--out <file>]      the copy that is sent in chat (runbook B10 / N14)
#
# Every file sent in chat is <= 28 MB: the chat's upload limit is 30 MB, and 28 keeps a margin. One recipe for both
# cuts: two-pass libx264 (-preset slow, yuv420p) at the bitrate that fills the cap, AAC 128k, +faststart, same picture
# size and frame count as the master. The master itself is never sent.
#   video kb/s = floor(cap bytes × 8 × 0.94 / duration / 1000) − 128     (0.94: container overhead and rate-control slack)
# Asserts: size <= cap (one retry 8% lower, then exit 1) and frame count = the master's (else exit 1).
# Writes <master dir>/<master name>-chat.mp4 unless --out. Long (a 3:50 film is ~15 min): run it through bg.sh.
set -euo pipefail
POS=(); OUT=""
while [ $# -gt 0 ]; do case "$1" in --out) OUT="$2"; shift 2 ;; *) POS+=("$1"); shift ;; esac; done
IN="$(realpath "${POS[0]:?usage: share.sh <master.mp4> [capMB=28] [--out file]}")"
CAP_MB="${POS[1]:-28}"
[ -f "$IN" ] || { echo "no file $IN" >&2; exit 2; }
OUT="${OUT:-${IN%.mp4}-chat.mp4}"
case "$OUT" in "$IN") echo "refusing to overwrite the master" >&2; exit 2 ;; esac
CAP=$((CAP_MB * 1024 * 1024))
AUDIO_K=128
dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")"
frames() { ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of default=nw=1:nk=1 "$1" | head -1; }
mframes="$(frames "$IN")"
vk="$(awk -v c="$CAP" -v d="$dur" -v a="$AUDIO_K" 'BEGIN{ printf "%d", (c * 8 * 0.94 / d / 1000) - a }')"
[ "$vk" -ge 300 ] || { echo "the film is too long for ${CAP_MB} MB at a watchable rate (${vk} kb/s video): send a link or a shorter cut" >&2; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
encode() {
  echo "== two-pass libx264 at ${1} kb/s video + AAC ${AUDIO_K}k (${dur%.*} s, ${mframes} frames, cap ${CAP_MB} MB)"
  nice -n 15 ffmpeg -nostdin -v error -y -i "$IN" -c:v libx264 -preset slow -b:v "${1}k" -pass 1 -passlogfile "$TMP/x264" \
    -pix_fmt yuv420p -an -f null /dev/null
  nice -n 15 ffmpeg -nostdin -v error -y -i "$IN" -c:v libx264 -preset slow -b:v "${1}k" -pass 2 -passlogfile "$TMP/x264" \
    -pix_fmt yuv420p -c:a aac -b:a "${AUDIO_K}k" -movflags +faststart "$OUT"
}
encode "$vk"
size="$(stat -c %s "$OUT")"
if [ "$size" -gt "$CAP" ]; then
  vk=$((vk * 92 / 100)); echo "over the cap ($size bytes): once more at ${vk} kb/s"; encode "$vk"; size="$(stat -c %s "$OUT")"
fi
cframes="$(frames "$OUT")"
mb="$(awk -v s="$size" 'BEGIN{printf "%.1f", s / 1048576}')"
if [ "$size" -gt "$CAP" ]; then echo "SHARE FAIL: $OUT is $mb MB (> ${CAP_MB} MB); send the master's path instead, never the master" >&2; exit 1; fi
if [ "$cframes" != "$mframes" ]; then echo "SHARE FAIL: $cframes frames, the master has $mframes" >&2; exit 1; fi
echo "SHARE OK: $OUT  $mb MB (<= ${CAP_MB}), ${cframes} frames = the master, ${vk} kb/s video + AAC ${AUDIO_K}k, +faststart"
