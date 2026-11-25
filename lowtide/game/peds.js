/* Stage 2: the people of Marlowe Keys. Every pedestrian is a unique person from
   game/human.js (random heritage, age, build, face, hair, clothes) built on the
   ~1,600-vertex body proxy. They walk the sidewalk loops around the blocks,
   stop now and then, step around the player, and are recycled out of sight as
   the player moves. Animation only runs near the camera. */
import * as THREE from "three";
import { loadHumanData, Human, randomPerson } from "./human.js?v=dev";

const INSET = 1.5;                       // walk this far in from the lot edge (sidewalk is 3 m)
const NEAR = 70, FAR = 150, SPAWN_MIN = 45, SPAWN_MAX = 120;

function loopOf(b) { const [x0, z0, x1, z1] = b; return { x0: x0 + INSET, z0: z0 + INSET, x1: x1 - INSET, z1: z1 - INSET }; }
function perimeter(L) { return 2 * ((L.x1 - L.x0) + (L.z1 - L.z0)); }
// position and heading at distance s around the loop (clockwise seen from above)
function along(L, s, out) {
  const w = L.x1 - L.x0, h = L.z1 - L.z0, P = 2 * (w + h);
  s = ((s % P) + P) % P;
  if (s < w) { out.x = L.x0 + s; out.z = L.z0; out.dx = 1; out.dz = 0; }
  else if (s < w + h) { out.x = L.x1; out.z = L.z0 + (s - w); out.dx = 0; out.dz = 1; }
  else if (s < 2 * w + h) { out.x = L.x1 - (s - w - h); out.z = L.z1; out.dx = -1; out.dz = 0; }
  else { out.x = L.x0; out.z = L.z1 - (s - 2 * w - h); out.dx = 0; out.dz = -1; }
  return out;
}

export async function spawnPeds(scene, world, o = {}) {
  const D = await loadHumanData(), count = o.count || 18, R = Math.random;
  const blocks = world.map.blocks.map(loopOf), peds = [], tmp = { x: 0, z: 0, dx: 0, dz: 0 };

  function place(pd, near) {
    // a block whose loop passes between SPAWN_MIN and SPAWN_MAX metres from the player
    for (let tries = 0; tries < 40; tries++) {
      const L = blocks[(R() * blocks.length) | 0], s = R() * perimeter(L); along(L, s, tmp);
      const d = Math.hypot(tmp.x - near.x, tmp.z - near.z);
      if (d >= (pd.first ? 6 : SPAWN_MIN) && d <= SPAWN_MAX) { pd.L = L; pd.s = s; return; }
    }
    pd.L = blocks[0]; pd.s = 0;
  }
  async function make(i, near) {
    const p = randomPerson(R);
    const h = new Human(D, p, { lod: p.sex < 0.5 ? "female1605" : "male1591" });
    h.group.traverse((m) => { if (m.isMesh) { m.castShadow = m.name === "body"; m.receiveShadow = false; } });
    const mixer = new THREE.AnimationMixer(h.group), act = {};
    for (const c of h.clips) { act[c.name] = mixer.clipAction(c); act[c.name].play(); }
    const pd = { h, mixer, act, dir: R() < 0.5 ? 1 : -1, speed: 1.15 + R() * 0.45, pause: 0, wW: 1, first: true, seed: R() * 100 };
    place(pd, near); pd.first = false;
    act.run.setEffectiveWeight(0); act.idle.setEffectiveWeight(0); act.walk.setEffectiveWeight(1);
    act.walk.time = R() * act.walk.getClip().duration;
    scene.add(h.group);
    peds.push(pd);
  }
  for (let i = 0; i < count; i++) {
    await make(i, o.near || world.spawn);
    if (o.progress) o.progress((i + 1) / count);
    if (i % 3 === 2) await new Promise((r) => setTimeout(r));   // keep the loading bar moving
  }

  return {
    peds,
    update(dt, player) {
      const px = player.pos.x, pz = player.pos.z;
      for (const pd of peds) {
        along(pd.L, pd.s, tmp);
        let d = Math.hypot(tmp.x - px, tmp.z - pz);
        if (d > FAR) { place(pd, player.pos); along(pd.L, pd.s, tmp); d = Math.hypot(tmp.x - px, tmp.z - pz); }
        // someone in the way (the player) a step ahead: wait it out
        const ax = tmp.x + tmp.dx * pd.dir * 1.2, az = tmp.z + tmp.dz * pd.dir * 1.2;
        const blocked = Math.hypot(ax - px, az - pz) < 1.0;
        if (pd.pause > 0) pd.pause -= dt;
        else if (blocked) pd.pause = 0.6 + R() * 0.8;
        else if (R() < dt * 0.02) pd.pause = 2 + R() * 4;          // stop and stand for a moment
        const moving = pd.pause <= 0;
        if (moving) pd.s += pd.dir * pd.speed * dt;
        along(pd.L, pd.s, tmp);
        const g = pd.h.group, yaw = Math.atan2(tmp.dx * pd.dir, tmp.dz * pd.dir);
        g.position.set(tmp.x, world.heightAt(tmp.x, tmp.z), tmp.z);
        // turn smoothly at the corners
        let dy = yaw - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * Math.min(1, dt * 6);
        g.visible = d < FAR;
        if (d < NEAR) {
          pd.wW += ((moving ? 1 : 0) - pd.wW) * Math.min(1, dt * 6);
          pd.act.walk.setEffectiveWeight(pd.wW); pd.act.idle.setEffectiveWeight(1 - pd.wW);
          pd.act.walk.timeScale = pd.speed / 1.45;
          pd.mixer.update(dt);
        }
      }
    },
    // keep the player from walking through people
    push(p, r) {
      for (const pd of peds) {
        const g = pd.h.group.position, dx = p.x - g.x, dz = p.z - g.z, dd = Math.hypot(dx, dz), m = r + 0.3;
        if (dd < m && dd > 1e-4) { p.x = g.x + dx / dd * m; p.z = g.z + dz / dd * m; }
      }
    }
  };
}
