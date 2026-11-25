#!/usr/bin/env python3
"""Pack MakeHuman's CC0 data into compact web assets for Lowtide's character creator.

    python3 tools/human/build.py <makehuman/makehuman/data> <system_assets dir> <out dir>

Inputs (all CC0):
  - the MakeHuman repo's data folder (base mesh, morph targets, skeleton, skin weights)
  - the MakeHuman system assets pack (skins, eyes, brows, lashes, hair, clothes, body proxies)
Output: human.json (layout + metadata), human.bin (all numeric data), tex/*.webp.

Units: MakeHuman works in decimetres; everything here is written in metres.
"""
import json, os, re, sys, struct, glob
import numpy as np
from PIL import Image

DATA, ASSETS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
S = 0.1  # decimetres -> metres

# ---------------------------------------------------------------- binary blob
blob = bytearray()
def put(arr, kind):
    """Append a typed array, 4-byte aligned; return its descriptor."""
    global blob
    a = np.ascontiguousarray(arr, dtype=kind)
    while len(blob) % 4: blob.append(0)
    off = len(blob); blob += a.tobytes()
    return {"o": off, "n": int(a.size), "t": {"float32": "f32", "int16": "i16", "uint16": "u16", "uint32": "u32", "uint8": "u8", "int8": "i8"}[np.dtype(kind).name]}

# ---------------------------------------------------------------- OBJ reader
def read_obj(path):
    v, vt, faces, groups, g = [], [], [], [], None
    for line in open(path, encoding="utf-8", errors="ignore"):
        p = line.split()
        if not p: continue
        if p[0] == "v": v.append([float(x) for x in p[1:4]])
        elif p[0] == "vt": vt.append([float(x) for x in p[1:3]])
        elif p[0] == "g": g = p[1] if len(p) > 1 else None
        elif p[0] == "f":
            f = []
            for c in p[1:]:
                s = c.split("/")
                f.append((int(s[0]) - 1, int(s[1]) - 1 if len(s) > 1 and s[1] else -1))
            faces.append(f); groups.append(g)
    return np.array(v, np.float32), np.array(vt, np.float32) if vt else np.zeros((0, 2), np.float32), faces, groups

def render_mesh(faces, vt):
    """Split vertices on UV seams. Returns (render->vertex map, uvs, triangle indices, per-triangle source faces)."""
    key, rv, ruv, idx = {}, [], [], []
    for f in faces:
        ids = []
        for (vi, ti) in f:
            k = (vi, ti)
            if k not in key:
                key[k] = len(rv); rv.append(vi); ruv.append(vt[ti] if ti >= 0 else (0.0, 0.0))
            ids.append(key[k])
        for i in range(1, len(ids) - 1): idx += [ids[0], ids[i], ids[i + 1]]
    return np.array(rv, np.uint32), np.array(ruv, np.float32), np.array(idx, np.uint32)

# ---------------------------------------------------------------- base mesh
base, base_vt, base_faces, base_groups = read_obj(os.path.join(DATA, "3dobjs/base.obj"))
NV = len(base)
body_faces = [f for f, g in zip(base_faces, base_groups) if g == "body"]
b_rv, b_uv, b_idx = render_mesh(body_faces, base_vt)
print(f"base: {NV} verts, body render {len(b_rv)} verts / {len(b_idx)//3} tris")

# ---------------------------------------------------------------- targets
def read_target(path):
    d = np.zeros((NV, 3), np.float32)
    for line in open(path):
        if line[:1].isdigit():
            p = line.split(); d[int(p[0])] = (float(p[1]), float(p[2]), float(p[3]))
    return d * S

T = os.path.join(DATA, "targets")
macro = {}
for sex in ("female", "male"):
    for age in ("young", "old"):
        for m in ("minmuscle", "averagemuscle", "maxmuscle"):
            for w in ("minweight", "averageweight", "maxweight"):
                macro[f"universal-{sex}-{age}-{m}-{w}"] = f"macrodetails/universal-{sex}-{age}-{m}-{w}.target"
        for race in ("african", "asian", "caucasian"):
            macro[f"{race}-{sex}-{age}"] = f"macrodetails/{race}-{sex}-{age}.target"
        for h in ("minheight", "maxheight"):
            macro[f"height-{sex}-{age}-{h}"] = f"macrodetails/height/{sex}-{age}-averagemuscle-averageweight-{h}.target"
        for pr in ("idealproportions", "uncommonproportions"):
            macro[f"proportions-{sex}-{age}-{pr}"] = f"macrodetails/proportions/{sex}-{age}-averagemuscle-averageweight-{pr}.target"
names, scales, planes = [], [], []
for name, rel in macro.items():
    d = read_target(os.path.join(T, rel))
    mx = float(np.abs(d).max()) or 1e-9
    names.append(name); scales.append(mx / 32767)
    planes.append(np.round(d.T / mx * 32767).astype(np.int16))   # planar x..., y..., z...
macro_desc = {"names": names, "scale": scales, "data": put(np.stack(planes), np.int16)}
print(f"macro targets: {len(names)}")

# face / body detail sliders: one slider drives a decr/incr pair (and both sides for l/r features)
LOCAL = [
    ("face", "Face fullness", ["head/head-fat-{}"], ("decr", "incr")),
    ("face", "Face width", ["head/head-scale-horiz-{}"], ("decr", "incr")),
    ("face", "Face length", ["head/head-scale-vert-{}"], ("decr", "incr")),
    ("face", "Forehead", ["forehead/forehead-scale-vert-{}"], ("decr", "incr")),
    ("face", "Brow height", ["eyebrows/eyebrows-trans-{}"], ("down", "up")),
    ("face", "Brow angle", ["eyebrows/eyebrows-angle-{}"], ("down", "up")),
    ("face", "Eye size", ["eyes/l-eye-scale-{}", "eyes/r-eye-scale-{}"], ("decr", "incr")),
    ("face", "Eye spacing", ["eyes/l-eye-trans-{}", "eyes/r-eye-trans-{}"], ("in", "out")),
    ("face", "Eye height", ["eyes/l-eye-trans-{}", "eyes/r-eye-trans-{}"], ("down", "up")),
    ("face", "Eye tilt", ["eyes/l-eye-eyefold-angle-{}", "eyes/r-eye-eyefold-angle-{}"], ("down", "up")),
    ("face", "Eyelid fold", ["eyes/l-eye-epicanthus-{}", "eyes/r-eye-epicanthus-{}"], ("in", "out")),
    ("face", "Nose width", ["nose/nose-scale-horiz-{}"], ("decr", "incr")),
    ("face", "Nose length", ["nose/nose-scale-vert-{}"], ("decr", "incr")),
    ("face", "Nose bridge", ["nose/nose-hump-{}"], ("decr", "incr")),
    ("face", "Nose tip", ["nose/nose-point-{}"], ("down", "up")),
    ("face", "Nostrils", ["nose/nose-nostrils-width-{}"], ("decr", "incr")),
    ("face", "Mouth width", ["mouth/mouth-scale-horiz-{}"], ("decr", "incr")),
    ("face", "Upper lip", ["mouth/mouth-upperlip-volume-{}"], ("decr", "incr")),
    ("face", "Lower lip", ["mouth/mouth-lowerlip-volume-{}"], ("decr", "incr")),
    ("face", "Mouth corners", ["mouth/mouth-angles-{}"], ("down", "up")),
    ("face", "Cheekbones", ["cheek/l-cheek-bones-{}", "cheek/r-cheek-bones-{}"], ("decr", "incr")),
    ("face", "Cheeks", ["cheek/l-cheek-volume-{}", "cheek/r-cheek-volume-{}"], ("decr", "incr")),
    ("face", "Jaw", ["chin/chin-bones-{}"], ("decr", "incr")),
    ("face", "Chin", ["chin/chin-prominent-{}"], ("decr", "incr")),
    ("face", "Chin width", ["chin/chin-width-{}"], ("decr", "incr")),
    ("face", "Ears", ["ears/l-ear-scale-{}", "ears/r-ear-scale-{}"], ("decr", "incr")),
    ("body", "Neck", ["neck/neck-scale-horiz-{}"], ("decr", "incr")),
    ("body", "Shoulders", ["torso/torso-vshape-{}"], ("decr", "incr")),
    ("body", "Hips", ["hip/hip-scale-horiz-{}"], ("decr", "incr")),
    ("body", "Belly", ["stomach/stomach-pregnant-{}"], ("decr", "incr")),
    ("body", "Glutes", ["buttocks/buttocks-volume-{}"], ("decr", "incr")),
]
local = []
for group, label, pats, (lo, hi) in LOCAL:
    ends = []
    for side in (lo, hi):
        d = np.zeros((NV, 3), np.float32)
        for p in pats: d += read_target(os.path.join(T, p.format(side) + ".target"))
        nz = np.nonzero(np.abs(d).sum(1) > 0)[0]
        mx = float(np.abs(d).max()) or 1e-9
        ends.append({"idx": put(nz, np.uint16), "d": put(np.round(d[nz].T / mx * 32767).astype(np.int16), np.int16), "scale": mx / 32767})
    local.append({"group": group, "label": label, "key": re.sub(r"[^a-z]+", "_", label.lower()).strip("_"), "lo": ends[0], "hi": ends[1]})
print(f"detail sliders: {len(local)}")

# ---------------------------------------------------------------- skeleton
skel = json.load(open(os.path.join(DATA, "rigs/default.mhskel")))
bones_all = skel["bones"]
KEEP = ["root", "spine05", "spine04", "spine03", "spine02", "spine01", "neck01", "neck02", "neck03", "head"]
for s in ("L", "R"):
    KEEP += [f"{b}.{s}" for b in ("clavicle", "shoulder01", "upperarm01", "upperarm02", "lowerarm01", "lowerarm02", "wrist",
                                   "metacarpal1", "metacarpal2", "metacarpal3", "metacarpal4",
                                   "pelvis", "upperleg01", "upperleg02", "lowerleg01", "lowerleg02", "foot", "toe1-1")]
    KEEP += [f"finger{f}-{k}.{s}" for f in range(1, 6) for k in range(1, 4)]
KEEP = [b for b in KEEP if b in bones_all]
keep_set = set(KEEP)
def kept_ancestor(b):
    while b not in keep_set: b = bones_all[b]["parent"]
    return b
# order parents before children
order, placed = [], set()
while len(order) < len(KEEP):
    for b in KEEP:
        p = bones_all[b]["parent"]
        if b not in placed and (p is None or p in placed or p not in keep_set):
            order.append(b); placed.add(b)
bone_index = {b: i for i, b in enumerate(order)}
joints = skel["joints"]
jnames = sorted({bones_all[b]["head"] for b in order} | {bones_all[b]["tail"] for b in order})
jidx, joff = [], [0]
for j in jnames: jidx += joints[j]; joff.append(len(jidx))
skeleton = {
    "bones": [{"name": b, "parent": bone_index[kept_ancestor(bones_all[b]["parent"])] if bones_all[b]["parent"] else -1,
               "head": jnames.index(bones_all[b]["head"]), "tail": jnames.index(bones_all[b]["tail"])} for b in order],
    "joints": jnames, "jointVerts": put(np.array(jidx), np.uint16), "jointOffsets": put(np.array(joff), np.uint32)
}
print(f"skeleton: kept {len(order)} of {len(bones_all)} bones")

# skin weights per base vertex, folded onto kept bones, top 4
W = json.load(open(os.path.join(DATA, "rigs/default_weights.mhw")))["weights"]
vw = [dict() for _ in range(NV)]
for b, lst in W.items():
    kb = bone_index[kept_ancestor(b)]
    for vi, w in lst: vw[vi][kb] = vw[vi].get(kb, 0) + w
# vertices with no weights (helper geometry) borrow from the nearest weighted vertex
weighted = np.array([i for i in range(NV) if vw[i]])
for i in range(NV):
    if not vw[i]:
        j = weighted[np.argmin(((base[weighted] - base[i]) ** 2).sum(1))]
        vw[i] = dict(vw[j])
def top4(d):
    it = sorted(d.items(), key=lambda kv: -kv[1])[:4]
    tot = sum(w for _, w in it) or 1
    idx = [k for k, _ in it] + [0] * (4 - len(it)); wt = [w / tot for _, w in it] + [0] * (4 - len(it))
    return idx, wt
def skin_for(dicts):
    I, Wt = np.zeros((len(dicts), 4), np.uint8), np.zeros((len(dicts), 4), np.float32)
    for k, d in enumerate(dicts): I[k], Wt[k] = top4(d)
    return put(I, np.uint8), put(np.round(Wt * 255).astype(np.uint8), np.uint8)

body = {"rv": put(b_rv, np.uint16), "uv": put(b_uv, np.float32), "index": put(b_idx, np.uint32)}
body["skinIndex"], body["skinWeight"] = skin_for([vw[v] for v in b_rv])

# ---------------------------------------------------------------- textures
def tex_out(src, name, size, mode="rgb", q=82):
    dst = os.path.join(OUT, "tex", name + ".webp")
    im = Image.open(src)
    if mode == "gray":   # hair and brows: keep detail, drop the baked colour so the creator can tint it
        a = im.getchannel("A") if "A" in im.getbands() else None
        g = np.asarray(im.convert("L"), np.float32)
        mask = (np.asarray(a) > 128) if a is not None else None
        vals = g[mask] if mask is not None and mask.any() else g.ravel()
        hi = float(np.percentile(vals, 97)) or 255.0
        g = np.clip(g / hi * 235, 0, 255).astype(np.uint8)
        im = Image.merge("RGBA", (Image.fromarray(g),) * 3 + (a,)) if a else Image.fromarray(g).convert("RGB")
    elif mode == "rgba":
        im = im.convert("RGBA")
    else:
        im = im.convert("RGB")
    if name in LOGO_FIX: im = scrub_logo(im, *LOGO_FIX[name])
    if max(im.size) > size: im = im.resize((size, size), Image.LANCZOS)
    im.save(dst, "WEBP", quality=q, method=6)
    return "tex/" + name + ".webp"

# Four tees carry MakeHuman's logo on the chest. Cover it with plain fabric copied from the
# shirt's back panel (same weave, same baked light) through a feathered ellipse.
# (logo centre x, y, radius x, y, source centre x, y) in UV fractions
LOGO_FIX = {
    "outfit_female_casualsuit01_map": (0.779, 0.229, 0.085, 0.075, 0.25, 0.22),
    "outfit_female_casualsuit02_map": (0.779, 0.229, 0.085, 0.075, 0.25, 0.22),
    "outfit_male_casualsuit02_map": (0.560, 0.169, 0.075, 0.075, 0.17, 0.17),
    "outfit_male_casualsuit04_map": (0.560, 0.169, 0.075, 0.075, 0.17, 0.17),
}
def scrub_logo(im, cx, cy, rx, ry, sx, sy):
    a = np.asarray(im).astype(np.float32); H, Wd = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:Wd]
    d = np.sqrt(((xx / Wd - cx) / rx) ** 2 + ((yy / H - cy) / ry) ** 2)
    m = np.clip((1.25 - d) / 0.25, 0, 1)[..., None]                 # 1 inside, soft edge
    dx, dy = int(round((sx - cx) * Wd)), int(round((sy - cy) * H))
    src = np.roll(np.roll(a, -dy, axis=0), -dx, axis=1)
    return Image.fromarray(np.clip(a * (1 - m) + src * m, 0, 255).astype(np.uint8), im.mode)

def read_mhmat(path):
    m = {}
    for line in open(path, encoding="utf-8", errors="ignore"):
        p = line.split(None, 1)
        if len(p) == 2 and not p[0].startswith("#"): m[p[0]] = p[1].strip()
    return m

skins = {}
for age in ("young", "middleage", "old"):
    for race in ("african", "asian", "caucasian"):
        for sex in ("female", "male"):
            folder = os.path.join(ASSETS, "skins", f"{age}_{race}_{sex}")
            mat = read_mhmat(glob.glob(folder + "/*.mhmat")[0])
            skins[f"{age}_{race}_{sex}"] = tex_out(os.path.join(folder, mat["diffuseTexture"]), f"skin_{age}_{race}_{sex}", 2048, q=84)
print(f"skins: {len(skins)}")

# ---------------------------------------------------------------- proxies (eyes, brows, lashes, hair, clothes, body proxies)
def read_mhclo(path):
    refs, wts, offs, scale, delete, obj, mat, depth, mode = [], [], [], [None] * 3, [], None, None, 50, None
    for line in open(path, encoding="utf-8", errors="ignore"):
        p = line.split()
        if not p or p[0].startswith("#"): continue
        k = p[0]
        if k in ("x_scale", "y_scale", "z_scale"):
            scale["xyz".index(k[0])] = [int(p[1]), int(p[2]), float(p[3]) * S]; continue
        if k == "obj_file": obj = p[1]; continue
        if k == "material": mat = p[1]; continue
        if k == "z_depth": depth = int(p[1]); continue
        if k == "verts": mode = "v"; continue
        if k == "delete_verts": mode = "d"; continue
        if k in ("weights", "vertexboneweights_file", "name", "uuid", "tag", "basemesh", "max_pole", "special_pose", "offsets"): mode = None if k in ("weights",) else mode; continue
        if mode == "v" and p[0].lstrip("-").isdigit():
            if len(p) == 1: refs.append([int(p[0])] * 3); wts.append([1, 0, 0]); offs.append([0, 0, 0])
            elif len(p) >= 9: refs.append([int(x) for x in p[:3]]); wts.append([float(x) for x in p[3:6]]); offs.append([float(x) * S for x in p[6:9]])
        elif mode == "d":
            seq = False
            for t in p:
                if t == "-": seq = True; continue
                v = int(t)
                if seq: delete += list(range(delete[-1] + 1, v + 1)); seq = False
                else: delete.append(v)
    return dict(refs=np.array(refs, np.int64), w=np.array(wts, np.float32), off=np.array(offs, np.float32), scale=scale,
                delete=sorted(set(delete)), obj=obj, mat=mat, depth=depth)

def proxy(kind, folder, label, tex_mode="rgb", tex_size=1024, extra=None):
    mhclo = (glob.glob(os.path.join(folder, "*.mhclo")) + glob.glob(os.path.join(folder, "*.proxy")))[0]
    c = read_mhclo(mhclo)
    v, vt, faces, _ = read_obj(os.path.join(folder, c["obj"]))
    assert len(v) == len(c["refs"]), (folder, len(v), len(c["refs"]))
    rv, uv, idx = render_mesh(faces, vt)
    # bone weights: blend the weights of the three reference body vertices
    pw = []
    for r, w in zip(c["refs"], c["w"]):
        d = {}
        for vi, wi in zip(r, w):
            if wi <= 0: continue
            for b, x in vw[vi].items(): d[b] = d.get(b, 0) + x * wi
        pw.append(d or dict(vw[r[0]]))
    si, sw = skin_for([pw[i] for i in rv])
    mat = read_mhmat(os.path.join(folder, c["mat"])) if c["mat"] and os.path.exists(os.path.join(folder, c["mat"])) else {}
    name = os.path.basename(folder.rstrip("/"))
    textures = {}
    for key, slot, mode in (("diffuseTexture", "map", tex_mode), ("normalmapTexture", "normalMap", "rgb"), ("aomapTexture", "aoMap", "rgb")):
        if key in mat and os.path.exists(os.path.join(folder, mat[key])):
            textures[slot] = tex_out(os.path.join(folder, mat[key]), f"{kind}_{name}_{slot}", tex_size, mode if slot == "map" else "rgb")
    out = {"kind": kind, "id": name, "label": label, "depth": c["depth"],
           "refs": put(c["refs"], np.uint16), "w": put(c["w"], np.float32), "off": put(c["off"], np.float32),
           "scale": c["scale"], "delete": put(np.array(c["delete"]), np.uint16),
           "rv": put(rv, np.uint16), "uv": put(uv, np.float32), "index": put(idx, np.uint32 if len(rv) > 65535 else np.uint16),
           "skinIndex": si, "skinWeight": sw, "tex": textures,
           "transparent": mat.get("transparent", "False") == "True", "cull": mat.get("backfaceCull", "True") == "True"}
    if extra: out.update(extra)
    return out

proxies = []
A = lambda *p: os.path.join(ASSETS, *p)
proxies.append(proxy("eyes", A("eyes/high-poly"), "Eyes", extra={}))
eye_colors = {}
for f in sorted(glob.glob(A("eyes/materials/*.mhmat"))):
    m = read_mhmat(f); n = os.path.basename(f)[:-6]
    # keep alpha: the cornea's UVs land on transparent texels (flattening them painted the eyes black)
    if "diffuseTexture" in m: eye_colors[n] = tex_out(A("eyes/materials", m["diffuseTexture"]), "eye_" + n, 512, "rgba")
for d in sorted(glob.glob(A("eyebrows/*/"))): proxies.append(proxy("brows", d, os.path.basename(d.rstrip("/")), "gray", 512))
for d in sorted(glob.glob(A("eyelashes/*/")))[:2]: proxies.append(proxy("lashes", d, os.path.basename(d.rstrip("/")), "rgba", 512))
HAIR = {"ponytail01": "Ponytail", "short02": "Crop", "short04": "Slicked", "short01": "Curls", "short03": "Short", "bob02": "Bob",
        "bob01": "Swept bob", "braid01": "Fringe and braid", "long01": "Long", "afro01": "Afro"}
for k, lab in HAIR.items(): proxies.append(proxy("hair", A("hair", k), lab, "gray", 1024))
CLOTHES = {"male_casualsuit05": "Field jacket", "male_casualsuit03": "Striped shirt", "male_casualsuit06": "White tee",
           "female_casualsuit01": "Tee and jeans", "female_casualsuit02": "Tee and cutoffs", "male_casualsuit02": "Long sleeve",
           "male_casualsuit04": "Fitted tee", "female_sportsuit01": "Crop and leggings", "female_elegantsuit01": "Blouse and skirt",
           "male_worksuit01": "Overalls", "male_elegantsuit01": "Black suit"}
for k, lab in CLOTHES.items(): proxies.append(proxy("outfit", A("clothes", k), lab, "rgb", 1024))
for k in ("shoes01", "shoes02", "shoes03", "shoes04", "shoes05", "shoes06"): proxies.append(proxy("shoes", A("clothes", k), k.replace("shoes0", "Pair "), "rgb", 1024))
proxies.append(proxy("hat", A("clothes/fedora01"), "Fedora", "rgb", 1024))
for k in ("female1605", "male1591"): proxies.append(proxy("lod", A("proxymeshes", k), k, "rgb", 512))
print(f"proxies: {len(proxies)}")

meta = {"version": 1, "units": "m", "nVerts": NV, "base": put(base * S, np.float32), "body": body,
        "macro": macro_desc, "local": local, "skeleton": skeleton, "skins": skins, "eyeColors": eye_colors, "proxies": proxies,
        "license": "MakeHuman data and system assets, CC0 1.0 (Data Collection AB, Joel Palmius, Jonas Hauquier, Manuel Bastioni)"}
open(os.path.join(OUT, "human.bin"), "wb").write(bytes(blob))
json.dump(meta, open(os.path.join(OUT, "human.json"), "w"), separators=(",", ":"))
print(f"human.bin {len(blob)//1024} KB, human.json {os.path.getsize(os.path.join(OUT,'human.json'))//1024} KB")
