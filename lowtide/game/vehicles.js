/* Stage 5, early: the parked cars of Marlowe Keys can be driven. Walk up to
   one and an E floats over the driver's door handle; press it to get in. W/S
   drive and brake (and reverse), A/D steer, Space is the handbrake, E gets you
   out by the driver's door. Arcade handling on a bicycle model: grip that eases
   off with speed, the handbrake swings the back out. The car pushes out of
   buildings, posts and other cars (losing speed, with a crunch), bumps up kerbs,
   and knocks people down hard enough to ragdoll them.

   Cars stay in the world's instanced meshes; the one you drive just has its
   instance moved every frame, and leaves the collision grid while it moves. */
import * as THREE from "three";

const WB = 2.6, MAX = 30, REV = 9;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

export class Vehicles {
  constructor({ world, player, rig, camera, hud, peds, sfx, prompt }) {
    Object.assign(this, { world, player, rig, camera, hud, peds, sfx: sfx || {}, prompt });
    this.cars = world.cars ? world.cars.list : []; this.meshes = world.cars ? world.cars.meshes.filter(Boolean) : [];
    this.cars.forEach((c, i) => { c.i = i; c.speed = 0; c.steer = 0; c.roll = 0; c.y = 0; });
    this.car = null; this.near = null; this.on = null;
  }
  get driving() { return !!this.car; }
  // the driver's door handle: left side, just ahead of the middle
  door(c) { const fx = Math.sin(c.a), fz = Math.cos(c.a), lx = Math.cos(c.a), lz = -Math.sin(c.a); return { x: c.x + lx * 0.95 + fx * 0.25, y: c.y + 0.95, z: c.z + lz * 0.95 + fz * 0.25, lx, lz }; }
  place(c) {
    _q.setFromAxisAngle(UP, c.a); const r = new THREE.Quaternion().setFromAxisAngle(_v.set(Math.cos(c.a), 0, -Math.sin(c.a)), c.roll); _q.premultiply(r);
    _m.compose(_p.set(c.x, c.y, c.z), _q, _s);
    for (const im of this.meshes) { im.setMatrixAt(c.i, _m); im.instanceMatrix.needsUpdate = true; }
  }

  update(dt, input) {
    if (!this.car) return this.onFoot(dt, input);
    return this.drive(dt, input);
  }
  // on foot: is a door handle within reach? show the E over it
  onFoot(dt, input) {
    const p = this.player.pos; let best = null, bd = 2.2;
    for (const c of this.cars) {
      if (Math.abs(c.x - p.x) > 4 || Math.abs(c.z - p.z) > 4) continue;
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
    this.car = c; c.speed = 0; c.steer = 0;
    if (c.obb) { this.world.grid.remove(c.obb); c.obb = null; }
    this.showPrompt(null);
    if (this.player.model) this.player.model.visible = false;
    if (this.rig) { this.rig.yaw = c.a + Math.PI; this.rig.pitch = 0.22; }   // straight in behind it
    if (this.sfx.door) this.sfx.door();
    this.engine = this.sfx.engine ? this.sfx.engine() : null;
    if (this.on) this.on("in-car");
  }
  exit() {
    const c = this.car, d = this.door(c), P = this.player;
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
    if (thr > 0) c.speed += (c.speed < 0 ? 16 : 9 * (1 - c.speed / MAX)) * dt;
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
    // push out of the world: three circles down the car's length
    let push = 0;
    for (const k of [1.45, 0, -1.45]) {
      const q = { x: c.x + fx * k, z: c.z + fz * k }, bx = q.x, bz = q.z;
      W.grid.resolve(q, 1.0, c.y + 0.3, 1.2);
      const dx = q.x - bx, dz = q.z - bz; if (dx || dz) { c.x += dx; c.z += dz; push = Math.max(push, Math.hypot(dx, dz)); }
    }
    if (push > 0.01) {
      const v = Math.abs(c.speed); if (v > 6 && this.sfx.crash) this.sfx.crash(Math.min(1, v / 25));
      c.speed *= v > 3 ? -0.25 : 0.5; if (this.rig) this.rig.shake = Math.min(1, v / 20);
    }
    // ride the kerbs; lean into corners
    const gy = W.heightAt(c.x, c.z); c.y += (gy - c.y) * Math.min(1, dt * 18);
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
    const P = this.player; P.pos.set(c.x, c.y, c.z); P.speed = Math.abs(c.speed); P.yaw = c.a; P.vel.set(fx * c.speed, 0, fz * c.speed);
    void ox; void oz;
    return true;
  }
}
