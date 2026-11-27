/* The cars of Marlowe Keys: six original models (and two liveries), each built from its side profile.

   A model is cut along its length into sections. The nose and the tail are solid extrusions of the profile with
   rounded edges; the cabin is a tub (door skins each side, sills, a floor) so you can see into it; over the cabin
   sits the greenhouse (A, B and C pillars, the roof, window frames) and its glass, which you can see through. Inside:
   seats, a dashboard, a steering wheel, a console; outside: bumpers, a grille, mirrors, handles, plates, the lamps.
   The plan is rounded at the corners and the sides bow out a little below the belt and tuck in above it.

   Everything is flat-shaded with colours per vertex (PS1). Two extra attributes: aPaint (1 where the body colour
   shows, 0 on trim, glass surrounds, tyres, interior) and aGlow (lamps that light themselves). The shell is
   subdivided to a fine, even mesh for a car that's been hit, so a dent has vertices to move; the subdivided shell
   lies exactly on the clean one (flat shading, the same faces split), so a car never changes model or looks any
   cheaper when it's hurt, it only dents.

   Car frame: +z forward, +y up, +x the driver's side (Marlowe Keys drives on the right, wheel on the left). */
import * as THREE from "three";

const TRIM = [0.09, 0.09, 0.1], CHROME = [0.62, 0.63, 0.66], RUBBER = [0.06, 0.06, 0.065], DASH = [0.11, 0.11, 0.12];

/* ---------------- the models ---------------- */
// outline: the side silhouette from the front bottom corner, up and over the top, to the rear bottom corner
// (the bottom edge and the wheel arches are added). cab: the cabin tub's ends (zr..zf) and the greenhouse
// (roof from zrr to zrf at roof height, belt line at belt). Physics in SI units.
export const MODELS = [
  { id: "marlin", name: "Marlin", kind: "saloon", L: 4.66, W: 1.84, wheelR: 0.34, axle: [1.42, -1.36], track: 1.56, clear: 0.24, doors: 4,
    outline: [[2.33, 0.32], [2.36, 0.52], [2.3, 0.7], [2.1, 0.8], [1.6, 0.88], [1.0, 0.95], [-1.25, 0.96], [-1.75, 0.96], [-2.2, 0.9], [-2.33, 0.74], [-2.35, 0.5], [-2.3, 0.32]],
    cab: { zr: -1.25, zf: 1.0, zrr: -0.62, zrf: 0.3, belt: 0.95, roof: 1.44, zB: -0.12, inset: 0.17 },
    lamps: { head: [2.3, 0.66, 0.62], tail: [-2.33, 0.76, 0.66] }, seat: [0.38, 0.58, 0.1], wheelAt: [0.38, 1.02, 0.5],
    phys: { mass: 1450, power: 150, top: 52, grip: 1.0, cg: 0.52, drag: 0.36, brake: 1.0 } },
  { id: "skiff", name: "Skiff", kind: "hatchback", L: 3.92, W: 1.74, wheelR: 0.31, axle: [1.22, -1.2], track: 1.48, clear: 0.22, doors: 4,
    outline: [[1.96, 0.3], [1.99, 0.5], [1.92, 0.68], [1.7, 0.8], [1.2, 0.88], [0.86, 0.93], [-1.55, 0.95], [-1.9, 0.92], [-1.98, 0.7], [-1.97, 0.46], [-1.92, 0.3]],
    cab: { zr: -1.62, zf: 0.86, zrr: -1.45, zrf: 0.12, belt: 0.93, roof: 1.46, zB: -0.3, inset: 0.15, hatch: true },
    lamps: { head: [1.95, 0.66, 0.58], tail: [-1.95, 0.86, 0.66] }, seat: [0.36, 0.56, -0.06], wheelAt: [0.36, 1.0, 0.34],
    phys: { mass: 1080, power: 90, top: 46, grip: 0.98, cg: 0.5, drag: 0.34, brake: 1.0 } },
  { id: "heron", name: "Heron", kind: "estate", L: 4.82, W: 1.84, wheelR: 0.34, axle: [1.48, -1.4], track: 1.56, clear: 0.24, doors: 4,
    outline: [[2.41, 0.32], [2.44, 0.52], [2.38, 0.7], [2.18, 0.8], [1.68, 0.88], [1.08, 0.95], [-2.2, 0.97], [-2.4, 0.9], [-2.43, 0.5], [-2.38, 0.32]],
    cab: { zr: -2.22, zf: 1.08, zrr: -2.1, zrf: 0.36, belt: 0.95, roof: 1.47, zB: -0.06, zB2: -1.15, inset: 0.16, hatch: true },
    lamps: { head: [2.38, 0.66, 0.62], tail: [-2.41, 0.84, 0.68] }, seat: [0.38, 0.58, 0.16], wheelAt: [0.38, 1.02, 0.56],
    phys: { mass: 1560, power: 140, top: 50, grip: 0.97, cg: 0.55, drag: 0.37, brake: 1.0 } },
  { id: "tarpon", name: "Tarpon", kind: "pickup", L: 5.2, W: 1.96, wheelR: 0.39, axle: [1.66, -1.62], track: 1.68, clear: 0.34, doors: 2,
    outline: [[2.6, 0.42], [2.64, 0.66], [2.58, 0.92], [2.3, 1.04], [1.5, 1.1], [1.05, 1.14], [0.1, 1.15], [-0.45, 1.15], [-2.58, 1.12], [-2.62, 0.9], [-2.62, 0.55], [-2.56, 0.4]],
    cab: { zr: -0.45, zf: 1.05, zrr: -0.4, zrf: 0.4, belt: 1.14, roof: 1.78, zB: -0.42, inset: 0.15, flatBack: true },
    bed: { z0: -2.56, z1: -0.5, floor: 0.82 },
    lamps: { head: [2.6, 0.86, 0.66], tail: [-2.6, 0.96, 0.78] }, seat: [0.42, 0.8, -0.05], wheelAt: [0.42, 1.2, 0.52],
    phys: { mass: 2050, power: 190, top: 47, grip: 0.92, cg: 0.72, drag: 0.46, brake: 0.95 } },
  { id: "barracuda", name: "Barracuda", kind: "coupe", L: 4.7, W: 1.9, wheelR: 0.35, axle: [1.45, -1.4], track: 1.62, clear: 0.2, doors: 2,
    outline: [[2.35, 0.28], [2.39, 0.48], [2.32, 0.62], [2.0, 0.72], [1.3, 0.8], [0.72, 0.86], [-1.55, 0.88], [-2.1, 0.86], [-2.34, 0.74], [-2.36, 0.48], [-2.3, 0.28]],
    cab: { zr: -1.55, zf: 0.72, zrr: -0.55, zrf: -0.02, belt: 0.86, roof: 1.27, zB: -0.66, inset: 0.2 },
    lamps: { head: [2.34, 0.58, 0.64], tail: [-2.35, 0.72, 0.7] }, seat: [0.4, 0.46, -0.33], wheelAt: [0.4, 0.88, 0.06],
    phys: { mass: 1480, power: 290, top: 66, grip: 1.12, cg: 0.46, drag: 0.32, brake: 1.15 } },
  { id: "pelican", name: "Pelican", kind: "van", L: 5.0, W: 1.98, wheelR: 0.37, axle: [1.62, -1.48], track: 1.7, clear: 0.28, doors: 2,
    outline: [[2.5, 0.36], [2.53, 0.6], [2.46, 0.86], [2.2, 0.98], [1.6, 1.04], [1.05, 1.08], [0.1, 1.1], [-0.2, 2.06], [-2.42, 2.06], [-2.5, 1.9], [-2.52, 0.6], [-2.46, 0.36]],
    cab: { zr: -0.2, zf: 1.05, zrr: -0.2, zrf: 0.45, belt: 1.08, roof: 2.06, zB: -0.18, inset: 0.08, flatBack: true },
    cargo: true,
    lamps: { head: [2.5, 0.8, 0.68], tail: [-2.51, 1.0, 0.86] }, seat: [0.44, 0.78, 0.0], wheelAt: [0.44, 1.18, 0.56],
    phys: { mass: 2250, power: 160, top: 40, grip: 0.9, cg: 0.85, drag: 0.55, brake: 0.9 } }
];
// two liveries on the Marlin: the island's police and its cabs (their own colours, built in)
MODELS.push(Object.assign({}, MODELS[0], { id: "cruiser", name: "Safety Cruiser", livery: "police", phys: Object.assign({}, MODELS[0].phys, { power: 210, top: 60, grip: 1.08 }) }));
MODELS.push(Object.assign({}, MODELS[0], { id: "cab", name: "Keys Cab", livery: "taxi" }));
export const MODEL = Object.fromEntries(MODELS.map((m, i) => [m.id, Object.assign(m, { index: i })]));
// how common each is on the street, and the paints each comes in
export const STREET = [["marlin", 26], ["skiff", 22], ["heron", 12], ["tarpon", 12], ["barracuda", 7], ["pelican", 10], ["cab", 7]];
export const PAINTS = {
  default: [0xC23B2A, 0x2F5D8C, 0xE8E2D6, 0x2a2a2e, 0x8a8d92, 0x3F7A4A, 0xD9A441, 0x6a2a4a, 0x7a9ab8, 0xa8a08a, 0x5a3a2a, 0xf0f0f0, 0x3a5a6a, 0x8a2a2a],
  pelican: [0xf0f0f0, 0xe8e2d6, 0xa8a08a, 0x2F5D8C, 0x3a5a3a, 0x8a8d92],
  tarpon: [0x8a2a2a, 0x2a2a2e, 0xf0f0f0, 0x3a5a3a, 0x5a3a2a, 0x2F5D8C, 0xa8a08a],
  barracuda: [0xC23B2A, 0xE0C030, 0x2a2a2e, 0x2F5D8C, 0xf0f0f0, 0x3F7A4A, 0xd96a1a]
};
export function pickModel(R) { const tot = STREET.reduce((a, s) => a + s[1], 0); let r = R() * tot; for (const [id, w] of STREET) { r -= w; if (r <= 0) return MODEL[id]; } return MODEL.marlin; }
export function pickPaint(m, R) { if (m.livery) return 0xffffff; const P = PAINTS[m.id] || PAINTS.default; return P[(R() * P.length) | 0]; }

/* ---------------- building ---------------- */
// a polygon clipped to z0 <= z <= z1 (Sutherland-Hodgman, twice)
function clipZ(poly, z0, z1) {
  const half = (P, keep, cut) => { const out = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ia = keep(a), ib = keep(b); if (ia) out.push(a); if (ia !== ib) { const t = (cut - a[0]) / (b[0] - a[0]); out.push([cut, a[1] + (b[1] - a[1]) * t]); } } return out; };
  return half(half(poly, (p) => p[0] >= z0, z0), (p) => p[0] <= z1, z1);
}
// the whole side silhouette: the outline over the top, then the bottom edge with an arch over each wheel
function silhouette(m) {
  const pts = m.outline.map((p) => p.slice()), y0 = m.clear, r = m.wheelR + 0.07;
  const rear = pts[pts.length - 1][0], front = pts[0][0], bottom = [];
  const arch = (z) => { const o = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); o.push([z - Math.cos(a) * r, Math.max(y0, m.wheelR + Math.sin(a) * r * 0.98)]); } return o; };
  bottom.push([rear + 0.04, y0]);
  for (const az of [m.axle[1], m.axle[0]]) bottom.push(...arch(az));
  bottom.push([front - 0.04, y0]);
  return pts.concat(bottom);
}
// where the nose (front) or the tail meets a height y: the outermost z of the outline there
function faceZ(m, y, front) {
  let best = front ? -9 : 9; const o = m.outline;
  for (let i = 0; i < o.length - 1; i++) { const [z0, y0] = o[i], [z1, y1] = o[i + 1]; if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue; const z = z0 + (z1 - z0) * (y - y0) / (y1 - y0); best = front ? Math.max(best, z) : Math.min(best, z); }
  return best === 9 || best === -9 ? (front ? o[0][0] : o[o.length - 1][0]) : best;
}
const tumble = (m, y) => { const c = m.cab, k = Math.max(0, Math.min(1, (y - c.belt) / (c.roof - c.belt))); return 1 - (c.inset / (m.W / 2)) * k; };

class Parts {
  constructor() { this.list = []; }
  // geo: any geometry; col: [r,g,b]; paint 0/1; glow 0/1; shell: true if it should take dents (subdivided)
  add(geo, col, paint = 0, glow = 0, shell = false) { const g = geo.index ? geo.toNonIndexed() : geo; g.userData = { col, paint, glow, shell }; this.list.push(g); return g; }
  box(w, h, d, x, y, z, col, paint = 0, glow = 0, shell = false) { return this.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col, paint, glow, shell); }
  // a bar from a to b (vectors), square section t
  bar(a, b, t, col, paint = 0, shell = false) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length(), g = new THREE.BoxGeometry(t, t, L);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize());
    g.applyQuaternion(q).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return this.add(g, col, paint, 0, shell);
  }
  // a flat polygon (world points, wound either way), double-sided by duplicating
  poly(pts, col, paint = 0, glow = 0) {
    const pos = []; for (let i = 1; i < pts.length - 1; i++) for (const p of [pts[0], pts[i], pts[i + 1]]) pos.push(p.x, p.y, p.z);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); return this.add(g, col, paint, glow);
  }
}
// extrude a side polygon across x0..x1 (rounded edges); returns the geometry in car space
function extrude(poly, x0, x1, bevel = 0.05) {
  const s = new THREE.Shape(poly.map(([z, y]) => new THREE.Vector2(z, y)));
  const bt = Math.min(bevel, (x1 - x0) / 3), g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, x1 - x0 - 2 * bt), bevelEnabled: bevel > 0, bevelThickness: bt, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 4 });
  // shape (u, v) extruded along w -> car (x, y, z) = (x0 + bt + w, v, u)
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i), w = p.getZ(i); p.setXYZ(i, x0 + bt + w, v, u); }
  // swapping two axes mirrors it, which turns every triangle inside out: put the winding back
  let h = g.index ? g.toNonIndexed() : g; const q = h.attributes.position;
  for (let i = 0; i < q.count; i += 3) { const x = q.getX(i + 1), y = q.getY(i + 1), z = q.getZ(i + 1); q.setXYZ(i + 1, q.getX(i + 2), q.getY(i + 2), q.getZ(i + 2)); q.setXYZ(i + 2, x, y, z); }
  h.deleteAttribute("normal"); h.deleteAttribute("uv"); return h;
}
// split long triangles so a shell is fine enough to dent (and every car is the same, dented or not)
function subdivide(g, maxEdge) {
  const P = Array.from(g.attributes.position.array), out = [];
  const tri = (a, b, c, depth) => {
    const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), ab = d(a, b), bc = d(b, c), ca = d(c, a), mx = Math.max(ab, bc, ca);
    if (mx <= maxEdge || depth > 7) { out.push(...a, ...b, ...c); return; }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    if (mx === ab) { const m = mid(a, b); tri(a, m, c, depth + 1); tri(m, b, c, depth + 1); }
    else if (mx === bc) { const m = mid(b, c); tri(a, b, m, depth + 1); tri(a, m, c, depth + 1); }
    else { const m = mid(c, a); tri(a, b, m, depth + 1); tri(m, b, c, depth + 1); }
  };
  for (let i = 0; i < P.length; i += 9) tri(P.slice(i, i + 3), P.slice(i + 3, i + 6), P.slice(i + 6, i + 9), 0);
  const ng = new THREE.BufferGeometry(); ng.setAttribute("position", new THREE.Float32BufferAttribute(out, 3)); ng.userData = g.userData; return ng;
}
// bake a list of parts into one geometry: position, normal, color, aPaint, aGlow
function bake(list, maxEdge) {
  const geos = list.map((g) => { let h = g.userData.shell && maxEdge ? subdivide(g, maxEdge) : g; if (h.index) h = h.toNonIndexed(); h.userData = g.userData; return h; });
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), paint = new Float32Array(n), glow = new Float32Array(n), shell = new Uint8Array(n), ranges = []; let o = 0;
  for (const g of geos) {
    const p = g.attributes.position.array, c = g.userData.col; pos.set(p, o * 3);
    { let cx = 0, cy = 0, cz = 0; const k = g.attributes.position.count; for (let i = 0; i < k; i++) { cx += p[i * 3]; cy += p[i * 3 + 1]; cz += p[i * 3 + 2]; } ranges.push({ start: o, count: k, c: [cx / k, cy / k, cz / k], glow: g.userData.glow, tag: g.userData.tag || null }); }
    for (let i = 0; i < g.attributes.position.count; i++) { col.set(c, (o + i) * 3); paint[o + i] = g.userData.paint; glow[o + i] = g.userData.glow; shell[o + i] = g.userData.shell ? 1 : 0; }
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setAttribute("aPaint", new THREE.BufferAttribute(paint, 1)); out.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
  out.computeVertexNormals(); out.computeBoundingSphere(); out.userData.shell = shell; out.userData.ranges = ranges;
  return out;
}

// the passenger's door: the driver's, mirrored across the car (and turned right side out again)
function mirrorX(g) {
  const out = new THREE.BufferGeometry();
  for (const n of ["position", "color", "aPaint", "aGlow"]) out.setAttribute(n, g.attributes[n].clone());
  const P = out.attributes.position, A = P.array; for (let i = 0; i < P.count; i++) A[i * 3] = -A[i * 3];
  for (const n of ["position", "color", "aPaint", "aGlow"]) { const at = out.attributes[n], k = at.itemSize, a = at.array; for (let t = 0; t < at.count; t += 3) for (let j = 0; j < k; j++) { const x = a[(t + 1) * k + j]; a[(t + 1) * k + j] = a[(t + 2) * k + j]; a[(t + 2) * k + j] = x; } }
  out.computeVertexNormals(); out.computeBoundingSphere();
  const sh = g.userData.shell, sh2 = new Uint8Array(sh.length); for (let t = 0; t < sh.length; t += 3) { sh2[t] = sh[t]; sh2[t + 1] = sh[t + 2]; sh2[t + 2] = sh[t + 1]; }
  out.userData = { shell: sh2, ranges: g.userData.ranges.map((r) => ({ ...r, c: [-r.c[0], r.c[1], r.c[2]] })) };
  return out;
}

/* the model's geometry: { body, glass, door (the driver's door, for the moved-apart copy), lamps, seat, ... } */
const CACHE = new Map();
export function buildModel(m, fine = 0.22) {
  const key = m.id + ":" + fine; if (CACHE.has(key)) return CACHE.get(key);
  const P = new Parts(), G = new Parts(), D = new Parts(), DG = new Parts(), c = m.cab, hw = m.W / 2, sil = silhouette(m);
  const police = m.livery === "police", taxi = m.livery === "taxi";
  const BODY = police ? [0.07, 0.075, 0.09] : taxi ? [0.92, 0.72, 0.12] : [1, 1, 1], PAINT = police || taxi ? 0 : 1, DOORC = police ? [0.92, 0.92, 0.9] : BODY;
  const zEnd = m.outline[0][0], zTail = m.outline[m.outline.length - 1][0];
  // nose: solid, to the cabin's front
  P.add(extrude(clipZ(sil, c.zf, 9), -hw, hw, 0.07), BODY, PAINT, 0, true);
  // tail: solid (a saloon's boot), or the van's cargo box, or a pickup's bed (a tub)
  if (m.bed) {
    const bed = clipZ(sil, zTail - 1, m.bed.z1);
    for (const s of [-1, 1]) P.add(extrude(bed, s < 0 ? -hw : hw - 0.08, s < 0 ? -hw + 0.08 : hw, 0.03), BODY, PAINT, 0, true);
    P.add(extrude(clipZ(bed.map(([z, y]) => [z, Math.min(y, m.bed.floor)]), zTail - 1, m.bed.z1), -hw + 0.06, hw - 0.06, 0.02), BODY, PAINT, 0, true);
    P.box(m.W - 0.16, 0.36, 0.07, 0, 0.94, zTail + 0.06, BODY, PAINT, 0, true);   // the tailgate
    P.box(m.W - 0.2, 0.32, 0.06, 0, 0.98, m.bed.z1 + 0.03, BODY, PAINT, 0, true);   // the bulkhead behind the cab
    P.box(m.W - 0.2, 0.02, m.bed.z1 - zTail - 0.2, 0, m.bed.floor + 0.012, (m.bed.z1 + zTail) / 2, [0.16, 0.16, 0.17]);   // a bed liner
  } else P.add(extrude(clipZ(sil, zTail - 1, c.zr), -hw, hw, 0.07), BODY, PAINT, 0, true);
  // the cabin tub: door skins each side (the livery's colour on a cruiser), the sills, the floor
  // (on the driver's side the skin stops at the front door's shut line: the door itself is its own part, so the
  // opening is really open when it swings)
  const zDoor0 = c.zB !== undefined ? c.zB : (c.zr + c.zf) / 2;
  const mid = clipZ(sil, c.zr, c.zf).map(([z, y]) => [z, Math.min(y, c.belt)]), midRear = clipZ(sil, c.zr, zDoor0 + 0.02).map(([z, y]) => [z, Math.min(y, c.belt)]);
  // (both front doors are their own parts, the passenger's a mirror of the driver's)
  for (const s of [-1, 1]) P.add(extrude(midRear, s < 0 ? -hw : hw - 0.07, s < 0 ? -hw + 0.07 : hw, 0.03), DOORC, PAINT, 0, true);
  { const lo = m.clear + 0.06, front = clipZ(sil, zDoor0, c.zf).map(([z, y]) => [z, Math.min(y, lo + 0.1)]); for (const s of [-1, 1]) P.add(extrude(front, s > 0 ? hw - 0.07 : -hw + 0.01, s > 0 ? hw - 0.01 : -hw + 0.07, 0.01), [0.12, 0.12, 0.13]); }   // the sills under the doors
  P.add(extrude(clipZ(mid.map(([z, y]) => [z, Math.min(y, m.clear + 0.16)]), c.zr, c.zf), -hw + 0.05, hw - 0.05, 0.01), [0.14, 0.14, 0.15]);
  // the greenhouse: pillars, roof, frames
  const V = (x, y, z) => new THREE.Vector3(x, y, z), hb = hw - 0.05, hr = hw - c.inset;
  const roofF = c.zrf, roofR = c.zrr;
  for (const s of [-1, 1]) {
    P.bar(V(s * hb, c.belt, c.zf - 0.02), V(s * hr, c.roof - 0.03, roofF), 0.08, police ? DOORC : BODY, PAINT, true);   // A
    P.bar(V(s * hb, c.belt, c.zr + 0.02), V(s * hr, c.roof - 0.03, roofR), c.flatBack ? 0.1 : 0.16, BODY, PAINT, true);   // C
    if (c.zB !== undefined && !c.flatBack) P.bar(V(s * hb, c.belt, c.zB), V(s * hr, c.roof - 0.03, c.zB + (roofF - c.zB) * 0.05), 0.09, TRIM);   // B
    if (c.zB2 !== undefined) P.bar(V(s * hb, c.belt, c.zB2), V(s * hr, c.roof - 0.03, c.zB2), 0.08, TRIM);
    P.bar(V(s * hr, c.roof - 0.03, roofR), V(s * hr, c.roof - 0.03, roofF), 0.07, BODY, PAINT, true);   // the roof rail
    // the window's waist trim (on the driver's side, the front part rides on the door)
    P.bar(V(s * hb, c.belt + 0.01, c.zr), V(s * hb, c.belt + 0.01, zDoor0 + 0.02), 0.035, TRIM); if (s > 0) D.bar(V(hb, c.belt + 0.01, zDoor0 + 0.03), V(hb, c.belt + 0.01, c.zf - 0.03), 0.035, TRIM);
  }
  { // the roof: a slab with a slight crown
    const pts = [], seg = 4;
    for (let i = 0; i <= seg; i++) { const x = -hr + 2 * hr * i / seg, y = c.roof + 0.025 * Math.sin(Math.PI * i / seg); pts.push([x, y]); }
    const pos = [];
    for (let i = 0; i < seg; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; for (const [x, y, z] of [[x0, y0, roofR], [x1, y1, roofF], [x1, y1, roofR], [x0, y0, roofR], [x0, y0, roofF], [x1, y1, roofF]]) pos.push(x, y, z); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); P.add(g, BODY, PAINT, 0, true);
    P.box(hr * 2 - 0.02, 0.03, roofF - roofR - 0.02, 0, c.roof - 0.02, (roofF + roofR) / 2, [0.2, 0.2, 0.21]);   // headliner
  }
  // the van's cargo box, the cab's back wall
  if (m.cargo) P.box(m.W - 0.12, c.roof - c.belt, 0.06, 0, (c.roof + c.belt) / 2, c.zr + 0.03, BODY, PAINT, 0, true);
  // glass: windscreen, back window, side windows (the driver's front window rides on the door)
  const gl = (x, y, z) => V(x, y, z), side = (s, z0, z1, top0, top1) => { const xa = s * hb * 0.995, xb = s * hr * 0.99; return [gl(xa, c.belt + 0.02, z0), gl(xa, c.belt + 0.02, z1), gl(xb, top1, Math.min(z1, roofF)), gl(xb, top0, Math.max(z0, roofR))]; };
  G.poly([gl(-hb + 0.06, c.belt + 0.03, c.zf - 0.04), gl(hb - 0.06, c.belt + 0.03, c.zf - 0.04), gl(hr - 0.05, c.roof - 0.05, roofF + 0.02), gl(-hr + 0.05, c.roof - 0.05, roofF + 0.02)], [1, 1, 1]);
  if (!c.flatBack || m.id === "pelican") {
    if (!m.cargo) G.poly([gl(-hr + 0.06, c.roof - 0.05, roofR - 0.02), gl(hr - 0.06, c.roof - 0.05, roofR - 0.02), gl(hb - 0.08, c.belt + 0.03, c.zr + 0.06), gl(-hb + 0.08, c.belt + 0.03, c.zr + 0.06)], [1, 1, 1]);
  } else G.poly([gl(-hr + 0.06, c.roof - 0.08, c.zr + 0.04), gl(hr - 0.06, c.roof - 0.08, c.zr + 0.04), gl(hb - 0.1, c.belt + 0.06, c.zr + 0.04), gl(-hb + 0.1, c.belt + 0.06, c.zr + 0.04)], [1, 1, 1]);
  const zDoor = c.zB !== undefined ? c.zB : (c.zr + c.zf) / 2;
  const lerpTop = (z) => { if (z >= roofF) return c.belt + (c.roof - c.belt) * Math.max(0, 1 - (z - roofF) / Math.max(0.01, c.zf - roofF)); if (z <= roofR) return c.belt + (c.roof - c.belt) * Math.max(0, 1 - (roofR - z) / Math.max(0.01, roofR - c.zr)); return c.roof; };
  for (const s of [-1, 1]) {
    const front = side(s, zDoor + 0.05, c.zf - 0.1, lerpTop(zDoor) - 0.06, c.roof - 0.06);
    if (s > 0) DG.poly(front, [1, 1, 1]);
    if (!m.cargo && zDoor - c.zr > 0.4) { const z0 = c.zB2 !== undefined ? c.zB2 + 0.05 : c.zr + 0.12, z1 = zDoor - 0.05; G.poly(side(s, z0, z1, lerpTop(z0) - 0.06, lerpTop(z1) - 0.06), [1, 1, 1]); if (c.zB2 !== undefined) G.poly(side(s, c.zr + 0.1, c.zB2 - 0.05, lerpTop(c.zr + 0.1) - 0.06, lerpTop(c.zB2 - 0.05) - 0.06), [1, 1, 1]); }
  }
  // the driver's door: its skin, its handle, its mirror; its own part so it can swing open (carrender.js)
  const dz0 = zDoor + 0.02, dz1 = c.zf - 0.02, doorPoly = clipZ(sil, dz0, dz1).map(([z, y]) => [z, Math.min(y, c.belt)]).filter(([z, y]) => y > m.clear + 0.1 || true);
  const doorShape = doorPoly.map(([z, y]) => [z, Math.max(y, m.clear + 0.17)]);
  D.add(extrude(doorShape, hw - 0.06, hw, 0.02), DOORC, PAINT, 0, true);
  // its inside: a trim panel, an armrest, the pull handle
  D.add(extrude(clipZ(doorShape, dz0 + 0.05, dz1 - 0.05).map(([z, y]) => [z, Math.min(y, c.belt - 0.04)]), hw - 0.075, hw - 0.058, 0.01), [0.24, 0.22, 0.2]);
  D.box(0.07, 0.05, 0.42, hw - 0.1, c.belt - 0.28, zDoor + 0.45, [0.16, 0.15, 0.14]);
  // the window frame round its glass: the rear post, the top rail up to the roof, down the pillar
  { const V3 = (x, y, z) => new THREE.Vector3(x, y, z), hb2 = hw - 0.05, hr2 = hw - c.inset, top0 = c.belt + (c.roof - c.belt) * Math.max(0, Math.min(1, 1 - (c.zrr - zDoor) / Math.max(0.01, c.zrr - c.zr))) - 0.04;
    const rp0 = V3(hb2, c.belt, dz0 + 0.02), rp1 = V3(hb2 + (hr2 - hb2) * Math.min(1, (top0 - c.belt) / (c.roof - c.belt)), Math.min(top0, c.roof - 0.05), dz0 + 0.02);
    const fr1 = V3(hr2, c.roof - 0.05, c.zrf), fr0 = V3(hb2, c.belt, dz1 - 0.06);
    if (!c.flatBack || true) { D.bar(rp0, rp1, 0.04, TRIM); D.bar(rp1, fr1, 0.04, police ? DOORC : BODY, police ? 0 : PAINT); D.bar(fr1, fr0, 0.035, TRIM); } }
  D.box(0.03, 0.03, 0.16, hw + 0.02, c.belt - 0.12, zDoor + 0.18, police ? TRIM : CHROME);   // handle
  D.box(0.18, 0.1, 0.08, hw + 0.07, c.belt + 0.06, c.zf - 0.08, police ? TRIM : BODY, police ? 0 : PAINT);   // the mirror
  if (m.doors === 4 && c.zB !== undefined) for (const s of [-1, 1]) P.box(0.03, 0.03, 0.14, s * (hw + 0.012), c.belt - 0.12, c.zr + 0.36, police ? TRIM : CHROME);
  // bumpers, grille, plates, arch liners, sills, exhaust
  P.box(m.W - 0.12, 0.17, 0.14, 0, m.clear + 0.18, zEnd + 0.02, police ? TRIM : m.kind === "coupe" ? BODY : TRIM, m.kind === "coupe" ? PAINT : 0);
  P.box(m.W - 0.12, 0.17, 0.14, 0, m.clear + 0.18, zTail - 0.02, m.kind === "coupe" ? BODY : TRIM, m.kind === "coupe" ? PAINT : 0);
  const gY = m.lamps.head[1] - 0.02, fz = (y) => faceZ(m, y, true) + 0.045, rz = (y) => faceZ(m, y, false) - 0.045;
  P.box(m.W * 0.42, 0.13, 0.04, 0, gY, fz(gY), [0.05, 0.05, 0.055]);
  for (const k of [0.04, 0.0, -0.04]) P.box(m.W * 0.4, 0.012, 0.03, 0, gY + k, fz(gY) + 0.012, CHROME);
  const py = m.clear + 0.3, ty0 = m.lamps.tail[1] - 0.24;
  P.box(0.34, 0.11, 0.02, 0, py, Math.max(fz(py), zEnd + 0.1), [0.92, 0.9, 0.84]); P.box(0.34, 0.11, 0.02, 0, ty0, Math.min(rz(ty0), zTail - 0.1), [0.92, 0.9, 0.84]);
  for (const az of m.axle) P.box(m.W - 0.5, m.wheelR + 0.08, m.wheelR * 2 + 0.1, 0, m.wheelR + 0.06, az, [0.035, 0.035, 0.04]);
  // rocker trim: behind the doors on the body, under them on the doors
  { const z0 = c.zr + 0.1, z1 = zDoor0; if (z1 - z0 > 0.1) for (const s of [-1, 1]) P.box(0.04, 0.06, z1 - z0, s * (hw + 0.005), m.clear + 0.06, (z0 + z1) / 2, TRIM); D.box(0.04, 0.06, c.zf - 0.1 - zDoor0 - 0.04, hw + 0.005, m.clear + 0.2, (zDoor0 + 0.02 + c.zf - 0.1) / 2, TRIM); }
  P.add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6).rotateX(Math.PI / 2).translate(-hw * 0.55, m.clear + 0.06, zTail - 0.05), [0.3, 0.3, 0.32]);
  // lamps: headlamps, tail lamps (the brake lights are fleet's), indicators
  const [, hy, hx] = m.lamps.head, [, ty, tx] = m.lamps.tail, hz = faceZ(m, hy, true) + 0.04, tz = faceZ(m, ty, false) - 0.04;
  for (const s of [-1, 1]) { P.box(0.36, 0.13, 0.05, s * hx, hy, hz - 0.005, [1, 0.96, 0.86], 0, 1).userData.tag = "head" + (s > 0 ? 0 : 1); P.box(0.38, 0.15, 0.04, s * hx, hy, hz - 0.03, CHROME); P.box(0.12, 0.08, 0.05, s * (hx + 0.24), hy - 0.02, hz - 0.02, [1, 0.55, 0.1], 0, 0); }
  for (const s of [-1, 1]) P.box(0.4, 0.15, 0.05, s * tx, ty, tz + 0.005, [0.45, 0.04, 0.03], 0, 0).userData.tag = "tail" + (s > 0 ? 0 : 1);
  // liveries: the cruiser's bar mount and push bar and door shields, the cab's roof sign
  if (police) {
    P.box(1.3, 0.06, 0.28, 0, c.roof + 0.05, (roofF + roofR) / 2, TRIM);
    P.box(m.W - 0.3, 0.3, 0.08, 0, m.clear + 0.32, zEnd + 0.16, [0.04, 0.04, 0.045]); for (const s of [-1, 1]) P.box(0.08, 0.36, 0.2, s * 0.5, m.clear + 0.34, zEnd + 0.08, [0.04, 0.04, 0.045]);
    for (const s of [-1, 1]) P.box(0.02, 0.22, 0.26, s * (hw + 0.013), c.belt - 0.32, zDoor + 0.42, [0.78, 0.62, 0.2]);
  }
  if (taxi) { P.box(0.62, 0.2, 0.26, 0, c.roof + 0.12, (roofF + roofR) / 2, [1, 0.92, 0.5], 0, 1); P.box(0.68, 0.04, 0.3, 0, c.roof + 0.02, (roofF + roofR) / 2, TRIM); for (const s of [-1, 1]) P.box(0.02, 0.1, 0.9, s * (hw + 0.013), c.belt - 0.28, (c.zr + c.zf) / 2, [0.08, 0.08, 0.08]); }
  // inside: the dash, the wheel, the seats, the console (seen through the glass)
  const [sx, sy, sz] = m.seat, [wx, wy, wz] = m.wheelAt;
  P.box(m.W - 0.2, 0.22, 0.42, 0, c.belt - 0.06, c.zf - 0.24, DASH);
  P.box(m.W - 0.24, 0.04, 0.5, 0, c.belt + 0.06, c.zf - 0.28, [0.07, 0.07, 0.08]);
  P.add(new THREE.TorusGeometry(0.17, 0.022, 4, 12).rotateX(-0.42).translate(wx, wy, wz), RUBBER);
  P.add(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 5).rotateX(Math.PI / 2 - 0.42).translate(wx, wy - 0.06, wz + 0.17), RUBBER);
  P.box(0.22, 0.2, 0.7, 0, m.clear + 0.26, (c.zf + sz) / 2 - 0.1, [0.13, 0.13, 0.14]);   // console
  const seatC = police ? [0.12, 0.12, 0.13] : [0.32, 0.28, 0.24];
  for (const s of [-1, 1]) {
    P.box(0.5, 0.14, 0.52, s * sx, sy - 0.08, sz, seatC);
    P.bar(V(s * sx, sy - 0.02, sz - 0.26), V(s * sx, sy + 0.56, sz - 0.4), 0.1, seatC); P.box(0.48, 0.5, 0.1, s * sx, sy + 0.26, sz - 0.33, seatC);
    P.box(0.26, 0.14, 0.1, s * sx, sy + 0.62, sz - 0.42, seatC);   // head rests
  }
  if (m.doors === 4 && !m.cargo && c.zr < sz - 0.8) { const bz = Math.max(c.zr + 0.4, sz - 0.95); P.box(m.W - 0.32, 0.14, 0.5, 0, sy - 0.1, bz, seatC); P.box(m.W - 0.32, 0.46, 0.1, 0, sy + 0.18, bz - 0.28, seatC); }
  const fineEdge = fine;
  const body = bake(P.list, fineEdge), glass = bake(G.list, 0), door = bake(D.list, fineEdge), doorGlass = bake(DG.list, 0);
  const out = { m, body, glass, door, doorGlass, door2: mirrorX(door), doorGlass2: mirrorX(doorGlass), hinge: new THREE.Vector3(hw, 0, c.zf - 0.02), hinge2: new THREE.Vector3(-hw, 0, c.zf - 0.02), zDoor,
    seat: new THREE.Vector3(sx, sy, sz), wheel: new THREE.Vector3(wx, wy, wz),
    wheels: [[m.track / 2, m.axle[0]], [-m.track / 2, m.axle[0]], [m.track / 2, m.axle[1]], [-m.track / 2, m.axle[1]]],
    tails: [[tx, ty, tz], [-tx, ty, tz]], ind: [[hx + 0.24, hy - 0.02, hz], [hx + 0.24, ty, tz]], half: [hw, Math.max(zEnd, -zTail)], height: c.roof };
  CACHE.set(key, out); return out;
}

/* a wheel: tyre, rim with five spokes, the hub (radius 1, width 0.62, axle along x) */
let WHEEL = null;
export function wheelGeometry() {
  if (WHEEL) return WHEEL;
  const P = new Parts();
  P.add(new THREE.CylinderGeometry(1, 1, 0.62, 14, 1, true).rotateZ(Math.PI / 2), RUBBER);
  for (const s of [-1, 1]) P.add(new THREE.RingGeometry(0.66, 1, 14, 1).rotateY(s * Math.PI / 2).translate(s * 0.31, 0, 0), [0.08, 0.08, 0.085]);
  for (const s of [-1, 1]) P.add(new THREE.CircleGeometry(0.66, 10).rotateY(s * Math.PI / 2).translate(s * 0.27, 0, 0), [0.5, 0.51, 0.54]);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; P.add(new THREE.BoxGeometry(0.08, 0.56, 0.12).translate(0, 0.3, 0).rotateX(a).translate(0.3, 0, 0), [0.7, 0.71, 0.74]); }
  P.add(new THREE.CylinderGeometry(0.15, 0.15, 0.66, 6).rotateZ(Math.PI / 2), [0.32, 0.32, 0.34]);
  WHEEL = bake(P.list, 0); return WHEEL;
}

/* someone at the wheel, seen through the glass from a distance: a seated torso, head, arms to the wheel.
   aPaint marks the clothes (the colour per instance); in car space for a model's driver's seat */
const DRIVERS = new Map();
export function driverGeometry(m) {
  if (DRIVERS.has(m.id)) return DRIVERS.get(m.id);
  const P = new Parts(), [sx, sy, sz] = m.seat, [wx, wy, wz] = m.wheelAt, SKIN = [0.62, 0.45, 0.34], HAIR = [0.12, 0.09, 0.07];
  const V = (x, y, z) => new THREE.Vector3(x, y, z), lean = -0.18;
  const torso = new THREE.BoxGeometry(0.38, 0.56, 0.22).rotateX(lean).translate(sx, sy + 0.34, sz - 0.18); P.add(torso, [1, 1, 1], 1);
  P.box(0.15, 0.2, 0.17, sx, sy + 0.73, sz - 0.25, SKIN); P.box(0.16, 0.06, 0.18, sx, sy + 0.84, sz - 0.27, HAIR);
  for (const s of [-1, 1]) {
    const sh = V(sx + s * 0.2, sy + 0.55, sz - 0.2), hand = V(wx + s * 0.15, wy + 0.04, wz - 0.06), el = sh.clone().lerp(hand, 0.5).add(V(s * 0.06, -0.12, 0));
    P.bar(sh, el, 0.09, [1, 1, 1], 1); P.bar(el, hand, 0.07, [1, 1, 1], 1); P.box(0.06, 0.06, 0.08, hand.x, hand.y, hand.z, SKIN);
  }
  for (const s of [-1, 1]) P.bar(V(sx + s * 0.1, sy + 0.04, sz - 0.05), V(sx + s * 0.1, sy + 0.1, sz + 0.42), 0.15, [0.2, 0.22, 0.28]);
  const g = bake(P.list, 0); DRIVERS.set(m.id, g); return g;
}

/* materials. The body: lambert, flat, the vertex colours times the paint where aPaint is set (per instance, or a
   uniform on a single car), and the lamps lighting themselves. The glass: tinted, see-through, a little shine. */
export function bodyMaterial(instanced) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const u = { uPaint: { value: new THREE.Color(1, 1, 1) }, uGlow: { value: 1 } }; m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aPaint; attribute float aGlow; varying float vGlow; uniform vec3 uPaint;")
      .replace("#include <color_vertex>", `#include <color_vertex>
        vGlow = aGlow;
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor.xyz, aPaint);
        #else
          vColor.xyz = color.xyz * mix(vec3(1.0), uPaint, aPaint);
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vGlow; uniform float uGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * vGlow * uGlow * 1.2;");
  };
  m.customProgramCacheKey = () => "carbody" + (instanced ? "i" : "");
  return m;
}
export function glassMaterial() {
  return new THREE.MeshPhongMaterial({ color: 0x223040, specular: 0x9ab0c8, shininess: 60, transparent: true, opacity: 0.36, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
}
export function wheelMaterial() { return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }); }
