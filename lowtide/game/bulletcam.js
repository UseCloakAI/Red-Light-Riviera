/* The bullet cam. On your first headshot, and every few after, the round goes in slow
   motion and the camera rides it: out of the muzzle, a hand's width behind and off to
   one side, the street crawling past, all the way to the head. It goes in (the world
   barely moving), carries on out the other side with the camera through after it, then
   the camera swings round to watch them drop in slow motion, and snaps back with a
   flash. The picture drains and letterboxes; the sound slows and dulls with it
   (audio.js slowmo), with the shot stretched out, the round's whoosh and a heartbeat. */
import * as THREE from "three";

const V = THREE.Vector3;
const smooth = (t) => t * t * (3 - 2 * t);

export class BulletCam {
  constructor({ scene, camera, rig, blit, sfx, hud }) {
    Object.assign(this, { scene, camera, rig, blit, sfx: sfx || {}, hud });
    this.active = false;
    // the round: a brass slug with a hot streak behind it
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.016, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc8a050, emissive: 0x3a2a08 })));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.008, 8).rotateX(Math.PI / 2).translate(0, 0, 0.012), new THREE.MeshLambertMaterial({ color: 0xb8915a })));
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.004, 1, 6, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
      new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(trail); g.userData.trail = trail; g.visible = false; scene.add(g); this.bullet = g;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0025, 4, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.visible = false; scene.add(this.ring);   // the air shoved aside as it goes
  }
  /* from: muzzle, to: the hit on the head, dir: the round's direction, body: () => where the body is now, apply: lands the shot */
  start({ from, to, dir, body, apply }) {
    if (this.active) return false;
    this.active = true; this.t = 0; this.phase = "fly"; this.from = from.clone(); this.to = to.clone(); this.dir = dir.clone().normalize(); this.body = body; this.apply = apply;
    this.len = from.distanceTo(to); this.T = THREE.MathUtils.clamp(0.9 + this.len / 14, 1.2, 3.2);
    this.side = Math.random() < 0.5 ? -1 : 1; this.roll = (Math.random() - 0.5) * 0.5;
    this.fov0 = this.camera.fov; this.bullet.visible = true; this.ring.visible = true;
    // a frame for the shot: right and up of the round's path
    this.right = new V().crossVectors(this.dir, new V(0, 1, 0)); if (this.right.lengthSq() < 1e-4) this.right.set(1, 0, 0); this.right.normalize();
    this.up = new V().crossVectors(this.right, this.dir).normalize();
    if (this.hud && this.hud.root) this.hud.root.classList.add("cine");
    if (this.sfx.slowmo) this.sfx.slowmo(true);
    if (this.sfx.cineShot) this.sfx.cineShot(this.T, this.side);
    return true;
  }
  // real dt; returns how fast the world should run
  update(dt) {
    if (!this.active) return 1;
    this.t += dt;
    const cam = this.camera, D = this.dir, B = this.bullet;
    let worldRate = 0.012, s, bp;
    if (this.phase === "fly") {
      const k = Math.min(1, this.t / this.T); s = k < 0.12 ? smooth(k / 0.12) * 0.12 * 0.6 : 0.072 + (k - 0.12) / 0.88 * 0.928;   // a beat to leave the barrel, then on
      bp = this.from.clone().addScaledVector(D, this.len * s);
      if (k >= 1) { this.phase = "through"; this.t = 0; if (this.apply) { this.apply(); this.apply = null; } if (this.sfx.cineImpact) this.sfx.cineImpact(); }
      // close behind it, a little off to the side, closing in as it nears them
      const back = THREE.MathUtils.lerp(0.55, 0.28, k), off = THREE.MathUtils.lerp(0.16, 0.08, k);
      cam.position.copy(bp).addScaledVector(D, -back).addScaledVector(this.right, off * this.side).addScaledVector(this.up, 0.05);
      cam.up.set(0, 1, 0).applyAxisAngle(D, this.roll * k);
      cam.lookAt(bp.clone().addScaledVector(D, 0.6)); cam.fov = THREE.MathUtils.lerp(this.fov0, 48, smooth(k));
    } else if (this.phase === "through") {
      // out the other side; the camera through after it, slowing
      const k = Math.min(1, this.t / 0.75); bp = this.to.clone().addScaledVector(D, 0.15 + 2.2 * k); worldRate = 0.05;
      const camAt = this.to.clone().addScaledVector(D, -0.3 + 1.1 * smooth(k)).addScaledVector(this.right, 0.1 * this.side).addScaledVector(this.up, 0.06);
      cam.position.copy(camAt); cam.up.set(0, 1, 0);
      cam.lookAt(bp); cam.fov = 48;
      if (k >= 1) { this.phase = "after"; this.t = 0; B.visible = false; this.ring.visible = false; this.orbitFrom = cam.position.clone(); }
    } else {
      // swing round and watch them go down
      const k = Math.min(1, this.t / 1.6), b = this.body ? this.body() : this.to; worldRate = 0.28;
      const a = this.side * (0.9 + 1.4 * smooth(k)), r = 2.4, c = new V(b.x, b.y, b.z);
      const want = c.clone().add(new V(Math.sin(a) * r, 1.1 - 0.4 * k, Math.cos(a) * r));
      cam.position.lerpVectors(this.orbitFrom, want, smooth(Math.min(1, k * 2.5)));
      cam.up.set(0, 1, 0); cam.lookAt(c.x, c.y + 0.3, c.z); cam.fov = THREE.MathUtils.lerp(48, this.fov0, k);
      if (k >= 1) return this.finish();
    }
    if (bp) {
      B.position.copy(bp); B.lookAt(bp.clone().add(D));
      const tl = Math.min(0.9, bp.distanceTo(this.from)); B.userData.trail.scale.set(1, 1, tl);
      this.ring.position.copy(bp).addScaledVector(D, -0.05 - (this.t * 3) % 0.4); this.ring.lookAt(this.ring.position.clone().add(D)); this.ring.scale.setScalar(1 + ((this.t * 3) % 0.4) * 3);
    }
    cam.updateProjectionMatrix();
    // the look: drained, closed in
    const u = this.blit && this.blit.mat.uniforms; if (u) { u.uDesat.value = 0.45; u.uVig.value = 0.75; u.uAb.value = this.phase === "through" && this.t < 0.15 ? 1 : 0; }
    return worldRate;
  }
  finish() {
    this.active = false; this.bullet.visible = false; this.ring.visible = false;
    const cam = this.camera; cam.up.set(0, 1, 0); cam.fov = this.fov0; cam.updateProjectionMatrix();
    const u = this.blit && this.blit.mat.uniforms; if (u) { u.uDesat.value = 0; u.uVig.value = 0; u.uAb.value = 0; u.uFlash.value = 0.35; setTimeout(() => { u.uFlash.value = 0; }, 90); }
    if (this.hud && this.hud.root) this.hud.root.classList.remove("cine");
    if (this.sfx.slowmo) this.sfx.slowmo(false);
    if (this.rig) { this.rig.cur = null; }
    if (this.apply) { this.apply(); this.apply = null; }
    return 1;
  }
}
