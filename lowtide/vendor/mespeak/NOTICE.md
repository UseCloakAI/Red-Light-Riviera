# meSpeak / eSpeak

`mespeak.esm.js` is meSpeak 2.0.2 (Norbert Landsteiner's JavaScript port of the
eSpeak speech synthesizer by Jonathan Duddington, via the `mespeak` npm package),
bundled as one ES module with its config data and the `en-us` voice.

eSpeak and meSpeak are free software under the GNU General Public License,
version 3 or later; the licence text is in `LICENSE.txt`. Sources:
- meSpeak: https://www.masswerk.at/mespeak/
- npm package: https://www.npmjs.com/package/mespeak
- eSpeak: http://espeak.sourceforge.net/

It runs in a Web Worker (`game/voice-worker.js`) and only renders audio; the
game talks to it by message.
