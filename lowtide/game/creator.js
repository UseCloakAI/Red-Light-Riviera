/* The character creator. A studio at dusk, the character in idle, and a panel
   driving game/human.js. Two modes, saved separately:
   - Story: Hollis Vane is a fixed person. Only looks (hair, outfit, shoes, hat) change.
   - Online: start from a preset, then shape everything. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadHumanData, Human, HOLLIS, SWATCHES, lockStory } from "./human.js?v=dev";

const KEY = { story: "lowtide_character", online: "lowtide_online_character" };
const load = (k) => { try { const s = localStorage.getItem(KEY[k]); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const store = (k, p) => { try { localStorage.setItem(KEY[k], JSON.stringify(p)); } catch (e) {} };
export function savedCharacter() { const s = load("story"); return s ? lockStory(s) : null; }
export function savedOnlineCharacter() { return load("online"); }

const base = (o) => Object.assign(JSON.parse(JSON.stringify(HOLLIS)), o, { detail: Object.assign({}, o.detail || {}) });
/* Online presets: finished people to start from. sex 0 = feminine, 1 = masculine. */
export const PRESETS = [
  { name: "Marcus Dell", tag: "Dock worker", p: base({ sex: 1, age: 34, muscle: 0.78, weight: 0.6, height: 0.62, proportions: 0.6, african: 0.85, asian: 0, caucasian: 0.15, tone: -0.1, hair: "short02", hairColor: "#120d0a", eyes: "brown", brows: "eyebrow003", browColor: "#120d0a", outfit: "male_worksuit01", shoes: "shoes05", hat: null, detail: { jaw: 0.45, chin_width: 0.3, neck: 0.3, shoulders: 0.4 } }) },
  { name: "Mei Tanaka", tag: "Socialite", p: base({ sex: 0, age: 29, muscle: 0.4, weight: 0.32, height: 0.5, proportions: 0.75, african: 0, asian: 0.85, caucasian: 0.15, tone: 0.15, hair: "bob01", hairColor: "#120d0a", eyes: "brown", brows: "eyebrow010", browColor: "#120d0a", outfit: "female_elegantsuit01", shoes: "shoes03", hat: null, detail: { cheekbones: 0.35, face_fullness: -0.2, lower_lip: 0.25 } }) },
  { name: "Jake Rourke", tag: "Street racer", p: base({ sex: 1, age: 24, muscle: 0.55, weight: 0.4, height: 0.55, proportions: 0.65, african: 0, asian: 0.2, caucasian: 0.8, tone: 0.05, hair: "short04", hairColor: "#5a3d27", eyes: "bluegreen", brows: "eyebrow006", browColor: "#3a2a20", outfit: "male_casualsuit03", shoes: "shoes01", hat: null, detail: { jaw: 0.15, nose_bridge: 0.2 } }) },
  { name: "Nia Okafor", tag: "Runner", p: base({ sex: 0, age: 26, muscle: 0.65, weight: 0.3, height: 0.6, proportions: 0.7, african: 0.8, asian: 0, caucasian: 0.2, tone: -0.15, hair: "ponytail01", hairColor: "#120d0a", eyes: "brown", brows: "eyebrow002", browColor: "#120d0a", outfit: "female_sportsuit01", shoes: "shoes06", hat: null, detail: { cheekbones: 0.4, face_length: 0.15 } }) },
  { name: "Walter Price", tag: "Old money", p: base({ sex: 1, age: 63, muscle: 0.4, weight: 0.55, height: 0.58, proportions: 0.55, african: 0, asian: 0, caucasian: 1, tone: 0.1, hair: "short01", hairColor: "#d8d5cf", eyes: "grey", brows: "eyebrow008", browColor: "#9a9690", outfit: "male_elegantsuit01", shoes: "shoes02", hat: "fedora01", detail: { face_fullness: 0.15, nose_length: 0.2, ears: 0.15 } }) },
  { name: "Rosa Vega", tag: "Bartender", p: base({ sex: 0, age: 38, muscle: 0.45, weight: 0.5, height: 0.45, proportions: 0.6, african: 0.15, asian: 0.1, caucasian: 0.75, tone: -0.2, hair: "braid01", hairColor: "#2a1c14", eyes: "brownlight", brows: "eyebrow005", browColor: "#2a1d16", outfit: "female_casualsuit02", shoes: "shoes04", hat: null, detail: { mouth_width: 0.2, upper_lip: 0.2 } }) },
  { name: "Dmitri Volkov", tag: "Enforcer", p: base({ sex: 1, age: 45, muscle: 0.7, weight: 0.78, height: 0.72, proportions: 0.45, african: 0, asian: 0.05, caucasian: 0.95, tone: 0.15, hair: "short03", hairColor: "#7a5634", eyes: "ice", brows: "eyebrow001", browColor: "#5a3d27", outfit: "male_casualsuit06", shoes: "shoes05", hat: null, detail: { jaw: 0.5, brow_height: -0.25, neck: 0.5, belly: 0.3 } }) },
  { name: "Jess Harlow", tag: "Drifter", p: base({ sex: 0, age: 33, muscle: 0.5, weight: 0.4, height: 0.55, proportions: 0.6, african: 0.3, asian: 0.2, caucasian: 0.5, tone: 0, hair: "long01", hairColor: "#a37a4c", eyes: "green", brows: "eyebrow011", browColor: "#5a3d27", outfit: "female_casualsuit01", shoes: "shoes01", hat: null, detail: { eye_size: 0.15, chin: 0.1 } }) }
];
/* Story looks: outfits for Hollis, nothing about the body. */
const LOOKS = [
  { name: "Harbour", tag: "Default", p: { hair: "ponytail01", hairColor: "#3b2a20", outfit: "male_casualsuit05", shoes: "shoes02", hat: null } },
  { name: "Night out", tag: "Formal", p: { hair: "bob02", hairColor: "#3b2a20", outfit: "female_elegantsuit01", shoes: "shoes03", hat: null } },
  { name: "On the job", tag: "Work", p: { hair: "short02", hairColor: "#2a1c14", outfit: "male_worksuit01", shoes: "shoes05", hat: null } },
  { name: "Low profile", tag: "Casual", p: { hair: "braid01", hairColor: "#2a1c14", outfit: "female_casualsuit01", shoes: "shoes01", hat: "fedora01" } }
];

const pct = (v) => Math.round(v * 100) + "%";
const signed = (v) => (v > 0 ? "+" : "") + Math.round(v * 100);

export async function openCreator(o) {
  const root = o.root, D = await loadHumanData();
  const chars = { story: savedCharacter() || lockStory(null), online: savedOnlineCharacter() || JSON.parse(JSON.stringify(PRESETS[0].p)) };
  let mode = o.mode === "online" ? "online" : "story", p = chars[mode];
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
  const hairRows = [
    { type: "pick", label: "Hair", path: ["hair"], options: proxies("hair") },
    { type: "swatch", label: "Hair colour", path: ["hairColor"], colors: SWATCHES.hair }];
  const styleRows = [
    { type: "pick", label: "Outfit", path: ["outfit"], options: proxies("outfit") },
    { type: "pick", label: "Shoes", path: ["shoes"], options: proxies("shoes") },
    { type: "pick", label: "Hat", path: ["hat"], options: [{ id: null, label: "None" }, ...proxies("hat")] }];
  const MODES = {
    story: [
      { id: "looks", label: "Looks", cam: "body", rows: [
        { type: "presets", list: LOOKS },
        { type: "note", text: "Hollis is set by the story. Body, face and height stay as they are; hair and clothes are yours." }] },
      { id: "hair", label: "Hair", cam: "face", rows: hairRows },
      { id: "style", label: "Clothes", cam: "body", rows: styleRows }],
    online: [
      { id: "presets", label: "Presets", cam: "body", rows: [{ type: "presets", list: PRESETS }] },
      { id: "body", label: "Body", cam: "body", rows: [
        { type: "slider", label: "Sex", min: 0, max: 1, step: 0.01, path: ["sex"], fmt: (v) => (v < 0.35 ? "Feminine" : v > 0.65 ? "Masculine" : "Between") },
        { type: "slider", label: "Age", min: 25, max: 80, step: 1, path: ["age"], fmt: (v) => v + " yrs" },
        { type: "slider", label: "Height", min: 0.15, max: 0.85, step: 0.01, path: ["height"], fmt: () => (human.height ? human.height.toFixed(2) + " m" : "") },
        { type: "slider", label: "Build", min: 0.1, max: 0.95, step: 0.01, path: ["weight"], fmt: pct },
        { type: "slider", label: "Muscle", min: 0.1, max: 0.95, step: 0.01, path: ["muscle"], fmt: pct },
        { type: "slider", label: "Skin tone", min: -1, max: 1, step: 0.01, path: ["tone"], fmt: signed },
        { type: "more", label: "Heritage and proportions", rows: [
          { type: "slider", label: "African", min: 0, max: 1, step: 0.01, path: ["african"], fmt: (v) => share(v) },
          { type: "slider", label: "Asian", min: 0, max: 1, step: 0.01, path: ["asian"], fmt: (v) => share(v) },
          { type: "slider", label: "European", min: 0, max: 1, step: 0.01, path: ["caucasian"], fmt: (v) => share(v) },
          { type: "slider", label: "Proportions", min: 0.2, max: 0.9, step: 0.01, path: ["proportions"], fmt: pct },
          ...detail("body")] }] },
      { id: "face", label: "Face", cam: "face", rows: [
        { type: "pick", label: "Eye colour", path: ["eyes"], options: eyeNames.map((n) => ({ id: n, label: n.replace(/(light|deep)/, " $1").replace(/^./, (c) => c.toUpperCase()).trim() })) },
        { type: "pick", label: "Brows", path: ["brows"], options: proxies("brows").map((b, i) => ({ id: b.id, label: "Style " + (i + 1) })) },
        { type: "swatch", label: "Brow colour", path: ["browColor"], colors: SWATCHES.brow },
        ...["face_width", "face_fullness", "cheekbones", "jaw", "chin", "nose_width", "mouth_width", "eye_size"].map((k) => detail("face").find((r) => r.path[1] === k)).filter(Boolean),
        { type: "more", label: "All face detail", rows: detail("face").filter((r) => !["face_width", "face_fullness", "cheekbones", "jaw", "chin", "nose_width", "mouth_width", "eye_size"].includes(r.path[1])) }] },
      { id: "hair", label: "Hair", cam: "face", rows: hairRows },
      { id: "style", label: "Clothes", cam: "body", rows: styleRows }]
  };
  let TABS = MODES[mode];
  function share(v) { const t = p.african + p.asian + p.caucasian || 1; return Math.round((v / t) * 100) + "%"; }
  const get = (path) => path.reduce((o, k) => (o == null ? undefined : o[k]), p) ?? 0;
  const set = (path, v) => { let o = p; for (let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {}; o[path[path.length - 1]] = v; };

  const tabsEl = root.querySelector(".cc-tabs"), listEl = root.querySelector(".cc-rows"), ink = root.querySelector(".cc-ink");
  const modeEl = root.querySelector(".cc-mode"), titleEl = root.querySelector(".cc-title"), kickerEl = root.querySelector(".cc-kicker");
  let tab = 0, row = 0, camMode = "body", rows = [], openMore = {}, presetName = { story: "Hollis Vane", online: (savedOnlineCharacter() && savedOnlineCharacter().name) || PRESETS[0].name };

  function buildTabs() {
    tabsEl.innerHTML = TABS.map((t, i) => `<button data-i="${i}">${t.label}</button>`).join("");
    tabsEl.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => showTab(+b.dataset.i)));
  }
  function setMode(m, quiet) {
    mode = m; p = chars[m]; TABS = MODES[m];
    modeEl.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", b.dataset.m === m));
    kickerEl.textContent = m === "story" ? "Story Mode" : "Lowtide Online";
    titleEl.textContent = m === "story" ? "Hollis Vane" : presetName.online;
    root.querySelector(".cc-random").hidden = false;
    buildTabs(); schedule(true); showTab(0, quiet);
  }
  modeEl.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { if (b.dataset.m !== mode) setMode(b.dataset.m); }));

  function flat(list) { const out = []; for (const r of list) { out.push(r); if (r.type === "more" && openMore[r.label]) out.push(...r.rows); } return out; }
  function rowHtml(r, i) {
    const v = r.path ? get(r.path) : null;
    if (r.type === "slider") return `<div class="cc-row" data-i="${i}"><label>${r.label}<b>${r.fmt ? r.fmt(v) : v}</b></label><input type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}" aria-label="${r.label}"></div>`;
    if (r.type === "pick") { const k = Math.max(0, r.options.findIndex((x) => x.id === (v || null))); return `<div class="cc-row pick" data-i="${i}"><label>${r.label}</label><div class="cc-pick"><button class="prev" aria-label="Previous">‹</button><span>${r.options[k] ? r.options[k].label : ""}</span><button class="next" aria-label="Next">›</button></div></div>`; }
    if (r.type === "presets") return `<div class="cc-row presets" data-i="${i}"><div class="cc-cards">${r.list.map((x, k) => `<button data-k="${k}" class="${x.name === presetName[mode] || (mode === "story" && matchLook(x)) ? "on" : ""}"><b>${x.name}</b><span>${x.tag}</span></button>`).join("")}</div></div>`;
    if (r.type === "note") return `<div class="cc-row note" data-i="${i}"><p>${r.text}</p></div>`;
    if (r.type === "more") return `<div class="cc-row more" data-i="${i}"><button aria-expanded="${!!openMore[r.label]}">${openMore[r.label] ? "Hide" : "Show"} ${r.label.toLowerCase()}<i>${openMore[r.label] ? "−" : "+"}</i></button></div>`;
    return `<div class="cc-row sw" data-i="${i}"><label>${r.label}</label><div class="cc-sw">${r.colors.map((c) => `<button style="background:${c}" data-c="${c}" class="${c === v ? "on" : ""}" aria-label="${c}"></button>`).join("")}</div></div>`;
  }
  const matchLook = (x) => Object.keys(x.p).every((k) => (p[k] ?? null) === x.p[k]);
  function renderRows() {
    rows = flat(TABS[tab].rows);
    listEl.innerHTML = rows.map(rowHtml).join("");
    listEl.querySelectorAll(".cc-row").forEach((el) => wire(el, rows[+el.dataset.i]));
  }
  function showTab(i, quiet) {
    tab = (i + TABS.length) % TABS.length; row = 0;
    const T = TABS[tab]; camMode = T.cam;
    tabsEl.querySelectorAll("button").forEach((b, k) => b.classList.toggle("sel", k === tab));
    const b = tabsEl.children[tab]; ink.style.transform = `translateX(${b.offsetLeft}px) scaleX(${b.offsetWidth})`;
    renderRows(); focusRow(0);
    listEl.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
    if (o.sfx && !quiet) o.sfx("tab");
  }
  function focusRow(i) {
    const els = listEl.querySelectorAll(".cc-row"); if (!els.length) return;
    row = (i + els.length) % els.length;
    els.forEach((el, k) => el.classList.toggle("sel", k === row));
    els[row].scrollIntoView({ block: "nearest" });
  }
  function refreshLabel(el, r) { const b = el.querySelector("label b"); if (b) b.textContent = r.fmt ? r.fmt(get(r.path)) : get(r.path); }
  function applyPreset(x) {
    if (mode === "story") Object.assign(p, x.p);
    else { chars.online = p = JSON.parse(JSON.stringify(x.p)); presetName.online = x.name; titleEl.textContent = x.name; }
    schedule(true); renderRows(); focusRow(row); if (o.sfx) o.sfx("select");
  }
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
    } else if (r.type === "presets") {
      el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => applyPreset(r.list[+b.dataset.k])));
      el._step = (d) => { const btns = [...el.querySelectorAll("button")]; const k = Math.max(0, btns.findIndex((b) => b.classList.contains("on"))); applyPreset(r.list[(k + d + r.list.length) % r.list.length]); };
    } else if (r.type === "more") {
      const toggle = () => { openMore[r.label] = !openMore[r.label]; const at = row; renderRows(); focusRow(at); if (o.sfx) o.sfx("move"); };
      el.querySelector("button").addEventListener("click", toggle); el._step = toggle;
    } else if (r.type === "note") {
      el._step = () => {};
    } else {
      el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { set(r.path, b.dataset.c); el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); schedule(true); if (o.sfx) o.sfx("move"); }));
      el._step = (d) => { const i = r.colors.indexOf(get(r.path)); const c = r.colors[(i + d + r.colors.length) % r.colors.length]; el.querySelector(`button[data-c="${c}"]`).click(); };
    }
  }
  function nudge(d) {
    const el = listEl.querySelectorAll(".cc-row")[row], r = rows[row]; if (!el) return;
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
      listEl.querySelectorAll(".cc-row").forEach((el) => { const r = rows[+el.dataset.i]; if (r && r.type === "slider") refreshLabel(el, r); });
    });
  }
  function randomize() {
    const R = Math.random, pick = (a) => a[(R() * a.length) | 0];
    if (mode === "story") {
      p.hair = pick(proxies("hair")).id; p.hairColor = pick(SWATCHES.hair.slice(0, 7));
      p.outfit = pick(proxies("outfit")).id; p.shoes = pick(proxies("shoes")).id; p.hat = R() < 0.15 ? "fedora01" : null;
    } else {
      const g = () => (R() + R() + R()) / 3, her = [R() ** 2, R() ** 2, R() ** 2];
      p.african = her[0]; p.asian = her[1]; p.caucasian = her[2]; p.tone = (R() - 0.5) * 0.5;
      p.sex = R() < 0.5 ? R() * 0.25 : 0.75 + R() * 0.25; p.age = Math.round(25 + R() * R() * 55);
      p.height = 0.3 + g() * 0.4; p.weight = 0.25 + g() * 0.55; p.muscle = 0.25 + g() * 0.55; p.proportions = 0.35 + g() * 0.45;
      p.detail = {}; for (const l of D.meta.local) p.detail[l.key] = (g() - 0.5) * 1.1;
      p.hair = pick(proxies("hair")).id; p.hairColor = pick(SWATCHES.hair.slice(0, p.age > 55 ? 10 : 7)); if (p.age > 62 && R() < 0.6) p.hairColor = pick(["#8b8a86", "#d8d5cf"]);
      p.brows = pick(proxies("brows")).id; p.browColor = pick(SWATCHES.brow); p.eyes = pick(eyeNames);
      p.outfit = pick(proxies("outfit")).id; p.shoes = pick(proxies("shoes")).id; p.hat = R() < 0.15 ? "fedora01" : null;
      presetName.online = "Your character"; titleEl.textContent = presetName.online;
    }
    schedule(true); showTab(tab, true); if (o.sfx) o.sfx("select");
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
    else if (k === "Tab") { setMode(mode === "story" ? "online" : "story"); e.preventDefault(); }
    else if (k === "Enter") done();
    else if (k === "Escape") cancel();
  };
  addEventListener("keydown", onKey);
  root.querySelector(".cc-random").onclick = randomize;
  root.querySelector(".cc-reset").onclick = () => {
    if (mode === "story") chars.story = p = lockStory(null);
    else { const x = PRESETS.find((x) => x.name === presetName.online) || PRESETS[0]; chars.online = p = JSON.parse(JSON.stringify(x.p)); presetName.online = x.name; titleEl.textContent = x.name; }
    schedule(true); showTab(tab, true);
  };
  root.querySelector(".cc-done").onclick = () => done();

  let resolveDone;
  const result = new Promise((r) => (resolveDone = r));
  function close() {
    running = false; cancelAnimationFrame(raf); removeEventListener("keydown", onKey); removeEventListener("resize", onResize);
    human.dispose(); renderer.dispose(); renderer.domElement.remove();
  }
  function done() {
    const story = lockStory(chars.story);
    store("story", story); store("online", Object.assign({}, chars.online, { name: presetName.online }));
    if (o.sfx) o.sfx("select"); close(); resolveDone(story);
  }
  function cancel() { if (o.sfx) o.sfx("back"); close(); resolveDone(null); }

  setMode(mode, true);
  requestAnimationFrame(frame);
  return result;
}
