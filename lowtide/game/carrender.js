/* Drawing the cars. Every car on the island (parked, in traffic, the police, yours) is drawn from here, once a
   frame, from its state: where it is, how its body sits on its springs, where its wheels are on the road.

   - Clean cars are instances: one batch per model for the body (paint per instance), one for its glass, one for all
     the wheels, one each for the brake lamps, the indicators and the police bars, one for the people at the wheel
     of the cars too far away for a real person. Each batch is packed every frame with only the cars in view and in
     range, so a car out of sight costs nothing.
   - A car that's been hit, or has a door open, gets its own body: the same model, subdivided so it can dent, with its
     own paint and glass and lamps. Dents are pushed in where the blow landed and in the direction it came from,
     crumpling, the paint scraped back to metal; glass near a hard hit shatters; lamps break. It never swaps to a
     cheaper car, and there's no limit on how many are hurt.
   - Wheels sit on the road under each corner and turn with the steering and the speed; the body rides above them. */
import * as THREE from "three";
import { MODELS, buildModel, wheelGeometry, driverGeometry, bodyMaterial, glassMaterial, wheelMaterial } from "./carmodels.js?v=dev";

const FINE = 0.3;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, "YXZ"), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3(), _c = new THREE.Color();
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere(), _w = new THREE.Matrix4(), _l = new THREE.Matrix4();

// join baked geometries (same attributes) into one
function join(list) {
  const names = ["position", "color", "aPaint", "aGlow"], out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = list[0].attributes[n].itemSize, tot = list.reduce((a, g) => a + g.attributes[n].array.length, 0), arr = new Float32Array(tot); let o = 0;
    for (const g of list) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.computeVertexNormals(); out.computeBoundingSphere(); return out;
}
// a copy with its own position, colour, paint and glow (the things a dent, a scrape or a broken lamp change)
function own(g) {
  const out = new THREE.BufferGeometry();
  for (const n of ["position", "color", "aPaint", "aGlow"]) out.setAttribute(n, g.attributes[n].clone());
  out.setAttribute("normal", g.attributes.normal);
  out.userData = { shell: g.userData.shell, ranges: g.userData.ranges, orig: g.attributes.position.array.slice() };
  out.boundingSphere = g.boundingSphere.clone(); return out;
}
// a little noise, the same for the same point (so shared corners move together and nothing cracks)
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

/* ---------------- a car of its own ---------------- */
class Detail {
  constructor(fleet, c) {
    const m = c.m, G = buildModel(m, FINE);
    this.c = c; this.G = G;
    this.mat = bodyMaterial(false); this.mat.userData.u.uPaint.value.set(c.paint ?? 0xffffff);
    this.glassMat = fleet.glassMat;
    this.body = own(G.body); this.glass = own(G.glass); this.door = own(G.door); this.doorGlass = own(G.doorGlass);
    this.group = new THREE.Group(); this.group.matrixAutoUpdate = false;
    const bm = new THREE.Mesh(this.body, this.mat), gm = new THREE.Mesh(this.glass, this.glassMat);
    gm.renderOrder = 3;
    this.pivot = new THREE.Group(); this.pivot.position.copy(G.hinge);
    const dm = new THREE.Mesh(this.door, this.mat), dg = new THREE.Mesh(this.doorGlass, this.glassMat); dg.renderOrder = 3;
    dm.position.copy(G.hinge).negate(); dg.position.copy(G.hinge).negate();
    this.pivot.add(dm, dg); this.group.add(bm, gm, this.pivot);
    for (const o of [bm, gm, dm, dg]) o.frustumCulled = false;
    fleet.scene.add(this.group);
    this.lamps = { head0: true, head1: true, tail0: true, tail1: true };
    this.panes = G.glass.userData.ranges.map((r) => ({ ...r, ok: true }));
    this.doorPanes = G.doorGlass.userData.ranges.map((r) => ({ ...r, ok: true }));
    this.dirty = false; this.charred = false;
  }
  set paint(v) { this.mat.userData.u.uPaint.value.set(v); }
  place(M, open) {
    this.group.matrix.copy(M); this.group.matrixWorldNeedsUpdate = true; this.group.visible = true;
    this.pivot.rotation.y = -open * 1.15;
  }
  hide() { this.group.visible = false; }
  dispose(scene) { scene.remove(this.group); for (const g of [this.body, this.glass, this.door, this.doorGlass]) g.dispose(); this.mat.dispose(); }
  /* a blow at p (car space), pushing along dir (car space, into the car), closing speed v (m/s), how hard
     relative to this car (k ~ the other mass over both). Returns what broke: { glass, lamps } */
  hit(p, dir, v, k = 0.5) {
    const out = { glass: 0, lamps: [] };
    if (v < 1.5) return out;
    const R = Math.min(1.45, 0.38 + v * 0.045), D = Math.min(0.5, (v - 1.2) * 0.034 * (0.6 + k * 0.8));
    const scrape = v > 3.5;
    for (const g of [this.body, this.door]) {
      const P = g.attributes.position, A = P.array, O = g.userData.orig, S = g.userData.shell, col = g.attributes.color.array, pa = g.attributes.aPaint.array;
      let any = false;
      for (let i = 0; i < P.count; i++) {
        if (!S[i]) continue;
        const ox = O[i * 3], oy = O[i * 3 + 1], oz = O[i * 3 + 2];
        // distance from the blow, measured on the current (already dented) shape, but squashed vertically so dents spread along the panels
        const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2], dx = x - p.x, dy = (y - p.y) * 1.25, dz = z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= R) continue;
        const f = 1 - d / R, w = f * f * (3 - 2 * f), n = hash(ox, oy, oz), push = D * w * (0.75 + 0.5 * n);
        let nx = x + dir.x * push + (n - 0.5) * D * 0.35 * w, ny = y + dir.y * push + (hash(oz, ox, oy) - 0.5) * D * 0.5 * w, nz = z + dir.z * push + (hash(oy, oz, ox) - 0.5) * D * 0.35 * w;
        // never further than half a metre from where it was made (a car stays a car)
        const ex = nx - ox, ey = ny - oy, ez = nz - oz, el = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (el > 0.55) { const s = 0.55 / el; nx = ox + ex * s; ny = oy + ey * s; nz = oz + ez * s; }
        A[i * 3] = nx; A[i * 3 + 1] = Math.max(0.05, ny); A[i * 3 + 2] = nz; any = true;
        // the paint goes where it's hit hardest: bare metal showing
        if (scrape && w > 0.55 && pa[i] > 0.3 && hash(ox * 3.1, oy * 2.3, oz + v) < 0.55 + w * 0.3) { pa[i] = Math.max(0.15, pa[i] - 0.4 * w); const k2 = 0.62; col[i * 3] = col[i * 3] * (1 - w * 0.3) + k2 * w * 0.3; col[i * 3 + 1] = col[i * 3 + 1] * (1 - w * 0.3) + k2 * w * 0.3; col[i * 3 + 2] = col[i * 3 + 2] * (1 - w * 0.3) + (k2 + 0.02) * w * 0.3; }
      }
      if (any) { P.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.aPaint.needsUpdate = true; }
    }
    // glass near a hard hit goes
    if (v > 6.5) {
      for (const [list, g] of [[this.panes, this.glass], [this.doorPanes, this.doorGlass]]) for (const pn of list) {
        if (!pn.ok) continue; const d = Math.hypot(pn.c[0] - p.x, pn.c[1] - p.y, pn.c[2] - p.z);
        if (d < R * 1.1 || (v > 16 && d < R * 1.8)) { this.smash(g, pn); out.glass++; }
      }
    }
    // lamps
    if (v > 4) for (const r of this.body.userData.ranges) {
      if (!r.tag || !this.lamps[r.tag]) continue;
      if (Math.hypot(r.c[0] - p.x, r.c[1] - p.y, r.c[2] - p.z) < 0.55 + v * 0.02) { this.lamps[r.tag] = false; this.dark(r); out.lamps.push(r.tag); }
    }
    return out;
  }
  smash(g, pn) {
    pn.ok = false; const A = g.attributes.position.array;
    for (let i = pn.start; i < pn.start + pn.count; i++) { A[i * 3] = pn.c[0]; A[i * 3 + 1] = pn.c[1]; A[i * 3 + 2] = pn.c[2]; }
    g.attributes.position.needsUpdate = true;
  }
  dark(r) {
    const gl = this.body.attributes.aGlow.array, col = this.body.attributes.color.array;
    for (let i = r.start; i < r.start + r.count; i++) { gl[i] = 0; col[i * 3] *= 0.25; col[i * 3 + 1] *= 0.25; col[i * 3 + 2] *= 0.25; }
    this.body.attributes.aGlow.needsUpdate = true; this.body.attributes.color.needsUpdate = true;
  }
  // burnt out: black, no glass, no lamps
  char() {
    if (this.charred) return; this.charred = true;
    this.mat.color.setRGB(0.13, 0.12, 0.11); this.mat.userData.u.uGlow.value = 0;
    for (const pn of this.panes) if (pn.ok) this.smash(this.glass, pn);
    for (const pn of this.doorPanes) if (pn.ok) this.smash(this.doorGlass, pn);
    for (const k in this.lamps) this.lamps[k] = false;
  }
  // a hurt car's paint dulls a little (soot, dirt), not a different car
  tint(k) { this.mat.color.setScalar(0.55 + 0.45 * k); }
}

/* ---------------- the fleet ---------------- */
export class Fleet {
  constructor(scene, opts = {}) {
    this.scene = scene; this.range = opts.range || 260; this.t = 0; this.details = new Set();
    this.glassMat = glassMaterial();
    const inst = (geo, mat, n, order = 0) => { const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.renderOrder = order; scene.add(im); return im; };
    this.inst = inst;
    this.batches = MODELS.map((m) => {
      const G = buildModel(m, 0), body = join([G.body, G.door]), glass = join([G.glass, G.doorGlass]);
      const b = { m, G, cap: 32, body: inst(body, bodyMaterial(true), 32), glass: inst(glass, this.glassMat, 32, 3), n: 0 };
      b.body.setColorAt(0, _c.set(0xffffff)); b.body.instanceColor.setUsage(THREE.DynamicDrawUsage);
      return b;
    });
    this.byId = Object.fromEntries(this.batches.map((b) => [b.m.id, b]));
    // wheels: four a car
    this.wheels = inst(wheelGeometry(), wheelMaterial(), 4 * 256);
    // lamps that change: the brake lamps (dim, bright when braking), the indicators, the police lights
    const B = (o) => new THREE.MeshBasicMaterial(o), box = new THREE.BoxGeometry(1, 1, 1);
    this.brakes = inst(box, B({ color: 0xffffff }), 2 * 256); this.brakes.setColorAt(0, _c.set(0xffffff)); this.brakes.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.inds = inst(box, B({ color: 0xffa020 }), 4 * 96);
    this.barR = inst(box, B({ color: 0xff2030 }), 24); this.barB = inst(box, B({ color: 0x2060ff }), 24);
    // the people at the wheel of the cars too far for a real one
    const dmat = bodyMaterial(true);
    this.dummies = MODELS.map((m) => { const im = inst(driverGeometry(m), dmat, 24); im.setColorAt(0, _c.set(0xffffff)); im.instanceColor.setUsage(THREE.DynamicDrawUsage); return { m, im, n: 0, cap: 24 }; });
    this.dummyBy = Object.fromEntries(this.dummies.map((d) => [d.m.id, d]));
    this.meshes = [...this.batches.flatMap((b) => [b.body, b.glass]), this.wheels, this.brakes, this.inds, this.barR, this.barB, ...this.dummies.map((d) => d.im)];
  }
  // grow a batch that's run out of room (rare: lots of one model in view)
  grow(b, key, cap2) {
    const old = b[key], im = this.inst(old.geometry, old.material, cap2, old.renderOrder);
    if (old.instanceColor) { im.setColorAt(0, _c.set(0xffffff)); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    this.scene.remove(old); old.dispose(); b[key] = im; this.meshes = [...this.batches.flatMap((x) => [x.body, x.glass]), this.wheels, this.brakes, this.inds, this.barR, this.barB, ...this.dummies.map((d) => d.im)];
    return im;
  }
  // the body's world matrix: position on its springs, heading, the ground's slope and the body's pitch and roll
  matrix(c, out = new THREE.Matrix4()) {
    const flat = c.flats ? -0.06 : 0;
    _e.set((c.pitch || 0) - (c.gp || 0), c.a + (c.bend || 0) * 0.5, (c.roll || 0) + (c.gr || 0) + (c.bend || 0) + (c.flip || 0));
    _q.setFromEuler(_e);
    return out.compose(_p.set(c.x, (c.y || 0) + (c.heave || 0) + (c.lift || 0) + flat, c.z), _q, _s);
  }
  // a car gets its own body (dentable) from now on
  detail(c) {
    if (!c.detail) { c.detail = new Detail(this, c); this.details.add(c.detail); if (c.charred) c.detail.char(); }
    return c.detail;
  }
  warm(m) { buildModel(m, FINE); }
  drop(c) { if (c.detail) { this.details.delete(c.detail); c.detail.dispose(this.scene); c.detail = null; } }
  /* draw. cars: every car; cam: the camera; opts.real: a set of cars whose driver is a real person (no dummy) */
  render(cars, cam, dt) {
    this.t += dt;
    cam.updateMatrixWorld(); _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
    const cx = cam.position.x, cz = cam.position.z, R2 = this.range * this.range;
    for (const b of this.batches) b.n = 0; for (const d of this.dummies) d.n = 0;
    let nw = 0, nb = 0, ni = 0, nbar = 0;
    const blink = (k) => ((this.t * 1.6 + k * 0.13) % 1) < 0.5, flash = (k) => ((this.t * 4.2 + k * 0.3) % 1);
    for (const c of cars) {
      if (c.hidden || !c.m) { if (c.detail) c.detail.hide(); continue; }
      const dx = c.x - cx, dz = c.z - cz;
      if (dx * dx + dz * dz > R2) { if (c.detail) c.detail.hide(); continue; }
      _sp.center.set(c.x, (c.y || 0) + 0.8, c.z); _sp.radius = c.S ? c.S.hl + 0.6 : 3;
      if (!_fr.intersectsSphere(_sp)) { if (c.detail) c.detail.hide(); continue; }
      const M = this.matrix(c, _w), m = c.m, G = this.byId[m.id].G;
      if (c.door > 0.01 && !c.detail) this.detail(c);
      if (c.detail) c.detail.place(M, c.door || 0);
      else {
        let b = this.byId[m.id]; if (b.n >= b.cap) { b.cap *= 2; this.grow(b, "body", b.cap); this.grow(b, "glass", b.cap); }
        b.body.setMatrixAt(b.n, M); b.glass.setMatrixAt(b.n, M); b.body.setColorAt(b.n, _c.set(c.paint ?? 0xffffff)); b.n++;
      }
      // someone at the wheel, far off
      if (c.dummy) { const d = this.dummyBy[m.id]; if (d.n >= d.cap) { d.cap *= 2; d.im = this.grow(d, "im", d.cap); } d.im.setMatrixAt(d.n, M); d.im.setColorAt(d.n, _c.set(c.shirt ?? 0x405060)); d.n++; }
      // the wheels, on the road under each corner
      if (nw + 4 <= this.wheels.instanceMatrix.count) {
        const sn = Math.sin(c.a), cs = Math.cos(c.a), Rw = m.wheelR * (c.flats ? 0.86 : 1);
        for (let i = 0; i < 4; i++) {
          const [lx, lz] = G.wheels[i], front = i < 2, yaw = c.a + (front ? (c.steer || 0) : 0) + (c.bent && c.bent[i] ? c.bent[i] : 0);
          const gy = c.wy ? c.wy[i] : (c.y || 0);
          _p.set(c.x + lx * cs + lz * sn, gy + Rw + (c.lift || 0), c.z - lx * sn + lz * cs);
          if (c.airT > 0.05) _p.y = (c.y || 0) + Rw - 0.06;   // in the air: hanging on the springs
          if (c.flip) { _v.set(lx, Rw, lz).applyMatrix4(M); _p.copy(_v); }
          _e.set(c.wheelRot || 0, yaw, (c.flip || 0) + (c.camber && c.camber[i] || 0)); _q.setFromEuler(_e);
          _l.compose(_p, _q, _v.set(Rw, Rw, Rw)); this.wheels.setMatrixAt(nw++, _l);
        }
      }
      // brake lamps (dim tail lamps when not braking; dark if broken)
      const lamps = c.detail ? c.detail.lamps : null;
      if (!c.charred && nb + 2 <= this.brakes.instanceMatrix.count) for (let k = 0; k < 2; k++) {
        if (lamps && !lamps["tail" + k]) continue;
        const [tx, ty, tz] = G.tails[k];
        _l.compose(_v.set(tx, ty, tz - 0.012), _q.identity(), _p.set(0.36, 0.11, 0.03)); _m.multiplyMatrices(M, _l);
        this.brakes.setMatrixAt(nb, _m); this.brakes.setColorAt(nb, c.brake ? _c.setRGB(1, 0.12, 0.06) : _c.setRGB(0.42, 0.04, 0.03)); nb++;
      }
      // indicators: front and back on the side it's turning (+1 right is -x), both for hazards
      if (c.ind && blink(c.i || 0) && !c.charred && ni + 4 <= this.inds.instanceMatrix.count) {
        const [fx, fy, fz] = G.ind[0], [rx, ry, rz] = G.ind[1], sides = c.ind === 2 ? [1, -1] : [c.ind < 0 ? 1 : -1];
        for (const s of sides) for (const [x, y, z] of [[fx * s, fy, fz + 0.01], [rx * s, ry, rz - 0.01]]) { _l.compose(_v.set(x, y, z), _q.identity(), _p.set(0.13, 0.09, 0.05)); _m.multiplyMatrices(M, _l); this.inds.setMatrixAt(ni++, _m); }
      }
      // the police: red and blue taking turns (steady while parked with the siren off)
      if (c.cop && nbar < 24) {
        const f = flash(c.i || 0), y = m.cab.roof + 0.13, z = (m.cab.zrf + m.cab.zrr) / 2;
        _l.compose(_v.set(0.3, y, z), _q.identity(), _p.set(0.5, 0.12, 0.22)); _m.multiplyMatrices(M, _l);
        if (!c.siren || f < 0.5) this.barR.setMatrixAt(nbar, _m); else this.barR.setMatrixAt(nbar, _l.makeScale(0, 0, 0));
        _l.compose(_v.set(-0.3, y, z), _q.identity(), _p.set(0.5, 0.12, 0.22)); _m.multiplyMatrices(M, _l);
        if (!c.siren || f >= 0.5) this.barB.setMatrixAt(nbar, _m); else this.barB.setMatrixAt(nbar, _l.makeScale(0, 0, 0));
        nbar++;
      }
    }
    for (const b of this.batches) { b.body.count = b.glass.count = b.n; b.body.visible = b.glass.visible = b.n > 0; if (b.n) { b.body.instanceMatrix.needsUpdate = b.glass.instanceMatrix.needsUpdate = true; b.body.instanceColor.needsUpdate = true; } }
    for (const d of this.dummies) { d.im.count = d.n; d.im.visible = d.n > 0; if (d.n) { d.im.instanceMatrix.needsUpdate = true; d.im.instanceColor.needsUpdate = true; } }
    const fin = (im, n) => { im.count = n; im.visible = n > 0; if (n) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; } };
    fin(this.wheels, nw); fin(this.brakes, nb); fin(this.inds, ni); fin(this.barR, nbar); fin(this.barB, nbar);
  }
}
