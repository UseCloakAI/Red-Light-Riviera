/* Stage 5: traffic. Cars drive the street network on the right-hand side, a
   lane each way down every road (offset from the centreline, so they follow its
   curves). At the end of a lane they stop at the line if the signal's red or
   the junction is busy, then turn onto another street on a smooth curve (rarely
   straight back, unless it's a dead end, where they swing round the turning
   circle). They keep their distance from whatever's ahead (other cars, yours,
   you on foot, people in the road), and lean on the horn if you're the reason
   they can't go. They're spawned out of sight round the player and recycled
   when far behind.

   The signals cycle: each junction alternates which of its roads has green.
   Cars are instanced (three meshes); a car the player takes stops being traffic
   and becomes a car like any parked one (vehicles.js). */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { at } from "./city/roads.js?v=dev";

const POOL = 40, NEAR_SPAWN = 70, FAR_SPAWN = 170, RECYCLE = 230, GREEN = 11;
const CRUISE = { avenue: 13, ring: 8, street: 10, port: 8 };
const PAINTS = [0xC23B2A, 0x2F5D8C, 0xE8E2D6, 0x2a2a2e, 0x8a8d92, 0x3F7A4A, 0xD9A441, 0x6a2a4a, 0x7a9ab8, 0xa8a08a, 0x5a3a2a, 0xf0f0f0, 0xE0C030];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 0), UP = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

function cumul(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return c; }
function path(pts, extra = {}) { const cum = cumul(pts); return { pts, cum, L: cum[cum.length - 1], ...extra }; }
function pointOn(w, s) {
  const { pts, cum } = w; s = Math.max(0, Math.min(w.L, s));
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, k = (s - cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
}

export class Traffic {
  constructor(scene, world, opts = {}) {
    this.world = world; this.R = Math.random; this.t = 0; this.limit = opts.count || 16; this.sfx = opts.sfx || {};
    const roads = world.roads, N = Object.fromEntries(roads.nodes.map((n) => [n.id, n]));
    this.N = N;
    // lanes: one each way per road, on the right, from stop line to stop line
    this.lanes = [];
    for (const e of roads.edges) {
      const A = N[e.a], B = N[e.b], off = e.w / 4, s0 = A.deg > 1 ? A.r : 0, s1 = e.L - (B.deg > 1 ? B.r : 0);
      if (s1 - s0 < 4) continue;
      const fwd = [], back = [], n = Math.max(2, Math.ceil((s1 - s0) / 3));
      for (let i = 0; i <= n; i++) { const p = at(e.pl, s0 + (s1 - s0) * i / n); fwd.push({ x: p.x - p.nx * off, z: p.z - p.nz * off }); back.push({ x: p.x + p.nx * off, z: p.z + p.nz * off }); }
      back.reverse();
      const cruise = CRUISE[e.kind] || 10;
      this.lanes.push(path(fwd, { e, from: A, to: B, cruise, endIdx: B.ends.findIndex((d) => d.e === e && !d.start) }));
      this.lanes.push(path(back, { e, from: B, to: A, cruise, endIdx: A.ends.findIndex((d) => d.e === e && d.start) }));
    }
    for (const l of this.lanes) l.out = this.lanes.filter((m) => m.from === l.to && (m.e !== l.e || l.to.deg === 1));
    // the cars: three instanced meshes like the parked ones
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const geo = [mergeGeometries([new THREE.BoxGeometry(1.8, 0.62, 4.3).translate(0, 0.58, 0), new THREE.BoxGeometry(1.75, 0.2, 1.0).translate(0, 0.95, 1.55)]),
      new THREE.BoxGeometry(1.55, 0.55, 2.1).translate(0, 1.16, -0.25),
      mergeGeometries([[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]].map(([x, z]) => new THREE.CylinderGeometry(0.33, 0.33, 0.22, 8).rotateZ(Math.PI / 2).translate(x, 0.33, z)))];
    const mats = [L({ color: 0xffffff }), L({ color: 0x2a3644, emissive: 0x0c1218 }), L({ color: 0x18181a })];
    this.meshes = geo.map((g, k) => { const im = new THREE.InstancedMesh(g, mats[k], POOL); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); return im; });
    // tail lights: two little red quads per car, brighter when braking
    this.cars = [];
    for (let i = 0; i < POOL; i++) {
      const c = { i, meshes: this.meshes, active: false, ai: false, x: 0, z: 0, y: 0, a: 0, speed: 0, steer: 0, roll: 0, color: PAINTS[(this.R() * PAINTS.length) | 0], health: 100, honk: 0, wait: 0, stun: 0 };
      this.meshes[0].setColorAt(i, _c.set(c.color)); this.hide(c); this.cars.push(c);
    }
    this.meshes[0].instanceColor.needsUpdate = true;
    this.signals = world.props ? world.props.signals : [];
  }
  hide(c) { _m.compose(_z, _q.identity(), _z); for (const im of this.meshes) im.setMatrixAt(c.i, _m); }
  place(c) {
    _q.setFromAxisAngle(UP, c.a); const r = new THREE.Quaternion().setFromAxisAngle(_p.set(Math.cos(c.a), 0, -Math.sin(c.a)), c.roll || 0); _q.premultiply(r);
    _m.compose(_p.set(c.x, c.y, c.z), _q, _s); for (const im of this.meshes) im.setMatrixAt(c.i, _m);
  }
  // is this road's way into the junction green right now?
  green(node, endIdx) {
    if (node.deg < 3 || !node.ends.some((d) => d.e.kind === "avenue")) return true;
    const phase = Math.floor((this.t + node.x * 0.37) / GREEN) % 2;
    return endIdx % 2 === phase;
  }
  spawn(c, near) {
    for (let tries = 0; tries < 30; tries++) {
      const l = this.lanes[(this.R() * this.lanes.length) | 0], s = this.R() * l.L, p = pointOn(l, s), d = Math.hypot(p.x - near.x, p.z - near.z);
      if (d < NEAR_SPAWN || d > FAR_SPAWN) continue;
      if (this.cars.some((o) => o.active && Math.hypot(o.x - p.x, o.z - p.z) < 14)) continue;
      Object.assign(c, { active: true, ai: true, w: l, s, x: p.x, z: p.z, y: this.world.heightAt(p.x, p.z), a: Math.atan2(p.dx, p.dz), speed: l.cruise * 0.6, wait: 0, honk: 0, stun: 0, health: 100, wreck: false, inJunction: null });
      return true;
    }
    return false;
  }
  // pick the next street at a junction and the curve onto it
  turn(c) {
    const l = c.w.lane || c.w, outs = l.out; if (!outs.length) return null;
    const a0 = Math.atan2(c.x - l.to.x, c.z - l.to.z);
    // weight: straight on is likeliest, turns next, a U-turn only at a dead end
    const ws = outs.map((m) => { const p = m.pts[0], q = m.pts[1]; const ang = Math.atan2(q.x - p.x, q.z - p.z), back = Math.atan2(-(l.pts[l.pts.length - 1].x - l.pts[l.pts.length - 2].x), -(l.pts[l.pts.length - 1].z - l.pts[l.pts.length - 2].z)); const d = Math.abs(Math.atan2(Math.sin(ang - back), Math.cos(ang - back))); return 0.2 + d; });
    let r = this.R() * ws.reduce((a, b) => a + b, 0), k = 0; while (r > ws[k] && k < ws.length - 1) r -= ws[k++];
    const m = outs[k], P = l.pts[l.pts.length - 1], P0 = l.pts[l.pts.length - 2], Q = m.pts[0], Q1 = m.pts[1];
    const t1 = { x: P.x - P0.x, z: P.z - P0.z }, t2 = { x: Q1.x - Q.x, z: Q1.z - Q.z };
    let C = null; const den = t1.x * t2.z - t1.z * t2.x;
    if (Math.abs(den) > 0.05) { const u = ((Q.x - P.x) * t2.z - (Q.z - P.z) * t2.x) / den; if (u > 0 && u < 60) C = { x: P.x + t1.x * u, z: P.z + t1.z * u }; }
    if (!C) C = { x: (P.x + Q.x) / 2 * 0.5 + l.to.x * 0.5, z: (P.z + Q.z) / 2 * 0.5 + l.to.z * 0.5 };
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, u = 1 - t; pts.push({ x: u * u * P.x + 2 * u * t * C.x + t * t * Q.x, z: u * u * P.z + 2 * u * t * C.z + t * t * Q.z }); }
    void a0;
    return path(pts, { lane: m, node: l.to, turn: true, cruise: 6.5 });
  }
  // everything a car could run into, as points with a radius
  obstacles(player, vehicles, peds) {
    const o = [];
    for (const c of this.cars) if (c.active) o.push({ x: c.x, z: c.z, r: 1.3, car: c });
    if (vehicles && vehicles.car) o.push({ x: vehicles.car.x, z: vehicles.car.z, r: 1.3, player: true });
    else o.push({ x: player.pos.x, z: player.pos.z, r: 0.6, player: true });
    if (peds) for (const pd of peds.peds) { if (pd.dead || !pd.h.group.visible) continue; const g = pd.h.group.position; if (this.world.mask.get(g.x, g.z) === 2) o.push({ x: g.x, z: g.z, r: 0.6 }); }
    return o;
  }
  update(dt, player, vehicles, peds) {
    this.t += dt;
    const P = player.pos, obs = this.obstacles(player, vehicles, peds);
    // keep the right number on the road round the player
    let n = this.cars.filter((c) => c.active && c.ai).length;
    for (const c of this.cars) {
      if (c.active && c.ai && Math.hypot(c.x - P.x, c.z - P.z) > RECYCLE) { c.active = false; this.hide(c); n--; }
      if (!c.active && !c.taken && n < this.limit && this.spawn(c, P)) n++;
    }
    const busy = new Map();
    for (const c of this.cars) if (c.active && c.ai && c.w.turn) busy.set(c.w.node, (busy.get(c.w.node) || 0) + 1);
    for (const c of this.cars) {
      if (!c.active || !c.ai) continue;
      if (c.stun > 0) { c.stun -= dt; c.speed *= 1 - Math.min(1, dt * 3); this.place(c); continue; }
      const fx = Math.sin(c.a), fz = Math.cos(c.a);
      // what's ahead: the nearest obstacle in a cone in front
      let gap = Infinity, byPlayer = false;
      for (const o of obs) {
        if (o.car === c) continue;
        const dx = o.x - c.x, dz = o.z - c.z, ahead = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
        if (ahead > 0 && ahead < 16 && lat < 1.4 + o.r) { const g = ahead - 2.4 - o.r; if (g < gap) { gap = g; byPlayer = !!o.player; } }
      }
      let target = c.w.cruise;
      if (gap < 9) target = Math.min(target, Math.max(0, (gap - 1.2) * 1.3));
      // the stop line: red light, or the junction already has two cars in it
      if (!c.w.turn) {
        const left = c.w.L - c.s, l = c.w;
        if (left < 14) {
          const stop = !this.green(l.to, l.endIdx) || (busy.get(l.to) || 0) >= 2;
          if (stop && c.wait < 9) { target = Math.min(target, Math.max(0, (left - 0.5) * 0.9)); if (c.speed < 0.3) c.wait += dt; }
          else target = Math.min(target, 7);
        }
      }
      // horn: stuck behind the player for a while
      if (byPlayer && c.speed < 0.5 && gap < 6) { c.honk += dt; if (c.honk > 2.2) { c.honk = -3; if (this.sfx.horn) this.sfx.horn(Math.hypot(c.x - P.x, c.z - P.z)); } } else if (c.honk > 0) c.honk = 0;
      c.speed += Math.max(-8 * dt, Math.min(3.5 * dt, target - c.speed));
      c.s += c.speed * dt;
      if (c.s >= c.w.L) {
        const over = c.s - c.w.L;
        if (c.w.turn) { c.w = c.w.lane; c.s = over; c.wait = 0; }
        else { const t = this.turn(c); if (t) { c.w = t; c.s = over; } else { c.active = false; this.hide(c); continue; } }
      }
      const p = pointOn(c.w, c.s), na = Math.atan2(p.dx, p.dz);
      let da = na - c.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      c.roll += (-da * c.speed * 0.02 - c.roll) * Math.min(1, dt * 5);
      c.a += da * Math.min(1, dt * 10); c.x = p.x; c.z = p.z; c.y += (this.world.heightAt(c.x, c.z) - c.y) * Math.min(1, dt * 12);
      this.place(c);
    }
    // the signal lamps: show red or green per road
    if (this.signals.length && (this.st = (this.st || 0) + dt) > 0.4) {
      this.st = 0; const props = this.world.props, m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), pos = new THREE.Vector3();
      this.signals.forEach((sg, i) => {
        const g = this.green(sg.node, sg.end); q.setFromAxisAngle(UP, sg.a); pos.set(sg.x, 0, sg.z);
        m.compose(pos, q, g ? zero : one); props.redMesh.setMatrixAt(i, m); m.compose(pos, q, g ? one : zero); props.greenMesh.setMatrixAt(i, m);
      });
      props.redMesh.instanceMatrix.needsUpdate = props.greenMesh.instanceMatrix.needsUpdate = true;
    }
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }
  // you on foot: don't walk through cars
  push(p, r) {
    for (const c of this.cars) {
      if (!c.active) continue;
      const fx = Math.sin(c.a), fz = Math.cos(c.a);
      for (const k of [1.4, 0, -1.4]) { const cx = c.x + fx * k, cz = c.z + fz * k, dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), m = r + 1.0; if (d < m && d > 1e-4) { p.x = cx + dx / d * m; p.z = cz + dz / d * m; } }
    }
  }
  // the player takes a car: it stops being traffic
  take(c) { c.ai = false; c.taken = true; }
}
