/* Lowtide, in game. Loaded on demand from the main menu (Story Mode).
   Builds the renderer, Marlowe Keys, the sky and sea, the player and HUD,
   then runs the loop. Quality adapts: if frames run long it lowers the
   resolution, then turns shadows off, so low-end machines stay playable. */
import * as THREE from "three";
import { buildWorld } from "./world.js?v=dev";
import { buildSky } from "./sky.js?v=dev";
import { Player, CamRig, Input } from "./player.js?v=dev";
import { Hud } from "./hud.js?v=dev";
import { spawnPeds } from "./peds.js?v=dev";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createHuman } from "./human.js?v=dev";

// the player: the character from the creator (MakeHuman, game/human.js); the Mixamo model is the fallback
async function loadCharacter(params) {
  try {
    if (params) { const h = await createHuman(params); return { scene: h.group, clips: h.clips }; }
  } catch (e) { console.warn("Lowtide: created character failed, using the fallback", e); }
  try {
    const [gltf, anims] = await Promise.all([
      new GLTFLoader().loadAsync("assets/characters/michelle.glb?v=dev"),
      fetch("assets/characters/anims.json?v=dev").then((r) => r.json())
    ]);
    return { scene: gltf.scene, clips: anims.clips.map((c) => THREE.AnimationClip.parse(c)) };
  } catch (e) { console.warn("Lowtide: character failed to load, using the stand-in", e); return null; }
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function start(o) {
  const step = async (p) => { if (o.progress) o.progress(p); await frame(); };
  await step(0.04);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  let ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(ratio); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  o.mount.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2600);
  await step(0.12);

  const charP = loadCharacter(o.character);   // download while the city builds
  const sky = buildSky(scene, renderer);
  await step(0.25);
  const world = buildWorld(scene, {});
  await step(0.7);
  const player = new Player(scene, world, await charP);
  const input = new Input(renderer.domElement);
  const rig = new CamRig(camera, world, player.yaw);
  const hud = new Hud(o.hud, world);
  player.onStep = (n, surface) => o.sfx && o.sfx.step && o.sfx.step(0.45 + n * 0.55, surface);
  player.onLand = (v) => o.sfx && o.sfx.step && o.sfx.step(Math.min(1.4, v / 6), player.surface);
  await step(0.82);
  // Stage 2: the people of Marlowe Keys
  let peds = null;
  try { peds = await spawnPeds(scene, world, { count: o.peds || 18, near: player.pos, progress: (k) => o.progress && o.progress(0.82 + k * 0.14) }); }
  catch (e) { console.warn("Lowtide: pedestrians failed to load", e); }

  // warm up: compile every shader and fill the shadow map before the first real frame
  rig.update(0, input, player); sky.update(0, player.pos, camera.position);
  renderer.compile(scene, camera); renderer.render(scene, camera);
  await step(1);

  let running = false, last = 0, t = 0, raf = 0;
  const perf = { n: 0, sum: 0, stage: 0 };
  function adapt(dt) {   // after a warm-up, measure; if slow, step quality down
    perf.n++; if (perf.n < 45) return;
    perf.sum += dt; if (perf.n < 135) return;
    const avg = perf.sum / 90; perf.n = 0; perf.sum = 0;
    if (avg < 0.022 || perf.stage > 2) return;
    perf.stage++;
    if (perf.stage === 1) { ratio = Math.max(0.75, ratio * 0.75); renderer.setPixelRatio(ratio); }
    else if (perf.stage === 2) { if (peds) peds.limit = 10; renderer.shadowMap.enabled = false; scene.traverse((m) => { if (m.material) m.material.needsUpdate = true; }); }
    else { ratio = Math.max(0.6, ratio * 0.8); renderer.setPixelRatio(ratio); }
    console.info("Lowtide quality step", perf.stage, "avg frame", (avg * 1000).toFixed(1), "ms");
  }
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
    if (input.locked) { player.update(dt, input, rig.yaw); if (peds) peds.push(player.pos, 0.32, player.speed); }
    else player.animate(dt);
    if (peds) peds.update(dt, player);
    rig.update(dt, input, player);
    sky.update(t, player.pos, camera.position);
    hud.update(player, rig.yaw);
    renderer.render(scene, camera);
    adapt(dt);
  }
  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  });

  const api = {
    input, hud, player,
    resume() { if (running) return; running = true; last = 0; input.active = true; raf = requestAnimationFrame(loop); },
    pause() { running = false; cancelAnimationFrame(raf); input.active = false; input.keys.clear(); },
    lock() { input.lock(); },
    drawMap(ctx, w, h) { hud.drawFull(ctx, w, h, player); },
    info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio, stage: perf.stage }; },
    rig, world, get peds() { return peds; }
  };
  window.__lowtide = api;   // handy in the console; tests drive the player through it
  input.onLock = (locked) => { if (o.onLock) o.onLock(locked); };
  api.resume();
  return api;
}
