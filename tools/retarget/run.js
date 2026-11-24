#!/usr/bin/env node
/* node tools/retarget/run.js <source.glb> <target.glb> <clip,clip,...> <out.json>
   Paths are relative to the repo root (served as /). Needs Playwright. */
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..", ".."), [src, tgt, clips, out] = process.argv.slice(2);
const T = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(0, async () => {
  const b = await chromium.launch(), p = await b.newPage();
  p.on("pageerror", (e) => console.error(e.message));
  await p.goto(`http://localhost:${srv.address().port}/tools/retarget/index.html?src=/${src}&tgt=/${tgt}&clips=${clips}`);
  const res = await p.waitForFunction(() => window.result, null, { timeout: 60000 }).then((h) => h.jsonValue());
  fs.writeFileSync(path.join(ROOT, out), res);
  console.log("wrote", out, (res.length / 1024 | 0) + " KB");
  await b.close(); srv.close();
});
