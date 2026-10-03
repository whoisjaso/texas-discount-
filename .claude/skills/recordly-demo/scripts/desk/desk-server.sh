#!/usr/bin/env bash
# desk-server.sh start|stop|restart|status [--member fresh|fresh-sales] [--dry-run] [--force]
#
# The client's sale desk for capture: `next dev` (the preview mock runs only outside production) on :5190, never any
# other port, in its own process group, stopped by that group. Needs DESK_DIR and SCRATCH (source demo.env).
#
# start   refuses when :5190 is already taken (stop YOUR server with `stop`; never start on another port, never kill a
#         server you did not start). Saves next-env.d.ts (next dev rewrites it) to $SCRATCH/next-env.d.ts.saved, then:
#           setsid env PORT=5190 DESK_PREVIEW_MEMBER=<member> DESK_ALLOW_UNSET_FACTS=true [NODE_USE_ENV_PROXY=1]
#             ADMIN_SESSION_SECRET=<random> INTERNAL_RENDER_TOKEN=<random> CHROME_PATH=<chromium>
#             npx next dev -p 5190  > $SCRATCH/desk.log        (as the Discount captures were made: no SITE_URL, so the
#             desk's own links and the paper's website are exactly what the desk prints by default)
#         The two secrets are fresh random values on the command line only, never written to a file. NODE_USE_ENV_PROXY
#         is set when HTTPS_PROXY is (the address step's Census lookup goes out through the proxy; lesson N1).
#         No Supabase variables are passed, so the preview mock runs; its state lives in this process (a restart is a
#         fresh desk: the member un-onboarded, no deals). Polls /admin/login until 200 (180 s; the first compile is slow).
# --member  fresh (default: an owner who has not onboarded; meets Your Fees on a fees desk) or fresh-sales (a
#         salesperson cleared to sign; never sees Your Fees). The runbook takes it from client-inputs.json →
#         partB.onboarding (owner-fees → fresh, sales → fresh-sales); MEMBER in the environment works too.
# stop    TERM the group, 3 s, KILL the group; restore next-env.d.ts from the saved copy (cmp + cp, never git); assert
#         :5190 is free. --force skips the TERM grace.
# restart stop, then start (same member): the reset between takes (lesson N6).
# status  RUNNING pgid … (/admin/login code) | STOPPED, and whether :5190 is taken by someone else.
# --dry-run prints the start command (secrets elided) and changes nothing.
# Never `npm install` in the desk: its node_modules are the desk build's, not this skill's.
set -uo pipefail
: "${SCRATCH:?source your demo.env (SCRATCH)}"
cmd="${1:-status}"; shift || true
# the member: --member, else MEMBER, else client-inputs.json → partB.onboarding (owner-fees → fresh, sales → fresh-sales)
FROM_INPUTS=""
if [ -n "${I:-}" ] && [ -f "${I:-}" ]; then
  FROM_INPUTS="$(node -e 'const o=(require(process.argv[1]).partB||{}).onboarding; console.log(o==="sales"?"fresh-sales":o==="owner-fees"?"fresh":"")' "$I" 2>/dev/null)"
fi
MEMBER="${MEMBER:-${FROM_INPUTS:-fresh}}"; DRY=0; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in --member) MEMBER="$2"; shift 2 ;; --dry-run) DRY=1; shift ;; --force) FORCE=1; shift ;; *) echo "unknown $1" >&2; exit 2 ;; esac
done
case "$MEMBER" in fresh|fresh-sales) ;; *) echo "--member must be fresh or fresh-sales, not $MEMBER" >&2; exit 2 ;; esac
PORT=5190
PGIDF="$SCRATCH/desk.pgid"; LOG="$SCRATCH/desk.log"; SAVED="$SCRATCH/next-env.d.ts.saved"; MEMF="$SCRATCH/desk.member"

taken() {
  if command -v ss >/dev/null 2>&1; then ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$PORT\$"
  else grep -qiE "^ *[0-9]+: [0-9A-F]+:$(printf '%04X' $PORT) [0-9A-F]+:[0-9A-F]+ 0A" /proc/net/tcp /proc/net/tcp6 2>/dev/null; fi
}
ours() { local g; g="$(cat "$PGIDF" 2>/dev/null)"; [ -n "$g" ] && kill -0 -- "-$g" 2>/dev/null; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT/admin/login" 2>/dev/null || echo 000; }

start() {
  : "${DESK_DIR:?DESK_DIR is empty: this client has no desk at clients/<slug>-desk (env.sh --desk <dir>)}"
  [ -f "$DESK_DIR/package.json" ] && [ -d "$DESK_DIR/node_modules/next" ] || { echo "no Next.js desk with node_modules at $DESK_DIR (the desk build installs it; never npm install here)" >&2; return 1; }
  if taken; then
    if ours; then echo "already running (pgid $(cat "$PGIDF")): use restart for a fresh desk" >&2; else echo "refusing: :$PORT is taken by a server this run did not start (ss -ltnp). Never use another port; ask whoever owns it, or wait." >&2; fi
    return 1
  fi
  local chrome="${CHROME_PATH:-$(ls -d "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
  [ -x "$chrome" ] || { echo "no chromium for the desk's PDF renderer (CHROME_PATH); run setup.sh --check" >&2; return 1; }
  local proxy=""; [ -n "${HTTPS_PROXY:-${https_proxy:-}}" ] && proxy="NODE_USE_ENV_PROXY=1"
  if [ "$DRY" = 1 ]; then
    echo "(dry run) cd $DESK_DIR && cp next-env.d.ts $SAVED && setsid env PORT=$PORT DESK_PREVIEW_MEMBER=$MEMBER DESK_ALLOW_UNSET_FACTS=true $proxy ADMIN_SESSION_SECRET=<openssl rand -hex 32> INTERNAL_RENDER_TOKEN=<openssl rand -hex 24> CHROME_PATH=$chrome npx next dev -p $PORT > $LOG 2>&1 < /dev/null &"
    return 0
  fi
  [ -f "$DESK_DIR/next-env.d.ts" ] && cp "$DESK_DIR/next-env.d.ts" "$SAVED"
  echo "$MEMBER" > "$MEMF"
  ( cd "$DESK_DIR" && exec setsid env PORT=$PORT DESK_PREVIEW_MEMBER="$MEMBER" DESK_ALLOW_UNSET_FACTS=true $proxy \
      ADMIN_SESSION_SECRET="$(openssl rand -hex 32)" INTERNAL_RENDER_TOKEN="$(openssl rand -hex 24)" CHROME_PATH="$chrome" \
      bash -c 'echo $$ > "$0"; exec npx next dev -p '"$PORT" "$PGIDF" > "$LOG" 2>&1 < /dev/null ) &
  for _ in $(seq 1 50); do [ -s "$PGIDF" ] && break; sleep 0.1; done
  echo "started the desk (member $MEMBER, pgid $(cat "$PGIDF" 2>/dev/null)), log $LOG; waiting for /admin/login"
  local c=000
  for _ in $(seq 1 90); do c="$(code)"; [ "$c" = 200 ] && break; ours || break; sleep 2; done
  if [ "$c" = 200 ]; then echo "DESK READY: :$PORT /admin/login -> 200 (member $MEMBER)"; return 0; fi
  echo "DESK NOT READY: /admin/login -> $c; last log lines:"; tail -n 15 "$LOG" | sed 's/^/  | /'
  stop; return 1
}

stop() {
  local g; g="$(cat "$PGIDF" 2>/dev/null)"
  if [ -n "$g" ]; then
    [ "$FORCE" = 1 ] || { kill -TERM -- "-$g" 2>/dev/null; sleep 3; }
    kill -KILL -- "-$g" 2>/dev/null
    rm -f "$PGIDF"
  fi
  if [ -f "$SAVED" ] && [ -n "${DESK_DIR:-}" ]; then
    cmp -s "$SAVED" "$DESK_DIR/next-env.d.ts" || { cp "$SAVED" "$DESK_DIR/next-env.d.ts"; echo "restored next-env.d.ts"; }
  fi
  for _ in 1 2 3 4 5; do taken || break; sleep 1; done
  if taken; then echo "STOP INCOMPLETE: :$PORT is still taken (not by group ${g:-none}?): ss -ltnp; never start on another port" >&2; return 1; fi
  echo "DESK STOPPED: :$PORT free${g:+ (pgid $g)}"
}

case "$cmd" in
  start) start ;;
  stop) stop ;;
  restart) MEMBER="$(cat "$MEMF" 2>/dev/null || echo "$MEMBER")"; stop && start ;;
  status)
    if ours; then echo "RUNNING pgid $(cat "$PGIDF") member $(cat "$MEMF" 2>/dev/null) /admin/login -> $(code)"
    elif taken; then echo "STOPPED (ours); :$PORT is taken by another server"
    else echo "STOPPED; :$PORT free"; fi ;;
  *) sed -n '2,32p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
