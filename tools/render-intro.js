#!/usr/bin/env node
/* Renders Lowtide's intro film, the title ocean loop and the baked audio.

     npm i playwright        (and have ffmpeg on PATH)
     node tools/render-intro.js [--only=land|port] [--fps=30] [--workers=4]

   Picture: the page runs on a virtual clock (?render=intro|ocean) and is
   stepped one frame at a time, so output is frame-exact on any machine,
   however slow. Sound: the same WebAudio engine runs on an
   OfflineAudioContext. Everything lands in lowtide/media/. */
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..", "lowtide"), OUT = path.join(ROOT, "media");
const arg = (k, d) => (process.argv.find(a => a.startsWith("--" + k + "=")) || "").split("=")[1] || d;
const FPS = +arg("fps", 30), WORKERS = +arg("workers", 4), ONLY = arg("only", "");
const VARIANTS = { land: { w: 1920, h: 1080, crf: 21 }, port: { w: 720, h: 1280, crf: 22 } };
const LOOP = 10, XFADE = 2;   // ocean: render 12 s, crossfade the last 2 s over the first 2 s

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html"));
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
    }).listen(0, () => res(srv));
  });
}
const ff = args => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

async function frames(browser, base, kind, v, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const probe = await browser.newPage({ viewport: { width: v.w, height: v.h } });
  await probe.goto(`${base}/?render=${kind}`);
  const { seconds } = await probe.evaluate(() => window.__render.ready);
  await probe.close();
  const total = Math.round(seconds * FPS), per = Math.ceil(total / WORKERS), t0 = Date.now();
  let done = 0;
  await Promise.all([...Array(WORKERS)].map(async (_, w) => {
    const from = w * per, to = Math.min(total, from + per);
    if (from >= to) return;
    const p = await browser.newPage({ viewport: { width: v.w, height: v.h } });
    await p.goto(`${base}/?render=${kind}`);
    await p.evaluate(() => window.__render.ready);
    for (let i = from; i < to; i++) {
      await p.evaluate(t => window.__render.frame(t), i / FPS);
      await p.screenshot({ path: path.join(dir, String(i).padStart(5, "0") + ".png") });
      if (++done % 30 === 0) process.stdout.write(`\r  ${kind} ${v.w}x${v.h}: ${done}/${total} frames (${((Date.now() - t0) / done).toFixed(0)} ms/frame)   `);
    }
    await p.close();
  }));
  console.log(`\r  ${kind} ${v.w}x${v.h}: ${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s                `);
  return total;
}

async function bakeAudio(browser, base) {
  const p = await browser.newPage();
  const pcm = async (what) => {
    await p.goto(`${base}/brand/`);
    return p.evaluate(async (what) => {
      const SR = 48000, C = window.LT_CUE, bars8 = 8 * C.bar;
      const dur = what === "intro" ? C.hit + 2.6 : bars8 + 4;
      const off = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
      LT.init(off);
      if (what === "intro") LT.cue.intro(0, true); else { LT.music.start(0, "drop"); LT.amb.start(0); }
      LT._pump(dur);
      const b = await off.startRendering(), L = b.getChannelData(0), R = b.getChannelData(1);
      if (what === "intro") {
        // fade out over the 2.6 s after the drop while the title loop fades its ocean in
        const h = Math.round(C.hit * SR);
        for (let i = h; i < L.length; i++) { const g = 1 - (i - h) / (L.length - h); L[i] *= g; R[i] *= g; }
      } else {
        // seamless loop: fold the tail (reverb, ocean) back over the start with a fade
        const n = Math.round(bars8 * SR), tail = Math.round(2.6 * SR);
        for (let i = 0; i < tail; i++) { const g = 1 - i / tail; L[i] += L[n + i] * g; R[i] += R[n + i] * g; }
        return encode(L.subarray(0, n), R.subarray(0, n), SR);
      }
      return encode(L, R, SR);
      function encode(L, R, SR) {
        const n = L.length, ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab), w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        w(0, "RIFF"); dv.setUint32(4, 36 + n * 4, true); w(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
        dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, n * 4, true);
        for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
        let s = ""; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        return btoa(s);
      }
    }, what);
  };
  for (const what of ["intro", "loop"]) {
    const wav = path.join(os.tmpdir(), `lt-${what}.wav`);
    fs.writeFileSync(wav, Buffer.from(await pcm(what), "base64"));
    ff(["-i", wav, "-c:a", "flac", "-compression_level", "8", path.join(OUT, `${what}.flac`)]);
    console.log(`  audio: ${what}.flac`);
  }
  await p.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://localhost:${srv.address().port}`;
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"] });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lt-frames-"));
  try {
    await bakeAudio(browser, base);
    for (const [name, v] of Object.entries(VARIANTS)) {
      if (ONLY && ONLY !== name) continue;
      const x264 = ["-c:v", "libx264", "-preset", "slow", "-crf", String(v.crf), "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-an"];
      // the film: slate, match cut and the ocean up to the drop
      const di = path.join(tmp, name + "-intro");
      await frames(browser, base, "intro", v, di);
      ff(["-framerate", String(FPS), "-i", path.join(di, "%05d.png"), ...x264, path.join(OUT, `intro-${name}.mp4`)]);
      // the title background: 12 s rendered, folded into a seamless 10 s loop
      const doc = path.join(tmp, name + "-ocean");
      await frames(browser, base, "ocean", v, doc);
      ff(["-framerate", String(FPS), "-i", path.join(doc, "%05d.png"), "-filter_complex",
        `[0]split[a][b];[a]trim=0:${XFADE},setpts=PTS-STARTPTS[head];[b]trim=${LOOP}:${LOOP + XFADE},setpts=PTS-STARTPTS[tail];` +
        `[head][tail]blend=all_expr='A*(T/${XFADE})+B*(1-T/${XFADE})'[mix];` +
        `[0]trim=${XFADE}:${LOOP},setpts=PTS-STARTPTS[body];[mix][body]concat=n=2:v=1[out]`,
        "-map", "[out]", ...x264, path.join(OUT, `ocean-${name}.mp4`)]);
      console.log(`  video: intro-${name}.mp4, ocean-${name}.mp4`);
    }
  } finally {
    await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  }
  for (const f of fs.readdirSync(OUT)) console.log(`  ${f}  ${(fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
