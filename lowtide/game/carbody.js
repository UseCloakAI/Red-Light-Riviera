/* A car body that takes damage where it's hit. Parked and traffic cars are
   instanced (cheap); the first time one is hurt it swaps to one of these: the
   same shape, but cut into small panels so it can dent. An impact pushes the
   panels near the contact point in along the blow, more the harder it was and
   over a wider patch, with a cap so a panel never folds through the car; the
   paint there scrapes back toward bare metal, streaked. Flat-shaded, so every
   dent catches the light as a facet. Glass caves in on big hits. */
import * as THREE from "three";

const _v = new THREE.Vector3(), _c = new THREE.Color(), METAL = new THREE.Color(0x8e8c88), DARK = new THREE.Color(0x2a2826);

function panelled(geos) {   // merge boxes into one non-indexed geometry with a colour per vertex and a rest copy
  const parts = geos.map((g) => g.toNonIndexed());
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  geo.computeVertexNormals(); geo.userData.rest = pos.slice(); geo.userData.moved = new Float32Array(n);
  return geo;
}

export function makeCarBody(color) {
  const body = panelled([new THREE.BoxGeometry(1.8, 0.62, 4.3, 4, 2, 10).translate(0, 0.58, 0), new THREE.BoxGeometry(1.75, 0.2, 1.0, 4, 1, 3).translate(0, 0.95, 1.55)]);
  const glass = panelled([new THREE.BoxGeometry(1.55, 0.55, 2.1, 3, 2, 4).translate(0, 1.16, -0.25)]);
  const paint = new THREE.Color(color);
  { const c = body.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, paint.r, paint.g, paint.b); }
  { const c = glass.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, 0.16, 0.21, 0.27); }
  const bm = new THREE.Mesh(body, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const gm = new THREE.Mesh(glass, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x0c1218 }));
  const wheels = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 8).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x18181a }));
  const group = new THREE.Group(); group.add(bm, gm);
  const wl = [];
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) { const w = wheels.clone(); w.position.set(x, 0.33, z); group.add(w); wl.push(w); }
  // dent: p and dir in the car's own frame; amount in metres at the centre of the blow
  function dent(geo, p, dir, amount, radius, scrape) {
    const pos = geo.attributes.position, rest = geo.userData.rest, moved = geo.userData.moved, col = geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), d = Math.hypot(x - p.x, y - p.y, z - p.z);
      if (d > radius) continue;
      const f = (1 - d / radius) ** 2, push = Math.min(amount * f, 0.42 - moved[i]);
      if (push > 0) {
        pos.setXYZ(i, x + dir.x * push, y + dir.y * push * 0.6 - push * 0.15, z + dir.z * push); moved[i] += push;
        // keep it inside the car's outline so a panel never pokes through the other side
        pos.setX(i, Math.max(-0.95, Math.min(0.95, pos.getX(i)))); pos.setZ(i, Math.max(-2.2, Math.min(2.2, pos.getZ(i))));
      }
      if (scrape && f > 0.15) { _c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(Math.random() < 0.75 ? METAL : DARK, Math.min(0.85, f * scrape * (0.6 + Math.random() * 0.6))); col.setXYZ(i, _c.r, _c.g, _c.b); }
    }
    pos.needsUpdate = true; col.needsUpdate = true; geo.computeBoundingSphere();
    void rest;
  }
  return {
    group,
    // a blow at local point p (metres, car frame) along local direction dir, with impact speed v (m/s)
    hit(p, dir, v) {
      const amount = Math.min(0.38, Math.max(0, (v - 2) * 0.028)), radius = 0.45 + Math.min(1.1, v * 0.045);
      if (amount <= 0) return;
      dent(body, p, dir, amount, radius, Math.min(1, v / 14));
      if (v > 9) dent(glass, p, dir, amount * 0.7, radius * 0.8, 0);
      if (v > 14) for (const w of wl) if (Math.hypot(w.position.x - p.x, w.position.z - p.z) < 1.3) { w.rotation.x += (Math.random() - 0.5) * 0.4; w.position.y -= 0.06; }   // a bent wheel
    },
    char() { const c = body.attributes.color; for (let i = 0; i < c.count; i++) { const k = 0.12 + Math.random() * 0.08; c.setXYZ(i, k, k * 0.95, k * 0.9); } c.needsUpdate = true; const g = glass.attributes.color; for (let i = 0; i < g.count; i++) g.setXYZ(i, 0.05, 0.05, 0.05); g.needsUpdate = true; },
    tint(k) { bm.material.color.setScalar(k); }
  };
}
// a world point and direction into a car's own frame (car at x,z facing a)
export function toLocal(c, wx, wy, wz, dx, dz) {
  const s = Math.sin(c.a), co = Math.cos(c.a), rx = wx - c.x, rz = wz - c.z;
  // the car's local +x is (cos a, -sin a), +z is (sin a, cos a)
  return { p: _v.set(rx * co - rz * s, wy - (c.y || 0), rx * s + rz * co).clone(), dir: new THREE.Vector3(dx * co - dz * s, 0, dx * s + dz * co).normalize() };
}
