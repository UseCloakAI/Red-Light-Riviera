/* Stage 2: the people of Marlowe Keys. Every pedestrian is a unique person from
   game/human.js (random heritage, age, build, face, hair, clothes) built on the
   ~1,600-vertex body proxy.

   They walk the pavements: each street has a lane down the middle of each
   pavement (world.lanes, from city/roads.js), curving with the road. At the end
   of a lane they turn the corner on a smooth curve onto the next street, or cross
   on the zebra and carry on from the other side, or loop round a dead end. They
   stop now and then and glance at the player as they pass. Some stand about
   instead: pairs in conversation (nodding, shaking their heads, taking turns) and
   people waiting by the buildings, who break up after a while and walk on.
   They flee or duck when something goes wrong nearby (alarm), choosing the way
   that takes them away from it; take hits and go down as ragdolls (bodies clear
   once out of sight); sidestep a player running at them, and stagger if barged.
   They are recycled out of sight as the player moves. Animation only runs near
   the camera, and the crowd shrinks if the machine is struggling. */
import * as THREE from "three";
import { loadHumanData, Human, randomPerson } from "./human.js?v=dev";
import { lanePoint, linkPath, laneEndPos } from "./world.js?v=dev";
import { AMBIENT, BUMP, PANIC } from "./lines.js?v=dev";
import { findBones, Ragdoll } from "./rig.js?v=dev";

const NEAR = 70, FAR = 150, SPAWN_MIN = 45, SPAWN_MAX = 120, CROSS_CHANCE = 0.35;
const PAIRS = 0.14, SOLO = 0.08;          // share of the crowd standing about, in pairs and alone
const GESTURES = ["agree", "headShake"];

// a walk: a polyline with its running lengths; from/to are lane ends (where it starts and arrives)
function cumul(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return c; }
function walk(pts, from, to, onLane) { if (pts.length < 2) pts = [pts[0], { x: pts[0].x + 0.01, z: pts[0].z }]; const cum = cumul(pts); return { pts, cum, L: cum[cum.length - 1], from, to, onLane }; }
function pointOn(w, s, out) {
  const { pts, cum } = w; s = Math.max(0, Math.min(w.L, s));
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, k = (s - cum[i - 1]) / seg;
  out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k; out.dx = (b.x - a.x) / seg; out.dz = (b.z - a.z) / seg;
  return out;
}
// a lane walked from one of its ends to the other (or from s toward an end)
function laneWalk(le, s0) {
  const l = le.lane, toEnd = l.ends[1 - le.end];
  let pts = l.pts.slice();
  if (s0 !== undefined) {   // part-way along: from s0 to the far end
    const p = lanePoint(l, s0); let i = 1; while (i < l.cum.length - 1 && l.cum[i] < s0) i++;
    pts = le.end === 0 ? [{ x: p.x, z: p.z }].concat(l.pts.slice(i)) : [{ x: p.x, z: p.z }].concat(l.pts.slice(0, i).reverse());
    return walk(pts, null, toEnd, l);
  }
  if (le.end === 1) pts.reverse();
  return walk(pts, le, toEnd, l);
}
export async function spawnPeds(scene, world, o = {}) {
  const D = await loadHumanData(), count = o.count || 18, R = Math.random;
  const lanes = world.lanes.filter((l) => l.L > 4);
  const peds = [], tmp = { x: 0, z: 0, dx: 0, dz: 0 };
  let limit = count, quiet = 6;            // seconds until anyone may speak again
  const say = (text) => { quiet = 9 + R() * 8; if (o.onSpeak) o.onSpeak(text); };
  const lineFor = (district) => { const a = AMBIENT.filter((l) => l.d === district || l.d === "any"); return a[(R() * a.length) | 0].t; };

  // somewhere on a pavement, at a fair distance from `near` (close is fine for the first crowd)
  function spot(pd, near) {
    for (let tries = 0; tries < 60; tries++) {
      const l = lanes[(R() * lanes.length) | 0], s = R() * l.L, p = lanePoint(l, s), d = Math.hypot(p.x - near.x, p.z - near.z);
      if (d >= (pd.first ? 6 : SPAWN_MIN) && d <= SPAWN_MAX) return { l, s, p };
    }
    const l = lanes[0]; return { l, s: 0, p: lanePoint(l, 0) };
  }
  function place(pd, near) {
    pd.side = 0; const { l, s } = spot(pd, near);
    pd.w = laneWalk(l.ends[R() < 0.5 ? 0 : 1], s); pd.s = 0;
  }
  // at the end of a walk, at lane end le: round the corner, over the road, or (having crossed) back along this side
  function next(pd, le, crossed) {
    if (!le) { place(pd, pd.h.group.position); return; }
    const options = [];
    if (!crossed && le.node.deg > 2) options.push(["cross", le.cross]);
    options.push(["corner", le.corner]);
    if (crossed) options.push(["lane", le]);
    let pick;
    if (pd.fear) {   // frightened: whichever way ends furthest from the danger
      let best = -1; for (const o of options) { const e = o[0] === "lane" ? laneEndPos(o[1].lane.ends[1 - o[1].end]) : laneEndPos(o[1]); const d = Math.hypot(e.x - pd.fear.x, e.z - pd.fear.z); if (d > best) { best = d; pick = o; } }
    } else if (crossed) pick = options[R() < 0.5 ? 0 : 1];                                   // round the corner, or back along this side
    else pick = options[0][0] === "cross" && R() < CROSS_CHANCE ? options[0] : options[options.length - 1];
    const [kind, to] = pick;
    if (kind === "lane") { pd.w = laneWalk(le); pd.s = 0; return; }
    const lp = linkPath(le, to, kind);
    pd.w = walk(lp.pts, le, to, null); pd.w.kind = kind; pd.s = 0;
  }
  function arrived(pd) {
    const w = pd.w;
    if (w.onLane) next(pd, w.to, false);                       // end of a pavement: decide at the junction
    else if (w.kind === "cross") next(pd, w.to, true);         // over the road: carry on from this side
    else { pd.w = laneWalk(w.to); pd.s = 0; }                 // round the corner: down the new street
  }
  // turn round where they are (frightened the other way)
  function reverse(pd) {
    const w = pd.w, pts = w.pts.slice().reverse(), r = walk(pts, w.to, w.from, w.onLane);
    r.kind = w.kind; pd.s = Math.max(0, w.L - pd.s); pd.w = r;
    if (!r.to && w.onLane) {   // started mid-lane: aim at the lane end behind them
      const l = w.onLane, a = laneEndPos(l.ends[0]), b = laneEndPos(l.ends[1]), e = pts[pts.length - 1];
      r.to = Math.hypot(a.x - e.x, a.z - e.z) < Math.hypot(b.x - e.x, b.z - e.z) ? l.ends[0] : l.ends[1];
    }
  }
  // a spot by the buildings for someone (and maybe a friend) to stand and talk
  function placeStand(pd, near) {
    const { l, s, p } = spot(pd, near);
    const cx = p.x + p.ox * 0.95, cz = p.z + p.oz * 0.95;   // toward the buildings
    const out = Math.atan2(-p.ox, -p.oz), t = 25 + R() * 70, m = pd.st && pd.st.mate;
    if (!m) { pd.st = { x: cx, z: cz, yaw: out + (R() - 0.5) * 1.2, t, lead: true, mate: null, l, s }; return; }
    // two people half facing each other, opened a little toward the street
    const ax = cx - p.tx * 0.55, az = cz - p.tz * 0.55, bx = cx + p.tx * 0.55, bz = cz + p.tz * 0.55;
    const yawA = Math.atan2(bx - ax, bz - az), yawB = yawA + Math.PI, open = 0.35;
    pd.st = { x: ax, z: az, yaw: yawA - open * Math.sign(Math.sin(yawA - out)), t, lead: true, mate: m, l, s: Math.max(0, s - 0.55) };
    m.st = { x: bx, z: bz, yaw: yawB - open * Math.sign(Math.sin(yawB - out)), t, lead: false, mate: pd, l, s: Math.min(l.L, s + 0.55) };
  }
  // back into the crowd as a fresh face somewhere out of sight
  function revive(pd, near) {
    pd.dead = false; pd.rag = null; pd.hp = 100; pd.fear = null; pd.cower = 0; pd.stagger = 0; pd.pause = 0; pd.st = null;
    place(pd, near); pd.h.group.visible = false;
  }
  function die(pd, hit) {
    if (pd.st) breakUp(pd.st.lead ? pd : pd.st.mate);
    pd.B = pd.B || findBones(pd.h.group);
    pd.dead = true; pd.fear = null;
    if (!pd.B) { pd.h.group.visible = false; return; }
    pd.h.group.updateMatrixWorld(true);
    pd.rag = new Ragdoll(pd.B, world, new THREE.Vector3(pd.vx, 0, pd.vz), hit);
  }
  // done talking: walk on from where they stood, easing back onto the lane
  function breakUp(pd) {
    for (const q of [pd, pd.st.mate]) {
      if (!q || !q.st) continue;
      const st = q.st; q.w = laneWalk(st.l.ends[R() < 0.5 ? 0 : 1], st.s); q.s = 0;
      pointOn(q.w, 0, tmp); q.side = (st.x - tmp.x) * -tmp.dz + (st.z - tmp.z) * tmp.dx;   // start where they stood
      q.pause = R() * 1.5; q.st = null;
    }
  }

  async function make(near) {
    const p = randomPerson(R);
    const h = new Human(D, p, { lod: p.sex < 0.5 ? "female1605" : "male1591" });
    h.group.traverse((m) => { if (m.isMesh) { m.castShadow = m.name === "body"; m.receiveShadow = false; } });
    const mixer = new THREE.AnimationMixer(h.group), act = {};
    for (const c of h.clips) { act[c.name] = mixer.clipAction(c); act[c.name].play(); act[c.name].setEffectiveWeight(0); }
    const head = h.bones.find((b) => b.name === "head"), neck = h.bones.find((b) => b.name === "neck01");
    const pd = { h, mixer, act, head, neck, w: null, s: 0, speed: 1.15 + R() * 0.45, run: 4.3 + R() * 1.4, pause: 0, wW: 1, rW: 0, cW: 0, first: true, fear: null, cower: 0, hp: 100, dead: false, rag: null, vx: 0, vz: 0,
      side: 0, look: 0, stagger: 0, st: null, gW: 0, gT: 0, gest: null };
    place(pd, near); pd.first = false;
    act.run.setEffectiveWeight(0); act.idle.setEffectiveWeight(0); act.walk.setEffectiveWeight(1);
    act.walk.time = R() * act.walk.getClip().duration;
    scene.add(h.group);
    peds.push(pd);
  }
  for (let i = 0; i < count; i++) {
    await make(o.near || world.spawn);
    if (o.progress) o.progress((i + 1) / count);
    if (i % 3 === 2) await new Promise((r) => setTimeout(r));   // keep the loading bar moving
  }
  // some of the crowd stands about instead of walking (spread through the list, so a lower limit keeps a mix)
  for (let i = 0; i < peds.length; i++) {
    const r = R(), a = peds[i], b = peds[i + 1];
    if (r < PAIRS && b) { a.st = { mate: b }; a.first = b.first = true; placeStand(a, o.near || world.spawn); a.first = b.first = false; i++; }
    else if (r < PAIRS + SOLO) { a.first = true; placeStand(a, o.near || world.spawn); a.first = false; }
  }

  const look = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  // head and neck turn toward the player when they're close and in front
  function glance(pd, g, toPx, toPz, d, dt) {
    const fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y);
    const facing = (toPx * fx + toPz * fz) / (d || 1);
    const want = d < 6 && facing > -0.1 ? THREE.MathUtils.clamp(Math.atan2(toPx * fz - toPz * fx, toPx * fx + toPz * fz), -1.1, 1.1) : 0;
    pd.look += (want - pd.look) * Math.min(1, dt * 3);
    if (Math.abs(pd.look) > 0.01) {
      look.setFromAxisAngle(up, pd.look * 0.55); pd.head.quaternion.premultiply(look);
      look.setFromAxisAngle(up, pd.look * 0.3); pd.neck.quaternion.premultiply(look);
    }
    return facing;
  }
  function standing(pd, g, x, z, d, px, pz, dt) {
    const st = pd.st, toPx = px - x, toPz = pz - z;
    g.position.set(x, world.heightAt(x, z), z);
    let yaw = st.yaw; if (pd.stagger > 0) { pd.stagger -= dt; yaw = Math.atan2(toPx, toPz); }
    let dy = yaw - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    g.rotation.y += dy * Math.min(1, dt * (pd.stagger > 0 ? 10 : 4));
    g.visible = d < FAR;
    if (d >= NEAR) return;
    // in conversation: whoever's talking nods or shakes their head; the other mostly listens
    pd.gT -= dt;
    if (pd.gT <= 0) {
      const talking = st.mate && (st.lead ? (st.turn = R() < 0.5) : !st.mate.st.turn);
      const r = R();
      pd.gest = st.mate ? (talking ? (r < 0.65 ? "agree" : r < 0.9 ? "headShake" : null) : (r < 0.25 ? "agree" : null)) : (r < 0.1 ? "headShake" : null);
      pd.gT = 2 + R() * 3.5;
      if (pd.gest && pd.act[pd.gest] && pd.act[pd.gest].getEffectiveWeight() < 0.05) pd.act[pd.gest].time = 0;
    }
    const gw = pd.gest && pd.act[pd.gest] ? (st.mate ? 0.8 : 0.5) : 0;
    pd.gW += (gw - pd.gW) * Math.min(1, dt * 3);
    pd.wW += (0 - pd.wW) * Math.min(1, dt * 6);
    pd.act.walk.setEffectiveWeight(pd.wW);
    for (const n of GESTURES) if (pd.act[n]) pd.act[n].setEffectiveWeight(n === pd.gest ? pd.gW : 0);
    pd.act.idle.setEffectiveWeight(Math.max(0, 1 - pd.wW - (pd.gest ? pd.gW : 0)));
    pd.mixer.update(dt);
    const facing = glance(pd, g, toPx, toPz, d, dt);
    if (quiet <= 0 && d < 4.5 && facing > 0.3 && !pd.spoke && R() < dt * 0.6) { pd.spoke = 40; say(lineFor(world.districtAt(x, z))); }
    if (pd.spoke) pd.spoke = Math.max(0, pd.spoke - dt);
  }
  return {
    peds,
    set limit(n) { limit = Math.max(0, Math.min(count, n)); },
    get limit() { return limit; },
    update(dt, player) {
      const px = player.pos.x, pz = player.pos.z, pv = player.speed || 0;
      quiet -= dt;
      peds.forEach((pd, idx) => {
        const g = pd.h.group;
        if (idx >= limit) { g.visible = false; return; }
        if (pd.dead) {   // a body: let it fall and settle; clear it away once nobody can see
          const dd = Math.hypot(g.position.x - px, g.position.z - pz);
          if (dd > FAR * 0.6) { revive(pd, player.pos); return; }
          if (dd < NEAR && pd.rag.step(dt)) pd.rag.pose();
          return;
        }
        let x, z, hx, hz;
        const st = pd.st, lead = st && (st.lead ? pd : st.mate);
        if (st) {
          if (st.mate && peds.indexOf(st.mate) >= limit) { breakUp(pd); return; }   // their friend was culled: walk on
          x = st.x; z = st.z; hx = Math.sin(st.yaw); hz = Math.cos(st.yaw);
        } else {
          pointOn(pd.w, pd.s, tmp); x = tmp.x; z = tmp.z; hx = tmp.dx; hz = tmp.dz;
        }
        let d = Math.hypot(x - px, z - pz);
        if (st) {
          if (st.lead) {
            st.t -= dt;
            if (d > FAR) { placeStand(pd, player.pos); x = pd.st.x; z = pd.st.z; d = Math.hypot(x - px, z - pz); }
            else if (st.t <= 0 && d > 12) { breakUp(pd); return; }   // never mid-glance with the player close by
          }
          if (!pd.st) return;                                        // the lead just walked off with us
          return standing(pd, g, x, z, d, px, pz, dt);
        }
        if (d > FAR) { place(pd, player.pos); pointOn(pd.w, 0, tmp); x = tmp.x; z = tmp.z; hx = tmp.dx; hz = tmp.dz; d = Math.hypot(x - px, z - pz); }

        // the player a step ahead: wait; the player running at us: sidestep instead
        const rx = -hz, rz = hx;                                       // our right-hand side
        const toP = { x: px - x, z: pz - z }, ahead = toP.x * hx + toP.z * hz, lateral = toP.x * rx + toP.z * rz;
        const inPath = ahead > 0 && ahead < 3.2 && Math.abs(lateral) < 1.1;
        const wantSide = inPath && pv > 3 ? (lateral > 0 ? -0.9 : 0.9) : 0;
        pd.side += (wantSide - pd.side) * Math.min(1, dt * 5);
        if (pd.fear && (pd.fear.t -= dt) <= 0) pd.fear = null;
        if (pd.cower > 0) { pd.cower -= dt; pd.pause = Math.max(pd.pause, 0.1); }
        if (pd.pause > 0) pd.pause -= dt;
        else if (pd.fear) { /* running: no stopping */ }
        else if (inPath && pv <= 3 && ahead < 1.6) pd.pause = 0.5 + R() * 0.7;
        else if (pd.w.onLane && R() < dt * 0.015) pd.pause = 2 + R() * 4;          // stop and stand for a moment (not in the road)
        if (pd.stagger > 0) { pd.stagger -= dt; pd.pause = Math.max(pd.pause, 0.2); }
        const moving = pd.pause <= 0;

        if (moving) {   // along the walk; at its end, on to the next
          pd.s += (pd.fear ? pd.run : pd.speed * (pd.w.kind === "cross" ? 1.15 : 1)) * dt;
          if (pd.s >= pd.w.L) { const over = pd.s - pd.w.L; arrived(pd); pd.s = Math.min(over, pd.w.L); }
        }
        const gy = world.heightAt(x + rx * pd.side, z + rz * pd.side), nx = x + rx * pd.side, nz = z + rz * pd.side;
        if (dt > 0) { pd.vx = (nx - g.position.x) / dt; pd.vz = (nz - g.position.z) / dt; if (Math.hypot(pd.vx, pd.vz) > 8) pd.vx = pd.vz = 0; }
        g.position.set(nx, gy, nz);
        let yaw = Math.atan2(hx, hz);
        if (pd.stagger > 0) yaw = Math.atan2(toP.x, toP.z);                     // turn to see who did that
        else if (pd.cower > 0 && pd.fear) yaw = Math.atan2(x - pd.fear.x, z - pd.fear.z);   // duck, back to the danger
        let dy = yaw - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.rotation.y += dy * Math.min(1, dt * (pd.stagger > 0 ? 10 : 6));
        g.visible = d < FAR;
        if (d < NEAR) {
          const k = Math.min(1, dt * 6), running = moving && !!pd.fear;
          pd.wW += ((moving && !running ? 1 : 0) - pd.wW) * k; pd.rW += ((running ? 1 : 0) - pd.rW) * k; pd.cW += ((pd.cower > 0 ? 1 : 0) - pd.cW) * k * 1.5;
          pd.act.walk.setEffectiveWeight(pd.wW); pd.act.run.setEffectiveWeight(pd.rW);
          if (pd.act.sneak_pose) pd.act.sneak_pose.setEffectiveWeight(pd.cW);
          pd.act.idle.setEffectiveWeight(Math.max(0, 1 - pd.wW - pd.rW - pd.cW));
          pd.act.walk.timeScale = pd.speed / 1.45; pd.act.run.timeScale = pd.run / 4.8;
          if (pd.gW > 0.001) { pd.gW *= Math.max(0, 1 - dt * 4); for (const n of GESTURES) if (pd.act[n]) pd.act[n].setEffectiveWeight(n === pd.gest ? pd.gW : 0); }
          pd.mixer.update(dt);
          const facing = glance(pd, g, toP.x, toP.z, d, dt);
          // now and then, someone close says something
          if (quiet <= 0 && d < 4.5 && facing > 0.3 && !pd.spoke && R() < dt * 0.6) { pd.spoke = 40; say(lineFor(world.districtAt(x, z))); }
          if (pd.spoke) pd.spoke = Math.max(0, pd.spoke - dt);
        }
      });
    },
    // a round hit someone. hit: { point, dir, damage, head, from }. Returns "dead", "hurt" or "body"
    damage(pd, hit) {
      if (pd.dead) { if (pd.rag) { pd.rag.impulse(hit.point, hit.dir, 2.5); pd.rag.sleep = 0; } return "body"; }
      pd.hp -= hit.head ? 1000 : hit.damage;
      if (pd.hp <= 0) { die(pd, { point: hit.point, dir: hit.dir, force: hit.force || (hit.head ? 3 : 4.5) }); return "dead"; }
      if (pd.st) breakUp(pd.st.lead ? pd : pd.st.mate);
      pd.stagger = 0.7; pd.cower = 0; pd.pause = 0.4;
      pd.fear = { x: hit.from.x, z: hit.from.z, t: 20 }; pd.speed *= 0.8;   // hurt: they still run, a little slower
      return "hurt";
    },
    // something went wrong at (x, z): people within r run from it; the closest may duck first
    alarm(x, z, r = 40, shout = true) {
      let nearest = null, nd = Infinity;
      for (let i = 0; i < Math.min(limit, peds.length); i++) {
        const pd = peds[i], g = pd.h.group.position, d = Math.hypot(g.x - x, g.z - z);
        if (d > r || pd.dead) continue;
        if (pd.st) breakUp(pd.st.lead ? pd : pd.st.mate);
        const fresh = !pd.fear;
        pd.fear = { x, z, t: 9 + R() * 8 }; pd.pause = fresh ? 0.15 + R() * 0.5 : 0;   // a beat to register it
        if (fresh && d < 9 && R() < 0.4) pd.cower = 2 + R() * 3;
        // run whichever way along the block takes them away from it
        if (pd.w) { pointOn(pd.w, pd.s + 2, tmp); const a = Math.hypot(tmp.x - x, tmp.z - z); pointOn(pd.w, Math.max(0, pd.s - 2), tmp); if (a < Math.hypot(tmp.x - x, tmp.z - z)) reverse(pd); }
        if (d < nd) { nd = d; nearest = pd; }
      }
      if (shout && nearest && nd < 25) { quiet = 0; say(PANIC[(R() * PANIC.length) | 0]); quiet = 3 + R() * 3; }
      return nearest;
    },
    // keep the player from walking through people; a sprinting player knocks them off their stride
    push(p, r, speed) {
      for (let i = 0; i < Math.min(limit, peds.length); i++) {
        const pd = peds[i]; if (pd.dead) continue;
        const g = pd.h.group.position, dx = p.x - g.x, dz = p.z - g.z, dd = Math.hypot(dx, dz), m = r + 0.3;
        if (dd < m && dd > 1e-4) {
          p.x = g.x + dx / dd * m; p.z = g.z + dz / dd * m;
          if ((speed || 0) > 5 && pd.stagger <= 0) { pd.stagger = 1.2; pd.side += (dx > 0 ? -0.4 : 0.4); say(BUMP[(R() * BUMP.length) | 0]); if (o.onBump) o.onBump(pd); }
        }
      }
    }
  };
}
