// Lowtide TV, step 3: drive render.html frame by frame, then mux with the soundtrack into media/tv/<show>.mp4.
// Needs a static server on lowtide/ (python3 -m http.server 8799). Usage: node render.mjs [show ...] [--w 480 --h 360] [--every N]
import { createRequire } from "module"; const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "fs"; import path from "path"; import { execFileSync } from "child_process"; import { fileURLToPath } from "url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf("--" + k); return i >= 0 ? A[i + 1] : d; };
const shows = A.filter((a, i) => !a.startsWith("--") && !(i > 0 && A[i - 1].startsWith("--")));
const WIDE = { movie: true };
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const id of shows.length ? shows : ["news", "cola", "spin", "lawyer", "gull", "movie"]) {
  const w = +opt("w", WIDE[id] ? 576 : 480), h = +opt("h", WIDE[id] ? 240 : 360);
  const p = await b.newPage({ viewport: { width: w, height: h } }); p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto(`http://localhost:8799/tools/tv/render.html?w=${w}&h=${h}`); await p.waitForFunction(() => window.TV_READY);
  const n = await p.evaluate((id) => TV.load(id), id), dir = path.join(HERE, "build", "frames", id);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const url = await p.evaluate((i) => TV.frame(i), i);
    fs.writeFileSync(path.join(dir, String(i).padStart(5, "0") + ".jpg"), Buffer.from(url.split(",")[1], "base64"));
    if (i % 150 === 0) console.log(id, i, "/", n, ((Date.now() - t0) / 1000).toFixed(0) + "s");
  }
  await p.close();
  const out = path.join(HERE, "..", "..", "media", "tv", id + ".mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "15", "-i", path.join(dir, "%05d.jpg"), "-i", path.join(HERE, "build", id + ".wav"),
    "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "slow", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-shortest", "-movflags", "+faststart", out]);
  console.log(id, "done", (fs.statSync(out).size / 1024 | 0) + " KB");
}
await b.close();
