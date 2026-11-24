/* The player: input, a third-person controller with collision, a camera rig
   that keeps out of walls, and the character: a rigged model (Michelle, from
   Mixamo) blending idle, walk and run by speed. If the model can't load, a
   stand-in figure with a procedural walk cycle takes her place. */
import * as THREE from "three";

/* ---------- input ---------- */
export class Input {
  constructor(el) {
    this.el = el; this.keys = new Set(); this.dx = 0; this.dy = 0; this.locked = false; this.active = true;
    this.onLock = null;
    addEventListener("keydown", (e) => { if (!this.active) return; this.keys.add(e.code); if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault(); });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    addEventListener("mousemove", (e) => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; } });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) this.keys.clear();
      if (this.onLock) this.onLock(this.locked);
    });
  }
  lock() { const p = this.el.requestPointerLock && this.el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  take() { const d = [this.dx, this.dy]; this.dx = this.dy = 0; return d; }
}

/* ---------- stand-in figure ---------- */
function makeFigure() {
  const M = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skin = M(0xB98262), shirt = M(0x1E5A64), shirt2 = M(0xE9E2D6), jeans = M(0x2A3346), shoe = M(0xEDE6DA), hair = M(0x17110D);
  const mesh = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; return o; };
  const root = new THREE.Group(), hips = new THREE.Group(), torso = new THREE.Group();
  hips.position.y = 0.96; root.add(hips); hips.add(torso);
  hips.add(mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), jeans));
  torso.add(mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10).scale(1.15, 1, 0.72), shirt, 0, 0.3, 0));
  torso.add(mesh(new THREE.BoxGeometry(0.1, 0.36, 0.02), shirt2, 0, 0.3, 0.125));          // open shirt over a white tee
  torso.add(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), skin, 0, 0.6, 0));
  const head = new THREE.Group(); head.position.y = 0.73; torso.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.115, 14, 10).scale(0.95, 1.12, 1), skin));
  head.add(mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.05, 1.05), hair, 0, 0.025, -0.01));
  const limb = (parent, x, y, len, r, mat, endMat, endGeo) => {
    const top = new THREE.Group(); top.position.set(x, y, 0); parent.add(top);
    top.add(mesh(new THREE.CapsuleGeometry(r, len - r * 2, 3, 8), mat, 0, -len / 2, 0));
    const joint = new THREE.Group(); joint.position.y = -len; top.add(joint);
    joint.add(mesh(new THREE.CapsuleGeometry(r * 0.85, len - r * 2, 3, 8), endMat || mat, 0, -len / 2, 0));
    if (endGeo) joint.add(mesh(endGeo[0], endGeo[1], 0, -len - 0.02, endGeo[2]));
    return [top, joint];
  };
  const [armL, elbowL] = limb(torso, 0.22, 0.52, 0.29, 0.055, shirt, skin, [new THREE.SphereGeometry(0.045, 8, 6), skin, 0]);
  const [armR, elbowR] = limb(torso, -0.22, 0.52, 0.29, 0.055, shirt, skin, [new THREE.SphereGeometry(0.045, 8, 6), skin, 0]);
  const [legL, kneeL] = limb(hips, 0.1, -0.02, 0.45, 0.075, jeans, jeans, [new THREE.BoxGeometry(0.1, 0.07, 0.26), shoe, 0.05]);
  const [legR, kneeR] = limb(hips, -0.1, -0.02, 0.45, 0.075, jeans, jeans, [new THREE.BoxGeometry(0.1, 0.07, 0.26), shoe, 0.05]);
  armL.rotation.z = 0.08; armR.rotation.z = -0.08;
  return { root, hips, torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR };
}

const WALK = 2.0, RUN = 5.0, SPRINT = 7.4, JUMP = 5.0, GRAV = 18, R = 0.32, TALL = 1.8;
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* ---------- controller ---------- */
export class Player {
  constructor(scene, world, model) {
    this.w = world;
    if (model) this.rig(scene, model); else { this.fig = makeFigure(); scene.add(this.fig.root); }
    this.pos = new THREE.Vector3(world.spawn.x, world.heightAt(world.spawn.x, world.spawn.z), world.spawn.z);
    this.vel = new THREE.Vector3(); this.yaw = world.spawn.yaw; this.ground = true; this.phase = 0; this.lean = 0;
    this.speed = 0; this.sprinting = false; this.onStep = null; this.surface = "stone";
  }
  update(dt, input, camYaw) {
    const f = (input.down("KeyW", "ArrowUp") ? 1 : 0) - (input.down("KeyS", "ArrowDown") ? 1 : 0);
    const s = (input.down("KeyD", "ArrowRight") ? 1 : 0) - (input.down("KeyA", "ArrowLeft") ? 1 : 0);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let wx = fx * f + rx * s, wz = fz * f + rz * s; const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    this.sprinting = wl > 0 && input.down("ShiftLeft", "ShiftRight");
    const target = wl ? (this.sprinting ? SPRINT : input.down("AltLeft", "ControlLeft") ? WALK : RUN) : 0;
    const acc = this.ground ? (target > this.speed ? 22 : 30) : 4;
    const k = 1 - Math.exp(-acc * dt * 0.35);
    this.vel.x += (wx * target - this.vel.x) * k; this.vel.z += (wz * target - this.vel.z) * k;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    if (this.speed > 0.3) {   // turn to face where we're going; lean into the turn
      const want = Math.atan2(this.vel.x, this.vel.z), d = ang(want - this.yaw);
      this.yaw += d * Math.min(1, dt * (this.ground ? 11 : 4));
      this.lean += (THREE.MathUtils.clamp(-d * 0.6, -0.25, 0.25) * (this.speed / SPRINT) - this.lean) * Math.min(1, dt * 8);
    } else this.lean *= 1 - Math.min(1, dt * 8);

    if (this.ground && input.down("Space") && !this._jumpHeld) { this.vel.y = JUMP; this.ground = false; }
    this._jumpHeld = input.down("Space");
    this.vel.y -= GRAV * dt;

    const p = this.pos;
    p.x += this.vel.x * dt; p.z += this.vel.z * dt; p.y += this.vel.y * dt;
    this.w.grid.resolve(p, R, p.y + 0.35, TALL);
    const g = this.w.heightAt(p.x, p.z);
    if (p.y <= g + (this.ground ? 0.4 : 0)) {   // stick to the ground and step up curbs
      if (!this.ground && this.vel.y < -6 && this.onLand) this.onLand(-this.vel.y);
      p.y = g; this.vel.y = Math.max(0, this.vel.y); this.ground = this.vel.y === 0;
      if (this.vel.y > 0) this.ground = false;
    } else this.ground = false;
    this.surface = this.w.districtAt(p.x, p.z) === "pier" ? "wood" : g < -0.01 ? "sand" : "stone";
    this.animate(dt);
  }
  rig(scene, { scene: obj, clips }) {
    this.model = obj;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    scene.add(obj);
    this.mixer = new THREE.AnimationMixer(obj); this.act = {};
    for (const c of clips) { const a = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); this.act[c.name] = a; }
    this.wt = [1, 0, 0]; this.lastPh = 0;
  }
  // blend idle -> walk -> run by speed, keep the cycles in step, fire footsteps on contacts
  animateRig(dt) {
    const v = this.speed, A = this.act, want = v < 0.15 ? [1, 0, 0] : v < WALK ? [1 - v / WALK, v / WALK, 0]
      : v < RUN ? [0, 1 - (v - WALK) / (RUN - WALK), (v - WALK) / (RUN - WALK)] : [0, 0, 1];
    const k = 1 - Math.exp(-dt * 10);
    for (let i = 0; i < 3; i++) this.wt[i] += (want[i] - this.wt[i]) * k;
    A.idle.setEffectiveWeight(this.wt[0]); A.walk.setEffectiveWeight(this.wt[1]); A.run.setEffectiveWeight(this.wt[2]);
    const air = this.ground ? 1 : 0.18;
    A.walk.timeScale = THREE.MathUtils.clamp(v / 1.45, 0.7, 1.5) * air;
    A.run.timeScale = THREE.MathUtils.clamp(v / 4.8, 0.8, 1.45) * air;
    const dw = A.walk.getClip().duration, dr = A.run.getClip().duration;
    if (this.wt[1] > 0.01 && this.wt[2] > 0.01) A.walk.time = (A.run.time / dr) * dw;
    this.mixer.update(dt);
    const loco = this.wt[2] > this.wt[1] ? A.run : A.walk, ph = (loco.time / loco.getClip().duration) % 1;
    const crossed = (a, b, x) => (a < x && b >= x) || (a > b && (b >= x || a < x));
    if (v > 0.4 && this.ground && (crossed(this.lastPh, ph, 0.02) || crossed(this.lastPh, ph, 0.52)) && this.onStep) this.onStep(Math.min(1, v / SPRINT), this.surface);
    this.lastPh = ph;
    this.model.position.copy(this.pos);
    this.model.rotation.set(0, this.yaw, this.lean * 0.6);
  }
  animate(dt) {
    if (this.mixer) return this.animateRig(dt);
    const F = this.fig, n = Math.min(1, this.speed / SPRINT), moving = this.speed > 0.25;
    const prev = Math.sin(this.phase);
    this.phase += dt * (moving ? 4.2 + this.speed * 1.05 : 0);
    const sw = Math.sin(this.phase), amp = moving ? 0.25 + n * 0.75 : 0;
    if (moving && this.ground && Math.sign(prev) !== Math.sign(sw) && this.onStep) this.onStep(n, this.surface);
    const ease = Math.min(1, dt * 14), set = (o, v) => { o.rotation.x += (v - o.rotation.x) * ease; };
    if (!this.ground) {   // airborne: knees up, arms out
      set(F.legL, -0.5); set(F.legR, 0.2); set(F.kneeL, 0.9); set(F.kneeR, 0.4); set(F.armL, -0.6); set(F.armR, -0.3);
    } else {
      set(F.legL, sw * amp * 0.85); set(F.legR, -sw * amp * 0.85);
      set(F.kneeL, Math.max(0, Math.sin(this.phase + 1.7)) * (0.25 + n * 1.2) + (moving ? 0.05 : 0));
      set(F.kneeR, Math.max(0, Math.sin(this.phase + 1.7 + Math.PI)) * (0.25 + n * 1.2) + (moving ? 0.05 : 0));
      set(F.armL, -sw * amp * 0.75); set(F.armR, sw * amp * 0.75);
    }
    set(F.elbowL, -(0.15 + n * 1.1)); set(F.elbowR, -(0.15 + n * 1.1));
    const t = performance.now() / 1000;
    F.torso.rotation.x = 0.03 + n * 0.22 + (moving ? 0 : Math.sin(t * 1.6) * 0.012);
    F.torso.rotation.y = moving ? -sw * 0.12 * amp : 0;
    F.hips.position.y = 0.96 - n * 0.05 + (moving ? Math.abs(Math.cos(this.phase)) * (0.03 + n * 0.05) : Math.sin(t * 1.6) * 0.004);
    F.root.position.copy(this.pos);
    F.root.rotation.set(0, this.yaw, this.lean);
  }
}

/* ---------- camera rig ---------- */
export class CamRig {
  constructor(camera, world, yaw) {
    this.cam = camera; this.w = world; this.yaw = yaw + Math.PI; this.pitch = 0.16; this.dist = 4.3;
    this.pivot = new THREE.Vector3(); this.cur = null; this.fov = 70; this.shake = 0;
  }
  update(dt, input, player) {
    const [dx, dy] = input.take(), sens = 0.0022;
    this.yaw -= dx * sens; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * sens, -0.45, 1.15);
    const target = new THREE.Vector3(player.pos.x, player.pos.y + 1.55, player.pos.z);
    if (!this.cur) this.pivot.copy(target); else this.pivot.lerp(target, 1 - Math.exp(-dt * 18));
    const cp = Math.cos(this.pitch), sh = 0.55;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const back = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const look = this.pivot.clone().add(new THREE.Vector3(rx * sh, 0, rz * sh));
    const want = look.clone().addScaledVector(back, this.dist + (player.sprinting ? 0.5 : 0));
    // pull in when a wall is between the player and the camera
    const t = this.w.grid.ray(look, want), len = look.distanceTo(want);
    const d = Math.max(0.6, t * len - 0.25);
    const pos = look.clone().addScaledVector(back, d);
    pos.y = Math.max(pos.y, this.w.heightAt(pos.x, pos.z) + 0.3);
    if (!this.cur) this.cur = pos.clone(); else this.cur.lerp(pos, t < 1 ? 1 : 1 - Math.exp(-dt * 25));
    this.cam.position.copy(this.cur);
    this.cam.lookAt(look);
    const fov = player.sprinting ? 76 : 70;
    this.fov += (fov - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
