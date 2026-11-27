/* The debug menu. Hold 1, 2, 3, 8, 9 and 0 together for three seconds to open it; the arrows move and change,
   Enter picks, Esc (or Backspace) closes. While it's open the game doesn't see the keyboard. */
const COMBO = ["Digit1", "Digit2", "Digit3", "Digit8", "Digit9", "Digit0"], HOLD = 3;

export class DebugMenu {
  constructor(o) {
    Object.assign(this, o);   // root, input, police, arsenal, life, hud
    this.open = false; this.held = 0; this.sel = 0;
    this.flags = { rapid: false, god: false, ammo: false };
    // invincible: the damage never lands
    if (this.life) { const d0 = this.life.damage.bind(this.life); this.life.damage = (a, h) => (this.flags.god ? undefined : d0(a, h)); }
    this.items = [
      { label: "Wanted level", value: () => "★".repeat(this.police.level) + "☆".repeat(5 - this.police.level), left: () => this.want(-1), right: () => this.want(1), enter: () => this.want(1, true) },
      { label: "Rapid fire (pistol)", value: () => (this.flags.rapid ? "On" : "Off"), toggle: "rapid" },
      { label: "Invincible", value: () => (this.flags.god ? "On" : "Off"), toggle: "god" },
      { label: "Infinite ammo", value: () => (this.flags.ammo ? "On" : "Off"), toggle: "ammo" },
      { label: "Heal", value: () => Math.round(this.life.health) + "%", enter: () => { this.life.health = 100; if (this.life.sync) this.life.sync(); } },
      { label: "Close", value: () => "", enter: () => this.close() }
    ];
    this.el = document.createElement("div"); this.el.className = "dbg"; this.el.setAttribute("role", "dialog"); this.el.setAttribute("aria-label", "Debug menu");
    if (this.root) this.root.appendChild(this.el);
    this.bar = document.createElement("div"); this.bar.className = "dbg-hold"; if (this.root) this.root.appendChild(this.bar);
    this.onKey = (e) => {
      if (!this.open) return;
      const k = e.code, it = this.items[this.sel];
      if (k === "ArrowUp") this.sel = (this.sel + this.items.length - 1) % this.items.length;
      else if (k === "ArrowDown") this.sel = (this.sel + 1) % this.items.length;
      else if (k === "ArrowLeft") { if (it.toggle) this.flags[it.toggle] = !this.flags[it.toggle]; else if (it.left) it.left(); }
      else if (k === "ArrowRight") { if (it.toggle) this.flags[it.toggle] = !this.flags[it.toggle]; else if (it.right) it.right(); }
      else if (k === "Enter" || k === "NumpadEnter" || k === "Space") { if (it.toggle) this.flags[it.toggle] = !this.flags[it.toggle]; else if (it.enter) it.enter(); }
      else if (k === "Escape" || k === "Backspace") this.close();
      else return;
      e.preventDefault(); e.stopImmediatePropagation(); this.draw();
    };
    addEventListener("keydown", this.onKey, true);
    addEventListener("keyup", (e) => { if (this.open) { e.stopImmediatePropagation(); } }, true);
  }
  want(d, wrap) {
    let n = this.police.level + d; if (wrap && n > 5) n = 0; n = Math.max(0, Math.min(5, n));
    this.police.setLevel(n); if (n > 0) { this.police.seen = true; this.police.last.copy(this.player.pos); }
  }
  show() {
    this.open = true; this.sel = 0; this.input.keys.clear(); this.wasActive = this.input.active; this.input.active = false;
    this.el.classList.add("on"); this.draw();
  }
  close() { this.open = false; this.el.classList.remove("on"); this.input.active = this.wasActive !== false; this.input.keys.clear(); this.held = 0; }
  draw() {
    const rows = this.items.map((it, i) => `<li class="${i === this.sel ? "sel" : ""}"><span>${it.label}</span><b>${it.value()}</b></li>`).join("");
    this.el.innerHTML = `<h2>Debug</h2><ul>${rows}</ul><p>↑ ↓ select · ← → change · Enter · Esc closes</p>`;
  }
  update(dt) {
    // the combo, held
    if (!this.open) {
      const all = COMBO.every((k) => this.input.keys.has(k));
      this.held = all ? this.held + dt : 0;
      this.bar.classList.toggle("on", this.held > 0.3);
      this.bar.style.setProperty("--k", Math.min(1, this.held / HOLD).toFixed(3));
      if (this.held >= HOLD) { this.bar.classList.remove("on"); this.show(); }
    } else if (this.items[0]) this.draw();
    // what's switched on
    const A = this.arsenal; if (A) { A.rapid = this.flags.rapid; if (this.flags.ammo && A.weapon && !A.weapon.melee) { A.weapon.ammo = A.weapon.mag; A.weapon.left = Math.max(A.weapon.left || 0, A.weapon.reserve || 0); } }
  }
}
