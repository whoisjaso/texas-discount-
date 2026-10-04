#!/usr/bin/env python3
"""Voice the narration, one WAV per line (runbook step N3; references/narration.md section 2).

    $VOICE_VENV/bin/python scripts/voice/voice.py --project $P [--only 01-site-a,02-site-b] [--no-preview]

Reads   $P/narration/lines.json        [{id, seg, text, speak?}]  (fill-narration.cjs lines writes it)
Writes  $P/narration/vo/<id>.wav       Kokoro-82M, af_heart, speed 0.95, 24 kHz mono, from `speak` when set, else `text`
        $P/narration/lines-timed.json  [{id, seg, text, speak?, sec}]   (sec = the raw take's length)
        $P/narration/preview.mp3       every line in order with 0.6 s between, loudness-normalised (-16 LUFS): what the
                                       user listens to before anything is cut (runbook N5)

Kokoro is deterministic: the same text gives the same take. To vary a take, change the punctuation or wording of
`speak` (client-inputs.json -> narration.speak), never the voice or speed. A different voice or speed is a client
decision recorded in client-inputs.json -> voice {voice, speed, why}; anything else is refused.
--only re-voices those lines and keeps the others (lines-timed.json is merged, the preview rebuilt).
Prints "VOICED <n> lines (<s> s of speech)".
"""
import argparse
import os
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SAMPLE_RATE, hf_offline_when_cached, house_voice, load_json, save_json  # noqa: E402

GAP_SEC = 0.6


def build_preview(nar, timed, out):
    with tempfile.TemporaryDirectory() as tmp:
        gap = os.path.join(tmp, "gap.wav")
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        f"anullsrc=r={SAMPLE_RATE}:cl=mono", "-t", str(GAP_SEC), gap], check=True)
        lst = os.path.join(tmp, "list.txt")
        with open(lst, "w") as f:
            for i, l in enumerate(timed):
                if i:
                    f.write(f"file '{gap}'\n")
                f.write("file '%s'\n" % os.path.join(nar, "vo", l["id"] + ".wav").replace("'", "'\\''"))
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
                        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", out],
                       check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--voice")
    ap.add_argument("--speed", type=float)
    ap.add_argument("--no-preview", action="store_true")
    a = ap.parse_args()
    P = os.path.abspath(a.project)
    nar = os.path.join(P, "narration")
    lines = load_json(os.path.join(nar, "lines.json"))
    want, why = house_voice(P, a.voice, a.speed)
    only = [x for x in a.only.split(",") if x]
    unknown = [x for x in only if x not in {l["id"] for l in lines}]
    if unknown:
        raise SystemExit(f"--only: no such line ids {unknown}")
    todo = [l for l in lines if not only or l["id"] in only]
    os.makedirs(os.path.join(nar, "vo"), exist_ok=True)

    import numpy as np
    import soundfile as sf
    hf_offline_when_cached("hexgrad/Kokoro-82M")
    from kokoro import KPipeline

    print(f"voice {want['voice']} speed {want['speed']} ({why}); {len(todo)} of {len(lines)} lines")
    pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    old = {x["id"]: x for x in load_json(os.path.join(nar, "lines-timed.json"), default=[])}
    for l in todo:
        t0 = time.time()
        said = l.get("speak") or l["text"]
        audio = np.concatenate([x for _, _, x in pipe(said, voice=want["voice"], speed=want["speed"])])
        sf.write(os.path.join(nar, "vo", l["id"] + ".wav"), audio, SAMPLE_RATE)
        sec = round(len(audio) / SAMPLE_RATE, 3)
        old[l["id"]] = {**{k: v for k, v in l.items()}, "sec": sec}
        print(f"  {l['id']:14} {sec:6.2f} s  ({time.time() - t0:4.1f} s)  {said[:70]}")
    timed = []
    for l in lines:  # the order of lines.json; a line never voiced yet is reported, not invented
        if l["id"] not in old or not os.path.exists(os.path.join(nar, "vo", l["id"] + ".wav")):
            raise SystemExit(f"line {l['id']} has no take yet: run without --only")
        timed.append({**l, "sec": old[l["id"]]["sec"]})
    save_json(os.path.join(nar, "lines-timed.json"), timed)
    if not a.no_preview:
        build_preview(nar, timed, os.path.join(nar, "preview.mp3"))
        print(f"preview: {os.path.join(nar, 'preview.mp3')} (send it with transcribe-diff.md; cut nothing before the OK)")
    print(f"VOICED {len(todo)} lines ({sum(x['sec'] for x in timed):.1f} s of speech in the set)")


if __name__ == "__main__":
    main()
