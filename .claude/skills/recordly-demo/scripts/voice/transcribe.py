#!/usr/bin/env python3
"""Transcribe the takes back and compare them with what was said (runbook step N4; narration.md section 3).

    $VOICE_VENV/bin/python scripts/voice/transcribe.py --project $P [--model small.en] [--only ids]
    $VOICE_VENV/bin/python scripts/voice/transcribe.py --project $P --accept <id> --by <medium.en|user> --why "<reason>"

faster-whisper, compute_type int8 on the CPU, beam_size 5, language 'en', word_timestamps. The house model is small.en:
its run writes the edit's anchors,
    $P/narration/words.json            [{id, sec, text, speak?, heard, words: [{w, s, e}]}]   (s, e: seconds in the take)
and the comparison,
    $P/narration/transcribe-diff.md    every line whose words differ from `speak` (else `text`) after normalisation
                                       (case, punctuation, hyphens, and the spoken forms one-thirty-U = 130-U, L L C = LLC)
Exit 0 when no line differs or every differing line has a recorded decision; exit 2 otherwise.

A decision is bound to the take it was made on (the WAV's hash and the words said): re-voicing a line, or changing
what it says, sets its old decision aside and the line is open again. --accept --by medium.en is refused unless
medium.en's own run heard that line as written (no row for it in transcribe-diff-medium.en.md); --by user needs the
user's words (--words "<what they said>"). Each open row in transcribe-diff.md suggests the fix to try first: a comma
or a full stop right after the word the model dropped or changed. A proper noun both models hear wrongly goes to the
user. medium.en is a 1.5 GB download: it is refused when it would leave less than 8 GB free (setup.sh's floor).

Another model (--model medium.en) is the second opinion for a model that cannot listen: it writes
words-medium.en.json and transcribe-diff-medium.en.md and never replaces words.json. If medium.en hears a line as
written, record it:  --accept <id> --by medium.en --why "small.en misheard 'in' as 'and'; medium.en hears it as written".
If both models hear the same difference, change only the punctuation of `speak` and re-voice that line (at most twice),
else send the clip to the user and record their decision with --by user. Decisions live in
$P/narration/transcribe-decisions.json and are copied into the narration README (lesson N11).
"""
import argparse
import datetime
import os
import sys

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    DISK_FLOOR_GB, MODEL_GB, free_gb, hf_offline_when_cached, load_json, save_json, take_hash, word_diff,
)


def said(l):
    return l.get("speak") or l["text"]


def suggest(text, diff):
    """The cheapest fix to try first: a comma (or a full stop) right after the said word the model dropped or changed.
    On Discount, 'walking in knowing' was heard 'walking and knowing' by both models until speak read 'walking in, knowing'."""
    for op, exp, _heard in diff:
        if op in ("replace", "delete") and exp:
            last = exp.split()[-1]
            return f"speak: a comma right after \"{last}\" (else a full stop); a proper noun both models miss: ask the user"
    return "speak: a comma before the inserted word; else ask the user"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", required=True)
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--only", default="")
    ap.add_argument("--accept")
    ap.add_argument("--by")
    ap.add_argument("--why")
    ap.add_argument("--words", help="the user's own words, with --by user")
    a = ap.parse_args()
    P = os.path.abspath(a.project)
    nar = os.path.join(P, "narration")
    dec_path = os.path.join(nar, "transcribe-decisions.json")
    decisions = load_json(dec_path, default={})

    if a.accept:
        if not (a.by and a.why and a.why.strip()):
            raise SystemExit("--accept needs --by <medium.en|user> and --why '<what was heard and why it stands>'")
        lines_all = {x["id"]: x for x in load_json(os.path.join(nar, "lines-timed.json"))}
        if a.accept not in lines_all:
            raise SystemExit(f"--accept: no line {a.accept}")
        if a.by == "user":
            if not (a.words and a.words.strip()):
                raise SystemExit("--by user needs --words \"<the user's own words>\": a decision by ear is theirs, never a stand-in")
        elif a.by.endswith(".en") or a.by.startswith("large"):
            other = os.path.join(nar, f"transcribe-diff-{a.by}.md")
            if not os.path.exists(other):
                raise SystemExit(f"--by {a.by}: run --model {a.by} --only {a.accept} first (no {other})")
            with open(other, encoding="utf8") as f:
                if f"| {a.accept} |" in f.read():
                    raise SystemExit(f"--by {a.by}: {a.by} does not hear {a.accept} as written either ({other}): change only the "
                                     "punctuation of speak and re-voice it, or send the clip to the user (--by user --words ...)")
        else:
            raise SystemExit("--by must be another model that heard the line as written (medium.en) or user (with --words)")
        line = lines_all[a.accept]
        decisions[a.accept] = {"decision": "accepted", "by": a.by, "why": a.why.strip(),
                               "on": datetime.date.today().isoformat(),
                               "said": said(line), "take": take_hash(os.path.join(nar, "vo", a.accept + ".wav")),
                               **({"words": a.words.strip()} if a.words else {})}
        save_json(dec_path, decisions)
        print(f"recorded: {a.accept} accepted by {a.by}: {a.why}")
        return 0

    lines = load_json(os.path.join(nar, "lines-timed.json"))
    only = [x for x in a.only.split(",") if x]
    todo = [l for l in lines if not only or l["id"] in only]
    if only and len(todo) != len(only):
        raise SystemExit(f"--only: unknown ids {sorted(set(only) - {l['id'] for l in lines})}")

    repo = f"Systran/faster-whisper-{a.model}"
    hf_offline_when_cached(repo)
    if not os.environ.get("HF_HUB_OFFLINE"):
        need = MODEL_GB.get(a.model, 2.0)
        home = os.environ.get("HF_HOME") or os.path.join(os.path.expanduser("~"), ".cache", "huggingface")
        os.makedirs(home, exist_ok=True)
        left = free_gb(home) - need
        if left < DISK_FLOOR_GB:
            raise SystemExit(f"refusing to fetch {a.model} (~{need} GB) into {home}: it would leave {left:.1f} GB free, under the "
                             f"{DISK_FLOOR_GB:.0f} GB the runbook needs. Free space first (setup.sh --check lists what this skill made), "
                             "or send the clip to the user instead.")
    from faster_whisper import WhisperModel
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    house = a.model == "small.en"
    out_words = os.path.join(nar, "words.json" if house else f"words-{a.model}.json")
    out_diff = os.path.join(nar, "transcribe-diff.md" if house else f"transcribe-diff-{a.model}.md")
    have = {x["id"]: x for x in load_json(out_words, default=[])}
    for l in todo:
        segs, _ = model.transcribe(os.path.join(nar, "vo", l["id"] + ".wav"), beam_size=5, language="en", word_timestamps=True)
        words = [{"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2)} for s in segs for w in s.words]
        heard = " ".join(x["w"] for x in words)
        row = {"id": l["id"], "sec": l.get("sec"), "text": l["text"], "heard": heard, "words": words}
        if l.get("speak"):
            row["speak"] = l["speak"]
        have[l["id"]] = row
        print(f"  {l['id']:14} {'ok  ' if not word_diff(said(l), heard) else 'DIFF'} | {heard[:90]}")
    rows = [have[l["id"]] for l in lines if l["id"] in have]
    save_json(out_words, rows)

    def standing(l):
        """The line's decision, if it was made on this take saying these words; else None (asked again)."""
        dec = decisions.get(l["id"])
        if not dec:
            return None
        if dec.get("said") is not None and dec["said"] != said(l):
            return None
        if dec.get("take") and dec["take"] != take_hash(os.path.join(nar, "vo", l["id"] + ".wav")):
            return None
        return dec

    diffs, open_ = [], []
    for l in lines:
        if l["id"] not in have:
            continue
        d = word_diff(said(l), have[l["id"]]["heard"])
        if d:
            diffs.append((l, d))
            if not standing(l):
                open_.append(l["id"])
    md = [f"# Transcribe-back ({a.model}, {datetime.date.today().isoformat()})", "",
          f"{len(rows)} lines transcribed; {len(diffs)} differ from what was said after normalisation "
          "(case, punctuation, hyphens, one-thirty-U = 130-U, L L C = LLC).", ""]
    if diffs:
        md += ["| Line | Said | Heard | Differences (said → heard) | Try first | Decision |", "|---|---|---|---|---|---|"]
        for l, d in diffs:
            ch = "; ".join(f"{op}: '{x}' → '{y}'" for op, x, y in d)
            dec = standing(l)
            stale = decisions.get(l["id"]) and not dec
            dtext = (f"{dec['decision']} by {dec['by']}: {dec['why']}" if dec else
                     ("**open** (an earlier decision was on another take or other words)" if stale else
                      "**open**: listen (or --model medium.en), then --accept or re-voice"))
            md.append(f"| {l['id']} | {said(l)} | {have[l['id']]['heard']} | {ch} | {suggest(said(l), d)} | {dtext} |")
        md += ["", "Open rows go to the user with preview.mp3 at N5, so one reply covers both: "
               "`runbook.cjs mark N5 --by-user \"<their words>\"` after `transcribe.py --accept <id> --by user --words \"<their words>\"`."]
    else:
        md.append("Every line is heard as written.")
    with open(out_diff, "w", encoding="utf8") as f:
        f.write("\n".join(md) + "\n")
    print(f"wrote {out_words} and {out_diff}")
    if open_:
        print(f"TRANSCRIBE DIFF: {len(open_)} line(s) differ with no decision: {', '.join(open_)}")
        return 2
    print(f"TRANSCRIBE OK ({len(diffs)} difference(s), each with a recorded decision)" if diffs else "TRANSCRIBE OK (every line heard as written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
