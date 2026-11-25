/* Marlowe Keys' streets. Not a grid: an authored network of named roads that
   curve with the coast and the land. Tideline Avenue follows the beach; Harbor
   Road runs up the port side; North Shore Drive and East Shore Road close the
   ring; Palm Square is a roundabout in the middle with five streets off it;
   Ashby Boulevard climbs north into Downtown, whose blocks sit on their own
   skewed grid; Causeway Road cuts across to the bridge; Seagrape Lane, Coral
   Way and Mercado Street wind through Midtown; Hibiscus Avenue and Bellwether
   Road curl through the houses on the east side, with a cul-de-sac.

   From the network: sampled centrelines, road and sidewalk ribbons, rounded
   kerb corners and turning circles, zebra crossings, a 1 m mask of road and
   pavement (for heights and for placing buildings), and the pedestrian lanes:
   one down each pavement, joined round every corner and across every road. */
import * as THREE from "three";

// the promenade: where the city stops and Tideline Beach starts
export const promenade = (x) => 226 + 7 * Math.sin(x * 0.0085 + 0.5) + 3 * Math.sin(x * 0.023 + 1.7);
export const PROMENADE_GLSL = "float promenade(float x){return 226.+7.*sin(x*.0085+.5)+3.*sin(x*.023+1.7);}";
export const SIDEWALK = 3, KERB = 0.12;

/* ---------- the network, authored ---------- */
function author() {
  const N = {}, E = [];
  const node = (id, x, z) => (N[id] = { id, x, z, ends: [] });
  const road = (a, b, w, name, via = [], kind = "street") => E.push({ a, b, w, name, via, kind });
  const zT = (x) => promenade(x) - 10;   // Tideline Avenue's centreline: its south pavement is the promenade
  const along = (x0, x1, f, step = 30) => { const v = []; const n = Math.max(1, Math.round(Math.abs(x1 - x0) / step)); for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n; v.push([x, f(x)]); } return v; };

  // Tideline Avenue and the port gate
  for (const [id, x] of [["TW", -200], ["T1", -140], ["T2", 41], ["T3", 150], ["TE", 278]]) node(id, x, zT(x));
  node("PW", -282, zT(-282));
  road("PW", "TW", 10, "Tideline Avenue", along(-282, -200, zT), "avenue");
  road("TW", "T1", 14, "Tideline Avenue", along(-200, -140, zT), "avenue");
  road("T1", "T2", 14, "Tideline Avenue", along(-140, 41, zT), "avenue");
  road("T2", "T3", 14, "Tideline Avenue", along(41, 150, zT), "avenue");
  road("T3", "TE", 14, "Tideline Avenue", along(150, 278, zT), "avenue");
  // Harbor Road, up the port side
  node("H1", -205, 100); node("H2", -195, 0); node("H3", -200, -110); node("H4", -215, -250);
  road("TW", "H1", 12, "Harbor Road", [[-212, 160]], "avenue");
  road("H1", "H2", 12, "Harbor Road", [[-190, 50]], "avenue");
  road("H2", "H3", 12, "Harbor Road", [[-206, -55]], "avenue");
  road("H3", "H4", 12, "Harbor Road", [[-197, -180]], "avenue");
  node("Q1", -284, 4); node("Q2", -286, -106);
  road("H2", "Q1", 10, "Quay Road", [[-240, -4]], "port");
  road("H3", "Q2", 10, "Dock Street", [[-245, -116]], "port");
  // North Shore Drive and East Shore Road
  node("N1", -110, -262); node("N2", 10, -268); node("N3", 130, -262); node("NE", 255, -246);
  road("H4", "N1", 10, "North Shore Drive", [[-165, -264]]);
  road("N1", "N2", 10, "North Shore Drive", [[-50, -270]]);
  road("N2", "N3", 10, "North Shore Drive", [[70, -270]]);
  road("N3", "NE", 10, "North Shore Drive", [[200, -258]]);
  node("E2", 272, -120); node("E3", 270, 40);
  road("NE", "E2", 10, "East Shore Road", [[270, -190]]);
  road("E2", "E3", 10, "East Shore Road", [[278, -40]]);
  road("E3", "TE", 10, "East Shore Road", [[276, 130]]);
  // Palm Square: a roundabout with five streets off it
  const C = [10, 10], RR = 22, at = (deg) => [C[0] + RR * Math.cos(deg * Math.PI / 180), C[1] + RR * Math.sin(deg * Math.PI / 180)];
  const ring = [["PN", -90], ["PNE", -38], ["PS", 90], ["PSW", 138], ["PWs", 180]];
  for (const [id, a] of ring) node(id, ...at(a));
  for (let i = 0; i < ring.length; i++) {
    const [a, da] = ring[i], [b, dbRaw] = ring[(i + 1) % ring.length], db = dbRaw <= da ? dbRaw + 360 : dbRaw, via = [];
    for (let d = da + 12; d < db - 6; d += 12) via.push(at(d));
    road(a, b, 10, "Palm Square", via, "ring");
  }
  // Downtown: its own grid, turned a few degrees off true
  const DC = [10, -172], ang = -0.12, G = (u, v) => [DC[0] + u * Math.cos(ang) - v * Math.sin(ang), DC[1] + u * Math.sin(ang) + v * Math.cos(ang)];
  for (const u of [-120, 0, 120]) for (const v of [-62, 42]) node(`G${u}_${v}`, ...G(u, v));
  road("PN", "G0_42", 14, "Ashby Boulevard", [[12, -60]], "avenue");
  road("G0_42", "G0_-62", 14, "Ashby Boulevard", [], "avenue");
  road("G0_-62", "N2", 14, "Ashby Boulevard", [], "avenue");
  for (const v of [-62, 42]) { road(`G-120_${v}`, `G0_${v}`, 12, v < 0 ? "Commission Street" : "Exchange Street"); road(`G0_${v}`, `G120_${v}`, 12, v < 0 ? "Commission Street" : "Exchange Street"); }
  road("G-120_42", "G-120_-62", 11, "Lighthouse Street"); road("G120_42", "G120_-62", 11, "Bay Street");
  road("G-120_-62", "N1", 10, "Lighthouse Street"); road("G120_-62", "N3", 10, "Bay Street");
  road("G-120_42", "H3", 11, "Exchange Street", [[-160, -110]]);
  // Causeway Road, across to the bridge
  node("CX", 150, -75);
  road("PNE", "CX", 14, "Causeway Road", [[80, -42]], "avenue");
  road("CX", "E2", 14, "Causeway Road", [[215, -105]], "avenue");
  road("G120_42", "CX", 11, "Bay Street", [[140, -110]]);
  // Midtown west: Salt Street, Seagrape Lane, Coral Way, Mercado Street
  node("S1", -100, 2); node("SL", -72, 112); node("M1", -130, 98);
  road("PWs", "S1", 11, "Salt Street", [[-45, 6]]);
  road("S1", "H2", 11, "Salt Street", [[-150, -4]]);
  road("PSW", "SL", 9, "Seagrape Lane", [[-30, 62]]);
  road("SL", "T1", 9, "Seagrape Lane", [[-110, 165]]);
  road("H1", "M1", 8, "Coral Way", [[-168, 108]]);
  road("M1", "SL", 8, "Coral Way", [[-100, 92]]);
  road("S1", "G-120_42", 9, "Mercado Street", [[-96, -60]]);
  road("M1", "S1", 8, "Gull Street", [[-122, 50]]);
  // Pier Street down to the pier; the east side's houses
  node("P1", 28, 120); node("R1", 132, 112); node("R2", 140, 22); node("R4", 214, 16);
  road("PS", "P1", 10, "Pier Street", [[16, 75]]);
  road("P1", "T2", 10, "Pier Street", [[38, 170]]);
  road("P1", "R1", 9, "Hibiscus Avenue", [[80, 128]]);
  road("R1", "E3", 9, "Hibiscus Avenue", [[200, 86]]);
  road("T3", "R1", 9, "Bellwether Road", [[138, 165]]);
  road("R1", "R2", 9, "Bellwether Road", [[146, 66]]);
  road("R2", "CX", 9, "Bellwether Road", [[140, -30]]);
  road("R2", "R4", 7, "Heron Court", [[178, 24]]);
  return { N, E };
}

/* ---------- geometry helpers ---------- */
const v2 = (x, z) => ({ x, z });
function sample(points, step) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => v2(p.x, p.z));
}
function cumul(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return c; }
// point, tangent and left normal at arc length s
export function at(pl, s) {
  const { pts, cum } = pl, L = cum[cum.length - 1]; s = Math.max(0, Math.min(L, s));
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, k = (s - cum[i - 1]) / seg;
  const tx = (b.x - a.x) / seg, tz = (b.z - a.z) / seg;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, tx, tz, nx: -tz, nz: tx };
}
// the part of a polyline between s0 and s1, re-sampled, offset sideways by off
export function slice(pl, s0, s1, off = 0, step = 3) {
  const out = [], n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step));
  for (let i = 0; i <= n; i++) { const p = at(pl, s0 + (s1 - s0) * i / n); out.push(v2(p.x + p.nx * off, p.z + p.nz * off)); }
  return { pts: out, cum: cumul(out) };
}
function quadBez(a, c, b, n) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push(v2(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.z + 2 * u * t * c.z + t * t * b.z)); } return out; }
// where two rays (p + s*d) meet; null if they're nearly parallel or behind
function meet(p, d, q, e) {
  const den = d.x * e.z - d.z * e.x; if (Math.abs(den) < 0.15) return null;
  const s = ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den, u = ((q.x - p.x) * d.z - (q.z - p.z) * d.x) / den;
  return s > 0 && u > 0 && s < 40 && u < 40 ? v2(p.x + d.x * s, p.z + d.z * s) : null;
}

/* ---------- the 1 m mask: 0 ground, 1 pavement, 2 road ---------- */
export class Mask {
  constructor(x0, z0, x1, z1) { this.x0 = x0; this.z0 = z0; this.w = Math.ceil(x1 - x0); this.h = Math.ceil(z1 - z0); this.a = new Uint8Array(this.w * this.h); }
  get(x, z) { const i = Math.floor(x - this.x0), j = Math.floor(z - this.z0); return i < 0 || j < 0 || i >= this.w || j >= this.h ? 0 : this.a[j * this.w + i]; }
  capsule(a, b, r, v, over) {
    const i0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r - this.x0)), i1 = Math.min(this.w - 1, Math.ceil(Math.max(a.x, b.x) + r - this.x0));
    const j0 = Math.max(0, Math.floor(Math.min(a.z, b.z) - r - this.z0)), j1 = Math.min(this.h - 1, Math.ceil(Math.max(a.z, b.z) + r - this.z0));
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.x0 + i + 0.5, z = this.z0 + j + 0.5, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      if ((x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2 <= r * r) { const k = j * this.w + i; if (over || this.a[k] < v) this.a[k] = v; }
    }
  }
  poly(P, v) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    for (let j = Math.max(0, Math.floor(z0 - this.z0)); j <= Math.min(this.h - 1, Math.ceil(z1 - this.z0)); j++)
      for (let i = Math.max(0, Math.floor(x0 - this.x0)); i <= Math.min(this.w - 1, Math.ceil(x1 - this.x0)); i++)
        if (inPoly(this.x0 + i + 0.5, this.z0 + j + 0.5, P)) this.a[j * this.w + i] = v;
  }
}
export function inPoly(x, z, P) {
  let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; }
  return c;
}

/* ---------- build it ---------- */
export function buildRoads(mask) {
  const { N, E } = author();
  const nodes = Object.values(N);
  for (const e of E) {
    const A = N[e.a], B = N[e.b];
    const pts = sample([[A.x, A.z], ...e.via, [B.x, B.z]], 3);
    e.pl = { pts, cum: cumul(pts) }; e.L = e.pl.cum[e.pl.cum.length - 1];
    A.ends.push({ e, start: true }); B.ends.push({ e, start: false });
  }
  // how far each road stops short of a junction so the kerbs can turn the corner
  for (const n of nodes) {
    n.deg = n.ends.length; n.r = n.deg === 1 ? 0 : Math.max(...n.ends.map((d) => d.e.w)) / 2 + SIDEWALK + 2;
    for (const d of n.ends) {
      const p = at(d.e.pl, d.start ? n.r : d.e.L - n.r), sgn = d.start ? 1 : -1;
      d.dir = v2(p.tx * sgn, p.tz * sgn); d.p = v2(p.x, p.z); d.n = v2(-d.dir.z, d.dir.x);     // n: the counter-clockwise side
      d.ang = Math.atan2(d.dir.z, d.dir.x);
    }
    n.ends.sort((a, b) => a.ang - b.ang);
  }
  for (const e of E) { e.s0 = N[e.a].r; e.s1 = e.L - N[e.b].r; }

  /* the mask: pavements, then roads, then junction discs, then kerb corners back on top */
  const corners = [], caps = [];
  for (const e of E) for (let i = 1; i < e.pl.pts.length; i++) mask.capsule(e.pl.pts[i - 1], e.pl.pts[i], e.w / 2 + SIDEWALK, 1);
  for (const e of E) for (let i = 1; i < e.pl.pts.length; i++) mask.capsule(e.pl.pts[i - 1], e.pl.pts[i], e.w / 2, 2, true);
  for (const n of nodes) if (n.deg > 1) mask.capsule(n, n, n.r - 1, 2, true);
  for (const n of nodes) {
    if (n.deg === 1) {   // a dead end: a turning circle, pavement round the back
      const d = n.ends[0], w = d.e.w / 2, ring = (r) => { const o = []; for (let k = 0; k <= 10; k++) { const a = Math.PI / 2 + Math.PI * k / 10, c = Math.cos(a), s = Math.sin(a); o.push(v2(n.x + d.n.x * r * s + d.dir.x * r * c, n.z + d.n.z * r * s + d.dir.z * r * c)); } return o; };
      caps.push({ n, inner: ring(w), outer: ring(w + SIDEWALK), w });
      mask.capsule(n, n, w + SIDEWALK, 1); mask.capsule(n, n, w, 2, true);
      continue;
    }
    for (let k = 0; k < n.ends.length; k++) {
      const A = n.ends[k], B = n.ends[(k + 1) % n.ends.length], wa = A.e.w / 2, wb = B.e.w / 2;
      const curve = (ra, rb) => {
        const a = v2(A.p.x + A.n.x * ra, A.p.z + A.n.z * ra), b = v2(B.p.x - B.n.x * rb, B.p.z - B.n.z * rb);
        const c = meet(a, v2(-A.dir.x, -A.dir.z), b, v2(-B.dir.x, -B.dir.z)) || v2((a.x + b.x) / 2 * 0.7 + n.x * 0.3, (a.z + b.z) / 2 * 0.7 + n.z * 0.3);
        return quadBez(a, c, b, 8);
      };
      const inner = curve(wa, wb), outer = curve(wa + SIDEWALK, wb + SIDEWALK);
      corners.push({ n, A, B, inner, outer });
      mask.poly(inner.concat(outer.slice().reverse()), 1);
    }
  }

  /* pedestrian lanes: down the middle of each pavement */
  const lanes = [];
  for (const e of E) for (const side of [1, -1]) {
    const pl = slice(e.pl, e.s0, e.s1, side * (e.w / 2 + SIDEWALK / 2));
    lanes.push({ e, side, ...pl, L: pl.cum[pl.cum.length - 1], ends: [null, null] });
  }
  const laneOf = (e, side) => lanes.find((l) => l.e === e && l.side === side);
  // an end of a lane at a junction: which lane, which end (0 = start), and where it can go next
  for (const n of nodes) {
    n.laneEnds = n.ends.map((d) => {
      const ccw = laneOf(d.e, d.start ? 1 : -1), cw = laneOf(d.e, d.start ? -1 : 1), end = d.start ? 0 : 1;
      return { d, ccw: { lane: ccw, end }, cw: { lane: cw, end } };
    });
    const k = n.laneEnds.length;
    n.laneEnds.forEach((le, i) => {
      const next = n.laneEnds[(i + 1) % k], prev = n.laneEnds[(i - 1 + k) % k];
      // round the corner (counter-clockwise side meets the next road's clockwise side), or over the road
      le.ccw.corner = next.cw; le.cw.corner = prev.ccw;
      le.ccw.cross = le.cw; le.cw.cross = le.ccw;
      le.ccw.lane.ends[le.ccw.end] = le.ccw; le.cw.lane.ends[le.cw.end] = le.cw;
      le.ccw.node = le.cw.node = n; le.ccw.deadEnd = le.cw.deadEnd = n.deg === 1;
    });
  }
  // zebra crossings where pavements cross a road at a junction
  const zebras = [];
  for (const n of nodes) if (n.deg > 2) for (const d of n.ends) zebras.push({ x: d.p.x, z: d.p.z, ang: Math.atan2(d.dir.x, d.dir.z), w: d.e.w });
  return { nodes, edges: E, lanes, corners, caps, zebras };
}

// a lane point: position at s with the direction it runs and its outward side (away from the road)
export function lanePoint(l, s) { const p = at(l, s); return { x: p.x, z: p.z, tx: p.tx, tz: p.tz, ox: p.nx * l.side, oz: p.nz * l.side }; }
// position of a lane end (0 start, 1 end)
export function laneEndPos(le) { const l = le.lane, p = le.end ? l.pts[l.pts.length - 1] : l.pts[0]; return p; }
// the walk from one lane end to another: round a corner (a curve), over the road (straight), or round a dead end
export function linkPath(from, to, kind) {
  const a = laneEndPos(from), b = laneEndPos(to), da = from.lane, db = to.lane;
  const ta = at(da, from.end ? da.L : 0), tb = at(db, to.end ? db.L : 0);
  const outA = from.end ? v2(ta.tx, ta.tz) : v2(-ta.tx, -ta.tz), outB = to.end ? v2(tb.tx, tb.tz) : v2(-tb.tx, -tb.tz);
  let pts;
  if (kind === "cross") pts = [a, b];
  else if (from.deadEnd) {
    const n = from.node, r = Math.hypot(a.x - n.x, a.z - n.z) || 1, a0 = Math.atan2(a.z - n.z, a.x - n.x), a1 = Math.atan2(b.z - n.z, b.x - n.x);
    let da1 = a1 - a0; const back = Math.atan2(outA.z, outA.x), mid = a0 + da1 / 2;
    if (Math.cos(mid - back) < 0) da1 += da1 > 0 ? -2 * Math.PI : 2 * Math.PI;   // go round the far side
    pts = []; for (let k = 0; k <= 10; k++) { const t = a0 + da1 * k / 10; pts.push(v2(n.x + Math.cos(t) * r, n.z + Math.sin(t) * r)); }
  } else {
    const c = meet(a, outA, b, outB) || v2((a.x + b.x) / 2, (a.z + b.z) / 2);
    pts = quadBez(a, c, b, 8);
  }
  return { pts, cum: cumul(pts), L: cumul(pts)[pts.length - 1] };
}
export { cumul };
