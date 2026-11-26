/* HUD: a rotating radar drawn from the world's own layout, area names as you
   cross into a district, a help box, cash and wanted stars. Plain canvas and
   DOM, so it costs next to nothing. */
import { DISTRICT_NAMES, waterline, promenade } from "./world.js?v=dev";

const S = 1.5;   // map pixels per metre

export function drawMap(world) {
  const { EDGE, PIER, map } = world, pad = 60;
  const x0 = EDGE.w - pad, z0 = EDGE.n - pad, x1 = EDGE.e + pad, z1 = PIER.z1 + 30;
  const c = document.createElement("canvas"); c.width = Math.ceil((x1 - x0) * S); c.height = Math.ceil((z1 - z0) * S);
  const g = c.getContext("2d"), X = (x) => (x - x0) * S, Z = (z) => (z - z0) * S;
  const poly = (P, fill) => { g.beginPath(); P.forEach((p, k) => (k ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)))); g.closePath(); g.fillStyle = fill; g.fill(); };
  g.fillStyle = "#0E2436"; g.fillRect(0, 0, c.width, c.height);
  // the beach, out to the real waterline; the island
  g.fillStyle = "#8C7A58"; g.beginPath(); g.moveTo(X(EDGE.w - 30), Z(promenade(EDGE.w - 30)));
  for (let x = EDGE.w - 30; x <= EDGE.e + 30; x += 4) g.lineTo(X(x), Z(waterline(x)));
  for (let x = EDGE.e + 30; x >= EDGE.w - 30; x -= 4) g.lineTo(X(x), Z(promenade(x)));
  g.closePath(); g.fill();
  poly(map.outline, "#1B2433");
  for (const P of map.parks) poly(P, "#2B4C34");
  for (const P of map.lots) poly(P, "#20283a");
  // streets: pavement, then road, so junctions read
  g.lineCap = "round"; g.lineJoin = "round";
  for (const [col, extra] of [["#3c4658", 6], ["#5E6A80", 0]]) for (const r of map.roads) {
    g.strokeStyle = col; g.lineWidth = (r.w + extra) * S; g.beginPath();
    r.pts.forEach((p, k) => (k ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)))); g.stroke();
  }
  for (const b of map.buildings) poly(b.pts, b.h > 40 ? "#33405c" : "#26324A");
  for (const P of map.pools) poly(P, "#3f8fb0");
  g.fillStyle = "#7A6248"; g.fillRect(X(PIER.x0), Z(PIER.z0), (PIER.x1 - PIER.x0) * S, (PIER.z1 - PIER.z0) * S);   // pier
  return { canvas: c, x0, z0 };
}

// a house mark: roof and walls, centred on 0,0, s = half width
function house(g, s) {
  g.fillStyle = "#19C3B1"; g.strokeStyle = "#0A0A0A"; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-s, -s * 0.1); g.lineTo(0, -s * 1.05); g.lineTo(s, -s * 0.1); g.lineTo(s * 0.75, -s * 0.1); g.lineTo(s * 0.75, s); g.lineTo(-s * 0.75, s); g.lineTo(-s * 0.75, -s * 0.1); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#0A0A0A"; g.fillRect(-s * 0.22, s * 0.3, s * 0.44, s * 0.7);
}
export class Hud {
  constructor(root, world) {
    this.root = root; this.world = world; this.map = drawMap(world);
    this.radar = root.querySelector(".radar"); this.g = this.radar.getContext("2d");
    this.areaEl = root.querySelector(".area"); this.area = null;
    this.cashEl = root.querySelector(".cash"); this.starsEl = root.querySelector(".stars");
    this.cash = 4820; this.wanted = 0;
    this.cashEl.textContent = "$" + this.cash.toLocaleString("en-US");
    this.setWanted(0);
  }
  /* key tips, GTA style: a box top left, one at a time, queued. {Key} becomes a key cap.
     tipOnce shows a tip the first time only (remembered in localStorage). */
  tip(text, ms) {
    (this.tq || (this.tq = [])).push([text, ms || 6500 + text.length * 25]);
    if (!this.tOn) this.nextTip();
  }
  nextTip() {
    const el = this.tEl || (this.tEl = this.root.querySelector(".help")), n = this.tq.shift();
    if (!el || !n) { this.tOn = false; return; }
    this.tOn = true;
    el.innerHTML = n[0].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\{([^}]+)\}/g, "<kbd>$1</kbd>");
    el.classList.add("on"); if (this.sfxTip) this.sfxTip();
    clearTimeout(this.tT); this.tT = setTimeout(() => { el.classList.remove("on"); this.tT = setTimeout(() => this.nextTip(), 500); }, n[1]);
  }
  tipOnce(key, text) {
    let seen = []; try { seen = JSON.parse(localStorage.getItem("lowtide_tips") || "[]"); } catch (e) { /* private mode: show it */ }
    if (seen.includes(key) || (this.tSeen || (this.tSeen = new Set())).has(key)) return;
    this.tSeen.add(key); seen.push(key); try { localStorage.setItem("lowtide_tips", JSON.stringify(seen)); } catch (e) { /* fine */ }
    this.tip(text);
  }
  // a line of overheard speech, bottom centre, like film subtitles
  subtitle(text) {
    const el = this.subEl || (this.subEl = this.root.querySelector(".subtitle"));
    if (!el) return;
    el.textContent = text; el.classList.add("on");
    clearTimeout(this.subT); this.subT = setTimeout(() => el.classList.remove("on"), 2400 + text.length * 45);
  }
  // armed: { name, ammo, left, reloading } or null
  weapon(w) {
    const el = this.wEl || (this.wEl = this.root.querySelector(".weapon")); if (!el) return;
    el.hidden = !w; if (!w) return;
    const k = w.id + w.ammo + "/" + w.left + (w.reloading ? "r" : ""); if (k === this.wKey) return; this.wKey = k;
    el.dataset.w = w.id;
    el.querySelector("b").textContent = w.melee ? "" : w.ammo; el.querySelector("span").textContent = w.melee ? w.name : "/ " + w.left; el.classList.toggle("reloading", !!w.reloading);
  }
  // shown while aiming; the ticks open with the spread and go red over a person
  reticle(alpha, spreadPx, target) {
    const el = this.rEl || (this.rEl = this.root.querySelector(".reticle")); if (!el) return;
    const o = alpha > 0.3 ? 1 : 0, s = Math.round(4 + Math.min(40, spreadPx));
    if (o !== this.rO) { el.style.opacity = o; this.rO = o; }
    if (s !== this.rS) { el.style.setProperty("--s", s + "px"); this.rS = s; }
    if (target !== this.rT) { el.classList.toggle("target", target); this.rT = target; }
  }
  // the weapon wheel: open, the selected place (0..7, clockwise from the top), what you carry
  wheel(open, sel, list) {
    const el = this.whEl || (this.whEl = this.root.querySelector(".wheel")); if (!el) return;
    if (!this.wsl) {
      const ICON = { null: '<svg viewBox="0 0 40 40"><path d="M9 14q0-4 4-4h3q2-3 5-1 3-2 5 1 4-1 5 3v12q0 9-9 9h-5q-8 0-8-8z"/></svg>',
        pistol: this.root.querySelector(".i-pistol").outerHTML, shotgun: this.root.querySelector(".i-shotgun").outerHTML, melee: this.root.querySelector(".i-melee").outerHTML };
      const NAMES = ["Unarmed", "Melee", "Pistol", "SMG", "Shotgun", "Rifle", "Sniper", "Thrown"], IDS = [null, "melee", "pistol", "smg", "shotgun", "rifle", "sniper", "thrown"];
      this.wsl = IDS.map((id, i) => {
        const d = document.createElement("div"); d.className = "ws"; d.style.setProperty("--a", (i * 45) + "deg");
        d.innerHTML = (ICON[id] || "") + "<small>" + NAMES[i] + "</small>"; d.dataset.id = id; el.appendChild(d); return d;
      });
      this.wsl.forEach((d) => { const s = d.querySelector("svg"); if (s) s.removeAttribute("class"); });
    }
    if (open !== this.wOpen) { el.classList.toggle("on", open); this.wOpen = open; }
    if (!open) return;
    const have = new Set(["null"].concat(list.map((w) => w.id))), key = sel + list.map((w) => w.ammo + w.left).join();
    if (key === this.wK) return; this.wK = key;
    this.wsl.forEach((d, i) => { d.classList.toggle("on", i === sel); d.classList.toggle("empty", !have.has(d.dataset.id)); });
    const w = list.find((x) => x.id === this.wsl[sel].dataset.id);
    el.querySelector(".wc b").textContent = w ? w.name : "Unarmed"; el.querySelector(".wc span").textContent = w && !w.melee ? w.ammo + " / " + w.left : "";
  }
  hitmark(kill, head) {
    const el = this.hEl || (this.hEl = this.root.querySelector(".hitmark")); if (!el) return;
    el.classList.toggle("kill", !!kill); el.classList.toggle("head", !!head); el.getAnimations().forEach((a) => a.cancel());
    el.animate([{ opacity: 1, scale: 1.25 }, { opacity: 1, scale: 1, offset: 0.25 }, { opacity: 0, scale: 1 }], { duration: head ? 900 : kill ? 420 : 260, easing: "cubic-bezier(.16,1,.3,1)" });
  }
  setWanted(n) {
    this.wanted = n;
    this.starsEl.innerHTML = [0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? "on" : ""}">★</i>`).join("");
    this.starsEl.style.visibility = n ? "visible" : "hidden";
  }
  showArea(key) {
    if (key === this.area) return; this.area = key;
    const el = this.areaEl;
    el.innerHTML = `<b>${DISTRICT_NAMES[key] || key}</b><span>Marlowe Keys</span>`;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none", offset: 0.12 }, { opacity: 1, transform: "none", offset: 0.8 }, { opacity: 0, transform: "none" }],
      { duration: 4200, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
  }
  // wanted: the stars flash while they've lost sight of you; the search area on the radar; cop blips
  searching(on) { this.starsEl.classList.toggle("search", !!on); }
  searchArea(a) { this.search = a; }
  update(player, camYaw) {
    this.showArea(this.world.districtAt(player.pos.x, player.pos.z));
    const g = this.g, W = this.radar.width, r = W / 2, k = r / 120 / S;   // ~120 m to the rim
    g.clearRect(0, 0, W, W);
    g.save(); g.beginPath(); g.arc(r, r, r - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#0E2436"; g.fillRect(0, 0, W, W);
    g.translate(r, r); g.rotate(camYaw); g.scale(k, k);
    g.drawImage(this.map.canvas, -(player.pos.x - this.map.x0) * S, -(player.pos.z - this.map.z0) * S);
    const flash = (performance.now() / 260 | 0) % 2;
    if (this.search) {   // where they're looking for you
      g.fillStyle = flash ? "rgba(229,72,77,.22)" : "rgba(60,110,255,.22)"; g.strokeStyle = flash ? "rgba(229,72,77,.8)" : "rgba(60,110,255,.8)"; g.lineWidth = 2 / k;
      g.beginPath(); g.arc((this.search.x - player.pos.x) * S, (this.search.z - player.pos.z) * S, this.search.r * S, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (this.blips) for (const b of this.blips()) {
      const bx = (b.x - player.pos.x) * S, bz = (b.z - player.pos.z) * S, rr = (b.heli ? 9 : b.foot ? 5 : 7) / k;
      g.fillStyle = ((b.x * 7 + b.z) | 0) % 2 === flash ? "#E5484D" : "#3C6EFF"; g.strokeStyle = "#0A0A0A"; g.lineWidth = 2 / k;
      g.beginPath(); if (b.heli) { g.rect(bx - rr, bz - rr, rr * 2, rr * 2); } else g.arc(bx, bz, rr, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (this.home) {   // home: a little house, held to the rim when it's off the radar
      let hx = (this.home.x - player.pos.x) * S, hz = (this.home.z - player.pos.z) * S; const lim = (r - 16) / k, L = Math.hypot(hx, hz);
      if (L > lim) { hx *= lim / L; hz *= lim / L; }
      g.save(); g.translate(hx, hz); g.rotate(-camYaw); g.scale(1 / k, 1 / k); house(g, 9); g.restore();
    }
    g.restore();
    // the player: a teal arrow pointing the way they face, relative to the camera
    g.save(); g.translate(r, r); g.rotate(camYaw + Math.PI - player.yaw);
    g.fillStyle = "#19C3B1"; g.strokeStyle = "#0A0A0A"; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // north on the rim
    const nx = r + Math.sin(-camYaw) * -(r - 14), ny = r - Math.cos(-camYaw) * (r - 14);
    g.fillStyle = "rgba(10,10,10,.75)"; g.beginPath(); g.arc(nx, ny, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#F7F2EA"; g.font = "800 13px Archivo, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("N", nx, ny + 1);
  }
  /* full map for the pause screen. opt: { zoom (1 = whole island), cx, cz (centre, world m; null = middle),
     hover {x,z}, pick (a fast-travel check: ok, x, z), hospital {x,z} }. Returns how to read it back. */
  drawFull(ctx, w, h, player, opt = {}) {
    const m = this.map.canvas, base = Math.min(w / m.width, h / m.height) * S, z = Math.max(1, opt.zoom || 1), sc = base * z;
    const mw = m.width / S, mh = m.height / S, mx = this.map.x0 + mw / 2, mz = this.map.z0 + mh / 2;
    // keep the island on screen: the centre can't wander further than the zoom allows
    const hw = w / 2 / sc, hh = h / 2 / sc, lim = (v, c, half, span) => (half * 2 >= span ? c : Math.max(c - span / 2 + half, Math.min(c + span / 2 - half, v)));
    const cx = lim(opt.cx == null ? mx : opt.cx, mx, hw, mw), cz = lim(opt.cz == null ? mz : opt.cz, mz, hh, mh);
    const X = (x) => w / 2 + (x - cx) * sc, Y = (zz) => h / 2 + (zz - cz) * sc;
    ctx.fillStyle = "#0E2436"; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = z < 2.5;
    ctx.drawImage(m, X(this.map.x0), Y(this.map.z0), m.width / S * sc, m.height / S * sc);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(247,242,234,.62)"; ctx.font = `800 ${Math.round(16 + z * 3)}px Archivo, sans-serif`;
    for (const [t, x, zz] of this.world.map.labels) ctx.fillText(t.toUpperCase(), X(x), Y(zz));
    if (opt.station) {   // the police station
      const sx = X(opt.station.x), sy = Y(opt.station.z);
      ctx.fillStyle = "#3C6EFF"; ctx.strokeStyle = "#0A0A0A"; ctx.lineWidth = 3; ctx.fillRect(sx - 10, sy - 10, 20, 20); ctx.strokeRect(sx - 10, sy - 10, 20, 20);
      ctx.fillStyle = "#fff"; ctx.font = "900 15px Archivo, sans-serif"; ctx.fillText("P", sx, sy + 1);
    }
    if (opt.home) { ctx.save(); ctx.translate(X(opt.home.x), Y(opt.home.z)); house(ctx, 13); ctx.restore(); ctx.fillStyle = "#F7F2EA"; ctx.font = "800 13px Archivo, sans-serif"; ctx.fillText("HOME", X(opt.home.x), Y(opt.home.z) + 24); }
    if (opt.hospital) {   // Marlowe General
      const hx = X(opt.hospital.x), hy = Y(opt.hospital.z);
      ctx.fillStyle = "#E5484D"; ctx.strokeStyle = "#0A0A0A"; ctx.lineWidth = 3; ctx.fillRect(hx - 10, hy - 10, 20, 20); ctx.strokeRect(hx - 10, hy - 10, 20, 20);
      ctx.fillStyle = "#fff"; ctx.font = "900 15px Archivo, sans-serif"; ctx.fillText("H", hx, hy + 1);
    }
    const px = X(player.pos.x), py = Y(player.pos.z), p = opt.pick;
    if (p) {
      const tx = X(p.x), ty = Y(p.z);
      if (p.ok) {
        ctx.setLineDash([10, 8]); ctx.strokeStyle = "rgba(255,211,110,.85)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#FFD36E"; ctx.strokeStyle = "#0A0A0A"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx, ty - 10); ctx.lineTo(tx, ty - 30); ctx.stroke();
      } else {
        ctx.strokeStyle = "#E5484D"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(tx - 10, ty - 10); ctx.lineTo(tx + 10, ty + 10); ctx.moveTo(tx + 10, ty - 10); ctx.lineTo(tx - 10, ty + 10); ctx.stroke();
      }
    }
    // you: an arrow the way you face
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI - player.yaw);
    ctx.fillStyle = "#19C3B1"; ctx.strokeStyle = "#0A0A0A"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 10); ctx.lineTo(0, 5); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    if (opt.hover) {   // the cursor's crosshair
      const hx = X(opt.hover.x), hy = Y(opt.hover.z);
      ctx.strokeStyle = "rgba(247,242,234,.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, h); ctx.moveTo(0, hy); ctx.lineTo(w, hy); ctx.stroke();
    }
    return { cx, cz, scale: sc, base, toWorld: (qx, qy) => ({ x: cx + (qx - w / 2) / sc, z: cz + (qy - h / 2) / sc }) };
  }
}
