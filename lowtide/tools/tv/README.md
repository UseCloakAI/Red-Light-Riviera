# Lowtide TV

The shows on every TV in the game: real 3D scenes with the game's own people (`game/human.js`), rendered here, not in the game, and played back as video. Only the on-screen graphics (tickers, lower thirds, logos, the maps and screens inside the sets) are flat.

| Step | File | What it does |
|---|---|---|
| Script | `media/tv/shows.src.json` | Cast (voices, looks) and each show's lines. `{word}` is bleeped on time, `[word]` is bleeped late. Cues: `cut:<camera>`, `cue:<event>`. |
| 1. Sound | `audio.py` | Voices every line with eSpeak NG, adds the bleeps, jingles, applause, kids and wheel. Writes `build/<show>.wav` and `build/<show>.json`, which holds line timings and each speaker's loudness per frame (that loudness drives the acting). |
| 2. Pictures | `render.html` + `render.js` | One 3D set per show. Builds it, poses and animates the cast from their voices, cuts cameras on cues, draws the graphics. |
| 3. Encode | `render.mjs` | Drives the page frame by frame in headless Chromium, then muxes with the sound into `media/tv/<show>.mp4` (H.264 and AAC). |
| 4. Index | `index.py` | Writes `media/tv/shows.json`: the lengths and lines the game uses for channels and subtitles. |

```bash
python3 audio.py
```

```bash
(cd ../.. && python3 -m http.server 8799) &
```

```bash
node render.mjs news spin
```

```bash
python3 index.py
```

Needs `espeak-ng`, `ffmpeg`, numpy and Playwright. Rendering runs at about 1 frame a second on the software renderer, so run a few shows in parallel. `build/` is scratch and isn't committed.

In the game (`game/interiors.js`, "television"), five channels each loop their shows on one clock, so every set on a channel shows the same moment and flipping over drops you mid-show. Sit on any seat facing a set to watch: A/D or the wheel changes channel, 1–5 picks one, E gets up. Cast bios are in `story/STORY.md`, "On the screen".
