/* Life at Hollis's place. Things to do at home, each a short cutscene played in the game itself:

   - brush her teeth at the bathroom basin (tap on, brush from the cup to her mouth, spit, rinse, back in the cup)
   - get ready by the door (jacket off the coat stand and on, a hand through her hair, the keys out of the bowl)
   - change clothes at the wardrobe (doors open, a hand through the hangers, a cut, the new outfit, doors shut)
   - and the TV on the sofa (interiors.js), which this only introduces

   The first time she walks in, a run-through: an establishing shot of the building from across the street,
   then a cut round each room, a notification saying what's there.

   Filmed like film: every shot is a camera on a tripod. It doesn't move; it pans and tilts a little, eases in
   and out of it, with a breath of handheld. Hard cuts between shots, letterbox bars, the HUD out of the way,
   the notifications in the help box.

   Her hands go where things are: a two-bone solve for each arm (shoulder and elbow from the hand's target, the
   elbow pointed by a pole), the props placed from the real hand each frame, so the brush is in the hand and the
   hand is at the mouth. Sounds: recorded (media/sfx, CC0), played in the room. */
import * as THREE from "three";
import { Body } from "./body.js?v=dev";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _pi = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// the wardrobe: what Hollis has to wear (proxies in assets/human)
const GRIP = { ax: "X", sR: 1, sL: 1 };   // which way the finger bones curl
const OUTFITS = [["male_casualsuit05", "Field jacket and jeans"], ["male_casualsuit03", "Striped shirt and jeans"], ["male_casualsuit06", "White tee and jeans"], ["female_casualsuit01", "Blue tee and jeans"],
  ["female_casualsuit02", "Tee and denim shorts"], ["male_casualsuit02", "Blue sweater and jeans"], ["female_sportsuit01", "Crop top and leggings"], ["female_elegantsuit01", "Blouse and skirt"], ["male_worksuit01", "Work overalls"], ["male_elegantsuit01", "Black suit"]];

export class HomeLife {
  constructor(o) {
    Object.assign(this, o);   // interiors, player, hud, sfx, camera
    this.cs = null; this.props = null;
    try { this.toured = localStorage.getItem("lowtide_home_tour") === "1"; } catch (e) { this.toured = false; }
  }
  get active() { return !!this.cs; }
  I() { return this.interiors.inside; }
  W(x, y, z) { const I = this.I(); return V(I.ox + x, y, I.oz + z); }   // room metres -> world

  /* ---------------- the room's moving parts: the brush, the keys, the jacket, the wardrobe doors ---------------- */
  dress(I, g) {
    if (I.kind !== "home") { this.props = null; return; }
    const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o }), P = {};
    const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.copy(this.W(x, y, z)); g.add(m); return m; };
    // the toothbrush: a handle with a grip and a head of bristles, standing in its cup
    const brush = new THREE.Group(); const hm = L("#e8506a");
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.15), hm); h1.position.z = -0.03; brush.add(h1);
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.006, 0.04), L("#f4f2ee")); h2.position.set(0, 0.007, 0.065); brush.add(h2);
    const h3 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.025), L("#9fd0e8")); h3.position.set(0, 0.012, 0.07); brush.add(h3);
    g.add(brush); P.brush = brush; P.brushHome = () => { brush.position.copy(this.W(10.29, 1.02, I.d - 0.24)); brush.rotation.set(-Math.PI / 2 + 0.25, 0, 0); };
    P.brushHome();
    // the keys, in the bowl
    const keys = new THREE.Group(); const k1 = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 10), L("#c9a14a")); keys.add(k1);
    const k2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.055), L("#c8c8cc")); k2.position.set(0.02, 0, 0.03); keys.add(k2);
    const k3 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.02), L("#2a2a2e")); k3.position.set(-0.025, 0, -0.02); keys.add(k3);
    g.add(keys); P.keys = keys; P.keysHome = () => { keys.position.copy(this.W(7.55, 0.93, 0.25)); keys.rotation.set(Math.PI / 2, 0, 0.4); keys.visible = true; };
    P.keysHome();
    // the jacket on the coat stand
    const jk = new THREE.Group(), jm = L("#3f4a36");   // her field jacket, olive
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 0.12), jm); body.position.y = -0.33; jk.add(body);
    for (const s of [-1, 1]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.55, 0.09), jm); sl.position.set(s * 0.21, -0.36, 0.01); sl.rotation.z = s * 0.06; jk.add(sl); }
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.13), L("#2e3628")); col.position.y = -0.03; jk.add(col);
    jk.position.copy(this.W(8.9, 1.62, 0.62)); jk.rotation.y = Math.PI; g.add(jk); P.jacket = jk;
    // the wardrobe's doors: hinged at the outside edges, opening into the room
    const dm = new THREE.MeshLambertMaterial({ color: "#7a5434" }), knob = L("#c9a14a"), doors = [];
    for (const [z0, sg] of [[6.55, 1], [8.2, -1]]) {
      const pivot = new THREE.Group(); pivot.position.copy(this.W(8.74, 0, z0)); g.add(pivot);
      const dw = 0.825, door = new THREE.Mesh(new THREE.BoxGeometry(0.025, 2.0, dw), dm); door.position.set(0, 1.1, sg * dw / 2); pivot.add(door);
      for (const y of [0.45, 1.75]) { const pn = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.55, dw - 0.16), L("#6a4428")); pn.position.set(0.014, y < 1 ? 0.55 : 1.55, sg * dw / 2); pivot.add(pn); }
      const kn = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.025), knob); kn.position.set(0.025, 1.05, sg * (dw - 0.06)); pivot.add(kn);
      doors.push([pivot, sg]);
    }
    P.doors = doors; P.door = (u) => { for (const [pv, sg] of doors) pv.rotation.y = sg * u * 1.3; };   // swinging out into the room
    this.props = P;
  }

  /* ---------------- what's near ---------------- */
  near() {
    const I = this.I(); if (!I || I.kind !== "home" || this.cs || !I.acts) return null;
    const P = this.player.pos; let best = null, bd = 0.95;
    for (const a of I.acts) if (a.type === "use") { const d = Math.hypot(P.x - (I.ox + a.x), P.z - (I.oz + a.z)); if (d < bd) { bd = d; best = a; } }
    return best;
  }
  entered(e) {   // the first time in: the tour
    if (!e || !e.home || this.toured || !this.props) return;
    this.toured = true; try { localStorage.setItem("lowtide_home_tour", "1"); } catch (err) { /* once a session, then */ }
    setTimeout(() => this.start("tour"), 450);
  }

  /* ---------------- the body ---------------- */
  rig() {   // her bones, through body.js (which puts back anything the clips don't drive, every frame)
    const m = this.player.model; if (!m) return null;
    const b = Body.of(m); if (!b || !b.ok) return null;
    this.body = b; this.B = b.B; this.Bm = m; return this.B;
  }
  turn(name, axLocal, ang) {   // a bone about an axis in her own frame (x right, y up, z forward)
    const b = this.B[name]; if (!b || !ang) return;
    _a.copy(axLocal).applyQuaternion(this.Bm.quaternion).normalize();
    b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_p); _pi.copy(_p).invert(); _q.setFromAxisAngle(_a, ang);
    b.quaternion.premultiply(_p).premultiply(_q).premultiply(_pi); b.updateMatrixWorld(true);
  }
  // point a bone so that the line from it to its child runs along dir (world)
  aim(bone, child, dir) {
    bone.updateWorldMatrix(true, true); const a = bone.getWorldPosition(_a), c = child.getWorldPosition(_b);
    const cur = c.sub(a).normalize(); if (cur.lengthSq() < 1e-6) return;
    _q.setFromUnitVectors(cur, _c.copy(dir).normalize());
    bone.parent.getWorldQuaternion(_p); _pi.copy(_p).invert();
    bone.quaternion.premultiply(_p).premultiply(_q).premultiply(_pi); bone.updateMatrixWorld(true);
  }
  // two-bone IK: the hand (wrist) to target, the elbow toward pole; w blends from the clip's pose
  reach(side, target, pole, w = 1) {
    if (w <= 0.001) return;
    const B = this.B, sh = B["upperarm01_" + side], el = B["lowerarm01_" + side], wr = B["wrist_" + side]; if (!sh || !el || !wr) return;
    this.Bm.updateMatrixWorld(true);
    const S = sh.getWorldPosition(new THREE.Vector3()), E = el.getWorldPosition(new THREE.Vector3()), Wr = wr.getWorldPosition(new THREE.Vector3());
    const a = S.distanceTo(E), b = E.distanceTo(Wr), T = Wr.clone().lerp(target, w);
    const d = T.clone().sub(S), c = THREE.MathUtils.clamp(d.length(), Math.abs(a - b) + 0.01, a + b - 0.002); d.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pl = pole.clone().sub(d.clone().multiplyScalar(pole.dot(d))).normalize();
    const Ed = S.clone().addScaledVector(d, a * cosA).addScaledVector(pl, a * sinA);
    this.aim(sh, el, Ed.sub(S));
    const E2 = el.getWorldPosition(new THREE.Vector3()); this.aim(el, wr, T.sub(E2));
  }
  hand(side) { const w = this.B["wrist_" + side], m = this.B["metacarpal2_" + side] || w; const p = w.getWorldPosition(new THREE.Vector3()), q = m.getWorldPosition(new THREE.Vector3()); return p.lerp(q, 1.6); }   // the palm, a little past the wrist
  head() { const h = this.B.head; return h.getWorldPosition(new THREE.Vector3()); }
  frame() { const y = this.player.yaw; return { f: V(Math.sin(y), 0, Math.cos(y)), r: V(-Math.cos(y), 0, Math.sin(y)), u: V(0, 1, 0) }; }
  mouth() { const { f } = this.frame(); return this.head().addScaledVector(f, 0.11).add(V(0, -0.055, 0)); }
  // fingers closed round something
  grip(side, k) {
    if (k <= 0) return; const G = window.__grip || GRIP, sg = side === "R" ? G.sR : G.sL;
    for (const n of [2, 3, 4, 5]) for (const j of [1, 2, 3]) { const b = this.B[`finger${n}-${j}_${side}`]; if (b) b["rotate" + G.ax](sg * (j === 1 ? 0.7 : 0.9) * k); }
    for (const j of [2, 3]) { const t = this.B[`finger1-${j}_${side}`]; if (t) t["rotate" + G.ax](sg * 0.35 * k); }
  }
  bend(k) { const X = V(1, 0, 0); this.turn("spine03", X, 0.18 * k); this.turn("spine02", X, 0.12 * k); this.turn("neck01", X, 0.1 * k); }
  // place a prop from a hand: at the palm, its long axis along dir (world), its up toward upHint
  holdAt(obj, side, dir, upHint, off = 0) {
    obj.position.copy(this.hand(side)).addScaledVector(dir.clone().normalize(), off);
    const m = new THREE.Matrix4(), z = dir.clone().normalize(), x = new THREE.Vector3().crossVectors(upHint, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    m.makeBasis(x, y, z); obj.quaternion.setFromRotationMatrix(m);
  }

  /* ---------------- the scenes ---------------- */
  start(kind) {
    const I = this.I(); if (!I || !this.props) return;
    const build = { brush: () => this.sBrush(), ready: () => this.sReady(), wardrobe: () => this.sWardrobe(), tour: () => this.sTour() }[kind];
    if (!build) return;
    if (this.cs) this.end();   // one scene at a time
    const S = build(); S.t = 0; S.kind = kind; S.fired = new Set(); this.cs = S;
    this.hud.root.classList.add("cine", "keephelp"); this.player.vel.set(0, 0, 0);
    this.player.speed = 0; if (this.player.wt) this.player.wt = [1, 0, 0];   // whatever she was doing (walking up to it), she's stopped
    if (S.at) { const [x, z, f] = S.at; this.player.pos.copy(this.W(x, 0, z)); this.player.yaw = f; }
    if (S.hide) this.player.model && (this.player.model.visible = false);
    if (S.skip) { this.skipEl = this.skipEl || Object.assign(document.createElement("div"), { className: "cs-skip" }); this.skipEl.innerHTML = "<kbd>Space</kbd> Skip"; this.hud.root.appendChild(this.skipEl); }
    this.flash(0.25);
  }
  end() {
    const S = this.cs; if (!S) return;
    for (const h of S.loops || []) h.stop(0.2);
    if (S.done) S.done();
    this.cs = null; this.hud.root.classList.remove("cine", "keephelp"); if (this.player.model) this.player.model.visible = true; this.player.speed = 0;
    if (this.menu) { this.menu.remove(); this.menu = null; }
    if (this.skipEl) this.skipEl.remove();
    this.flash(0.25);
  }
  flash(sec) { const f = this.interiors.fadeEl; f.classList.add("on"); setTimeout(() => f.classList.remove("on"), sec * 1000); }
  say(text, ms) { if (this.hud.notify) this.hud.notify(text, ms); else this.hud.tip(text, ms); }
  snd(name, o) { const h = this.sfx.sample ? this.sfx.sample(name, o) : { stop() {} }; if (o && o.loop && this.cs) (this.cs.loops || (this.cs.loops = [])).push(h); return h; }

  update(dt, input) {
    const S = this.cs; if (!S) return false;
    if (S.skip && (input.hit("Space") || input.hit("Enter"))) { this.end(); return true; }
    if (S.input) S.input(input);
    S.t += dt;
    for (const [t, fn, id] of S.cues || []) { const k = id || t; if (S.t >= t && !S.fired.has(k)) { S.fired.add(k); fn(); } }
    if (S.t >= S.dur) this.end();
    return true;
  }
  // after the clips: her body in the scene
  pose(dt) {
    const S = this.cs; if (!S || !this.rig()) return;
    if (S.move) S.move(S.t, dt);
    this.player.model.position.copy(this.player.pos); this.player.model.rotation.set(0, this.player.yaw, 0); this.player.model.updateMatrixWorld(true);
    this.body.reset();
    if (S.body) S.body(S.t, dt);
  }
  // after the follow camera: the shot
  cam(camera, dt) {
    const S = this.cs; if (!S) return;
    let t0 = 0, sh = S.shots[S.shots.length - 1];
    if (S.shotNow) { sh = S.shotNow; t0 = S.shotT0 || 0; }
    else for (const s of S.shots) { if (S.t < t0 + s.d) { sh = s; break; } t0 += s.d; }
    const u = ease(Math.min(1, (S.t - t0) / sh.d));
    const p = typeof sh.p === "function" ? sh.p() : sh.p, look = typeof sh.at === "function" ? sh.at() : sh.at;
    const dir = look.clone().sub(p), yaw0 = Math.atan2(dir.x, dir.z), pit0 = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    const n = S.t * 0.7 + t0 * 3.1, hy = (Math.sin(n * 1.3) * 0.6 + Math.sin(n * 2.9) * 0.4) * 0.0035, hp = (Math.sin(n * 1.7 + 2) * 0.6 + Math.sin(n * 3.3) * 0.4) * 0.0028;   // a breath of hand on the tripod
    const yaw = yaw0 + (sh.pan || 0) * (u - 0.5) + hy, pit = pit0 + (sh.tilt || 0) * (u - 0.5) + hp;
    camera.position.copy(p); camera.fov = sh.fov || 45; camera.updateProjectionMatrix();
    camera.lookAt(p.x + Math.sin(yaw) * Math.cos(pit), p.y + Math.sin(pit), p.z + Math.cos(yaw) * Math.cos(pit));
    if (sh.note && !S.noted?.has(sh)) { (S.noted || (S.noted = new Set())).add(sh); this.say(sh.note, sh.d * 1000 - 300); }
  }

  /* brushing her teeth: about ten seconds, three shots */
  sBrush() {
    const I = this.I(), d = I.d, P = this.props, cup = this.W(10.29, 1.0, d - 0.24), basin = this.W(10.65, 0.95, d - 0.3);
    const S = { at: [10.65, d - 1.05, 0], dur: 10.4 };
    S.shots = [
      { d: 3.4, p: this.W(9.85, 1.8, 7.9), at: this.W(10.65, 1.3, d - 0.6), pan: 0.08, tilt: 0.02, fov: 42 },
      { d: 3.4, p: this.W(9.7, 1.57, d - 0.95), at: this.W(10.65, 1.5, d - 0.92), pan: 0.05, tilt: -0.015, fov: 34 },
      { d: 3.6, p: this.W(11.25, 1.8, d - 1.42), at: this.W(10.6, 1.42, d - 0.3), pan: -0.06, tilt: 0.03, fov: 44 }
    ];
    let tap = null, br = null;
    S.cues = [[0.25, () => { tap = this.snd("tap", { vol: 0.5, dist: 1 }); }], [1.4, () => { br = this.snd("brush", { vol: 0.75, loop: true, fadeIn: 0.2 }); }],
      [6.6, () => { br && br.stop(0.25); tap && tap.stop(0.3); }], [6.95, () => this.snd("spit", { vol: 0.7 })], [7.4, () => { tap = this.snd("tap", { vol: 0.45 }); }],
      [9.2, () => { tap && tap.stop(0.4); }], [9.4, () => this.say("Teeth brushed. Minty, for the Keys.", 3000)]];
    S.body = (t) => {
      const { f, r, u } = this.frame(), pole = V(0, -0.8, 0).addScaledVector(r, 1).addScaledVector(f, -0.2), mouth = this.mouth(), grip = mouth.clone().addScaledVector(f, 0.1).addScaledVector(r, 0.07).add(V(0, -0.07, 0));
      // look at the mirror; lean over the basin to spit and rinse
      this.turn("head", V(1, 0, 0), 0.05 + 0.25 * seg(t, 6.4, 6.9) - 0.25 * seg(t, 8.6, 9.2));
      this.bend(seg(t, 6.4, 6.9) - seg(t, 8.6, 9.2) * 0.8);
      let tgt, w = 1;
      if (t < 0.7) { tgt = cup.clone(); w = seg(t, 0, 0.7); }
      else if (t < 1.5) tgt = cup.clone().lerp(grip, seg(t, 0.7, 1.5));
      else if (t < 6.4) { const k = Math.sin(t * 21), k2 = Math.sin(t * 6.3); tgt = grip.clone().addScaledVector(r, 0.025 * k).addScaledVector(u, 0.012 * k2); }   // brushing: side to side, a slow up and down
      else if (t < 7.6) tgt = grip.clone().lerp(basin.clone().add(V(0, 0.25, 0)), seg(t, 6.4, 7.0));
      else if (t < 8.4) tgt = basin.clone().add(V(0, 0.25, 0)).lerp(cup, seg(t, 7.6, 8.4));
      else { tgt = cup.clone(); w = 1 - seg(t, 8.4, 9.2); }
      this.reach("R", tgt, pole, w); this.grip("R", w);
      // the left hand rests on the basin's edge while she leans
      const lr = seg(t, 6.3, 6.8) - seg(t, 8.8, 9.3); this.reach("L", basin.clone().addScaledVector(r, -0.32).add(V(0, -0.04, -0.1)), V(0, -1, 0).addScaledVector(r, -0.7), lr);
      // the brush: in the cup, then in her hand, bristles to her mouth
      if (t > 0.65 && t < 8.35) { const toward = t < 6.4 ? mouth.clone().sub(this.hand("R")) : f.clone().add(V(0, -0.6, 0)); this.holdAt(P.brush, "R", toward.lengthSq() < 1e-4 ? f : toward, u, 0.055); }
      else P.brushHome();
    };
    S.done = () => P.brushHome();
    return S;
  }

  /* getting ready to go out: the jacket, the hair, the keys */
  sReady() {
    const P = this.props, hook = this.W(8.9, 1.55, 0.48), bowl = this.W(7.55, 0.95, 0.25);
    const S = { at: [8.15, 0.95, Math.PI], dur: 9.2 };
    S.shots = [
      { d: 3.0, p: this.W(5.6, 1.62, 2.9), at: this.W(8.3, 1.25, 0.45), pan: -0.08, tilt: 0.02, fov: 40 },
      { d: 3.2, p: this.W(6.85, 1.55, 1.95), at: this.W(8.15, 1.45, 0.75), pan: 0.06, tilt: -0.02, fov: 36 },
      { d: 3.0, p: this.W(9.6, 1.5, 2.4), at: this.W(7.9, 1.1, 0.45), pan: 0.05, tilt: -0.02, fov: 42 }
    ];
    S.cues = [[0.8, () => this.snd("clothes", { vol: 0.6 })], [1.5, () => { P.jacket.visible = false; this.snd("zipper", { vol: 0.55 }); this.wear(OUTFITS[0][0]); }], [2.6, () => this.snd("fabric", { vol: 0.5 })],
      [6.3, () => this.snd("keys", { vol: 0.7 })], [8.2, () => this.say("Ready. Jacket on, keys in the pocket.", 3200)]];
    S.body = (t) => {
      const { f, r, u } = this.frame(), poleR = V(0, -1, 0).addScaledVector(r, 0.8).addScaledVector(f, -0.2), poleL = V(0, -1, 0).addScaledVector(r, -0.8).addScaledVector(f, -0.2);
      // turn to the stand, take the jacket; shrug it on (both hands up behind the shoulders, then down the front)
      const toStand = seg(t, 0, 0.6) - seg(t, 1.3, 1.9); this.turn("spine04", V(0, 1, 0), -0.55 * toStand); this.turn("head", V(0, 1, 0), -0.4 * toStand);
      if (t < 1.5) { this.reach("R", hook, poleR, seg(t, 0.1, 0.8)); this.grip("R", seg(t, 0.6, 0.9)); }
      else if (t < 3.6) {
        const k = seg(t, 1.5, 2.1) - seg(t, 3.0, 3.6), sh = this.head().add(V(0, -0.2, 0));
        this.reach("R", sh.clone().addScaledVector(r, 0.22).addScaledVector(f, -0.12), poleR, k); this.reach("L", sh.clone().addScaledVector(r, -0.22).addScaledVector(f, -0.12), poleL, k);
        this.turn("spine03", V(1, 0, 0), -0.08 * k);   // chest out, shoulders back into the sleeves
      } else if (t < 5.6) {   // a hand through her hair
        this.turn("head", V(0, 1, 0), 0.25 * (seg(t, 3.6, 4.0) - seg(t, 5.2, 5.6))); this.turn("head", V(0, 0, 1), 0.08 * Math.sin(t * 3) * (seg(t, 3.8, 4.2) - seg(t, 5, 5.4)));
        const hair = this.head().add(V(0, 0.0, 0)).addScaledVector(r, -0.12).addScaledVector(f, 0.03 * Math.sin(t * 5));
        this.reach("L", hair, V(0, 0.2, 0).addScaledVector(r, -1).addScaledVector(f, 0.2), seg(t, 3.7, 4.2) - seg(t, 5.0, 5.5));
      } else {   // the keys: from the bowl to her pocket
        let tgt = bowl, w = seg(t, 5.6, 6.2);
        if (t > 6.4) { tgt = bowl.clone().lerp(this.player.pos.clone().add(V(0, 0.95, 0)).addScaledVector(r, 0.2), seg(t, 6.4, 7.2)); w = 1 - seg(t, 7.4, 8.0); }
        this.reach("R", tgt, poleR, w); this.grip("R", seg(t, 6.1, 6.4) * w);
        if (t > 6.3 && t < 7.4) { P.keys.visible = true; this.holdAt(P.keys, "R", f, u); } else if (t >= 7.4) P.keys.visible = false;
        this.turn("spine04", V(0, 1, 0), 0.35 * (seg(t, 5.5, 6.0) - seg(t, 7.0, 7.6)));
      }
    };
    S.done = () => { P.jacket.visible = true; P.keysHome(); };   // (next time she's in, they're back where she leaves them)
    return S;
  }

  /* the wardrobe: open it, then choose. She turns to face you with the doors open behind her; W/S (or the arrows)
     goes through what's on the rail, each change a fade out and back in on the new outfit, a look down at it; E wears
     it, Space puts back what she had on. Then she turns back and shuts the doors. */
  sWardrobe() {
    const P = this.props, start = this.currentOutfit();
    const S = { at: [9.3, 7.38, -Math.PI / 2], dur: Infinity, sel: start, start, phase: "open", look: -9 };
    // the camera's in the clear corner by the bathroom wall; she turns round to it, three-quarters on
    const yawPick = Math.atan2(11.3 - 9.3, 7.85 - 7.38) - 0.3, yaw0 = -Math.PI / 2, dYaw = Math.atan2(Math.sin(yawPick - yaw0), Math.cos(yawPick - yaw0));
    const shotOpen = { d: 2.8, p: this.W(11.25, 1.62, 7.95), at: this.W(8.7, 1.3, 7.2), pan: 0.05, tilt: -0.015, fov: 44 };
    const shotPick = { d: 600, p: this.W(11.3, 1.45, 7.85), at: this.W(9.46, 0.95, 6.78), pan: 0, tilt: 0, fov: 52 };   // aimed past her: she sits in the left third, clear of the menu
    S.shots = [shotOpen, shotPick];
    S.cues = [[0.35, () => this.snd("wardrobe_open", { vol: 0.6 })], [0.9, () => this.snd("hanger", { vol: 0.45 })], [2.8, () => { S.phase = "pick"; this.wardrobeMenu(S); }]];
    // a change: out to black, the new clothes, back in, and she looks herself over
    const show = (k) => {
      if (S.fading) { S.queued = k; return; }
      S.fading = true; const f = this.interiors.fadeEl; f.classList.add("on"); this.snd("clothes", { vol: 0.55 });
      setTimeout(() => { this.wear(OUTFITS[k][0]); this.snd("zipper", { vol: 0.35 }); setTimeout(() => { f.classList.remove("on"); S.look = S.t; S.fading = false; if (S.queued != null && S.queued !== k) { const q = S.queued; S.queued = null; show(q); } else S.queued = null; }, 90); }, 300);
    };
    const close = (cancel) => {
      if (S.phase !== "pick") return;
      if (cancel && S.sel !== S.start) { S.sel = S.start; show(S.start); }
      S.phase = "close"; S.closeT = S.t; S.shotNow = shotOpen; S.shotT0 = S.t - 0.3;
      if (this.menu) { this.menu.remove(); this.menu = null; }
      S.cues.push([S.t + 1.2, () => this.snd("wardrobe_close", { vol: 0.6 }), "close"], [S.t + 2.6, () => { this.say(cancel ? "Same as before, then." : `Wearing: ${OUTFITS[S.sel][1]}.`, 3200); this.end(); }, "end"]);
    };
    S.input = (input) => {
      if (S.phase !== "pick") return;
      let d = 0; if (input.hit("KeyW") || input.hit("ArrowUp") || input.hit("KeyA") || input.hit("ArrowLeft")) d = -1; if (input.hit("KeyS") || input.hit("ArrowDown") || input.hit("KeyD") || input.hit("ArrowRight")) d = 1;
      if (input.wheel) { d = Math.sign(input.wheel); input.wheel = 0; }
      if (d) { S.sel = (S.sel + d + OUTFITS.length) % OUTFITS.length; this.wardrobeMenu(S); show(S.sel); }
      if (input.hit("KeyE") || input.hit("Enter")) close(false);
      else if (input.hit("Space") || input.hit("Backspace")) close(true);
    };
    // she turns once to face you (with a step's worth of ease), and back again to shut it
    S.move = (t) => {
      const turnOut = seg(t, 1.55, 2.75), turnBack = S.phase === "close" ? seg(t - S.closeT, 0.0, 1.1) : 0;
      this.player.yaw = yaw0 + dYaw * (turnOut - turnBack);
    };
    S.body = (t) => {
      const { f, r } = this.frame(), B = this.body;
      const knobs = [this.W(8.78, 1.05, 6.55 + 0.825 - 0.06), this.W(8.78, 1.05, 8.2 - 0.825 + 0.06)];
      let open = seg(t, 0.3, 1.2), hk = seg(t, 0, 0.35) - seg(t, 0.9, 1.3);
      if (S.phase === "close") { const tc = t - S.closeT; open = 1 - seg(tc, 1.2, 2.1); hk = seg(tc, 0.95, 1.2) - seg(tc, 2.1, 2.4); }
      P.door(open);
      if (hk > 0.001) { B.arm("R", knobs[0], B.armPole("R"), hk); B.arm("L", knobs[1], B.armPole("L"), hk); B.grip("R", hk); B.grip("L", hk); }
      if (S.phase === "open" && t > 0.9 && t < 1.7) { const k = seg(t, 0.9, 1.15) - seg(t, 1.45, 1.7); B.arm("R", this.W(8.55, 1.55, 7.25 + 0.2 * Math.sin(t * 5)), B.armPole("R"), k); B.grip("R", k * 0.6); }   // a hand along the rail
      // a new outfit: a look down at it, hands out a little from her sides, then back up
      const lk = seg(t - S.look, 0, 0.45) - seg(t - S.look, 1.3, 1.9);
      if (lk > 0.001) { this.turn("neck01", V(1, 0, 0), 0.28 * lk); this.turn("head", V(1, 0, 0), 0.22 * lk); for (const sd of ["L", "R"]) { const sg = sd === "R" ? 1 : -1; this.turn("upperarm01_" + sd, V(0, 0, 1), -sg * 0.32 * lk); this.turn("upperarm01_" + sd, V(1, 0, 0), -0.12 * lk); } }
      if (S.phase === "pick") this.turn("spine04", V(0, 0, 1), 0.03 * Math.sin(t * 0.7));   // standing easy, the weight going side to side
    };
    S.done = () => P.door(0);
    return S;
  }
  wardrobeMenu(S) {
    if (!this.menu) {
      this.menu = document.createElement("div"); this.menu.className = "wardrobe-menu";
      this.menu.style.cssText = "position:absolute;right:5%;top:50%;translate:0 -50%;min-width:270px;background:rgba(7,9,12,.82);border-left:4px solid var(--gold,#e0b040);padding:16px 18px;font:600 15px/1.25 var(--fu,Arial);color:#F7F2EA;z-index:9";
      this.hud.root.appendChild(this.menu);
    }
    this.menu.innerHTML = `<div style="font:800 13px/1 var(--fd,Arial);letter-spacing:.16em;color:#e0b040;margin-bottom:12px">WARDROBE</div>` +
      OUTFITS.map((o, i) => `<div style="padding:7px 10px;margin:2px 0;${i === S.sel ? "background:rgba(224,176,64,.22);color:#fff" : "opacity:.72"}">${i === S.sel ? "\u25b8 " : ""}${o[1]}${i === S.start ? ' <span style="opacity:.6;font-size:12px">(on)</span>' : ""}</div>`).join("") +
      `<div style="margin-top:12px;font:600 12px/1.6 var(--fu,Arial);opacity:.85"><kbd>W</kbd> <kbd>S</kbd> Browse &nbsp; <kbd>E</kbd> Wear &nbsp; <kbd>Space</kbd> Cancel</div>`;
  }
  currentOutfit() { const h = this.player.human, id = h && h.p ? h.p.outfit : OUTFITS[0][0]; const k = OUTFITS.findIndex((o) => o[0] === id); return k < 0 ? 0 : k; }
  // dress her: the whole character refit (the clothes fitted to her body, the skin under them hidden), as the creator does
  wear(id) {
    const h = this.player.human; if (!h || !h.update || !h.p || h.p.outfit === id) return;
    try {
      const p = JSON.parse(JSON.stringify(h.p)); p.outfit = id; h.update(p, true);
      h.group.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
    } catch (e) { console.warn("Lowtide: the wardrobe couldn't change her", e); }   // (for this session: saving clothes belongs to the character editor)
  }

  /* the first time in: the building from across the street, then every room, what you can do there */
  sTour() {
    const I = this.I(), e = I.e, f = e.frame, d = I.d;
    const ext = (u, v, y) => V(f.ox + f.tx * u + f.nx * v, y, f.oz + f.tz * u + f.nz * v);   // the building's frame (v < 0: the street)
    const S = { hide: true, skip: true, dur: 0 };
    S.shots = [
      { d: 5.2, p: ext(e.door + 5.5, -15, 1.55), at: ext(e.door + 1, 0, 3.4), pan: -0.22, tilt: 0.06, fov: 46, note: "Home. Hollis's place, a ground-floor flat by the beach. It's on your map." },
      { d: 3.6, p: ext(e.door - 3.4, -6.5, 1.35), at: ext(e.door, 0, 1.7), pan: 0.1, tilt: 0.04, fov: 38 },
      { d: 4.4, p: this.W(4.7, 1.75, 0.55), at: this.W(1.4, 0.95, 3.6), pan: 0.14, tilt: -0.03, fov: 50, note: "Sit on the sofa to watch TV. {A} {D} changes the channel." },
      { d: 4.0, p: this.W(6.9, 1.7, 4.4), at: this.W(2.4, 1.05, 8.8), pan: -0.12, tilt: 0.02, fov: 48, note: "The kitchen. Mostly Tide Cola, some of it food." },
      { d: 4.2, p: this.W(9.85, 1.8, 7.75), at: this.W(10.7, 1.2, d - 0.4), pan: 0.08, tilt: -0.04, fov: 44, note: "Brush your teeth at the bathroom sink." },
      { d: 4.2, p: this.W(11.55, 1.65, 4.75), at: this.W(8.5, 1.15, 7.4), pan: -0.1, tilt: 0.02, fov: 46, note: "Change clothes at the wardrobe." },
      { d: 4.0, p: this.W(5.3, 1.62, 2.9), at: this.W(8.5, 1.25, 0.4), pan: 0.09, tilt: -0.02, fov: 44, note: "Get ready by the door: jacket on, keys." },
      { d: 4.4, p: this.W(9.0, 1.72, 3.7), at: this.W(11.8, 1.45, 1.9), pan: -0.08, tilt: 0.05, fov: 44, note: "The Ottoline case, pinned up. Everything she's got on it." }
    ];
    S.dur = S.shots.reduce((a, s) => a + s.d, 0);
    let t = 0; S.cues = S.shots.map((s, k) => { const at = t; t += s.d; return [at + 0.01, () => { if (k > 0) this.flash(0.06); }, "cut" + k]; });
    S.cues.push([5.2, () => { this.snd("door_open", { vol: 0.5 }); }, "door"], [5.2 + 3.4, () => this.snd("keys", { vol: 0.5 }), "keys"]);
    S.done = () => this.say("Press {E} near things at home to use them.", 4500);
    return S;
  }
}
