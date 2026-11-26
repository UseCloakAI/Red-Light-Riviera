/* People and cars: sitting at the wheel, getting in and out, pulling someone out of their car, throwing yourself
   out of a moving one. All of it is procedural on the real bodies (body.js): the hips are put where they need to be,
   the legs and arms are two-bone solves to real points on the car (the footwell, the wheel's rim, the door handle,
   the sill), and the door swings on its hinge with the hand that moves it.

   Getting in: walk to the door, a hand on the handle, the door pulled then swung wide as you step round it into the
   gap, turn, duck under the roof, the inside leg in first, the hips over the sill and down onto the seat, the other
   leg in, a hand out for the inside handle and the door pulled shut, hands to the wheel. Getting out is the same
   run backwards, and you push the door shut behind you. A carjack: the door yanked open, both hands in for the
   driver's collar, a step back with a twist that hauls them over the sill and slings them out onto the road (a
   ragdoll from there), and in. Bailing out: the door kicked open, a twist toward it and a dive, the car's speed and
   all (a ragdoll from there). At the wheel: hands on the rim at ten and two, turning with the steering, feet in the
   footwell, eyes on the road and into the bends; the dead slump over the wheel.

   Car frame: +z forward, +x the driver's side (the left). Everything here is in metres and seconds. */
import * as THREE from "three";
import { Body, ss } from "./body.js?v=dev";
import { buildModel } from "./carmodels.js?v=dev";

const _e = new THREE.Euler(0, 0, 0, "YXZ"), _M = new THREE.Matrix4(), _v = new THREE.Vector3();
const seg = (t, a, b) => ss(a, b, t);
const lerp = (a, b, k) => a + (b - a) * k;
const V3 = (a, b, k, out = new THREE.Vector3()) => out.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
// a point along a quadratic curve a -> b -> c
const Q = (a, b, c, t, out = new THREE.Vector3()) => { const u = 1 - t; return out.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z); };
// a foot lifted on its way from a to b
const step = (a, b, t, lift = 0.2, out = new THREE.Vector3()) => V3(a, b, t, out).add(_v.set(0, Math.sin(Math.PI * t) * lift, 0));
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/* a person to pose: a group, its mixer and clips */
export function person(g, mixer, act) { g.rotation.order = "YXZ"; return { g, mixer, act, body: Body.of(g), hs: null }; }
function clips(w, walk, dt) {
  const A = w.act; if (!A) return;
  for (const k in A) A[k].setEffectiveWeight(0);
  if (A.idle) A.idle.setEffectiveWeight(1 - walk); if (A.walk) { A.walk.setEffectiveWeight(walk); A.walk.timeScale = 1; }
  w.mixer.update(dt);
}

export class Seats {
  constructor({ fleet, world }) { this.fleet = fleet; this.world = world; }
  // the car's key points (car space)
  keys(c) {
    if (c._k && c._k.m === c.m) return c._k;
    const m = c.m, G = buildModel(m, 0), hw = m.W / 2, zD = G.zDoor, [sx, sy, sz] = m.seat, [wx, wy, wz] = m.wheelAt, floor = m.clear + 0.16, belt = m.cab.belt;
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    c._k = { m, G, hw, zD, zf: m.cab.zf, belt, sx, sy, sz, floor,
      S: P(sx, sy + 0.1, sz - 0.14), O: P(hw - 0.05, sy + 0.32, sz + 0.02),
      footL: P(sx + 0.12, floor, sz + 0.6), footR: P(sx - 0.1, floor, sz + 0.64),
      A: P(hw + 0.55, 0, zD - 0.32), Gp: P(hw + 0.46, 0, Math.min(zD + 0.32, sz + 0.2)), Out: P(hw + 0.8, 0, zD - 0.6),
      wheel: P(wx, wy, wz), roof: m.cab.roof };
    return c._k;
  }
  // car space to the world: on the body (moving on its springs), or on the ground beside it
  body(c, p, out = new THREE.Vector3()) { this.fleet.matrix(c, _M); return out.copy(p).applyMatrix4(_M); }
  ground(c, x, z, out = new THREE.Vector3()) {
    const sn = Math.sin(c.a), cs = Math.cos(c.a), wx = c.x + x * cs + z * sn, wz = c.z - x * sn + z * cs;
    return out.set(wx, this.world.heightAt(wx, wz), wz);
  }
  // the door handles at a given opening (outside, and the pull inside)
  handle(c, open, inner = false, out = new THREE.Vector3()) {
    const k = this.keys(c), hz = k.G.hinge.z, th = -open * 1.15;
    const lx = inner ? -0.1 : 0.03, lz = (inner ? k.zD + 0.42 : k.zD + 0.18) - hz, y = k.belt - (inner ? 0.1 : 0.12);
    const x = k.hw + lx * Math.cos(th) + lz * Math.sin(th), z = hz - lx * Math.sin(th) + lz * Math.cos(th);
    return this.body(c, _v.set(x, y, z), out);
  }
  // a point on the wheel's rim, at angle phi from the top (+ toward the left), in the world
  rim(c, phi, out = new THREE.Vector3()) {
    const k = this.keys(c), r = 0.17, x = Math.sin(phi) * r, y = Math.cos(phi) * r, ct = Math.cos(-0.42), st = Math.sin(-0.42);
    return this.body(c, _v.set(k.wheel.x + x, k.wheel.y + y * ct - 0.03, k.wheel.z + y * st - 0.045), out);
  }
  // the group's place and turn: on the car (moving with it, in its seat) by `inside`, or standing on the ground
  put(w, c, floor, yawLocal, inside) {
    w.g.position.copy(floor);
    _e.set(((c.pitch || 0) - (c.gp || 0)) * inside, c.a + yawLocal, ((c.roll || 0) + (c.gr || 0)) * inside);
    w.g.rotation.copy(_e); w.g.updateMatrixWorld(true);
  }

  /* at the wheel. o: { steer, dead, look (world point), react (0..1: hands up, a startled lean), dt } */
  drive(w, c, o = {}) {
    if (!w.body || !w.body.ok) return;
    clips(w, 0, o.dt || 0); w.body.reset();
    // headroom: each person in each model sits as low and leans back as far as it takes to clear the roof
    const k = this.keys(c), fit = this.fit(w, c), hip = this.body(c, _v.set(k.S.x, k.S.y - fit.down, k.S.z - fit.down * 0.4)), fl = this.body(c, _v.set(k.sx, k.floor - 0.1, k.sz - 0.1));
    this.put(w, c, fl, 0, 1);
    const st = Math.max(-1.5, Math.min(1.5, (o.steer || c.steer || 0) * 3.2));
    if (o.dead) {
      w.body.place({ hip, lean: 0.95, keepHead: -0.4, feet: { L: this.body(c, k.footL), R: this.body(c, k.footR) }, tilt: 0.35 });
      return;
    }
    const react = o.react || 0, hands = { L: this.rim(c, 1.05 + st), R: this.rim(c, -1.05 + st) };
    if (react > 0) { const face = this.body(c, _v.set(k.sx, k.sy + 0.75, k.sz + 0.1)); for (const s of ["L", "R"]) hands[s] = hands[s].clone().lerp(face.clone().add(_v.set(0, 0.1, 0)), react * 0.8); }
    const ahead = o.look || this.body(c, _v.set(st * 2.2, 1.2, 18));
    w.body.place({ hip, lean: -0.22 - fit.back - 0.15 * react, feet: { L: this.body(c, k.footL), R: this.body(c, k.footR) }, hands, grip: 0.85 * (1 - react),
      poles: { L: this.body(c, _v.set(k.sx + 0.9, k.sy - 0.4, k.sz - 0.3)).sub(hip), R: this.body(c, _v.set(k.sx - 0.9, k.sy - 0.4, k.sz - 0.3)).sub(hip) }, look: ahead, lookW: 0.8 });
  }

  // how much lower (and further back) this person sits in this car: measured once, on a seated pose
  fit(w, c) {
    const id = c.m.id; w.fits = w.fits || {}; if (w.fits[id]) return w.fits[id];
    const k = this.keys(c), f = { down: 0, back: 0 }; w.fits[id] = f;
    const M = this.fleet.matrix({ x: 0, z: 0, a: 0, y: 0 }, new THREE.Matrix4()), g = w.g, p0 = g.position.clone(), r0 = g.rotation.clone();
    g.position.set(k.sx, k.floor - 0.1, k.sz - 0.1); g.rotation.set(0, 0, 0); g.updateMatrixWorld(true);
    w.body.place({ hip: k.S.clone().applyMatrix4(M), lean: -0.22 });
    const top = w.body.pos("head").y + 0.16, room = k.roof - 0.06;
    if (top > room) { const over = top - room; f.down = Math.min(0.14, over * 0.6); f.back = Math.min(0.3, over * 1.4); }
    clips(w, 0, 0); w.body.reset(); g.position.copy(p0); g.rotation.copy(r0); g.updateMatrixWorld(true);
    return f;
  }
  // where this person's hips go on the seat (fitted to the roof)
  seatS(w, c) { const k = this.keys(c), f = this.fit(w, c); return new THREE.Vector3(k.S.x, k.S.y - f.down, k.S.z - f.down * 0.4); }
  /* an action in progress: { kind: "enter" | "exit" | "jack" | "bail", c, w (the person), t, victim, on... } */
  start(kind, w, c, opts = {}) {
    const a = Object.assign({ kind, c, w, t: 0, from: w.g.position.clone(), yaw0: w.g.rotation.y, done: false, fired: {} }, opts);
    a.T = kind === "enter" ? 2.15 : kind === "jack" ? 3.1 : kind === "exit" ? 1.65 : 0.34;
    if (w.body && w.body.ok && w.hs === null) { clips(w, 0, 0); w.body.reset(); w.hs = w.body.standHip(); }
    return a;
  }
  // advance and pose; returns false once it's over
  step(a, dt) {
    a.t += dt; const t = a.t, c = a.c;
    const fire = (k, at, fn) => { if (!a.fired[k] && t >= at) { a.fired[k] = true; fn(); } };
    if (a.kind === "enter" || a.kind === "jack") this.enterPose(a, t, fire, dt);
    else if (a.kind === "exit") this.exitPose(a, t, fire, dt);
    else this.bailPose(a, t, fire, dt);
    if (t >= a.T) { a.done = true; if (a.onDone) a.onDone(a); return false; }
    void c; return true;
  }
  enterPose(a, t, fire, dt) {
    const c = a.c, w = a.w, k = this.keys(c), B = w.body, hs = w.hs || 0.95, jack = a.kind === "jack";
    const J = jack ? 0.95 : 0;   // the carjack slots in after the door's open
    // where the feet stand, outside: the approach, then the gap by the open door
    const A = this.ground(c, k.A.x, k.A.z), Gp = this.ground(c, k.Gp.x, k.Gp.z);
    const toHandle = Math.atan2(-(k.A.x - k.hw), (k.zD + 0.18) - k.A.z);
    // 1. walk up to the handle
    const app = seg(t, 0, 0.35), walk = t < 0.35 ? Math.sin(Math.PI * Math.min(1, t / 0.35)) * 0.9 : 0;
    // 2. the door: pulled, then swung wide (yanked, for a carjack)
    const openT = jack ? seg(t, 0.36, 0.56) * 1.15 : seg(t, 0.42, 0.56) * 0.32 + seg(t, 0.58, 0.82) * 0.8;
    const closeK = seg(t, 1.72 + J, 1.95 + J);
    c.door = Math.max(0, openT * (1 - closeK * closeK));
    fire("click", 0.45, () => a.onSfx && a.onSfx("open"));
    fire("slam", 1.95 + J, () => a.onSfx && a.onSfx("close"));
    // 3. into the gap and turn to face the front (a carjack: face the driver first)
    const gap = seg(t, 0.56, 0.86);
    let floor = V3(V3(a.from, A, app, new THREE.Vector3()), Gp, gap);
    let yaw = angLerp(angLerp(a.yaw0 - c.a, toHandle, app), jack ? -Math.PI / 2 + 0.2 : 0, gap);
    let hipStand = floor.clone().add(_v.set(0, hs, 0)), lean = 0, twist = 0;
    const hands = {}, handW = { L: 0, R: 0 }, feet = {};
    // the hand on the handle while the door's opening
    const onHandle = seg(t, 0.3, 0.42) * (1 - seg(t, 0.8, 0.92));
    if (onHandle > 0) { hands.L = this.handle(c, c.door); handW.L = onHandle; }
    // 4. a carjack: both hands in for the collar, haul them out, sling them away
    if (jack && t > 0.8 && t < 0.8 + J + 0.2) {
      const reach = seg(t, 0.82, 1.02), pull = seg(t, 1.02, 1.62), recover = seg(t, 1.62, 1.75);
      const v = a.victim, vw = v && v.w;
      const collar = vw && vw.body.ok ? vw.body.pos("neck01") : this.body(c, _v.set(k.sx, k.sy + 0.6, k.sz));
      hands.L = collar.clone().add(_v.set(0, -0.08, 0)); hands.R = collar.clone().add(_v.set(0, -0.12, 0));
      handW.L = handW.R = reach * (1 - recover); lean = 0.35 * reach - 0.25 * pull * (1 - recover); twist = 1.1 * pull * (1 - recover);
      hipStand.add(this.dir(c, 0.15 * reach - 0.0 * pull, -0.25 * reach * (1 - pull)));
      floor.add(this.dir(c, 0.45 * pull * (1 - recover), -0.25 * pull * (1 - recover))); hipStand.add(this.dir(c, 0.45 * pull * (1 - recover), -0.25 * pull * (1 - recover)));
      yaw = angLerp(yaw, -Math.PI / 2 - 0.9 * pull, 1 - recover);
      if (v) this.victimPose(a, v, c, k, t, reach, pull, dt);
      fire("throw", 1.62, () => a.onThrow && a.onThrow(a));
      if (t > 1.62 + 0.13) yaw = angLerp(-Math.PI / 2 + 0.2, 0, seg(t, 1.62, 1.85));
    }
    // 5. in: duck, inside leg first, hips over the sill and down, the other leg in
    const t0 = 0.86 + J, inside = seg(t, t0 + 0.1, t0 + 0.6);
    const Sf = this.seatS(w, c), hipK = seg(t, t0 + 0.02, t0 + 0.68), hip = hipK < 1 ? Q(hipStand, this.body(c, k.O), this.body(c, Sf), hipK) : this.body(c, Sf);
    yaw = angLerp(yaw, 0, seg(t, t0, t0 + 0.3));
    lean += 0.5 * seg(t, t0 + 0.02, t0 + 0.25) * (1 - seg(t, t0 + 0.45, t0 + 0.7)) - (0.22 + this.fit(w, c).back) * seg(t, t0 + 0.45, t0 + 0.7);
    const fR0 = floor.clone().add(this.dir(c, -0.11, 0)), fL0 = floor.clone().add(this.dir(c, 0.11, 0));
    const rIn = seg(t, t0 + 0.03, t0 + 0.3), lIn = seg(t, t0 + 0.45, t0 + 0.72);
    feet.R = rIn > 0 ? step(fR0, this.body(c, k.footR), rIn, 0.28) : null; feet.L = lIn > 0 ? step(fL0, this.body(c, k.footL), lIn, 0.3) : (t > t0 ? fL0 : null);
    const fl = V3(floor, this.body(c, _v.set(k.sx, k.floor - 0.1, k.sz - 0.1)), inside);
    // hands: the right to the wheel, the left out for the door and back
    const toWheel = seg(t, t0 + 0.35, t0 + 0.65);
    if (toWheel > 0) { hands.R = this.rim(c, -1.05); handW.R = toWheel; }
    const grab = seg(t, t0 + 0.7, t0 + 0.84) * (1 - seg(t, 1.97 + J, 2.12 + J));
    if (grab > 0) { hands.L = this.handle(c, c.door, true); handW.L = grab; }
    const lw = seg(t, 1.97 + J, 2.13 + J); if (lw > 0) { hands.L = this.rim(c, 1.05); handW.L = lw; }
    if (t > t0 + 0.7 && grab <= 0 && lw <= 0) { hands.L = this.rim(c, 1.05); handW.L = 0.3; }
    // pose
    clips(w, walk, dt); B.reset();
    this.put(w, c, fl, yaw, inside);
    B.place({ hip: t < t0 ? hipStand : hip, hipW: t < 0.36 && !jack ? 0 : 1, lean, twist, feet: t >= t0 ? feet : null, hands, handW, grip: 0.7 });
  }
  // the driver being hauled out (a carjack)
  victimPose(a, v, c, k, t, reach, pull, dt) {
    const vw = v.w; if (!vw || !vw.body.ok) return;
    clips(vw, 0, dt); vw.body.reset();
    const S = this.body(c, this.seatS(vw, c)), O = this.body(c, k.O).add(_v.set(0, 0.12, 0)), out = this.ground(c, k.hw + 0.95, k.zD - 0.1).add(_v.set(0, 0.85, 0));
    const hip = pull < 1 ? Q(S, O, out, pull) : out;
    const inside = 1 - seg(t, 1.1, 1.5), yaw = angLerp(0, -Math.PI / 2 - 0.6, pull);
    this.put(vw, c, V3(this.body(c, _v.set(k.sx, k.floor - 0.1, k.sz - 0.1)), this.ground(c, k.hw + 0.9, k.zD), pull), yaw, inside);
    // their feet stay in the footwell until they're dragged clear, then trail
    const feet = { L: V3(this.body(c, k.footL), this.ground(c, k.hw + 0.4, k.zD + 0.25).add(_v.set(0, 0.1, 0)), seg(pull, 0.35, 1)), R: V3(this.body(c, k.footR), this.ground(c, k.hw + 0.3, k.zD + 0.45).add(_v.set(0, 0.15, 0)), seg(pull, 0.45, 1)) };
    // hands: up at first (startled), then clawing at whoever's got them
    const pw = a.w.body.ok ? { L: a.w.body.hand("L"), R: a.w.body.hand("R") } : null;
    const face = this.body(c, _v.set(k.sx, k.sy + 0.85, k.sz + 0.15));
    const hands = pw && reach > 0.6 ? { L: pw.R, R: pw.L } : { L: face.clone().add(this.dir(c, 0.12, 0)), R: face.clone().add(this.dir(c, -0.12, 0)) };
    vw.body.place({ hip, lean: 0.25 + 0.4 * pull, twist: -0.6 * pull, side: 0.25 * pull, feet, hands, handW: { L: 0.9, R: 0.9 }, grip: 0.6, look: a.w.g.position.clone().add(_v.set(0, 1.5, 0)) });
    v.place && v.place(vw.g.position);
  }
  exitPose(a, t, fire, dt) {
    const c = a.c, w = a.w, k = this.keys(c), B = w.body, hs = w.hs || 0.95;
    const Gp = this.ground(c, k.Gp.x, k.Gp.z), Out = this.ground(c, k.Out.x, k.Out.z);
    // the door: pushed open, later pushed shut from outside
    const open = seg(t, 0.28, 0.58) * 1.1, shut = seg(t, 1.32, 1.52);
    c.door = Math.max(0, open * (1 - shut * shut));
    fire("click", 0.3, () => a.onSfx && a.onSfx("open"));
    fire("slam", 1.52, () => a.onSfx && a.onSfx("close"));
    const hands = {}, handW = { L: 0, R: 0 };
    const onWheel = 1 - seg(t, 0, 0.2);
    hands.R = this.rim(c, -1.05); handW.R = 1 - seg(t, 0.5, 0.7);
    if (onWheel > 0) { hands.L = this.rim(c, 1.05); handW.L = onWheel; }
    const push = seg(t, 0.12, 0.28) * (1 - seg(t, 0.56, 0.68)); if (push > 0) { hands.L = this.handle(c, c.door, true); handW.L = push; }
    // out: the near leg first, the hips up over the sill, standing in the gap
    const hipK = seg(t, 0.55, 1.12), Sw = this.body(c, this.seatS(w, c)), Ow = this.body(c, k.O), Hs = Gp.clone().add(_v.set(0, hs, 0));
    const hip = Q(Sw, Ow, Hs, hipK);
    const inside = 1 - seg(t, 0.6, 1.05), lean = 0.45 * seg(t, 0.55, 0.75) * (1 - seg(t, 0.95, 1.15)) - (0.22 + this.fit(w, c).back) * (1 - seg(t, 0.5, 0.7));
    const fL1 = Gp.clone().add(this.dir(c, 0.12, 0.05)), fR1 = Gp.clone().add(this.dir(c, -0.1, 0.0));
    const feet = { L: step(this.body(c, k.footL), fL1, seg(t, 0.42, 0.72), 0.3), R: step(this.body(c, k.footR), fR1, seg(t, 0.86, 1.12), 0.3) };
    // then a step away and a turn, and the door pushed shut
    const away = seg(t, 1.12, 1.5), yaw = angLerp(0, Math.PI * 0.62, away);
    const floor = V3(V3(this.body(c, _v.set(k.sx, k.floor - 0.1, k.sz - 0.1)), Gp, 1 - inside), Out, away);
    const shove = seg(t, 1.18, 1.32) * (1 - seg(t, 1.5, 1.62)); if (shove > 0) { hands.R = this.handle(c, c.door).add(this.dir(c, 0.02, -0.25)); handW.R = shove; }
    clips(w, away > 0 && away < 1 ? Math.sin(Math.PI * away) * 0.8 : 0, dt); B.reset();
    this.put(w, c, floor, yaw, inside);
    B.place({ hip: away > 0 ? floor.clone().add(_v.set(0, hs, 0)) : hip, hipW: away > 0 ? 1 - away : 1, lean: away > 0 ? 0 : lean, feet: away > 0 ? null : feet, legW: 1 - away, hands, handW, grip: 0.6 });
  }
  bailPose(a, t, fire, dt) {
    const c = a.c, w = a.w, k = this.keys(c), B = w.body;
    const open = seg(t, 0.02, 0.12) * 0.25 + seg(t, 0.12, 0.26) * 0.65; c.door = Math.max(c.door || 0, open);
    fire("click", 0.04, () => a.onSfx && a.onSfx("open"));
    const go = seg(t, 0.06, 0.32), hip = V3(this.body(c, this.seatS(w, c)), this.body(c, _v.set(k.hw - 0.02, k.sy + 0.34, k.sz + 0.1)), go);
    clips(w, 0, dt); B.reset();
    this.put(w, c, this.body(c, _v.set(k.sx, k.floor - 0.1, k.sz - 0.1)), 0.9 * go, 1);
    B.place({ hip, lean: 0.55 * go, twist: 0.5 * go, feet: { L: this.body(c, k.footL), R: this.body(c, k.footR) }, legW: 1 - go * 0.6,
      hands: { L: this.handle(c, c.door, true), R: this.rim(c, -1.05) }, handW: { L: seg(t, 0, 0.08), R: 1 - go } });
    fire("launch", 0.3, () => a.onLaunch && a.onLaunch(a));
  }
  // a car-space direction (x, z) as a world vector
  dir(c, x, z) { const sn = Math.sin(c.a), cs = Math.cos(c.a); return new THREE.Vector3(x * cs + z * sn, 0, -x * sn + z * cs); }
}
