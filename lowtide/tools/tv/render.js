/* Lowtide TV, step 2: the pictures. Each show is a small 3D set with the game's own people in it
   (game/human.js), lit like television, cut between cameras on the script's cues; whoever is talking
   moves with their own voice (build/<show>.json carries the loudness per frame). Only the on-screen
   graphics are flat: tickers, lower thirds, logos, the maps and screens inside the sets.
   Driven frame by frame from render.mjs: TV.load(id) then TV.frame(i) -> a JPEG data URL. */
import * as THREE from "three";
import { loadHumanData, Human, HOLLIS } from "../../game/human.js";

const Q = new URLSearchParams(location.search), W = +(Q.get("w") || 480), H = +(Q.get("h") || 360);
const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
gl.setPixelRatio(1); gl.setSize(W, H); gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap;
gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0; gl.outputColorSpace = THREE.SRGBColorSpace;
const out = document.createElement("canvas"); out.width = W; out.height = H; document.body.appendChild(out); const g2 = out.getContext("2d");
const V = (x, y, z) => new THREE.Vector3(x, y, z), C = (h) => new THREE.Color(h);
const std = (o) => new THREE.MeshStandardMaterial(o), basic = (o) => new THREE.MeshBasicMaterial(o);
const box = (w, h, d, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = o.receiveShadow = true; return o; };
const smooth = (a) => a * a * (3 - 2 * a), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const noise = (t, s) => Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 2.9 + s * 2.1) * 0.3 + Math.sin(t * 4.3 + s * 3.7) * 0.2;

// a canvas texture: draw(ctx, w, h, t) can be called again to animate it
function canvasTex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.redraw = (tm) => { draw(x, w, h, tm); t.needsUpdate = true; }; t.redraw(0); return t; }
function font(px, w = 800, fam = "Arial, Helvetica, sans-serif") { return `${w} ${px}px ${fam}`; }

let D = null;
/* ---------------- people ---------------- */
function person(look, seed) {
  const p = JSON.parse(JSON.stringify(HOLLIS)); Object.assign(p, look); p.detail = {}; let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const l of D.meta.local) p.detail[l.key] = (r() - 0.5) * 0.6;
  const h = new Human(D, p);
  h.group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(h.group), act = {};
  for (const c of h.clips) { act[c.name] = mixer.clipAction(c); act[c.name].play(); act[c.name].setEffectiveWeight(0); }
  act.idle.setEffectiveWeight(1);
  const B = Object.fromEntries(h.bones.map((b) => [b.name, b]));
  return { h, mixer, act, B, g: h.group, seed: seed % 97, talk: 0, look: null, gest: 0 };
}
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _pi = new THREE.Quaternion(), _a = new THREE.Vector3();
// turn a bone by ang about an axis given in the character's own frame (x right, y up, z forward)
function turn(P, name, ax, ang) {
  const b = P.B[name]; if (!b || !ang) return;
  P.g.updateMatrixWorld(true); _a.copy(ax).applyQuaternion(P.g.quaternion).normalize();
  b.parent.getWorldQuaternion(_p); _pi.copy(_p).invert(); _q.setFromAxisAngle(_a, ang);
  b.quaternion.premultiply(_p).premultiply(_q).premultiply(_pi); b.updateMatrixWorld(true);
}
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
/* each frame: the idle, then the body acting on its voice. lvl: loudness 0..1 this frame */
function animate(P, t, lvl, o = {}) {
  P.mixer.setTime(t + P.seed);
  P.talk += (lvl - P.talk) * 0.35; const k = clamp(P.talk * 1.6, 0, 1), s = P.seed;
  // the head: nods on the stresses, looks where it's told
  turn(P, "neck01", X, k * 0.06 * noise(t * 2.2, s));
  if (o.lookYaw) turn(P, "neck01", Y, o.lookYaw);
  turn(P, "head", X, k * (0.1 * noise(t * 3.4, s + 1)) + (o.pitch || 0)); turn(P, "head", Z, k * 0.05 * noise(t * 2.1, s + 2) + 0.03 * noise(t * 0.4, s));
  turn(P, "spine01", Y, 0.05 * noise(t * 0.35, s + 4) + k * 0.05 * noise(t * 1.3, s + 5));
  // hands: talking hands, a beat behind the voice
  P.gest += (k - P.gest) * 0.12; const gk = P.gest * (o.hands ?? 1);
  if (o.armsDesk) {   // forearms resting on a desk
    for (const sd of ["L", "R"]) { const m = sd === "L" ? 1 : -1; turn(P, "upperarm01_" + sd, X, -0.55); turn(P, "upperarm01_" + sd, Z, m * 0.12); turn(P, "lowerarm01_" + sd, X, -1.05 - gk * 0.25 * (1 + noise(t * 3, s + (m > 0 ? 6 : 9)))); }
  } else {
    turn(P, "upperarm01_R", X, -gk * (0.5 + 0.25 * noise(t * 2.6, s + 6))); turn(P, "upperarm01_R", Z, -gk * 0.25);
    turn(P, "lowerarm01_R", X, -gk * (0.9 + 0.35 * noise(t * 3.3, s + 7)));
    turn(P, "upperarm01_L", X, -gk * 0.35 * (0.6 + 0.4 * noise(t * 2.2, s + 8))); turn(P, "upperarm01_L", Z, gk * 0.15);
    turn(P, "lowerarm01_L", X, -gk * (0.6 + 0.3 * noise(t * 2.8, s + 9)));
  }
  if (o.raiseR) { turn(P, "upperarm01_R", X, -1.1 * o.raiseR); turn(P, "lowerarm01_R", X, -1.6 * o.raiseR); turn(P, "upperarm01_R", Z, 0.25 * o.raiseR); }
}

/* ---------------- lights, sets ---------------- */
function lights(scene, o = {}) {
  scene.add(new THREE.HemisphereLight(o.sky || 0xbfd4ff, o.ground || 0x302830, o.hemi ?? 0.55));
  const key = new THREE.SpotLight(o.key || 0xfff1e0, o.keyI ?? 60, 30, 0.6, 0.6, 1.4); key.position.set(-3, 5, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(o.fill || 0xcfe0ff, o.fillI ?? 0.6); fill.position.set(4, 2.5, 4); scene.add(fill);
  const rim = new THREE.DirectionalLight(o.rim || 0xffd0a0, o.rimI ?? 1.6); rim.position.set(1, 4, -5); scene.add(rim);
  return { key, fill, rim };
}
const SETS = {};

/* WMK 6 news: a curved desk, a wall of screens, the weather wall */
SETS.news = (S) => {
  const scene = S.scene; scene.background = C("#0a1226"); lights(scene, { keyI: 70 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2), std({ color: 0x1a2440, roughness: 0.25, metalness: 0.3 })); floor.receiveShadow = true; scene.add(floor);
  const wallT = canvasTex(512, 256, (x, w, h, t) => {   // the back wall: a night skyline behind glass, blinking windows
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#081430"); gr.addColorStop(1, "#24305a"); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) { const bw = 10 + r() * 26, bh = 40 + r() * 150, bx = r() * w; x.fillStyle = "#0b1328"; x.fillRect(bx, h - bh, bw, bh); for (let y = h - bh + 6; y < h - 4; y += 9) for (let wx = bx + 3; wx < bx + bw - 3; wx += 6) if (r() < 0.35 + 0.1 * Math.sin(t + wx)) { x.fillStyle = r() < 0.7 ? "#ffd98a" : "#9fd0ff"; x.fillRect(wx, y, 3, 4); } }
    x.fillStyle = "rgba(255,255,255,.05)"; for (let k = 0; k < w; k += 64) x.fillRect(k, 0, 2, h);
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 6, 48, 1, true, Math.PI * 0.7, Math.PI * 0.6), basic({ map: wallT, side: THREE.BackSide })); wall.position.set(0, 3, 3); scene.add(wall);
  const desk = new THREE.Group(); const dm = std({ color: 0x223a7a, roughness: 0.35, metalness: 0.2 }), top = std({ color: 0xdfe6f2, roughness: 0.2, metalness: 0.1 });
  for (let k = -3; k <= 3; k++) { const a = k * 0.14, seg = box(0.95, 0.95, 0.7, dm); seg.position.set(Math.sin(a) * 6.5, 0.475, 6.5 - Math.cos(a) * 6.5 - 0.0); seg.rotation.y = a; desk.add(seg); const tp = box(1.0, 0.06, 0.9, top); tp.position.copy(seg.position).setY(0.98); tp.rotation.y = a; desk.add(tp); }
  const logoT = canvasTex(256, 64, (x, w, h) => { x.fillStyle = "#0e1a3a"; x.fillRect(0, 0, w, h); x.fillStyle = "#e23b3b"; x.fillRect(0, 0, 84, h); x.fillStyle = "#fff"; x.font = font(36); x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("WMK", 42, h / 2 + 2); x.fillText("6", 120, h / 2 + 2); x.font = font(14, 700); x.fillText("NEWS AT ELEVEN", 196, h / 2 + 2); });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), basic({ map: logoT })); logo.position.set(0, 0.55, -0.36); desk.add(logo);
  desk.position.set(0, 0, 0); scene.add(desk);
  // the over-the-shoulder box: a screen beside the anchor
  S.story = canvasTex(320, 200, (x, w, h, t) => storyArt(x, w, h, t, S.storyN || 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), basic({ map: S.story })); scr.position.set(1.25, 1.65, 0.3); scene.add(scr);
  const scrF = box(1.7, 1.1, 0.04, std({ color: 0x101420, roughness: 0.4 })); scrF.position.set(1.25, 1.65, 0.27); scene.add(scrF);
  // the weather wall, off to the side
  S.map = canvasTex(512, 320, (x, w, h, t) => weatherMap(x, w, h, t));
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), basic({ map: S.map })); wm.position.set(-4.6, 1.65, 1.2); wm.rotation.y = 0.55; scene.add(wm);
  S.dale = person(S.cast.dale.look, 101); S.dale.g.position.set(0, 0, -0.75); scene.add(S.dale.g);
  S.bunny = person(S.cast.bunny.look, 202); S.bunny.g.position.set(-3.6, 0, 1.9); S.bunny.g.rotation.y = 0.45; scene.add(S.bunny.g);
  S.cams = {
    dale: { p: V(0, 1.62, 2.4), at: V(0, 1.5, -0.7), fov: 30 },
    story1: { p: V(-0.5, 1.55, 3.3), at: V(0.55, 1.5, -0.4), fov: 34 }, story2: { p: V(-0.5, 1.55, 3.3), at: V(0.55, 1.5, -0.4), fov: 34 }, story3: { p: V(-0.5, 1.55, 3.3), at: V(0.55, 1.5, -0.4), fov: 34 },
    two: { p: V(1.6, 1.9, 6.4), at: V(-1.6, 1.3, 0.2), fov: 44 },
    weather: { p: V(-1.6, 1.6, 4.6), at: V(-3.9, 1.45, 1.5), fov: 38 }
  };
  S.shot = "dale";
  S.tick = (t, f, env) => {
    const sn = { story1: 0, story2: 1, story3: 2 }[S.shot]; if (sn !== undefined && sn !== S.storyN) { S.storyN = sn; } S.story.redraw(t); S.map.redraw(t); if (f % 4 === 0) wallT.redraw(t * 0.3);
    animate(S.dale, t, env("dale"), { hands: 0.9, lookYaw: S.shot === "two" || S.shot === "weather" ? -0.5 : 0 });
    animate(S.bunny, t, env("bunny"), { lookYaw: S.shot === "weather" ? 0.3 : 0.5, hands: 1.3 });
  };
  S.overlay = (x, t, line) => {
    x.fillStyle = "rgba(10,18,40,.9)"; x.fillRect(0, H - 52, W, 52);
    x.fillStyle = "#e23b3b"; x.fillRect(0, H - 52, 76, 30); x.fillStyle = "#fff"; x.font = font(20); x.textBaseline = "middle"; x.fillText("WMK 6", 6, H - 37);
    const L = line && line.who === "bunny" ? ["BUNNY MARSH", "FIRST ALERT WEATHER"] : ["DALE VANCE", ["", "TIDE WARNING: STAY OFF THE SAND", "PORT SALT STRIKE: DAY 3", "MAN, METER: \"CONSENSUAL\""][S.storyN + 1 || 0] || "WMK 6 NEWS AT ELEVEN"];
    x.fillStyle = "#fff"; x.font = font(16); x.fillText(L[0], 84, H - 44); x.font = font(11, 600); x.fillStyle = "#c8d4f0"; x.fillText(L[1] || "NEWS AT ELEVEN", 84, H - 29);
    x.fillStyle = "#f0c83c"; x.fillRect(0, H - 20, W, 20); const tk = "  TIDE WARNING FOR TIDELINE BEACH  •  PORT SALT STRIKE ENTERS DAY 3  •  CAUSEWAY BACKED UP: SOMEBODY IS FISHING IN THE LEFT LANE  •  FOUNTAIN STILL NOT RUNNING  •  NITE OWL PIE VOTED BEST ON THE KEYS  •";
    x.font = font(12, 700); x.fillStyle = "#111"; const tw = x.measureText(tk).width, ox = -((t * 60) % tw); x.fillText(tk, ox, H - 10); x.fillText(tk, ox + tw, H - 10);
    x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(W - 92, 10, 82, 22); x.fillStyle = (t * 2 | 0) % 2 ? "#ff4444" : "#aa2222"; x.beginPath(); x.arc(W - 80, 21, 5, 0, 7); x.fill(); x.fillStyle = "#fff"; x.font = font(12); x.fillText("LIVE", W - 70, 21);
  };
};
function storyArt(x, w, h, t, n) {
  if (n === 0) { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#f9a35a"); gr.addColorStop(1, "#d86a6a"); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = "#e8d3a0"; x.fillRect(0, h * 0.68, w, h); x.fillStyle = "#2b7f9a"; x.beginPath(); x.moveTo(0, h * 0.55); for (let k = 0; k <= w; k += 8) x.lineTo(k, h * 0.55 + Math.sin(k * 0.05 + t * 3) * 8 + (k < w * 0.6 ? Math.sin(t) * 20 : 0)); x.lineTo(w, h); x.lineTo(0, h); x.fill(); x.fillStyle = "#fff"; x.font = font(26); x.fillText("TIDE WARNING", 14, 34); }
  else if (n === 1) { x.fillStyle = "#7a8aa8"; x.fillRect(0, 0, w, h); for (const cx of [70, 210]) { x.strokeStyle = "#e0802a"; x.lineWidth = 8; x.beginPath(); x.moveTo(cx, h); x.lineTo(cx, 50); x.lineTo(cx + 90, 50); x.stroke(); } x.fillStyle = "#f4f0e6"; const b = Math.sin(t * 5) * 4; x.fillRect(120, 90 + b, 80, 50); x.fillStyle = "#b02020"; x.font = font(22); x.fillText("FAIR", 132, 124 + b); x.fillStyle = "#fff"; x.font = font(24); x.fillText("STRIKE: DAY 3", 14, 30); }
  else { x.fillStyle = "#2b2f3a"; x.fillRect(0, 0, w, h); x.fillStyle = "#9aa0a8"; x.fillRect(150, 70, 22, 130); x.fillStyle = "#c8ccd2"; x.fillRect(132, 40, 58, 50); x.fillStyle = "#3a8a3a"; x.fillRect(146, 54, 30, 14); x.fillStyle = "#fff"; x.font = font(22); x.fillText("\"IT WAS CONSENSUAL\"", 14, 30); x.fillStyle = "#e23b3b"; x.font = font(16); x.fillText("ASHBY BLVD", 200, 180); }
}
function weatherMap(x, w, h, t) {
  x.fillStyle = "#1d5fa8"; x.fillRect(0, 0, w, h);
  x.fillStyle = "#6aa85a"; x.strokeStyle = "#e8e2c8"; x.lineWidth = 3; x.beginPath(); [[90, 90], [190, 50], [330, 60], [410, 110], [400, 220], [300, 270], [150, 260], [70, 190]].forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); x.stroke();
  const sx = -120 + ((t * 18) % 700); for (let i = 0; i < 260; i++) { const a = i * 2.4, r = 30 + (i % 50) * 2.2; x.fillStyle = i % 3 ? "rgba(60,220,110,.55)" : "rgba(250,220,60,.6)"; x.fillRect(sx + Math.cos(a) * r, 150 + Math.sin(a) * r * 0.6, 6, 6); }
  x.fillStyle = "#fff"; x.font = font(22); for (const [a, b, s] of [[150, 140, "78"], [300, 110, "81"], [280, 230, "84"]]) { x.fillRect(a - 22, b - 16, 44, 30); x.fillStyle = "#123"; x.fillText(s, a - 13, b + 7); x.fillStyle = "#fff"; }
  x.font = font(26); x.fillText("FIRST ALERT: ROUGH NIGHT", 20, 34);
}

/* Tide Cola: a red cyc, a turning giant bottle, Chet */
SETS.cola = (S) => {
  const scene = S.scene; scene.background = C("#b81d2a"); lights(scene, { keyI: 80, hemi: 0.8, sky: 0xffd0d0 });
  const cyc = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 12, 48, 1, true), std({ color: 0xc8202e, roughness: 0.6, side: THREE.BackSide })); cyc.position.y = 5; scene.add(cyc);
  const fl = new THREE.Mesh(new THREE.CircleGeometry(10, 48).rotateX(-Math.PI / 2), std({ color: 0xd0303c, roughness: 0.4 })); fl.receiveShadow = true; scene.add(fl);
  const prof = [[0, 0], [0.42, 0], [0.46, 0.1], [0.46, 1.1], [0.36, 1.5], [0.17, 1.85], [0.15, 2.3], [0.17, 2.35], [0, 2.35]].map(([a, b]) => new THREE.Vector2(a, b));
  const label = canvasTex(512, 128, (x, w, h) => { x.fillStyle = "#3a120a"; x.fillRect(0, 0, w, h); x.fillStyle = "#f4f0e6"; x.fillRect(0, 30, w, 70); x.fillStyle = "#c8202e"; x.font = font(54, 900); x.textBaseline = "middle"; for (let k = 0; k < 2; k++) x.fillText("TIDE COLA", 20 + k * 256, 66); });
  const glass = std({ color: 0x4a1a0c, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.92 });
  const bottle = new THREE.Group(); const bm = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), glass); bm.castShadow = true; bottle.add(bm);
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.465, 0.465, 0.5, 32, 1, true), std({ map: label, roughness: 0.5 })); lb.position.y = 0.75; bottle.add(lb);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 20), std({ color: 0xdddddd, metalness: 0.8, roughness: 0.3 })); cap.position.y = 2.37; bottle.add(cap);
  bottle.position.set(1.5, 0.4, 0); scene.add(bottle);
  const plinth = box(1.4, 0.4, 1.4, std({ color: 0xf4f0e6, roughness: 0.4 })); plinth.position.set(1.5, 0.2, 0); scene.add(plinth);
  // a small bottle in Chet's hand
  const small = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), glass); small.scale.setScalar(0.11);
  S.chet = person(S.cast.chet.look, 303); S.chet.g.position.set(-0.6, 0, 0.4); S.chet.g.rotation.y = 0.15; scene.add(S.chet.g);
  const hand = S.chet.B["wrist_R"]; if (hand) { hand.add(small); small.position.set(0, 0.06, 0.03); small.rotation.x = Math.PI; }
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), std({ color: 0xffffff, transparent: true, opacity: 0.6 }), 80); scene.add(bubbles); const m4 = new THREE.Matrix4();
  S.cams = { a: { p: V(0, 1.55, 3.6), at: V(0.3, 1.25, 0), fov: 40 } }; S.shot = "a";
  S.tick = (t, f, env, cue) => {
    bottle.rotation.y = t * 0.6;
    let sip = 0; if (cue.sip !== undefined) { const u = (t - cue.sip) / 3; if (u > 0 && u < 1) sip = Math.sin(u * Math.PI); }
    animate(S.chet, t, env("chet"), { raiseR: sip, hands: 0.8, lookYaw: -0.1 });
    for (let i = 0; i < 80; i++) { const y = ((i * 0.37 + t * (0.4 + (i % 7) * 0.08)) % 3); m4.makeTranslation(1.5 + Math.sin(i * 7.1 + t) * 0.8, 0.4 + y, Math.cos(i * 3.3) * 0.8 - 0.2); bubbles.setMatrixAt(i, m4); } bubbles.instanceMatrix.needsUpdate = true;
    const c = S.cams.a; c.p.set(Math.sin(t * 0.15) * 0.4, 1.55, 3.6 - Math.min(0.6, t * 0.02));
  };
  S.overlay = (x, t, line, dur) => {
    if (line && line.who === "announcer") { x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(0, H - 70, W, 70); x.fillStyle = "#fff"; x.font = font(9, 500); const s = "Tide Cola may cause jitters, rashes, regret and in rare cases a second set of teeth. Not for sale in three states or to anyone on parole. Tide Cola is a product of Tidewater Bottling, a subsidiary of a subsidiary."; let y = H - 58; let ln = ""; for (const wd of s.split(" ")) { if (x.measureText(ln + wd).width > W - 20) { x.fillText(ln, 10, y); y += 12; ln = ""; } ln += wd + " "; } x.fillText(ln, 10, y); }
    if (t > dur - 4) { const a = clamp((t - (dur - 4)) / 0.4, 0, 1); x.fillStyle = `rgba(184,29,42,${a})`; x.fillRect(0, 0, W, H); x.globalAlpha = a; x.fillStyle = "#fff"; x.font = font(64, 900); x.textAlign = "center"; x.fillText("TIDE COLA", W / 2, H / 2 - 10); x.font = font(22, 700); x.fillStyle = "#ffe080"; x.fillText("TASTE THE TIDE.  35¢", W / 2, H / 2 + 30); x.textAlign = "left"; x.globalAlpha = 1; }
  };
};

/* Spin City: a stage, a wheel of light bulbs, Rex and his contestant */
SETS.spin = (S) => {
  const scene = S.scene; scene.background = C("#1a0628"); lights(scene, { keyI: 70, hemi: 0.4, sky: 0xd0a0ff, rim: 0xff60c0, rimI: 2.4 });
  const fl = new THREE.Mesh(new THREE.CircleGeometry(12, 64).rotateX(-Math.PI / 2), std({ color: 0x2a0a40, roughness: 0.15, metalness: 0.5 })); fl.receiveShadow = true; scene.add(fl);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.05, 8, 64), basic({ color: 0xffd040 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
  const vals = ["$50", "$200", "BUST", "$100", "$500", "$25", "JET SKI", "$75"], cols = ["#e63c3c", "#f0c83c", "#141414", "#3ca0e6", "#c84cc8", "#46c86e", "#ff8c28", "#f4f0e6"];
  const face = canvasTex(512, 512, (x, w, h) => { const n = vals.length; for (let k = 0; k < n; k++) { x.fillStyle = cols[k]; x.beginPath(); x.moveTo(256, 256); x.arc(256, 256, 256, k / n * Math.PI * 2, (k + 1) / n * Math.PI * 2); x.fill(); const am = (k + 0.5) / n * Math.PI * 2, flip = am < Math.PI / 2 || am > Math.PI * 1.5; x.save(); x.translate(256, 256); x.rotate(am); if (flip) { x.translate(236, 0); x.rotate(Math.PI); x.translate(-236, 0); } x.fillStyle = k === 2 ? "#ff3030" : k === 7 ? "#222" : "#fff"; x.font = font(40, 900); x.textAlign = flip ? "left" : "right"; x.textBaseline = "middle"; x.fillText(vals[k], flip ? 236 - 0 : 236, 0); x.restore(); } x.fillStyle = "#ffd040"; x.beginPath(); x.arc(256, 256, 40, 0, 7); x.fill(); });
  const wheel = new THREE.Group(); const wf = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), std({ map: face, roughness: 0.4, emissive: 0x222222, emissiveMap: face })); wheel.add(wf);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.08, 8, 64), std({ color: 0xffd040, metalness: 0.8, roughness: 0.3 })); wheel.add(rim2);
  const bulbs = []; for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), basic({ color: 0xffe080 })); b.position.set(Math.cos(a) * 1.78, Math.sin(a) * 1.78, 0.03); wheel.add(b); bulbs.push(b); }
  wheel.position.set(0, 2.3, -1.5); scene.add(wheel); const spinner = wf;
  const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 3), std({ color: 0xffffff })); ptr.rotation.z = Math.PI; ptr.position.set(0, 4.05, -1.45); scene.add(ptr);
  const post = box(0.3, 2.3, 0.3, std({ color: 0x8a6ad0, metalness: 0.5, roughness: 0.3 })); post.position.set(0, 1.15, -1.6); scene.add(post);
  const pod = box(1.0, 0.9, 0.6, std({ color: 0x3ca0e6, roughness: 0.3 })); pod.position.set(1.7, 0.45, 0.75); scene.add(pod);
  const podT = canvasTex(256, 96, (x, w, h, t) => { x.fillStyle = "#0a2a4a"; x.fillRect(0, 0, w, h); x.fillStyle = "#ffd040"; x.font = font(48, 900); x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(S.score || "$300", w / 2, h / 2); });
  const podS = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), basic({ map: podT })); podS.position.set(1.7, 0.62, 1.06); scene.add(podS);
  const lightsArc = []; for (let k = 0; k < 24; k++) { const a = Math.PI * (0.1 + 0.8 * k / 23), b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), basic({ color: 0xffd040 })); b.position.set(Math.cos(a) * 6, 0.5 + Math.sin(a) * 5, -4); scene.add(b); lightsArc.push(b); }
  S.rex = person(S.cast.rex.look, 404); S.rex.g.position.set(-1.4, 0, 0.6); S.rex.g.rotation.y = 0.35; scene.add(S.rex.g);
  S.dar = person(S.cast.darlene.look, 505); S.dar.g.position.set(1.7, 0, 0.15); S.dar.g.rotation.y = -0.5; scene.add(S.dar.g);
  const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.22, 8), std({ color: 0x222222, metalness: 0.6 })); const micH = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std({ color: 0x777777, metalness: 0.8, roughness: 0.4 })); micH.position.y = 0.12; mic.add(micH);
  const hw = S.rex.B["wrist_R"]; if (hw) { hw.add(mic); mic.position.set(0, 0.08, 0.02); mic.rotation.x = Math.PI * 0.85; }
  S.cams = { wide: { p: V(0, 2.2, 7.5), at: V(0, 1.8, -0.5), fov: 46 }, rex: { p: V(-0.2, 1.65, 3.4), at: V(-1.4, 1.55, 0.6), fov: 32 }, dar: { p: V(0.9, 1.5, 2.6), at: V(1.7, 1.42, 0.15), fov: 30 }, wheel: { p: V(0, 2.4, 2.6), at: V(0, 2.3, -1.5), fov: 48 } };
  S.shot = "wide";
  S.tick = (t, f, env, cue) => {
    let ang = 0.2;
    const ts = S.spinAt; if (ts !== undefined) { const u = clamp((t - ts) / 4.1, 0, 1), end = Math.PI / 2 + 2.5 * Math.PI / 4 + Math.PI * 6; ang = 0.2 + (1 - (1 - u) ** 3) * (end - 0.2); }
    spinner.rotation.z = ang;
    bulbs.forEach((b, k) => b.material.color.set((k + (t * 10 | 0)) % 3 ? 0x664a20 : 0xffe080)); lightsArc.forEach((b, k) => b.material.color.set((k + (t * 6 | 0)) % 2 ? 0x553a10 : 0xffd040));
    const who = env("darlene") > env("rex") ? "dar" : "rex";
    animate(S.rex, t, env("rex"), { hands: 1.4, lookYaw: S.shot === "wheel" ? -0.6 : 0.2 });
    animate(S.dar, t, env("darlene"), { hands: 1.6, lookYaw: -0.2 });
    if (ts !== undefined && t > ts - 0.6 && t < ts + 5) S.shot = "wheel";
    else if (S.forced) S.shot = S.forced;
    else S.shot = t < 4 ? "wide" : who;
    if (cue.aww !== undefined && t > cue.aww) S.score = "$0"; podT.redraw(t);
  };
  S.overlay = (x, t) => { x.fillStyle = "rgba(20,0,40,.75)"; x.fillRect(W - 120, H - 40, 110, 30); x.fillStyle = "#ffd040"; x.font = font(18, 900); x.fillText("SPIN CITY", W - 112, H - 19); };
};

/* Kessler & Associates: a wood-panelled office, a desk, a man in trouble */
SETS.lawyer = (S) => {
  const scene = S.scene; scene.background = C("#2a1a10"); lights(scene, { keyI: 50, hemi: 0.5, sky: 0xffe0c0 });
  const wood = canvasTex(256, 256, (x, w, h) => { x.fillStyle = "#5a3a22"; x.fillRect(0, 0, w, h); for (let k = 0; k < w; k += 32) { x.fillStyle = "rgba(0,0,0,.25)"; x.fillRect(k, 0, 2, h); for (let y = 0; y < h; y += 3) { x.fillStyle = `rgba(${Math.random() < .5 ? "30,15,5" : "120,80,50"},.08)`; x.fillRect(k + 2, y, 30, 1); } } });
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(4, 2);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), std({ map: wood, roughness: 0.6 })); back.position.set(0, 2, -1.6); back.receiveShadow = true; scene.add(back);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), std({ color: 0x3a2a3a, roughness: 0.9 })); fl.receiveShadow = true; scene.add(fl);
  const shelf = new THREE.Group(); for (let r = 0; r < 4; r++) { const b = box(2.4, 0.04, 0.3, std({ color: 0x3a2414 })); b.position.y = 0.6 + r * 0.5; shelf.add(b); for (let k = 0; k < 22; k++) { const bk = box(0.07 + Math.random() * 0.04, 0.32 + Math.random() * 0.1, 0.22, std({ color: [0x6a1a1a, 0x1a3a6a, 0x2a4a2a, 0x8a6a2a, 0x222222][k % 5], roughness: 0.7 })); bk.position.set(-1.1 + k * 0.1, 0.6 + r * 0.5 + 0.18, 0); shelf.add(bk); } }
  shelf.position.set(-2.2, 0, -1.4); scene.add(shelf);
  const diploma = canvasTex(256, 192, (x, w, h) => { x.fillStyle = "#f4ecd8"; x.fillRect(0, 0, w, h); x.strokeStyle = "#8a6a2a"; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = "#222"; x.font = font(20, 700, "Georgia, serif"); x.textAlign = "center"; x.fillText("Gulf Coast", w / 2, 60); x.fillText("Night School of Law", w / 2, 88); x.font = font(14, 400, "Georgia, serif"); x.fillText("Martin J. Kessler", w / 2, 130); x.fillText("(Correspondence)", w / 2, 152); });
  const dp = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.52), std({ map: diploma })); dp.position.set(1.4, 2.2, -1.58); scene.add(dp);
  const desk = box(2.2, 0.8, 0.9, std({ map: wood, roughness: 0.5 })); desk.position.set(0, 0.4, 0.6); scene.add(desk);
  const plate = canvasTex(256, 48, (x, w, h) => { x.fillStyle = "#c9a14a"; x.fillRect(0, 0, w, h); x.fillStyle = "#2a1a0a"; x.font = font(24, 800, "Georgia, serif"); x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("M. KESSLER, ESQ.", w / 2, h / 2); });
  const np = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.08), [std({ color: 0x2a1a0a }), std({ color: 0x2a1a0a }), std({ color: 0x2a1a0a }), std({ color: 0x2a1a0a }), std({ map: plate }), std({ color: 0x2a1a0a })]); np.position.set(0.5, 0.86, 1.0); scene.add(np);
  S.marty = person(S.cast.marty.look, 606); S.marty.g.position.set(0, 0, 0.0); scene.add(S.marty.g);
  S.cams = { a: { p: V(0, 1.55, 3.4), at: V(0, 1.4, 0), fov: 36 }, close: { p: V(0.15, 1.62, 1.9), at: V(0, 1.58, 0), fov: 30 } }; S.shot = "a";
  S.tick = (t, f, env) => { animate(S.marty, t, env("marty"), { hands: 1.8 }); S.shot = (t > 13 && t < 17) || t > 26 ? "close" : "a"; S.cams.close.p.x = 0.15 + Math.sin(t * 0.6) * 0.05; };
  S.overlay = (x, t, line, dur) => {
    if (t > 17) { const fl = (t * 3 | 0) % 2; x.fillStyle = fl ? "#ffe040" : "#ffffff"; x.font = font(30, 900); x.textAlign = "center"; x.strokeStyle = "#000"; x.lineWidth = 5; x.strokeText("1-800-KESSLER", W / 2, H - 30); x.fillText("1-800-KESSLER", W / 2, H - 30); x.textAlign = "left"; }
    x.fillStyle = "rgba(255,255,255,.85)"; x.font = font(9, 500); x.fillText("Attorney advertising. Past results do not guarantee anything. Mr. Kessler is not a doctor and has asked us to stop saying he is.", 8, H - 6);
  };
};

/* Captain Gull's Pier Patrol: a puppet show on a toy pier */
SETS.gull = (S) => {
  const scene = S.scene; scene.background = C("#7cc8ff"); lights(scene, { keyI: 60, hemi: 0.9, sky: 0xd8f0ff, ground: 0x6a8a5a });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(30, 20, 60, 40).rotateX(-Math.PI / 2), std({ color: 0x2a86c8, roughness: 0.3, flatShading: true })); sea.position.y = -0.3; scene.add(sea);
  const sp = sea.geometry.attributes.position, sy0 = sp.array.slice();
  const pier = new THREE.Group(); const plank = std({ color: 0xb08a5a, roughness: 0.8 });
  for (let k = 0; k < 14; k++) { const p = box(0.28, 0.08, 3, plank); p.position.set(-2 + k * 0.3, 0.6, 0); pier.add(p); }
  for (const [a, b] of [[-1.9, -1.3], [-1.9, 1.3], [1.9, -1.3], [1.9, 1.3]]) { const post = box(0.2, 1.4, 0.2, std({ color: 0x7a5a3a })); post.position.set(a, 0.1, b); pier.add(post); }
  scene.add(pier);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 16), basic({ color: 0xffe060 })); sun.position.set(5, 6, -12); scene.add(sun);
  const clouds = []; for (let k = 0; k < 5; k++) { const c = new THREE.Group(); for (let j = 0; j < 4; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.random() * 0.4, 12, 10), std({ color: 0xffffff, roughness: 1 })); s.position.set(j * 0.7, Math.random() * 0.3, 0); c.add(s); } c.position.set(-10 + k * 5, 4 + (k % 2), -10); scene.add(c); clouds.push(c); }
  // the gull: a puppet of spheres and cones, a sailor's cap, a beak that works
  const white = std({ color: 0xf8f8fa, roughness: 0.7 }), grey = std({ color: 0x9aa4ae, roughness: 0.7 }), yel = std({ color: 0xffc030, roughness: 0.5 }), blk = std({ color: 0x111111, roughness: 0.3 });
  const G = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), white); body.scale.set(1, 0.9, 1.25); body.castShadow = true; G.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.62, 0.35); G.add(head);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 18), white); hd.castShadow = true; head.add(hd);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), std({ color: 0xffffff })); e.position.set(sx * 0.14, 0.08, 0.26); head.add(e); const pu = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), blk); pu.position.set(0, 0, 0.05); e.add(pu); const lid = new THREE.Mesh(new THREE.SphereGeometry(0.082, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), grey); lid.rotation.x = -0.5; e.add(lid); e.userData.lid = lid; }
  const bU = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 12), yel); bU.rotation.x = Math.PI / 2; bU.position.set(0, -0.02, 0.48); bU.scale.set(1, 1, 0.55); head.add(bU);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.06, 0.28); head.add(jaw); const bL = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.36, 12), std({ color: 0xe8a020 })); bL.rotation.x = Math.PI / 2; bL.position.set(0, -0.01, 0.17); bL.scale.set(1, 1, 0.4); jaw.add(bL);
  const capB = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.14, 20), white); capB.position.set(0, 0.3, -0.02); head.add(capB);
  const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.05, 20), std({ color: 0x1a2a6a })); capBand.position.set(0, 0.24, -0.02); head.add(capBand);
  const cig = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), std({ color: 0xffffff })); cig.rotation.z = Math.PI / 2.4; cig.position.set(0.1, -0.05, 0.4); head.add(cig);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), basic({ color: 0xff5020 })); ember.position.set(0, 0.08, 0); cig.add(ember);
  const wings = []; for (const sx of [-1, 1]) { const w = new THREE.Group(); w.position.set(sx * 0.42, 0.15, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.45), grey); m.position.x = sx * 0.36; m.castShadow = true; w.add(m); const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), blk); tip.position.x = sx * 0.78; w.add(tip); G.add(w); wings.push([w, sx]); }
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), yel); l.position.set(sx * 0.15, -0.55, 0.05); G.add(l); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), grey); tail.rotation.x = -Math.PI / 2.4; tail.position.set(0, 0.05, -0.65); G.add(tail);
  G.position.set(0, 1.35, 0.3); scene.add(G);
  const fry = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), std({ color: 0xf0c050 })); fry.position.set(0.8, 0.68, 0.6); fry.rotation.y = 0.7; scene.add(fry);
  const smoke = []; for (let k = 0; k < 8; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), std({ color: 0xdddddd, transparent: true, opacity: 0.5 })); scene.add(s); smoke.push(s); }
  S.cams = { a: { p: V(0, 1.8, 4.2), at: V(0, 1.6, 0), fov: 38 }, close: { p: V(0.3, 2.0, 2.4), at: V(0, 1.95, 0.3), fov: 34 } }; S.shot = "a";
  S.tick = (t, f, env) => {
    const k = clamp(env("gull") * 2, 0, 1); jaw.rotation.x = k * 0.55;
    G.position.y = 1.35 + Math.abs(Math.sin(t * 3)) * 0.08 + k * 0.06; G.rotation.y = 0.15 * Math.sin(t * 0.7); head.rotation.y = 0.25 * noise(t * 1.3, 2); head.rotation.x = -0.15 * k * noise(t * 4, 3); head.rotation.z = 0.1 * noise(t * 1.1, 5);
    for (const [w, sx] of wings) w.rotation.z = sx * (0.15 + (k > 0.3 ? 0.5 * Math.abs(Math.sin(t * 9)) : 0.05 * Math.sin(t * 2)));
    const blink = (t % 3.7) < 0.12 ? 1 : 0; head.children.forEach((c) => { if (c.userData.lid) c.userData.lid.rotation.x = blink ? 1.2 : -0.5; });
    for (let i = 0; i < sp.count; i++) sp.setY(i, sy0[i * 3 + 1] + Math.sin(sy0[i * 3] * 0.8 + t * 2) * 0.08 + Math.cos(sy0[i * 3 + 2] * 0.9 + t * 1.6) * 0.06); sp.needsUpdate = true; sea.geometry.computeVertexNormals();
    clouds.forEach((c, i) => { c.position.x = ((i * 5 + t * 0.4) % 26) - 13; });
    const tip = new THREE.Vector3(); ember.getWorldPosition(tip); smoke.forEach((s, i) => { const u = ((t * 0.6 + i / 8) % 1); s.position.set(tip.x + u * 0.3 + Math.sin(u * 9 + i) * 0.05, tip.y + u * 0.8, tip.z); s.scale.setScalar(0.5 + u * 2); s.material.opacity = 0.5 * (1 - u); });
    S.shot = (t > 15 && t < 31) ? "close" : "a";
  };
  S.overlay = (x, t, line, dur) => {
    if (t < 3.2) { x.fillStyle = "rgba(255,255,255,.92)"; x.fillRect(30, 40, W - 60, 90); x.strokeStyle = "#c82020"; x.lineWidth = 6; x.strokeRect(30, 40, W - 60, 90); x.fillStyle = "#c82020"; x.font = font(34, 900); x.textAlign = "center"; x.fillText("CAPTAIN GULL'S", W / 2, 80); x.fillStyle = "#1a2a6a"; x.font = font(26, 900); x.fillText("PIER PATROL", W / 2, 114); x.textAlign = "left"; }
    x.fillStyle = "rgba(255,255,255,.8)"; x.fillRect(W - 66, 8, 58, 18); x.fillStyle = "#c82020"; x.font = font(11, 900); x.fillText("TV-K?", W - 58, 21);
  };
};

/* The Long Tide: a pier at night in the rain, two people and a bad idea. Black and white. */
SETS.movie = (S) => {
  const scene = S.scene; scene.background = C("#05070c"); scene.fog = new THREE.FogExp2(0x0a0e18, 0.06);
  scene.add(new THREE.HemisphereLight(0x6a7a98, 0x202020, 0.9));
  const face = new THREE.DirectionalLight(0xdfe6ff, 2.2); face.position.set(0.5, 2.2, 4); scene.add(face);
  const lamp = new THREE.SpotLight(0xfff0c0, 120, 20, 0.55, 0.5, 1.5); lamp.position.set(1.5, 5.2, 0.5); lamp.target.position.set(0.2, 0, 0); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); scene.add(lamp, lamp.target);
  const moon = new THREE.DirectionalLight(0x8090b0, 0.6); moon.position.set(-5, 6, -8); scene.add(moon);
  const deck = new THREE.Group(); for (let k = 0; k < 40; k++) { const p = box(0.3, 0.1, 4, std({ color: 0x4a3a2a, roughness: 0.3, metalness: 0.2 })); p.position.set(-6 + k * 0.32, 0, 0); deck.add(p); } scene.add(deck);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 40, 1, 1).rotateX(-Math.PI / 2), std({ color: 0x0a1420, roughness: 0.1, metalness: 0.6 })); water.position.y = -0.8; scene.add(water);
  const pole = box(0.12, 5.4, 0.12, std({ color: 0x222222 })); pole.position.set(1.5, 2.7, 1.1); scene.add(pole); const arm = box(0.1, 0.1, 0.7, std({ color: 0x222222 })); arm.position.set(1.5, 5.35, 0.8); scene.add(arm);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), basic({ color: 0xfff6d0 })); bulb.position.set(1.5, 5.2, 0.5); scene.add(bulb);
  const boat = new THREE.Group(); const hull = box(1.6, 0.6, 5, std({ color: 0xd8d8d8, roughness: 0.6 })); hull.position.y = -0.4; boat.add(hull); const cab = box(1.2, 0.9, 1.6, std({ color: 0xbbbbbb })); cab.position.set(0, 0.35, -0.6); boat.add(cab); boat.position.set(-1, 0, -3); boat.rotation.y = Math.PI / 2; scene.add(boat);
  for (let k = 0; k < 8; k++) { const wh = box(2 + Math.random() * 2, 3 + Math.random() * 4, 2, std({ color: 0x141820 })); wh.position.set(-12 + k * 3.5, 1.5, -12); scene.add(wh); }
  const rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.35, 0.008), basic({ color: 0x8090a8, transparent: true, opacity: 0.22 }), 900); scene.add(rain); const m4 = new THREE.Matrix4(); const rr = []; for (let i = 0; i < 900; i++) rr.push([Math.random() * 14 - 7, Math.random() * 7, Math.random() * 10 - 6, 6 + Math.random() * 3]);
  S.jack = person(S.cast.jack.look, 707); S.jack.g.position.set(-0.2, 0.05, 0.9); S.jack.g.rotation.y = 1.2; scene.add(S.jack.g);
  S.viv = person(S.cast.vivian.look, 808); S.viv.g.position.set(1.0, 0.05, 0.6); S.viv.g.rotation.y = -1.9; scene.add(S.viv.g);
  S.cams = { pier: { p: V(-6, 2.8, 6), at: V(0.5, 1.2, 0.5), fov: 40 }, two: { p: V(0.4, 1.55, 3.6), at: V(0.4, 1.45, 0.7), fov: 34 }, jack: { p: V(1.6, 1.6, 1.8), at: V(-0.2, 1.6, 0.9), fov: 28 }, vivian: { p: V(-1.0, 1.55, 1.9), at: V(1.0, 1.52, 0.6), fov: 28 } };
  S.shot = "pier"; S.gray = true;
  S.tick = (t, f, env) => {
    for (let i = 0; i < 900; i++) { const r = rr[i]; const y = 7 - ((r[1] + t * r[3]) % 7); m4.makeTranslation(r[0] - (t * 0.8 % 1), y, r[2]); rain.setMatrixAt(i, m4); } rain.instanceMatrix.needsUpdate = true;
    lamp.intensity = (Math.sin(t * 13) > 0.97 ? 60 : 120);
    if (S.shot === "pier") S.cams.pier.p.x = -6 + t * 0.06;
    animate(S.jack, t, env("jack"), { hands: 0.6, lookYaw: 0.05 }); animate(S.viv, t, env("vivian"), { hands: 0.7, lookYaw: -0.05 });
  };
  S.overlay = (x, t, line, dur) => {
    if (t < 4.5) { const a = clamp(Math.min(t / 0.8, (4.5 - t) / 0.8), 0, 1); x.fillStyle = `rgba(0,0,0,${0.75 * a})`; x.fillRect(0, 0, W, H); x.globalAlpha = a; x.fillStyle = "#eae4d0"; x.font = font(36, 400, "Georgia, serif"); x.textAlign = "center"; x.fillText("THE LONG TIDE", W / 2, H / 2); x.font = font(11, 400, "Georgia, serif"); x.fillText("a Seagrape Pictures release", W / 2, H / 2 + 24); x.textAlign = "left"; x.globalAlpha = 1; }
    if (Math.random() < 0.06) { x.fillStyle = "rgba(255,255,255,.25)"; x.fillRect(Math.random() * W, 0, 1, H); }
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); }   // grain
  };
};

/* ---------------- the frame loop ---------------- */
let S = null;
window.TV = {
  async load(id) {
    D = D || await loadHumanData();
    const src = await (await fetch("../../media/tv/shows.src.json")).json(), info = await (await fetch("./build/" + id + ".json")).json();
    S = { id, scene: new THREE.Scene(), cast: src.cast, info, cue: {} };
    for (const c of info.cues) { const [k, v] = c.cue.split(":"); if (k === "cue") S.cue[v] = c.t; }
    SETS[(src.shows.find((s) => s.id === id) || {}).set || id](S);
    S.camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 200);
    const sl = info.lines.find((l) => S.cue.spin !== undefined && Math.abs(l.t0 - S.cue.spin) < 0.01); if (sl) S.spinAt = sl.t1 + 0.2;
    // skin, hair and clothes load as images: draw once to start the uploads, then wait until nothing's pending
    S.camera.position.set(0, 1.6, 4); gl.render(S.scene, S.camera);
    await new Promise((res) => { let quiet = 0; const iv = setInterval(() => { const busy = [...document.images].some((i) => !i.complete); quiet = busy ? 0 : quiet + 1; if (quiet > 6) { clearInterval(iv); res(); } }, 250); setTimeout(() => { clearInterval(iv); res(); }, 12000); });
    await new Promise((r) => setTimeout(r, 2500)); gl.render(S.scene, S.camera);
    return Math.ceil(info.dur * info.fps);
  },
  frame(i) {
    const info = S.info, t = i / info.fps;
    // camera: the latest cut cue at or before now
    let cut = null; for (const c of info.cues) if (c.t <= t + 0.01 && c.cue.startsWith("cut:")) cut = c.cue.slice(4);
    if (cut && S.cams[cut] && S.id !== "spin") S.shot = cut;
    const env = (who) => { const e = info.env[who]; return e ? e[Math.min(e.length - 1, i)] || 0 : 0; };
    const line = info.lines.find((l) => t >= l.t0 && t <= l.t1);
    S.tick(t, i, env, S.cue);
    const c = S.cams[S.shot] || Object.values(S.cams)[0];
    S.camera.position.copy(c.p); S.camera.position.x += Math.sin(t * 0.37) * 0.015; S.camera.position.y += Math.sin(t * 0.29) * 0.01;   // a held camera, just alive
    S.camera.fov = c.fov; S.camera.updateProjectionMatrix(); S.camera.lookAt(c.at);
    gl.render(S.scene, S.camera);
    g2.filter = S.gray ? "grayscale(1) contrast(1.25) brightness(1.05)" : "none"; g2.drawImage(gl.domElement, 0, 0); g2.filter = "none";
    if (S.overlay) S.overlay(g2, t, line, info.dur);
    return out.toDataURL("image/jpeg", 0.9);
  }
};
window.TV_READY = true;
