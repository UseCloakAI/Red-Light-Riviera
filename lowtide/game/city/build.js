/* The building kit: PS1-sized textures (a 64 x 96 tile is four bays by four
   floors), tinted per vertex so one texture gives a whole street of colours,
   and a builder that lays boxes, rounded corners, roofs, ledges, awnings and
   signs out in a building's own frame (u along the street, v back from it, y up).
   Every building type is made from these. All merged per material, so the whole
   city draws in a couple of dozen calls. */
import * as THREE from "three";

/* ---------- textures ---------- */
export function canvas(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; }
export function ptex(c, rep = true) {   // a PS1 texture: nearest-neighbour, no smoothing
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function speckle(g, w, h, n, a, R) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${R() < .5 ? "0,0,0" : "255,255,255"},${a * R()})`; g.fillRect((R() * w) | 0, (R() * h) | 0, 1, 1); } }

// a facade tile: 4 bays x 4 floors on 64 x 96 px; walls light so vertex colour tints them
function facadeTile(R, kind) {
  const W = 64, H = 96, lit = [];
  const col = canvas(W, H, (g) => {
    g.fillStyle = kind === "office" ? "#7d8a9e" : kind === "brick" ? "#b8b0a8" : "#e8e4dc"; g.fillRect(0, 0, W, H);
    if (kind === "brick") for (let y = 0; y < H; y += 3) { g.fillStyle = "rgba(90,40,30,.18)"; g.fillRect(0, y, W, 1); for (let x = (y / 3 % 2) * 3; x < W; x += 6) g.fillRect(x, y, 1, 3); }
    speckle(g, W, H, 260, 0.12, R);
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) {
      const x = b * 16, y = f * 24;
      if (kind === "office") {   // a curtain wall: glass bays with mullions and a spandrel band
        g.fillStyle = ["#2f4766", "#36507a", "#2a3f5c"][(R() * 3) | 0]; g.fillRect(x + 1, y + 2, 14, 19);
        g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(x + 1, y + 2, 14, 2); g.fillStyle = "#4a5568"; g.fillRect(x, y + 21, 16, 3);
        if (R() < 0.35) lit.push([x + 1, y + 2, 14, 19]);
      } else if (kind === "deco") {   // deco: tall windows with an eyebrow shadow over each
        g.fillStyle = "#26303c"; g.fillRect(x + 4, y + 7, 8, 13);
        g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x + 1, y + 4, 14, 2);
        g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x + 4, y + 7, 8, 1);
        if (R() < 0.3) lit.push([x + 4, y + 7, 8, 13]);
      } else {   // stucco / brick: windows with sills and frames
        g.fillStyle = "#f2efe8"; g.fillRect(x + 3, y + 6, 10, 14);
        g.fillStyle = "#2a323e"; g.fillRect(x + 4, y + 7, 8, 12);
        g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(x + 4, y + 7, 8, 1); g.fillStyle = "#8a8378"; g.fillRect(x + 3, y + 20, 10, 2);
        if (R() < 0.12) { g.fillStyle = ["#8a3b2a", "#2f5d4a", "#c9a14a"][(R() * 3) | 0]; g.fillRect(x + 4, y + 7, 8, 3); }   // a blind half down
        if (R() < 0.25) lit.push([x + 4, y + 7, 8, 12]);
      }
    }
  });
  const glow = canvas(W, H, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, W, H); for (const [x, y, w, h] of lit) { g.fillStyle = R() < 0.75 ? `hsl(${30 + R() * 15},85%,${48 + R() * 14}%)` : `hsl(200,55%,${60 + R() * 10}%)`; g.fillRect(x, y, w, h); g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(x, y + ((h * (0.3 + R() * 0.5)) | 0), w, 1); } });
  return { map: ptex(col), emissiveMap: ptex(glow) };
}
const SIGN_TEXT = [
  ["SEAGRAPE", "MOTOR INN"], ["HOTEL", "MARISOL"], ["THE", "SANDPIPER"], ["CASA", "LUNA"], ["HOTEL", "CORALINE"], ["THE GULF", "ARMS"],
  ["NITE OWL", "DINER"], ["KEYS", "LIQUOR"], ["LAVANDERIA", ""], ["PHARMACY", ""], ["TACOS", "EL FARO"], ["SALT & PEPPER", "DELI"],
  ["PAWN", "& LOAN"], ["CHECKS", "CASHED"], ["SURF", "SHOP"], ["TIDE TABLE", "CAFE"], ["LONGSHORE", "HALL"], ["ASHBY", "TIDEWATER"],
  ["MARLOWE", "SAVINGS"], ["PALM SQUARE", "THEATRE"], ["RUELAS BAIT", "& ICE"], ["BODEGA", ""], ["HARDWARE", ""], ["BARBER", ""],
  ["PORT SALT COMMONS", "LIVE WHERE THE CITY BEGAN"], ["SODA", "COLD 75c"], ["GAS", "OPEN 24"], ["MOTEL", "VACANCY"], ["BAR", "OPEN"], ["CHURCH", "OF THE TIDE"],
  ["PIER 9", ""], ["DONUTS", ""]
];
// signs: 32 panels in a 4 x 8 atlas, each 128 x 32, drawn as painted boards or neon
function signAtlas(R) {
  const PAL = [["#f4e9d2", "#c23b2a"], ["#1a2b3c", "#f2c14e"], ["#f2c14e", "#2a2a2a"], ["#2f6e5a", "#f4e9d2"], ["#c23b2a", "#f4e9d2"], ["#20232a", "#56d6e0"], ["#20232a", "#ff6fa8"]];
  const W = 512, H = 256, cw = 128, ch = 32, glows = [];
  const col = canvas(W, H, (g) => {
    SIGN_TEXT.forEach(([a, b], k) => {
      const x = (k % 4) * cw, y = ((k / 4) | 0) * ch, neon = k < 7 || k === 27 || k === 28 || R() < 0.25, [bg, fg] = neon ? PAL[5 + (k % 2)] : PAL[k % 5];
      g.fillStyle = bg; g.fillRect(x, y, cw, ch); g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `bold ${b ? 13 : 17}px Arial Narrow, Arial, sans-serif`; g.fillText(a, x + cw / 2, y + (b ? 11 : 16), cw - 8);
      if (b) { g.font = "bold 9px Arial, sans-serif"; g.fillText(b, x + cw / 2, y + 24, cw - 8); }
      g.strokeStyle = "rgba(0,0,0,.35)"; g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      if (neon) glows.push([k, fg, a, b]);
    });
  });
  const glow = canvas(W, H, (g) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
    for (const [k, fg, a, b] of glows) {
      const x = (k % 4) * cw, y = ((k / 4) | 0) * ch; g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `bold ${b ? 13 : 17}px Arial Narrow, Arial, sans-serif`; g.fillText(a, x + cw / 2, y + (b ? 11 : 16), cw - 8);
      if (b) { g.font = "bold 9px Arial, sans-serif"; g.fillText(b, x + cw / 2, y + 24, cw - 8); }
    }
  });
  const t = ptex(col, false), e = ptex(glow, false);
  return { map: t, emissiveMap: e, uv: (k) => { const x = (k % 4) / 4, y = 1 - (((k / 4) | 0) + 1) / 8; return [x, y, x + 0.25, y + 0.125]; }, index: (name) => SIGN_TEXT.findIndex(([a, b]) => (a + " " + b).trim() === name) };
}

export function makeKit(R) {
  const T = {};
  const tile = (key, kind) => { T[key] = facadeTile(R, kind); };
  tile("stucco", "stucco"); tile("deco", "deco"); tile("office", "office"); tile("brick", "brick");
  // storefronts: one floor, four shopfronts per 64 x 24 tile
  T.shop = { map: ptex(canvas(64, 24, (g) => {
    g.fillStyle = "#e8e4dc"; g.fillRect(0, 0, 64, 24);
    for (let b = 0; b < 4; b++) { const x = b * 16; g.fillStyle = "#3a4656"; g.fillRect(x + 1, 6, 14, 18); g.fillStyle = "rgba(255,255,255,.2)"; g.fillRect(x + 1, 6, 14, 2); g.fillStyle = "#5a4a3a"; if (b % 2) g.fillRect(x + 10, 9, 5, 15); g.fillStyle = "#cfc9be"; g.fillRect(x, 4, 16, 2); }
    speckle(g, 64, 24, 40, 0.1, R);
  })), emissiveMap: ptex(canvas(64, 24, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 64, 24); for (let b = 0; b < 4; b++) if (R() < 0.6) { g.fillStyle = `hsl(${35 + R() * 20},70%,${45 + R() * 15}%)`; g.fillRect(b * 16 + 1, 8, 14, 16); } })) };
  // motel: doors and windows along an open walkway
  T.motel = { map: ptex(canvas(64, 24, (g) => {
    g.fillStyle = "#e8e4dc"; g.fillRect(0, 0, 64, 24);
    for (let b = 0; b < 4; b++) { const x = b * 16; g.fillStyle = "#3f6e8c"; g.fillRect(x + 2, 6, 5, 18); g.fillStyle = "#2a323e"; g.fillRect(x + 9, 8, 6, 7); g.fillStyle = "#f2efe8"; g.fillRect(x + 9, 15, 6, 1); }
    speckle(g, 64, 24, 40, 0.1, R);
  })), emissiveMap: ptex(canvas(64, 24, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 64, 24); for (let b = 0; b < 4; b++) if (R() < 0.4) { g.fillStyle = "hsl(38,80%,55%)"; g.fillRect(b * 16 + 9, 8, 6, 7); } })) };
  T.metal = { map: ptex(canvas(64, 64, (g) => { g.fillStyle = "#d8d8d4"; g.fillRect(0, 0, 64, 64); for (let x = 0; x < 64; x += 4) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, 0, 1, 64); g.fillStyle = "rgba(255,255,255,.15)"; g.fillRect(x + 2, 0, 1, 64); } speckle(g, 64, 64, 200, 0.12, R); for (let k = 0; k < 6; k++) { g.fillStyle = "rgba(120,60,30,.18)"; g.fillRect((R() * 64) | 0, (R() * 40) | 0, 3, 10 + R() * 14); } })) };
  T.door = { map: ptex(canvas(32, 32, (g) => { g.fillStyle = "#9aa0a6"; g.fillRect(0, 0, 32, 32); for (let y = 0; y < 32; y += 3) { g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, y, 32, 1); } g.fillStyle = "#e0b040"; g.fillRect(0, 30, 32, 2); })) };
  T.siding = { map: ptex(canvas(64, 48, (g) => {
    g.fillStyle = "#ece8df"; g.fillRect(0, 0, 64, 48); for (let y = 0; y < 48; y += 3) { g.fillStyle = "rgba(0,0,0,.1)"; g.fillRect(0, y, 64, 1); }
    for (let f = 0; f < 2; f++) for (let b = 0; b < 2; b++) { const x = b * 32 + 9, y = f * 24 + 6; g.fillStyle = "#fbfaf6"; g.fillRect(x - 1, y - 1, 14, 14); g.fillStyle = "#2a323e"; g.fillRect(x, y, 12, 12); g.fillStyle = "#fbfaf6"; g.fillRect(x + 5, y, 1, 12); g.fillRect(x, y + 6, 12, 1); g.fillStyle = "#5a6e7a"; g.fillRect(x - 4, y, 3, 12); g.fillRect(x + 13, y, 3, 12); }
  })), emissiveMap: ptex(canvas(64, 48, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 64, 48); for (let f = 0; f < 2; f++) for (let b = 0; b < 2; b++) if (R() < 0.35) { g.fillStyle = "hsl(36,85%,52%)"; g.fillRect(b * 32 + 9, f * 24 + 6, 12, 12); } })) };
  T.roof = { map: ptex(canvas(64, 64, (g) => { g.fillStyle = "#6e6a66"; g.fillRect(0, 0, 64, 64); speckle(g, 64, 64, 900, 0.25, R); g.strokeStyle = "rgba(0,0,0,.2)"; g.strokeRect(0.5, 0.5, 63, 63); })) };
  T.tile = { map: ptex(canvas(32, 32, (g) => { g.fillStyle = "#b5583a"; g.fillRect(0, 0, 32, 32); for (let y = 0; y < 32; y += 4) { g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, y + 3, 32, 1); for (let x = (y / 4 % 2) * 4; x < 32; x += 8) { g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x, y, 4, 3); } } speckle(g, 32, 32, 60, 0.15, R); })) };
  T.shingle = { map: ptex(canvas(32, 32, (g) => { g.fillStyle = "#5c5f66"; g.fillRect(0, 0, 32, 32); for (let y = 0; y < 32; y += 4) { g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(0, y + 3, 32, 1); for (let x = (y / 4 % 2) * 3; x < 32; x += 6) g.fillRect(x, y, 1, 3); } speckle(g, 32, 32, 80, 0.18, R); })) };
  T.awning = { map: ptex(canvas(16, 16, (g) => { for (let x = 0; x < 16; x += 4) { g.fillStyle = x % 8 ? "#f4f0e8" : "#c0c0c0"; g.fillRect(x, 0, 4, 16); } g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(0, 14, 16, 2); })) };
  T.plain = { map: ptex(canvas(16, 16, (g) => { g.fillStyle = "#e6e4de"; g.fillRect(0, 0, 16, 16); speckle(g, 16, 16, 40, 0.15, R); })) };
  T.concrete = { map: ptex(canvas(32, 32, (g) => { g.fillStyle = "#bdb8ae"; g.fillRect(0, 0, 32, 32); speckle(g, 32, 32, 160, 0.16, R); g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(0, 31, 32, 1); g.fillRect(31, 0, 1, 32); })) };
  const signs = signAtlas(R); T.signs = signs;
  // materials: lambert, tinted by vertex colour, lit windows glow
  const M = {};
  for (const [k, t] of Object.entries(T)) {
    if (k === "signs") continue;
    M[k] = new THREE.MeshLambertMaterial({ map: t.map, vertexColors: true, side: ["roof", "tile", "shingle", "awning", "plain", "concrete"].includes(k) ? THREE.DoubleSide : THREE.FrontSide,
      ...(t.emissiveMap ? { emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.95 } : {}) });
  }
  M.signs = new THREE.MeshLambertMaterial({ map: signs.map, emissiveMap: signs.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.2, vertexColors: true });
  M.glass = new THREE.MeshLambertMaterial({ color: 0x9fc4dc, emissive: 0x24384a, vertexColors: true });
  M.water = new THREE.MeshLambertMaterial({ color: 0x4aa3b8, emissive: 0x0e3a48 });
  const B = Object.fromEntries(Object.keys(M).map((k) => [k, { p: [], n: [], u: [], c: [] }]));
  return { M, B, T, signs };
}

/* ---------- the builder ---------- */
const WHITE = new THREE.Color(1, 1, 1);
export function emit(B, a, b, c, d, n, uv, col) {   // a quad, counter-clockwise seen from the front
  col = col || WHITE;
  for (const [v, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [d, uv[3]]]) {
    B.p.push(v[0], v[1], v[2]); B.n.push(n[0], n[1], n[2]); B.u.push(t[0], t[1]); B.c.push(col.r, col.g, col.b);
  }
}
export function tri(B, a, b, c, n, uv, col) {
  col = col || WHITE;
  for (const [v, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]]]) { B.p.push(v[0], v[1], v[2]); B.n.push(n[0], n[1], n[2]); B.u.push(t[0], t[1]); B.c.push(col.r, col.g, col.b); }
}
export function geometry(B) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(B.n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(B.u, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(B.c, 3));
  g.computeBoundingSphere(); return g;
}
// a building's frame: origin on the street-side front corner, u along the street, v back from it
export class Frame {
  // n: the way the building faces away from the street. u runs so every face winds the same way
  constructor(ox, oz, nx, nz, y = 0) { this.o = [ox, y, oz]; this.n = [nx, 0, nz]; this.t = [-nz, 0, nx]; }
  p(u, v, y) { return [this.o[0] + this.t[0] * u + this.n[0] * v, this.o[1] + y, this.o[2] + this.t[2] * u + this.n[2] * v]; }
  d(u, v) { return [this.t[0] * u + this.n[0] * v, 0, this.t[2] * u + this.n[2] * v]; }
  // a wall from (u0,v0) to (u1,v1), facing its right-hand side; texture: tw metres per tile across, th up
  wall(B, u0, v0, u1, v1, y0, y1, col, tw = 16, th = 14, uo = 0) {
    const a = this.p(u0, v0, y0), b = this.p(u1, v1, y0), c = this.p(u1, v1, y1), d = this.p(u0, v0, y1);
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, n = [-dz / L, 0, dx / L];
    emit(B, a, b, c, d, n, [[uo, y0 / th], [uo + L / tw, y0 / th], [uo + L / tw, y1 / th], [uo, y1 / th]], col);
  }
  // an extruded box; front (v0) faces the street. faces: which walls to draw
  box(Bw, Br, u0, u1, v0, v1, y0, y1, col, roofCol, tw, th, faces = "fblr") {
    const uo = Math.random();
    if (faces.includes("f")) this.wall(Bw, u0, v0, u1, v0, y0, y1, col, tw, th, uo);
    if (faces.includes("r")) this.wall(Bw, u1, v0, u1, v1, y0, y1, col, tw, th, uo);
    if (faces.includes("b")) this.wall(Bw, u1, v1, u0, v1, y0, y1, col, tw, th, uo);
    if (faces.includes("l")) this.wall(Bw, u0, v1, u0, v0, y0, y1, col, tw, th, uo);
    if (Br) this.top(Br, u0, u1, v0, v1, y1, roofCol);
  }
  top(B, u0, u1, v0, v1, y, col, s = 8) {
    const a = this.p(u0, v1, y), b = this.p(u1, v1, y), c = this.p(u1, v0, y), d = this.p(u0, v0, y);
    const w = (u1 - u0) / s, h = (v1 - v0) / s;
    emit(B, d, c, b, a, [0, 1, 0], [[0, 0], [w, 0], [w, h], [0, h]], col);
  }
  under(B, u0, u1, v0, v1, y, col) { emit(B, this.p(u0, v1, y), this.p(u1, v1, y), this.p(u1, v0, y), this.p(u0, v0, y), [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], col); }
  // a rounded corner: a vertical arc of radius r around (cu, cv), from angle a0 to a1 (radians in u,v)
  arc(B, cu, cv, r, a0, a1, y0, y1, col, roofB, roofCol, segs = 6, tw = 16, th = 14) {
    let s = 0;
    for (let i = 0; i < segs; i++) {
      const t0 = a0 + (a1 - a0) * i / segs, t1 = a0 + (a1 - a0) * (i + 1) / segs;
      const u0 = cu + Math.cos(t0) * r, v0 = cv + Math.sin(t0) * r, u1 = cu + Math.cos(t1) * r, v1 = cv + Math.sin(t1) * r;
      this.wall(B, u0, v0, u1, v1, y0, y1, col, tw, th, s); s += Math.hypot(u1 - u0, v1 - v0) / tw;
      if (roofB) { const c = this.p(cu, cv, y1), a = this.p(u0, v0, y1), b = this.p(u1, v1, y1); tri(roofB, c, b, a, [0, 1, 0], [[0.5, 0.5], [0, 0], [1, 0]], roofCol); }
    }
  }
  // a gable roof over the box, ridge running along u (or v)
  gable(B, u0, u1, v0, v1, y, rise, col, alongU = true, Bwall, wallCol) {
    if (alongU) {
      const vm = (v0 + v1) / 2, r = rise;
      const s1 = [this.p(u0, v0, y), this.p(u1, v0, y), this.p(u1, vm, y + r), this.p(u0, vm, y + r)];
      const s2 = [this.p(u1, v1, y), this.p(u0, v1, y), this.p(u0, vm, y + r), this.p(u1, vm, y + r)];
      const span = Math.hypot(vm - v0, r);
      for (const s of [s1, s2]) { const n = norm(cross(sub(s[1], s[0]), sub(s[3], s[0]))); emit(B, s[0], s[1], s[2], s[3], n, [[0, 0], [(u1 - u0) / 4, 0], [(u1 - u0) / 4, span / 4], [0, span / 4]], col); }
      // gable ends: a triangle each way round, so one always faces out whatever the winding
      if (Bwall) for (const uu of [u0, u1]) { const a = this.p(uu, v0, y), b = this.p(uu, v1, y), c = this.p(uu, vm, y + r), n = norm(cross(sub(b, a), sub(c, a))), uv = [[0, y / 14], [0.25, y / 14], [0.12, (y + r) / 14]];
        tri(Bwall, a, b, c, n, uv, wallCol); tri(Bwall, a, c, b, n.map((x) => -x), [uv[0], uv[2], uv[1]], wallCol); }
    } else this.hip(B, u0, u1, v0, v1, y, rise, col);
  }
  // a hip roof: four slopes to a short ridge
  hip(B, u0, u1, v0, v1, y, rise, col) {
    const inset = Math.min(u1 - u0, v1 - v0) / 2, um0 = u0 + inset, um1 = u1 - inset, vm = (v0 + v1) / 2;
    const r0 = this.p(um0, vm, y + rise), r1 = this.p(Math.max(um0, um1), vm, y + rise);
    const A = this.p(u0, v0, y), Bp = this.p(u1, v0, y), Cp = this.p(u1, v1, y), Dp = this.p(u0, v1, y);
    const face = (a, b, c, d) => { const n = norm(cross(sub(b, a), sub(d, a))); emit(B, a, b, c, d, n, [[0, 0], [1.5, 0], [1.5, 1], [0, 1]], col); };
    face(A, Bp, r1, r0); face(Cp, Dp, r0, r1);
    const t1 = (a, b, c) => { const n = norm(cross(sub(b, a), sub(c, a))); tri(B, a, b, c, n, [[0, 0], [1, 0], [0.5, 1]], col); };
    t1(Bp, Cp, r1); t1(Dp, A, r0);
  }
  // a flat slab: ledges, eyebrows, balconies, canopies
  slab(Bw, Bt, u0, u1, v0, v1, y0, y1, col) { this.box(Bw, Bt, u0, u1, v0, v1, y0, y1, col, col, 4, 4); this.under(Bt || Bw, u0, u1, v0, v1, y0, col); }
  // an awning: a sloped quad out from the wall
  awning(B, u0, u1, v, y, out, drop, col) {
    const a = this.p(u0, v, y), b = this.p(u1, v, y), c = this.p(u1, v - out, y - drop), d = this.p(u0, v - out, y - drop);
    const n = norm(cross(sub(b, a), sub(d, a))); emit(B, d, c, b, a, n.map((x) => -x), [[0, 0], [(u1 - u0) / 2, 0], [(u1 - u0) / 2, 1], [0, 1]], col);
    emit(B, a, b, c, d, n, [[0, 0], [(u1 - u0) / 2, 0], [(u1 - u0) / 2, 1], [0, 1]], col);
    const fr = [this.p(u0, v - out, y - drop), this.p(u1, v - out, y - drop), this.p(u1, v - out, y - drop - 0.35), this.p(u0, v - out, y - drop - 0.35)];
    emit(B, fr[3], fr[2], fr[1], fr[0], this.d(0, -1), [[0, 0.85], [(u1 - u0) / 2, 0.85], [(u1 - u0) / 2, 1], [0, 1]], col);
  }
  // a sign board from the atlas, flat on the facade (v slightly proud of it) or standing out from it
  sign(B, kit, k, u0, u1, v, y0, y1, col) {
    const [x0, ty0, x1, ty1] = kit.signs.uv(k), a = this.p(u0, v, y0), b = this.p(u1, v, y0), c = this.p(u1, v, y1), d = this.p(u0, v, y1);
    emit(B, a, b, c, d, this.d(0, -1), [[x0, ty0], [x1, ty0], [x1, ty1], [x0, ty1]], col);
  }
  // a blade sign sticking out from the wall (readable from up and down the street)
  blade(B, kit, k, u, v, y0, y1, out, col) {
    const [x0, ty0, x1, ty1] = kit.signs.uv(k), a = this.p(u, v, y0), b = this.p(u, v - out, y0), c = this.p(u, v - out, y1), d = this.p(u, v, y1);
    emit(B, a, b, c, d, this.d(1, 0), [[x0, ty0], [x1, ty0], [x1, ty1], [x0, ty1]], col);
    emit(B, b, a, d, c, this.d(-1, 0), [[x0, ty0], [x1, ty0], [x1, ty1], [x0, ty1]], col);
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
