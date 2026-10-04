#!/usr/bin/env bash
# capture-all.sh <storyboard.json> <shot id>… [--from <id>] [--var NAME=VALUE]… [--dry-run]     (runbook A6; long)
#
# Captures the shots in the order given, each into $SCRATCH/captures/<id> and published to $P/public/shots/<id>
# (shot.mp4 + cursor.json), --clean (a DSF 2 shot is ~2.5 GB of PNG). Order matters: each shot starts its cursor where
# the previous capture ended (cursor.start.fromShot, moveTo fromShot), so re-capturing shot N means every later shot too.
#   --from <id>  start at that shot; refuses unless every earlier shot in the list is already published
#   --var        passed to every capture (a deal for the desk shots: --var deal=<last part of deal.txt>)
# On a failure at shot N it moves the published captures of the shots after N aside to $SCRATCH/stale-shots/ (they
# continue from N's old cursor) and prints "re-capture from N". Prints "CAPTURES OK: <ids>" at the end.
# Run it through bg.sh: the five site shots take ~5 minutes, more on a busy machine.
set -uo pipefail
: "${S:?source demo.env}"; : "${SCRATCH:?source demo.env}"; : "${P:?source demo.env}"
SB="${1:?usage: capture-all.sh <storyboard.json> <ids…> [--from id] [--var N=V] [--dry-run]}"; shift
IDS=(); FROM=""; VARS=(); DRY=0
while [ $# -gt 0 ]; do
  case "$1" in --from) FROM="$2"; shift 2 ;; --var) VARS+=(--var "$2"); shift 2 ;; --dry-run) DRY=1; shift ;; *) IDS+=("$1"); shift ;; esac
done
[ "${#IDS[@]}" -gt 0 ] || { echo "give the shot ids in order" >&2; exit 2; }
start=0
if [ -n "$FROM" ]; then
  for i in "${!IDS[@]}"; do [ "${IDS[$i]}" = "$FROM" ] && start=$i; done
  [ "${IDS[$start]}" = "$FROM" ] || { echo "--from $FROM is not in the list" >&2; exit 2; }
  for ((k = 0; k < start; k++)); do
    id="${IDS[$k]}"
    [ -f "$P/public/shots/$id/shot.mp4" ] && [ -f "$P/public/shots/$id/cursor.json" ] || { echo "refusing --from $FROM: $id is not captured yet (shots go in order)" >&2; exit 1; }
  done
fi
for ((k = start; k < ${#IDS[@]}; k++)); do
  id="${IDS[$k]}"
  echo "== capture $id ($((k + 1)) of ${#IDS[@]})"
  if [ "$DRY" = 1 ]; then echo "(dry run) node $S/scripts/capture.cjs --storyboard $SB --shot $id --out $SCRATCH/captures/$id --publish $P/public/shots --clean ${VARS[*]}"; continue; fi
  if ! nice -n 15 node "$S/scripts/capture.cjs" --storyboard "$SB" --shot "$id" --out "$SCRATCH/captures/$id" --publish "$P/public/shots" --clean "${VARS[@]}"; then
    ts="$(date +%Y%m%d-%H%M%S)"
    for ((j = k + 1; j < ${#IDS[@]}; j++)); do
      later="${IDS[$j]}"
      if [ -d "$P/public/shots/$later" ]; then mkdir -p "$SCRATCH/stale-shots"; mv "$P/public/shots/$later" "$SCRATCH/stale-shots/$later-$ts"; echo "moved the stale capture of $later aside"; fi
    done
    echo "CAPTURE FAILED at $id: fix the cause (log above), then re-capture from $id: capture-all.sh $SB ${IDS[*]} --from $id"
    exit 1
  fi
done
echo "CAPTURES OK: ${IDS[*]:$start}"
