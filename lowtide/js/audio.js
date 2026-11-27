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
  var slowRate = 1, beatT = 0, voices = [], paUntil = 0;
  function noise(kind, t, dur, loop) {
    var s = ctx.createBufferSource(); s.buffer = NZ[kind]; s.loop = !!loop; if (slowRate !== 1 && !loop) s.playbackRate.value = slowRate;
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
    B.slowLP = F("lowpass", 20000, 0.9);   // the bullet cam pulls everything down through this
    chain(out, B.slowLP, hp, glue, tape, trim, lim, ctx.destination);
    B.cine = G(1); B.cine.connect(hp);       // the bullet cam's own sounds stay clear of that

    hall = verb(3.6, 2.4, 0.03, 4600, 0.5, out);
    plate = verb(1.3, 3.0, 0.006, 8000, 0.45, out);

    B.sfx = G(1); B.sfx.connect(out);
    B.seq = G(1); B.seq.connect(B.sfx);          // intro cues live here so a skip can cut them
    B.ui = G(0.75); B.ui.connect(out); send(B.ui, plate, 0.16);
    B.amb = G(0);
    B.mtrim = G(0.7); B.mtrim.connect(out);      // music level (settings)
    B.song = G(0); B.song.connect(B.mtrim);       // the loading-screen song
    // voices: their own bus (rumble cut, presence lift, a firm compressor) so people read over the street;
    // while anyone speaks or screams, the beds under them (sea, wind, engines, hiss) duck out of the way
    B.under = G(1); B.btrim = G(1); chain(B.under, B.btrim, out); B.amb.connect(B.under);
    B.loop = G(1); B.loop.connect(B.under);       // engines, hydrant hiss
    B.vox = G(1.15);
    var vh = F("highpass", 120, 0.7), vp = F("peaking", 2600, 0.9), vc = ctx.createDynamicsCompressor(); vp.gain.value = 5;
    vc.threshold.value = -22; vc.knee.value = 8; vc.ratio.value = 3.5; vc.attack.value = 0.004; vc.release.value = 0.18;
    chain(B.vox, vh, vp, vc, out);

    // music: everything feeds a tone filter so the pause menu can muffle it
    B.mus = G(0); B.tone = F("lowpass", 18000, 0.6); chain(B.mus, B.tone, B.mtrim);
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
    if (window.LT_SET && !given) LT_SET.on(function (k, v, S) { mix(S); });
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

  // the settings' levels (0-100): master, music, effects (and the beds under them), voices
  function mix(S) {
    if (!ctx || !out) return; var t = now(), lv = function (k, d) { var v = S[k]; return (v === undefined ? d : v) / 100; };
    out.gain.setTargetAtTime(0.8 * lv("master", 100), t, 0.05);
    B.mtrim.gain.setTargetAtTime(lv("music", 70), t, 0.05);
    B.sfx.gain.setTargetAtTime(lv("sfx", 100), t, 0.05); B.btrim.gain.setTargetAtTime(lv("sfx", 100), t, 0.05);
    B.vox.gain.setTargetAtTime(1.15 * lv("voices", 100), t, 0.05);
  }
  // pull the beds down while a voice is heard, back up after
  var duckEnd = 0;
  function duck(dur, depth) {
    if (!ctx || !B.under) return; var t = now(), g = B.under.gain, end = Math.max(duckEnd, t + dur); duckEnd = end;
    g.cancelScheduledValues(t); g.setTargetAtTime(depth || 0.42, t, 0.04); g.setTargetAtTime(1, end, 0.35);
  }

  /* ---------------- sound design ---------------- */
  function dst() { return B.seq; }
  // a fresh convolver on a cached impulse, so the tail follows its sound (and a skip cuts it)
  var IRS = {};
  function space(key, sec, shape, pre, damp, dest) {
    var cv = ctx.createConvolver(); cv.buffer = IRS[key] || (IRS[key] = impulse(sec, shape, pre, damp));
    var r = G(0.55); chain(cv, r, dest); return cv;
  }
  function stage(d) { return space("stage", 5.4, 2.1, 0.032, 3300, d); }   // big and dark, long pre-delay
  function glass(d) { return space("glass", 3.0, 2.6, 0.014, 9500, d); }   // bright, for the glint and the blink
  var sfx = {
    /* ---- Cloak Studios: the cold open ----
       Built like a trailer logo: room tone in the black, a reversed swell that
       sucks everything in and cuts to silence a beat before the hit, then a
       hit made of eight layers (sub drop, punch, click, body, crack, a low
       D-minor braam, a struck-metal shimmer and falling air) into a big dark
       stage. All of it is in D minor, the key of the Lowtide theme. */
    // the black: room tone and a little projector air, felt more than heard
    air: function (t, dur, dest) {
      t = t === undefined ? now() : t; dur = dur || 5; var d = dest || dst();
      var hp = F("highpass", 28, 0.7), lp = F("lowpass", 480, 0.5), g = G(0);
      [-0.6, 0.6].forEach(function (pan) { chain(noise("brown", t, dur + 0.1), P(pan), hp); });
      chain(hp, lp, g, d);
      var hs = noise("pink", t, dur + 0.1), hb = F("bandpass", 3200, 0.5), hg = G(0);
      chain(hs, hb, hg, d);
      [[g, 0.05], [hg, 0.0035]].forEach(function (k) {
        var gp = k[0].gain; gp.setValueAtTime(0, t); gp.linearRampToValueAtTime(k[1], t + 0.9);
        gp.setValueAtTime(k[1], t + dur - 0.9); gp.linearRampToValueAtTime(0, t + dur);
      });
    },
    // the suck-in: a reversed hall swell, a D-minor cluster swelling backwards and a
    // sub that climbs under it, all gated hard to silence 45 ms before the hit
    suck: function (t, dur, dest) {
      t = t === undefined ? now() : t; dur = dur || 1.25; var d = dest || dst(), gap = 0.045, len = dur - gap, cut = t + len;
      var bus = G(1); bus.connect(d);
      bus.gain.setValueAtTime(1, cut - 0.006); bus.gain.linearRampToValueAtTime(0, cut);
      // reversed hall: noise swelling up while its filter opens, dark to bright, decorrelated per side
      var sr = ctx.sampleRate, n = Math.floor(sr * len), buf = ctx.createBuffer(2, n, sr);
      for (var c = 0; c < 2; c++) {
        var x = buf.getChannelData(c), r = seeded(140 + c * 13), lp = 0, lp2 = 0;
        for (var i = 0; i < n; i++) {
          var k = i / n, fc = 300 + 9000 * k * k, a = Math.exp(-2 * Math.PI * fc / sr);
          lp = (1 - a) * (r() * 2 - 1) + a * lp; lp2 = (1 - a) * lp + a * lp2;
          x[i] = lp2 * Math.pow(k, 2.4) * (1.6 + 2.4 * k);
        }
      }
      var rv = ctx.createBufferSource(); rv.buffer = buf; var rg = G(0.15);
      chain(rv, F("highpass", 90, 0.6), rg, bus); rv.start(t);
      // the cluster: D2 A2 D3 F3 A3 in detuned saws, opening up as it swells
      var cl = F("lowpass", 220, 0.9), cs = ctx.createWaveShaper(), cg = G(0); cs.curve = sat(1.8);
      cl.frequency.setValueAtTime(220, t); cl.frequency.exponentialRampToValueAtTime(2600, cut);
      cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.045, cut);
      chain(cl, cs, cg, bus);
      [38, 45, 50, 53, 57].forEach(function (m, i) {
        [-1, 1].forEach(function (k) {
          var o = O("sawtooth", mtof(m), t), p = P(k * (0.25 + i * 0.12)); o.detune.value = k * 8 + (rnd() - 0.5) * 4;
          chain(o, p, cl); o.start(t); o.stop(cut + 0.02);
        });
      });
      // the sub climbs a fifth, D1 to A1
      var su = O("sine", mtof(26), t), sg = G(0); su.frequency.exponentialRampToValueAtTime(mtof(33), cut);
      sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.12, cut);
      chain(su, sg, bus); su.start(t); su.stop(cut + 0.02);
      // air rushing in over the last half second, sweeping across from the left
      var w = noise("white", cut - 0.55, 0.6), wb = F("bandpass", 500, 1.3), wg = G(0), wp = P(-0.6);
      wb.frequency.setValueAtTime(500, cut - 0.55); wb.frequency.exponentialRampToValueAtTime(7500, cut);
      wg.gain.setValueAtTime(0.0001, cut - 0.55); wg.gain.exponentialRampToValueAtTime(0.045, cut);
      wp.pan.setValueAtTime(-0.6, cut - 0.55); wp.pan.linearRampToValueAtTime(0.1, cut);
      chain(w, wb, wg, wp, bus);
    },
    // the hit
    slam: function (t, dest) {
      t = t === undefined ? now() : t; var d = dest || dst(), sv = stage(d);
      var one = function (node) { node.start(t); return node; };
      // 1 · sub: a long falling sine, saturated at the peak so laptops still feel it, clean as it decays
      var sub = one(O("sine", 66, t)), sa = G(0), sh = ctx.createWaveShaper(), st = G(1.3);
      sh.curve = sat(3); sh.oversample = "4x";
      sub.frequency.exponentialRampToValueAtTime(34, t + 1.8);
      sa.gain.setValueAtTime(0, t); sa.gain.linearRampToValueAtTime(1, t + 0.003); sa.gain.setTargetAtTime(0, t + 0.08, 0.55);
      chain(sub, sa, sh, st, d); sub.stop(t + 5.5);
      // 2 · its octave, shorter: the part small speakers can actually play
      var oc = one(O("sine", 132, t)), og = G(0); oc.frequency.exponentialRampToValueAtTime(58, t + 0.9);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.26, t + 0.003); og.gain.setTargetAtTime(0, t + 0.03, 0.28);
      chain(oc, og, d); oc.stop(t + 2);
      // 3 · punch
      var pu = one(O("sine", 200, t)), pg = G(0); pu.frequency.exponentialRampToValueAtTime(52, t + 0.055); pu.frequency.exponentialRampToValueAtTime(42, t + 0.4);
      pg.gain.setValueAtTime(0, t); pg.gain.linearRampToValueAtTime(0.62, t + 0.001); pg.gain.setTargetAtTime(0, t + 0.012, 0.1);
      chain(pu, pg, d); pu.stop(t + 1);
      // 4 · click
      var ck = noise("white", t, 0.02), cg = G(0); perc(cg, t, 0.0004, 0.16, 0.012);
      chain(ck, F("highpass", 3200, 0.7), cg, d);
      // 5 · body: a low chest thump, mostly into the room
      var bo = noise("pink", t, 0.7), bl = F("lowpass", 1000, 0.7), bp = F("peaking", 160, 1); bp.gain.value = 7;
      var bg = G(0); perc(bg, t, 0.002, 0.5, 0.26);
      chain(bo, bl, bp, bg, d); send(bg, sv, 0.75);
      // 6 · crack: the snap that lights up the hall, Haas-split for width
      [[-0.75, 0], [0.75, 0.007]].forEach(function (k) {
        var cr = noise("white", t + k[1], 0.3), cb = F("bandpass", 1900, 0.6), crg = G(0), cp = P(k[0]);
        perc(crg, t + k[1], 0.0008, 0.24, 0.055);
        chain(cr, cb, crg, cp, d); send(cp, sv, 1.1);
      });
      // 7 · braam: D1 D2 A2 D3 in detuned saws, the filter snapping open then closing over three seconds
      var bf = F("lowpass", 150, 1.3), bs = ctx.createWaveShaper(), ba = G(0); bs.curve = sat(2.4);
      bf.frequency.setValueAtTime(150, t); bf.frequency.exponentialRampToValueAtTime(1700, t + 0.045); bf.frequency.exponentialRampToValueAtTime(210, t + 3);
      ba.gain.setValueAtTime(0, t); ba.gain.linearRampToValueAtTime(0.15, t + 0.014); ba.gain.setTargetAtTime(0, t + 0.12, 1.0);
      chain(bf, bs, ba, d); send(ba, sv, 0.42);
      [26, 38, 45, 50].forEach(function (m, i) {
        [-1, 1].forEach(function (k) {
          var o = one(O("sawtooth", mtof(m), t)), p = P(k * (0.2 + i * 0.16)); o.detune.value = k * 7 + (rnd() - 0.5) * 3;
          chain(o, p, bf); o.stop(t + 5);
        });
      });
      // 8 · shimmer: a struck metal plate on D, inharmonic partials beating against each other
      var mb = G(1), mh = F("highpass", 260, 0.7); chain(mb, mh, d); send(mh, sv, 0.9);
      [1, 1.59, 2.14, 2.65, 3.16, 4.1, 5.43, 6.8].forEach(function (r, i) {
        var f = mtof(62) * r, a1 = 0.02 / (1 + i * 0.35), tau = 2.4 / (1 + i * 0.5);
        [1, 1.0023].forEach(function (dt, j) {
          var o = one(O("sine", f * dt, t)), g = G(0), p = P((i % 2 ? 1 : -1) * (0.25 + 0.4 * j));
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a1, t + 0.004); g.gain.setTargetAtTime(0, t + 0.01, tau);
          chain(o, g, p, mb); o.stop(t + tau * 6 + 0.1);
        });
      });
      // 9 · falling air: debris and pressure leaving the room, both sides
      [-0.7, 0.7].forEach(function (pan) {
        var a = noise("white", t, 2.6), ab = F("bandpass", 6500, 0.55), ag = G(0), ap = P(pan);
        ab.frequency.setValueAtTime(6500, t); ab.frequency.exponentialRampToValueAtTime(420, t + 2.3);
        ag.gain.setValueAtTime(0, t); ag.gain.linearRampToValueAtTime(0.045, t + 0.02); ag.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
        chain(a, ab, ag, ap, d); send(ap, sv, 0.35);
      });
      // 10 · rumble under the tail
      var ru = noise("brown", t, 4), rg = G(0);
      rg.gain.setValueAtTime(0, t); rg.gain.linearRampToValueAtTime(0.1, t + 0.03); rg.gain.setTargetAtTime(0, t + 0.1, 0.8);
      chain(ru, F("lowpass", 110, 0.6), rg, d);
    },
    // the light raking across the letters: a narrow band of air lifting left to right, and a
    // few glassy notes (D F A D) catching along the way
    glint: function (t, dur, dest) {
      t = t === undefined ? now() : t; dur = dur || 1.15; var d = dest || dst(), bv = glass(d);
      var n = noise("white", t, dur + 0.1), hp = F("highpass", 1800, 0.7), bp = F("bandpass", 2800, 3.5), g = G(0), p = P(-0.7);
      bp.frequency.setValueAtTime(2800, t); bp.frequency.exponentialRampToValueAtTime(10500, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.085, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
      p.pan.setValueAtTime(-0.7, t); p.pan.linearRampToValueAtTime(0.7, t + dur);
      chain(n, hp, bp, g, p, d); send(p, bv, 0.6);
      [86, 89, 93, 98].forEach(function (m, i) {
        var at = t + dur * (0.3 + i * 0.12), f = mtof(m), o = O("sine", f, at), o2 = O("sine", f * 2.76, at), og = G(0), o2g = G(0), pp = P(-0.45 + i * 0.3);
        perc(og, at, 0.002, 0.024 - i * 0.003, 0.7); perc(o2g, at, 0.001, 0.006, 0.09);
        chain(o, og, pp, d); chain(o2, o2g, pp); send(pp, bv, 0.8);
        o.start(at); o2.start(at); o.stop(at + 1); o2.stop(at + 0.2);
      });
    },
    // the blink: a soft felt tick as the lids close, and a water-drop note as they open
    blink: function (t, ms, note, v, dest) {
      t = t === undefined ? now() : t; ms = ms || 190; v = v || 1;
      var d = dest || dst(), bv = glass(d), shut = t + ms * 0.0003, open = t + ms * 0.0006;
      var k = noise("white", shut, 0.03), kb = F("bandpass", 1500, 1.4), kg = G(0); perc(kg, shut, 0.0008, 0.09 * v, 0.02);
      var kt = O("sine", 430, shut), ktg = G(0); kt.frequency.exponentialRampToValueAtTime(300, shut + 0.03); perc(ktg, shut, 0.001, 0.05 * v, 0.03);
      chain(k, kb, kg, d); chain(kt, ktg, d); send(kg, bv, 0.2);
      kt.start(shut); kt.stop(shut + 0.1);
      var f = mtof(note || 86), o = O("sine", f * 0.7, open), o2 = O("sine", f * 2.01, open), og = G(0), o2g = G(0);
      o.frequency.exponentialRampToValueAtTime(f, open + 0.028);
      perc(og, open, 0.001, 0.095 * v, 0.17); perc(o2g, open, 0.001, 0.016 * v, 0.05);
      chain(o, og, d); chain(o2, o2g, d); send(og, bv, 0.55);
      o.start(open); o2.start(open); o.stop(open + 0.4); o2.stop(open + 0.15);
    },
    // out: a long falling breath as the picture sinks to black
    release: function (t, dur, dest) {
      t = t === undefined ? now() : t; dur = dur || 0.95; var d = dest || dst(), sv = stage(d);
      var n = noise("pink", t, dur + 0.6), lp = F("lowpass", 4200, 0.6), g = G(0);
      lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(160, t + dur + 0.4);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
      chain(n, lp, g, d); send(g, sv, 0.3);
      var o = O("sine", mtof(38), t), og = G(0); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.1, t + dur * 0.4); og.gain.linearRampToValueAtTime(0, t + dur + 0.3);
      chain(o, og, d); o.start(t); o.stop(t + dur + 0.4);
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
      var dur = o.dur, f0 = o.f0, bus = G(o.gain * att), lp = F("lowpass", 9000 / (1 + d / 30), 0.5), pan = P(o.pan || 0); chain(bus, lp, pan, B.vox); duck(dur + 0.2, 0.6); send(pan, street(), 0.15 + Math.min(0.4, d / 50));
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
    // a hit: a short grunt of pain
    grunt: function (who, dist, pan) {
      var f = who && who.female, base = (f ? 300 : 150) * (who && who.pitch || 1) * (0.9 + rnd() * 0.2);
      sfx.voice({ f0: base, female: f, dur: 0.22 + rnd() * 0.12, dist: dist, pan: pan, gain: 0.3, attack: 0.008, vib: 0.01, rough: 0.6, breath: 0.15,
        formants: [580, 1100, 2500], contour: [[0.3, 1.15], [1, 0.8]] });
    },
    // the last of it: a wet, choking rattle under a groan that sinks away
    rattle: function (who, dist) {
      if (!ctx) return; var t = now() + 0.15, d = dist || 0, att = 1 / (1 + d / 10); if (att < 0.05) return;
      var bus = G(0.6 * att); bus.connect(B.vox); duck(2.2, 0.6);
      var n = noise("brown", t, 2.2), bp = F("bandpass", 420, 5), gg = G(0), lfo = O("square", 9 + rnd() * 6, t), lg = G(0.5);
      chain(n, bp, gg, bus); chain(lfo, lg, gg.gain); gg.gain.setValueAtTime(0.5, t); gg.gain.linearRampToValueAtTime(0.0, t + 2.1); lfo.start(t); lfo.stop(t + 2.2);
      bp.frequency.linearRampToValueAtTime(260, t + 2);
      var f = (who && who.female ? 190 : 105) * (who && who.pitch || 1), o = O("sawtooth", f, t), ol = F("lowpass", 600, 2), og = G(0);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 1.8); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.22, t + 0.2); og.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
      chain(o, ol, og, bus); o.start(t); o.stop(t + 2);
    },
    /* raw samples (the SAM voice renders to these). SAM's output sits off zero and jumps
       between silences, which clicked like a far-off gunshot through the street reverb: take
       the offset out with a DC blocker and fade the ends. Then the voice bus, duller and
       quieter with distance, with the street under it ducked. */
    pcm: function (data, rate, gain, dist, pan, opt) {
      if (!ctx || !data || !data.length) return; var t = now() + 0.02, d = dist || 0, att = 1 / (1 + d / 14); if (att < 0.05) return;
      var n = data.length, x = new Float32Array(n), px = data[0], py = 0, fade = Math.min(n >> 2, Math.round(rate * 0.012));
      for (var i = 0; i < n; i++) { py = data[i] - px + 0.995 * py; px = data[i]; x[i] = py; }
      for (var j = 0; j < fade; j++) { var w = j / fade; x[j] *= w; x[n - 1 - j] *= w; }
      var buf = ctx.createBuffer(1, n, rate), src = ctx.createBufferSource(); buf.copyToChannel(x, 0); src.buffer = buf; src.playbackRate.value = slowRate;
      // a police broadcast: everyone else stops talking, nobody else speaks until it's done; through a loudhailer, off the buildings
      if (opt && opt.pa) {
        for (var k = 0; k < voices.length; k++) { try { voices[k].g.gain.setTargetAtTime(0, t - 0.02, 0.03); voices[k].src.stop(t + 0.2); } catch (e) {} } voices = [];
        var len = n / rate; paUntil = t + len + 0.4;
        var pg = G(1.6 * (gain || 0.9)), hp = F("highpass", 450, 0.8), bp2 = F("lowpass", 3400, 0.9), pk2 = F("peaking", 1800, 1.2), shp = ctx.createWaveShaper(); pk2.gain.value = 8; shp.curve = SAT2;
        chain(src, hp, pk2, bp2, shp, pg, out); send(pg, street(), 0.9); var ec = ctx.createDelay(1.2); ec.delayTime.value = 0.42; var eg = G(0.32); chain(pg, ec, eg, out); send(eg, street(), 0.6);
        duck(len + 0.3, 0.3); src.start(t); return;
      }
      if (t < paUntil) return;
      var g = G((gain || 0.5) * att), lp = F("lowpass", 7000 / (1 + d / 25), 0.4), p = P(pan || 0);
      var rec = { src: src, g: g }; voices.push(rec); src.onended = function () { var i = voices.indexOf(rec); if (i >= 0) voices.splice(i, 1); };
      if (opt && opt.scream) {   // a scream: driven into distortion, a fast shake on it, the throat's rasp brought up
        var pre = G(3.2), sh = ctx.createWaveShaper(), trem = G(1), tl = O("sine", 8 + rnd() * 5, t), tg = G(0.38), pk = F("peaking", 2900, 1.1);
        sh.curve = SAT2; pk.gain.value = 7; chain(tl, tg, trem.gain); tl.start(t); tl.stop(t + n / rate + 0.2);
        chain(src, pre, sh, trem, pk, g, lp, p, B.vox); send(p, street(), 0.2 + Math.min(0.35, d / 50)); duck(n / rate + 0.3, 0.35);
      } else { chain(src, g, lp, p, B.vox); send(p, street(), 0.08 + Math.min(0.3, d / 60)); duck(n / rate + 0.1, 0.55); }
      src.start(t);
    },
    /* police: a siren (a wail that rises and falls, switching to a fast yelp now and then), heard
       from where the car is; set(dist, on) each frame */
    siren: function () {
      if (!ctx) return { set: function () {}, stop: function () {} };
      var t = now(), a = O("sawtooth", 700, t), b = O("square", 704, t), lfo = O("sine", 0.32, t), lg = G(380), bp = F("bandpass", 1100, 1.1), lp = F("lowpass", 6000), g = G(0), p = P(0);
      chain(lfo, lg); lg.connect(a.frequency); lg.connect(b.frequency); chain(a, bp); var bg = G(0.4); chain(b, bg, bp); chain(bp, lp, g, p, B.under); send(g, street(), 0.35);
      [a, b, lfo].forEach(function (x) { x.start(t); }); var yelp = 0;
      return {
        set: function (dist, on) {
          var t2 = now(), v = on ? 0.09 / (1 + dist / 22) : 0;
          g.gain.setTargetAtTime(v, t2, 0.12); lp.frequency.setTargetAtTime(6000 / (1 + dist / 40), t2, 0.2);
          if ((yelp += 1) % 700 === 0) { lfo.frequency.setTargetAtTime(4.5, t2, 0.05); lfo.frequency.setTargetAtTime(0.32, t2 + 2.5, 0.1); }
        },
        stop: function () { var t2 = now(); g.gain.setTargetAtTime(0, t2, 0.2); [a, b, lfo].forEach(function (x) { x.stop(t2 + 1); }); }
      };
    },
    // the helicopter: the rotor's thump (noise chopped at the blade rate) and a turbine whine
    heli: function () {
      if (!ctx) return { set: function () {}, stop: function () {} };
      var t = now(), n = noise("brown", t, 0, true), lp = F("lowpass", 500, 0.7), chop = G(0), lfo = O("square", 11, t), lg = G(0.5), g = G(0);
      chain(lfo, lg, chop.gain); chop.gain.value = 0.5; chain(n, lp, chop, g, B.under); send(g, street(), 0.2);
      var w = O("sawtooth", 1750, t), wl = F("bandpass", 1800, 6), wg = G(0.03); chain(w, wl, wg, g);
      lfo.start(t); w.start(t);
      return {
        set: function (dist) { var t2 = now(); g.gain.setTargetAtTime(0.5 / (1 + dist / 30), t2, 0.2); lp.frequency.setTargetAtTime(500 / (1 + dist / 120), t2, 0.3); },
        stop: function () { var t2 = now(); g.gain.setTargetAtTime(0, t2, 0.5); n.stop(t2 + 2.5); lfo.stop(t2 + 2.5); w.stop(t2 + 2.5); }
      };
    },
    // a star gained: a short, tense two-note sting
    wantedUp: function (n) {
      if (!ctx) return; var t = now();
      [[52, 0], [55 + Math.min(4, n), 0.11]].forEach(function (k) { var o = O("sawtooth", mtof(k[0]), t + k[1]), lp = F("lowpass", 1400, 2), g = G(0); perc(g, t + k[1], 0.005, 0.1, 0.35); chain(o, lp, g, B.ui); o.start(t + k[1]); o.stop(t + k[1] + 0.5); });
    },
    // a tyre going on a spike strip: a sharp pop and a rush of air
    pop: function (dist) {
      if (!ctx) return; var t = now(), v = 1 / (1 + (dist || 0) / 12); if (v < 0.05) return;
      var bus = G(v); bus.connect(B.sfx); send(bus, street(), 0.25);
      var n = noise("white", t, 0.08), hp = F("highpass", 600), g = G(0); perc(g, t, 0.0005, 0.7, 0.05); chain(n, hp, g, bus);
      var o = O("sine", 180, t), og = G(0); o.frequency.exponentialRampToValueAtTime(60, t + 0.08); perc(og, t, 0.001, 0.5, 0.08); chain(o, og, bus); o.start(t); o.stop(t + 0.15);
      var h = noise("pink", t + 0.03, 0.9), hb = F("bandpass", 2400, 0.8), hg = G(0); hg.gain.setValueAtTime(0.0001, t + 0.03); hg.gain.exponentialRampToValueAtTime(0.18, t + 0.08); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); chain(h, hb, hg, bus);
    },
    /* the bullet cam: slow motion for the ears. New sounds play slowed (lower, longer), the
       whole mix is pulled down through a low-pass, the sea and wind slow, and a heartbeat
       comes up underneath */
    slowmo: function (on) {
      if (!ctx) return; var t = now();
      slowRate = on ? 0.4 : 1;
      B.slowLP.frequency.cancelScheduledValues(t); B.slowLP.frequency.setTargetAtTime(on ? 850 : 20000, t, on ? 0.06 : 0.3);
      if (W.nodes) W.nodes.forEach(function (n) { if (n.playbackRate) n.playbackRate.setTargetAtTime(on ? 0.45 : 1, t, 0.1); });
      clearInterval(beatT);
      if (on) { var beat = function () { var t2 = now(); [0, 0.22].forEach(function (d, i) { var o = O("sine", 58, t2 + d), g = G(0); o.frequency.exponentialRampToValueAtTime(34, t2 + d + 0.18); perc(g, t2 + d, 0.01, i ? 0.35 : 0.55, 0.22); chain(o, g, B.cine); o.start(t2 + d); o.stop(t2 + d + 0.3); }); }; beat(); beatT = setInterval(beat, 1050); }
    },
    // the shot, stretched: a long sub drop and a smeared crack, ringing off the street; the round's whoosh panned past
    cineShot: function (T, side) {
      if (!ctx) return; var t = now(), bus = G(0.9); bus.connect(B.cine); send(bus, hall, 0.7);
      var o = O("sine", 95, t), og = G(0); o.frequency.exponentialRampToValueAtTime(24, t + 1.9); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(1, t + 0.03); og.gain.exponentialRampToValueAtTime(0.001, t + 2.2); chain(o, og, bus); o.start(t); o.stop(t + 2.3);
      var n = ctx.createBufferSource(); n.buffer = NZ.white; n.playbackRate.value = 0.35; var nl = F("lowpass", 2400, 0.7), ng = G(0); nl.frequency.exponentialRampToValueAtTime(160, t + 2); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.7, t + 0.02); ng.gain.exponentialRampToValueAtTime(0.001, t + 2.4); chain(n, nl, ng, bus); n.start(t, rnd(), 2.5);
      var w = ctx.createBufferSource(); w.buffer = NZ.pink; w.loop = true; var wb = F("bandpass", 260, 5), wg = G(0), wp = P(-(side || 1) * 0.8), wt = O("sine", 16, t), wtg = G(0.4);
      wb.frequency.exponentialRampToValueAtTime(1500, t + T); wp.pan.linearRampToValueAtTime((side || 1) * 0.8, t + T);
      wg.gain.setValueAtTime(0, t); wg.gain.linearRampToValueAtTime(0.5, t + T * 0.85); wg.gain.linearRampToValueAtTime(0, t + T + 0.35);
      chain(wt, wtg, wg.gain); chain(w, wb, wg, wp, B.cine); send(wp, hall, 0.3); w.start(t); w.stop(t + T + 0.5); wt.start(t); wt.stop(t + T + 0.5);
    },
    // and where it lands: a deep, slow, wet crunch
    cineImpact: function () {
      if (!ctx) return; var t = now(), bus = G(1); bus.connect(B.cine); send(bus, hall, 0.5);
      var o = O("sine", 75, t), og = G(0); o.frequency.exponentialRampToValueAtTime(26, t + 1.3); perc(og, t, 0.005, 1.0, 1.3); chain(o, og, bus); o.start(t); o.stop(t + 1.5);
      var n = ctx.createBufferSource(); n.buffer = NZ.brown; n.playbackRate.value = 0.5; var nl = F("lowpass", 700, 1), ng = G(0); perc(ng, t, 0.005, 0.9, 1.0); chain(n, nl, ng, bus); n.start(t, rnd(), 1.2);
      var c = ctx.createBufferSource(); c.buffer = NZ.white; c.playbackRate.value = 0.4; var cb = F("bandpass", 1300, 2.5), cg = G(0); perc(cg, t, 0.003, 0.5, 0.35); chain(c, cb, cg, bus); c.start(t, rnd(), 0.5);
    },
    /* inside: each place has its sound. A fridge hum and a radio for the shops, the jukebox in
       the bar, the murmur and clink of a diner, the machines in a laundromat, lift music in a
       lobby, a film through the wall at the theatre, the big hum of a warehouse */
    /* recorded sounds (media/sfx, CC0, see CREDITS.md): played as if in the room with you. Each goes through
       its own level and a soft top end, then the small-room reverb of a flat (short, close, a little dull),
       so a tap or a wardrobe door sits in the same space as the footsteps. opt: { vol, rate, loop, dist,
       pan, fadeIn, room }. Returns { stop(fadeSec) }. Files load once, on first use. */
    sample: function (name, opt) {
      opt = opt || {}; var h = { node: null, gain: null, dead: false, stop: function (f) { this.dead = true; if (!this.gain) return; var t2 = now(), fd = f == null ? 0.08 : f; this.gain.gain.cancelScheduledValues(t2); this.gain.gain.setValueAtTime(this.gain.gain.value, t2); this.gain.gain.linearRampToValueAtTime(0, t2 + fd); try { this.node.stop(t2 + fd + 0.05); } catch (e) { /* done */ } } };
      if (!ctx) return h;
      var cache = sample.cache || (sample.cache = {});
      var p = cache[name] || (cache[name] = fetch("media/sfx/" + name + ".mp3").then(function (r) { return r.arrayBuffer(); }).then(function (b) { return ctx.decodeAudioData(b); }).catch(function () { return null; }));
      p.then(function (buf) {
        if (!buf || h.dead) return;
        var t = now() + 0.01, d = opt.dist || 0, v = (opt.vol == null ? 0.8 : opt.vol) / (1 + d / 4);
        var src = ctx.createBufferSource(); src.buffer = buf; src.loop = !!opt.loop; src.playbackRate.value = (opt.rate || 1) * slowRate;
        var g = G(0), lp = F("lowpass", 11000 / (1 + d / 8), 0.5), pn = P(opt.pan || 0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + (opt.fadeIn || 0.01));
        chain(src, g, lp, pn, B.sfx); send(pn, sample.room || (sample.room = verb(0.55, 3.2, 0.004, 5200, 0.55, B.sfx)), opt.room == null ? 0.22 : opt.room);
        src.start(t); h.node = src; h.gain = g;
      });
      return h;
    },
    roomTone: function (kind) {
      if (!ctx) return { stop: function () {} };
      var t = now(), bus = G(0), nodes = [], timers = []; bus.connect(B.under); send(bus, plate, 0.2);
      bus.gain.setValueAtTime(0, t); bus.gain.linearRampToValueAtTime(1, t + 0.8);
      var hum = function (f, v) { var o = O("sine", f, t), g = G(v); chain(o, g, bus); o.start(t); nodes.push(o); };
      var bed = function (kind2, lo, hi, v) { var n = noise(kind2, t, 0, true), b = F("bandpass", (lo + hi) / 2, (lo + hi) / (hi - lo) * 0.5), g = G(v); chain(n, b, g, bus); nodes.push(n); return g; };
      var every = function (ms, fn) { fn(); timers.push(setInterval(fn, ms)); };
      var taps = []; var tap = function (src, dest) { src.connect(dest); taps.push([src, dest]); };   // the drums and bass play on the (muted) music bus: borrow them
      var radio = function (lp, v) {   // a little music from somewhere: chords on the electric piano, through a small speaker
        var spk = F("lowpass", lp, 1), hp = F("highpass", 300), g = G(v); chain(spk, hp, g, bus); tap(B.bass, spk); var prog = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], k = 0;
        every(2400, function () { var t2 = now() + 0.05, ch = prog[k++ % 4]; ch.forEach(function (m, i) { rhodes(m, t2 + i * 0.02, 0.5, 2.2, spk, 0); }); bass(ch[0] - 24, t2, 1.8, 0.5); });
      };
      if (kind === "store" || kind === "pharmacy") { hum(60, 0.02); hum(120, 0.012); bed("pink", 3000, 6000, 0.01); radio(2200, 0.5); }
      else if (kind === "bar") {   // the jukebox: a slow groove
        var jl = F("lowpass", 3200, 0.7), jg = G(0.7); chain(jl, jg, bus); tap(B.drums, jl); tap(B.bass, jl); var beat = 0;
        every(60000 / 92 / 2, function () { var t2 = now() + 0.03, b = beat++ % 8; if (b % 4 === 0) kick(t2, 0.5); if (b % 4 === 2) clap(t2, 0.3); hat(t2, 0.12, b % 2 === 1); if (b % 8 === 0) { [55, 59, 62, 65].forEach(function (m, i) { rhodes(m, t2 + i * 0.03, 0.45, 2.4, jl, (i - 1.5) * 0.2); }); bass(43, t2, 1.2, 0.6); } if (b % 8 === 4) bass(46, t2, 1.2, 0.5); });
        bed("pink", 300, 900, 0.03);
      } else if (kind === "diner" || kind === "cafe") {
        var mur = bed("pink", 250, 1100, 0.06), lfo = O("sine", 0.7, t), lg = G(0.03); chain(lfo, lg, mur.gain); lfo.start(t); nodes.push(lfo);
        every(1700, function () { if (rnd() < 0.6) { var t2 = now(), o = O("sine", 2400 + rnd() * 1800, t2), g = G(0); perc(g, t2, 0.001, 0.04, 0.25); chain(o, g, bus); o.start(t2); o.stop(t2 + 0.3); } });
        radio(1600, 0.35);
      } else if (kind === "laundry") { hum(50, 0.03); var dr = bed("brown", 60, 260, 0.12), dl = O("sine", 0.9, t), dg = G(0.05); chain(dl, dg, dr.gain); dl.start(t); nodes.push(dl); }
      else if (kind === "hotel" || kind === "office") { hum(60, 0.01); radio(4000, 0.45); bed("pink", 400, 2000, 0.01); }
      else if (kind === "theatre") { var fm = bed("brown", 80, 500, 0.12), fl = O("sine", 0.15, t), fg = G(0.08); chain(fl, fg, fm.gain); fl.start(t); nodes.push(fl); bed("pink", 200, 700, 0.03); }
      else if (kind === "warehouse" || kind === "garage") { hum(48, 0.03); bed("brown", 40, 180, 0.08); bed("pink", 1500, 4000, 0.008); }
      else { hum(60, 0.008); bed("pink", 200, 800, 0.01); if (kind === "apartment" || kind === "house" || kind === "motel") radio(1200, 0.3); }
      return { stop: function () { var t2 = now(); bus.gain.cancelScheduledValues(t2); bus.gain.setTargetAtTime(0, t2, 0.08); timers.forEach(clearInterval); setTimeout(function () { taps.forEach(function (q) { try { q[0].disconnect(q[1]); } catch (e) { /* */ } }); }, 600); nodes.forEach(function (n) { try { n.stop(t2 + 0.5); } catch (e) { /* */ } }); } };
    },
    // melee: the air a fist or a bat moves
    swing: function (kind, dist) {
      if (!ctx) return; var t = now(), v = 1 / (1 + (dist || 0) / 8); if (v < 0.06) return;
      var bat = kind === "bat", n = noise("pink", t, bat ? 0.32 : 0.16), bp = F("bandpass", bat ? 380 : 700, 1.6), g = G(0);
      bp.frequency.exponentialRampToValueAtTime(bat ? 1500 : 2400, t + (bat ? 0.22 : 0.1));
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime((bat ? 0.32 : 0.18) * v, t + (bat ? 0.14 : 0.05)); g.gain.exponentialRampToValueAtTime(0.0001, t + (bat ? 0.3 : 0.15)); chain(n, bp, g, B.sfx);
    },
    // a blow landing: a fist (a chesty thud and a slap), a bat (a wooden crack over the thud), a car (sheet metal)
    punch: function (kind, dist) {
      if (!ctx) return; var t = now(), v = 1 / (1 + (dist || 0) / 10); if (v < 0.05) return;
      var bus = G(v), sh = ctx.createWaveShaper(); sh.curve = SAT2; chain(bus, sh, B.sfx); send(bus, street(), 0.12);
      if (kind === "car") {
        var m = noise("white", t, 0.2), mb = F("bandpass", 1300, 2), mg = G(0); perc(mg, t, 0.001, 0.6, 0.12); chain(m, mb, mg, bus);
        [212, 418, 733, 1190].forEach(function (f, i) { var o = O(i ? "sine" : "square", f * (0.97 + rnd() * 0.06), t), og = G(0); perc(og, t, 0.001, [0.12, 0.1, 0.07, 0.05][i], [0.12, 0.3, 0.25, 0.18][i]); chain(o, og, bus); o.start(t); o.stop(t + 0.4); });
        return;
      }
      var o = O("sine", kind === "bat" ? 110 : 140, t), og = G(0); o.frequency.exponentialRampToValueAtTime(48, t + 0.12); perc(og, t, 0.002, 1.0, 0.13); chain(o, og, bus); o.start(t); o.stop(t + 0.2);
      var n = noise("brown", t, 0.12), nl = F("lowpass", 900), ng = G(0); perc(ng, t, 0.002, 0.8, 0.08); chain(n, nl, ng, bus);
      var s2 = noise("white", t, 0.04), sb = F("bandpass", kind === "bat" ? 1900 : 2600, kind === "bat" ? 3 : 1.2), sg = G(0); perc(sg, t, 0.0006, kind === "bat" ? 0.6 : 0.35, kind === "bat" ? 0.045 : 0.025); chain(s2, sb, sg, bus);
      if (kind === "bat") { var w = O("triangle", 760, t), wg = G(0); perc(wg, t, 0.001, 0.12, 0.09); chain(w, wg, bus); w.start(t); w.stop(t + 0.15); }
    },
    /* fast travel, the switch: each cut of the camera is air ripping past (noise
       through a sweeping band), a sub thump you feel, a shutter tick, and a dark
       stab that climbs a step with each cut going up and falls going down. */
    switchHop: function (up, k) {
      if (!ctx) return; var t = now(), lvl = [0.8, 0.9, 1][k] || 0.9, bus = G(lvl); bus.connect(B.sfx); send(bus, hall, 0.3); send(bus, street(), 0.15);
      var n = noise("pink", t, 1.0), bp = F("bandpass", up ? 260 : 3200, 1.3), g = G(0);
      bp.frequency.exponentialRampToValueAtTime(up ? 2400 + k * 900 : 220, t + 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85); chain(n, bp, P(up ? -0.3 : 0.3), g, bus);
      var w = noise("white", t, 0.5), wh = F("highpass", 5000), wg = G(0); wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.12, t + 0.06); wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); chain(w, wh, wg, bus);
      var o = O("sine", 92 - k * 8, t), og = G(0); o.frequency.exponentialRampToValueAtTime(30, t + 0.55); perc(og, t, 0.004, 1.0, 0.6); chain(o, og, bus); o.start(t); o.stop(t + 0.8);
      var c = noise("white", t, 0.05), cb = F("bandpass", 2600, 3), cg = G(0); perc(cg, t, 0.0005, 0.5, 0.03); chain(c, cb, cg, bus);
      var root = (up ? 40 + k * 3 : 46 - (2 - k) * 3), sl = F("lowpass", 900, 1.2), sg = G(0); sl.frequency.exponentialRampToValueAtTime(260, t + 0.7);
      [0, 7, 10, 15].forEach(function (iv) { var so = O("sawtooth", mtof(root + iv), t); so.detune.value = (rnd() - 0.5) * 14; chain(so, sl); so.start(t); so.stop(t + 0.9); });
      perc(sg, t, 0.006, 0.16, 0.75); chain(sl, sg, bus); send(sg, mverb, 0.3);
    },
    // up in the sky: wind across the lens, a low drone and a high airy shimmer, until the drop
    skyBed: function () {
      if (!ctx) return { stop: function () {} }; var t = now(), bus = G(0); bus.connect(B.sfx); send(bus, hall, 0.35);
      bus.gain.setValueAtTime(0, t); bus.gain.linearRampToValueAtTime(1, t + 0.6);
      var wd = noise("pink", t, 0, true), wb = F("bandpass", 700, 0.7), wl = O("sine", 0.23, t), wlg = G(400); chain(wl, wlg, wb.frequency); chain(wd, wb, G(0.22), bus);
      var dl = F("lowpass", 320, 0.8), dg = G(0.09), nodes = [wd, wl];
      [26, 26.08, 33].forEach(function (m) { var o = O("sawtooth", mtof(m), t); chain(o, dl); nodes.push(o); o.start(t); });
      chain(dl, dg, bus);
      var hg = G(0.018), hl = O("sine", 4.2, t), hlg = G(0.012); chain(hl, hlg, hg.gain); nodes.push(hl);
      [74, 79, 86].forEach(function (m) { var o = O("sine", mtof(m), t); chain(o, hg); nodes.push(o); o.start(t); });
      chain(hg, bus); send(hg, mverb, 0.6); wl.start(t); hl.start(t);
      return { stop: function () { var t2 = now(); bus.gain.cancelScheduledValues(t2); bus.gain.setTargetAtTime(0, t2, 0.12); nodes.forEach(function (x) { x.stop(t2 + 0.8); }); } };
    },
    // touchdown: the last cut lands with a deep hit and a reversed swell into it
    switchLand: function () {
      if (!ctx) return; var t = now(), bus = G(1); bus.connect(B.sfx); send(bus, hall, 0.4); send(bus, street(), 0.3);
      var o = O("sine", 62, t + 0.04), og = G(0); o.frequency.exponentialRampToValueAtTime(26, t + 1.2); perc(og, t + 0.04, 0.005, 1.2, 1.1); chain(o, og, bus); o.start(t); o.stop(t + 1.4);
      var n = noise("brown", t, 0.9), nl = F("lowpass", 700), ng = G(0); perc(ng, t + 0.04, 0.004, 0.7, 0.6); chain(n, nl, ng, bus);
      var r = noise("white", t - 0, 0.5), rb = F("highpass", 3000), rg = G(0); rg.gain.setValueAtTime(0.0001, t); rg.gain.exponentialRampToValueAtTime(0.1, t + 0.035); rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); chain(r, rb, rg, bus);
      duck(0.1, 1);
    },
    // the world under the whole trip
    duckAll: function (sec) { duck(sec || 6, 0.25); },
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
      if (!ctx) return null; var t = now(), n = noise("white", t, 0, true), bp = F("bandpass", 2600, 0.6), g = G(0); chain(n, bp, g, B.loop);
      return { set: function (s, d) { g.gain.setTargetAtTime(0.06 * s / (1 + d / 10), now(), 0.1); }, stop: function () { var t2 = now(); g.gain.setTargetAtTime(0, t2, 0.3); n.stop(t2 + 1.5); } };
    },
    // the city-wide alert: an air-raid siren winding up and down across the whole island, far off and everywhere
    citySiren: function () {
      if (!ctx) return null; var t = now(), a = O("sawtooth", 220, t), b = O("sawtooth", 223, t), lp = F("lowpass", 1400, 0.7), g = G(0);
      chain(a, lp); chain(b, lp); chain(lp, g, out); send(g, street(), 0.9); a.start(t); b.start(t);
      // over everything: the street, the engines and the guns pulled down under it while it's going
      B.sfx.gain.setTargetAtTime(0.5, t, 1.5); if (B.btrim) B.btrim.gain.setTargetAtTime(0.4, t, 1.5);
      var lfo = function () { var t2 = now(); for (var k = 0; k < 6; k++) { var s = t2 + k * 7; a.frequency.setTargetAtTime(640, s, 1.6); b.frequency.setTargetAtTime(646, s, 1.6); a.frequency.setTargetAtTime(230, s + 3.6, 1.8); b.frequency.setTargetAtTime(233, s + 3.6, 1.8); } };
      lfo(); var iv = setInterval(lfo, 40000);
      return { set: function (v) { g.gain.setTargetAtTime(0.16 * v, now(), 0.5); }, stop: function () { clearInterval(iv); var t2 = now(); g.gain.setTargetAtTime(0, t2, 1.2); a.stop(t2 + 5); b.stop(t2 + 5); B.sfx.gain.setTargetAtTime(1, t2, 1.2); if (B.btrim) B.btrim.gain.setTargetAtTime(1, t2, 1.2); } };
    },
    // a lock-on beep (the drones), quieter with distance
    beep: function (dist, hi) {
      if (!ctx) return; var t = now(), o = O("square", hi ? 1980 : 1480, t), o2 = O("square", hi ? 2970 : 2220, t), g = G(0), lp = F("lowpass", 5200, 0.7);
      perc(g, t, 0.002, hi ? 0.34 : 0.26, hi ? 0.09 : 0.07); chain(o, lp); var g2 = G(0.35); chain(o2, g2, lp); chain(lp, g, B.ui); o.start(t); o2.start(t); o.stop(t + 0.16); o2.stop(t + 0.16);
    },
    // a drone's motors: a whine that climbs as it dives (set by speed and distance)
    whine: function () {
      if (!ctx) return null; var t = now(), o = O("sawtooth", 180, t), o2 = O("square", 361, t), bp = F("bandpass", 900, 1.5), g = G(0); chain(o, bp); chain(o2, bp); chain(bp, g, B.loop); o.start(t); o2.start(t);
      return { set: function (sp, dist) { var t2 = now(), f = 160 + sp * 22; o.frequency.setTargetAtTime(f, t2, 0.08); o2.frequency.setTargetAtTime(f * 2.01, t2, 0.08); bp.frequency.setTargetAtTime(600 + sp * 40, t2, 0.1); g.gain.setTargetAtTime(0.06 / (1 + dist / 18), t2, 0.1); },
        stop: function () { var t2 = now(); g.gain.setTargetAtTime(0, t2, 0.05); o.stop(t2 + 0.4); o2.stop(t2 + 0.4); } };
    },
    // tyres letting go: a squeal (narrow noise, a little wobble), set by how much they're sliding
    skid: function () {
      if (!ctx) return null; var t = now(), n = noise("white", t, 0, true), bp = F("bandpass", 1300, 7), bp2 = F("bandpass", 1300, 3), g = G(0); chain(n, bp, bp2, g, B.loop);
      return { set: function (s) { var t2 = now(); g.gain.setTargetAtTime(0.16 * s * s, t2, 0.06); bp.frequency.setTargetAtTime(1150 + 500 * s + Math.sin(t2 * 23) * 40, t2, 0.08); },
        stop: function () { var t2 = now(); g.gain.setTargetAtTime(0, t2, 0.08); n.stop(t2 + 0.6); } };
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
      chain(a, lp); chain(b, sub, lp); chain(lp, g, B.loop); a.start(t); b.start(t); g.gain.linearRampToValueAtTime(0.06, t + 0.3);
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
    sfx.air(T + C.tone, C.dark - C.tone);
    sfx.suck(T + C.rise, C.slam - C.rise);
    sfx.slam(T + C.slam);
    sfx.glint(T + C.sheen, 1.15);
    sfx.blink(T + C.blink1, 190, 86, 1); sfx.blink(T + C.blink2, 150, 93, 0.8);   // D6, then A6
    sfx.release(T + C.fade, C.dark - C.fade);
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

  function lowAudio() {}
  function sample() {}
  window.LT = {
    loadBaked: loadBaked, bed: bed, playIntro: playIntro, startTitle: startTitle, cutIntro: function () { if (ctx) cutSeq(now()); },
    get baked() { return !!(BAKE.intro && BAKE.loop); },
    // low quality: swap every reverb for a short one (and back)
    lowAudio: function (on) {
      if (!ctx || !hall) return; var key = on ? "short" : "long";
      if (lowAudio.k === key) return; lowAudio.k = key;
      [[hall, 3.6, 2.4, 0.03, 4600], [plate, 1.3, 3.0, 0.006, 8000], [mverb, 2.8, 2.6, 0.02, 5200], [streetVerb, 1.7, 2.2, 0.055, 3600]].forEach(function (v) {
        if (v[0]) v[0].buffer = impulse(on ? Math.min(0.5, v[1]) : v[1], v[2], v[3], v[4]);
      });
    },
    init: init, now: now, sfx: sfx, ui: ui, pause: pauseMix, mix: function (S) { mix(S || (window.LT_SET ? LT_SET.all() : {})); },
    cue: { intro: cueIntro, skip: cueSkip },
    song: { play: songPlay, stop: songStop, get wanted() { return SONG.want; } },
    music: { start: musicStart, section: musicSection, stop: musicStop, get on() { return M.on; } },
    amb: { start: ambStart, stop: ambStop, get on() { return W.on; } },
    _pump: pump,
    get ctx() { return ctx; }
  };
})();
