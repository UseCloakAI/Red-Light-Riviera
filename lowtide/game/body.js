/* Posing a person on top of their clips, for things the clips don't do: sitting down on a real seat and getting up
   again, reaching for things with a hand that lands where it should, leaning, looking.

   The rules that keep it clean:
   - the mixer writes the bones it animates every frame; everything here is applied after it, as a change from that
   - the bones the clips never touch are put back to their rest pose first, every frame, so nothing piles up
   - arms and legs are two-bone solves: the hand or the ankle goes to a target, the elbow or knee is pointed by a pole

   Sitting is a trajectory, not a pose. The person stands with their feet where they'll stay (in front of the seat,
   facing out), and the hips travel back and down onto the seat while the torso leans forward to keep the weight over
   the feet, the head staying level; the knees come out of the leg solve (feet planted, soles flat); a small give as
   the cushion takes the weight; the hands settle on the thighs. Standing is its own move: lean first, push off the
   thighs, hips forward and up over the feet, straighten. Seated, they breathe and shift now and then. */
import * as THREE from "three";

const TRACKED = /^(root|spine0[234]|neck01|head|clavicle_[LR]|upperarm01_[LR]|lowerarm01_[LR]|wrist_[LR]|upperleg01_[LR]|lowerleg01_[LR]|foot_[LR]|toe1-1_[LR]|finger\d-\d_[LR])$/;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _pi = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
export const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const bell = (a, b, x) => Math.sin(Math.PI * ss(a, b, x));

// the timings of the two moves (seconds)
export const SIT_DOWN = 1.55, STAND_UP = 1.35;

export class Body {
  static of(group, bones) {
    if (!group) return null;
    if (!group.userData.body) { const list = bones || []; if (!bones) group.traverse((o) => { if (o.isBone) list.push(o); }); group.userData.body = new Body(group, list); }
    return group.userData.body;
  }
  constructor(group, bones) {
    this.g = group; this.B = {}; this.rest = [];
    for (const b of bones) { this.B[b.name] = b; if (!TRACKED.test(b.name)) this.rest.push([b, b.quaternion.clone()]); }
    this.ok = !!(this.B.root && this.B.upperleg01_L && this.B.upperarm01_R && this.B.head);   // a body these rules fit (not the fallback model)
  }
  // before anything else each frame, after the mixer
  reset() { for (const [b, q] of this.rest) b.quaternion.copy(q); this.g.updateMatrixWorld(true); }
  get yaw() { return this.g.rotation.y; }
  dirs() { const y = this.g.rotation.y; return { f: new THREE.Vector3(Math.sin(y), 0, Math.cos(y)), r: new THREE.Vector3(-Math.cos(y), 0, Math.sin(y)) }; }
  pos(name) { const b = this.B[name]; return b ? b.getWorldPosition(new THREE.Vector3()) : null; }
  // turn a bone by ang about an axis in the person's own frame (x right, y up, z forward)
  turn(name, ax, ang) {
    const b = this.B[name]; if (!b || !ang) return;
    _a.copy(ax).applyQuaternion(this.g.quaternion).normalize();
    b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_p); _pi.copy(_p).invert(); _q.setFromAxisAngle(_a, ang);
    b.quaternion.premultiply(_p).premultiply(_q).premultiply(_pi); b.updateMatrixWorld(true);
  }
  // point a bone so the line from it to its child runs along dir (world)
  aim(bone, child, dir) {
    bone.updateWorldMatrix(true, true); const a = bone.getWorldPosition(_a), c = child.getWorldPosition(_b);
    const cur = c.sub(a); if (cur.lengthSq() < 1e-8) return; cur.normalize();
    _q.setFromUnitVectors(cur, _c.copy(dir).normalize());
    bone.parent.getWorldQuaternion(_p); _pi.copy(_p).invert();
    bone.quaternion.premultiply(_p).premultiply(_q).premultiply(_pi); bone.updateMatrixWorld(true);
  }
  // two bones: the end to target, the middle joint toward pole; w blends from where the clip had it
  solve(top, mid, end, target, pole, w = 1) {
    if (w <= 0.001) return;
    const A = this.B[top], M = this.B[mid], E = this.B[end]; if (!A || !M || !E) return;
    this.g.updateMatrixWorld(true);
    const S = A.getWorldPosition(new THREE.Vector3()), K = M.getWorldPosition(new THREE.Vector3()), W = E.getWorldPosition(new THREE.Vector3());
    const a = S.distanceTo(K), b = K.distanceTo(W), T = W.clone().lerp(target, Math.min(1, w));
    const d = T.clone().sub(S), c = THREE.MathUtils.clamp(d.length(), Math.abs(a - b) + 0.01, a + b - 0.003); d.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pl = pole.clone().sub(d.clone().multiplyScalar(pole.dot(d))); if (pl.lengthSq() < 1e-6) pl.copy(this.dirs().f); pl.normalize();
    const Kd = S.clone().addScaledVector(d, a * cosA).addScaledVector(pl, a * sinA);
    this.aim(A, M, Kd.sub(S));
    const K2 = M.getWorldPosition(new THREE.Vector3()); this.aim(M, E, T.sub(K2));
  }
  arm(side, target, pole, w) { this.solve("upperarm01_" + side, "lowerarm01_" + side, "wrist_" + side, target, pole, w); }
  // an elbow pointed out to its side and a little back and down: how arms hang when hands rest on things
  armPole(side, down = 1) { const { f, r } = this.dirs(), s = side === "R" ? 1 : -1; return r.clone().multiplyScalar(s).addScaledVector(f, -0.35).add(new THREE.Vector3(0, -down, 0)); }
  // fingers closed round something (local X curls them into the palm)
  grip(side, k) { if (k <= 0) return; for (const n of [2, 3, 4, 5]) for (const j of [1, 2, 3]) { const b = this.B[`finger${n}-${j}_${side}`]; if (b) b.rotateX((j === 1 ? 0.7 : 0.9) * k); } for (const j of [2, 3]) { const t = this.B[`finger1-${j}_${side}`]; if (t) t.rotateX(0.35 * k); } }
  hand(side) { const w = this.B["wrist_" + side], m = this.B["metacarpal2_" + side] || w; const p = w.getWorldPosition(new THREE.Vector3()), q = m.getWorldPosition(new THREE.Vector3()); return p.lerp(q, 1.6); }
  mouth() { const { f } = this.dirs(); return this.pos("head").addScaledVector(f, 0.11).add(new THREE.Vector3(0, -0.035, 0)); }
  // lean the torso forward by ang (spread over the spine), the neck and head taking back some so the eyes stay level
  lean(ang, keepHead = 0.75) {
    if (!ang) return;
    this.turn("spine04", X, ang * 0.38); this.turn("spine03", X, ang * 0.34); this.turn("spine02", X, ang * 0.28);
    this.turn("neck01", X, -ang * keepHead * 0.55); this.turn("head", X, -ang * keepHead * 0.45);
  }

  /* sitting. s: { phase: "down" | "seated" | "up", t (seconds into the phase), seat (seat top height, m),
     back (how far behind the feet the hips land, m), hands (0..1 on the thighs), tSeated (for the breathing),
     recline (lean back once seated, rad) }. The person's group stands where the feet are, facing out. */
  sit(s) {
    if (!this.ok) return;
    const B = this.B, root = B.root, { f, r } = this.dirs();
    // where the clip has the feet (planted for the whole move) and how the soles lie
    this.g.updateMatrixWorld(true);
    const feet = { L: this.pos("foot_L"), R: this.pos("foot_R") }, soles = { L: B.foot_L.getWorldQuaternion(new THREE.Quaternion()), R: B.foot_R.getWorldQuaternion(new THREE.Quaternion()) };
    // the trajectory: how far back (kb), how far down (kd), the lean, the give, the hands
    let kb, kd, lean, give = 0, hands, rec = s.recline ?? -0.06;
    const t = s.t;
    if (s.phase === "down") {
      const u = t / SIT_DOWN;
      kb = ss(0.06, 0.86, u); kd = ss(0.12, 0.93, u) * 0.97 + 0.03 * ss(0.93, 1, u);
      lean = 0.52 * bell(0, 0.92, u) + rec * ss(0.78, 1, u);
      give = -0.022 * bell(0.84, 1, u);
      hands = ss(0.55, 1, u) * (s.hands ?? 1);
    } else if (s.phase === "up") {
      const v = t / STAND_UP;
      lean = rec * (1 - ss(0, 0.16, v)) + 0.56 * bell(0.04, 0.96, v);
      kd = 1 - ss(0.3, 0.92, v); kb = 1 - ss(0.24, 0.86, v);
      hands = (s.hands ?? 1) * (1 - ss(0.46, 0.8, v));
    } else {   // seated: breathing, and a slow shift of the weight now and then
      const T = s.tSeated || 0; kb = 1; kd = 1; hands = s.hands ?? 1;
      lean = rec + 0.012 * Math.sin(T * 1.55) + 0.03 * Math.sin(T * 0.21) * Math.sin(T * 0.13);
      this.turn("spine04", Z, 0.025 * Math.sin(T * 0.17 + 1));
    }
    // hips: back from over the feet and down onto the seat (the root bone, in the person's own frame)
    const standY = root.position.y, hipY = Math.min(s.seat + 0.1, standY - 0.04);
    root.position.y += (hipY - standY) * kd + give;
    root.position.z -= (s.back ?? 0.47) * kb;
    this.g.updateMatrixWorld(true);
    this.lean(lean);
    // legs: ankles back to where they were, knees forward, soles flat
    for (const side of ["L", "R"]) {
      const s2 = side === "R" ? 1 : -1;
      this.solve("upperleg01_" + side, "lowerleg01_" + side, "foot_" + side, feet[side], f.clone().add(new THREE.Vector3(0, 0.25, 0)).addScaledVector(r, s2 * 0.12), 1);
      const ft = B["foot_" + side]; ft.parent.getWorldQuaternion(_p); _pi.copy(_p).invert(); ft.quaternion.copy(_pi.multiply(soles[side])); ft.updateMatrixWorld(true);
    }
    // hands on the thighs, a little in from the outside, the elbows easy
    if (hands > 0.001) for (const side of ["L", "R"]) {
      const hip = this.pos("upperleg01_" + side), knee = this.pos("lowerleg01_" + side), s2 = side === "R" ? 1 : -1;
      const on = hip.lerp(knee, 0.62).add(new THREE.Vector3(0, 0.075, 0)).addScaledVector(r, s2 * 0.02);
      this.arm(side, on, this.armPole(side, 0.6), hands);
    }
  }
}
