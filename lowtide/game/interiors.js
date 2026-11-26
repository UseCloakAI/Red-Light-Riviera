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
import { Nav, Routines, sitPose, hipHeight } from "./routines.js?v=dev";
/* the island's channels: each a loop on one clock (see "television") */
const CHANNELS = [{ n: 2, name: "WMK 6", list: ["news", "cola"] }, { n: 4, name: "SPIN CITY", list: ["spin", "lawyer"] }, { n: 6, name: "PIER PATROL", list: ["gull", "cola"] },
  { n: 11, name: "SEAGRAPE CLASSICS", list: ["movie"] }, { n: 13, name: "AFTER HOURS", list: ["lawyer", "cola"] }];
const TV0 = Math.random() * 100000, TVCLOCK = () => TV0 + performance.now() / 1000;

const ORIGIN = { x: 4200, z: 4200 }, H = 3.3;
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const C = (h) => new THREE.Color(h);
const STORES = ["store", "pharmacy", "hardware", "pawn", "surf", "checks"];
export const LABEL = { home: "Home", store: "Store", pharmacy: "Pharmacy", hardware: "Hardware", pawn: "Pawn & Loan", surf: "Surf Shop", checks: "Checks Cashed", cafe: "Café", diner: "Nite Owl Diner", bar: "Bar", laundry: "Laundromat", barber: "Barber", hotel: "Hotel", motel: "Seagrape Motor Inn", apartment: "Apartments", office: "Lobby", warehouse: "Warehouse", garage: "Garage", house: "House", hall: "Longshore Hall", theatre: "Palm Square Theatre" };
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
    case "cream": fill("#efe6d4"); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "120,100,70" : "255,255,255"},${0.06 * r()})`; g.fillRect((r() * 32) | 0, (r() * 32) | 0, 2, 2); } break;   // fresh plaster
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
    this.mats = new Map(); this.people = []; this.fans = []; this.tvs = []; this.watch = null;
    // Hollis's place: the apartment (or house) nearest where she starts. On the map; nobody else lives there.
    this.home = this.list.find((e) => e.home) || null;   // picked by the world (home.js)
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
    if (this.watch) { this.showPrompt(null, camera); return this.watchKeys(input); }
    const busy = this.fadeT > 0 || (this.vehicles && this.vehicles.driving);
    const seat = busy ? null : this.seatNear();
    if (seat) { const I = this.inside; this.showPrompt({ x: I.ox + seat.x, z: I.oz + seat.z, seat: true, name: seat.does === "watch" && this.tvs.some((t) => t.cinema) ? "Watch the picture" : "Watch TV" }, camera); if (input.hit("KeyE")) { this.startWatch(seat); return true; } return false; }
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
    const v = new THREE.Vector3(n.x, (n.exit || n.seat ? (n.seat ? -0.9 : 0) : this.heightAt0(n.x, n.z)) + 2.1, n.z).project(camera);
    if (!isFinite(v.x) || !isFinite(v.y) || v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return off();
    el.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(0)}px)`;
    el.querySelector("span").textContent = n.exit ? "Leave" : n.name || LABEL[n.kind] || "Enter";
    if (!this.pOn) { el.classList.add("on"); this.pOn = true; if (this.on) this.on("near-door"); }
  }
  cut(fn) { this.fadeEl.classList.add("on"); this.fadeT = 0.3; this.then = () => { fn(); setTimeout(() => this.fadeEl.classList.remove("on"), 60); }; if (this.sfx.door) this.sfx.door(); }

  enter(e) {
    const R = rng(e.seed), kind = e.home ? "home" : e.kind;
    // the room is the building: the unit's width along the street, its depth back from the front
    let w = THREE.MathUtils.clamp(e.u1 - e.u0, 3.5, 30), d = THREE.MathUtils.clamp(e.depth, 4, 30), uR = e.u1;
    if (e.home) { w = Math.min(w, 12); d = Math.min(d, 10); uR = THREE.MathUtils.clamp(e.door + w / 2, e.u0 + w, e.u1); }   // her unit, not the whole building
    this.inside = { e, w, d, kind, R, t: 0, greeted: false, doorX: THREE.MathUtils.clamp(uR - e.door, 0.9, w - 0.9), ox: ORIGIN.x - w / 2, oz: ORIGIN.z, uL: uR - w, uR };
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
    this.tone = this.sfx.roomTone ? this.sfx.roomTone(STORES.includes(kind) ? "store" : kind === "home" ? "apartment" : kind) : null;
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
    for (const o of this.solid) this.world.grid.remove(o); this.solid = []; this.fans = []; this.clearTV();
    if (this.gore && this.gore.clearNear) this.gore.clearNear(ORIGIN.x, ORIGIN.z, 60);
    if (this.fx && this.fx.clearNear) this.fx.clearNear(ORIGIN.x, ORIGIN.z, 60);
    for (const pd of this.people) { pd.h.group.visible = false; pd.inUse = false; if (pd.dead) { pd.dead = false; pd.rag = null; } pd.hp = 100; pd.stagger = 0; pd.down = 0; pd.free = null; }
    this.people = [];
    if (this.tone) { this.tone.stop(); this.tone = null; }
  }
  tickInside(dt) {
    const I = this.inside; I.t += dt;
    if (this.camera) this.tickTV(dt, this.camera.position);
    for (const f of this.fans) f.rotation.y += dt * 5;
    const P = this.player.pos;
    let alarm = false;
    for (const pd of this.people) { if (pd.dead) { alarm = true; if (pd.rag && pd.rag.step(dt)) pd.rag.pose(); } else if (pd.hp < 100) alarm = true; }
    if (I.rout) { I.rout.playerPos = P; I.rout.tick(dt, P, alarm); }
    const w = this.people.find((q) => q.worker && !q.dead);
    if (w && !I.greeted && I.t > 0.9) { I.greeted = true; const L = GREET[I.kind]; if (L && this.say) this.say(L[(I.R() * L.length) | 0], w); }
  }

  /* ---------------- television ---------------- */
  /* Five channels, each a loop of shows on one clock for the whole island: every set tuned to a channel shows
     the same moment of it, and flipping over drops you in mid-show, like real TV. Pictures are pre-rendered
     (media/tv, made by tools/tv); the sound comes from the set, fading with distance, under the master and
     effects volume; close up, the lines show as subtitles. The theatre only ever shows the picture. */
  tvData() { return Interiors.tvD || (Interiors.tvD = fetch(new URL("../media/tv/shows.json", import.meta.url)).then((r) => r.json()).catch(() => ({ shows: {} }))); }
  tvNow(ch, D) {   // which show the channel is on right now, and how far in
    const C = CHANNELS[ch], ds = C.list.map((id) => (D.shows[id] || { dur: 30 }).dur), tot = ds.reduce((x, y) => x + y, 0);
    let t = (TVCLOCK() + ch * 311.7) % tot;
    for (let i = 0; i < ds.length; i++) { if (t < ds[i]) return [C.list[i], t, ds[i]]; t -= ds[i]; }
    return [C.list[0], 0, ds[0]];
  }
  addTV(a, ox, oz, g, R) {
    const [x0, x1, y0, y1, z0, z1, face, kind] = a, ax = face[1] === "x", sg = face[0] === "+" ? 1 : -1;
    const wv = ax ? z1 - z0 : x1 - x0, hv = y1 - y0;
    const cx = ox + (ax ? (sg > 0 ? x1 : x0) + sg * 0.004 : (x0 + x1) / 2), cz = oz + (ax ? (z0 + z1) / 2 : (sg > 0 ? z1 : z0) + sg * 0.004);
    const v = document.createElement("video"); v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", "");
    const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const sc = document.createElement("canvas"); sc.width = 64; sc.height = 48; const st = new THREE.CanvasTexture(sc); st.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshBasicMaterial({ map: st, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wv, hv), mat); mesh.position.set(cx, (y0 + y1) / 2, cz);
    mesh.rotation.y = ax ? sg * Math.PI / 2 : sg > 0 ? 0 : Math.PI; g.add(mesh);
    const cinema = kind === "cinema";
    const T = { v, tex, st, sc, mat, mesh, pos: new THREE.Vector3(cx, (y0 + y1) / 2, cz), n: new THREE.Vector3(ax ? sg : 0, 0, ax ? 0 : sg), wv, hv,
      ch: cinema ? 3 : [0, 0, 1, 2, 4][(R() * 5) | 0], snow: 0.5, line: -1, cinema, seek: null };
    v.addEventListener("ended", () => this.tvTune(T, true));
    v.addEventListener("loadedmetadata", () => { if (T.seek != null) { try { v.currentTime = Math.min(T.seek, Math.max(0, v.duration - 0.5)); } catch (e) { /* not seekable yet */ } T.seek = null; } });
    this.tvs.push(T); this.tvTune(T);
  }
  // put the set on whatever its channel is showing this second
  tvTune(T, ended) {
    this.tvData().then((D) => {
      if (!this.tvs.includes(T)) return;
      let [show, at, dur] = this.tvNow(T.ch, D);
      if (ended && show === T.show) { at = 0; }   // the clock and the tape disagree by a hair at the end: start it again from the top
      if (show === T.show && T.v.src && Math.abs(T.v.currentTime - at) < 2.5 && !ended) return;
      if (show === T.show && T.v.src && T.v.readyState >= 1) { try { T.v.currentTime = at; } catch (e) { /* */ } }
      else { T.show = show; T.line = -1; T.seek = at; T.v.src = new URL("../media/tv/" + show + ".mp4", import.meta.url).href; T.v.load(); }
      if (!this.tvPaused) this.tvPlay(T);
    });
  }
  tvPlay(T) { const p = T.v.play(); if (p && p.catch) p.catch(() => { T.v.muted = true; T.v.play().catch(() => {}); }); }
  tvChannel(T, to) {
    if (T.cinema) return;
    const n = CHANNELS.length; T.ch = to != null ? to : (T.ch + n) % n; T.snow = 0.35; T.v.pause(); this.tvTune(T); this.osd(T);
    if (this.sfx.click) this.sfx.click();
  }
  osd(T) {
    const C = CHANNELS[T.ch]; if (!this.osdEl) { this.osdEl = document.createElement("div"); this.osdEl.className = "tv-osd"; this.osdEl.style.cssText = "position:absolute;right:6%;top:9%;font:900 46px/1 Archivo,monospace;color:#7CFF8A;text-shadow:0 0 8px #2f8,3px 3px 0 #000;opacity:0;transition:opacity .25s;pointer-events:none;z-index:30"; this.root.appendChild(this.osdEl); }
    this.osdEl.innerHTML = `${C.n}<div style="font:800 15px Archivo,sans-serif;letter-spacing:.08em;margin-top:4px">${C.name}</div>`; this.osdEl.style.opacity = 1;
    clearTimeout(this.osdT); this.osdT = setTimeout(() => { this.osdEl.style.opacity = 0; }, 2200);
  }
  tickTV(dt, cam) {
    if (!this.tvs.length) return;
    const S = window.LT_SET, vol = S ? (S.get("master") ?? 100) / 100 * (S.get("sfx") ?? 100) / 100 : 1, subs = !S || S.get("subtitles") !== false;
    let near = this.watch ? this.watch.T : null, nd = 7;
    for (const T of this.tvs) {
      const d = this.watch && this.watch.T === T ? 1.2 : cam.distanceTo(T.pos);
      T.v.volume = Math.max(0, Math.min(1, vol * (T.cinema ? 1 : 0.85) / (1 + (d / (T.cinema ? 7 : 3.2)) ** 2)));
      if (T.snow > 0 || T.v.readyState < 2) {   // between channels, or still tuning: snow
        T.snow -= dt; const x = T.sc.getContext("2d"), im = x.createImageData(64, 48);
        for (let k = 0; k < im.data.length; k += 4) { const c = (Math.random() * 255) | 0; im.data[k] = im.data[k + 1] = im.data[k + 2] = c; im.data[k + 3] = 255; }
        x.putImageData(im, 0, 0); T.st.needsUpdate = true; if (T.mat.map !== T.st) { T.mat.map = T.st; T.mat.needsUpdate = true; }
        if (T.snow <= 0 && T.v.paused && !this.tvPaused && T.v.readyState >= 2) this.tvPlay(T);
      } else if (T.mat.map !== T.tex) { T.mat.map = T.tex; T.mat.needsUpdate = true; }
      if (!near && d < nd && T.snow <= 0) { nd = d; near = T; }
    }
    if (near && subs && this.hud && this.hud.subtitle && near.snow <= 0) this.tvData().then((D) => {   // the nearest set's lines, as subtitles
      const sh = D.shows && D.shows[near.show]; if (!sh) return;
      const t = near.v.currentTime, k = sh.lines.findIndex((l) => t >= l[0] && t <= l[1]);
      if (k >= 0 && k !== near.line) { near.line = k; this.hud.subtitle(sh.lines[k][2] + ": " + sh.lines[k][3]); }
    });
  }
  pauseTV(on) { this.tvPaused = on; for (const T of this.tvs) { if (on) T.v.pause(); else this.tvPlay(T); } }
  clearTV() { this.endWatch(true); for (const T of this.tvs) { T.v.pause(); T.v.removeAttribute("src"); T.v.load(); T.tex.dispose(); T.st.dispose(); T.mat.dispose(); T.mesh.geometry.dispose(); } this.tvs = []; }

  /* ---------------- sitting down to watch ---------------- */
  /* any seat that faces a set (the sofa, the motel bed, a theatre seat): E sits Hollis down, the camera eases
     in on the screen with the room still round it, and the set is yours: A/D (or the arrows, or the wheel)
     flips channels, 1-5 picks one, E (or W, S, Space) gets you up. */
  seatNear() {
    const I = this.inside; if (!I || !I.acts || this.watch || !this.tvs.length) return null;
    const P = this.player.pos; let best = null, bd = 1.25;
    for (const a of I.acts) {
      if (a.type !== "sit" || a.does !== "watch" || (I.rout && I.rout.busy.has(a))) continue;
      const d = Math.hypot(P.x - (I.ox + a.x), P.z - (I.oz + a.z)); if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  startWatch(a) {
    const I = this.inside, sx = I.ox + a.x, sz = I.oz + a.z, fx = Math.sin(a.face || 0), fz = Math.cos(a.face || 0);
    let T = null, bs = -1; for (const t of this.tvs) { const dx = t.pos.x - sx, dz = t.pos.z - sz, d = Math.hypot(dx, dz) || 1, sc = (dx * fx + dz * fz) / d / (1 + d * 0.05); if (sc > bs) { bs = sc; T = t; } }
    if (!T) return;
    if (I.rout) I.rout.busy.add(a);
    const P = this.player; P.vel.set(0, 0, 0); P.yaw = a.face || 0; P.pos.set(sx - fx * 0.12, 0, sz - fz * 0.12);
    this.watch = { a, T, k: 0, out: false, from: this.camera.position.clone(), look: new THREE.Vector3() };
    if (!this.bar) { this.bar = document.createElement("div"); this.bar.style.cssText = "position:absolute;left:50%;bottom:7%;transform:translateX(-50%);font:700 14px Archivo,sans-serif;color:#F7F2EA;background:rgba(10,10,10,.6);padding:8px 14px;border-radius:6px;white-space:nowrap;pointer-events:none;z-index:30;opacity:0;transition:opacity .3s"; this.root.appendChild(this.bar); }
    this.bar.innerHTML = T.cinema ? "<kbd>E</kbd> Get up" : "<kbd>A</kbd> <kbd>D</kbd> Channel &nbsp;·&nbsp; <kbd>1</kbd>-<kbd>5</kbd> Pick one &nbsp;·&nbsp; <kbd>E</kbd> Get up"; this.bar.style.opacity = 1;
    if (!T.cinema) this.osd(T);
  }
  endWatch(now) {
    const W = this.watch; if (!W) return;
    if (now) { if (this.inside && this.inside.rout) this.inside.rout.busy.delete(W.a); this.watch = null; if (this.bar) this.bar.style.opacity = 0; this.player.pos.y = 0; return; }
    W.out = true; if (this.bar) this.bar.style.opacity = 0;
  }
  get watching() { return !!this.watch; }
  // the controls while seated; true when a key was used
  watchKeys(input) {
    const W = this.watch; if (!W || W.out) return true;
    if (input.hit("KeyE") || input.hit("Space") || input.hit("KeyW") || input.hit("KeyS")) { this.endWatch(); return true; }
    let dir = 0; if (input.hit("KeyA") || input.hit("ArrowLeft")) dir = -1; if (input.hit("KeyD") || input.hit("ArrowRight")) dir = 1;
    if (input.wheel) { dir = Math.sign(input.wheel); input.wheel = 0; }
    if (dir) this.tvChannel(W.T, W.T.ch + dir);
    for (let k = 1; k <= CHANNELS.length; k++) if (input.hit("Digit" + k)) this.tvChannel(W.T, k - 1);
    return true;
  }
  // after the clips: Hollis on the seat
  poseWatcher(dt) {
    const W = this.watch; if (!W) return;
    const P = this.player, model = P.model; if (!model) return;
    if (!W.body) { const bones = []; model.traverse((o) => { if (o.isBone) bones.push(o); }); W.body = { h: { group: model, bones } }; }
    W.sit = Math.max(0, Math.min(1, (W.sit || 0) + (W.out ? -dt * 2.5 : dt * 2.2)));
    model.position.copy(P.pos); model.rotation.set(0, P.yaw, 0);
    sitPose(W.body, W.sit);
    model.position.y = ((W.a.seat ?? 0.45) + 0.08 - hipHeight(W.body)) * W.sit;
  }
  // after the follow camera: ease in on the screen, room and all; ease back out when you get up
  watchCam(camera, dt) {
    const W = this.watch; if (!W) return;
    W.k = Math.max(0, Math.min(1, W.k + (W.out ? -dt * 1.6 : dt * 0.9)));
    if (W.out && W.k <= 0 && (W.sit || 0) <= 0) { this.endWatch(true); return; }
    const T = W.T, fov = THREE.MathUtils.degToRad(camera.fov), dist = Math.max(T.hv / 0.5, T.wv / 0.5 / camera.aspect) / (2 * Math.tan(fov / 2));
    const s = W.a, I = this.inside, sx = I.ox + s.x, sz = I.oz + s.z;
    const away = new THREE.Vector3(sx - T.pos.x, 0, sz - T.pos.z); if (away.lengthSq() < 0.01) away.copy(T.n); away.normalize();
    const eye = T.pos.clone().addScaledVector(away, Math.min(dist, Math.hypot(sx - T.pos.x, sz - T.pos.z) + 0.3)); eye.y = T.pos.y + 0.08;
    const e = W.k * W.k * (3 - 2 * W.k);
    camera.position.lerp(eye, e); W.look.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3())).lerp(T.pos, e); camera.lookAt(W.look);
  }

  /* ---------------- the rooms ---------------- */
  build(I, st) {
    const { w, d, kind, R } = I, g = new THREE.Group(), layers = new Map();
    const ox = ORIGIN.x - w / 2, oz = ORIGIN.z;
    const DX = I.doorX; I.exit = { x: ox + DX, z: oz + 0.9 };
    const lamps = []; for (let x = 2; x < w - 1; x += 4) for (let z = 2; z < d - 1; z += 4) lamps.push([x, z]);
    const dim = { home: 0.82, bar: 0.55, theatre: 0.45, warehouse: 0.72, garage: 0.72, hall: 0.85, motel: 0.75, apartment: 0.8, house: 0.8 }[kind] || 1;
    const warm = { home: C("#ffdcb0"), bar: C("#ffb070"), theatre: C("#ffa070"), motel: C("#ffd0a0"), apartment: C("#ffe0b8"), house: C("#ffe0b8"), hotel: C("#ffe4c0") }[kind] || C("#fff8ec");
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
    const FLOOR = { diner: "checker", cafe: "checker", barber: "checker", bar: "plank", laundry: "tile", hotel: "carpet", pawn: "tile", surf: "tile", motel: "bluecarpet", apartment: "plank", house: "plank", home: "plank", office: "tile", warehouse: "concrete", garage: "concrete", theatre: "carpet", hall: "plank", checks: "tile" }[kind] || "tile";
    const WALL = { diner: "walltile", cafe: "stripe", bar: "wood", laundry: "walltile", barber: "walltile", hotel: "stripe", motel: "paint", apartment: "stripe", house: "stripe", office: "paint", home: "cream", warehouse: "metal", garage: "concrete", theatre: "damask", hall: "brick", pawn: "brick", surf: "wood" }[kind] || "paint";
    const fs = FLOOR === "tile" ? 1 : 2;   // metres a texture repeat
    quad([0, 0, 0], [w, 0, 0], [w, 0, d], [0, 0, d], C("#ffffff"), { tex: FLOOR, shade: 0.95, uv: [[0, 0], [w / fs, 0], [w / fs, d / fs], [0, d / fs]] });
    const wallCol = C("#ffffff");
    const wall = (x0, z0, x1, z1, inset) => {
      const L = Math.hypot(x1 - x0, z1 - z0), ix = inset[0], iz = inset[1];
      quad([x0, 0, z0], [x1, 0, z1], [x1, H, z1], [x0, H, z0], wallCol, { tex: WALL, shade: 0.88, uv: [[0, 0], [L / 2, 0], [L / 2, H / 2], [0, H / 2]] });
      quad([x0 + ix, 0, z0 + iz], [x1 + ix, 0, z1 + iz], [x1 + ix, 0.14, z1 + iz], [x0 + ix, 0.14, z0 + iz], C("#3a3430"));   // skirting, just proud of the wall
      if (["diner", "cafe", "hotel", "apartment", "house", "bar", "hall", "home"].includes(kind))   // a dado rail
        quad([x0 + ix, 0.95, z0 + iz], [x1 + ix, 0.95, z1 + iz], [x1 + ix, 1.02, z1 + iz], [x0 + ix, 1.02, z0 + iz], C(kind === "diner" ? "#c23b2a" : "#6a4a32"));
    };
    wall(0, 0, w, 0, [0, 0.02]); wall(w, 0, w, d, [-0.02, 0]); wall(w, d, 0, d, [0, -0.02]); wall(0, d, 0, 0, [0.02, 0]);
    for (const [x0, z0, x1, z1] of [[-0.5, -0.5, w + 0.5, 0], [w, -0.5, w + 0.5, d + 0.5], [-0.5, d, w + 0.5, d + 0.5], [-0.5, -0.5, 0, d + 0.5]]) solid(x0, x1, z0, z1, 6);
    const ceilTex = kind === "warehouse" || kind === "garage" ? "concrete" : "ceil";
    quad([0, H, 0], [w, H, 0], [w, H, d], [0, H, d], C("#ffffff"), { tex: ceilTex, shade: 0.75, uv: [[0, 0], [w / 1.2, 0], [w / 1.2, d / 1.2], [0, d / 1.2]] });
    for (const [lx, lz] of lamps) {
      if (["bar", "apartment", "house", "motel", "hotel", "theatre", "home"].includes(kind)) { box(lx - 0.18, lx + 0.18, H - 0.55, H - 0.3, lz - 0.18, lz + 0.18, warm.clone(), { glow: true, solid: false }); box(lx - 0.015, lx + 0.015, H - 0.3, H, lz - 0.015, lz + 0.015, "#222", { solid: false }); }   // hanging lamps
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
      const ws = I.e.ws || 0, u0 = I.uL ?? I.e.u0, u1 = I.uR ?? I.e.u1;
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
    const act = (type, x, z, opt = {}) => { const y = opt.y ?? 0.4; rec.push(["s", [x - 0.02, x + 0.02, y, y + 0.04, z - 0.02, z + 0.02, { type, ...opt }]]); };
    F({ w, d, R, box: (...a) => rec.push(["b", a]), quad: (...a) => rec.push(["q", a]), tv: (...a) => rec.push(["t", a]), act, plaque, board, C, H, kind, fan, spots });
    keepDoorClear(rec, spots, w, d, DX);
    const screens = [], acts = [], walls = [];
    for (const [t, a] of rec) {
      if (t === "b") { box(...a); if ((!a[7] || a[7].solid !== false) && a[2] < 1.6 && !(a[7] && a[7].skip && a[7].solid === false)) walls.push([Math.min(a[0], a[1]), Math.max(a[0], a[1]), Math.min(a[4], a[5]), Math.max(a[4], a[5])]); }
      else if (t === "t") screens.push(a);
      else if (t === "s") acts.push({ x: (a[0] + a[1]) / 2, z: (a[4] + a[5]) / 2, ...a[6] });
      else quad(...a);
    }
    I.acts = acts; I.nav = new Nav(w, d, walls);
    for (const a of screens) this.addTV(a, ox, oz, g, R);
    // geometry, one mesh per texture
    for (const L of layers.values()) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(L.p, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(L.c, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(L.u, 2));
      const mesh = new THREE.Mesh(geo, L.key.startsWith("board") ? new THREE.MeshBasicMaterial({ map: L.map, vertexColors: true, side: THREE.DoubleSide, toneMapped: !L.glow, ...flat() }) : this.mat(L.key, L.map, L.glow));
      mesh.frustumCulled = false; g.add(mesh);
    }
    this.scene.add(g); this.group = g;
    // people: the worker (or a resident), and a customer or two
    const place = (spot, worker, key) => {
      if (st && st.dead.has(key)) return null;   // they died here; their body's still where it fell
      if (spot && (spot[0] < 0.4 || spot[0] > w - 0.4 || spot[1] < 0.4 || spot[1] > d - 0.4)) return null;   // the room's too small for them
      const pd = this.npcs && this.npcs.find((q) => !q.inUse && !q.dead); if (!pd) return null;
      pd.inUse = true; pd.worker = worker; pd.spotKey = key; pd.face = spot ? spot[2] ?? Math.PI : 0; this.people.push(pd);
      const g2 = pd.h.group; if (spot) g2.position.set(ox + spot[0], 0, oz + spot[1]); g2.rotation.y = pd.face; g2.visible = true; pd.hp = 100; pd.mode = null; pd.sitK = 0;
      return pd;
    };
    /* who's in: the one who works here (or lives here) and the customers, each with something to do */
    const home = kind === "apartment" || kind === "house" || kind === "motel" || kind === "home";
    const CROWD = { diner: [["sitter", 4]], cafe: [["sitter", 3]], bar: [["sitter", 2], ["pool", 1]], laundry: [["sitter", 1], ["shopper", 1]], barber: [["sitter", 2]], hotel: [["sitter", 2]], office: [["sitter", 1]], theatre: [["sitter", 4]], hall: [["sitter", 3]], warehouse: [], garage: [], apartment: [], house: [], motel: [], home: [] }[kind] || [["shopper", 2]];
    const cast = [];
    if (spots.worker && !(home && R() < 0.3)) { const pd = place(home ? null : spots.worker, true, "w"); if (pd) cast.push({ pd, role: home ? "sitter" : ["diner", "cafe"].includes(kind) ? "waiter" : "clerk", act: home ? acts.find((a) => a.type === "sit" && a.does === "watch") : null }); }
    let n = 0; for (const [role, k] of CROWD) for (let i = 0; i < k; i++) { const pd = place(null, false, "e" + n++); if (pd) cast.push({ pd, role }); }
    const wk = cast.find((c) => c.pd.worker);
    I.rout = new Routines({ room: { w, d, door: [DX, 0.9], leaves: !home && kind !== "theatre" }, nav: I.nav, acts, kind, R, ox, oz, people: cast, worker: wk && wk.pd,
      home: spots.worker ? [spots.worker[0], spots.worker[1]] : null, homeFace: spots.worker ? spots.worker[2] : 0, say: (t, pd) => this.say && this.say(t, pd) });
    for (const c of cast) if (c.role === "clerk" || (c.role === "waiter")) { c.pd.mode = "stand"; c.pd.wait = 10 + R() * 10; c.pd.h.group.rotation.y = spots.worker[2] ?? 0; }
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
    if (t !== "q") return { x0: Math.min(a[0], a[1]), x1: Math.max(a[0], a[1]), y0: a[2], y1: a[3], z0: Math.min(a[4], a[5]), z1: Math.max(a[4], a[5]) };
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
    if (t !== "q") { a[0] += m.dx; a[1] += m.dx; a[4] += m.dz; a[5] += m.dz; }
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
  for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.3) { o.act("shelf", x, z, { oz: -0.8, face: 0, hi: o.R() < 0.4 }); o.act("shelf", x, z, { oz: 0.8, face: Math.PI, hi: o.R() < 0.4 }); }
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
function stools(o, x0, x1, z, seat = "#b8302a", does = "drink") { for (let x = x0; x < x1; x += 0.9) { o.act("sit", x, z, { y: 0.72, seat: 0.82, face: 0, does }); o.box(x - 0.05, x + 0.05, 0, 0.7, z - 0.05, z + 0.05, "#9a9aa0", { solid: false }); o.box(x - 0.2, x + 0.2, 0.7, 0.8, z - 0.2, z + 0.2, seat, { solid: false }); } }
function sofa(o, x, z, len, col, back, does = "wait") {
  const c = lift(col, 0.1), bz0 = back ? z + 0.65 : z, bz1 = back ? z + 0.85 : z + 0.2;
  for (let k = 0; k < Math.max(1, Math.floor(len / 0.8)); k++) o.act("sit", x + (k + 0.5) * len / Math.max(1, Math.floor(len / 0.8)), back ? z + 0.38 : z + 0.5, { y: 0.32, seat: 0.45, face: back ? Math.PI : 0, does });
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
/* a TV: a dark cabinet with a bezel, its screen (face: which way it looks, "+z" "-z" "+x" "-x") filled by the game */
function tvSet(o, x0, x1, y0, y1, z0, z1, face, wall = false) {
  o.box(x0, x1, y0, y1, z0, z1, "#18181c", { solid: !wall });
  const m = 0.05, ax = face[1] === "x";
  const s = ax ? [x0, x1, y0 + m, y1 - m, z0 + m, z1 - m] : [x0 + m, x1 - m, y0 + m, y1 - m, z0, z1];
  o.tv(...s, face);
  if (!wall) o.box((x0 + x1) / 2 - 0.12, (x0 + x1) / 2 + 0.12, y0 - 0.04, y0, (z0 + z1) / 2 - 0.1, (z0 + z1) / 2 + 0.1, "#18181c", { solid: false });
}
function fridges(o, x0, x1, z0, z1, wallX) {   // glass-door coolers along a side wall: lit inside, stocked, steel frames
  o.box(x0, x1, 0, 0.12, z0, z1, "#2a2a2e", { solid: true }); o.box(x0, x1, 2.12, 2.45, z0, z1, "#e8e8ec", { tex: "steel" });
  o.box(x0 + 0.02, x0 + 0.06, 2.18, 2.38, z0 + 0.3, z1 - 0.3, "#3fa0c0", { glow: true, solid: false });   // the lit header
  o.box(wallX - 0.06, wallX, 0.12, 2.12, z0, z1, "#cfe6f2", { glow: true, solid: false });   // the lit back
  for (let z = z0; z < z1 - 0.3; z += 0.85) {
    if (((z - z0) / 0.85 | 0) % 2 === 0) o.act("shelf", x0 + 0.3, z + 0.42, { ox: -0.95, face: Math.PI / 2, hi: true });
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
    counter(o, 0.5, 3.2, 1.5, 2.2); register(o, 1.55, 1.8); o.act("pay", 1.55, 1.85, { oz: 0.8, face: Math.PI });
    o.spots.worker = [1.8, 0.85, 0];
    const pal = { pharmacy: ["#e8e2d6", "#56a0c0", "#c23b2a", "#ffffff"], hardware: ["#d9772a", "#7a7a80", "#3f7a4a", "#c9a14a"], surf: ["#56a0c0", "#e0b040", "#ff6fa8"], pawn: ["#c9a14a", "#7a7a80", "#2a2a2e"] }[kind] || STOCK;
    if (kind === "pawn" || kind === "checks") {   // glass cases and a counter with a screen
      for (let z = 3.2; z < d - 1.5; z += 2.2) { for (let x = 2; x < w - 1.8; x += 1.4) o.act("shelf", x, z + 0.35, { oz: -0.8, face: 0 }); o.box(1.5, w - 1.5, 0, 0.9, z, z + 0.7, "#5a3c28"); o.box(1.5, w - 1.5, 0.9, 1.2, z, z + 0.7, "#9fc4dc", { solid: false, glow: true }); }
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
    counter(o, 1, w - 1, d - 2.6, d - 2, "#c23b2a", "#e8e4dc"); stools(o, 1.6, w - 1.4, d - 3.1, "#b8302a", "eat");
    o.box(0.3, w - 0.3, 1.2, 2.2, d - 0.4, d - 0.1, "#b8b0a0", { solid: false }); o.box(1, 2.2, 1.05, 1.4, d - 2.5, d - 2.1, "#9a9aa0", { solid: false });   // the pass, the coffee machine
    for (let x = 1; x < w - 3; x += 3.2) { o.box(x + 0.5, x + 1.7, 0.72, 0.78, 1.55, 2.45, "#e8e4dc"); o.box(x + 1.05, x + 1.15, 0, 0.72, 1.95, 2.05, "#9a9aa0", { solid: false }); sofa(o, x + 0.3, 0.6, 2, "#b8302a", false, "eat"); if (!small) sofa(o, x + 0.3, 2.5, 2, "#b8302a", true, "eat"); }
    o.plaque("b", w / 2, 2.4, 0.6, 2.45, o.board(["MENU", "PIE $1.25  COFFEE 50c  BURGER $2"], { bg: "#1a1a1e", fg: "#f2c14e" }));
    o.plaque("l", d / 2, 0.5, 0.5, 2.2, o.board(["12:47"], { bg: "#f4e9d2", fg: "#1a1a1e" }));
    tvSet(o, 0.02, 0.16, 2.1, 2.7, 1.2, 2.1, "+x", true);   // the corner TV nobody asked for
    o.fan(w / 2, d / 2 - 1); o.fan(w / 2 - 4, d / 2 - 1);
    o.spots.worker = [w / 2, d - 1.3, Math.PI]; o.spots.extra.push([2.2, d - 3.6, Math.PI], [w - 3, 1.6, Math.PI / 2]);
  },
  bar(o) {
    const { w, d, R } = o;
    counter(o, 1, w - 1, d - 2.4, d - 1.8, "#2a1a10", "#4a2a1a"); stools(o, 1.5, w - 1.4, d - 2.9, "#2a2a2e");
    for (let y = 1.2; y < 2.6; y += 0.5) { o.box(0.5, w - 0.5, y, y + 0.04, d - 0.45, d - 0.1, "#3a2416", { solid: false }); for (let x = 0.7; x < w - 0.7; x += 0.22) o.box(x, x + 0.08, y + 0.04, y + 0.3 + R() * 0.1, d - 0.34, d - 0.26, ["#3f7a4a", "#8a5a2a", "#c9a14a", "#6a2a2a"][(R() * 4) | 0], { solid: false, glow: R() < 0.15 }); }
    o.box(w / 2 - 1.2, w / 2 + 1.2, 0, 0.8, 2.2, 3.6, "#4a2a1a"); o.box(w / 2 - 1.1, w / 2 + 1.1, 0.8, 0.86, 2.3, 3.5, "#2f6e3a", { solid: false });   // the pool table
    o.act("pool", w / 2 - 1.0, 2.9, { ox: -0.6, face: Math.PI / 2 }); o.act("pool", w / 2 + 1.0, 2.9, { ox: 0.6, face: -Math.PI / 2 }); o.act("pool", w / 2, 3.4, { oz: 0.7, face: Math.PI });
    o.box(0.3, 1.1, 0, 1.6, 1, 1.6, "#c94a8a", { glow: true }); o.box(0.35, 1.05, 1.0, 1.4, 1.55, 1.62, "#ffe090", { glow: true, solid: false });   // the jukebox
    o.plaque("b", w / 2, 2.2, 0.5, 2.75, o.board(["COLD BEER"], { bg: "#20232a", fg: "#56d6e0", big: 14 }), true);
    o.plaque("l", d / 2, 1, 1.3, 1.3, o.board(["DARTS"], { bg: "#1a1a1e", fg: "#c23b2a" }));
    if (d > 9) tvSet(o, 0.02, 0.16, 2.0, 2.7, d - 5.1, d - 3.9, "+x", true);   // the game's on, or the news
    o.fan(w / 2, d / 2 - 1);
    o.spots.worker = [w / 2, d - 1.1, Math.PI]; o.spots.extra.push([2, d - 3.3, Math.PI], [w / 2 + 1.8, 2.9, -Math.PI / 2]);
  },
  laundry(o) {
    const { w, d } = o;
    for (let z = 2; z < d - 1; z += 0.9) { o.box(0.2, 1.0, 0, 0.95, z, z + 0.8, "#e8e8e4"); o.box(1.0, 1.02, 0.35, 0.75, z + 0.2, z + 0.6, "#2a3440", { solid: false }); o.box(w - 1, w - 0.2, 0, 0.95, z, z + 0.8, "#e8e8e4"); o.box(w - 1.02, w - 1.0, 0.35, 0.75, z + 0.2, z + 0.6, "#2a3440", { solid: false }); }
    o.box(w / 2 - 1, w / 2 + 1, 0, 0.45, d / 2, d / 2 + 0.5, "#6a6a70"); for (const x of [w / 2 - 0.55, w / 2 + 0.55]) o.act("sit", x, d / 2 + 0.25, { y: 0.3, seat: 0.45, face: 0, does: "wait" });
    for (let z = 2.4; z < d - 1.5; z += 2.7) { o.act("stand", 0.6, z, { ox: 0.8, face: -Math.PI / 2 }); o.act("stand", w - 0.6, z, { ox: -0.8, face: Math.PI / 2 }); } o.box(w / 2 - 0.6, w / 2 + 0.6, 0.75, 1.0, d - 0.5, d - 0.1, "#c9a14a", { solid: false });
    o.plaque("b", w / 2, 1.6, 0.6, 2.3, o.board(["WASH 75c", "DRY 25c / 10 MIN"], { bg: "#f4e9d2", fg: "#2f5d8c" }));
    if (w > 5.5) tvSet(o, w - 1.55, w - 0.45, 2.05, 2.7, d - 0.16, d - 0.02, "-z", true);
    o.spots.worker = [w / 2, d - 1, Math.PI]; o.spots.extra.push([w / 2 + 0.3, d / 2 + 1.1, 0]);
  },
  barber(o) {
    const { w, d } = o;
    for (let z = 2; z < d - 1.5; z += 2) { o.act("sit", w - 1.0, z + 0.3, { y: 0.3, seat: 0.52, face: Math.PI / 2, does: "wait" }); o.box(w - 1.3, w - 0.7, 0, 0.5, z, z + 0.6, "#2a2a2e"); o.box(w - 1.3, w - 0.65, 0.5, 1.2, z, z + 0.6, "#b8302a"); o.box(w - 0.1, w - 0.05, 1.0, 2.2, z - 0.3, z + 0.9, "#cfe3f0", { solid: false, glow: true }); }
    sofa(o, 0.3, 1.5, 2.5, "#4a4a52", false); o.plaque("l", 4, 0.4, 1.4, 1, o.board(["", ""], { bg: "#c23b2a", w: 16, h: 64 }));
    o.plaque("b", w / 2, 1.8, 0.6, 2.3, o.board(["CUTS $3", "SHAVE $2"], { bg: "#1a2b3c", fg: "#f2c14e" }));
    tvSet(o, 0.4, 1.4, 2.1, 2.72, d - 0.16, d - 0.02, "-z", true);
    o.spots.worker = [w - 1.8, 2.6, -Math.PI / 2]; o.spots.extra.push([1.2, 2.6, 0]);
  },
  hotel(o) {
    const { w, d } = o;
    counter(o, w / 2 - 3, w / 2 + 3, d - 3.2, d - 2.5, "#2a2a2e", "#5a3a24");
    rug(o, 3, w - 3, 2.5, d - 4.5, "#8a2a2a"); sofa(o, 2, 3, 3, "#2e4a6e", false); sofa(o, w - 5, 3, 3, "#2e4a6e", false); o.box(w / 2 - 0.8, w / 2 + 0.8, 0, 0.45, 3.4, 4.2, "#3a2a20");
    plant(o, 1, 1); plant(o, w - 1, 1); plant(o, 1, d - 1);
    for (const x of [1.5, w - 3.5]) { o.box(x, x + 2, 0, 2.6, d - 0.14, d - 0.06, "#b8b8bc", { solid: false }); o.box(x + 0.98, x + 1.02, 0, 2.6, d - 0.15, d - 0.13, "#555", { solid: false }); }   // the lifts
    o.plaque("b", w / 2, 2, 0.45, 2.7, o.board(["RECEPTION"], { bg: "#1a2b3c", fg: "#f2c14e", big: 12 }));
    tvSet(o, 0.02, 0.16, 1.5, 2.3, 4.6, 6.0, "+x", true);
    o.spots.worker = [w / 2, d - 1.8, Math.PI]; o.spots.extra.push([3.5, 2.4, 0]);
  },
  motel(o) {
    const { w, d } = o;
    o.act("sit", 2.3, d - 1.5, { y: 0.3, seat: 0.55, face: Math.PI / 2, does: "watch" }); o.box(0.5, 2.6, 0, 0.5, d - 2.6, d - 0.3, "#e8e2d6"); o.box(0.5, 2.6, 0.5, 0.58, d - 2.6, d - 0.3, "#8a3b2a", { solid: false }); o.box(0.6, 2.5, 0.58, 0.7, d - 0.8, d - 0.35, "#ffffff", { solid: false });   // the bed
    o.box(2.8, 3.4, 0, 0.6, d - 0.8, d - 0.3, "#6a4a32"); o.box(2.95, 3.25, 0.6, 1.0, d - 0.65, d - 0.45, "#e0c890", { glow: true });
    o.box(w - 1, w - 0.3, 0, 0.8, 2, 3.2, "#6a4a32", { tex: "wooddark" }); tvSet(o, w - 0.9, w - 0.4, 0.84, 1.36, 2.25, 2.95, "-x");
    o.box(w - 2.2, w, 0, H, d - 2.2, d - 2.1, "#c8b898"); o.plaque("l", 3, 0.8, 0.6, 1.6, o.board(["~"], { bg: "#3a6a8a", fg: "#f4e9d2" }));
    o.spots.worker = [w - 1.6, 1.6, -Math.PI / 2];
  },
  apartment(o) {
    const { w, d, R } = o;
    const sl = Math.min(2.6, w - 1.3), sx = 0.45, tz = Math.max(4.2, d - 6.4), cx = sx + sl / 2;
    rug(o, sx, sx + sl, tz + 0.8, d - 3.2, "#8a6a4a");
    sofa(o, sx, d - 3, sl, ["#4a5a7a", "#7a4a3a", "#3a5a4a"][(R() * 3) | 0], true, "watch"); o.box(cx - 0.7, cx + 0.7, 0, 0.4, d - 4.4, d - 3.8, "#6a4a32", { tex: "wooddark" });
    o.box(cx - 0.9, cx + 0.9, 0, 0.55, tz, tz + 0.42, "#3a3036", { tex: "wooddark" }); tvSet(o, cx - 0.62, cx + 0.62, 0.59, 1.35, tz + 0.05, tz + 0.3, "+z");
    o.box(w - 0.8, w - 0.1, 0, 0.95, 1.5, d - 1, "#d8d2c8"); o.box(w - 0.7, w - 0.1, 1.5, 2.3, 1.5, d - 1, "#b8b0a0", { solid: false }); o.box(w - 0.85, w - 0.1, 0.95, 1.0, 1.5, d - 1, "#4a4a52", { solid: false });
    if (w > 4.5) { o.box(w - 3.5, w - 1.3, 0, 0.75, 3, 4, "#6a4a32", { tex: "wooddark" }); for (const z of [2.6, 4.4]) o.box(w - 2.6, w - 2.2, 0, 0.45, z - 0.2, z + 0.2, "#4a3a2a", { solid: false }); }   // table and chairs
    plant(o, 0.6, d - 0.6); o.plaque("l", 3, 1, 0.7, 1.5, o.board(["", ""], { bg: ["#c23b2a", "#2f5d8c", "#e0b040"][(R() * 3) | 0] })); o.fan(w / 2, d / 2);
    o.spots.worker = [2.5, d - 2.2, Math.PI];
  },
  house(o) { FURNISH.apartment(o); },
  /* Hollis's place: a one-bedroom on the ground floor, lived in. In from the door: coats on hooks, keys in a
     bowl. Left, the living room under the window: a sofa facing the TV on its console, a rug, a coffee table
     with the remote and a mug, an armchair, a floor lamp, a bookcase, a plant, the Ida May over the TV.
     Back left, the kitchen on its own tiles: fridge, counter, sink, stove and hood, cupboards, the kettle.
     A table for two in the middle under the pendant. Back right, behind a wall, the bedroom: a made bed,
     nightstands and lamps, a dresser. Front right, her corner: a desk with the inquiry papers spread on it,
     a corkboard, rods and a tackle box, a life ring, her pilot's licence. */
  home(o) {
    const { w, d, H, R } = o;
    if (w < 11 || d < 9) { FURNISH.apartment(o); o.spots.worker = null; return; }   // (a smaller unit: the plain flat)
    const B = (x0, x1, y0, y1, z0, z1, c, opt) => o.box(x0, x1, y0, y1, z0, z1, c, opt), nb = { solid: false };
    const legs = (x0, x1, z0, z1, h, c = "#4a3424", t = 0.05) => { for (const [x, z] of [[x0, z0], [x1 - t, z0], [x0, z1 - t], [x1 - t, z1 - t]]) B(x, x + t, 0, h, z, z + t, c, nb); };
    const lampTable = (x, z, y) => { B(x - 0.06, x + 0.06, y, y + 0.3, z - 0.06, z + 0.06, "#c9a14a", nb); B(x - 0.17, x + 0.17, y + 0.3, y + 0.55, z - 0.17, z + 0.17, "#ffe2a8", { glow: true, solid: false }); };
    // -- entry
    rug(o, 5.35, 6.65, 0.12, 1.1, "#6a4a32");
    B(4.05, 4.95, 1.62, 1.7, 0.04, 0.1, "#6a4a32", nb); for (const x of [4.2, 4.5, 4.8]) B(x - 0.02, x + 0.02, 1.5, 1.66, 0.06, 0.16, "#c9a14a", nb);   // hooks
    B(4.12, 4.48, 0.85, 1.55, 0.08, 0.26, "#3a4a5a", { tex: "fabric", uvs: 3, solid: false }); B(4.56, 4.86, 1.25, 1.5, 0.08, 0.2, "#c8b898", nb);   // her rain jacket, a cap
    legs(7.2, 8.4, 0.06, 0.46, 0.8); B(7.18, 8.42, 0.8, 0.85, 0.04, 0.48, "#6a4a32", { tex: "wooddark" }); B(7.4, 7.7, 0.85, 0.92, 0.15, 0.35, "#b8643a", nb); B(7.5, 7.58, 0.92, 0.95, 0.22, 0.28, "#c9a14a", nb);   // console, key bowl, keys
    o.plaque("f", 7.8, 0.7, 0.9, 1.25, o.board([""], { bg: "#9fb4c4", border: "#c9a14a", w: 32, h: 40 }));   // a mirror
    // -- living room
    rug(o, 1.0, 4.4, 1.5, 5.1, "#7a4a3a"); o.quad([1.2, 0.017, 1.7], [4.2, 0.017, 1.7], [4.2, 0.017, 4.9], [1.2, 0.017, 4.9], o.C("#a8704a"));   // a rug on a rug, a hair above it
    B(0.06, 0.52, 0, 0.55, 2.2, 4.4, "#ffffff", { tex: "wooddark" }); B(0.08, 0.5, 0.12, 0.42, 2.4, 3.25, "#1a1410", nb); B(0.08, 0.5, 0.12, 0.42, 3.35, 4.2, "#1a1410", nb);   // the console, its shelves
    B(0.2, 0.45, 0.42, 0.5, 2.55, 2.75, "#2a2a2e", nb); B(0.25, 0.4, 0.55, 0.57, 3.9, 4.1, "#c23b2a", nb);   // a VCR, a tape
    tvSet(o, 0.14, 0.34, 0.62, 1.38, 2.65, 3.95, "+x");
    o.plaque("l", 3.3, 1.1, 0.62, 1.7, o.board(["IDA MAY", "Pier 9  \u00b7  2019"], { bg: "#3a5a7a", fg: "#f4e9d2", border: "#c9a14a", big: 11 }));
    // the sofa, its back to the room, facing the set
    { const x0 = 2.85, z0 = 1.95, len = 2.5, c = "#556a7a";
      B(x0, x0 + 0.9, 0.08, 0.3, z0, z0 + len, c, { tex: "fabric", uvs: 3 });
      for (let k = 0; k < 3; k++) { const za = z0 + 0.14 + k * (len - 0.28) / 3, zb = za + (len - 0.28) / 3 - 0.03; B(x0 + 0.04, x0 + 0.68, 0.3, 0.45, za, zb, c, { tex: "fabric", uvs: 3, shade: 1.05, solid: false }); B(x0 + 0.64, x0 + 0.86, 0.45, 0.88, za, zb, c, { tex: "fabric", uvs: 3, shade: 0.92, solid: false }); o.act("sit", x0 + 0.36, (za + zb) / 2, { y: 0.32, seat: 0.45, face: -Math.PI / 2, does: "watch" }); }
      B(x0 + 0.7, x0 + 0.9, 0.3, 0.95, z0, z0 + len, c, { tex: "fabric", uvs: 3, shade: 0.85, solid: false });
      for (const z of [z0, z0 + len - 0.14]) B(x0, x0 + 0.9, 0.3, 0.62, z, z + 0.14, c, { tex: "fabric", uvs: 3, shade: 0.95, solid: false });
      B(x0 + 0.1, x0 + 0.5, 0.45, 0.72, z0 + 0.2, z0 + 0.5, "#c9a14a", { tex: "fabric", uvs: 4, solid: false });   // a cushion
      B(x0 + 0.06, x0 + 0.12, 0, 0.08, z0 + 0.06, z0 + 0.12, "#2a2018", nb); B(x0 + 0.78, x0 + 0.84, 0, 0.08, z0 + len - 0.12, z0 + len - 0.06, "#2a2018", nb); }
    legs(1.6, 2.4, 2.8, 3.8, 0.38); B(1.56, 2.44, 0.38, 0.44, 2.76, 3.84, "#ffffff", { tex: "woodlight", solid: true });   // coffee table
    B(1.75, 1.97, 0.44, 0.46, 2.95, 3.25, "#c23b2a", nb); B(1.78, 1.98, 0.46, 0.475, 3.0, 3.28, "#2f5d8c", nb);   // magazines
    B(2.12, 2.22, 0.44, 0.55, 3.45, 3.55, "#f4f0e6", nb); B(2.0, 2.06, 0.44, 0.47, 3.1, 3.26, "#1a1a1e", nb);   // a mug, the remote
    legs(3.0, 3.55, 1.38, 1.88, 0.55); B(2.98, 3.57, 0.55, 0.6, 1.36, 1.9, "#ffffff", { tex: "wooddark" }); lampTable(3.28, 1.63, 0.6);   // side table, its lamp
    { const c = "#8a5a3a"; B(2.55, 3.35, 0.1, 0.42, 4.95, 5.75, c, { tex: "fabric", uvs: 3 }); B(3.15, 3.35, 0.42, 1.0, 4.95, 5.75, c, { tex: "fabric", uvs: 3, shade: 0.9, solid: false }); for (const z of [4.95, 5.6]) B(2.55, 3.35, 0.42, 0.66, z, z + 0.15, c, { tex: "fabric", uvs: 3, shade: 0.95, solid: false }); B(2.6, 3.1, 0.42, 0.54, 5.1, 5.6, c, { tex: "fabric", uvs: 3, shade: 1.05, solid: false }); o.act("sit", 2.85, 5.35, { y: 0.3, seat: 0.5, face: -Math.PI / 2, does: "watch" }); }   // armchair
    B(4.22, 4.38, 0, 0.04, 5.52, 5.68, "#2a2622", nb); B(4.28, 4.32, 0.04, 1.55, 5.58, 5.62, "#2a2622", nb); B(4.15, 4.45, 1.55, 1.82, 5.45, 5.75, "#e8c890", { glow: true, solid: false }); B(4.13, 4.47, 1.82, 1.85, 5.43, 5.77, "#6a4a32", nb);   // floor lamp
    B(0.06, 0.4, 0, 2.0, 4.75, 6.15, "#ffffff", { tex: "wooddark" });   // the bookcase, stocked
    for (let y = 0.1; y < 1.9; y += 0.45) { B(0.4, 0.42, y, y + 0.03, 4.75, 6.15, "#3a2414", nb); for (let z = 4.8; z < 6.08;) { const bw = 0.04 + R() * 0.05, bh = 0.24 + R() * 0.14; if (R() < 0.12) { z += 0.12; continue; } B(0.1, 0.38, y + 0.03, y + 0.03 + bh, z, z + bw, ["#6a1a1a", "#1a3a6a", "#2a4a2a", "#8a6a2a", "#4a3a5a", "#d8d0c0"][(R() * 6) | 0], nb); z += bw + 0.008; } }
    plant(o, 0.45, 0.55); plant(o, 4.6, 0.5);
    o.fan(2.6, 3.3);
    // -- the table, in the middle
    legs(5.6, 6.6, 5.6, 6.6, 0.74); B(5.55, 6.65, 0.74, 0.79, 5.55, 6.65, "#ffffff", { tex: "woodlight", solid: true });
    for (const [za, zb, back] of [[4.95, 5.35, 4.95], [6.85, 7.25, 7.2]]) { legs(5.85, 6.35, za, zb, 0.45, "#4a3424", 0.04); B(5.83, 6.37, 0.45, 0.5, za, zb, "#6a4a32", nb); B(5.83, 6.37, 0.5, 0.95, back, back + 0.05, "#6a4a32", nb); }
    B(5.95, 6.25, 0.79, 0.86, 5.95, 6.25, "#e8e2d6", nb); for (const [x, z, c] of [[6.0, 6.0, "#d9772a"], [6.12, 6.08, "#c23b2a"], [6.05, 6.15, "#e0b040"]]) B(x, x + 0.08, 0.86, 0.94, z, z + 0.08, c, nb);   // a fruit bowl
    // -- the kitchen, on its own tiles
    o.quad([0.01, 0.008, 7.15], [4.7, 0.008, 7.15], [4.7, 0.008, d - 0.01], [0.01, 0.008, d - 0.01], o.C("#ffffff"), { tex: "checker", uv: [[0, 0], [4.7, 0], [4.7, d - 7.16], [0, d - 7.16]] });
    B(0.06, 0.88, 0, 1.9, d - 0.95, d - 0.05, "#e8e8e4"); B(0.06, 0.88, 1.2, 1.22, d - 0.96, d - 0.94, "#9a9aa0", nb); B(0.8, 0.84, 0.9, 1.15, d - 0.99, d - 0.96, "#9a9aa0", nb); B(0.8, 0.84, 1.3, 1.7, d - 0.99, d - 0.96, "#9a9aa0", nb);   // fridge
    B(0.9, 4.6, 0.1, 0.88, d - 0.62, d - 0.04, "#ffffff", { tex: "woodlight" }); B(0.92, 4.58, 0, 0.1, d - 0.56, d - 0.06, "#2a2018", nb);   // base cupboards
    for (let x = 0.9; x < 4.6; x += 0.6) B(x + 0.28, x + 0.32, 0.5, 0.56, d - 0.64, d - 0.62, "#c9a14a", nb);   // handles
    B(0.88, 4.62, 0.88, 0.93, d - 0.66, d - 0.03, "#e8e2d6", { tex: "steel" });   // the counter top
    B(1.25, 1.85, 0.9, 0.935, d - 0.55, d - 0.15, "#5a5e66", { tex: "steel", solid: false }); B(1.5, 1.56, 0.93, 1.2, d - 0.14, d - 0.1, "#c8c8cc", nb); B(1.5, 1.56, 1.16, 1.2, d - 0.3, d - 0.1, "#c8c8cc", nb);   // sink, tap
    B(2.4, 3.05, 0.93, 0.95, d - 0.58, d - 0.08, "#1a1a1e", nb); for (const [x, z] of [[2.55, 0.45], [2.88, 0.45], [2.55, 0.2], [2.88, 0.2]]) B(x - 0.07, x + 0.07, 0.95, 0.96, d - z - 0.07, d - z + 0.07, "#3a3a40", nb);   // stove top
    B(2.42, 3.03, 0.3, 0.78, d - 0.64, d - 0.62, "#1a1a1e", nb); B(2.5, 2.95, 0.72, 0.75, d - 0.67, d - 0.64, "#c8c8cc", nb);   // oven door, handle
    B(2.35, 3.1, 1.65, 2.05, d - 0.55, d - 0.04, "#c8c8cc", { tex: "steel", solid: false }); B(2.55, 2.9, 2.05, H, d - 0.3, d - 0.08, "#c8c8cc", { tex: "steel", solid: false });   // hood
    for (const [x0, x1] of [[0.9, 2.3], [3.15, 4.6]]) { B(x0, x1, 1.5, 2.25, d - 0.36, d - 0.04, "#ffffff", { tex: "woodlight", solid: false }); for (let x = x0 + 0.3; x < x1; x += 0.6) B(x - 0.02, x + 0.02, 1.55, 1.75, d - 0.38, d - 0.36, "#c9a14a", nb); }   // wall cupboards
    B(3.4, 3.6, 0.93, 1.13, d - 0.45, d - 0.25, "#c23b2a", nb); B(3.45, 3.55, 1.13, 1.17, d - 0.4, d - 0.3, "#2a2a2e", nb);   // kettle
    B(3.9, 4.25, 0.93, 1.12, d - 0.45, d - 0.22, "#c8c8cc", nb); B(1.95, 2.15, 0.93, 1.25, d - 0.3, d - 0.15, "#3f7a4a", nb);   // toaster, a bottle of something
    o.plaque("b", 0.5, 0.45, 0.6, 2.05, o.board(["TIDE", "COLA"], { bg: "#c8202e", fg: "#fff", big: 9, w: 32, h: 48 }));   // a calendar off a bottle cap
    // -- the bedroom, behind its wall
    B(7.92, 8.08, 0, H, 6.4, d - 0.02, "#ffffff", { tex: "cream" }); B(7.92, 8.08, 0, H, 4.3, 5.2, "#ffffff", { tex: "cream" }); B(7.92, 8.08, 2.25, H, 5.2, 6.4, "#ffffff", { tex: "cream", solid: false });
    B(8.08, w - 0.02, 0, H, 4.3, 4.45, "#ffffff", { tex: "cream" });
    rug(o, 8.8, 11.3, 6.0, 9.3, "#5a6a8a");
    B(w - 0.2, w - 0.05, 0, 1.15, 6.5, 8.5, "#ffffff", { tex: "wooddark" });   // headboard
    B(9.5, w - 0.2, 0, 0.35, 6.55, 8.45, "#ffffff", { tex: "wooddark" }); B(9.52, w - 0.22, 0.35, 0.55, 6.6, 8.4, "#f2ede2", nb);   // the bed, the mattress
    B(9.48, w - 0.75, 0.55, 0.64, 6.56, 8.44, "#2f5d8c", { tex: "fabric", uvs: 3, solid: false }); B(9.48, 9.52, 0.25, 0.64, 6.56, 8.44, "#2f5d8c", { tex: "fabric", uvs: 3, solid: false });   // the duvet, over the end
    for (const z of [6.7, 7.55]) B(w - 0.72, w - 0.25, 0.55, 0.72, z, z + 0.72, "#f4f0e6", { tex: "fabric", uvs: 4, solid: false });   // pillows
    for (const z of [5.9, 8.6]) { B(w - 0.55, w - 0.06, 0, 0.55, z, z + 0.48, "#ffffff", { tex: "wooddark" }); lampTable(w - 0.3, z + 0.24, 0.55); }
    B(8.4, 9.9, 0, 0.95, d - 0.55, d - 0.05, "#ffffff", { tex: "wooddark" }); for (let y = 0.2; y < 0.9; y += 0.25) B(8.45, 9.85, y, y + 0.02, d - 0.57, d - 0.55, "#2a1a10", nb);   // dresser
    o.plaque("b", 9.15, 0.8, 0.9, 1.15, o.board([""], { bg: "#9fb4c4", border: "#6a4a32", w: 32, h: 40 }));   // its mirror
    o.plaque("r", 7.5, 0.9, 0.6, 1.4, o.board(["PORT SALT", "1998"], { bg: "#d8c8a8", fg: "#3a2a1e", border: "#6a4a32", big: 9 }));   // over the bed: the old crew
    // -- her corner: the desk, the case, the gear
    legs(w - 0.75, w - 0.06, 1.1, 2.9, 0.75); B(w - 0.78, w - 0.04, 0.75, 0.8, 1.08, 2.92, "#ffffff", { tex: "woodlight", solid: true });
    for (const [z, a] of [[1.3, 0.04], [1.7, 0.07], [2.15, 0.02], [2.45, 0.05]]) B(w - 0.66, w - 0.3, 0.8, 0.81, z, z + 0.28 + a, "#f4f0e6", nb);   // papers
    lampTable(w - 0.25, 2.7, 0.8); B(w - 0.68, w - 0.48, 0.8, 0.92, 1.12, 1.25, "#2a2a2e", nb);   // lamp, a radio
    B(w - 1.35, w - 0.95, 0.45, 0.5, 1.75, 2.15, "#4a3a2a", nb); legs(w - 1.35, w - 0.95, 1.75, 2.15, 0.45, "#2a2018", 0.04); B(w - 1.35, w - 1.3, 0.5, 0.95, 1.75, 2.15, "#4a3a2a", nb);   // her chair
    o.plaque("r", 2.0, 1.4, 0.95, 1.25, o.board(["OTTOLINE", "11 BOXES?  WHO PAID PURCELL", "BRASK - LEFT THE COUNTRY"], { bg: "#b88a5a", fg: "#1a1410", border: "#5a3a22", big: 10, small: 5 }));   // the corkboard
    o.plaque("r", 3.6, 0.55, 0.42, 1.55, o.board(["HARBOR PILOT", "H. VANE", "REVOKED"], { bg: "#e8e2d6", fg: "#8a2a2a", big: 7, small: 6 }));
    B(8.95, 9.55, 0, 0.36, 3.6, 4.2, "#8a6a44", { tex: "crate" }); B(8.97, 9.53, 0.36, 0.38, 3.62, 4.18, "#f4f0e6", nb);   // the box of inquiry papers
    for (const [x, c] of [[8.3, "#2a2a2e"], [8.42, "#6a4a32"]]) B(x, x + 0.03, 0, 2.5, 4.18, 4.21, c, nb);   // rods against the wall
    B(8.55, 9.0, 0, 0.25, 3.85, 4.2, "#3f7a4a", { tex: "steel" });   // tackle box
    { const lr = o.board([""], { bg: "#e8e2d6", w: 32, h: 32 }), g = lr.image.getContext("2d"); g.fillStyle = "#e8e2d6"; g.fillRect(0, 0, 32, 32);
      for (let k = 0; k < 8; k++) { g.strokeStyle = k % 2 ? "#f4f0e6" : "#c23b2a"; g.lineWidth = 7; g.beginPath(); g.arc(16, 16, 11, k / 8 * Math.PI * 2, (k + 1) / 8 * Math.PI * 2); g.stroke(); }
      g.fillStyle = "#1a1a1a"; g.font = "bold 4px Arial"; g.textAlign = "center"; g.fillText("IDA MAY", 16, 30); lr.needsUpdate = true;
      o.plaque("r", 0.6, 0.62, 0.62, 1.45, lr); }   // the Ida May's life ring
    o.spots.worker = null;
  },
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
    for (let z = 2.5; z < d - 3.5; z += 1.2) for (let x = 1.5; x < w - 1.5; x += 0.8) if (Math.abs(x - w / 2) > 0.8) { o.box(x, x + 0.45, 0.42, 0.46, z, z + 0.45, "#7a7a80", { solid: false }); o.box(x, x + 0.45, 0.46, 0.95, z, z + 0.05, "#7a7a80", { solid: false }); o.act("sit", x + 0.22, z + 0.25, { y: 0.43, seat: 0.46, face: 0, does: "wait" }); }
    o.plaque("b", w / 2, 3, 0.8, 2.3, o.board(["LOCAL 9", "AN INJURY TO ONE IS AN INJURY TO ALL"], { bg: "#8a2a2a", fg: "#f4e9d2" }));
    o.spots.worker = [w / 2, d - 1.2, Math.PI];
  },
  theatre(o) {
    const { w, d } = o;
    o.box(0.9, w - 0.9, 0.7, 3.2, d - 0.14, d - 0.04, "#101012", { solid: false });   // the screen: a 2.4:1 picture in black masking
    { const sh = 2.3, sw = Math.min(w - 2, sh * 2.4), sh2 = sw / 2.4; o.tv(w / 2 - sw / 2, w / 2 + sw / 2, 1.95 - sh2 / 2, 1.95 + sh2 / 2, d - 0.3, d - 0.15, "-z", "cinema"); }
    o.box(0.5, w - 0.5, 0, 0.5, d - 2, d - 0.3, "#3a1a1e");
    for (let z = 4; z < d - 4; z += 1.2) for (const [a, b] of [[1.5, w / 2 - 0.8], [w / 2 + 0.8, w - 1.5]]) { o.box(a, b, 0, 0.48, z, z + 0.5, "#8a2a2a", { tex: "fabric", uvs: 3 }); o.box(a, b, 0.48, 1.0, z - 0.05, z + 0.1, "#8a2a2a", { tex: "fabric", uvs: 3, solid: false }); for (let x = a + 0.3; x < b - 0.2; x += 0.6) o.act("sit", x, z + 0.28, { y: 0.3, seat: 0.48, face: 0, does: "watch" }); }
    o.plaque("l", 2.5, 1.2, 1.6, 1, o.board(["NOW SHOWING", "THE LONG TIDE"], { bg: "#1a1a1e", fg: "#f2c14e" }));
    o.spots.worker = [1.5, 2.2, 0]; o.spots.extra.push([w / 2 - 2, 8.3, 0], [w / 2 + 3, 10.7, 0]);
  }
};
