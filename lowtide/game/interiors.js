/* Interiors. Nearly every building on Marlowe Keys has a door you can use: walk up to it,
   press E, a quick cut to black, and you're inside a room made for that kind of place
   and sized to the building (a store with aisles and a register, a diner with booths
   and a counter, a bar, a laundromat, a barber's, a hotel lobby, a motel room, an
   apartment, an office lobby, a warehouse, a house, the theatre). Someone's usually
   there: a clerk, a bartender, a resident, who says hello. Leave by the same door.
   It's how the games of the era did it: the room is built on the spot, out past the
   edge of the world, and the street holds its breath while you're in.

   PS1 look: no textures, flat colour per face with the light baked into it (ceiling
   lamps, falloff, a darker floor line), on MeshBasic so the sun doesn't reach in. */
import * as THREE from "three";

const ORIGIN = { x: 4200, z: 4200 }, H = 3.3;
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const C = (h) => new THREE.Color(h);
export const LABEL = { store: "Store", cafe: "Café", diner: "Nite Owl Diner", bar: "Bar", laundry: "Laundromat", barber: "Barber", hotel: "Hotel lobby", motel: "Seagrape Motor Inn", apartment: "Apartment", office: "Lobby", warehouse: "Warehouse", garage: "Parking garage", house: "House", theatre: "Palm Square Theatre" };
const GREET = {
  store: ["Evening. Let me know if you need anything.", "We close at two. Don't get comfortable."], cafe: ["Sit anywhere, hon.", "Coffee's fresh. Mostly."],
  diner: ["Sit anywhere, hon. Pie's on the board.", "Kitchen's still open."], bar: ["What'll it be?", "Last call's in an hour."],
  laundry: ["Machine four eats quarters.", "Change machine's busted."], barber: ["Take a seat. Be right with you.", "Just a trim?"],
  hotel: ["Good evening. Checking in?", "Welcome to the hotel."], motel: ["Vacancy's on, if you need a room.", "Ice machine's down the hall."],
  apartment: ["Who let you in?", "Hey, this is my place."], office: ["Building's closed. Can I help you?", "Sign in at the desk, please."],
  house: ["Uh, can I help you?", "You lost?"], theatre: ["Show's already started.", "Tickets at the booth."]
};
const WORKER = { store: [0.5, 0.18], cafe: [0.3, 0.3], diner: [0.5, 0.75], bar: [0.5, 0.8], laundry: [0.5, 0.85], barber: [0.3, 0.6], hotel: [0.5, 0.75], motel: [0.6, 0.5], apartment: [0.6, 0.6], office: [0.5, 0.5], house: [0.4, 0.6], theatre: [0.2, 0.25] };

export class Interiors {
  constructor(o) {
    Object.assign(this, o);   // scene, world, player, rig, hud, input, sfx, say(text, pd), npcs, police, vehicles, root
    this.list = this.world.entrances || []; this.inside = null; this.fadeT = 0; this.solid = []; this.group = null; this.heightAt0 = this.world.heightAt;
    const root = this.root;
    this.fadeEl = document.createElement("div"); this.fadeEl.className = "fade"; root.appendChild(this.fadeEl);
    this.prompt = document.createElement("div"); this.prompt.className = "prompt doorp"; this.prompt.innerHTML = "<kbd>E</kbd><span></span>"; root.appendChild(this.prompt);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.glow = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
  }
  // nearest door (outside) or the way out (inside) in reach
  near() {
    const P = this.player.pos;
    if (this.inside) { const ex = this.inside.exit; return Math.hypot(P.x - ex.x, P.z - ex.z) < 1.5 ? { exit: true, x: ex.x, z: ex.z } : null; }
    let best = null, bd = 1.8;
    for (const e of this.list) { const d = Math.hypot(P.x - e.x, P.z - e.z); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  // returns true if it used E this frame
  update(dt, input, camera) {
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
    const el = this.prompt;
    if (!n) { if (this.pOn) { el.classList.remove("on"); this.pOn = false; } return; }
    const v = new THREE.Vector3(n.x, (n.exit ? 0 : this.heightAt0(n.x, n.z)) + 2.1, n.z).project(camera);
    if (!isFinite(v.x) || !isFinite(v.y) || v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { el.classList.remove("on"); this.pOn = false; return; }
    el.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(0)}px)`;
    el.querySelector("span").textContent = n.exit ? "Leave" : LABEL[n.kind] || "Enter";
    if (!this.pOn) { el.classList.add("on"); this.pOn = true; if (this.on) this.on("near-door"); }
  }
  // to black, do the thing, back
  cut(fn) { this.fadeEl.classList.add("on"); this.fadeT = 0.3; this.then = () => { fn(); setTimeout(() => this.fadeEl.classList.remove("on"), 60); }; if (this.sfx.door) this.sfx.door(); }

  enter(e) {
    const R = rng(e.seed), kind = e.kind;
    const size = { motel: [6, 7], apartment: [9, 8], house: [10, 9], barber: [7, 9], laundry: [8, 11], office: [16, 13], hotel: [16, 13], theatre: [18, 24], warehouse: [24, 20], garage: [24, 20] }[kind];
    const w = size ? size[0] : THREE.MathUtils.clamp(e.W - 1, 7, 16), d = size ? size[1] : THREE.MathUtils.clamp(e.D - 1, 7, 14);
    this.inside = { e, w, d, kind, R, t: 0, greeted: false };
    this.build(this.inside);
    // the floor's flat; the street's height map doesn't apply in here
    this.world.heightAt = (x, z) => (Math.abs(x - ORIGIN.x) < 200 && Math.abs(z - ORIGIN.z) < 200 ? 0 : this.heightAt0(x, z));
    const P = this.player, ex = this.inside.exit;
    P.pos.set(ex.x, 0, ex.z + 1.8); P.vel.set(0, 0, 0); P.yaw = 0;
    this.rig.yaw = Math.PI; this.rig.pitch = 0.12; this.rig.cur = null;
    if (this.hud.root) this.hud.root.classList.add("inside");
    if (this.onEnter) this.onEnter(e);
  }
  leave() {
    const e = this.inside.e;
    this.clear();
    this.world.heightAt = this.heightAt0;
    const P = this.player; P.pos.set(e.x, this.heightAt0(e.x, e.z), e.z); P.vel.set(0, 0, 0); P.yaw = e.yaw + Math.PI;
    this.rig.yaw = e.yaw; this.rig.pitch = 0.14; this.rig.cur = null;
    if (this.hud.root) this.hud.root.classList.remove("inside");
    this.inside = null;
    if (this.onLeave) this.onLeave(e);
  }
  clear() {
    if (this.group) { this.scene.remove(this.group); this.group.traverse((m) => m.geometry && m.geometry.dispose()); this.group = null; }
    for (const o of this.solid) this.world.grid.remove(o); this.solid = [];
    if (this.npc) { this.npc.h.group.visible = false; this.npc.inUse = false; this.npc = null; }
  }
  tickInside(dt) {
    const I = this.inside; I.t += dt;
    const pd = this.npc;
    if (pd) {
      if (pd.dead) { if (pd.rag && pd.rag.step(dt)) pd.rag.pose(); }
      else {
        // they keep an eye on you
        const g = pd.h.group, P = this.player.pos, want = Math.atan2(P.x - g.position.x, P.z - g.position.z);
        let dy = want - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * Math.min(1, dt * 2);
        pd.act.idle.setEffectiveWeight(1); pd.act.walk.setEffectiveWeight(0); pd.act.run.setEffectiveWeight(0); pd.mixer.update(dt);
        if (!I.greeted && I.t > 0.9) { I.greeted = true; const L = GREET[I.kind]; if (L && this.say) this.say(L[(I.R() * L.length) | 0], pd); }
      }
    }
  }

  /* ---------------- the rooms ---------------- */
  build(I) {
    const { w, d, kind, R } = I, g = new THREE.Group(), P = [], Cc = [], Gp = [], Gc = [];
    const ox = ORIGIN.x - w / 2, oz = ORIGIN.z;
    I.exit = { x: ORIGIN.x, z: oz + 0.9 };
    // ceiling lamps: their light is baked into every face's colour
    const lamps = []; for (let x = 2; x < w - 1; x += 4) for (let z = 2; z < d - 1; z += 4) lamps.push([x, z]);
    const dim = kind === "bar" || kind === "theatre" ? 0.55 : kind === "warehouse" || kind === "garage" ? 0.75 : 1;
    const light = (x, y, z) => { let l = 0.26; for (const [lx, lz] of lamps) { const q = (x - lx) ** 2 + (z - lz) ** 2 + (H - y) ** 2 * 0.6; l += 0.55 / (1 + q * 0.14); } return Math.min(0.9, l * dim) * (0.72 + 0.28 * Math.min(1, y / 1.2)); };
    const quad = (a, b, c, e, col, shade = 1, glow = false) => {
      const ctr = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], k = glow ? 1 : light(...ctr) * shade, cc = col.clone().multiplyScalar(k);
      const arr = glow ? Gp : P, carr = glow ? Gc : Cc;
      for (const v of [a, b, c, a, c, e]) { arr.push(ox + v[0], v[1], oz + v[2]); carr.push(cc.r, cc.g, cc.b); }
    };
    const solid = (x0, x1, z0, z1, h = 2) => { this.solid.push(this.world.grid.box(ox + x0, oz + z0, ox + x1, oz + z1, h)); };
    // a box: top bright, sides by facing, collision unless told otherwise
    const box = (x0, x1, y0, y1, z0, z1, col, o = {}) => {
      const c = C(col), s = o.shade || 1;
      quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], c, 1.05 * s, o.glow);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], c, 0.8 * s, o.glow);
      quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], c, 0.72 * s, o.glow);
      quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], c, 0.66 * s, o.glow);
      quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], c, 0.76 * s, o.glow);
      if (o.solid !== false && y0 < 1.6) solid(x0, x1, z0, z1, y1);
    };
    // the shell: floor in a pattern, walls with a base line, a ceiling with the lamps lit in it
    const floor = { diner: "checker", cafe: "checker", bar: "plank", store: "tile", laundry: "tile", barber: "checker", hotel: "carpet", motel: "carpet", apartment: "plank", house: "plank", office: "tile", warehouse: "concrete", garage: "concrete", theatre: "carpet" }[kind] || "tile";
    const FC = { checker: ["#e8e4dc", "#2a2a2e"], tile: ["#cfcac0", "#bfb9ae"], plank: ["#8a5a36", "#7a4e2e"], carpet: [R() < 0.5 ? "#6e2a2e" : "#2e4a6e", null], concrete: ["#8e8a84", "#86827c"] }[floor];
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      const alt = floor === "checker" ? (x + z) % 2 : floor === "plank" ? (x % 2) ^ ((z / 3 | 0) % 2 && x % 3 === 0) : floor === "concrete" ? R() < 0.5 : (x + z) % 2;
      const col = C(FC[1] && alt ? FC[1] : FC[0]);
      quad([x, 0, z], [x + 1, 0, z], [x + 1, 0, z + 1], [x, 0, z + 1], col, 0.95);
    }
    const wallC = C({ diner: "#c9dbe0", cafe: "#e7d7b8", bar: "#4a2e2a", store: "#e8e4dc", laundry: "#cfe3e6", barber: "#e6e0d0", hotel: "#d8c8a8", motel: "#c8b898", apartment: ["#d8cbb5", "#b8c8b8", "#c8b8c8"][(R() * 3) | 0], house: ["#e0d4bc", "#c4d4c8"][(R() * 2) | 0], office: "#d8dcde", warehouse: "#9a958c", garage: "#a8a49c", theatre: "#5a1e24" }[kind] || "#ddd");
    const wall = (x0, z0, x1, z1) => {
      quad([x0, 0, z0], [x1, 0, z1], [x1, H, z1], [x0, H, z0], wallC, 0.85);
      quad([x0, 0, z0], [x1, 0, z1], [x1, 0.15, z1], [x0, 0.15, z0], C("#3a3430"), 0.9);   // skirting
    };
    wall(0, 0, w, 0); wall(w, 0, w, d); wall(w, d, 0, d); wall(0, d, 0, 0);
    for (const [x0, z0, x1, z1] of [[-0.5, -0.5, w + 0.5, 0], [w, -0.5, w + 0.5, d + 0.5], [-0.5, d, w + 0.5, d + 0.5], [-0.5, -0.5, 0, d + 0.5]]) solid(x0, x1, z0, z1, 6);
    quad([0, H, 0], [w, H, 0], [w, H, d], [0, H, d], C(kind === "warehouse" || kind === "garage" ? "#5a5650" : "#e4e0d8"), 0.7);
    for (const [lx, lz] of lamps) quad([lx - 0.5, H - 0.01, lz - 0.25], [lx + 0.5, H - 0.01, lz - 0.25], [lx + 0.5, H - 0.01, lz + 0.25], [lx - 0.5, H - 0.01, lz + 0.25], C(kind === "bar" ? "#ffb060" : "#fff6e0"), 1, true);
    // the way in: the door, and windows out to the night either side
    quad([w / 2 - 0.7, 0, 0.02], [w / 2 + 0.7, 0, 0.02], [w / 2 + 0.7, 2.3, 0.02], [w / 2 - 0.7, 2.3, 0.02], C("#5a3a24"), 0.9);
    quad([w / 2 + 0.4, 1.05, 0.03], [w / 2 + 0.55, 1.05, 0.03], [w / 2 + 0.55, 1.15, 0.03], [w / 2 + 0.4, 1.15, 0.03], C("#e0b040"), 1, true);
    if (!["warehouse", "garage", "theatre"].includes(kind)) for (const x of [1, w - 3]) if (Math.abs(x + 1 - w / 2) > 2) quad([x, 1, 0.03], [x + 2, 1, 0.03], [x + 2, 2.4, 0.03], [x, 2.4, 0.03], C("#1c2a44"), 1, true);
    // what's in it
    const F = FURNISH[kind] || FURNISH.store; F({ w, d, R, box, quad, C, H });
    // geometry
    const mk = (p, c, m) => { if (!p.length) return; const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(c, 3)); const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; g.add(mesh); };
    mk(P, Cc, this.mat); mk(Gp, Gc, this.glow);
    this.scene.add(g); this.group = g;
    // someone there
    const spot = kind === "store" ? [1.9 / w, 0.75 / d] : WORKER[kind];   // the clerk behind the register
    if (spot && this.npcs && (kind !== "apartment" && kind !== "house" || R() < 0.7)) {
      const pd = this.npcs.find((q) => !q.inUse && !q.dead) || null;
      if (pd) { pd.inUse = true; this.npc = pd; const g2 = pd.h.group; g2.position.set(ox + spot[0] * w, 0, oz + spot[1] * d); g2.rotation.y = Math.PI; g2.visible = true; pd.hp = 100; }
    }
  }
}

/* ---------------- furniture, by kind ---------------- */
const shelfColors = ["#c23b2a", "#2f5d8c", "#e0b040", "#3f7a4a", "#e8e2d6", "#8a3b6a", "#d9772a"];
function shelves(o, x0, x1, z, R) {   // a gondola with stock on both faces
  o.box(x0, x1, 0, 1.6, z - 0.35, z + 0.35, "#7a7a80");
  for (let y = 0.35; y < 1.6; y += 0.42) for (let x = x0 + 0.1; x < x1 - 0.2; x += 0.28 + R() * 0.15) {
    const c = shelfColors[(R() * shelfColors.length) | 0], h = 0.18 + R() * 0.15;
    o.box(x, x + 0.22, y, y + h, z - 0.4, z - 0.36, c, { solid: false }); o.box(x, x + 0.22, y, y + h, z + 0.36, z + 0.4, c, { solid: false });
  }
}
function stools(o, x0, x1, z) { for (let x = x0; x < x1; x += 0.9) { o.box(x - 0.05, x + 0.05, 0, 0.7, z - 0.05, z + 0.05, "#888", { solid: false }); o.box(x - 0.2, x + 0.2, 0.7, 0.8, z - 0.2, z + 0.2, "#b8302a", { solid: false }); } }
function sofa(o, x, z, len, col, rot) {   // rot: facing +z (false) or -z (true)
  const b = rot ? [z - 0.9, z - 0.7] : [z + 0.7, z + 0.9];
  o.box(x, x + len, 0, 0.45, z - 0.0, z + 0.9, col); o.box(x, x + len, 0.45, 0.95, b[0], b[1], col, { shade: 0.9 });
}
function plant(o, x, z) { o.box(x - 0.25, x + 0.25, 0, 0.45, z - 0.25, z + 0.25, "#6a4a32"); o.box(x - 0.35, x + 0.35, 0.45, 1.3, z - 0.35, z + 0.35, "#3f7a4a", { solid: false }); }
const FURNISH = {
  store(o) { const { w, d, R } = o;
    o.box(0.6, 3.2, 0, 1.0, 1.4, 2.1, "#6a4a32"); o.box(1.4, 1.9, 1.0, 1.3, 1.5, 1.9, "#2a2a2e", { solid: false });          // counter and register
    o.box(0.3, 1.2, 1.0, 1.9, 1.6, 2.0, "#c23b2a", { solid: false });                                                       // cigarettes behind
    for (let z = 3.5; z < d - 2; z += 2.4) shelves(o, 4, w - 1.5, z, R);
    o.box(w - 1, w - 0.1, 0, 2.2, 2, d - 0.5, "#9fc4dc", { glow: false }); for (let z = 2.2; z < d - 0.7; z += 1.1) o.box(w - 1.02, w - 0.98, 0.1, 2.1, z, z + 0.05, "#555", { solid: false });   // the fridges
  },
  cafe(o) { const { w, d } = o; FURNISH.diner(o, true); void w; void d; },
  diner(o, small) { const { w, d } = o;
    o.box(1, w - 1, 0, 1.05, d - 2.6, d - 2, "#e8e4dc"); o.box(1, w - 1, 1.05, 1.12, d - 2.7, d - 1.9, "#c23b2a", { solid: false });   // counter
    stools(o, 1.6, w - 1.4, d - 3.1);
    o.box(0.3, w - 0.3, 1.2, 2.2, d - 0.4, d - 0.1, "#b8b0a0", { solid: false });                                                      // the kitchen pass
    for (let x = 1; x < w - 3; x += 3.2) { o.box(x + 0.5, x + 1.7, 0, 0.75, 1.6, 2.4, "#e8e4dc"); sofa(o, x + 0.3, 0.7, 2, "#b8302a", false); if (!small) sofa(o, x + 0.3, 2.45, 2, "#b8302a", true); }
  },
  bar(o) { const { w, d, R } = o;
    o.box(1, w - 1, 0, 1.1, d - 2.4, d - 1.8, "#4a2a1a"); stools(o, 1.5, w - 1.4, d - 2.9);
    for (let y = 1.2; y < 2.6; y += 0.5) { o.box(0.5, w - 0.5, y, y + 0.04, d - 0.5, d - 0.1, "#3a2416", { solid: false }); for (let x = 0.7; x < w - 0.7; x += 0.22) o.box(x, x + 0.08, y + 0.04, y + 0.3 + R() * 0.1, d - 0.35, d - 0.27, ["#3f7a4a", "#8a5a2a", "#c9a14a", "#6a2a2a"][(R() * 4) | 0], { solid: false, glow: R() < 0.2 }); }
    o.box(w / 2 - 1.2, w / 2 + 1.2, 0, 0.85, 2.2, 3.6, "#2f6e3a"); o.box(w / 2 - 1.3, w / 2 + 1.3, 0.8, 0.9, 2.1, 3.7, "#4a2a1a", { solid: false });   // pool table
    o.box(0.3, 1.1, 0, 1.6, 1, 1.6, "#c94a8a", { glow: true });   // the jukebox
  },
  laundry(o) { const { w, d } = o;
    for (let z = 2; z < d - 1; z += 0.9) { o.box(0.2, 1.0, 0, 0.95, z, z + 0.8, "#e8e8e4"); o.box(0.98, 1.0, 0.35, 0.75, z + 0.2, z + 0.6, "#2a3440", { solid: false }); o.box(w - 1, w - 0.2, 0, 0.95, z, z + 0.8, "#e8e8e4"); }
    o.box(w / 2 - 1, w / 2 + 1, 0, 0.45, d / 2, d / 2 + 0.5, "#6a6a70");
  },
  barber(o) { const { w, d } = o;
    for (let z = 2; z < d - 1.5; z += 2) { o.box(w - 1.3, w - 0.7, 0, 0.5, z, z + 0.6, "#2a2a2e"); o.box(w - 1.3, w - 0.6, 0.5, 1.2, z, z + 0.6, "#b8302a"); o.box(w - 0.12, w - 0.05, 1, 2.2, z - 0.3, z + 0.9, "#cfe3f0", { solid: false, glow: true }); }
    sofa(o, 0.3, 1.5, 2.5, "#4a4a52", false);
  },
  hotel(o) { const { w, d } = o;
    o.box(w / 2 - 3, w / 2 + 3, 0, 1.1, d - 3.2, d - 2.5, "#5a3a24"); o.box(w / 2 - 3.1, w / 2 + 3.1, 1.1, 1.18, d - 3.3, d - 2.4, "#2a2a2e", { solid: false });
    o.quad([3, 0.02, 2.5], [w - 3, 0.02, 2.5], [w - 3, 0.02, d - 4.5], [3, 0.02, d - 4.5], new THREE.Color("#8a2a2a"), 1);
    sofa(o, 2, 3, 3, "#2e4a6e", false); sofa(o, w - 5, 3, 3, "#2e4a6e", false); plant(o, 1, 1); plant(o, w - 1, 1);
    for (const x of [1.5, w - 3.5]) o.box(x, x + 2, 0, 2.6, d - 0.15, d - 0.05, "#b8b8bc", { solid: false });   // the lifts
  },
  motel(o) { const { w, d } = o;
    o.box(0.5, 2.6, 0, 0.55, d - 2.6, d - 0.3, "#e8e2d6"); o.box(0.5, 2.6, 0.55, 0.62, d - 2.6, d - 0.3, "#8a3b2a", { solid: false });   // the bed
    o.box(2.8, 3.4, 0, 0.6, d - 0.8, d - 0.3, "#6a4a32"); o.box(2.95, 3.25, 0.6, 1.0, d - 0.65, d - 0.45, "#e0c890", { glow: true });   // nightstand and lamp
    o.box(w - 1, w - 0.3, 0, 0.8, 2, 3.2, "#6a4a32"); o.box(w - 0.9, w - 0.4, 0.8, 1.3, 2.3, 2.9, "#1a1a1e"); o.box(w - 0.92, w - 0.88, 0.85, 1.25, 2.35, 2.85, "#4a7aa8", { solid: false, glow: true });   // the TV
    o.box(w - 2.2, w, 0, 3.3, d - 2.2, d - 2.1, "#c8b898");   // the bathroom wall
  },
  apartment(o) { const { w, d, R } = o;
    sofa(o, 1, d - 3, 3, ["#4a5a7a", "#7a4a3a", "#3a5a4a"][(R() * 3) | 0], true); o.box(1.5, 3.5, 0, 0.4, d - 4.6, d - 3.8, "#6a4a32");
    o.box(1, 3.6, 0, 0.6, 1.2, 1.6, "#3a3036"); o.box(1.6, 3.0, 0.6, 1.4, 1.3, 1.4, "#111", { solid: false }); o.box(1.65, 2.95, 0.65, 1.35, 1.41, 1.42, "#4a7aa8", { solid: false, glow: true });
    o.box(w - 0.8, w - 0.1, 0, 0.95, 1.5, d - 1, "#d8d2c8"); o.box(w - 0.7, w - 0.1, 1.5, 2.3, 1.5, d - 1, "#b8b0a0", { solid: false });   // the kitchen run
    o.quad([1, 0.02, d - 5], [4, 0.02, d - 5], [4, 0.02, d - 3.2], [1, 0.02, d - 3.2], new THREE.Color("#8a6a4a"), 1); plant(o, 0.6, d - 0.6);
  },
  house(o) { FURNISH.apartment(o); },
  office(o) { const { w, d } = o;
    o.box(w / 2 - 2, w / 2 + 2, 0, 1.1, d / 2 - 0.4, d / 2 + 0.4, "#3a3a40"); o.box(w / 2 - 0.8, w / 2 - 0.2, 1.1, 1.5, d / 2 - 0.2, d / 2 + 0.2, "#1a1a1e", { solid: false });
    for (const x of [2, w - 4.5]) o.box(x, x + 2.5, 0, 2.8, d - 0.15, d - 0.05, "#b8b8bc", { solid: false });
    sofa(o, 1, 2, 3, "#2a2a2e", false); plant(o, 1, d - 1); plant(o, w - 1, d - 1); plant(o, w - 1, 1);
  },
  warehouse(o) { const { w, d, R } = o;
    for (let x = 6; x < w - 3; x += 6) for (let z = 5; z < d - 2; z += 6) o.box(x - 0.25, x + 0.25, 0, 3.3, z - 0.25, z + 0.25, "#7a766e");
    for (let i = 0; i < 9; i++) { const x = 2 + R() * (w - 5), z = 3 + R() * (d - 5), h = 1 + ((R() * 3) | 0) * 0.9; o.box(x, x + 1.4, 0, h, z, z + 1.2, ["#9a7a4a", "#8a6a3a", "#5a6a7a"][(R() * 3) | 0]); }
  },
  garage(o) { FURNISH.warehouse(o); },
  theatre(o) { const { w, d } = o;
    o.box(1, w - 1, 0.8, 3.1, d - 0.3, d - 0.1, "#f0ead8", { solid: false, glow: true });   // the screen
    for (let z = 4; z < d - 4; z += 1.2) { o.box(1.5, w / 2 - 0.8, 0, 0.5, z, z + 0.5, "#8a2a2a"); o.box(1.5, w / 2 - 0.8, 0.5, 1.0, z - 0.1, z + 0.05, "#8a2a2a", { solid: false }); o.box(w / 2 + 0.8, w - 1.5, 0, 0.5, z, z + 0.5, "#8a2a2a"); o.box(w / 2 + 0.8, w - 1.5, 0.5, 1.0, z - 0.1, z + 0.05, "#8a2a2a", { solid: false }); }
  }
};
