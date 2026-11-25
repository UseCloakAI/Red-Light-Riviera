/* Stage 2: the people of Marlowe Keys. Every pedestrian is a unique person from
   game/human.js (random heritage, age, build, face, hair, clothes) built on the
   ~1,600-vertex body proxy.

   They walk the sidewalk loops around the blocks and cross at the zebra
   crossings to the next block, stop now and then, glance at the player as
   they pass, sidestep a player running at them, and stagger if barged. They
   are recycled out of sight as the player moves. Animation only runs near
   the camera, and the crowd shrinks if the machine is struggling. */
import * as THREE from "three";
import { loadHumanData, Human, randomPerson } from "./human.js?v=dev";
import { P as PITCH } from "./world.js?v=dev";
import { AMBIENT, BUMP } from "./lines.js?v=dev";

const INSET = 1.5;                       // walk this far in from the lot edge (sidewalk is 3 m)
const NEAR = 70, FAR = 150, SPAWN_MIN = 45, SPAWN_MAX = 120, CROSS_CHANCE = 0.4;

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
    for (const c of h.clips) { act[c.name] = mixer.clipAction(c); act[c.name].play(); }
    const head = h.bones.find((b) => b.name === "head"), neck = h.bones.find((b) => b.name === "neck01");
    const pd = { h, mixer, act, head, neck, dir: R() < 0.5 ? 1 : -1, speed: 1.15 + R() * 0.45, pause: 0, wW: 1, rW: 0, first: true,
      side: 0, look: 0, stagger: 0, cross: null };
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

  const look = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
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
        if (pd.cross) {
          // on the zebra: straight across at a slightly brisker pace
          const c = pd.cross; if (pd.pause <= 0) c.t += (pd.speed * 1.1 * dt) / c.len;
          if (c.t >= 1) {
            pd.L = c.N; const k = cornerIndex(c.N, c.x1, c.z1); pd.s = corners(c.N)[k] + pd.dir * 0.01; pd.cross = null;
            along(pd.L, pd.s, tmp); x = tmp.x; z = tmp.z; hx = tmp.dx * pd.dir; hz = tmp.dz * pd.dir;
          } else { x = c.x0 + (c.x1 - c.x0) * c.t; z = c.z0 + (c.z1 - c.z0) * c.t; hx = (c.x1 - c.x0) / c.len; hz = (c.z1 - c.z0) / c.len; }
        } else {
          along(pd.L, pd.s, tmp); x = tmp.x; z = tmp.z; hx = tmp.dx * pd.dir; hz = tmp.dz * pd.dir;
        }
        let d = Math.hypot(x - px, z - pz);
        if (d > FAR) { place(pd, player.pos); along(pd.L, pd.s, tmp); x = tmp.x; z = tmp.z; hx = tmp.dx * pd.dir; hz = tmp.dz * pd.dir; d = Math.hypot(x - px, z - pz); }

        // the player a step ahead: wait; the player running at us: sidestep instead
        const rx = -hz, rz = hx;                                       // our right-hand side
        const toP = { x: px - x, z: pz - z }, ahead = toP.x * hx + toP.z * hz, lateral = toP.x * rx + toP.z * rz;
        const inPath = ahead > 0 && ahead < 3.2 && Math.abs(lateral) < 1.1;
        const wantSide = inPath && pv > 3 ? (lateral > 0 ? -0.9 : 0.9) : 0;
        pd.side += (wantSide - pd.side) * Math.min(1, dt * 5);
        if (pd.pause > 0) pd.pause -= dt;
        else if (inPath && pv <= 3 && ahead < 1.6) pd.pause = 0.5 + R() * 0.7;
        else if (!pd.cross && R() < dt * 0.015) pd.pause = 2 + R() * 4;            // stop and stand for a moment
        if (pd.stagger > 0) { pd.stagger -= dt; pd.pause = Math.max(pd.pause, 0.2); }
        const moving = pd.pause <= 0;

        if (moving && !pd.cross) {
          // passing a corner: maybe head across the road
          const before = pd.s, P = perimeter(pd.L);
          pd.s += pd.dir * pd.speed * dt;
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
        let dy = yaw - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.rotation.y += dy * Math.min(1, dt * (pd.stagger > 0 ? 10 : 6));
        g.visible = d < FAR;
        if (d < NEAR) {
          pd.wW += ((moving ? 1 : 0) - pd.wW) * Math.min(1, dt * 6);
          pd.act.walk.setEffectiveWeight(pd.wW); pd.act.idle.setEffectiveWeight(1 - pd.wW);
          pd.act.walk.timeScale = pd.speed / 1.45;
          pd.mixer.update(dt);
          // glance at the player when they're close and in front of us
          const fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y);
          const facing = (toP.x * fx + toP.z * fz) / (d || 1);
          const want = d < 6 && facing > -0.1 ? THREE.MathUtils.clamp(Math.atan2(toP.x * fz - toP.z * fx, toP.x * fx + toP.z * fz), -1.1, 1.1) : 0;
          pd.look += (want - pd.look) * Math.min(1, dt * 3);
          // now and then, someone close says something
          if (quiet <= 0 && d < 4.5 && facing > 0.3 && !pd.spoke && R() < dt * 0.6) { pd.spoke = 40; say(lineFor(world.districtAt(x, z))); }
          if (pd.spoke) pd.spoke = Math.max(0, pd.spoke - dt);
          if (Math.abs(pd.look) > 0.01) {
            look.setFromAxisAngle(up, pd.look * 0.55); pd.head.quaternion.premultiply(look);
            look.setFromAxisAngle(up, pd.look * 0.3); pd.neck.quaternion.premultiply(look);
          }
        }
      });
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
