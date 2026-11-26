/* The cue sheet. Seconds from the key press. Picture (intro.js) and sound
   (audio.js) both read this, so a change here moves both together. */
(function () {
  "use strict";
  var C = {
    // Cloak Studios: a cold open in the dark
    tone: 0.05,       // room tone in the black
    rise: 0.30,       // the suck-in starts
    flare: 0.85,      // a line of light opens across the frame
    slam: 1.55,       // the boom: hard cut to the lockup
    sheen: 2.10,      // light rakes across the letters
    blink1: 3.08, blink2: 3.36,
    fade: 4.30,       // fade to black
    dark: 5.25,       // all black

    // Lowtide title
    cover: 5.50,      // the ocean comes up out of the black, music starts
    bpm: 92, introBars: 2
  };
  C.bars = C.cover + 0.30;
  C.credit = C.cover + 1.10;
  C.creditOut = C.cover + 3.50;
  C.musicStart = C.cover;
  C.bar = 240 / C.bpm;
  C.hit = C.musicStart + C.introBars * C.bar;   // the drop lands on a downbeat
  C.riser = C.hit - 1.6;
  C.tagline = C.hit + 1.3;
  C.press = C.hit + 2.6;
  window.LT_CUE = C;
})();
