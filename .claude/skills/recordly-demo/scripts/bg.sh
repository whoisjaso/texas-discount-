#!/usr/bin/env bash
# bg.sh — long jobs for any agent harness (references/harness.md). Anything that can run over 2 minutes (npm ci, a
# capture loop, a render, verify.sh, the voice venv) runs through this, so no harness time limit can kill it mid-way
# and a later call can tell what happened.
#
#   bg.sh start <name> [--cwd DIR] -- <command> [args…]   detach it (own session and process group), log, exit code
#   bg.sh status <name>        RUNNING (pid, elapsed) | DONE | FAILED(<rc>) | DIED (killed, no exit code), + last 5 lines
#   bg.sh wait <name> [sec]    poll every 15 s for up to <sec> (default 540, under a 10-minute call limit); prints the
#                              status; exit 0 DONE, 1 FAILED/DIED, 3 still RUNNING (call wait again)
#   bg.sh tail <name> [n]      the last n (default 40) log lines
#   bg.sh stop <name>          TERM the whole process group, KILL it 5 s later
#   bg.sh list                 every job under $SCRATCH/jobs with its status
#
# Files: $SCRATCH/jobs/<name>.{log,rc,pgid,cmd,started}. SCRATCH must be set (source $SCRATCH/demo.env first).
# The job inherits this shell's environment; put `source $SCRATCH/demo.env &&` at the front of the command when it
# needs the run's variables.
set -uo pipefail
: "${SCRATCH:?set SCRATCH (source your demo.env)}"
J="$SCRATCH/jobs"; mkdir -p "$J"
cmd="${1:-}"; shift || true
name="${1:-}"

valid() { [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "job name must be [A-Za-z0-9._-]+, not '$1'" >&2; exit 2; }; }
alive() { local g; g="$(cat "$J/$1.pgid" 2>/dev/null)"; [ -n "$g" ] && kill -0 -- "-$g" 2>/dev/null; }
state() {
  if [ -f "$J/$1.rc" ]; then local rc; rc="$(cat "$J/$1.rc")"; [ "$rc" = 0 ] && echo DONE || echo "FAILED($rc)"
  elif alive "$1"; then echo RUNNING
  elif [ -f "$J/$1.pgid" ]; then echo DIED
  else echo UNKNOWN; fi
}
elapsed() { local s; s="$(cat "$J/$1.started" 2>/dev/null || date +%s)"; local e=$(( $(date +%s) - s )); printf '%dm%02ds' $((e / 60)) $((e % 60)); }
show() {
  local st; st="$(state "$1")"
  echo "$1: $st ($(elapsed "$1")) log $J/$1.log"
  [ -f "$J/$1.log" ] && tail -n 5 "$J/$1.log" | sed 's/^/  | /'
}

case "$cmd" in
  start)
    valid "$name"; shift
    cwd="$PWD"
    if [ "${1:-}" = --cwd ]; then cwd="$2"; shift 2; fi
    [ "${1:-}" = -- ] && shift
    [ $# -gt 0 ] || { echo "usage: bg.sh start <name> [--cwd DIR] -- <command> [args…]" >&2; exit 2; }
    if alive "$name" && [ ! -f "$J/$name.rc" ]; then echo "refusing: job $name is still RUNNING (bg.sh status $name; bg.sh stop $name)" >&2; exit 1; fi
    rm -f "$J/$name.rc" "$J/$name.pgid"
    printf '%q ' "$@" > "$J/$name.cmd"; echo >> "$J/$name.cmd"
    date +%s > "$J/$name.started"
    # setsid: own session and process group, so stopping the job stops everything it started (npx children too)
    # the job writes its own pid, which is its process group id (setsid made it the group leader)
    ( cd "$cwd" && exec setsid nohup bash -c 'echo $$ > "$0.pgid"; "$@"; echo $? > "$0.rc"' "$J/$name" "$@" > "$J/$name.log" 2>&1 < /dev/null ) &
    for _ in $(seq 1 50); do [ -s "$J/$name.pgid" ] && break; sleep 0.1; done
    pg="$(cat "$J/$name.pgid" 2>/dev/null)"
    [ -n "$pg" ] || { echo "job $name did not start (see $J/$name.log)" >&2; exit 1; }
    echo "started $name (pgid $pg): $(cat "$J/$name.cmd")"
    echo "  poll: bash $(realpath "${BASH_SOURCE[0]}") status $name   (or: wait $name 540)"
    ;;
  status) valid "$name"; show "$name"; case "$(state "$name")" in DONE) exit 0 ;; RUNNING) exit 3 ;; *) exit 1 ;; esac ;;
  wait)
    valid "$name"; limit="${2:-540}"; t0="$(date +%s)"
    while [ "$(state "$name")" = RUNNING ] && [ $(( $(date +%s) - t0 )) -lt "$limit" ]; do sleep 15; done
    show "$name"
    case "$(state "$name")" in DONE) exit 0 ;; RUNNING) echo "still running: call wait again"; exit 3 ;; *) exit 1 ;; esac ;;
  tail) valid "$name"; tail -n "${2:-40}" "$J/$name.log" ;;
  stop)
    valid "$name"; g="$(cat "$J/$name.pgid" 2>/dev/null)"
    [ -n "$g" ] || { echo "no job $name"; exit 1; }
    kill -TERM -- "-$g" 2>/dev/null; sleep 5; kill -KILL -- "-$g" 2>/dev/null
    [ -f "$J/$name.rc" ] || echo 143 > "$J/$name.rc"
    echo "stopped $name (pgid $g)" ;;
  list) for f in "$J"/*.cmd; do [ -e "$f" ] || continue; n="$(basename "$f" .cmd)"; printf '%-20s %s\n' "$n" "$(state "$n")"; done ;;
  *) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
