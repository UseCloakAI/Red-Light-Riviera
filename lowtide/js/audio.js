/* Lowtide audio. Everything is synthesized live with WebAudio, so there are
   no samples and no files to license. One clock (the AudioContext) runs the
   music, the ocean and the intro cue sheet, which keeps sound locked to
   picture. Works the same on an OfflineAudioContext for rendering previews. */
(function () {
  "use strict";
  var C = window.LT_CUE;
  var ctx = null, out, hall, plate, mverb, echo, B = {}, NZ = {}, SAT2, SAT4, streetVerb, timer = 0;
  // the street: buildings throw a shot back a beat later (made on first use)
  function street() { return streetVerb || (streetVerb = verb(1.7, 2.2, 0.055, 3600, 0.7, B.sfx)); }

  /* ---------------- utilities ---------------- */
  function seeded(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rnd = seeded(1987);
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function now() { return ctx ? ctx.currentTime : 0; }
  function G(v) { var g = ctx.createGain(); g.gain.value = v === undefined ? 1 : v; return g; }
  function F(type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; }
  function O(type, f, t) { var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; }
  function P(v) { var p = ctx.createStereoPanner(); p.pan.value = v || 0; return p; }
  function chain() { for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }
  function send(node, fx, amt) { var s = G(amt); node.connect(s); s.connect(fx); return s; }
  function perc(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function noise(kind, t, dur, loop) {
    var s = ctx.createBufferSource(); s.buffer = NZ[kind]; s.loop = !!loop;
    if (loop) s.start(t, rnd() * 4); else s.start(t, rnd() * 2, dur);
    return s;
  }
  // unity gain for quiet signals, rounds peaks off softly (no hidden level boost)
  function sat(k) {
    var n = 4096, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / k; }
    return c;
  }

  /* Noise beds, made seamless so looping never clicks. */
  function makeNoise(sec) {
    var sr = ctx.sampleRate, n = Math.floor(sr * sec), r = seeded(5);
    var w = ctx.createBuffer(1, n, sr), p = ctx.createBuffer(1, n, sr), b = ctx.createBuffer(1, n, sr);
    var W = w.getChannelData(0), Pk = p.getChannelData(0), Br = b.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (var i = 0; i < n; i++) {
      var x = r() * 2 - 1; W[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      Pk[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      last = (last + 0.02 * x) / 1.02; Br[i] = last * 3.5;
    }
    [W, Pk, Br].forEach(function (d) { var s = d[n - 1] - d[0]; for (var j = 0; j < n; j++) d[j] -= s * j / (n - 1); });
    NZ.white = w; NZ.pink = p; NZ.brown = b;
  }

  /* Generated stereo impulse response: early reflections, then a dense
     tail that darkens as it decays, the way real rooms lose highs first. */
  function impulse(sec, shape, pre, damp) {
    var sr = ctx.sampleRate, len = Math.floor(sr * sec), buf = ctx.createBuffer(2, len, sr), p0 = Math.floor(sr * pre);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c), lp = 0, r = seeded(31 + c * 7);
      for (var i = p0; i < len; i++) {
        var x = (i - p0) / (len - p0);
        var fc = damp * (1 - 0.88 * x), a = Math.exp(-2 * Math.PI * fc / sr);
        lp = (1 - a) * ((r() * 2 - 1) * Math.pow(1 - x, shape)) + a * lp;
        d[i] = lp;
      }
      for (var e = 0; e < 9; e++) {
        var at = Math.floor(sr * (pre + 0.003 + r() * 0.045));
        if (at < len) d[at] += (r() < 0.5 ? -1 : 1) * (0.6 - e * 0.05);
      }
    }
    return buf;
  }
  function verb(sec, shape, pre, damp, ret, dest) {
    var cv = ctx.createConvolver(); cv.buffer = impulse(sec, shape, pre, damp);
    chain(cv, G(ret), dest); return cv;
  }
  function pingpong(time, dest) {
    var inp = G(1), hp = F("highpass", 350), l = ctx.createDelay(2), r = ctx.createDelay(2);
    var lp = F("lowpass", 2600, 0.5), f1 = G(0.36), f2 = G(0.36), pl = P(-0.8), pr = P(0.8), ret = G(0.8);
    l.delayTime.value = time; r.delayTime.value = time;
    chain(inp, hp, l); chain(l, pl, ret); chain(l, lp, f1, r); chain(r, pr, ret); chain(r, f2, l);
    ret.connect(dest); return inp;
  }

  /* ---------------- graph ---------------- */
  function init(given) {
    if (ctx) { if (ctx.resume && ctx.state === "suspended") ctx.resume(); return ctx; }
    ctx = given || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    makeNoise(8); SAT2 = sat(2.2);

    // master: subsonic cut, glue compression, tape saturation, brickwall limiter
    out = G(0.8);
    var hp = F("highpass", 24, 0.6), glue = ctx.createDynamicsCompressor(), tape = ctx.createWaveShaper(), trim = G(0.92), lim = ctx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 12; glue.ratio.value = 2.2; glue.attack.value = 0.025; glue.release.value = 0.3;
    tape.curve = sat(1.3); tape.oversample = "4x";
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    chain(out, hp, glue, tape, trim, lim, ctx.destination);

    hall = verb(3.6, 2.4, 0.03, 4600, 0.5, out);
    plate = verb(1.3, 3.0, 0.006, 8000, 0.45, out);

    B.sfx = G(1); B.sfx.connect(out);
    B.seq = G(1); B.seq.connect(B.sfx);          // intro cues live here so a skip can cut them
    B.ui = G(0.75); B.ui.connect(out); send(B.ui, plate, 0.16);
    B.amb = G(0); B.amb.connect(out);
    B.song = G(0); B.song.connect(out);           // the loading-screen song

    // music: everything feeds a tone filter so the pause menu can muffle it
    B.mus = G(0); B.tone = F("lowpass", 18000, 0.6); chain(B.mus, B.tone, out);
    B.bed = G(1); B.bed.connect(B.tone);          // pre-rendered music + ocean loop
    mverb = verb(2.8, 2.6, 0.02, 5200, 0.55, B.tone);
    echo = pingpong(60 / C.bpm * 0.75, B.tone);
    B.drums = G(0.85); B.drums.connect(B.mus);
    var kp = P(0), lfo = O("sine", 3.4, 0), lg = G(0.28);
    B.keys = G(0.9); chain(B.keys, kp, B.mus); chain(lfo, lg, kp.pan); lfo.start(0);   // suitcase autopan
    B.pad = G(0.55); B.duck = G(1); chain(B.pad, B.duck, B.mus);
    B.bass = G(0.85); B.bass.connect(B.mus);
    B.lead = G(0.55); B.lead.connect(B.mus);
    send(B.keys, mverb, 0.3); send(B.keys, echo, 0.1); send(B.pad, mverb, 0.4);
    send(B.lead, mverb, 0.42); send(B.lead, echo, 0.32);

    if (!given) timer = setInterval(function () { pump(ctx.currentTime + 0.25); }, 25);
    return ctx;
  }

  /* ---------------- instruments ---------------- */
  // FM electric piano: carrier + modulator at 1:1 for the body, a short
  // high tine for the strike. Index falls over time so notes mellow out.
  function rhodes(m, t, vel, dur, dest, pan) {
    var f = mtof(m), car = O("sine", f, t), mod = O("sine", f, t), tine = O("sine", f * 7.01, t);
    var mi = G(0), ti = G(0), amp = G(0), p = P(pan || 0);
    mi.gain.setValueAtTime(f * (0.8 + 1.7 * vel), t); mi.gain.setTargetAtTime(f * 0.16, t, 0.5);
    ti.gain.setValueAtTime(f * 1.3 * vel, t); ti.gain.setTargetAtTime(0, t, 0.022);
    chain(mod, mi); mi.connect(car.frequency); chain(tine, ti); ti.connect(car.frequency);
    var pk = 0.11 * (0.3 + 0.7 * vel);
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(pk, t + 0.005);
    amp.gain.setTargetAtTime(pk * 0.3, t + 0.006, 0.7);
    amp.gain.setTargetAtTime(0, t + dur, 0.1);
    chain(car, amp, p, dest);
    var end = t + dur + 0.8;
    [car, mod, tine].forEach(function (o) { o.start(t); o.stop(end); });
  }
  function strum(notes, t, vel, dur, dest) {
    notes.forEach(function (m, i) {
      rhodes(m, t + i * 0.011 + (rnd() - 0.5) * 0.006, vel * (0.85 + rnd() * 0.3), dur, dest || B.keys, (i - 1.5) * 0.12);
    });
  }
  // Wide detuned-saw pad with a slow filter swell.
  function pad(ms, t, dur) {
    var lp = F("lowpass", 450, 0.8), amp = G(0);
    lp.frequency.setValueAtTime(420, t); lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.55); lp.frequency.linearRampToValueAtTime(600, t + dur + 1.4);
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.03, t + 0.9);
    amp.gain.setValueAtTime(0.03, t + dur); amp.gain.linearRampToValueAtTime(0, t + dur + 1.4);
    chain(lp, amp, B.pad);
    ms.forEach(function (m) {
      [-1, 0, 1].forEach(function (k) {
        var o = O("sawtooth", mtof(m), t), p = P(k * 0.7);
        o.detune.value = k * 9 + (rnd() - 0.5) * 5;
        chain(o, p, lp); o.start(t); o.stop(t + dur + 1.5);
      });
    });
  }
  function bass(m, t, dur, vel) {
    var f = mtof(m), o = O("sine", f, t), o2 = O("triangle", f * 2, t), g2 = G(0.16), sh = ctx.createWaveShaper(), lp = F("lowpass", 650, 0.7), amp = G(0);
    sh.curve = SAT2; chain(o2, g2, sh); o.connect(sh); chain(sh, lp, amp, B.bass);
    var pk = 0.75 * (vel || 1);
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(pk, t + 0.008);
    amp.gain.setTargetAtTime(pk * 0.7, t + 0.01, 0.16); amp.gain.setTargetAtTime(0, t + dur, 0.035);
    var end = t + dur + 0.3; o.start(t); o2.start(t); o.stop(end); o2.stop(end);
  }
  function kick(t, vel) {
    var o = O("sine", 150, t), a = G(0), cg = G(0), c = noise("white", t, 0.02), ch = F("highpass", 1800);
    o.frequency.exponentialRampToValueAtTime(56, t + 0.07); o.frequency.exponentialRampToValueAtTime(46, t + 0.35);
    var pk = 0.8 * (vel || 1);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(pk, t + 0.002); a.gain.setTargetAtTime(0, t + 0.01, 0.12);
    chain(o, a, B.drums); perc(cg, t, 0.001, 0.1, 0.012); chain(c, ch, cg, B.drums);
    o.start(t); o.stop(t + 0.8);
    B.duck.gain.setTargetAtTime(0.32, t, 0.004); B.duck.gain.setTargetAtTime(1, t + 0.05, 0.14);   // sidechain
  }
  function clap(t, vel) {
    var n = noise("white", t, 0.4), hp = F("highpass", 550), bp = F("bandpass", 1250, 0.9), g = G(0), p = P(0.06), v = 0.3 * (vel || 1);
    g.gain.setValueAtTime(0, t);
    [0, 0.011, 0.022].forEach(function (d) { g.gain.setValueAtTime(v, t + d); g.gain.exponentialRampToValueAtTime(v * 0.15, t + d + 0.009); });
    g.gain.setValueAtTime(v * 0.8, t + 0.031); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    chain(n, hp, bp, g, p, B.drums); send(p, mverb, 0.3);
    var b = O("triangle", 190, t), bg = G(0); perc(bg, t, 0.001, 0.07 * (vel || 1), 0.07); chain(b, bg, B.drums); b.start(t); b.stop(t + 0.15);
  }
  var METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];   // the classic six-square hat
  function hat(t, vel, open) {
    var bp = F("bandpass", 10500, 0.8), hp = F("highpass", 7200), g = G(0), p = P(0.22), d = open ? 0.3 : 0.045;
    perc(g, t, 0.001, 0.05 * vel, d); chain(bp, hp, g, p, B.drums);
    METAL.forEach(function (f) { var o = O("square", f * 1.5, t); o.connect(bp); o.start(t); o.stop(t + d + 0.05); });
  }
  function shaker(t, vel) {
    var n = noise("white", t, 0.12), hp = F("highpass", 6000), bp = F("bandpass", 9000, 0.7), g = G(0), p = P(-0.3);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.026 * vel, t + 0.018); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    chain(n, hp, bp, g, p, B.drums);
  }
  function lead(m, t, dur, from) {
    var f = mtof(m), o = O("triangle", from ? mtof(from) : f, t), o2 = O("sine", f * 2, t), g2 = G(0.1), lp = F("lowpass", 2300, 0.5), amp = G(0);
    if (from) o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    var vib = O("sine", 5.1, t), vg = G(0); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
    chain(vib, vg); vg.connect(o.frequency);
    chain(o2, g2, lp); chain(o, lp, amp, B.lead);
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.1, t + 0.05);
    amp.gain.setTargetAtTime(0.075, t + 0.05, 0.3); amp.gain.setTargetAtTime(0, t + dur, 0.08);
    var end = t + dur + 0.6; [o, o2, vib].forEach(function (x) { x.start(t); x.stop(end); });
  }

  /* ---------------- the track ----------------
     D minor, 92 bpm, swung sixteenths. Dm9, Bbmaj9, Gm9, Am11. */
  var PROG = [
    { root: 38, keys: [53, 57, 60, 64] },
    { root: 34, keys: [53, 57, 60, 62] },
    { root: 31, keys: [53, 57, 58, 62] },
    { root: 33, keys: [55, 60, 62, 64] }
  ];
  // [bar of the 4-bar loop, step, note, length in steps, glide from]
  var MEL = [[2, 2, 69, 2], [2, 4, 70, 2, 69], [2, 6, 74, 6, 70], [2, 13, 72, 3], [3, 0, 69, 4, 72], [3, 6, 67, 2], [3, 8, 64, 4, 67], [3, 12, 62, 4]];
  var BASS = { 0: [0, 5.5, 1], 7: [0, 1.6, 0.8], 10: [12, 1.6, 0.85], 14: [7, 1.6, 0.8] };
  var S16 = 15 / C.bpm, SWING = 0.56;
  var M = { on: false, t0: 0, step: 0, next: 0, secs: [] };

  function sectionAt(t) { var s = "intro"; M.secs.forEach(function (x) { if (x.t <= t + 1e-4) s = x.name; }); return s; }
  function stepAt(i, t) {
    var bar = Math.floor(i / 16), s = i % 16, ch = PROG[bar % 4], full = sectionAt(t) !== "intro";
    var ts = t + ((s % 2) ? (SWING - 0.5) * 2 * S16 : 0), BAR = 16 * S16;
    if (s === 0) { pad(ch.keys.concat([ch.root + 24]), t, BAR); strum(ch.keys, t, full ? 0.62 : 0.42, full ? S16 * 7 : BAR * 0.95); }
    if (!full) return;
    if (s === 6) strum(ch.keys, ts, 0.34, S16 * 3.5);
    if (s === 11 && bar % 2) strum(ch.keys.slice(1), ts, 0.26, S16 * 2);
    if (BASS[s]) bass(ch.root + BASS[s][0], ts, BASS[s][1] * S16, BASS[s][2]);
    if (s === 0 || s === 7 || s === 10) kick(ts, s === 0 ? 1 : 0.78);
    if (s === 4 || s === 12) clap(ts, s === 12 ? 1 : 0.9);
    if (s % 2 === 0) hat(ts, s % 4 === 2 ? 0.9 : 0.55, s === 14 && bar % 2 === 1);
    if (s === 3 || s === 11) hat(ts, 0.3, false);
    shaker(ts, s % 2 ? 0.9 : 0.5);
    if (Math.floor(bar / 4) % 2 === 1) MEL.forEach(function (n) { if (n[0] === bar % 4 && n[1] === s) lead(n[2], ts, n[3] * S16, n[4]); });
  }

  function musicStart(t, section) {
    if (!ctx) return;
    M.on = true; M.t0 = t; M.step = 0; M.next = t; M.secs = [{ t: t, name: section || "intro" }];
    var intro = (section || "intro") === "intro";
    B.mus.gain.cancelScheduledValues(t); B.mus.gain.setValueAtTime(0, t);
    B.mus.gain.linearRampToValueAtTime(intro ? 0.6 : 0.75, t + (intro ? 2.2 : 0.04));
    B.tone.frequency.cancelScheduledValues(t); B.tone.frequency.setValueAtTime(intro ? 1100 : 17000, t);
  }
  function musicSection(name, t) {
    if (!ctx) return;
    M.secs.push({ t: t, name: name });
    if (name !== "intro") {
      B.tone.frequency.setValueAtTime(1100, t - 1.6); B.tone.frequency.exponentialRampToValueAtTime(2600, t - 0.02);
      B.tone.frequency.setTargetAtTime(17000, t, 0.012); B.mus.gain.setTargetAtTime(0.75, t, 0.02);
    }
  }
  function musicStop(t) { if (!ctx) return; t = t || now(); M.on = false; B.mus.gain.cancelScheduledValues(t); B.mus.gain.setTargetAtTime(0, t, 0.25); }

  /* ---------------- the ocean ----------------
     Brown noise surf whose filter and level swell and crash on a seeded,
     irregular rhythm, white-noise foam fizzing after each break, a slow
     wind band and a far-off city rumble. */
  var W = { on: false, next: 0, nodes: [] };
  function ambStart(t, level) {
    if (!ctx || W.on) return; t = t || now();
    W.on = true; W.next = t; W.nodes = []; W.level = level || 0.55;
    var sl = F("lowpass", 400, 0.4), sg = G(0.15), fh = F("highpass", 2200), fl = F("lowpass", 9000), fg = G(0.02);
    [-0.6, 0.6].forEach(function (pan) { var b = noise("brown", t, 0, true); chain(b, P(pan), sl); W.nodes.push(b); });
    [-0.5, 0.5].forEach(function (pan) { var w = noise("white", t, 0, true); chain(w, P(pan), fh); W.nodes.push(w); });
    chain(sl, sg, B.amb); chain(fh, fl, fg, B.amb);
    var pk = noise("pink", t, 0, true), wb = F("bandpass", 520, 0.5), wg = G(0.05), lfo = O("sine", 0.06, t), lg = G(260);
    chain(lfo, lg); lg.connect(wb.frequency); chain(pk, wb, wg, B.amb); lfo.start(t);
    var cb = noise("brown", t, 0, true), cg = G(0.1); chain(cb, F("lowpass", 140, 0.5), cg, B.amb);
    W.nodes.push(pk, lfo, cb);
    W.surf = sl; W.surfG = sg; W.fizz = fg;
    B.amb.gain.cancelScheduledValues(t); B.amb.gain.setValueAtTime(0, t); B.amb.gain.linearRampToValueAtTime(W.level, t + 2.6);
  }
  function wave() {
    var t = W.next, L = 5.8 + rnd() * 3.2, a = 0.6 + rnd() * 0.4, f = W.surf.frequency, g = W.surfG.gain, z = W.fizz.gain;
    f.setValueAtTime(380, t); f.linearRampToValueAtTime(900 + 900 * a, t + L * 0.36); f.exponentialRampToValueAtTime(520, t + L * 0.62); f.linearRampToValueAtTime(380, t + L);
    g.setValueAtTime(0.14, t); g.linearRampToValueAtTime(0.3 + 0.3 * a, t + L * 0.36); g.linearRampToValueAtTime(0.2, t + L * 0.7); g.linearRampToValueAtTime(0.14, t + L);
    z.setValueAtTime(0.015, t); z.setValueAtTime(0.015, t + L * 0.33); z.linearRampToValueAtTime(0.02 + 0.07 * a, t + L * 0.42); z.exponentialRampToValueAtTime(0.015, t + L * 0.95);
    W.next = t + L;
  }
  function ambStop(t) {
    if (!ctx || !W.on) return; t = t || now(); W.on = false;
    B.amb.gain.cancelScheduledValues(t); B.amb.gain.setTargetAtTime(0, t, 0.3);
    W.nodes.forEach(function (n) { n.stop(t + 2); });
  }

  function pump(until) {
    while (M.on && M.next < until) { stepAt(M.step, M.next); M.step++; M.next = M.t0 + M.step * S16; }
    while (W.on && W.next < until) wave();
  }

  /* ---------------- sound design ---------------- */
  function dst() { return B.seq; }
  var sfx = {
    // quiet room tone under the paper slate
    room: function (t, dur) {
      var n = noise("pink", t, Math.min(dur, 5.5)), lp = F("lowpass", 1800, 0.5), g = G(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.018, t + 0.35); g.gain.setValueAtTime(0.018, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
      chain(n, lp, g, dst());
    },
    // air rushing past the falling orb, rising into the impact
    fall: function (t, dur) {
      var n = noise("white", t, dur + 0.05), bp = F("bandpass", 260, 1.1), g = G(0);
      bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(1900, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
      chain(n, bp, g, dst());
    },
    // rubber orb on a hard floor: pitched thump, wooden body knock, soft click
    thump: function (t, size) {
      t = t === undefined ? now() : t; size = size || 1;
      var o = O("sine", 100 + 25 * size, t), a = G(0), d = dst();
      o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.55 * size, t + 0.003); a.gain.setTargetAtTime(0, t + 0.01, 0.07);
      var body = O("triangle", 232, t), bg = G(0); perc(bg, t, 0.002, 0.1 * size, 0.07);
      var n = noise("white", t, 0.05), lp = F("lowpass", 2200, 0.7), ng = G(0); perc(ng, t, 0.001, 0.28 * size, 0.03);
      chain(o, a, d); chain(body, bg, d); chain(n, lp, ng, d); send(ng, plate, 0.3); send(a, plate, 0.1);
      o.start(t); o.stop(t + 0.7); body.start(t); body.stop(t + 0.3);
    },
    // letters sliding out from behind the orb, panned to their side
    unfurl: function (t, pan) {
      t = t === undefined ? now() : t; pan = pan === undefined ? 0 : pan;
      var n = noise("white", t, 0.8), hp = F("highpass", 400), bp = F("bandpass", 3200, 0.7), g = G(0), p = P(0);
      bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.6);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.065, t + 0.035); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      p.pan.setValueAtTime(pan * 0.15, t); p.pan.linearRampToValueAtTime(pan * 0.7, t + 0.5);
      chain(n, hp, bp, g, p, dst()); send(p, plate, 0.25);
    },
    // a water droplet: the eyes opening and blinking
    drop: function (t, v) {
      t = t === undefined ? now() : t;
      var o = O("sine", 950, t), g = G(0);
      o.frequency.exponentialRampToValueAtTime(2300, t + 0.035);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v || 0.08, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      chain(o, g, dst()); send(g, hall, 0.35); o.start(t); o.stop(t + 0.15);
    },
    // the studio chord: Bbmaj9, strummed, with a sub underneath
    sting: function (t) {
      t = t === undefined ? now() : t;
      var sb = G(1.25); sb.connect(dst()); send(sb, hall, 0.45); send(sb, echo, 0.15);
      [46, 53, 57, 60, 62, 69].forEach(function (m, i) { rhodes(m, t + i * 0.024, 0.64 - i * 0.03, 3.0, sb, (i - 2.5) * 0.14); });
      var s = O("sine", mtof(34), t), sg = G(0); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.16, t + 0.25); sg.gain.setTargetAtTime(0, t + 1.2, 0.5);
      chain(s, sg, sb); s.start(t); s.stop(t + 4);
    },
    // the orb swelling over the frame: reverse cymbal, rising sweep, a low suck
    swell: function (t, dur) {
      var d = dst(), sr = ctx.sampleRate, len = Math.floor(sr * dur), buf = ctx.createBuffer(2, len, sr);
      for (var c = 0; c < 2; c++) { var x = buf.getChannelData(c), r = seeded(77 + c); for (var i = 0; i < len; i++) x[i] = (r() * 2 - 1) * Math.pow(i / len, 2.6); }
      var rv = ctx.createBufferSource(); rv.buffer = buf; var rh = F("highpass", 3500), rg = G(0.2);
      chain(rv, rh, rg, d); rv.start(t);
      var n = noise("white", t, dur), lp = F("lowpass", 200, 1.2), ng = G(0);
      lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.1, t + dur); ng.gain.linearRampToValueAtTime(0, t + dur + 0.015);
      chain(n, lp, ng, d);
      var o = O("sine", 70, t), og = G(0); o.frequency.exponentialRampToValueAtTime(230, t + dur);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.09, t + dur); og.gain.linearRampToValueAtTime(0, t + dur + 0.015);
      chain(o, og, d); o.start(t); o.stop(t + dur + 0.05);
    },
    // through the match cut: a falling, darkening breath into the sea
    through: function (t) {
      var n = noise("pink", t, 1.6), lp = F("lowpass", 6000, 0.6), g = G(0), d = dst();
      lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 1.4);
      g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      chain(n, lp, g, d); send(g, hall, 0.4);
      var o = O("sine", 62, t), og = G(0); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.3, t + 0.02); og.gain.setTargetAtTime(0, t + 0.05, 0.25);
      chain(o, og, d); o.start(t); o.stop(t + 1.5);
    },
    // reverse cymbal into the title
    riser: function (t, dur) {
      var sr = ctx.sampleRate, len = Math.floor(sr * dur), buf = ctx.createBuffer(2, len, sr), d = dst();
      for (var c = 0; c < 2; c++) { var x = buf.getChannelData(c), r = seeded(91 + c); for (var i = 0; i < len; i++) x[i] = (r() * 2 - 1) * Math.pow(i / len, 3.2); }
      var s = ctx.createBufferSource(); s.buffer = buf; var hp = F("highpass", 4200), pk = F("peaking", 9000, 0.8), g = G(0.22);
      pk.gain.value = 5; chain(s, hp, pk, g, d); send(g, hall, 0.3); s.start(t);
    },
    // the title hit: sub drop, body, transient, crash, all into a big room
    hit: function (t, dest) {
      t = t === undefined ? now() : t; var d = dest || dst();
      var o = O("sine", 72, t), a = G(0), sh = ctx.createWaveShaper(); sh.curve = SAT2;
      o.frequency.exponentialRampToValueAtTime(33, t + 1.5);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(1, t + 0.004); a.gain.setTargetAtTime(0, t + 0.02, 0.75);
      chain(o, sh, a, d); o.start(t); o.stop(t + 4);
      var m = O("triangle", 140, t), mg = G(0); m.frequency.exponentialRampToValueAtTime(55, t + 0.3); perc(mg, t, 0.002, 0.32, 0.45);
      chain(m, mg, d); m.start(t); m.stop(t + 0.6);
      var n = noise("white", t, 0.5), lp = F("lowpass", 3400, 0.6), ng = G(0); perc(ng, t, 0.001, 0.38, 0.32);
      chain(n, lp, ng, d); send(ng, hall, 0.55);
      var cr = noise("white", t, 2.6), ch = F("highpass", 5200), cb = F("bandpass", 8200, 0.5), cg = G(0), cp = P(0.2);
      cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(0.075, t + 0.004); cg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      chain(cr, ch, cb, cg, cp, d); send(cp, hall, 0.3);
    },
    // footsteps: a soft heel knock, brighter on wood, hushed on sand
    step: function (vol, surface) {
      if (!ctx) return; var t = now(), v = vol || 0.6;
      var n = noise("white", t, 0.09), hp = F("highpass", surface === "sand" ? 300 : 140), lp = F("lowpass", surface === "wood" ? 2200 : surface === "sand" ? 1600 : 1100, 0.7), g = G(0);
      perc(g, t, 0.002, (surface === "sand" ? 0.05 : 0.09) * v, surface === "sand" ? 0.09 : 0.06); chain(n, hp, lp, g, P((rnd() - 0.5) * 0.2), B.sfx);
      var o = O("sine", surface === "wood" ? 140 : 90, t), og = G(0); perc(og, t, 0.002, (surface === "wood" ? 0.1 : 0.06) * v, 0.05); chain(o, og, B.sfx); o.start(t); o.stop(t + 0.12);
    },
    /* guns: a pistol shot outdoors is a supersonic crack, a short chesty
       thump, then the street throwing it back off the buildings */
    shot: function (dist, pan) {
      if (!ctx) return; var t = now(), d = dist || 0, v = 1 / (1 + d / 18), bus = G(v), lp = F("lowpass", 16000 / (1 + d / 25), 0.5), pn = P(pan || 0);
      chain(bus, lp, pn, B.sfx); send(pn, street(), 0.35 + Math.min(0.5, d / 60));
      var sh = ctx.createWaveShaper(); sh.curve = SAT4 || (SAT4 = sat(4)); sh.connect(bus);
      var n = noise("white", t, 0.08), hp = F("highpass", 1400), cg = G(0); perc(cg, t, 0.0004, 0.95, 0.045); chain(n, hp, cg, sh);
      var m = noise("white", t, 0.14), bp = F("bandpass", 950, 0.9), mg = G(0); perc(mg, t, 0.0008, 0.8, 0.08); chain(m, bp, mg, sh);
      var o = O("sine", 160, t), og = G(0); o.frequency.exponentialRampToValueAtTime(44, t + 0.14); perc(og, t, 0.001, 1.1, 0.13); chain(o, og, sh); o.start(t); o.stop(t + 0.35);
      if (d < 4) {   // your own gun: the slide cycling, right by your ear
        var k = noise("white", t + 0.035, 0.03), kb = F("bandpass", 3600, 2), kg = G(0); perc(kg, t + 0.035, 0.0006, 0.16, 0.02); chain(k, kb, kg, B.sfx);
      }
    },
    // the shotgun: lower, wider and longer than the pistol, with more of the street in it
    boom: function (dist, pan) {
      if (!ctx) return; var t = now(), d = dist || 0, v = 1 / (1 + d / 22), bus = G(v), lp = F("lowpass", 13000 / (1 + d / 25), 0.5), pn = P(pan || 0);
      chain(bus, lp, pn, B.sfx); send(pn, street(), 0.55 + Math.min(0.4, d / 60));
      var sh = ctx.createWaveShaper(); sh.curve = SAT4 || (SAT4 = sat(4)); sh.connect(bus);
      var n = noise("white", t, 0.16), hp = F("highpass", 900), cg = G(0); perc(cg, t, 0.0005, 0.95, 0.09); chain(n, hp, cg, sh);
      var m = noise("pink", t, 0.3), bp = F("bandpass", 520, 0.7), mg = G(0); perc(mg, t, 0.001, 1.0, 0.16); chain(m, bp, mg, sh);
      var o = O("sine", 120, t), og = G(0); o.frequency.exponentialRampToValueAtTime(32, t + 0.25); perc(og, t, 0.001, 1.25, 0.22); chain(o, og, sh); o.start(t); o.stop(t + 0.5);
    },
    // rack: fore-end back (a slide and a clack), forward (a heavier clack)
    pump: function () {
      if (!ctx) return; var t = now();
      var click = function (at, f, a, dec, q) { var n = noise("white", at, 0.06), bp = F("bandpass", f, q || 2), g = G(0); perc(g, at, 0.0005, a, dec); chain(n, bp, g, B.sfx); };
      var s1 = noise("white", t, 0.12), sb = F("bandpass", 1700, 1.2), sg = G(0); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.07, t + 0.04); sg.gain.linearRampToValueAtTime(0, t + 0.12); chain(s1, sb, sg, B.sfx);
      click(t + 0.11, 1400, 0.4, 0.035); click(t + 0.12, 3600, 0.25, 0.02);
      click(t + 0.25, 900, 0.5, 0.05, 1.4); click(t + 0.26, 2800, 0.3, 0.025);
    },
    shellIn: function () {
      if (!ctx) return; var t = now();
      var n = noise("white", t, 0.08), bp = F("bandpass", 1100, 1.5), g = G(0); perc(g, t, 0.002, 0.18, 0.05); chain(n, bp, g, B.sfx);
      var k = noise("white", t + 0.06, 0.03), kb = F("bandpass", 3000, 2.5), kg = G(0); perc(kg, t + 0.06, 0.0005, 0.2, 0.018); chain(k, kb, kg, B.sfx);
    },
    // the weapon wheel: air in on open, a soft close; a dry tick per segment
    wheel: function (open) {
      if (!ctx) return; var t = now(), n = noise("pink", t, 0.3), bp = F("bandpass", open ? 900 : 1400, 0.9), g = G(0);
      bp.frequency.exponentialRampToValueAtTime(open ? 1800 : 600, t + 0.25); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.06); g.gain.linearRampToValueAtTime(0, t + 0.28); chain(n, bp, g, B.ui);
    },
    tick: function () { ui.move(); },
    // an explosion: a sub drop you feel, a wide burst, a crack on top, the street throwing it back, then debris
    explosion: function (dist) {
      if (!ctx) return; var t = now(), d = dist || 0, v = 1.25 / (1 + d / 30), bus = G(v), lp = F("lowpass", 9000 / (1 + d / 40), 0.4); chain(bus, lp, B.sfx); send(lp, street(), 0.8); send(lp, hall, 0.25);
      var sh = ctx.createWaveShaper(); sh.curve = SAT4 || (SAT4 = sat(4)); sh.connect(bus);
      var o = O("sine", 70, t), og = G(0); o.frequency.exponentialRampToValueAtTime(22, t + 1.3); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(1.4, t + 0.01); og.gain.exponentialRampToValueAtTime(0.001, t + 1.6); chain(o, og, sh); o.start(t); o.stop(t + 1.7);
      var n = noise("brown", t, 2.4), nl = F("lowpass", 900, 0.5), ng = G(0); nl.frequency.exponentialRampToValueAtTime(180, t + 2.2); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(1.6, t + 0.02); ng.gain.exponentialRampToValueAtTime(0.001, t + 2.3); chain(n, nl, ng, sh);
      var c = noise("white", t, 0.25), ch = F("highpass", 1200), cg = G(0); perc(cg, t, 0.0005, 0.9, 0.12); chain(c, ch, cg, sh);
      for (var i = 0; i < 9; i++) { var at = t + 0.4 + rnd() * 1.6, k = noise("white", at, 0.05), kb = F("bandpass", 1200 + rnd() * 3000, 3), kg = G(0); perc(kg, at, 0.001, 0.12 * v, 0.04); chain(k, kb, kg, B.sfx); }
    },
    /* voices without words: a buzzing source (two detuned saws, a vibrato that
       wanders, a little roughness) through three vowel formants, with breath.
       v: { pitch (Hz), female } ; dist in metres */
    voice: function (o) {
      if (!ctx) return; var t = now(), d = o.dist || 0, att = 1 / (1 + d / 12); if (att < 0.04) return;
      var dur = o.dur, f0 = o.f0, bus = G(o.gain * att), lp = F("lowpass", 9000 / (1 + d / 30), 0.5), pan = P(o.pan || 0); chain(bus, lp, pan, B.sfx); send(pan, street(), 0.15 + Math.min(0.4, d / 50));
      var src = G(1), a = O("sawtooth", f0, t), b = O("sawtooth", f0 * 1.012, t), vib = O("sine", 5.5 + rnd() * 2.5, t), vg = G(f0 * o.vib), rough = O("square", 30 + rnd() * 35, t), rg = G(o.rough), am = G(1);
      chain(vib, vg); vg.connect(a.frequency); vg.connect(b.frequency); chain(rough, rg, am.gain);
      a.connect(src); b.connect(src); chain(src, am);
      // pitch contour
      o.contour.forEach(function (k) { a.frequency.linearRampToValueAtTime(f0 * k[1], t + dur * k[0]); b.frequency.linearRampToValueAtTime(f0 * k[1] * 1.012, t + dur * k[0]); });
      // the vowel: three formants in parallel
      o.formants.forEach(function (f, i) { var bp = F("bandpass", f * (o.female ? 1.15 : 1), 7 + i * 3), fg = G([1, 0.6, 0.25][i]); chain(am, bp, fg, bus); });
      var br = noise("pink", t, dur + 0.1), bh = F("bandpass", 2200, 0.8), bg = G(o.breath); chain(br, bh, bg, bus);
      var env = [bus.gain]; env.forEach(function (gp) { var peak = gp.value; gp.setValueAtTime(0, t); gp.linearRampToValueAtTime(peak, t + o.attack); gp.setValueAtTime(peak, t + dur * 0.7); gp.exponentialRampToValueAtTime(0.0008, t + dur); });
      [a, b, vib, rough].forEach(function (x) { x.start(t); x.stop(t + dur + 0.05); });
    },
    // a blood-curdling scream: high, rising, cracking, held, then falling away
    scream: function (who, dist, pan) {
      var f = who && who.female, base = (f ? 560 : 330) * (who && who.pitch || 1) * (0.9 + rnd() * 0.25), dur = 0.9 + rnd() * 0.9;
      sfx.voice({ f0: base, female: f, dur: dur, dist: dist, pan: pan, gain: 0.32, attack: 0.04, vib: 0.035, rough: 0.35, breath: 0.08,
        formants: rnd() < 0.5 ? [850, 1250, 2900] : [620, 1700, 2700],
        contour: [[0.1, 1.25], [0.35, 1.45 + rnd() * 0.2], [0.5, 1.3], [0.75, 1.38], [1, 0.75]] });
    },
    // a hit: a short grunt of pain
    grunt: function (who, dist, pan) {
      var f = who && who.female, base = (f ? 300 : 150) * (who && who.pitch || 1) * (0.9 + rnd() * 0.2);
      sfx.voice({ f0: base, female: f, dur: 0.22 + rnd() * 0.12, dist: dist, pan: pan, gain: 0.3, attack: 0.008, vib: 0.01, rough: 0.6, breath: 0.15,
        formants: [580, 1100, 2500], contour: [[0.3, 1.15], [1, 0.8]] });
    },
    // the last of it: a wet, choking rattle under a groan that sinks away
    rattle: function (who, dist) {
      if (!ctx) return; var t = now() + 0.15, d = dist || 0, att = 1 / (1 + d / 10); if (att < 0.05) return;
      var bus = G(0.5 * att); bus.connect(B.sfx);
      var n = noise("brown", t, 2.2), bp = F("bandpass", 420, 5), gg = G(0), lfo = O("square", 9 + rnd() * 6, t), lg = G(0.5);
      chain(n, bp, gg, bus); chain(lfo, lg, gg.gain); gg.gain.setValueAtTime(0.5, t); gg.gain.linearRampToValueAtTime(0.0, t + 2.1); lfo.start(t); lfo.stop(t + 2.2);
      bp.frequency.linearRampToValueAtTime(260, t + 2);
      var f = (who && who.female ? 190 : 105) * (who && who.pitch || 1), o = O("sawtooth", f, t), ol = F("lowpass", 600, 2), og = G(0);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 1.8); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.22, t + 0.2); og.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
      chain(o, ol, og, bus); o.start(t); o.stop(t + 2);
    },
    // raw samples (the SAM voice renders to these): through the sfx bus, quieter and duller with distance
    pcm: function (data, rate, gain, dist, pan) {
      if (!ctx || !data || !data.length) return; var t = now() + 0.02, d = dist || 0, att = 1 / (1 + d / 14); if (att < 0.05) return;
      var buf = ctx.createBuffer(1, data.length, rate), src = ctx.createBufferSource(); buf.copyToChannel(data, 0); src.buffer = buf;
      var g = G((gain || 0.5) * att), lp = F("lowpass", 7000 / (1 + d / 25), 0.4), p = P(pan || 0); chain(src, g, lp, p, B.sfx); send(p, street(), 0.12 + Math.min(0.35, d / 60));
      src.start(t);
    },
    // dying: a low thud and a long falling tone
    wasted: function () {
      if (!ctx) return; var t = now(), o = O("sawtooth", 220, t), lp = F("lowpass", 900, 1), g = G(0);
      o.frequency.exponentialRampToValueAtTime(55, t + 2.2); lp.frequency.exponentialRampToValueAtTime(200, t + 2.2); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
      chain(o, lp, g, B.ui); send(g, hall, 0.4); o.start(t); o.stop(t + 2.7);
      var n = noise("brown", t, 0.3), nl = F("lowpass", 300), ng = G(0); perc(ng, t, 0.003, 0.6, 0.25); chain(n, nl, ng, B.ui);
    },
    // a car horn: two detuned squares, quieter with distance
    horn: function (dist) {
      if (!ctx) return; var t = now(), v = 0.07 / (1 + (dist || 0) / 15), lp = F("lowpass", 1800, 1), g = G(0);
      [415, 349].forEach(function (f) { var o = O("square", f, t); chain(o, lp); o.start(t); o.stop(t + 0.5); });
      chain(lp, g, B.sfx); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.setValueAtTime(v, t + 0.42); g.gain.linearRampToValueAtTime(0, t + 0.48);
    },
    // breaking glass: a shower of bright ticks
    glass: function (v) {
      if (!ctx) return; var t = now(); v = v || 0.6;
      for (var i = 0; i < 14; i++) { var at = t + rnd() * 0.35, n = noise("white", at, 0.03), hp = F("bandpass", 4000 + rnd() * 5000, 6), g = G(0); perc(g, at, 0.0005, 0.12 * v * (1 - i / 16), 0.02 + rnd() * 0.04); chain(n, hp, g, B.sfx); }
    },
    // a burst hydrant: a steady hiss, set by strength and distance
    hiss: function () {
      if (!ctx) return null; var t = now(), n = noise("white", t, 0, true), bp = F("bandpass", 2600, 0.6), g = G(0); chain(n, bp, g, B.sfx);
      return { set: function (s, d) { g.gain.setTargetAtTime(0.06 * s / (1 + d / 10), now(), 0.1); }, stop: function () { var t2 = now(); g.gain.setTargetAtTime(0, t2, 0.3); n.stop(t2 + 1.5); } };
    },
    // a car door: the latch and the thud
    door: function () {
      if (!ctx) return; var t = now();
      var n = noise("brown", t, 0.2), lp = F("lowpass", 500), g = G(0); perc(g, t + 0.02, 0.003, 0.5, 0.12); chain(n, lp, g, B.sfx);
      var k = noise("white", t, 0.04), kb = F("bandpass", 2400, 2), kg = G(0); perc(kg, t, 0.0005, 0.2, 0.02); chain(k, kb, kg, B.sfx);
    },
    crash: function (v) {
      if (!ctx) return; var t = now(); v = v || 0.5;
      var n = noise("white", t, 0.5), bp = F("bandpass", 900, 0.6), g = G(0); perc(g, t, 0.002, 0.7 * v, 0.25); chain(n, bp, g, B.sfx); send(g, street(), 0.3);
      var o = O("sine", 70, t), og = G(0); o.frequency.exponentialRampToValueAtTime(35, t + 0.3); perc(og, t, 0.003, 0.8 * v, 0.2); chain(o, og, B.sfx); o.start(t); o.stop(t + 0.5);
      for (var i = 0; i < 5; i++) { var c = noise("white", t + 0.05 + rnd() * 0.25, 0.04), cb = F("highpass", 3000 + rnd() * 3000), cg = G(0); perc(cg, t + 0.05 + rnd() * 0.25, 0.0005, 0.12 * v, 0.03); chain(c, cb, cg, B.sfx); }
    },
    // the engine: a low saw and a square an octave down through a filter that opens with the revs
    engine: function () {
      if (!ctx) return null; var t = now(), a = O("sawtooth", 40, t), b = O("square", 20, t), lp = F("lowpass", 300, 2), g = G(0), sub = G(0.5);
      chain(a, lp); chain(b, sub, lp); chain(lp, g, B.sfx); a.start(t); b.start(t); g.gain.linearRampToValueAtTime(0.06, t + 0.3);
      var rev = 0;
      return {
        set: function (speed, thr) {
          var t2 = now(); rev += ((0.12 + speed * 0.75 + (thr > 0 ? 0.15 : 0)) - rev) * 0.1;
          var f = 34 + rev * 120; a.frequency.setTargetAtTime(f, t2, 0.05); b.frequency.setTargetAtTime(f / 2, t2, 0.05);
          lp.frequency.setTargetAtTime(250 + rev * 1600, t2, 0.08); g.gain.setTargetAtTime(0.05 + rev * 0.06, t2, 0.1);
        },
        stop: function () { var t2 = now(); g.gain.setTargetAtTime(0, t2, 0.08); a.stop(t2 + 0.5); b.stop(t2 + 0.5); }
      };
    },
    dry: function () {
      if (!ctx) return; var t = now();
      var n = noise("white", t, 0.03), bp = F("bandpass", 2900, 3), g = G(0); perc(g, t, 0.0005, 0.3, 0.014); chain(n, bp, g, B.sfx);
      var o = O("triangle", 1700, t), og = G(0); perc(og, t, 0.0005, 0.04, 0.02); chain(o, og, B.sfx); o.start(t); o.stop(t + 0.05);
    },
    // magazine out, magazine in, slide forward: lined up with the 1.4 s reload
    reload: function () {
      if (!ctx) return; var t = now();
      var click = function (at, f, a, dec) { var n = noise("white", at, 0.05), bp = F("bandpass", f, 2.2), g = G(0); perc(g, at, 0.0005, a, dec); chain(n, bp, g, B.sfx); };
      click(t + 0.05, 2600, 0.18, 0.02);
      var s = noise("white", t + 0.1, 0.18), sb = F("bandpass", 1400, 1.5), sg = G(0); sb.frequency.linearRampToValueAtTime(2400, t + 0.26);
      sg.gain.setValueAtTime(0, t + 0.1); sg.gain.linearRampToValueAtTime(0.05, t + 0.15); sg.gain.linearRampToValueAtTime(0, t + 0.28); chain(s, sb, sg, B.sfx);
      click(t + 0.62, 900, 0.3, 0.04); click(t + 0.63, 3200, 0.2, 0.02);
      click(t + 1.02, 2100, 0.22, 0.03); click(t + 1.12, 3400, 0.3, 0.03);
    },
    draw: function () {
      if (!ctx) return; var t = now();
      var n = noise("pink", t, 0.25), bp = F("bandpass", 1200, 0.8), g = G(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.08); g.gain.linearRampToValueAtTime(0, t + 0.22); chain(n, bp, g, B.sfx);
      var k = noise("white", t + 0.2, 0.03), kb = F("bandpass", 3000, 2), kg = G(0); perc(kg, t + 0.2, 0.0005, 0.15, 0.02); chain(k, kb, kg, B.sfx);
    },
    // brass on the pavement: two inharmonic rings
    shell: function (v, pan, kind) {
      if (!ctx) return; var t = now(), p = P(pan || 0); p.connect(B.sfx); v = v || 1;
      if (kind === "hull") {   // a plastic hull: a hollow tock, no ring
        var n = noise("white", t, 0.05), bp = F("bandpass", 1300, 2.2), g = G(0); perc(g, t, 0.0008, 0.16 * v, 0.03); chain(n, bp, g, p);
        var o = O("sine", 620, t), og = G(0); perc(og, t, 0.001, 0.04 * v, 0.05); chain(o, og, p); o.start(t); o.stop(t + 0.1); return;
      }
      [4180, 6290, 9120].forEach(function (f, i) { var o = O("sine", f * (0.97 + rnd() * 0.06), t), g = G(0); perc(g, t, 0.0008, [0.045, 0.03, 0.012][i] * v, [0.14, 0.09, 0.05][i]); chain(o, g, p); o.start(t); o.stop(t + 0.25); });
    },
    // a round landing: in someone, on stone, or in sand
    impact: function (kind, dist, pan) {
      if (!ctx) return; var t = now(), v = 1 / (1 + (dist || 0) / 10), p = P(pan || 0); p.connect(B.sfx);
      if (kind === "flesh") {
        var n = noise("brown", t, 0.1), lp = F("lowpass", 700), g = G(0); perc(g, t, 0.002, 0.5 * v, 0.07); chain(n, lp, g, p);
        var o = O("sine", 95, t), og = G(0); perc(og, t, 0.002, 0.25 * v, 0.06); chain(o, og, p); o.start(t); o.stop(t + 0.15);
      } else if (kind === "sand") {
        var s = noise("pink", t, 0.12), sl = F("lowpass", 1500), sg = G(0); perc(sg, t, 0.002, 0.16 * v, 0.08); chain(s, sl, sg, p);
      } else {
        var h = noise("white", t, 0.06), hh = F("highpass", 2200), hg = G(0); perc(hg, t, 0.0006, 0.22 * v, 0.03); chain(h, hh, hg, p); send(hg, street(), 0.2);
        if (rnd() < 0.3) { var w = O("sine", 2600 + rnd() * 900, t), wg = G(0); w.frequency.exponentialRampToValueAtTime(1300, t + 0.3); perc(wg, t, 0.01, 0.025 * v, 0.25); chain(w, wg, p); w.start(t); w.stop(t + 0.4); }
      }
    },
    // short air movement for menu transitions
    whoosh: function (t, dur, from, to) {
      t = t === undefined ? now() : t; dur = dur || 0.6;
      var n = noise("white", t, dur), bp = F("bandpass", 500, 1.4), g = G(0), p = P(from || -0.4);
      bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.5); bp.frequency.exponentialRampToValueAtTime(700, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
      p.pan.linearRampToValueAtTime(to === undefined ? 0.4 : to, t + dur);
      chain(n, bp, g, p, B.ui);
    }
  };

  /* Menu sounds: a dry tick for moves, soft two-note chimes for confirm/back. */
  var ui = {
    move: function () {
      if (!ctx) return; var t = now();
      var n = noise("white", t, 0.03), bp = F("bandpass", 4200, 2.5), g = G(0); perc(g, t, 0.0008, 0.15, 0.016); chain(n, bp, g, B.ui);
      var o = O("sine", 1900, t), og = G(0); perc(og, t, 0.001, 0.022, 0.03); chain(o, og, B.ui); o.start(t); o.stop(t + 0.06);
    },
    tab: function () {
      if (!ctx) return; var t = now();
      var n = noise("white", t, 0.03), bp = F("bandpass", 3000, 2), g = G(0); perc(g, t, 0.0008, 0.13, 0.02); chain(n, bp, g, B.ui);
    },
    select: function () { if (!ctx) return; var t = now(); rhodes(81, t, 0.42, 0.22, B.ui, -0.1); rhodes(86, t + 0.055, 0.38, 0.32, B.ui, 0.1); },
    back: function () { if (!ctx) return; var t = now(); rhodes(86, t, 0.36, 0.2, B.ui, 0.1); rhodes(81, t + 0.055, 0.34, 0.3, B.ui, -0.1); }
  };

  /* ---------------- cue sheets ---------------- */
  function cueIntro(T, bake) {
    sfx.room(T, C.cover - 0.05);
    sfx.fall(T + C.fall, C.impact - C.fall);
    sfx.thump(T + C.impact, 1); sfx.thump(T + C.rebound, 0.42);
    sfx.unfurl(T + C.unfurl, -1); sfx.unfurl(T + C.unfurl + 0.03, 1);
    sfx.sting(T + C.sting);
    sfx.drop(T + C.eyesOpen + 0.02, 0.07); sfx.drop(T + C.blink1 + 0.06, 0.045); sfx.drop(T + C.blink2 + 0.05, 0.035);
    sfx.swell(T + C.iris - 0.08, C.cover - C.iris + 0.08);
    sfx.through(T + C.cover);
    ambStart(T + C.cover - 0.05);
    musicStart(T + C.musicStart, "intro");
    sfx.riser(T + C.riser, C.hit - C.riser);
    if (bake) { musicStop(T + C.hit); return; }   // the baked file stops at the drop; the title loop takes over
    musicSection("drop", T + C.hit);
    sfx.hit(T + C.hit);
  }
  function cutSeq(t) {
    var old = B.seq; old.gain.setTargetAtTime(0, t, 0.03);
    setTimeout(function () { old.disconnect(); }, 500);
    B.seq = G(1); B.seq.connect(B.sfx);
  }
  function cueSkip() {
    if (!ctx) return; var t = now() + 0.03;
    cutSeq(t);
    if (!(M.on && sectionAt(t) !== "intro")) musicStart(t, "drop");
    else { M.secs = [{ t: t, name: "drop" }]; B.tone.frequency.cancelScheduledValues(t); B.tone.frequency.setTargetAtTime(17000, t, 0.02); }
    ambStart(t);
    sfx.hit(t, B.sfx);
  }
  var bedLevel = 1;
  function bed(v, tc) { if (!ctx) return; var t = now(); bedLevel = v; B.bed.gain.cancelScheduledValues(t); B.bed.gain.setTargetAtTime(v, t, tc || 0.3); }
  function pauseMix(on) {
    if (!ctx) return; var t = now();
    B.bed.gain.cancelScheduledValues(t); B.bed.gain.setTargetAtTime(bedLevel * (on ? 0.55 : 1), t, 0.12);
    B.tone.frequency.cancelScheduledValues(t); B.tone.frequency.setTargetAtTime(on ? 850 : 17000, t, 0.09);
    B.mus.gain.cancelScheduledValues(t); B.mus.gain.setTargetAtTime(on ? 0.4 : 0.75, t, 0.12);
    if (W.on) { B.amb.gain.cancelScheduledValues(t); B.amb.gain.setTargetAtTime(on ? W.level * 0.33 : W.level, t, 0.15); }
  }

  /* ---------------- pre-rendered audio ----------------
     The intro (up to the drop) is rendered offline from this same engine
     (tools/render-intro.js); the title plays the Lowtide theme on a loop. Both
     are decoded once and played as buffers, which costs almost nothing. The
     first theme (an 8-bar loop from this engine) is in archive/theme-v1. */
  var BAKE = {}, playing = [];
  function loadBaked(map) {
    return Promise.all(Object.keys(map).map(function (k) {
      return fetch(map[k]).then(function (r) { if (!r.ok) throw new Error(map[k] + " " + r.status); return r.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
        .then(function (b) { BAKE[k] = b; });
    }));
  }
  function playBaked(k, t, offset, loop, dest) {
    var s = ctx.createBufferSource(); s.buffer = BAKE[k]; s.loop = !!loop;
    s.connect(dest); s.start(t, offset || 0); playing.push(s); return s;
  }
  /* the loading song: in on the loading screen, out when the city appears; loops if loading runs long */
  var SONG = { src: null, want: false };
  function songPlay(fade) {
    if (!ctx) return; SONG.want = true;
    if (!BAKE.song || SONG.src) return;   // not decoded yet: starts when it is (loadBaked resolves, then call again)
    var t = now() + 0.02; SONG.src = playBaked("song", t, 0, true, B.song);
    B.song.gain.cancelScheduledValues(t); B.song.gain.setValueAtTime(0, t); B.song.gain.linearRampToValueAtTime(0.9, t + (fade || 0.6));
  }
  function songStop(fade) {
    SONG.want = false; if (!ctx || !SONG.src) return;
    var t = now(), s = SONG.src; SONG.src = null; fade = fade || 1.5;
    B.song.gain.cancelScheduledValues(t); B.song.gain.setValueAtTime(B.song.gain.value, t); B.song.gain.linearRampToValueAtTime(0, t + fade);
    s.stop(t + fade + 0.05);
  }
  // the intro film's soundtrack, positioned so buffer time p is heard when the video shows p
  function playIntro(t, offset) { return BAKE.intro ? playBaked("intro", t, offset, false, B.seq) : null; }
  // title: the drop. Hit + looping bed (baked if available, live engine otherwise).
  function startTitle(t, quiet) {
    if (!ctx) return; t = t || now() + 0.03;
    if (BAKE.loop) {
      // the Lowtide theme (media/theme.mp3), with the sea under it, live
      if (!startTitle.on) { startTitle.on = true; playBaked("loop", t, 0, true, B.bed); ambStart(t, 0.4); }
    } else {
      if (!(M.on && sectionAt(t) !== "intro")) musicStart(t, "drop");
      ambStart(t);
    }
    if (!quiet) sfx.hit(t, B.sfx);
  }

  window.LT = {
    loadBaked: loadBaked, bed: bed, playIntro: playIntro, startTitle: startTitle, cutIntro: function () { if (ctx) cutSeq(now()); },
    get baked() { return !!(BAKE.intro && BAKE.loop); },
    init: init, now: now, sfx: sfx, ui: ui, pause: pauseMix,
    cue: { intro: cueIntro, skip: cueSkip },
    song: { play: songPlay, stop: songStop, get wanted() { return SONG.want; } },
    music: { start: musicStart, section: musicSection, stop: musicStop, get on() { return M.on; } },
    amb: { start: ambStart, stop: ambStop, get on() { return W.on; } },
    _pump: pump,
    get ctx() { return ctx; }
  };
})();
