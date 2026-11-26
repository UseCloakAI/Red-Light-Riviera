/* What the people inside do. Each room gives a list of places to be (acts, from the furniture: a seat, a
   shelf to look at, the till, a pool table) and a walkable grid (the furniture's footprint, inflated by a
   body's width). Customers get a routine for the kind of place:

   - shoppers browse a few shelves, queue at the till, pay (the clerk nods, says the total), walk out the
     door, and a while later someone walks back in
   - sitters take a seat (a booth, a stool, a sofa, the bed, a cinema seat) and do what people do there:
     eat, drink, watch the screen and laugh at it, wait on the washing, talk
   - the bar has someone round the pool table; the diner's waitress does her rounds
   - at home, whoever lives there is on the sofa with the TV on

   Sitting is a pose laid over the idle clip: thighs forward, shins down, hips on the seat, hands in the
   lap. Anything violent and they all stop and watch you. */
import * as THREE from "three";

const CELL = 0.25, BODY = 0.3;
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _pi = new THREE.Quaternion(), _a = new THREE.Vector3(), _v = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* ---------------- the floor plan ---------------- */
export class Nav {
  // boxes: [x0, x1, z0, z1] in room metres, things you can't walk through
  constructor(w, d, boxes) {
    this.w = w; this.d = d; this.nx = Math.ceil(w / CELL); this.nz = Math.ceil(d / CELL);
    const g = this.g = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
      if (x < BODY || z < BODY * 0.6 || x > w - BODY || z > d - BODY) g[j * this.nx + i] = 1;
    }
    for (const [x0, x1, z0, z1] of boxes) {
      const i0 = Math.max(0, Math.floor((x0 - BODY) / CELL)), i1 = Math.min(this.nx - 1, Math.floor((x1 + BODY) / CELL));
      const j0 = Math.max(0, Math.floor((z0 - BODY) / CELL)), j1 = Math.min(this.nz - 1, Math.floor((z1 + BODY) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * this.nx + i] = 1;
    }
  }
  cell(x, z) { return [Math.max(0, Math.min(this.nx - 1, Math.floor(x / CELL))), Math.max(0, Math.min(this.nz - 1, Math.floor(z / CELL)))]; }
  free(i, j) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && !this.g[j * this.nx + i]; }
  // the nearest free cell to a point (a seat's in the furniture; you walk to the floor in front of it)
  near(x, z) {
    let [ci, cj] = this.cell(x, z); if (this.free(ci, cj)) return [ci, cj];
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && this.free(ci + di, cj + dj)) return [ci + di, cj + dj];
    return null;
  }
  // A*, 8 ways, then pulled tight (straight runs wherever the line is clear)
  path(x0, z0, x1, z1) {
    const a = this.near(x0, z0), b = this.near(x1, z1); if (!a || !b) return null;
    const N = this.nx * this.nz, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const start = a[1] * this.nx + a[0], goal = b[1] * this.nx + b[0], open = [start]; gs[start] = 0;
    const h = (k) => { const dx = Math.abs(k % this.nx - b[0]), dz = Math.abs(((k / this.nx) | 0) - b[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const f = new Float32Array(N).fill(Infinity); f[start] = h(start);
    let guard = 0;
    while (open.length && guard++ < 20000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) break; if (closed[cur]) continue; closed[cur] = 1;
      const ci = cur % this.nx, cj = (cur / this.nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue;   // no cutting corners
        const nk = nj * this.nx + ni, ng = gs[cur] + (di && dj ? 1.414 : 1);
        if (ng < gs[nk]) { gs[nk] = ng; from[nk] = cur; f[nk] = ng + h(nk); open.push(nk); }
      }
    }
    if (from[goal] < 0 && goal !== start) return null;
    const cells = []; for (let k = goal; k >= 0; k = from[k]) { cells.push(k); if (k === start) break; } cells.reverse();
    const pts = cells.map((k) => [(k % this.nx + 0.5) * CELL, (((k / this.nx) | 0) + 0.5) * CELL]);
    const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !this.clear(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
    out.push([x1, z1]); return out;
  }
  clear(p, q) { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (CELL * 0.5)); for (let k = 1; k < n; k++) { const [i, j] = this.cell(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n); if (!this.free(i, j)) return false; } return true; }
}

/* ---------------- posing over the clips ---------------- */
function bones(pd) { if (!pd.rB) pd.rB = Object.fromEntries(pd.h.bones.map((b) => [b.name, b])); return pd.rB; }
// turn a bone by ang about an axis in the person's own frame (x right, y up, z forward)
function turn(pd, name, ax, ang) {
  const b = bones(pd)[name]; if (!b || !ang) return;
  _a.copy(ax).applyQuaternion(pd.h.group.quaternion).normalize();
  b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_p); _pi.copy(_p).invert(); _q.setFromAxisAngle(_a, ang);
  b.quaternion.premultiply(_p).premultiply(_q).premultiply(_pi); b.updateMatrixWorld(true);
}
export function hipHeight(pd) {
  if (pd.hipH) return pd.hipH;
  const g = pd.h.group, r = bones(pd).root; g.updateMatrixWorld(true); r.getWorldPosition(_v);
  return (pd.hipH = Math.max(0.6, _v.y - g.position.y));
}
// seated: k 0..1 (standing up / sitting down blends through it)
export function sitPose(pd, k, hands) {
  if (k <= 0) return;
  for (const s of ["L", "R"]) { turn(pd, "upperleg01_" + s, X, -1.5 * k); turn(pd, "lowerleg01_" + s, X, 1.45 * k); turn(pd, "foot_" + s, X, -0.1 * k); }
  turn(pd, "spine03", X, 0.08 * k);
  if (hands !== false) for (const s of ["L", "R"]) { turn(pd, "upperarm01_" + s, X, -0.35 * k); turn(pd, "lowerarm01_" + s, X, -0.85 * k); }
}
// a hand to the mouth (eating, drinking), lifted u 0..1
function handUp(pd, u) { if (u <= 0) return; turn(pd, "upperarm01_R", X, -0.55 * u); turn(pd, "upperarm01_R", Z, -0.2 * u); turn(pd, "lowerarm01_R", X, -1.55 * u); }
// reaching to a shelf, u 0..1, high or low
function reach(pd, u, hi) { if (u <= 0) return; turn(pd, "upperarm01_R", X, -(hi ? 1.5 : 0.9) * u); turn(pd, "lowerarm01_R", X, -0.4 * u); turn(pd, "spine03", X, (hi ? -0.05 : 0.18) * u); }

/* ---------------- the people ---------------- */
const PAY = {
  store: ["That's four fifty.", "Six even.", "Need a bag?", "Two eighty. Have a good one."], pharmacy: ["Pickup's ready. Eleven twenty.", "Sign here."], hardware: ["Nine forty.", "Want the receipt?"],
  pawn: ["Final offer.", "I'll write you a ticket."], surf: ["Twenty two fifty, wax is free.", "Enjoy the swell."], checks: ["Fee's three percent.", "Next."]
};
const WAIT = { diner: ["More coffee, hon?", "Pie's fresh. Ish.", "You need a minute?"], cafe: ["Refill?", "Anything else?"], bar: ["Another one?", "Tab's open."] };

export class Routines {
  /* o: { room: {w, d, door:[x,z]}, nav, acts, kind, R, ox, oz, say(text, pd), people: [{pd, role, act}] } */
  constructor(o) {
    Object.assign(this, o); this.busy = new Set(); this.alarm = false; this.till = null;
    for (const p of this.people) this.start(p);
  }
  pos(pd) { const g = pd.h.group.position; return [g.x - this.ox, g.z - this.oz]; }
  at(act) { return [act.x + (act.ox || 0), act.z + (act.oz || 0)]; }
  free(type) { const L = this.acts.filter((a) => a.type === type && !this.busy.has(a)); return L.length ? L[(this.R() * L.length) | 0] : null; }
  start(p) {
    const pd = p.pd; pd.sitK = 0; pd.mode = "idle"; pd.wait = 0; pd.path = null; pd.gest = null; pd.gT = 0;
    if (p.act) { this.take(p, p.act, true); return; }
    this.next(p, true);
  }
  // seat or spot now (teleport: the room starts mid-scene) or by walking there
  take(p, act, now) {
    if (p.act && p.act !== act) this.busy.delete(p.act);
    p.act = act; this.busy.add(act); const pd = p.pd, [x, z] = this.at(act);
    if (now) { pd.h.group.position.set(this.ox + x, 0, this.oz + z); pd.h.group.rotation.y = act.face ?? 0; this.arrive(p); }
    else this.walk(p, x, z, () => this.arrive(p));
  }
  walk(p, x, z, then) {
    const [sx, sz] = this.pos(p.pd), path = this.nav.path(sx, sz, x, z);
    if (!path) { p.pd.h.group.position.set(this.ox + x, 0, this.oz + z); then(); return; }
    p.pd.path = path; p.pd.pi = 1; p.pd.mode = "walk"; p.pd.then = then;
  }
  arrive(p) {
    const pd = p.pd, a = p.act; pd.mode = a.type === "sit" ? "sit" : "stand"; pd.wait = 4 + this.R() * 6;
    if (a.type === "sit") pd.wait = 25 + this.R() * 60;
  }
  // what a person does after this
  next(p, now) {
    const pd = p.pd, R = this.R;
    if (p.role === "shopper") {
      p.n = (p.n || 0) + 1;
      if (p.n > 2 + ((R() * 3) | 0) && this.acts.some((a) => a.type === "pay")) { const pay = this.acts.find((a) => a.type === "pay"); if (!this.busy.has(pay)) { p.n = 0; this.take(p, pay, now); pd.paying = true; return; } }
      const a = this.free("shelf") || this.free("stand"); if (a) { this.take(p, a, now); return; }
    }
    if (p.role === "sitter") { const a = this.free("sit"); if (a) { this.take(p, a, now); return; } }
    if (p.role === "pool") { const a = this.free("pool"); if (a) { this.take(p, a, now); return; } }
    if (p.role === "waiter") { p.pd.mode = "stand"; p.pd.wait = 8 + R() * 10; return; }
    // nothing free: stand where you are a while
    pd.mode = "stand"; pd.wait = 3 + R() * 4;
  }
  leave(p) {
    if (p.act) this.busy.delete(p.act); p.act = null;
    const [dx, dz] = this.room.door; this.walk(p, dx, dz + 0.4, () => { p.pd.h.group.visible = false; p.pd.mode = "away"; p.pd.wait = 8 + this.R() * 14; });
  }
  tick(dt, player, alarm) {
    this.alarm = this.alarm || alarm;
    for (const p of this.people) {
      const pd = p.pd; if (pd.dead || !pd.h) continue;
      const g = pd.h.group;
      if (this.alarm) { this.idle(pd, dt, player, true); continue; }
      if (pd.mode === "away") { pd.wait -= dt; if (pd.wait <= 0) { const [dx, dz] = this.room.door; g.position.set(this.ox + dx, 0, this.oz + dz + 0.2); g.rotation.y = 0; g.visible = true; pd.mode = "idle"; this.next(p); } continue; }
      if (pd.mode === "walk") { this.step(p, dt, player); continue; }
      pd.wait -= dt;
      const act = p.act;
      if (pd.mode === "sit") this.sitting(p, dt, player);
      else this.standing(p, dt, player);
      if (pd.wait <= 0) {
        if (pd.paying) { pd.paying = false; this.leave(p); continue; }
        if (p.role === "waiter") { this.rounds(p); continue; }
        if (p.role === "sitter" && this.R() < 0.25 && this.room.leaves) { pd.mode = "rise"; this.leave(p); continue; }
        if (pd.mode === "sit") { pd.wait = 20 + this.R() * 40; continue; }
        this.next(p);
      }
      if (act && act.type === "pay" && pd.mode === "stand" && !pd.paid && pd.wait < 3) this.payUp(p);
    }
  }
  payUp(p) {
    p.pd.paid = true; const w = this.worker; if (!w || w.dead) return;
    this.gesture(w, "agree", 1.4); this.gesture(p.pd, "agree", 1.2);
    const L = PAY[this.kind] || PAY.store; if (this.say && this.near(w, 9)) this.say(L[(this.R() * L.length) | 0], w);
    setTimeout(() => { p.pd.paid = false; }, 8000);
  }
  rounds(p) {   // the waitress: out to someone seated, a word, back behind the counter
    const pd = p.pd, seated = this.people.filter((q) => q !== p && q.pd.mode === "sit" && !q.pd.dead);
    if (!seated.length || !this.home) { pd.wait = 10; return; }
    const q = seated[(this.R() * seated.length) | 0], [qx, qz] = this.pos(q.pd), [hx, hz] = this.home;
    const back = () => this.walk(p, hx, hz, () => { pd.mode = "stand"; pd.wait = 12 + this.R() * 15; pd.h.group.rotation.y = this.homeFace || 0; });
    this.walk(p, qx, qz + (qz > this.room.d / 2 ? -0.8 : 0.8), () => { pd.mode = "stand"; pd.wait = 3; this.gesture(pd, "agree", 1); const L = WAIT[this.kind]; if (L && this.say && this.near(pd, 7)) this.say(L[(this.R() * L.length) | 0], pd); pd.then = back; setTimeout(() => back(), 3000); });
  }
  near(pd, r) { const g = pd.h.group.position, P = this.playerPos; return P && Math.hypot(P.x - g.x, P.z - g.z) < r; }
  gesture(pd, clip, sec) { if (pd.act && pd.act[clip]) { pd.gest = clip; pd.gT = sec; pd.act[clip].time = 0; } }
  // walking a path, turning into it
  step(p, dt, player) {
    const pd = p.pd, g = pd.h.group, path = pd.path, tgt = path[pd.pi], tx = this.ox + tgt[0], tz = this.oz + tgt[1];
    const dx = tx - g.position.x, dz = tz - g.position.z, dist = Math.hypot(dx, dz), sp = 1.15;
    pd.sitK = Math.max(0, pd.sitK - dt * 2.5);
    // someone in the way (you): wait
    const blocked = Math.hypot(player.x - g.position.x, player.z - g.position.z) < 0.7 && (player.x - g.position.x) * dx + (player.z - g.position.z) * dz > 0;
    if (!blocked) {
      if (dist < 0.12) { pd.pi++; if (pd.pi >= path.length) { pd.path = null; pd.mode = "idle"; const t = pd.then; pd.then = null; if (p.act) { g.rotation.y = p.act.face ?? g.rotation.y; } if (t) t(); return this.anim(pd, dt, 0, 1); } }
      else { const k = Math.min(dist, sp * dt) / dist; g.position.x += dx * k; g.position.z += dz * k; g.rotation.y += wrap(Math.atan2(dx, dz) - g.rotation.y) * Math.min(1, dt * 8); }
    }
    this.anim(pd, dt, blocked ? 0 : 1, 0);
  }
  standing(p, dt, player) {
    const pd = p.pd, g = pd.h.group, a = p.act;
    pd.sitK = Math.max(0, pd.sitK - dt * 2.5); g.position.y = 0;
    let want = a ? a.face ?? g.rotation.y : g.rotation.y;
    if (p.role === "waiter" || (this.near(pd, 2.2) && !a)) want = Math.atan2(player.x - g.position.x, player.z - g.position.z);
    g.rotation.y += wrap(want - g.rotation.y) * Math.min(1, dt * 3);
    this.anim(pd, dt, 0, 1);
    if (a && (a.type === "shelf" || a.type === "stand")) { const u = Math.max(0, Math.sin((pd.wait * 0.9) % 6.28)) ** 2; reach(pd, u * 0.8, a.hi); }
  }
  sitting(p, dt, player) {
    const pd = p.pd, g = pd.h.group, a = p.act;
    pd.sitK = Math.min(1, pd.sitK + dt * 2);
    g.rotation.y += wrap((a.face ?? 0) - g.rotation.y) * Math.min(1, dt * 4);
    this.anim(pd, dt, 0, 1);
    sitPose(pd, pd.sitK, a.does !== "eat" && a.does !== "drink");
    // hips onto the seat, a little back from its middle
    const drop = (a.seat ?? 0.45) + 0.08 - hipHeight(pd), fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y), [sx, sz] = this.at(a);
    g.position.set(this.ox + sx - fx * 0.12 * pd.sitK, drop * pd.sitK, this.oz + sz - fz * 0.12 * pd.sitK);
    // what you do in a seat
    const t = performance.now() / 1000 + (pd.voice ? pd.voice.pitch * 37 : 0);
    if (a.does === "eat" || a.does === "drink") { for (const s of ["L"]) { turn(pd, "upperarm01_" + s, X, -0.45); turn(pd, "lowerarm01_" + s, X, -1.0); } turn(pd, "upperarm01_R", X, -0.45); turn(pd, "lowerarm01_R", X, -1.0); const c = (t % (a.does === "eat" ? 5 : 9)) / (a.does === "eat" ? 5 : 9); handUp(pd, c < 0.25 ? Math.sin(c / 0.25 * Math.PI) : 0); turn(pd, "head", X, a.does === "eat" ? 0.15 : 0); }
    if (a.does === "watch") { const c = t % 23; if (c < 1.2) turn(pd, "spine03", X, Math.sin(c * 15) * 0.05 * (1.2 - c)); }   // something funny on
    if (a.does === "wait") turn(pd, "head", X, 0.35);   // looking at nothing in their lap
  }
  // the clips: walk / idle weights, plus a nod or a shake now and then
  anim(pd, dt, walk, idle) {
    pd.wW = (pd.wW ?? 0) + (walk - (pd.wW ?? 0)) * Math.min(1, dt * 6);
    pd.act.walk.setEffectiveWeight(pd.wW); pd.act.walk.timeScale = 0.9; pd.act.idle.setEffectiveWeight(1 - pd.wW); pd.act.run.setEffectiveWeight(0);
    for (const c of ["agree", "headShake"]) if (pd.act[c]) pd.act[c].setEffectiveWeight(pd.gest === c && pd.gT > 0 ? Math.min(1, pd.gT * 2) * 0.8 : 0);
    if (pd.gT > 0) { pd.gT -= dt; if (pd.gT <= 0) pd.gest = null; }
    pd.mixer.update(dt);
  }
  // trouble: everyone stands, turns and watches you
  idle(pd, dt, player, look) {
    const g = pd.h.group; pd.sitK = Math.max(0, pd.sitK - dt * 3); pd.mode = pd.mode === "away" ? "away" : "stand";
    if (pd.mode === "away") return;
    g.position.y *= 1 - Math.min(1, dt * 6);
    if (look) g.rotation.y += wrap(Math.atan2(player.x - g.position.x, player.z - g.position.z) - g.rotation.y) * Math.min(1, dt * 4);
    this.anim(pd, dt, 0, 1); sitPose(pd, pd.sitK);
  }
}
