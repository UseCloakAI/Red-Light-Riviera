/* Lowtide audio: all synthesized with WebAudio, no files. LT.sfx.*, LT.music.* */
(function () {
  "use strict";
  var ctx = null, master, musicBus, sfxBus, musicNodes = [], arpT = 0;

  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8;
    var comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    return ctx;
  }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f, t, dur, peak, bus, a) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    env(g, t, a || 0.005, peak, dur);
    o.connect(g); g.connect(bus || sfxBus); o.start(t); o.stop(t + dur + 0.1);
    return o;
  }
  function noise(dur) {
    var b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var s = ctx.createBufferSource(); s.buffer = b; return s;
  }

  var sfx = {
    // orb lands: soft rubbery thump
    thump: function () { var t = ctx.currentTime, o = osc("sine", 180, t, 0.35, 0.9); o.frequency.exponentialRampToValueAtTime(48, t + 0.3); },
    // eyes blink: two tiny ticks
    blink: function () { var t = ctx.currentTime; osc("square", 2400, t, 0.03, 0.08); osc("square", 1800, t + 0.09, 0.03, 0.06); },
    // letter slam
    slam: function () { var t = ctx.currentTime, n = noise(0.12), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass"; f.frequency.value = 1400; env(g, t, 0.002, 0.35, 0.1);
      n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); osc("triangle", 110, t, 0.12, 0.3); },
    // whoosh sweep
    whoosh: function (dur) { dur = dur || 0.9; var t = ctx.currentTime, n = noise(dur), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass"; f.Q.value = 1.2; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(5000, t + dur * 0.8);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); },
    // cinematic sub hit
    hit: function () { var t = ctx.currentTime, o = osc("sine", 90, t, 2.2, 1, sfxBus, 0.01); o.frequency.exponentialRampToValueAtTime(32, t + 1.5);
      var n = noise(1.5), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "lowpass"; f.frequency.value = 600;
      env(g, t, 0.005, 0.5, 1.4); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); },
    // menu
    move: function () { osc("triangle", 880, ctx.currentTime, 0.06, 0.12); },
    select: function () { var t = ctx.currentTime; osc("triangle", 660, t, 0.08, 0.2); osc("triangle", 990, t + 0.06, 0.14, 0.2); },
    back: function () { var t = ctx.currentTime; osc("triangle", 660, t, 0.08, 0.18); osc("triangle", 440, t + 0.06, 0.12, 0.18); }
  };

  // Synthwave bed: pad chords + bass + arp. Am - F - C - G, 96bpm.
  var CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var music = {
    start: function () {
      if (arpT) return;
      var beat = 60 / 96, bar = beat * 4, t0 = ctx.currentTime + 0.05, step = 0;
      var delay = ctx.createDelay(); delay.delayTime.value = beat * 0.75;
      var fb = ctx.createGain(); fb.gain.value = 0.35; delay.connect(fb); fb.connect(delay);
      var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
      delay.connect(lp); lp.connect(musicBus); musicNodes.push(delay, fb, lp);
      function sched() {
        var now = ctx.currentTime;
        while (t0 + step * beat / 2 < now + 0.3) {
          var t = t0 + step * beat / 2, ci = Math.floor(step / 8) % 4, ch = CH[ci];
          if (step % 8 === 0) {
            ch.forEach(function (m) { [-6, 6].forEach(function (dt) {
              var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
              o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = dt; f.type = "lowpass"; f.frequency.value = 900;
              g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + bar);
              o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + bar + 0.1); }); });
          }
          if (step % 2 === 0) osc("sawtooth", mtof(ch[0] - 24), t, beat * 0.8, 0.12, musicBus);
          if (step % 4 === 0) { var k = osc("sine", 120, t, 0.25, 0.5, musicBus); k.frequency.exponentialRampToValueAtTime(40, t + 0.2); }
          var a = ctx.createOscillator(), ag = ctx.createGain();
          a.type = "square"; a.frequency.value = mtof(ch[step % 3] + 12); env(ag, t, 0.005, 0.035, beat * 0.4);
          a.connect(ag); ag.connect(delay); ag.connect(musicBus); a.start(t); a.stop(t + beat);
          step++;
        }
      }
      sched(); arpT = setInterval(sched, 100);
    },
    duck: function (v, s) { musicBus.gain.linearRampToValueAtTime(v, ctx.currentTime + (s || 0.4)); },
    stop: function () { clearInterval(arpT); arpT = 0; }
  };

  window.LT = { init: init, sfx: sfx, music: music, get ctx() { return ctx; } };
})();
