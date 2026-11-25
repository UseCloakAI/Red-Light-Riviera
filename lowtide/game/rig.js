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
   hip/knee/ankle/toe) held by sticks, falling under gravity with ground and wall
   collision; each frame the bones are turned to follow them. */
const PTS = ["hips", "neck", "top", "shL", "elL", "haL", "shR", "elR", "haR", "thL", "knL", "anL", "toL", "thR", "knR", "anR", "toR"];
const I = Object.fromEntries(PTS.map((n, i) => [n, i]));
const STICKS = [["hips", "neck"], ["neck", "top"], ["neck", "shL"], ["neck", "shR"], ["shL", "shR"], ["hips", "shL"], ["hips", "shR"],
  ["shL", "elL"], ["elL", "haL"], ["shR", "elR"], ["elR", "haR"],
  ["hips", "thL"], ["hips", "thR"], ["thL", "thR"], ["thL", "neck"], ["thR", "neck"], ["thL", "shL"], ["thR", "shR"], ["shL", "top"], ["shR", "top"],
  ["thL", "knL"], ["knL", "anL"], ["anL", "toL"], ["knL", "toL"], ["thR", "knR"], ["knR", "anR"], ["anR", "toR"], ["knR", "toR"]];
// limbs may bend but not fold flat
const MINS = [["thL", "anL", 0.55], ["thR", "anR", 0.55], ["shL", "haL", 0.45], ["shR", "haR", 0.45], ["top", "hips", 0.9]];

export class Ragdoll {
  constructor(B, world, vel, hit) {
    this.B = B; this.w = world; this.t = 0; this.sleep = 0;
    const top = wpos(B.head).add(wpos(B.head, _a).sub(wpos(B.neck, _b)).multiplyScalar(1.6));
    const src = { hips: wpos(B.hips), neck: wpos(B.neck), top, shL: wpos(B.armL[0]), elL: wpos(B.armL[1]), haL: wpos(B.armL[2]),
      shR: wpos(B.armR[0]), elR: wpos(B.armR[1]), haR: wpos(B.armR[2]), thL: wpos(B.legL[0]), knL: wpos(B.legL[1]), anL: wpos(B.legL[2]), toL: wpos(B.legL[3]),
      thR: wpos(B.legR[0]), knR: wpos(B.legR[1]), anR: wpos(B.legR[2]), toR: wpos(B.legR[3]) };
    this.p = PTS.map((n) => src[n].clone());
    const h = 1 / 60;
    this.o = this.p.map((p) => p.clone().addScaledVector(vel || _a.set(0, 0, 0), -h));
    this.sticks = STICKS.map(([a, b]) => [I[a], I[b], this.p[I[a]].distanceTo(this.p[I[b]])]);
    this.mins = MINS.map(([a, b, k]) => [I[a], I[b], this.p[I[a]].distanceTo(this.p[I[b]]) * k]);
    if (hit) this.impulse(hit.point, hit.dir, hit.force || 4);
    // knees give out and the top goes over: the way they were hit, and a little to one side
    const dir = hit ? _b.copy(hit.dir).setY(0).normalize() : _b.set(0, 0, 1), side = (Math.random() - 0.5) * 1.6;
    const lat = _A.set(-dir.z, 0, dir.x).multiplyScalar(side);
    for (const n of ["neck", "top", "shL", "shR"]) this.kick(I[n], _a.copy(dir).multiplyScalar(1.4).add(lat));
    for (const n of ["knL", "knR"]) this.kick(I[n], _a.copy(dir).multiplyScalar(-0.5).setY(-0.5));
    this.acc = 0;
  }
  kick(i, v) { this.o[i].addScaledVector(v, -1 / 60); }
  // a hit at point along dir: the nearest points take most of it
  impulse(point, dir, force) {
    this.p.forEach((p, i) => { const d = p.distanceTo(point), k = Math.max(0, 1 - d / 0.7); if (k > 0) this.kick(i, _b.copy(dir).multiplyScalar(force * k)); });
  }
  step(dt) {
    this.t += dt; if (this.sleep > 1.5) return false;
    this.acc = Math.min(this.acc + dt, 0.1);
    const h = 1 / 60;
    let moved = 0;
    while (this.acc >= h) {
      this.acc -= h;
      for (let i = 0; i < this.p.length; i++) {
        const p = this.p[i], o = this.o[i], vx = (p.x - o.x) * 0.995, vy = (p.y - o.y) * 0.995, vz = (p.z - o.z) * 0.995;
        o.copy(p); p.x += vx; p.y += vy - 9.8 * h * h; p.z += vz;
        moved += vx * vx + vy * vy + vz * vz;
      }
      for (let it = 0; it < 6; it++) {
        for (const [a, b, L] of this.sticks) this.fix(a, b, L, 0);
        for (const [a, b, L] of this.mins) this.fix(a, b, L, 1);
        for (let i = 0; i < this.p.length; i++) this.collide(i);
      }
      // ground friction, once per step: things on the ground slide a little, then stop
      for (let i = 0; i < this.p.length; i++) {
        const p = this.p[i], o = this.o[i];
        if (p.y <= this.w.heightAt(p.x, p.z) + 0.075) { p.x += (o.x - p.x) * 0.12; p.z += (o.z - p.z) * 0.12; }
      }
    }
    this.sleep = moved < 1e-6 ? this.sleep + dt : 0;
    return true;
  }
  fix(a, b, L, minOnly) {
    const A = this.p[a], B = this.p[b], dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    if (minOnly && d >= L) return;
    const k = (d - L) / d * 0.5;
    A.x += dx * k; A.y += dy * k; A.z += dz * k; B.x -= dx * k; B.y -= dy * k; B.z -= dz * k;
  }
  collide(i) {
    const p = this.p[i], o = this.o[i], r = i === I.top ? 0.1 : 0.06, g = this.w.heightAt(p.x, p.z) + r;
    if (p.y < g) p.y = g;
    _a.copy(p); this.w.grid.resolve(_a, r, p.y, 0.1); p.x = _a.x; p.z = _a.z;
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
