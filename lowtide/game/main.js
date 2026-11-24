/* Lowtide, in game. Loaded on demand from the main menu (Story Mode).
   Builds the renderer, Marlowe Keys, the sky and sea, the player and HUD,
   then runs the loop. Quality adapts: if frames run long it lowers the
   resolution, then turns shadows off, so low-end machines stay playable. */
import * as THREE from "three";
import { buildWorld } from "./world.js";
import { buildSky } from "./sky.js";
import { Player, CamRig, Input } from "./player.js";
import { Hud } from "./hud.js";

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

  const sky = buildSky(scene, renderer);
  await step(0.25);
  const world = buildWorld(scene, {});
  await step(0.7);
  const player = new Player(scene, world);
  const input = new Input(renderer.domElement);
  const rig = new CamRig(camera, world, player.yaw);
  const hud = new Hud(o.hud, world);
  player.onStep = (n, surface) => o.sfx && o.sfx.step && o.sfx.step(0.45 + n * 0.55, surface);
  player.onLand = (v) => o.sfx && o.sfx.step && o.sfx.step(Math.min(1.4, v / 6), player.surface);
  await step(0.82);

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
    else if (perf.stage === 2) { renderer.shadowMap.enabled = false; scene.traverse((m) => { if (m.material) m.material.needsUpdate = true; }); }
    else { ratio = Math.max(0.6, ratio * 0.8); renderer.setPixelRatio(ratio); }
    console.info("Lowtide quality step", perf.stage, "avg frame", (avg * 1000).toFixed(1), "ms");
  }
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
    if (input.locked) player.update(dt, input, rig.yaw);
    else player.animate(dt);
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
    rig, world
  };
  window.__lowtide = api;   // handy in the console; tests drive the player through it
  input.onLock = (locked) => { if (o.onLock) o.onLock(locked); };
  api.resume();
  return api;
}
