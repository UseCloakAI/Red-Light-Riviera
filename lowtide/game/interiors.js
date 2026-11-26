/* Interiors. Nearly every building on Marlowe Keys has a door you can use: walk up to it,
   press E, a quick cut to black, and you're inside the place on the sign (a bodega, the
   pharmacy, a pawn shop, a surf shop, the hardware store, a check-cashing counter, a taco
   joint or a deli, a bar, a laundromat, a barber's, a hotel lobby, the motel, apartments,
   an office lobby, a warehouse, the garage, a house, the union hall, the theatre), sized
   to the building. There's someone behind the counter and often a customer or two; each
   kind of place has its own sound. Leave by the same door.

   It's how the games of the era did it: the room is built on the spot, out past the edge
   of the world, and the street holds its breath while you're in. PS1 look: little
   nearest-neighbour textures (tiles, planks, carpet, wallpaper, ceiling tiles) with the
   ceiling lamps' light baked into the vertex colours, unlit, unsnapped (a floor of small
   quads shouldn't crawl), nothing laid flat on anything else. */
import * as THREE from "three";
import { flat } from "./ps1.js?v=dev";

const ORIGIN = { x: 4200, z: 4200 }, H = 3.3;
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const C = (h) => new THREE.Color(h);
const STORES = ["store", "pharmacy", "hardware", "pawn", "surf", "checks"];
export const LABEL = { store: "Store", pharmacy: "Pharmacy", hardware: "Hardware", pawn: "Pawn & Loan", surf: "Surf Shop", checks: "Checks Cashed", cafe: "Café", diner: "Nite Owl Diner", bar: "Bar", laundry: "Laundromat", barber: "Barber", hotel: "Hotel", motel: "Seagrape Motor Inn", apartment: "Apartments", office: "Lobby", warehouse: "Warehouse", garage: "Garage", house: "House", hall: "Longshore Hall", theatre: "Palm Square Theatre" };
const GREET = {
  store: ["Evening. Let me know if you need anything.", "We close at two. Don't get comfortable."], pharmacy: ["Prescriptions are at the back.", "Pharmacist's on break."],
  hardware: ["Whatever you're fixing, we've got it.", "Paint's on aisle two."], pawn: ["Buying or selling?", "Everything's got a story. Most of them sad."],
  surf: ["Waves are flat till Thursday.", "Wax is on the counter."], checks: ["Two forms of ID.", "Take a number."],
  cafe: ["Sit anywhere, hon.", "Coffee's fresh. Mostly."], diner: ["Sit anywhere, hon. Pie's on the board.", "Kitchen's still open."], bar: ["What'll it be?", "Last call's in an hour."],
  laundry: ["Machine four eats quarters.", "Change machine's busted."], barber: ["Take a seat. Be right with you.", "Just a trim?"],
  hotel: ["Good evening. Checking in?", "Welcome. Do you have a reservation?"], motel: ["Vacancy's on, if you need a room.", "Ice machine's down the walkway."],
  apartment: ["Who let you in?", "Hey, this is my place."], office: ["Building's closed. Can I help you?", "Sign in at the desk, please."],
  house: ["Uh, can I help you?", "You lost?"], hall: ["Meeting's Tuesday.", "Members only, friend."], theatre: ["Show's already started.", "Find a seat, quietly."]
};

/* ---- the textures: real ones where we have them (CC0, Screaming Brain Studios' Tiny Texture Packs, cut to
   64 px: assets/tex/LICENSE.md), the rest drawn here at 32 px; nearest, made once ---- */
const TEX = {};
const IMG = new Set(["checker", "tile", "walltile", "plank", "carpet", "bluecarpet", "concrete", "paint", "wood", "brick", "metal", "wooddark", "woodlight", "steel", "crate", "parquet", "door"]);
const TL = new THREE.TextureLoader();
function tex(name) {
  if (TEX[name]) return TEX[name];
  if (IMG.has(name)) {
    const t = TL.load(new URL("../assets/tex/" + name + ".png", import.meta.url).href);
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (TEX[name] = t);
  }
  const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const fill = (col) => { g.fillStyle = col; g.fillRect(0, 0, 32, 32); };
  const noise = (a) => { for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${a * r()})`; g.fillRect((r() * 32) | 0, (r() * 32) | 0, 1, 1); } };
  switch (name) {
    case "checker": for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? "#202024" : "#ece8e0"; g.fillRect(x * 16, y * 16, 16, 16); } noise(0.06); break;
    case "tile": fill("#d4cfc4"); g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(0, 0, 32, 1); g.fillRect(0, 16, 32, 1); g.fillRect(0, 0, 1, 32); g.fillRect(16, 0, 1, 32); noise(0.08); break;
    case "plank": fill("#8a5a36"); for (let y = 0; y < 32; y += 8) { g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, y, 32, 1); g.fillRect(((y / 8) % 2) * 16 + 7, y, 1, 8); g.fillStyle = `rgba(${r() < 0.5 ? "60,30,10" : "190,140,90"},.18)`; g.fillRect(0, y + 1, 32, 7); } noise(0.1); break;
    case "carpet": fill("#7a2a30"); for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) { g.fillStyle = (x + y) % 16 ? "#6a2026" : "#c9a14a"; g.fillRect(x + 3, y + 3, 2, 2); } noise(0.12); break;
    case "bluecarpet": fill("#2e4466"); for (let y = 0; y < 32; y += 4) { g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(0, y, 32, 1); } noise(0.14); break;
    case "concrete": fill("#8e8a84"); noise(0.22); g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(0, 31, 32, 1); g.fillRect(31, 0, 1, 32); break;
    case "paint": fill("#e8e2d6"); noise(0.05); break;
    case "stripe": fill("#e8dcc0"); for (let x = 0; x < 32; x += 8) { g.fillStyle = "#c9b896"; g.fillRect(x, 0, 3, 32); } noise(0.04); break;
    case "damask": fill("#5a1e24"); for (let y = 0; y < 32; y += 16) for (let x = 0; x < 32; x += 16) { g.fillStyle = "#6e2a30"; g.beginPath(); g.arc(x + 8, y + 8, 5, 0, 6.3); g.fill(); g.fillStyle = "#4a1a1e"; g.fillRect(x + 7, y + 2, 2, 12); } break;
    case "walltile": fill("#e6eef0"); g.fillStyle = "rgba(0,0,0,.12)"; for (let k = 0; k < 32; k += 8) { g.fillRect(0, k, 32, 1); g.fillRect(k, 0, 1, 32); } break;
    case "wood": fill("#6a4428"); for (let x = 0; x < 32; x += 6) { g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(x, 0, 1, 32); } noise(0.1); break;
    case "brick": fill("#9a5a46"); for (let y = 0; y < 32; y += 4) { g.fillStyle = "rgba(220,210,200,.5)"; g.fillRect(0, y, 32, 1); for (let x = (y / 4 % 2) * 4; x < 32; x += 8) g.fillRect(x, y, 1, 4); } noise(0.1); break;
    case "metal": fill("#8a8c90"); for (let x = 0; x < 32; x += 4) { g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(x, 0, 1, 32); g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(x + 1, 0, 1, 32); } break;
    // packaged goods: a cap, a label band with print, the body; the box's colour tints it
    case "pack": fill("#c4c4c4"); g.fillStyle = "#5a5a5a"; g.fillRect(0, 0, 32, 5); g.fillStyle = "#ffffff"; g.fillRect(0, 11, 32, 12); g.fillStyle = "#2a2a2a"; for (let x = 4; x < 28; x += 3 + ((r() * 3) | 0)) g.fillRect(x, 15 + ((r() * 2) | 0), 2, 1); g.fillRect(6, 19, 20, 1); g.fillStyle = "#e8e8e8"; g.fillRect(3, 26, 6, 3); break;
    case "bottle": fill("#b8b8b8"); g.fillStyle = "#ffffff"; g.fillRect(0, 12, 32, 10); g.fillStyle = "#3a3a3a"; g.fillRect(12, 0, 8, 6); g.fillRect(8, 16, 16, 2); g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(5, 6, 2, 24); break;
    case "fabric": fill("#d8d8d8"); for (let y = 0; y < 32; y += 2) for (let x = (y / 2) % 2; x < 32; x += 2) { g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(x, y, 1, 1); } noise(0.12); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, 31, 32, 1); break;
    case "peg": fill("#b8b4ac"); g.fillStyle = "#4a4844"; for (let y = 2; y < 32; y += 4) for (let x = 2; x < 32; x += 4) g.fillRect(x, y, 1, 1); break;
    case "ceil": fill("#e4e0d8"); g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32); for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect((r() * 32) | 0, (r() * 32) | 0, 1, 1); } break;
    default: fill("#ffffff");
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (TEX[name] = t);
}
// a sign, poster or menu board painted on a canvas
function board(lines, o = {}) {
  const w = o.w || 64, h = o.h || 32, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
  g.fillStyle = o.bg || "#1a1a1e"; g.fillRect(0, 0, w, h); if (o.border) { g.strokeStyle = o.border; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); }
  g.fillStyle = o.fg || "#f4e9d2"; g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach((l, i) => { g.font = `bold ${i === 0 ? o.big || 11 : o.small || 7}px Arial Narrow, Arial, sans-serif`; g.fillText(l, w / 2, (i + 0.5) * h / lines.length + (i === 0 ? 0 : 1), w - 6); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; return t;
}

export class Interiors {
  constructor(o) {
    Object.assign(this, o);   // scene, world, player, rig, hud, sfx, say(text, pd), npcs, police, vehicles, gore, fx, root
    this.list = this.world.entrances || []; this.inside = null; this.fadeT = 0; this.solid = []; this.group = null; this.heightAt0 = this.world.heightAt;
    this.fadeEl = document.createElement("div"); this.fadeEl.className = "fade"; this.root.appendChild(this.fadeEl);
    this.prompt = document.createElement("div"); this.prompt.className = "prompt doorp"; this.prompt.innerHTML = "<kbd>E</kbd><span></span>"; this.root.appendChild(this.prompt);
    this.mats = new Map(); this.people = []; this.fans = [];
  }
  // one unlit, unsnapped material per texture (or none)
  mat(key, map, glow) {
    const k = key + (glow ? ":g" : ""); if (this.mats.has(k)) return this.mats.get(k);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, map: map || null, toneMapped: !glow, ...flat() });
    this.mats.set(k, m); return m;
  }
  near() {
    const P = this.player.pos;
    if (this.inside) { const ex = this.inside.exit; return Math.hypot(P.x - ex.x, P.z - ex.z) < 1.5 ? { exit: true, x: ex.x, z: ex.z } : null; }
    let best = null, bd = 1.8;
    for (const e of this.list) { const d = Math.hypot(P.x - e.x, P.z - e.z); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  /* what happened in a building stays there: the bodies (as they fell), the blood, the bullet holes */
  saved(e) { const k = e.x.toFixed(1) + "," + e.z.toFixed(1); this.memory = this.memory || new Map(); let st = this.memory.get(k); if (!st) this.memory.set(k, st = { bodies: [], dead: new Set(), gore: null, holes: null }); return st; }
  save(e) {
    const st = this.saved(e);
    for (const pd of this.people) if (pd.dead) {
      if (pd.rag) { for (let i = 0; i < 150 && pd.rag.step(1 / 30); i++); pd.rag.pose(); }   // let them come to rest first
      st.bodies.push(bakeBody(pd.h.group)); st.dead.add(pd.spotKey);
    }
    for (const b of st.bodies) this.scene.remove(b);
    if (this.gore && this.gore.snapshotNear) st.gore = this.gore.snapshotNear(ORIGIN.x, ORIGIN.z, 60);
    if (this.fx && this.fx.snapshotNear) st.holes = this.fx.snapshotNear(ORIGIN.x, ORIGIN.z, 60);
  }
  restore(st) {
    for (const b of st.bodies) this.scene.add(b);
    if (st.gore && this.gore && this.gore.restore) this.gore.restore(st.gore);
    if (st.holes && this.fx && this.fx.restore) this.fx.restore(st.holes);
  }
  update(dt, input, camera) {
    this.camera = camera;
    if (this.fadeT > 0) { this.fadeT -= dt; if (this.fadeT <= 0 && this.then) { const f = this.then; this.then = null; f(); } }
    if (this.inside) this.tickInside(dt);
    const busy = this.fadeT > 0 || (this.vehicles && this.vehicles.driving);
    const n = busy ? null : this.near();
    this.showPrompt(n, camera);
    if (!n || !input.hit("KeyE")) return false;
    if (n.exit) this.cut(() => this.leave());
    else if (this.police && this.police.wanted) { if (this.hud.subtitle) this.hud.subtitle("Not with the cops on you."); }
    else this.cut(() => this.enter(n));
    return true;
  }
  showPrompt(n, camera) {
    const el = this.prompt, off = () => { if (this.pOn) { el.classList.remove("on"); this.pOn = false; } };
    if (!n) return off();
    const v = new THREE.Vector3(n.x, (n.exit ? 0 : this.heightAt0(n.x, n.z)) + 2.1, n.z).project(camera);
    if (!isFinite(v.x) || !isFinite(v.y) || v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return off();
    el.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(0)}px)`;
    el.querySelector("span").textContent = n.exit ? "Leave" : n.name || LABEL[n.kind] || "Enter";
    if (!this.pOn) { el.classList.add("on"); this.pOn = true; if (this.on) this.on("near-door"); }
  }
  cut(fn) { this.fadeEl.classList.add("on"); this.fadeT = 0.3; this.then = () => { fn(); setTimeout(() => this.fadeEl.classList.remove("on"), 60); }; if (this.sfx.door) this.sfx.door(); }

  enter(e) {
    const R = rng(e.seed), kind = e.kind;
    // the room is the building: the unit's width along the street, its depth back from the front
    const w = THREE.MathUtils.clamp(e.u1 - e.u0, 3.5, 30), d = THREE.MathUtils.clamp(e.depth, 4, 30);
    this.inside = { e, w, d, kind, R, t: 0, greeted: false, doorX: THREE.MathUtils.clamp(e.u1 - e.door, 0.9, w - 0.9) };
    const st = this.saved(e);
    this.build(this.inside, st);
    this.restore(st);
    this.world.heightAt = (x, z) => (Math.abs(x - ORIGIN.x) < 200 && Math.abs(z - ORIGIN.z) < 200 ? 0 : this.heightAt0(x, z));
    const P = this.player, ex = this.inside.exit;
    P.pos.set(ex.x, 0, ex.z + 1.8); P.vel.set(0, 0, 0); P.yaw = 0;
    this.rig.yaw = Math.PI; this.rig.pitch = 0.12; this.rig.cur = null;
    // the camera stays in the room: a shorter boom, a closer near plane, walls it can't pass
    const ox = ORIGIN.x - w / 2, m = 0.28; this.rig.bounds = { x0: ox + m, x1: ox + w - m, z0: ORIGIN.z + m, z1: ORIGIN.z + d - m, y1: H - 0.18 };
    this.dist0 = this.rig.dist; this.rig.dist = Math.min(3, this.rig.dist); if (this.camera) { this.near0 = this.camera.near; this.camera.near = 0.08; this.camera.updateProjectionMatrix(); }
    if (this.hud.root) this.hud.root.classList.add("inside");
    this.tone = this.sfx.roomTone ? this.sfx.roomTone(STORES.includes(kind) ? "store" : kind) : null;
    if (this.onEnter) this.onEnter(e);
  }
  leave() {
    const e = this.inside.e;
    this.save(e);
    this.clear();
    this.rig.bounds = null; if (this.dist0) this.rig.dist = this.dist0; if (this.camera && this.near0) { this.camera.near = this.near0; this.camera.updateProjectionMatrix(); }
    this.world.heightAt = this.heightAt0;
    const P = this.player; P.pos.set(e.x, this.heightAt0(e.x, e.z), e.z); P.vel.set(0, 0, 0); P.yaw = e.yaw + Math.PI;
    this.rig.yaw = e.yaw; this.rig.pitch = 0.14; this.rig.cur = null;
    if (this.hud.root) this.hud.root.classList.remove("inside");
    this.inside = null;
    if (this.onLeave) this.onLeave(e);
  }
  // everything that happened in here goes with the room: blood, bullet holes, the people (back on their feet for the next place)
  clear() {
    if (this.group) { this.scene.remove(this.group); this.group.traverse((m) => m.geometry && m.geometry.dispose()); this.group = null; }
    for (const o of this.solid) this.world.grid.remove(o); this.solid = []; this.fans = [];
    if (this.gore && this.gore.clearNear) this.gore.clearNear(ORIGIN.x, ORIGIN.z, 60);
    if (this.fx && this.fx.clearNear) this.fx.clearNear(ORIGIN.x, ORIGIN.z, 60);
    for (const pd of this.people) { pd.h.group.visible = false; pd.inUse = false; if (pd.dead) { pd.dead = false; pd.rag = null; } pd.hp = 100; pd.stagger = 0; pd.down = 0; pd.free = null; }
    this.people = [];
    if (this.tone) { this.tone.stop(); this.tone = null; }
  }
  tickInside(dt) {
    const I = this.inside; I.t += dt;
    for (const f of this.fans) f.rotation.y += dt * 5;
    const P = this.player.pos;
    for (const pd of this.people) {
      if (pd.dead) { if (pd.rag && pd.rag.step(dt)) pd.rag.pose(); continue; }
      const g = pd.h.group, close = Math.hypot(P.x - g.position.x, P.z - g.position.z) < 6;
      const want = pd.worker || close ? Math.atan2(P.x - g.position.x, P.z - g.position.z) : pd.face;   // the worker watches you; customers look up when you're near
      let dy = want - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * Math.min(1, dt * 2);
      pd.act.idle.setEffectiveWeight(1); pd.act.walk.setEffectiveWeight(0); pd.act.run.setEffectiveWeight(0); pd.mixer.update(dt);
    }
    const w = this.people.find((q) => q.worker && !q.dead);
    if (w && !I.greeted && I.t > 0.9) { I.greeted = true; const L = GREET[I.kind]; if (L && this.say) this.say(L[(I.R() * L.length) | 0], w); }
  }

  /* ---------------- the rooms ---------------- */
  build(I, st) {
    const { w, d, kind, R } = I, g = new THREE.Group(), layers = new Map();
    const ox = ORIGIN.x - w / 2, oz = ORIGIN.z;
    const DX = I.doorX; I.exit = { x: ox + DX, z: oz + 0.9 };
    const lamps = []; for (let x = 2; x < w - 1; x += 4) for (let z = 2; z < d - 1; z += 4) lamps.push([x, z]);
    const dim = { bar: 0.55, theatre: 0.45, warehouse: 0.72, garage: 0.72, hall: 0.85, motel: 0.75, apartment: 0.8, house: 0.8 }[kind] || 1;
    const warm = { bar: C("#ffb070"), theatre: C("#ffa070"), motel: C("#ffd0a0"), apartment: C("#ffe0b8"), house: C("#ffe0b8"), hotel: C("#ffe4c0") }[kind] || C("#fff8ec");
    const light = (x, y, z) => { let l = 0.24; for (const [lx, lz] of lamps) { const q = (x - lx) ** 2 + (z - lz) ** 2 + (H - y) ** 2 * 0.6; l += 0.55 / (1 + q * 0.14); } return Math.min(0.92, l * dim) * (0.7 + 0.3 * Math.min(1, y / 1.2)); };
    const layer = (key, map, glow) => { let L = layers.get(key + (glow ? "g" : "")); if (!L) layers.set(key + (glow ? "g" : ""), L = { p: [], c: [], u: [], map, glow, key }); return L; };
    // a quad; uv in metres along it (or 0..1 for boards)
    const quad = (a, b, c, e, col, o = {}) => {
      const L = layer(o.tex || "flat", o.tex ? (o.map || tex(o.tex)) : null, o.glow), ctr = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
      const k = o.glow ? 1 : light(...ctr) * (o.shade || 1), cc = col.clone().multiply(o.glow ? new THREE.Color(1, 1, 1) : warm).multiplyScalar(k);
      const uv = o.uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
      [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [e, uv[3]]].forEach(([v, t]) => { L.p.push(ox + v[0], v[1], oz + v[2]); L.c.push(cc.r, cc.g, cc.b); L.u.push(t[0], t[1]); });
    };
    const solid = (x0, x1, z0, z1, h = 2) => { this.solid.push(this.world.grid.box(ox + x0, oz + z0, ox + x1, oz + z1, h)); };
    const box = (x0, x1, y0, y1, z0, z1, col, o = {}) => {
      if (o.skip) { if (o.solid !== false && y0 < 1.6) solid(x0, x1, z0, z1, y1); return; }   // collision only
      const c = typeof col === "string" ? C(col) : col, s = o.shade || 1, t = o.tex ? { tex: o.tex } : {}, gl = o.glow;
      const k = o.uvs || 1, sx = (x1 - x0) * k, sy = (y1 - y0) * k, sz = (z1 - z0) * k, F = o.fit ? [[0, 0], [1, 0], [1, 1], [0, 1]] : null;
      quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], c, { ...t, shade: 1.05 * s, glow: gl, uv: o.fit ? [[0, 0], [1, 0], [1, 0.12], [0, 0.12]] : [[0, 0], [sx, 0], [sx, sz], [0, sz]] });
      quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], c, { ...t, shade: 0.82 * s, glow: gl, uv: F || [[0, 0], [sx, 0], [sx, sy], [0, sy]] });
      quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], c, { ...t, shade: 0.72 * s, glow: gl, uv: F || [[0, 0], [sx, 0], [sx, sy], [0, sy]] });
      quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], c, { ...t, shade: 0.66 * s, glow: gl, uv: F || [[0, 0], [sz, 0], [sz, sy], [0, sy]] });
      quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], c, { ...t, shade: 0.76 * s, glow: gl, uv: F || [[0, 0], [sz, 0], [sz, sy], [0, sy]] });
      if (o.solid !== false && y0 < 1.6) solid(x0, x1, z0, z1, y1);
    };
    // a board on a wall: which wall (f front z=0, b back z=d, l x=0, r x=w), where along it, how big, how high
    const plaque = (wall, at, bw, bh, y, map, glow = false) => {
      const e = 0.03, o = { tex: "board" + Math.random(), map, glow, uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }, y0 = y, y1 = y + bh, a0 = at - bw / 2, a1 = at + bw / 2;
      if (wall === "b") quad([a1, y0, d - e], [a0, y0, d - e], [a0, y1, d - e], [a1, y1, d - e], C("#fff"), o);
      else if (wall === "f") quad([a0, y0, e], [a1, y0, e], [a1, y1, e], [a0, y1, e], C("#fff"), o);
      else if (wall === "l") quad([e, y0, a1], [e, y0, a0], [e, y1, a0], [e, y1, a1], C("#fff"), o);
      else quad([w - e, y0, a0], [w - e, y0, a1], [w - e, y1, a1], [w - e, y1, a0], C("#fff"), o);
    };
    // the shell
    const isStore = STORES.includes(kind);
    const FLOOR = { diner: "checker", cafe: "checker", barber: "checker", bar: "plank", laundry: "tile", hotel: "carpet", pawn: "tile", surf: "tile", motel: "bluecarpet", apartment: "plank", house: "plank", office: "tile", warehouse: "concrete", garage: "concrete", theatre: "carpet", hall: "plank", checks: "tile" }[kind] || "tile";
    const WALL = { diner: "walltile", cafe: "stripe", bar: "wood", laundry: "walltile", barber: "walltile", hotel: "stripe", motel: "paint", apartment: "stripe", house: "stripe", office: "paint", warehouse: "metal", garage: "concrete", theatre: "damask", hall: "brick", pawn: "brick", surf: "wood" }[kind] || "paint";
    const fs = FLOOR === "tile" ? 1 : 2;   // metres a texture repeat
    quad([0, 0, 0], [w, 0, 0], [w, 0, d], [0, 0, d], C("#ffffff"), { tex: FLOOR, shade: 0.95, uv: [[0, 0], [w / fs, 0], [w / fs, d / fs], [0, d / fs]] });
    const wallCol = C("#ffffff");
    const wall = (x0, z0, x1, z1, inset) => {
      const L = Math.hypot(x1 - x0, z1 - z0), ix = inset[0], iz = inset[1];
      quad([x0, 0, z0], [x1, 0, z1], [x1, H, z1], [x0, H, z0], wallCol, { tex: WALL, shade: 0.88, uv: [[0, 0], [L / 2, 0], [L / 2, H / 2], [0, H / 2]] });
      quad([x0 + ix, 0, z0 + iz], [x1 + ix, 0, z1 + iz], [x1 + ix, 0.14, z1 + iz], [x0 + ix, 0.14, z0 + iz], C("#3a3430"));   // skirting, just proud of the wall
      if (["diner", "cafe", "hotel", "apartment", "house", "bar", "hall"].includes(kind))   // a dado rail
        quad([x0 + ix, 0.95, z0 + iz], [x1 + ix, 0.95, z1 + iz], [x1 + ix, 1.02, z1 + iz], [x0 + ix, 1.02, z0 + iz], C(kind === "diner" ? "#c23b2a" : "#6a4a32"));
    };
    wall(0, 0, w, 0, [0, 0.02]); wall(w, 0, w, d, [-0.02, 0]); wall(w, d, 0, d, [0, -0.02]); wall(0, d, 0, 0, [0.02, 0]);
    for (const [x0, z0, x1, z1] of [[-0.5, -0.5, w + 0.5, 0], [w, -0.5, w + 0.5, d + 0.5], [-0.5, d, w + 0.5, d + 0.5], [-0.5, -0.5, 0, d + 0.5]]) solid(x0, x1, z0, z1, 6);
    const ceilTex = kind === "warehouse" || kind === "garage" ? "concrete" : "ceil";
    quad([0, H, 0], [w, H, 0], [w, H, d], [0, H, d], C("#ffffff"), { tex: ceilTex, shade: 0.75, uv: [[0, 0], [w / 1.2, 0], [w / 1.2, d / 1.2], [0, d / 1.2]] });
    for (const [lx, lz] of lamps) {
      if (["bar", "apartment", "house", "motel", "hotel", "theatre"].includes(kind)) { box(lx - 0.18, lx + 0.18, H - 0.55, H - 0.3, lz - 0.18, lz + 0.18, warm.clone(), { glow: true, solid: false }); box(lx - 0.015, lx + 0.015, H - 0.3, H, lz - 0.015, lz + 0.015, "#222", { solid: false }); }   // hanging lamps
      else quad([lx - 0.6, H - 0.02, lz - 0.25], [lx + 0.6, H - 0.02, lz - 0.25], [lx + 0.6, H - 0.02, lz + 0.25], [lx - 0.6, H - 0.02, lz + 0.25], C("#fff6e0"), { glow: true });   // panels
    }
    // the way in, and windows out to the night
    quad([DX - 0.62, 0, 0.03], [DX + 0.62, 0, 0.03], [DX + 0.62, 2.22, 0.03], [DX - 0.62, 2.22, 0.03], C("#d8c8b8"), { tex: "door", shade: 0.95, uv: [[0, 0], [1.2, 0], [1.2, 2.2], [0, 2.2]] });
    box(DX - 0.75, DX - 0.62, 0, 2.34, 0.0, 0.08, "#e8e2d6", { solid: false }); box(DX + 0.62, DX + 0.75, 0, 2.34, 0.0, 0.08, "#e8e2d6", { solid: false }); box(DX - 0.75, DX + 0.75, 2.22, 2.34, 0.0, 0.08, "#e8e2d6", { solid: false });   // the frame
    quad([DX - 0.42, 1.25, 0.04], [DX + 0.42, 1.25, 0.04], [DX + 0.42, 2.05, 0.04], [DX - 0.42, 2.05, 0.04], C("#1c2a44"), { glow: true });   // the glass, night outside
    box(DX - 0.46, DX + 0.46, 1.21, 1.25, 0.03, 0.06, "#6a5a4a", { solid: false }); box(DX - 0.46, DX + 0.46, 2.05, 2.09, 0.03, 0.06, "#6a5a4a", { solid: false });
    box(DX - 0.5, DX + 0.5, 0, 0.22, 0.03, 0.05, "#9a9aa0", { tex: "steel", solid: false });   // kick plate
    box(DX - 0.4, DX + 0.4, 1.0, 1.06, 0.06, 0.12, "#c8c8cc", { tex: "steel", solid: false }); box(DX - 0.42, DX - 0.36, 0.98, 1.08, 0.03, 0.1, "#8a8a90", { solid: false }); box(DX + 0.36, DX + 0.42, 0.98, 1.08, 0.03, 0.1, "#8a8a90", { solid: false });   // push bar
    // the front windows, exactly where they are outside (each 4 m bay of the facade tile, from where the tile starts), dark glass and blinds from in here
    const FACE = { shop: [0.25, 3.75, 0.05, 2.7], stucco: [1, 3, 0.73, 2.48], siding: [1.125, 2.625, 0.75, 2.25], motel: [2.25, 3.75, 1.3, 2.33] }[I.e.face];
    if (FACE) {
      const ws = I.e.ws || 0, u0 = I.e.u0, u1 = I.e.u1;
      for (let b = ws; b < u1; b += 4) {
        let a = Math.max(b + FACE[0], u0), c = Math.min(b + FACE[1], u1);
        // not over the door
        const du = I.e.door; if (a < du + 0.8 && c > du - 0.8) { if (du - 0.8 - a > 0.4) c = du - 0.8; else if (c - (du + 0.8) > 0.4) a = du + 0.8; else continue; }
        if (c - a < 0.3) continue;
        const x0 = u1 - c, x1 = u1 - a, y0 = FACE[2], y1 = FACE[3];   // into room coordinates (the room's x runs the other way from the street's u)
        quad([x0, y0, 0.03], [x1, y0, 0.03], [x1, y1, 0.03], [x0, y1, 0.03], C("#121a2c"), { glow: true });
        for (let y = y0 + 0.12; y < y1; y += 0.14) quad([x0, y, 0.035], [x1, y, 0.035], [x1, y + 0.03, 0.035], [x0, y + 0.03, 0.035], C("#3a4458"), { glow: true });   // the blinds
        for (let k = 0; k < 3; k++) { const lx = x0 + 0.1 + R() * (x1 - x0 - 0.2), ly = y0 + 0.2 + R() * (y1 - y0 - 0.4); quad([lx, ly, 0.04], [lx + 0.05, ly, 0.04], [lx + 0.05, ly + 0.05, 0.04], [lx, ly + 0.05, 0.04], C("#ffd890"), { glow: true }); }
        box(x0 - 0.04, x1 + 0.04, y0 - 0.08, y0, 0.02, 0.16, "#d8d2c8", { solid: false });   // the sill
      }
    }
    // what's in it
    const fan = (x, z) => { const f = new THREE.Group(), m = this.mat("flat", null, false), geo = new THREE.BoxGeometry(1.4, 0.03, 0.16); for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(geo, m); b.rotation.y = r; f.add(b); } geo.setAttribute("color", new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count * 3).fill(0.28), 3)); f.position.set(ox + x, H - 0.35, oz + z); g.add(f); this.fans.push(f); };
    const spots = { worker: null, extra: [] };
    const F = FURNISH[isStore ? "store" : kind] || FURNISH.store, rec = [];
    F({ w, d, R, box: (...a) => rec.push(["b", a]), quad: (...a) => rec.push(["q", a]), plaque, board, C, H, kind, fan, spots });
    keepDoorClear(rec, spots, w, d, DX);
    for (const [t, a] of rec) t === "b" ? box(...a) : quad(...a);
    // geometry, one mesh per texture
    for (const L of layers.values()) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(L.p, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(L.c, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(L.u, 2));
      const mesh = new THREE.Mesh(geo, L.key.startsWith("board") ? new THREE.MeshBasicMaterial({ map: L.map, vertexColors: true, side: THREE.DoubleSide, toneMapped: !L.glow, ...flat() }) : this.mat(L.key, L.map, L.glow));
      mesh.frustumCulled = false; g.add(mesh);
    }
    this.scene.add(g); this.group = g;
    // people: the worker (or a resident), and a customer or two
    const place = (spot, worker, key) => {
      if (st && st.dead.has(key)) return;   // they died here; their body's still where it fell
      if (spot[0] < 0.4 || spot[0] > w - 0.4 || spot[1] < 0.4 || spot[1] > d - 0.4) return;   // the room's too small for them
      const pd = this.npcs && this.npcs.find((q) => !q.inUse && !q.dead); if (!pd) return;
      pd.inUse = true; pd.worker = worker; pd.spotKey = key; pd.face = spot[2] ?? Math.PI; this.people.push(pd);
      const g2 = pd.h.group; g2.position.set(ox + spot[0], 0, oz + spot[1]); g2.rotation.y = pd.face; g2.visible = true; pd.hp = 100;
    };
    if (spots.worker && !((kind === "apartment" || kind === "house") && R() < 0.3)) place(spots.worker, true, "w");
    spots.extra.forEach((s2, i) => { if (R() < 0.75) place(s2, false, "e" + i); });
  }
}

/* a body left where it fell: every skinned part's posed vertices baked into a plain mesh */
function bakeBody(group) {
  const out = new THREE.Group(), v = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry.attributes.position) return;
    const g = o.geometry, n = g.attributes.position.count, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(g.attributes.position, i); v.applyMatrix4(o.matrixWorld); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
    const ng = new THREE.BufferGeometry(); ng.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if (g.attributes.uv) ng.setAttribute("uv", g.attributes.uv);
    if (g.index) ng.setIndex(g.index);
    for (const gr of g.groups) ng.addGroup(gr.start, gr.count, gr.materialIndex);
    ng.computeVertexNormals();
    const m = new THREE.Mesh(ng, o.material); m.frustumCulled = false; out.add(m);
  });
  return out;
}

/* the way in stays clear: whatever furniture stands in the 2 m wide, 3.4 m deep walk in from the door is moved
   (each piece whole: its boxes grouped by touching) to the nearer side that's free, or further in, or left out.
   The people who stand at a moved piece move with it, and nobody waits in the doorway. */
function keepDoorClear(rec, spots, w, d, DX) {
  const CX0 = DX - 1.0, CX1 = DX + 1.0, CZ = 3.4;
  const bb = rec.map(([t, a]) => {
    if (t === "b") return { x0: Math.min(a[0], a[1]), x1: Math.max(a[0], a[1]), y0: a[2], y1: a[3], z0: Math.min(a[4], a[5]), z1: Math.max(a[4], a[5]) };
    const P = a.slice(0, 4); return { x0: Math.min(...P.map((q) => q[0])), x1: Math.max(...P.map((q) => q[0])), y0: Math.min(...P.map((q) => q[1])), y1: Math.max(...P.map((q) => q[1])), z0: Math.min(...P.map((q) => q[2])), z1: Math.max(...P.map((q) => q[2])) };
  });
  const n = bb.length, par = bb.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
  const flatThing = (b) => b.y1 < 0.06;   // rugs: under things, not part of them
  for (let i = 0; i < n; i++) { const A = bb[i]; if (flatThing(A)) continue; for (let j = i + 1; j < n; j++) { const B = bb[j]; if (flatThing(B)) continue; if (A.x0 <= B.x1 + 0.03 && B.x0 <= A.x1 + 0.03 && A.z0 <= B.z1 + 0.03 && B.z0 <= A.z1 + 0.03 && A.y0 <= B.y1 + 0.03 && B.y0 <= A.y1 + 0.03) par[find(i)] = find(j); } }
  const G = new Map(); for (let i = 0; i < n; i++) { const r = find(i); if (!G.has(r)) G.set(r, { ids: [], b: { ...bb[i] } }); const g = G.get(r); g.ids.push(i); const b = bb[i]; g.b.x0 = Math.min(g.b.x0, b.x0); g.b.x1 = Math.max(g.b.x1, b.x1); g.b.y0 = Math.min(g.b.y0, b.y0); g.b.y1 = Math.max(g.b.y1, b.y1); g.b.z0 = Math.min(g.b.z0, b.z0); g.b.z1 = Math.max(g.b.z1, b.z1); }
  const groups = [...G.values()];
  const blocks = (b) => b.y1 > 0.06 && b.y0 < 1.9 && b.x1 > CX0 && b.x0 < CX1 && b.z0 < CZ;
  const fits = (b) => b.x0 >= 0.05 && b.x1 <= w - 0.05 && b.z0 >= 0.05 && b.z1 <= d - 0.05;
  const hits = (b, self) => groups.some((g) => g !== self && !g.drop && g.b.y1 > 0.06 && g.b.y0 < 1.9 && b.x1 > g.b.x0 + 0.02 && b.x0 < g.b.x1 - 0.02 && b.z1 > g.b.z0 + 0.02 && b.z0 < g.b.z1 - 0.02);
  const moved = [];
  for (const g of groups) {
    if (!blocks(g.b)) continue;
    const opts = [{ dx: CX0 - g.b.x1, dz: 0 }, { dx: CX1 - g.b.x0, dz: 0 }, { dx: 0, dz: CZ - g.b.z0 }].sort((a, b) => Math.abs(a.dx) + Math.abs(a.dz) - Math.abs(b.dx) - Math.abs(b.dz));
    const ok = opts.find((m) => { const b = { ...g.b, x0: g.b.x0 + m.dx, x1: g.b.x1 + m.dx, z0: g.b.z0 + m.dz, z1: g.b.z1 + m.dz }; return fits(b) && !blocks(b) && !hits(b, g); });
    if (!ok) { g.drop = true; continue; }
    const old = { ...g.b }; g.b.x0 += ok.dx; g.b.x1 += ok.dx; g.b.z0 += ok.dz; g.b.z1 += ok.dz; g.m = ok; moved.push({ old, m: ok });
  }
  const drop = new Set(), shift = new Map();
  for (const g of groups) for (const i of g.ids) { if (g.drop) drop.add(i); else if (g.m) shift.set(i, g.m); }
  for (let i = n - 1; i >= 0; i--) {
    if (drop.has(i)) { rec.splice(i, 1); continue; }
    const m = shift.get(i); if (!m) continue;
    const [t, a] = rec[i];
    if (t === "b") { a[0] += m.dx; a[1] += m.dx; a[4] += m.dz; a[5] += m.dz; }
    else for (let k = 0; k < 4; k++) a[k] = [a[k][0] + m.dx, a[k][1], a[k][2] + m.dz];
  }
  const fix = (sp) => {
    if (!sp) return;
    for (const { old, m } of moved) if (sp[0] > old.x0 - 1.3 && sp[0] < old.x1 + 1.3 && sp[1] > old.z0 - 1.3 && sp[1] < old.z1 + 1.3) { sp[0] += m.dx; sp[1] += m.dz; break; }
    if (sp[0] > CX0 - 0.3 && sp[0] < CX1 + 0.3 && sp[1] < CZ) sp[0] = sp[0] < DX ? CX0 - 0.4 : CX1 + 0.4;
  };
  fix(spots.worker); spots.extra.forEach(fix);
}

/* ---------------- furniture, by kind ---------------- */
const lift = (hex, k) => "#" + C(hex).lerp(C("#ffffff"), k).getHexString();   // a colour washed toward white, to tint a texture
const STOCK = ["#c23b2a", "#2f5d8c", "#e0b040", "#3f7a4a", "#e8e2d6", "#8a3b6a", "#d9772a", "#56a0c0"];
function gondola(o, x0, x1, z, palette) {   // shelving with stock on both faces
  o.box(x0, x1, 0, 0.12, z - 0.44, z + 0.44, "#3a3a40", { tex: "steel" });   // the base
  o.box(x0 + 0.05, x1 - 0.05, 0.12, 1.7, z - 0.03, z + 0.03, "#ffffff", { tex: "peg", uvs: 2, solid: false });   // pegboard spine
  o.box(x0, x1, 0.12, 1.7, z - 0.02, z + 0.02, "#8a8a90", { solid: true });
  for (const x of [x0, x1 - 0.06]) o.box(x, x + 0.06, 0, 1.78, z - 0.44, z + 0.44, "#b8b8be", { tex: "steel", solid: false });   // the uprights
  o.box(x0, x1, 1.7, 1.78, z - 0.1, z + 0.1, "#b8b8be", { tex: "steel", solid: false });
  for (let y = 0.42; y < 1.65; y += 0.4) {
    o.box(x0 + 0.06, x1 - 0.06, y - 0.03, y, z - 0.42, z + 0.42, "#d0d0d4", { tex: "steel", solid: false });
    for (const sd of [-1, 1]) {   // a price strip on the lip, then the stock in facings
      const zl = z + sd * 0.42, zf = z + sd * 0.405;
      o.box(x0 + 0.06, x1 - 0.06, y - 0.07, y, Math.min(zl, zf + sd * 0.025), Math.max(zl, zf + sd * 0.025), "#f2efe6", { solid: false });
      for (let x = x0 + 0.1; x < x1 - 0.2;) {
        const c = palette[(o.R() * palette.length) | 0], wv = 0.09 + o.R() * 0.1, h = 0.12 + o.R() * 0.2, n = 1 + ((o.R() * 4) | 0), dz = 0.18 + o.R() * 0.12;
        for (let k = 0; k < n && x + wv < x1 - 0.1; k++, x += wv + 0.015) o.box(x, x + wv, y, y + h, sd < 0 ? z - 0.4 : z + 0.4 - dz, sd < 0 ? z - 0.4 + dz : z + 0.4, lift(c, 0.15), { tex: o.R() < 0.3 ? "bottle" : "pack", fit: true, solid: false });
        x += 0.03 + o.R() * 0.05;
      }
    }
  }
  o.box(x1 - 0.02, x1 + 0.005, 1.0, 1.55, z - 0.3, z + 0.3, "#c23b2a", { solid: false });   // the end-cap card
}
function stools(o, x0, x1, z, seat = "#b8302a") { for (let x = x0; x < x1; x += 0.9) { o.box(x - 0.05, x + 0.05, 0, 0.7, z - 0.05, z + 0.05, "#9a9aa0", { solid: false }); o.box(x - 0.2, x + 0.2, 0.7, 0.8, z - 0.2, z + 0.2, seat, { solid: false }); } }
function sofa(o, x, z, len, col, back) {
  const c = lift(col, 0.1), bz0 = back ? z + 0.65 : z, bz1 = back ? z + 0.85 : z + 0.2;
  o.box(x, x + len, 0.06, 0.3, z, z + 0.85, c, { tex: "fabric", uvs: 3 }); for (const fx of [x + 0.05, x + len - 0.1]) o.box(fx, fx + 0.05, 0, 0.06, z + 0.1, z + 0.75, "#2a2420", { solid: false });
  for (let k = 0; k < Math.max(1, Math.round(len / 0.9)); k++) { const a = x + 0.1 + k * (len - 0.2) / Math.max(1, Math.round(len / 0.9)), b = a + (len - 0.2) / Math.max(1, Math.round(len / 0.9)) - 0.03; o.box(a, b, 0.3, 0.45, back ? z + 0.02 : z + 0.22, back ? z + 0.64 : z + 0.83, c, { tex: "fabric", uvs: 3, shade: 1.05, solid: false }); }   // cushions
  o.box(x, x + len, 0.3, 0.95, bz0, bz1, c, { tex: "fabric", uvs: 3, shade: 0.9, solid: false });
  for (const ax of [x, x + len - 0.12]) o.box(ax, ax + 0.12, 0.3, 0.62, z, z + 0.85, c, { tex: "fabric", uvs: 3, shade: 0.95, solid: false });   // arms
}
function plant(o, x, z) { o.box(x - 0.22, x + 0.22, 0, 0.42, z - 0.22, z + 0.22, "#6a4a32"); o.box(x - 0.32, x + 0.32, 0.42, 1.25, z - 0.32, z + 0.32, "#3f7a4a", { solid: false }); o.box(x - 0.2, x + 0.2, 1.25, 1.55, z - 0.2, z + 0.2, "#4f8a5a", { solid: false }); }
function rug(o, x0, x1, z0, z1, col) { o.quad([x0, 0.012, z0], [x1, 0.012, z0], [x1, 0.012, z1], [x0, 0.012, z1], o.C(col)); }
function counter(o, x0, x1, z0, z1, top = "#2a2a2e", body = "#6a4a32") {
  o.box(x0 + 0.04, x1 - 0.04, 0, 0.1, z0 + 0.04, z1 - 0.04, "#1e1c1a", { solid: false });   // the toe kick
  o.box(x0, x1, 0.1, 0.98, z0, z1, lift(body, 0.45), { tex: "wooddark" });
  for (let x = x0 + 0.6; x < x1 - 0.3; x += 0.6) { o.box(x - 0.012, x + 0.012, 0.16, 0.92, z0 - 0.012, z0, "#2a2018", { solid: false }); o.box(x - 0.012, x + 0.012, 0.16, 0.92, z1, z1 + 0.012, "#2a2018", { solid: false }); }   // panel joints
  o.box(x0 - 0.05, x1 + 0.05, 0.98, 1.05, z0 - 0.05, z1 + 0.05, lift(top, 0.25), { tex: "steel", solid: false });
}
function register(o, x, z) {   // till, screen, card reader
  o.box(x - 0.25, x + 0.25, 1.05, 1.17, z - 0.2, z + 0.2, "#2a2a2e", { solid: false }); o.box(x - 0.2, x + 0.2, 1.17, 1.21, z - 0.16, z + 0.1, "#4a4a52", { solid: false });
  o.box(x - 0.04, x + 0.04, 1.17, 1.4, z + 0.08, z + 0.14, "#2a2a2e", { solid: false }); o.box(x - 0.2, x + 0.2, 1.36, 1.6, z + 0.12, z + 0.16, "#1a1a1e", { solid: false }); o.box(x - 0.17, x + 0.17, 1.39, 1.57, z + 0.115, z + 0.12, "#3fa0c0", { glow: true, solid: false });
  o.box(x + 0.35, x + 0.47, 1.05, 1.11, z - 0.12, z + 0.06, "#2a2a2e", { solid: false }); o.box(x + 0.37, x + 0.45, 1.11, 1.12, z - 0.08, z, "#7ad07a", { glow: true, solid: false });
}
function fridges(o, x0, x1, z0, z1, wallX) {   // glass-door coolers along a side wall: lit inside, stocked, steel frames
  o.box(x0, x1, 0, 0.12, z0, z1, "#2a2a2e", { solid: true }); o.box(x0, x1, 2.12, 2.45, z0, z1, "#e8e8ec", { tex: "steel" });
  o.box(x0 + 0.02, x0 + 0.06, 2.18, 2.38, z0 + 0.3, z1 - 0.3, "#3fa0c0", { glow: true, solid: false });   // the lit header
  o.box(wallX - 0.06, wallX, 0.12, 2.12, z0, z1, "#cfe6f2", { glow: true, solid: false });   // the lit back
  for (let z = z0; z < z1 - 0.3; z += 0.85) {
    const za = z + 0.04, zb = Math.min(z1, z + 0.85) - 0.04;
    for (let y = 0.4; y < 2.0; y += 0.42) {
      o.box(x0 + 0.1, wallX - 0.06, y - 0.02, y, za, zb, "#e8f2f6", { glow: true, solid: false });
      for (let q = za + 0.03; q < zb - 0.08; q += 0.085) { const c = ["#c23b2a", "#2f5d8c", "#e0b040", "#3f7a4a", "#e8e2d6", "#d9772a", "#56a0c0"][(o.R() * 7) | 0]; for (let r = 0; r < 3; r++) o.box(x0 + 0.14 + r * 0.16, x0 + 0.2 + r * 0.16, y, y + 0.22 + (q * 7 % 1) * 0.08, q, q + 0.065, lift(c, 0.2), { tex: "bottle", fit: true, glow: true, solid: false }); }
    }
    o.box(x0 - 0.02, x0 + 0.04, 0.12, 2.12, z, z + 0.05, "#b8b8be", { tex: "steel", solid: false });   // the door frames
    o.box(x0 - 0.06, x0 - 0.02, 0.8, 1.5, zb - 0.12, zb - 0.08, "#d8d8dc", { solid: false });   // handles
  }
  o.box(x0 - 0.02, x0 + 0.04, 0.12, 2.12, z1 - 0.05, z1, "#b8b8be", { tex: "steel", solid: false });
  o.box(x0, wallX, 0.12, 2.12, z0, z1, "#000", { solid: true, glow: true, skip: true });
}
const FURNISH = {
  // all the shops with shelves: a register by the door, stock by kind, fridges or racks along the side
  store(o) {
    const { w, d, R, kind } = o;
    counter(o, 0.5, 3.2, 1.5, 2.2); register(o, 1.55, 1.8);
    o.spots.worker = [1.8, 0.85, 0];
    const pal = { pharmacy: ["#e8e2d6", "#56a0c0", "#c23b2a", "#ffffff"], hardware: ["#d9772a", "#7a7a80", "#3f7a4a", "#c9a14a"], surf: ["#56a0c0", "#e0b040", "#ff6fa8"], pawn: ["#c9a14a", "#7a7a80", "#2a2a2e"] }[kind] || STOCK;
    if (kind === "pawn" || kind === "checks") {   // glass cases and a counter with a screen
      for (let z = 3.2; z < d - 1.5; z += 2.2) { o.box(1.5, w - 1.5, 0, 0.9, z, z + 0.7, "#5a3c28"); o.box(1.5, w - 1.5, 0.9, 1.2, z, z + 0.7, "#9fc4dc", { solid: false, glow: true }); }
      for (let x = 1; x < w - 1; x += 0.9) { o.box(x, x + 0.25, 1.2, 2.2, d - 0.18, d - 0.1, kind === "pawn" ? ["#8a5a2a", "#c9a14a", "#2a2a2e"][(R() * 3) | 0] : "#2f5d8c", { solid: false }); }   // guitars, tools
      if (kind === "checks") { o.box(1, w - 1, 1.05, 2.6, d - 2.2, d - 2.12, "#9fc4dc", { solid: false, glow: true }); counter(o, 1, w - 1, d - 2.6, d - 2.2); o.spots.worker = [w / 2, d - 1.2, Math.PI]; }
    } else if (kind === "surf") {
      for (let x = 1; x < w - 1; x += 0.8) o.box(x, x + 0.5, 0.2, 2.4, d - 0.25, d - 0.15, pal[(R() * pal.length) | 0], { solid: false });   // boards on the back wall
      for (let z = 3.5; z < d - 2; z += 2.4) gondola(o, 3.5, w - 1.5, z, ["#2f5d8c", "#e8e2d6", "#2a2a2e"]);
    } else {
      for (let z = 3.6; z < d - 1.8; z += 2.4) gondola(o, 3.8, w - 1.7, z, pal);
      if (kind === "store" || kind === "pharmacy") {   // the fridges, lit
        fridges(o, w - 0.95, w - 0.02, 2, d - 0.4, w - 0.02);
      }
    }
    o.plaque("l", d / 2, 1.4, 0.6, 2.2, o.board([kind === "pharmacy" ? "PHARMACY" : kind === "hardware" ? "TOOLS" : kind === "checks" ? "NO CHECKS OVER $500" : "SALE", "2 FOR $1"], { bg: "#c23b2a", fg: "#fff" }));
    o.plaque("f", w - 2, 1, 0.5, 2.6, o.board(["OPEN", "24 HRS"], { bg: "#20232a", fg: "#ff6fa8", big: 13 }), true);
    o.spots.extra.push([5.5, 2.8, Math.PI / 2], [w - 2.4, d - 1.6, 0]);
  },
  cafe(o) { FURNISH.diner(o, true); },
  diner(o, small) {
    const { w, d } = o;
    counter(o, 1, w - 1, d - 2.6, d - 2, "#c23b2a", "#e8e4dc"); stools(o, 1.6, w - 1.4, d - 3.1);
    o.box(0.3, w - 0.3, 1.2, 2.2, d - 0.4, d - 0.1, "#b8b0a0", { solid: false }); o.box(1, 2.2, 1.05, 1.4, d - 2.5, d - 2.1, "#9a9aa0", { solid: false });   // the pass, the coffee machine
    for (let x = 1; x < w - 3; x += 3.2) { o.box(x + 0.5, x + 1.7, 0.72, 0.78, 1.55, 2.45, "#e8e4dc"); o.box(x + 1.05, x + 1.15, 0, 0.72, 1.95, 2.05, "#9a9aa0", { solid: false }); sofa(o, x + 0.3, 0.6, 2, "#b8302a", false); if (!small) sofa(o, x + 0.3, 2.5, 2, "#b8302a", true); }
    o.plaque("b", w / 2, 2.4, 0.6, 2.45, o.board(["MENU", "PIE $1.25  COFFEE 50c  BURGER $2"], { bg: "#1a1a1e", fg: "#f2c14e" }));
    o.plaque("l", d / 2, 0.5, 0.5, 2.2, o.board(["12:47"], { bg: "#f4e9d2", fg: "#1a1a1e" }));
    o.fan(w / 2, d / 2 - 1); o.fan(w / 2 - 4, d / 2 - 1);
    o.spots.worker = [w / 2, d - 1.3, Math.PI]; o.spots.extra.push([2.2, d - 3.6, Math.PI], [w - 3, 1.6, Math.PI / 2]);
  },
  bar(o) {
    const { w, d, R } = o;
    counter(o, 1, w - 1, d - 2.4, d - 1.8, "#2a1a10", "#4a2a1a"); stools(o, 1.5, w - 1.4, d - 2.9, "#2a2a2e");
    for (let y = 1.2; y < 2.6; y += 0.5) { o.box(0.5, w - 0.5, y, y + 0.04, d - 0.45, d - 0.1, "#3a2416", { solid: false }); for (let x = 0.7; x < w - 0.7; x += 0.22) o.box(x, x + 0.08, y + 0.04, y + 0.3 + R() * 0.1, d - 0.34, d - 0.26, ["#3f7a4a", "#8a5a2a", "#c9a14a", "#6a2a2a"][(R() * 4) | 0], { solid: false, glow: R() < 0.15 }); }
    o.box(w / 2 - 1.2, w / 2 + 1.2, 0, 0.8, 2.2, 3.6, "#4a2a1a"); o.box(w / 2 - 1.1, w / 2 + 1.1, 0.8, 0.86, 2.3, 3.5, "#2f6e3a", { solid: false });   // the pool table
    o.box(0.3, 1.1, 0, 1.6, 1, 1.6, "#c94a8a", { glow: true }); o.box(0.35, 1.05, 1.0, 1.4, 1.55, 1.62, "#ffe090", { glow: true, solid: false });   // the jukebox
    o.plaque("b", w / 2, 2.2, 0.5, 2.75, o.board(["COLD BEER"], { bg: "#20232a", fg: "#56d6e0", big: 14 }), true);
    o.plaque("l", d / 2, 1, 1.3, 1.3, o.board(["DARTS"], { bg: "#1a1a1e", fg: "#c23b2a" }));
    o.fan(w / 2, d / 2 - 1);
    o.spots.worker = [w / 2, d - 1.1, Math.PI]; o.spots.extra.push([2, d - 3.3, Math.PI], [w / 2 + 1.8, 2.9, -Math.PI / 2]);
  },
  laundry(o) {
    const { w, d } = o;
    for (let z = 2; z < d - 1; z += 0.9) { o.box(0.2, 1.0, 0, 0.95, z, z + 0.8, "#e8e8e4"); o.box(1.0, 1.02, 0.35, 0.75, z + 0.2, z + 0.6, "#2a3440", { solid: false }); o.box(w - 1, w - 0.2, 0, 0.95, z, z + 0.8, "#e8e8e4"); o.box(w - 1.02, w - 1.0, 0.35, 0.75, z + 0.2, z + 0.6, "#2a3440", { solid: false }); }
    o.box(w / 2 - 1, w / 2 + 1, 0, 0.45, d / 2, d / 2 + 0.5, "#6a6a70"); o.box(w / 2 - 0.6, w / 2 + 0.6, 0.75, 1.0, d - 0.5, d - 0.1, "#c9a14a", { solid: false });
    o.plaque("b", w / 2, 1.6, 0.6, 2.3, o.board(["WASH 75c", "DRY 25c / 10 MIN"], { bg: "#f4e9d2", fg: "#2f5d8c" }));
    o.spots.worker = [w / 2, d - 1, Math.PI]; o.spots.extra.push([w / 2 + 0.3, d / 2 + 1.1, 0]);
  },
  barber(o) {
    const { w, d } = o;
    for (let z = 2; z < d - 1.5; z += 2) { o.box(w - 1.3, w - 0.7, 0, 0.5, z, z + 0.6, "#2a2a2e"); o.box(w - 1.3, w - 0.65, 0.5, 1.2, z, z + 0.6, "#b8302a"); o.box(w - 0.1, w - 0.05, 1.0, 2.2, z - 0.3, z + 0.9, "#cfe3f0", { solid: false, glow: true }); }
    sofa(o, 0.3, 1.5, 2.5, "#4a4a52", false); o.plaque("l", 4, 0.4, 1.4, 1, o.board(["", ""], { bg: "#c23b2a", w: 16, h: 64 }));
    o.plaque("b", w / 2, 1.8, 0.6, 2.3, o.board(["CUTS $3", "SHAVE $2"], { bg: "#1a2b3c", fg: "#f2c14e" }));
    o.spots.worker = [w - 1.8, 2.6, -Math.PI / 2]; o.spots.extra.push([1.2, 2.6, 0]);
  },
  hotel(o) {
    const { w, d } = o;
    counter(o, w / 2 - 3, w / 2 + 3, d - 3.2, d - 2.5, "#2a2a2e", "#5a3a24");
    rug(o, 3, w - 3, 2.5, d - 4.5, "#8a2a2a"); sofa(o, 2, 3, 3, "#2e4a6e", false); sofa(o, w - 5, 3, 3, "#2e4a6e", false); o.box(w / 2 - 0.8, w / 2 + 0.8, 0, 0.45, 3.4, 4.2, "#3a2a20");
    plant(o, 1, 1); plant(o, w - 1, 1); plant(o, 1, d - 1);
    for (const x of [1.5, w - 3.5]) { o.box(x, x + 2, 0, 2.6, d - 0.14, d - 0.06, "#b8b8bc", { solid: false }); o.box(x + 0.98, x + 1.02, 0, 2.6, d - 0.15, d - 0.13, "#555", { solid: false }); }   // the lifts
    o.plaque("b", w / 2, 2, 0.45, 2.7, o.board(["RECEPTION"], { bg: "#1a2b3c", fg: "#f2c14e", big: 12 }));
    o.spots.worker = [w / 2, d - 1.8, Math.PI]; o.spots.extra.push([3.5, 2.4, 0]);
  },
  motel(o) {
    const { w, d } = o;
    o.box(0.5, 2.6, 0, 0.5, d - 2.6, d - 0.3, "#e8e2d6"); o.box(0.5, 2.6, 0.5, 0.58, d - 2.6, d - 0.3, "#8a3b2a", { solid: false }); o.box(0.6, 2.5, 0.58, 0.7, d - 0.8, d - 0.35, "#ffffff", { solid: false });   // the bed
    o.box(2.8, 3.4, 0, 0.6, d - 0.8, d - 0.3, "#6a4a32"); o.box(2.95, 3.25, 0.6, 1.0, d - 0.65, d - 0.45, "#e0c890", { glow: true });
    o.box(w - 1, w - 0.3, 0, 0.8, 2, 3.2, "#6a4a32"); o.box(w - 0.9, w - 0.4, 0.8, 1.3, 2.3, 2.9, "#1a1a1e"); o.box(w - 0.92, w - 0.9, 0.85, 1.25, 2.35, 2.85, "#4a7aa8", { solid: false, glow: true });
    o.box(w - 2.2, w, 0, H, d - 2.2, d - 2.1, "#c8b898"); o.plaque("l", 3, 0.8, 0.6, 1.6, o.board(["~"], { bg: "#3a6a8a", fg: "#f4e9d2" }));
    o.spots.worker = [w - 1.6, 1.6, -Math.PI / 2];
  },
  apartment(o) {
    const { w, d, R } = o;
    rug(o, 1, 4, d - 5, d - 3.2, "#8a6a4a");
    sofa(o, 1, d - 3, 3, ["#4a5a7a", "#7a4a3a", "#3a5a4a"][(R() * 3) | 0], true); o.box(1.5, 3.5, 0, 0.4, d - 4.6, d - 3.8, "#6a4a32");
    o.box(1, 3.6, 0, 0.6, 1.2, 1.6, "#3a3036"); o.box(1.6, 3.0, 0.6, 1.4, 1.3, 1.4, "#111"); o.box(1.65, 2.95, 0.65, 1.35, 1.27, 1.29, "#4a7aa8", { solid: false, glow: true });
    o.box(w - 0.8, w - 0.1, 0, 0.95, 1.5, d - 1, "#d8d2c8"); o.box(w - 0.7, w - 0.1, 1.5, 2.3, 1.5, d - 1, "#b8b0a0", { solid: false }); o.box(w - 0.85, w - 0.1, 0.95, 1.0, 1.5, d - 1, "#4a4a52", { solid: false });
    o.box(w - 3.5, w - 1.3, 0, 0.75, 3, 4, "#6a4a32"); for (const z of [2.6, 4.4]) o.box(w - 2.6, w - 2.2, 0, 0.45, z - 0.2, z + 0.2, "#4a3a2a", { solid: false });   // table and chairs
    plant(o, 0.6, d - 0.6); o.plaque("l", 3, 1, 0.7, 1.5, o.board(["", ""], { bg: ["#c23b2a", "#2f5d8c", "#e0b040"][(R() * 3) | 0] })); o.fan(w / 2, d / 2);
    o.spots.worker = [2.5, d - 2.2, Math.PI];
  },
  house(o) { FURNISH.apartment(o); },
  office(o) {
    const { w, d } = o;
    counter(o, w / 2 - 2, w / 2 + 2, d / 2 - 0.4, d / 2 + 0.4, "#1a1a1e", "#3a3a40"); o.box(w / 2 - 0.8, w / 2 - 0.2, 1.05, 1.45, d / 2 - 0.2, d / 2 + 0.2, "#1a1a1e", { solid: false });
    for (const x of [2, w - 4.5]) { o.box(x, x + 2.5, 0, 2.8, d - 0.14, d - 0.06, "#b8b8bc", { solid: false }); o.box(x + 1.23, x + 1.27, 0, 2.8, d - 0.15, d - 0.13, "#555", { solid: false }); }
    sofa(o, 1, 2, 3, "#2a2a2e", false); plant(o, 1, d - 1); plant(o, w - 1, d - 1); plant(o, w - 1, 1);
    o.plaque("l", d / 2, 1.6, 1.2, 1.2, o.board(["DIRECTORY", "FLOOR 2 ... 14"], { bg: "#1a1a1e", fg: "#e8e2d6" }));
    o.spots.worker = [w / 2, d / 2 + 1.1, Math.PI]; o.spots.extra.push([2.5, 3.5, Math.PI]);
  },
  warehouse(o) {
    const { w, d, R } = o;
    for (let x = 6; x < w - 3; x += 6) for (let z = 5; z < d - 2; z += 6) o.box(x - 0.25, x + 0.25, 0, H, z - 0.25, z + 0.25, "#7a766e");
    for (let i = 0; i < 12; i++) { const x = 2 + R() * (w - 5), z = 3 + R() * (d - 5), h = 1 + ((R() * 3) | 0) * 0.9; o.box(x, x + 1.4, 0.14, h, z, z + 1.2, ["#e8d8b8", "#d8c098", "#b8c4cc"][(R() * 3) | 0], { tex: "crate", uvs: 1.4 }); o.box(x - 0.02, x + 1.42, h - 0.08, h, z - 0.02, z + 1.22, "#8a6a44", { tex: "crate", solid: false }); o.box(x + 0.05, x + 1.35, 0, 0.14, z + 0.05, z + 1.15, "#a08060", { tex: "crate", solid: false }); }
    o.box(1, 2.2, 0, 1.6, d - 2, d - 1, "#d9a441"); o.box(1.1, 2.1, 1.6, 2.4, d - 1.9, d - 1.1, "#2a2a2e", { solid: false });   // a forklift, sort of
    o.spots.worker = [3, d - 3, Math.PI];
  },
  garage(o) { FURNISH.warehouse(o); },
  hall(o) {
    const { w, d } = o;
    o.box(w / 2 - 1.5, w / 2 + 1.5, 0, 0.4, d - 2.5, d - 0.5, "#5a3c28"); o.box(w / 2 - 0.3, w / 2 + 0.3, 0.4, 1.5, d - 1.6, d - 1.2, "#3a2a20");   // the stage and the lectern
    for (let z = 2.5; z < d - 3.5; z += 1.2) for (let x = 1.5; x < w - 1.5; x += 0.8) if (Math.abs(x - w / 2) > 0.8) { o.box(x, x + 0.45, 0.42, 0.46, z, z + 0.45, "#7a7a80", { solid: false }); o.box(x, x + 0.45, 0.46, 0.95, z + 0.4, z + 0.45, "#7a7a80", { solid: false }); }
    o.plaque("b", w / 2, 3, 0.8, 2.3, o.board(["LOCAL 9", "AN INJURY TO ONE IS AN INJURY TO ALL"], { bg: "#8a2a2a", fg: "#f4e9d2" }));
    o.spots.worker = [w / 2, d - 1.2, Math.PI];
  },
  theatre(o) {
    const { w, d } = o;
    o.box(1, w - 1, 0.8, 3.1, d - 0.3, d - 0.12, "#f0ead8", { solid: false, glow: true });   // the screen
    o.box(0.5, w - 0.5, 0, 0.5, d - 2, d - 0.3, "#3a1a1e");
    for (let z = 4; z < d - 4; z += 1.2) for (const [a, b] of [[1.5, w / 2 - 0.8], [w / 2 + 0.8, w - 1.5]]) { o.box(a, b, 0, 0.48, z, z + 0.5, "#8a2a2a"); o.box(a, b, 0.48, 1.0, z + 0.4, z + 0.55, "#8a2a2a", { solid: false }); }
    o.plaque("l", 2.5, 1.2, 1.6, 1, o.board(["NOW SHOWING", "THE LONG TIDE"], { bg: "#1a1a1e", fg: "#f2c14e" }));
    o.spots.worker = [1.5, 2.2, 0]; o.spots.extra.push([w / 2 - 2, 8.3, 0], [w / 2 + 3, 10.7, 0]);
  }
};
