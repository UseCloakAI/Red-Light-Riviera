/* Spoken lines in S.A.M., the 1982 speech synthesizer (vendor/samjs, see its
   NOTICE). Only the people of the street talk; Hollis's own lines and the
   death screen stay as text. Every person gets a voice built from who they
   are: women get a higher pitch and a smaller, brighter mouth and throat (the
   formants), men a lower pitch and a bigger tract; age slows the speech and
   drops a woman's pitch a little; and each gets their own small offsets so no
   two sound alike. How they feel changes it on top: scared is faster and
   higher, angry is quicker and harder. Rendered to samples and played on the
   voice bus, so it fades and dulls with distance and ducks the street. */
import SamJs from "../vendor/samjs/samjs.esm.min.js?v=dev";

const cache = new WeakMap();
const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));

// a person's base SAM settings, fixed for them. SAM: higher pitch number = lower voice; speed: higher = slower
function settingsFor(v) {
  let s = cache.get(v);
  if (!s) {
    const r = Math.random, f = v.female, age = v.age || 35, k = v.pitch || 1;
    const old = Math.max(0, (age - 45) / 35);   // 0 till 45, 1 at 80
    s = f
      ? { speed: 70 + old * 14 + r() * 8, pitch: (38 + r() * 10 + old * 6) / k, throat: 150 + r() * 25 - old * 10, mouth: 150 + r() * 25 }
      : { speed: 70 + old * 16 + r() * 10, pitch: (68 + r() * 18 + old * 4) / k, throat: 100 + r() * 25, mouth: 105 + r() * 25 - old * 8 };
    cache.set(v, s);
  }
  return s;
}
const MOOD = {
  calm: { speed: 1, pitch: 1 },
  scared: { speed: 0.8, pitch: 0.84 },   // fast and high
  angry: { speed: 0.88, pitch: 1.06 },   // clipped, a touch lower
};
// SAM reads plain words; strip what it can't say
const clean = (t) => t.replace(/[‘’]/g, "'").replace(/[^A-Za-z0-9 .,?!'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);

export function makeVoice(sfx) {
  return {
    // text in person v's voice (v: { female, pitch, age }), heard from dist metres; mood: calm | scared | angry
    speak(text, v, dist = 0, mood = "calm") {
      if (!sfx || !sfx.pcm || !text || !v) return;
      const b = settingsFor(v), m = MOOD[mood] || MOOD.calm;
      const set = { speed: clamp(b.speed * m.speed, 40, 140), pitch: clamp(b.pitch * m.pitch, 20, 120), throat: clamp(b.throat, 60, 220), mouth: clamp(b.mouth, 60, 220) };
      try {
        const buf = new SamJs(set).buf32(clean(text));
        if (buf && buf.length) sfx.pcm(buf, 22050, mood === "scared" ? 1.0 : 0.85, dist, 0);
      } catch (e) { /* a line SAM can't parse is just a subtitle */ }
    }
  };
}
