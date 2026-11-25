/* HUD: a rotating radar drawn from the world's own layout, area names as you
   cross into a district, a help box, cash and wanted stars. Plain canvas and
   DOM, so it costs next to nothing. */
import { DISTRICT_NAMES } from "./world.js?v=dev";

const S = 1.5;   // map pixels per metre

export function drawMap(world) {
  const { EDGE, PIER, map } = world, pad = 60;
  const x0 = EDGE.w - pad, z0 = EDGE.n - pad, x1 = EDGE.e + pad, z1 = PIER.z1 + 30;
  const c = document.createElement("canvas"); c.width = Math.ceil((x1 - x0) * S); c.height = Math.ceil((z1 - z0) * S);
  const g = c.getContext("2d"), X = (x) => (x - x0) * S, Z = (z) => (z - z0) * S, rect = (a, b, cc, d) => g.fillRect(X(a), Z(b), (cc - a) * S, (d - b) * S);
  g.fillStyle = "#0E2436"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#8C7A58"; rect(EDGE.w, EDGE.s, EDGE.e, world.SHORE);                    // beach
  g.fillStyle = "#5E6A80"; rect(EDGE.w, EDGE.n, EDGE.e, EDGE.s);                          // roads
  for (const [a, b, cc, d] of map.blocks) { g.fillStyle = "#1B2433"; rect(a, b, cc, d); }
  for (const [a, b, cc, d] of map.parks) { g.fillStyle = "#2B4C34"; rect(a, b, cc, d); }
  for (const [a, b, cc, d] of map.buildings) { g.fillStyle = "#26324A"; rect(a, b, cc, d); }
  g.fillStyle = "#7A6248"; rect(PIER.x0, PIER.z0, PIER.x1, PIER.z1);                     // pier
  return { canvas: c, x0, z0 };
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
    const k = w.ammo + "/" + w.left + (w.reloading ? "r" : ""); if (k === this.wKey) return; this.wKey = k;
    el.querySelector("b").textContent = w.ammo; el.querySelector("span").textContent = "/ " + w.left; el.classList.toggle("reloading", !!w.reloading);
  }
  // shown while aiming; the ticks open with the spread and go red over a person
  reticle(alpha, spreadPx, target) {
    const el = this.rEl || (this.rEl = this.root.querySelector(".reticle")); if (!el) return;
    const o = alpha > 0.3 ? 1 : 0, s = Math.round(4 + Math.min(40, spreadPx));
    if (o !== this.rO) { el.style.opacity = o; this.rO = o; }
    if (s !== this.rS) { el.style.setProperty("--s", s + "px"); this.rS = s; }
    if (target !== this.rT) { el.classList.toggle("target", target); this.rT = target; }
  }
  hitmark(kill) {
    const el = this.hEl || (this.hEl = this.root.querySelector(".hitmark")); if (!el) return;
    el.classList.toggle("kill", !!kill); el.getAnimations().forEach((a) => a.cancel());
    el.animate([{ opacity: 1, scale: 1.25 }, { opacity: 1, scale: 1, offset: 0.25 }, { opacity: 0, scale: 1 }], { duration: kill ? 420 : 260, easing: "cubic-bezier(.16,1,.3,1)" });
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
  update(player, camYaw) {
    this.showArea(this.world.districtAt(player.pos.x, player.pos.z));
    const g = this.g, W = this.radar.width, r = W / 2, k = r / 120 / S;   // ~120 m to the rim
    g.clearRect(0, 0, W, W);
    g.save(); g.beginPath(); g.arc(r, r, r - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#0E2436"; g.fillRect(0, 0, W, W);
    g.translate(r, r); g.rotate(camYaw); g.scale(k, k);
    g.drawImage(this.map.canvas, -(player.pos.x - this.map.x0) * S, -(player.pos.z - this.map.z0) * S);
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
  // full map for the pause screen
  drawFull(ctx, w, h, player) {
    const m = this.map.canvas, s = Math.min(w / m.width, h / m.height);
    ctx.fillStyle = "#0E2436"; ctx.fillRect(0, 0, w, h);
    const ox = (w - m.width * s) / 2, oy = (h - m.height * s) / 2;
    ctx.drawImage(m, ox, oy, m.width * s, m.height * s);
    const px = ox + (player.pos.x - this.map.x0) * S * s, py = oy + (player.pos.z - this.map.z0) * S * s;
    ctx.fillStyle = "#19C3B1"; ctx.strokeStyle = "#0A0A0A"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(247,242,234,.7)"; ctx.font = "800 20px Archivo, sans-serif"; ctx.textAlign = "center";
    const label = (t, x, z) => ctx.fillText(t.toUpperCase(), ox + (x - this.map.x0) * S * s, oy + (z - this.map.z0) * S * s);
    label("Downtown", 0, -200); label("Port Salt", -224, -40); label("Midtown", 120, 40); label("Tideline", -60, 250); label("Palm Square", 0, 0);
  }
}
