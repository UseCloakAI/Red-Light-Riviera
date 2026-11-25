/* Spoken lines in S.A.M., the 1982 speech synthesizer (vendor/samjs, see its
   NOTICE). Every person gets their own settings from who they are (pitch from
   their sex and age, a random speed, throat and mouth), so the street sounds
   like a crowd of little robots rather than one. A dry narrator, SAM's own
   default voice, reads your death line. Rendered to samples and played through
   the game's mixer, so it fades and dulls with distance like everything else. */
import SamJs from "../vendor/samjs/samjs.esm.min.js?v=dev";

const NARRATOR = { speed: 72, pitch: 64, throat: 128, mouth: 128 };
const cache = new WeakMap();

// a person's SAM settings, fixed for them
function settingsFor(v) {
  if (!v) return NARRATOR;
  let s = cache.get(v);
  if (!s) {
    const r = Math.random, f = v.female;
    s = { speed: 66 + (r() * 22 | 0), pitch: Math.round((f ? 40 + r() * 16 : 64 + r() * 26) / (v.pitch || 1)), throat: 100 + (r() * 70 | 0), mouth: 105 + (r() * 75 | 0) };
    cache.set(v, s);
  }
  return s;
}
// SAM reads plain words; strip what it can't say
const clean = (t) => t.replace(/[‘’]/g, "'").replace(/[^A-Za-z0-9 .,?!'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);

export function makeVoice(sfx) {
  return {
    // say text as person v (their voice object; none = the narrator), heard from dist metres
    speak(text, v, dist = 0, gain = 0.55) {
      if (!sfx || !sfx.pcm || !text) return;
      try {
        const buf = new SamJs(settingsFor(v)).buf32(clean(text));
        if (buf && buf.length) sfx.pcm(buf, 22050, gain, dist, 0);
      } catch (e) { /* a line SAM can't parse is just a subtitle */ }
    },
    narrate(text) { this.speak(text, null, 0, 0.7); }
  };
}
