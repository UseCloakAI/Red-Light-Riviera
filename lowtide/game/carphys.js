/* How the cars of Marlowe Keys move. A car is a rigid body on the ground plane (x, z, heading a, velocity vx/vz,
   yaw rate w) on four tyres, two axles:

   - Tyres: lateral grip from the slip angle on a magic-formula curve (it builds, peaks around 8 degrees, then falls
     away as the tyre slides), longitudinal force from the engine and the brakes, and the two sharing one friction
     circle, so a wheel that's braking or spinning has less left to corner with. Load moves front and back as the car
     accelerates and brakes (and the grip with it), which is what makes a car tuck in when you lift and push wide on
     the throttle.
   - Engine: a torque curve through a five-speed automatic (real ratios, a short cut in drive while it shifts), the
     drag and rolling resistance worked out from each model's power and top speed, so a van is slow and a Barracuda
     isn't. Brakes as hard as the tyres allow (ABS), the handbrake locks the rear wheels.
   - Suspension: the body pitches and rolls on springs under the forces (nose down under braking, squat on launch,
     lean in corners), over the kerbs and the slope of the ground under each wheel; the wheels stay on the road. Off a
     drop the car flies and lands on its springs.
   - Collisions: car against the world (boxes, posts) and car against car as two turned boxes (separating axes), each
     contact resolved with an impulse at the point it happened: the right speed off, the right spin on, a bit of
     scrape. A parked car or a car in traffic that's hit gets its own physics until it comes to rest.

   Frame: +z forward, +x the car's left (the driver's side), a turns +z toward +x. Steer > 0 turns left. */

export const G = 9.81;
const RATIOS = [3.3, 2.05, 1.45, 1.08, 0.85], REV_RATIO = 3.1, IDLE = 850, REDLINE = 6500, UP = 5900, DOWN = 2600;
const B_F = 8.6, B_R = 11.5, C_LAT = 1.42, CRR = 0.013;   // the rear tyres stiffer: a car that understeers a little, like a road car
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// everything derived from a model, once
const SPEC = new Map();
export function spec(m) {
  let s = SPEC.get(m); if (s) return s;
  const p = m.phys, mass = p.mass, L = m.axle[0] - m.axle[1], cz = (m.axle[0] + m.axle[1]) / 2 + 0.06 * L;
  const af = m.axle[0] - cz, br = cz - m.axle[1], R = m.wheelR, P = p.power * 1000;
  // final drive: top speed at a little under the redline in top gear
  const final = (6100 * 2 * Math.PI / 60) * R / (p.top * RATIOS[RATIOS.length - 1]);
  // drag: at top speed, the power that reaches the road all goes into drag and rolling
  const kd = Math.max(0.15, (P * 0.86 - CRR * mass * G * p.top) / (p.top ** 3));
  // peak torque: the power at 5600 rpm on the curve below
  const tq = P / (5600 * 2 * Math.PI / 60) / curve(5600);
  const fwd = m.id === "skiff" || m.id === "heron";
  s = { mass, L, cz, af, br, R, final, kd, tq, fwd, h: p.cg, Iz: mass * ((m.L ** 2) + (m.W ** 2)) / 12 * 1.15, mu: 1.02 * p.grip, brake: p.brake,
    hw: m.W / 2, hl: m.L / 2, track: m.track, pitchK: 0.0052 * (p.cg / 0.52), rollK: 0.0085 * (p.cg / 0.52) };
  SPEC.set(m, s); return s;
}
function curve(rpm) { const x = (rpm - 4300) / 4300; return Math.max(0.35, 1 - 0.5 * x * x); }
// the magic formula (lateral): 0 at no slip, peak near 0.14 rad, settling a little below it as the tyre slides
const mf = (a, B) => Math.sin(C_LAT * Math.atan(B * a - 0.6 * (B * a - Math.atan(B * a))));

export function initPhys(c, m) {
  c.m = m; c.S = spec(m);
  Object.assign(c, { vx: c.vx || 0, vz: c.vz || 0, om: c.om || 0, vy: 0, gear: 1, rpm: IDLE, shift: 0, slipF: 0, slipR: 0, spinR: 0, airT: 0,
    pitch: 0, pv: 0, roll: c.roll || 0, rv: 0, heave: 0, hv: 0, gp: 0, gr: 0, axF: 0, ayF: 0, wheelRot: 0, steer: c.steer || 0, rest: 0 });
  c.gy = c.y || 0; c.y = c.y || 0;
}
// forward speed (signed) from the velocity
export const fwdSpeed = (c) => c.vx * Math.sin(c.a) + c.vz * Math.cos(c.a);

/* one step of the full model. ctl: { thr 0..1, brk 0..1, steer (rad, + left), hand bool, rev bool (wants reverse) }
   env: { heightAt, surface(x, z) -> grip multiplier } */
export function step(c, ctl, h, env) {
  const S = c.S, sn = Math.sin(c.a), cs = Math.cos(c.a);
  // velocity in the car's frame: u forward, v toward +x (left)
  let u = c.vx * sn + c.vz * cs, v = c.vx * cs - c.vz * sn;
  const air = c.airT > 0.05, mu = S.mu * (env.surface ? env.surface(c.x, c.z) : 1) * (c.flats ? 0.55 : 1) * (0.55 + 0.45 * Math.min(1, (c.health ?? 100) / 25));
  // load on each axle, moved by the (smoothed) longitudinal acceleration
  const W = S.mass * G, dz = clamp(S.mass * c.axF * S.h / S.L, -0.3 * W, 0.3 * W);
  const Ff = Math.max(0.12 * W, W * S.br / S.L - dz), Fr = Math.max(0.12 * W, W * S.af / S.L + dz);
  // the gearbox and the engine
  const drive = engine(c, ctl, u, h);
  let FxF = 0, FxR = 0;
  if (S.fwd) FxF = drive; else FxR = drive;
  // brakes: what the pedal asks, up to what the tyres can give (ABS), shared 64/36
  const moving = Math.abs(u) > 0.15;
  if (ctl.brk > 0 && moving) { const B = ctl.brk * W * 1.05 * S.brake; FxF -= Math.sign(u) * B * 0.64; FxR -= Math.sign(u) * B * 0.36; }
  else if (ctl.brk > 0 && !moving && !ctl.thr) { u *= 0.5; }
  // the handbrake: rear wheels locked, sliding
  let locked = false;
  if (ctl.hand) { if (Math.abs(u) > 0.4) { FxR = -Math.sign(u) * mu * Fr * 0.82; locked = true; } else { u *= 0.6; FxR = 0; } }
  // rolling resistance and the air
  const sp = Math.hypot(c.vx, c.vz);
  let Fz = -CRR * W * clamp(u / 0.6, -1, 1) - S.kd * u * Math.abs(u), Fx = -S.kd * v * Math.abs(v) * 2;
  let tau = 0;
  if (!air) {
    const d = ctl.steer, sd = Math.sin(d), cd = Math.cos(d);
    // front axle: velocity there, in the wheels' own frame
    const vfx = v + c.om * S.af, vfl = vfx * cd - u * sd, vfz = u * cd + vfx * sd;
    const aF = Math.atan2(vfl, Math.max(Math.abs(vfz), 0.5));
    let capF = mu * Ff; FxF = clamp(FxF, -capF, capF);
    let latF = -capF * mf(aF, B_F) * Math.sqrt(Math.max(0, 1 - (FxF / capF) ** 2));
    // never more than it takes to stop the axle sliding this step (no jitter when slow)
    const mF = S.mass * S.br / S.L, lim = mF * Math.abs(vfl) / h; latF = clamp(latF, -lim, lim);
    // rear axle
    const vrx = v - c.om * S.br, aR = Math.atan2(vrx, Math.max(Math.abs(u), 0.5));
    const capR = mu * 1.06 * Fr, want = FxR; FxR = clamp(FxR, -capR, capR);
    c.spinR = !locked && Math.abs(want) > capR * 0.97 && Math.abs(u) < 25 ? Math.min(1, c.spinR + h * 4) : Math.max(0, c.spinR - h * 3);
    if (!S.fwd && c.spinR > 0.2) FxR *= 0.92;   // wheelspin: a little less drive than the grip
    let latR = -capR * mf(aR, B_R) * Math.sqrt(Math.max(0, 1 - (FxR / capR) ** 2)) * (locked ? 0.78 : 1);
    const mR = S.mass * S.af / S.L, limR = mR * Math.abs(vrx) / h; latR = clamp(latR, -limR, limR);
    // into the car's frame
    Fx += FxF * sd + latF * cd + latR; Fz += FxF * cd - latF * sd + FxR;
    tau = S.af * (FxF * sd + latF * cd) - S.br * latR;
    c.slipF = Math.abs(aF); c.slipR = locked ? 1 : Math.abs(aR);
  }
  // integrate (in the car's frame, then back out)
  const ax = Fx / S.mass, az = Fz / S.mass;
  u += az * h; v += ax * h;
  if (!air) c.om += tau / S.Iz * h; else c.om *= 1 - h * 0.2;
  // slow: the tyres just roll (a car crawling turns by its geometry, not by slip)
  let ks = 0;
  if (!air && Math.abs(u) < 2.5 && !locked) { ks = 1 - Math.abs(u) / 2.5; const wk = u * Math.tan(ctl.steer) / S.L; c.om += (wk - c.om) * Math.min(1, ks * h * 30); v *= 1 - Math.min(1, ks * h * 20); }
  // stopped and held: stay put
  if (!air && sp < 0.25 && !ctl.thr && (ctl.brk > 0 || ctl.hand || ctl.park)) { u *= 0.3; v *= 0.3; c.om *= 0.3; }
  // back to the world: the velocity stays where it was pointing (the tyres turn it, not the heading),
  // except at a crawl, where rolling wheels carry it round with the car
  c.a += c.om * h;
  const sn2 = Math.sin(c.a), cs2 = Math.cos(c.a), s_ = sn + (sn2 - sn) * ks, c_ = cs + (cs2 - cs) * ks;
  c.vx = u * s_ + v * c_; c.vz = u * c_ - v * s_;
  c.x += c.vx * h; c.z += c.vz * h;
  // the forces the body feels (smoothed: what the springs see)
  c.axF += (az - c.axF) * Math.min(1, h * 10); c.ayF += (ax + u * c.om - c.ayF) * Math.min(1, h * 10);
  c.speed = u; c.steer = ctl.steer;
  c.wheelRot += u / S.R * h * (locked ? 0 : 1) + (c.spinR > 0.3 && !S.fwd ? h * 30 * Math.sign(drive || 1) : 0);
}

// the engine through the gearbox: the drive force at the wheels, and the revs (for the sound)
function engine(c, ctl, u, h) {
  const S = c.S, R = S.R;
  if (c.shift > 0) c.shift -= h;
  // reverse when asked and nearly stopped; forward again the same way
  if (ctl.rev && u < 0.8 && c.gear > 0) c.gear = -1;
  if (!ctl.rev && ctl.thr > 0 && c.gear < 0 && u > -0.8) c.gear = 1;
  let ratio;
  if (c.gear < 0) ratio = REV_RATIO;
  else {
    let rpm = Math.abs(u) / R * RATIOS[c.gear - 1] * S.final * 60 / (2 * Math.PI);
    if (rpm > UP && c.gear < RATIOS.length && c.shift <= 0) { c.gear++; c.shift = 0.22; }
    else if (rpm < DOWN && c.gear > 1 && c.shift <= 0) { c.gear--; c.shift = 0.15; }
    ratio = RATIOS[c.gear - 1];
  }
  const wheelRpm = Math.abs(u) / R * 60 / (2 * Math.PI), clutch = Math.min(1, Math.abs(u) / 4);
  const want = Math.max(IDLE, wheelRpm * ratio * S.final);
  // the revs: off the wheels once moving, free (and flaring with the throttle) at a standstill or while spinning
  const free = IDLE + (REDLINE - IDLE) * 0.55 * ctl.thr + (c.spinR || 0) * 1500;
  const target = Math.min(REDLINE, want * clutch + free * (1 - clutch) + (c.spinR || 0) * 900);
  c.rpm += (target - c.rpm) * Math.min(1, h * (c.shift > 0 ? 5 : 12));
  if (!ctl.thr) return 0;
  const rpm = Math.max(c.rpm, 2200), T = S.tq * curve(rpm) * ctl.thr * (c.shift > 0 ? 0.15 : 1);
  const F = T * ratio * S.final * 0.88 / R;
  if (c.gear < 0) return -Math.min(F, 7000) * (u < -9 ? 0 : 1);
  return u < -0.5 ? 0 : F;
}

/* the body on its springs, over the ground under each wheel. Wheel heights out in c.wy[4] (FL, FR, RL, RR).
   Returns the vertical speed of a landing (0 if it didn't land). */
const _gy = [0, 0, 0, 0];
export function ride(c, h, heightAt) {
  const S = c.S, sn = Math.sin(c.a), cs = Math.cos(c.a), m = c.m;
  const pts = [[S.track / 2, m.axle[0]], [-S.track / 2, m.axle[0]], [S.track / 2, m.axle[1]], [-S.track / 2, m.axle[1]]];
  for (let i = 0; i < 4; i++) { const [lx, lz] = pts[i]; _gy[i] = heightAt(c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs); }
  if (!c.wy) c.wy = [0, 0, 0, 0];
  const front = (_gy[0] + _gy[1]) / 2, rear = (_gy[2] + _gy[3]) / 2, left = (_gy[0] + _gy[2]) / 2, right = (_gy[1] + _gy[3]) / 2;
  const gy = (front + rear) / 2, L = m.axle[0] - m.axle[1];
  const gp = Math.atan2(front - rear, L), gr = Math.atan2(left - right, S.track);
  let landed = 0;
  if (c.airT > 0) {   // in the air: ballistic until the ground comes back up to meet it
    c.vy -= G * h; c.y += c.vy * h; c.airT += h;
    if (c.y <= gy) { landed = -c.vy; c.y = gy; c.hv -= Math.min(4, Math.max(0, -c.vy)) * 0.5; c.pv += (c.gp - gp) * 3; c.vy = 0; c.airT = 0; }
    else { c.gp += (gp * 0.2 - c.gp) * h; for (let i = 0; i < 4; i++) c.wy[i] = c.y - 0.08; return 0; }
  } else {
    const dy = gy - c.y;
    // off a crest going up, or over a real drop: it flies
    if ((dy < -0.01 && c.vy > 1.4) || dy < -0.55) { c.airT = h; c.vy = Math.max(c.vy, 0) * 0.95; c.y += c.vy * h; }
    else {
      // a kerb or a step: the springs take it (a jolt through the body); a slope carries it up and down
      if (Math.abs(dy) > 0.07) c.hv -= clamp(dy, -0.3, 0.3) * 7;
      else c.vy += (dy / h - c.vy) * Math.min(1, h * 20);
      c.y = gy;
    }
  }
  // the ground's own slope, eased (the wheels sit on it; the body follows)
  c.gp += (gp - c.gp) * Math.min(1, h * 16); c.gr += (gr - c.gr) * Math.min(1, h * 16);
  // springs: pitch from braking/accelerating, roll from cornering, heave from bumps
  const tp = -c.axF * S.pitchK, tr = -c.ayF * S.rollK, w0 = 2 * Math.PI * 1.35, z0 = 0.42;
  c.pv += ((tp - c.pitch) * w0 * w0 - 2 * z0 * w0 * c.pv) * h; c.pitch += c.pv * h;
  c.rv += ((tr - c.roll) * w0 * w0 - 2 * z0 * w0 * c.rv) * h; c.roll += c.rv * h;
  c.hv += (-c.heave * (w0 * 1.3) ** 2 - 2 * 0.5 * w0 * 1.3 * c.hv) * h; c.heave += c.hv * h;
  c.pitch = clamp(c.pitch, -0.12, 0.12); c.roll = clamp(c.roll, -0.14, 0.14); c.heave = clamp(c.heave, -0.12, 0.12);
  for (let i = 0; i < 4; i++) c.wy[i] = _gy[i];
  return landed;
}

/* ---------------- collisions ----------------
   A car's outline: a box (half width hw, half length hl) about its centre. */
const corners = (c, out) => {
  const S = c.S, sn = Math.sin(c.a), cs = Math.cos(c.a), hw = S.hw, hl = S.hl;
  out.length = 0;
  for (const [lx, lz] of [[hw, hl], [-hw, hl], [-hw, -hl], [hw, -hl]]) out.push([c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs]);
  return out;
};
const _A = [], _B = [];
// separating axes between two turned boxes: { n: [x, z] from b toward a, depth, p: [x, z] contact } or null
export function boxBox(ax, az, aa, ahw, ahl, bx, bz, ba, bhw, bhl) {
  const A = boxPts(ax, az, aa, ahw, ahl, _A), B = boxPts(bx, bz, ba, bhw, bhl, _B);
  const axes = [[Math.cos(aa), -Math.sin(aa)], [Math.sin(aa), Math.cos(aa)], [Math.cos(ba), -Math.sin(ba)], [Math.sin(ba), Math.cos(ba)]];
  let best = Infinity, n = null;
  for (const [nx, nz] of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of A) { const d = x * nx + z * nz; if (d < a0) a0 = d; if (d > a1) a1 = d; }
    for (const [x, z] of B) { const d = x * nx + z * nz; if (d < b0) b0 = d; if (d > b1) b1 = d; }
    const o = Math.min(a1 - b0, b1 - a0); if (o <= 0) return null;
    if (o < best) { best = o; const s = (ax - bx) * nx + (az - bz) * nz >= 0 ? 1 : -1; n = [nx * s, nz * s]; }
  }
  // the contact: the corner of either box deepest into the other
  let p = null, pd = -Infinity;
  for (const [x, z] of A) { const d = -((x - bx) * n[0] + (z - bz) * n[1]); if (inBox(x, z, bx, bz, ba, bhw + 0.02, bhl + 0.02) && d > pd) { pd = d; p = [x, z]; } }
  for (const [x, z] of B) { const d = (x - ax) * n[0] + (z - az) * n[1]; if (inBox(x, z, ax, az, aa, ahw + 0.02, ahl + 0.02) && d > pd) { pd = d; p = [x, z]; } }
  if (!p) p = [(ax + bx) / 2, (az + bz) / 2];
  return { n, depth: best, p };
}
function boxPts(x, z, a, hw, hl, out) { const sn = Math.sin(a), cs = Math.cos(a); out.length = 0; for (const [lx, lz] of [[hw, hl], [-hw, hl], [-hw, -hl], [hw, -hl]]) out.push([x + lx * cs + lz * sn, z - lx * sn + lz * cs]); return out; }
function inBox(x, z, bx, bz, ba, hw, hl) { const dx = x - bx, dz = z - bz, sn = Math.sin(ba), cs = Math.cos(ba), lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; return Math.abs(lx) <= hw && Math.abs(lz) <= hl; }
// a circle (a post) against a car: { n (from the post toward the car), depth, p } or null
export function circleBox(c, x, z, r) {
  const S = c.S, sn = Math.sin(c.a), cs = Math.cos(c.a), dx = x - c.x, dz = z - c.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const qx = clamp(lx, -S.hw, S.hw), qz = clamp(lz, -S.hl, S.hl); let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
  let nlx, nlz, depth;
  if (d > 1e-6) { if (d >= r) return null; nlx = -ex / d; nlz = -ez / d; depth = r - d; }
  else { const px = S.hw - Math.abs(lx), pz = S.hl - Math.abs(lz); if (px < pz) { nlx = -Math.sign(lx); nlz = 0; depth = px + r; } else { nlx = 0; nlz = -Math.sign(lz); depth = pz + r; } }
  // back to the world (the normal points from the post into the car)
  const n = [nlx * cs + nlz * sn, -nlx * sn + nlz * cs], p = [c.x + qx * cs + qz * sn, c.z - qx * sn + qz * cs];
  return { n, depth, p };
}
// a grid box (straight or turned) against a car, as two boxes
export function gridBox(c, o) {
  const S = c.S;
  if (o.ob) return boxBox(c.x, c.z, c.a, S.hw, S.hl, o.cx, o.cz, Math.atan2(-o.sn, o.cs), o.hx, o.hz);
  return boxBox(c.x, c.z, c.a, S.hw, S.hl, (o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2, 0, (o.x1 - o.x0) / 2, (o.z1 - o.z0) / 2);
}

/* an impulse between car a and b (b null: the world) at contact p along n (pointing toward a).
   Returns the closing speed. e: restitution, f: friction (scrape) */
export function impulse(a, b, n, p, e = 0.18, f = 0.35) {
  const [nx, nz] = n, rax = p[0] - a.x, raz = p[1] - a.z;
  // velocity of the contact point on each body: v + w x r (w about y: (w*rz, -w*rx))
  let vax = a.vx + a.om * raz, vaz = a.vz - a.om * rax, vbx = 0, vbz = 0, rbx = 0, rbz = 0;
  if (b) { rbx = p[0] - b.x; rbz = p[1] - b.z; vbx = b.vx + b.om * rbz; vbz = b.vz - b.om * rbx; }
  const rvx = vax - vbx, rvz = vaz - vbz, vn = rvx * nx + rvz * nz;
  if (vn >= 0) return 0;
  const ia = 1 / a.S.mass, Ia = 1 / a.S.Iz, ib = b ? 1 / b.S.mass : 0, Ib = b ? 1 / b.S.Iz : 0;
  // r x n (scalar, about y, with this frame's sign): rz*nx - rx*nz
  const ran = raz * nx - rax * nz, rbn = rbz * nx - rbx * nz;
  const k = ia + ran * ran * Ia + ib + rbn * rbn * Ib, j = -(1 + e) * vn / k;
  apply(a, j * nx, j * nz, raz, rax, ia, Ia, 1);
  if (b) apply(b, j * nx, j * nz, rbz, rbx, ib, Ib, -1);
  // friction along the contact
  const tx = -nz, tz = nx, vt = rvx * tx + rvz * tz, rat = raz * tx - rax * tz, rbt = rbz * tx - rbx * tz;
  const kt = ia + rat * rat * Ia + ib + rbt * rbt * Ib; let jt = -vt / kt; jt = clamp(jt, -f * j, f * j);
  apply(a, jt * tx, jt * tz, raz, rax, ia, Ia, 1);
  if (b) apply(b, jt * tx, jt * tz, rbz, rbx, ib, Ib, -1);
  return -vn;
}
function apply(c, jx, jz, rz, rx, im, Ii, s) { c.vx += s * jx * im; c.vz += s * jz * im; c.om += s * (rz * jx - rx * jz) * Ii; }

/* a kinematic car (traffic on rails): moved by its speed and steering on the bicycle model, with its
   velocity and yaw rate kept up to date so it can be handed to the full model at any moment */
export function kin(c, h) {
  const S = c.S, L = S.L, w = c.speed / L * Math.tan(c.steer || 0), u0 = c._u ?? c.speed;
  c.a += w * h; const sn = Math.sin(c.a), cs = Math.cos(c.a);
  c.vx = sn * c.speed; c.vz = cs * c.speed; c.om = w;
  c.x += c.vx * h; c.z += c.vz * h;
  c.axF += ((c.speed - u0) / Math.max(h, 1e-4) - c.axF) * Math.min(1, h * 6); c.ayF += (c.speed * w - c.ayF) * Math.min(1, h * 6);
  c._u = c.speed; c.wheelRot += c.speed / S.R * h;
}
