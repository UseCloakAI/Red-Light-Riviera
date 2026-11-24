/* The cue sheet. Seconds from the key press. Picture (intro.js) and sound
   (audio.js) both read this, so a change here moves both together. */
(function () {
  "use strict";
  var C = {
    // Cloak Studios slate
    grid: 0.10,
    fall: 0.45,       // orb leaves the top of frame, eyes shut
    impact: 0.87,     // first contact, squash
    unfurl: 0.90,     // CL and AK slide out from behind the orb
    rebound: 1.28,    // second, smaller landing
    sting: 1.22,      // the studio chord
    eyesOpen: 1.62,
    studios: 1.72,
    lookL: 1.98, lookR: 2.42, lookC: 2.86,
    blink1: 3.10, blink2: 3.36,
    eyesClose: 3.84,
    windup: 3.90,     // anticipation before the iris
    iris: 4.04,       // orb swells to fill the frame
    cover: 4.74,      // frame is all rust: match cut happens here
    sunLand: 5.64,    // the disc has shrunk into the sun

    // Lowtide title
    bars: 4.95,
    credit: 5.80, creditOut: 8.20,
    bpm: 92, introBars: 2
  };
  C.musicStart = C.cover;
  C.bar = 240 / C.bpm;
  C.hit = C.musicStart + C.introBars * C.bar;   // the drop lands on a downbeat
  C.riser = C.hit - 1.6;
  C.tagline = C.hit + 1.3;
  C.press = C.hit + 2.6;
  window.LT_CUE = C;
})();
