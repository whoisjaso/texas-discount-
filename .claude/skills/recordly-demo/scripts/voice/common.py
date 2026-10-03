"""Shared by voice.py, transcribe.py, smoke.py and prepare-vo.py (no third-party imports here).

The house voice: Kokoro-82M, voice af_heart, speed 0.95, lang_code 'a' (American English), 24 kHz mono.
A client may override the voice or speed only through client-inputs.json -> voice: {"voice", "speed", "why"}.
"""
import json
import os
import re
import subprocess

HOUSE_VOICE = {"voice": "af_heart", "speed": 0.95}
SAMPLE_RATE = 24000
LEVEL = {"lufs": -16.0, "lufs_tol": 0.5, "tp_max": -1.5}

# Spoken forms written into `speak` (narration.md section 1) and what Whisper writes back for them. Both sides of the
# comparison are mapped to the same canonical text before they are compared.
SPOKEN = [
    (r"\bone thirty u\b", "130 u"),
    (r"\b130u\b", "130 u"),
    (r"\bl l c\b", "llc"),
    (r"\bv i n\b", "vin"),
    (r"\bz i p\b", "zip"),
]


def normalise(text):
    """lower case, hyphens and slashes as spaces, no punctuation but apostrophes, spoken forms canonical."""
    t = text.lower().replace("\u2019", "'")
    t = re.sub(r"[-\u2010-\u2015/]", " ", t)
    t = re.sub(r"[^a-z0-9' ]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    for pat, rep in SPOKEN:
        t = re.sub(pat, rep, t)
    return t


def word_diff(expected, heard):
    """[(op, expected words, heard words)] for every difference, by difflib on normalised words."""
    import difflib
    a, b = normalise(expected).split(), normalise(heard).split()
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if op != "equal":
            out.append((op, " ".join(a[i1:i2]), " ".join(b[j1:j2])))
    return out


def load_json(path, default=None):
    if not os.path.exists(path):
        if default is not None:
            return default
        raise SystemExit(f"missing {path}")
    with open(path, encoding="utf8") as f:
        return json.load(f)


def save_json(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")


def house_voice(project, cli_voice=None, cli_speed=None):
    """The voice and speed to use: the house values, or client-inputs.json -> voice with its reason. A CLI value that
    differs from both is refused (a different voice is a client decision, recorded in the inputs, never ad hoc)."""
    want = dict(HOUSE_VOICE)
    why = "house voice (narration.md section 2)"
    inputs = os.path.join(project, "client-inputs.json")
    if os.path.exists(inputs):
        v = (load_json(inputs) or {}).get("voice")
        if v:
            if not str(v.get("why", "")).strip():
                raise SystemExit("client-inputs.json -> voice overrides the house voice without a reason (voice.why)")
            want = {"voice": v.get("voice", want["voice"]), "speed": float(v.get("speed", want["speed"]))}
            why = "client-inputs.json -> voice: " + v["why"]
    if cli_voice and cli_voice != want["voice"]:
        raise SystemExit(f"refusing voice {cli_voice}: the house voice is {want['voice']} ({why}); a change goes in client-inputs.json -> voice with its reason")
    if cli_speed is not None and abs(cli_speed - want["speed"]) > 1e-9:
        raise SystemExit(f"refusing speed {cli_speed}: the house speed is {want['speed']} ({why})")
    return want, why


def ffmpeg(*args, capture=False):
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit("ffmpeg failed: " + " ".join(args) + "\n" + r.stderr[-2000:])
    return r


def ebur128(inputs, pre_filter=None):
    """Integrated loudness (LUFS) and true peak (dBTP) of one file or of several played back to back."""
    args = ["ffmpeg", "-nostdin", "-hide_banner", "-nostats"]
    if isinstance(inputs, (list, tuple)) and len(inputs) > 1:
        import tempfile
        lst = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False)
        for p in inputs:
            lst.write("file '%s'\n" % os.path.abspath(p).replace("'", "'\\''"))
        lst.close()
        args += ["-f", "concat", "-safe", "0", "-i", lst.name]
    else:
        args += ["-i", inputs[0] if isinstance(inputs, (list, tuple)) else inputs]
    af = (pre_filter + "," if pre_filter else "") + "ebur128=peak=true"
    r = subprocess.run(args + ["-vn", "-af", af, "-f", "null", "-"], capture_output=True, text=True)
    s = r.stderr
    m_i = re.findall(r"I:\s+(-?[\d.]+|-inf) LUFS", s)
    m_p = re.findall(r"Peak:\s+(-?[\d.]+|-inf) dBFS", s)
    lufs = float(m_i[-1]) if m_i and m_i[-1] != "-inf" else float("-inf")
    tp = float(m_p[-1]) if m_p and m_p[-1] != "-inf" else float("-inf")
    return lufs, tp
