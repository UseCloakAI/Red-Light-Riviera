/* Stage 5, early: the parked cars of Marlowe Keys can be driven. Walk up to
   one and an E floats over the driver's door handle; press it to get in. W/S
   drive and brake (and reverse), A/D steer, Space is the handbrake, E gets you
   out by the driver's door. Arcade handling on a bicycle model: grip that eases
   off with speed, the handbrake swings the back out. The car pushes out of
   buildings, posts and other cars (losing speed, with a crunch), bumps up kerbs,
   and knocks people down hard enough to ragdoll them.

   Cars stay in the world's instanced meshes; the one you drive just has its
   instance moved every frame, and leaves the collision grid while it moves.
   Traffic cars (traffic.js) can be taken too, if they're slow enough.

   Damage: crashes cost health. A hurt car darkens and sits crooked, smokes
   (grey, then black), catches fire, and a few seconds later goes up: a fireball,
   a charred shell, people nearby knocked flat. Lamp posts hit fast snap at the
   base and topple the way you hit them (a rod falling about its foot, bouncing
   once), sparking, the light gone out. Fire hydrants burst into a geyser that
   lifts a car sitting over it.

   Crashes dent: the first hit swaps an instanced car for its own panelled body
   (carbody.js), and every impact after pushes panels in where it lands and
   scrapes the paint. Explosions are big: a flash, a fireball, debris, a scorch
   mark, a smoke column, the wreck thrown into the air, a hard shake and a deep
   boom; the blast hurts you, people, lamp posts and other cars (which can go
   up in turn). */
import * as THREE from "three";
import { makeCarBody, toLocal } from "./carbody.js?v=dev";
import { flat } from "./ps1.js?v=dev";

const WB = 2.6, MAX = 30, REV = 9;
const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

export class Vehicles {
  constructor({ world, player, rig, camera, hud, peds, sfx, prompt, scene, fx, traffic }) {
    Object.assign(this, { world, player, rig, camera, hud, peds, sfx: sfx || {}, prompt, scene, fx, traffic });
    this.cars = world.cars ? world.cars.list : []; this.meshes = world.cars ? world.cars.meshes.filter(Boolean) : [];
    this.cars.forEach((c, i) => { c.i = i; c.speed = 0; c.steer = 0; c.roll = 0; c.y = 0; c.color = c.c; c.meshes = this.meshes; c.health = 100; });
    this.car = null; this.near = null; this.on = null;
    this.props = world.props || { lamps: [], hydrants: [] };
    this.falling = []; this.geysers = []; this.burning = new Set();
    // the geysers' spray: one pool of square points
    const N = 360, g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3).fill(-999), 3));
    this.spray = { N, pts: Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), life: 0 })), k: 0, g };
    if (scene) { const pm = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfe2ff, size: 0.12, transparent: true, opacity: 0.75, depthWrite: false })); pm.frustumCulled = false; scene.add(pm); }
    this.life = null; this.bodies = 0;
    if (scene) this.boomKit(scene);
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
  // the instanced car becomes its own dentable body the first time it's hit
  bodyOf(c) {
    if (c.body || !this.scene) return c.body;
    if (this.bodies > 40) return null; this.bodies++;
    c.body = makeCarBody(c.color ?? 0xffffff); this.scene.add(c.body.group);
    for (const im of c.meshes || this.meshes) { im.setMatrixAt(c.i, new THREE.Matrix4().makeScale(0, 0, 0)); im.instanceMatrix.needsUpdate = true; }
    this.place(c); return c.body;
  }
  // a blow to car c at world (x, z), pushing along (dx, dz), closing speed v
  impactCar(c, x, z, dx, dz, v) {
    if (v < 2.5) return;
    this.hurt(c, Math.max(0, v - 4) * 3.2);
    const b = this.bodyOf(c); if (b) { const L = toLocal(c, x, (c.y || 0) + 0.6, z, dx, dz); b.hit(L.p, L.dir, v); }
    if (v > 6 && this.fx) this.fx.sparks(new THREE.Vector3(x, (c.y || 0) + 0.5, z), Math.min(20, v | 0), new THREE.Vector3(-dx, 0.4, -dz), 3 + v * 0.1, 0xffc070, 0.35);
  }
  // hits are tested against the car's real outline (a box), not just its centre line
  touching(c, x, z, r) { const s = Math.sin(c.a), co = Math.cos(c.a), rx = x - c.x, rz = z - c.z, lx = rx * co - rz * s, lz = rx * s + rz * co; return Math.abs(lx) < 0.95 + r && Math.abs(lz) < 2.2 + r; }
  get driving() { return !!this.car; }
  // the driver's door handle: left side, just ahead of the middle
  door(c) { const fx = Math.sin(c.a), fz = Math.cos(c.a), lx = Math.cos(c.a), lz = -Math.sin(c.a); return { x: c.x + lx * 0.95 + fx * 0.25, y: c.y + 0.95, z: c.z + lz * 0.95 + fz * 0.25, lx, lz }; }
  place(c) {
    const bend = c.bend || 0;   // a damaged car sits crooked
    _q.setFromAxisAngle(UP, c.a + bend * 0.5); const r = new THREE.Quaternion().setFromAxisAngle(_v.set(Math.cos(c.a), 0, -Math.sin(c.a)), (c.roll || 0) + bend + (c.flip || 0)); _q.premultiply(r);
    if (c.body) { c.body.group.position.set(c.x, c.y + (c.lift || 0), c.z); c.body.group.quaternion.copy(_q); return; }
    _m.compose(_p.set(c.x, c.y + (c.lift || 0), c.z), _q, _s);
    for (const im of c.meshes || this.meshes) { im.setMatrixAt(c.i, _m); im.instanceMatrix.needsUpdate = true; }
  }
  // damage: health down, the paint darker, the frame bent; smoke and fire take over below half
  hurt(c, amount) {
    if (c.wreck || amount <= 0) return;
    c.health = Math.max(0, (c.health ?? 100) - amount);
    c.bend = (c.bend || 0) + (Math.random() - 0.5) * amount * 0.0025;
    const k = 0.35 + 0.65 * Math.min(1, c.health / 70);
    if (c.body) c.body.tint(k); else { (c.meshes || this.meshes)[0].setColorAt(c.i, _c.set(c.color ?? 0xffffff).multiplyScalar(k)); (c.meshes || this.meshes)[0].instanceColor.needsUpdate = true; }
    if (c.health < 55) this.burning.add(c);
  }
  explode(c) {
    c.wreck = true; c.health = 0; this.burning.delete(c);
    const b = this.bodyOf(c); if (b) b.char(); else { (c.meshes || this.meshes)[0].setColorAt(c.i, _c.set(0x1c1a18)); (c.meshes || this.meshes)[0].instanceColor.needsUpdate = true; }
    const was = this.car === c; if (was) this.exit(true);
    // thrown into the air, turning over
    c.vy = 6 + Math.random() * 3; c.spin = (Math.random() - 0.5) * 5; c.air = true; c.speed *= 0.3; this.burning.add(c); c.smoke = 18;
    this.blast(c.x, (c.y || 0) + 1, c.z, 1, c);
    if (!c.obb && !was) c.obb = this.world.grid.obb(c.x, c.z, 0.95, 2.2, -c.a, 1.5);
    if (c.ai && this.traffic) { c.ai = false; c.taken = true; }
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
    if (this.peds) { for (const pd of this.peds.peds) { if (pd.dead) continue; const g = pd.h.group.position, d = Math.hypot(g.x - x, g.z - z); if (d < 9) this.peds.damage(pd, { point: g.clone().setY(g.y + 1), dir: new THREE.Vector3(g.x - x, 1.3, g.z - z).normalize(), damage: d < 6 ? 300 : 60, from: { x, z }, force: 10 * (1 - d / 9) + 2 }); } this.peds.alarm(x, z, 80); }
    if (this.traffic) this.traffic.panic(x, z, 90);
    // other cars take it (and may go up too); lamp posts go over
    const cars = this.cars.concat(this.traffic ? this.traffic.cars.filter((o) => o.active || o.taken) : []);
    for (const o of cars) { if (o === from || o.wreck) continue; const d = Math.hypot(o.x - x, o.z - z); if (d < 8) { const k = 1 - d / 8; this.impactCar(o, x, z, (o.x - x) / (d || 1), (o.z - z) / (d || 1), 14 * k + 3); this.hurt(o, 55 * k); } }
    for (const L of this.props.lamps) { if (L.broken) continue; const d = Math.hypot(L.x - x, L.z - z); if (d < 5.5) this.breakLamp(L, L.x - x, L.z - z, 10); }
  }
  // smoke, then fire, then the bang, for any hurt car (driven or not)
  burn(dt) {
    for (const c of this.burning) {
      c.smokeT = (c.smokeT || 0) - dt;
      if (c.wreck) {   // a wreck: falls back down, then smokes for a while
        if (c.air) { c.vy -= 9.8 * dt; c.y += c.vy * dt; c.flip = (c.flip || 0) + c.spin * dt; const g = this.world.heightAt(c.x, c.z); if (c.y <= g && c.vy < 0) { c.y = g; c.vy *= -0.25; c.spin *= 0.4; if (Math.abs(c.vy) < 1.2) { c.air = false; c.flip = Math.round((c.flip || 0) / Math.PI) * Math.PI * (Math.random() < 0.3 ? 1 : 0) + (c.flip % Math.PI) * 0.2; } if (this.sfx.crash) this.sfx.crash(0.6); } this.place(c); }
        if ((c.smoke -= dt) <= 0 && !c.air) { this.burning.delete(c); continue; }
        if (c.smokeT <= 0 && this.fx) { c.smokeT = 0.12; this.fx.puff(new THREE.Vector3(c.x + (Math.random() - 0.5), c.y + 1.2, c.z + (Math.random() - 0.5)), new THREE.Vector3((Math.random() - 0.5) * 0.4, 2 + Math.random(), (Math.random() - 0.5) * 0.4), 1.8, 2.6, Math.random() < 0.2 ? 0xff7a30 : 0x161412, 0.6); }
        continue;
      }
      if (c.health < 18) c.fire = (c.fire || 0) + dt;
      if (c.fire > 5) { this.explode(c); continue; }
      if (c.smokeT > 0 || !this.fx) continue;
      c.smokeT = c.health < 18 ? 0.07 : 0.14;
      const fx = Math.sin(c.a), fz = Math.cos(c.a), hood = new THREE.Vector3(c.x + fx * 1.5, c.y + 1.05, c.z + fz * 1.5);
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
      // a rod about its foot: angular acceleration 3g/2L sin(theta)
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
  // a hydrant knocked off: a column of water for a while, strong enough to lift a car
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
  // how high a geyser is pushing a car at (x, z)
  liftAt(x, z) { let l = 0; for (const G of this.geysers) if (G.t > 0) { const d = Math.hypot(G.x - x, G.z - z); if (d < 1.8) l = Math.max(l, (1 - d / 1.8) * 0.9 * Math.min(1, G.t / 4)); } return l; }

  update(dt, input) {
    this.burn(dt); this.fall(dt); this.geyser(dt); this.boomFx(dt);
    for (const c of this.burning) if (c !== this.car) this.place(c);
    if (!this.car) return this.onFoot(dt, input);
    return this.drive(dt, input);
  }
  candidates() { return this.traffic ? this.cars.concat(this.traffic.cars.filter((c) => c.active && Math.abs(c.speed) < 3)) : this.cars; }
  // on foot: is a door handle within reach? show the E over it
  onFoot(dt, input) {
    const p = this.player.pos; let best = null, bd = 2.2;
    for (const c of this.candidates()) {
      if (c.wreck || Math.abs(c.x - p.x) > 4 || Math.abs(c.z - p.z) > 4) continue;
      const d = this.door(c), dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < bd) { bd = dd; best = c; }
    }
    this.near = best;
    if (best && this.player.aimYaw === null && input.hit("KeyE")) { this.enter(best); return true; }
    this.showPrompt(best ? this.door(best) : null);
    return false;
  }
  showPrompt(at) {
    const el = this.prompt; if (!el) return;
    if (!at) { if (this.pOn) { el.classList.remove("on"); this.pOn = false; } return; }
    _p.set(at.x, at.y + 0.35, at.z).project(this.camera);
    if (_p.z > 1) { el.classList.remove("on"); this.pOn = false; return; }
    el.style.transform = `translate(${((_p.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - _p.y) / 2 * innerHeight).toFixed(0)}px)`;
    if (!this.pOn) { el.classList.add("on"); this.pOn = true; if (this.on) this.on("near-car"); }
  }
  enter(c) {
    if (this.traffic && c.ai) this.traffic.take(c);
    this.car = c; c.speed = 0; c.steer = 0; c.health = c.health ?? 100;
    if (c.obb) { this.world.grid.remove(c.obb); c.obb = null; }
    this.showPrompt(null);
    if (this.player.model) this.player.model.visible = false;
    if (this.rig) { this.rig.yaw = c.a + Math.PI; this.rig.pitch = 0.22; }   // straight in behind it
    if (this.sfx.door) this.sfx.door();
    this.engine = this.sfx.engine ? this.sfx.engine() : null;
    if (this.on) this.on("in-car");
  }
  exit(thrown) {
    const c = this.car, d = this.door(c), P = this.player;
    void thrown;
    // out by the driver's door; if that's blocked, the passenger's
    let x = d.x + d.lx * 0.7, z = d.z + d.lz * 0.7;
    const probe = { x, z }; this.world.grid.resolve(probe, 0.32, c.y + 0.3, 1.8); if (Math.hypot(probe.x - x, probe.z - z) > 0.4) { x = c.x - d.lx * 1.8; z = c.z - d.lz * 1.8; }
    P.pos.set(x, this.world.heightAt(x, z), z); P.vel.set(0, 0, 0); P.speed = 0; P.yaw = c.a;
    if (P.model) P.model.visible = true;
    c.obb = this.world.grid.obb(c.x, c.z, 0.95, 2.2, -c.a, 1.5);
    c.speed = 0; c.roll = 0; this.place(c);
    if (this.engine) { this.engine.stop(); this.engine = null; }
    if (this.sfx.door) this.sfx.door();
    this.car = null;
  }
  drive(dt, input) {
    const c = this.car, W = this.world;
    if (input.hit("KeyE") && Math.abs(c.speed) < 3) { this.exit(); return true; }
    const thr = (input.down("KeyW", "ArrowUp") ? 1 : 0) - (input.down("KeyS", "ArrowDown") ? 1 : 0), hand = input.down("Space");
    // throttle, brakes, reverse, rolling resistance and drag
    const top = MAX * (0.45 + 0.55 * Math.min(1, c.health / 60));   // a hurt engine won't pull as hard
    if (thr > 0) c.speed += (c.speed < 0 ? 16 : 9 * Math.max(0, 1 - c.speed / top)) * dt;
    else if (thr < 0) c.speed -= (c.speed > 0 ? 16 : 6 * (1 + c.speed / REV)) * dt;
    else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 2.5 * dt);
    if (hand) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 11 * dt);
    c.speed -= c.speed * Math.abs(c.speed) * 0.0012 * dt * 10;
    // steering: less lock at speed; the handbrake lets the back step out
    const st = ((input.down("KeyA", "ArrowLeft") ? 1 : 0) - (input.down("KeyD", "ArrowRight") ? 1 : 0)) * 0.6 * (1 - Math.min(0.65, Math.abs(c.speed) / 38));
    c.steer += (st - c.steer) * Math.min(1, dt * 7);
    const yawRate = c.speed / WB * Math.tan(c.steer) * (hand ? 1.6 : 1);
    c.a += yawRate * dt;
    const fx = Math.sin(c.a), fz = Math.cos(c.a);
    const ox = c.x, oz = c.z;
    c.x += fx * c.speed * dt; c.z += fz * c.speed * dt;
    // lamp posts and hydrants in the way: fast enough and they go, not the car
    const P = this.props, v0 = Math.abs(c.speed);
    for (const L of P.lamps) {
      if (L.broken || Math.abs(L.x - c.x) > 3.5 || Math.abs(L.z - c.z) > 3.5) continue;
      if (this.touching(c, L.x, L.z, 0.45) && v0 > 3.5) { this.breakLamp(L, fx * Math.sign(c.speed), fz * Math.sign(c.speed), v0); c.speed *= 0.72; this.impactCar(c, L.x, L.z, (c.x - L.x), (c.z - L.z), v0 * 0.6); if (this.rig) this.rig.shake = 0.6; }
    }
    for (const H of P.hydrants) {
      if (H.broken || Math.abs(H.x - c.x) > 3 || Math.abs(H.z - c.z) > 3) continue;
      if (this.touching(c, H.x, H.z, 0.45) && v0 > 1.2) { this.breakHydrant(H); c.speed *= 0.88; this.impactCar(c, H.x, H.z, c.x - H.x, c.z - H.z, Math.min(v0, 6)); }
    }
    // push out of the world: three circles down the car's length
    let push = 0, hx = 0, hz = 0, hk = 0;
    for (const k of [1.45, 0, -1.45]) {
      const q = { x: c.x + fx * k, z: c.z + fz * k }, bx = q.x, bz = q.z;
      W.grid.resolve(q, 1.0, c.y + 0.3, 1.2);
      const dx = q.x - bx, dz = q.z - bz; if (dx || dz) { c.x += dx; c.z += dz; const l = Math.hypot(dx, dz); if (l > push) { push = l; hx = dx / l; hz = dz / l; hk = k; } }
    }
    // where it struck: the side of the car facing the wall, at that circle
    if (push > 0.01) { const v = Math.abs(c.speed); this.impactCar(c, c.x + fx * hk - hx * 1.0, c.z + fz * hk - hz * 1.0, hx, hz, v); }
    // other traffic: both cars take it, theirs stops (and is abandoned if it was hard)
    if (this.traffic) for (const o of this.traffic.cars) {
      if (!o.active || o === c || Math.abs(o.x - c.x) > 6 || Math.abs(o.z - c.z) > 6) continue;
      const ox2 = Math.sin(o.a), oz2 = Math.cos(o.a);
      for (const k of [1.45, 0, -1.45]) for (const j of [1.4, 0, -1.4]) {
        const ax = c.x + fx * k, az = c.z + fz * k, bx = o.x + ox2 * j, bz = o.z + oz2 * j, dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz);
        if (d < 2 && d > 1e-4) {
          const m = (2 - d) / 2; c.x += dx / d * m; c.z += dz / d * m; o.x -= dx / d * m * 0.5; o.z -= dz / d * m * 0.5;
          const rel = Math.abs(c.speed - o.speed * (fx * ox2 + fz * oz2)); push = Math.max(push, m);
          if (rel > 4) { const cx = (ax + bx) / 2, cz = (az + bz) / 2; this.impactCar(c, cx, cz, dx / d, dz / d, rel); this.impactCar(o, cx, cz, -dx / d, -dz / d, rel); o.stun = 3; if (rel > 11 && o.ai) { o.ai = false; o.taken = true; o.speed = 0; o.obb = this.world.grid.obb(o.x, o.z, 0.95, 2.2, -o.a, 1.5); } this.traffic.place(o); }
        }
      }
    }
    if (push > 0.01) {
      const v = Math.abs(c.speed); if (v > 6 && this.sfx.crash) this.sfx.crash(Math.min(1, v / 25));
      c.speed *= v > 3 ? -0.25 : 0.5; if (this.rig) this.rig.shake = Math.min(1, v / 20);
    }
    // ride the kerbs; lean into corners
    const gy = W.heightAt(c.x, c.z); c.y += (gy - c.y) * Math.min(1, dt * 18);
    // a geyser underneath lifts and rocks it
    const lift = this.liftAt(c.x, c.z); c.lift = (c.lift || 0) + ((lift ? lift + Math.sin(performance.now() / 140) * 0.08 : 0) - (c.lift || 0)) * Math.min(1, dt * 4);
    c.roll += (-yawRate * Math.abs(c.speed) * 0.004 - c.roll) * Math.min(1, dt * 6);
    this.place(c);
    // people in the way go down
    if (this.peds && Math.abs(c.speed) > 2) for (let i = 0; i < Math.min(this.peds.limit, this.peds.peds.length); i++) {
      const pd = this.peds.peds[i]; if (pd.dead) continue;
      const g = pd.h.group.position, lx = (g.x - c.x) * Math.cos(c.a) - (g.z - c.z) * Math.sin(c.a), lz = (g.x - c.x) * fx + (g.z - c.z) * fz;
      if (Math.abs(lx) < 1.25 && Math.abs(lz) < 2.6) {
        const v = Math.abs(c.speed), dir = _v.set(fx * Math.sign(c.speed), 0.25, fz * Math.sign(c.speed)).normalize().clone();
        this.peds.damage(pd, { point: new THREE.Vector3(g.x, g.y + 0.9, g.z), dir, damage: v * 9, head: false, from: { x: c.x, z: c.z }, force: Math.min(9, v * 0.7) });
        c.speed *= 0.85; if (this.sfx.impact) this.sfx.impact("flesh", 0, 0);
        this.peds.alarm(c.x, c.z, 35);
      }
    }
    if (this.engine) this.engine.set(Math.abs(c.speed) / MAX, thr);
    // the player rides along (the camera follows them)
    const Pl = this.player; Pl.pos.set(c.x, c.y, c.z); Pl.speed = Math.abs(c.speed); Pl.yaw = c.a; Pl.vel.set(fx * c.speed, 0, fz * c.speed);
    void ox; void oz;
    return true;
  }
}
