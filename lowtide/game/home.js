/* Hollis's place, from the street: the ground-floor unit of a stucco walk-up near the beach, the apartment
   nearest where she starts (picked here, so the street, the map and interiors.js all agree on it).
   It's the one with somebody living in it: a door painted harbour teal with a brass push plate and the
   number, a striped awning, two lanterns, the mailbox with her name on it, potted palms, a bench under the
   window, shutters and window boxes on her four windows, a pair of old buoys on the wall. */
import * as THREE from "three";

export function pickHome(entrances, spawn) {
  let best = null, bd = Infinity;
  for (const e of entrances) if (e.kind === "apartment" || e.kind === "house") { const d = Math.hypot(e.x - spawn.x, e.z - spawn.z); if (d < bd) { bd = d; best = e; } }
  if (best) { best.home = true; best.name = "Home"; }
  return best;
}

// a small canvas texture, nearest-neighbour like the rest of the street
function tex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; return t;
}

export function homeFront(scene, grid, e) {
  const f = e.frame; if (!f) return null;
  // the building's frame: u along the front, v into the building (the street is v < 0). Local x = -u, z = v.
  const root = new THREE.Group(); root.position.set(f.ox, 0, f.oz); root.rotation.y = Math.atan2(f.nx, f.nz); scene.add(root);
  const L = (o) => new THREE.MeshLambertMaterial(o);
  const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
  const put = (geo, mat, u, v, y, o = {}) => { const m = new THREE.Mesh(geo, mat); m.position.set(-u, y, v); if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; m.castShadow = !!o.cast; root.add(m); return m; };
  const world = (u, v) => [f.ox + f.tx * u + f.nx * v, f.oz + f.tz * u + f.nz * v];
  const du = e.door, front = e.front ?? 0;
  const teal = "#2f7f86", trim = L({ color: "#f2ede2" }), brass = L({ color: "#c9a14a" }), dark = L({ color: "#2a2622" });

  /* the door: panels and a push plate on harbour teal, a white frame, the number over it */
  const doorT = tex(32, 64, (g, w, h) => {
    g.fillStyle = teal; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,.22)"; for (const [x, y, ww, hh] of [[4, 4, 24, 14], [4, 22, 10, 20], [18, 22, 10, 20], [4, 46, 24, 14]]) { g.fillRect(x, y, ww, hh); g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(x + 1, y + 1, ww - 2, 1); g.fillStyle = "rgba(0,0,0,.22)"; }
    g.fillStyle = "#1d2a3a"; g.fillRect(8, 6, 16, 10);   // a little window in the top panel
    g.fillStyle = "#e0b040"; g.fillRect(24, 32, 3, 3); g.fillRect(12, 41, 8, 2);   // knob, letter slot
  });
  put(new THREE.BoxGeometry(1.14, 2.24, 0.05), [L({ color: teal }), L({ color: teal }), L({ color: teal }), L({ color: teal }), L({ map: doorT }), L({ map: doorT })], du, front - 0.1, 1.12);
  put(new THREE.BoxGeometry(0.14, 2.5, 0.12), trim, du - 0.66, front - 0.1, 1.25); put(new THREE.BoxGeometry(0.14, 2.5, 0.12), trim, du + 0.66, front - 0.1, 1.25);
  put(new THREE.BoxGeometry(1.46, 0.14, 0.12), trim, du, front - 0.1, 2.43);
  const numT = tex(32, 16, (g, w, h) => { g.fillStyle = "#1a2b3c"; g.fillRect(0, 0, w, h); g.fillStyle = "#e0b040"; g.font = "bold 13px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("9", w / 2, h / 2 + 1); });
  put(new THREE.BoxGeometry(0.34, 0.18, 0.03), [dark, dark, dark, dark, L({ map: numT }), L({ map: numT })], du, front - 0.17, 2.62);
  put(new THREE.BoxGeometry(0.5, 0.06, 0.02), brass, du, front - 0.135, 1.05);   // push plate
  // the mat
  const matT = tex(32, 16, (g, w, h) => { g.fillStyle = "#6a4a32"; g.fillRect(0, 0, w, h); g.fillStyle = "#8a6a44"; g.fillRect(2, 2, w - 4, h - 4); g.fillStyle = "#3a2a1e"; g.font = "bold 7px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("AHOY", w / 2, h / 2 + 1); });
  put(new THREE.BoxGeometry(1.0, 0.012, 0.55), [dark, dark, L({ map: matT }), dark, dark, dark], du, front - 0.45, 0.075);

  /* the awning: canvas stripes on a slope, a scalloped valance, two brackets */
  const awT = tex(32, 8, (g, w, h) => { for (let x = 0; x < w; x += 4) { g.fillStyle = (x / 4) % 2 ? "#f2ede2" : teal; g.fillRect(x, 0, 4, h); } });
  awT.wrapS = THREE.RepeatWrapping; awT.repeat.set(2, 1);
  const aw = put(new THREE.BoxGeometry(2.1, 0.03, 1.05), L({ map: awT }), du, front - 0.5, 2.82, { rx: -0.42, cast: true });
  const valT = tex(32, 8, (g, w, h) => { for (let x = 0; x < w; x += 4) { g.fillStyle = (x / 4) % 2 ? "#f2ede2" : teal; g.fillRect(x, 0, 4, 5); g.beginPath(); g.arc(x + 2, 5, 2, 0, Math.PI); g.fill(); } });
  valT.wrapS = THREE.RepeatWrapping; valT.repeat.set(2, 1);
  put(new THREE.PlaneGeometry(2.1, 0.22), new THREE.MeshLambertMaterial({ map: valT, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false }), du, front - 0.98, 2.52);
  for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.04, 0.04, 1.0), dark, du + s * 1.0, front - 0.48, 2.72, { rx: -0.42 });

  /* two lanterns either side of the door, lit */
  for (const s of [-1, 1]) {
    const u = du + s * 0.98;
    put(new THREE.BoxGeometry(0.06, 0.06, 0.16), dark, u, front - 0.09, 1.98);
    put(new THREE.BoxGeometry(0.2, 0.3, 0.2), glow(0xffd890), u, front - 0.2, 1.88);
    put(new THREE.BoxGeometry(0.26, 0.05, 0.26), dark, u, front - 0.2, 2.06); put(new THREE.BoxGeometry(0.24, 0.04, 0.24), dark, u, front - 0.2, 1.72);
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) put(new THREE.BoxGeometry(0.025, 0.3, 0.025), dark, u + a * 0.1, front - 0.2 + b * 0.1, 1.88);
  }

  /* the mailbox: her name on it */
  const mbT = tex(32, 16, (g, w, h) => { g.fillStyle = "#2a3a5a"; g.fillRect(0, 0, w, h); g.fillStyle = "#f2ede2"; g.fillRect(3, 4, 26, 8); g.fillStyle = "#1a1a1a"; g.font = "bold 7px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("VANE", w / 2, 8.5); });
  const mbM = L({ color: "#2a3a5a" });
  put(new THREE.BoxGeometry(0.42, 0.32, 0.16), [mbM, mbM, mbM, mbM, L({ map: mbT }), mbM], du + 1.45, front - 0.1, 1.25);
  put(new THREE.BoxGeometry(0.44, 0.03, 0.2), dark, du + 1.45, front - 0.12, 1.42);

  /* potted palms either side, a bench under the window */
  const pot = L({ color: "#b8643a" }), soil = L({ color: "#3a2a1e" }), leaf = new THREE.MeshLambertMaterial({ color: "#3f7a3a", side: THREE.DoubleSide }), trunk = L({ color: "#7a5a3a" });
  for (const s of [-1, 1]) {
    const u = du + s * 1.55, v = front - 0.55;
    put(new THREE.CylinderGeometry(0.3, 0.22, 0.55, 10), pot, u, v, 0.335, { cast: true }); put(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 10), soil, u, v, 0.6);
    put(new THREE.CylinderGeometry(0.04, 0.06, 0.9, 6), trunk, u, v, 1.05);
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const fr = put(new THREE.PlaneGeometry(0.16, 0.9), leaf, u + Math.cos(a) * 0.3, v + Math.sin(a) * 0.3, 1.45); fr.rotation.order = "YXZ"; fr.rotation.y = -a + Math.PI / 2; fr.rotation.x = -1.0; }
    const [wx, wz] = world(u, v); grid.circle(wx, wz, 0.32, 1);
  }
  const bu = du - 4.0, bench = L({ color: "#8a5a36" });
  for (let k = 0; k < 3; k++) put(new THREE.BoxGeometry(1.6, 0.04, 0.12), bench, bu, front - 0.5 + k * 0.14, 0.48);
  for (let k = 0; k < 2; k++) put(new THREE.BoxGeometry(1.6, 0.1, 0.04), bench, bu, front - 0.14, 0.7 + k * 0.16);
  for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.05, 0.46, 0.4), dark, bu + s * 0.72, front - 0.36, 0.23);
  { const [wx, wz] = world(bu, front - 0.36); grid.circle(wx, wz, 0.45, 0.8); }

  /* shutters and window boxes on her four windows (the stucco bays: a window 1-3 m into each 4 m bay) */
  const shut = L({ color: teal }), box = L({ color: "#8a5a36" });
  const flowers = ["#e8506a", "#f2c14e", "#f4f0e6", "#c94a8a", "#e07a3a"].map((c) => L({ color: c })), green = L({ color: "#3f7a3a" });
  let n = 0;
  for (let b = e.ws || 0; b < e.u1; b += 4) {
    const a = b + 1, c = b + 3, mid = (a + c) / 2;
    if (Math.abs(mid - du) > 6.5 || (a < du + 0.8 && c > du - 0.8)) continue;
    for (const s of [-1, 1]) {   // louvred shutters
      const su = s < 0 ? a - 0.24 : c + 0.24;
      put(new THREE.BoxGeometry(0.42, 1.78, 0.04), shut, su, front - 0.05, 1.6);
      for (let y = 0.85; y < 2.4; y += 0.12) put(new THREE.BoxGeometry(0.36, 0.015, 0.02), trim, su, front - 0.08, y);
    }
    put(new THREE.BoxGeometry(2.1, 0.22, 0.26), box, mid, front - 0.14, 0.63, { cast: true });
    for (let k = 0; k < 9; k++) {
      const fu = a - 0.05 + k * 0.26;
      put(new THREE.BoxGeometry(0.12, 0.16, 0.12), green, fu, front - 0.14, 0.8);
      put(new THREE.BoxGeometry(0.1, 0.08, 0.1), flowers[(k + n) % flowers.length], fu, front - 0.14 + (k % 2 ? 0.04 : -0.04), 0.92);
    }
    n++;
  }
  /* two old buoys hung by the mailbox */
  const red = L({ color: "#c23b2a" }), wht = L({ color: "#f2ede2" });
  for (const [u, m] of [[du + 2.35, red], [du + 2.65, wht]]) { put(new THREE.SphereGeometry(0.13, 10, 8), m, u, front - 0.16, 1.55); put(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 4), dark, u, front - 0.12, 1.85); }
  root.updateMatrixWorld(true);
  return root;
}
