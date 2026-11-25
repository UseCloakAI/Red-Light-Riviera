/* Stage 3: weapons. The pistol first: an original compact 9 mm built from a
   handful of shapes. 1 holsters, 2 draws (or the wheel); hold right mouse to aim
   over the shoulder, left mouse fires (from the hip it snaps up first), R
   reloads. Arms are posed with two-bone IK on top of the walk clips, the chest
   follows the aim's pitch, and recoil kicks the hands, the gun and the view.

   Shots trace from the camera through the reticle, then from the muzzle to that
   point, so walls right in front of the gun still stop it. Hits: people (head or
   body, see peds.damage), buildings and posts (holes, dust, sparks), the ground
   (sand or stone). Every shot alarms the street. */
import * as THREE from "three";
import { findBones, ik, point, turnWorld, wpos } from "./rig.js?v=dev";
import { HELD } from "./lines.js?v=dev";

export const PISTOL = { id: "pistol", name: "Pistol", mag: 12, reserve: 60, damage: 34, rate: 0.16, reload: 1.4, spread: 0.004, range: 180 };

/* ---------------- the pistol ---------------- */
function canvasTex(size, draw) { const c = document.createElement("canvas"); c.width = c.height = size; draw(c.getContext("2d"), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function rounded(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
export function pistolModel() {
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.85, roughness: 0.36 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x18191b, metalness: 0.05, roughness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.3, roughness: 0.6 });
  const g = new THREE.Group(), add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  // slide: a rounded bar, the barrel axis along +z, grip origin at (0, 0, 0)
  add(new THREE.ExtrudeGeometry(rounded(0.027, 0.031, 0.005), { depth: 0.188, bevelEnabled: false }), steel, 0, 0.046, -0.034);
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.0285, 0.022, 0.0018), dark, 0, 0.048, -0.026 + i * 0.0045);     // rear serrations
  add(new THREE.BoxGeometry(0.004, 0.012, 0.034), dark, 0.0128, 0.052, 0.05);                                            // ejection port
  add(new THREE.CylinderGeometry(0.0056, 0.0056, 0.006, 12).rotateX(Math.PI / 2), dark, 0, 0.044, 0.155);               // muzzle bore
  add(new THREE.BoxGeometry(0.004, 0.006, 0.006), steel, 0, 0.064, 0.145);                                              // front sight
  add(new THREE.BoxGeometry(0.018, 0.006, 0.006), steel, 0, 0.064, -0.026);                                             // rear sight
  // frame and dust cover, with a light rail
  add(new THREE.ExtrudeGeometry(rounded(0.025, 0.017, 0.004), { depth: 0.14, bevelEnabled: false }), poly, 0, 0.023, 0.006);
  for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.026, 0.003, 0.004), poly, 0, 0.013, 0.1 + i * 0.012);
  // grip: a raked side profile, extruded across the width
  const gp = new THREE.Shape(); gp.moveTo(0.03, 0.017); gp.lineTo(-0.028, 0.03); gp.quadraticCurveTo(-0.04, 0.026, -0.042, 0.012);
  gp.lineTo(-0.064, -0.082); gp.quadraticCurveTo(-0.062, -0.094, -0.05, -0.095); gp.lineTo(-0.012, -0.095); gp.quadraticCurveTo(-0.004, -0.094, -0.006, -0.084);
  gp.quadraticCurveTo(0.002, -0.06, -0.004, -0.045); gp.quadraticCurveTo(0.004, -0.03, 0.0, -0.018); gp.lineTo(0.008, 0.006); gp.lineTo(0.03, 0.006);
  const grip = new THREE.ExtrudeGeometry(gp, { depth: 0.024, bevelEnabled: true, bevelSize: 0.0025, bevelThickness: 0.0025, bevelSegments: 2, curveSegments: 6 });
  grip.rotateY(-Math.PI / 2).translate(0.012, 0, 0);
  add(grip, poly, 0, 0, 0);
  add(new THREE.BoxGeometry(0.0285, 0.05, 0.022).rotateX(0.33), dark, 0, -0.035, -0.036);                               // stippled panel
  // trigger guard and trigger
  add(new THREE.BoxGeometry(0.008, 0.004, 0.046), poly, 0, -0.012, 0.03);
  add(new THREE.BoxGeometry(0.008, 0.024, 0.004).rotateX(-0.25), poly, 0, 0.0, 0.054);
  add(new THREE.BoxGeometry(0.004, 0.017, 0.004).rotateX(0.3), steel, 0, 0.002, 0.022);
  g.userData.muzzle = new THREE.Vector3(0, 0.046, 0.16);
  g.userData.port = new THREE.Vector3(0.016, 0.055, 0.05);
  g.userData.slide = g.children[0];
  return g;
}

/* ---------------- effects ---------------- */
const flashTex = () => canvasTex(128, (c, s) => {
  const r = s / 2, grd = c.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, "rgba(255,250,225,1)"); grd.addColorStop(0.18, "rgba(255,214,120,.95)"); grd.addColorStop(0.5, "rgba(255,140,40,.35)"); grd.addColorStop(1, "rgba(255,90,0,0)");
  c.fillStyle = grd; c.beginPath();
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, rr = i % 2 ? r * 0.32 : r * (0.75 + Math.random() * 0.25); c.lineTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr); }
  c.fill();
});
const puffTex = () => canvasTex(64, (c, s) => {
  const r = s / 2;
  for (let i = 0; i < 9; i++) { const x = r + (Math.random() - 0.5) * r * 0.7, y = r + (Math.random() - 0.5) * r * 0.7, rr = r * (0.35 + Math.random() * 0.3), g = c.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, s, s); }
});
const holeTex = () => canvasTex(64, (c, s) => {
  const r = s / 2;
  let g = c.createRadialGradient(r, r, 0, r, r, r); g.addColorStop(0, "rgba(20,18,16,.75)"); g.addColorStop(0.4, "rgba(60,56,50,.35)"); g.addColorStop(1, "rgba(60,56,50,0)");
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, l = r * (0.4 + Math.random() * 0.4); c.strokeStyle = "rgba(25,22,20,.45)"; c.lineWidth = 1; c.beginPath(); c.moveTo(r, r); c.lineTo(r + Math.cos(a) * l, r + Math.sin(a) * l); c.stroke(); }
  g = c.createRadialGradient(r, r, 0, r, r, r * 0.18); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(5,5,5,.9)"); c.fillStyle = g; c.beginPath(); c.arc(r, r, r * 0.16, 0, 6.29); c.fill();
});

class Fx {
  constructor(scene) {
    this.scene = scene;
    // smoke and dust: a small pool of soft sprites
    const pt = puffTex();
    this.puffs = Array.from({ length: 14 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pt, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; scene.add(s); return { s, life: 0, max: 1, v: new THREE.Vector3(), grow: 1, a: 0.4 };
    });
    this.pi = 0;
    // sparks and debris
    const N = 120; this.N = N; this.sp = []; this.si = 0;
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3).fill(-999), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; scene.add(this.points);
    for (let i = 0; i < N; i++) this.sp.push({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), life: 0, c: new THREE.Color() });
    // bullet holes
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.075), new THREE.MeshStandardMaterial({ map: holeTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 }), 48);
    this.holes.count = 0; this.hi = 0; this.holes.frustumCulled = false; scene.add(this.holes);
    // brass
    this.brass = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0047, 0.0047, 0.019, 7), new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 }), 16);
    this.brass.count = 0; this.bi = 0; this.brass.frustumCulled = false; this.brass.castShadow = false; scene.add(this.brass);
    this.shells = []; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.one = new THREE.Vector3(1, 1, 1);
  }
  puff(pos, vel, size, life, color, alpha) {
    const P = this.puffs[this.pi++ % this.puffs.length];
    P.s.position.copy(pos); P.v.copy(vel); P.life = 0; P.max = life; P.grow = size; P.a = alpha; P.s.visible = true;
    P.s.material.color.set(color); P.s.material.rotation = Math.random() * 6.28; P.s.scale.setScalar(size * 0.3);
  }
  sparks(pos, n, dir, speed, color, life) {
    for (let i = 0; i < n; i++) {
      const s = this.sp[this.si++ % this.N];
      s.p.copy(pos); s.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(speed).addScaledVector(dir, speed * 0.8);
      s.life = life * (0.5 + Math.random() * 0.5); s.c.set(color);
    }
  }
  hole(pos, n) {
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); this.e.set(0, 0, Math.random() * 6.28); this.q.multiply(new THREE.Quaternion().setFromEuler(this.e));
    const p = pos.clone().addScaledVector(n, 0.006), s = 0.7 + Math.random() * 0.6;
    this.m.compose(p, this.q, new THREE.Vector3(s, s, s)); this.holes.setMatrixAt(this.hi % 48, this.m); this.hi++;
    this.holes.count = Math.min(48, this.hi); this.holes.instanceMatrix.needsUpdate = true;
  }
  shell(pos, vel) {
    const s = this.shells[this.bi % 16] || (this.shells[this.bi % 16] = { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), rest: false, bounced: 0 });
    s.p.copy(pos); s.v.copy(vel); s.r.set(Math.random() * 6, Math.random() * 6, 0); s.w.set(20 + Math.random() * 20, 10, Math.random() * 10); s.rest = false; s.bounced = 0; s.i = this.bi % 16;
    this.bi++; this.brass.count = Math.min(16, this.bi);
  }
  update(dt, world, onTink) {
    for (const P of this.puffs) {
      if (!P.s.visible) continue;
      P.life += dt; const k = P.life / P.max;
      if (k >= 1) { P.s.visible = false; continue; }
      P.s.position.addScaledVector(P.v, dt); P.v.multiplyScalar(1 - dt * 1.5); P.v.y += dt * 0.15;
      P.s.scale.setScalar(P.grow * (0.3 + 0.7 * Math.sqrt(k))); P.s.material.opacity = P.a * (1 - k) * Math.min(1, k * 8);
    }
    const pa = this.points.geometry.attributes.position, ca = this.points.geometry.attributes.color;
    for (let i = 0; i < this.N; i++) {
      const s = this.sp[i];
      if (s.life > 0) { s.life -= dt; s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt); if (s.life <= 0) s.p.y = -999; }
      pa.setXYZ(i, s.p.x, s.p.y, s.p.z); const f = Math.max(0, Math.min(1, s.life * 6)); ca.setXYZ(i, s.c.r * f, s.c.g * f, s.c.b * f);
    }
    pa.needsUpdate = ca.needsUpdate = true;
    let dirty = false;
    for (const s of this.shells) {
      if (!s || s.rest) continue; dirty = true;
      s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt); s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
      const g = world.heightAt(s.p.x, s.p.z) + 0.0047;
      if (s.p.y < g) {
        s.p.y = g; if (s.v.y < -0.6 && onTink) onTink(Math.min(1, -s.v.y / 3), s.p);
        s.v.y *= -0.35; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.5); s.bounced++;
        if (s.bounced > 3 || Math.abs(s.v.y) < 0.2) { s.rest = true; s.r.x = Math.PI / 2; }
      }
      this.q.setFromEuler(s.r); this.m.compose(s.p, this.q, this.one); this.brass.setMatrixAt(s.i, this.m);
    }
    if (dirty) this.brass.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------- tracing ---------------- */
const _s = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _hp = new THREE.Vector3();
// how far along the ray (o + d*t, 0 <= t <= max) it passes within r of the segment a-b; Infinity if it doesn't
function rayCapsule(o, d, max, a, b, r) {
  _u.copy(b).sub(a); _w.copy(o).sub(a);
  const A = d.dot(d), B = d.dot(_u), C = _u.dot(_u), D = d.dot(_w), E = _u.dot(_w), den = A * C - B * B;
  let t = den > 1e-9 ? (B * E - C * D) / den : 0, s;
  t = THREE.MathUtils.clamp(t, 0, max); s = THREE.MathUtils.clamp((B * t + E) / C, 0, 1);
  t = THREE.MathUtils.clamp((B * s - D) / A, 0, max);
  _s.copy(o).addScaledVector(d, t); _hp.copy(a).addScaledVector(_u, s);
  const dist = _s.distanceTo(_hp);
  return dist < r ? Math.max(0, t - Math.sqrt(r * r - dist * dist)) : Infinity;
}
function raySphere(o, d, max, c, r) {
  _w.copy(o).sub(c); const b = _w.dot(d), cc = _w.dot(_w) - r * r, disc = b * b - cc;
  if (disc < 0) return Infinity; const t = -b - Math.sqrt(disc); return t >= 0 && t <= max ? t : Infinity;
}

export class Arsenal {
  constructor({ scene, camera, world, player, rig, hud, peds, sfx, onShot }) {
    Object.assign(this, { scene, camera, world, player, rig, hud, peds, sfx: sfx || {}, onShot });
    this.B = player.model ? findBones(player.model) : null;
    this.slots = [null, Object.assign({ ammo: PISTOL.mag, left: PISTOL.reserve }, PISTOL)];
    this.cur = 0; this.aim = 0; this.quick = 0; this.cool = 0; this.reloading = 0; this.bloom = 0; this.kick = 0; this.pending = false; this.held = 0;
    this.gun = pistolModel(); this.gun.visible = false; scene.add(this.gun);
    // muzzle flash: a camera-facing burst plus two crossed planes along the barrel
    const ft = flashTex(), fm = new THREE.MeshBasicMaterial({ map: ft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.flash = new THREE.Group(); this.flash.position.copy(this.gun.userData.muzzle).add(new THREE.Vector3(0, 0, 0.065));
    for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.16), fm); m.rotation.order = "ZYX"; m.rotation.set(Math.PI / 2, 0, r); this.flash.add(m); }
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.flashSprite.scale.setScalar(0.13); this.flash.add(this.flashSprite);
    this.flash.visible = false; this.gun.add(this.flash); this.flashT = 0;
    this.fx = new Fx(scene);
    this.target = new THREE.Vector3(); this.aimDir = new THREE.Vector3(0, 0, 1); this.over = null;
    player.afterPose = (dt) => this.pose(dt);
    this.hudSync();
  }
  get weapon() { return this.slots[this.cur]; }
  equip(i) {
    if (i === this.cur || i < 0 || i >= this.slots.length) return;
    this.cur = i; this.reloading = 0; this.pending = false;
    if (this.weapon && this.sfx.draw) this.sfx.draw();
    this.hudSync();
  }
  startReload() {
    const w = this.weapon; if (!w || this.reloading > 0 || w.ammo === w.mag || w.left <= 0) return;
    this.reloading = w.reload; if (this.sfx.reload) this.sfx.reload();
  }
  hudSync() { const w = this.weapon; if (this.hud.weapon) this.hud.weapon(w ? { name: w.name, ammo: w.ammo, left: w.left, reloading: this.reloading > 0 } : null); }

  update(dt, input) {
    if (input.hit("Digit1")) this.equip(0);
    if (input.hit("Digit2")) this.equip(1);
    if (input.wheel) { this.equip((this.cur + Math.sign(input.wheel) + this.slots.length) % this.slots.length); input.wheel = 0; }
    const w = this.weapon, armed = !!w;
    this.quick = Math.max(0, this.quick - dt); this.cool = Math.max(0, this.cool - dt);
    const wantAim = armed && (input.down("Mouse2") || this.quick > 0);
    this.aim += ((wantAim ? 1 : 0) - this.aim) * Math.min(1, dt * (wantAim ? 12 : 8));
    if (this.aim < 0.002) this.aim = 0;
    this.rig.aim = this.aim;
    this.player.aimYaw = wantAim ? this.rig.yaw + Math.PI : null;

    // where the reticle points
    this.camera.getWorldDirection(_dir); const hit = this.trace(this.camera.position, _dir, PISTOL.range);
    this.target.copy(hit.point); this.over = hit.ped && this.aim > 0.5 ? hit.ped : null;
    // a gun pointed at someone: they put their hands out and back away
    this.held = Math.max(0, this.held - dt);
    if (this.over && this.aim > 0.8 && hit.t < 20 && !this.over.fear && this.peds) {
      const p = this.over.h.group.position; this.peds.alarm(p.x, p.z, 6, false);
      if (this.held <= 0 && this.hud.subtitle) { this.hud.subtitle(HELD[(Math.random() * HELD.length) | 0]); this.held = 8; }
    }

    if (armed) {
      if (this.reloading > 0) { this.reloading -= dt; if (this.reloading <= 0) { const n = Math.min(w.mag - w.ammo, w.left); w.ammo += n; w.left -= n; this.reloading = 0; this.hudSync(); } }
      if (input.hit("KeyR")) { this.startReload(); this.hudSync(); }
      if (input.hit("Mouse0")) { this.quick = 1.1; if (this.aim > 0.7) this.fire(); else this.pending = true; }
      if (this.pending && this.aim > 0.7) { this.pending = false; this.fire(); }
      if (input.down("Mouse0")) this.quick = Math.max(this.quick, 0.6);
    }
    this.bloom *= 1 - Math.min(1, dt * 5); this.kick *= 1 - Math.min(1, dt * 14);
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.flash.visible = false;
    this.fx.update(dt, this.world, (v, p) => this.sfx.shell && this.sfx.shell(v * 0.8, 0));
    if (this.hud.reticle) this.hud.reticle(armed ? this.aim : 0, this.spread() * 900, !!this.over);
  }
  spread() {
    const w = this.weapon; if (!w) return 0;
    return w.spread + this.bloom + (1 - this.aim) * 0.03 + Math.min(this.player.speed, 3) * 0.004;
  }

  fire() {
    const w = this.weapon; if (!w || this.cool > 0 || this.reloading > 0) return;
    if (w.ammo <= 0) { if (this.sfx.dry) this.sfx.dry(); this.cool = 0.25; this.startReload(); this.hudSync(); return; }
    w.ammo--; this.cool = w.rate;
    const muzzle = this.gun.localToWorld(this.gun.userData.muzzle.clone());
    // aim with spread from the camera, then check the muzzle's path to that point
    this.camera.getWorldDirection(_dir); const sp = this.spread();
    _dir.add(_u.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(sp * 2)).normalize();
    const aimed = this.trace(this.camera.position, _dir, w.range);
    const to = aimed.point.clone().sub(muzzle), len = to.length(); to.normalize();
    const hit = len > 0.05 ? this.trace(muzzle, to, len + 0.05) : aimed;

    // the gun goes off
    this.flash.visible = true; this.flashT = 0.045; this.flash.rotation.z = Math.random() * 6.28; this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    this.fx.puff(muzzle, to.clone().multiplyScalar(0.7), 0.35, 0.9, 0xb8b2a8, 0.3);
    const port = this.gun.localToWorld(this.gun.userData.port.clone()), right = _w.set(1, 0, 0).applyQuaternion(this.gun.quaternion);
    this.fx.shell(port, right.clone().multiplyScalar(2.2 + Math.random()).add(new THREE.Vector3(0, 2 + Math.random(), 0)));
    this.kick = 1; this.bloom = Math.min(0.03, this.bloom + 0.012);
    this.rig.recoil += 0.03 + Math.random() * 0.015; this.rig.yaw += (Math.random() - 0.5) * 0.012;
    if (this.sfx.shot) this.sfx.shot(0, 0);
    this.hudSync();

    // what it hit
    if (hit.ped) {
      const r = this.peds.damage(hit.ped, { point: hit.point, dir: to, damage: w.damage, head: hit.head, from: this.player.pos });
      this.fx.puff(hit.point, to.clone().multiplyScalar(0.6), 0.22, 0.45, 0x4a0c0c, 0.55);
      this.fx.sparks(hit.point, 6, to, 1.6, 0x3a0606, 0.35);
      if (this.sfx.impact) this.sfx.impact("flesh", hit.t, 0);
      if (this.hud.hitmark) this.hud.hitmark(r === "dead");
    } else if (hit.t < w.range) {
      const n = hit.normal, sand = hit.kind === "sand";
      if (!sand) this.fx.hole(hit.point, n);
      this.fx.puff(hit.point.clone().addScaledVector(n, 0.05), n.clone().multiplyScalar(0.8), sand ? 0.5 : 0.35, sand ? 1.1 : 0.8, sand ? 0xcdb48a : 0x9a948a, 0.5);
      this.fx.sparks(hit.point, sand ? 10 : 7, n, sand ? 1.4 : 2.4, sand ? 0x5a4a30 : 0xffb050, sand ? 0.5 : 0.18);
      if (this.sfx.impact) this.sfx.impact(sand ? "sand" : "hard", hit.t, 0);
    }
    if (this.peds) this.peds.alarm(this.player.pos.x, this.player.pos.z, 55);
    if (this.onShot) this.onShot(this.player.pos, hit);
  }

  // nearest thing along o + d*t: buildings and posts, the ground, people
  trace(o, d, max) {
    let best = max, normal = new THREE.Vector3(0, 1, 0), kind = "air", ped = null, head = false;
    const end = _e.copy(o).addScaledVector(d, max), h = this.world.grid.hit(o, end);
    if (h.t < 1) { best = h.t * max; normal.set(h.nx, h.ny, h.nz); kind = "hard"; }
    // the ground: march, then bisect
    if (d.y < 0) {
      let prev = 0;
      for (let t = 0.5; t <= best; t += 0.5) {
        const y = o.y + d.y * t, x = o.x + d.x * t, z = o.z + d.z * t;
        if (y < this.world.heightAt(x, z)) {
          let lo = prev, hi = t;
          for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (o.y + d.y * m < this.world.heightAt(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m; }
          best = hi; normal.set(0, 1, 0); kind = this.world.heightAt(o.x + d.x * hi, o.z + d.z * hi) < -0.01 ? "sand" : "hard"; break;
        }
        prev = t;
      }
    }
    // people: a capsule for the body and a sphere for the head
    if (this.peds) {
      const P = this.peds.peds;
      for (let i = 0; i < Math.min(this.peds.limit, P.length); i++) {
        const pd = P[i], g = pd.h.group; if (pd.dead || !g.visible) continue;
        const gp = g.position; if (Math.abs(gp.x - o.x) > best + 1 || Math.abs(gp.z - o.z) > best + 1) continue;
        pd.B = pd.B || findBones(g); if (!pd.B) continue;
        const hc = wpos(pd.B.head, _hc); hc.y += 0.07;
        const th = raySphere(o, d, best, hc, 0.12);
        const a = _ca.set(gp.x, gp.y + 0.2, gp.z), b = _cb.copy(wpos(pd.B.neck, _cb)); b.y -= 0.05;
        const tb = rayCapsule(o, d, best, a, b, 0.21);
        const t = Math.min(th, tb);
        if (t < best) { best = t; ped = pd; head = th <= tb; kind = "flesh"; normal.copy(d).negate(); }
      }
    }
    return { t: best, point: o.clone().addScaledVector(d, best), normal, kind, ped, head };
  }

  // after the clips: raise the arms onto the aim, seat the gun in the hand
  pose() {
    const B = this.B, armed = !!this.weapon;
    this.gun.visible = armed && !!B; if (!this.gun.visible) return;
    const a = this.aim, up = _up.set(0, 1, 0), yaw = this.player.yaw, fwd = _f.set(Math.sin(yaw), 0, Math.cos(yaw));
    const chest = wpos(B.chest, _c);
    this.aimDir.copy(this.target).sub(chest).normalize();
    const D = this.aimDir;
    if (a > 0.01) {
      // the chest follows the aim's pitch
      _q.setFromUnitVectors(fwd, _t.copy(fwd).multiplyScalar(Math.cos(Math.asin(THREE.MathUtils.clamp(D.y, -0.9, 0.9)) * 0.6)).setY(D.y * 0.6).normalize());
      _q.slerpQuaternions(_id, _q, a); turnWorld(B.chest, _q);
      const sL = wpos(B.armL[0], _sl), sR = wpos(B.armR[0], _sr), mid = _m.copy(sL).add(sR).multiplyScalar(0.5), right = _r.copy(sR).sub(sL).normalize();
      const k = this.kick;
      const T = _t.copy(mid).addScaledVector(D, 0.5 - k * 0.05).addScaledVector(up, -0.05 + k * 0.03).addScaledVector(right, 0.03);
      ik(B.armR, T, _p.set(0, -1, 0).addScaledVector(right, 0.9), a);
      point(B.armR[2], B.armR[3], _v.copy(D).addScaledVector(up, -0.5).addScaledVector(right, -0.35).normalize(), a);
      const TL = _tl.copy(T).addScaledVector(right, -0.05).addScaledVector(D, -0.03).addScaledVector(up, -0.035);
      ik(B.armL, TL, _p.set(0, -1, 0).addScaledVector(right, -0.9), a);
      point(B.armL[2], B.armL[3], _v.copy(D).multiplyScalar(0.3).addScaledVector(right, 0.8).addScaledVector(up, -0.3).normalize(), a);
    }
    // the gun: in the palm, barrel along the aim when raised, angled down and forward when not
    const hand = wpos(B.armR[2], _h), fing = wpos(B.armR[3], _fg).sub(hand).normalize();
    const lowBarrel = _lb.copy(fing).multiplyScalar(0.7).addScaledVector(fwd, 0.7).normalize();
    gunQuat(_q1, lowBarrel, _gu.copy(fwd).addScaledVector(up, 0.2));
    const aimBarrel = _ab.copy(D); if (this.kick > 0.01) aimBarrel.addScaledVector(up, this.kick * 0.25).normalize();
    gunQuat(_q2, aimBarrel, up);
    this.gun.quaternion.slerpQuaternions(_q1, _q2, a);
    this.gun.position.copy(hand).addScaledVector(fing, 0.045 * (1 - a)).addScaledVector(D, 0.055 * a).addScaledVector(up, -0.01 * a);
  }
}
// orientation with the barrel (+z) along `barrel` and the top (+y) toward `up`
function gunQuat(q, barrel, up) {
  _gx.crossVectors(up, barrel); if (_gx.lengthSq() < 1e-6) _gx.set(1, 0, 0); _gx.normalize(); _gy.crossVectors(barrel, _gx);
  return q.setFromRotationMatrix(_gm.makeBasis(_gx, _gy, barrel));
}
const _dir = new THREE.Vector3(), _e = new THREE.Vector3(), _hc = new THREE.Vector3(), _ca = new THREE.Vector3(), _cb = new THREE.Vector3();
const _up = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _id = new THREE.Quaternion(), _t = new THREE.Vector3();
const _sl = new THREE.Vector3(), _sr = new THREE.Vector3(), _m = new THREE.Vector3(), _r = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _tl = new THREE.Vector3();
const _h = new THREE.Vector3(), _fg = new THREE.Vector3(), _lb = new THREE.Vector3(), _ab = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _gu = new THREE.Vector3(), _gx = new THREE.Vector3(), _gy = new THREE.Vector3(), _gm = new THREE.Matrix4();
