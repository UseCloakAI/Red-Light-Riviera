/* Stage 5: the cars of Marlowe Keys and you in them.

   Every car on the island is one of the models in carmodels.js, drawn by carrender.js, moved by carphys.js:
   parked ones sit still (solid) until something hits them; traffic (traffic.js) drives on its lanes; yours, and any
   car that's been knocked loose, runs the full model (tyres, weight transfer, gearbox, springs) at 120 Hz, with
   impulse collisions against the world and every other car. Hits dent the body where they land, scrape the paint,
   break glass and lamps, bend wheels; hurt cars smoke, burn and go up.

   Getting in and out is animated on your body (occupants.js): walk to the driver's door, open it, get in, shut it;
   out the same way, pushing the door shut behind you. A car with someone at the wheel: E pulls them out and throws
   them on the road (they get up and run, or come for you). At speed, E throws you out of the door: a ragdoll at the
   car's speed, and the car carries on without you. The people driving near you are real people from the crowd,
   at the wheel and steering; further off, a figure through the glass.

   Controls: W/S throttle and brake (S again at a stop for reverse), A/D steer (less lock at speed), Space the
   handbrake, E out (or bail). */
import * as THREE from "three";
import { flat } from "./ps1.js?v=dev";
import { MODEL, MODELS, pickModel, pickPaint } from "./carmodels.js?v=dev";
import { Fleet } from "./carrender.js?v=dev";
import { initPhys, step, ride, kin, impulse, boxBox, circleBox, gridBox, fwdSpeed } from "./carphys.js?v=dev";
import { Seats, person } from "./occupants.js?v=dev";
import { Ragdoll } from "./rig.js?v=dev";

const UP = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const HZ = 120, REST = { thr: 0, brk: 0, steer: 0, hand: true, park: true }, COAST = { thr: 0, brk: 0.06, steer: 0, hand: false };
const SHIRTS = [0x3a4a6a, 0x6a3a3a, 0x2f2f33, 0xd8d2c4, 0x4a6a4a, 0x8a6a3a, 0x5a4a6a, 0x7a8a9a, 0xa04a3a, 0x2a5a6a];
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
const seeded = (x, z) => { let k = 0; return () => hash(x + (k += 1.618), z - k * 0.7); };

export class Vehicles {
  constructor({ world, player, rig, camera, hud, peds, sfx, prompt, scene, fx, traffic, low }) {
    Object.assign(this, { world, player, rig, camera, hud, peds, sfx: sfx || {}, prompt, scene, fx, traffic });
    this.fleet = new Fleet(scene, { range: low ? 170 : 270 });
    this.seats = new Seats({ fleet: this.fleet, world });
    this.nextI = 0; this.env = { surface: (x, z) => (world.heightAt(x, z) < -0.05 ? 0.6 : 1) };
    // the parked cars: a model each (the same one every time, from where it stands)
    this.cars = world.cars ? world.cars.list : [];
    for (const c of this.cars) {
      const R = seeded(c.x, c.z), m = c.model ? MODEL[c.model] : pickModel(R); this.init(c, m, pickPaint(m, R)); c.y = world.heightAt(c.x, c.z); c.parked = true; ride(c, 1 / 60, world.heightAt);
      if (c.obb) world.grid.remove(c.obb); c.obb = world.grid.obb(c.x, c.z, c.S.hw, c.S.hl, -c.a, c.y + m.cab.roof); c.obb.car = c;   // solid, the model's own size
    }
    if (traffic) traffic.attach(this);
    this.car = null; this.near = null; this.on = null; this.act = null; this.ctl = { thr: 0, brk: 0, steer: 0, hand: false, rev: false };
    this.dyn = new Set(); this.npcActs = []; this.drivers = []; this.assignT = 0; this.unparkT = 8;
    this.props = world.props || { lamps: [], hydrants: [] };
    for (const L of this.props.lamps) if (L.obj) L.obj.lamp = L;
    for (const H of this.props.hydrants) if (H.obj) H.obj.hydrant = H;
    this.falling = []; this.geysers = []; this.burning = new Set();
    // the geysers' spray: one pool of square points
    const N = 360, g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3).fill(-999), 3));
    this.spray = { N, pts: Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), life: 0 })), k: 0, g };
    if (scene) { const pm = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfe2ff, size: 0.12, transparent: true, opacity: 0.75, depthWrite: false })); pm.frustumCulled = false; scene.add(pm); }
    this.life = null;
    if (scene) this.boomKit(scene);
    // people who go down near a car can land on it, roll over its bonnet, be carried along by it
    Ragdoll.cars = (x, z, rag) => this.boxesNear(x, z, rag);
    this.you = player.model ? person(player.model, player.mixer, player.act) : null;
    // the dentable versions of each model, built a little at a time once the game's running (no hitch on the first crash)
    MODELS.forEach((m, i) => setTimeout(() => this.fleet.warm(m), 4000 + i * 700));
  }
  // a car's model, paint and physical state
  init(c, m, paint) {
    c.i = this.nextI++; initPhys(c, m); c.paint = paint; c.health = c.health ?? 100; c.door = 0; c.hidden = false;
    c.shirt = SHIRTS[(Math.random() * SHIRTS.length) | 0];
    return c;
  }
  get driving() { return !!this.car; }
  get busy() { return !!this.act; }
  // every car there is (parked, in traffic, the police, yours)
  all() {
    const out = this._all || (this._all = []); out.length = 0;
    for (const c of this.cars) out.push(c);
    if (this.traffic) for (const c of this.traffic.cars) if (c.active || c.taken) out.push(c);
    return out;
  }
  /* ---- explosions: a flash, debris, scorch marks ---- */
  boomKit(scene) {
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, "rgba(255,250,220,1)"); rg.addColorStop(0.3, "rgba(255,190,90,.9)"); rg.addColorStop(0.7, "rgba(255,90,20,.35)"); rg.addColorStop(1, "rgba(255,60,0,0)"); g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); this.flash.visible = false; scene.add(this.flash); this.flashT = 0;
    const DN = 64; this.debris = { N: DN, k: 0, mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x2a2826, flatShading: true }), DN), list: Array.from({ length: DN }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 })) };
    this.debris.mesh.frustumCulled = false; this.debris.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.debris.mesh);
    for (let i = 0; i < DN; i++) this.debris.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    this.scorchMat = new THREE.MeshBasicMaterial({ color: 0x0a0908, transparent: true, opacity: 0.7, depthWrite: false, ...flat(-5) }); this.scorches = [];
  }
  boomFx(dt) {
    if (this.flash && this.flashT > 0) { this.flashT -= dt; const k = Math.max(0, this.flashT / 0.4); this.flash.material.opacity = k; this.flash.scale.setScalar(10 + (1 - k) * 10); if (this.flashT <= 0) this.flash.visible = false; }
    const D = this.debris; if (!D) return; let any = false;
    for (let i = 0; i < D.N; i++) {
      const q = D.list[i]; if (q.life <= 0) continue; any = true; q.life -= dt;
      q.v.y -= 9.8 * dt; q.p.addScaledVector(q.v, dt); q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
      const g = this.world.heightAt(q.p.x, q.p.z) + 0.06; if (q.p.y < g) { q.p.y = g; q.v.y *= -0.3; q.v.x *= 0.6; q.v.z *= 0.6; q.w.multiplyScalar(0.5); }
      _m.compose(q.p, _q.setFromEuler(q.r), q.life > 0 ? _s : new THREE.Vector3(0, 0, 0)); D.mesh.setMatrixAt(i, _m);
    }
    if (any) D.mesh.instanceMatrix.needsUpdate = true;
  }

  /* ---- damage ---- */
  // a blow to car c at world (x, z), pushing along (dx, dz) (into the car), closing speed v (gunfire, blasts, the old callers)
  impactCar(c, x, z, dx, dz, v, y) {
    if (v < 1.5) return;
    const l = Math.hypot(dx, dz) || 1;
    this.hit(c, [x, z], [dx / l, dz / l], v, null, y);
  }
  /* a hit on car c at world point p ([x, z]), normal n ([x, z], into the car), closing speed v, from `other` (a car) */
  hit(c, p, n, v, other, y) {
    if (v < 1.2 || !c.m) return;
    const k = other && other.S ? other.S.mass / (other.S.mass + c.S.mass) : 0.8;
    if (v > 3) this.hurt(c, (v - 3) * 2.6 * (0.4 + k));
    // the dent, in the car's own frame
    const d = this.fleet.detail(c); this.fleet.matrix(c, _m); _mi.copy(_m).invert();
    const py = y ?? (c.y || 0) + Math.min(0.75, 0.42 + Math.random() * 0.25);
    const lp = _v.set(p[0], py, p[1]).applyMatrix4(_mi), ln = _u.set(n[0], 0, n[1]).transformDirection(_mi);
    const broke = d.hit(lp, ln, v, k);
    if (broke.glass && this.sfx.glass) this.sfx.glass(Math.min(1, 0.4 + broke.glass * 0.25));
    if (broke.glass && this.fx) this.fx.sparks(new THREE.Vector3(p[0], py + 0.4, p[1]), 10 + broke.glass * 6, new THREE.Vector3(n[0] * -1, 0.6, n[1] * -1), 2.5, 0xbfe2ff, 0.5);
    // wheels that take a hard knock bend
    if (v > 13) { const G = this.seats.keys(c).G; for (let i = 0; i < 4; i++) { const [wx, wz] = G.wheels[i]; if (Math.hypot(wx - lp.x, wz - lp.z) < 0.9) { c.camber = c.camber || [0, 0, 0, 0]; c.camber[i] = Math.max(-0.22, Math.min(0.22, c.camber[i] + (Math.random() - 0.5) * 0.3)); c.bent = c.bent || [0, 0, 0, 0]; c.bent[i] += (Math.random() - 0.5) * 0.1; } } }
    if (v > 5 && this.fx) this.fx.sparks(new THREE.Vector3(p[0], py, p[1]), Math.min(24, (v * 1.2) | 0), new THREE.Vector3(-n[0], 0.45, -n[1]), 3 + v * 0.12, 0xffc070, 0.35);
    // whoever's inside feels it
    if (c === this.car && v > 9) { if (this.rig) this.rig.shake = Math.max(this.rig.shake || 0, Math.min(1.2, v / 18)); if (this.life && v > 14) this.life.damage((v - 14) * 2.2, { force: 0, cause: "crash" }); }
    if (c.occ && !c.occ.player && v > 20 && Math.random() < 0.5) c.occ.dead = true;
    if (c.occ && v > 6) c.stun = Math.max(c.stun || 0, 1.5 + v * 0.1);
  }
  // a round hits car c at (x, y, z), travelling along (dx, dz): a small dent going in, the glass it goes through,
  // and whoever's at the wheel if it finds them (the car rolls on without them)
  shot(c, x, y, z, dx, dz) {
    this.hurt(c, 9);
    const k = this.seats.keys(c), d = this.fleet.detail(c); this.fleet.matrix(c, _m); _mi.copy(_m).invert();
    const lp = _v.set(x, y, z).applyMatrix4(_mi), ln = _u.set(dx, 0, dz).transformDirection(_mi);
    d.hit(lp, ln, 3, 0.25);
    if (lp.y > k.belt - 0.05) for (const [list, g] of [[d.panes, d.glass], [d.doorPanes, d.doorGlass], [d.doorPanes2, d.doorGlass2]]) for (const pn of list) if (pn.ok && Math.hypot(pn.c[0] - lp.x, pn.c[1] - lp.y, pn.c[2] - lp.z) < 0.75) { d.smash(g, pn); if (this.sfx.glass) this.sfx.glass(0.6); if (this.fx) this.fx.sparks(new THREE.Vector3(x, y, z), 12, new THREE.Vector3(dx, 0.4, dz), 2.2, 0xbfe2ff, 0.45); }
    if (c.occ && !c.occ.player && !c.occ.dead && lp.y > k.belt - 0.25 && Math.abs(lp.x - k.sx) < 0.5 && lp.z > k.sz - 0.6 && lp.z < k.sz + 0.5) {
      c.occ.dead = true; if (c.occ.pd) { c.occ.pd.dead = true; c.occ.pd.hp = 0; }
      if (this.peds && this.peds.fx && this.life && this.life.gore) this.life.gore.hit(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, 0, dz), 1.6, this.peds.fx);
      if (c.ai || this.dyn.has(c)) { this.wake(c); c.coast = true; }
      if (this.peds) this.peds.alarm(c.x, c.z, 30, true, "gun");
    }
  }
  // hits are tested against the car's real outline
  touching(c, x, z, r) { const S = c.S, s = Math.sin(c.a), co = Math.cos(c.a), rx = x - c.x, rz = z - c.z, lx = rx * co - rz * s, lz = rx * s + rz * co; return Math.abs(lx) < (S ? S.hw : 0.95) + r && Math.abs(lz) < (S ? S.hl : 2.2) + r; }
  // health down; smoke and fire take over below half
  hurt(c, amount) {
    if (c.wreck || amount <= 0) return;
    c.health = Math.max(0, (c.health ?? 100) - amount);
    if (c.detail) c.detail.tint(0.75 + 0.25 * Math.min(1, c.health / 70));
    if (c.health < 55) this.burning.add(c);
  }
  explode(c) {
    c.wreck = true; c.health = 0; c.charred = true; this.burning.delete(c);
    this.fleet.detail(c).char();
    const was = this.car === c; if (was) this.exit(true);
    this.killInside(c, was);
    // thrown into the air, turning over
    this.wake(c); c.vy = 6 + Math.random() * 3; c.airT = 0.01; c.flipV = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4); c.om += (Math.random() - 0.5) * 3;
    this.burning.add(c); c.smoke = 18;
    this.blast(c.x, (c.y || 0) + 1, c.z, 1, c);
    if (c.ai && this.traffic) { c.ai = false; c.taken = true; }
  }
  // everyone in (or getting in or out of) a car that goes up dies with it: at the wheel, slumped and burnt in their
  // seat; halfway out of a door, thrown by the blast; police riding in it; you
  killInside(c, you) {
    const at = new THREE.Vector3(c.x, (c.y || 0) + 1, c.z);
    if (you && this.life) this.life.damage(9999, { point: this.player.pos.clone().setY(this.player.pos.y + 1), dir: new THREE.Vector3(Math.random() - 0.5, 1.2, Math.random() - 0.5).normalize(), force: 11, cause: "blast" });
    if (this.act && this.act.c === c) { this.act = null; if (this.life) this.life.damage(9999, { point: at, dir: new THREE.Vector3(this.player.pos.x - c.x, 1.2, this.player.pos.z - c.z).normalize(), force: 11, cause: "blast" }); }
    // anyone mid-door: out of the animation and into a ragdoll, blown clear
    for (let i = this.npcActs.length - 1; i >= 0; i--) {
      const a = this.npcActs[i].a; if (a.c !== c) continue; this.npcActs.splice(i, 1); if (a.cop) a.cop.boarding = a.cop.exiting = false;
      const d = this.drivers.find((x) => x.w === a.w), pd = d ? d.pd : a.cop || (a.w && this.peds && this.peds.peds.find((q) => q.h.group === a.w.g));
      if (d) this.releaseDriver(d.pd);
      if (pd && this.peds) { pd.inCar = null; pd.exiting = false; const g = pd.h.group.position; this.peds.damage(pd, { point: g.clone().setY(g.y + 1), dir: new THREE.Vector3(g.x - c.x, 1.3, g.z - c.z).normalize(), damage: 9999, from: { x: c.x, z: c.z }, force: 11 }); }
    }
    // whoever's at the wheel
    if (c.occ && !c.occ.player) {
      c.occ.dead = true;
      if (c.occ.pd && this.peds) this.peds.damage(c.occ.pd, { point: at, dir: new THREE.Vector3(0, 1, 0), damage: 9999, from: { x: c.x, z: c.z } });
    }
    // the police riding in it (police.js)
    if (this.onCarDestroyed) this.onCarDestroyed(c);
  }
  // a blast at (x, y, z): the show, and everything nearby takes it
  blast(x, y, z, size = 1, from = null) {
    const at = new THREE.Vector3(x, y, z), P = this.player, dist = Math.hypot(x - P.pos.x, z - P.pos.z);
    if (this.flash) { this.flash.position.set(x, y + 1, z); this.flash.visible = true; this.flashT = 0.4; }
    if (this.fx) {
      for (let i = 0; i < 10; i++) this.fx.puff(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3), (4 + Math.random() * 3) * size, 1.1 + Math.random() * 0.6, [0xfff0a0, 0xffb040, 0xff7020][i % 3], 0.95);
      for (let i = 0; i < 6; i++) this.fx.puff(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4)), new THREE.Vector3(0, 2.5 + Math.random() * 2, 0), (6 + Math.random() * 3) * size, 3, 0x1e1b19, 0.8);
      this.fx.sparks(at, 70, new THREE.Vector3(0, 1, 0), 13, 0xffb050, 1.2);
    }
    const D = this.debris;
    if (D) for (let n = 0; n < 16; n++) { const q = D.list[D.k++ % D.N]; q.p.copy(at); q.v.set((Math.random() - 0.5) * 16, 5 + Math.random() * 10, (Math.random() - 0.5) * 16); q.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12); q.life = 7; }
    if (this.scorchMat) { const m = new THREE.Mesh(new THREE.CircleGeometry(3.2 + Math.random(), 12).rotateX(-Math.PI / 2), this.scorchMat); m.position.set(x, this.world.heightAt(x, z) + 0.07, z); m.renderOrder = 2; this.scene.add(m); this.scorches.push(m); if (this.scorches.length > 14) this.scene.remove(this.scorches.shift()); }
    if (this.sfx.explosion) this.sfx.explosion(dist); else if (this.sfx.boom) this.sfx.boom(dist * 0.3, 0);
    if (this.rig) { const k = Math.max(0, 1 - dist / 90); this.rig.shake = Math.max(this.rig.shake || 0, 2.2 * k); this.rig.recoil = (this.rig.recoil || 0) + 0.06 * k; }
    // the people: you, the street
    if (this.life && dist < 11) { const k = 1 - dist / 11; this.life.damage((this.driving ? 70 : 130) * Math.pow(k, 1.2), { point: at, dir: new THREE.Vector3(P.pos.x - x, 1.4, P.pos.z - z).normalize(), force: 10 * k, cause: "blast" }); }
    if (this.peds) { for (const pd of this.peds.peds) { if (pd.dead || !pd.h.group.visible) continue; const g = pd.h.group.position, d = Math.hypot(g.x - x, g.z - z); if (d < 9) this.peds.damage(pd, { point: g.clone().setY(g.y + 1), dir: new THREE.Vector3(g.x - x, 1.3, g.z - z).normalize(), damage: d < 6 ? 300 : 60, from: { x, z }, force: 10 * (1 - d / 9) + 2 }); } this.peds.alarm(x, z, 80); }
    if (this.traffic) this.traffic.panic(x, z, 90);
    // other cars take it: shoved away, dented on the near side (and may go up too); lamp posts go over
    for (const o of this.all()) {
      if (o === from || o.wreck || o.hidden) continue; const d = Math.hypot(o.x - x, o.z - z); if (d > 9) continue;
      const k = 1 - d / 9, nx = (o.x - x) / (d || 1), nz = (o.z - z) / (d || 1);
      this.wake(o); o.vx += nx * 7 * k; o.vz += nz * 7 * k; o.om += (Math.random() - 0.5) * 2 * k; if (k > 0.5) { o.vy = 2 + 3 * k; o.airT = 0.01; }
      this.impactCar(o, o.x - nx * o.S.hw, o.z - nz * o.S.hw, nx, nz, 16 * k + 3); this.hurt(o, 55 * k);
    }
    for (const L of this.props.lamps) { if (L.broken) continue; const d = Math.hypot(L.x - x, L.z - z); if (d < 5.5) this.breakLamp(L, L.x - x, L.z - z, 10); }
  }
  // smoke, then fire, then the bang, for any hurt car (driven or not)
  burn(dt) {
    for (const c of this.burning) {
      c.smokeT = (c.smokeT || 0) - dt;
      if (c.wreck) {
        if ((c.smoke -= dt) <= 0 && !(c.airT > 0)) { this.burning.delete(c); continue; }
        if (c.smokeT <= 0 && this.fx) { c.smokeT = 0.12; this.fx.puff(new THREE.Vector3(c.x + (Math.random() - 0.5), c.y + 1.2, c.z + (Math.random() - 0.5)), new THREE.Vector3((Math.random() - 0.5) * 0.4, 2 + Math.random(), (Math.random() - 0.5) * 0.4), 1.8, 2.6, Math.random() < 0.2 ? 0xff7a30 : 0x161412, 0.6); }
        continue;
      }
      if (c.health < 18) c.fire = (c.fire || 0) + dt;
      if (c.fire > 5) { this.explode(c); continue; }
      if (c.smokeT > 0 || !this.fx) continue;
      c.smokeT = c.health < 18 ? 0.07 : 0.14;
      const fx = Math.sin(c.a), fz = Math.cos(c.a), nose = c.m ? c.m.axle[0] + 0.3 : 1.5, hood = new THREE.Vector3(c.x + fx * nose, c.y + (c.m ? c.m.cab.belt + 0.1 : 1.05), c.z + fz * nose);
      const col = c.health < 18 ? (Math.random() < 0.5 ? 0xff8a30 : 0x2a2624) : c.health < 32 ? 0x3a3634 : 0x9a968e;
      this.fx.puff(hood, new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.4 + Math.random(), (Math.random() - 0.5) * 0.4), c.health < 32 ? 1.2 : 0.8, 1.4, col, 0.55);
    }
  }
  // a lamp post snapped off at its foot, falling the way it was hit
  breakLamp(L, dirx, dirz, v) {
    L.broken = true; this.world.grid.remove(L.obj);
    const M = this.props.lampMeshes, zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const im of [M.pI, M.hI, M.lI]) { im.setMatrixAt(L.i, zero); im.instanceMatrix.needsUpdate = true; }
    const grp = new THREE.Group(), pole = new THREE.Mesh(M.pole, M.pI.material), head = new THREE.Mesh(M.head, new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
    grp.add(pole, head); grp.position.set(L.x, 0, L.z); this.scene.add(grp);
    const yaw = Math.atan2(L.dx, L.dz), l = Math.hypot(dirx, dirz) || 1, dir = new THREE.Vector3(dirx / l, 0, dirz / l);
    this.falling.push({ grp, yaw: new THREE.Quaternion().setFromAxisAngle(UP, yaw), axis: new THREE.Vector3().crossVectors(UP, dir).normalize(), th: 0.02, w: Math.min(2.6, 0.4 + v * 0.16), vx: dir.x * v * 0.35, vz: dir.z * v * 0.35, rest: false, hits: 0 });
    if (this.fx) this.fx.sparks(new THREE.Vector3(L.x, 0.4, L.z), 22, dir, 4, 0xffc060, 0.5);
    if (this.sfx.crash) this.sfx.crash(Math.min(1, v / 18));
    if (this.sfx.glass) this.sfx.glass(0.5);
  }
  fall(dt) {
    for (const f of this.falling) {
      if (f.rest) continue;
      f.w += 2.1 * Math.sin(f.th) * dt; f.th += f.w * dt;
      f.grp.position.x += f.vx * dt; f.grp.position.z += f.vz * dt; const fr = Math.max(0, 1 - dt * 2.5); f.vx *= fr; f.vz *= fr;
      if (f.th > 1.52) {
        f.th = 1.52; f.hits++;
        if (f.hits === 1) { const tip = new THREE.Vector3(0, 6.8, 1.5).applyQuaternion(f.grp.quaternion).add(f.grp.position); if (this.fx) { this.fx.sparks(tip, 14, new THREE.Vector3(0, 1, 0), 3, 0xffd080, 0.4); this.fx.puff(tip, new THREE.Vector3(0, 0.5, 0), 1.2, 0.9, 0x9a948a, 0.5); } if (this.sfx.glass) this.sfx.glass(1); if (this.sfx.crash) this.sfx.crash(0.5); }
        f.w = -f.w * 0.22; if (Math.abs(f.w) < 0.25) f.rest = true;
      }
      f.grp.quaternion.setFromAxisAngle(f.axis, f.th).multiply(f.yaw);
    }
  }
  breakHydrant(H) {
    H.broken = true; this.world.grid.remove(H.obj);
    const im = this.props.hydrantMesh, i = this.props.hydrants.indexOf(H); if (im && i >= 0) { im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); im.instanceMatrix.needsUpdate = true; }
    this.geysers.push({ x: H.x, z: H.z, t: 30, hiss: this.sfx.hiss ? this.sfx.hiss() : null });
    if (this.sfx.crash) this.sfx.crash(0.4);
  }
  geyser(dt) {
    const S = this.spray, pa = S.g.attributes.position;
    for (const G of this.geysers) {
      if (G.t <= 0) continue; G.t -= dt;
      const strength = Math.min(1, G.t / 4);
      if (G.hiss) { G.hiss.set(strength, Math.hypot(G.x - this.player.pos.x, G.z - this.player.pos.z)); if (G.t <= 0) { G.hiss.stop(); G.hiss = null; } }
      for (let n = 0; n < Math.ceil(dt * 140 * strength); n++) { const q = S.pts[S.k++ % S.N]; q.p.set(G.x + (Math.random() - 0.5) * 0.2, 0.5, G.z + (Math.random() - 0.5) * 0.2); q.v.set((Math.random() - 0.5) * 1.4, (8 + Math.random() * 3) * strength, (Math.random() - 0.5) * 1.4); q.life = 1.8; }
    }
    for (let i = 0; i < S.N; i++) { const q = S.pts[i]; if (q.life > 0) { q.life -= dt; q.v.y -= 9.8 * dt; q.p.addScaledVector(q.v, dt); if (q.p.y < 0.05) { q.p.y = 0.05; q.v.set(q.v.x * 0.5, 0, q.v.z * 0.5); } if (q.life <= 0) q.p.y = -999; } pa.setXYZ(i, q.p.x, q.p.y, q.p.z); }
    pa.needsUpdate = true;
  }
  liftAt(x, z) { let l = 0; for (const G of this.geysers) if (G.t > 0) { const d = Math.hypot(G.x - x, G.z - z); if (d < 1.8) l = Math.max(l, (1 - d / 1.8) * 0.9 * Math.min(1, G.t / 4)); } return l; }

  /* ---- physics ---- */
  // a car comes loose: off the grid, off its lane, under the full model until it settles
  wake(c) {
    if (c === this.car || c.hidden) return;
    if (c.obb) { this.world.grid.remove(c.obb); c.obb = null; }
    if (!this.dyn.has(c)) { this.dyn.add(c); c.restT = 0; if (c.ai) { c.wasAi = true; } }
    c.dynT = 0;
  }
  settle(c) {
    this.dyn.delete(c); c.vx = c.vz = c.om = 0; c.speed = 0;
    // back into traffic if whoever's driving can (and isn't you); otherwise it stays where it is, solid
    if (c.wasAi && c.ai && !c.wreck && c.occ && !c.occ.dead && c.health > 25 && this.traffic && this.traffic.resume(c)) { c.wasAi = false; return; }
    c.wasAi = false;
    if (c.ai) { c.ai = false; c.taken = true; }
    if (!c.obb && !c.hidden) { c.obb = this.world.grid.obb(c.x, c.z, c.S.hw, c.S.hl, -c.a, (c.y || 0) + (c.m ? c.m.cab.roof : 1.5)); c.obb.car = c; }
    // a driver that can still walk gets out after a crash and gets away from it
    if (c.occ && !c.occ.dead && !c.occ.player && c.occ.pd && !c.occ.leaving) this.npcExit(c, true);
  }
  physics(dt) {
    const list = this._list || (this._list = []); list.length = 0;
    if (this.car && !this.act) list.push(this.car);
    for (const c of this.dyn) list.push(c);
    if (!list.length) return;
    const n = Math.min(8, Math.ceil(dt * HZ)), h = dt / n, near = this.nearCars(list);
    for (let k = 0; k < n; k++) {
      for (const c of list) {
        const ctl = c === this.car ? this.ctl : (c.ctl || (c.occ && !c.occ.dead ? { thr: 0, brk: c.stun > 0 ? 0.5 : 0.25, steer: 0 } : c.coast ? COAST : REST));
        if (Math.abs(c.flip || 0) > 1.1) this.slide(c, h); else step(c, ctl, h, this.env);
        if (c !== this.car) c.brake = ctl.brk > 0.15;
      }
      for (const c of list) { this.collideWorld(c); this.collideCars(c, near); }
    }
    for (const c of list) {
      if (c !== this.car && this.peds && Math.hypot(c.vx, c.vz) > 3) this.runDown(c, false);
      const land = ride(c, dt, this.world.heightAt);
      if (c.flipV) { if (c.airT > 0) c.flip = (c.flip || 0) + c.flipV * dt; else { const target = Math.abs(Math.sin((c.flip || 0) / 2)) > 0.7 ? Math.PI : 0; c.flip += ((target ? Math.sign(c.flip) * Math.PI : 0) - c.flip) * Math.min(1, dt * 6); if (Math.abs(c.flipV) < 0.3) c.flipV = 0; else c.flipV *= 0.3; } }
      if (land > 3 && c.m) { const v = land; if (this.sfx.crash) this.sfx.crash(Math.min(1, v / 14)); if (v > 6) { this.hurt(c, (v - 6) * 4); const d = this.fleet.detail(c); d.hit(_v.set(0, 0.05, c.m.axle[0] + 0.2), _u.set(0, 1, 0), v * 0.6, 0.5); } if (c === this.car && this.rig) this.rig.shake = Math.min(1, v / 10); }
      c.lift = (c.lift || 0) + (this.liftAt(c.x, c.z) - (c.lift || 0)) * Math.min(1, dt * 4);
      if (c !== this.car) {
        c.dynT += dt; if (c.stun > 0) c.stun -= dt;
        const still = Math.hypot(c.vx, c.vz) < 0.15 && Math.abs(c.om) < 0.06 && !(c.airT > 0);
        c.restT = still ? c.restT + dt : 0;
        if (c.restT > 0.7 && c.dynT > 1) this.settle(c);
      }
    }
  }
  // on its roof (or side): it slides and scrapes to a stop
  slide(c, h) {
    const sp = Math.hypot(c.vx, c.vz), dec = Math.min(sp, 6.5 * h);
    if (sp > 1e-4) { c.vx -= c.vx / sp * dec; c.vz -= c.vz / sp * dec; }
    c.om *= 1 - Math.min(1, h * 2.5); c.a += c.om * h; c.x += c.vx * h; c.z += c.vz * h; c.speed = fwdSpeed(c);
    if (sp > 2 && this.fx && Math.random() < h * 30) this.fx.sparks(new THREE.Vector3(c.x, c.y + 0.1, c.z), 3, new THREE.Vector3(-c.vx, 1, -c.vz).normalize(), 3, 0xffc070, 0.3);
  }
  nearCars(list) {
    const out = this._near || (this._near = []); out.length = 0;
    for (const o of this.all()) { if (o.hidden || !o.S) continue; for (const c of list) if (Math.abs(o.x - c.x) < 14 && Math.abs(o.z - c.z) < 14) { out.push(o); break; } }
    return out;
  }
  collideWorld(c) {
    const W = this.world, r = c.S.hl + 0.6, top = (c.y || 0) + (c.m ? c.m.cab.roof : 1.5);
    for (const o of W.grid.near(c.x - r, c.z - r, c.x + r, c.z + r)) {
      if (o.car) continue;
      if ((o.h ?? 50) < (c.y || 0) + 0.3 || (o.y0 || -10) > top) continue;   // under the bumper, or overhead
      const ct = o.r ? circleBox(c, o.x, o.z, o.r) : gridBox(c, o); if (!ct) continue;
      const sp = Math.hypot(c.vx, c.vz);
      if (o.lamp && !o.lamp.broken && sp > 4) { this.breakLamp(o.lamp, c.vx, c.vz, sp); c.vx *= 0.8; c.vz *= 0.8; this.hit(c, ct.p, ct.n, sp * 0.45, null); continue; }
      if (o.hydrant && !o.hydrant.broken && sp > 1.5) { this.breakHydrant(o.hydrant); c.vx *= 0.9; c.vz *= 0.9; this.hit(c, ct.p, ct.n, Math.min(sp, 5), null, (c.y || 0) + 0.3); continue; }
      c.x += ct.n[0] * ct.depth; c.z += ct.n[1] * ct.depth;
      const v = impulse(c, null, ct.n, ct.p, 0.12, 0.5);
      if (v > 1.5) this.contact(c, null, ct, v);
    }
  }
  collideCars(c, near) {
    for (const o of near) {
      if (o === c || o.hidden || (o === this.car && this.act)) continue;
      if (Math.abs(o.x - c.x) > c.S.hl + o.S.hl + 1 || Math.abs(o.z - c.z) > c.S.hl + o.S.hl + 1) continue;
      if (Math.abs((o.y || 0) - (c.y || 0)) > 1.6 && !(o.flip || c.flip)) continue;
      const ct = boxBox(c.x, c.z, c.a, c.S.hw, c.S.hl, o.x, o.z, o.a, o.S.hw, o.S.hl); if (!ct) continue;
      const free = this.dyn.has(o) || o === this.car;
      // closing speed at the contact
      const rv = (c.vx + c.om * (ct.p[1] - c.z) - (free || o.ai ? o.vx + o.om * (ct.p[1] - o.z) : 0)) * ct.n[0] + (c.vz - c.om * (ct.p[0] - c.x) - (free || o.ai ? o.vz - o.om * (ct.p[0] - o.x) : 0)) * ct.n[1];
      // a gentle lean on a parked or driving car pushes you, not it; anything more and it comes loose
      if (!free && (-rv > 1.2 || o.ai)) { this.wake(o); }
      if (this.dyn.has(o) || o === this.car) {
        const ia = 1 / c.S.mass, ib = 1 / o.S.mass, s = ct.depth / (ia + ib);
        c.x += ct.n[0] * s * ia; c.z += ct.n[1] * s * ia; o.x -= ct.n[0] * s * ib; o.z -= ct.n[1] * s * ib;
        const v = impulse(c, o, ct.n, ct.p, 0.2, 0.35);
        if (v > 1.5) { this.contact(c, o, ct, v); this.contact(o, c, { n: [-ct.n[0], -ct.n[1]], p: ct.p }, v); }
      } else {
        c.x += ct.n[0] * ct.depth; c.z += ct.n[1] * ct.depth;
        const v = impulse(c, null, ct.n, ct.p, 0.15, 0.4);
        if (v > 1.5) this.contact(c, o, ct, v);
      }
    }
  }
  contact(c, o, ct, v) {
    this.hit(c, ct.p, ct.n, v, o);
    if (o && o.ai && v > 3) { o.stun = 3; o.panic = Math.max(o.panic || 0, 0); }
    // the sound, once a hit (not every substep)
    const now = performance.now();
    if (now - (c.crashT || 0) > 180 && v > 2) { c.crashT = now; const d = Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z); if (this.sfx.crash) this.sfx.crash(Math.min(1, v / 22) / (1 + d / 25)); }
  }
  // boxes for ragdolls to land on: near (x, z), each car as a box with its roofline
  boxesNear(x, z, rag) {
    const out = this._boxes || (this._boxes = []); out.length = 0;
    for (const c of this.all()) {
      if (c.hidden || !c.S || Math.abs(c.x - x) > 5 || Math.abs(c.z - z) > 5) continue;
      if (rag && rag.skip === c && rag.t < (rag.skipT || 0.8)) continue;
      out.push(c);
    }
    return out;
  }
  // you on foot: not through cars that aren't on the grid (moving ones)
  pushOut(p, r) {
    for (const c of this.all()) {
      if (c.obb || c.hidden || c === this.car || !c.S || Math.abs(c.x - p.x) > 4 || Math.abs(c.z - p.z) > 4) continue;
      const ct = circleBox(c, p.x, p.z, r); if (!ct) continue;
      p.x -= ct.n[0] * ct.depth; p.z -= ct.n[1] * ct.depth;
    }
  }

  /* ---- the frame ---- */
  update(dt, input) {
    this.burn(dt); this.fall(dt); this.geyser(dt); this.boomFx(dt);
    for (const c of this.cars) if (c.obb && !c.obb.car) c.obb.car = c;
    if (this.traffic) for (const c of this.traffic.cars) if (c.obb && !c.obb.car) c.obb.car = c;
    let used = false;
    // knocked down (or worse) halfway into a car: let go of it
    if (this.act && this.life && this.life.down) { const c = this.act.c; this.act = null; if (c) { c.held = false; if (c.door > 0 && !c.detail) c.door = 0; } }
    if (this.act) { used = true; this.stepAct(dt); }
    else if (this.car) used = this.drive(dt, input);
    else used = this.onFoot(dt, input);
    this.physics(dt);
    if (this.car && !this.act) this.sitIn(dt);
    this.people(dt);
    if ((this.unparkT -= dt) <= 0) { this.unparkT = 5 + Math.random() * 6; this.unpark(); }
    return used;
  }
  // drawn last thing before the frame, once every system has moved its cars
  draw(dt) {
    for (const c of this.all()) c.dummy = !!(c.occ && !c.occ.player && !c.occ.pd && !c.occ.dead);
    this.fleet.render(this.all(), this.camera, dt);
  }
  // on foot: is a door handle within reach? show the E over it
  onFoot(dt, input) {
    const p = this.player.pos; let best = null, bd = 2.3;
    for (const c of this.all()) {
      if (c.wreck || c.hidden || !c.m || Math.abs(c.x - p.x) > 5 || Math.abs(c.z - p.z) > 5) continue;
      if (Math.abs(c.speed || 0) > 3.5 || (c.cop && c.ai) || (c.occ && c.occ.leaving)) continue;
      const d = this.door(c), dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < bd) { bd = dd; best = c; }
    }
    this.near = best;
    if (best && this.player.aimYaw === null && input.hit("KeyE")) { this.enter(best); return true; }
    this.showPrompt(best ? this.door(best) : null);
    return false;
  }
  // the driver's door handle, in the world
  door(c) { const k = this.seats.keys(c), sn = Math.sin(c.a), cs = Math.cos(c.a), lx = k.hw + 0.05, lz = k.zD + 0.18; return { x: c.x + lx * cs + lz * sn, y: (c.y || 0) + k.belt - 0.1, z: c.z - lx * sn + lz * cs, lx: cs, lz: -sn }; }
  showPrompt(at) {
    const el = this.prompt; if (!el) return;
    if (!at) { if (this.pOn) { el.classList.remove("on"); this.pOn = false; } return; }
    _p.set(at.x, at.y + 0.35, at.z).project(this.camera);
    if (_p.z > 1) { el.classList.remove("on"); this.pOn = false; return; }
    el.style.transform = `translate(${((_p.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - _p.y) / 2 * innerHeight).toFixed(0)}px)`;
    if (!this.pOn) { el.classList.add("on"); this.pOn = true; if (this.on) this.on("near-car"); }
  }
  // in: walk up and get in (or pull whoever's driving out first)
  enter(c) {
    if (!this.you) return this.seated(c);
    const occupied = c.occ && !c.occ.player && !c.occ.dead;
    if (this.traffic && c.ai) this.traffic.take(c);
    c.held = true; c.speed = 0; this.dyn.delete(c); c.vx = c.vz = c.om = 0;
    if (c.obb) { this.world.grid.remove(c.obb); c.obb = null; }
    if (c.slot) { c.slot.car = null; c.slot = null; }
    this.showPrompt(null);
    const sfx = (k) => { if (k === "open" && this.sfx.door) this.sfx.door(); if (k === "close" && this.sfx.door) this.sfx.door(); };
    let victim = null;
    if (occupied) { const d = this.realDriver(c, true); if (d) victim = { w: d.w, pd: d.pd }; }
    // a dead driver: hauled out the same way, just limp
    if (c.occ && c.occ.dead && c.occ.pd) victim = { w: this.drivers.find((d) => d.pd === c.occ.pd)?.w, pd: c.occ.pd, dead: true };
    this.act = this.seats.start(victim ? "jack" : "enter", this.you, c, { victim, onSfx: sfx, onThrow: (a) => this.throwOut(a), onDone: () => this.seated(c) });
    if (victim && victim.pd && this.peds) { victim.pd.anger = 3.2; if (this.peds.say) this.peds.say(victim.pd, "jacked"); }
    if (this.rig) { this.rig.yaw = c.a + Math.PI * 0.75; }
  }
  // the carjacked driver lands on the road: a ragdoll that gets up angry (or scared)
  throwOut(a) {
    const v = a.victim; if (!v || !v.pd) return;
    const c = a.c, pd = v.pd, sn = Math.sin(c.a), cs = Math.cos(c.a), ox = cs, oz = -sn, bx = -sn, bz = -cs;
    this.releaseDriver(pd);
    if (c.occ) c.occ = null;
    pd.vx = ox * 1.7 + bx * 2.1; pd.vz = oz * 1.7 + bz * 2.1;
    const g = pd.h.group.position;
    if (this.peds) {
      const hit = { point: new THREE.Vector3(g.x, g.y + 1.2, g.z), dir: new THREE.Vector3(ox * 0.6 + bx * 0.8, 0.35, oz * 0.6 + bz * 0.8).normalize(), force: 4.5 };
      pd.dead = false; this.peds.toStreet(pd, g.x, g.z, { scared: Math.random() < 0.6 });
      if (v.dead) this.peds.damage(pd, Object.assign({ damage: 9999, from: { x: c.x, z: c.z } }, hit)); else this.peds.knock(pd, hit);
      if (pd.rag) { pd.rag.skip = c; pd.rag.skipT = 0.6; }
      if (this.sfx.grunt) this.sfx.grunt(pd.voice, 0);
      this.peds.alarm(c.x, c.z, 25, true, "fight");
    }
  }
  seated(c) {
    this.act = null; this.car = c; c.held = false; c.door = 0; c.occ = { player: true };
    c.coast = false; c.ctl = null; this.dyn.delete(c);
    if (this.player.model) this.player.model.visible = true;
    this.engine = this.sfx.engine ? this.sfx.engine() : null;
    this.skid = this.sfx.skid ? this.sfx.skid() : null;
    if (this.rig) { this.rig.yaw = c.a + Math.PI; this.rig.pitch = 0.22; }
    if (this.on) this.on("in-car");
  }
  // out: thrown (dying, or the car blowing up) puts you beside it at once; otherwise the animation
  exit(thrown) {
    const c = this.car; if (!c) return;
    if (this.engine) { this.engine.stop(); this.engine = null; } if (this.skid) { this.skid.stop(); this.skid = null; }
    this.car = null; c.occ = null; this.ctl.thr = this.ctl.brk = 0;
    if (thrown) {
      const d = this.door(c), P = this.player, x = d.x + d.lx * 0.6, z = d.z + d.lz * 0.6;
      P.pos.set(x, this.world.heightAt(x, z), z); P.vel.set(c.vx || 0, 0, c.vz || 0); this.lastCar = c;
      // standing beside it (whatever happens to the body next starts from there)
      if (this.you && this.you.body.ok) { const m = this.player.model; m.position.copy(P.pos); m.rotation.set(0, c.a + Math.PI / 2, 0); for (const k in this.player.act) this.player.act[k].setEffectiveWeight(k === "idle" ? 1 : 0); this.player.mixer.update(0); this.you.body.reset(); m.updateMatrixWorld(true); }
      this.wake(c); c.coast = true;
      return;
    }
    this.act = this.seats.start("exit", this.you, c, { onSfx: (k) => { if (this.sfx.door) this.sfx.door(); void k; }, onDone: () => this.outside(c) });
  }
  outside(c) {
    this.act = null; const P = this.player, g = this.player.model.position;
    P.pos.set(g.x, this.world.heightAt(g.x, g.z), g.z); P.yaw = this.player.model.rotation.y; P.vel.set(0, 0, 0); P.speed = 0;
    if (this.player.model) this.player.model.rotation.set(0, P.yaw, 0);
    c.speed = 0; c.vx = c.vz = c.om = 0; c.door = 0;
    // a car left standing: solid again
    if (!c.obb) { c.obb = this.world.grid.obb(c.x, c.z, c.S.hw, c.S.hl, -c.a, (c.y || 0) + c.m.cab.roof); c.obb.car = c; }
  }
  // out of a moving car: the door flung open and a dive, the car carrying on
  bail() {
    const c = this.car; if (!c || !this.you) return this.exit(true);
    if (this.engine) { this.engine.stop(); this.engine = null; } if (this.skid) { this.skid.stop(); this.skid = null; }
    this.car = null; c.occ = null; this.ctl = { thr: 0, brk: 0, steer: 0, hand: false, rev: false };
    this.dyn.add(c); c.restT = 0; c.dynT = 0; c.coast = true;
    this.act = this.seats.start("bail", this.you, c, { onSfx: () => this.sfx.door && this.sfx.door(), onLaunch: () => this.launch(c) });
  }
  launch(c) {
    this.act = null; const P = this.player, sn = Math.sin(c.a), cs = Math.cos(c.a), ox = cs, oz = -sn;
    const g = this.player.model.position; P.pos.set(g.x, g.y, g.z);
    P.vel.set(c.vx + ox * 3.2, 0, c.vz + oz * 3.2);
    this.lastCar = c;
    if (this.life) {
      this.life.fling({ point: P.pos.clone().setY(P.pos.y + 0.9), dir: new THREE.Vector3(ox * 0.7 + sn * 0.2, 0.55, oz * 0.7 + cs * 0.2).normalize(), force: 5.5 }, 2.4 + Math.min(1.5, Math.hypot(c.vx, c.vz) * 0.05));
      if (this.life.rag) { this.life.rag.skip = c; this.life.rag.skipT = 0.7; this.life.rag.spin(Math.hypot(c.vx, c.vz)); }
      const sp = Math.hypot(c.vx, c.vz); if (sp > 14) this.life.damage((sp - 14) * 2, { force: 0, cause: "bail" });
    }
    if (this.sfx.grunt) this.sfx.grunt({ female: true, pitch: 1 }, 0);
  }
  stepAct(dt) {
    const a = this.act; this.showPrompt(null);
    this.seats.step(a, dt);
    const g = this.player.model ? this.player.model.position : null;
    if (g && this.act === a) { this.player.pos.set(g.x, Math.max(this.world.heightAt(g.x, g.z), g.y - 0.0), g.z); this.player.speed = 0; this.player.vel.set(0, 0, 0); }
    // a car stopped to be got into stays stopped
    if (a.c && a.c !== this.car && a.kind !== "bail") { a.c.vx = a.c.vz = a.c.om = 0; a.c.speed = 0; }
    if (a.kind === "bail" && this.dyn.has(a.c)) { /* the car carries on under its own physics */ }
  }
  // you at the wheel
  drive(dt, input) {
    const c = this.car, u = fwdSpeed(c);
    if (input.hit("KeyE")) { if (Math.abs(u) > 3.2) { this.bail(); return true; } this.leaving = true; }
    const W = input.down("KeyW", "ArrowUp"), S = input.down("KeyS", "ArrowDown"), ctl = this.ctl;
    // throttle and brakes; S at a stop is reverse, W while reversing brakes
    if (this.leaving) { ctl.thr = 0; ctl.brk = 1; ctl.rev = false; if (Math.abs(u) < 0.6) { this.leaving = false; this.exit(); return true; } }
    else if (c.gear < 0) { ctl.rev = S || u < -0.5; ctl.thr = S ? 1 : 0; ctl.brk = W ? 1 : 0; if (W && u > -0.6) { ctl.rev = false; ctl.thr = 1; ctl.brk = 0; } }
    else { ctl.thr = W ? 1 : 0; ctl.brk = S && u > 0.8 ? 1 : 0; ctl.rev = S && u <= 0.8; if (ctl.rev) { ctl.thr = 1; ctl.brk = 0; } }
    ctl.hand = input.down("Space"); c.brake = ctl.brk > 0.05 || (ctl.hand && Math.abs(u) > 1);
    // steering: full lock at a crawl, less as it goes faster; a touch of counter-steer when the tail steps out
    const want = (input.down("KeyA", "ArrowLeft") ? 1 : 0) - (input.down("KeyD", "ArrowRight") ? 1 : 0);
    const lock = Math.min(0.62, c.S.L * 9.8 * c.S.mu / (u * u + 1) * 1.15 + 0.07), beta = Math.abs(u) > 4 ? Math.atan2(c.vx * Math.cos(c.a) - c.vz * Math.sin(c.a), Math.abs(u)) : 0;
    const target = Math.max(-0.62, Math.min(0.62, want * lock + (want === 0 ? beta * 0.55 : beta * 0.25) * Math.sign(u || 1)));
    const rate = (want !== 0 && Math.sign(target) === Math.sign(ctl.steer) ? 2.6 : 4.2);
    ctl.steer += Math.max(-rate * dt, Math.min(rate * dt, target - ctl.steer));
    if (c.flats) ctl.steer += Math.sin(performance.now() / 160) * 0.04 * Math.min(1, Math.abs(u) / 8);
    if (c.camber) ctl.steer += (c.bent ? c.bent.reduce((x, y) => x + y, 0) : 0) * 0.15 * Math.min(1, Math.abs(u) / 6);
    // people in the way go down (and land on the bonnet)
    if (this.peds && Math.hypot(c.vx, c.vz) > 2) this.runDown(c, true);
    if (this.engine) this.engine.set(Math.max(0, (c.rpm - 850) / 5650) * 0.9, ctl.thr);
    if (this.skid) { const sk = Math.max(0, Math.max(c.slipR || 0, c.slipF || 0) - 0.18) * Math.min(1, Math.hypot(c.vx, c.vz) / 6) + (c.spinR || 0) * 0.7; this.skid.set(Math.min(1, sk * 2.2)); if (sk > 0.25 && this.fx && Math.random() < dt * 12) this.fx.puff(new THREE.Vector3(c.x - Math.sin(c.a) * 1.4, c.y + 0.2, c.z - Math.cos(c.a) * 1.4), new THREE.Vector3(0, 0.6, 0), 1.1, 1.4, 0xb8b4ac, 0.25); }
    return true;
  }
  // you ride along: the camera follows the car, the body sits in it
  sitIn(dt) {
    const c = this.car, P = this.player;
    P.pos.set(c.x, c.y || 0, c.z); P.speed = Math.abs(c.speed); P.yaw = c.a; P.vel.set(c.vx, 0, c.vz);
    if (this.you) this.seats.drive(this.you, c, { steer: this.ctl.steer, dt });
  }
  // anyone in front of a moving car c gets hit by it
  runDown(c, byPlayer) {
    const S = c.S, co = Math.cos(c.a), sn = Math.sin(c.a);
    for (let i = 0; i < this.peds.peds.length; i++) {
      const pd = this.peds.peds[i]; if (pd.dead || pd.down > 0 || pd.inCar || !pd.h.group.visible) continue;
      const g = pd.h.group.position, rx = g.x - c.x, rz = g.z - c.z, lx = rx * co - rz * sn, lz = rx * sn + rz * co;
      if (Math.abs(lx) > S.hw + 0.25 || Math.abs(lz) > S.hl + 0.25) continue;
      if (pd.hitBy === c && performance.now() - (pd.hitT || 0) < 1500) continue; pd.hitBy = c; pd.hitT = performance.now();
      const vx = c.vx + c.om * rz, vz = c.vz - c.om * rx, v = Math.hypot(vx, vz); if (v < 2) continue;
      // struck at the knees: the legs go, the body folds onto the bonnet (rig.js lets them land on the car)
      const dir = new THREE.Vector3(vx / v, 0.25, vz / v).normalize();
      this.peds.damage(pd, { point: new THREE.Vector3(g.x, g.y + 0.45, g.z), dir, damage: v * 9, from: { x: c.x, z: c.z }, force: Math.min(11, v * 0.75), byPlayer, car: c });
      if (pd.rag) { pd.rag.carry(c); }
      c.vx *= 0.96; c.vz *= 0.96; if (this.sfx.impact) this.sfx.impact("flesh", 0, 0);
      this.peds.alarm(c.x, c.z, 35, true, "car");
      if (v > 5) this.hit(c, [g.x, g.z], [-vx / v, -vz / v], Math.min(v * 0.35, 5), null, (c.y || 0) + 0.7);
    }
  }

  /* ---- the people at the wheel ---- */
  // real drivers go to the cars nearest the camera; everyone further off is a figure through the glass
  people(dt) {
    const pool = this.peds && this.peds.drivers ? this.peds.drivers : [];
    if (!this.drivers.length && pool.length) this.drivers = pool.map((pd) => ({ pd, w: person(pd.h.group, pd.mixer, pd.act), car: null }));
    const cam = this.camera.position;
    if ((this.assignT -= dt) <= 0) {
      this.assignT = 0.3;
      const want = [];
      for (const c of this.all()) { if (!c.occ || c.occ.player || c.hidden || c.occ.own) continue; const d = Math.hypot(c.x - cam.x, c.z - cam.z); if (d < (c.occ.pd ? 44 : 36)) want.push([d, c]); }
      want.sort((a, b) => a[0] - b[0]);
      const keep = new Set(want.slice(0, this.drivers.length).map((x) => x[1]));
      for (const d of this.drivers) if (d.car && !d.own && (!keep.has(d.car) || d.car.occ == null || d.car.occ.pd !== d.pd)) if (!d.busy) this.unseat(d);
      for (const [, c] of want) { if (!keep.has(c) || c.occ.pd) continue; const d = this.drivers.find((x) => !x.car && !x.busy && !x.pd.out && !x.own); if (!d) break; this.seat(d, c); }
      // someone from the crowd who drove off: back to the crowd once they're well away
      for (let i = this.drivers.length - 1; i >= 0; i--) { const d = this.drivers[i]; if (!d.own || d.busy) continue; const c = d.car; if (!c || c.hidden || !c.active || !c.occ || c.occ.pd !== d.pd || Math.hypot(c.x - cam.x, c.z - cam.z) > 90) { if (c && c.occ && c.occ.pd === d.pd) { c.occ.pd = null; c.occ.own = false; } d.pd.inCar = null; if (this.peds) this.peds.hide(d.pd); this.drivers.splice(i, 1); } }
    }
    // pose them, at the wheel (or slumped over it)
    for (const d of this.drivers) {
      if (!d.car || d.busy) continue; const c = d.car;
      d.pd.h.group.visible = !c.hidden;
      if (c.hidden) continue;
      const near = Math.hypot(c.x - cam.x, c.z - cam.z);
      if (near > 60) continue;
      const react = c.held || (this.act && this.act.c === c) ? Math.min(1, (d.react = (d.react || 0) + dt * 3)) : (d.react = 0);
      const look = (c.held || near < 8) && this.player.model ? this.player.model.position.clone().add(_v.set(0, 1.5, 0)) : null;
      this.seats.drive(d.w, c, { steer: c.steer, dead: c.occ.dead, react, look, dt });
    }
    // other people's comings and goings
    for (let i = this.npcActs.length - 1; i >= 0; i--) { const n = this.npcActs[i]; if (n.a.cop && (n.a.cop.dead || n.a.cop.rag)) { n.a.cop.exiting = false; n.a.cop.boarding = false; this.npcActs.splice(i, 1); continue; } if (!this.seats.step(n.a, dt)) this.npcActs.splice(i, 1); }
  }
  seat(d, c) { d.car = c; c.occ.pd = d.pd; d.pd.inCar = c; d.pd.out = false; d.pd.dead = false; d.pd.rag = null; d.pd.h.group.visible = true; }
  unseat(d) { if (d.car && d.car.occ && d.car.occ.pd === d.pd) d.car.occ.pd = null; d.car = null; d.pd.inCar = null; if (!d.pd.out) d.pd.h.group.visible = false; }
  // a car's driver as a real person, right now (a carjack needs one)
  realDriver(c, force) {
    let d = this.drivers.find((x) => x.car === c); if (d) { d.busy = true; return d; }
    if (!force) return null;
    d = this.drivers.find((x) => !x.car && !x.busy && !x.pd.out && !x.own) || this.drivers.filter((x) => x.car && !x.busy && !x.pd.out && !x.own).sort((a, b) => Math.hypot(b.car.x - c.x, b.car.z - c.z) - Math.hypot(a.car.x - c.x, a.car.z - c.z))[0];
    if (!d) return null; if (d.car) this.unseat(d);
    this.seat(d, c); d.busy = true; return d;
  }
  releaseDriver(pd) { const d = this.drivers.find((x) => x.pd === pd); if (!d) return; if (d.car && d.car.occ && d.car.occ.pd === pd) d.car.occ.pd = null; d.car = null; d.busy = false; pd.inCar = null; pd.out = true; }
  // a driver gets out (after a crash, or parked) and walks off; then: done(c)
  npcExit(c, scared, done) {
    const d = this.drivers.find((x) => x.car === c); if (!d || !c.occ) { if (c.occ && !c.occ.pd) c.occ = null; if (done) done(c); return; }
    c.occ.leaving = true; d.busy = true;
    const a = this.seats.start("exit", d.w, c, { onSfx: () => { const dist = Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z); if (this.sfx.door && dist < 30) this.sfx.door(); },
      onDone: () => { const g = d.pd.h.group.position; this.releaseDriver(d.pd); c.occ = null; if (this.peds) this.peds.toStreet(d.pd, g.x, g.z, { scared }); if (done) done(c); } });
    this.npcActs.push({ a });
  }
  // a police officer out of a stopped car by their side's door, then done(); false if it can't be animated
  copOut(c, pd, side, done) {
    if (!c.m || c.hidden || !pd.h || !pd.mixer) return false;
    const w = person(pd.h.group, pd.mixer, pd.act); if (!w.body || !w.body.ok) return false;
    pd.h.group.visible = true; if (pd.gun) pd.gun.visible = false;
    const a = this.seats.start("exit", w, c, { side, rate: 1.35, onSfx: () => { if (this.sfx.door && Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) < 40) this.sfx.door(); },
      onDone: () => { pd.h.group.rotation.set(0, pd.h.group.rotation.y, 0); done(); } });
    a.cop = pd; this.npcActs.push({ a }); return true;
  }
  // the spot outside a car's door to walk up to (side 1 the driver's, -1 the passenger's)
  doorSpot(c, side = 1) { const k = this.seats.keys(c); return this.seats.ground(c, k.A.x * side, k.A.z); }
  // a police officer back into a stopped car by their side's door, then done()
  copIn(c, pd, side, done, rate = 1.3) {
    if (!c.m || c.hidden || !pd.h || !pd.mixer) return false;
    const w = person(pd.h.group, pd.mixer, pd.act); if (!w.body || !w.body.ok) return false;
    const a = this.seats.start("enter", w, c, { side, rate, onSfx: () => { if (this.sfx.door && Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) < 40) this.sfx.door(); }, onDone: () => done() });
    a.from = pd.h.group.position.clone(); a.yaw0 = pd.h.group.rotation.y; a.cop = pd; this.npcActs.push({ a }); return true;
  }
  // someone from the crowd walks to a parked car near you, gets in and drives off
  unpark() {
    if (!this.peds || !this.traffic || this.car || this.npcActs.length > 1) return;
    const P = this.player.pos, cands = this.cars.filter((c) => c.slot && c.slot.e && !c.wreck && !c.hidden && c.health > 60 && c.obb && !c.occ && c !== this.lastCar && Math.hypot(c.x - P.x, c.z - P.z) > 18 && Math.hypot(c.x - P.x, c.z - P.z) < 70);
    if (!cands.length) return;
    const c = cands[(Math.random() * cands.length) | 0], k = this.seats.keys(c);
    const pd = this.peds.nearest(c.x, c.z, 22); if (!pd) return;
    const A = this.seats.ground(c, k.A.x, k.A.z);
    this.peds.goTo(pd, A.x, A.z, () => {
      if (!c.obb || c.occ || this.car === c) { this.peds.walkBack(pd); return; }
      c.occ = { pd, own: true, shirt: 0 }; pd.inCar = c;
      const w = person(pd.h.group, pd.mixer, pd.act);
      this.world.grid.remove(c.obb); c.obb = null;
      const a = this.seats.start("enter", w, c, { onSfx: () => { if (this.sfx.door && Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) < 30) this.sfx.door(); },
        onDone: () => {
          const t = this.traffic.adopt(c);
          if (!t) { pd.inCar = null; c.occ = null; this.peds.toStreet(pd, pd.h.group.position.x, pd.h.group.position.z, {}); c.obb = this.world.grid.obb(c.x, c.z, c.S.hw, c.S.hl, -c.a, (c.y || 0) + c.m.cab.roof); c.obb.car = c; return; }
          this.cars.splice(this.cars.indexOf(c), 1); if (c.slot) c.slot.car = null;
          if (c.detail) { t.detail = c.detail; t.detail.c = t; c.detail = null; }
          // the one who got in is the one driving it away
          t.occ = { pd, own: true, shirt: c.shirt }; pd.inCar = t; this.drivers.push({ pd, w, car: t, own: true });
        } });
      a.from = pd.h.group.position.clone(); a.yaw0 = pd.h.group.rotation.y;
      this.npcActs.push({ a });
    });
  }
  // a traffic car pulled into a slot: its driver gets out, and it's a parked car from now on
  parked(t, slot) {
    const c = { x: t.x, z: t.z, a: t.a, slot, obb: null };
    const finish = () => {
      this.init(c, t.m, t.paint); Object.assign(c, { y: t.y, health: t.health, gp: t.gp, gr: t.gr, wy: t.wy ? t.wy.slice() : null, parked: true, charred: t.charred, camber: t.camber, bent: t.bent, flats: t.flats });
      if (t.detail) { c.detail = t.detail; t.detail = null; c.detail.c = c; }
      c.obb = this.world.grid.obb(c.x, c.z, c.S.hw, c.S.hl, -c.a, (c.y || 0) + c.m.cab.roof); c.obb.car = c;
      slot.car = c; this.cars.push(c); this.traffic.release(t);
    };
    if (t.occ && t.occ.pd) this.npcExit(t, false, finish); else { t.occ = null; finish(); }
  }
}
