/* Fast travel. Pick a spot on the pause map; you can land on a street, a
   pavement, the beach, the pier or open ground, never inside a building or in
   the sea (a pick on a roof or a wall snaps to the nearest street). Then the
   switch: the camera leaves you in three hard cuts, up and up until the island
   is a map under you, drained of colour, glides across the sky to the spot, and
   drops back down in three cuts to land behind you. Every cut is a flash, a
   punch of lens and a thump. One trip, then it recharges. */
import * as THREE from "three";
import { inPoly } from "./city/roads.js?v=dev";
import { lanePoint, beachY, promenade, SEA, PIER, DISTRICT_NAMES } from "./world.js?v=dev";

export const COOLDOWN = 30;   // seconds between trips
const V = THREE.Vector3;
const outExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Travel {
  constructor(o) {
    Object.assign(this, o);   // world, player, rig, camera, blit, sfx, hud, vehicles, life, setFog, onArrive
    this.active = false; this.ready = 0; this.segs = []; this.t = 0;
    this.fx = { flash: 0, ab: 0, desat: 0, vig: 0, fov: 0 };
  }
  get cooldown() { return Math.max(0, this.ready - performance.now() / 1000); }
  // why you can't go right now (null: you can)
  blocked() {
    if (this.active) return "Already on the way";
    if (this.life && (this.life.dead || this.life.knock > 0)) return "Not while you're down";
    if (this.vehicles && this.vehicles.driving) return "Get out of the car first";
    if (this.police && this.police.wanted) return "Not while the police are after you";
    const c = this.cooldown; if (c > 0) return "Fast travel recharging " + Math.floor(c / 60) + ":" + String(Math.ceil(c % 60) % 60).padStart(2, "0");
    return null;
  }
  // is there room to stand here (not in a wall, a car or a post)?
  free(x, z) {
    const W = this.world, y = W.heightAt(x, z);
    for (const [ox, oz] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
      const q = { x: x + ox, z: z + oz }; W.grid.resolve(q, 0.45, y + 0.2, 1.6);
      if (Math.abs(q.x - x - ox) + Math.abs(q.z - z - oz) > 0.02) return false;
    }
    return true;
  }
  ground(x, z) {
    const W = this.world;
    if (x > PIER.x0 && x < PIER.x1 && z > PIER.z0 && z < PIER.z1) return "The pier";
    if (z > promenade(x)) return beachY(x, z) > SEA + 0.25 ? "The beach" : null;
    if (!inPoly(x, z, W.outline)) return null;
    return W.mask.get(x, z) ? "Street" : "Open ground";
  }
  // where a pick at (x, z) would land you
  check(x, z) {
    const P = this.player.pos, name = (gx, gz) => DISTRICT_NAMES[this.world.districtAt(gx, gz)] || "Marlowe Keys";
    const out = (gx, gz, kind, snapped) => ({ ok: true, x: gx, z: gz, kind, snapped, name: name(gx, gz), dist: Math.hypot(gx - P.x, gz - P.z) });
    const kind = this.ground(x, z);
    if (kind && this.free(x, z)) return out(x, z, kind, false);
    // a roof, a wall, a car park wall, the water's edge: the nearest pavement that's clear
    let best = null, bd = 45;
    for (const l of this.world.lanes) for (let s = 0; s <= l.L; s += 2) {
      const p = lanePoint(l, s), d = Math.hypot(p.x - x, p.z - z);
      if (d < bd && this.free(p.x, p.z)) { bd = d; best = p; }
    }
    if (best) return out(best.x, best.z, "Street", true);
    const sea = !kind && !inPoly(x, z, this.world.outline);
    return { ok: false, x, z, reason: sea ? "That's the sea. Pick somewhere on land." : "Nowhere to land there. Pick a street or open ground." };
  }
  start(spot, done) {
    if (this.blocked() || !spot || !spot.ok) return false;
    const cam = this.camera, P = this.player, s = { x: P.pos.x, z: P.pos.z }, d = { x: spot.x, z: spot.z };
    const head = (c, y) => new V(c.x, y, c.z), dir = new V(); cam.getWorldDirection(dir);
    const heading = Math.atan2(d.x - s.x, d.z - s.z), side = this.rig.yaw, back = heading + Math.PI;
    const above = (c, h, off, ang, ly = 0) => ({ pos: new V(c.x + Math.sin(ang) * off, h, c.z + Math.cos(ang) * off), look: head(c, ly) });
    const y0 = P.pos.y, far = Math.hypot(d.x - s.x, d.z - s.z), TOP = 300;
    const k0 = { pos: cam.position.clone(), look: cam.position.clone().addScaledVector(dir, 6) };
    const u1 = above(s, y0 + 16, 10, side, y0 + 1), u2 = above(s, 85, 16, side), u3 = above(s, TOP, 9, back);
    const g1 = above(d, TOP, 9, back);
    const seg = (from, to, dur, ease, cue) => this.segs.push({ from, to, dur, ease, cue });
    this.segs = []; this.t = 0; this.i = -1; this.done = done; this.spot = spot; this.heading = heading;
    seg(k0, u1, 0.5, outExpo, "up0"); seg(u1, u1, 0.22, null);
    seg(u1, u2, 0.5, outExpo, "up1"); seg(u2, u2, 0.22, null);
    seg(u2, u3, 0.6, outExpo, "up2"); seg(u3, u3, 0.25, null, "sky");
    seg(u3, g1, Math.min(3.2, Math.max(1.6, far / 200)), inOut, "glide");
    seg(g1, g1, 0.3, null, "arrive");   // the player moves here, out of sight below
    seg(g1, "d2", 0.5, outExpo, "down0"); seg("d2", "d2", 0.22, null);
    seg("d2", "d1", 0.5, outExpo, "down1"); seg("d1", "d1", 0.22, null);
    seg("d1", "end", 0.6, outExpo, "land");
    this.active = true; this.from = k0;
    if (this.hud && this.hud.root) this.hud.root.classList.add("travel");
    return true;
  }
  // drop the player at the spot and work out the shots down to them
  arrive() {
    const P = this.player, sp = this.spot;
    P.pos.set(sp.x, this.world.heightAt(sp.x, sp.z), sp.z); P.vel.set(0, 0, 0); P.yaw = this.heading;
    if (P.model) { P.model.position.copy(P.pos); P.model.rotation.y = P.yaw; }
    // where the follow camera will sit behind them
    this.rig.yaw = this.heading + Math.PI; this.rig.pitch = 0.18; this.rig.cur = null;
    const save = this.camera.position.clone(), q = this.camera.quaternion.clone(), fov = this.camera.fov;
    this.rig.update(1 / 60, { take: () => [0, 0] }, P);
    const dir = new V(); this.camera.getWorldDirection(dir);
    const end = { pos: this.camera.position.clone(), look: this.camera.position.clone().addScaledVector(dir, 6) };
    this.camera.position.copy(save); this.camera.quaternion.copy(q); this.camera.fov = fov; this.camera.updateProjectionMatrix();
    const y0 = P.pos.y, back = this.rig.yaw, c = { x: sp.x, z: sp.z };
    const at = (h, off, ly = 0) => ({ pos: new V(c.x + Math.sin(back) * off, h, c.z + Math.cos(back) * off), look: new V(c.x, ly, c.z) });
    this.keys = { d2: at(85, 16), d1: at(y0 + 16, 10, y0 + 1), end };
    if (this.life) this.life.iframes = Math.max(this.life.iframes, 3);
  }
  cue(name) {
    const S = this.sfx || {}, F = this.fx;
    const hop = (k, up) => { F.flash = 0.5; F.ab = 1; F.fov = 1; if (S.switchHop) S.switchHop(up, k); };
    if (name === "up0") { hop(0, true); if (S.duckAll) S.duckAll(8); }
    else if (name === "up1") hop(1, true);
    else if (name === "up2") hop(2, true);
    else if (name === "sky") { this.bed = S.skyBed ? S.skyBed() : null; }
    else if (name === "arrive") this.arrive();
    else if (name === "down0") { hop(2, false); if (this.bed) { this.bed.stop(); this.bed = null; } }
    else if (name === "down1") hop(1, false);
    else if (name === "land") { hop(0, false); if (S.switchLand) S.switchLand(); }
  }
  pose(k) { return typeof k === "string" ? this.keys[k] : k; }
  update(dt) {
    if (!this.active) return false;
    const cam = this.camera, F = this.fx;
    this.t += dt;
    while (this.i < 0 || (this.i < this.segs.length && this.t >= this.segs[this.i].dur)) {
      if (this.i >= 0) this.t -= this.segs[this.i].dur;
      this.i++;
      if (this.i >= this.segs.length) return this.finish();
      const sg = this.segs[this.i]; if (sg.cue) this.cue(sg.cue);
    }
    const sg = this.segs[this.i], a = this.pose(sg.from), b = this.pose(sg.to), k = sg.ease ? sg.ease(Math.min(1, this.t / sg.dur)) : 1;
    const pos = a.pos.clone().lerp(b.pos, k), look = a.look.clone().lerp(b.look, k);
    if (sg.cue === "glide") pos.y += Math.sin(Math.PI * k) * 40;   // a long arc over the island
    if (!sg.ease) pos.y += Math.sin(this.t * 3) * 0.3 * (pos.y / 80);   // a held breath of drift
    cam.position.copy(pos); cam.lookAt(look);
    // altitude: colour drains, the frame closes in, the haze thins so the island reads
    const alt = Math.max(0, Math.min(1, (pos.y - 10) / 120));
    F.desat += (alt * 0.55 - F.desat) * Math.min(1, dt * 6); F.vig += (alt * 0.7 - F.vig) * Math.min(1, dt * 6);
    F.flash = Math.max(0, F.flash - dt * 4.5); F.ab = Math.max(0, F.ab - dt * 3.2); F.fov = Math.max(0, F.fov - dt * 2.6);
    const fov = (this.rig.baseFov || 70) - 14 * F.fov * F.fov;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (this.setFog) this.setFog(alt);
    this.apply();
    return true;
  }
  apply() {
    const u = this.blit && this.blit.mat.uniforms, F = this.fx; if (!u) return;
    u.uFlash.value = F.flash * F.flash; u.uAb.value = F.ab; u.uDesat.value = F.desat; u.uVig.value = F.vig;
  }
  finish() {
    this.active = false; this.ready = performance.now() / 1000 + COOLDOWN;
    Object.assign(this.fx, { flash: 0, ab: 0, desat: 0, vig: 0, fov: 0 }); this.apply();
    if (this.setFog) this.setFog(0);
    if (this.bed) { this.bed.stop(); this.bed = null; }
    this.rig.cur = null; this.rig.fov = this.rig.baseFov || 70;
    if (this.hud && this.hud.root) this.hud.root.classList.remove("travel");
    if (this.onArrive) this.onArrive(this.spot);
    const cb = this.done; this.done = null; if (cb) cb();
    return false;
  }
}
