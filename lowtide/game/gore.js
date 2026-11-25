/* Blood. A hit throws a spray of dark drops along the round's path and a mist
   at the wound; the drops that land, and the round that carries on, leave
   splats on the ground and on the wall behind. A body that's stopped moving
   bleeds a pool that spreads for a while. Headshots throw more. All in the PS1
   style: hard square drops, small chunky splat textures, a cap on everything. */
import * as THREE from "three";
import { flat } from "./ps1.js?v=dev";

function splatTex(seed) {
  const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d");
  let s = seed; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) { const r = 2 + R() * (i < 3 ? 9 : 4), a = R() * 6.28, d = i < 3 ? R() * 3 : 4 + R() * 10; g.fillStyle = `rgba(${70 + R() * 30 | 0},${4 + R() * 8 | 0},${6 + R() * 8 | 0},${0.75 + R() * 0.25})`; g.beginPath(); g.arc(16 + Math.cos(a) * d, 16 + Math.sin(a) * d, r, 0, 6.29); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t;
}

export class Gore {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    // drops: square points, normal blending (blood doesn't glow)
    const N = 260, g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3).fill(-999), 3));
    this.drops = { N, k: 0, g, list: Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), life: 0 })) };
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x6a0a0c, size: 0.07, transparent: true, opacity: 0.95, depthWrite: false })); pts.frustumCulled = false; scene.add(pts);
    // splats: instanced quads laid on whatever they hit
    this.splats = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: splatTex(7), transparent: true, depthWrite: false, ...flat(-4) }), 80);
    this.splats.count = 0; this.si = 0; this.splats.frustumCulled = false; this.splats.renderOrder = 2; scene.add(this.splats);
    this.poolMat = new THREE.MeshLambertMaterial({ map: splatTex(31), transparent: true, depthWrite: false, ...flat(-5) });
    this.pools = []; this.mist = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._z = new THREE.Vector3(0, 0, 1);
  }
  // a hit at point, the round travelling along dir; amount ~1 for a body shot, more for a head or a car
  hit(point, dir, amount = 1, fx) {
    const D = this.drops, n = Math.round(14 * amount), d = dir.clone().setY(Math.max(dir.y, 0)).normalize();
    for (let i = 0; i < n; i++) {
      const q = D.list[D.k++ % D.N];
      q.p.copy(point);
      // most go on with the round; some burst back toward the shooter
      const back = Math.random() < 0.3 ? -0.6 : 1;
      q.v.set(d.x * back * (2 + Math.random() * 4) + (Math.random() - 0.5) * 2.2, 0.5 + Math.random() * 2.5, d.z * back * (2 + Math.random() * 4) + (Math.random() - 0.5) * 2.2);
      q.life = 1.6;
    }
    if (fx) fx.puff(point, d.clone().multiplyScalar(0.8), 0.35 + amount * 0.2, 0.5, 0x5a0808, 0.7);
    // the wall or the ground behind them gets it
    const end = point.clone().addScaledVector(d, 3.5), h = this.world.grid.hit(point, end);
    if (h.t < 1) this.splat(point.clone().lerp(end, h.t), new THREE.Vector3(h.nx, h.ny, h.nz), 0.6 + amount * 0.4);
    const gp = point.clone().addScaledVector(d, 0.8 + Math.random()); gp.y = this.world.heightAt(gp.x, gp.z);
    this.splat(gp, new THREE.Vector3(0, 1, 0), 0.5 + amount * 0.35);
  }
  splat(p, n, size) {
    const m = this._m, q = this._q.setFromUnitVectors(this._z, n.lengthSq() ? n.normalize() : n.set(0, 1, 0));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(this._z, Math.random() * 6.28));
    m.compose(p.clone().addScaledVector(n, 0.02), q, new THREE.Vector3(size, size, size));
    this.splats.setMatrixAt(this.si % 80, m); this.si++; this.splats.count = Math.min(80, this.si); this.splats.instanceMatrix.needsUpdate = true;
  }
  // a body bleeding: the pool follows `at()` until it stops moving, then spreads
  pool(at) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), this.poolMat); mesh.scale.setScalar(0.01); mesh.renderOrder = 2; this.scene.add(mesh);
    this.pools.push({ mesh, at, t: 0, size: 0.9 + Math.random() * 0.6 });
    if (this.pools.length > 24) { const o = this.pools.shift(); this.scene.remove(o.mesh); o.mesh.geometry.dispose(); }
  }
  update(dt) {
    const D = this.drops, pa = D.g.attributes.position;
    for (let i = 0; i < D.N; i++) {
      const q = D.list[i];
      if (q.life > 0) {
        q.life -= dt; q.v.y -= 9.8 * dt; q.p.addScaledVector(q.v, dt);
        const g = this.world.heightAt(q.p.x, q.p.z);
        if (q.p.y <= g) { if (Math.random() < 0.18) this.splat(new THREE.Vector3(q.p.x, g, q.p.z), new THREE.Vector3(0, 1, 0), 0.18 + Math.random() * 0.2); q.life = 0; }
        if (q.life <= 0) q.p.y = -999;
      }
      pa.setXYZ(i, q.p.x, q.p.y, q.p.z);
    }
    pa.needsUpdate = true;
    for (const P of this.pools) {
      P.t += dt; const p = P.at && P.at();
      if (p && P.t < 2.5) P.mesh.position.set(p.x, this.world.heightAt(p.x, p.z) + 0.03, p.z);   // under the body as it comes to rest
      const k = Math.max(0, Math.min(1, (P.t - 1.5) / 12)); P.mesh.scale.setScalar(0.01 + P.size * Math.sqrt(k));
    }
  }
}
