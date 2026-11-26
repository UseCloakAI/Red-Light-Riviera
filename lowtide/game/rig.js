/* Procedural body work on top of the animation clips: find the bones that
   matter on either rig (MakeHuman from game/human.js, or the Mixamo fallback),
   point a bone at something, two-bone IK for the arms, and a small verlet
   ragdoll for people who go down. Everything works in world space and writes
   local rotations back, so it doesn't care how either rig's bones are oriented. */
import * as THREE from "three";

const MH = { hips: "root", spine: "spine04", chest: "spine02", neck: "neck01", head: "head",
  armL: ["upperarm01_L", "lowerarm01_L", "wrist_L", "finger3-1_L"], armR: ["upperarm01_R", "lowerarm01_R", "wrist_R", "finger3-1_R"],
  legL: ["upperleg01_L", "lowerleg01_L", "foot_L", "toe1-1_L"], legR: ["upperleg01_R", "lowerleg01_R", "foot_R", "toe1-1_R"] };
const MX = { hips: "Hips", spine: "Spine", chest: "Spine2", neck: "Neck", head: "Head",
  armL: ["LeftArm", "LeftForeArm", "LeftHand", "LeftHandMiddle1"], armR: ["RightArm", "RightForeArm", "RightHand", "RightHandMiddle1"],
  legL: ["LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"], legR: ["RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"] };

export function findBones(root) {
  const by = {};
  root.traverse((o) => { if (o.isBone) by[o.name.replace(/^mixamorig:?/, "")] = o; });
  const T = by.root && by.spine04 ? MH : by.Hips ? MX : null;
  if (!T) return null;
  const get = (n) => by[n] || null, out = {};
  for (const [k, v] of Object.entries(T)) out[k] = Array.isArray(v) ? v.map(get) : get(v);
  return Object.values(out).flat().every(Boolean) ? out : null;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _id = new THREE.Quaternion();
export const wpos = (b, out = new THREE.Vector3()) => out.setFromMatrixPosition(b.matrixWorld);

// rotate a bone by a world-space rotation, and bring its children along
export function turnWorld(b, q) {
  b.parent.getWorldQuaternion(_pq); b.getWorldQuaternion(_wq);
  b.quaternion.copy(_pq.invert().multiply(_wq.premultiply(q)));
  b.updateMatrixWorld(true);
}
// turn bone b so the line from it to `child` points along dir (weight w)
export function point(b, child, dir, w = 1) {
  wpos(b, _a); wpos(child, _b); _b.sub(_a).normalize();
  _q.setFromUnitVectors(_b, dir); if (w < 1) _q.slerpQuaternions(_id, _q, w);
  turnWorld(b, _q);
}

// two-bone IK: put chain[2] (the hand) at target, elbow bending toward pole
const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _C = new THREE.Vector3(), _D = new THREE.Vector3(), _P = new THREE.Vector3(), _E = new THREE.Vector3(), _T = new THREE.Vector3();
export function ik(chain, target, pole, w = 1) {
  const [a, b, c] = chain;
  wpos(a, _A); wpos(b, _B); wpos(c, _C);
  const l1 = _A.distanceTo(_B), l2 = _B.distanceTo(_C);
  _T.copy(_C).lerp(target, w);
  _D.copy(_T).sub(_A); const d = THREE.MathUtils.clamp(_D.length(), 0.02, (l1 + l2) * 0.999); _D.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _P.copy(pole).addScaledVector(_D, -pole.dot(_D)).normalize();
  _E.copy(_A).addScaledVector(_D, x).addScaledVector(_P, h);
  point(a, b, _B.copy(_E).sub(_A).normalize());
  point(b, c, _B.copy(_A).addScaledVector(_D, d).sub(_E).normalize());
}

/* ---------------- ragdoll ----------------
   Seventeen points (pelvis, neck, head top, and each shoulder/elbow/wrist,
   hip/knee/ankle/toe) held by sticks, each with its share of the body's mass,
   so the torso carries the limbs and not the other way round. Knees and elbows
   are hinges that only bend the way they bend, the thighs don't swing past the
   hips behind, the head stays on the shoulders. On the ground they slide with
   real friction (fast across the road at first, then caught and stopped), off
   walls, and onto cars: a car is a solid box with its own roofline, so someone
   hit at the knees folds onto the bonnet and rolls off it, and a moving car
   carries whoever's lying on it. Each frame the bones are turned to follow. */
const PTS = ["hips", "neck", "top", "shL", "elL", "haL", "shR", "elR", "haR", "thL", "knL", "anL", "toL", "thR", "knR", "anR", "toR"];
const I = Object.fromEntries(PTS.map((n, i) => [n, i]));
const MASS = { hips: 9, neck: 8, top: 4.5, shL: 2.2, shR: 2.2, elL: 1.4, elR: 1.4, haL: 0.6, haR: 0.6, thL: 5, thR: 5, knL: 3, knR: 3, anL: 1.2, anR: 1.2, toL: 0.4, toR: 0.4 };
const RAD = { hips: 0.13, neck: 0.12, top: 0.11 };
const STICKS = [["hips", "neck"], ["neck", "top"], ["neck", "shL"], ["neck", "shR"], ["shL", "shR"], ["hips", "shL"], ["hips", "shR"],
  ["shL", "elL"], ["elL", "haL"], ["shR", "elR"], ["elR", "haR"],
  ["hips", "thL"], ["hips", "thR"], ["thL", "thR"], ["thL", "neck"], ["thR", "neck"], ["thL", "shL"], ["thR", "shR"], ["shL", "top"], ["shR", "top"],
  ["thL", "knL"], ["knL", "anL"], ["anL", "toL"], ["knL", "toL"], ["thR", "knR"], ["knR", "anR"], ["anR", "toR"], ["knR", "toR"]];
// limbs may bend but not fold flat
const MINS = [["thL", "anL", 0.55], ["thR", "anR", 0.55], ["shL", "haL", 0.45], ["shR", "haR", 0.45], ["top", "hips", 0.9], ["haL", "hips", 0.2], ["haR", "hips", 0.2]];
const H = 1 / 90, ITER = 7, MU_S = 0.75, MU_K = 0.5;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _up = new THREE.Vector3(), _l = new THREE.Vector3(), _w = new THREE.Vector3();
// a car's roofline at a point along it (car space z): bonnet, glass, roof, boot
const PROFILE = new Map();
function profile(m) {
  let P = PROFILE.get(m.id); if (P) return P;
  const o = m.outline, c = m.cab, N = 24, hl = m.L / 2; P = { n: N, hl, y: new Float32Array(N + 1) };
  for (let i = 0; i <= N; i++) {
    const z = -hl + 2 * hl * i / N; let y = m.clear + 0.3;
    for (let k = 0; k < o.length - 1; k++) { const [z0, y0] = o[k], [z1, y1] = o[k + 1]; if ((z - z0) * (z - z1) <= 0 && z0 !== z1) y = Math.max(y, y0 + (y1 - y0) * (z - z0) / (z1 - z0)); }
    if (z <= c.zf && z >= c.zr) { const r = z >= c.zrr && z <= c.zrf ? c.roof : z > c.zrf ? c.roof - (c.roof - c.belt) * (z - c.zrf) / Math.max(0.01, c.zf - c.zrf) : c.roof - (c.roof - c.belt) * (c.zrr - z) / Math.max(0.01, c.zrr - c.zr); y = Math.max(y, r); }
    if (m.bed && z > m.bed.z0 && z < m.bed.z1) y = Math.min(y, m.bed.floor + 0.05);
    P.y[i] = y;
  }
  PROFILE.set(m.id, P); return P;
}
const roofAt = (m, lz) => { const P = profile(m), u = (lz + P.hl) / (2 * P.hl) * P.n, i = Math.max(0, Math.min(P.n - 1, Math.floor(u))), k = Math.max(0, Math.min(1, u - i)); return P.y[i] + (P.y[i + 1] - P.y[i]) * k; };

export class Ragdoll {
  constructor(B, world, vel, hit) {
    this.B = B; this.w = world; this.t = 0; this.sleep = 0;
    const top = wpos(B.head).add(wpos(B.head, _a).sub(wpos(B.neck, _b)).multiplyScalar(1.6));
    const src = { hips: wpos(B.hips), neck: wpos(B.neck), top, shL: wpos(B.armL[0]), elL: wpos(B.armL[1]), haL: wpos(B.armL[2]),
      shR: wpos(B.armR[0]), elR: wpos(B.armR[1]), haR: wpos(B.armR[2]), thL: wpos(B.legL[0]), knL: wpos(B.legL[1]), anL: wpos(B.legL[2]), toL: wpos(B.legL[3]),
      thR: wpos(B.legR[0]), knR: wpos(B.legR[1]), anR: wpos(B.legR[2]), toR: wpos(B.legR[3]) };
    this.p = PTS.map((n) => src[n].clone());
    this.im = PTS.map((n) => 1 / MASS[n]); this.rad = PTS.map((n) => RAD[n] || 0.06); this.pen = new Float32Array(PTS.length);
    this.o = this.p.map((p) => p.clone().addScaledVector(vel || _a.set(0, 0, 0), -H));
    this.sticks = STICKS.map(([a, b]) => [I[a], I[b], this.p[I[a]].distanceTo(this.p[I[b]])]);
    this.mins = MINS.map(([a, b, k]) => [I[a], I[b], this.p[I[a]].distanceTo(this.p[I[b]]) * k]);
    this.thigh = this.p[I.thL].distanceTo(this.p[I.knL]);
    if (hit) this.impulse(hit.point, hit.dir, hit.force || 4);
    // knees give out and the top goes over: the way they were hit, and a little to one side
    const dir = hit ? _b.copy(hit.dir).setY(0).normalize() : _b.set(0, 0, 1), side = (Math.random() - 0.5) * 1.6;
    const lat = _A.set(-dir.z, 0, dir.x).multiplyScalar(side);
    for (const n of ["neck", "top", "shL", "shR"]) this.kick(I[n], _a.copy(dir).multiplyScalar(1.4).add(lat));
    for (const n of ["knL", "knR"]) this.kick(I[n], _a.copy(dir).multiplyScalar(-0.5).setY(-0.5));
    this.acc = 0; this.skip = null; this.skipT = 0;
  }
  kick(i, v) { this.o[i].addScaledVector(v, -H); }
  // a hit at point along dir: the nearest points take most of it (the light ones fly further)
  impulse(point, dir, force) {
    this.p.forEach((p, i) => { const d = p.distanceTo(point), k = Math.max(0, 1 - d / 0.7); if (k > 0) this.kick(i, _b.copy(dir).multiplyScalar(force * k * Math.min(1.6, Math.sqrt(this.im[i] * 4)))); });
  }
  // a car that's just hit them: it counts as solid straight away (no grace period)
  carry(c) { this.hitCar = c; this.sleep = 0; }
  // thrown from something moving (bailing out of a car): the feet catch and the body tumbles over them
  spin(v) {
    const k = Math.min(1, v / 18); if (k <= 0) return;
    let mx = 0, mz = 0; for (let i = 0; i < this.p.length; i++) { mx += this.p[i].x - this.o[i].x; mz += this.p[i].z - this.o[i].z; }
    const l = Math.hypot(mx, mz) || 1; _w.set(mx / l, 0, mz / l);
    for (const n of ["top", "neck", "shL", "shR"]) this.kick(I[n], _a.copy(_w).multiplyScalar(2.2 * k).setY(-1.6 * k));
    for (const n of ["anL", "anR", "toL", "toR"]) this.kick(I[n], _a.copy(_w).multiplyScalar(-1.8 * k).setY(1.8 * k));
  }
  step(dt) {
    this.t += dt; if (this.sleep > 1.5) return false;
    this.acc = Math.min(this.acc + dt, 0.1);
    let moved = 0;
    while (this.acc >= H) {
      this.acc -= H;
      for (let i = 0; i < this.p.length; i++) {
        const p = this.p[i], o = this.o[i], vx = (p.x - o.x) * 0.998, vy = (p.y - o.y) * 0.998, vz = (p.z - o.z) * 0.998;
        o.copy(p); p.x += vx; p.y += vy - 9.8 * H * H; p.z += vz;
        moved += vx * vx + vy * vy + vz * vz;
      }
      this.cars = Ragdoll.cars ? Ragdoll.cars(this.p[0].x, this.p[0].z, this) : null;
      this.pen.fill(0);
      for (let it = 0; it < ITER; it++) {
        for (const [a, b, L] of this.sticks) this.fix(a, b, L, 0);
        for (const [a, b, L] of this.mins) this.fix(a, b, L, 1);
        this.joints();
        for (let i = 0; i < this.p.length; i++) this.collide(i, it === ITER - 1);
      }
      // friction where they touch the ground: kinetic while sliding, caught and held once slow enough
      for (let i = 0; i < this.p.length; i++) {
        const d = this.pen[i]; if (d <= 0) continue;
        const p = this.p[i], o = this.o[i], tx = p.x - o.x, tz = p.z - o.z, t = Math.hypot(tx, tz);
        if (t < MU_S * d + 2e-4) { p.x = o.x; p.z = o.z; }
        else { const k = Math.max(0, 1 - (MU_K * d + 1e-4) / t); p.x = o.x + tx * k; p.z = o.z + tz * k; }
      }
    }
    this.sleep = moved < 2e-7 ? this.sleep + dt : 0;
    return true;
  }
  fix(a, b, L, minOnly) {
    const A = this.p[a], B = this.p[b], dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    if (minOnly && d >= L) return;
    const wa = this.im[a], wb = this.im[b], k = (d - L) / d / (wa + wb);
    A.x += dx * k * wa; A.y += dy * k * wa; A.z += dz * k * wa; B.x -= dx * k * wb; B.y -= dy * k * wb; B.z -= dz * k * wb;
  }
  // knees and elbows bend one way only; thighs don't go far behind the hips
  joints() {
    const P = this.p;
    _r.copy(P[I.thR]).sub(P[I.thL]).normalize(); _up.copy(P[I.neck]).sub(P[I.hips]).normalize(); _f.crossVectors(_up, _r).normalize();
    const hinge = (a, m, b, sign) => {
      const A = P[a], M = P[m], Bp = P[b]; _l.copy(Bp).sub(A); const L2 = _l.lengthSq() || 1e-6;
      const t = _a.copy(M).sub(A).dot(_l) / L2; _w.copy(A).addScaledVector(_l, t);
      const off = _b.copy(M).sub(_w), fd = off.dot(_f) * sign;
      if (fd < 0) { const k = -fd * 0.6; M.addScaledVector(_f, k * sign); A.addScaledVector(_f, -k * sign * 0.2); Bp.addScaledVector(_f, -k * sign * 0.2); }
    };
    hinge(I.thL, I.knL, I.anL, 1); hinge(I.thR, I.knR, I.anR, 1);
    hinge(I.shL, I.elL, I.haL, -1); hinge(I.shR, I.elR, I.haR, -1);
    for (const [th, kn] of [[I.thL, I.knL], [I.thR, I.knR]]) { const back = _a.copy(P[kn]).sub(P[th]).dot(_f); if (back < -0.45 * this.thigh) P[kn].addScaledVector(_f, (-0.45 * this.thigh - back) * 0.5); }
  }
  collide(i, last) {
    const p = this.p[i], r = this.rad[i], g = this.w.heightAt(p.x, p.z) + r;
    if (p.y < g) { this.pen[i] = Math.max(this.pen[i], g - p.y); p.y = g; }
    else if (p.y < g + 0.004) this.pen[i] = Math.max(this.pen[i], 9.8 * H * H);   // resting on it
    _a.copy(p); this.w.grid.resolve(_a, r, p.y, 0.1, (o) => !!o.car); p.x = _a.x; p.z = _a.z;
    // cars: out of the body by the shallowest way (onto the bonnet or roof, or off the side), moving with it
    if (this.cars) for (const c of this.cars) {
      const S = c.S, sn = Math.sin(c.a), cs = Math.cos(c.a), dx = p.x - c.x, dz = p.z - c.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, ly = p.y - (c.y || 0);
      const hw = S.hw + r, hl = S.hl + r; if (Math.abs(lx) > hw || Math.abs(lz) > hl) continue;
      const top = roofAt(c.m, Math.max(-S.hl, Math.min(S.hl, lz))) + r * 0.5; if (ly > top || ly < c.m.clear - 0.1) continue;
      const px = hw - Math.abs(lx), pz = hl - Math.abs(lz), py = top - ly;
      // the car's surface velocity here
      const vx = (c.vx || 0) + (c.om || 0) * dz, vz = (c.vz || 0) - (c.om || 0) * dx, o = this.o[i];
      if (py < px && py < pz) { p.y += py; this.pen[i] = Math.max(this.pen[i], Math.min(py, 0.02) * 0.6); o.x += ((p.x - o.x) - vx * H) * 0.25; o.z += ((p.z - o.z) - vz * H) * 0.25; }
      else if (px < pz) { const s = Math.sign(lx) || 1; p.x += s * px * cs; p.z -= s * px * sn; const vn = vx * cs - vz * sn, pv = ((p.x - o.x) * cs - (p.z - o.z) * sn) / H; if ((pv - vn) * s < 0) { o.x += (pv - vn) * H * cs; o.z -= (pv - vn) * H * sn; } }
      else { const s = Math.sign(lz) || 1; p.x += s * pz * sn; p.z += s * pz * cs; const vn = vx * sn + vz * cs, pv = ((p.x - o.x) * sn + (p.z - o.z) * cs) / H; if ((pv - vn) * s < 0) { o.x += (pv - vn) * H * sn; o.z += (pv - vn) * H * cs; } }
    }
  }
  // turn the skeleton to match the points
  pose() {
    const B = this.B, P = this.p, d = (a, b) => _T.copy(P[I[b]]).sub(P[I[a]]).normalize();
    // pelvis: full orientation from up (pelvis to neck) and across (left hip to right hip)
    const want = basis(P[I.hips], P[I.neck], P[I.thL], P[I.thR], _m1);
    const have = basis(wpos(B.hips, _A), wpos(B.neck, _B), wpos(B.legL[0], _C), wpos(B.legR[0], _D), _m2);
    _q.setFromRotationMatrix(want.multiply(have.transpose()));
    turnWorld(B.hips, _q);
    // put the pelvis on its point
    const par = B.hips.parent; _E.copy(P[I.hips]); par.worldToLocal(_E); B.hips.position.copy(_E); B.hips.updateMatrixWorld(true);
    point(B.spine, B.neck, d("hips", "neck")); point(B.neck, B.head, d("neck", "top"));
    point(B.armL[0], B.armL[1], d("shL", "elL")); point(B.armL[1], B.armL[2], d("elL", "haL"));
    point(B.armR[0], B.armR[1], d("shR", "elR")); point(B.armR[1], B.armR[2], d("elR", "haR"));
    point(B.legL[0], B.legL[1], d("thL", "knL")); point(B.legL[1], B.legL[2], d("knL", "anL")); point(B.legL[2], B.legL[3], d("anL", "toL"));
    point(B.legR[0], B.legR[1], d("thR", "knR")); point(B.legR[1], B.legR[2], d("knR", "anR")); point(B.legR[2], B.legR[3], d("anR", "toR"));
  }
}
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function basis(hips, neck, l, r, m) {
  _y.copy(neck).sub(hips).normalize(); _x.copy(r).sub(l); _x.addScaledVector(_y, -_x.dot(_y)).normalize(); _z.crossVectors(_x, _y);
  return m.makeBasis(_x, _y, _z);
}
