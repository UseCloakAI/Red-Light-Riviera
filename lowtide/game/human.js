/* Realistic, fully parametric people, built from MakeHuman's CC0 data
   (tools/human/build.py packs it). One call turns a set of slider values into
   a rigged, clothed, animated three.js character:

   - body: MakeHuman's own macro maths (sex, age, muscle, weight, height,
     proportions, heritage) plus 31 face and body detail sliders
   - eyes, brows, lashes, hair, outfit, shoes and hat fitted to that body the
     way MakeHuman fits them (three reference vertices + scaled offset)
   - a skeleton rebuilt from the body's own joints, with skin weights
   - idle / walk / run: Mixamo motion stored as world-space rotations, aligned
     per bone from MakeHuman's A-pose to the clip's T-pose, then made local
   - skin that blends the three heritage photo textures in the shader */
import * as THREE from "three";

const BASE = new URL("../assets/human/", import.meta.url);
const url = (p) => new URL(p, BASE).href;
let DATA = null;

export async function loadHumanData() {
  if (DATA) return DATA;
  const [meta, bin, motion] = await Promise.all([
    fetch(url("human.json?v=dev")).then((r) => r.json()),
    fetch(url("human.bin?v=dev")).then((r) => r.arrayBuffer()),
    fetch(url("motion.json?v=dev")).then((r) => r.json())
  ]);
  const T = { f32: Float32Array, i16: Int16Array, u16: Uint16Array, u32: Uint32Array, u8: Uint8Array, i8: Int8Array };
  const view = (d) => new T[d.t](bin, d.o, d.n);
  DATA = { meta, motion, view, proxies: Object.fromEntries(meta.proxies.map((p) => [p.kind + ":" + p.id, p])) };
  DATA.base = view(meta.base);
  DATA.macro = view(meta.macro.data);
  DATA.bodyRV = view(meta.body.rv);
  DATA.bodyIndex = view(meta.body.index);
  // which base vertices belong to the rendered body (for the ground line)
  DATA.bodyVerts = Uint32Array.from(new Set(DATA.bodyRV));
  return DATA;
}

/* ---------------- parameters ---------------- */
// Hollis Vane, 41, ex harbour pilot: the default. Everything else is the player's call.
export const HOLLIS = {
  sex: 0.0, age: 41, muscle: 0.58, weight: 0.46, height: 0.55, proportions: 0.6,
  african: 0.25, asian: 0.1, caucasian: 0.65, tone: 0,
  detail: { face_fullness: -0.15, cheekbones: 0.35, jaw: 0.2, nose_bridge: 0.15, eye_tilt: 0.1 },
  eyes: "brownlight", brows: "eyebrow006", browColor: "#3a2a20", lashes: "eyelashes01",
  hair: "ponytail01", hairColor: "#3b2a20", outfit: "male_casualsuit05", shoes: "shoes02", hat: null
};
export const SWATCHES = {
  hair: ["#120d0a", "#2a1c14", "#3b2a20", "#5a3d27", "#7a5634", "#a37a4c", "#c9a26b", "#8b8a86", "#d8d5cf", "#6a2a1e"],
  brow: ["#120d0a", "#2a1d16", "#3a2a20", "#5a3d27", "#8a6a48", "#9a9690"]
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
function macroWeights(p) {
  const male = clamp01(p.sex), female = 1 - male;
  const t = clamp01((p.age - 25) / 65), young = 1 - t, old = t;           // MakeHuman: 25 y = 0.5, 90 y = 1.0
  const tri = (x) => { x = clamp01(x); const lo = Math.max(0, 1 - 2 * x), hi = Math.max(0, 2 * x - 1); return [lo, 1 - lo - hi, hi]; };
  const [mn, ma, mx] = tri(p.muscle), [wn, wa, wx] = tri(p.weight);
  const h = clamp01(p.height), hmin = Math.max(0, 1 - 2 * h), hmax = Math.max(0, 2 * h - 1);
  const pr = clamp01(p.proportions), ideal = Math.max(0, 2 * pr - 1), uncommon = Math.max(0, 1 - 2 * pr);
  let ra = Math.max(0, p.african), rs = Math.max(0, p.asian), rc = Math.max(0, p.caucasian); const rt = ra + rs + rc || 1;
  ra /= rt; rs /= rt; rc /= rt;
  const W = {};
  for (const [sex, sv] of [["female", female], ["male", male]]) for (const [age, av] of [["young", young], ["old", old]]) {
    const ga = sv * av; if (!ga) continue;
    for (const [m, mv] of [["minmuscle", mn], ["averagemuscle", ma], ["maxmuscle", mx]])
      for (const [w, wv] of [["minweight", wn], ["averageweight", wa], ["maxweight", wx]]) W[`universal-${sex}-${age}-${m}-${w}`] = ga * mv * wv;
    W[`african-${sex}-${age}`] = ga * ra; W[`asian-${sex}-${age}`] = ga * rs; W[`caucasian-${sex}-${age}`] = ga * rc;
    W[`height-${sex}-${age}-minheight`] = ga * hmin; W[`height-${sex}-${age}-maxheight`] = ga * hmax;
    W[`proportions-${sex}-${age}-idealproportions`] = ga * ideal; W[`proportions-${sex}-${age}-uncommonproportions`] = ga * uncommon;
  }
  return W;
}

/* ---------------- geometry ---------------- */
function morph(D, p, out) {
  const nv = D.meta.nVerts, M = D.meta.macro, X = D.macro;
  out.set(D.base);
  const W = macroWeights(p);
  M.names.forEach((name, t) => {
    const w = W[name]; if (!w || w < 1e-5) return;
    const k = w * M.scale[t], o = t * 3 * nv;
    for (let v = 0, i = 0; v < nv; v++, i += 3) { out[i] += k * X[o + v]; out[i + 1] += k * X[o + nv + v]; out[i + 2] += k * X[o + 2 * nv + v]; }
  });
  for (const L of D.meta.local) {
    const v = (p.detail && p.detail[L.key]) || 0; if (Math.abs(v) < 1e-3) continue;
    const end = v < 0 ? L.lo : L.hi, idx = D.view(end.idx), d = D.view(end.d), n = idx.length, k = Math.abs(v) * end.scale;
    for (let j = 0; j < n; j++) { const i = idx[j] * 3; out[i] += k * d[j]; out[i + 1] += k * d[n + j]; out[i + 2] += k * d[2 * n + j]; }
  }
  return out;
}
function fit(D, px, P, out) {
  const refs = D.view(px.refs), w = D.view(px.w), off = D.view(px.off), n = refs.length / 3, s = [1, 1, 1];
  px.scale.forEach((sc, a) => { if (sc) s[a] = Math.abs(P[sc[0] * 3 + a] - P[sc[1] * 3 + a]) / sc[2]; });
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++)
    out[i * 3 + a] = w[i * 3] * P[refs[i * 3] * 3 + a] + w[i * 3 + 1] * P[refs[i * 3 + 1] * 3 + a] + w[i * 3 + 2] * P[refs[i * 3 + 2] * 3 + a] + s[a] * off[i * 3 + a];
  return out;
}
// smooth normals on the unsplit topology, then gathered to the render vertices
function normals(P, nv, rv, index, out) {
  const acc = new Float32Array(nv * 3);
  for (let t = 0; t < index.length; t += 3) {
    const a = rv[index[t]] * 3, b = rv[index[t + 1]] * 3, c = rv[index[t + 2]] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { acc[q] += nx; acc[q + 1] += ny; acc[q + 2] += nz; }
  }
  for (let r = 0; r < rv.length; r++) {
    const q = rv[r] * 3, l = Math.hypot(acc[q], acc[q + 1], acc[q + 2]) || 1;
    out[r * 3] = acc[q] / l; out[r * 3 + 1] = acc[q + 1] / l; out[r * 3 + 2] = acc[q + 2] / l;
  }
  return out;
}
function gather(P, rv, out, dy) { for (let r = 0; r < rv.length; r++) { const q = rv[r] * 3; out[r * 3] = P[q]; out[r * 3 + 1] = P[q + 1] - dy; out[r * 3 + 2] = P[q + 2]; } return out; }

/* ---------------- materials ---------------- */
const loader = new THREE.TextureLoader(), texCache = new Map();
function tex(path, srgb = true) {
  if (!path) return null;
  if (!texCache.has(path)) {
    const t = loader.load(url(path)); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; texCache.set(path, t);   // MakeHuman UVs are OBJ-style: default flipY is right
  }
  return texCache.get(path);
}
function skinMaterial(D) {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.52, metalness: 0, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0.9, 0.55, 0.45), specularIntensity: 0.45 });
  const u = { mapA: { value: null }, mapB: { value: null }, mapC: { value: null }, mix3: { value: new THREE.Vector3(1, 0, 0) }, tone: { value: 0 } };
  m.map = new THREE.Texture();   // turns on vMapUv; the real lookups are below
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = "uniform sampler2D mapA,mapB,mapC;uniform vec3 mix3;uniform float tone;\n" + sh.fragmentShader.replace("#include <map_fragment>", `
      vec3 sk = texture2D(mapA, vMapUv).rgb * mix3.x + texture2D(mapB, vMapUv).rgb * mix3.y + texture2D(mapC, vMapUv).rgb * mix3.z;
      sk *= 1.0 + tone * 0.35;
      diffuseColor.rgb *= sk;`);
  };
  m.userData.u = u;
  return m;
}

/* ---------------- motion: Mixamo world rotations -> this skeleton ---------------- */
const MAP = { Hips: "root", Spine: "spine04", Spine1: "spine03", Spine2: "spine02", Neck: "neck01", Head: "head" };
for (const [s, t] of [["Left", "L"], ["Right", "R"]]) {
  Object.assign(MAP, { [s + "Shoulder"]: "clavicle_" + t, [s + "Arm"]: "upperarm01_" + t, [s + "ForeArm"]: "lowerarm01_" + t, [s + "Hand"]: "wrist_" + t,
    [s + "UpLeg"]: "upperleg01_" + t, [s + "Leg"]: "lowerleg01_" + t, [s + "Foot"]: "foot_" + t, [s + "ToeBase"]: "toe1-1_" + t });
  ["Thumb", "Index", "Middle", "Ring", "Pinky"].forEach((f, k) => { for (let j = 1; j <= 3; j++) MAP[`${s}Hand${f}${j}`] = `finger${k + 1}-${j}_${t}`; });
}
// the child that gives each source bone its direction
const NEXT = { Spine: "Spine1", Spine1: "Spine2", Spine2: "Neck", Neck: "Head", Head: "HeadTop_End", Shoulder: "Arm", Arm: "ForeArm", ForeArm: "Hand",
  Hand: "HandMiddle1", UpLeg: "Leg", Leg: "Foot", Foot: "ToeBase", ToeBase: "Toe_End" };
function srcChild(name) {
  const side = name.startsWith("Left") ? "Left" : name.startsWith("Right") ? "Right" : "", n = name.slice(side.length);
  const f = n.match(/^Hand(Thumb|Index|Middle|Ring|Pinky)(\d)$/);
  if (f) return `${side}Hand${f[1]}${+f[2] + 1}`;
  return NEXT[n] ? side + NEXT[n] : null;
}
function buildClips(D, H) {
  const mo = D.motion, si = Object.fromEntries(mo.bones.map((b, i) => [b, i])), v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const bones = H.bones, idx = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  // per target bone: its source bone and the aligning rotation A (target rest dir -> source rest dir)
  const src = new Array(bones.length).fill(-1), A = bones.map(() => new THREE.Quaternion());
  for (const [s, t] of Object.entries(MAP)) {
    if (!(t in idx) || !(s in si)) continue;
    const b = idx[t]; src[b] = si[s];
    const c = srcChild(s);
    if (!c || !(c in si)) continue;
    const dS = v3(mo.rest[si[c]]).sub(v3(mo.rest[si[s]])).normalize();
    const dT = H.tails[b].clone().sub(H.heads[b]).normalize();
    A[b].setFromUnitVectors(dT, dS);
  }
  const ratio = H.heads[0].y / mo.hipRest, W = bones.map(() => new THREE.Quaternion()), tmp = new THREE.Quaternion();
  return mo.clips.map((clip) => {
    const n = clip.frames, times = Array.from({ length: n }, (_, i) => Math.min(clip.duration, i / clip.fps));
    const vals = bones.map(() => new Float32Array(n * 4)), hip = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      bones.forEach((b, i) => {
        const p = H.parents[i], Wp = p < 0 ? null : W[p];
        if (src[i] >= 0) { const q = clip.q[src[i]]; W[i].set(q[f * 4], q[f * 4 + 1], q[f * 4 + 2], q[f * 4 + 3]).multiply(A[i]); }
        else if (Wp) W[i].copy(Wp); else W[i].identity();
        tmp.copy(Wp || new THREE.Quaternion()).invert().multiply(W[i]);
        tmp.toArray(vals[i], f * 4);
      });
      hip[f * 3] = bones[0].position.x; hip[f * 3 + 1] = bones[0].position.y + clip.hipsY[f] * ratio; hip[f * 3 + 2] = bones[0].position.z;
    }
    const tracks = [];
    bones.forEach((b, i) => { if (src[i] >= 0 || (H.parents[i] >= 0 && src[H.parents[i]] >= 0)) tracks.push(new THREE.QuaternionKeyframeTrack(b.name + ".quaternion", times, vals[i])); });
    tracks.push(new THREE.VectorKeyframeTrack(bones[0].name + ".position", times, hip));
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
}

/* ---------------- the character ---------------- */
/* A plausible stranger: heritage, age, build, face, hair and clothes all at random. */
export function randomPerson(R = Math.random) {
  const g = () => (R() + R() + R()) / 3, pick = (a) => a[(R() * a.length) | 0], D = DATA;
  const her = [R() ** 2, R() ** 2, R() ** 2], sex = R() < 0.5 ? R() * 0.2 : 0.8 + R() * 0.2, age = Math.round(25 + R() * R() * 55);
  const ids = (kind) => D.meta.proxies.filter((x) => x.kind === kind).map((x) => x.id);
  const hair = SWATCHES.hair, detail = {};
  for (const l of D.meta.local) detail[l.key] = (g() - 0.5) * 1.0;
  return { sex, age, muscle: 0.25 + g() * 0.5, weight: 0.25 + g() * 0.55, height: 0.3 + g() * 0.4, proportions: 0.35 + g() * 0.4,
    african: her[0], asian: her[1], caucasian: her[2], tone: (R() - 0.5) * 0.4, detail,
    eyes: pick(Object.keys(D.meta.eyeColors)), brows: pick(ids("brows")), browColor: pick(SWATCHES.brow), lashes: "eyelashes01",
    hair: pick(ids("hair")), hairColor: age > 60 && R() < 0.6 ? pick(["#8b8a86", "#d8d5cf"]) : pick(hair.slice(0, 7)),
    outfit: pick(ids("outfit")), shoes: pick(ids("shoes")), hat: R() < 0.08 ? "fedora01" : null };
}

export class Human {
  // opts.lod: build the body from MakeHuman's ~1,600-vertex proxy (for crowds)
  constructor(D, params, opts = {}) {
    this.lod = opts.lod ? D.proxies["lod:" + opts.lod] : null; this.lite = !!opts.lod;
    this.D = D; this.p = JSON.parse(JSON.stringify(params));
    this.group = new THREE.Group(); this.group.name = "human";
    this.P = new Float32Array(D.meta.nVerts * 3);
    const sk = D.meta.skeleton;
    this.bones = sk.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name.replace(/\./g, "_"); return o; });
    this.parents = sk.bones.map((b) => b.parent);
    this.bones.forEach((b, i) => { const p = this.parents[i]; (p < 0 ? this.group : this.bones[p]).add(b); });
    this.skeleton = new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4()));
    this.heads = this.bones.map(() => new THREE.Vector3()); this.tails = this.bones.map(() => new THREE.Vector3());
    this.parts = {};   // slot -> { mesh, px }
    this.bodyMat = skinMaterial(D);
    if (this.lod) { this.lodRV = D.view(this.lod.rv); this.lodQ = new Float32Array(D.view(this.lod.refs).length); this.body = this.skinned(this.lod, this.bodyMat, this.lodRV.length); }
    else this.body = this.skinned(D.meta.body, this.bodyMat, D.bodyRV.length);
    this.body.name = "body";
    this.update(this.p, true);
  }
  skinned(desc, mat, nr) {
    const D = this.D, g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nr * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nr * 3), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(D.view(desc.uv), 2));
    g.setAttribute("skinIndex", new THREE.BufferAttribute(D.view(desc.skinIndex), 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(D.view(desc.skinWeight), 4, true));
    g.setIndex(new THREE.BufferAttribute(D.view(desc.index), 1));
    const m = new THREE.SkinnedMesh(g, mat);
    m.bind(this.skeleton, new THREE.Matrix4());
    m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    return m;
  }
  // build or swap a fitted part (eyes, brows, lashes, hair, outfit, shoes, hat)
  setPart(slot, kind, id, color) {
    const D = this.D, old = this.parts[slot];
    if (old && old.id === id) { if (color && kind !== "eyes" && old.mesh.material.color) old.mesh.material.color.set(color); return; }
    if (old) { this.group.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); delete this.parts[slot]; }
    const px = id && D.proxies[kind + ":" + id]; if (!px) return;
    const rv = D.view(px.rv), t = px.tex;
    const opts = { map: tex(t.map), normalMap: tex(t.normalMap, false), aoMap: tex(t.aoMap, false), roughness: 0.85 };
    let mat;
    if (kind === "hair") mat = new THREE.MeshPhysicalMaterial({ ...opts, color: color || "#3b2a20", roughness: 0.45, sheen: 0.35, sheenRoughness: 0.45, sheenColor: new THREE.Color(1, 0.92, 0.8), alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide });
    else if (kind === "brows") mat = new THREE.MeshStandardMaterial({ ...opts, color: color || "#2a1d16", roughness: 0.9, alphaTest: 0.3, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    else if (kind === "lashes") mat = new THREE.MeshStandardMaterial({ ...opts, color: "#1a1410", roughness: 0.9, alphaTest: 0.25, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    // eyes: cut away the cornea shell (transparent texels), keep a wet clearcoat on the eyeball
    else if (kind === "eyes") mat = new THREE.MeshPhysicalMaterial({ map: tex(D.meta.eyeColors[color || "brown"]), alphaTest: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 });
    else mat = new THREE.MeshStandardMaterial({ ...opts, side: px.cull ? THREE.FrontSide : THREE.DoubleSide });
    const mesh = this.skinned(px, mat, rv.length);
    mesh.name = slot; mesh.renderOrder = px.depth;
    // small parts in the face: no shadow maps (lids and brows would darken the eyes into hollows)
    if (kind === "brows" || kind === "lashes" || kind === "eyes") { mesh.castShadow = false; mesh.receiveShadow = false; }
    this.parts[slot] = { mesh, px, id, rv, Q: new Float32Array(D.view(px.refs).length) };
  }
  // hide body triangles under clothes and shoes so skin never pokes through
  hideUnder() {
    if (this.lod) return;
    const D = this.D, del = new Uint8Array(D.meta.nVerts);
    for (const s of ["outfit", "shoes", "hat"]) { const pt = this.parts[s]; if (pt) for (const v of D.view(pt.px.delete)) del[v] = 1; }
    const I = D.bodyIndex, rv = D.bodyRV, keep = [];
    for (let t = 0; t < I.length; t += 3) if (!del[rv[I[t]]] && !del[rv[I[t + 1]]] && !del[rv[I[t + 2]]]) keep.push(I[t], I[t + 1], I[t + 2]);
    this.body.geometry.setIndex(keep);
  }
  update(params, rebuildParts) {
    const D = this.D, p = this.p = JSON.parse(JSON.stringify(params));
    if (rebuildParts || true) {
      this.setPart("eyes", "eyes", "high-poly", p.eyes);
      this.setPart("brows", "brows", p.brows, p.browColor);
      if (!this.lite) this.setPart("lashes", "lashes", p.lashes || "eyelashes01");   // crowds skip lashes
      this.setPart("hair", "hair", p.hair, p.hairColor);
      this.setPart("outfit", "outfit", p.outfit);
      this.setPart("shoes", "shoes", p.shoes);
      this.setPart("hat", "hat", p.hat);
      if (this.parts.eyes) { const m = this.parts.eyes.mesh.material, t = tex(D.meta.eyeColors[p.eyes] || D.meta.eyeColors.brown); if (m.map !== t) { m.map = t; m.needsUpdate = true; } }
      this.hideUnder();
    }
    // body shape
    const P = morph(D, p, this.P);
    // fit parts, then drop everything so the lowest sole sits on y = 0
    let low = Infinity, top = -Infinity;
    for (const v of D.bodyVerts) { const y = P[v * 3 + 1]; if (y < low) low = y; if (y > top) top = y; }
    for (const pt of Object.values(this.parts)) {
      fit(D, pt.px, P, pt.Q);
      if (pt.px.kind === "shoes") for (let i = 1; i < pt.Q.length; i += 3) low = Math.min(low, pt.Q[i]);
    }
    this.ground = low;
    const bg = this.body.geometry;
    if (this.lod) {
      fit(D, this.lod, P, this.lodQ);
      gather(this.lodQ, this.lodRV, bg.attributes.position.array, low);
      normals(this.lodQ, this.lodQ.length / 3, this.lodRV, D.view(this.lod.index), bg.attributes.normal.array);
    } else {
      gather(P, D.bodyRV, bg.attributes.position.array, low);
      normals(P, D.meta.nVerts, D.bodyRV, D.bodyIndex, bg.attributes.normal.array);
    }
    bg.attributes.position.needsUpdate = bg.attributes.normal.needsUpdate = true; bg.computeBoundingSphere();
    for (const pt of Object.values(this.parts)) {
      const g = pt.mesh.geometry, idx = D.view(pt.px.index), n = pt.Q.length / 3;
      gather(pt.Q, pt.rv, g.attributes.position.array, low);
      normals(pt.Q, n, pt.rv, idx, g.attributes.normal.array);
      g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true; g.computeBoundingSphere();
    }
    // skin: blend the three heritage textures for the nearest age, by sex
    const age = p.age < 36 ? "young" : p.age < 58 ? "middleage" : "old", sex = p.sex < 0.5 ? "female" : "male", u = this.bodyMat.userData.u;
    u.mapA.value = tex(D.meta.skins[`${age}_african_${sex}`]); u.mapB.value = tex(D.meta.skins[`${age}_asian_${sex}`]); u.mapC.value = tex(D.meta.skins[`${age}_caucasian_${sex}`]);
    const rt = (p.african + p.asian + p.caucasian) || 1; u.mix3.value.set(p.african / rt, p.asian / rt, p.caucasian / rt); u.tone.value = p.tone || 0;
    // skeleton from the body's own joints (identity rest rotations, so motion is rig-independent)
    const sk = D.meta.skeleton, jv = D.view(sk.jointVerts), jo = D.view(sk.jointOffsets), J = [];
    for (let j = 0; j < sk.joints.length; j++) {
      const v = new THREE.Vector3(); let c = 0;
      for (let k = jo[j]; k < jo[j + 1]; k++) { v.x += P[jv[k] * 3]; v.y += P[jv[k] * 3 + 1]; v.z += P[jv[k] * 3 + 2]; c++; }
      J.push(v.divideScalar(c || 1).setY(v.y - low));
    }
    sk.bones.forEach((b, i) => {
      this.heads[i].copy(J[b.head]); this.tails[i].copy(J[b.tail]);
      const par = this.parents[i];
      this.bones[i].position.copy(this.heads[i]).sub(par < 0 ? new THREE.Vector3() : this.heads[par]);
      this.bones[i].quaternion.identity();
      this.skeleton.boneInverses[i].makeTranslation(-this.heads[i].x, -this.heads[i].y, -this.heads[i].z);
    });
    this.clips = buildClips(D, this);
    this.height = top - low;
    return this;
  }
  headPosition() { const i = this.bones.findIndex((b) => b.name === "head"); return this.heads[i].clone(); }
  dispose() {
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}

export async function createHuman(params) {
  const D = await loadHumanData();
  // saved characters may predate newer options: anything missing falls back to Hollis
  const p = Object.assign(JSON.parse(JSON.stringify(HOLLIS)), params || {});
  p.detail = Object.assign({}, HOLLIS.detail, (params && params.detail) || {});
  return new Human(D, p);
}
