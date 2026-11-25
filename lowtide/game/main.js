/* Lowtide, in game. Loaded on demand from the main menu (Story Mode).
   Builds the renderer, Marlowe Keys, the sky and sea, the player and HUD,
   then runs the loop. The picture is PS1 (ps1.js): rendered at 270 lines,
   every vertex snapped to that grid, nearest-neighbour textures, blob shadows,
   then scaled up with hard pixels and a 15-bit dither. If frames still run
   long, the crowd thins. */
import * as THREE from "three";
import { buildWorld } from "./world.js?v=dev";
import { buildSky } from "./sky.js?v=dev";
import { Player, CamRig, Input } from "./player.js?v=dev";
import { Hud } from "./hud.js?v=dev";
import { spawnPeds } from "./peds.js?v=dev";
import { Arsenal } from "./weapons.js?v=dev";
import { Vehicles } from "./vehicles.js?v=dev";
import { Traffic } from "./traffic.js?v=dev";
import { Life } from "./life.js?v=dev";
import { Gore } from "./gore.js?v=dev";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createHuman } from "./human.js?v=dev";
import { PS1, configure, makeBlit, crunch } from "./ps1.js?v=dev";

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
  let tp = performance.now(); const TIMING = /[?&]timing/.test(location.search);
  const step = async (p, what) => { if (TIMING) { console.info("lowtide load", what || p, Math.round(performance.now() - tp), "ms"); tp = performance.now(); } if (o.progress) o.progress(p); await frame(); };
  await step(0.04);

  configure(innerWidth / innerHeight);   // before any material exists: the vertex snap goes into every shader
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  const ratio = 1;
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  o.mount.appendChild(renderer.domElement);
  const rt = new THREE.WebGLRenderTarget(PS1.w, PS1.h, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true });
  const blit = makeBlit(); blit.mat.uniforms.tSrc.value = rt.texture;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 2600);
  await step(0.12);

  const charP = loadCharacter(o.character);   // download while the city builds
  const sky = buildSky(scene, renderer);
  await step(0.25);
  const world = await buildWorld(scene, {});
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
  const gore = new Gore(scene, world);
  try { peds = await spawnPeds(scene, world, { gore, sfx: o.sfx, count: o.peds || 18, near: player.pos, onSpeak: (t) => hud.subtitle(t), progress: (k) => o.progress && o.progress(0.82 + k * 0.14) }); }
  catch (e) { console.warn("Lowtide: pedestrians failed to load", e); }

  // Stage 3: weapons
  const arsenal = new Arsenal({ scene, camera, world, player, rig, hud, peds, sfx: o.sfx });
  // Stage 5, early: the parked cars drive
  const traffic = new Traffic(scene, world, { count: 16, sfx: o.sfx });
  const vehicles = new Vehicles({ world, player, rig, camera, hud, peds, sfx: o.sfx, prompt: o.hud.querySelector(".prompt"), scene, fx: arsenal.fx, traffic });
  // your health; cars and blasts take it
  const life = new Life({ player, world, rig, hud, root: o.hud, blit, sfx: o.sfx, vehicles });
  traffic.life = life; vehicles.life = life; life.gore = gore; if (peds) peds.fx = arsenal.fx;
  traffic.onImpact = (c, x, z, dx, dz, v) => vehicles.impactCar(c, x, z, dx, dz, v);
  // gunfire: drivers panic, and cars take rounds (enough of them and they go up)
  arsenal.onShot = (pos, hit) => {
    traffic.panic(pos.x, pos.z, 75);
    if (!hit || !hit.point) return;
    // the first car along the round's path takes it
    const all = vehicles.cars.concat(traffic.cars.filter((k) => k.active || k.taken)), dx = hit.point.x - pos.x, dz = hit.point.z - pos.z, L = Math.hypot(dx, dz);
    for (let t = 0.5; t < L; t += 0.5) {
      const x = pos.x + dx * t / L, z = pos.z + dz * t / L, y = pos.y + 1.4 + (hit.point.y - pos.y - 1.4) * t / L;
      const c = all.find((k) => !k.wreck && Math.abs(k.x - x) < 3 && Math.abs(k.z - z) < 3 && vehicles.touching(k, x, z, 0) && y < (k.y || 0) + 1.5);
      if (c) { vehicles.impactCar(c, x, z, dx / L, dz / L, 4); vehicles.hurt(c, 9); break; }
    }
  };
  // key tips: the basics as you start, the rest the first time they matter
  const TIPS = {
    move: "{W} {A} {S} {D} to move. Hold {Shift} to sprint, {Space} to jump.",
    weapons: "Hold {Tab} for the weapon wheel. {1} {2} {3} pick a weapon too.",
    pause: "{Esc} pauses the game and shows the map of Marlowe Keys.",
    wheel: "Point at a weapon, then let go of {Tab}. Time slows while you choose.",
    "equip:pistol": "Right click or {Q} to aim. Tap to lock the aim on, tap again to lower it. Click or {E} fires.",
    "equip:shotgun": "The shotgun loads one shell at a time. Fire to stop loading early.",
    aim: "Raise your gun near someone and the sights find them. The view slows while you're on a target.",
    empty: "Out of rounds. {R} reloads.",
    "near-car": "{E} gets in. Every car on the island is unlocked, apparently.",
    "in-car": "{W} drives, {S} brakes and reverses, {A} {D} steer, {Space} is the handbrake. {E} gets out."
  };
  vehicles.on = (e) => { if (TIPS[e]) hud.tipOnce(e, TIPS[e]); };
  arsenal.on = (e) => { if (TIPS[e]) hud.tipOnce(e, TIPS[e]); if (e === "equip:shotgun") hud.tipOnce("equip:pistol", TIPS["equip:pistol"]); };
  let tipClock = 0;
  const startTips = (dt) => {
    const was = tipClock; tipClock += dt;
    if (was < 1.5 && tipClock >= 1.5) hud.tipOnce("move", TIPS.move);
    if (was < 14 && tipClock >= 14) hud.tipOnce("weapons", TIPS.weapons);
    if (was < 40 && tipClock >= 40) hud.tipOnce("pause", TIPS.pause);
  };

  // PS1: nearest-neighbour textures everywhere; a soft dark blob under each person instead of a real shadow
  crunch(scene);
  // people: sheen, clearcoat and the like are invisible at 270 lines and cost the biggest shaders; drop them so everyone shares a few small ones
  scene.traverse((m) => { const mt = m.material; if (mt && mt.isMeshPhysicalMaterial) { mt.sheen = 0; mt.clearcoat = 0; mt.iridescence = 0; mt.transmission = 0; mt.specularIntensity = 0.5; mt.needsUpdate = true; } });
  const blobGeo = new THREE.CircleGeometry(0.42, 10).rotateX(-Math.PI / 2), blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const blob = (g) => { const m = new THREE.Mesh(blobGeo, blobMat); m.position.y = 0.03; m.renderOrder = 3; g.add(m); };
  if (player.model) blob(player.model);
  if (peds) for (const pd of peds.peds) blob(pd.h.group);

  // warm up: compile every shader before the first real frame
  rig.update(0, input, player); sky.update(0, player.pos, camera.position);
  const draw = () => { renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(blit.scene, blit.cam); };
  await step(0.96, "people");
  // compile for where we actually draw (the low-res target, no tone mapping), in parallel where the browser can
  renderer.setRenderTarget(rt);
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
  renderer.setRenderTarget(null); await step(0.97, "shaders");
  // warm the GPU a few things at a time (texture uploads, any last programs), a frame between each, so the loading screen never freezes
  { const all = []; scene.traverse((m) => { if ((m.isMesh || m.isLine || m.isPoints || m.isSprite) && m.visible) all.push(m); });
    all.forEach((m) => (m.visible = false));
    renderer.setRenderTarget(rt);
    for (let i = 0; i < all.length; i += 6) { const t0 = performance.now(); for (let k = i; k < Math.min(all.length, i + 6); k++) all[k].visible = true; renderer.render(scene, camera); if (TIMING && performance.now() - t0 > 300) console.info("lowtide load slow batch", Math.round(performance.now() - t0), all.slice(i, i + 6).map((m) => (m.material && m.material.type) + ":" + (m.name || m.parent && m.parent.name)).join(", ")); await frame(); }
    renderer.setRenderTarget(null); renderer.render(blit.scene, blit.cam); }
  await step(0.99, "warm-up");
  draw();
  await step(1);

  let running = false, last = 0, t = 0, raf = 0;
  const perf = { n: 0, sum: 0, stage: 0 };
  function adapt(dt) {   // after a warm-up, measure; if slow, step quality down
    perf.n++; if (perf.n < 45) return;
    perf.sum += dt; if (perf.n < 135) return;
    const avg = perf.sum / 90; perf.n = 0; perf.sum = 0;
    if (avg < 0.022 || perf.stage > 2) return;
    perf.stage++;
    if (perf.stage === 1) { if (peds) peds.limit = 14; traffic.limit = 12; }
    else if (perf.stage === 2) { if (peds) peds.limit = 10; traffic.limit = 9; }
    else { if (peds) peds.limit = 8; traffic.limit = 7; }
    console.info("Lowtide quality step", perf.stage, "avg frame", (avg * 1000).toFixed(1), "ms");
  }
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
    // the weapon wheel slows the world down; the camera and the wheel itself run at full speed
    // a car first (it may take E for the door), then the gun, unless you're driving
    const dw = dt * arsenal.timeScale * life.timeScale;
    let inCar = false;
    traffic.update(dw, player, vehicles, peds);
    life.update(dt, input, dw); gore.update(dw);
    const down = life.down;   // dead or knocked flat: the body's a ragdoll, nobody's driving it
    if (input.locked && !down) { const used = vehicles.update(dw, input); inCar = vehicles.driving; if (!inCar && !used) arsenal.update(dt, input); startTips(dt); }
    else if (down) { vehicles.update(dw, { hit: () => false, down: () => false, keys: new Set() }); arsenal.tickFx(dw); player.aimYaw = null; rig.aim = 0; }
    if (inCar) { player.aimYaw = null; rig.aim = 0; arsenal.tickFx(dt); }
    rig.car = vehicles.car;
    if (input.locked && !inCar && !down) { player.update(dw, input, rig.yaw); if (peds) peds.push(player.pos, 0.32, player.speed); traffic.push(player.pos, 0.32); }
    else if (!inCar && !down) player.animate(dw);
    if (peds) peds.update(dw, player);
    rig.update(dt, input, player);
    sky.update(t, player.pos, camera.position);
    hud.update(player, rig.yaw);
    draw();
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
    rig, world, arsenal, vehicles, traffic, life, get peds() { return peds; }
  };
  window.__lowtide = api;   // handy in the console; tests drive the player through it
  input.onLock = (locked) => { if (o.onLock) o.onLock(locked); };
  api.resume();
  return api;
}
