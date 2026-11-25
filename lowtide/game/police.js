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
import { shotgunModel } from "./weapons.js?v=dev";

export const STATION = { x: 30, z: -150, name: "Marlowe Keys PD" };
const CARS = [0, 1, 2, 3, 4, 5], COPS_PER_CAR = 2, HELI_HP = 260;
const SAY = {
  stop: ["Police! Stop right there!", "Freeze!", "Stay where you are!"],
  armed: ["Drop the weapon!", "Suspect is armed!", "Put it down, now!"],
  shoot: ["Shots fired, shots fired!", "Take cover!", "Open fire!"],
  arrest: ["Hands where I can see them!", "Get on the ground!", "You're under arrest."],
  chase: ["We've got a runner!", "Don't make this harder!", "Stop running!"],
  lost: ["We lost them.", "Suspect's gone."],
  heli: ["Air unit is down!", "We lost the chopper!"]
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
    for (const pd of this.cops) { pd.shotgun = shotgunModel(); pd.shotgun.visible = false; this.scene.add(pd.shotgun); }
    this.strips = []; this.stripT = 0; this.huntT = 0; this.hunt = new THREE.Vector3(); this.recycleT = 0;
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
    const witness = byCop || this.peds.peds.some((pd, i) => !pd.cop && !pd.dead && (i < this.peds.limit) && pd.h.group.visible && Math.hypot(pd.h.group.position.x - x, pd.h.group.position.z - z) < 45);
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
    const h = this.heli;
    if (h && h.visible && !h.crash && Math.hypot(h.position.x - x, h.position.z - z) < 90) { eye.copy(h.position); eye.y -= 1.6; if (this.world.grid.hit(eye, to).t >= 1) return true; }
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
      // closer than before, ahead of where you're heading, out of the camera's view
      const P = this.player.pos, mv = this.vehicles.car ? { x: Math.sin(this.vehicles.car.a) * this.vehicles.car.speed, z: Math.cos(this.vehicles.car.a) * this.vehicles.car.speed } : { x: this.player.vel.x, z: this.player.vel.z };
      const ahead = { x: P.x + mv.x * 2.5, z: P.z + mv.z * 2.5 }, cam = this.camera;
      const unseen = (q) => { if (!cam) return true; const v = new THREE.Vector3(q.x, 1, q.z).project(cam); return v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1; };
      const car = this.traffic.spawnCop(ahead, this.seen ? null : this.last, { min: 40, max: 105, ok: unseen }); if (!car) break;
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
    if (this.heli) { this.heli.visible = false; this.heli.crash = null; this.heli.userData.beam.visible = false; this.heli.userData.beam.userData.spot.visible = false; if (this.heliSfx) { this.heliSfx.stop(); this.heliSfx = null; } }
    for (const sp of this.strips) { this.scene.remove(sp.mesh); const u = sp.unit; if (u && u.car.obb) { this.world.grid.remove(u.car.obb); u.car.obb = null; } } this.strips = [];
  }
  despawnCop(pd) {
    pd.active = false; pd.state = null; pd.h.group.visible = false; pd.gun.visible = false;
    if (pd.dead) { pd.dead = false; pd.rag = null; }
    if (pd.shotgun) pd.shotgun.visible = false;
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
      pd.arm = this.level >= 3 && (k === 0 || this.level >= 4) ? "shotgun" : "pistol";
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
        const sees = this.copSees(P.x, P.z, 85);
        if (sees) { this.last.copy(P); this.evade = 0; }
        if (sees !== this.seen) { this.seen = sees; if (this.hud.searching) this.hud.searching(!sees); }
      }
      if (!this.seen) {
        const R = 55 + this.level * 25, out = Math.hypot(P.x - this.last.x, P.z - this.last.z) > R;
        if (this.hud.searchArea) this.hud.searchArea({ x: this.last.x, z: this.last.z, r: R });
        if (out) { this.evade += dt; if (this.evade > 6 + this.level * 2.5) { this.setLevel(0); if (this.cops[0]) this.line(pick(SAY.lost), this.cops[0]); } }
      } else if (this.hud.searchArea) this.hud.searchArea(null);
      if ((this.dispatchT -= dt) <= 0) { this.dispatchT = 1; this.dispatch(); }
      /* hunting: out of sight they don't just sit on the last sighting. They sweep toward where you
         really are, a hunch that tightens the longer they look (radio chatter, witnesses) */
      if (!this.seen) {
        this.huntT += dt;
        if ((this.huntT % 4) < dt || this.hunt.lengthSq() === 0) { const r = Math.max(10, 55 - this.huntT * 2.5 + 20 / this.level), a = Math.random() * 6.28; this.hunt.set(P.x + Math.cos(a) * r * Math.random(), 0, P.z + Math.sin(a) * r * Math.random()); }
      } else { this.huntT = 0; this.hunt.set(0, 0, 0); }
      // a car that's stuck, lost or left far behind is called off and another sent from closer
      if ((this.recycleT -= dt) <= 0) {
        this.recycleT = 1.5;
        for (const u of this.units) { const c = u.car; if (!c.pursue || !c.active) continue; const d = Math.hypot(c.x - P.x, c.z - P.z); c.slow = c.speed < 2 ? (c.slow || 0) + 1.5 : 0;
          if (d > 170 || c.slow > 7.5) { this.recall(u); } }
      }
      this.tickStrips(dt);
      // cars on their way aim for you if they can see you, or where they think you are
      for (const u of this.units) {
        const c = u.car; if (!c.pursue) continue;
        c.target = this.seen ? null : { x: this.hunt.x || this.last.x, z: this.hunt.z || this.last.z };
        if (c.deployed || !c.ai) this.deploy(u);   // stopped by you (or knocked out of the chase): out they get
      }
    }
    // sirens follow their cars
    for (const u of this.units) { const c = u.car; if (c.sirenSfx) c.sirenSfx.set(Math.hypot(c.x - P.x, c.z - P.z), c.siren && c.active); }
    this.tickCops(dt); this.tickHeli(dt); this.tickWreck(dt);
    if (!this.heli && this.heliWaitNext > 0) { this.heliWaitNext -= dt; }
    if (!this.heli && this.level >= 3 && !(this.heliWaitNext > 0) && this.wreck !== undefined) this.heliWaitNext = 0;
    // busted: one star, no gun in your hand, a cop right there, and you've stopped
    if (this.level === 1 && !this.vehicles.driving && !this.armed()) {
      const close = this.cops.find((pd) => pd.active === "foot" && !pd.dead && Math.hypot(pd.h.group.position.x - P.x, pd.h.group.position.z - P.z) < 1.7);
      if (close && this.player.speed < 1.2) { this.busted += dt; if (this.busted > 1.3) { this.busted = 0; life.bust(); } } else this.busted = Math.max(0, this.busted - dt);
    } else this.busted = 0;
  }
  // take a pursuit car off the board (out of sight it simply goes; its crew is free again)
  recall(u) {
    const c = u.car; if (c.sirenSfx) { c.sirenSfx.stop(); c.sirenSfx = null; }
    c.active = false; c.pursue = false; this.traffic.hide(c); this.traffic.uncop(c); if (c.body) c.body.group.visible = false;
    for (const pd of u.cops) if (pd.active === "car") pd.active = false;
    this.units = this.units.filter((q) => q !== u);
  }
  /* spike strips: from three stars, when you're driving, a strip laid across the road ahead of
     you (a patrol car parked by it). Over it and the tyres go: the car slows and wanders */
  tickStrips(dt) {
    const car = this.vehicles.car;
    for (let i = this.strips.length - 1; i >= 0; i--) {
      const sp = this.strips[i]; sp.t -= dt;
      if (sp.t <= 0 || this.level < 3) { this.scene.remove(sp.mesh); this.strips.splice(i, 1); const u = sp.unit; if (u && u.car.active && !u.car.ai) { if (u.car.obb) { this.world.grid.remove(u.car.obb); u.car.obb = null; } this.recall(u); } continue; }
      // anything rolling over it
      const cars = (car ? [car] : []).concat(this.traffic.cars.filter((c) => c.active && c.ai && !c.cop));
      for (const c of cars) {
        if (c.flats) continue;
        const dx = c.x - sp.x, dz = c.z - sp.z, along = dx * sp.ux + dz * sp.uz, across = dx * sp.nx + dz * sp.nz;
        if (Math.abs(along) < sp.w / 2 + 0.6 && Math.abs(across) < 2.3) {
          c.flats = true; if (this.sfx.pop) { this.sfx.pop(Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z)); setTimeout(() => this.sfx.pop && this.sfx.pop(Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z)), 120); }
          if (this.fx) this.fx.sparks(new THREE.Vector3(c.x, 0.3, c.z), 18, new THREE.Vector3(0, 1, 0), 4, 0xffc070, 0.4);
          if (c === car && this.rig) this.rig.shake = Math.max(this.rig.shake, 0.5);
        }
      }
    }
    if (this.level < 3 || !car || Math.abs(car.speed) < 7 || this.strips.length >= 2) return;
    if ((this.stripT -= dt) > 0) return;
    this.stripT = 14 - this.level * 1.5;
    // a point on a lane 60-110 m ahead, roughly the way the car is pointed
    const fx = Math.sin(car.a), fz = Math.cos(car.a);
    let best = null, bs = Infinity;
    for (const l of this.traffic.lanes) for (let i = 1; i < l.pts.length - 1; i += 2) {
      const q = l.pts[i], dx = q.x - car.x, dz = q.z - car.z, d = Math.hypot(dx, dz);
      if (d < 60 || d > 110) continue; const c = (dx * fx + dz * fz) / d; if (c < 0.85) continue;
      const sc = Math.abs(d - 80) - c * 30; if (sc < bs) { bs = sc; best = { l, i }; }
    }
    if (!best) return;
    const l = best.l, q = l.pts[best.i], n = l.pts[best.i + 1], tx = n.x - q.x, tz = n.z - q.z, tl = Math.hypot(tx, tz) || 1;
    const nx = tx / tl, nz = tz / tl, ux = -nz, uz = nx, off = l.off || 2.5, w = (l.e ? l.e.w : off * 4) - 0.6;
    const cx = q.x - ux * off, cz = q.z - uz * off;   // the road's centre (lanes sit off it to the right)
    const mesh = new THREE.Group(), dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1c }), tooth = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    mesh.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.45), dark));
    for (let k = -w / 2 + 0.2; k < w / 2; k += 0.32) mesh.add(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4).translate(k, 0.08, 0), tooth));
    mesh.position.set(cx, this.world.heightAt(cx, cz) + 0.03, cz); mesh.rotation.y = Math.atan2(ux, uz) - Math.PI / 2; this.scene.add(mesh);
    this.strips.push({ mesh, x: cx, z: cz, ux, uz, nx, nz, w, t: 45 });
    // a patrol car pulled up on the kerb side, lights going
    const pc = this.traffic.spawnCop({ x: cx, z: cz }, null, { min: 0, max: 60 });
    if (pc) { pc.pursue = false; pc.ai = false; pc.siren = true; pc.speed = 0; const px = cx + ux * (w / 2 + 1.2) + nx * 3, pz = cz + uz * (w / 2 + 1.2) + nz * 3; pc.x = px; pc.z = pz; pc.a = Math.atan2(ux, uz); pc.y = this.world.heightAt(px, pz); this.traffic.place(pc); pc.obb = this.world.grid.obb(pc.x, pc.z, 0.95, 2.2, -pc.a, 1.5); const u = { car: pc, cops: [] }; this.units.push(u); this.strips[this.strips.length - 1].unit = u; }
    if (this.say && this.cops[0]) this.line("Deploying spikes!", this.cops[0]);
  }
  // things you can shoot that aren't people: the helicopter
  targets() {
    const h = this.heli; if (!h || !h.visible || h.crash) return [];
    return [{ c: h.position, r: 2.4, hit: (dmg, at) => this.heliHit(dmg, at) }];
  }
  heliHit(dmg, at) {
    const h = this.heli; if (!h || h.crash) return;
    h.hp -= dmg;
    if (this.fx) this.fx.sparks(at, 8, new THREE.Vector3(0, 1, 0), 4, 0xffc070, 0.3);
    if (this.sfx.punch) this.sfx.punch("car", Math.hypot(h.position.x - this.player.pos.x, h.position.z - this.player.pos.z));
    if (h.hp <= 0) {   // it's going down: the rotor winds down, it spins and drops
      h.crash = { vy: 0, spin: 0, smoke: 0 }; h.userData.beam.visible = false; h.userData.beam.userData.spot.visible = false;
      this.crime("copkill", { x: h.position.x, z: h.position.z });
      if (this.cops[0]) this.line(pick(SAY.heli), this.cops[0]);
    }
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
      } else if (pd.state === "board") {   // back in the car to chase you
        const c = pd.unit && pd.unit.car;
        if (!c || !c.active || c.wreck) { pd.state = "chase"; continue; }
        goal = { x: c.x, z: c.z }; speed = pd.run; face = Math.atan2(c.x - g.position.x, c.z - g.position.z);
        if (Math.hypot(c.x - g.position.x, c.z - g.position.z) < 2.4) {
          pd.active = "car"; g.visible = false; pd.gun.visible = false; if (pd.shotgun) pd.shotgun.visible = false;
          if (pd.unit.cops.every((q) => q.active !== "foot" || q.dead)) { if (c.obb) { this.world.grid.remove(c.obb); c.obb = null; } c.ai = true; c.pursue = true; c.siren = true; c.deployed = false; c.mode = "direct"; c.taken = false; c.speed = 0; c.stopT = 0; this.snapToLane(c); }
          continue;
        }
      } else {
        // you've got away from us on foot, or driven off: everyone back in the car
        const car0 = pd.unit && pd.unit.car;
        if (car0 && car0.active && !car0.wreck && (d > 38 || (driving && d > 14)) && Math.hypot(car0.x - g.position.x, car0.z - g.position.z) < 30) { for (const q of pd.unit.cops) if (q.active === "foot" && !q.dead) q.state = "board"; }
        const sees = this.world.grid.hit(A.set(g.position.x, g.position.y + 1.6, g.position.z), C.set(tx, P.y + 1.2, tz)).t >= 1;
        const arrest = this.level === 1 && !this.armed() && !driving;
        const keep = arrest ? 1.1 : lethal ? (sees ? (pd.arm === "shotgun" ? 5 : 9) + (pd.k % 3) : 2) : 3;
        if (d > keep) { goal = { x: tx, z: tz }; speed = d > 10 ? pd.run * 1.08 : pd.speed * 1.6; }
        aiming = !arrest && sees && d < 45;
        if (arrest && d < 4) this.line(pick(SAY.arrest), pd);
        // fire
        if (lethal && aiming) {
          pd.fireT -= dt;
          if (pd.fireT <= 0) { pd.fireT = pd.arm === "shotgun" ? 1.25 + Math.random() * 0.6 : 0.5 + Math.random() * 0.7 - this.level * 0.05; this.shoot(pd, d, !!driving); }
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
        const sg = pd.arm === "shotgun", gun = sg ? pd.shotgun : pd.gun; (sg ? pd.gun : pd.shotgun).visible = false;
        gun.position.copy(hand).addScaledVector(dir, sg ? -0.12 : 0.05); gun.lookAt(gun.position.clone().add(dir)); gun.visible = true;
        pd.muzzle = gun.position.clone().addScaledVector(dir, sg ? 0.85 : 0.18);
      }
    }
  }
  // a cop fires at you: the odds fall with distance, with you moving, and with you in a car
  shoot(pd, d, inCar) {
    const P = this.player.pos, m = pd.muzzle || pd.h.group.position.clone().setY(pd.h.group.position.y + 1.4);
    const sg = pd.arm === "shotgun";
    if (sg ? this.sfx.boom : this.sfx.shot) (sg ? this.sfx.boom : this.sfx.shot)(Math.hypot(m.x - P.x, m.z - P.z), 0);
    if (this.fx) { this.fx.puff(m, new THREE.Vector3(0, 0.3, 0), 0.25, 0.6, 0xb8b2a8, 0.3); this.fx.sparks(m, 3, new THREE.Vector3(Math.sin(pd.h.group.rotation.y), 0, Math.cos(pd.h.group.rotation.y)), 2, 0xffd080, 0.08); }
    if (Math.random() < 0.3) this.line(pick(SAY.shoot), pd);
    // a shotgun: murderous close, nothing much past 25 m
    const odds = sg ? (d < 25 ? 0.85 * (1 - d / 30) : 0.05) * (inCar ? 0.8 : 1) : 0.6 * Math.max(0.15, 1 - d / 55) * (this.player.speed > 3 ? 0.6 : 1) * (inCar ? 0.65 : 1);
    const dir = new THREE.Vector3(P.x - m.x, 0, P.z - m.z).normalize();
    if (Math.random() < odds) {
      if (inCar) { const c = this.vehicles.car; this.vehicles.hurt(c, sg ? 9 : 4); this.vehicles.impactCar(c, P.x - dir.x, P.z - dir.z, dir.x, dir.z, 3); if (Math.random() < 0.25) this.life.damage(5, { dir, force: 0 }); }
      else this.life.damage(sg ? 18 + 22 * Math.max(0, 1 - d / 25) : 8 + this.level * 1.5, { point: new THREE.Vector3(P.x, P.y + 1.2, P.z), dir, force: sg ? 6 * Math.max(0, 1 - d / 15) : 1.5, cause: "cop" });
    } else if (this.fx) {   // a miss: the round hits round you
      const q = new THREE.Vector3(P.x + (Math.random() - 0.5) * 3, 0, P.z + (Math.random() - 0.5) * 3); q.y = this.world.heightAt(q.x, q.z);
      this.fx.puff(q, new THREE.Vector3(0, 0.6, 0), 0.25, 0.6, 0x9a948a, 0.5); this.fx.sparks(q, 4, new THREE.Vector3(0, 1, 0), 2, 0xffb050, 0.15);
      if (this.sfx.impact) this.sfx.impact("hard", 2 + Math.random() * 3, 0);
    }
  }
  /* the helicopter: from three stars, circling with the light on you (a gunner leans out from
     four). Shoot it enough and it smokes, then the rotor winds down, it spins and falls and goes
     up where it hits. Another comes a while later if you're still wanted. */
  tickHeli(dt) {
    const want = this.level >= 3, P = this.player.pos;
    if (!this.heli && want && !(this.heliWaitNext > 0)) { this.heli = heliModel(); this.scene.add(this.heli); this.scene.add(this.heli.userData.beam); this.heli.visible = false; this.heliWait = 0; }
    const h = this.heli; if (!h) return;
    if (this.heliWait > 0) this.heliWait -= dt;
    if (want && !h.visible && this.heliWait <= 0) {
      h.visible = true; h.leave = false; h.crash = null; h.hp = HELI_HP; h.rotorSpeed = 28; h.rotation.set(0, 0, 0); h.userData.beam.visible = true;
      const a = Math.random() * 6.28; h.position.set(P.x + Math.cos(a) * 160, 60, P.z + Math.sin(a) * 160); this.heliA = a; this.gunT = 2;
      if (this.sfx.heli && !this.heliSfx) this.heliSfx = this.sfx.heli();
    }
    if (!h.visible) return;
    h.userData.rotor.rotation.y += dt * (h.rotorSpeed || 28);
    if (h.crash) return this.heliFall(h, dt);
    // smoking when hurt
    if (h.hp < HELI_HP * 0.45 && this.fx && Math.random() < dt * 14) this.fx.puff(h.position.clone().add(new THREE.Vector3(0, 0.6, -1)), new THREE.Vector3(0, 1.2, 0), 1.4, 1.6, h.hp < HELI_HP * 0.2 ? 0x2a2624 : 0x6a6660, 0.5);
    // it hunts too: it circles where they think you are, closer when it can see you
    const focus = this.seen ? P : (this.hunt.lengthSq() ? this.hunt : this.last);
    const tgt = h.leave ? new THREE.Vector3(h.position.x + Math.cos(this.heliA) * 50, 70, h.position.z + Math.sin(this.heliA) * 50) : (this.heliA += dt * 0.32, new THREE.Vector3(focus.x + Math.cos(this.heliA) * 32, 38, focus.z + Math.sin(this.heliA) * 32));
    const v = tgt.sub(h.position), dist = v.length(), mv = Math.min(dist, 26 * dt); h.position.addScaledVector(v.normalize(), mv);
    h.rotation.y = Math.atan2(v.x, v.z); h.rotation.z = Math.sin(this.t * 0.7) * 0.05; h.rotation.x = Math.min(0.25, dist / 200);
    const beam = h.userData.beam, aim = h.leave ? h.position.clone().setY(0) : new THREE.Vector3(focus.x, this.world.heightAt(focus.x, focus.z), focus.z);
    beam.position.copy(h.position).add(new THREE.Vector3(0, -1.2, 0));
    // the light stops at the first thing in its way: a roof or a wall takes it, not the street behind
    const blockT = this.world.grid.hit(beam.position, aim).t, blocked = blockT < 1; if (blocked) aim.lerpVectors(beam.position, aim, blockT);
    const len = beam.position.distanceTo(aim); beam.scale.set(0.9 * Math.max(0.15, len / 45), len, 0.9 * Math.max(0.15, len / 45));
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim.clone().sub(beam.position).normalize());
    const sp = beam.userData.spot; if (sp.parent !== this.scene) { beam.remove(sp); this.scene.add(sp); } sp.position.set(aim.x, aim.y + 0.12, aim.z); sp.visible = beam.visible && !blocked;
    if (this.heliSfx) this.heliSfx.set(Math.hypot(h.position.x - P.x, h.position.z - P.z), h.position.y);
    // the gunner, from four stars
    const hd = h.position.distanceTo(new THREE.Vector3(P.x, P.y + 1, P.z));
    if (this.level >= 4 && this.seen && !h.leave && (this.gunT -= dt) <= 0) {
      this.gunT = 1.1 + Math.random() * 0.8;
      if (this.sfx.shot) this.sfx.shot(Math.hypot(h.position.x - P.x, h.position.z - P.z), 0);
      if (this.fx) this.fx.sparks(h.position.clone().add(new THREE.Vector3(0, -0.8, 0)), 4, new THREE.Vector3(0, -1, 0), 2, 0xffd080, 0.1);
      const dir = new THREE.Vector3(P.x - h.position.x, 0, P.z - h.position.z).normalize();
      if (Math.random() < 0.32 * Math.max(0.2, 1 - hd / 90) * (this.player.speed > 3 ? 0.6 : 1)) { if (this.vehicles.car) this.vehicles.hurt(this.vehicles.car, 6); else this.life.damage(10, { point: new THREE.Vector3(P.x, P.y + 1.3, P.z), dir, force: 1, cause: "cop" }); }
      else if (this.fx) { const q = new THREE.Vector3(P.x + (Math.random() - 0.5) * 4, 0, P.z + (Math.random() - 0.5) * 4); q.y = this.world.heightAt(q.x, q.z); this.fx.puff(q, new THREE.Vector3(0, 0.6, 0), 0.25, 0.6, 0x9a948a, 0.5); }
    }
    if (h.leave && Math.hypot(h.position.x - P.x, h.position.z - P.z) > 260) { h.visible = false; beam.visible = false; beam.userData.spot.visible = false; if (this.heliSfx) { this.heliSfx.stop(); this.heliSfx = null; } }
  }
  heliFall(h, dt) {
    const k = h.crash, P = this.player.pos;
    h.rotorSpeed = Math.max(0, h.rotorSpeed - dt * 11);                  // the blades wind down
    k.spin = Math.min(5, k.spin + dt * 2.6); h.rotation.y += k.spin * dt;  // the tail's gone: it turns and turns
    h.rotation.z = Math.min(0.6, h.rotation.z + dt * 0.25); h.rotation.x = Math.min(0.5, h.rotation.x + dt * 0.2);
    k.vy -= 9.8 * dt * 0.75; h.position.y += k.vy * dt; h.position.x += Math.sin(h.rotation.y) * 3 * dt; h.position.z += Math.cos(h.rotation.y) * 3 * dt;
    if (this.fx && (k.smoke -= dt) <= 0) { k.smoke = 0.05; this.fx.puff(h.position.clone(), new THREE.Vector3(0, 1.5, 0), 1.8, 2.2, 0x1e1c1a, 0.65); if (Math.random() < 0.4) this.fx.sparks(h.position.clone(), 5, new THREE.Vector3(0, -1, 0), 3, 0xff9040, 0.3); }
    if (this.heliSfx) this.heliSfx.set(Math.hypot(h.position.x - P.x, h.position.z - P.z), h.position.y);
    const g = this.world.heightAt(h.position.x, h.position.z);
    if (h.position.y < g + 1.1) {   // impact
      h.position.y = g + 1.1; h.rotation.z = 0.5; h.rotorSpeed = 0;
      if (this.vehicles.blast) { this.vehicles.blast(h.position.x, g + 1, h.position.z, 1.8); setTimeout(() => this.vehicles.blast && this.vehicles.blast(h.position.x + 1.5, g + 1, h.position.z - 1, 1.1), 260); }
      if (this.heliSfx) { this.heliSfx.stop(); this.heliSfx = null; }
      h.crash = null; this.wreck = { h, t: 25 }; this.heli = null;            // the wreck burns where it lies; the next one is a new machine
      this.heliWaitNext = 30;
    }
  }
  tickWreck(dt) {
    const w = this.wreck; if (!w) return;
    w.t -= dt; if (this.fx && Math.random() < dt * 10) this.fx.puff(w.h.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2)), new THREE.Vector3(0, 2.2, 0), 2, 2.5, Math.random() < 0.4 ? 0xff7a30 : 0x2a2624, 0.55);
    if (w.t <= 0) { this.scene.remove(w.h); this.scene.remove(w.h.userData.beam); this.scene.remove(w.h.userData.beam.userData.spot); this.wreck = null; }
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
