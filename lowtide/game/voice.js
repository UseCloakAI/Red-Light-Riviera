/* Voices: eSpeak (vendor/mespeak, see its NOTICE), the classic formant synthesizer:
   clearer than the old S.A.M. but still plainly a machine. It renders in a worker
   (voice-worker.js) and plays through the game's voice bus, so lines fade and dull
   with distance and duck the street.

   Every person gets a voice built from who they are: one of eSpeak's male or female
   voice variants (a few get the starker Klatt voices, the old men sometimes the
   croak), a pitch from their sex and age, their own pace. How they feel changes it:
   scared is faster and higher, angry quicker and harder. And when it goes wrong
   they scream in that same voice: a raw, high, stretched-out shout pushed into
   distortion with a shake on it. Only the people of the street talk; Hollis's own
   lines and the death screen stay as text. */
const cache = new WeakMap();
const R = Math.random, pick = (L) => L[(R() * L.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));
const MALE = ["m1", "m2", "m3", "m4", "m5", "m6"], FEMALE = ["f1", "f2", "f3", "f4", "f5"], ROBOT = ["klatt", "klatt2", "klatt3"];
const SCREAMS = ["AAAAAAAAAAAH!", "AAAAAAHHHH!", "NOOOOOOOOO!", "HELP! HEEELP!", "AAAAH! NO! NO!", "OH GOD! AAAAAAH!", "AAAAAAAAAAAAAAH!", "NOOO! PLEASE!"];

// a person's base voice, fixed for them. eSpeak pitch: 0-99; speed: words per minute
function settingsFor(v) {
  let s = cache.get(v);
  if (!s) {
    const f = !!v.female, age = v.age || 35, old = Math.max(0, (age - 45) / 35), k = v.pitch || 1;
    const variant = R() < 0.22 ? pick(ROBOT) + (f ? "" : "") : f ? pick(FEMALE) : old > 0.5 && R() < 0.5 ? "croak" : pick(MALE);
    s = { variant, female: f,
      pitch: (f ? 52 + R() * 22 : 28 + R() * 22) * k - old * 10 + (variant.startsWith("klatt") && f ? 18 : 0),
      speed: 168 + R() * 26 - old * 30 };
    cache.set(v, s);
  }
  return s;
}
const MOOD = { calm: { pitch: 0, speed: 0, amp: 100 }, scared: { pitch: 18, speed: 38, amp: 130 }, angry: { pitch: -4, speed: 22, amp: 145 } };
const clean = (t) => t.replace(/[‘’]/g, "'").replace(/[^A-Za-z0-9 .,?!'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);

export function makeVoice(sfx) {
  let worker = null, seq = 0; const waiting = new Map();
  try {
    worker = new Worker(new URL("./voice-worker.js?v=dev", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); if (w && e.data.pcm) w(e.data.pcm, e.data.rate); };
    worker.onerror = (e) => { console.warn("Lowtide: voices unavailable", e.message || e); worker = null; };
  } catch (e) { console.warn("Lowtide: voices unavailable", e); }
  const render = (text, opt, done) => { if (!worker) return; const id = ++seq; waiting.set(id, done); worker.postMessage({ id, text, opt }); if (waiting.size > 12) waiting.delete(waiting.keys().next().value); };
  return {
    // text in person v's voice (v: { female, pitch, age }), heard from dist metres; mood: calm | scared | angry
    speak(text, v, dist = 0, mood = "calm") {
      if (!sfx || !sfx.pcm || !text || !v || dist > 60) return;
      const b = settingsFor(v), m = MOOD[mood] || MOOD.calm, line = clean(text); if (!line) return;
      render(line, { variant: b.variant, pitch: clamp(b.pitch + m.pitch, 0, 99), speed: clamp(b.speed + m.speed, 80, 320), amplitude: m.amp, wordgap: mood === "calm" ? 1 : 0 },
        (pcm, rate) => sfx.pcm(pcm, rate, mood === "calm" ? 0.9 : 1.05, dist, 0));
    },
    // a scream in their own voice: high, fast, stretched, distorted and shaking
    scream(v, dist = 0) {
      if (!sfx || !sfx.pcm || !v || dist > 140) return;
      const b = settingsFor(v);
      render(pick(SCREAMS), { variant: b.variant, pitch: clamp(85 + R() * 14, 0, 99), speed: clamp(230 + R() * 90, 80, 380), amplitude: 200 },
        (pcm, rate) => sfx.pcm(pcm, rate * (b.female ? 1.12 : 1.05) * (0.96 + R() * 0.08), 1.25, dist, 0, { scream: true }));
    }
  };
}
