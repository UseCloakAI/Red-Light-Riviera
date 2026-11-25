/* The Marlowe Keys PD and the wanted level.

   Crimes: shooting, hurting or killing someone, taking a car with someone in it,
   blowing one up, and anything done to a cop. A crime only counts if it's seen:
   a cop with a line of sight, or anyone on the street near enough to call it in
   (they take a moment). Stars: shots or a fight get one; a body gets two; a cop
   three; more bodies while wanted add more, up to five.

   The response: patrol cars dispatched out of sight, more of them the more stars
   (and a helicopter from three). They drive the streets toward you with the
   sirens on and traffic pulling over, then straight at you: they stop by you on
   foot and get out, or ram your car. On foot, cops close in and, from two stars
   (or one if you're armed), shoot. At one star, unarmed and standing still near
   a cop, you're arrested: BUSTED.

   Losing them: while no cop and no helicopter can see you, the stars flash and a
   search area (centred where you were last seen) shows on the radar. Get out of
   it and stay out of sight long enough and it's over. */
import * as THREE from "three";
import { findBones, ik, wpos } from "./rig.js?v=dev";
import { lanePoint } from "./world.js?v=dev";

export const STATION = { x: 30, z: -150, name: "Marlowe Keys PD" };
const CARS = [0, 1, 2, 3, 3, 4], COPS_PER_CAR = 2;
const SAY = {
  stop: ["Police! Stop right there!", "Freeze!", "Stay where you are!"],
  armed: ["Drop the weapon!", "Suspect is armed!", "Put it down, now!"],
  shoot: ["Shots fired, shots fired!", "Take cover!", "Open fire!"],
  arrest: ["Hands where I can see them!", "Get on the ground!", "You're under arrest."],
  chase: ["We've got a runner!", "Don't make this harder!", "Stop running!"],
  lost: ["We lost them.", "Suspect's gone."]
};
const pick = (L) => L[(Math.random() * L.length) | 0];

// a service pistol, small and black, held in the right hand
function copGun() {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0x141416 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.17).translate(0, 0.02, 0.06), m), new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.04).translate(0, -0.03, 0), m));
  return g;
}
// the helicopter: a body, a tail, skids and a rotor, and a searchlight cone
function heliModel() {
  const g = new THREE.Group(), dark = new THREE.MeshLambertMaterial({ color: 0x1b1f2a }), white = new THREE.MeshLambertMaterial({ color: 0xe8e6e0 }), glass = new THREE.MeshLambertMaterial({ color: 0x223040, emissive: 0x0a1018 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 3.6).translate(0, 0, 0.2), white));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.2).translate(0, 0.1, 2.2), glass));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 4.2).translate(0, 0.35, -3.6), dark));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.6).translate(0, 0.8, -5.6), dark));
  for (const x of [-0.8, 0.8]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.2).translate(x, -1.1, 0.2), dark));
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.05, 0.3).translate(0, 0.95, 0), dark), rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI / 2;
  const hub = new THREE.Group(); hub.add(rotor, rotor2); hub.position.y = 0.0; g.add(hub); g.userData.rotor = hub;
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3, 1, 16, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide }));
  const spot = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.add(spot); beam.userData.spot = spot;   // the pool of light it throws on the ground (placed in world space below)
  g.userData.beam = beam;
  return g;
}

export class Police {
  constructor(o) {
    Object.assign(this, o);   // scene, world, player, peds, traffic, vehicles, life, hud, sfx, fx, arsenal, say(text, pd)
    this.level = 0; this.seen = false; this.last = new THREE.Vector3(); this.evade = 0; this.kills = 0; this.copKills = 0; this.pending = [];
    this.units = [];          // { car, cops: [pd...] }
    this.cops = o.cops || []; // cop people (peds.js makeCop), reused
    this.cops.forEach((pd, k) => { pd.k = k; }); this.dispatchT = 0;
    for (const pd of this.cops) { pd.gun = copGun(); pd.gun.visible = false; this.scene.add(pd.gun); }
    this.heli = null; this.t = 0; this.lookT = 0; this.busted = 0; this.lastLine = -9;
    this.onLevel = null;      // (level) for stats
  }
  get wanted() { return this.level > 0; }
  // the stars, and the HUD
  setLevel(n) {
    n = Math.max(0, Math.min(5, n));
    if (n === this.level) return;
    const was = this.level; this.level = n;
    if (this.hud.setWanted) this.hud.setWanted(n);
    if (n > was) { this.seen = true; this.evade = 0; this.last.copy(this.player.pos); if (this.sfx.wantedUp) this.sfx.wantedUp(n); }
    if (n === 0) this.standDown();
    if (this.onLevel) this.onLevel(n);
  }
  /* a crime at `at` ({x, z}). kind: shots | assault | murder | copassault | copkill | carjack | copcar | explosion */
  crime(kind, at) {
    const P = this.player.pos, x = at ? at.x : P.x, z = at ? at.z : P.z;
    const byCop = this.copSees(x, z, 70);
    const witness = byCop || this.peds.peds.some((pd, i) => !pd.cop && !pd.dead && (i < this.peds.limit) && pd.h.group.visible && Math.hypot(pd.h.group.position.x - x, pd.h.group.position.z - z) < 35);
    if (kind === "murder") this.kills++;
    if (kind === "copkill") this.copKills++;
    if (!witness && !this.wanted) return;
    const target = { shots: 1, assault: 1, carjack: 1, copcar: 2, explosion: 2, murder: 2, copassault: 2, copkill: 3 }[kind] || 1;
    let n = Math.max(this.level, target);
    if (this.wanted && (kind === "murder" || kind === "copkill" || kind === "copassault")) {
      if (kind === "copkill" && this.copKills % 2 === 0) n = Math.max(n, this.level + 1);
      if (kind === "murder" && this.kills % 3 === 0) n = Math.max(n, this.level + 1);
    }
    const go = () => { this.setLevel(n); if (byCop || this.wanted) { this.seen = true; this.last.set(P.x, P.y, P.z); this.evade = 0; } };
    if (byCop || this.wanted) go(); else this.pending.push({ t: 1.6 + Math.random() * 1.2, go });   // someone calls it in
  }
  // can a cop (on foot or at a car's wheel) see this spot?
  copSees(x, z, range) {
    const eye = new THREE.Vector3(), to = new THREE.Vector3(x, this.world.heightAt(x, z) + 1.3, z);
    for (const pd of this.cops) {
      if (!pd.active || pd.dead) continue; const g = pd.h.group.position;
      if (Math.hypot(g.x - x, g.z - z) > range) continue;
      eye.set(g.x, g.y + 1.6, g.z); if (this.world.grid.hit(eye, to).t >= 1) return true;
    }
    for (const u of this.units) {
      const c = u.car; if (!c || !c.active || u.cops.length === 0 || c.deployed) continue;
      if (Math.hypot(c.x - x, c.z - z) > range) continue;
      eye.set(c.x, c.y + 1.4, c.z); if (this.world.grid.hit(eye, to).t >= 1) return true;
    }
    if (this.heli && this.heli.visible && Math.hypot(this.heli.position.x - x, this.heli.position.z - z) < 90) return true;
    return false;
  }
  // send cars until there are enough for the stars
  dispatch() {
    const want = CARS[this.level];
    this.units = this.units.filter((u) => u.car.active && u.car.cop);
    let live = this.units.filter((u) => u.car.pursue || u.cops.some((pd) => pd.active && !pd.dead)).length;
    while (live < want) {
      const free = this.cops.filter((pd) => !pd.active && !pd.dead);
      if (free.length < 1) break;
      const car = this.traffic.spawnCop(this.player.pos, this.last); if (!car) break;
      const crew = free.slice(0, COPS_PER_CAR);
      for (const pd of crew) pd.active = "car";
      this.units.push({ car, cops: crew }); live++;
      if (!car.sirenSfx && this.sfx.siren) car.sirenSfx = this.sfx.siren();
    }
  }
  // the chase is over: cars switch off and go about their business; cops still on foot walk back
  standDown() {
    for (const u of this.units) {
      const c = u.car; c.pursue = false; c.siren = false; c.target = null;
      if (c.sirenSfx) { c.sirenSfx.stop(); c.sirenSfx = null; }
      for (const pd of u.cops) { if (pd.active === "foot" && !pd.dead) pd.state = "return"; else if (pd.active === "car") pd.active = false; }
    }
    this.kills = 0; this.copKills = 0; this.evade = 0; this.pending.length = 0;
    if (this.heli) this.heli.leave = true;
    if (this.hud.searchArea) this.hud.searchArea(null);
  }
  // after a death or an arrest: everyone gone
  reset() {
    this.setLevel(0);
    for (const u of this.units) { const c = u.car; if (c.sirenSfx) { c.sirenSfx.stop(); c.sirenSfx = null; } if (c.ai !== undefined && c.active && c.cop) { c.active = false; this.traffic.hide(c); this.traffic.uncop(c); if (c.obb) { this.world.grid.remove(c.obb); c.obb = null; } } }
    for (const pd of this.cops) this.despawnCop(pd);
    this.units = [];
    if (this.heli) { this.heli.visible = false; this.heli.userData.beam.visible = false; this.heli.userData.beam.userData.spot.visible = false; if (this.heliSfx) { this.heliSfx.stop(); this.heliSfx = null; } }
  }
  despawnCop(pd) {
    pd.active = false; pd.state = null; pd.h.group.visible = false; pd.gun.visible = false;
    if (pd.dead) { pd.dead = false; pd.rag = null; }
    pd.hp = 100; pd.stagger = 0;
  }
  /* cops out of a stopped car, by its doors */
  deploy(u) {
    const c = u.car, lx = Math.cos(c.a), lz = -Math.sin(c.a);
    u.cops.forEach((pd, k) => {
      if (pd.active !== "car") return;
      const side = k === 0 ? 1 : -1, x = c.x + lx * 1.4 * side, z = c.z + lz * 1.4 * side;
      const g = pd.h.group; g.position.set(x, this.world.heightAt(x, z), z); g.rotation.y = c.a; g.visible = true;
      pd.active = "foot"; pd.state = "chase"; pd.fireT = 0.8 + Math.random(); pd.unit = u; pd.dead = false; pd.hp = 100;
    });
    // the car stays where it stopped, solid
    c.ai = false; c.pursue = false; c.speed = 0; c.obb = this.world.grid.obb(c.x, c.z, 0.95, 2.2, -c.a, 1.5);
    if (this.say && u.cops[0]) this.line(this.armed() ? pick(SAY.armed) : this.level <= 1 ? pick(SAY.stop) : pick(SAY.chase), u.cops[0]);
  }
  armed() { const w = this.arsenal && this.arsenal.weapon; return !!(w && !w.melee); }
  line(text, pd) { if (this.t - this.lastLine < 3.5) return; this.lastLine = this.t; if (this.say) this.say(text, pd); }

  update(dt) {
    this.t += dt;
    const P = this.player.pos, life = this.life;
    // calls coming in
    for (let i = this.pending.length - 1; i >= 0; i--) { const q = this.pending[i]; if ((q.t -= dt) <= 0) { this.pending.splice(i, 1); q.go(); } }
    if (life.dead || life.busted) return this.tickCops(dt);
    if (this.level > 0) {
      // who can see you
      if ((this.lookT -= dt) <= 0) {
        this.lookT = 0.25;
        const sees = this.copSees(P.x, P.z, 60);
        if (sees) { this.last.copy(P); this.evade = 0; }
        if (sees !== this.seen) { this.seen = sees; if (this.hud.searching) this.hud.searching(!sees); }
      }
      if (!this.seen) {
        const R = 55 + this.level * 25, out = Math.hypot(P.x - this.last.x, P.z - this.last.z) > R;
        if (this.hud.searchArea) this.hud.searchArea({ x: this.last.x, z: this.last.z, r: R });
        if (out) { this.evade += dt; if (this.evade > 5 + this.level * 2) { this.setLevel(0); if (this.cops[0]) this.line(pick(SAY.lost), this.cops[0]); } }
      } else if (this.hud.searchArea) this.hud.searchArea(null);
      if ((this.dispatchT -= dt) <= 0) { this.dispatchT = 1; this.dispatch(); }
      // cars on their way aim for where you were last seen, or you, if they can see you
      for (const u of this.units) {
        const c = u.car; if (!c.pursue) continue;
        c.target = this.seen ? null : { x: this.last.x, z: this.last.z };
        if (c.deployed || !c.ai) this.deploy(u);   // stopped by you (or knocked out of the chase): out they get
      }
    }
    // sirens follow their cars
    for (const u of this.units) { const c = u.car; if (c.sirenSfx) c.sirenSfx.set(Math.hypot(c.x - P.x, c.z - P.z), c.siren && c.active); }
    this.tickCops(dt); this.tickHeli(dt);
    // busted: one star, no gun in your hand, a cop right there, and you've stopped
    if (this.level === 1 && !this.vehicles.driving && !this.armed()) {
      const close = this.cops.find((pd) => pd.active === "foot" && !pd.dead && Math.hypot(pd.h.group.position.x - P.x, pd.h.group.position.z - P.z) < 1.7);
      if (close && this.player.speed < 1.2) { this.busted += dt; if (this.busted > 1.3) { this.busted = 0; life.bust(); } } else this.busted = Math.max(0, this.busted - dt);
    } else this.busted = 0;
  }
  // cops on foot: close in, keep a distance and shoot, or come and cuff you
  tickCops(dt) {
    const P = this.player.pos, driving = this.vehicles.car, lethal = this.level >= 2 || (this.level === 1 && this.armed()) || !!(driving && this.level >= 2);
    const A = new THREE.Vector3(), C = new THREE.Vector3(), F = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0), RT = new THREE.Vector3();
    for (const pd of this.cops) {
      if (pd.active !== "foot") continue;
      const g = pd.h.group;
      if (pd.dead) { pd.gun.visible = false; if (Math.hypot(g.position.x - P.x, g.position.z - P.z) > 140) this.despawnCop(pd); continue; }
      const tx = driving ? driving.x : P.x, tz = driving ? driving.z : P.z, dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz) || 1;
      let goal = null, speed = 0, face = Math.atan2(dx, dz), aiming = false;
      if (pd.state === "return" || this.level === 0) {   // back to the car, in, gone
        const c = pd.unit && pd.unit.car;
        if (!c || !c.active) { this.despawnCop(pd); continue; }
        goal = { x: c.x, z: c.z }; speed = pd.speed;
        if (Math.hypot(c.x - g.position.x, c.z - g.position.z) < 2.2) {
          pd.active = "car"; g.visible = false; pd.gun.visible = false;
          if (pd.unit.cops.every((q) => q.active !== "foot")) { if (c.obb) { this.world.grid.remove(c.obb); c.obb = null; } c.ai = true; c.siren = false; c.pursue = false; c.taken = false; this.snapToLane(c); for (const q of pd.unit.cops) q.active = false; }
          continue;
        }
        face = Math.atan2(goal.x - g.position.x, goal.z - g.position.z);
      } else {
        const sees = this.world.grid.hit(A.set(g.position.x, g.position.y + 1.6, g.position.z), C.set(tx, P.y + 1.2, tz)).t >= 1;
        const arrest = this.level === 1 && !this.armed() && !driving;
        const keep = arrest ? 1.1 : lethal ? (sees ? 9 + (pd.k % 4) : 2) : 3;
        if (d > keep) { goal = { x: tx, z: tz }; speed = d > 12 ? pd.run : pd.speed * 1.4; }
        aiming = !arrest && sees && d < 45;
        if (arrest && d < 4) this.line(pick(SAY.arrest), pd);
        // fire
        if (lethal && aiming) {
          pd.fireT -= dt;
          if (pd.fireT <= 0) { pd.fireT = 0.55 + Math.random() * 0.8 - this.level * 0.05; this.shoot(pd, d, !!driving); }
        }
      }
      // move (out of walls), turn, animate
      if (goal) {
        const gx = goal.x - g.position.x, gz = goal.z - g.position.z, gd = Math.hypot(gx, gz) || 1, step = Math.min(gd, speed * dt);
        const q = { x: g.position.x + gx / gd * step, z: g.position.z + gz / gd * step }; this.world.grid.resolve(q, 0.3, g.position.y + 0.2, 1.6);
        pd.vx = (q.x - g.position.x) / Math.max(dt, 1e-4); pd.vz = (q.z - g.position.z) / Math.max(dt, 1e-4);
        g.position.set(q.x, this.world.heightAt(q.x, q.z), q.z);
        if (!aiming) face = Math.atan2(gx, gz);
      } else { pd.vx = pd.vz = 0; }
      let dy = face - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * Math.min(1, dt * 9);
      const mv = goal && speed > 0, run = mv && speed > pd.speed * 1.5, k = Math.min(1, dt * 8);
      pd.wW += ((mv && !run ? 1 : 0) - pd.wW) * k; pd.rW += ((run ? 1 : 0) - pd.rW) * k;
      pd.act.walk.setEffectiveWeight(pd.wW); pd.act.run.setEffectiveWeight(pd.rW); pd.act.idle.setEffectiveWeight(Math.max(0, 1 - pd.wW - pd.rW));
      pd.act.walk.timeScale = 1.2; pd.act.run.timeScale = pd.run / 4.8;
      pd.mixer.update(dt);
      // arms: the gun up on you while aiming (two hands), down by the side otherwise
      const B = pd.B || (pd.B = findBones(g)); g.updateMatrixWorld(true);
      if (B) {
        wpos(B.chest, C); F.set(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y)); RT.set(-F.z, 0, F.x);
        const aimDir = A.set(tx - C.x, (P.y + 1.1) - C.y, tz - C.z).normalize();
        pd.aimW = (pd.aimW || 0) + ((aiming ? 1 : 0) - (pd.aimW || 0)) * Math.min(1, dt * 8);
        if (pd.aimW > 0.02) {
          const T = new THREE.Vector3().copy(C).addScaledVector(aimDir, 0.5).addScaledVector(U, 0.12).addScaledVector(RT, -0.04);
          ik(B.armR, T, new THREE.Vector3(0, -1, 0).addScaledVector(RT, -0.8), pd.aimW);
          ik(B.armL, T.clone().addScaledVector(RT, 0.05).addScaledVector(U, -0.03), new THREE.Vector3(0, -1, 0).addScaledVector(RT, 0.8), pd.aimW);
        }
        const hand = wpos(B.armR[2], new THREE.Vector3()), fing = wpos(B.armR[3], new THREE.Vector3()).sub(hand).normalize();
        const dir = fing.clone().lerp(aimDir, pd.aimW).normalize();
        pd.gun.position.copy(hand).addScaledVector(dir, 0.05); pd.gun.lookAt(pd.gun.position.clone().add(dir)); pd.gun.visible = true;
        pd.muzzle = pd.gun.position.clone().addScaledVector(dir, 0.18);
      }
    }
  }
  // a cop fires at you: the odds fall with distance, with you moving, and with you in a car
  shoot(pd, d, inCar) {
    const P = this.player.pos, m = pd.muzzle || pd.h.group.position.clone().setY(pd.h.group.position.y + 1.4);
    if (this.sfx.shot) this.sfx.shot(Math.hypot(m.x - P.x, m.z - P.z), 0);
    if (this.fx) { this.fx.puff(m, new THREE.Vector3(0, 0.3, 0), 0.25, 0.6, 0xb8b2a8, 0.3); this.fx.sparks(m, 3, new THREE.Vector3(Math.sin(pd.h.group.rotation.y), 0, Math.cos(pd.h.group.rotation.y)), 2, 0xffd080, 0.08); }
    if (Math.random() < 0.3) this.line(pick(SAY.shoot), pd);
    const odds = 0.55 * Math.max(0.12, 1 - d / 50) * (this.player.speed > 3 ? 0.55 : 1) * (inCar ? 0.6 : 1);
    const dir = new THREE.Vector3(P.x - m.x, 0, P.z - m.z).normalize();
    if (Math.random() < odds) {
      if (inCar) { const c = this.vehicles.car; this.vehicles.hurt(c, 4); this.vehicles.impactCar(c, P.x - dir.x, P.z - dir.z, dir.x, dir.z, 3); if (Math.random() < 0.25) this.life.damage(5, { dir, force: 0 }); }
      else this.life.damage(7 + this.level * 1.5, { point: new THREE.Vector3(P.x, P.y + 1.2, P.z), dir, force: 1.5, cause: "cop" });
    } else if (this.fx) {   // a miss: the round hits round you
      const q = new THREE.Vector3(P.x + (Math.random() - 0.5) * 3, 0, P.z + (Math.random() - 0.5) * 3); q.y = this.world.heightAt(q.x, q.z);
      this.fx.puff(q, new THREE.Vector3(0, 0.6, 0), 0.25, 0.6, 0x9a948a, 0.5); this.fx.sparks(q, 4, new THREE.Vector3(0, 1, 0), 2, 0xffb050, 0.15);
      if (this.sfx.impact) this.sfx.impact("hard", 2 + Math.random() * 3, 0);
    }
  }
  // the helicopter: from three stars, circling you with the light on you
  tickHeli(dt) {
    const want = this.level >= 3, P = this.player.pos;
    if (!this.heli && want) { this.heli = heliModel(); this.scene.add(this.heli); this.scene.add(this.heli.userData.beam); this.heli.visible = false; }
    const h = this.heli; if (!h) return;
    if (want && !h.visible) { h.visible = true; h.leave = false; h.userData.beam.visible = true; const a = Math.random() * 6.28; h.position.set(P.x + Math.cos(a) * 200, 60, P.z + Math.sin(a) * 200); this.heliA = a; if (this.sfx.heli && !this.heliSfx) this.heliSfx = this.sfx.heli(); }
    if (!h.visible) return;
    h.userData.rotor.rotation.y += dt * 28;
    const tgt = h.leave ? new THREE.Vector3(h.position.x + Math.cos(this.heliA) * 50, 70, h.position.z + Math.sin(this.heliA) * 50) : (this.heliA += dt * 0.28, new THREE.Vector3(this.last.x + Math.cos(this.heliA) * 38, 42, this.last.z + Math.sin(this.heliA) * 38));
    const v = tgt.sub(h.position), dist = v.length(), mv = Math.min(dist, 22 * dt); h.position.addScaledVector(v.normalize(), mv);
    h.rotation.y = Math.atan2(v.x, v.z); h.rotation.z = Math.sin(this.t * 0.7) * 0.05; h.rotation.x = Math.min(0.25, dist / 200);
    const beam = h.userData.beam, aim = h.leave ? h.position.clone().setY(0) : new THREE.Vector3(this.last.x, this.world.heightAt(this.last.x, this.last.z), this.last.z);
    const len = h.position.distanceTo(aim); beam.position.copy(h.position).add(new THREE.Vector3(0, -1.2, 0)); beam.scale.set(0.9, len, 0.9);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim.clone().sub(beam.position).normalize());
    const sp = beam.userData.spot; beam.remove(sp); this.scene.add(sp); sp.position.set(aim.x, aim.y + 0.12, aim.z); sp.visible = beam.visible;
    if (this.heliSfx) this.heliSfx.set(Math.hypot(h.position.x - P.x, h.position.z - P.z), h.position.y);
    if (h.leave && Math.hypot(h.position.x - P.x, h.position.z - P.z) > 260) { h.visible = false; beam.visible = false; beam.userData.spot.visible = false; if (this.heliSfx) { this.heliSfx.stop(); this.heliSfx = null; } }
  }
  // a car off the roads gets back onto the nearest lane
  snapToLane(c) {
    let best = null, bd = Infinity;
    for (const l of this.traffic.lanes) for (let i = 0; i < l.pts.length; i += 2) { const p = l.pts[i], d = Math.hypot(p.x - c.x, p.z - c.z); if (d < bd) { bd = d; best = { l, s: l.cum[i] }; } }
    if (best) { c.w = best.l; c.s = best.s; c.next = null; c.go = false; c.wait = 0; }
  }
  // the radar's cop blips
  blips() {
    const out = [];
    for (const u of this.units) if (u.car.active && (u.car.siren || u.car.pursue)) out.push({ x: u.car.x, z: u.car.z, cop: true });
    for (const pd of this.cops) if (pd.active === "foot" && !pd.dead) out.push({ x: pd.h.group.position.x, z: pd.h.group.position.z, cop: true, foot: true });
    if (this.heli && this.heli.visible) out.push({ x: this.heli.position.x, z: this.heli.position.z, cop: true, heli: true });
    return out;
  }
}
// (STATION is found on the nearest pavement at respawn; lanePoint is used by Life)
void lanePoint;
