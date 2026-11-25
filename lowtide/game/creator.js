/* The character creator. A studio at dusk, the character in idle, and a panel
   of sliders and pickers driving game/human.js. Everything updates live; the
   result is saved and becomes the player in Story Mode. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadHumanData, Human, HOLLIS, SWATCHES } from "./human.js?v=dev";

const KEY = "lowtide_character";
export function savedCharacter() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }

const pct = (v) => Math.round(v * 100) + "%";
const signed = (v) => (v > 0 ? "+" : "") + Math.round(v * 100);

export async function openCreator(o) {
  const root = o.root, D = await loadHumanData();
  const start = Object.assign(JSON.parse(JSON.stringify(HOLLIS)), savedCharacter() || {});
  let p = JSON.parse(JSON.stringify(start));
  if (o.progress) o.progress(0.6);

  /* ---------- the studio ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.querySelector(".cc-view").appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.4; pm.dispose();
  // backdrop: a curved sweep fading from dusk violet to night
  const sweep = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: "varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec3 vP;void main(){float h=normalize(vP).y;vec3 c=mix(vec3(.16,.06,.16),vec3(.03,.035,.07),smoothstep(-.05,.45,h));c+=vec3(.5,.16,.22)*exp(-abs(h+.02)*9.)*.35;gl_FragColor=vec4(c,1.);}"
  }));
  scene.add(sweep);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1520, roughness: 0.85 }));
  floor.receiveShadow = true; scene.add(floor);
  const key = new THREE.DirectionalLight(0xffe4cc, 2.7); key.position.set(-2.2, 3.6, 3.4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.4, bottom: -0.2, near: 0.5, far: 12 });
  const rim = new THREE.DirectionalLight(0xff5f8f, 1.7); rim.position.set(2.5, 2.6, -3.2);
  const rim2 = new THREE.DirectionalLight(0xffa860, 1.2); rim2.position.set(-3, 1.8, -2.5);
  const fill = new THREE.DirectionalLight(0x8ea6ff, 0.55); fill.position.set(3.5, 1.2, 2.5);
  scene.add(key, rim, rim2, fill);
  const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.05, 100);

  const human = new Human(D, p);
  scene.add(human.group);
  const mixer = new THREE.AnimationMixer(human.group);
  let action = null;
  const playIdle = () => {
    const t = action ? action.time : 0;
    mixer.stopAllAction(); mixer.uncacheRoot(human.group);
    action = mixer.clipAction(human.clips.find((c) => c.name === "idle")); action.play(); action.time = t;
  };
  playIdle();
  if (o.progress) o.progress(0.9);

  /* ---------- the panel ---------- */
  const proxies = (kind) => D.meta.proxies.filter((x) => x.kind === kind).map((x) => ({ id: x.id, label: x.label }));
  const eyeNames = Object.keys(D.meta.eyeColors);
  const detail = (group) => D.meta.local.filter((l) => l.group === group).map((l) => ({ type: "slider", label: l.label, min: -1, max: 1, step: 0.01, path: ["detail", l.key], fmt: signed }));
  const TABS = [
    { id: "heritage", label: "Heritage", cam: "body", rows: [
      { type: "slider", label: "African", min: 0, max: 1, step: 0.01, path: ["african"], fmt: (v) => share(v) },
      { type: "slider", label: "Asian", min: 0, max: 1, step: 0.01, path: ["asian"], fmt: (v) => share(v) },
      { type: "slider", label: "European", min: 0, max: 1, step: 0.01, path: ["caucasian"], fmt: (v) => share(v) },
      { type: "slider", label: "Skin tone", min: -1, max: 1, step: 0.01, path: ["tone"], fmt: signed }] },
    { id: "body", label: "Body", cam: "body", rows: [
      { type: "slider", label: "Sex", min: 0, max: 1, step: 0.01, path: ["sex"], fmt: (v) => (v < 0.35 ? "Feminine" : v > 0.65 ? "Masculine" : "Between") },
      { type: "slider", label: "Age", min: 25, max: 80, step: 1, path: ["age"], fmt: (v) => v + " yrs" },
      { type: "slider", label: "Height", min: 0.15, max: 0.85, step: 0.01, path: ["height"], fmt: () => (human.height ? human.height.toFixed(2) + " m" : "") },
      { type: "slider", label: "Build", min: 0.1, max: 0.95, step: 0.01, path: ["weight"], fmt: pct },
      { type: "slider", label: "Muscle", min: 0.1, max: 0.95, step: 0.01, path: ["muscle"], fmt: pct },
      { type: "slider", label: "Proportions", min: 0.2, max: 0.9, step: 0.01, path: ["proportions"], fmt: pct },
      ...detail("body")] },
    { id: "face", label: "Face", cam: "face", rows: detail("face") },
    { id: "hair", label: "Hair", cam: "face", rows: [
      { type: "pick", label: "Hair", path: ["hair"], options: proxies("hair") },
      { type: "swatch", label: "Hair colour", path: ["hairColor"], colors: SWATCHES.hair },
      { type: "pick", label: "Brows", path: ["brows"], options: proxies("brows").map((b, i) => ({ id: b.id, label: "Style " + (i + 1) })) },
      { type: "swatch", label: "Brow colour", path: ["browColor"], colors: SWATCHES.brow }] },
    { id: "eyes", label: "Eyes", cam: "face", rows: [
      { type: "pick", label: "Eye colour", path: ["eyes"], options: eyeNames.map((n) => ({ id: n, label: n.replace(/(light|deep)/, " $1").replace(/^./, (c) => c.toUpperCase()).trim() })) }] },
    { id: "style", label: "Style", cam: "body", rows: [
      { type: "pick", label: "Outfit", path: ["outfit"], options: proxies("outfit") },
      { type: "pick", label: "Shoes", path: ["shoes"], options: proxies("shoes") },
      { type: "pick", label: "Hat", path: ["hat"], options: [{ id: null, label: "None" }, ...proxies("hat")] }] }
  ];
  function share(v) { const t = p.african + p.asian + p.caucasian || 1; return Math.round((v / t) * 100) + "%"; }
  const get = (path) => path.reduce((o, k) => (o == null ? undefined : o[k]), p) ?? 0;
  const set = (path, v) => { let o = p; for (let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {}; o[path[path.length - 1]] = v; };

  const tabsEl = root.querySelector(".cc-tabs"), listEl = root.querySelector(".cc-rows"), ink = root.querySelector(".cc-ink");
  let tab = 0, row = 0, camMode = "body";
  tabsEl.innerHTML = TABS.map((t, i) => `<button data-i="${i}">${t.label}</button>`).join("");
  tabsEl.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => showTab(+b.dataset.i)));

  function rowHtml(r, i) {
    const v = get(r.path);
    if (r.type === "slider") return `<div class="cc-row" data-i="${i}"><label>${r.label}<b>${r.fmt ? r.fmt(v) : v}</b></label><input type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}" aria-label="${r.label}"></div>`;
    if (r.type === "pick") { const k = Math.max(0, r.options.findIndex((x) => x.id === (v || null))); return `<div class="cc-row pick" data-i="${i}"><label>${r.label}</label><div class="cc-pick"><button class="prev" aria-label="Previous">‹</button><span>${r.options[k] ? r.options[k].label : ""}</span><button class="next" aria-label="Next">›</button></div></div>`; }
    return `<div class="cc-row sw" data-i="${i}"><label>${r.label}</label><div class="cc-sw">${r.colors.map((c) => `<button style="background:${c}" data-c="${c}" class="${c === v ? "on" : ""}" aria-label="${c}"></button>`).join("")}</div></div>`;
  }
  function showTab(i) {
    tab = (i + TABS.length) % TABS.length; row = 0;
    const T = TABS[tab]; camMode = T.cam;
    tabsEl.querySelectorAll("button").forEach((b, k) => b.classList.toggle("sel", k === tab));
    const b = tabsEl.children[tab]; ink.style.transform = `translateX(${b.offsetLeft}px) scaleX(${b.offsetWidth})`;
    listEl.innerHTML = T.rows.map(rowHtml).join("");
    listEl.querySelectorAll(".cc-row").forEach((el) => wire(el, T.rows[+el.dataset.i]));
    focusRow(0);
    listEl.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
    if (o.sfx) o.sfx("tab");
  }
  function focusRow(i) {
    const rows = listEl.querySelectorAll(".cc-row"); if (!rows.length) return;
    row = (i + rows.length) % rows.length;
    rows.forEach((el, k) => el.classList.toggle("sel", k === row));
    rows[row].scrollIntoView({ block: "nearest" });
  }
  function refreshLabel(el, r) { const b = el.querySelector("label b"); if (b) b.textContent = r.fmt ? r.fmt(get(r.path)) : get(r.path); }
  function wire(el, r) {
    el.addEventListener("pointerenter", () => focusRow(+el.dataset.i));
    if (r.type === "slider") {
      const inp = el.querySelector("input");
      inp.addEventListener("input", () => { set(r.path, +inp.value); refreshLabel(el, r); schedule(); });
      inp.addEventListener("change", () => schedule(true));
    } else if (r.type === "pick") {
      const step = (d) => { const cur = get(r.path) || null; let k = r.options.findIndex((x) => x.id === cur); k = (k + d + r.options.length) % r.options.length; set(r.path, r.options[k].id); el.querySelector("span").textContent = r.options[k].label; schedule(true); if (o.sfx) o.sfx("move"); };
      el.querySelector(".prev").addEventListener("click", () => step(-1)); el.querySelector(".next").addEventListener("click", () => step(1));
      el._step = step;
    } else {
      el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { set(r.path, b.dataset.c); el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); schedule(true); if (o.sfx) o.sfx("move"); }));
      el._step = (d) => { const i = r.colors.indexOf(get(r.path)); const c = r.colors[(i + d + r.colors.length) % r.colors.length]; el.querySelector(`button[data-c="${c}"]`).click(); };
    }
  }
  function nudge(d) {
    const el = listEl.querySelectorAll(".cc-row")[row], r = TABS[tab].rows[row]; if (!el) return;
    if (r.type === "slider") { const inp = el.querySelector("input"); inp.value = Math.min(r.max, Math.max(r.min, +inp.value + d * (r.max - r.min) / 20)); inp.dispatchEvent(new Event("input")); schedule(true); }
    else el._step(d);
  }

  /* ---------- live rebuild ---------- */
  let pending = false, full = false, clipT = 0;
  function schedule(final) {
    if (final) full = true;
    if (pending) return; pending = true;
    requestAnimationFrame(() => {
      pending = false;
      human.update(p);
      clearTimeout(clipT); clipT = setTimeout(playIdle, full ? 0 : 140); full = false;
      listEl.querySelectorAll(".cc-row").forEach((el) => { const r = TABS[tab].rows[+el.dataset.i]; if (r.type === "slider") refreshLabel(el, r); });
    });
  }
  function randomize() {
    const R = Math.random, g = () => (R() + R() + R()) / 3;
    const her = [R() ** 2, R() ** 2, R() ** 2];
    p.african = her[0]; p.asian = her[1]; p.caucasian = her[2]; p.tone = (R() - 0.5) * 0.5;
    p.sex = R() < 0.5 ? R() * 0.25 : 0.75 + R() * 0.25; p.age = Math.round(25 + R() * R() * 55);
    p.height = 0.3 + g() * 0.4; p.weight = 0.25 + g() * 0.55; p.muscle = 0.25 + g() * 0.55; p.proportions = 0.35 + g() * 0.45;
    p.detail = {}; for (const l of D.meta.local) p.detail[l.key] = (g() - 0.5) * 1.1;
    const pick = (a) => a[(R() * a.length) | 0];
    p.hair = pick(proxies("hair")).id; p.hairColor = pick(SWATCHES.hair.slice(0, p.age > 55 ? 10 : 7)); if (p.age > 62 && R() < 0.6) p.hairColor = pick(["#8b8a86", "#d8d5cf"]);
    p.brows = pick(proxies("brows")).id; p.browColor = pick(SWATCHES.brow); p.eyes = pick(eyeNames);
    p.outfit = pick(proxies("outfit")).id; p.shoes = pick(proxies("shoes")).id; p.hat = R() < 0.15 ? "fedora01" : null;
    schedule(true); showTab(tab); if (o.sfx) o.sfx("select");
  }

  /* ---------- camera, orbit, loop ---------- */
  let spin = 0.35, spinV = 0, drag = null, zoom = 0;
  const view = root.querySelector(".cc-view");
  view.addEventListener("pointerdown", (e) => { drag = e.clientX; view.setPointerCapture(e.pointerId); });
  view.addEventListener("pointermove", (e) => { if (drag != null) { spinV = (e.clientX - drag) * 0.01; spin += spinV; drag = e.clientX; } });
  view.addEventListener("pointerup", () => { drag = null; });
  view.addEventListener("wheel", (e) => { zoom = Math.max(-0.6, Math.min(0.6, zoom + e.deltaY * 0.0015)); e.preventDefault(); }, { passive: false });
  const cur = { pos: new THREE.Vector3(0.9, 1.0, 6.2), look: new THREE.Vector3(0, 0.92, 0) };
  let running = true, last = performance.now(), raf = 0;
  function frame(now) {
    if (!running) return; raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (drag == null) { spinV *= 0.92; spin += spinV; }
    human.group.rotation.y = spin;
    const head = human.headPosition(), face = camMode === "face";
    const lookT = face ? new THREE.Vector3(0, head.y + 0.08, 0) : new THREE.Vector3(0, human.height * 0.52, 0);
    const dist = (face ? 1.2 : 4.7) * (1 + zoom), side = face ? 0.12 : 0.45;
    const posT = new THREE.Vector3(side, lookT.y + (face ? 0.02 : 0.08), dist);
    const k = 1 - Math.exp(-dt * 6);
    cur.pos.lerp(posT, k); cur.look.lerp(lookT, k);
    camera.position.copy(cur.pos); camera.lookAt(cur.look);
    // keep the character in the right two thirds of the frame, clear of the panel
    camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.14, 0, innerWidth, innerHeight);
    key.target.position.set(0, 1, 0);
    mixer.update(dt);
    renderer.render(scene, camera);
  }
  const onResize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener("resize", onResize);

  const onKey = (e) => {
    if (!running) return;
    const k = e.key;
    if (k === "q" || k === "Q") showTab(tab - 1);
    else if (k === "e" || k === "E") showTab(tab + 1);
    else if (k === "ArrowDown") { focusRow(row + 1); e.preventDefault(); }
    else if (k === "ArrowUp") { focusRow(row - 1); e.preventDefault(); }
    else if (k === "ArrowLeft") { nudge(-1); e.preventDefault(); }
    else if (k === "ArrowRight") { nudge(1); e.preventDefault(); }
    else if (k === "r" || k === "R") randomize();
    else if (k === "Enter") done();
    else if (k === "Escape") cancel();
  };
  addEventListener("keydown", onKey);
  root.querySelector(".cc-random").onclick = randomize;
  root.querySelector(".cc-reset").onclick = () => { p = JSON.parse(JSON.stringify(HOLLIS)); schedule(true); showTab(tab); };
  root.querySelector(".cc-done").onclick = () => done();

  let resolveDone;
  const result = new Promise((r) => (resolveDone = r));
  function close() {
    running = false; cancelAnimationFrame(raf); removeEventListener("keydown", onKey); removeEventListener("resize", onResize);
    human.dispose(); renderer.dispose(); renderer.domElement.remove();
  }
  function done() { save(p); if (o.sfx) o.sfx("select"); close(); resolveDone(p); }
  function cancel() { if (o.sfx) o.sfx("back"); close(); resolveDone(null); }

  showTab(0);
  requestAnimationFrame(frame);
  return result;
}
