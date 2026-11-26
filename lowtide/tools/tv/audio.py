"""Lowtide TV, step 1: the soundtrack. Every line voiced with eSpeak NG (each character's own voice),
the network's bleeps ({word} on time, [word] late), a jingle, the room (applause, kids, a wheel).
Writes build/<show>.wav (22.05 kHz mono) and build/<show>.json (when each line plays, a loudness
envelope per video frame for each speaker, the cues). Run from anywhere: python3 audio.py"""
import json, os, re, subprocess, tempfile, wave, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "media", "tv", "shows.src.json")
OUT = os.path.join(HERE, "build"); os.makedirs(OUT, exist_ok=True)
SR, FPS = 22050, 15
rng = np.random.default_rng(7)

def espeak(text, v):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f: path = f.name
    subprocess.run(["espeak-ng", "-v", v["v"], "-p", str(v["p"]), "-s", str(v["s"]), "-a", "160", "-g", "2", "-w", path, text], check=True)
    with wave.open(path) as w: sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    os.remove(path)
    if sr != SR: x = np.interp(np.arange(0, len(x), sr / SR), np.arange(len(x)), x)
    # trim eSpeak's silence at both ends
    nz = np.where(np.abs(x) > 0.01)[0]
    return x[max(0, nz[0] - 200): nz[-1] + 400] if len(nz) else x

def tone(sec, f=1000, a=0.32):
    t = np.arange(int(sec * SR)) / SR; y = a * np.sin(2 * np.pi * f * t); k = min(len(y) // 4, 120)
    y[:k] *= np.linspace(0, 1, k); y[-k:] *= np.linspace(1, 0, k); return y

def gap(sec): return np.zeros(int(sec * SR), np.float32)

def say(text, v):
    """a line, with bleeps: {w} replaced on time, [w] spoken then bleeped late, across the next beat"""
    parts = re.split(r"(\{[^}]+\}|\[[^\]]+\])", text); out = []
    for p in parts:
        if not p.strip(): continue
        if p[0] == "{": w = espeak(p[1:-1], v); out.append(tone(len(w) / SR + 0.05))
        elif p[0] == "[": w = espeak(p[1:-1], v); out.append(np.concatenate([w[: int(len(w) * 0.7)], tone(0.45)]))
        else:   # what's left after a bleep: no stray "!" or "." for eSpeak to read out as words
            p = p.lstrip(" !.,?;:")
            if not re.search(r"[A-Za-z0-9]", p): out.append(gap(0.12)); continue
            out.append(espeak(p, v)); out.append(gap(0.04))
    return np.concatenate(out)

def clean(text): return re.sub(r"\{([^}]+)\}", lambda m: m.group(1)[0] + "-" * (len(m.group(1)) - 1), re.sub(r"\[([^\]]+)\]", lambda m: m.group(1)[0] + "-" * (len(m.group(1)) - 1), text))

# --- the room ---
def noise(sec): return rng.standard_normal(int(sec * SR)).astype(np.float32)
def lp(x, k):
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s += k * (x[i] - s); y[i] = s
    return y
def applause(sec, a=0.22):
    n = int(sec * SR); y = np.zeros(n, np.float32)
    for _ in range(int(sec * 260)):   # many hands: short bursts
        i = rng.integers(0, max(1, n - 400)); L = rng.integers(60, 260); y[i:i + L] += rng.standard_normal(L).astype(np.float32) * np.exp(-np.arange(L) / (L / 4)) * rng.uniform(0.3, 1)
    env = np.minimum(1, np.minimum(np.arange(n) / (0.3 * SR), (n - np.arange(n)) / (0.8 * SR)))
    return (y / (np.abs(y).max() + 1e-6)) * env * a
def crowd_aww(sec, a=0.18):
    t = np.arange(int(sec * SR)) / SR; f = 220 * (1 - 0.25 * t / sec); y = np.zeros_like(t)
    for k in range(9): y += np.sin(2 * np.pi * np.cumsum(f * (1 + rng.uniform(-0.04, 0.04))) / SR) * rng.uniform(0.5, 1)
    y = y * np.minimum(1, t / 0.2) * np.maximum(0, 1 - t / sec); return (y / np.abs(y).max() * a).astype(np.float32)
def kids(sec, a=0.16):
    t = np.arange(int(sec * SR)) / SR; y = np.zeros_like(t)
    for k in range(10):
        f0 = rng.uniform(380, 620); f = f0 * (1 + 0.15 * np.sin(2 * np.pi * rng.uniform(1, 3) * t + rng.uniform(0, 6)))
        y += np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.3 * (0.6 + 0.4 * np.sin(2 * np.pi * rng.uniform(2, 5) * t))
    y = lp(y.astype(np.float32), 0.25) * np.minimum(1, t / 0.15) * np.maximum(0, 1 - t / sec); return y / np.abs(y).max() * a
def ticks(sec, a=0.3):   # the wheel: clacks that slow down
    n = int(sec * SR); y = np.zeros(n, np.float32); t = 0.0; dt = 0.05
    while t < sec - 0.05:
        i = int(t * SR); L = 300; y[i:i + L] += rng.standard_normal(L).astype(np.float32) * np.exp(-np.arange(L) / 40) * a; t += dt; dt *= 1.07
    return y
def jingle(notes, step=0.16, a=0.18, wave_="square"):
    out = []
    for f in notes:
        t = np.arange(int(step * SR)) / SR
        if f <= 0: out.append(np.zeros_like(t)); continue
        s = np.sign(np.sin(2 * np.pi * f * t)) if wave_ == "square" else np.sin(2 * np.pi * f * t)
        s += 0.5 * np.sin(2 * np.pi * f * 2 * t); out.append(s * np.exp(-t * 6) * a)
    return np.concatenate(out).astype(np.float32)

N = lambda m: 440 * 2 ** ((m - 69) / 12)
JINGLES = {
    "news": jingle([N(m) for m in [62, 69, 74, 0, 73, 71, 69, 74]], 0.14, 0.12, "sine"),
    "cola": jingle([N(m) for m in [72, 76, 79, 84, 0, 79, 84]], 0.12, 0.12),
    "spin": jingle([N(m) for m in [67, 71, 74, 79, 74, 79, 83]], 0.1, 0.12),
    "lawyer": jingle([N(m) for m in [60, 64, 67, 72]], 0.18, 0.1, "sine"),
    "gull": jingle([N(m) for m in [72, 74, 76, 79, 76, 79, 84, 0]], 0.12, 0.12),
    "movie": jingle([N(m) for m in [45, 0, 48, 47, 45, 0, 40]], 0.3, 0.12, "sine"),
}

def build(show, cast):
    sid = show["id"]; track = [JINGLES[sid], gap(0.3)]; t = sum(len(x) for x in track) / SR
    lines, cues, envs = [], [], {}
    over = []   # (start sample, audio) laid over the speech
    for (who, text, after, *cue) in show["lines"]:
        a = say(text, cast[who]["voice"]); start = t
        lines.append({"who": who, "t0": round(start, 3), "t1": round(start + len(a) / SR, 3), "text": clean(text)})
        if cue:
            c = cue[0]; cues.append({"t": round(start, 3), "cue": c})
            kind, _, name = c.partition(":")
            if name == "applause": over.append((int((start + len(a) / SR) * SR), applause(2.2)))
            if name == "kids": over.append((int((start + len(a) / SR) * SR), kids(1.6)))
            if name == "aww": over.append((int(start * SR), crowd_aww(1.6)))
            if name == "spin": over.append((int((start + len(a) / SR + 0.2) * SR), ticks(4.0)))
        track += [a, gap(after)]; t += len(a) / SR + after
    track += [gap(0.6)]
    y = np.concatenate(track).astype(np.float32)
    for (i, a) in over:
        if i + len(a) > len(y): y = np.concatenate([y, np.zeros(i + len(a) - len(y), np.float32)])
        y[i:i + len(a)] += a
    if sid == "movie":   # rain under the whole thing
        r = lp(noise(len(y) / SR), 0.35) * 0.05; y += r[: len(y)]
    y = np.clip(y / max(1, np.abs(y).max() / 0.9), -1, 1)
    dur = len(y) / SR
    # loudness per frame, per speaker (who's talking moves)
    nf = int(math.ceil(dur * FPS)); hop = SR // FPS
    for L in lines:
        e = envs.setdefault(L["who"], [0.0] * nf)
        for f in range(int(L["t0"] * FPS), min(nf, int(L["t1"] * FPS) + 1)):
            seg = y[f * hop:(f + 1) * hop]; e[f] = round(float(np.sqrt(np.mean(seg ** 2)) * 4) if len(seg) else 0, 3)
    with wave.open(os.path.join(OUT, sid + ".wav"), "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((y * 32767).astype(np.int16).tobytes())
    json.dump({"id": sid, "title": show["title"], "dur": round(dur, 3), "fps": FPS, "lines": lines, "cues": cues, "env": envs}, open(os.path.join(OUT, sid + ".json"), "w"))
    print(sid, round(dur, 1), "s,", len(lines), "lines")

src = json.load(open(SRC))
for s in src["shows"]: build(s, src["cast"])
