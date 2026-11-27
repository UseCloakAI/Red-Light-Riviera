/* The street's small life: the things that make Marlowe Keys feel lived in.

   - Bins: the pavement bins can go over. Run into one, hit it with a car, or set something off near it and it tips
     about its foot the way it was hit, the lid comes off and skitters away, and its rubbish spills out across the
     ground. The city puts them back up once you're well away.
   - Litter: paper, newspaper, cups, wrappers, flyers, cigarette ends in the gutters and on the pavements (more of it
     in the port and downtown than in Bellwether), cans and bottles you can kick down the street, black bags piled
     by the walls, and loose sheets blown along by the wind.
   - People sleeping rough: by shop fronts in the poorer districts, on cardboard with a blanket and a bag, some with
     a cup out, some asleep, the odd shopping cart. They ask for change as you pass. Hurt or frightened, they get up
     and go like anyone else.
   - Cats: (the "Simple Cat" model by Drummyfish, CC0) on the pavements, wandering, sitting, washing; they bolt from
     you if you come too close or run at them, from gunfire and from cars, and a car that hits one sends it flying.
   - Talking to people: hold G and the camera locks on whoever's in front of you; Q greets them, E taunts them.
     They answer back: a nod and a word, a look, or (taunted) a mouthful, a fight, or a sprint the other way. */
import * as THREE from "three";
import { at, SIDEWALK } from "./city/roads.js?v=dev";
import { Body } from "./body.js?v=dev";

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3();
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* ---------------- lines ---------------- */
const L = {
  greet: ["Hey.", "Evening.", "How's it going?", "Hi there.", "Looking good.", "Nice night, huh?", "What's up?"],
  taunt: ["Nice shirt. Did your mom pick it?", "Keep walking, loser.", "What are you looking at?", "You lost, sweetheart?", "Smile, it might help that face.", "Move it, slowpoke.", "You smell like the pier."],
  greetBack: ["Hey yourself.", "Evening.", "Do I know you?", "Uh, hi.", "Not bad, you?", "Good night for it.", "Hey, how you doing?"],
  greetCold: ["Do I know you?", "Okay...", "Not interested.", "Weirdo."],
  tauntBack: ["Excuse me?!", "Screw you, lady.", "Say that again. I dare you.", "What did you just say to me?", "Real classy.", "Go to hell."],
  tauntScared: ["Okay, okay, I'm going!", "Leave me alone!", "Jesus, lady.", "I don't want any trouble!"],
  beg: ["Spare some change?", "Got a dollar, sweetheart?", "Anything helps.", "God bless.", "Spare a smoke?", "Cold one tonight, huh?", "I'm not drinking it, I swear."],
  homelessGreet: ["Bless you, sweetheart.", "Evening, darling.", "You got a dollar?", "Hey there. Stay safe out here."],
  homelessTaunt: ["Screw you too!", "Yeah, real tough. Walk away.", "I've been called worse by better.", "Go on, get out of here!"]
};
const pick = (a) => a[(Math.random() * a.length) | 0];

/* ---------------- the litter atlas: eight little things drawn on a canvas ---------------- */
function litterAtlas() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 64; const g = c.getContext("2d");
  const cell = (i, f) => { g.save(); g.translate((i % 4) * 32, ((i / 4) | 0) * 32); f(); g.restore(); };
  const blot = (cx, cy, r, col, n = 9, jag = 0.35) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, rr = r * (1 - jag / 2 + Math.random() * jag); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.fill(); };
  cell(0, () => { blot(16, 16, 9, "#e8e4da"); g.strokeStyle = "rgba(0,0,0,.25)"; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(10 + Math.random() * 12, 10 + Math.random() * 12); g.lineTo(10 + Math.random() * 12, 10 + Math.random() * 12); g.stroke(); } });   // crumpled paper
  cell(1, () => { g.fillStyle = "#cfcbbf"; g.fillRect(5, 8, 22, 16); g.fillStyle = "#6a6a66"; for (let y = 11; y < 22; y += 2) g.fillRect(7, y, 8 + (y % 4) * 2, 1); g.fillStyle = "#8a8880"; g.fillRect(17, 11, 8, 6); });   // newspaper
  cell(2, () => { g.fillStyle = "#f2efe6"; g.fillRect(10, 8, 12, 16); g.fillStyle = "#b8302a"; g.fillRect(10, 13, 12, 5); g.fillStyle = "#3a2a20"; g.fillRect(10, 8, 12, 2); });   // a coffee cup on its side
  cell(3, () => { blot(16, 16, 8, "#e0b030", 7, 0.25); g.fillStyle = "#c23b2a"; g.fillRect(12, 13, 8, 5); });   // a chip bag
  cell(4, () => { for (let k = 0; k < 5; k++) { g.save(); g.translate(8 + Math.random() * 16, 8 + Math.random() * 16); g.rotate(Math.random() * 3); g.fillStyle = "#eeeae0"; g.fillRect(-3, -1, 5, 2); g.fillStyle = "#c8843a"; g.fillRect(2, -1, 2, 2); g.restore(); } });   // cigarette ends
  cell(5, () => { blot(16, 16, 11, "rgba(235,238,240,.85)", 11, 0.5); g.fillStyle = "rgba(255,255,255,.6)"; g.fillRect(12, 12, 4, 2); });   // a plastic bag
  cell(6, () => { blot(16, 16, 8, "#c23b2a", 8, 0.3); g.fillStyle = "#f0c020"; g.fillRect(11, 12, 10, 3); g.fillRect(14, 17, 5, 2); });   // a burger wrapper
  cell(7, () => { g.fillStyle = "#f08ab0"; g.fillRect(8, 6, 16, 20); g.fillStyle = "#3a2a4a"; g.fillRect(10, 9, 12, 3); g.fillRect(10, 15, 9, 2); g.fillRect(10, 19, 11, 2); });   // a club flyer
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
// a flat sprite material picking its cell from a per-instance attribute
function atlasMaterial(map) {
  const m = new THREE.MeshLambertMaterial({ map, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aCell;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = (vMapUv + vec2(mod(aCell, 4.0), 1.0 - floor(aCell / 4.0))) * vec2(0.25, 0.5);\n#endif");
  };
  m.customProgramCacheKey = () => "litter";
  return m;
}

/* ---------------- the cat ---------------- */
async function loadCat(base) {
  const [txt, tex] = await Promise.all([fetch(base + "cat.obj").then((r) => r.text()), new THREE.TextureLoader().loadAsync(base + "cat.png")]);
  tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const V = [], T = [], pos = [], uv = [];
  for (const line of txt.split("\n")) {
    const p = line.trim().split(/\s+/);
    if (p[0] === "v") V.push([+p[1], +p[2], +p[3]]); else if (p[0] === "vt") T.push([+p[1], +p[2]]);
    else if (p[0] === "f") { const f = p.slice(1).map((q) => q.split("/").map((n) => +n - 1)); for (let i = 1; i < f.length - 1; i++) for (const k of [f[0], f[i], f[i + 1]]) { pos.push(...V[k[0]]); uv.push(...(T[k[1]] || [0, 0])); } }
  }
  // to metres, standing on the ground, nose along +z (the end with the ears)
  let y0 = Infinity, top = -Infinity, topZ = 0; for (let i = 0; i < pos.length; i += 3) { y0 = Math.min(y0, pos[i + 1]); if (pos[i + 1] > top) { top = pos[i + 1]; topZ = pos[i + 2]; } }
  const S = 0.2, flip = topZ < 0 ? -1 : 1;
  for (let i = 0; i < pos.length; i += 3) { pos[i] *= S * flip; pos[i + 1] = (pos[i + 1] - y0) * S; pos[i + 2] *= S * flip; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (flip < 0) { const a = g.attributes.position.array, u = g.attributes.uv.array; for (let t = 0; t < a.length / 9; t++) { for (let j = 0; j < 3; j++) { const x = a[t * 9 + 3 + j]; a[t * 9 + 3 + j] = a[t * 9 + 6 + j]; a[t * 9 + 6 + j] = x; } for (let j = 0; j < 2; j++) { const x = u[t * 6 + 2 + j]; u[t * 6 + 2 + j] = u[t * 6 + 4 + j]; u[t * 6 + 4 + j] = x; } } }
  g.computeBoundingBox();
  // which bits are legs (and which leg), tail, head: from where they sit on the body
  const bb = g.boundingBox, h = bb.max.y, len = bb.max.z - bb.min.z, n = g.attributes.position.count, P = g.attributes.position.array;
  const part = new Int8Array(n), hipY = h * 0.42;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (y < hipY) part[i] = (z > 0 ? 1 : 3) + (x > 0 ? 0 : 1);   // 1 FL, 2 FR, 3 BL, 4 BR
    else if (z < bb.min.z + len * 0.22 && y > h * 0.45) part[i] = 5;   // tail
    else if (z > bb.max.z - len * 0.3 && y > h * 0.55) part[i] = 6;   // head
  }
  return { geo: g, tex, part, hipY, h, len, zF: bb.max.z * 0.6, zB: bb.min.z * 0.6, zT: bb.min.z + len * 0.22, zH: bb.max.z - len * 0.3 };
}

/* ---------------- streetlife ---------------- */
export class StreetLife {
  constructor(o) {
    Object.assign(this, o); this.t = 0; this.meshes = []; this.sfx = o.sfx || {};
    this.R = seeded(20261127);
    this.buildBins(); this.buildLitter(); this.buildWind();
    this.homeless = []; this.spots = this.findSpots(); this.cats = [];
    this.lock = null; this.holdT = 0; this.cool = 0; this.gest = null; this.begT = 6;
    // the prompt over whoever you've locked onto
    this.el = document.createElement("div"); this.el.className = "prompt talkp";
    this.el.innerHTML = '<div class="tk"><kbd>Q</kbd><span>Greet</span><kbd>E</kbd><span>Taunt</span></div>'; if (o.root) o.root.appendChild(this.el);
  }
  async load(base = "assets/models/cat/") {
    try { this.cat = await loadCat(base); } catch (e) { console.warn("Lowtide: the cats didn't load", e); this.cat = null; return; }
    this.catMats = [0xffffff, 0x6a6460, 0xd8d0c8, 0x3a3634, 0xe0a070].map((c) => new THREE.MeshLambertMaterial({ map: this.cat.tex, color: c, flatShading: true }));
    for (let i = 0; i < (this.low ? 3 : 6); i++) {
      const geo = this.cat.geo.clone(); geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
      const mesh = new THREE.Mesh(geo, this.catMats[i % this.catMats.length]); mesh.visible = false; mesh.frustumCulled = false; this.scene.add(mesh);
      this.cats.push({ mesh, rest: this.cat.geo.attributes.position.array.slice(), x: 0, z: 0, y: 0, a: 0, v: 0, mode: "none", t: 0, ph: Math.random() * 6, tgt: null, size: 0.85 + Math.random() * 0.3 });
    }
  }

  /* ---- bins ---- */
  buildBins() {
    const B = this.world.props.bins || [];
    const L = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    // a slatted municipal bin: the drum, a rim, a liner showing at the top; the lid with its handle (separate: it comes off)
    const drum = new THREE.CylinderGeometry(0.27, 0.23, 0.82, 8, 1, true).translate(0, 0.41, 0), base = new THREE.CylinderGeometry(0.23, 0.23, 0.04, 8).translate(0, 0.02, 0);
    const rim = new THREE.TorusGeometry(0.27, 0.025, 4, 8).rotateX(Math.PI / 2).translate(0, 0.82, 0), liner = new THREE.CylinderGeometry(0.25, 0.25, 0.04, 8, 1, true).translate(0, 0.84, 0);
    const join = (gs) => { const out = []; for (const g of gs) out.push(g.index ? g.toNonIndexed() : g); return mergeSimple(out); };
    this.binMesh = new THREE.InstancedMesh(join([drum, base, rim]), new THREE.MeshLambertMaterial({ color: 0x2f5d4a, flatShading: true, side: THREE.DoubleSide }), Math.max(1, B.length));
    this.linerMesh = new THREE.InstancedMesh(liner, L(0x141414), Math.max(1, B.length));
    this.lidMesh = new THREE.InstancedMesh(join([new THREE.CylinderGeometry(0.29, 0.29, 0.05, 8).translate(0, 0.025, 0), new THREE.SphereGeometry(0.27, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).translate(0, 0.05, 0), new THREE.BoxGeometry(0.16, 0.03, 0.04).translate(0, 0.16, 0)]), L(0x26503e), Math.max(1, B.length));
    for (const im of [this.binMesh, this.linerMesh, this.lidMesh]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(im); this.meshes.push(im); }
    this.bins = B.map((b, i) => ({ ...b, i, tip: 0, w: 0, dx: 0, dz: 1, vx: 0, vz: 0, down: false, lid: null, dirty: true, a: b.a || 0, roll: 0 }));
    for (const b of this.bins) this.placeBin(b);
  }
  placeBin(b) {
    // tipped about the foot on the side it's going (pivot at the rim of the base), then lying, rolled a little
    const ax = _ax.set(b.dz, 0, -b.dx).normalize(), r = 0.25;
    _q.setFromAxisAngle(ax, b.tip).multiply(new THREE.Quaternion().setFromAxisAngle(UP, b.a + b.roll));
    const piv = _v.set(b.x + b.dx * r, this.world.heightAt(b.x, b.z), b.z + b.dz * r), off = new THREE.Vector3(-b.dx * r, 0, -b.dz * r).applyAxisAngle(ax, b.tip);
    _m.compose(_p.copy(piv).add(off), _q, _s.set(1, 1, 1));
    this.binMesh.setMatrixAt(b.i, _m); this.linerMesh.setMatrixAt(b.i, _m);
    if (!b.lid) this.lidMesh.setMatrixAt(b.i, _m.multiply(new THREE.Matrix4().makeTranslation(0, 0.82, 0)));
    else { _e.set(b.lid.rx, b.lid.ry, b.lid.rz); _m.compose(b.lid.p, _q.setFromEuler(_e), _s.set(1, 1, 1)); this.lidMesh.setMatrixAt(b.i, _m); }
    this.binMesh.instanceMatrix.needsUpdate = this.linerMesh.instanceMatrix.needsUpdate = this.lidMesh.instanceMatrix.needsUpdate = true;
  }
  // over it goes: along (dx, dz) at speed v
  tipBin(b, dx, dz, v) {
    if (b.down) return; const l = Math.hypot(dx, dz) || 1; b.down = true; b.dx = dx / l; b.dz = dz / l;
    b.w = 1.5 + Math.min(6, v * 0.6); b.vx = b.dx * Math.min(6, v * 0.45); b.vz = b.dz * Math.min(6, v * 0.45);
    if (b.obj) { this.world.grid.remove(b.obj); b.obj = null; }
    b.lid = { p: new THREE.Vector3(b.x, this.world.heightAt(b.x, b.z) + 0.85, b.z), v: new THREE.Vector3(b.dx * (1.5 + v * 0.5) + (Math.random() - 0.5), 1.5 + v * 0.2, b.dz * (1.5 + v * 0.5) + (Math.random() - 0.5)), rx: 0, ry: 0, rz: 0, w: 6 + v, rest: false };
    this.busy = this.busy || new Set(); this.busy.add(b);
    // the rubbish comes out
    const spill = 6 + ((Math.random() * 5) | 0);
    for (let k = 0; k < spill; k++) this.spawnLoose(b.x + b.dx * 0.5, b.z + b.dz * 0.5, b.dx * (1 + Math.random() * 2.5 + v * 0.2) + (Math.random() - 0.5) * 1.6, b.dz * (1 + Math.random() * 2.5 + v * 0.2) + (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 0.6);
    const d = Math.hypot(b.x - this.player.pos.x, b.z - this.player.pos.z);
    if (this.sfx.crash) this.sfx.crash(Math.min(0.5, 0.2 + v * 0.03) / (1 + d / 15));
    if (this.sfx.impact) this.sfx.impact("stone", d, 0);
    if (this.onTip) this.onTip(b);
  }
  stepBins(dt) {
    const P = this.player.pos, V = this.vehicles, cars = V ? V.all() : [];
    for (const b of this.bins) {
      const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz);
      // put back up once nobody's near (the city's cleaners)
      if (b.down && d > 140 && !this.busy.has(b)) { Object.assign(b, { down: false, tip: 0, w: 0, lid: null, roll: 0 }); if (!b.obj) b.obj = this.world.grid.circle(b.x, b.z, 0.3, 1); this.placeBin(b); continue; }
      if (b.down || d > 40) continue;
      // you, running into it
      if (!V || !V.driving) { const sp = this.player.speed || 0; if (d < 0.62 && sp > 3.8) { this.tipBin(b, this.player.vel.x, this.player.vel.z, sp); continue; } }
      // a car
      for (const c of cars) {
        if (c.hidden || Math.abs(c.x - b.x) > 4 || Math.abs(c.z - b.z) > 4) continue;
        const sp = Math.hypot(c.vx || 0, c.vz || 0); if (sp < 1.5) continue;
        if (V.touching(c, b.x, b.z, 0.3)) { this.tipBin(b, c.vx, c.vz, sp); break; }
      }
    }
    if (!this.busy) return;
    for (const b of this.busy) {
      let moving = false;
      if (b.tip < Math.PI / 2) { b.w += 9.8 * 1.4 * Math.sin(Math.max(0.15, b.tip)) * dt; b.tip = Math.min(Math.PI / 2, b.tip + b.w * dt); moving = true; if (b.tip >= Math.PI / 2 && this.sfx.impact) this.sfx.impact("stone", Math.hypot(b.x - P.x, b.z - P.z), 0); }
      const sp = Math.hypot(b.vx, b.vz); if (sp > 0.02) { moving = true; b.x += b.vx * dt; b.z += b.vz * dt; b.roll += sp * dt / 0.26 * 0.3; const k = Math.max(0, 1 - dt * (b.tip >= Math.PI / 2 ? 2.2 : 0.8)); b.vx *= k; b.vz *= k; const q = { x: b.x, z: b.z }; this.world.grid.resolve(q, 0.3, 0.3, 0.5); if (q.x !== b.x || q.z !== b.z) { b.vx *= -0.3; b.vz *= -0.3; b.x = q.x; b.z = q.z; } }
      const L = b.lid; if (L && !L.rest) {
        moving = true; L.v.y -= 9.8 * dt; L.p.addScaledVector(L.v, dt); L.rx += L.w * dt; L.rz += L.w * 0.4 * dt;
        const g = this.world.heightAt(L.p.x, L.p.z) + 0.02; if (L.p.y < g) { L.p.y = g; L.v.y *= -0.35; L.v.x *= 0.6; L.v.z *= 0.6; L.w *= 0.5; if (this.sfx.impact && Math.abs(L.v.y) > 0.6) this.sfx.impact("stone", Math.hypot(L.p.x - P.x, L.p.z - P.z), 0); if (Math.abs(L.v.y) < 0.4 && Math.hypot(L.v.x, L.v.z) < 0.3) { L.rest = true; L.rx = Math.PI * (Math.random() < 0.5 ? 0 : 1); L.rz = 0; } }
      }
      this.placeBin(b); if (!moving) this.busy.delete(b);
    }
  }
  // a blast: bins go over, lids fly
  blast(x, z, r = 9) {
    for (const b of this.bins) { if (b.down) continue; const d = Math.hypot(b.x - x, b.z - z); if (d < r) this.tipBin(b, b.x - x, b.z - z, 10 * (1 - d / r) + 2); }
    for (const q of this.loose) if (q.life > 0 && Math.hypot(q.p.x - x, q.p.z - z) < r) { q.v.set(q.p.x - x, 3, q.p.z - z).normalize().multiplyScalar(6); q.rest = false; }
    this.scare(x, z, 40);
  }

  /* ---- litter ---- */
  buildLitter() {
    const W = this.world, R = this.R, roads = W.roads, quads = [], cans = [], bags = [];
    const dens = { port: 0.32, downtown: 0.22, tideline: 0.2, midtown: 0.16, bellwether: 0.06, park: 0.05, beach: 0.08, pier: 0.12 };
    for (const e of roads.edges) {
      const mid = at(e.pl, e.L / 2), k = dens[W.districtAt(mid.x, mid.z)] ?? 0.12;
      for (const s of [1, -1]) for (let t = e.s0 + 2; t < e.s1 - 2; t += 1 / k * (0.4 + R() * 1.2)) {
        const p = at(e.pl, t), band = R(), o = band < 0.55 ? e.w / 2 - 0.2 - R() * 0.35 : e.w / 2 + 0.3 + R() * (SIDEWALK - 0.6);
        const x = p.x + p.nx * s * o, z = p.z + p.nz * s * o, r = R();
        if (r < 0.14) cans.push({ x, z, a: R() * 6.28, c: [0xc23b2a, 0x2f5d8c, 0xb8b8c0, 0x3a7a3a, 0x5a3a20][(R() * 5) | 0], bottle: R() < 0.25 });
        else quads.push({ x, z, a: R() * 6.28, cell: r < 0.3 ? 4 : (R() * 8) | 0, s: 0.24 + R() * 0.18 });
        // black bags by the wall now and then (port and downtown most)
        if (band > 0.55 && R() < k * 0.06) { const ob = e.w / 2 + SIDEWALK - 0.45; for (let n = 0; n < 2 + R() * 3; n++) bags.push({ x: p.x + p.nx * s * ob + (R() - 0.5) * 1.2, z: p.z + p.nz * s * ob + (R() - 0.5) * 1.2, s: 0.32 + R() * 0.2, a: R() * 6, c: R() < 0.7 ? 0x141416 : 0x1e2a1e }); }
      }
    }
    // flat things
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cellA = new Float32Array(quads.length + 64);
    this.atlas = litterAtlas();
    this.flat = new THREE.InstancedMesh(geo, atlasMaterial(this.atlas), quads.length + 64);
    quads.forEach((q, i) => { cellA[i] = q.cell; _m.compose(_p.set(q.x, W.heightAt(q.x, q.z) + 0.012, q.z), _q.setFromAxisAngle(UP, q.a), _s.set(q.s, 1, q.s * (q.cell === 1 || q.cell === 7 ? 1.3 : 1))); this.flat.setMatrixAt(i, _m); });
    geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cellA, 1));
    this.flat.count = quads.length; this.quads = quads; this.flat.frustumCulled = false; this.scene.add(this.flat); this.meshes.push(this.flat);
    // cans and bottles: little cylinders on their sides (these get kicked)
    const can = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 6).rotateZ(Math.PI / 2);
    this.canMesh = new THREE.InstancedMesh(can, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, cans.length));
    cans.forEach((c, i) => { c.i = i; c.y = W.heightAt(c.x, c.z) + 0.033; c.vx = 0; c.vz = 0; c.spin = 0; c.roll = 0; c.sc = c.bottle ? 1.5 : 1; this.canMesh.setColorAt(i, new THREE.Color(c.bottle ? 0x3a6a3a : c.c)); this.placeCan(c); });
    this.cans = cans; this.canMesh.frustumCulled = false; this.canMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.canMesh); this.meshes.push(this.canMesh);
    // a spatial index of the cans (kicks), 8 m cells
    this.canGrid = new Map(); for (const c of cans) { const k = ((c.x / 8) | 0) + "," + ((c.z / 8) | 0); let a = this.canGrid.get(k); if (!a) this.canGrid.set(k, a = []); a.push(c); }
    // black bags
    if (bags.length) { const bg = new THREE.IcosahedronGeometry(1, 0).scale(1, 0.75, 1).translate(0, 0.6, 0); const im = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), bags.length);
      bags.forEach((b, i) => { _m.compose(_p.set(b.x, W.heightAt(b.x, b.z), b.z), _q.setFromAxisAngle(UP, b.a), _s.set(b.s, b.s, b.s)); im.setMatrixAt(i, _m); im.setColorAt(i, new THREE.Color(b.c)); }); im.frustumCulled = false; this.scene.add(im); this.meshes.push(im); }
    // the loose pieces: spilled rubbish and anything kicked loose (a pool, drawn as extra flat instances)
    this.loose = Array.from({ length: 64 }, (_, i) => ({ i: quads.length + i, p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), a: 0, w: 0, life: 0, rest: true, cell: 0, s: 0.2 }));
    this.looseK = 0; const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (const q of this.loose) this.flat.setMatrixAt(q.i, zero);
  }
  placeCan(c) { _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(c.roll, c.a, 0, "YXZ")), _s.set(c.sc, c.sc, c.sc)); this.canMesh.setMatrixAt(c.i, _m); this.canMesh.instanceMatrix.needsUpdate = true; }
  spawnLoose(x, z, vx, vz, vy) {
    const q = this.loose[this.looseK++ % this.loose.length]; q.p.set(x, this.world.heightAt(x, z) + 0.5, z); q.v.set(vx, vy, vz); q.a = Math.random() * 6; q.w = (Math.random() - 0.5) * 10; q.life = 90; q.rest = false; q.cell = (Math.random() * 8) | 0; q.s = 0.16 + Math.random() * 0.14;
    this.flat.geometry.attributes.aCell.array[q.i] = q.cell; this.flat.geometry.attributes.aCell.needsUpdate = true;
    this.flat.count = Math.max(this.flat.count, q.i + 1);
  }
  stepLitter(dt) {
    let dirty = false;
    for (const q of this.loose) {
      if (q.life <= 0) continue; q.life -= dt;
      if (!q.rest) {
        dirty = true; q.v.y -= 9.8 * dt; q.v.multiplyScalar(1 - dt * 0.8); q.p.addScaledVector(q.v, dt); q.a += q.w * dt;
        const g = this.world.heightAt(q.p.x, q.p.z) + 0.012; if (q.p.y < g) { q.p.y = g; q.v.y = 0; q.v.x *= 1 - Math.min(1, dt * 6); q.v.z *= 1 - Math.min(1, dt * 6); q.w *= 0.9; if (Math.hypot(q.v.x, q.v.z) < 0.05) q.rest = true; }
      }
      if (q.life <= 0) q.p.y = -99;
      _m.compose(q.p, _q.setFromAxisAngle(UP, q.a), _s.set(q.s, 1, q.s)); this.flat.setMatrixAt(q.i, _m);
      if (q.life <= 0) dirty = true;
    }
    if (dirty) this.flat.instanceMatrix.needsUpdate = true;
    // kicks: your feet, and cars, near the cans
    const P = this.player.pos, V = this.vehicles, kickers = [];
    if (!V || !V.driving) { if ((this.player.speed || 0) > 0.8) kickers.push({ x: P.x, z: P.z, r: 0.35, vx: this.player.vel.x, vz: this.player.vel.z }); }
    if (V) for (const c of V.all()) { if (c.hidden || Math.abs(c.x - P.x) > 50 || Math.abs(c.z - P.z) > 50) continue; const sp = Math.hypot(c.vx || 0, c.vz || 0); if (sp > 1.5) kickers.push({ car: c, x: c.x, z: c.z, r: 2.6, vx: c.vx, vz: c.vz }); }
    for (const k of kickers) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = this.canGrid.get((((k.x / 8) | 0) + i) + "," + (((k.z / 8) | 0) + j)); if (!a) continue;
      for (const c of a) { if (Math.abs(c.x - k.x) > k.r || Math.abs(c.z - k.z) > k.r) continue; if (k.car ? !V.touching(k.car, c.x, c.z, 0.05) : Math.hypot(c.x - k.x, c.z - k.z) > k.r) continue;
        const sp = Math.hypot(k.vx, k.vz) || 1; c.vx = k.vx * (k.car ? 0.9 : 1.6) + (Math.random() - 0.5) * 1.5; c.vz = k.vz * (k.car ? 0.9 : 1.6) + (Math.random() - 0.5) * 1.5; c.vy = (k.car ? 1.5 : 0.8) + Math.random(); c.spin = (Math.random() - 0.5) * 20; (this.moving || (this.moving = new Set())).add(c);
        if (this.sfx.shell && Math.random() < 0.7) this.sfx.shell(0.5, 0, "hull"); void sp; }
    }
    if (this.moving) for (const c of this.moving) {
      c.vy = (c.vy || 0) - 9.8 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt; c.a += c.spin * dt; c.roll += Math.hypot(c.vx, c.vz) * dt / 0.033;
      const g = this.world.heightAt(c.x, c.z) + 0.033; if (c.y < g) { c.y = g; if (c.vy < -1 && this.sfx.shell) this.sfx.shell(0.4, 0, "hull"); c.vy *= -0.3; const k = 1 - Math.min(1, dt * 2.2); c.vx *= k; c.vz *= k; c.spin *= k; }
      const q = { x: c.x, z: c.z }; this.world.grid.resolve(q, 0.05, c.y, 0.2); if (q.x !== c.x || q.z !== c.z) { c.vx *= -0.4; c.vz *= -0.4; c.x = q.x; c.z = q.z; }
      this.placeCan(c);
      if (Math.hypot(c.vx, c.vz) < 0.05 && Math.abs(c.vy) < 0.2 && c.y <= g + 0.001) { this.moving.delete(c); const k0 = ((c.x / 8) | 0) + "," + ((c.z / 8) | 0); for (const [key, a] of this.canGrid) { const n = a.indexOf(c); if (n >= 0 && key !== k0) { a.splice(n, 1); let b = this.canGrid.get(k0); if (!b) this.canGrid.set(k0, b = []); b.push(c); break; } } }
    }
  }
  // loose sheets blown along by the wind, round you
  buildWind() {
    this.wind = Array.from({ length: this.low ? 4 : 8 }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), a: 0, w: 0, life: 0, cell: [0, 1, 7, 5][(Math.random() * 4) | 0], flip: 0 }));
    const geo = new THREE.PlaneGeometry(0.3, 0.38), cell = new Float32Array(this.wind.length); this.wind.forEach((w, i) => { cell[i] = w.cell; });
    geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 1));
    this.windMesh = new THREE.InstancedMesh(geo, atlasMaterial(this.atlas), this.wind.length); this.windMesh.frustumCulled = false; this.scene.add(this.windMesh); this.meshes.push(this.windMesh);
    this.windDir = new THREE.Vector2(0.8, 0.6).normalize();
  }
  stepWind(dt) {
    const P = this.player.pos, gust = 1.4 + Math.sin(this.t * 0.3) * 0.9 + Math.max(0, Math.sin(this.t * 1.7)) * 0.8;
    this.wind.forEach((w, i) => {
      if (w.life <= 0 || Math.hypot(w.p.x - P.x, w.p.z - P.z) > 40) {   // a new one, upwind, out of the way
        const a = Math.random() * 1.2 - 0.6, d = 16 + Math.random() * 18, x = P.x - this.windDir.x * d + Math.cos(a) * 10, z = P.z - this.windDir.y * d + Math.sin(a) * 10;
        w.p.set(x, this.world.heightAt(x, z) + 0.02, z); w.v.set(0, 0, 0); w.life = 10 + Math.random() * 10; w.a = Math.random() * 6; w.w = 0; w.flip = 0;
      }
      w.life -= dt; const g = this.world.heightAt(w.p.x, w.p.z) + 0.02;
      // dragged by the gust, lifting off now and then, tumbling
      const lift = Math.max(0, Math.sin(this.t * 2.3 + i * 1.7)) * gust * 0.9;
      w.v.x += (this.windDir.x * gust * 1.6 - w.v.x) * dt * 1.5; w.v.z += (this.windDir.y * gust * 1.6 - w.v.z) * dt * 1.5; w.v.y += (lift - 4.5) * dt;
      w.p.addScaledVector(w.v, dt); if (w.p.y < g) { w.p.y = g; w.v.y = 0; w.v.x *= 0.8; w.v.z *= 0.8; }
      const q = { x: w.p.x, z: w.p.z }; this.world.grid.resolve(q, 0.15, w.p.y, 0.3); w.p.x = q.x; w.p.z = q.z;
      const air = w.p.y - g; w.flip += (air > 0.05 ? 8 : 1.5) * Math.hypot(w.v.x, w.v.z) * dt; w.a += Math.sin(this.t + i) * dt;
      _m.compose(w.p, _q.setFromEuler(_e.set(-Math.PI / 2 + Math.sin(w.flip) * Math.min(1.4, air * 4 + 0.05), w.a, Math.cos(w.flip * 0.7) * Math.min(1, air * 3), "YXZ")), _s.set(1, 1, 1));
      this.windMesh.setMatrixAt(i, _m);
    });
    this.windMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---- people sleeping rough ---- */
  findSpots() {
    const W = this.world, out = [], R = seeded(77);
    for (const e of W.entrances || []) {
      const d = W.districtAt(e.x, e.z); if (!["port", "downtown", "midtown", "tideline"].includes(d)) continue; if (R() > (d === "port" || d === "downtown" ? 0.45 : 0.25)) continue;
      // (an entrance's yaw looks into the building: out is the other way)
      const nx = -Math.sin(e.yaw), nz = -Math.cos(e.yaw), tx = nz, tz = -nx, side = R() < 0.5 ? 1 : -1;
      const x = e.x + nx * 0.62 + tx * side * 1.9, z = e.z + nz * 0.62 + tz * side * 1.9;
      const q = { x, z }; W.grid.resolve(q, 0.3, 0.2, 1.4); if (Math.hypot(q.x - x, q.z - z) > 0.25) continue;
      out.push({ x, z, yaw: e.yaw + Math.PI, kind: ["cup", "sit", "sleep", "cup", "sit"][(R() * 5) | 0], cart: R() < 0.35, pd: null });
    }
    return out;
  }
  // props for a spot: cardboard, a blanket, a bag, the cup, maybe a cart
  spotProps(sp) {
    const g = new THREE.Group(), L = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }), box = (w, h, d, x, y, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), L(c)); m.position.set(x, y, z); g.add(m); return m; };
    box(0.8, 0.02, 1.25, 0, 0.01, 0.3, 0xa8865a);   // the cardboard
    const bl = box(0.7, 0.08, 0.7, 0, 0.07, 0.55, [0x3a4a6a, 0x6a3a3a, 0x4a5a3a][(Math.random() * 3) | 0]); bl.rotation.y = 0.15;   // a blanket over the legs
    box(0.32, 0.36, 0.26, 0.55, 0.18, -0.05, 0x2a2a30).rotation.y = 0.4;   // a holdall
    if (sp.kind === "cup") { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.11, 6), L(0xe8e4da)); c.position.set(-0.3, 0.06, 0.75); g.add(c); }
    if (sp.cart) {   // a shopping cart, loaded with bags
      const c = new THREE.Group(), wire = L(0x9a9aa0);
      for (const [w, h, d, x, y, z] of [[0.55, 0.02, 0.8, 0, 0.5, 0], [0.02, 0.4, 0.8, 0.27, 0.7, 0], [0.02, 0.4, 0.8, -0.27, 0.7, 0], [0.55, 0.4, 0.02, 0, 0.7, 0.4], [0.55, 0.4, 0.02, 0, 0.7, -0.4], [0.5, 0.03, 0.03, 0, 1.0, -0.52], [0.02, 0.5, 0.02, 0.22, 0.25, 0.32], [0.02, 0.5, 0.02, -0.22, 0.25, 0.32], [0.02, 0.5, 0.02, 0.22, 0.25, -0.32], [0.02, 0.5, 0.02, -0.22, 0.25, -0.32]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wire); m.position.set(x, y, z); c.add(m); }
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), L([0x141416, 0x2a3a6a, 0x6a5a40][k])); b.position.set((k - 1) * 0.15, 0.75 + k * 0.05, (k - 1) * 0.15); c.add(b); }
      c.position.set(-0.95, 0, 0.2); c.rotation.y = 0.5; g.add(c);
    }
    return g;
  }
  async makePeople() { if (!this.peds || !this.peds.makeHomeless) return; for (let i = 0; i < (this.low ? 2 : 4); i++) { try { this.homeless.push({ pd: await this.peds.makeHomeless(), spot: null, props: null }); } catch (e) { break; } await new Promise((r) => setTimeout(r)); } }
  stepHomeless(dt) {
    const P = this.player.pos;
    for (const h of this.homeless) {
      const pd = h.pd;
      // up and gone (hurt, scared, fighting): the spot's free; they're the crowd's now until they're far away
      if (pd.out) { if (h.spot) { h.spot.pd = null; this.scene.remove(h.props); h.spot = null; } continue; }
      if (h.spot && Math.hypot(h.spot.x - P.x, h.spot.z - P.z) > 110) { h.spot.pd = null; this.scene.remove(h.props); h.spot = null; pd.h.group.visible = false; }
      if (!h.spot) {   // a free spot at a distance, out of the way
        const free = this.spots.filter((s) => !s.pd && Math.hypot(s.x - P.x, s.z - P.z) > 35 && Math.hypot(s.x - P.x, s.z - P.z) < 95);
        if (!free.length) continue; const s = free[(Math.random() * free.length) | 0];
        h.spot = s; s.pd = pd; h.props = this.spotProps(s); h.props.position.set(s.x, this.world.heightAt(s.x, s.z), s.z); h.props.rotation.y = s.yaw; this.scene.add(h.props);
        pd.dead = false; pd.hp = 100; pd.fear = null; pd.free = null; pd.anger = 0; pd.w = null; h.t = Math.random() * 20;
      }
      const s = h.spot, g = pd.h.group, d = Math.hypot(s.x - P.x, s.z - P.z); g.visible = d < 80;
      if (!g.visible) continue;
      h.t += dt; this.poseSitter(pd, s, h.t, dt, d);
      // asking as you pass
      if (d < 4.2 && !this.vehicles.driving && (this.begT -= dt) <= 0 && s.kind !== "sleep") { this.begT = 14 + Math.random() * 10; this.say(pick(L.beg), pd, "calm"); }
    }
  }
  // sitting on the ground, back to the wall: knees up, a hand out with the cup, or head down asleep
  poseSitter(pd, s, t, dt, dist) {
    const g = pd.h.group, B = Body.of(g); if (!B || !B.ok) return;
    for (const k in pd.act) pd.act[k].setEffectiveWeight(k === "idle" ? 1 : 0); pd.mixer.update(dist < 30 ? dt : 0);
    B.reset();
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = -fz, rz = fx, y0 = this.world.heightAt(s.x, s.z);
    g.position.set(s.x + fx * 0.55, y0, s.z + fz * 0.55); g.rotation.set(0, s.yaw, 0); g.updateMatrixWorld(true);
    const W = (f, r, y) => new THREE.Vector3(s.x + fx * f + rx * r, y0 + y, s.z + fz * f + rz * r);
    const sleep = s.kind === "sleep", breathe = Math.sin(t * (sleep ? 0.9 : 1.6)) * 0.01;
    const knees = sleep ? 0.75 : 0.5, P = this.player.pos;
    const o = { hip: W(0.18, 0, 0.14 + breathe), lean: sleep ? 0.45 : -0.35 + breathe, keepHead: sleep ? -0.3 : 0.8, feet: { L: W(knees, 0.17, 0.05), R: W(knees + (sleep ? 0.05 : -0.05), -0.17, 0.05) }, knee: new THREE.Vector3(0, 1, 0).addScaledVector(new THREE.Vector3(fx, 0, fz), 0.6) };
    // hands: on the knees; or one out with the cup, shaken a little when you're close
    const kneeL = W(0.5, 0.18, 0.42), kneeR = W(0.5, -0.18, 0.42);
    o.hands = { L: sleep ? W(0.4, 0.1, 0.28) : kneeL.clone().add(new THREE.Vector3(0, 0.04, 0)), R: kneeR.clone().add(new THREE.Vector3(0, 0.04, 0)) };
    if (s.kind === "cup") { const shake = dist < 6 ? Math.sin(t * 9) * 0.015 : 0; o.hands.R = W(0.72, -0.25, 0.32 + shake); }
    if (!sleep && dist < 9) o.look = new THREE.Vector3(P.x, P.y + 1.5, P.z);
    o.grip = 0.6; B.place(o);
    if (sleep) B.turn("head", new THREE.Vector3(0, 0, 1), 0.3);
  }

  /* ---- cats ---- */
  stepCats(dt) {
    if (!this.cat) return;
    const P = this.player.pos, V = this.vehicles, W = this.world;
    for (const c of this.cats) {
      // somewhere on a pavement near you (by a sleeper's spot or a bin, or anywhere on a kerb), out of sight
      if (c.mode === "none" || (Math.hypot(c.x - P.x, c.z - P.z) > 110 && c.mode !== "dead") || (c.mode === "dead" && Math.hypot(c.x - P.x, c.z - P.z) > 60)) {
        const near = this.bins.filter((b) => { const d = Math.hypot(b.x - P.x, b.z - P.z); return d > 30 && d < 80; });
        if (!near.length) { c.mesh.visible = false; c.mode = "none"; continue; }
        const b = near[(Math.random() * near.length) | 0], a = Math.random() * 6.28, x = b.x + Math.cos(a) * 1.2, z = b.z + Math.sin(a) * 1.2;
        if (this.cats.some((o) => o !== c && o.mode !== "none" && Math.hypot(o.x - x, o.z - z) < 4)) { c.mesh.visible = false; c.mode = "none"; continue; }   // one cat to a spot
        c.x = x; c.z = z; c.a = Math.random() * 6.28; c.mode = "sit"; c.t = 3 + Math.random() * 10; c.v = 0; c.flyV = null; c.mesh.visible = true; c.mesh.material.opacity = 1;
        c.mesh.scale.setScalar(c.size);
      }
      if (c.mode === "dead") { this.drawCat(c, dt); continue; }
      const dx = c.x - P.x, dz = c.z - P.z, dp = Math.hypot(dx, dz);
      // in the air (a car hit it)
      if (c.flyV) {
        c.flyV.y -= 9.8 * dt; c.x += c.flyV.x * dt; c.z += c.flyV.z * dt; c.y += c.flyV.y * dt; c.spin += c.spinV * dt;
        const g = W.heightAt(c.x, c.z); if (c.y <= g) { c.y = g; if (c.lethal) { c.mode = "dead"; c.flyV = null; c.spin = Math.PI / 2; } else { c.flyV = null; c.spin = 0; c.mode = "flee"; c.t = 3; c.a = Math.atan2(c.x - (c.fromX ?? P.x), c.z - (c.fromZ ?? P.z)); } }
        this.drawCat(c, dt); continue;
      }
      // cars: run over, or sent flying
      if (V) for (const car of V.all()) {
        if (car.hidden || Math.abs(car.x - c.x) > 4 || Math.abs(car.z - c.z) > 4) continue; const sp = Math.hypot(car.vx || 0, car.vz || 0); if (sp < 2) continue;
        if (V.touching(car, c.x, c.z, 0.1)) { c.flyV = new THREE.Vector3(car.vx * 0.8 + (Math.random() - 0.5) * 2, 2 + sp * 0.25, car.vz * 0.8 + (Math.random() - 0.5) * 2); c.spinV = (Math.random() < 0.5 ? -1 : 1) * (6 + sp); c.spin = 0; c.lethal = sp > 9; c.fromX = car.x; c.fromZ = car.z; if (this.sfx.impact) this.sfx.impact("flesh", dp, 0); break; }
        // a car coming at it: out of the way
        const ah = (c.x - car.x) * car.vx + (c.z - car.z) * car.vz; if (ah > 0 && ah / sp < 8 && c.mode !== "flee") { c.mode = "flee"; c.t = 2.5; c.a = Math.atan2(c.x - car.x, c.z - car.z) + (Math.random() - 0.5); }
      }
      if (c.flyV) { this.drawCat(c, dt); continue; }
      // you: too close, or running at it
      const ps = this.player.speed || 0;
      if (c.mode !== "flee" && (dp < 2.2 || (dp < 7 && ps > 4.5)) && !(V && V.driving)) { c.mode = "flee"; c.t = 2.5 + Math.random() * 2; c.a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.8; }
      c.t -= dt;
      let want = 0;
      if (c.mode === "flee") { want = 6.5; if (c.t <= 0) { c.mode = "sit"; c.t = 4 + Math.random() * 8; } }
      else if (c.mode === "walk") { want = 0.7; if (c.tgt) { const tx = c.tgt.x - c.x, tz = c.tgt.z - c.z; c.a += ang(Math.atan2(tx, tz) - c.a) * Math.min(1, dt * 3); if (Math.hypot(tx, tz) < 0.3) c.t = 0; } if (c.t <= 0) { c.mode = Math.random() < 0.6 ? "sit" : "groom"; c.t = 4 + Math.random() * 10; } }
      else if (c.mode === "sit" || c.mode === "groom") { if (c.t <= 0) { c.mode = "walk"; c.t = 4 + Math.random() * 6; const a = Math.random() * 6.28, r = 2 + Math.random() * 4; c.tgt = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }; } }
      c.v += (want - c.v) * Math.min(1, dt * (want > c.v ? 6 : 4));
      if (c.v > 0.01) {
        const q = { x: c.x + Math.sin(c.a) * c.v * dt, z: c.z + Math.cos(c.a) * c.v * dt }; W.grid.resolve(q, 0.15, W.heightAt(c.x, c.z) + 0.1, 0.4);
        // into a wall: slide round it, change direction
        if (Math.hypot(q.x - c.x, q.z - c.z) < c.v * dt * 0.4) c.a += (Math.random() < 0.5 ? 1 : -1) * 1.2 * dt * 3;
        c.x = q.x; c.z = q.z;
      }
      c.y = W.heightAt(c.x, c.z); this.drawCat(c, dt);
    }
  }
  // the cat's body: legs swinging (a walk, or a bounding run), tail and head, or sitting, or washing
  drawCat(c, dt) {
    const K = this.cat, A = c.mesh.geometry.attributes.position, a = A.array, r = c.rest, part = K.part, n = part.length;
    c.ph += dt * (c.v > 2 ? 16 : 7 + c.v * 6);
    const run = Math.min(1, Math.max(0, (c.v - 1.5) / 3)), walk = Math.min(1, c.v / 0.4), sit = c.mode === "sit" || c.mode === "groom" ? 1 : 0, dead = c.mode === "dead";
    c.sitK = (c.sitK || 0) + (sit - (c.sitK || 0)) * Math.min(1, dt * 4);
    const sk = c.sitK, pivY = K.hipY;
    for (let i = 0; i < n; i++) {
      let x = r[i * 3], y = r[i * 3 + 1], z = r[i * 3 + 2]; const p = part[i];
      if (p >= 1 && p <= 4) {   // a leg: swung about its hip
        const front = p <= 2, left = p % 2 === 1, phase = run > 0.5 ? (front ? 0 : Math.PI) : ((front === left) ? 0 : Math.PI);
        // (sitting, the body's tipped nose-up: the front legs are turned back to stand straight under the chest)
        const sw = Math.sin(c.ph + phase) * (0.45 * walk + 0.25 * run) * (1 - sk) + (front ? 0.5 * sk : 0);
        const dy = y - pivY, cs = Math.cos(sw), sn = Math.sin(sw); y = pivY + dy * cs; z = z + dy * sn;
        if (!front && sk > 0) { y = pivY * (1 - sk * 0.75) + (y - pivY) * (1 - sk * 0.5); z += sk * 0.06; }   // haunches down
      } else if (p === 5) {   // the tail: a slow sway, up when walking
        const sway = Math.sin(this.t * 2 + c.ph * 0.2) * (0.35 + 0.2 * walk), dzb = z - K.zT; x += Math.sin(sway) * Math.abs(dzb) * 0.8; y += sk * -0.02;
      } else if (p === 6) {   // the head: a bob on the walk; licking a paw when washing
        y += Math.sin(c.ph * 2) * 0.008 * walk; if (c.mode === "groom") { y -= 0.04 + Math.sin(this.t * 7) * 0.015; z -= 0.02; }
      }
      a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    }
    A.needsUpdate = true;
    const m = c.mesh; m.position.set(c.x, c.y + (c.flyV ? 0.05 : 0), c.z);
    m.rotation.set(-0.5 * sk, c.a, dead ? Math.PI / 2 : c.spin || 0, "YXZ"); m.position.y += 0.035 * sk;
    if (run > 0.5) m.position.y += Math.abs(Math.sin(c.ph)) * 0.06;
  }
  // gunfire or a bang: the cats bolt
  scare(x, z, r = 30) { for (const c of this.cats) if (c.mode !== "none" && c.mode !== "dead" && Math.hypot(c.x - x, c.z - z) < r) { c.mode = "flee"; c.t = 3 + Math.random() * 2; c.a = Math.atan2(c.x - x, c.z - z) + (Math.random() - 0.5); } }

  /* ---- talking to people: hold G to lock on, Q greets, E taunts ---- */
  // returns true while locked (Q and E are taken)
  talk(dt, input, free) {
    this.cool = Math.max(0, this.cool - dt);
    const held = free && input.down("KeyG");
    if (!held) { if (this.lock) this.unlock(); return false; }
    const P = this.player.pos;
    if (this.lock && (!this.valid(this.lock) || Math.hypot(this.lock.h.group.position.x - P.x, this.lock.h.group.position.z - P.z) > 13)) this.unlock();
    if (!this.lock) { this.lock = this.target(); if (!this.lock) { this.prompt(null); return false; } }
    if (this.on) this.on("talk");
    const pd = this.lock, g = pd.h.group.position, yaw = Math.atan2(g.x - P.x, g.z - P.z);
    // the camera swings round behind you onto them; you turn to face them
    this.rig.yaw += ang(yaw + Math.PI - this.rig.yaw) * Math.min(1, dt * 6); this.rig.pitch += (0.12 - this.rig.pitch) * Math.min(1, dt * 4);
    this.player.aimYaw = yaw;
    this.prompt(pd);
    if (this.cool <= 0) { if (input.hit("KeyQ")) this.speak(pd, "greet"); else if (input.hit("KeyE")) this.speak(pd, "taunt"); }
    return true;
  }
  valid(pd) { return pd && !pd.dead && !(pd.down > 0) && !pd.inCar && pd.h.group.visible && !pd.cop && !pd.npc; }
  // whoever's nearest the middle of the view, within talking distance
  target() {
    const P = this.player.pos, cam = this.rig.cam, f = cam.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize();
    let best = null, bs = -Infinity;
    for (const pd of this.peds.peds) {
      if (!this.valid(pd)) continue; const g = pd.h.group.position, dx = g.x - P.x, dz = g.z - P.z, d = Math.hypot(dx, dz); if (d > 9 || d < 0.3) continue;
      const dot = (dx * f.x + dz * f.z) / d; if (dot < 0.55) continue; const sc = dot * 2 - d * 0.15; if (sc > bs) { bs = sc; best = pd; }
    }
    return best;
  }
  unlock() { this.lock = null; this.player.aimYaw = null; this.prompt(null); }
  prompt(pd) {
    const el = this.el; if (!el) return;
    if (!pd) { if (this.pOn) { el.classList.remove("on"); this.pOn = false; } return; }
    _p.copy(pd.h.group.position); _p.y += 2.05; _p.project(this.rig.cam);
    el.style.transform = `translate(${((_p.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - _p.y) / 2 * innerHeight).toFixed(0)}px)`;
    if (!this.pOn) { el.classList.add("on"); this.pOn = true; }
  }
  // you say it; they answer (a beat later)
  speak(pd, kind) {
    this.cool = 2.2; this.gest = { kind, t: 0 };
    this.say(pick(L[kind]), null, kind === "taunt" ? "angry" : "calm");
    const homeless = !!pd.homeless;
    setTimeout(() => {
      if (!this.valid(pd)) return;
      if (homeless) { this.say(pick(kind === "greet" ? L.homelessGreet : L.homelessTaunt), pd, kind === "greet" ? "calm" : "angry"); return; }
      if (kind === "greet") {
        const warm = Math.random() < 0.7; this.peds.react(pd, warm ? "agree" : "headShake", 2.5);
        this.say(pick(warm ? L.greetBack : L.greetCold), pd, "calm");
      } else {
        pd.anger = (pd.anger || 0) + 1.6; this.peds.react(pd, "headShake", 2);
        if (pd.brave > 0.62 || pd.anger > 3.5) { this.say(pick(L.tauntBack), pd, "angry"); this.peds.squareUp(pd); }
        else if (pd.brave < 0.28) { this.say(pick(L.tauntScared), pd, "scared"); pd.fear = { x: this.player.pos.x, z: this.player.pos.z, t: 8 }; }
        else this.say(pick(L.tauntBack), pd, "angry");
      }
    }, 700);
  }
  // after the clips: your wave or your taunt, on your arms
  afterPlayer(dt) {
    const G = this.gest; if (!G) return; G.t += dt;
    const m = this.player.model, B = m && Body.of(m); if (!B || !B.ok) { this.gest = null; return; }
    const T = 1.5, k = Math.sin(Math.PI * Math.min(1, G.t / T)), { f, r } = B.dirs(), sh = B.pos("upperarm01_R"), shL = B.pos("upperarm01_L");
    if (G.kind === "greet") {   // a hand up, waving
      const hand = sh.clone().addScaledVector(f, 0.18).addScaledVector(r, 0.22 + Math.sin(G.t * 12) * 0.08).add(new THREE.Vector3(0, 0.42, 0));
      B.arm("R", hand, r.clone().add(new THREE.Vector3(0, -1, 0)), k);
    } else {   // arms out, chest up: come on, then
      const s2 = Math.sin(G.t * 5) * 0.05;
      B.arm("R", sh.clone().addScaledVector(r, 0.45).addScaledVector(f, 0.25).add(new THREE.Vector3(0, -0.05 + s2, 0)), new THREE.Vector3(0, -1, 0), k);
      B.arm("L", shL.clone().addScaledVector(r, -0.45).addScaledVector(f, 0.25).add(new THREE.Vector3(0, -0.05 - s2, 0)), new THREE.Vector3(0, -1, 0), k);
      B.lean(-0.12 * k, 0.5);
    }
    if (G.t > T) this.gest = null;
  }

  update(dt, input, o = {}) {
    this.t += dt;
    // somebody close enough to talk to: the tip, once
    if (this.on && o.onFoot && !this.tipped && (this.tipT = (this.tipT || 0) - dt) <= 0) { this.tipT = 1; if (this.target()) { this.tipped = true; this.on("near-person"); } }
    const locked = this.talk(dt, input, !!o.onFoot);
    if (!o.indoors) { this.stepBins(dt); this.stepLitter(dt); this.stepWind(dt); this.stepHomeless(dt); this.stepCats(dt); }
    return locked;
  }
}

// merge plain non-indexed geometries (position, normal, uv), whatever they came with
function mergeSimple(gs) {
  let n = 0; for (const g of gs) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3); let o = 0;
  for (const g of gs) { pos.set(g.attributes.position.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.computeVertexNormals(); return out;
}
