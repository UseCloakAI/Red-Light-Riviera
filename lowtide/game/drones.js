/* Five stars: the city turns on you.

   - A city-wide siren winds up and down over the whole island.
   - Police loudspeaker drones (blue and white, lights flashing, a searchlight under each) cruise the streets round
     you, broadcasting a wanted notice: who you are (as anyone would describe you: a woman or a man, about how old,
     the hair) and what you're wearing right now (change in the wardrobe and the description changes), and where
     you were last seen.
   - Strike drones: small, black, a warhead slung under them. One comes in high, finds you, and locks on: a red line
     on you and a beep that speeds up. Break the line (get under cover, or indoors) and it has to find you again.
     Then it dives at where you'll be. It steers all the way down until the last few metres: a sharp change of
     direction (or a dive behind something solid) right before it hits is how you live. It goes off where it lands.
     They can be shot down (they're small, and fast).

   Everything here goes away when the stars drop below five. */
import * as THREE from "three";

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const pick = (a) => a[(Math.random() * a.length) | 0];
const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

// what you're wearing, in words (the wardrobe's names, and the rest)
const OUTFIT = { male_casualsuit05: "a field jacket and jeans", male_casualsuit03: "a striped shirt and jeans", male_casualsuit06: "a white t-shirt and jeans", female_casualsuit01: "a blue t-shirt and jeans",
  female_casualsuit02: "a t-shirt and denim shorts", male_casualsuit02: "a blue sweater and jeans", female_sportsuit01: "a crop top and leggings", female_elegantsuit01: "a blouse and a skirt",
  male_worksuit01: "work overalls", male_elegantsuit01: "a black suit", male_casualsuit04: "a hooded top and jeans" };
const HAIR = { afro01: "an afro", bob01: "a bob", bob02: "a bob", braid01: "a braid", long01: "long hair", ponytail01: "a ponytail", short01: "short hair", short02: "short hair", short03: "short hair", short04: "cropped hair" };
function hairColour(hex) {
  const c = new THREE.Color(hex || "#2a1c14"), hsl = {}; c.getHSL(hsl);
  if (hsl.s < 0.12 && hsl.l > 0.6) return "white"; if (hsl.s < 0.12 && hsl.l > 0.35) return "grey";
  if (hsl.l < 0.1) return "black"; if (hsl.h < 0.05 && hsl.s > 0.4 && hsl.l > 0.2) return "red"; if (hsl.l < 0.22) return "dark brown"; if (hsl.l < 0.36) return "brown"; if (hsl.l < 0.5) return "light brown"; return "blond";
}
// a description anyone would give
export function describe(p) {
  if (!p) return "a woman in dark clothes";
  const woman = p.sex < 0.5, age = Math.round((p.age || 30) / 5) * 5, decade = age < 22 ? "about twenty" : age < 30 ? "in " + (woman ? "her" : "his") + " twenties" : age < 40 ? "in " + (woman ? "her" : "his") + " thirties" : age < 50 ? "in " + (woman ? "her" : "his") + " forties" : "about " + age;
  const col = hairColour(p.hairColor), hs = HAIR[p.hair] || "hair", hair = /^an? /.test(hs) ? "a " + col + " " + hs.replace(/^an? /, "") : col + " " + hs;   // "a black ponytail", "short brown hair"
  const clothes = OUTFIT[p.outfit] || "dark clothes", hat = p.hat ? ", and a fedora" : "";
  return `${woman ? "a woman" : "a man"} ${decade}, with ${hair}, wearing ${clothes}${hat}`;
}

/* ---------------- models ---------------- */
function rotors(g, arm, r, mat) {
  const list = [];
  for (const [x, z] of [[arm, arm], [-arm, arm], [arm, -arm], [-arm, -arm]]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, Math.hypot(x, z) * 1.02), mat); a.position.set(x / 2, 0, z / 2); a.rotation.y = Math.atan2(x, z); g.add(a);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6), mat); hub.position.set(x, 0.05, z); g.add(hub);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.01, 0.06), new THREE.MeshLambertMaterial({ color: 0x1a1a1c })); blade.position.set(x, 0.1, z); g.add(blade); list.push(blade);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.18, depthWrite: false })); disc.position.set(x, 0.11, z); g.add(disc);
  }
  return list;
}
function paDrone() {
  const g = new THREE.Group(), white = new THREE.MeshLambertMaterial({ color: 0xe8e6e0, flatShading: true }), navy = new THREE.MeshLambertMaterial({ color: 0x1d2a4a, flatShading: true });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 1.1), white));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 1.12), navy); stripe.position.y = 0.02; g.add(stripe);
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.08, 0.34, 8, 1, true).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2a2a2e, side: THREE.DoubleSide })); horn.position.set(0, -0.25, 0.4); horn.rotation.x = 0.5; g.add(horn);
  g.userData.blades = rotors(g, 0.85, 0.42, navy);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2030 })), blue = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: 0x2060ff }));
  red.position.set(0.25, 0.18, 0); blue.position.set(-0.25, 0.18, 0); g.add(red, blue); g.userData.lights = [red, blue];
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1, 14, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.userData.beam = beam; return g;
}
function strikeDrone() {
  const g = new THREE.Group(), black = new THREE.MeshLambertMaterial({ color: 0x18181a, flatShading: true });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.6), black));
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5a5a50 })); head.position.set(0, -0.15, 0.05); g.add(head);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd9a020 })); band.position.set(0, -0.15, 0.18); g.add(band);
  g.userData.blades = rotors(g, 0.42, 0.2, black);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xff1010 })); eye.position.set(0, 0, 0.31); g.add(eye); g.userData.eye = eye;
  return g;
}

export class Drones {
  constructor(o) {
    Object.assign(this, o);   // scene, world, player, police, vehicles, life, hud, sfx, say(text, dist), rig, root, low, describe()
    this.sfx = o.sfx || {}; this.on = false; this.pa = []; this.strikes = []; this.t = 0; this.annT = 4; this.spawnT = 6; this.k = 0;
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.85, depthWrite: false })); this.laser.frustumCulled = false; this.laser.visible = false; this.scene.add(this.laser);
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.8, depthWrite: false })); this.dot.visible = false; this.scene.add(this.dot);
    this.warn = document.createElement("div"); this.warn.className = "drone-warn"; this.warn.textContent = "DRONE LOCKED ON"; if (o.root) o.root.appendChild(this.warn);
  }
  get target() { const c = this.vehicles.car; return c ? _w.set(c.x, (c.y || 0) + 0.9, c.z) : _w.set(this.player.pos.x, this.player.pos.y + 1.0, this.player.pos.z); }
  get targetVel() { const c = this.vehicles.car; return c ? new THREE.Vector3(c.vx || 0, 0, c.vz || 0) : this.player.vel.clone().setY(0); }
  start() {
    this.on = true; this.annT = 3; this.spawnT = 7;
    this.siren = this.sfx.citySiren ? this.sfx.citySiren() : null; if (this.siren) this.siren.set(1);
    const P = this.player.pos;
    for (let i = 0; i < (this.low ? 2 : 3); i++) {
      const m = paDrone(), a = Math.random() * 6.28, r = 60 + Math.random() * 50; m.position.set(P.x + Math.cos(a) * r, 34 + Math.random() * 10, P.z + Math.sin(a) * r);
      this.scene.add(m); this.scene.add(m.userData.beam); this.pa.push({ m, goal: m.position.clone(), t: 0 });
    }
    if (this.say) this.say("All units: Code Five. Citywide alert. Drone support is authorised.", 0, true);
  }
  stop() {
    this.on = false; if (this.siren) { this.siren.stop(); this.siren = null; }
    for (const d of this.pa) d.leave = true;
    for (const s of this.strikes) s.leave = true;
    this.laser.visible = this.dot.visible = false; this.warn.classList.remove("on");
  }
  // a wanted notice: who, what, where
  announce(d) {
    const P = this.player.pos, v = this.targetVel, sp = Math.hypot(v.x, v.z), desc = this.describe ? this.describe() : "a woman";
    const street = this.police && this.police.streetAt ? this.police.streetAt(P.x, P.z) : "the street";
    const dir = sp > 2 ? DIRS[((Math.round(Math.atan2(v.x, -v.z) / (Math.PI / 4)) % 8) + 8) % 8] : null;
    const lines = [
      `Attention Marlowe Keys. An armed and dangerous suspect is at large: ${desc}. Last seen on ${street}. Do not approach. Stay indoors.`,
      `This is the Marlowe Keys Police Department. We are looking for ${desc}. ${dir ? `Heading ${dir} on ${street}.` : `Near ${street}.`} If you see this person, call 911.`,
      `Citywide alert. The suspect is ${desc}. Clear the streets. Lethal force is authorised.`,
      `${this.vehicles.car ? "The suspect is in a stolen vehicle. " : ""}Suspect: ${desc}. ${street}. All residents remain indoors.`
    ];
    const text = lines[this.k++ % lines.length], dist = d ? d.m.position.distanceTo(P) : 0;
    if (this.say) this.say(text, dist, false);
  }
  update(dt, indoors) {
    this.t += dt;
    const want = this.police.level >= 5 && !this.life.dead && !this.life.busted;
    if (want && !this.on) this.start(); else if (!want && this.on) this.stop();
    if (this.siren) this.siren.set(indoors ? 0.35 : 1);
    const P = this.player.pos;
    // the loudspeakers: wandering the streets round you, the notice on a loop
    for (let i = this.pa.length - 1; i >= 0; i--) {
      const d = this.pa[i], m = d.m; d.t -= dt;
      if (d.leave) { m.position.y += dt * 12; if (m.position.y > 120) { this.scene.remove(m); this.scene.remove(m.userData.beam); this.pa.splice(i, 1); } continue; }
      if (d.t <= 0 || m.position.distanceTo(d.goal) < 3) { const a = Math.random() * 6.28, r = 25 + Math.random() * 70; d.goal.set(P.x + Math.cos(a) * r, 28 + Math.random() * 12, P.z + Math.sin(a) * r); d.t = 14; }
      _v.copy(d.goal).sub(m.position); const dl = _v.length(); if (dl > 0.1) m.position.addScaledVector(_v, Math.min(1, 9 * dt / dl));
      m.position.y += Math.sin(this.t * 1.3 + i) * 0.01; m.rotation.y += (Math.atan2(_v.x, _v.z) - m.rotation.y) * Math.min(1, dt);
      this.animate(m, dt);
      const f = (this.t * 3 + i * 0.4) % 1; m.userData.lights[0].visible = f < 0.5; m.userData.lights[1].visible = f >= 0.5;
      const b = m.userData.beam; b.position.copy(m.position); const h = m.position.y - this.world.heightAt(m.position.x, m.position.z); b.scale.set(1, h, 1); b.rotation.set(Math.sin(this.t * 0.4 + i) * 0.25, 0, Math.cos(this.t * 0.3 + i) * 0.25);
    }
    if (this.on && (this.annT -= dt) <= 0) { this.annT = 26 + Math.random() * 8; let best = null, bd = Infinity; for (const d of this.pa) { const dd = d.m.position.distanceTo(P); if (dd < bd) { bd = dd; best = d; } } this.announce(best); }
    // strike drones
    if (this.on && !indoors && (this.spawnT -= dt) <= 0 && this.strikes.filter((s) => !s.leave).length < (this.low ? 2 : 3)) { this.spawnT = 8 + Math.random() * 6; this.spawn(); }
    let locked = false;
    for (let i = this.strikes.length - 1; i >= 0; i--) { const s = this.strikes[i]; if (this.stepStrike(s, dt, indoors)) locked = locked || s.state === "lock" || s.state === "tip"; else { this.scene.remove(s.m); if (s.whine) s.whine.stop(); this.strikes.splice(i, 1); } }
    this.warn.classList.toggle("on", locked);
    if (!locked) { this.laser.visible = false; this.dot.visible = false; }
  }
  animate(m, dt) { for (const b of m.userData.blades) b.rotation.y += dt * 40; }
  spawn() {
    const P = this.player.pos, cam = this.rig.cam, f = cam.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize();
    // from behind the camera's view, high up
    const a = Math.atan2(-f.x, -f.z) + (Math.random() - 0.5) * 1.6, r = 55 + Math.random() * 25, m = strikeDrone();
    m.position.set(P.x + Math.sin(a) * r, 45 + Math.random() * 10, P.z + Math.cos(a) * r); this.scene.add(m);
    this.strikes.push({ m, v: new THREE.Vector3(), state: "approach", t: 0, lockT: 0, beepT: 0, whine: this.sfx.whine ? this.sfx.whine() : null, hold: new THREE.Vector3() });
  }
  // false once it's gone
  stepStrike(s, dt, indoors) {
    const m = s.m, P = this.player.pos, T = this.target.clone(), W = this.world; s.t += dt; this.animate(m, dt);
    const dist = m.position.distanceTo(T), sp = s.v.length();
    if (s.whine) s.whine.set(sp, m.position.distanceTo(P));
    s.m.userData.eye.visible = s.state === "tip" || ((this.t * (s.state === "lock" ? 8 : 2)) % 1) < 0.5;
    if (s.leave || (indoors && s.state !== "dive")) {   // off: up and away
      if (s.leave) { s.v.y += dt * 6; m.position.addScaledVector(s.v, dt); return m.position.y < 140; }
      s.state = "approach"; s.lockT = 0;
    }
    const sees = () => W.grid.hit(m.position, T).t >= 1;
    if (s.state === "approach") {
      // to a spot above and to one side of you, out of reach
      if (s.hold.lengthSq() === 0 || s.t % 3 < dt) { const a = Math.random() * 6.28; s.hold.set(T.x + Math.cos(a) * 18, T.y + 20 + Math.random() * 6, T.z + Math.sin(a) * 18); }
      _v.copy(s.hold).sub(m.position); const dl = _v.length(); s.v.lerp(_v.normalize().multiplyScalar(Math.min(20, dl * 1.2)), Math.min(1, dt * 2)); m.position.addScaledVector(s.v, dt);
      if (dl < 4 && !indoors) { if (sees()) { s.state = "lock"; s.lockT = 0; } }
    } else if (s.state === "lock") {
      // holding, the red line on you; break the line and it has to find you again
      s.v.multiplyScalar(1 - Math.min(1, dt * 3)); m.position.addScaledVector(s.v, dt);
      if (!sees()) { s.lost = (s.lost || 0) + dt; if (s.lost > 0.6) { s.state = "approach"; s.lost = 0; s.lockT = Math.max(0, s.lockT - 1); } }
      else { s.lost = 0; s.lockT += dt; }
      const p = s.lockT / 2.4; s.beepT -= dt; if (s.beepT <= 0) { s.beepT = Math.max(0.07, 0.45 * (1 - p)); if (this.sfx.beep) this.sfx.beep(m.position.distanceTo(P), p > 0.75); }
      this.laser.visible = this.dot.visible = true; const pa = this.laser.geometry.attributes.position; pa.setXYZ(0, m.position.x, m.position.y - 0.15, m.position.z); pa.setXYZ(1, T.x, T.y, T.z); pa.needsUpdate = true;
      this.dot.position.set(T.x, W.heightAt(T.x, T.z) + 0.03, T.z);
      if (s.lockT >= 2.4) { s.state = "tip"; s.t = 0; if (this.sfx.beep) this.sfx.beep(0, true); }
    } else if (s.state === "tip") {
      // a beat as it noses over (the tell: get moving now)
      m.rotation.x = -Math.min(1, s.t / 0.4) * 1.1; this.laser.visible = this.dot.visible = true;
      const pa = this.laser.geometry.attributes.position; pa.setXYZ(0, m.position.x, m.position.y - 0.15, m.position.z); pa.setXYZ(1, T.x, T.y, T.z); pa.needsUpdate = true; this.dot.position.set(T.x, W.heightAt(T.x, T.z) + 0.03, T.z);
      if (s.t > 0.4) { s.state = "dive"; s.t = 0; }
      return true;
    } else if (s.state === "dive") {
      // at where you'll be, steering hard until the last few metres; then committed
      const tHit = dist / Math.max(12, sp), lead = this.targetVel.multiplyScalar(Math.min(1.1, tHit) * 0.85), aim = T.clone().add(lead);
      const wantDir = aim.sub(m.position).normalize(), cur = sp > 0.1 ? s.v.clone().normalize() : wantDir;
      if (dist > 16) { const turn = Math.min(1, dt * 2.4); cur.lerp(wantDir, turn).normalize(); }   // inside 16 m it's committed
      const speed = Math.min(30, Math.max(sp, 8) + dt * 36); s.v.copy(cur).multiplyScalar(speed);
      const prev = m.position.clone(); m.position.addScaledVector(s.v, dt);
      m.lookAt(m.position.clone().add(s.v));
      // it goes off: on you, on the ground, on a wall
      const gy = W.heightAt(m.position.x, m.position.z) + 0.3;
      const hitWall = W.grid.hit(prev, m.position).t < 1;
      if (m.position.distanceTo(this.target) < 1.3 || m.position.y < gy || hitWall || s.t > 6) { this.boom(m.position, 0.62); return false; }
      return true;
    }
    if (s.state !== "dive" && sp > 0.5) m.rotation.set(0, Math.atan2(s.v.x, s.v.z), 0);
    return true;
  }
  boom(at, harm) {
    if (this.vehicles.blast) this.vehicles.blast(at.x, at.y, at.z, 0.75, null, harm);
    if (this.rig) this.rig.shake = Math.max(this.rig.shake || 0, 1.2);
  }
  // things the guns can hit (weapons.js): every drone; a strike drone goes up at one round, a loudspeaker takes four
  targets() {
    const out = [];
    for (const s of this.strikes) if (!s.leave) out.push({ c: s.m.position, r: 0.55, hit: () => { const i = this.strikes.indexOf(s); if (i < 0) return; this.boom(s.m.position.clone(), 0.25); this.scene.remove(s.m); if (s.whine) s.whine.stop(); this.strikes.splice(i, 1); } });
    for (const d of this.pa) if (!d.leave) out.push({ c: d.m.position, r: 1.0, hit: () => { d.hp = (d.hp ?? 4) - 1; if (this.sfx.impact) this.sfx.impact("hard", d.m.position.distanceTo(this.player.pos), 0); if (d.hp <= 0) { const i = this.pa.indexOf(d); if (i < 0) return; this.boom(d.m.position.clone(), 0.3); this.scene.remove(d.m); this.scene.remove(d.m.userData.beam); this.pa.splice(i, 1); } } });
    return out;
  }
}
