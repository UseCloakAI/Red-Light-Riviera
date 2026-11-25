/* Stage 5: traffic. Marlowe Keys drives on the right.

   Every car is a little physical car (the same bicycle model as yours): it steers
   toward a point a few metres up its lane (pure pursuit, looking further ahead
   the faster it goes), so it follows the road's curves and swings wide or tight
   through turns like a driver would, and it can be knocked off line and find its
   way back. Speed comes from the Intelligent Driver Model, the standard model of
   human car-following: each driver has their own cruising speed, following gap,
   acceleration and braking, slows for bends, and brakes smoothly for whatever's
   ahead: the car in front, a red light, a queue, you, people in the road.

   Junctions: on the avenues the signals cycle (a green for each pair of roads,
   then a moment of all-red to clear the box). Elsewhere drivers take turns: they
   look for anyone already in the junction or arriving sooner, avenues before
   side streets, and go when there's a gap; a driver who's waited too long edges
   out. No queue-jamming, no clumping at the line.

   Drivers have a temperament (calm, hurried, aggressive): how fast they like to
   go, how close they follow, how long they'll sit behind something before they
   honk or pull out and pass it on the other side of the road (when it's clear),
   and whether they run an amber. A driver boxed in for too long backs up and
   tries again. Brake lights come on when they brake; they signal for turns and
   for passing.

   Panic: gunfire or an explosion nearby and drivers get out of there: quicker,
   through lights and right of way, but they still brake and swerve for people.
   The one person they won't stop for is whoever's doing the shooting.

   Cars are spawned evenly across the network out of sight round the player and
   recycled far behind; one stuck for a long time quietly leaves. They're
   instanced; a damaged one swaps to its own dented body (vehicles.js). */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { at } from "./city/roads.js?v=dev";

const POOL = 44, NEAR_SPAWN = 80, FAR_SPAWN = 190, RECYCLE = 245, WB = 2.6;
const CRUISE = { avenue: 13.5, ring: 8.5, street: 10, port: 8.5 };
const PHASE = 11, CLEAR = 2, AMBER = 2.6;   // green per group (its last seconds amber), all-red between
const STYLE = {   // v0, headway T, accel, patience (s) before honking or passing
  calm: [0.9, 1.4, 0.9, 5], hurried: [1.04, 1.0, 1.15, 3], aggro: [1.18, 0.75, 1.45, 1.4] };
const PAINTS = [0xC23B2A, 0x2F5D8C, 0xE8E2D6, 0x2a2a2e, 0x8a8d92, 0x3F7A4A, 0xD9A441, 0x6a2a4a, 0x7a9ab8, 0xa8a08a, 0x5a3a2a, 0xf0f0f0, 0xE0C030];
const _hid = new THREE.Matrix4().makeScale(0, 0, 0), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 0), UP = new THREE.Vector3(0, 1, 0), _c = new THREE.Color(), _ax = new THREE.Vector3();

function cumul(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return c; }
function path(pts, extra = {}) { const cum = cumul(pts); return { pts, cum, L: cum[cum.length - 1], ...extra }; }
function pointOn(w, s) {
  const { pts, cum } = w; s = Math.max(0, Math.min(w.L, s));
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, k = (s - cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
}
// along this path and on into the next, if there is one
function chainPoint(c, s) { return s <= c.w.L || !c.next ? pointOn(c.w, s) : pointOn(c.next, s - c.w.L); }
// how sharply the road bends over the next stretch (1/radius)
function bend(c, s, ahead) {
  const a = chainPoint(c, s), b = chainPoint(c, s + ahead);
  const t = Math.atan2(Math.sin(Math.atan2(b.dx, b.dz) - Math.atan2(a.dx, a.dz)), Math.cos(Math.atan2(b.dx, b.dz) - Math.atan2(a.dx, a.dz)));
  return Math.abs(t) / ahead;
}

export class Traffic {
  constructor(scene, world, opts = {}) {
    this.world = world; this.R = Math.random; this.t = 0; this.limit = opts.count || 18; this.sfx = opts.sfx || {}; this.onImpact = null; this.life = null;
    const roads = world.roads, N = Object.fromEntries(roads.nodes.map((n) => [n.id, n]));
    // lanes: one each way per road, on the right (roads.js's n points to the driver's right here), stop line to stop line
    this.lanes = [];
    for (const e of roads.edges) {
      // streets with parking: the travel lane sits inside the parked row, with room to pass it
      const A = N[e.a], B = N[e.b], off = e.kind === "street" && e.w >= 11 ? Math.min(e.w / 4, e.w / 2 - 3.4) : e.w / 4, s0 = A.deg > 1 ? A.r : 0, s1 = e.L - (B.deg > 1 ? B.r : 0);
      if (s1 - s0 < 4) continue;
      const fwd = [], back = [], n = Math.max(2, Math.ceil((s1 - s0) / 3));
      for (let i = 0; i <= n; i++) { const p = at(e.pl, s0 + (s1 - s0) * i / n); fwd.push({ x: p.x + p.nx * off, z: p.z + p.nz * off }); back.push({ x: p.x - p.nx * off, z: p.z - p.nz * off }); }
      back.reverse();
      const cruise = CRUISE[e.kind] || 10, major = e.kind === "avenue";
      this.lanes.push(path(fwd, { e, off, from: A, to: B, cruise, major, endIdx: B.ends.findIndex((d) => d.e === e && !d.start) }));
      this.lanes.push(path(back, { e, off, from: B, to: A, cruise, major, endIdx: A.ends.findIndex((d) => d.e === e && d.start) }));
    }
    for (const l of this.lanes) l.out = this.lanes.filter((m) => m.from === l.to && (m.e !== l.e || l.to.deg === 1));
    this.total = this.lanes.reduce((a, l) => a + l.L, 0);
    // the cars: instanced like the parked ones
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const geo = [mergeGeometries([new THREE.BoxGeometry(1.8, 0.62, 4.3).translate(0, 0.58, 0), new THREE.BoxGeometry(1.75, 0.2, 1.0).translate(0, 0.95, 1.55)]),
      new THREE.BoxGeometry(1.55, 0.55, 2.1).translate(0, 1.16, -0.25),
      mergeGeometries([[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]].map(([x, z]) => new THREE.CylinderGeometry(0.33, 0.33, 0.22, 8).rotateZ(Math.PI / 2).translate(x, 0.33, z)))];
    const mats = [L({ color: 0xffffff }), L({ color: 0x2a3644, emissive: 0x0c1218 }), L({ color: 0x18181a })];
    this.meshes = geo.map((g, k) => { const im = new THREE.InstancedMesh(g, mats[k], POOL); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); return im; });
    this.cars = [];
    for (let i = 0; i < POOL; i++) {
      const c = { i, meshes: this.meshes, active: false, ai: false, x: 0, z: 0, y: 0, a: 0, speed: 0, steer: 0, roll: 0, color: PAINTS[(this.R() * PAINTS.length) | 0], health: 100 };
      this.meshes[0].setColorAt(i, _c.set(c.color)); this.hide(c); this.cars.push(c);
    }
    this.meshes[0].instanceColor.needsUpdate = true;
    // lamps: headlights always on, tail lights that flare when braking, indicators that blink
    const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z), B = (o) => new THREE.MeshBasicMaterial(o);
    const lamp = (g, mat) => { const im = new THREE.InstancedMesh(g, mat, POOL); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < POOL; i++) im.setMatrixAt(i, _m.compose(_z, _q.identity(), _z)); scene.add(im); return im; };
    this.heads = lamp(mergeGeometries([box(0.38, 0.14, 0.05, -0.6, 0.72, 2.16), box(0.38, 0.14, 0.05, 0.6, 0.72, 2.16)]), B({ color: 0xfff2d0 }));
    this.tails = lamp(mergeGeometries([box(0.36, 0.13, 0.05, -0.62, 0.74, -2.16), box(0.36, 0.13, 0.05, 0.62, 0.74, -2.16)]), B({ color: 0xffffff }));
    for (let i = 0; i < POOL; i++) this.tails.setColorAt(i, _c.set(0x5a0a08));
    // driver's left is -x in the car's frame (+z forward, right = (-dz, dx) in the world)
    this.indL = lamp(mergeGeometries([box(0.12, 0.1, 0.06, 0.86, 0.72, 2.15), box(0.12, 0.1, 0.06, 0.86, 0.74, -2.15)]), B({ color: 0xffa020 }));
    this.indR = lamp(mergeGeometries([box(0.12, 0.1, 0.06, -0.86, 0.72, 2.15), box(0.12, 0.1, 0.06, -0.86, 0.74, -2.15)]), B({ color: 0xffa020 }));
    // police: a lightbar on the roof, red and blue taking turns
    this.barR = lamp(box(0.5, 0.12, 0.22, 0.3, 1.5, -0.25), B({ color: 0xff2030 }));
    this.barB = lamp(box(0.5, 0.12, 0.22, -0.3, 1.5, -0.25), B({ color: 0x2060ff }));
    this.barBase = lamp(box(1.25, 0.08, 0.26, 0, 1.45, -0.25), B({ color: 0x1a1a1a }));
    this.lampMeshes = [this.heads, this.tails, this.indL, this.indR, this.barR, this.barB, this.barBase]; this.threat = 0;
    this.signals = world.props ? world.props.signals : [];
  }
  hide(c) { _m.compose(_z, _q.identity(), _z); for (const im of this.meshes) im.setMatrixAt(c.i, _m); if (this.lampMeshes) for (const im of this.lampMeshes) im.setMatrixAt(c.i, _m); }
  place(c) {
    _q.setFromAxisAngle(UP, c.a + (c.bend || 0) * 0.5); _r.setFromAxisAngle(_ax.set(Math.cos(c.a), 0, -Math.sin(c.a)), (c.roll || 0) + (c.bend || 0)); _q.premultiply(_r);
    if (c.body) { c.body.group.position.set(c.x, c.y + (c.lift || 0), c.z); c.body.group.quaternion.copy(_q); if (this.lampMeshes) for (const im of this.lampMeshes) im.setMatrixAt(c.i, _hid); return; }
    _m.compose(_p.set(c.x, c.y + (c.lift || 0), c.z), _q, _s); for (const im of this.meshes) im.setMatrixAt(c.i, _m);
    if (!this.lampMeshes) return;
    const blink = (this.t * 1.6 + c.i * 0.13) % 1 < 0.5;
    this.heads.setMatrixAt(c.i, _m); this.tails.setMatrixAt(c.i, _m);
    this.tails.setColorAt(c.i, _c.set(c.brake ? 0xff2a18 : 0x6a0c0a));
    this.indL.setMatrixAt(c.i, c.ind < 0 && blink ? _m : _hid); this.indR.setMatrixAt(c.i, c.ind > 0 && blink ? _m : _hid);
    const flash = (this.t * 4.2 + c.i * 0.3) % 1;
    this.barBase.setMatrixAt(c.i, c.cop ? _m : _hid);
    this.barR.setMatrixAt(c.i, c.cop && (!c.siren || flash < 0.5) ? _m : _hid); this.barB.setMatrixAt(c.i, c.cop && (!c.siren || flash >= 0.5) ? _m : _hid);
  }
  // signals: two groups of roads take turns, with a moment of all-red between
  signalled(node) { return node.deg >= 3 && node.ends.some((d) => d.e.kind === "avenue"); }
  // seconds of green left for this approach (Infinity unsignalled, 0 red)
  greenLeft(node, endIdx) {
    if (!this.signalled(node)) return Infinity;
    const t = (this.t + node.x * 0.37 + 1000) % (2 * (PHASE + CLEAR));
    if (t < PHASE) return endIdx % 2 === 0 ? PHASE - t : 0;
    if (t >= PHASE + CLEAR && t < 2 * PHASE + CLEAR) return endIdx % 2 === 1 ? 2 * PHASE + CLEAR - t : 0;
    return 0;
  }
  green(node, endIdx) {
    if (!this.signalled(node)) return true;
    const t = (this.t + node.x * 0.37 + 1000) % (2 * (PHASE + CLEAR));
    if (t < PHASE) return endIdx % 2 === 0;
    if (t >= PHASE + CLEAR && t < 2 * PHASE + CLEAR) return endIdx % 2 === 1;
    return false;
  }
  driver(c) {   // everyone drives a little differently
    const R = this.R, r = R(); c.style = r < 0.12 ? "aggro" : r < 0.45 ? "hurried" : "calm";
    const k = STYLE[c.style];
    c.v0 = k[0] * (0.93 + R() * 0.14); c.T = k[1] * (0.9 + R() * 0.3); c.acc = (1.3 + R() * 0.9) * k[2]; c.brk = 2.4 + R() * 1.2; c.s0 = (c.style === "aggro" ? 1.4 : 2) + R() * 1.2;
    c.patience = k[3] * (0.8 + R() * 0.5);
    Object.assign(c, { off: 0, offT: 0, blocked: 0, rev: 0, brake: false, ind: 0, passing: null, nudge: 0 });
  }
  spawn(c, near) {
    for (let tries = 0; tries < 40; tries++) {
      // a lane picked by length, so cars spread evenly over the network
      let r = this.R() * this.total, l = this.lanes[0]; for (const m of this.lanes) { r -= m.L; if (r <= 0) { l = m; break; } }
      const s = this.R() * l.L, p = pointOn(l, s), d = Math.hypot(p.x - near.x, p.z - near.z);
      if (d < NEAR_SPAWN || d > FAR_SPAWN) continue;
      if (this.cars.some((o) => o.active && Math.hypot(o.x - p.x, o.z - p.z) < 22)) continue;
      Object.assign(c, { active: true, ai: true, w: l, next: null, s, x: p.x, z: p.z, y: this.world.heightAt(p.x, p.z), a: Math.atan2(p.dx, p.dz), speed: l.cruise * 0.7, steer: 0,
        wait: 0, still: 0, honk: 0, stun: 0, panic: 0, health: 100, wreck: false, go: false, bend: 0, lift: 0, taken: false });
      this.driver(c); this.uncop(c); c.flats = false;
      if (c.body) { c.body.group.visible = true; }
      return true;
    }
    return false;
  }
  // choose the street after the junction and lay the curve onto it
  chooseNext(c) {
    const l = c.w, outs = l.out; if (!outs.length) return null;
    const P = l.pts[l.pts.length - 1], P0 = l.pts[l.pts.length - 2], h = Math.atan2(P.x - P0.x, P.z - P0.z);
    const ws = outs.map((m) => { const d = Math.abs(Math.atan2(Math.sin(Math.atan2(m.pts[1].x - m.pts[0].x, m.pts[1].z - m.pts[0].z) - h), Math.cos(Math.atan2(m.pts[1].x - m.pts[0].x, m.pts[1].z - m.pts[0].z) - h))); return d < 0.5 ? 3 : d < 2.4 ? 1.2 : 0.15; });
    let r = this.R() * ws.reduce((a, b) => a + b, 0), k = 0; while (r > ws[k] && k < ws.length - 1) r -= ws[k++];
    const m = outs[k], Q = m.pts[0], Q1 = m.pts[1], t1 = { x: P.x - P0.x, z: P.z - P0.z }, t2 = { x: Q1.x - Q.x, z: Q1.z - Q.z };
    let C = null; const den = t1.x * t2.z - t1.z * t2.x;
    if (Math.abs(den) > 0.05) { const u = ((Q.x - P.x) * t2.z - (Q.z - P.z) * t2.x) / den; if (u > 0 && u < 60) C = { x: P.x + t1.x * u, z: P.z + t1.z * u }; }
    if (!C) C = { x: (P.x + Q.x) / 2 * 0.5 + l.to.x * 0.5, z: (P.z + Q.z) / 2 * 0.5 + l.to.z * 0.5 };
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, u = 1 - t; pts.push({ x: u * u * P.x + 2 * u * t * C.x + t * t * Q.x, z: u * u * P.z + 2 * u * t * C.z + t * t * Q.z }); }
    return path(pts, { lane: m, node: l.to, turn: true, cruise: Math.min(l.cruise, m.cruise), major: l.major });
  }
  // may this car go into the junction now?
  mayEnter(c, all) {
    const l = c.w, node = l.to, eta = (l.L - c.s) / Math.max(1, c.speed);
    if (c.panic > 0) return true;
    if (this.signalled(node)) {
      const left = this.greenLeft(node, l.endIdx);
      if (left <= 0) return false;
      // amber: stop if you comfortably can (the aggressive ones put their foot down instead)
      if (left < AMBER && c.style !== "aggro") { const dist = l.L - c.s; if (dist > c.speed * c.speed / 7 + 1.5) return false; }
      // green, but don't block the box: someone turning across us still in it
      for (const o of all) if (o !== c && o.active && o.w && o.w.turn && o.w.node === node && Math.hypot(o.x - node.x, o.z - node.z) < 8 && o.w.lane.e !== (c.next && c.next.lane.e)) return c.wait > 3;
      return true;
    }
    if (c.wait > 5) return true;   // edged out long enough
    for (const o of all) {
      if (o === c || !o.active || !o.w) continue;
      // already in the junction (and not leaving our way)
      if (o.w.turn && o.w.node === node && o.s < o.w.L * 0.8) return false;
      // arriving from another road sooner, or with priority
      if (!o.w.turn && o.w.to === node && o.w.e !== l.e && o.speed > 1) {
        const oe = (o.w.L - o.s) / Math.max(1, o.speed);
        if (oe < 4 && (oe < eta - 0.3 || (o.w.major && !l.major && oe < eta + 1.5))) return false;
      }
    }
    return true;
  }
  // everything a driver might brake for: other cars, yours, you, people in the road
  obstacles(player, vehicles, peds) {
    const o = [];
    for (const c of this.cars) if (c.active) o.push({ x: c.x, z: c.z, r: 1.1, v: c.speed, a: c.a, car: c });
    if (vehicles) for (const p of vehicles.cars) if (p !== vehicles.car && !p.ai && (p.obb || p.wreck)) o.push({ x: p.x, z: p.z, r: 1.1, v: 0, a: p.a, car: p });
    if (vehicles && vehicles.car) o.push({ x: vehicles.car.x, z: vehicles.car.z, r: 1.1, v: vehicles.car.speed, a: vehicles.car.a, player: true });
    else if (!(this.life && this.life.dead)) o.push({ x: player.pos.x, z: player.pos.z, r: 0.5, v: 0, player: true, foot: true, shooter: this.threat > 0 });
    if (peds) for (const pd of peds.peds) { if (pd.dead || !pd.h.group.visible) continue; const g = pd.h.group.position; if (this.world.mask.get(g.x, g.z) !== 1) o.push({ x: g.x, z: g.z, r: 0.5, v: 0, foot: true }); }
    return o;
  }
  // something frightening at (x, z): drivers within r panic
  // shooter: the player's the one shooting (drivers won't stop for them for a while)
  panic(x, z, r = 70, shooter = false) {
    if (shooter) this.threat = 10;
    for (const c of this.cars) if (c.active && c.ai && Math.hypot(c.x - x, c.z - z) < r) { c.panic = 10 + this.R() * 6; if (this.R() < 0.3 && this.sfx.horn) this.sfx.horn(Math.hypot(c.x - x, c.z - z)); }
  }

  update(dt, player, vehicles, peds) {
    this.t += dt;
    const P = player.pos, obs = this.obstacles(player, vehicles, peds), W = this.world;
    let n = 0; for (const c of this.cars) if (c.active && c.ai && !c.cop) n++;
    for (const c of this.cars) {
      if (c.active && c.ai && !c.pursue && (Math.hypot(c.x - P.x, c.z - P.z) > RECYCLE || (c.still > 18 && Math.hypot(c.x - P.x, c.z - P.z) > 60))) { c.active = false; this.hide(c); if (c.body) c.body.group.visible = false; if (c.cop) this.uncop(c); n--; }
      if (!c.active && !c.taken && !c.wreck && !c.cop && n < this.limit && this.spawn(c, P)) n++;
    }
    if (this.threat > 0) this.threat -= dt;
    this.sirens.length = 0; for (const c of this.cars) if (c.active && c.cop && c.siren && c.speed > 3) this.sirens.push(c);
    for (const c of this.cars) {
      if (!c.active || !c.ai) continue;
      if (c.stun > 0) {   // just been hit: sit there, then lean on the horn
        c.stun -= dt; c.speed *= 1 - Math.min(1, dt * 2.5); c.brake = true; c.ind = 0; this.move(c, dt, 0);
        if (c.stun <= 0 && this.sfx.horn) { const d = Math.hypot(c.x - P.x, c.z - P.z); this.sfx.horn(d); if (c.style !== "calm") setTimeout(() => this.sfx.horn(d), 380); }
        continue;
      }
      if (c.cop && c.pursue) { this.pursue(c, dt, P, vehicles); continue; }
      if (c.panic > 0) c.panic -= dt;
      const panic = c.panic > 0;
      // a siren behind us: slow down and pull over to the right until it's gone by
      if (!c.cop && this.sirens.length) { let y = false; for (const k of this.sirens) { const dx = c.x - k.x, dz = c.z - k.z; if (Math.abs(dx) < 40 && Math.abs(dz) < 40 && dx * Math.sin(k.a) + dz * Math.cos(k.a) > 0 && Math.hypot(dx, dz) < 38) { y = true; break; } } if (y) { c.yieldT = 2.5; } }
      // the next street, chosen in good time
      if (!c.w.turn && !c.next && c.w.L - c.s < 25) c.next = this.chooseNext(c);
      const fx = Math.sin(c.a), fz = Math.cos(c.a), rx = -fz, rz = fx;   // forward, and the driver's right
      // backing out of a jam: a short reverse with the wheel turned, then try again
      if (c.rev > 0) {
        c.rev -= dt; c.speed += (-2.2 - c.speed) * Math.min(1, dt * 3); c.brake = false; c.ind = 0;
        this.move(c, dt, c.revSteer); if (c.rev <= 0) { c.speed = 0; c.blocked = c.patience; c.still = 0; }
        continue;
      }
      // where we want to be across the road: our lane (0), or out to pass something (the other lane, to our left)
      c.off += (c.offT - c.off) * Math.min(1, dt * 1.6);
      // steering: pure pursuit on a point up the lane, shifted across by our offset
      const Ld = 2.8 + Math.abs(c.speed) * 0.32, T = chainPoint(c, c.s + Ld);
      const Tx = T.x - T.dz * c.off, Tz = T.z + T.dx * c.off;
      const tx = Tx - c.x, tz = Tz - c.z, alpha = Math.atan2(tx * fz - tz * fx, tx * fx + tz * fz);
      const want = Math.max(-0.6, Math.min(0.6, Math.atan(2 * WB * Math.sin(alpha) / Ld)));
      c.steer += (want - c.steer) * Math.min(1, dt * 6);
      // the speed we'd like: our own, less on bends and while passing, more when getting out of trouble
      const k = Math.max(bend(c, c.s, 12), bend(c, c.s + 8, 14));
      if (c.yieldT > 0) c.yieldT -= dt;
      let v0 = c.w.cruise * c.v0 * (panic ? 1.35 : 1) * (c.yieldT > 0 ? 0.35 : 1) * (c.flats ? 0.35 : 1); v0 = Math.min(v0, Math.sqrt(4.2 / Math.max(1e-3, k)) * (panic ? 1.2 : 1));
      // the leader: nearest thing ahead in the strip we're steering into
      const lc = c.offT - c.off;
      let gap = Infinity, lv = 0, byPlayer = false, lead = null, edge = 0;
      for (const o of obs) {
        if (o.car === c) continue;
        if (panic && o.foot && o.shooter) continue;   // fleeing: they'll go straight through whoever's shooting
        const dx = o.x - c.x, dz = o.z - c.z; if (Math.abs(dx) > 46 || Math.abs(dz) > 46) continue;
        const ahead = dx * fx + dz * fz; if (ahead <= 0 || ahead > 45) continue;
        // across the lane, measured from the lane itself at that distance (so curves and a crooked nose don't fool it)
        const Q = chainPoint(c, c.s + ahead), lat = (o.x - Q.x) * -Q.dz + (o.z - Q.z) * Q.dx;
        const want = c.off + lc * Math.min(1, ahead / 8), w = 0.95 + (o.car ? 0.95 : o.r) + 0.2;
        if (Math.abs(lat - want) < w) {
          const g = ahead - 2.2 - o.r - (o.car || (o.player && !o.foot) ? 2.2 : 0);
          if (g < gap) { gap = g; lv = o.v !== undefined && o.a !== undefined ? o.v * Math.cos(o.a - c.a) : 0; byPlayer = !!o.player; lead = o; }
        } else if (o.foot && ahead < 14 && Math.abs(lat - want) < w + 1.2) edge = lat > want ? -1 : 1;   // someone at the kerb edge: give them room
      }
      // the stop line, if we may not go
      let atLine = false;
      if (!c.w.turn) {
        const left = c.w.L - c.s;
        if (left < 30) {
          if (!c.go) c.go = this.mayEnter(c, this.cars);
          if (!c.go) { atLine = true; const g = left - 1; if (g < gap) { gap = g; lv = 0; byPlayer = false; lead = null; } if (c.speed < 0.4) c.wait += dt; }
        }
      }
      // in a queue (at the line, or behind someone who is): just wait
      const lc2 = lead && lead.car && lead.car.ai && lead.car.active ? lead.car : null;
      c.queued = atLine || !!(lc2 && lc2.queued && gap < 14) || !!(lc2 && lc2.w && lc2.w.turn);
      // passing: something standing still in our lane (a stalled car, a wreck, you), the other side clear for long enough
      const roomLeft = c.w.turn ? 0 : c.w.L - c.s;
      if (c.passing) {
        const q = c.passing, behind = (q.x - c.x) * fx + (q.z - c.z) * fz;
        if (behind < -5 || roomLeft < 12) { c.passing = null; c.offT = 0; }
      } else if (lead && !c.queued && Math.abs(lv) < 0.6 && gap < 16 && roomLeft > 35) {
        c.blocked += dt;
        if (c.blocked > c.patience) {
          const across = -2 * (c.w.off || 3);   // the oncoming lane's centre
          if (this.clear(c, across)) { c.passing = { x: lead.x, z: lead.z }; c.offT = across; c.blocked = 0; }
          else if (byPlayer || c.style !== "calm") { if (c.honk >= 0 && this.sfx.horn) { this.sfx.horn(Math.hypot(c.x - P.x, c.z - P.z)); c.honk = -3 - this.R() * 3; } }
        }
      } else { c.blocked = Math.max(0, c.blocked - dt * 2); }
      if (!c.passing) { c.nudge = edge ? 0.6 : Math.max(0, c.nudge - dt); c.offT = c.yieldT > 0 ? 1.3 : edge ? edge * 0.7 : (c.nudge > 0 ? c.offT : 0); }
      // Intelligent Driver Model
      const v = c.speed, dv = v - lv, sStar = c.s0 + Math.max(0, v * c.T + v * dv / (2 * Math.sqrt(c.acc * c.brk)));
      let acc = c.acc * (panic ? 1.6 : 1) * (1 - Math.pow(Math.max(0, v) / Math.max(0.1, v0), 4) - (gap < Infinity ? (sStar / Math.max(0.1, gap)) ** 2 : 0));
      acc = Math.max(-9, Math.min(c.acc * (panic ? 1.6 : 1), acc));
      c.speed = Math.max(0, c.speed + acc * dt);
      c.brake = acc < -0.8 || c.speed < 0.3;
      // the horn: stuck behind you on foot or in a car
      if (byPlayer && c.speed < 0.4 && gap < 8) { c.honk += dt; if (c.honk > c.patience * 0.6) { c.honk = -4 - this.R() * 3; if (this.sfx.horn) this.sfx.horn(Math.hypot(c.x - P.x, c.z - P.z)); } } else if (c.honk > 0) c.honk = 0;
      if (c.honk < 0) c.honk = Math.min(0, c.honk + dt);
      c.still = c.speed < 0.3 && !atLine ? c.still + dt : 0;
      // boxed in (nose against something, nothing moving): back up and have another go
      if (c.still > 7 && lead && gap < 3 && !panic && !c.queued && !(lc2 && lc2.speed > 0.5)) { c.rev = 1.3 + this.R() * 0.6; c.revSteer = (this.R() < 0.5 ? -1 : 1) * 0.5; c.still = 0; }
      // indicators: the way the next street turns, from 30 m out; left while pulling out to pass
      c.ind = c.passing ? -1 : this.turnSign(c);
      this.move(c, dt, c.steer);
      // progress along the path: how far we actually went toward it
      c.s += Math.max(0, c.speed * dt * Math.cos(Math.min(1.2, Math.abs(alpha))));
      if (c.s >= c.w.L) {
        const over = c.s - c.w.L;
        if (c.w.turn) { c.w = c.w.lane; c.next = null; c.go = false; c.wait = 0; c.s = over; }
        else { const nx = c.next || this.chooseNext(c); if (!nx) { c.active = false; this.hide(c); continue; } c.w = nx; c.next = null; c.s = over; c.passing = null; c.offT = 0; }
      }
      // running people down (a driver who's braking won't, unless they can't stop in time)
      if (c.speed > 2.5) this.runOver(c, peds, vehicles, P);
    }
    // cars bumping each other (it happens in a panic): push apart, damage by closing speed
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i]; if (!a.active || !a.ai) continue;
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j]; if (!b.active || Math.abs(a.x - b.x) > 5 || Math.abs(a.z - b.z) > 5) continue;
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), m = 2.4 - d;
        if (m > 0 && d > 1e-4) {
          a.x += dx / d * m * 0.5; a.z += dz / d * m * 0.5; b.x -= dx / d * m * 0.5; b.z -= dz / d * m * 0.5;
          const rel = Math.abs(a.speed - b.speed * Math.cos(a.a - b.a));
          if (rel > 6 && this.onImpact) { this.onImpact(a, (a.x + b.x) / 2, (a.z + b.z) / 2, -dx / d, -dz / d, rel); this.onImpact(b, (a.x + b.x) / 2, (a.z + b.z) / 2, dx / d, dz / d, rel); }
          const sp = Math.min(a.speed, b.speed); a.speed = sp * 0.6; b.speed = sp * 0.6;
        }
      }
    }
    this.lights(dt);
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
    for (const im of this.lampMeshes) im.instanceMatrix.needsUpdate = true;
    this.tails.instanceColor.needsUpdate = true;
  }
  // the bicycle model, and out of anything solid
  move(c, dt, steer) {
    const W = this.world, yawRate = c.speed / WB * Math.tan(steer);
    c.a += yawRate * dt;
    const fx = Math.sin(c.a), fz = Math.cos(c.a);
    c.x += fx * c.speed * dt; c.z += fz * c.speed * dt;
    let hit = 0, hx = 0, hz = 0;
    for (const k of [1.45, 0, -1.45]) {
      const q = { x: c.x + fx * k, z: c.z + fz * k }, bx = q.x, bz = q.z;
      W.grid.resolve(q, 0.95, c.y + 0.3, 1.2);
      const dx = q.x - bx, dz = q.z - bz; if (dx || dz) { c.x += dx; c.z += dz; const l = Math.hypot(dx, dz); if (l > hit) { hit = l; hx = -dx / l; hz = -dz / l; } }
    }
    if (hit > 0.02 && c.speed > 3 && this.onImpact) this.onImpact(c, c.x + hx * 1.5, c.z + hz * 1.5, hx, hz, c.speed);
    if (hit > 0.02) c.speed *= 0.5;
    c.y += (W.heightAt(c.x, c.z) - c.y) * Math.min(1, dt * 12);
    c.roll += (-yawRate * c.speed * 0.01 - c.roll) * Math.min(1, dt * 5);
    this.place(c);
  }
  runOver(c, peds, vehicles, P = { x: c.x, z: c.z }) {
    const fx = Math.sin(c.a), fz = Math.cos(c.a), co = Math.cos(c.a), sn = Math.sin(c.a);
    const inside = (x, z) => { const rx = x - c.x, rz = z - c.z, lx = rx * co - rz * sn, lz = rx * sn + rz * co; return Math.abs(lx) < 1.15 && lz > -2.3 && lz < 2.6; };
    if (peds) for (const pd of peds.peds) {
      if (pd.dead || !pd.h.group.visible) continue; const g = pd.h.group.position;
      if (!inside(g.x, g.z)) continue;
      // one hit per car per person, not one a frame while they're still under the bumper
      if (pd.hitBy === c && this.t - pd.hitT < 1.5) continue; pd.hitBy = c; pd.hitT = this.t;
      const far = Math.hypot(g.x - P.x, g.z - P.z);
      // a calm driver rolling slowly only nudges someone; it takes speed (or panic) to really hit them
      if (c.ai && !(c.panic > 0) && c.speed < 4.5) { c.speed = 0; if (peds.bump) peds.bump(pd, c.x, c.z); continue; }
      peds.damage(pd, { point: new THREE.Vector3(g.x, g.y + 0.9, g.z), dir: new THREE.Vector3(fx, 0.35, fz).normalize(), damage: c.speed * 10, from: { x: c.x, z: c.z }, force: Math.min(10, c.speed * 0.75) });
      c.speed *= 0.9; if (this.sfx.impact) this.sfx.impact("flesh", far, 0); peds.alarm(c.x, c.z, 30, true, "car");
    }
    const L = this.life;
    if (L && !L.dead && !(vehicles && vehicles.driving) && inside(L.player.pos.x, L.player.pos.z) && L.iframes <= 0) {
      L.damage(c.speed * 7.5, { point: L.player.pos.clone().setY(L.player.pos.y + 1), dir: new THREE.Vector3(fx, 0.4, fz).normalize(), force: Math.min(10, c.speed * 0.8), cause: "car" });
      L.iframes = Math.max(L.iframes, 0.6); c.speed *= 0.85; if (this.sfx.impact) this.sfx.impact("flesh", 0, 0);
    }
  }
  /* ---- police cars ---- */
  get sirens() { return this._sir || (this._sir = []); }
  uncop(c) { c.cop = false; c.pursue = false; c.siren = false; c.deployed = false; c.target = null; c.yieldT = 0; this.meshes[0].setColorAt(c.i, _c.set(c.color)); this.meshes[0].instanceColor.needsUpdate = true; }
  // a patrol car out of sight around `near`, sent after `target` ({x, z}); returns the car or null
  spawnCop(near, target, opt = {}) {
    const lo = opt.min ?? 70, hi = opt.max ?? 140;
    const c = this.cars.find((k) => !k.active && !k.taken && !k.wreck); if (!c) return null;
    for (let tries = 0; tries < 60; tries++) {
      let r = this.R() * this.total, l = this.lanes[0]; for (const m of this.lanes) { r -= m.L; if (r <= 0) { l = m; break; } }
      const s = this.R() * l.L, p = pointOn(l, s), d = Math.hypot(p.x - near.x, p.z - near.z);
      if (d < lo || d > hi || (opt.ok && tries < 45 && !opt.ok(p))) continue;
      if (this.cars.some((o) => o.active && Math.hypot(o.x - p.x, o.z - p.z) < 12)) continue;
      Object.assign(c, { active: true, ai: true, w: l, next: null, s, x: p.x, z: p.z, y: this.world.heightAt(p.x, p.z), a: Math.atan2(p.dx, p.dz), speed: 6, steer: 0,
        wait: 0, still: 0, honk: 0, stun: 0, panic: 0, health: 100, wreck: false, go: false, bend: 0, lift: 0, taken: false });
      this.driver(c); c.v0 = 1.2; c.patience = 0.6;
      Object.assign(c, { cop: true, pursue: true, siren: true, deployed: false, target, mode: "road" });
      this.meshes[0].setColorAt(c.i, _c.set(0x16181d)); this.meshes[0].instanceColor.needsUpdate = true;
      if (c.body) c.body.group.visible = true;
      return c;
    }
    return null;
  }
  // back onto the nearest lane (after cutting across to you)
  snapCop(c) {
    let best = null, bd = Infinity; const fx = Math.sin(c.a), fz = Math.cos(c.a);
    for (const l of this.lanes) for (let i = 0; i < l.pts.length - 1; i += 2) { const p = l.pts[i], n = l.pts[i + 1], d = Math.hypot(p.x - c.x, p.z - c.z) - ((n.x - p.x) * fx + (n.z - p.z) * fz) * 2; if (d < bd) { bd = d; best = { l, s: l.cum[i] }; } }
    if (best) { c.w = best.l; c.s = best.s; c.next = null; }
  }
  /* a car in pursuit: along the roads toward the target while it's far (taking the turn that gets
     closer at each junction, through red lights), then straight at it: up to a stop beside you
     on foot (they get out: c.deployed), or into your car to box it in */
  pursue(c, dt, P, vehicles) {
    const T = c.target || P, driving = vehicles && vehicles.car, tx0 = driving ? driving.x : T.x, tz0 = driving ? driving.z : T.z;
    const d = Math.hypot(tx0 - c.x, tz0 - c.z), fx = Math.sin(c.a), fz = Math.cos(c.a);
    if (c.stun > 0) { c.stun -= dt; c.speed *= 1 - Math.min(1, dt * 3); this.move(c, dt, 0); return; }
    if (c.rev > 0) { c.rev -= dt; c.speed += (-3 - c.speed) * Math.min(1, dt * 3); this.move(c, dt, c.revSteer); if (c.rev <= 0) c.speed = 0; return; }
    let tx, tz, want;
    if (d > 60 && c.mode === "road") {   // the road network
      if (!c.w.turn && !c.next && c.w.L - c.s < 25) {
        const outs = c.w.out; let best = null, bd = Infinity;
        for (const m of outs) { const e = m.pts[m.pts.length - 1], dd = Math.hypot(e.x - tx0, e.z - tz0); if (dd < bd) { bd = dd; best = m; } }
        if (best) { const save = c.w.out; c.w.out = [best]; c.next = this.chooseNext(c); c.w.out = save; }
      }
      // anything slow ahead in our lane: out into the other lane round it, siren going
      let block = false; for (const o of this.cars) { if (o === c || !o.active) continue; const dx = o.x - c.x, dz = o.z - c.z, ah = dx * fx + dz * fz; if (ah > 0 && ah < 16 && Math.abs(-dx * fz + dz * fx) < 1.8 && o.speed < c.speed - 1) { block = true; break; } }
      c.offP = (c.offP || 0) + ((block ? -2 * (c.w.off || 3) : 0) - (c.offP || 0)) * Math.min(1, dt * 3);
      const Ld = 3 + c.speed * 0.35, Q = chainPoint(c, c.s + Ld); tx = Q.x - Q.dz * c.offP; tz = Q.z + Q.dx * c.offP;
      want = Math.max(16, c.w.cruise * 2.1);
      c.s += Math.max(0, c.speed * dt * 0.98);
      if (c.s >= c.w.L) { const over = c.s - c.w.L; if (c.w.turn) { c.w = c.w.lane; c.next = null; c.s = over; } else { const nx = c.next || this.chooseNext(c); if (nx) { c.w = nx; c.next = null; c.s = over; } else c.mode = "direct"; } }
    } else {   // straight for them
      if (d > 90) { c.mode = "road"; this.snapCop(c); } else c.mode = "direct";
      const lead = driving ? 0.6 : 0, vx = driving ? Math.sin(driving.a) * driving.speed : 0, vz = driving ? Math.cos(driving.a) * driving.speed : 0;
      tx = tx0 + vx * lead; tz = tz0 + vz * lead;
      if (driving) { want = Math.min(32, 10 + d * 1.0); c.stopT = d < 9 && Math.abs(driving.speed) < 2 ? (c.stopT || 0) + dt : 0; if (c.stopT > 2) { want = 0; if (c.speed < 1) c.deployed = true; } }   // ram them; if you've stopped, get out
      else { const stopAt = 6; want = d < stopAt ? 0 : Math.min(24, (d - stopAt) * 1.6 + 2); if (d < stopAt + 0.5 && c.speed < 1) c.deployed = true; }
      if (c.mode === "road") { c.mode = "road"; }
    }
    // steer for the point; brake for anything solid right in front (not for the car they're chasing)
    const ax = tx - c.x, az = tz - c.z, alpha = Math.atan2(ax * fz - az * fx, ax * fx + az * fz), Ld2 = Math.max(3, Math.hypot(ax, az));
    const st = Math.max(-0.65, Math.min(0.65, Math.atan(2 * WB * Math.sin(alpha) / Ld2)));
    c.steer += (st - c.steer) * Math.min(1, dt * 7);
    if (c.mode !== "road") for (const o of this.cars) { if (o === c || !o.active || (driving && o === driving)) continue; const dx = o.x - c.x, dz = o.z - c.z, ah = dx * fx + dz * fz; if (ah > 0 && ah < 9 && Math.abs(-dx * fz + dz * fx) < 1.9) want = Math.min(want, Math.max(4, ah - 3)); }
    if (Math.abs(alpha) > 1.3 && d < 25) want = Math.min(want, 5);         // turning hard: slow for it
    const acc = want > c.speed ? 8.5 : -10; c.speed = Math.max(0, Math.min(want > c.speed ? want : c.speed, c.speed + acc * dt));
    c.brake = acc < 0; c.ind = 0;
    c.still = c.speed < 0.5 && want > 1 ? (c.still || 0) + dt : 0;
    if (c.still > 1.6) { c.rev = 1.1; c.revSteer = alpha > 0 ? -0.55 : 0.55; c.still = 0; }
    this.move(c, dt, c.steer);
  }
  // is the other side of the road clear far enough ahead to pull out and pass?
  clear(c, across) {
    const fx = Math.sin(c.a), fz = Math.cos(c.a), rx = -fz, rz = fx;
    for (const o of this.cars) {
      if (o === c || !o.active) continue;
      const dx = o.x - c.x, dz = o.z - c.z, ahead = dx * fx + dz * fz; if (ahead <= -6 || ahead >= 55) continue;
      const Q = chainPoint(c, c.s + Math.max(0, ahead)), lat = (o.x - Q.x) * -Q.dz + (o.z - Q.z) * Q.dx;
      if (Math.abs(lat - across) < 2.4) return false;
    }
    return true;
  }
  // which way the next street turns (-1 left, 1 right, 0 straight on)
  turnSign(c) {
    const w = c.w.turn ? c.w : (c.next && c.w.L - c.s < 30 ? c.next : null); if (!w || !w.turn) return 0;
    const a = w.pts[0], b = w.pts[1], y = w.pts[w.pts.length - 2], z = w.pts[w.pts.length - 1];
    const h0 = Math.atan2(b.x - a.x, b.z - a.z), h1 = Math.atan2(z.x - y.x, z.z - y.z), d = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    return Math.abs(d) < 0.35 ? 0 : d > 0 ? -1 : 1;
  }
  lights(dt) {
    if (!this.signals.length || (this.st = (this.st || 0) + dt) < 0.3) return;
    this.st = 0; const props = this.world.props, m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), pos = new THREE.Vector3();
    this.signals.forEach((sg, i) => {
      const g = this.green(sg.node, sg.end); q.setFromAxisAngle(UP, sg.a); pos.set(sg.x, 0, sg.z);
      m.compose(pos, q, g ? zero : one); props.redMesh.setMatrixAt(i, m); m.compose(pos, q, g ? one : zero); props.greenMesh.setMatrixAt(i, m);
    });
    props.redMesh.instanceMatrix.needsUpdate = props.greenMesh.instanceMatrix.needsUpdate = true;
  }
  // you on foot: don't walk through cars
  push(p, r) {
    for (const c of this.cars) {
      if (!c.active) continue;
      const fx = Math.sin(c.a), fz = Math.cos(c.a);
      for (const k of [1.4, 0, -1.4]) { const cx = c.x + fx * k, cz = c.z + fz * k, dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), m = r + 0.95; if (d < m && d > 1e-4) { p.x = cx + dx / d * m; p.z = cz + dz / d * m; } }
    }
  }
  // the player takes a car: it stops being traffic
  take(c) { c.ai = false; c.taken = true; }
}
