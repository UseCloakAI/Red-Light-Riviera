#!/usr/bin/env node
/* Render the loading-screen layers: node tools/loading/render.js [slide ...]
   Writes PNGs to tools/loading/out/, then tools/loading/pack.py turns them into
   lowtide/media/loading/<slide>-bg.jpg and <slide>-fg.webp. Needs Playwright. */
const http = require("http"), fs = require("fs"), path = require("path"), { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..", ".."), OUT = path.join(__dirname, "out"), only = process.argv.slice(2);
const T = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".bin": "application/octet-stream", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" };
fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(0, async () => {
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on("pageerror", (e) => console.error("page:", e.message)); p.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
  await p.goto(`http://localhost:${srv.address().port}/tools/loading/render.html`);
  await p.waitForFunction(() => window.ready, null, { timeout: 300000 });
  const ids = await p.evaluate(() => window.slides);
  for (let i = 0; i < ids.length; i++) {
    if (only.length && !only.includes(ids[i])) continue;
    for (const layer of ["bg", "fg"]) {
      const url = await p.evaluate(([i, l]) => window.shot(i, l), [i, layer]);
      fs.writeFileSync(path.join(OUT, `${ids[i]}-${layer}.png`), Buffer.from(url.split(",")[1], "base64"));
      console.log("wrote", ids[i], layer);
    }
  }
  await b.close(); srv.close();
});
