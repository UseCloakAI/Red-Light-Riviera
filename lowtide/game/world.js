/* Marlowe Keys: the island, the same every run (seeded). Not a grid: the streets
   are an authored network that bends with the coast (city/roads.js), and the
   buildings are placed along every street frontage by district, from a kit of
   types (city/types.js): Tideline's deco hotels, the Seagrape Motor Inn and the
   Nite Owl Diner; Midtown's shop rows and walk-ups round Palm Square and its
   theatre; Downtown's towers and the Ashby Tidewater building; Port Salt's sheds,
   cranes, tanks and Longshore Hall; Bellwether's houses with yards and pools.
   Behind the frontages: car parks, container yards, trees. On the streets:
   lamps, signals, palms, benches, bus stops, hydrants, power lines, parked cars.

   PS1 in spirit: low-poly, small nearest-neighbour textures tinted per vertex,
   everything merged or instanced into a few dozen draws. Collision is a spatial
   hash of boxes (axis-aligned or turned), and circles. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildRoads, Mask, promenade, PROMENADE_GLSL, SIDEWALK, KERB, at, inPoly } from "./city/roads.js?v=dev";
import { makeKit, Frame, geometry, ptex, canvas, speckle } from "./city/build.js?v=dev";
import * as TY from "./city/types.js?v=dev";
import { flat } from "./ps1.js?v=dev";
export { lanePoint, linkPath, laneEndPos } from "./city/roads.js?v=dev";

// the land's extent; the south edge is the promenade, which wanders
export const EDGE = { w: -300, e: 300, n: -300, s: 236 };
export const PIER = { x0: 36, x1: 46, z0: promenade(41) - 0.5, z1: 400, y: 0.15 };
export const SHORE = 272;
export { promenade };
/* Tideline Beach: sand from the promenade down under the sea, its waterline
   pushed in and out by slow noise so the shore has coves and spits. One function
   for the sand, the ground under your feet and the shore wall; the same in GLSL
   for the sea and the swash (sky.js). */
export const SEA = -0.6;
const coast = (x) => 0.16 * Math.sin(x * 0.021 + 1.3) + 0.09 * Math.sin(x * 0.057 + 4.1) + 0.05 * Math.sin(x * 0.13 + 0.7);
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function beachY(x, z) { const d = z - promenade(x); return -Math.max(0, d - 2) * 0.017 - Math.max(0, d - 40) * 0.01 + coast(x) * ss(10, 30, d); }
export const BEACH_GLSL = PROMENADE_GLSL + `float coast(float x){return .16*sin(x*.021+1.3)+.09*sin(x*.057+4.1)+.05*sin(x*.13+.7);}
float beachY(vec2 p){float d=p.y-promenade(p.x);return -max(0.,d-2.)*.017-max(0.,d-40.)*.01+coast(p.x)*smoothstep(10.,30.,d);}`;
export function waterline(x) { const z0 = promenade(x); let lo = z0 + 2, hi = z0 + 140; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (beachY(x, m) > SEA) lo = m; else hi = m; } return lo; }
// the island's outline: a rocky north shore, the east shore, the promenade, the port's straight quay
export function islandOutline() {
  const P = [], north = (x) => -292 + 8 * Math.sin(x * 0.02 + 1) + 5 * Math.sin(x * 0.051), east = (z) => 296 + 6 * Math.sin(z * 0.017 + 2) + 3 * Math.sin(z * 0.05);
  for (let x = -300; x <= 300; x += 12) P.push({ x, z: north(x) });
  for (let z = north(300) + 10; z < promenade(296) - 2; z += 12) P.push({ x: east(z), z });
  for (let x = 298; x >= -300; x -= 8) P.push({ x, z: promenade(x) });
  for (let z = promenade(-300) - 10; z > north(-300); z -= 20) P.push({ x: -300, z });
  return P;
}

function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- districts ---------- */
export const DISTRICT_NAMES = { port: "Port Salt", tideline: "Tideline", downtown: "Downtown", park: "Palm Square", midtown: "Midtown", bellwether: "Bellwether", beach: "Tideline Beach", pier: "Tideline Pier" };
const DC = [10, -172], DANG = -0.12;
export function districtOf(x, z) {
  if (x > PIER.x0 && x < PIER.x1 && z > promenade(x)) return "pier";
  if (z > promenade(x)) return "beach";
  if (x < -206) return "port";
  if (Math.hypot(x - 10, z - 10) < 40) return "park";
  const u = (x - DC[0]) * Math.cos(DANG) + (z - DC[1]) * Math.sin(DANG), v = -(x - DC[0]) * Math.sin(DANG) + (z - DC[1]) * Math.cos(DANG);
  if (Math.abs(u) < 178 && v < 78) return "downtown";
  if (z > promenade(x) - 52) return "tideline";
  if (x > 92 && z > -62) return "bellwether";
  return "midtown";
}

/* ---------- collision: spatial hash of boxes (straight or turned) and circles ---------- */
class Grid {
  constructor(cell) { this.c = cell; this.m = new Map(); this.all = []; }
  _cells(x0, z0, x1, z1, fn) {
    const c = this.c;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) fn(i + "," + k);
  }
  add(o) {
    this.all.push(o);
    const e = o.ob ? Math.abs(o.hx * o.cs) + Math.abs(o.hz * o.sn) : 0, f = o.ob ? Math.abs(o.hx * o.sn) + Math.abs(o.hz * o.cs) : 0;
    const [x0, z0, x1, z1] = o.r ? [o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r] : o.ob ? [o.cx - e, o.cz - f, o.cx + e, o.cz + f] : [o.x0, o.z0, o.x1, o.z1];
    this._cells(x0, z0, x1, z1, k => { let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(o); });
  }
  remove(o) {
    const i = this.all.indexOf(o); if (i < 0) return; this.all.splice(i, 1);
    for (const a of this.m.values()) { const k = a.indexOf(o); if (k >= 0) a.splice(k, 1); }
  }
  box(x0, z0, x1, z1, h) { const o = { x0, z0, x1, z1, h: h === undefined ? 50 : h }; this.add(o); return o; }
  // a turned box: centre, half sizes along its own axes, angle (radians, x toward z)
  obb(cx, cz, hx, hz, ang, h, y0) { const o = { ob: true, cx, cz, hx, hz, cs: Math.cos(ang), sn: Math.sin(ang), h, y0 }; this.add(o); return o; }
  circle(x, z, r, h) { const o = { x, z, r, h: h || 3 }; this.add(o); return o; }
  near(x0, z0, x1, z1) {
    const out = new Set();
    this._cells(x0, z0, x1, z1, k => { const a = this.m.get(k); if (a) for (const o of a) out.add(o); });
    return out;
  }
  // push a circle at (p.x, p.z) out of everything it overlaps, below height y + tall
  resolve(p, r, y, tall) {
    for (const o of this.near(p.x - r, p.z - r, p.x + r, p.z + r)) {
      if (y > o.h || y + tall < (o.y0 || -10)) continue;
      if (o.r) {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = r + o.r;
        if (d < m && d > 1e-6) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); }
        continue;
      }
      // work in the box's own frame (identity for a straight box)
      let lx, lz, x0, z0, x1, z1;
      if (o.ob) { const dx = p.x - o.cx, dz = p.z - o.cz; lx = dx * o.cs + dz * o.sn; lz = -dx * o.sn + dz * o.cs; x0 = -o.hx; x1 = o.hx; z0 = -o.hz; z1 = o.hz; }
      else { lx = p.x; lz = p.z; x0 = o.x0; x1 = o.x1; z0 = o.z0; z1 = o.z1; }
      const cx = Math.max(x0, Math.min(lx, x1)), cz = Math.max(z0, Math.min(lz, z1));
      let dx = lx - cx, dz = lz - cz; const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      let mx = 0, mz = 0;
      if (d > 1e-6) { mx = dx / d * (r - d); mz = dz / d * (r - d); }
      else {   // centre inside the box: leave by the nearest face
        const l = lx - x0, rr = x1 - lx, t = lz - z0, b = z1 - lz, m = Math.min(l, rr, t, b);
        if (m === l) mx = x0 - r - lx; else if (m === rr) mx = x1 + r - lx; else if (m === t) mz = z0 - r - lz; else mz = z1 + r - lz;
      }
      if (o.ob) { p.x += mx * o.cs - mz * o.sn; p.z += mx * o.sn + mz * o.cs; } else { p.x += mx; p.z += mz; }
    }
  }
  // slab test of segment a->b against a box (local frame if turned); returns [t, axis, sign]
  _slab(o, a, b) {
    let ax = a.x, az = a.z, bx = b.x, bz = b.z, x0, z0, x1, z1;
    if (o.ob) { const f = (x, z) => [(x - o.cx) * o.cs + (z - o.cz) * o.sn, -(x - o.cx) * o.sn + (z - o.cz) * o.cs]; [ax, az] = f(a.x, a.z); [bx, bz] = f(b.x, b.z); x0 = -o.hx; x1 = o.hx; z0 = -o.hz; z1 = o.hz; }
    else { x0 = o.x0; x1 = o.x1; z0 = o.z0; z1 = o.z1; }
    let t0 = 0, t1 = 1, axis = -1, sgn = 0;
    const slabs = [[ax, bx - ax, x0, x1], [a.y, b.y - a.y, o.y0 || -10, o.h], [az, bz - az, z0, z1]];
    for (let k = 0; k < 3; k++) {
      const [s, d, lo, hi] = slabs[k];
      if (Math.abs(d) < 1e-9) { if (s < lo || s > hi) return null; continue; }
      let u = (lo - s) / d, v = (hi - s) / d, sg = -1; if (u > v) { [u, v] = [v, u]; sg = 1; }
      if (u > t0) { t0 = u; axis = k; sgn = sg; } t1 = Math.min(t1, v); if (t0 > t1) return null;
    }
    return [t0, axis, sgn];
  }
  // bullets: first box or post along a->b, with the face normal it struck
  hit(a, b) {
    let best = 1, nx = 0, nz = 0, ny = 0;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const o of this.near(Math.min(a.x, b.x) - 1, Math.min(a.z, b.z) - 1, Math.max(a.x, b.x) + 1, Math.max(a.z, b.z) + 1)) {
      if (o.r) {
        const fx = a.x - o.x, fz = a.z - o.z, A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - o.r * o.r, disc = B * B - 4 * A * C;
        if (A < 1e-9 || disc < 0) continue;
        const t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t < 0 || t >= best || a.y + dy * t > o.h) continue;
        best = t; const hx = a.x + dx * t - o.x, hz = a.z + dz * t - o.z, l = Math.hypot(hx, hz) || 1; nx = hx / l; nz = hz / l; ny = 0;
        continue;
      }
      const r = this._slab(o, a, b); if (!r || r[1] < 0 || r[0] >= best) continue;
      best = r[0]; let lx = r[1] === 0 ? r[2] : 0, lz = r[1] === 2 ? r[2] : 0; ny = r[1] === 1 ? r[2] : 0;
      if (o.ob) { nx = lx * o.cs - lz * o.sn; nz = lx * o.sn + lz * o.cs; } else { nx = lx; nz = lz; }
    }
    return { t: best, nx, ny, nz };
  }
  // fraction along a->b where the segment first hits a box (camera collision)
  ray(a, b) {
    let best = 1;
    for (const o of this.near(Math.min(a.x, b.x) - 1, Math.min(a.z, b.z) - 1, Math.max(a.x, b.x) + 1, Math.max(a.z, b.z) + 1)) {
      if (o.r) continue;
      const r = this._slab(o, a, b); if (r && r[0] < best) best = r[0];
    }
    return best;
  }
}

/* ---------- small instanced things ---------- */
function instanced(scene, geo, mat, list, opt = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((it, n) => { q.setFromAxisAngle(up, it.a || 0); s.setScalar(it.s || 1); m.compose(p.set(it.x, it.y || 0, it.z), q, s); im.setMatrixAt(n, m); if (it.c !== undefined) im.setColorAt(n, c.set(it.c)); });
  im.castShadow = !!opt.cast; im.receiveShadow = false; im.matrixAutoUpdate = false; im.frustumCulled = false; scene.add(im);
  return im;
}
const L = (o) => new THREE.MeshLambertMaterial(o);

/* ---------- the city ---------- */
// a breath between heavy steps, so the loading screen keeps moving
const breathe = () => new Promise((r) => { let done = false; requestAnimationFrame(() => { done = true; r(); }); setTimeout(() => { if (!done) r(); }, 60); });
// a polygon into a mask, through a canvas (far quicker than testing every cell)
function rasterPoly(mask, P, v) {
  const c = document.createElement("canvas"); c.width = mask.w; c.height = mask.h;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.beginPath();
  P.forEach((p, k) => (k ? g.lineTo(p.x - mask.x0, p.z - mask.z0) : g.moveTo(p.x - mask.x0, p.z - mask.z0))); g.closePath(); g.fill();
  const d = g.getImageData(0, 0, mask.w, mask.h).data; for (let i = 0; i < mask.w * mask.h; i++) if (d[i * 4 + 3] > 127) mask.a[i] = v;
}
export async function buildWorld(scene, opts = {}) {
  const R = seeded(20261124), grid = new Grid(16);
  const add = (mesh, cast, recv) => { mesh.castShadow = !!cast; mesh.receiveShadow = !!recv; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); scene.add(mesh); return mesh; };
  const X0 = EDGE.w - 20, Z0 = EDGE.n - 20, X1 = EDGE.e + 20, Z1 = EDGE.s + 10;
  const outline = islandOutline();
  // rasters at 1 m: road and pavement, land, and what's been built on
  const mask = new Mask(X0, Z0, X1, Z1), land = new Mask(X0, Z0, X1, Z1), occ = new Mask(X0, Z0, X1, Z1);
  rasterPoly(land, outline, 1);
  const roads = buildRoads(mask);
  await breathe();
  const kit = makeKit(R), B = kit.B;
  const map = { outline, roads: roads.edges.map((e) => ({ pts: e.pl.pts, w: e.w, kind: e.kind })), buildings: [], parks: [], lots: [], pools: [], labels: [] };

  /* ---- roads: ribbons, junction discs, pavements with kerbs, rounded corners, crossings ---- */
  const roadTex = ptex(canvas(96, 64, (g) => {   // three columns: avenue, street, port
    for (let c = 0; c < 3; c++) {
      const x = c * 32; g.fillStyle = "#3d3e47"; g.fillRect(x, 0, 32, 64);
      speckle(g, 32, 64, 0, 0, R); for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(${R() < .5 ? "0,0,0" : "255,255,255"},${0.12 * R()})`; g.fillRect(x + ((R() * 32) | 0), (R() * 64) | 0, 1, 1); }
      if (c < 2) { g.fillStyle = "#cfcac0"; g.fillRect(x + 1, 0, 1, 64); g.fillRect(x + 30, 0, 1, 64); }
      if (c === 0) { g.fillStyle = "#d8a63a"; g.fillRect(x + 15, 0, 1, 64); g.fillRect(x + 17, 0, 1, 64); }
      if (c === 1) { g.fillStyle = "#d8d2c4"; g.fillRect(x + 16, 0, 1, 26); }
      if (R() < 2) { g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(x + 5, 0, 4, 64); g.fillRect(x + 23, 0, 4, 64); }   // tyre wear
    }
  }));
  roadTex.wrapS = THREE.ClampToEdgeWrapping;
  const walkTex = ptex(canvas(32, 32, (g) => { g.fillStyle = "#a9a49b"; g.fillRect(0, 0, 32, 32); speckle(g, 32, 32, 140, 0.14, R); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32); }));
  const RB = { p: [], n: [], u: [], c: [] }, WB = { p: [], n: [], u: [], c: [] }, white = new THREE.Color(1, 1, 1), kerbCol = new THREE.Color(0.78, 0.76, 0.72);
  const push = (Bf, a, b, c, d, n, uv, col) => { for (const [v, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [d, uv[3]]]) { Bf.p.push(v[0], v[1], v[2]); Bf.n.push(...n); Bf.u.push(t[0], t[1]); Bf.c.push(col.r, col.g, col.b); } };
  // a strip along a polyline between two sideways offsets
  const strip = (Bf, pl, o0, o1, y, u0, u1, vScale, col, kerb) => {
    const P = pl.pts, n = P.length, N = [];
    for (let i = 0; i < n; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; N.push([-dz / l, dx / l]); }
    for (let i = 1; i < n; i++) {
      const A = P[i - 1], Bq = P[i], na = N[i - 1], nb = N[i], va = pl.cum[i - 1] / vScale, vb = pl.cum[i] / vScale;
      const a0 = [A.x + na[0] * o0, y, A.z + na[1] * o0], a1 = [A.x + na[0] * o1, y, A.z + na[1] * o1], b0 = [Bq.x + nb[0] * o0, y, Bq.z + nb[1] * o0], b1 = [Bq.x + nb[0] * o1, y, Bq.z + nb[1] * o1];
      push(Bf, a0, a1, b1, b0, [0, 1, 0], [[u0, va], [u1, va], [u1, vb], [u0, vb]], col);
      if (kerb) {   // the kerb face on the road side
        const ko = kerb > 0 ? o0 : o1, k0 = [A.x + na[0] * ko, GROUND_Y, A.z + na[1] * ko], k1 = [Bq.x + nb[0] * ko, GROUND_Y, Bq.z + nb[1] * ko];
        const kn = [na[0] * -kerb, 0, na[1] * -kerb];
        if (kerb > 0) push(Bf, k1, k0, [k0[0], y, k0[2]], [k1[0], y, k1[2]], kn, [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], kerbCol);
        else push(Bf, k0, k1, [k1[0], y, k1[2]], [k0[0], y, k0[2]], kn, [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], kerbCol);
      }
    }
  };
  const COL = { avenue: 0, ring: 0, street: 1, port: 2 };
  // the flat layers sit just under walking height (0), a real gap apart: blood, scorches and shadows laid at 0 and up sit over all of them
  const GROUND_Y = -0.09, ROAD_Y = -0.06, DISC_Y = -0.045, ZEBRA_Y = -0.03;
  // each junction's asphalt patch reaches as far as its roads overlap (further where they meet at a sharp angle),
  // and the road ribbons stop just inside it, so no two road surfaces ever share the same patch of ground
  const discR = new Map();
  for (const n of roads.nodes) {
    if (n.deg === 1) { discR.set(n, n.ends[0].e.w / 2); continue; }
    let r = n.r - SIDEWALK + 0.5;
    for (let k = 0; k < n.ends.length; k++) {
      const A = n.ends[k], Bn = n.ends[(k + 1) % n.ends.length], th = Math.acos(Math.max(-1, Math.min(1, A.dir.x * Bn.dir.x + A.dir.z * Bn.dir.z)));
      r = Math.max(r, (A.e.w + Bn.e.w) / 4 / Math.tan(Math.max(0.2, th) / 2) + 0.5);
    }
    discR.set(n, Math.min(r, 24));
  }
  const trimmed = (e, s0, s1, step = 3) => { const tr = { pts: [], cum: [0] }; for (let s = s0; ; s += Math.min(step, Math.max(0.5, s1 - s))) { const p = at(e.pl, Math.min(s, s1)); tr.pts.push({ x: p.x, z: p.z }); if (s >= s1) break; } for (let i = 1; i < tr.pts.length; i++) tr.cum.push(tr.cum[i - 1] + Math.hypot(tr.pts[i].x - tr.pts[i - 1].x, tr.pts[i].z - tr.pts[i - 1].z)); return tr; };
  for (const e of roads.edges) {
    const c = COL[e.kind] ?? 1, A = roads.nodes.find((n) => n.id === e.a), Bn = roads.nodes.find((n) => n.id === e.b);
    const r0 = A.deg > 1 ? discR.get(A) - 0.6 : 0, r1 = Bn.deg > 1 ? discR.get(Bn) - 0.6 : 0;
    if (e.L - r1 > r0 + 0.5) { const tr = trimmed(e, r0, e.L - r1); if (tr.pts.length > 1) strip(RB, tr, -e.w / 2, e.w / 2, ROAD_Y, c / 3 + 0.001, (c + 1) / 3 - 0.001, 8, white); }
    if (e.s1 > e.s0 + 0.5) {
      const tr = trimmed(e, e.s0, e.s1);
      if (tr.pts.length > 1) { strip(WB, tr, e.w / 2, e.w / 2 + SIDEWALK, KERB, 0, 1, 3, white, 1); strip(WB, tr, -e.w / 2 - SIDEWALK, -e.w / 2, KERB, 0, 1, 3, white, -1); }
    }
  }
  // corners and dead-end turning circles: pavement between an inner and an outer curve
  const fan = (inner, outer, y) => {
    for (let i = 1; i < inner.length; i++) {
      const a = [inner[i - 1].x, y, inner[i - 1].z], b = [inner[i].x, y, inner[i].z], c = [outer[i].x, y, outer[i].z], d = [outer[i - 1].x, y, outer[i - 1].z];
      push(WB, a, b, c, d, [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], white); push(WB, a, d, c, b, [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]], white);
      push(WB, [a[0], GROUND_Y, a[2]], [b[0], GROUND_Y, b[2]], b, a, [0, 0, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], kerbCol); push(WB, [b[0], GROUND_Y, b[2]], [a[0], GROUND_Y, a[2]], a, b, [0, 0, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], kerbCol);
    }
  };
  for (const c of roads.corners) fan(c.inner, c.outer, KERB);
  for (const c of roads.caps) fan(c.inner, c.outer, KERB);
  add(new THREE.Mesh(geometry(RB), L({ map: roadTex, vertexColors: true, ...flat() })), false, true);
  const walkMat = L({ map: walkTex, vertexColors: true, side: THREE.DoubleSide, ...flat() });
  add(new THREE.Mesh(geometry(WB), walkMat), false, true);
  // junctions: plain asphalt discs over the ribbon ends
  const discs = [];
  for (const n of roads.nodes) discs.push(new THREE.CircleGeometry(discR.get(n), 32).rotateX(-Math.PI / 2).translate(n.x, DISC_Y, n.z));   // the roadway only; kerb corners sit over the rest
  const plainRoad = ptex(canvas(16, 16, (g) => { g.fillStyle = "#3d3e47"; g.fillRect(0, 0, 16, 16); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${R() < .5 ? "0,0,0" : "255,255,255"},${0.12 * R()})`; g.fillRect((R() * 16) | 0, (R() * 16) | 0, 1, 1); } }));
  plainRoad.repeat.set(0.25, 0.25);
  const discGeo = mergeGeometries(discs); { const p = discGeo.attributes.position, uv = discGeo.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / 4, p.getZ(k) / 4); }
  add(new THREE.Mesh(discGeo, L({ map: plainRoad, ...flat(-1) })), false, true);
  // zebra crossings
  const zeb = [];
  for (const z of roads.zebras) for (let k = -z.w / 2 + 0.8; k < z.w / 2 - 0.4; k += 1.2) zeb.push({ x: z.x + Math.cos(z.ang) * k, y: ZEBRA_Y, z: z.z - Math.sin(z.ang) * k, a: z.ang });
  instanced(scene, new THREE.PlaneGeometry(0.6, 2.6).rotateX(-Math.PI / 2), L({ color: 0xd8d2c4, ...flat(-2) }), zeb);
  await breathe();

  /* ---- district helpers ---- */
  const district = districtOf;
  const sideFree = (pts) => pts.every(([x, z]) => mask.get(x, z) === 0 && occ.get(x, z) === 0 && land.get(x, z) === 1 && z < promenade(x) - 1.5);
  const footprint = (F, W, D, step = 2) => { const out = []; for (let i = 0; i <= Math.ceil(W / step); i++) for (let j = 0; j <= Math.ceil(D / step); j++) { const p = F.p(Math.min(W, i * step), Math.min(D, j * step), 0); out.push([p[0], p[2]]); } return out; };
  const corners4 = (F, W, D, pad = 0) => [F.p(-pad, -pad, 0), F.p(W + pad, -pad, 0), F.p(W + pad, D + pad, 0), F.p(-pad, D + pad, 0)].map((p) => ({ x: p[0], z: p[2] }));
  // a solid box in a building's frame, for collision
  const solid = (F, u0, u1, v0, v1, h) => {
    const c = F.p((u0 + u1) / 2, (v0 + v1) / 2, 0), ang = Math.atan2(F.t[2], F.t[0]);
    grid.obb(c[0], c[2], (u1 - u0) / 2, (v1 - v0) / 2, ang, h);
  };
  const lotsToPaint = [], specials = new Set(), cars = [];

  // what goes on a frontage, by district; specials (one of each) first where they fit
  function choose(d, e, R) {
    if (d === "tideline") {
      if (!specials.has("motel") && e.name === "Tideline Avenue") return { t: "motel", W: 42, D: 30, set: 0 };
      if (!specials.has("diner") && e.name === "Tideline Avenue" && specials.has("motel")) return { t: "diner", W: 18, D: 9, set: 2 };
      return R() < 0.62 ? { t: "deco", W: 18 + R() * 10, D: 16 + R() * 8, set: R() * 1.5 } : { t: "shop", W: 9 + R() * 6, D: 12 + R() * 4, set: 0, floors: 1 + ((R() * 2) | 0) };
    }
    if (d === "downtown") {
      if (!specials.has("ashby") && e.name === "Ashby Boulevard") return { t: "ashby", W: 34, D: 34, set: 1.5 };
      if (!specials.has("garage") && R() < 0.15) return { t: "garage", W: 26, D: 30, set: 1 };
      return R() < 0.55 ? { t: "tower", W: 24 + R() * 12, D: 24 + R() * 12, set: 1 + R() * 2 } : { t: "office", W: 16 + R() * 10, D: 16 + R() * 10, set: 0.5 };
    }
    if (d === "port") {
      if (!specials.has("hall") && e.name === "Harbor Road") return { t: "hall", W: 26, D: 18, set: 2 };
      return R() < 0.8 ? { t: "ware", W: 28 + R() * 22, D: 22 + R() * 16, set: 3 + R() * 3 } : { t: "shop", W: 10 + R() * 6, D: 12, set: 1, floors: 1 };
    }
    if (d === "bellwether") return R() < 0.85 ? { t: "house", W: 14 + R() * 4, D: 20 + R() * 6, set: 0.5 } : { t: "apt", W: 16 + R() * 6, D: 14 + R() * 4, set: 2, floors: 2 + ((R() * 2) | 0) };
    if (d === "park") return !specials.has("theatre") ? { t: "theatre", W: 22, D: 26, set: 1 } : { t: "shop", W: 10 + R() * 6, D: 14, set: 0, floors: 2 + ((R() * 2) | 0) };
    if (!specials.has("gas") && (e.name === "Salt Street" || e.name === "Causeway Road")) return { t: "gas", W: 30, D: 26, set: 0.5 };
    return R() < 0.55 ? { t: "shop", W: 9 + R() * 8, D: 12 + R() * 6, set: 0 } : { t: "apt", W: 16 + R() * 10, D: 14 + R() * 6, set: 0.5 };
  }
  function place(F, W, D, c, d) {
    let r;
    switch (c.t) {
      case "deco": r = TY.decoHotel(kit, F, W, D, R); break;
      case "motel": r = TY.motel(kit, F, W, D, R); specials.add("motel"); break;
      case "diner": r = TY.diner(kit, F, W, D, R); specials.add("diner"); break;
      case "shop": r = TY.shopRow(kit, F, W, D, R, { floors: c.floors }); break;
      case "apt": r = TY.apartment(kit, F, W, D, R, { floors: c.floors }); break;
      case "tower": r = TY.tower(kit, F, W, D, R); break;
      case "ashby": r = TY.tower(kit, F, W, D, R, { h: 152, name: "ASHBY TIDEWATER" }); specials.add("ashby"); break;
      case "office": r = TY.office(kit, F, W, D, R); break;
      case "garage": r = TY.garage(kit, F, W, D, R); specials.add("garage"); break;
      case "ware": r = TY.warehouse(kit, F, W, D, R); break;
      case "hall": r = TY.longshoreHall(kit, F, W, D, R); specials.add("hall"); break;
      case "house": r = TY.house(kit, F, W, D, R); break;
      case "theatre": r = TY.theatre(kit, F, W, D, R); specials.add("theatre"); break;
      case "gas": r = TY.gasStation(kit, F, W, D, R); specials.add("gas"); break;
    }
    const big = c.t === "motel" || c.t === "gas" || c.t === "house";
    if (r.solid) for (const s of r.solid) solid(F, ...s);
    else if (c.t === "motel") solid(F, 0, W, D - 11, D, r.h);
    else if (c.t === "house") solid(F, 0, W, 0.5, Math.min(D, 13), r.h);
    else solid(F, 0, W, 0, D, r.h);
    if (!big || c.t === "house") map.buildings.push({ pts: corners4(F, W, c.t === "house" ? Math.min(D, 13) : D), h: r.h, d });
    else map.buildings.push({ pts: c.t === "motel" ? [F.p(0, D - 11, 0), F.p(W, D - 11, 0), F.p(W, D, 0), F.p(0, D, 0)].map((p) => ({ x: p[0], z: p[2] })) : corners4(F, W, D), h: r.h, d });
    if (r.lot) lotsToPaint.push({ F, ...r.lot, cars: true });
    if (r.pool) map.pools.push([F.p(r.pool.u0, r.pool.v0, 0), F.p(r.pool.u1, r.pool.v0, 0), F.p(r.pool.u1, r.pool.v1, 0), F.p(r.pool.u0, r.pool.v1, 0)].map((p) => ({ x: p[0], z: p[2] })));
    if (r.yard) lotsToPaint.push({ F, u0: 0, u1: W, v0: 0, v1: D, yard: true });
    occ.poly(corners4(F, W, D, 1.2), 1);
  }
  // walk every street's frontage, both sides, placing parcels that fit
  const C10 = { x: 10, z: 10 };
  for (const e of roads.edges) {
    if (e.kind === "port" && R() < 0.3) continue;
    for (const s of [1, -1]) {
      if (e.kind === "ring") { const m = at(e.pl, e.L / 2); if (Math.hypot(m.x + m.nx * s * 10 - C10.x, m.z + m.nz * s * 10 - C10.z) < Math.hypot(m.x - C10.x, m.z - C10.z)) continue; }
      let t = e.s0 + 2;
      while (t < e.s1 - 6) {
        const p0 = at(e.pl, t), d = district(p0.x + p0.nx * s * (e.w / 2 + 8), p0.z + p0.nz * s * (e.w / 2 + 8));
        if (d === "beach" || d === "pier") { t += 6; continue; }
        const c = choose(d, e, R); let ok = false;
        for (const k of [1, 0.75, 0.55]) {
          const W = Math.max(8, c.W * (k < 1 && c.t !== "motel" && c.t !== "ashby" ? k : 1)), D = Math.max(8, c.D * (k < 0.7 ? 0.75 : 1));
          if (t + W > e.s1 - 2) continue;
          const pc = at(e.pl, t + W / 2), nx = pc.nx * s, nz = pc.nz * s, off = e.w / 2 + SIDEWALK + 0.4 + c.set;
          const F = new Frame(pc.x + nx * off - (-nz) * W / 2, pc.z + nz * off - nx * W / 2, nx, nz);
          if (!sideFree(footprint(F, W, D))) continue;
          place(F, W, D, c, d); t += W + (d === "downtown" ? 3 : d === "bellwether" ? 1.5 : 0.4 + R() * 2); ok = true; break;
        }
        if (!ok) t += 3;
      }
    }
  }
  // geometry from the kit: one mesh per material for everything laid down since the last flush
  const flush = () => { for (const [k, Bf] of Object.entries(B)) { const n0 = Bf.done || 0; if (Bf.p.length > n0) { add(new THREE.Mesh(geometry({ p: Bf.p.slice(n0), n: Bf.n.slice(n0), u: Bf.u.slice(n0 / 3 * 2), c: Bf.c.slice(n0) }), kit.M[k]), false, true); Bf.done = Bf.p.length; } } };
  flush();
  await breathe();

  /* ---- behind the frontages: car parks, container yards, trees ---- */
  const trees = [], palms = [], containers = [];
  for (let z = EDGE.n + 6; z < EDGE.s - 6; z += 11) for (let x = EDGE.w + 6; x < EDGE.e - 6; x += 11) {
    const free = (r) => { for (let i = -r; i <= r; i += 2) for (let j = -r; j <= r; j += 2) if (mask.get(x + i, z + j) || occ.get(x + i, z + j) || !land.get(x + i, z + j) || z + j > promenade(x + i) - 2) return false; return true; };
    const d = district(x, z);
    if (d === "port" && free(8)) {   // a block of container stacks
      for (let r = -1; r <= 1; r++) { const h = 1 + ((R() * 3) | 0); for (let k = 0; k < h; k++) containers.push({ x, y: 1.3 + k * 2.6, z: z + r * 2.6, c: [0xB5462F, 0x2F6E8C, 0xD9A441, 0x3F7A4A, 0x8C8F94, 0xC2633B][(R() * 6) | 0] }); grid.box(x - 6.1, z + r * 2.6 - 1.22, x + 6.1, z + r * 2.6 + 1.22, h * 2.6); }
      occ.poly([{ x: x - 7, z: z - 5 }, { x: x + 7, z: z - 5 }, { x: x + 7, z: z + 5 }, { x: x - 7, z: z + 5 }], 1);
    } else if ((d === "midtown" || d === "downtown" || d === "tideline") && free(7) && R() < 0.55) {
      const F = new Frame(x + 8, z - 8, 0, 1); lotsToPaint.push({ F, u0: 0, u1: 16, v0: 0, v1: 16, cars: true }); occ.poly([{ x: x - 8, z: z - 8 }, { x: x + 8, z: z - 8 }, { x: x + 8, z: z + 8 }, { x: x - 8, z: z + 8 }], 1);
    } else if ((d === "bellwether" || d === "midtown" || d === "park") && free(3) && R() < 0.5) {
      trees.push({ x: x + (R() - 0.5) * 4, z: z + (R() - 0.5) * 4, s: 0.8 + R() * 0.5, a: R() * 6 }); occ.poly([{ x: x - 2, z: z - 2 }, { x: x + 2, z: z - 2 }, { x: x + 2, z: z + 2 }, { x: x - 2, z: z + 2 }], 1);
    }
  }
  instanced(scene, new THREE.BoxGeometry(12.2, 2.59, 2.44), L({ color: 0xffffff }), containers);
  // parked cars in the car parks
  for (const l of lotsToPaint) if (l.cars) for (let u = l.u0 + 1.5; u < l.u1 - 2; u += 2.8) if (R() < 0.6) { const p = l.F.p(u + 1.2, l.v0 + 3.2, 0); cars.push({ x: p[0], z: p[2], a: Math.atan2(l.F.n[0], l.F.n[2]) }); }

  /* ---- the street: lamps, palms, trees, signals, benches, bins, hydrants, bus stops, power lines, parked cars ---- */
  const lamps = [], benches = [], bins = [], hydrants = [], poles = [], wires = [], signals = [];
  for (const e of roads.edges) {
    const dist = district(at(e.pl, e.L / 2).x, at(e.pl, e.L / 2).z);
    for (const s of [1, -1]) {
      let last = null;
      for (let t = e.s0 + 6 + (s > 0 ? 0 : 13); t < e.s1 - 4; t += 26) {
        const p = at(e.pl, t), o = e.w / 2 + 0.6, x = p.x + p.nx * s * o, z = p.z + p.nz * s * o;
        if (z > promenade(x) - 0.5 && e.name !== "Tideline Avenue") continue;
        lamps.push([x, z, -p.nx * s, -p.nz * s]);
      }
      // palms on the beach side of Tideline Avenue and along Ashby Boulevard; trees in Bellwether
      if ((e.name === "Tideline Avenue" && s === (at(e.pl, 1).nz > 0 ? 1 : -1)) || e.name === "Ashby Boulevard")
        for (let t = e.s0 + 4; t < e.s1 - 3; t += 13 + R() * 3) { const p = at(e.pl, t), o = e.w / 2 + SIDEWALK - 0.7; palms.push([p.x + p.nx * s * o, p.z + p.nz * s * o]); }
      if (dist === "bellwether" || (dist === "midtown" && R() < 0.4))
        for (let t = e.s0 + 8; t < e.s1 - 4; t += 15 + R() * 6) { const p = at(e.pl, t), o = e.w / 2 + SIDEWALK - 0.6; trees.push({ x: p.x + p.nx * s * o, z: p.z + p.nz * s * o, s: 0.6 + R() * 0.3, a: R() * 6 }); }
      // benches, bins and hydrants on the pavement's outer edge
      for (let t = e.s0 + 10 + R() * 20; t < e.s1 - 6; t += 30 + R() * 40) {
        const p = at(e.pl, t), o = e.w / 2 + SIDEWALK - 0.45, x = p.x + p.nx * s * o, z = p.z + p.nz * s * o, a = Math.atan2(-p.nx * s, -p.nz * s), r = R();
        if (r < 0.4) { benches.push({ x, z, a }); grid.obb(x, z, 0.9, 0.3, -a, 0.5); }
        else if (r < 0.75) { bins.push({ x, z }); grid.circle(x, z, 0.3, 1); }
        else { const o2 = e.w / 2 + 0.5; const hx = p.x + p.nx * s * o2, hz = p.z + p.nz * s * o2; hydrants.push({ x: hx, z: hz, obj: grid.circle(hx, hz, 0.2, 0.8) }); }
      }
      // power poles and sagging lines in the port and Bellwether
      if ((dist === "port" || dist === "bellwether") && s === 1) {
        for (let t = e.s0 + 5; t < e.s1 - 3; t += 32) { const p = at(e.pl, t), o = e.w / 2 + SIDEWALK - 0.3, q = [p.x + p.nx * o, p.z + p.nz * o, Math.atan2(p.tx, p.tz)]; if (last) for (const dy of [9.2, 8.6]) wires.push([last, q, dy]); poles.push({ x: q[0], z: q[1], a: q[2] }); grid.circle(q[0], q[1], 0.18, 10); last = q; }
      }
      // parked cars along the kerb of ordinary streets
      if (e.kind === "street" && e.w >= 9) for (let t = e.s0 + 6; t < e.s1 - 6; t += 6.5 + R() * 6) if (R() < 0.42) {
        const p = at(e.pl, t), o = e.w / 2 - 1.2, x = p.x + p.nx * s * o, z = p.z + p.nz * s * o, a = Math.atan2(p.tx * s, p.tz * s);
        cars.push({ x, z, a });
      }
    }
  }
  // traffic signals on the avenues' junctions
  for (const n of roads.nodes) if (n.deg >= 3 && n.ends.some((d) => d.e.kind === "avenue")) for (const d of n.ends) {
    const o = d.e.w / 2 + 0.7, x = d.p.x + d.n.x * o, z = d.p.z + d.n.z * o; signals.push({ x, z, a: Math.atan2(-d.dir.x, -d.dir.z), go: (n.ends.indexOf(d) % 2) === 0, node: n, end: n.ends.indexOf(d) }); grid.circle(x, z, 0.15, 6);
  }
  for (const c of cars) c.obb = grid.obb(c.x, c.z, 0.95, 2.2, -c.a, 1.5);   // a turn of a about y puts local x on angle -a
  for (const t of trees) grid.circle(t.x, t.z, 0.35, 8);
  for (const [x, z] of palms) grid.circle(x, z, 0.3, 9);

  // Palm Square: a plaza, a three-tier fountain, palms in a ring, benches facing in
  const round = (x, z, r) => new Frame(x + r, z - r, 0, 1);   // a frame whose (r, r) is (x, z)
  TY.tank(kit, round(10, 10, 4.5), 4.5, 0.7, new THREE.Color("#d8d2c4")); TY.tank(kit, round(10, 10, 2), 2, 1.8, new THREE.Color("#d8d2c4")); TY.tank(kit, round(10, 10, 0.8), 0.8, 3, new THREE.Color("#e8e2d6"));
  grid.circle(10, 10, 4.6, 1.2);
  add(new THREE.Mesh(new THREE.CircleGeometry(4.2, 16).rotateX(-Math.PI / 2).translate(10, 0.62, 10), kit.M.water));
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; palms.push([10 + Math.cos(a) * 11, 10 + Math.sin(a) * 11]); benches.push({ x: 10 + Math.cos(a + 0.3) * 8.2, z: 10 + Math.sin(a + 0.3) * 8.2, a: Math.atan2(-Math.cos(a + 0.3), -Math.sin(a + 0.3)) + Math.PI }); }

  /* ---- props: instanced ---- */
  const dark = L({ color: 0x2b2e35 });
  instanced(scene, mergeGeometries([new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(0, 0.45, 0), new THREE.BoxGeometry(1.8, 0.45, 0.06).translate(0, 0.72, 0.2), new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(-0.8, 0.22, 0), new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(0.8, 0.22, 0)]), L({ color: 0x6a4a32 }), benches);
  instanced(scene, new THREE.CylinderGeometry(0.28, 0.24, 0.9, 7).translate(0, 0.45, 0), L({ color: 0x2f5d4a }), bins);
  const hydrantMesh = instanced(scene, mergeGeometries([new THREE.CylinderGeometry(0.12, 0.15, 0.7, 6).translate(0, 0.35, 0), new THREE.SphereGeometry(0.13, 6, 4).translate(0, 0.72, 0), new THREE.BoxGeometry(0.4, 0.08, 0.08).translate(0, 0.5, 0)]), L({ color: 0xc23b2a }), hydrants);
  instanced(scene, mergeGeometries([new THREE.CylinderGeometry(0.1, 0.14, 10, 6).translate(0, 5, 0), new THREE.BoxGeometry(1.8, 0.1, 0.1).translate(0, 9.2, 0)]), L({ color: 0x5a4632 }), poles);
  { const pts = []; for (const [a, b, dy] of wires) for (let k = 0; k < 4; k++) { const t0 = k / 4, t1 = (k + 1) / 4, y = (t) => dy - Math.sin(t * Math.PI) * 0.7; pts.push(a[0] + (b[0] - a[0]) * t0, y(t0), a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, y(t1), a[1] + (b[1] - a[1]) * t1); }
    if (pts.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1a1e }))); } }
  // traffic signals: a pole, an arm out over the road, a head with one lamp lit
  instanced(scene, mergeGeometries([new THREE.CylinderGeometry(0.08, 0.1, 5.5, 6).translate(0, 2.75, 0), new THREE.BoxGeometry(0.1, 0.1, 4).translate(0, 5.4, 2), new THREE.BoxGeometry(0.35, 1, 0.3).translate(0, 4.9, 3.6)]), dark, signals);
  // red and green lamps for every signal; traffic.js switches them by hiding one of each pair
  const redMesh = instanced(scene, new THREE.BoxGeometry(0.2, 0.2, 0.05).translate(0, 5.2, 3.44), new THREE.MeshBasicMaterial({ color: 0xff3b2a }), signals);
  const greenMesh = instanced(scene, new THREE.BoxGeometry(0.2, 0.2, 0.05).translate(0, 4.6, 3.44), new THREE.MeshBasicMaterial({ color: 0x3bff8a }), signals);
  // round trees: a trunk and a low-poly canopy, two greens
  const treeTrunk = new THREE.CylinderGeometry(0.15, 0.22, 3, 6).translate(0, 1.5, 0), canopy = new THREE.IcosahedronGeometry(2.4, 0).scale(1, 0.85, 1).translate(0, 4.4, 0);
  instanced(scene, treeTrunk, L({ color: 0x6a5240 }), trees);
  instanced(scene, canopy, L({ color: 0xffffff, flatShading: true }), trees.map((t, i) => ({ ...t, c: i % 3 ? 0x4a7a3a : 0x5e8a3e })));
  // cars: a low-poly body in one of a dozen paints, a glasshouse, four wheels
  const paints = [0xC23B2A, 0x2F5D8C, 0xE8E2D6, 0x2a2a2e, 0x8a8d92, 0x3F7A4A, 0xD9A441, 0x6a2a4a, 0x7a9ab8, 0xa8a08a, 0x5a3a2a, 0xf0f0f0];
  const carList = cars.map((c) => ({ x: c.x, z: c.z, a: c.a, c: paints[(R() * paints.length) | 0], obb: c.obb }));
  const carMeshes = [];
  carMeshes.push(instanced(scene, mergeGeometries([new THREE.BoxGeometry(1.8, 0.62, 4.3).translate(0, 0.58, 0), new THREE.BoxGeometry(1.75, 0.2, 1.0).translate(0, 0.95, 1.55)]), L({ color: 0xffffff }), carList));
  carMeshes.push(instanced(scene, new THREE.BoxGeometry(1.55, 0.55, 2.1).translate(0, 1.16, -0.25), L({ color: 0x2a3644, emissive: 0x0c1218 }), carList));
  carMeshes.push(instanced(scene, mergeGeometries([[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]].map(([x, z]) => new THREE.CylinderGeometry(0.33, 0.33, 0.22, 8).rotateZ(Math.PI / 2).translate(x, 0.33, z))), L({ color: 0x18181a }), carList));
  buildPalms(scene, palms, R, add);
  const lampMeshes = buildLamps(scene, lamps, add, "high");
  const lampList = lamps.map(([x, z, dx, dz], i) => ({ x, z, dx, dz, i, obj: grid.circle(x, z, 0.15, 7) }));

  await breathe();
  /* ---- the ground: one painted texture for the whole island, a pixel a metre ---- */
  const GS = 1, GW = Math.ceil((X1 - X0) * GS), GH = Math.ceil((Z1 - Z0) * GS);
  const groundC = canvas(GW, GH, (g) => {
    const img = g.createImageData(GW, GH), D = img.data;
    const BASE = { port: [128, 124, 114], downtown: [150, 146, 138], midtown: [134, 128, 116], tideline: [160, 150, 128], bellwether: [92, 122, 62], park: [86, 120, 58], beach: [200, 184, 150], pier: [120, 100, 80] };
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const x = X0 + i / GS, z = Z0 + j / GS, d = districtOf(x, z), b = BASE[d] || BASE.midtown, h = ((Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1 + 1) % 1, n = (h - 0.5) * 12;
      const patch = Math.sin(x * 0.07) * Math.sin(z * 0.09) + Math.sin(x * 0.023 + z * 0.031) > 0.9;   // worn patches
      let c = b;
      if (d === "midtown" && patch) c = [104, 118, 72];
      if (d === "park" && Math.hypot(x - 10, z - 10) < 17) c = ((Math.floor(x / 1.5) + Math.floor(z / 1.5)) % 2) ? [196, 186, 168] : [178, 166, 146];   // the plaza
      if (d === "port" && h > 0.985) c = [60, 58, 54];
      const k = (j * GW + i) * 4; D[k] = c[0] + n; D[k + 1] = c[1] + n; D[k + 2] = c[2] + n; D[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const P = (x, z) => [(x - X0) * GS, (z - Z0) * GS];
    for (const l of lotsToPaint) {
      const poly = [l.F.p(l.u0, l.v0, 0), l.F.p(l.u1, l.v0, 0), l.F.p(l.u1, l.v1, 0), l.F.p(l.u0, l.v1, 0)].map((p) => P(p[0], p[2]));
      g.beginPath(); poly.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      if (l.yard) { g.fillStyle = "rgba(96,132,64,.85)"; g.fill(); continue; }
      g.fillStyle = "#45464e"; g.fill();
      g.strokeStyle = "#cfc9bd"; g.lineWidth = 1;
      for (let u = l.u0 + 1.4; u < l.u1 - 1; u += 2.8) { const a = P(...[l.F.p(u, l.v0 + 0.6, 0)].map((p) => [p[0], p[2]])[0]), b = P(...[l.F.p(u, l.v0 + 5.5, 0)].map((p) => [p[0], p[2]])[0]); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      map.lots.push(poly.map(([x, y]) => ({ x: x / GS + X0, z: y / GS + Z0 })));
    }
  });
  const groundT = ptex(groundC, false);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
  const gg = new THREE.ShapeGeometry(shape); gg.rotateX(-Math.PI / 2); gg.translate(0, GROUND_Y, 0);
  { const p = gg.attributes.position, uv = gg.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, (p.getX(k) - X0) / (X1 - X0), 1 - (p.getZ(k) - Z0) / (Z1 - Z0)); }
  add(new THREE.Mesh(gg, L({ map: groundT, ...flat(2) })), false, true);   // pushed back: everything flat sits over it
  await breathe();

  /* ---- the coast: a quay along the port, a rock revetment round the rest, a parapet to keep you on land ---- */
  const quay = [], rocks = [];
  const coastSegs = [];
  for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length]; if (Math.abs(a.z - promenade(a.x)) < 0.5 && Math.abs(b.z - promenade(b.x)) < 0.5) continue; coastSegs.push([a, b]); }
  for (const [a, b] of coastSegs) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ang = Math.atan2(dz, dx), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
    quay.push(new THREE.BoxGeometry(len + 0.6, 4, 1).rotateY(-ang).translate(cx, -1.6, cz));
    quay.push(new THREE.BoxGeometry(len + 0.6, 0.8, 0.5).rotateY(-ang).translate(cx, 0.4, cz));
    grid.obb(cx, cz, len / 2 + 0.3, 0.5, ang, 1.2);
    if (a.x > -299 || b.x > -299) for (let k = 0; k < len; k += 3) { const t = k / len, nx = dz / len, nz = -dx / len; rocks.push({ x: a.x + dx * t + nx * (1.5 + R() * 2), y: -0.6 + R() * 0.4, z: a.z + dz * t + nz * (1.5 + R() * 2), a: R() * 6, s: 1 + R() * 0.8 }); }
  }
  add(new THREE.Mesh(mergeGeometries(quay), L({ color: 0x9a948a })), false, true);
  instanced(scene, new THREE.DodecahedronGeometry(1.3, 0), L({ color: 0x7d7870, flatShading: true }), rocks);
  // cranes and tanks on the port quay, a closed bridge to the mainland off the east shore
  for (const z of [-190, -40, 110]) { const F = new Frame(-288, z, 1, 0); TY.crane(kit, F, R); for (const [u, v] of [[0, 0], [16, 0], [0, 12], [16, 12]]) grid.circle(-288 + v + 0.45, z + u + 0.45, 0.7, 26); }
  for (const [x, z, r] of [[-270, -230, 7], [-252, -230, 5], [-270, 150, 6]]) { if (occ.get(x, z) || mask.get(x, z)) continue; TY.tank(kit, round(x, z, r), r, 9 + r, new THREE.Color("#E8E4DC")); grid.circle(x, z, r, 14 + r); }
  { const deck = [], N0 = 298, zc = -120; deck.push(new THREE.BoxGeometry(700, 1.2, 16).translate(N0 + 350, 7, zc)); for (let x = N0 + 20; x < N0 + 700; x += 45) deck.push(new THREE.BoxGeometry(3, 14, 10).translate(x, 0, zc)); for (const s of [-1, 1]) deck.push(new THREE.BoxGeometry(700, 1, 0.4).translate(N0 + 350, 8.1, zc + s * 7.8));
    deck.push(new THREE.BoxGeometry(30, 7, 16).translate(N0 + 8, 3.5, zc)); add(new THREE.Mesh(mergeGeometries(deck), L({ color: 0xb8b2a6 })), false, true); }

  /* ---- Tideline Beach and the pier ---- */
  const sandC = ptex(canvas(64, 64, (g, w, h) => { g.fillStyle = "#D9C49A"; g.fillRect(0, 0, w, h); speckle(g, w, h, 500, 0.16, R); }));
  sandC.repeat.set(1, 1);
  const beachG = new THREE.PlaneGeometry(X1 - X0 + 60, 200, Math.ceil((X1 - X0 + 60) / 4), 80).rotateX(-Math.PI / 2);
  beachG.translate((X0 + X1) / 2, 0, 300);
  { const bp = beachG.attributes.position, uv = beachG.attributes.uv; for (let k = 0; k < bp.count; k++) { const x = bp.getX(k), z = bp.getZ(k); bp.setY(k, z > promenade(x) ? beachY(x, z) : -0.4); uv.setXY(k, x / 8, z / 8); } }
  beachG.computeVertexNormals();
  add(new THREE.Mesh(beachG, L({ map: sandC, ...flat(2) })), false, true);
  for (let x = EDGE.w; x < EDGE.e; x += 6) {   // an invisible wall knee-deep past the waterline, with a gap for the pier
    const x1 = Math.min(EDGE.e, x + 6), z = waterline(x + 3) + 5;
    if (x1 > PIER.x0 - 0.3 && x < PIER.x1 + 0.3) { if (x < PIER.x0 - 0.3) grid.box(x, z, PIER.x0 - 0.3, z + 4, 0.5); if (x1 > PIER.x1 + 0.3) grid.box(PIER.x1 + 0.3, z, x1, z + 4, 0.5); continue; }
    grid.box(x, z, x1, z + 4, 0.5);
  }
  // lifeguard towers and umbrellas along the sand
  const umbrellas = [];
  for (const x of [-180, -60, 140, 230]) { const z = promenade(x) + 26, F = new Frame(x + 2, z - 2, 0, 1); for (const [u, v] of [[0, 0], [3.6, 0], [0, 3.6], [3.6, 3.6]]) F.box(B.plain, null, u, u + 0.3, v, v + 0.3, beachY(x, z) - 0.2, 2.2, new THREE.Color("#e8e2d6"), null, 8, 8); F.box(B.plain, B.tile, -0.2, 4.1, -0.2, 4.1, 2.2, 4.4, new THREE.Color(["#F2C9B8", "#BFE6DA", "#F6E3B4", "#EAB8CC"][(R() * 4) | 0]), new THREE.Color("#ffffff"), 4, 4); grid.box(x - 2, z - 2, x + 2, z + 2, 4.4); }
  for (let k = 0; k < 40; k++) { const x = EDGE.w + 20 + R() * (EDGE.e - EDGE.w - 40); if (x > PIER.x0 - 4 && x < PIER.x1 + 4) continue; const z = promenade(x) + 8 + R() * 22; umbrellas.push({ x, y: beachY(x, z), z, a: R() * 6, c: [0xC23B2A, 0x2F5D8C, 0xF4E9D2, 0xE0A030, 0x2F6E5A][(R() * 5) | 0] }); }
  instanced(scene, mergeGeometries([new THREE.CylinderGeometry(0.04, 0.04, 2.4, 4).translate(0, 1.2, 0), new THREE.ConeGeometry(1.4, 0.6, 8).translate(0, 2.4, 0)]), L({ color: 0xffffff, flatShading: true }), umbrellas);
  const wood = ptex(canvas(32, 32, (g, w, h) => { g.fillStyle = "#8A6A4C"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { g.fillStyle = `rgba(0,0,0,${0.1 + R() * 0.15})`; g.fillRect(0, y, w, 1); } speckle(g, w, h, 120, 0.15, R); }));
  wood.repeat.set(2, 60);
  const pierParts = [new THREE.BoxGeometry(PIER.x1 - PIER.x0, 0.3, PIER.z1 - PIER.z0).translate((PIER.x0 + PIER.x1) / 2, PIER.y - 0.15, (PIER.z0 + PIER.z1) / 2)];
  const piles = [];
  for (let z = PIER.z0 + 4; z < PIER.z1; z += 6) for (const x of [PIER.x0 + 0.4, PIER.x1 - 0.4]) piles.push(new THREE.CylinderGeometry(0.2, 0.22, 5, 6).translate(x, PIER.y - 2.7, z));
  add(new THREE.Mesh(mergeGeometries(pierParts), L({ map: wood })), false, true);
  add(new THREE.Mesh(mergeGeometries(piles), L({ color: 0x4E3B2C })), false, false);
  const pr = [];
  for (const x of [PIER.x0 + 0.1, PIER.x1 - 0.1]) { pr.push(new THREE.BoxGeometry(0.1, 0.1, PIER.z1 - PIER.z0).translate(x, PIER.y + 1.0, (PIER.z0 + PIER.z1) / 2)); grid.box(x - 0.15, PIER.z0 + 6, x + 0.15, PIER.z1, PIER.y + 1.1); }
  for (let z = PIER.z0 + 6; z < PIER.z1; z += 3) for (const x of [PIER.x0 + 0.1, PIER.x1 - 0.1]) pr.push(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(x, PIER.y + 0.5, z));
  add(new THREE.Mesh(mergeGeometries(pr), L({ color: 0xCFC9BE })), false, false);
  grid.box(PIER.x0, PIER.z1 - 0.3, PIER.x1, PIER.z1 + 2, PIER.y + 1.1);
  { // Ruelas Bait & Ice at the end
    const F = new Frame(PIER.x1 - 1.5, PIER.z1 - 9, 0, 1, PIER.y), W = PIER.x1 - PIER.x0 - 3;
    F.box(B.stucco, B.tile, 0, W, 0, 6, 0, 3.2, new THREE.Color("#BFE6DA"), new THREE.Color("#ffffff"), 16, 14);
    F.awning(B.awning, 0.5, W - 0.5, 0, 2.9, 1.2, 0.5, new THREE.Color("#2F5D8C"));
    F.sign(B.signs, kit, kit.signs.index("RUELAS BAIT & ICE"), 0.5, W - 0.5, -0.06, 3.25, 4.4, new THREE.Color("#ffffff"));
    grid.box(PIER.x0 + 1.5, PIER.z1 - 9, PIER.x1 - 1.5, PIER.z1 - 3, PIER.y + 3.2).y0 = PIER.y;
  }
  // everything laid into the kit after the buildings (fountain, cranes, tanks, lifeguard towers, the bait shop)
  flush();

  /* ---- queries ---- */
  const heightAt = (x, z) => {
    if (x > PIER.x0 && x < PIER.x1 && z > PIER.z0 && z < PIER.z1) return PIER.y;
    if (z > promenade(x)) return beachY(x, z);
    return mask.get(x, z) === 1 ? KERB : 0;
  };
  map.labels = [["Downtown", 10, -180], ["Port Salt", -255, -40], ["Midtown", -100, 60], ["Palm Square", 10, 10], ["Tideline", -40, 205], ["Bellwether", 195, 70], ["Tideline Pier", 41, 330]];
  map.parks.push(Array.from({ length: 24 }, (_, k) => ({ x: 10 + Math.cos(k / 24 * 6.283) * 17, z: 10 + Math.sin(k / 24 * 6.283) * 17 })));
  // start on the beach by the pier, facing the sunset
  const sx = PIER.x0 - 14, spawn = { x: sx, z: promenade(sx) + 3, yaw: -0.25 };
  return { grid, heightAt, districtAt: districtOf, spawn, map, EDGE, PIER, SHORE, roads, lanes: roads.lanes, mask, outline, cars: { list: carList, meshes: carMeshes },
    props: { lamps: lampList, lampMeshes, hydrants, hydrantMesh, signals, redMesh, greenMesh } };
}
function buildPalms(scene, palms, R, add) {
  // trunk: a tapered, slightly bent cylinder; crown: drooping fronds
  const trunk = new THREE.CylinderGeometry(0.13, 0.22, 9, 7, 8).translate(0, 4.5, 0);
  const tp = trunk.attributes.position;
  for (let k = 0; k < tp.count; k++) { const y = tp.getY(k); tp.setX(k, tp.getX(k) + (y / 9) * (y / 9) * 0.9); }
  trunk.computeVertexNormals();
  const fronds = [];
  for (let f = 0; f < 9; f++) {
    const g = new THREE.PlaneGeometry(0.9, 4, 1, 6).translate(0, 2, 0).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const z = -p.getZ(k); p.setY(k, p.getY(k) - z * z * 0.09); p.setX(k, p.getX(k) * (1 - z / 4.4)); }
    g.rotateZ((R() - 0.5) * 0.3).rotateY(f / 9 * Math.PI * 2 + R() * 0.3).translate(0.9, 9, 0);
    fronds.push(g);
  }
  const crown = mergeGeometries(fronds); crown.computeVertexNormals();
  const tI = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x7A6450 }), palms.length);
  const cI = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: 0x3F6B3A, side: THREE.DoubleSide }), palms.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  palms.forEach(([x, z], n) => {
    const s = 0.85 + R() * 0.35, v = new THREE.Vector3(s, s, s);
    q.setFromAxisAngle(up, R() * Math.PI * 2); m.compose(new THREE.Vector3(x, 0, z), q, v);
    tI.setMatrixAt(n, m); cI.setMatrixAt(n, m);
  });
  add(tI, true, false); add(cI, true, false);
}

function buildLamps(scene, lamps, add, quality) {
  const pole = mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.1, 7, 6).translate(0, 3.5, 0),
    new THREE.BoxGeometry(0.08, 0.08, 1.6).translate(0, 6.9, 0.8)
  ]);
  const head = new THREE.BoxGeometry(0.35, 0.12, 0.6).translate(0, 6.82, 1.5);
  const pI = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: 0x2B2E35 }), lamps.length);
  const hI = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: 0xFFD49A }), lamps.length);
  // a warm pool of light under each lamp: one additive quad, no real lights
  const glow = document.createElement("canvas"); glow.width = glow.height = 128;
  const g = glow.getContext("2d"), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,190,120,.9)"); rg.addColorStop(0.45, "rgba(255,160,90,.35)"); rg.addColorStop(1, "rgba(255,140,80,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const gt = new THREE.CanvasTexture(glow); gt.colorSpace = THREE.SRGBColorSpace;
  const lI = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, ...flat(-6) }), lamps.length);
  lI.renderOrder = 2;   // a pool of light: over the pavement and the road, never under them
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  lamps.forEach(([x, z, dx, dz], n) => {
    const a = Math.atan2(dx, dz); q.setFromAxisAngle(up, a);
    m.compose(new THREE.Vector3(x, 0, z), q, one); pI.setMatrixAt(n, m); hI.setMatrixAt(n, m);
    m.compose(new THREE.Vector3(x + Math.sin(a) * 1.5, 0.16, z + Math.cos(a) * 1.5), q, one); lI.setMatrixAt(n, m);
  });
  add(pI, true, false); add(hI); add(lI);
  return { pole, head, pI, hI, lI };
}
