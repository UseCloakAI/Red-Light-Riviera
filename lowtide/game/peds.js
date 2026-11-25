/* Stage 2: the people of Marlowe Keys. Every pedestrian is a unique person from
   game/human.js (random heritage, age, build, face, hair, clothes) built on the
   ~1,600-vertex body proxy.

   They walk the sidewalk loops around the blocks and cross at the zebra
   crossings to the next block, stop now and then, glance at the player as
   they pass. Some stand about instead: pairs in conversation (nodding, shaking
   their heads, taking turns) and people waiting by the buildings, who break up
   after a while and walk on. Walkers
   flee or duck when something goes wrong nearby (alarm), sidestep a player running at them, and stagger if barged. They
   are recycled out of sight as the player moves. Animation only runs near
   the camera, and the crowd shrinks if the machine is struggling. */
import * as THREE from "three";
import { loadHumanData, Human, randomPerson } from "./human.js?v=dev";
import { P as PITCH } from "./world.js?v=dev";
import { AMBIENT, BUMP, PANIC } from "./lines.js?v=dev";

const INSET = 1.5;                       // walk this far in from the lot edge (sidewalk is 3 m)
const NEAR = 70, FAR = 150, SPAWN_MIN = 45, SPAWN_MAX = 120, CROSS_CHANCE = 0.4;
const PAIRS = 0.14, SOLO = 0.08;          // share of the crowd standing about, in pairs and alone
const GESTURES = ["agree", "headShake"];

function perimeter(L) { return 2 * ((L.x1 - L.x0) + (L.z1 - L.z0)); }
// position and heading at distance s around the loop
function along(L, s, out) {
  const w = L.x1 - L.x0, h = L.z1 - L.z0, P = 2 * (w + h);
  s = ((s % P) + P) % P;
  if (s < w) { out.x = L.x0 + s; out.z = L.z0; out.dx = 1; out.dz = 0; }
  else if (s < w + h) { out.x = L.x1; out.z = L.z0 + (s - w); out.dx = 0; out.dz = 1; }
  else if (s < 2 * w + h) { out.x = L.x1 - (s - w - h); out.z = L.z1; out.dx = -1; out.dz = 0; }
  else { out.x = L.x0; out.z = L.z1 - (s - 2 * w - h); out.dx = 0; out.dz = -1; }
  return out;
}
// loop distances of the four corners, in order: (x0,z0) (x1,z0) (x1,z1) (x0,z1)
function corners(L) { const w = L.x1 - L.x0, h = L.z1 - L.z0; return [0, w, w + h, 2 * w + h]; }
function cornerPoint(L, k) { return [[L.x0, L.z0], [L.x1, L.z0], [L.x1, L.z1], [L.x0, L.z1]][k]; }
function cornerIndex(L, x, z) { const ax = Math.abs(x - L.x1) < 0.01, az = Math.abs(z - L.z1) < 0.01; return az ? (ax ? 2 : 3) : (ax ? 1 : 0); }

export async function spawnPeds(scene, world, o = {}) {
  const D = await loadHumanData(), count = o.count || 18, R = Math.random;
  const blocks = world.map.blocks.map(([x0, z0, x1, z1]) => {
    const L = { x0: x0 + INSET, z0: z0 + INSET, x1: x1 - INSET, z1: z1 - INSET };
    L.i = Math.round((x0 + x1) / 2 / PITCH); L.j = Math.round((z0 + z1) / 2 / PITCH);
    return L;
  });
  const byIJ = new Map(blocks.map((L) => [L.i + "," + L.j, L]));
  const peds = [], tmp = { x: 0, z: 0, dx: 0, dz: 0 };
  let limit = count, quiet = 6;            // seconds until anyone may speak again
  const say = (text) => { quiet = 9 + R() * 8; if (o.onSpeak) o.onSpeak(text); };
  const lineFor = (district) => { const a = AMBIENT.filter((l) => l.d === district || l.d === "any"); return a[(R() * a.length) | 0].t; };

  function place(pd, near) {
    pd.cross = null; pd.side = 0;
    for (let tries = 0; tries < 40; tries++) {
      const L = blocks[(R() * blocks.length) | 0], s = R() * perimeter(L); along(L, s, tmp);
      const d = Math.hypot(tmp.x - near.x, tmp.z - near.z);
      if (d >= (pd.first ? 6 : SPAWN_MIN) && d <= SPAWN_MAX) { pd.L = L; pd.s = s; return; }
    }
    pd.L = blocks[0]; pd.s = 0;
  }
  // a spot by the buildings for someone (and maybe a friend) to stand and talk
  function placeStand(pd, near) {
    place(pd, near);
    const L = pd.L; along(L, pd.s, tmp);
    const ix = -tmp.dz, iz = tmp.dx, cx = tmp.x + ix * 0.75, cz = tmp.z + iz * 0.75;   // inward, toward the buildings
    const out = Math.atan2(-ix, -iz), t = 25 + R() * 70, m = pd.st && pd.st.mate;
    if (!m) { pd.st = { x: cx, z: cz, yaw: out + (R() - 0.5) * 1.2, t, lead: true, mate: null, s: pd.s }; return; }
    // two people half facing each other, opened a little toward the street
    const ax = cx - tmp.dx * 0.55, az = cz - tmp.dz * 0.55, bx = cx + tmp.dx * 0.55, bz = cz + tmp.dz * 0.55;
    const yawA = Math.atan2(bx - ax, bz - az), yawB = yawA + Math.PI, open = 0.35;
    pd.st = { x: ax, z: az, yaw: yawA - open * Math.sign(Math.sin(yawA - out)), t, lead: true, mate: m, s: pd.s - 0.55 };
    m.st = { x: bx, z: bz, yaw: yawB - open * Math.sign(Math.sin(yawB - out)), t, lead: false, mate: pd, s: pd.s + 0.55 };
    m.L = L; m.s = pd.s;
  }
  // done talking: walk on from where they stood
  function breakUp(pd) {
    // pick up from the spot on the loop, still 0.75 m toward the buildings; side eases back to the line
    for (const q of [pd, pd.st.mate]) {
      if (!q || !q.st) continue;
      q.s = q.st.s; q.dir = R() < 0.5 ? 1 : -1; q.side = 0.75 * q.dir; q.pause = R() * 1.5; q.cross = null; q.st = null;
    }
  }
  // at a corner: maybe cross the road to the block beside or below/above
  function maybeCross(pd, k) {
    if (R() > CROSS_CHANCE) return false;
    const L = pd.L, [cx, cz] = cornerPoint(L, k), sx = k === 1 || k === 2 ? 1 : -1, sz = k >= 2 ? 1 : -1;
    const opts = [];
    const A = byIJ.get((L.i + sx) + "," + L.j); if (A) opts.push([sx < 0 ? A.x1 : A.x0, cz, A]);
    const B = byIJ.get(L.i + "," + (L.j + sz)); if (B) opts.push([cx, sz < 0 ? B.z1 : B.z0, B]);
    if (!opts.length) return false;
    const [tx, tz, N] = opts[(R() * opts.length) | 0];
    pd.cross = { x0: cx, z0: cz, x1: tx, z1: tz, t: 0, len: Math.hypot(tx - cx, tz - cz), N };
    return true;
  }

  async function make(near) {
    const p = randomPerson(R);
    const h = new Human(D, p, { lod: p.sex < 0.5 ? "female1605" : "male1591" });
    h.group.traverse((m) => { if (m.isMesh) { m.castShadow = m.name === "body"; m.receiveShadow = false; } });
    const mixer = new THREE.AnimationMixer(h.group), act = {};
    for (const c of h.clips) { act[c.name] = mixer.clipAction(c); act[c.name].play(); act[c.name].setEffectiveWeight(0); }
    const head = h.bones.find((b) => b.name === "head"), neck = h.bones.find((b) => b.name === "neck01");
    const pd = { h, mixer, act, head, neck, dir: R() < 0.5 ? 1 : -1, speed: 1.15 + R() * 0.45, run: 4.3 + R() * 1.4, pause: 0, wW: 1, rW: 0, cW: 0, first: true, fear: null, cower: 0,
      side: 0, look: 0, stagger: 0, cross: null, st: null, gW: 0, gT: 0, gest: null };
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
        let x, z, hx, hz;
        const st = pd.st, lead = st && (st.lead ? pd : st.mate);
        if (st) {
          if (st.mate && peds.indexOf(st.mate) >= limit) { breakUp(pd); return; }   // their friend was culled: walk on
          x = st.x; z = st.z; hx = Math.sin(st.yaw); hz = Math.cos(st.yaw);
        } else if (pd.cross) {
          // on the zebra: straight across at a slightly brisker pace
          const c = pd.cross; if (pd.pause <= 0) c.t += ((pd.fear ? pd.run : pd.speed * 1.1) * dt) / c.len;
          if (c.t >= 1) {
            pd.L = c.N; const k = cornerIndex(c.N, c.x1, c.z1); pd.s = corners(c.N)[k] + pd.dir * 0.01; pd.cross = null;
            along(pd.L, pd.s, tmp); x = tmp.x; z = tmp.z; hx = tmp.dx * pd.dir; hz = tmp.dz * pd.dir;
          } else { x = c.x0 + (c.x1 - c.x0) * c.t; z = c.z0 + (c.z1 - c.z0) * c.t; hx = (c.x1 - c.x0) / c.len; hz = (c.z1 - c.z0) / c.len; }
        } else {
          along(pd.L, pd.s, tmp); x = tmp.x; z = tmp.z; hx = tmp.dx * pd.dir; hz = tmp.dz * pd.dir;
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
        if (d > FAR) { place(pd, player.pos); along(pd.L, pd.s, tmp); x = tmp.x; z = tmp.z; hx = tmp.dx * pd.dir; hz = tmp.dz * pd.dir; d = Math.hypot(x - px, z - pz); }

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
        else if (!pd.cross && R() < dt * 0.015) pd.pause = 2 + R() * 4;            // stop and stand for a moment
        if (pd.stagger > 0) { pd.stagger -= dt; pd.pause = Math.max(pd.pause, 0.2); }
        const moving = pd.pause <= 0;

        if (moving && !pd.cross) {
          // passing a corner: maybe head across the road
          const before = pd.s, P = perimeter(pd.L);
          pd.s += pd.dir * (pd.fear ? pd.run : pd.speed) * dt;
          const cs = corners(pd.L), b0 = ((before % P) + P) % P, b1 = ((pd.s % P) + P) % P;
          for (let k = 0; k < 4; k++) {
            const c = cs[k], hit = pd.dir > 0 ? (b0 < c && b1 >= c) || (b0 > b1 && c === 0) : (b0 > c && b1 <= c) || (b1 > b0 && c === 0);
            if (hit && maybeCross(pd, k)) break;
          }
        }
        const gy = world.heightAt(x + rx * pd.side, z + rz * pd.side);
        g.position.set(x + rx * pd.side, gy, z + rz * pd.side);
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
        if (!pd.cross) { along(pd.L, pd.s + 2, tmp); const a = Math.hypot(tmp.x - x, tmp.z - z); along(pd.L, pd.s - 2, tmp); pd.dir = a >= Math.hypot(tmp.x - x, tmp.z - z) ? 1 : -1; }
        if (d < nd) { nd = d; nearest = pd; }
      }
      if (shout && nearest && nd < 25) { quiet = 0; say(PANIC[(R() * PANIC.length) | 0]); quiet = 3 + R() * 3; }
      return nearest;
    },
    // keep the player from walking through people; a sprinting player knocks them off their stride
    push(p, r, speed) {
      for (let i = 0; i < Math.min(limit, peds.length); i++) {
        const pd = peds[i], g = pd.h.group.position, dx = p.x - g.x, dz = p.z - g.z, dd = Math.hypot(dx, dz), m = r + 0.3;
        if (dd < m && dd > 1e-4) {
          p.x = g.x + dx / dd * m; p.z = g.z + dz / dd * m;
          if ((speed || 0) > 5 && pd.stagger <= 0) { pd.stagger = 1.2; pd.side += (dx > 0 ? -0.4 : 0.4); say(BUMP[(R() * BUMP.length) | 0]); if (o.onBump) o.onBump(pd); }
        }
      }
    }
  };
}
