/* Marlowe Keys: the island, generated from a seed so it's the same every run.
   A street grid of 64 m blocks (50 m lots, 14 m roads), districts with their
   own building styles, Tideline beach and pier to the south, a sea wall all
   round. Everything is merged or instanced so the whole city draws in a few
   dozen calls. Collision is a spatial hash of boxes and circles. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const P = 64, ROAD = 14, LOT = P - ROAD, WALK = 3;
const I0 = -4, I1 = 4, J0 = -4, J1 = 3;                 // block index range (x, z)
export const EDGE = { w: (I0 - 0.5) * P - 7, e: (I1 + 0.5) * P + 7, n: (J0 - 0.5) * P - 7, s: (J1 + 0.5) * P + 7 };
export const SHORE = 272, PIER = { x0: 36, x1: 46, z0: EDGE.s, z1: 400, y: 0.15 };

function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function districtOf(i, j) {
  if (i <= -3) return "port";
  if (j >= J1) return "tideline";
  if (j <= -2 && Math.abs(i) <= 2) return "downtown";
  if ((i === 0 && j === 0) || (i === 2 && j === 1)) return "park";
  return "midtown";
}
export const DISTRICT_NAMES = { port: "Port Salt", tideline: "Tideline", downtown: "Downtown", park: "Palm Square", midtown: "Midtown", beach: "Tideline Beach", pier: "Tideline Pier" };

/* ---------- collision: spatial hash of boxes and circles ---------- */
class Grid {
  constructor(cell) { this.c = cell; this.m = new Map(); this.all = []; }
  _cells(x0, z0, x1, z1, fn) {
    const c = this.c;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) fn(i + "," + k);
  }
  add(o) {
    this.all.push(o);
    const [x0, z0, x1, z1] = o.r ? [o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r] : [o.x0, o.z0, o.x1, o.z1];
    this._cells(x0, z0, x1, z1, k => { let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(o); });
  }
  box(x0, z0, x1, z1, h) { const o = { x0, z0, x1, z1, h: h === undefined ? 50 : h }; this.add(o); return o; }
  circle(x, z, r, h) { this.add({ x, z, r, h: h || 3 }); }
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
      } else {
        const cx = Math.max(o.x0, Math.min(p.x, o.x1)), cz = Math.max(o.z0, Math.min(p.z, o.z1));
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-6) { p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
        else {   // centre inside the box: leave by the nearest face
          const l = p.x - o.x0, rr = o.x1 - p.x, t = p.z - o.z0, b = o.z1 - p.z, m = Math.min(l, rr, t, b);
          if (m === l) p.x = o.x0 - r; else if (m === rr) p.x = o.x1 + r; else if (m === t) p.z = o.z0 - r; else p.z = o.z1 + r;
        }
      }
    }
  }
  // fraction along a->b where the segment first hits a box (camera collision)
  ray(a, b) {
    let best = 1;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const o of this.near(Math.min(a.x, b.x) - 1, Math.min(a.z, b.z) - 1, Math.max(a.x, b.x) + 1, Math.max(a.z, b.z) + 1)) {
      if (o.r) continue;
      let t0 = 0, t1 = 1;
      for (const [s, d, lo, hi] of [[a.x, dx, o.x0, o.x1], [a.y, dy, o.y0 || -10, o.h], [a.z, dz, o.z0, o.z1]]) {
        if (Math.abs(d) < 1e-9) { if (s < lo || s > hi) { t0 = 2; break; } continue; }
        let u = (lo - s) / d, v = (hi - s) / d; if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < best) best = t0;
    }
    return best;
  }
}

/* ---------- textures, drawn once on canvases ---------- */
function canvas(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; }
function tex(c, srgb, rep) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4; return t;
}
function speckle(g, w, h, n, a, R) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${R() < .5 ? "0,0,0" : "255,255,255"},${a * R()})`; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } }

// A facade is 8 bays x 8 floors (bay 4 m, floor 3.5 m). Each style gets a colour and a lit-window map.
const STYLES = {
  glass:    { wall: "#26314A", glass: ["#3E5A86", "#4A6A98", "#33507A"], inset: [3, 5, 3, 3], lit: 0.34, warm: 0.55, band: null },
  deco:     { wall: null,      glass: ["#2E3A4A", "#3A4656"],            inset: [16, 14, 16, 22], lit: 0.3, warm: 0.9, band: "rgba(0,0,0,.12)" },
  concrete: { wall: "#958C80", glass: ["#2C333E", "#353C48"],            inset: [12, 12, 12, 16], lit: 0.22, warm: 0.8, band: "rgba(0,0,0,.08)" },
  ware:     { wall: "#6F767F", glass: ["#2A3038"],                        inset: [20, 26, 20, 26], lit: 0.06, warm: 0.6, band: null, ribs: true }
};
const DECO_WALLS = ["#EFC2AE", "#BFE1D6", "#F2DFB4", "#E8B9C6", "#CFD7EE"];
function facade(style, R, wallOverride) {
  const S = STYLES[style], cw = 64, ch = 64, W = cw * 8, H = ch * 8, wall = wallOverride || S.wall;
  const lit = [];
  const color = canvas(W, H, (g) => {
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    if (S.ribs) { g.fillStyle = "rgba(0,0,0,.18)"; for (let x = 0; x < W; x += 8) g.fillRect(x, 0, 3, H); }
    for (let f = 0; f < 8; f++) for (let b = 0; b < 8; b++) {
      const x = b * cw, y = f * ch, [l, t, r, bt] = S.inset;
      if (S.ribs && R() < 0.75) continue;
      g.fillStyle = S.glass[(R() * S.glass.length) | 0]; g.fillRect(x + l, y + t, cw - l - r, ch - t - bt);
      g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x + l, y + t, cw - l - r, 3);
      if (R() < S.lit) lit.push([x + l, y + t, cw - l - r, ch - t - bt, R() < S.warm]);
      if (S.band) { g.fillStyle = S.band; g.fillRect(x, y + ch - 6, cw, 6); }
    }
    speckle(g, W, H, 1800, 0.06, R);
  });
  const glow = canvas(W, H, (g) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
    for (const [x, y, w, h, warm] of lit) {
      g.fillStyle = warm ? `hsl(${32 + R() * 12},90%,${55 + R() * 15}%)` : `hsl(${195 + R() * 20},60%,${70 + R() * 10}%)`;
      g.globalAlpha = 0.55 + R() * 0.45; g.fillRect(x, y, w, h);
      g.globalAlpha = 0.35; g.fillStyle = "#000"; g.fillRect(x, y + h * (0.3 + R() * 0.5), w, 2);   // a blind or a mullion
    }
    g.globalAlpha = 1;
  });
  return { map: tex(color, true, true), emissiveMap: tex(glow, true, true) };
}

/* ---------- geometry builders (non-indexed, appended into per-material buffers) ---------- */
function Buf() { return { p: [], n: [], u: [], c: [] }; }
function quad(B, a, b, c, d, n, uv, col) {   // a b c d counter-clockwise seen from the front
  for (const [v, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [d, uv[3]]]) {
    B.p.push(v[0], v[1], v[2]); B.n.push(n[0], n[1], n[2]); B.u.push(t[0], t[1]);
    if (col) B.c.push(col.r, col.g, col.b);
  }
}
function geo(B) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(B.p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(B.n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(B.u, 2));
  if (B.c.length) g.setAttribute("color", new THREE.Float32BufferAttribute(B.c, 3));
  g.computeBoundingSphere(); return g;
}
// walls of a box building; UVs in facade units (8 bays of 4 m, 8 floors of 3.5 m per texture)
function walls(B, x0, z0, x1, z1, y0, y1, uo) {
  const U = (s) => s / 32 + uo, V = (y) => y / 28;
  const faces = [
    [[x0, z1], [x1, z1], [0, 0, 1]], [[x1, z1], [x1, z0], [1, 0, 0]],
    [[x1, z0], [x0, z0], [0, 0, -1]], [[x0, z0], [x0, z1], [-1, 0, 0]]
  ];
  let s = 0;
  for (const [[ax, az], [bx, bz], n] of faces) {
    const len = Math.hypot(bx - ax, bz - az);
    quad(B, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], n, [[U(s), V(y0)], [U(s + len), V(y0)], [U(s + len), V(y1)], [U(s), V(y1)]]);
    s += len;
  }
}
function roof(B, x0, z0, x1, z1, y, col) {
  quad(B, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], col);
}

/* ---------- the city ---------- */
export function buildWorld(scene, opts) {
  const R = seeded(20261124), grid = new Grid(16);
  const quality = (opts && opts.quality) || "high";
  const map = { blocks: [], parks: [], buildings: [], palms: [] };
  const lambert = (o) => new THREE.MeshLambertMaterial(o);
  const add = (mesh, cast, recv) => { mesh.castShadow = !!cast; mesh.receiveShadow = !!recv; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); scene.add(mesh); return mesh; };

  // ground: asphalt under the whole island
  const asphalt = tex(canvas(256, 256, (g, w, h) => { g.fillStyle = "#3A3B45"; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, 0.18, R); }), true, true);
  asphalt.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(EDGE.e - EDGE.w, EDGE.s - EDGE.n), lambert({ map: asphalt }));
  ground.rotation.x = -Math.PI / 2; ground.position.set((EDGE.w + EDGE.e) / 2, 0, (EDGE.n + EDGE.s) / 2);
  add(ground, false, true);

  // sea wall on three sides
  const wallMat = lambert({ color: 0x8A847C });
  const sw = [];
  const wallBox = (x0, z0, x1, z1) => { const g = new THREE.BoxGeometry(x1 - x0, 3, z1 - z0); g.translate((x0 + x1) / 2, -1.5, (z0 + z1) / 2); sw.push(g); };
  wallBox(EDGE.w - 2, EDGE.n - 2, EDGE.e + 2, EDGE.n); wallBox(EDGE.w - 2, EDGE.n, EDGE.w, EDGE.s); wallBox(EDGE.e, EDGE.n, EDGE.e + 2, EDGE.s);
  add(new THREE.Mesh(mergeGeometries(sw), wallMat), false, true);
  // railings keep you on land
  grid.box(EDGE.w - 4, EDGE.n - 4, EDGE.e + 4, EDGE.n + 0.6, 1.1); grid.box(EDGE.w - 4, EDGE.n, EDGE.w + 0.6, EDGE.s, 1.1); grid.box(EDGE.e - 0.6, EDGE.n, EDGE.e + 4, EDGE.s, 1.1);
  const rail = new THREE.Mesh(mergeGeometries([
    new THREE.BoxGeometry(EDGE.e - EDGE.w, 0.08, 0.08).translate((EDGE.w + EDGE.e) / 2, 1.05, EDGE.n + 0.3),
    new THREE.BoxGeometry(0.08, 0.08, EDGE.s - EDGE.n).translate(EDGE.w + 0.3, 1.05, (EDGE.n + EDGE.s) / 2),
    new THREE.BoxGeometry(0.08, 0.08, EDGE.s - EDGE.n).translate(EDGE.e - 0.3, 1.05, (EDGE.n + EDGE.s) / 2)
  ]), lambert({ color: 0xCFCAC2 }));
  add(rail);

  // facade materials: one per style (deco gets a few pastel variants)
  const mats = {};
  const mkMat = (key, style, wall) => { const t = facade(style, R, wall); mats[key] = lambert({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.15 }); };
  mkMat("glass", "glass"); mkMat("glass2", "glass", "#1F2A40"); mkMat("concrete", "concrete"); mkMat("ware", "ware");
  DECO_WALLS.forEach((c, k) => mkMat("deco" + k, "deco", c));
  const wallBufs = {}; Object.keys(mats).forEach(k => wallBufs[k] = Buf());
  const roofBuf = Buf(), slabs = [], grass = [];

  const building = (key, x0, z0, x1, z1, h) => {
    walls(wallBufs[key], x0, z0, x1, z1, 0, h, R());
    const shade = 0.22 + R() * 0.1, col = new THREE.Color(shade, shade * 0.98, shade * 1.04);
    roof(roofBuf, x0, z0, x1, z1, h, col);
    grid.box(x0, z0, x1, z1, h);
    map.buildings.push([x0, z0, x1, z1, h]);
    // rooftop clutter on mid-size roofs: plant rooms and water tanks
    if (h < 60 && (x1 - x0) > 10 && R() < 0.7) {
      const w = 3 + R() * 4, d = 3 + R() * 4, cx = x0 + 2 + R() * (x1 - x0 - w - 4), cz = z0 + 2 + R() * (z1 - z0 - d - 4);
      walls(wallBufs.concrete, cx, cz, cx + w, cz + d, h, h + 2.5 + R() * 2, R());
      roof(roofBuf, cx, cz, cx + w, cz + d, h + 4.5, col);
    }
  };

  const lots = [];
  for (let i = I0; i <= I1; i++) for (let j = J0; j <= J1; j++) {
    const cx = i * P, cz = j * P, half = LOT / 2, d = districtOf(i, j);
    map.blocks.push([cx - half, cz - half, cx + half, cz + half, d]);
    slabs.push(new THREE.BoxGeometry(LOT, 0.15, LOT).translate(cx, 0.075, cz));
    const x0 = cx - half + WALK, z0 = cz - half + WALK, x1 = cx + half - WALK, z1 = cz + half - WALK;   // buildable 44 x 44
    if (d === "park") { map.parks.push([x0, z0, x1, z1]); grass.push(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate(cx, 0.16, cz)); lots.push({ d, x0, z0, x1, z1, park: true }); continue; }
    lots.push({ d, x0, z0, x1, z1 });
    if (d === "downtown") {
      const h = 40 + R() * 80, key = R() < 0.5 ? "glass" : "glass2";
      if (R() < 0.55) { building(key, x0, z0, x1, z1, h * 0.45); const s = 6 + R() * 6; building(key, x0 + s, z0 + s, x1 - s, z1 - s, h); }
      else building(key, x0 + 2, z0 + 2, x1 - 2, z1 - 2, h);
    } else if (d === "port") {
      if (R() < 0.4) { building("ware", x0, z0, x1, z1, 9 + R() * 5); }
      else lots[lots.length - 1].yard = true;
    } else {
      // split the lot into two or four buildings with narrow alleys
      const sx = x0 + (x1 - x0) * (0.4 + R() * 0.2), sz = z0 + (z1 - z0) * (0.4 + R() * 0.2), gap = 1.5;
      const parts = R() < 0.5 ? [[x0, z0, sx - gap, z1], [sx + gap, z0, x1, z1]]
        : [[x0, z0, sx - gap, sz - gap], [sx + gap, z0, x1, sz - gap], [x0, sz + gap, sx - gap, z1], [sx + gap, sz + gap, x1, z1]];
      for (const [a, b, c, e] of parts) {
        const tide = d === "tideline";
        const key = tide || R() < 0.35 ? "deco" + ((R() * DECO_WALLS.length) | 0) : "concrete";
        building(key, a, b, c, e, tide ? 8 + R() * 12 : 8 + R() * 24);
      }
    }
  }
  for (const k of Object.keys(mats)) if (wallBufs[k].p.length) add(new THREE.Mesh(geo(wallBufs[k]), mats[k]), true, true);
  add(new THREE.Mesh(geo(roofBuf), lambert({ vertexColors: true })), true, true);

  const paving = tex(canvas(128, 128, (g, w, h) => {
    g.fillStyle = "#9A958E"; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, 0.12, R);
    g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 2; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  }), true, true);
  paving.repeat.set(12, 12);
  add(new THREE.Mesh(mergeGeometries(slabs), lambert({ map: paving })), false, true);
  const lawn = tex(canvas(128, 128, (g, w, h) => { g.fillStyle = "#3C6436"; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, 0.2, R); }), true, true); lawn.repeat.set(10, 10);
  if (grass.length) add(new THREE.Mesh(mergeGeometries(grass), lambert({ map: lawn })), false, true);

  // Port Salt yards: stacks of shipping containers
  const cont = [];
  for (const L of lots.filter(l => l.yard)) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
      if (R() < 0.15) continue;
      const x = L.x0 + 4 + c * 20, z = L.z0 + 4 + r * 10, stack = 1 + ((R() * 3) | 0);
      for (let s = 0; s < stack; s++) cont.push([x + 6.1, 1.3 + s * 2.6, z + 1.2, (R() * 6) | 0]);
      grid.box(x, z, x + 12.2, z + 2.44, stack * 2.6);
    }
  }
  if (cont.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.59, 2.44), lambert({ color: 0xffffff }), cont.length);
    const pal = [0xB5462F, 0x2F6E8C, 0xD9A441, 0x3F7A4A, 0x8C8F94, 0xC2633B], m = new THREE.Matrix4(), col = new THREE.Color();
    cont.forEach(([x, y, z, k], n) => { m.makeTranslation(x, y, z); im.setMatrixAt(n, m); im.setColorAt(n, col.setHex(pal[k])); });
    add(im, true, true);
  }

  // road markings: dashed centre lines and zebra crossings, instanced
  const dashes = [], zebras = [];
  const xs = [], zs = [];
  for (let i = I0 - 1; i <= I1; i++) xs.push((i + 0.5) * P);
  for (let j = J0 - 1; j <= J1; j++) zs.push((j + 0.5) * P);
  for (const x of xs) for (let z = EDGE.n + 10; z < EDGE.s - 10; z += 6) if (!zs.some(rz => Math.abs(rz - z) < 9)) dashes.push([x, z, 0]);
  for (const z of zs) for (let x = EDGE.w + 10; x < EDGE.e - 10; x += 6) if (!xs.some(rx => Math.abs(rx - x) < 9)) dashes.push([x, z, 1]);
  for (const x of xs) for (const z of zs) for (const [ox, oz, rot] of [[0, 8.2, 1], [0, -8.2, 1], [8.2, 0, 0], [-8.2, 0, 0]])
    for (let s = -3; s <= 3; s++) zebras.push(rot ? [x + s * 1.6, z + oz, 0] : [x + ox, z + s * 1.6, 1]);
  const stripes = (list, w, l, color) => {
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2 }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    list.forEach(([x, z, rot], n) => { q.setFromAxisAngle(up, rot ? Math.PI / 2 : 0); m.compose(new THREE.Vector3(x, 0.012, z), q, one); im.setMatrixAt(n, m); });
    add(im, false, true);
  };
  stripes(dashes, 0.16, 3, 0xD8D2C4);
  stripes(zebras, 0.9, 3.2, 0xCFCAC0);

  // Tideline beach: sand sloping under the water, wet sand where the waves reach
  const sandC = tex(canvas(256, 256, (g, w, h) => { g.fillStyle = "#D9C49A"; g.fillRect(0, 0, w, h); speckle(g, w, h, 6000, 0.14, R); }), true, true); sandC.repeat.set(60, 20);
  const bw = EDGE.e - EDGE.w + 60, beachG = new THREE.PlaneGeometry(bw, 140, 1, 14).rotateX(-Math.PI / 2);
  const bp = beachG.attributes.position;
  for (let k = 0; k < bp.count; k++) { const z = bp.getZ(k) + 70; bp.setY(k, -Math.max(0, z - 2) * 0.017 - Math.max(0, z - 40) * 0.01); }
  beachG.translate((EDGE.w + EDGE.e) / 2, 0, EDGE.s + 70); beachG.computeVertexNormals();
  add(new THREE.Mesh(beachG, lambert({ map: sandC })), false, true);
  // the shore: an invisible wall at the waterline, with a gap for the pier
  grid.box(EDGE.w, SHORE, PIER.x0 - 0.3, SHORE + 4, 0.5); grid.box(PIER.x1 + 0.3, SHORE, EDGE.e, SHORE + 4, 0.5);

  // Tideline Pier: deck on piles, rails, a hut at the end
  const wood = tex(canvas(128, 128, (g, w, h) => { g.fillStyle = "#8A6A4C"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = `rgba(0,0,0,${0.1 + R() * 0.15})`; g.fillRect(0, y, w, 2); } speckle(g, w, h, 600, 0.15, R); }), true, true);
  wood.repeat.set(2, 40);
  const pierParts = [new THREE.BoxGeometry(PIER.x1 - PIER.x0, 0.3, PIER.z1 - PIER.z0).translate((PIER.x0 + PIER.x1) / 2, PIER.y - 0.15, (PIER.z0 + PIER.z1) / 2)];
  const piles = [];
  for (let z = PIER.z0 + 4; z < PIER.z1; z += 6) for (const x of [PIER.x0 + 0.4, PIER.x1 - 0.4]) piles.push(new THREE.CylinderGeometry(0.2, 0.22, 5, 6).translate(x, PIER.y - 2.7, z));
  add(new THREE.Mesh(mergeGeometries(pierParts), lambert({ map: wood })), true, true);
  add(new THREE.Mesh(mergeGeometries(piles), lambert({ color: 0x4E3B2C })), true, false);
  const pr = [];
  for (const x of [PIER.x0 + 0.1, PIER.x1 - 0.1]) { pr.push(new THREE.BoxGeometry(0.1, 0.1, PIER.z1 - PIER.z0).translate(x, PIER.y + 1.0, (PIER.z0 + PIER.z1) / 2)); grid.box(x - 0.15, PIER.z0 + 6, x + 0.15, PIER.z1, PIER.y + 1.1); }
  for (let z = PIER.z0 + 6; z < PIER.z1; z += 3) for (const x of [PIER.x0 + 0.1, PIER.x1 - 0.1]) pr.push(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(x, PIER.y + 0.5, z));
  pr.push(new THREE.BoxGeometry(PIER.x1 - PIER.x0, 0.1, 0.1).translate((PIER.x0 + PIER.x1) / 2, PIER.y + 1.0, PIER.z1 - 0.05));
  grid.box(PIER.x0, PIER.z1 - 0.3, PIER.x1, PIER.z1 + 2, PIER.y + 1.1);
  add(new THREE.Mesh(mergeGeometries(pr), lambert({ color: 0xE6E0D6 })), true, false);
  const hut = Buf(); walls(hut, PIER.x0 + 1.5, PIER.z1 - 9, PIER.x1 - 1.5, PIER.z1 - 3, PIER.y, PIER.y + 3.2, 0);
  add(new THREE.Mesh(geo(hut), mats.deco1), true, true);
  const hutRoof = Buf(); roof(hutRoof, PIER.x0 + 1, PIER.z1 - 9.5, PIER.x1 - 1, PIER.z1 - 2.5, PIER.y + 3.2, new THREE.Color(0.55, 0.2, 0.18));
  add(new THREE.Mesh(geo(hutRoof), lambert({ vertexColors: true })), true, false);
  grid.box(PIER.x0 + 1.5, PIER.z1 - 9, PIER.x1 - 1.5, PIER.z1 - 3, PIER.y + 3.2).y0 = PIER.y;

  // palms: Tideline Avenue's beach side, and the parks
  const palms = [];
  for (let x = EDGE.w + 8; x < EDGE.e - 8; x += 14 + R() * 4) if (x < PIER.x0 - 4 || x > PIER.x1 + 4) palms.push([x, EDGE.s + 3 + R() * 2]);
  for (const [x0, z0, x1, z1] of map.parks) for (let k = 0; k < 11; k++) palms.push([x0 + 3 + R() * (x1 - x0 - 6), z0 + 3 + R() * (z1 - z0 - 6)]);
  for (const L of lots.filter(l => l.d === "tideline")) for (let k = 0; k < 3; k++) palms.push([L.x0 - 1.4 + R() * (L.x1 - L.x0 + 2.8), L.z1 + 1.6]);
  map.palms = palms;
  buildPalms(scene, palms, R, add);
  for (const [x, z] of palms) grid.circle(x, z, 0.3, 9);

  // street lights on every block corner and mid-side, with a warm pool on the road
  const lamps = [];
  for (const [x0, z0, x1, z1, d] of map.blocks) {
    const pts = [[x0 + 0.6, z0 + 0.6, -1, -1], [x1 - 0.6, z0 + 0.6, 1, -1], [x0 + 0.6, z1 - 0.6, -1, 1], [x1 - 0.6, z1 - 0.6, 1, 1], [(x0 + x1) / 2, z0 + 0.6, 0, -1], [(x0 + x1) / 2, z1 - 0.6, 0, 1], [x0 + 0.6, (z0 + z1) / 2, -1, 0], [x1 - 0.6, (z0 + z1) / 2, 1, 0]];
    for (const [x, z, dx, dz] of pts) if (R() < 0.8) lamps.push([x, z, dx, dz]);
  }
  buildLamps(scene, lamps, add, quality);
  for (const [x, z] of lamps) grid.circle(x, z, 0.15, 7);

  /* queries */
  const heightAt = (x, z) => {
    if (x > PIER.x0 && x < PIER.x1 && z > PIER.z0 && z < PIER.z1) return PIER.y;
    if (z > EDGE.s) { const d = z - EDGE.s; return -Math.max(0, d - 2) * 0.017 - Math.max(0, d - 40) * 0.01; }
    const i = Math.round(x / P), j = Math.round(z / P);
    if (i >= I0 && i <= I1 && j >= J0 && j <= J1 && Math.abs(x - i * P) <= LOT / 2 && Math.abs(z - j * P) <= LOT / 2) return 0.15;
    return 0;
  };
  const districtAt = (x, z) => {
    if (x > PIER.x0 && x < PIER.x1 && z > EDGE.s) return "pier";
    if (z > EDGE.s) return "beach";
    const i = Math.max(I0, Math.min(I1, Math.round(x / P))), j = Math.max(J0, Math.min(J1, Math.round(z / P)));
    return districtOf(i, j);
  };
  // start at the top of Tideline Beach, facing the sunset, the pier on your left
  const spawn = { x: PIER.x0 - 14, z: EDGE.s + 3, yaw: -0.25 };
  return { grid, heightAt, districtAt, spawn, map, EDGE, PIER, SHORE };
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
  const lI = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }), lamps.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  lamps.forEach(([x, z, dx, dz], n) => {
    const a = Math.atan2(dx, dz); q.setFromAxisAngle(up, a);
    m.compose(new THREE.Vector3(x, 0, z), q, one); pI.setMatrixAt(n, m); hI.setMatrixAt(n, m);
    m.compose(new THREE.Vector3(x + Math.sin(a) * 1.5, 0.03, z + Math.cos(a) * 1.5), q, one); lI.setMatrixAt(n, m);
  });
  add(pI, true, false); add(hI); add(lI);
}
