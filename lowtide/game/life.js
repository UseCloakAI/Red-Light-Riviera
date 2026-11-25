/* Hollis's health, and what happens when it runs out. Cars that hit you and
   blasts that catch you take health; hard enough hits throw you as a ragdoll
   even if you live. At zero: the body goes limp (the same ragdoll the street
   gets), the world slows, the picture drains to grey, and a line drops in, in
   the spirit of the classic, but ours: DEAD, REALLY?, and worse. A few seconds
   later you wake up outside Marlowe General with a bill. */
import * as THREE from "three";
import { findBones, Ragdoll } from "./rig.js?v=dev";
import { lanePoint } from "./world.js?v=dev";

const LINES = ["DEAD", "REALLY?", "WELL. THAT HAPPENED.", "TIDE'S OUT", "NOT LIKE THIS", "OOF", "SKILL ISSUE", "BETWEEN LICENSES. AND LIVES.", "HIGH WATER", "THAT'LL LEAVE A MARK", "SUNK", "WRITTEN OFF", "THE KNUCKLE CLAIMS ANOTHER"];
const HOSPITAL = { x: -96, z: 14, yaw: Math.PI };   // Marlowe General, on Salt Street
const BILL = 150;

export class Life {
  constructor({ player, world, rig, hud, root, blit, sfx, vehicles }) {
    Object.assign(this, { player, world, rig, hud, root, blit, sfx: sfx || {}, vehicles });
    this.health = 100; this.dead = false; this.rag = null; this.t = 0; this.knock = 0; this.timeScale = 1; this.grey = 0; this.iframes = 0;
    this.el = root.querySelector(".wasted"); this.bar = root.querySelector(".health i");
  }
  // amount: health to take. hit: { point, dir (THREE.Vector3), force, cause }
  damage(amount, hit = {}) {
    if (this.dead || amount <= 0 || this.iframes > 0) return;
    this.health = Math.max(0, this.health - amount); this.sync();
    if (this.rig) this.rig.shake = Math.max(this.rig.shake || 0, Math.min(1, amount / 40));
    if (this.vehicles && this.vehicles.driving && this.health <= 0) this.vehicles.exit(true);
    if (this.health <= 0) return this.die(hit);
    if ((hit.force || 0) > 5 && !(this.vehicles && this.vehicles.driving)) this.fling(hit, 2.2);   // knocked flat, then up again
  }
  sync() { if (this.bar) { this.bar.style.transform = `scaleX(${this.health / 100})`; this.bar.parentElement.classList.toggle("low", this.health < 30); } }
  ragdoll(hit) {
    const P = this.player; if (!P.model) return false;
    P.B = P.B || findBones(P.model); if (!P.B) return false;
    P.model.updateMatrixWorld(true);
    const dir = hit.dir || new THREE.Vector3(0, 0, 1);
    this.rag = new Ragdoll(P.B, this.world, new THREE.Vector3(P.vel.x, 0, P.vel.z), { point: hit.point || P.pos.clone().setY(P.pos.y + 1), dir, force: hit.force || 5 });
    return true;
  }
  fling(hit, secs) { if (this.ragdoll(hit)) { this.knock = secs; this.player.vel.set(0, 0, 0); } }
  die(hit) {
    this.dead = true; this.t = 0;
    if (!this.rag) this.ragdoll(hit);
    this.line = LINES[(Math.random() * LINES.length) | 0];
    if (this.el) { this.el.querySelector("b").textContent = this.line; this.el.classList.add("on"); }
    if (this.sfx.wasted) this.sfx.wasted();
  }
  // true while the body is on the floor (the game shouldn't drive the player then)
  get down() { return this.dead || this.knock > 0; }
  update(dt) {
    this.iframes = Math.max(0, this.iframes - dt);
    const P = this.player;
    if (this.rag) {
      if (this.rag.step(dt)) this.rag.pose();
      const h = this.rag.p[0]; P.pos.set(h.x, Math.max(this.world.heightAt(h.x, h.z), h.y - 0.9), h.z);
    }
    if (this.knock > 0 && !this.dead) {
      this.knock -= dt;
      if (this.knock <= 0) { this.rag = null; P.vel.set(0, 0, 0); P.pos.y = this.world.heightAt(P.pos.x, P.pos.z); }   // up again; the clips take the bones back
    }
    // dying: slow time, drain the colour, then wake up at the hospital
    this.timeScale += ((this.dead ? 0.3 : 1) - this.timeScale) * Math.min(1, dt * 4);
    this.grey += ((this.dead ? 1 : 0) - this.grey) * Math.min(1, dt * 2.5);
    if (this.blit) this.blit.mat.uniforms.uGrey.value = this.grey;
    if (this.dead) { this.t += dt; if (this.t > 6.5) this.respawn(); }
    // a little health back over time while nothing's hurting you
    if (!this.dead && this.health < 100 && this.iframes <= 0) { this.regen = (this.regen || 0) + dt; if (this.regen > 6) { this.health = Math.min(100, this.health + dt * 2); this.sync(); } }
    else this.regen = 0;
  }
  respawn() {
    const P = this.player, H = { ...HOSPITAL };
    // the pavement nearest the hospital's door (never inside a wall)
    let best = Infinity; for (const l of this.world.lanes) for (let s = 0; s < l.L; s += 4) { const p = lanePoint(l, s), d = Math.hypot(p.x - HOSPITAL.x, p.z - HOSPITAL.z); if (d < best) { best = d; H.x = p.x; H.z = p.z; } }
    this.dead = false; this.rag = null; this.knock = 0; this.health = 100; this.iframes = 3; this.sync();
    P.pos.set(H.x, this.world.heightAt(H.x, H.z), H.z); P.vel.set(0, 0, 0); P.yaw = H.yaw;
    if (P.model) P.model.visible = true;
    if (this.rig) { this.rig.yaw = H.yaw + Math.PI; this.rig.cur = null; }
    if (this.el) this.el.classList.remove("on");
    if (this.hud) { this.hud.cash = Math.max(0, this.hud.cash - BILL); this.hud.cashEl.textContent = "$" + this.hud.cash.toLocaleString("en-US"); this.hud.subtitle(`Marlowe General. The bill was $${BILL}. They kept your watch.`); }
  }
}
