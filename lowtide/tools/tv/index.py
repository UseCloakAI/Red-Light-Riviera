"""Lowtide TV, step 4: the game's index of the shows: media/tv/shows.json (each show's length and
its lines, who says them and when, for subtitles). Run after audio.py."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); MEDIA = os.path.join(HERE, "..", "..", "media", "tv")
src = json.load(open(os.path.join(MEDIA, "shows.src.json"))); out = {"shows": {}}
for s in src["shows"]:
    b = json.load(open(os.path.join(HERE, "build", s["id"] + ".json")))
    out["shows"][s["id"]] = {"title": s["title"], "dur": b["dur"], "lines": [[round(l["t0"], 2), round(l["t1"], 2), src["cast"][l["who"]]["name"].split(" as ")[-1].split(" (")[0], l["text"]] for l in b["lines"]]}
json.dump(out, open(os.path.join(MEDIA, "shows.json"), "w"), separators=(",", ":"))
print("shows.json", os.path.getsize(os.path.join(MEDIA, "shows.json")), "bytes")
