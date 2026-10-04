#!/usr/bin/env python3
"""The voice venv's smoke test (setup.sh --voice runs it): voice one sentence with the house voice, transcribe it back
with the house check, and compare. Exit 0 when the words match after normalisation.

    $VOICE_VENV/bin/python scripts/voice/smoke.py [--out DIR] [--text "..."]
"""
import argparse
import os
import sys
import time

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import HOUSE_VOICE, SAMPLE_RATE, hf_offline_when_cached, normalise, word_diff  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".")
    ap.add_argument("--text", default="The bill of sale is signed.")
    a = ap.parse_args()
    import numpy as np
    import soundfile as sf
    hf_offline_when_cached("hexgrad/Kokoro-82M", "Systran/faster-whisper-small.en")
    from kokoro import KPipeline
    from faster_whisper import WhisperModel

    t0 = time.time()
    pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    audio = np.concatenate([x for _, _, x in pipe(a.text, voice=HOUSE_VOICE["voice"], speed=HOUSE_VOICE["speed"])])
    wav = os.path.join(a.out, "smoke.wav")
    sf.write(wav, audio, SAMPLE_RATE)
    print(f"  voiced {len(audio) / SAMPLE_RATE:.2f} s in {time.time() - t0:.1f} s -> {wav}")
    m = WhisperModel("small.en", device="cpu", compute_type="int8")
    segs, _ = m.transcribe(wav, beam_size=5, language="en", word_timestamps=True)
    heard = " ".join(w.word.strip() for s in segs for w in s.words)
    print(f"  said:  {a.text}\n  heard: {heard}")
    d = word_diff(a.text, heard)
    if d:
        print("  DIFFERENT:", d)
        return 1
    print("  match after normalisation:", normalise(heard))
    return 0


if __name__ == "__main__":
    sys.exit(main())
