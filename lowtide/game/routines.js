/* What the people inside do. Each room gives a list of places to be (acts, from the furniture: a seat, a
   shelf to look at, the till, a pool table) and a walkable grid (the furniture's footprint, inflated by a
   body's width). Customers get a routine for the kind of place:

   - shoppers browse a few shelves, queue at the till, pay (the clerk nods, says the total), walk out the
     door, and a while later someone walks back in
   - sitters take a seat (a booth, a stool, a sofa, the bed, a cinema seat) and do what people do there:
     eat, drink, watch the screen and laugh at it, wait on the washing, talk
   - the bar has someone round the pool table; the diner's waitress does her rounds
   - at home, whoever lives there is on the sofa with the TV on

   Sitting is a real move (body.js): walk up to the seat, turn, sit down with the weight going back over planted
   feet, settle, breathe; stand up leaning into it. Anything violent and they all get up and watch you. */
import * as THREE from "three";
import { Body, ss, SIT_DOWN, STAND_UP } from "./body.js?v=dev";

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

/* ---------------- the people ---------------- */
const PAY = {
  store: ["That's four fifty.", "Six even.", "Need a bag?", "Two eighty. Have a good one."], pharmacy: ["Pickup's ready. Eleven twenty.", "Sign here."], hardware: ["Nine forty.", "Want the receipt?"],
  pawn: ["Final offer.", "I'll write you a ticket."], surf: ["Twenty two fifty, wax is free.", "Enjoy the swell."], checks: ["Fee's three percent.", "Next."]
};
const WAIT = { diner: ["More coffee, hon?", "Pie's fresh. Ish.", "You need a minute?"], cafe: ["Refill?", "Anything else?"], bar: ["Another one?", "Tab's open."] };

export class Routines {
  /* o: { room: {w, d, door:[x,z]}, nav, acts, kind, R, ox, oz, say(text, pd), people: [{pd, role, act}] } */
  constructor(o) {
    Object.assign(this, o); this.busy = new Set(); this.alarm = false;
    for (const p of this.people) this.start(p);
  }
  pos(pd) { const g = pd.h.group.position; return [g.x - this.ox, g.z - this.oz]; }
  at(act) { return [act.x + (act.ox || 0), act.z + (act.oz || 0)]; }
  // where you stand to sit on a seat: in front of it, by about a thigh (a stool: just off it)
  stand(act) { const k = act.seat > 0.7 ? 0.2 : 0.47, [x, z] = this.at(act); return [x + Math.sin(act.face || 0) * k, z + Math.cos(act.face || 0) * k, k]; }
  free(type) { const L = this.acts.filter((a) => a.type === type && !this.busy.has(a)); return L.length ? L[(this.R() * L.length) | 0] : null; }
  body(pd) { return pd.body || (pd.body = Body.of(pd.h.group, pd.h.bones)); }
  start(p) {
    const pd = p.pd; pd.mode = "idle"; pd.wait = 0; pd.path = null; pd.gest = null; pd.gT = 0; pd.st = 0; pd.tSeat = Math.random() * 20;
    pd.h.group.position.y = 0;
    if (p.act) { this.take(p, p.act, true); return; }
    this.next(p, true);
  }
  // a seat or a spot: now (the room starts mid-scene) or by walking there, turning, and (for a seat) sitting down
  take(p, act, now) {
    if (p.act && p.act !== act) this.busy.delete(p.act);
    p.act = act; this.busy.add(act); const pd = p.pd, g = pd.h.group;
    const [x, z] = act.type === "sit" ? this.stand(act) : this.at(act);
    const settle = () => { if (act.type === "sit") { pd.mode = "sitdown"; pd.st = 0; } else this.arrive(p); };
    if (now) { g.position.set(this.ox + x, 0, this.oz + z); g.rotation.y = act.face ?? 0; if (act.type === "sit") { pd.mode = "sit"; pd.st = 0; pd.wait = 25 + this.R() * 60; } else this.arrive(p); }
    else if (act.type === "sit") {
      // a seat: come at it from the front (the floor in front can be a narrow gap, between a sofa and its table),
      // so the last step in is square on and nobody cuts through the furniture
      const f = act.face || 0, out = this.approach(x, z, f);
      this.walk(p, out[0], out[1], () => this.turnTo(p, f, settle), [x, z]);
    }
    else this.walk(p, x, z, () => this.turnTo(p, act.face ?? g.rotation.y, settle));
  }
  // the furthest point straight out in front of a seat (up to a metre) that's still clear of everything
  approach(x, z, f) {
    let best = [x, z];
    for (let k = 0.15; k <= 1.0; k += 0.05) { const px = x + Math.sin(f) * k, pz = z + Math.cos(f) * k, [i, j] = this.nav.cell(px, pz); if (this.nav.free(i, j)) { best = [px, pz]; if (k > 0.45) break; } else if (best[0] !== x || best[1] !== z) break; }
    if (best[0] !== x || best[1] !== z) return best;
    // nothing clear straight out (a table close in front): along the front of the seat to where it is clear
    const lx = Math.cos(f), lz = -Math.sin(f);
    for (let d = 0.25; d <= 3.5; d += 0.25) for (const s of [1, -1]) { const px = x + lx * d * s, pz = z + lz * d * s, [i, j] = this.nav.cell(px, pz); if (this.nav.free(i, j)) return [px, pz]; }
    return best;
  }
  walk(p, x, z, then, last) {
    const [sx, sz] = this.pos(p.pd); let path = this.nav.path(sx, sz, x, z);
    // no way through: walk straight there rather than appear there
    if (!path) path = [[sx, sz], [x, z]];
    if (last) path.push(last);
    p.pd.path = path; p.pd.pi = 1; p.pd.mode = "walk"; p.pd.then = then;
  }
  turnTo(p, yaw, then) { p.pd.mode = "turn"; p.pd.turnTo = yaw; p.pd.then = then; }
  arrive(p) { const pd = p.pd, a = p.act; pd.mode = a && a.type === "sit" ? "sit" : "stand"; pd.wait = a && a.type === "sit" ? 25 + this.R() * 60 : 4 + this.R() * 6; }
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
    if (p.role === "waiter") { pd.mode = "stand"; pd.wait = 8 + R() * 10; return; }
    pd.mode = "stand"; pd.wait = 3 + R() * 4;
  }
  leave(p) {
    const go = () => { if (p.act) this.busy.delete(p.act); p.act = null; const [dx, dz] = this.room.door; this.walk(p, dx, dz + 0.4, () => { p.pd.h.group.visible = false; p.pd.mode = "away"; p.pd.wait = 8 + this.R() * 14; }); };
    if (p.pd.mode === "sit" || p.pd.mode === "sitdown") this.standUp(p, go); else go();
  }
  standUp(p, then) { const pd = p.pd; pd.mode = "standup"; pd.st = 0; pd.then = then; }
  tick(dt, player, alarm) {
    if (alarm && !this.alarm) { this.alarm = true; for (const p of this.people) if (!p.pd.dead && (p.pd.mode === "sit" || p.pd.mode === "sitdown")) this.standUp(p, () => { p.pd.mode = "watch"; }); }
    for (const p of this.people) {
      const pd = p.pd; if (pd.dead || !pd.h) continue;
      const g = pd.h.group;
      if (pd.mode === "away") { if (this.alarm) continue; pd.wait -= dt; if (pd.wait <= 0) { const [dx, dz] = this.room.door; g.position.set(this.ox + dx, 0, this.oz + dz + 0.2); g.rotation.y = 0; g.visible = true; pd.mode = "idle"; this.next(p); } continue; }
      if (pd.mode === "walk") { if (this.alarm) { pd.mode = "watch"; } else { this.step(p, dt, player); continue; } }
      if (pd.mode === "turn") { this.anim(pd, dt, 0); const d = wrap(pd.turnTo - g.rotation.y); g.rotation.y += Math.sign(d) * Math.min(Math.abs(d), dt * (1.2 + Math.abs(d) * 3)); if (Math.abs(d) < 0.02) { g.rotation.y = pd.turnTo; const t = pd.then; pd.then = null; t && t(); } continue; }
      if (pd.mode === "sitdown" || pd.mode === "sit" || pd.mode === "standup") { this.sitting(p, dt, player); continue; }
      if (this.alarm || pd.mode === "watch") { this.watch(pd, dt, player); continue; }
      pd.wait -= dt;
      this.standing(p, dt, player);
      if (pd.wait <= 0) {
        if (pd.paying) { pd.paying = false; this.leave(p); continue; }
        if (p.role === "waiter") { this.rounds(p); continue; }
        this.next(p);
      }
      if (p.act && p.act.type === "pay" && pd.mode === "stand" && !pd.paid && pd.wait < 3) this.payUp(p);
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
    const back = () => this.walk(p, hx, hz, () => this.turnTo(p, this.homeFace || 0, () => { pd.mode = "stand"; pd.wait = 12 + this.R() * 15; }));
    const fy = q.pd.h.group.rotation.y;
    this.walk(p, qx + Math.sin(fy) * 0.75, qz + Math.cos(fy) * 0.75, () => this.turnTo(p, fy + Math.PI, () => { pd.mode = "chat"; pd.wait = 99; this.gesture(pd, "agree", 1); const L = WAIT[this.kind]; if (L && this.say && this.near(pd, 7)) this.say(L[(this.R() * L.length) | 0], pd); setTimeout(back, 3200); }));
  }
  near(pd, r) { const g = pd.h.group.position, P = this.playerPos; return P && Math.hypot(P.x - g.x, P.z - g.z) < r; }
  gesture(pd, clip, sec) { if (pd.act && pd.act[clip]) { pd.gest = clip; pd.gT = sec; pd.act[clip].time = 0; } }
  // walking a path, turning into it
  step(p, dt, player) {
    const pd = p.pd, g = pd.h.group, path = pd.path, tgt = path[pd.pi], tx = this.ox + tgt[0], tz = this.oz + tgt[1];
    const dx = tx - g.position.x, dz = tz - g.position.z, dist = Math.hypot(dx, dz), sp = 1.15;
    const blocked = Math.hypot(player.x - g.position.x, player.z - g.position.z) < 0.7 && (player.x - g.position.x) * dx + (player.z - g.position.z) * dz > 0;
    if (!blocked) {
      if (dist < 0.06) { pd.pi++; if (pd.pi >= path.length) { pd.path = null; pd.mode = "idle"; const t = pd.then; pd.then = null; if (t) t(); return this.anim(pd, dt, 0); } }
      else { const k = Math.min(dist, sp * dt) / dist; g.position.x += dx * k; g.position.z += dz * k; g.rotation.y += wrap(Math.atan2(dx, dz) - g.rotation.y) * Math.min(1, dt * 7); }
    }
    this.anim(pd, dt, blocked ? 0 : 1);
  }
  standing(p, dt, player) {
    const pd = p.pd, g = pd.h.group, a = p.act;
    let want = a ? a.face ?? g.rotation.y : g.rotation.y;
    if (p.role === "waiter" || (this.near(pd, 2.2) && !a)) want = Math.atan2(player.x - g.position.x, player.z - g.position.z);
    g.rotation.y += wrap(want - g.rotation.y) * Math.min(1, dt * 3);
    this.anim(pd, dt, 0);
    const B = this.body(pd); if (!B || !B.ok) return;
    B.reset();
    if (a && (a.type === "shelf" || a.type === "stand")) {   // looking along the shelf, reaching for something now and then
      const c = (pd.wait * 0.45) % 1, u = ss(0.0, 0.25, c) - ss(0.55, 0.85, c);
      if (u > 0.001) { const { f, r } = B.dirs(), hand = B.pos("upperarm01_R").addScaledVector(f, 0.55).addScaledVector(r, 0.08).add(new THREE.Vector3(0, a.hi ? 0.35 : -0.45, 0)); B.arm("R", hand, B.armPole("R", 1), u); B.grip("R", u * 0.5); B.lean(a.hi ? -0.04 * u : 0.25 * u, 0.4); }
    }
  }
  // seated, and the moves in and out of the seat
  sitting(p, dt, player) {
    const pd = p.pd, a = p.act, g = pd.h.group;
    this.anim(pd, dt, 0);
    const B = this.body(pd); if (!B || !B.ok || !a) { if (pd.mode !== "sit") { pd.mode = "stand"; } return; }
    pd.st += dt; pd.tSeat += dt;
    const back = this.stand(a)[2], phase = pd.mode === "sitdown" ? "down" : pd.mode === "standup" ? "up" : "seated";
    const busyHands = a.does === "eat" || a.does === "drink";
    B.reset();
    B.sit({ phase, t: pd.st, seat: a.seat ?? 0.45, back, hands: busyHands ? 0.35 : 1, tSeated: pd.tSeat, recline: a.does === "watch" ? -0.1 : -0.04 });
    // what you do in a seat: eat, drink, watch (and laugh now and then), wait
    if (phase === "seated") {
      if (busyHands) {   // the fork or the glass up to the mouth, back down to the table
        const per = a.does === "eat" ? 5.5 : 9, c = (pd.tSeat % per) / per, u = ss(0.0, 0.12, c) - ss(0.2, 0.34, c);
        const { f, r } = B.dirs(), rest = B.pos("upperleg01_R").lerp(B.pos("lowerleg01_R"), 0.9).add(new THREE.Vector3(0, 0.32, 0)).addScaledVector(f, 0.08);
        B.arm("R", rest.lerp(B.mouth().addScaledVector(f, 0.06).addScaledVector(r, 0.04), u), B.armPole("R", 0.7), 1); B.grip("R", 0.7);
        if (a.does === "eat") B.lean(0.12 * (1 - u), 0.5);
      }
      if (a.does === "watch") { const c = pd.tSeat % 23; if (c < 1.4) B.turn("spine03", new THREE.Vector3(1, 0, 0), Math.sin(c * 14) * 0.035 * (1.4 - c)); }
      if (a.does === "wait") B.turn("head", new THREE.Vector3(1, 0, 0), 0.18 + 0.05 * Math.sin(pd.tSeat * 0.3));
      pd.wait -= dt;
      if (pd.wait <= 0) { if (p.role === "sitter" && this.R() < 0.25 && this.room.leaves && !this.alarm) this.leave(p); else pd.wait = 20 + this.R() * 40; }
    }
    if (pd.mode === "sitdown" && pd.st >= SIT_DOWN) { pd.mode = "sit"; pd.st = 0; if (!(pd.wait > 0)) pd.wait = 25 + this.R() * 60; }
    if (pd.mode === "standup" && pd.st >= STAND_UP) { pd.mode = "idle"; pd.st = 0; const t = pd.then; pd.then = null; if (t) t(); else this.next(p); }
  }
  // the clips: walk / idle weights, plus a nod or a shake now and then
  anim(pd, dt, walk) {
    pd.wW = (pd.wW ?? 0) + (walk - (pd.wW ?? 0)) * Math.min(1, dt * 6);
    pd.act.walk.setEffectiveWeight(pd.wW); pd.act.walk.timeScale = 0.9; pd.act.idle.setEffectiveWeight(1 - pd.wW); pd.act.run.setEffectiveWeight(0);
    for (const c of ["agree", "headShake"]) if (pd.act[c]) pd.act[c].setEffectiveWeight(pd.gest === c && pd.gT > 0 ? Math.min(1, pd.gT * 2) * 0.8 : 0);
    if (pd.gT > 0) { pd.gT -= dt; if (pd.gT <= 0) pd.gest = null; }
    pd.mixer.update(dt);
  }
  // trouble: standing, turned to face you
  watch(pd, dt, player) {
    const g = pd.h.group; g.position.y = 0;
    g.rotation.y += wrap(Math.atan2(player.x - g.position.x, player.z - g.position.z) - g.rotation.y) * Math.min(1, dt * 4);
    this.anim(pd, dt, 0); const B = this.body(pd); if (B && B.ok) B.reset();
  }
}
