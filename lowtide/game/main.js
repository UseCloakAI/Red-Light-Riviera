/* Lowtide, in game. Loaded on demand from the main menu (Story Mode).
   Builds the renderer, Marlowe Keys, the sky and sea, the player and HUD,
   then runs the loop. The picture is PS1 (ps1.js): rendered at 270 lines,
   every vertex snapped to that grid, nearest-neighbour textures, blob shadows,
   then scaled up with hard pixels and a 15-bit dither. If frames still run
   long, the crowd thins. */
import * as THREE from "three";
import { buildWorld, DISTRICT_NAMES } from "./world.js?v=dev";
import { buildSky } from "./sky.js?v=dev";
import { Player, CamRig, Input } from "./player.js?v=dev";
import { Hud } from "./hud.js?v=dev";
import { spawnPeds } from "./peds.js?v=dev";
import { Arsenal } from "./weapons.js?v=dev";
import { Vehicles } from "./vehicles.js?v=dev";
import { Traffic } from "./traffic.js?v=dev";
import { Life, HOSPITAL } from "./life.js?v=dev";
import { Travel } from "./travel.js?v=dev";
import { Police, STATION } from "./police.js?v=dev";
import { Gore } from "./gore.js?v=dev";
import { makeVoice } from "./voice.js?v=dev";
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

  const SET = window.LT_SET || { get: () => undefined, on: () => {} };
  if ([200, 270, 360, 480].includes(SET.get("pixels"))) PS1.h = SET.get("pixels");   // the picture's line count (settings; read once)
  configure(innerWidth / innerHeight);   // before any material exists: the vertex snap goes into every shader
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", logarithmicDepthBuffer: true })   // log depth: the flat layers a few cm apart never fight, near or far;
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
  const voice = makeVoice(o.sfx);   // S.A.M. reads the lines
  const heard = (pd) => (pd ? Math.hypot(pd.h.group.position.x - player.pos.x, pd.h.group.position.z - player.pos.z) : 0);
  const pedHooks = { gore, sfx: o.sfx, count: o.peds || 18, near: player.pos };   // the fight callbacks get filled in once there's a player to hit
  try { peds = await spawnPeds(scene, world, Object.assign(pedHooks, { onSpeak: (t, pd, mood) => { hud.subtitle(t); if (pd) voice.speak(t, pd.voice, heard(pd), mood); }, progress: (k) => o.progress && o.progress(0.82 + k * 0.14) })); }
  catch (e) { console.warn("Lowtide: pedestrians failed to load", e); }
  const cops = [];   // the Marlowe Keys PD: eight officers, kept out of sight until they're needed
  if (peds) try { for (let i = 0; i < 12; i++) { cops.push(await peds.makeCop()); await frame(); } } catch (e) { console.warn("Lowtide: police failed to load", e); }
  let police = null;

  // Stage 3: weapons
  const arsenal = new Arsenal({ scene, camera, world, player, rig, hud, peds, sfx: o.sfx });
  // Stage 5, early: the parked cars drive
  const traffic = new Traffic(scene, world, { count: 16, sfx: o.sfx });
  const vehicles = new Vehicles({ world, player, rig, camera, hud, peds, sfx: o.sfx, prompt: o.hud.querySelector(".prompt"), scene, fx: arsenal.fx, traffic });
  // your health; cars and blasts take it
  const life = new Life({ player, world, rig, hud, root: o.hud, blit, sfx: o.sfx, vehicles });
  arsenal.say = (t, pd) => { if (pd) voice.speak(t, pd.voice, heard(pd), "scared"); };
  // fights: a shove back, a punch landing on you, whether you're down
  arsenal.vehicles = vehicles; arsenal.traffic = traffic;
  pedHooks.isDown = () => life.dead || life.knock > 0;
  pedHooks.onShove = (pd, dx, dz) => {
    if (vehicles.driving || life.down) return;
    player.vel.x += dx * 5.5; player.vel.z += dz * 5.5; rig.shake = Math.max(rig.shake, 0.25);
    if (o.sfx && o.sfx.punch) o.sfx.punch("fist", 0);
    if (Math.random() < 0.25) life.fling({ dir: new THREE.Vector3(dx, 0.3, dz), force: 3.5 }, 1.3);
  };
  pedHooks.onHitPlayer = (pd, dmg, dir) => {
    if (vehicles.driving || life.down) return;
    life.damage(dmg, { point: player.pos.clone().setY(player.pos.y + 1.4), dir: dir.setY(0.15), force: 2.5, cause: "fist" });
    if (o.sfx && o.sfx.punch) o.sfx.punch("fist", 0);
  };
  // the police and the wanted level
  police = new Police({ scene, world, player, peds, traffic, vehicles, life, hud, sfx: o.sfx || {}, fx: arsenal.fx, arsenal, cops, camera, rig,
    say: (t, pd) => { hud.subtitle(t); if (pd) voice.speak(t, pd.voice, heard(pd), "angry"); } });
  traffic.life = life; vehicles.life = life; life.gore = gore; if (peds) peds.fx = arsenal.fx;
  traffic.onImpact = (c, x, z, dx, dz, v) => vehicles.impactCar(c, x, z, dx, dz, v);
  // gunfire: drivers panic, and cars take rounds (enough of them and they go up)
  arsenal.onShot = (pos, hit) => {
    traffic.panic(pos.x, pos.z, 75, true);
    if (!hit || !hit.point) return;
    // the first car along the round's path takes it
    const all = vehicles.cars.concat(traffic.cars.filter((k) => k.active || k.taken)), dx = hit.point.x - pos.x, dz = hit.point.z - pos.z, L = Math.hypot(dx, dz);
    for (let t = 0.5; t < L; t += 0.5) {
      const x = pos.x + dx * t / L, z = pos.z + dz * t / L, y = pos.y + 1.4 + (hit.point.y - pos.y - 1.4) * t / L;
      const c = all.find((k) => !k.wreck && Math.abs(k.x - x) < 3 && Math.abs(k.z - z) < 3 && vehicles.touching(k, x, z, 0) && y < (k.y || 0) + 1.5);
      if (c) { c.byPlayerT = performance.now(); vehicles.impactCar(c, x, z, dx / L, dz / L, 4); vehicles.hurt(c, 9); break; }
    }
  };
  /* ---- what the pause menu shows: stats, the brief (everything said and shown), the clock ---- */
  const stats = { played: 0, foot: 0, drive: 0, shots: 0, downed: 0, deaths: 0, bills: 0, wrecks: 0, lamps: 0, hydrants: 0, trips: 0, hijacks: 0, maxWanted: 0, busted: 0, copsDowned: 0 };
  const wrap = (obj, name, fn) => { if (!obj || !obj[name]) return; const f = obj[name].bind(obj); obj[name] = (...a) => { const r = f(...a); fn(...a); return r; }; };
  const shot0 = arsenal.onShot; arsenal.onShot = (pos, hit) => { stats.shots++; shot0(pos, hit); if (police) police.crime("shots", pos); };
  wrap(vehicles, "explode", () => stats.wrecks++);
  wrap(vehicles, "breakLamp", () => stats.lamps++);
  wrap(vehicles, "breakHydrant", () => stats.hydrants++);
  wrap(vehicles, "enter", (c) => { if (c && c.ai !== undefined) stats.hijacks++; });
  wrap(life, "die", () => stats.deaths++);
  wrap(life, "respawn", () => { stats.bills += 150; });
  if (peds && peds.damage) { const d0 = peds.damage.bind(peds); peds.damage = (pd, hit) => {
    const was = pd.dead; const r = d0(pd, hit); if (!was && pd.dead) { stats.downed++; if (pd.cop && hit && hit.byPlayer) stats.copsDowned++; }
    if (police && hit && hit.byPlayer && !was) police.crime(pd.dead ? (pd.cop ? "copkill" : "murder") : (pd.cop ? "copassault" : "assault"), pd.h.group.position);
    return r; }; }
  let clockMin = 19 * 60 + 12;   // dusk on Marlowe Keys; a game minute every two seconds
  const clockStr = () => { const m = Math.floor(clockMin) % 1440, h = Math.floor(m / 60), mm = m % 60; return ((h + 11) % 12 + 1) + ":" + String(mm).padStart(2, "0") + (h < 12 ? " AM" : " PM"); };
  const brief = [];
  const note = (kind, text) => { brief.unshift({ kind, text: text.replace(/\{([^}]+)\}/g, "[$1]"), at: clockStr() }); if (brief.length > 40) brief.pop(); };
  let subsOn = true;
  const sub0 = hud.subtitle.bind(hud); hud.subtitle = (t) => { note("said", t); if (subsOn) sub0(t); };
  const tip0 = hud.tip.bind(hud); hud.tip = (t, ms) => { note("tip", t); tip0(t, ms); };
  SET.on((k, v, S) => {
    rig.sens = (S.sens || 100) / 100; rig.invert = !!S.invert; rig.baseFov = S.fov || 70; rig.shakeMul = S.shake === false ? 0 : 1; subsOn = S.subtitles !== false;
    if (!subsOn && hud.subEl) hud.subEl.classList.remove("on");
  });
  // fast travel: haze thins with altitude so the island reads from the sky
  const fogMats = []; scene.traverse((m) => { if (m.material && m.material.uniforms && m.material.uniforms.uFogD) fogMats.push(m.material.uniforms.uFogD); });
  const FOG0 = scene.fog.density;
  const setFog = (k) => { const d = FOG0 * (1 - 0.72 * k); scene.fog.density = d; for (const u of fogMats) u.value = d; };
  const travel = new Travel({ world, player, rig, camera, blit, sfx: o.sfx || {}, hud, vehicles, life, setFog, onArrive: (sp) => { stats.trips++; hud.area = null; } });
  // the police's hooks into everything else
  hud.blips = () => police.blips(); travel.police = police; arsenal.targets = () => police.targets();
  life.onRespawn = (jail) => { police.reset(); if (jail) stats.busted++; };
  police.onLevel = (n) => { stats.maxWanted = Math.max(stats.maxWanted, n); if (n > 0) hud.tipOnce("wanted", TIPS.wanted); };
  { const enter0 = vehicles.enter.bind(vehicles); vehicles.enter = (c) => { if (c.cop) police.crime("copcar", c); else if (c.ai) police.crime("carjack", c); return enter0(c); }; }
  wrap(vehicles, "explode", (c) => { if (performance.now() - (c.byPlayerT || -1e9) < 15000) police.crime("explosion", c); });
  { let ram = 0; const ic0 = vehicles.impactCar.bind(vehicles); vehicles.impactCar = (c, ...a) => { if (c.cop && vehicles.car && c !== vehicles.car && performance.now() - ram > 2000) { ram = performance.now(); police.crime("copassault", c); } return ic0(c, ...a); }; }

  // key tips: the basics as you start, the rest the first time they matter
  const TIPS = {
    move: "{W} {A} {S} {D} to move. Hold {Shift} to sprint, {Space} to jump.",
    weapons: "Hold {Tab} for the weapon wheel. {1} {2} {3} pick a weapon too.",
    pause: "{Esc} pauses. {M} opens the map: pick a street there to fast travel.",
    wheel: "Point at a weapon, then let go of {Tab}. Time slows while you choose.",
    "equip:pistol": "Right click or {Q} to aim. Tap to lock the aim on, tap again to lower it. Click or {E} fires.",
    "equip:shotgun": "The shotgun loads one shell at a time. Fire to stop loading early.",
    aim: "Raise your gun near someone and the sights find them. The view slows while you're on a target.",
    empty: "Out of rounds. {R} reloads.",
    "near-car": "{E} gets in. Every car on the island is unlocked, apparently.",
    melee: "Unarmed, click or {F} throws punches. Land three in a row for a knockout. {4} or the wheel gets the bat.",
    "equip:melee": "The bat swings wide and hits hard. Click or {F}.",
    wanted: "Wanted. Get out of the flashing area on the radar and stay out of sight to lose them. One star, unarmed and still: they'll arrest you.",
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
    if (was < 70 && tipClock >= 70) hud.tipOnce("melee", TIPS.melee);
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
    clockMin += dt / 2; stats.played += dt;
    if (travel.active) {   // the sky camera has the picture; the island keeps living under it
      traffic.update(dt, player, vehicles, peds); gore.update(dt); vehicles.update(dt, { hit: () => false, down: () => false, keys: new Set() });
      player.animate(dt); if (peds) peds.update(dt, player);
      if (travel.update(dt)) { sky.update(t, player.pos, camera.position); draw(); return; }
      input.take(); rig.update(dt, input, player);   // landed: the follow camera takes over from here
    }
    const dw = dt * arsenal.timeScale * life.timeScale;
    let inCar = false;
    const px0 = player.pos.x, pz0 = player.pos.z;
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
    if (police) police.update(dw);
    rig.update(dt, input, player);
    sky.update(t, player.pos, camera.position);
    hud.update(player, rig.yaw);
    { const m = Math.hypot(player.pos.x - px0, player.pos.z - pz0); if (m < 20) stats[inCar ? "drive" : "foot"] += m; }
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
    drawMap(ctx, w, h, opt = {}) { return hud.drawFull(ctx, w, h, player, Object.assign({ hospital: HOSPITAL, station: STATION }, opt)); },
    get police() { return police; },
    // fast travel: check a map pick, why not now, go (done() once you've landed)
    travelCheck(x, z) { return travel.check(x, z); },
    travelBlock() { return travel.blocked(); },
    get traveling() { return travel.active; },
    fastTravel(spot, done) { const ok = travel.start(spot, done); if (ok) { input.keys.clear(); api.resume(); } return ok; },
    header() { return { area: DISTRICT_NAMES[world.districtAt(player.pos.x, player.pos.z)] || "Marlowe Keys", clock: clockStr(), cash: "$" + hud.cash.toLocaleString("en-US") }; },
    brief() { return brief; },
    stats() {
      const mi = (m) => (m / 1609.34).toFixed(1) + " mi", tm = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? h + "h " + m + "m" : m + "m " + Math.floor(s % 60) + "s"; };
      return [["Time on the island", tm(stats.played)], ["On foot", mi(stats.foot)], ["Driven", mi(stats.drive)], ["Fast trips", stats.trips],
        ["Shots fired", stats.shots], ["People downed", stats.downed], ["Cars wrecked", stats.wrecks], ["Cars taken", stats.hijacks],
        ["Lamp posts flattened", stats.lamps], ["Hydrants burst", stats.hydrants], ["Times flatlined", stats.deaths], ["Hospital bills", "$" + stats.bills.toLocaleString("en-US")],
        ["Highest wanted", stats.maxWanted ? "\u2605".repeat(stats.maxWanted) : "None"], ["Times busted", stats.busted], ["Officers downed", stats.copsDowned]];
    },
    info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio, stage: perf.stage }; },
    rig, world, arsenal, vehicles, traffic, life, get peds() { return peds; }
  };
  window.__lowtide = api;   // handy in the console; tests drive the player through it
  input.onLock = (locked) => { if (o.onLock) o.onLock(locked); };
  api.resume();
  return api;
}
