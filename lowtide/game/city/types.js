/* Building types. Each takes the kit, a Frame (u along the street, v back from
   it), the parcel's width W and depth D, and the random source, lays down its
   geometry and returns its height, plus any extra collision boxes and any spots
   it wants painted on the ground (car parks, pools). Original designs: Tideline's
   deco hotels and motels, Midtown's shops and walk-ups, Downtown's towers,
   Port Salt's sheds and cranes, Bellwether's houses. */
import * as THREE from "three";

const C = (h, k = 0) => new THREE.Color(h).multiplyScalar(1 - k);
const pick = (R, a) => a[(R() * a.length) | 0];
export const PALETTES = {
  deco: ["#F2C9B8", "#BFE6DA", "#F6E3B4", "#EAB8CC", "#CDD8F0", "#FFFFFF", "#D7F0F2", "#F7D6A8"],
  stucco: ["#E9DCC6", "#D9C2A0", "#C9D3C0", "#E2C7B8", "#BFC8D2", "#EDE5D6", "#D8B49A", "#C4CBB8"],
  house: ["#F0E9DA", "#CFE0E8", "#E8D6C0", "#DDE8D0", "#F2D9D9", "#FFFFFF", "#E6E0F0"],
  metal: ["#D8DAD6", "#B9C4C9", "#C9B8A0", "#A7B5A0", "#C4A08A"],
  office: ["#FFFFFF", "#DDE8F4", "#CCD8E4", "#E8E8E8"],
  awning: ["#C23B2A", "#2F6E5A", "#2F5D8C", "#E0A030", "#7A3B6E", "#3A3A3A"],
  trim: ["#FFFFFF", "#F4EFE6", "#3A3A3A"]
};
const SIGNS = {
  hotel: ["HOTEL MARISOL", "THE SANDPIPER", "CASA LUNA", "HOTEL CORALINE", "THE GULF ARMS"],
  shop: ["KEYS LIQUOR", "LAVANDERIA", "PHARMACY", "TACOS EL FARO", "SALT & PEPPER DELI", "PAWN & LOAN", "CHECKS CASHED", "SURF SHOP", "SEABREEZE CAFE", "BODEGA", "HARDWARE", "BARBER", "BAR OPEN", "DONUTS", "SODA COLD 75c"]
};
const sign = (kit, name) => Math.max(0, kit.signs.index(name));

// rooftop clutter: plant rooms, AC units
function clutter(kit, F, R, u0, u1, v0, v1, y) {
  const B = kit.B, n = 1 + ((R() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const w = 1.5 + R() * 3, d = 1.5 + R() * 3, u = u0 + 1 + R() * Math.max(0.1, u1 - u0 - w - 2), v = v0 + 1 + R() * Math.max(0.1, v1 - v0 - d - 2);
    F.box(B.concrete, B.roof, u, u + w, v, v + d, y, y + 1 + R() * 1.6, C("#c9c4ba", R() * 0.2), C("#8a8680"), 4, 4);
  }
}
// a parapet lip round a flat roof
function parapet(kit, F, u0, u1, v0, v1, y, col) { F.box(kit.B.plain, kit.B.plain, u0, u1, v0, v0 + 0.3, y, y + 0.8, col, col, 8, 8); F.box(kit.B.plain, kit.B.plain, u0, u1, v1 - 0.3, v1, y, y + 0.8, col, col, 8, 8); }

/* ---------- Tideline ---------- */
export function decoHotel(kit, F, W, D, R, o = {}) {
  const B = kit.B, fl = o.floors || 3 + ((R() * 4) | 0), H = fl * 3.5, wall = C(pick(R, PALETTES.deco)), trim = C(pick(R, ["#FFFFFF", "#F4EFE6", "#E8E0D0"]));
  const rc = R() < 0.55 ? Math.min(5, W * 0.25) : 0;
  // ground floor: lobby glass; above: deco windows; a rounded corner on the street end
  F.wall(B.shop, rc, 0, W, 0, 0, 3.5, wall, 16, 3.5); F.wall(B.deco, rc, 0, W, 0, 3.5, H, wall);
  F.wall(B.deco, W, 0, W, D, 0, H, wall); F.wall(B.deco, W, D, 0, D, 0, H, wall); F.wall(B.deco, 0, D, 0, rc, 0, H, wall);
  if (rc) { F.arc(B.deco, rc, rc, rc, Math.PI, Math.PI * 1.5, 0, H, wall, B.roof, C("#8a8680"), 6); F.top(B.roof, 0, rc, rc, D, H, C("#8a8680")); }
  F.top(B.roof, rc, W, 0, D, H, C("#8a8680"));
  // eyebrows over every floor, and a canopy over the door
  for (let f = 1; f < fl; f++) F.slab(B.plain, B.plain, rc, W, -0.55, 0, f * 3.5 + 2.75, f * 3.5 + 2.9, trim);
  const du = rc + (W - rc) * (0.3 + R() * 0.4);
  F.slab(B.plain, B.plain, du - 2.5, du + 2.5, -2.2, 0, 3.1, 3.35, trim);
  // a stepped parapet at the centre, a fin with the hotel's name in neon
  const pm = (rc + W) / 2; F.box(B.plain, B.plain, pm - W * 0.18, pm + W * 0.18, 0, 1.2, H, H + 2.2, wall, wall, 8, 8);
  F.box(B.plain, B.plain, pm - W * 0.08, pm + W * 0.08, 0, 1.2, H + 2.2, H + 3.6, trim, trim, 8, 8);
  const fu = rc ? rc + 1.2 : W * (0.15 + R() * 0.2);
  F.box(B.plain, B.plain, fu - 0.25, fu + 0.25, -1.3, 0, 3.6, H + 3, trim, trim, 8, 8);
  F.blade(B.signs, kit, sign(kit, o.name || pick(R, SIGNS.hotel)), fu, -0.02, H - 4.5, H + 2.6, 1.28, C("#ffffff"));
  clutter(kit, F, R, rc + 1, W - 1, 3, D - 1, H);
  return { h: H + 3.6 };
}
export function motel(kit, F, W, D, R) {
  const B = kit.B, wall = C("#F2E6D0"), trim = C("#2F6E5A"), v0 = D - 11, H = 7;
  // two floors of rooms set back behind a car park, an open walkway upstairs
  F.box(B.motel, B.roof, 0, W, v0, D, 0, H, wall, C("#8a8680"), 16, 3.5);
  F.slab(B.plain, B.plain, 0, W, v0 - 1.8, v0, 3.3, 3.5, C("#d9d2c4"));
  F.slab(B.plain, B.plain, 0, W, v0 - 1.8, v0 - 1.7, 3.5, 4.5, trim);
  for (let u = 1; u < W; u += 4) F.box(B.plain, null, u, u + 0.25, v0 - 1.8, v0 - 1.55, 0, 3.3, trim, null, 8, 8);
  F.awning(B.tile, 0, W, v0, H + 0.6, 1.4, 0.9, C("#ffffff"));
  // the pole sign at the street
  F.box(B.plain, B.plain, 2.6, 3.1, 1.5, 2.0, 0, 9, trim, trim, 8, 8);
  F.blade(B.signs, kit, sign(kit, "SEAGRAPE MOTOR INN"), 2.85, 0.6, 6.2, 8.8, -2.6, C("#ffffff"));
  F.blade(B.signs, kit, sign(kit, "MOTEL VACANCY"), 2.85, 0.6, 4.8, 5.9, -2.6, C("#ffffff"));
  return { h: H + 1, lot: { u0: 0, u1: W, v0: 0.5, v1: v0 - 2 } };
}
export function diner(kit, F, W, D, R) {
  const B = kit.B, r = Math.min(4, D / 2), H = 4.2, wall = C("#E8EEF0");
  F.wall(B.shop, r, 0, W - r, 0, 0, H - 0.8, wall, 16, 3.5); F.wall(B.metal, r, 0, W - r, 0, H - 0.8, H, C("#C23B2A"), 8, 1);
  F.wall(B.metal, W - r, D, r, D, 0, H, wall, 8, 4);
  F.arc(B.metal, W - r, r, r, -Math.PI / 2, Math.PI / 2, 0, H, wall, B.roof, C("#8a8680"), 6, 8, 4);
  F.arc(B.metal, r, r, r, Math.PI / 2, Math.PI * 1.5, 0, H, wall, B.roof, C("#8a8680"), 6, 8, 4);
  if (D > 2 * r) { F.wall(B.metal, W, r, W, D - r, 0, H, wall, 8, 4); F.wall(B.metal, 0, D - r, 0, r, 0, H, wall, 8, 4); }
  F.top(B.roof, r, W - r, 0, D, H, C("#8a8680"));
  F.box(B.plain, B.plain, W / 2 - 0.2, W / 2 + 0.2, 1, 1.4, H, H + 1.2, C("#3a3a3a"), C("#3a3a3a"), 8, 8);
  F.sign(B.signs, kit, sign(kit, "NITE OWL DINER"), W / 2 - 4, W / 2 + 4, 0.95, H + 1.0, H + 3.0, C("#ffffff"));
  return { h: H + 3 };
}

/* ---------- Midtown ---------- */
export function shopRow(kit, F, W, D, R, o = {}) {
  const B = kit.B, fl = o.floors || 1 + ((R() * 3) | 0), H = fl * 3.6 + 0.6, wall = C(pick(R, PALETTES.stucco), R() * 0.1);
  F.wall(B.shop, 0, 0, W, 0, 0, 3.6, wall, 16, 3.6);
  if (fl > 1) F.wall(B.stucco, 0, 0, W, 0, 3.6, H, wall);
  else F.wall(B.plain, 0, 0, W, 0, 3.6, H, wall, 8, 8);
  F.wall(B.stucco, W, 0, W, D, 0, H, wall); F.wall(B.stucco, W, D, 0, D, 0, H, wall); F.wall(B.stucco, 0, D, 0, 0, 0, H, wall);
  F.top(B.roof, 0, W, 0, D, H, C("#8a8680"));
  // awnings and sign boards along the shopfronts
  for (let u = 0; u < W - 2; u += 7 + R() * 5) {
    const u1 = Math.min(W, u + 5 + R() * 3), col = C(pick(R, PALETTES.awning));
    if (R() < 0.75) F.awning(B.awning, u + 0.3, u1 - 0.3, 0, 3.3, 1.6, 0.7, col);
    F.sign(B.signs, kit, sign(kit, pick(R, SIGNS.shop)), u + 0.5, u1 - 0.5, -0.06, 3.65, 4.35, C("#ffffff"));
  }
  parapet(kit, F, 0, W, 0, D, H, wall);
  if (R() < 0.3) F.blade(B.signs, kit, sign(kit, pick(R, SIGNS.shop)), 0.6, -0.02, 4.5, 6.3, 1.1, C("#ffffff"));
  clutter(kit, F, R, 0, W, 1, D, H);
  return { h: H + 0.8 };
}
export function apartment(kit, F, W, D, R, o = {}) {
  const B = kit.B, fl = o.floors || 3 + ((R() * 5) | 0), H = fl * 3.5, wall = C(pick(R, PALETTES.stucco), R() * 0.12), rail = C(pick(R, PALETTES.trim));
  const shop = R() < 0.55;
  F.wall(shop ? B.shop : B.stucco, 0, 0, W, 0, 0, 3.5, wall, 16, shop ? 3.5 : 14);
  F.wall(B.stucco, 0, 0, W, 0, 3.5, H, wall); F.wall(B.stucco, W, 0, W, D, 0, H, wall); F.wall(B.stucco, W, D, 0, D, 0, H, wall); F.wall(B.stucco, 0, D, 0, 0, 0, H, wall);
  F.top(B.roof, 0, W, 0, D, H, C("#8a8680"));
  // balconies: every other bay, every floor above the ground
  for (let f = 1; f < fl; f++) for (let u = 2; u + 3 < W; u += 8) {
    F.slab(B.plain, B.plain, u, u + 3.2, -1.2, 0, f * 3.5, f * 3.5 + 0.18, C("#cfc9be"));
    F.slab(B.plain, B.plain, u, u + 3.2, -1.2, -1.1, f * 3.5 + 0.18, f * 3.5 + 1.1, rail);
  }
  if (shop) for (let u = 0.5; u < W - 3; u += 9) F.sign(B.signs, kit, sign(kit, pick(R, SIGNS.shop)), u, u + 5, -0.06, 2.9, 3.45, C("#ffffff"));
  parapet(kit, F, 0, W, 0, D, H, wall);
  // a water tank on legs, a stair hut
  if (R() < 0.6) { const u = 2 + R() * (W - 6), v = 2 + R() * (D - 6); F.box(B.plain, null, u, u + 0.2, v, v + 0.2, H, H + 2, C("#555"), null, 8, 8); F.box(B.metal, B.roof, u - 0.6, u + 2.4, v - 0.6, v + 2.4, H + 2, H + 4.5, C("#9a8a70"), C("#6a5a48"), 8, 4); }
  F.box(B.concrete, B.roof, W - 4, W - 1, D - 4, D - 1, H, H + 2.6, wall, C("#8a8680"), 4, 4);
  return { h: H + 4.5 };
}
export function theatre(kit, F, W, D, R) {
  const B = kit.B, H = 13, wall = C("#D8B49A");
  F.box(B.brick, B.roof, 0, W, 0, D, 0, H, wall, C("#8a8680"));
  F.wall(B.shop, 2, -0.02, W - 2, -0.02, 0, 3.5, wall, 16, 3.5);
  F.slab(B.plain, B.plain, 1, W - 1, -3, 0, 3.6, 4.3, C("#F4EFE6"));
  F.sign(B.signs, kit, sign(kit, "PALM SQUARE THEATRE"), 2, W - 2, -3.02, 4.35, 6.2, C("#ffffff"));
  F.box(B.plain, B.plain, W / 2 - 0.4, W / 2 + 0.4, -1.4, 0, 6.5, H + 4, C("#F4EFE6"), C("#F4EFE6"), 8, 8);
  F.blade(B.signs, kit, sign(kit, "PALM SQUARE THEATRE"), W / 2, -0.02, H - 5, H + 3.6, 1.45, C("#ffffff"));
  return { h: H + 4 };
}
export function gasStation(kit, F, W, D, R) {
  const B = kit.B, sh = 10;
  F.box(B.shop, B.roof, 2, W - 2, D - sh, D - 1, 0, 3.8, C("#F4EFE6"), C("#8a8680"), 16, 3.8);
  F.sign(B.signs, kit, sign(kit, "GAS OPEN 24"), W / 2 - 3, W / 2 + 3, D - sh - 0.06, 3.9, 4.9, C("#ffffff"));
  // the canopy on four columns over the pumps
  const c0 = 3, c1 = D - sh - 3;
  F.slab(B.plain, B.plain, 3, W - 3, c0, c1, 4.6, 5.3, C("#C23B2A"));
  for (const [u, v] of [[5, c0 + 2], [W - 5, c0 + 2], [5, c1 - 2], [W - 5, c1 - 2]]) F.box(B.plain, null, u - 0.25, u + 0.25, v - 0.25, v + 0.25, 0, 4.6, C("#e8e8e8"), null, 8, 8);
  for (let u = 7; u < W - 6; u += 6) F.box(B.plain, B.plain, u, u + 0.8, (c0 + c1) / 2 - 0.4, (c0 + c1) / 2 + 0.4, 0, 1.7, C("#e0e0e0"), C("#C23B2A"), 8, 8);
  F.box(B.plain, B.plain, 0.6, 1.0, 0.6, 1.0, 0, 6, C("#3a3a3a"), C("#3a3a3a"), 8, 8);
  F.blade(B.signs, kit, sign(kit, "GAS OPEN 24"), 0.8, 0.8, 4.2, 6.2, -2.4, C("#ffffff"));
  return { h: 5.3, lot: { u0: 1, u1: W - 1, v0: 1, v1: D - sh - 0.5 }, solid: [[2, W - 2, D - sh, D - 1, 3.8]] };
}

/* ---------- Downtown ---------- */
export function tower(kit, F, W, D, R, o = {}) {
  const B = kit.B, H = o.h || 40 + R() * 90, glass = C(pick(R, PALETTES.office)), stone = C(pick(R, ["#D8D0C0", "#C9C2B6", "#E4DED2", "#B8B0A4"]));
  // a two-storey podium of shops, then the tower set back, stepping in again near the top
  F.wall(B.shop, 0, 0, W, 0, 0, 3.8, stone, 16, 3.8); F.wall(B.brick, 0, 0, W, 0, 3.8, 8, stone);
  F.wall(B.brick, W, 0, W, D, 0, 8, stone); F.wall(B.brick, W, D, 0, D, 0, 8, stone); F.wall(B.brick, 0, D, 0, 0, 0, 8, stone);
  F.top(B.roof, 0, W, 0, D, 8, C("#8a8680"));
  const s = 2 + R() * 2, step = H > 75 ? H * (0.55 + R() * 0.15) : H;
  F.box(B.office, B.roof, s, W - s, s, D - s, 8, step, glass, C("#7a7a7a"));
  if (step < H) { const s2 = s + 2.5 + R() * 2; F.box(B.office, B.roof, s2, W - s2, s2, D - s2, step, H, glass, C("#7a7a7a")); clutter(kit, F, R, s2, W - s2, s2, D - s2, H); }
  else clutter(kit, F, R, s, W - s, s, D - s, H);
  // a crown: a lit glass top or a spire
  const ci = (step < H ? 5 : 2.5) + s;
  if (R() < 0.5) F.box(B.glass ? kit.B.glass : B.plain, B.roof, ci, W - ci, ci, D - ci, H, H + 4, C("#ffffff"), C("#9aa"), 8, 8);
  else F.box(B.plain, B.plain, W / 2 - 0.3, W / 2 + 0.3, D / 2 - 0.3, D / 2 + 0.3, H, H + 10 + R() * 12, C("#d0d0d0"), C("#d0d0d0"), 8, 8);
  if (o.name) for (const [u0, u1, v] of [[ci, W - ci, s - 0.08]]) F.sign(B.signs, kit, sign(kit, o.name), u0, u1, v, H - 5, H - 1.5, C("#ffffff"));
  return { h: H };
}
export function office(kit, F, W, D, R) {
  const B = kit.B, fl = 6 + ((R() * 9) | 0), H = fl * 3.5, brick = R() < 0.5, wall = C(brick ? pick(R, ["#C9806A", "#B87A62", "#D4A28A", "#E0D6C6"]) : pick(R, PALETTES.office));
  F.wall(B.shop, 0, 0, W, 0, 0, 3.5, wall, 16, 3.5);
  F.wall(brick ? B.brick : B.office, 0, 0, W, 0, 3.5, H, wall); for (const [a, b, c, d] of [[W, 0, W, D], [W, D, 0, D], [0, D, 0, 0]]) F.wall(brick ? B.brick : B.office, a, b, c, d, 0, H, wall);
  F.top(B.roof, 0, W, 0, D, H, C("#8a8680"));
  F.slab(B.plain, B.plain, -0.4, W + 0.4, -0.8, D + 0.4, H, H + 0.9, C("#E8E2D6"));   // a cornice
  clutter(kit, F, R, 0, W, 0, D, H + 0.9);
  return { h: H + 0.9 };
}
export function garage(kit, F, W, D, R) {
  const B = kit.B, lv = 4, col = C("#BDB8AE");
  for (let k = 0; k <= lv; k++) F.slab(B.concrete, B.concrete, 0, W, 0, D, k * 3, k * 3 + 0.4, col);
  for (let u = 0; u <= W; u += W / 5) for (const v of [0, D]) F.box(B.concrete, null, Math.min(u, W - 0.5), Math.min(u, W - 0.5) + 0.5, Math.min(v, D - 0.5), Math.min(v, D - 0.5) + 0.5, 0, lv * 3, col, null, 4, 4);
  for (let k = 1; k <= lv; k++) F.slab(B.concrete, null, 0, W, -0.05, 0.2, k * 3 + 0.4, k * 3 + 1.2, col);
  F.sign(B.signs, kit, sign(kit, "PIER 9"), 1, 6, -0.3, 1.2, 2.4, C("#ffffff"));
  return { h: lv * 3 + 1.2 };
}

/* ---------- Port Salt ---------- */
export function warehouse(kit, F, W, D, R) {
  const B = kit.B, H = 8 + R() * 5, wall = C(pick(R, PALETTES.metal), R() * 0.15);
  F.box(B.metal, null, 0, W, 0, D, 0, H, wall, null, 8, 8);
  if (R() < 0.5) F.gable(B.metal, 0, W, 0, D, H, 2.5, C("#9aa0a4"), true, B.metal, wall);
  else for (let u = 0; u < W - 0.1; u += 8) F.gable(B.metal, u, Math.min(W, u + 8), 0, D, H, 2.2, C("#9aa0a4"), false);   // sawtooth
  for (let u = 3; u < W - 4; u += 9) F.wall(B.door, u, -0.05, u + 4.5, -0.05, 0, 4.6, C("#ffffff"), 4.5, 4.6);
  F.slab(B.concrete, B.concrete, 0, W, -2.2, 0, 0, 1.1, C("#B0AA9E"));   // loading dock
  if (R() < 0.6) F.box(B.stucco, B.roof, W - 7, W, -4.5, 0, 0, 3.5, C(pick(R, PALETTES.stucco)), C("#8a8680"), 16, 14, "flr");
  return { h: H + 2.5 };
}
export function longshoreHall(kit, F, W, D, R) {
  const B = kit.B, H = 10.5;
  F.box(B.brick, B.roof, 0, W, 0, D, 0, H, C("#C9806A"), C("#8a8680"));
  F.sign(B.signs, kit, sign(kit, "LONGSHORE HALL"), W / 2 - 7, W / 2 + 7, -0.06, H - 3.2, H - 0.8, C("#ffffff"));
  F.slab(B.plain, B.plain, W / 2 - 3, W / 2 + 3, -2.5, 0, 3.2, 3.5, C("#F4EFE6"));
  F.box(B.plain, null, 1, 1.15, -1, -0.85, 0, 12, C("#e8e8e8"), null, 8, 8);
  parapet(kit, F, 0, W, 0, D, H, C("#B87A62"));
  return { h: H + 0.8 };
}
// a ship-to-shore crane on the quay: legs, a boom out over the water, the cab
export function crane(kit, F, R) {
  const B = kit.B, red = C("#C23B2A"), white = C("#EDEBE6"), g = 16, H = 26;
  for (const [u, v] of [[0, 0], [g, 0], [0, 12], [g, 12]]) F.box(B.plain, null, u, u + 0.9, v, v + 0.9, 0, H, (u + v) % 2 ? red : white, null, 8, 8);
  F.box(B.plain, B.plain, -1, g + 2, -1, 13.5, H, H + 2.2, red, red, 8, 8);
  F.box(B.plain, B.plain, g / 2 - 1, g / 2 + 1.5, -38, 26, H + 2.2, H + 3.4, white, white, 8, 8);
  F.box(B.plain, B.plain, g / 2 - 1.5, g / 2 + 2, -6, -2, H - 3.5, H, C("#E0A030"), C("#E0A030"), 8, 8);
  F.box(B.plain, B.plain, g / 2 - 0.5, g / 2 + 0.5, 4, 5, H + 3.4, H + 12, red, red, 8, 8);
  return { h: H + 3.4 };
}
export function tank(kit, F, r, H, col) {
  const B = kit.B; F.arc(B.metal, r, r, r, 0, Math.PI * 2, 0, H, col, B.roof, C("#9a9a9a"), 12, 8, 8);
  return { h: H };
}

/* ---------- Bellwether ---------- */
export function house(kit, F, W, D, R) {
  const B = kit.B, fl = R() < 0.4 ? 2 : 1, H = fl * 3, wall = C(pick(R, PALETTES.house)), tileRoof = R() < 0.6;
  const bw = Math.min(W - 4, 9 + R() * 3), bd = Math.min(D - 6, 8 + R() * 3), u0 = R() < 0.5 ? 0.5 : W - bw - 0.5, v0 = 1;
  const siding = R() < 0.55;
  F.box(siding ? B.siding : B.stucco, null, u0, u0 + bw, v0, v0 + bd, 0, H, wall, null, siding ? 8 : 16, siding ? 6 : 14);
  const rm = tileRoof ? B.tile : B.shingle, rc = C("#ffffff");
  if (R() < 0.5) F.hip(rm, u0 - 0.5, u0 + bw + 0.5, v0 - 0.5, v0 + bd + 0.5, H, 2.2, rc);
  else F.gable(rm, u0 - 0.5, u0 + bw + 0.5, v0 - 0.5, v0 + bd + 0.5, H, 2.2, rc, true, siding ? B.siding : B.stucco, wall);
  // a garage beside it, a porch roof, a fence along the front
  const gu = u0 < 1 ? u0 + bw + 0.3 : u0 - 4.3;
  if (gu > 0 && gu + 4 < W) { F.box(B.stucco, B.roof, gu, gu + 4, v0 + 0.5, v0 + 6.5, 0, 2.8, wall, C("#8a8680"), 16, 14, "brl"); F.wall(B.door, gu, v0 + 0.5, gu + 4, v0 + 0.5, 0, 2.6, C("#ffffff"), 4, 2.6); F.wall(B.stucco, gu, v0 + 0.5, gu + 4, v0 + 0.5, 2.6, 2.8, wall); }
  F.slab(B.plain, B.plain, u0 + bw * 0.3, u0 + bw * 0.7, v0 - 1.8, v0, 2.6, 2.8, C("#F4EFE6"));
  if (R() < 0.7) for (const [a, b] of [[0, u0 + bw * 0.3 - 0.5], [u0 + bw * 0.7 + 0.5, W]]) if (b - a > 1) F.slab(B.plain, B.plain, a, b, -0.6, -0.5, 0, 1.0, C("#F4EFE6"));
  const pool = D - v0 - bd > 8 && R() < 0.45 ? { u0: u0 + 1, u1: u0 + Math.min(bw, 8), v0: v0 + bd + 2.5, v1: v0 + bd + 6 } : null;
  if (pool) F.top(B.water ? kit.B.water : B.plain, pool.u0, pool.u1, pool.v0, pool.v1, 0.06, C("#ffffff"), 4);
  return { h: H + 2.2, pool, yard: true };
}
