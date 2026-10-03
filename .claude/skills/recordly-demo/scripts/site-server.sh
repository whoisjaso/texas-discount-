#!/usr/bin/env bash
# site-server.sh build-start | start | stop | status            (runbook A2, stopped in A7; needs SITE_DIR, SCRATCH, I)
#
# The client's site, built with the Admin link and served for capture on :5183 only, in its own process group.
#   build-start  build with VITE_DESK_URL=<client-inputs.json deskUrl> (the drawer's Admin row renders; it is never
#                navigated in part A) through the site's own build script (it type-checks first) into
#                $SCRATCH/dist-demo, then start.
#   start        refuses when :5183 is taken (stop YOUR server with `stop`; never another port, never kill a server
#                you did not start); `vite preview --strictPort` detached (setsid nohup, log $SCRATCH/site.log, the
#                group id in $SCRATCH/site.pgid); polls / until it answers 200 (90 s). Prints SITE READY.
#   stop         TERM the group, 2 s, KILL; asserts :5183 is free. Prints SITE STOPPED.
# Never edits the site source: video-only fixes go in the storyboard's captureCss.
set -uo pipefail
: "${SCRATCH:?source your demo.env (SCRATCH)}"; : "${SITE_DIR:?source your demo.env (SITE_DIR)}"
PORT=5183; PGIDF="$SCRATCH/site.pgid"; LOG="$SCRATCH/site.log"; DIST="$SCRATCH/dist-demo"
cmd="${1:-status}"
taken() {
  if command -v ss >/dev/null 2>&1; then ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$PORT\$"
  else grep -qiE "^ *[0-9]+: [0-9A-F]+:$(printf '%04X' $PORT) [0-9A-F]+:[0-9A-F]+ 0A" /proc/net/tcp /proc/net/tcp6 2>/dev/null; fi
}
ours() { local g; g="$(cat "$PGIDF" 2>/dev/null)"; [ -n "$g" ] && kill -0 -- "-$g" 2>/dev/null; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT/" 2>/dev/null || echo 000; }

build() {
  : "${I:?source your demo.env (I)}"
  local desk; desk="$(node -e 'const j=require(process.argv[1]); if(!j.deskUrl||/\{\{/.test(j.deskUrl)) process.exit(1); console.log(j.deskUrl)' "$I")" || { echo "client-inputs.json deskUrl is not set" >&2; return 1; }
  [ -d "$SITE_DIR/node_modules" ] || { echo "no node_modules in $SITE_DIR: run npm ci there first (the site build's own install)" >&2; return 1; }
  echo "== build $SITE_DIR with VITE_DESK_URL=$desk -> $DIST"
  if grep -q '"build": *"[^"]*vite build' "$SITE_DIR/package.json"; then
    (cd "$SITE_DIR" && VITE_DESK_URL="$desk" npm run build -- --outDir "$DIST" --emptyOutDir) || return 1
  else
    (cd "$SITE_DIR" && VITE_DESK_URL="$desk" ./node_modules/.bin/vite build --outDir "$DIST" --emptyOutDir) || return 1
  fi
}
start() {
  [ -f "$DIST/index.html" ] || { echo "no build at $DIST: run build-start" >&2; return 1; }
  if taken; then
    if ours; then echo "already running (pgid $(cat "$PGIDF"))"; return 0; fi
    echo "refusing: :$PORT is taken by a server this run did not start. Never use another port; ask whoever owns it, or wait." >&2; return 1
  fi
  ( cd "$SITE_DIR" && exec setsid nohup bash -c 'echo $$ > "$0"; exec ./node_modules/.bin/vite preview --outDir "$1" --port '"$PORT"' --strictPort' "$PGIDF" "$DIST" > "$LOG" 2>&1 < /dev/null ) &
  for _ in $(seq 1 50); do [ -s "$PGIDF" ] && break; sleep 0.1; done
  local c=000
  for _ in $(seq 1 45); do c="$(code)"; [ "$c" = 200 ] && break; ours || break; sleep 2; done
  if [ "$c" = 200 ]; then echo "SITE READY: http://localhost:$PORT/ -> 200 (pgid $(cat "$PGIDF"))"; return 0; fi
  echo "SITE NOT READY: / -> $c"; tail -n 10 "$LOG" | sed 's/^/  | /'; stop; return 1
}
stop() {
  local g; g="$(cat "$PGIDF" 2>/dev/null)"
  if [ -n "$g" ]; then kill -TERM -- "-$g" 2>/dev/null; sleep 2; kill -KILL -- "-$g" 2>/dev/null; rm -f "$PGIDF"; fi
  for _ in 1 2 3; do taken || break; sleep 1; done
  if taken; then echo "STOP INCOMPLETE: :$PORT still taken (not by group ${g:-none})" >&2; return 1; fi
  echo "SITE STOPPED: :$PORT free"
}
case "$cmd" in
  build-start) build && start ;;
  start) start ;;
  stop) stop ;;
  status) if ours; then echo "RUNNING pgid $(cat "$PGIDF") / -> $(code)"; elif taken; then echo "STOPPED (ours); :$PORT taken by another server"; else echo "STOPPED; :$PORT free"; fi ;;
  *) sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
