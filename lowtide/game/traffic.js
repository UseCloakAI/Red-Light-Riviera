/* Stage 5: traffic. Marlowe Keys drives on the right.

   Every car is a little physical car (the same bicycle model as yours): it steers
   toward a point a few metres up the road (pure pursuit, looking further ahead
   the faster it goes), so it follows the road's curves and swings wide or tight
   through turns like a driver would, and it can be knocked off line and find its
   way back.

   What a driver sees: the road ahead as one line (the horizon): the rest of its
   lane, the way it's taking through the next junction, the street after that,
   and on along its route, out to past where it could stop. Everything (other
   cars, you, people in the road, parked cars) is placed against that line: how
   far along it, how far across it, which way it's facing. Something is in the
   way only if its footprint actually overlaps the strip the car is driving
   down, so an oncoming car on a bend, a car waiting on a side street or a row of
   parked cars is never mistaken for one in front.

   Speed: the Intelligent Driver Model (the IDM+ form, the standard model of
   human car-following) for the car in front and the stop line, and a speed for
   every bend along the horizon (as fast as the driver's happy to corner),
   braked for at a steady rate from as far back as it takes, the way you'd lift
   off and brake into a corner. Each driver has their own cruising speed,
   following gap, acceleration, braking and cornering. Acceleration changes at a
   human rate (no instant stamping on the pedals) unless it's an emergency.

   Routes: every driver is going somewhere. They pick a destination across town and plan the way there with A*
   over the lanes (nav.js, on ngraph.path): quickest by time, with turns costing what that driver thinks a turn
   is worth (most would rather stay on the same street), lefts more than rights, signals a little. Get there and
   they may park; otherwise they pick somewhere new. Get knocked off the route and they plan again.

   Junctions: every way through a junction is a path of its own (built once, as a smooth curve from one lane to
   the next), and it's known which of them cross, merge into the same street or pass too close to share the box.
   On the avenues the signals cycle (a green for each pair of roads, then a moment of all-red to clear the box);
   a left turn on green waits for a gap in the oncoming traffic. Elsewhere it's priority: the avenue first, then
   whoever got there first, then whoever's on the right, a left turn giving way to oncoming. A driver commits to
   the junction (and is counted in it) only when nothing that crosses their way is in it or coming first, and
   there's room on the street they're turning into, so nobody blocks the box. Committed and too close to stop, they
   go; otherwise a light going amber stops them. A siren coming: they hold back and let it through.

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
   recycled far behind; one stuck for a long time quietly leaves. Each is one of
   the island's models (carmodels.js) with someone at the wheel, drawn by
   carrender.js; a car that's hit comes off its lane into the full physics
   (vehicles.js) and, if its driver can, finds its lane again once it's stopped.

   Parking: now and then a driver on a street with kerbside spaces picks a free one
   ahead, indicates, slows and pulls in on a smooth curve; they get out and walk off
   and the car stays there. Someone from the crowd may walk up to a parked car, get
   in and pull out into the traffic (vehicles.js adopts it into the pool here). */
import * as THREE from "three";
import { at } from "./city/roads.js?v=dev";
import { MODEL, pickModel, pickPaint } from "./carmodels.js?v=dev";
import { kin, ride } from "./carphys.js?v=dev";
import { Nav } from "./nav.js?v=dev";

const POOL = 44, NEAR_SPAWN = 80, FAR_SPAWN = 190, RECYCLE = 245, WB = 2.6, STEP = 2;
const CRUISE = { avenue: 13.5, ring: 8.5, street: 10, port: 8.5 };
const PHASE = [14, 9], CLEAR = 2, AMBER = 2.6;   // green for the through road and for the side road (its last seconds amber), all-red between
const STYLE = {   // v0, headway T, accel, patience (s) before honking or passing, cornering (lateral m/s^2), comfortable braking
  calm: [0.9, 1.5, 1.0, 5, 3.0, 1.7], hurried: [1.04, 1.15, 1.2, 3, 3.5, 2.1], aggro: [1.16, 0.85, 1.45, 1.4, 4.2, 2.6] };
const UP = new THREE.Vector3(0, 1, 0), PARK = 0.03, NAVY = 0x1d2a4a;
// a smooth curve from one pose to another (cubic, its ends along each heading), as a path
function curve(x0, z0, a0, x1, z1, a1, k0 = 4, k1 = 4, n = 14) {
  const P1 = { x: x0 + Math.sin(a0) * k0, z: z0 + Math.cos(a0) * k0 }, P2 = { x: x1 - Math.sin(a1) * k1, z: z1 - Math.cos(a1) * k1 }, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push({ x: u * u * u * x0 + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * x1, z: u * u * u * z0 + 3 * u * u * t * P1.z + 3 * u * t * t * P2.z + t * t * t * z1 }); }
  return path(pts);
}
// how far along a lane its nearest point to (x, z) is
function laneS(l, x, z) { let b = 0, bd = Infinity; for (let i = 0; i < l.pts.length; i++) { const d = (l.pts[i].x - x) ** 2 + (l.pts[i].z - z) ** 2; if (d < bd) { bd = d; b = i; } } return { s: l.cum[b], d: Math.sqrt(bd) }; }

function cumul(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return c; }
function path(pts, extra = {}) { const cum = cumul(pts); return { pts, cum, L: cum[cum.length - 1], ...extra }; }
function pointOn(w, s) {
  const { pts, cum } = w; s = Math.max(0, Math.min(w.L, s));
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, k = (s - cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/* the horizon: the road ahead of a car sampled every STEP metres (x, z, its direction dx/dz, u = metres ahead) */
function hAt(H, u) {   // the point u metres ahead (straight on past the end)
  const n = H.n;
  if (u >= H.u[n - 1]) { const m = n - 1, e = u - H.u[m]; return { x: H.x[m] + H.dx[m] * e, z: H.z[m] + H.dz[m] * e, dx: H.dx[m], dz: H.dz[m] }; }
  const j = Math.max(0, Math.min(n - 2, Math.floor(u / STEP))), t = (u - H.u[j]) / (H.u[j + 1] - H.u[j] || 1);
  return { x: H.x[j] + (H.x[j + 1] - H.x[j]) * t, z: H.z[j] + (H.z[j + 1] - H.z[j]) * t, dx: H.dx[j], dz: H.dz[j] };
}
// a point against the horizon: how far along it (u, negative behind, past the end beyond), how far to its right (lat), and its direction there
const PQ = { u: 0, lat: 0, dx: 0, dz: 1 };
function hProj(H, x, z, out = PQ) {
  let bd = Infinity, bj = 0, bt = 0; const last = H.n - 2;
  for (let j = 0; j <= last; j++) {
    const ax = H.x[j], az = H.z[j], ex = H.x[j + 1] - ax, ez = H.z[j + 1] - az, L2 = ex * ex + ez * ez || 1e-6;
    const t = ((x - ax) * ex + (z - az) * ez) / L2, tc = t < 0 ? 0 : t > 1 ? 1 : t, px = ax + ex * tc - x, pz = az + ez * tc - z, d = px * px + pz * pz;
    if (d < bd) { bd = d; bj = j; bt = (j === 0 && t < 0) || (j === last && t > 1) ? t : tc; }
  }
  const ax = H.x[bj], az = H.z[bj], ex = H.x[bj + 1] - ax, ez = H.z[bj + 1] - az, L = Math.hypot(ex, ez) || 1e-6, px = ax + ex * bt, pz = az + ez * bt;
  out.u = H.u[bj] + (H.u[bj + 1] - H.u[bj]) * bt; out.lat = ((x - px) * -ez + (z - pz) * ex) / L; out.dx = ex / L; out.dz = ez / L;
  return out;
}
/* the bends along the horizon for a car doing v that's happy to corner at alat: the hardest steady braking it'd take
   to be down to each bend's speed by the time it gets there (need), and the fastest it should go where it is now (vNow) */
function bends(H, v, alat) {
  let need = 0, vNow = Infinity; const n = H.n;
  for (let j = 0; j < n; j++) {
    const a = Math.max(0, j - 2), b = Math.min(n - 1, j + 2), du = H.u[b] - H.u[a]; if (du < 1) continue;
    const k = Math.abs(wrap(Math.atan2(H.dx[b], H.dz[b]) - Math.atan2(H.dx[a], H.dz[a]))) / du; if (k < 0.003) continue;
    const vc2 = alat / k;
    if (H.u[j] < 4) vNow = Math.min(vNow, Math.sqrt(vc2));
    else if (v * v > vc2) need = Math.max(need, (v * v - vc2) / (2 * (H.u[j] - 3)));
  }
  return { need, vNow };
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
    // route planning over the lanes (nav.js): drivers head somewhere, cops take the quickest way to you
    this.nav = new Nav(this.lanes, { signalled: (n) => this.signalled(n) });
    for (const l of this.lanes) {
      // which way it's heading where it reaches the junction, and how far a driver can ease over to the right without
      // touching the kerb (or, on a street with parking, a parked car: parked 1.02 m in from the kerb line)
      const P = l.pts[l.pts.length - 1], P0 = l.pts[l.pts.length - 2], d = Math.hypot(P.x - P0.x, P.z - P0.z) || 1;
      l.dir = { x: (P.x - P0.x) / d, z: (P.z - P0.z) / d };
      const parked = l.e.kind === "street" && l.e.w >= 11;
      l.kerb = Math.max(0, parked ? l.e.w / 2 - 1.02 - 1.0 - l.off - 1.0 - 0.2 : l.e.w / 2 - l.off - 1.0 - 0.6);
    }
    // every way through every junction, and which of them can't share the box
    for (const n of roads.nodes) n.res = [];
    const byNode = new Map();
    for (const l of this.lanes) for (const m of l.out) { const w = this.mv(l, m); if (!byNode.has(w.node)) byNode.set(w.node, []); byNode.get(w.node).push(w); }
    for (const list of byNode.values()) for (const A of list) for (const B of list) {
      if (A === B || A.from === B.from || A.conf.has(B)) continue;
      // they cross, end in the same lane, or pass closer than two cars side by side need
      let bd = Infinity, ia = A.pts.length - 1, ib = B.pts.length - 1;
      if (A.lane !== B.lane) for (let i = 0; i < A.pts.length; i++) for (let j = 0; j < B.pts.length; j++) { const d = (A.pts[i].x - B.pts[j].x) ** 2 + (A.pts[i].z - B.pts[j].z) ** 2; if (d < bd) { bd = d; ia = i; ib = j; } }
      if (A.lane === B.lane || bd < 2.3 * 2.3) { A.conf.add(B); B.conf.add(A); A.cu.set(B, A.cum[ia]); B.cu.set(A, B.cum[ib]); }
    }
    // the cars: a pool, each one of the island's models (vehicles.js gives them their model and physics: attach)
    this.cars = [];
    for (let i = 0; i < POOL; i++) this.cars.push({ i, active: false, ai: false, x: 0, z: 0, y: 0, a: 0, speed: 0, steer: 0, roll: 0, health: 100, hidden: true });
    this.threat = 0; this.meshes = []; this.lampMeshes = [];
    this.signals = world.props ? world.props.signals : [];
    // kerbside spaces along each lane, in the order you reach them
    const slots = world.parking || [];
    for (const l of this.lanes) { const side = l.from === N[l.e.a] ? 1 : -1; l.slots = slots.filter((sl) => sl.e === l.e && sl.side === side).map((sl) => { sl.lane = l; sl.s = laneS(l, sl.x, sl.z).s; return sl; }).sort((a, b) => a.s - b.s); }
  }
  attach(V) {
    this.V = V;
    for (const c of this.cars) { const m = pickModel(this.R); V.init(c, m, pickPaint(m, this.R)); c.hidden = true; }
  }
  hide(c) { c.hidden = true; }
  // a car moved by hand (the police put one across the road): settle it on its wheels
  place(c) { if (c.S) { c._u = c.speed; ride(c, 1 / 60, this.world.heightAt); } }
  // signals: two groups of roads take turns, with a moment of all-red between. The through road (the two arms that
  // most nearly face each other, the avenue if there's a choice) goes together and gets the longer green; the rest go
  // together after it.
  signalled(node) { return node.deg >= 3 && node.ends.some((d) => d.e.kind === "avenue"); }
  phase(node) {
    if (node.phase) return node.phase;
    let bi = 0, bj = 1, best = Infinity; const E = node.ends;
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      const score = E[i].dir.x * E[j].dir.x + E[i].dir.z * E[j].dir.z - (E[i].e.kind === "avenue" && E[j].e.kind === "avenue" ? 0.5 : 0);
      if (score < best) { best = score; bi = i; bj = j; }
    }
    return (node.phase = E.map((d, k) => k === bi || k === bj ? 0 : 1));
  }
  // seconds of green left for this approach (Infinity unsignalled, 0 red)
  greenLeft(node, endIdx) {
    if (!this.signalled(node)) return Infinity;
    const g = this.phase(node)[endIdx], cyc = PHASE[0] + PHASE[1] + 2 * CLEAR, t = (this.t + node.x * 0.37 + 1000) % cyc;
    if (t < PHASE[0]) return g === 0 ? PHASE[0] - t : 0;
    if (t >= PHASE[0] + CLEAR && t < PHASE[0] + CLEAR + PHASE[1]) return g === 1 ? PHASE[0] + CLEAR + PHASE[1] - t : 0;
    return 0;
  }
  green(node, endIdx) { return this.greenLeft(node, endIdx) > 0; }
  driver(c) {   // everyone drives a little differently
    const R = this.R, r = R(); c.style = r < 0.12 ? "aggro" : r < 0.45 ? "hurried" : "calm";
    const k = STYLE[c.style];
    c.v0 = k[0] * (0.93 + R() * 0.14); c.T = k[1] * (0.9 + R() * 0.3); c.acc = (1.2 + R() * 0.6) * k[2]; c.brk = k[5] * (0.9 + R() * 0.3); c.s0 = (c.style === "aggro" ? 1.4 : 2) + R() * 1.2;
    c.alat = k[4] * (0.9 + R() * 0.2); c.patience = k[3] * (0.8 + R() * 0.5); c.turnK = 1.6 + R() * 1.6;
    Object.assign(c, { off: 0, offT: 0, blocked: 0, rev: 0, brake: false, ind: 0, passing: null, nudge: 0, ac: 0, go: false, hard: false, arrT: null, resMv: null, leadK: null, route: null, dest: null });
  }
  spawn(c, near) {
    for (let tries = 0; tries < 40; tries++) {
      // a lane picked by length, so cars spread evenly over the network
      let r = this.R() * this.total, l = this.lanes[0]; for (const m of this.lanes) { r -= m.L; if (r <= 0) { l = m; break; } }
      const s = this.R() * l.L, p = pointOn(l, s), d = Math.hypot(p.x - near.x, p.z - near.z);
      if (d < NEAR_SPAWN || d > FAR_SPAWN) continue;
      if (this.cars.some((o) => o.active && Math.hypot(o.x - p.x, o.z - p.z) < 22)) continue;
      this.fresh(c, pickModel(this.R));
      // rolling at a speed it could stop from before the line ahead
      const v = Math.min(l.cruise * 0.7, Math.sqrt(2 * 1.2 * Math.max(0, l.L - s - 8)));
      Object.assign(c, { active: true, ai: true, w: l, next: null, s, x: p.x, z: p.z, y: this.world.heightAt(p.x, p.z), a: Math.atan2(p.dx, p.dz), speed: v, steer: 0,
        wait: 0, still: 0, honk: 0, stun: 0, panic: 0, health: 100, wreck: false, go: false, bend: 0, lift: 0, taken: false });
      this.driver(c); this.uncop(c); c.flats = false; c.occ = { shirt: c.shirt };
      this.place(c);
      return true;
    }
    return false;
  }
  // choose the street after the junction and lay the curve onto it
  // the next lane on this driver's route: a cop's plan to you, or a driver's way to wherever they're going
  // (somewhere new once they get there; a fresh route when they've been knocked off the old one)
  nextLane(c) {
    const l = c.w; if (!this.nav || l.turn) return null;
    if (c.cop && c.pursue) { const r = c.croute, i = r ? r.indexOf(l) : -1, m = i >= 0 ? r[i + 1] : null; return m && l.out.includes(m) ? m : null; }
    if (c.dest === l) c.dest = null;
    if (!c.dest) { c.dest = this.nav.destination(l, this.R, 200, 700); c.route = null; }
    let i = c.route ? c.route.indexOf(l) : -1;
    if (i < 0 || i + 1 >= c.route.length) { c.route = this.nav.route(l, c.dest, { turn: c.turnK || 2 }); i = 0; if (!c.route || c.route.length < 2) { c.dest = c.route = null; return null; } }
    const m = c.route[i + 1]; return l.out.includes(m) ? m : null;
  }
  // the way through the junction after this lane along the route the car's on (for the horizon), if it's planned
  after(c, l) {
    const r = c.cop && c.pursue ? c.croute : c.route; if (!r) return null;
    const i = r.indexOf(l), m = i >= 0 ? r[i + 1] : null;
    return m && l.out.includes(m) ? this.mv(l, m) : null;
  }
  // the path through the junction from lane l onto lane m: a cubic from one to the other, its ends along each lane,
  // the handles sized so a turn is as near a circular arc as a cubic gets (built once and shared)
  mv(l, m) {
    const cache = l.mvs || (l.mvs = new Map()); let w = cache.get(m); if (w) return w;
    const P = l.pts[l.pts.length - 1], P0 = l.pts[l.pts.length - 2], Q = m.pts[0], Q1 = m.pts[1];
    const a0 = Math.atan2(P.x - P0.x, P.z - P0.z), a1 = Math.atan2(Q1.x - Q.x, Q1.z - Q.z), th = Math.abs(wrap(a1 - a0)), D = Math.hypot(Q.x - P.x, Q.z - P.z);
    const k = D * (th < 0.05 ? 1 / 3 : (2 / 3) * Math.tan(th / 4) / Math.max(0.05, Math.sin(th / 2)));
    w = curve(P.x, P.z, a0, Q.x, Q.z, a1, k, k, 16);
    const d = wrap(a1 - a0), kind = m.e === l.e ? "u" : Math.abs(d) < 0.4 ? "s" : d > 0 ? "l" : "r";   // d > 0: turning left
    Object.assign(w, { lane: m, from: l, node: l.to, turn: true, kind, cruise: Math.min(l.cruise, m.cruise), major: l.major, conf: new Set(), cu: new Map() });
    cache.set(m, w); return w;
  }
  // choose the street after the junction (the route's, else a likely one at random): the way through to it
  chooseNext(c, want = this.nextLane(c)) {
    const l = c.w, outs = l.out; if (!outs.length) return null;
    let m = want && outs.includes(want) ? want : null;
    if (!m) {
      const ws = outs.map((o) => ({ s: 3, l: 1.2, r: 1.2, u: 0.15 })[this.mv(l, o).kind]);
      let r = this.R() * ws.reduce((a, b) => a + b, 0), k = 0; while (r > ws[k] && k < ws.length - 1) r -= ws[k++];
      m = outs[k];
    }
    return this.mv(l, m);
  }
  /* ---- junctions ---- */
  // does this car still hold its place in a junction? (in it on that way, or committed to it and coming)
  holds(o) {
    const w = o.resMv;
    return !!w && o.active && o.ai && !(this.V && this.V.dyn.has(o)) && (o.w === w || (o.go && o.w === w.from && o.next === w));
  }
  commit(c) {
    const w = c.next; if (!w) return;
    c.go = true; if (c.resMv === w) return;
    this.uncommit(c); c.go = true; c.resMv = w; w.node.res.push(c);
  }
  uncommit(c) {
    if (c.resMv) { const r = c.resMv.node.res, i = r.indexOf(c); if (i >= 0) r.splice(i, 1); }
    c.resMv = null; c.go = false; c.hard = false;
  }
  // anyone in the junction (or committed to it) on a way that crosses ours and isn't yet past where it does
  boxed(c, w) {
    const res = w.node.res;
    for (let i = res.length - 1; i >= 0; i--) {
      const o = res[i]; if (!this.holds(o)) { res.splice(i, 1); continue; }
      if (o === c || !w.conf.has(o.resMv)) continue;
      if (o.w === o.resMv && o.s > o.resMv.cu.get(w) + (o.S ? o.S.hl : 2.2) + 1.2) continue;
      return true;
    }
    return false;
  }
  // which way a car's coming into the junction from, against another: on our right? head on?
  fromRight(o, c) { return c.w.dir.x * o.w.dir.z - c.w.dir.z * o.w.dir.x < -0.5; }
  headOn(o, c) { return c.w.dir.x * o.w.dir.x + c.w.dir.z * o.w.dir.z < -0.6; }
  // does o (coming to the same junction, eta seconds out) go before c?
  first(o, c, sig, eta) {
    const om = o.next, cm = c.next;
    if (sig) {
      if (this.greenLeft(o.w.to, o.w.endIdx) <= 0) return false;          // they've a red
      if (cm.kind === "l" && om.kind !== "l") return true;                  // a left on green waits for the oncoming
      if (om.kind === "l" && cm.kind !== "l") return false;
      return (o.arrT ?? Infinity) < (c.arrT ?? Infinity);
    }
    if (o.w.major !== c.w.major) return o.w.major;                          // the avenue first
    if (cm.kind === "l" && om.kind !== "l" && this.headOn(o, c)) return true;
    if (om.kind === "l" && cm.kind !== "l" && this.headOn(o, c)) return false;
    const ko = o.arrT ?? this.t + eta, kc = c.arrT ?? this.t + (c.w.L - c.s) / Math.max(0.5, c.speed);
    if (Math.abs(ko - kc) > 0.6) return ko < kc;                            // whoever got there first
    return this.fromRight(o, c);                                            // then whoever's on the right
  }
  // room on the street we're turning into for us (and for everyone already committed to it ahead of us)?
  room(c, w) {
    const m = w.lane; let need = (c.S ? c.S.hl * 2 : 4.4) + 2.5, free = Infinity;
    for (const o of this.cars) {
      if (o === c || !o.active || o.hidden) continue;
      if (o.w === m) { if (o.speed < 4) free = Math.min(free, o.s - (o.S ? o.S.hl : 2.2)); }
      else if (o.resMv && o.resMv.lane === m && this.holds(o)) need += (o.S ? o.S.hl * 2 : 4.4) + 2.5;
    }
    return free === Infinity ? need < m.L + 20 : free > need;
  }
  // may this car go into the junction now?
  mayEnter(c) {
    const l = c.w, w = c.next, node = l.to; if (!w) return true;
    if (c.panic > 0) return true;
    const sig = this.signalled(node), uLine = l.L - c.s;
    if (sig) {
      const left = this.greenLeft(node, l.endIdx);
      c.block = "signal"; if (left <= 0) return false;
      // amber: stop if you comfortably can (the aggressive ones put their foot down instead)
      if (left < AMBER && c.style !== "aggro" && this.canStop(c, uLine)) return false;
    }
    c.block = "siren";
    // a siren on its way through from another road: let it (one behind us: get on and out of its way)
    for (const k of this.sirens) if (k !== c && k.w && k.w.e !== l.e && Math.abs(k.x - node.x) < 70 && Math.abs(k.z - node.z) < 70 && ((k.w.turn && k.w.node === node) || (!k.w.turn && k.w.to === node && k.w.L - k.s < 60))) return false;
    c.block = "box"; if (this.boxed(c, w)) return false;
    c.block = null; if (c.wait > 7) return true;   // waited long enough: edge out (the box is clear of anything crossing)
    for (const o of this.cars) {
      if (o === c || !o.active || !o.ai || o.go || !o.w || o.w.turn || o.w.to !== node || !o.next || !w.conf.has(o.next)) continue;
      if (this.V && this.V.dyn.has(o)) continue;
      const ou = o.w.L - o.s; if (ou > 45) continue;
      const waiting = ou < 10 && o.speed < 1.5, eta = ou / Math.max(0.5, o.speed);
      if (!waiting && eta > 4) continue;
      if (this.first(o, c, sig, eta)) { c.block = "give way"; return false; }
    }
    if (!this.room(c, w)) { c.block = "no room"; return false; }
    c.block = null; return true;
  }
  // could this car stop at the line without braking harder than it'd like?
  canStop(c, uLine, k = 1.3) { const d = uLine - (c.S ? c.S.hl : 2.2) - 0.4; return d > 0.5 && c.speed * c.speed / (2 * d) < Math.max(2.4 * k / 1.3, (c.brk || 2) * k); }
  // a siren car coming up to a junction: anything already in it that crosses its way
  busy(c) { const w = c.next; return !!w && this.boxed(c, w); }
  // everything a driver might brake for: other cars, yours, you, people in the road
  obstacles(player, vehicles, peds) {
    const o = [];
    const hw = (c) => c.S ? c.S.hw : 0.95, hl = (c) => c.S ? c.S.hl : 2.2;
    for (const c of this.cars) if (c.active && !c.hidden) o.push({ x: c.x, z: c.z, hw: hw(c), hl: hl(c), v: c.speed, a: c.a, car: c, key: c });
    if (vehicles) for (const p of vehicles.cars) if (p !== vehicles.car && !p.ai && !p.hidden && (p.obb || p.wreck || vehicles.dyn.has(p)) && Math.abs(p.x - player.pos.x) < 200 && Math.abs(p.z - player.pos.z) < 200) o.push({ x: p.x, z: p.z, hw: hw(p), hl: hl(p), v: 0, a: p.a, car: p, key: p });
    if (vehicles && vehicles.car) o.push({ x: vehicles.car.x, z: vehicles.car.z, hw: hw(vehicles.car), hl: hl(vehicles.car), v: vehicles.car.speed, a: vehicles.car.a, player: true, key: vehicles.car });
    else if (!(this.life && this.life.dead)) o.push({ x: player.pos.x, z: player.pos.z, hw: 0.45, hl: 0.45, v: 0, player: true, foot: true, shooter: this.threat > 0, key: player });
    // people in the road (not on the pavement, and not whoever's sitting at the wheel of a car: that's not someone to brake for)
    if (peds) for (const pd of peds.peds) { if (pd.dead || pd.inCar || !pd.h.group.visible) continue; const g = pd.h.group.position; if (this.world.mask.get(g.x, g.z) !== 1) o.push({ x: g.x, z: g.z, hw: 0.45, hl: 0.45, v: 0, foot: true, key: pd }); }
    return o;
  }
  // something frightening at (x, z): drivers within r panic
  // shooter: the player's the one shooting (drivers won't stop for them for a while)
  panic(x, z, r = 70, shooter = false) {
    if (shooter) this.threat = 10;
    for (const c of this.cars) if (c.active && c.ai && Math.hypot(c.x - x, c.z - z) < r) { c.panic = 10 + this.R() * 6; if (this.R() < 0.3 && this.sfx.horn) this.sfx.horn(Math.hypot(c.x - x, c.z - z)); }
  }

  // a pool car made over as a new one: a model, a paint, no dents, nobody's yet
  fresh(c, m) {
    this.uncommit(c);
    if (this.V) { this.V.fleet.drop(c); this.V.dyn.delete(c); this.V.init(c, m, pickPaint(m, this.R)); }
    Object.assign(c, { route: null, dest: null, croute: null, planT: 0, hidden: false, charred: false, camber: null, bent: null, flip: 0, flipV: 0, held: false, park: null, unpark: null, occ: null, door: 0, door2: 0, coast: false, wasAi: false, aimed: false, rage: false, swerve: 0 });
  }
  // out of the pool (parked for good, or gone)
  release(c) { this.uncommit(c); if (this.V) { this.V.fleet.drop(c); this.V.dyn.delete(c); } Object.assign(c, { active: false, ai: false, taken: false, hidden: true, occ: null, park: null, unpark: null, held: false }); if (c.obb) { this.world.grid.remove(c.obb); c.obb = null; } }
  // a parked car pulled out by someone from the crowd: into the pool, off the kerb on a curve onto its lane
  adopt(src) {
    const c = this.cars.find((k) => !k.active && !k.taken && !k.wreck && !k.cop); if (!c) return null;
    let l = src.slot && src.slot.lane, s = 0;
    if (!l) { let bd = Infinity; for (const m of this.lanes) { const q = laneS(m, src.x, src.z); if (q.d < bd && Math.cos(Math.atan2(m.pts[1].x - m.pts[0].x, m.pts[1].z - m.pts[0].z) - src.a) > -0.2) { bd = q.d; l = m; s = q.s; } } if (!l || bd > 12) return null; }
    else s = laneS(l, src.x, src.z).s;
    this.fresh(c, src.m); c.paint = src.paint;
    const s1 = Math.min(l.L - 1, s + 9), Q = pointOn(l, s1);
    Object.assign(c, { active: true, ai: true, w: l, next: null, s: s1, x: src.x, z: src.z, y: src.y, a: src.a, speed: 0, steer: 0, wait: 0, still: 0, honk: 0, stun: 0, panic: 0,
      health: src.health, wreck: false, go: false, bend: 0, lift: 0, taken: false, gp: src.gp, gr: src.gr, wy: src.wy ? src.wy.slice() : null, camber: src.camber, bent: src.bent, flats: src.flats });
    this.driver(c); c.style = "calm"; c.v0 = 0.9;
    c.unpark = { w: curve(src.x, src.z, src.a, Q.x, Q.z, Math.atan2(Q.dx, Q.dz), 2.5, 4), s: 0 };
    return c;
  }
  // back on the road after being knocked about (if it's anywhere near one)
  resume(c) {
    let best = null, bd = Infinity; const fx = Math.sin(c.a), fz = Math.cos(c.a);
    for (const l of this.lanes) for (let i = 0; i < l.pts.length - 1; i++) { const p = l.pts[i], n = l.pts[i + 1], d = Math.hypot(p.x - c.x, p.z - c.z); if (d < bd && ((n.x - p.x) * fx + (n.z - p.z) * fz) > 0) { bd = d; best = { l, s: l.cum[i] }; } }
    if (!best || bd > 7) return false;
    this.uncommit(c);
    c.w = best.l; c.s = best.s; c.next = null; c.go = false; c.ai = true; c.speed = 0; c.ac = 0; c.arrT = null; c.stun = Math.max(c.stun || 0, 1.5); c.park = null; c.unpark = null; c.passing = null; c.offT = c.off = 0;
    if (c.cop) c.mode = "direct";
    return true;
  }
  // pull into a space: once we're close, a curve from the lane into the slot, slowing to a stop at its end
  parking(c, dt) {
    const k = c.park, sl = k.slot;
    if (!k.w) {
      if (c.s < sl.s - 11 || c.w !== sl.lane) return false;
      k.w = curve(c.x, c.z, c.a, sl.x, sl.z, sl.a, 3.5, 3.2); k.s = 0; this.uncommit(c);
      return true;
    }
    const left = k.w.L - k.s, Ld = 2.2 + c.speed * 0.3, T = pointOn(k.w, k.s + Ld), fx = Math.sin(c.a), fz = Math.cos(c.a);
    const tx = T.x - c.x, tz = T.z - c.z, alpha = Math.atan2(tx * fz - tz * fx, tx * fx + tz * fz);
    const want = Math.max(-0.6, Math.min(0.6, Math.atan(2 * WB * Math.sin(alpha) / Ld)));
    c.steer += (want - c.steer) * Math.min(1, dt * 5);
    const v0 = Math.min(4.2, Math.sqrt(Math.max(0, left) * 1.6) + 0.2);
    c.speed += Math.max(-4, Math.min(1.2, (v0 - c.speed) * 2)) * dt; c.speed = Math.max(0, c.speed);
    c.brake = v0 < c.speed + 0.2; c.ind = 1;
    this.move(c, dt, c.steer);
    k.s += c.speed * dt * Math.cos(Math.min(1.2, Math.abs(alpha)));
    if (left < 0.35 || (left < 1.2 && c.speed < 0.15)) {
      // parked: square it up in the space, engine off, and the driver gets out
      c.ai = false; c.speed = 0; c.brake = false; c.ind = 0; c.park = null; c.held = true;
      c.x += (sl.x - c.x) * 0.6; c.z += (sl.z - c.z) * 0.6; c.a += Math.atan2(Math.sin(sl.a - c.a), Math.cos(sl.a - c.a)) * 0.6; this.place(c);
      if (this.V) this.V.parked(c, sl); else c.active = false;
    }
    return true;
  }
  // pull out of a space onto the lane
  unparking(c, dt, lead) {
    const k = c.unpark, left = k.w.L - k.s, Ld = 2.4 + c.speed * 0.3, T = pointOn(k.w, k.s + Ld), fx = Math.sin(c.a), fz = Math.cos(c.a);
    const tx = T.x - c.x, tz = T.z - c.z, alpha = Math.atan2(tx * fz - tz * fx, tx * fx + tz * fz);
    c.steer += (Math.max(-0.6, Math.min(0.6, Math.atan(2 * WB * Math.sin(alpha) / Ld))) - c.steer) * Math.min(1, dt * 5);
    // wait for a gap in the traffic coming up behind
    const v0 = lead ? 0 : 4.5; c.speed += Math.max(-5, Math.min(1.6, (v0 - c.speed) * 2)) * dt; c.speed = Math.max(0, c.speed);
    c.brake = v0 < c.speed; c.ind = -1;
    this.move(c, dt, c.steer);
    k.s += c.speed * dt * Math.cos(Math.min(1.2, Math.abs(alpha)));
    if (left < 1) c.unpark = null;
  }
  // is anyone coming along the lane close behind (or alongside) a car pulling out?
  traffic(c) { for (const o of this.cars) { if (o === c || !o.active || !o.ai || o.w !== c.w) continue; const ds = c.s - o.s; if (ds > -3 && ds < 22 && o.speed > 1) return true; } return false; }

  update(dt, player, vehicles, peds) {
    this.t += dt;
    const P = player.pos, obs = this.obstacles(player, vehicles, peds), W = this.world, V = this.V;
    this.obs = obs; this.P = P;
    let n = 0; for (const c of this.cars) if (c.active && c.ai && !c.cop) n++;
    for (const c of this.cars) {
      if (c.active && c.ai && !c.pursue && !c.unpark && !(c.occ && c.occ.own && c.occ.pd) && (Math.hypot(c.x - P.x, c.z - P.z) > RECYCLE || (c.still > 18 && Math.hypot(c.x - P.x, c.z - P.z) > 60))) { if (c.park && c.park.slot.car === c) c.park.slot.car = null; this.release(c); if (c.cop) this.uncop(c); n--; }
      if (!c.active && !c.taken && !c.wreck && !c.cop && n < this.limit && this.spawn(c, P)) n++;
    }
    if (this.threat > 0) this.threat -= dt;
    this.sirens.length = 0; for (const c of this.cars) if (c.active && c.cop && c.siren && c.speed > 3) this.sirens.push(c);
    for (const c of this.cars) {
      if (!c.active || !c.ai || c.held || (V && V.dyn.has(c))) continue;
      if (c.unpark) { this.unparking(c, dt, c.unpark.s < 2 && this.traffic(c)); continue; }
      if (c.park && c.park.w) { this.parking(c, dt); continue; }
      if (c.stun > 0) {   // just been hit: sit there, then lean on the horn
        c.stun -= dt; c.speed *= 1 - Math.min(1, dt * 2.5); c.brake = true; c.ind = 0; this.move(c, dt, 0);
        if (c.stun <= 0 && this.sfx.horn) { const d = Math.hypot(c.x - P.x, c.z - P.z); this.sfx.horn(d); if (c.style !== "calm") setTimeout(() => this.sfx.horn(d), 380); }
        continue;
      }
      if (c.cop && c.pursue) { this.pursue(c, dt, P, vehicles); continue; }
      // a gun pointed at the driver: a slow car's driver gets out with their hands up and runs; anyone else floors it
      if (!c.cop && c.occ && !c.occ.dead && this.armed && this.armed() && player.aimYaw !== null && !(vehicles && vehicles.driving)) {
        const dx = c.x - P.x, dz = c.z - P.z, dd = Math.hypot(dx, dz);
        if (dd < 16 && Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - player.aimYaw), Math.cos(Math.atan2(dx, dz) - player.aimYaw))) < 0.25 + 1.5 / Math.max(2, dd) && !c.aimed) {
          c.aimed = true;
          if (c.speed < 3.5 && c.occ.pd && this.V && Math.random() < 0.6) { c.ai = false; c.held = true; c.speed = 0; this.V.npcExit(c, true); continue; }
          c.panic = 12; if (this.sfx.horn) this.sfx.horn(dd);
        }
      }
      if (c.panic > 0) c.panic -= dt;
      // a siren behind us: slow down and pull over to the right until it's gone by
      if (!c.cop && this.sirens.length) { let y = false; for (const k of this.sirens) { const dx = c.x - k.x, dz = c.z - k.z; if (Math.abs(dx) < 40 && Math.abs(dz) < 40 && dx * Math.sin(k.a) + dz * Math.cos(k.a) > 0 && Math.hypot(dx, dz) < 38) { y = true; break; } } if (y) { c.yieldT = 2.5; } }
      // backing out of a jam: a short reverse with the wheel turned, then try again
      if (c.rev > 0) {
        c.rev -= dt; c.speed += (-2.2 - c.speed) * Math.min(1, dt * 3); c.brake = false; c.ind = 0; c.ac = 0;
        this.move(c, dt, c.revSteer); if (c.rev <= 0) { c.speed = 0; c.blocked = c.patience; c.still = 0; }
        continue;
      }
      if (!this.drive(c, dt, false)) continue;
      if (c.park && !c.park.w) this.parking(c, dt) || (c.park && c.w !== c.park.slot.lane && (c.park.slot.car = null, c.park = null));
      if (c.speed > 2.5) this.runOver(c, peds, vehicles, P);
    }
    // cars bumping each other (it happens in a panic): a nudge pushes them apart; a real hit throws both into the physics
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i]; if (!a.active || !a.ai || a.held || (V && V.dyn.has(a))) continue;
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j]; if (!b.active || b.hidden || (V && V.dyn.has(b)) || Math.abs(a.x - b.x) > 6 || Math.abs(a.z - b.z) > 6) continue;
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), m = (a.S ? a.S.hw + b.S.hw : 2) + 0.5 - d;
        if (m > 0 && d > 1e-4 && (!a.S || this.overlap(a, b))) {
          const rel = Math.abs(a.speed - b.speed * Math.cos(a.a - b.a));
          if (rel > 5 && V) { V.wake(a); V.wake(b); continue; }
          a.x += dx / d * m * 0.25; a.z += dz / d * m * 0.25; if (b.ai) { b.x -= dx / d * m * 0.25; b.z -= dz / d * m * 0.25; }
          const sp = Math.min(a.speed, b.speed); a.speed = sp * 0.6; b.speed = sp * 0.6;
        }
      }
    }
    this.lights(dt);
  }
  /* the road ahead of a car, out to len metres: the rest of its path, the way through the next junction, the street
     after, and on along its route as far as it's planned */
  horizon(c, len) {
    const H = c.H || (c.H = { x: new Float64Array(64), z: new Float64Array(64), dx: new Float64Array(64), dz: new Float64Array(64), u: new Float64Array(64), n: 0, len: 0, segs: [] });
    const segs = H.segs; segs.length = 0; segs.push(c.w, c.s, 0);
    let cur = c.w, end = c.w.L - c.s;
    for (let k = 0; end < len && k < 8; k++) {
      const nx = cur.turn ? cur.lane : cur === c.w ? c.next : this.after(c, cur);
      if (!nx) break;
      segs.push(nx, 0, end); end += nx.L; cur = nx;
    }
    H.len = Math.max(0, Math.min(len, end));
    let n = 0, si = 0;
    for (let u = 0; n < 63; u += STEP) {
      const uu = Math.min(u, H.len);
      while (si + 3 < segs.length && segs[si + 5] <= uu) si += 3;
      const p = pointOn(segs[si], segs[si + 1] + uu - segs[si + 2]);
      H.x[n] = p.x; H.z[n] = p.z; H.dx[n] = p.dx; H.dz[n] = p.dz; H.u[n] = uu; n++;
      if (uu >= H.len) break;
    }
    if (n < 2) { H.x[1] = H.x[0] + H.dx[0] * STEP; H.z[1] = H.z[0] + H.dz[0] * STEP; H.dx[1] = H.dx[0]; H.dz[1] = H.dz[0]; H.u[1] = STEP; n = 2; }
    H.n = n;
    return H;
  }
  /* one car driving for a frame: em is a cop on the siren (faster, harder cornering, through the lights but not
     blind). Steering, the speed it wants (the car in front, the stop line, the bends ahead), passing, along its path
     and on to the next. Returns false if the car's gone (driven off the end of the network). */
  drive(c, dt, em) {
    const obs = this.obs, P = this.P, panic = c.panic > 0, fx = Math.sin(c.a), fz = Math.cos(c.a);
    const hw = c.S ? c.S.hw : 0.95, hl = c.S ? c.S.hl : 2.2, wb = c.S ? c.S.L : WB;
    if (!c.w.turn && !c.next) c.next = this.chooseNext(c);
    const v = Math.max(0, c.speed), bc = em ? 5 : c.brk, amax = em ? 4.5 : c.acc * (panic ? 1.6 : 1);
    const H = this.horizon(c, Math.max(50, Math.min(90, v * v / (2 * bc) + v * 2.2 + 18)));
    // where we want to be across the road: our lane (0), out to pass (the other lane), over to the right (a siren, someone at the kerb)
    c.off += (c.offT - c.off) * Math.min(1, dt * 1.6);
    // steering: pure pursuit on a point up the horizon, shifted across by our offset
    const Ld = 2.8 + v * 0.32, T = hAt(H, Ld), Tx = T.x - T.dz * c.off, Tz = T.z + T.dx * c.off;
    const tx = Tx - c.x, tz = Tz - c.z, alpha = Math.atan2(tx * fz - tz * fx, tx * fx + tz * fz);
    const want = Math.max(-0.6, Math.min(0.6, Math.atan(2 * wb * Math.sin(alpha) / Ld)));
    c.steer += (want - c.steer) * Math.min(1, dt * (em ? 7 : 6));
    // the speed we'd like on an open road, and what the bends ahead allow
    if (c.yieldT > 0) c.yieldT -= dt;
    let v0 = em ? Math.min(30, c.w.cruise * 2.2) : c.w.cruise * c.v0 * (panic ? 1.35 : 1) * (c.yieldT > 0 ? 0.35 : 1);
    if (c.flats) v0 *= 0.35;
    const bend = bends(H, v, em ? 6.5 : c.alat * (panic ? 1.25 : 1));
    // the leader: the nearest thing whose footprint overlaps the strip we're driving down
    const lc = c.offT - c.off;
    let gap = Infinity, lv = 0, byPlayer = false, lead = null, edge = 0;
    const reach = H.len + 6;
    for (const o of obs) {
      if (o.car === c) continue;
      if (panic && o.foot && o.shooter) continue;   // fleeing: they'll go straight through whoever's shooting
      const dx = o.x - c.x, dz = o.z - c.z; if (Math.abs(dx) > reach || Math.abs(dz) > reach || dx * fx + dz * fz < -4) continue;
      const q = hProj(H, o.x, o.z); if (q.u <= 0 || q.u > H.len + 2) continue;
      const rel = o.a === undefined ? 0 : o.a - Math.atan2(q.dx, q.dz), cr = Math.abs(Math.cos(rel)), sr = Math.abs(Math.sin(rel));
      const lat = q.lat - (c.off + lc * Math.min(1, q.u / 8)), across = sr * o.hl + cr * o.hw, along = cr * o.hl + sr * o.hw;
      const w = hw + across + (o.key === c.leadK && o.v > 0.5 ? 0.4 : 0.15);
      // coming straight at us on our side of the road (you, driving like that): swerve for the kerb and stand on the brakes
      if (o.player && !o.foot && o.a !== undefined && q.u < 30 && Math.abs(lat) < 2.2) {
        const closing = c.speed - o.v * Math.cos(o.a - c.a);
        if (closing > 9 && q.u / closing < 2.2) { c.offT = Math.min(2.2, c.w.kerb ?? 2.2); c.nudge = 1.5; c.swerve = 1.5; if (c.honk >= 0 && this.sfx.horn) { this.sfx.horn(Math.hypot(c.x - P.x, c.z - P.z)); c.honk = -3; } }
      }
      // does its footprint overlap our strip? Plainly yes or plainly no from its centre; in between (a car at an angle
      // to a bend, a car parked along the street we're turning into) by its four corners against the road ahead
      let hit = Math.abs(lat) < w, g = q.u - hl - along;
      const margin = w - hw - across, R = Math.hypot(o.hl, o.hw);
      if (hit && o.a !== undefined && Math.abs(lat) > hw + Math.min(o.hw, o.hl) + margin && Math.abs(lat) < hw + R + margin) {
        const ofx = Math.sin(o.a), ofz = Math.cos(o.a), u0 = q.u, base = c.off; let lo = Infinity, hi = -Infinity, um = Infinity, inside = false;
        for (let k = 0; k < 4; k++) {
          const lz = k & 1 ? o.hl : -o.hl, lx = k & 2 ? o.hw : -o.hw, px = o.x + ofx * lz - ofz * lx, pz = o.z + ofz * lz + ofx * lx;
          const p = hProj(H, px, pz), l2 = p.lat - (base + lc * Math.min(1, p.u / 8));
          lo = Math.min(lo, l2); hi = Math.max(hi, l2); if (p.u < um) um = p.u;
          if (Math.abs(l2) < hw + margin) inside = true;
        }
        hit = inside || (lo < -hw && hi > hw); g = um - hl; q.u = u0;
      }
      if (hit) {
        if (g < gap) { gap = g; lv = o.v !== undefined && o.a !== undefined ? o.v * Math.cos(rel) : 0; byPlayer = !!o.player; lead = o; }
      } else if (o.foot && q.u < 14 && Math.abs(lat) < w + 1.2) edge = lat > 0 ? -1 : 1;   // someone at the edge of the road: give them room
    }
    c.leadK = lead ? lead.key : null; c.gap = gap; c.lv = lv;
    // the junction ahead: may we go? (and if not, the stop line)
    let atLine = false, lineA = Infinity;
    if (!c.w.turn && c.next) {
      const uLine = c.w.L - c.s, node = c.w.to, ctrl = node.deg >= 3;
      if (uLine < 12 && c.arrT == null) c.arrT = this.t;
      if (ctrl && em) {   // through on the siren, but not into anyone already crossing
        if (uLine < 40 && this.busy(c)) v0 = Math.min(v0, 6 + uLine * 0.35);
        else if (uLine < 40 && this.signalled(node) && this.greenLeft(node, c.w.endIdx) <= 0) v0 = Math.min(v0, 11 + uLine * 0.3);
      } else if (ctrl && uLine < Math.max(25, v * v / bc + 14)) {
        if (!c.go) { if (this.mayEnter(c)) this.commit(c); }
        else if (!c.hard && !panic && this.signalled(node)) {   // the light's changed since we decided: stop if we comfortably can
          const left = this.greenLeft(node, c.w.endIdx);
          if ((left <= 0 || (left < AMBER && c.style !== "aggro")) && this.canStop(c, uLine, 0.9)) this.uncommit(c);
        }
        if (c.go && !this.canStop(c, uLine)) c.hard = true;   // too close to stop now: we're going
        if (!c.go) {
          // the line: hold our speed until it's time, then brake steadily to stop just short of it; stopped short, creep up
          atLine = true; const d = Math.max(0, uLine - hl - 0.5), need = v * v / (2 * Math.max(0.05, d));
          lineA = need > 0.45 * bc || d < 0.3 ? -need : v < 2.2 && d > 1 ? Math.min(amax * 0.6, (Math.min(2.2, Math.sqrt(1.6 * d)) - v) * 1.5) : Infinity;
          if (c.speed < 0.4) c.wait += dt;
        }
      }
    }
    // a red further along (past the junction we're in or about to cross, a short street on): brake for its line now
    if (!em && !panic && !atLine) {
      const sg = H.segs;
      for (let k = 3; k < sg.length; k += 3) {
        const l = sg[k]; if (l.turn || !this.signalled(l.to)) continue;
        const uL = sg[k + 2] + l.L; if (uL > H.len + 1) break;
        const left = this.greenLeft(l.to, l.endIdx);
        if (left <= 0 || (left < AMBER && c.style !== "aggro" && this.canStop(c, uL))) {
          const d = Math.max(0, uL - hl - 0.5), need = v * v / (2 * Math.max(0.05, d));
          if (need > 0.45 * bc) { lineA = -need; atLine = true; }
        }
        break;
      }
    }
    // in a queue (at the line, or behind someone who is): just wait
    const lc2 = lead && lead.car && lead.car.ai && lead.car.active ? lead.car : null;
    c.queued = atLine || !!(lc2 && lc2.queued && gap < 14) || !!(lc2 && lc2.w && lc2.w.turn);
    // passing: something stopped (or, for a cop, slow) in our lane, the other side clear far enough ahead
    const roomLeft = c.w.turn ? 0 : c.w.L - c.s;
    if (c.passing && em && lead && lead.car && Math.abs(lv) < 2) c.passing = { x: lead.x, z: lead.z };   // a queue: on past the next one too
    if (c.passing) {
      const q = c.passing, behind = (q.x - c.x) * fx + (q.z - c.z) * fz;
      if (behind < -5 || roomLeft < (em ? 2 : 12)) { c.passing = null; c.offT = 0; }
    } else if (lead && (em ? lv < v0 * 0.6 && gap < 30 && roomLeft > 8 : !c.queued && Math.abs(lv) < 0.6 && gap < 16 && roomLeft > 35)) {
      c.blocked += dt;
      if (c.blocked > c.patience) {
        const across = -2 * (c.w.off || 3);   // the oncoming lane's centre
        if (this.clear(c, across, H, em ? roomLeft + 6 : 60)) { c.passing = { x: lead.x, z: lead.z }; c.offT = across; c.blocked = 0; }
        else if (!em && (byPlayer || c.style !== "calm")) { if (c.honk >= 0 && this.sfx.horn) { this.sfx.horn(Math.hypot(c.x - P.x, c.z - P.z)); c.honk = -3 - this.R() * 3; } }
      }
    } else { c.blocked = Math.max(0, c.blocked - dt * 2); }
    if (c.swerve > 0) c.swerve -= dt;
    if (!c.passing && !(c.swerve > 0)) { const k = c.w.kerb ?? 1.3; c.nudge = edge ? 0.6 : Math.max(0, c.nudge - dt); c.offT = c.yieldT > 0 ? Math.min(1.3, k) : edge ? (edge > 0 ? Math.min(0.7, k) : -0.7) : (c.nudge > 0 ? c.offT : 0); }
    // IDM+: the lesser of the open-road and the following accelerations; and the steady braking the bends ahead ask for
    const vf = Math.max(0.5, Math.min(v0, bend.vNow)), T0 = em ? 0.6 : c.T, s0 = em ? 1.8 : c.s0;
    const aF = Math.max(-bc, amax * (1 - Math.pow(v / vf, 4))); let a = aF;
    if (gap < Infinity) { const sStar = s0 + Math.max(0, v * T0 + v * (v - lv) / (2 * Math.sqrt(amax * bc))); a = Math.min(a, amax * (1 - (sStar / Math.max(0.1, gap)) ** 2)); }
    c.why = a < aF - 0.05 ? "lead" : vf < v0 - 0.3 ? "bend" : "free";
    if (lineA < a) { a = lineA; c.why = "line"; }
    if (bend.need > 0.3 && -Math.min(bc * 1.6, bend.need * 1.1) < a) { a = -Math.min(bc * 1.6, bend.need * 1.1); c.why = "bend"; }
    a = Math.max(-9, a);
    // feet move at a human rate: easing on and off the pedals (and not twitching at every small change in what
    // they'd like), but straight onto the brakes when it matters
    c.at = a < -3 ? a : (c.at ?? a) + (a - (c.at ?? a)) * Math.min(1, dt * 6);
    const jUp = em ? 14 : 4.5, jDown = a < -3 ? 40 : em ? 16 : 7;
    if (v < 0.05 && c.ac < -0.6) c.ac = -0.6;
    c.ac += Math.max(-jDown * dt, Math.min(jUp * dt, c.at - c.ac));
    c.speed = Math.max(0, v + c.ac * dt);
    c.brake = c.speed < 0.3 || c.ac < -0.9 || (c.brake && c.ac < -0.35);
    // the horn: stuck behind you on foot or in a car
    if (!em) {
      if (byPlayer && c.speed < 0.4 && gap < 8) { c.honk += dt; if (c.honk > c.patience * 0.6) { c.honk = -4 - this.R() * 3; if (this.sfx.horn) this.sfx.horn(Math.hypot(c.x - P.x, c.z - P.z)); } } else if (c.honk > 0) c.honk = 0;
      if (c.honk < 0) c.honk = Math.min(0, c.honk + dt);
    }
    c.still = c.speed < 0.3 && !atLine ? c.still + dt : 0;
    // boxed in (nose against something, nothing moving): back up and have another go
    if (c.still > (em ? 2.5 : 7) && lead && gap < 3 && !panic && (em || !c.queued) && !(lc2 && lc2.speed > 0.5)) { c.rev = em ? 1.1 : 1.3 + this.R() * 0.6; c.revSteer = (alpha > 0 ? -1 : 1) * 0.55; c.still = 0; }
    // indicators: the way the next street turns, from 30 m out; left while pulling out to pass
    c.ind = em ? 0 : c.passing ? -1 : this.turnSign(c);
    this.move(c, dt, c.steer);
    // along the path: how far we went toward it, kept honest against where the car actually is
    c.s += Math.max(0, c.speed * dt * Math.cos(Math.min(1.2, Math.abs(alpha))));
    { const q = pointOn(c.w, c.s), e = (c.x - q.x) * q.dx + (c.z - q.z) * q.dz; c.s += Math.max(-0.5, Math.min(0.5, e)) * Math.min(1, dt * 4); }
    if (c.s >= c.w.L) {
      const over = c.s - c.w.L;
      if (c.w.turn) { this.uncommit(c); c.w = c.w.lane; c.next = null; c.wait = 0; c.arrT = null; c.s = over; this.entered(c); }
      else {
        const nx = c.next || this.chooseNext(c); if (!nx) { this.release(c); return false; }
        c.next = nx; if (nx.node.deg >= 3 && c.resMv !== nx) this.commit(c);   // in the box: everyone knows it
        c.w = nx; c.next = null; c.s = over; c.passing = null; c.offT = 0;
      }
    }
    return true;
  }
  // onto a new street: the way on from it, and maybe (at the end of the trip, or now and then) a space to park in
  entered(c) {
    if (c.cop && c.pursue) return;
    const arrived = !!c.dest && c.dest === c.w;
    c.next = this.chooseNext(c);
    if (!c.cop && !c.park && c.w.slots && c.w.slots.length && c.style !== "aggro" && this.R() < (arrived ? 0.7 : PARK)) {
      const sl = c.w.slots.find((q) => !q.car && q.s > c.s + 18 && q.s < c.w.L - 6); if (sl) { sl.car = c; c.park = { slot: sl, w: null }; }
    }
  }
  overlap(a, b) { const sa = Math.sin(a.a), ca = Math.cos(a.a), dx = b.x - a.x, dz = b.z - a.z, lx = dx * ca - dz * sa, lz = dx * sa + dz * ca; return Math.abs(lx) < a.S.hw + b.S.hw && Math.abs(lz) < a.S.hl + b.S.hl - 0.3; }
  // the bicycle model, and out of anything solid
  move(c, dt, steer) {
    const W = this.world; c.steer = steer;
    kin(c, dt);
    const fx = Math.sin(c.a), fz = Math.cos(c.a), L = c.S ? c.S.hl - c.S.hw : 1.45;
    let hit = 0, hx = 0, hz = 0;
    for (const k of [L, 0, -L]) {
      const q = { x: c.x + fx * k, z: c.z + fz * k }, bx = q.x, bz = q.z;
      W.grid.resolve(q, 0.95, c.y + 0.3, 1.2);
      const dx = q.x - bx, dz = q.z - bz; if (dx || dz) { c.x += dx; c.z += dz; const l = Math.hypot(dx, dz); if (l > hit) { hit = l; hx = -dx / l; hz = -dz / l; } }
    }
    if (hit > 0.02 && c.speed > 3 && this.onImpact) this.onImpact(c, c.x + hx * 1.5, c.z + hz * 1.5, -hx, -hz, c.speed);
    if (hit > 0.02) c.speed *= 0.5;
    if (c.S) ride(c, dt, W.heightAt);
  }
  runOver(c, peds, vehicles, P = { x: c.x, z: c.z }) {
    const fx = Math.sin(c.a), fz = Math.cos(c.a), co = Math.cos(c.a), sn = Math.sin(c.a);
    const hw = c.S ? c.S.hw + 0.2 : 1.15, hl = c.S ? c.S.hl : 2.3;
    const inside = (x, z) => { const rx = x - c.x, rz = z - c.z, lx = rx * co - rz * sn, lz = rx * sn + rz * co; return Math.abs(lx) < hw && lz > -hl && lz < hl + 0.3; };
    if (peds) for (const pd of peds.peds) {
      if (pd.dead || pd.inCar || !pd.h.group.visible) continue; const g = pd.h.group.position;   // (not anyone sitting in a car: their own driver least of all)
      if (!inside(g.x, g.z)) continue;
      // one hit per car per person, not one a frame while they're still under the bumper
      if (pd.hitBy === c && this.t - pd.hitT < 1.5) continue; pd.hitBy = c; pd.hitT = this.t;
      const far = Math.hypot(g.x - P.x, g.z - P.z);
      // a calm driver rolling slowly only nudges someone; it takes speed (or panic) to really hit them
      if (c.ai && !(c.panic > 0) && c.speed < 4.5) { c.speed = 0; if (peds.bump) peds.bump(pd, c.x, c.z); continue; }
      peds.damage(pd, { point: new THREE.Vector3(g.x, g.y + 0.45, g.z), dir: new THREE.Vector3(fx, 0.3, fz).normalize(), damage: c.speed * 10, from: { x: c.x, z: c.z }, force: Math.min(10, c.speed * 0.75), car: c });
      if (pd.rag && pd.rag.carry) pd.rag.carry(c);
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
  uncop(c) { c.cop = false; c.pursue = false; c.siren = false; c.deployed = false; c.target = null; c.yieldT = 0; c.croute = null; }
  // a patrol car out of sight around `near`, sent after `target` ({x, z}); returns the car or null
  spawnCop(near, target, opt = {}) {
    const lo = opt.min ?? 70, hi = opt.max ?? 140;
    const c = this.cars.find((k) => !k.active && !k.taken && !k.wreck); if (!c) return null;
    for (let tries = 0; tries < 60; tries++) {
      let r = this.R() * this.total, l = this.lanes[0]; for (const m of this.lanes) { r -= m.L; if (r <= 0) { l = m; break; } }
      const s = this.R() * l.L, p = pointOn(l, s), d = Math.hypot(p.x - near.x, p.z - near.z);
      if (d < lo || d > hi || (opt.ok && tries < 45 && !opt.ok(p))) continue;
      if (this.cars.some((o) => o.active && Math.hypot(o.x - p.x, o.z - p.z) < 12)) continue;
      this.fresh(c, MODEL.cruiser);
      Object.assign(c, { active: true, ai: true, w: l, next: null, s, x: p.x, z: p.z, y: this.world.heightAt(p.x, p.z), a: Math.atan2(p.dx, p.dz), speed: 6, steer: 0,
        wait: 0, still: 0, honk: 0, stun: 0, panic: 0, health: 100, wreck: false, go: false, bend: 0, lift: 0, taken: false });
      this.driver(c); c.v0 = 1.2; c.patience = 0.6;
      Object.assign(c, { cop: true, pursue: true, siren: true, deployed: false, target, mode: "road", occ: { shirt: NAVY, own: true } });
      this.place(c);
      return c;
    }
    return null;
  }
  // back onto the nearest lane (after cutting across to you)
  snapCop(c) {
    let best = null, bd = Infinity; const fx = Math.sin(c.a), fz = Math.cos(c.a);
    for (const l of this.lanes) for (let i = 0; i < l.pts.length - 1; i += 2) { const p = l.pts[i], n = l.pts[i + 1], d = Math.hypot(p.x - c.x, p.z - c.z) - ((n.x - p.x) * fx + (n.z - p.z) * fz) * 2; if (d < bd) { bd = d; best = { l, s: l.cum[i] }; } }
    if (best) { this.uncommit(c); c.w = best.l; c.s = best.s; c.next = null; c.arrT = null; c.off = c.offT = 0; }
  }
  /* a cop's route to you (A* over the lanes, nav.js), planned again every second or so. Aimed a little ahead of where
     you're driving, and steered off the streets the other units are already coming down (plus a bit of their own
     taste in streets), so a few cars come at you from different sides and cut you off rather than queue behind. */
  planCop(c, tx, tz, driving) {
    c.planT = 0.9 + this.R() * 0.4;
    if (driving) { const lead = Math.min(3, 1 + Math.hypot(tx - c.x, tz - c.z) / 60); tx += (driving.vx ?? Math.sin(driving.a) * driving.speed) * lead; tz += (driving.vz ?? Math.cos(driving.a) * driving.speed) * lead; }
    const from = c.w.turn ? c.w.lane : c.w, near = this.nav.nearest(tx, tz); if (!from || !near) return;
    const used = new Map();
    for (const o of this.cars) if (o !== c && o.active && o.cop && o.pursue && o.croute) o.croute.slice(0, -2).forEach((l) => used.set(l, (used.get(l) || 0) + 1));
    // either way along the street you're on (whichever's quicker to get onto: the lane past you may only be
    // reachable from round the block), and only as far along it as where you are
    const opt = { turn: 0.5, bias: (l) => (used.get(l) || 0) * 4 + ((l.nid * 7 + c.i * 13) % 5) * 0.4 };
    let r = null, best = Infinity;
    for (const goal of this.lanes) {
      if (goal.e !== near.e) continue;
      const q = this.nav.route(from, goal, opt); if (!q) continue;
      let t = 0; for (let k = 1; k < q.length - 1; k++) t += q[k].time + 2;
      if (q.length > 1) t += laneS(goal, tx, tz).s / Math.max(1, goal.cruise);   // into the last lane only as far as you
      if (q.length === 1) t = 0;
      if (t < best) { best = t; r = q; }
    }
    c.croute = r;
    // changed our mind about the next junction while there's still room to: take the new way
    if (r && !c.w.turn && c.w.L - c.s > 10) { const m = r[r.indexOf(from) + 1]; if (m && c.w.out.includes(m) && (!c.next || c.next.lane !== m)) c.next = this.mv(c.w, m); }
  }
  // no plan: whichever way out of the junction ends up nearest (x, z)
  towards(c, x, z) {
    let best = null, bd = Infinity;
    for (const m of c.w.out) { const e = m.pts[m.pts.length - 1], d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  /* a car in pursuit. On the road network while the target's far or out of sight: lane by lane along an A* route to
     you (planCop) that's planned again every second, through red lights with the siren going, but at speeds the tyres can hold through
     a bend, following slower traffic until the other side of the road is clear to pass. Close and with a clear line:
     straight at where you'll be (your speed and heading, further ahead the further off they are), up beside you on
     foot and out; in a car, onto your rear quarter for a PIT, or into you to box you in. */
  pursue(c, dt, P, vehicles) {
    const T = c.target || P, driving = vehicles && vehicles.car, tx0 = driving ? driving.x : T.x, tz0 = driving ? driving.z : T.z;
    const d = Math.hypot(tx0 - c.x, tz0 - c.z), fx = Math.sin(c.a), fz = Math.cos(c.a), W = this.world;
    if (c.stun > 0) { c.stun -= dt; c.speed *= 1 - Math.min(1, dt * 3); this.move(c, dt, 0); return; }
    if (c.rev > 0) { c.rev -= dt; c.speed += (-3 - c.speed) * Math.min(1, dt * 3); this.move(c, dt, c.revSteer); if (c.rev <= 0) { c.speed = 0; c.still = 0; } return; }
    // can they drive straight at it? close, and nothing solid in between
    if ((c.losT = (c.losT || 0) - dt) <= 0) { c.losT = 0.3; const a = new THREE.Vector3(c.x, (c.y || 0) + 0.8, c.z), b = new THREE.Vector3(tx0, (c.y || 0) + 0.8, tz0); c.los = d < 45 && W.grid.hit(a, b).t >= 1; }
    let tx, tz, want;
    if (!c.los || c.mode === "road" && d > 30) {
      // the road network: the A* route to you, driven like everyone else drives, only faster and through the lights
      if (c.mode !== "road") { c.mode = "road"; this.snapCop(c); }
      if ((c.planT = (c.planT || 0) - dt) <= 0) this.planCop(c, tx0, tz0, driving);
      if (!c.w.turn && !c.next) c.next = this.chooseNext(c, this.nextLane(c) || this.towards(c, tx0, tz0));
      this.drive(c, dt, true);
      if (c.los && d < 30) c.mode = "direct";
      return;
    } else {
      c.mode = "direct"; c.ac = 0;
      const vx = driving ? driving.vx ?? Math.sin(driving.a) * driving.speed : 0, vz = driving ? driving.vz ?? Math.cos(driving.a) * driving.speed : 0;
      const lead = driving ? Math.min(1.6, d / Math.max(8, c.speed)) : 0;
      tx = tx0 + vx * lead; tz = tz0 + vz * lead;
      if (driving) {
        // a PIT: alongside the back of your car at speed, steer into your rear quarter
        const sp = Math.hypot(vx, vz), bx = Math.sin(driving.a), bz = Math.cos(driving.a), rx = c.x - driving.x, rz = c.z - driving.z, along = rx * bx + rz * bz, lat = rx * bz - rz * bx;
        if (sp > 9 && along < 0 && along > -6 && Math.abs(lat) < 3.5) { const side = Math.sign(lat) || 1; tx = driving.x - bx * 1.6 + bz * side * 0.4; tz = driving.z - bz * 1.6 - bx * side * 0.4; want = sp + 3; }
        else want = Math.min(30, 10 + d * 1.0);
        c.stopT = d < 9 && Math.abs(driving.speed) < 2 ? (c.stopT || 0) + dt : 0; if (c.stopT > 2) { want = 0; if (c.speed < 1) c.deployed = true; }
      } else { const stopAt = 6; want = d < stopAt ? 0 : Math.min(22, (d - stopAt) * 1.5 + 2); if (d < stopAt + 0.5 && c.speed < 1) c.deployed = true; }
      // a wall in the way of the turn: slow right down
      const ahead = new THREE.Vector3(c.x + fx * Math.max(4, c.speed * 0.9), (c.y || 0) + 0.8, c.z + fz * Math.max(4, c.speed * 0.9));
      if (W.grid.hit(new THREE.Vector3(c.x, (c.y || 0) + 0.8, c.z), ahead).t < 1) want = Math.min(want, 5);
    }
    // steer for the point; brake for anything solid right in front (not for the car they're chasing)
    const ax = tx - c.x, az = tz - c.z, alpha = Math.atan2(ax * fz - az * fx, ax * fx + az * fz), Ld2 = Math.max(3, Math.hypot(ax, az));
    const st = Math.max(-0.65, Math.min(0.65, Math.atan(2 * WB * Math.sin(alpha) / Ld2)));
    c.steer += (st - c.steer) * Math.min(1, dt * 7);
    for (const o of this.cars) { if (o === c || !o.active || o.hidden || (driving && o === driving)) continue; const dx = o.x - c.x, dz = o.z - c.z, ah = dx * fx + dz * fz; if (ah > 0 && ah < 12 && Math.abs(-dx * fz + dz * fx) < 1.9) want = Math.min(want, Math.max(c.mode === "direct" ? 3 : o.speed, ah - 4)); }
    if (Math.abs(alpha) > 1.0 && c.mode === "direct") want = Math.min(want, 6);   // turning hard: slow for it
    const acc = want > c.speed ? 7.5 : -11; c.speed = Math.max(0, Math.min(want > c.speed ? want : c.speed, c.speed + acc * dt));
    c.brake = acc < 0; c.ind = 0;
    c.still = c.speed < 0.5 && want > 1 ? (c.still || 0) + dt : 0;
    if (c.still > 1.6) { c.rev = 1.1; c.revSteer = alpha > 0 ? -0.55 : 0.55; c.still = 0; }
    this.move(c, dt, c.steer);
  }
  // is the other side of the road clear far enough ahead to pull out and pass? (measured along the road, so bends count)
  clear(c, across, H = c.H, far = 60) {
    const check = (x, z) => {
      if (Math.abs(x - c.x) > 70 || Math.abs(z - c.z) > 70) return true;
      const q = hProj(H, x, z); if (q.u < -8 || q.u > far) return true;
      return q.u > H.len ? Math.abs(q.lat - across) > 6 : Math.abs(q.lat - across) > 2.6;   // past what we can see down the road: give it room
    };
    for (const o of this.cars) if (o !== c && o.active && !o.hidden && !check(o.x, o.z)) return false;
    const pc = this.V && this.V.car; if (pc && !check(pc.x, pc.z)) return false;
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
  // you on foot: don't walk through cars (any car that isn't solid on the grid)
  push(p, r) { if (this.V) this.V.pushOut(p, r); }
  // the player takes a car: it stops being traffic
  take(c) { c.ai = false; c.taken = true; }
}
