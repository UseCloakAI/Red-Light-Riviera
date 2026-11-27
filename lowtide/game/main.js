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
import { BulletCam } from "./bulletcam.js?v=dev";
import { Interiors } from "./interiors.js?v=dev";
import { Police, STATION } from "./police.js?v=dev";
import { Gore } from "./gore.js?v=dev";
import { makeVoice } from "./voice.js?v=dev";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createHuman, lockStory } from "./human.js?v=dev";
import { HomeLife } from "./homelife.js?v=dev";
import { StreetLife } from "./streetlife.js?v=dev";
import { Drones, describe } from "./drones.js?v=dev";
import { DebugMenu } from "./debug.js?v=dev";
import { PS1, configure, makeBlit, crunch } from "./ps1.js?v=dev";
import { ROOMS_ON } from "./city/build.js?v=dev";

// the player: the character from the creator (MakeHuman, game/human.js); the Mixamo model is the fallback
async function loadCharacter(params) {
  try {
    if (params) { const h = await createHuman(lockStory(params)); return { scene: h.group, clips: h.clips, human: h }; }
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
  const ps1Load = SET.get("ps1") !== false;
  /* an old or integrated GPU (an older iMac, say): on Auto, start low. And when the game starts low, the
     things that can only be chosen at load go light too: no logarithmic depth (it writes depth per pixel,
     which turns off the GPU's early depth test), a shorter view, a smaller pool of people */
  const weakGPU = (() => { try { const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl"); const ext = gl && gl.getExtension("WEBGL_debug_renderer_info"); const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ""; gl && gl.getExtension("WEBGL_lose_context") && gl.getExtension("WEBGL_lose_context").loseContext();
    return /Intel|Iris|HD Graphics|Radeon (HD|R[579] M|Pro [45]\d\d)|GeForce (GT|9\d\d|[3-7]\d\dM)|Mali|Adreno|PowerVR|SwiftShader|llvmpipe/i.test(name) && !/Apple M|Radeon Pro [5-9]\d{3}/i.test(name) || (navigator.hardwareConcurrency || 8) <= 2; } catch (e) { return false; } })();
  // a machine Auto already found slow is remembered (Safari calls every Mac GPU "Apple GPU", so the name can't tell)
  let slowSeen = false; try { slowSeen = localStorage.getItem("lowtide_slow") === "1"; } catch (e) { /* private window */ }
  const lowLoad = SET.get("quality") === "low" || (SET.get("quality") !== "high" && (weakGPU || slowSeen));
  configure(innerWidth / innerHeight, ps1Load);   // before any material exists: the vertex snap goes into every shader
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", logarithmicDepthBuffer: !lowLoad, stencil: false })   // log depth: the flat layers a few cm apart never fight, near or far;
  const ratio = 1;
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  o.mount.appendChild(renderer.domElement);
  const rt = new THREE.WebGLRenderTarget(PS1.w, PS1.h, { type: lowLoad ? THREE.UnsignedByteType : THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: true });   // the PS1 blit samples texel centres, so linear is exact there
  const blit = makeBlit(); blit.mat.uniforms.tSrc.value = rt.texture;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, lowLoad ? 0.5 : 0.3, 2600);
  await step(0.12);

  const charP = loadCharacter(o.character);   // download while the city builds
  const sky = buildSky(scene, renderer);
  await step(0.25);
  const world = await buildWorld(scene, {});
  await step(0.7);
  const charM = await charP, player = new Player(scene, world, charM); player.human = charM && charM.human;
  const input = new Input(renderer.domElement);
  const rig = new CamRig(camera, world, player.yaw);
  const hud = new Hud(o.hud, world);
  player.onStep = (n, surface) => o.sfx && o.sfx.step && o.sfx.step(0.45 + n * 0.55, surface);
  player.onLand = (v) => o.sfx && o.sfx.step && o.sfx.step(Math.min(1.4, v / 6), player.surface);
  await step(0.82);
  // Stage 2: the people of Marlowe Keys
  let peds = null;
  const gore = new Gore(scene, world);
  const voice = makeVoice(o.sfx);   // eSpeak reads the lines (and does the screaming)
  if (o.sfx) o.sfx.scream = (who, dist) => voice.scream(who, dist);
  const heard = (pd) => (pd ? Math.hypot(pd.h.group.position.x - player.pos.x, pd.h.group.position.z - player.pos.z) : 0);
  const pedHooks = { gore, sfx: o.sfx, count: o.peds || (lowLoad ? 10 : 18), near: player.pos };   // the fight callbacks get filled in once there's a player to hit
  try { peds = await spawnPeds(scene, world, Object.assign(pedHooks, { onSpeak: (t, pd, mood) => { hud.subtitle(t); if (pd) voice.speak(t, pd.voice, heard(pd), mood); }, progress: (k) => o.progress && o.progress(0.82 + k * 0.14) })); }
  catch (e) { console.warn("Lowtide: pedestrians failed to load", e); }
  const cops = [];   // the Marlowe Keys PD: eight officers, kept out of sight until they're needed
  if (peds) try { for (let i = 0; i < (lowLoad ? 6 : 12); i++) { cops.push(await peds.makeCop()); await frame(); } } catch (e) { console.warn("Lowtide: police failed to load", e); }
  const npcs = [];   // the people behind counters, three of them, reused room to room
  if (peds) try { for (let i = 0; i < (lowLoad ? 3 : 6); i++) { npcs.push(await peds.makeNpc()); await frame(); } } catch (e) { console.warn("Lowtide: interior people failed to load", e); }
  let police = null;

  // Stage 3: weapons
  const arsenal = new Arsenal({ scene, camera, world, player, rig, hud, peds, sfx: o.sfx });
  // Stage 5, early: the parked cars drive
  const traffic = new Traffic(scene, world, { count: lowLoad ? 10 : 16, sfx: o.sfx });
  // the people at the wheel of the cars near you (real people, seated by vehicles.js)
  if (peds) try { for (let i = 0; i < (lowLoad ? 3 : 6); i++) { await peds.makeDriver(); await frame(); } } catch (e) { console.warn("Lowtide: drivers failed to load", e); }
  const vehicles = new Vehicles({ world, player, rig, camera, hud, peds, sfx: o.sfx, prompt: o.hud.querySelector(".prompt"), scene, fx: arsenal.fx, traffic, low: lowLoad });
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
  vehicles.onCarDestroyed = (c) => police.carDestroyed(c);
  // what the street knows about you: every moving car (for people crossing) and whether you've a gun out (people and drivers react)
  const armedNow = () => { const w = arsenal.weapon; return !!(w && !w.melee); };
  if (peds && peds.bind) peds.bind({ cars: () => vehicles.all().filter((c) => !c.hidden && (c.ai || c === vehicles.car || vehicles.dyn.has(c))), armed: armedNow });
  traffic.armed = armedNow;
  traffic.life = life; vehicles.life = life; life.gore = gore; if (peds) peds.fx = arsenal.fx;
  traffic.onImpact = (c, x, z, dx, dz, v) => vehicles.impactCar(c, x, z, dx, dz, v);
  // gunfire: drivers panic, and cars take rounds (enough of them and they go up)
  arsenal.onShot = (pos, hit) => {
    traffic.panic(pos.x, pos.z, 75, true);
    if (!hit || !hit.point) return;
    // the first car along the round's path takes it
    const all = vehicles.all(), dx = hit.point.x - pos.x, dz = hit.point.z - pos.z, L = Math.hypot(dx, dz);
    for (let t = 0.5; t < L; t += 0.35) {
      const x = pos.x + dx * t / L, z = pos.z + dz * t / L, y = pos.y + 1.4 + (hit.point.y - pos.y - 1.4) * t / L;
      const c = all.find((k) => k !== vehicles.car && !k.hidden && Math.abs(k.x - x) < 3 && Math.abs(k.z - z) < 3 && vehicles.touching(k, x, z, 0) && y < (k.y || 0) + (k.m ? k.m.cab.roof : 1.5));
      if (c) { c.byPlayerT = performance.now(); if (!c.wreck) vehicles.shot(c, x, y, z, dx / L, dz / L); break; }
    }
  };
  /* ---- what the pause menu shows: stats, the brief (everything said and shown), the clock ---- */
  const stats = { played: 0, foot: 0, drive: 0, shots: 0, downed: 0, deaths: 0, bills: 0, wrecks: 0, lamps: 0, hydrants: 0, trips: 0, hijacks: 0, maxWanted: 0, busted: 0, copsDowned: 0, headshots: 0 };
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
  let FOG0 = scene.fog.density; const FOG_HI = FOG0;
  const setFog = (k) => { const d = FOG0 * (1 - 0.72 * k); scene.fog.density = d; for (const u of fogMats) u.value = d; };
  const travel = new Travel({ world, player, rig, camera, blit, sfx: o.sfx || {}, hud, vehicles, life, setFog, onArrive: (sp) => { stats.trips++; hud.area = null; } });
  /* headshots: every one counts; the first, and every few after, rides the bullet cam */
  const bulletcam = new BulletCam({ scene, camera, rig, blit, sfx: o.sfx || {}, hud });
  let heads = 0, nextCine = 1;
  arsenal.onHeadshot = (hit, dir, muzzle, apply) => {
    heads++; stats.headshots++;
    if (heads < nextCine || bulletcam.active || travel.active || life.down || vehicles.driving) return false;
    nextCine = heads + 3 + ((Math.random() * 3) | 0);
    const pd = hit.ped;
    return bulletcam.start({ from: muzzle, to: hit.point, dir, apply, body: () => (pd.rag ? pd.rag.p[0] : pd.h.group.position) });
  };
  // interiors: nearly every building's door opens
  const interiors = new Interiors({ scene, world, player, rig, hud, sfx: o.sfx || {}, npcs, police, vehicles, root: o.hud, gore, fx: arsenal.fx,
    say: (t, pd) => { hud.subtitle(t); if (pd) voice.speak(t, pd.voice, heard(pd), "calm"); } });
  interiors.on = (e) => { if (e === "near-door") hud.tipOnce("door", "{E} goes in. Nearly every door on the island opens."); };
  // the police's hooks into everything else
  const homeLife = new HomeLife({ interiors, player, hud, sfx: o.sfx || {}, camera }); interiors.life = homeLife;
  hud.home = interiors.home || null; hud.blips = () => police.blips().concat(drones.blips()); travel.police = police; interiors.police = police; travel.interiors = interiors; arsenal.targets = () => police.targets().concat(drones.targets());
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
    "in-car": "{W} drives, {S} brakes and reverses, {A} {D} steer, {Space} is the handbrake. {E} gets out.",
    "near-person": "Hold {G} to talk to someone: the camera locks on them, then {Q} greets them and {E} taunts them."
  };
  vehicles.on = (e) => { if (TIPS[e]) hud.tipOnce(e, TIPS[e]); };
  // the street's small life: bins, litter, people sleeping rough, cats, and talking to people
  const HOLLIS = { female: true, pitch: 1.04, age: 30 };
  const street = new StreetLife({ scene, world, player, rig, peds, vehicles, sfx: o.sfx || {}, root: o.hud, low: lowLoad,
    say: (t, pd, mood) => { hud.subtitle(t); voice.speak(t, pd ? pd.voice : HOLLIS, pd ? heard(pd) : 0, mood); } });
  street.on = (e) => { if (TIPS[e]) hud.tipOnce(e, TIPS[e]); };
  try { await street.load(); await street.makePeople(); } catch (e) { console.warn("Lowtide: street life failed to load", e); }
  wrap(vehicles, "blast", (x, y, z) => street.blast(x, z));
  // the debug menu: hold 1 2 3 8 9 0 for three seconds
  const debug = new DebugMenu({ root: o.hud, input, police, arsenal, life, player, hud });
  // five stars: the drones (loudspeakers with your description, a citywide siren, strike drones that dive at you)
  const PA = { female: true, pitch: 0.82, age: 45 };
  const drones = new Drones({ scene, world, player, police, vehicles, life, hud, sfx: o.sfx || {}, rig, root: o.hud, low: lowLoad,
    describe: () => describe(player.human && player.human.p),
    say: (t, dist, radio) => { hud.subtitle((radio ? "" : "Police drone: ") + t); voice.speak(t, PA, 0, "calm", radio ? undefined : { pa: true }); } });
  { const shot1 = arsenal.onShot; arsenal.onShot = (pos, hit) => { shot1(pos, hit); street.scare(pos.x, pos.z, 35); }; }
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
  crunch(scene, SET.get("ps1") !== false);
  // people: sheen, clearcoat and the like are invisible at 270 lines and cost the biggest shaders; drop them so everyone shares a few small ones
  scene.traverse((m) => { const mt = m.material; if (mt && mt.isMeshPhysicalMaterial) { mt.sheen = 0; mt.clearcoat = 0; mt.iridescence = 0; mt.transmission = 0; mt.specularIntensity = 0.5; mt.needsUpdate = true; } });
  const blobGeo = new THREE.CircleGeometry(0.42, 10).rotateX(-Math.PI / 2), blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const blob = (g) => { const m = new THREE.Mesh(blobGeo, blobMat); m.position.y = 0.03; m.renderOrder = 3; g.add(m); };
  if (player.model) blob(player.model);
  if (peds) for (const pd of peds.peds) blob(pd.h.group);

  // warm up: compile every shader before the first real frame
  rig.update(0, input, player); sky.update(0, player.pos, camera.position);
  const seen = { calls: 0, tris: 0 };
  const draw = () => { vehicles.draw(Math.max(0, (performance.now() - (draw.t || performance.now())) / 1000)); draw.t = performance.now(); renderer.setRenderTarget(rt); renderer.render(scene, camera); seen.calls = renderer.info.render.calls; seen.tris = renderer.info.render.triangles; renderer.setRenderTarget(null); renderer.render(blit.scene, blit.cam); };
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
  const perf = { n: 0, sum: 0, stage: 0 }, work = { ms: 0, n: 0 };   // work: time spent per frame (for testing)
  /* quality. High: everything. Low: the picture drawn smaller and fewer people and cars about.
     Auto (the default): starts high and, if frames run slow after the warm-up, steps down (a smaller
     crowd, then low, then smaller still) and says so. The PS1 look off: the picture at the screen's own
     resolution, smooth textures, no colour cut (the vertex wobble goes on the next load). */
  const PEDS0 = peds ? peds.limit : 0, CARS0 = traffic.limit;
  let low = false, ps1 = SET.get("ps1") !== false;
  if (lowLoad && SET.get("quality") !== "low") perf.stage = 2;   // Auto on a weak GPU: start low
  const applyRes = () => {
    let w, h;
    if (ps1) { h = Math.round(PS1.h * (low ? 0.62 : 1)); w = Math.round(h * innerWidth / innerHeight / 2) * 2; }
    else { const k = low ? 0.45 : Math.min(1.5, devicePixelRatio || 1); w = Math.round(innerWidth * k); h = Math.round(innerHeight * k); }
    rt.setSize(w, h); blit.mat.uniforms.res.value.set(w, h); blit.mat.uniforms.uRetro.value = ps1 ? 1 : 0;
    /* low: the final pass draws only as many pixels as the picture has (tens of thousands, not millions on a
       big screen) and the browser stretches the canvas: hard pixels with the PS1 look, smooth without */
    const cv = renderer.domElement;
    if (low) { renderer.setSize(w, h, false); cv.style.imageRendering = ps1 ? "pixelated" : "auto"; }
    else { renderer.setSize(innerWidth, innerHeight, false); cv.style.imageRendering = ""; }
    cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
  };
  /* low: people in a plain lit material (no physical skin, normal or AO maps); the skin's own tone blend kept */
  const liteMat = (m) => {
    if (m.userData.lite) return m.userData.lite;
    const l = new THREE.MeshLambertMaterial({ map: m.map, color: m.color ? m.color.clone() : 0xffffff, alphaTest: m.alphaTest, transparent: m.transparent, depthWrite: m.depthWrite, side: m.side, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor });
    if (m.onBeforeCompile && m.userData.u) { l.onBeforeCompile = m.onBeforeCompile; l.customProgramCacheKey = () => "liteskin"; }
    l.userData.hi = m; m.userData.lite = l; return l;
  };
  const liteHumans = (on) => {
    scene.traverse((o) => {
      if (!o.isSkinnedMesh || Array.isArray(o.material)) return;
      const m = o.material;
      if (on && !m.isMeshLambertMaterial && (m.isMeshStandardMaterial)) { const l = liteMat(m); if (m.color && l.color) l.color.copy(m.color); o.material = l; }
      else if (!on && m.userData.hi) { if (m.color && m.userData.hi.color) m.userData.hi.color.copy(m.color); o.material = m.userData.hi; }
    });
  };
  /* low quality, everything that can change live: 30 frames a second steady (not 60 dropping to 20), a thicker
     haze and a shorter view (the far chunks of the city simply aren't drawn, and the sky dome comes in to fit),
     the plain windows, a coarse sea, far people animated every other frame, short reverbs */
  let fpsCap = 0, viewR = Infinity, cullT = 0;
  const lowKit = (on) => {
    fpsCap = on ? 30 : 0; viewR = on ? 300 : Infinity;
    FOG0 = on ? FOG_HI * 1.9 : FOG_HI; setFog(0);
    camera.far = on ? 800 : 2600; camera.updateProjectionMatrix(); if (sky.sky) sky.sky.scale.setScalar(on ? 0.42 : 1);
    ROOMS_ON.value = on ? 45 : 1e6;   // low: only nearby windows show their rooms, far ones are plain
    if (sky.seaDetail) sky.seaDetail(on);
    if (!on) liteHumans(false);
    if (peds) peds.lod = on; if (window.LT && LT.lowAudio) LT.lowAudio(on);
    if (!on) for (const m of world.chunks) m.visible = true;
  };
  /* static scenery drawn as instances (palms, trees, benches, bins, containers, poles): one batch each, so
     no culling; on low, each batch is compacted to the instances within the view, a few times a second */
  const dynamic = new Set([world.props.hydrantMesh, world.props.redMesh, world.props.greenMesh, ...vehicles.fleet.meshes, ...street.meshes, gore.splats, arsenal.fx.holes, arsenal.fx.brass, arsenal.fx.hulls]);
  if (world.props.lampMeshes) for (const k of ["pI", "hI", "lI"]) dynamic.add(world.props.lampMeshes[k]);
  const statics = [];
  scene.traverse((o) => { if (o.isInstancedMesh && !dynamic.has(o) && o.count > 8) { const n = o.count, m = new THREE.Matrix4(), c = new Float32Array(n * 2); for (let i = 0; i < n; i++) { o.getMatrixAt(i, m); c[i * 2] = m.elements[12]; c[i * 2 + 1] = m.elements[14]; } statics.push({ o, all: o.instanceMatrix.array.slice(), c, n }); } });
  const cull = (dt) => {   // the chunks past the view, hidden (checked a few times a second)
    if ((cullT -= dt) > 0) return; cullT = 0.25;
    if (viewR !== Infinity && (cull.k = (cull.k || 0) + 1) % 4 === 0) liteHumans(true);   // new people get the plain material within a second
    const cx = camera.position.x, cz = camera.position.z, R = viewR;
    if (R === Infinity) { if (cull.on) { cull.on = false; for (const S of statics) { S.o.instanceMatrix.array.set(S.all); S.o.count = S.n; S.o.instanceMatrix.needsUpdate = true; } } return; }
    cull.on = true;
    for (const m of world.chunks) { const sp = m.geometry.boundingSphere; m.visible = Math.hypot(sp.center.x - cx, sp.center.z - cz) - sp.radius < R; }
    const R2 = (R * 0.55) ** 2;   // small things go a little sooner
    for (const S of statics) {
      const arr = S.o.instanceMatrix.array; let k = 0;
      for (let i = 0; i < S.n; i++) { const dx = S.c[i * 2] - cx, dz = S.c[i * 2 + 1] - cz; if (dx * dx + dz * dz < R2) { if (k !== i) arr.set(S.all.subarray(i * 16, i * 16 + 16), k * 16); k++; } }
      S.o.count = k; S.o.instanceMatrix.needsUpdate = true;
    }
  };
  const crowd = (stage) => { const f = [1, 0.75, 0.55, 0.45][stage]; if (peds) peds.limit = Math.round(PEDS0 * f); traffic.limit = Math.round(CARS0 * f); };
  const applyQuality = () => {
    const q = SET.get("quality") || "auto";
    if (q === "high") { perf.stage = 0; low = false; crowd(0); try { localStorage.removeItem("lowtide_slow"); } catch (e) { /* */ } }
    else if (q === "low") { low = true; crowd(2); }
    else { low = perf.stage >= 2; crowd(perf.stage); }
    applyRes(); lowKit(low);
  };
  SET.on((k, v, S) => {
    if (k && k !== "quality" && k !== "ps1") return;
    if (k === "ps1" || k === null) { const on = S.ps1 !== false; if (on !== ps1) { ps1 = on; crunch(scene, on); } }
    if (k === "quality") perf.n = 0;
    applyQuality();
  });
  function adapt(dt) {   // auto: after a warm-up, measure; if slow, step quality down
    if ((SET.get("quality") || "auto") !== "auto" || perf.stage > 2) return;
    perf.n++; if (perf.n < 45) return;
    perf.sum += dt; if (perf.n < 135) return;
    const avg = perf.sum / 90; perf.n = 0; perf.sum = 0;
    if (avg < 0.022) return;
    perf.stage++; applyQuality();
    if (perf.stage === 2) try { localStorage.setItem("lowtide_slow", "1"); } catch (e) { /* not kept */ }
    if (perf.stage === 2) hud.tip("The game was running slow, so it switched to low quality. You can change that in Settings.");
    console.info("Lowtide quality step", perf.stage, "avg frame", (avg * 1000).toFixed(1), "ms");
  }
  /* the FPS readout (Settings > Show FPS): frames counted over half a second, top-left */
  const fpsEl = document.createElement("div");
  fpsEl.style.cssText = "position:fixed;left:8px;top:8px;z-index:60;font:600 12px/1 ui-monospace,Menlo,monospace;color:#9effa0;background:rgba(0,0,0,.55);padding:4px 6px;border-radius:4px;pointer-events:none;display:none";
  document.body.appendChild(fpsEl);
  let fpsN = 0, fpsT0 = 0;
  const fpsTick = (now) => {
    if (fpsEl.style.display === "none") return;
    fpsN++; if (!fpsT0) fpsT0 = now;
    if (now - fpsT0 >= 500) { const f = fpsN * 1000 / (now - fpsT0); fpsEl.textContent = Math.round(f) + " FPS  " + (1000 / f).toFixed(1) + " ms"; fpsN = 0; fpsT0 = now; }
  };
  SET.on((k, v, S) => { if (k && k !== "fps") return; fpsEl.style.display = S.fps ? "block" : "none"; fpsN = 0; fpsT0 = 0; fpsEl.textContent = "-- FPS"; });
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (fpsCap && last && now - last < 1000 / fpsCap - 3) return;   // low quality: a steady 30
    const dt = Math.min(fpsCap ? 0.07 : 0.05, (now - (last || now)) / 1000); last = now; t += dt;
    cull(dt); fpsTick(now); const w0 = performance.now();
    // the weapon wheel slows the world down; the camera and the wheel itself run at full speed
    // a car first (it may take E for the door), then the gun, unless you're driving
    clockMin += dt / 2; stats.played += dt;
    if (bulletcam.active) {   // riding the round: the world all but stops; it has the camera
      const ws = bulletcam.update(dt), d2 = dt * ws;
      if (bulletcam.active || ws !== 1) {
        traffic.update(d2, player, vehicles, peds); gore.update(d2); if (peds) peds.update(d2, player); if (police) police.update(d2);
        arsenal.tickFx(d2); player.animate(d2); sky.update(t, player.pos, camera.position); draw(); return;
      }
    }
    if (travel.active) {   // the sky camera has the picture; the island keeps living under it
      traffic.update(dt, player, vehicles, peds); gore.update(dt); vehicles.update(dt, { hit: () => false, down: () => false, keys: new Set() });
      player.animate(dt); if (peds) peds.update(dt, player);
      if (travel.update(dt)) { sky.update(t, player.pos, camera.position); draw(); return; }
      input.take(); rig.update(dt, input, player);   // landed: the follow camera takes over from here
    }
    const dw = dt * arsenal.timeScale * life.timeScale;
    let inCar = false;
    const px0 = player.pos.x, pz0 = player.pos.z;
    const indoors = !!interiors.inside;   // inside, the street holds still until you come back out
    if (!indoors) traffic.update(dw, player, vehicles, peds);
    life.update(dt, input, dw); gore.update(dw);
    // hold G to talk to someone (it takes Q and E while you do)
    const talking = street.update(dw, input, { onFoot: input.locked && !life.down && !vehicles.driving && !vehicles.busy && !homeLife.active && !interiors.watching, indoors });
    const usedDoor = input.locked && !life.down && !vehicles.driving && !talking && interiors.update(dt, input, camera);
    const down = life.down;   // dead or knocked flat: the body's a ragdoll, nobody's driving it
    if (input.locked && !down) { const used = usedDoor || interiors.watching || homeLife.active || (indoors ? false : vehicles.update(dw, input)); inCar = vehicles.driving; if (!inCar && !used && !talking) arsenal.update(dt, input); startTips(dt); }
    else if (down) { vehicles.update(dw, { hit: () => false, down: () => false, keys: new Set() }); arsenal.tickFx(dw); player.aimYaw = null; rig.aim = 0; }
    if (inCar) { player.aimYaw = null; rig.aim = 0; arsenal.tickFx(dt); }
    rig.car = vehicles.car;
    if (homeLife.active) { player.animate(dw); homeLife.pose(dt); }
    else if (interiors.watching) { interiors.watchStep(dt); player.animate(dw); interiors.poseWatcher(dt); }
    else if (input.locked && !inCar && !down && !vehicles.busy) { player.update(dw, input, rig.yaw); street.afterPlayer(dw); if (peds) peds.push(player.pos, 0.32, player.speed); traffic.push(player.pos, 0.32); }
    else if (!inCar && !down && !vehicles.busy) player.animate(dw);
    if (peds && !indoors) peds.update(dw, player);
    debug.update(dt);
    if (police && !indoors) police.update(dw);
    drones.update(dw, indoors);
    if (!input.locked || life.down || vehicles.driving) interiors.update(dt, { hit: () => false }, camera);
    rig.update(dt, input, player); interiors.watchCam(camera, dt); homeLife.cam(camera, dt);
    sky.update(t, player.pos, camera.position);
    hud.update(player, rig.yaw);
    { const m = Math.hypot(player.pos.x - px0, player.pos.z - pz0); if (m < 20) stats[inCar ? "drive" : "foot"] += m; }
    draw(); work.ms += performance.now() - w0; work.n++;
    adapt(dt);
  }
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyRes();
  });

  const api = { interiors,
    input, hud, player,
    resume() { if (running) return; running = true; last = 0; input.active = true; raf = requestAnimationFrame(loop); interiors.pauseTV(false); },
    pause() { running = false; cancelAnimationFrame(raf); input.active = false; input.keys.clear(); interiors.pauseTV(true); },
    lock() { input.lock(); },
    drawMap(ctx, w, h, opt = {}) { return hud.drawFull(ctx, w, h, player, Object.assign({ hospital: HOSPITAL, station: STATION, home: interiors.home }, opt)); },
    get police() { return police; }, get street() { return street; }, get __drones() { return drones; }, get debug() { return debug; },
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
        ["Headshots", stats.headshots], ["Highest wanted", stats.maxWanted ? "\u2605".repeat(stats.maxWanted) : "None"], ["Times busted", stats.busted], ["Officers downed", stats.copsDowned]];
    },
    work() { const r = work.n ? work.ms / work.n : 0; work.ms = 0; work.n = 0; return r; },
    info() { return { calls: seen.calls, tris: seen.tris, ratio, stage: perf.stage }; },
    rig, world, arsenal, vehicles, traffic, life, gore, get peds() { return peds; }
  };
  window.__lowtide = api;   // handy in the console; tests drive the player through it
  input.onLock = (locked) => { if (o.onLock) o.onLock(locked); };
  api.resume();
  return api;
}
