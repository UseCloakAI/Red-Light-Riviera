/* Speech off the main thread: eSpeak (vendor/mespeak, see its NOTICE) renders each line
   to 16-bit WAV in here, and it goes back to the game as float samples, so a line
   never costs the game a frame. Message in: { id, text, opt }; out: { id, pcm, rate }. */
import meSpeak from "../vendor/mespeak/mespeak.esm.js?v=dev";

function toFloat(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 12, rate = 22050;
  while (p + 8 <= v.byteLength) {   // walk the RIFF chunks to "fmt " and "data"
    const id = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3)), size = v.getUint32(p + 4, true);
    if (id === "fmt ") rate = v.getUint32(p + 12, true);
    if (id === "data") {
      const n = Math.min(size, v.byteLength - p - 8) >> 1, out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = v.getInt16(p + 8 + i * 2, true) / 32768;
      return { pcm: out, rate };
    }
    p += 8 + size + (size & 1);
  }
  return null;
}

self.onmessage = (e) => {
  const { id, text, opt } = e.data;
  let res = null;
  try { const a = meSpeak.speak(text, Object.assign({ rawdata: "array" }, opt)); if (a) res = toFloat(new Uint8Array(a)); } catch (err) { /* a line it can't say is just a subtitle */ }
  if (res) self.postMessage({ id, pcm: res.pcm, rate: res.rate }, [res.pcm.buffer]);
  else self.postMessage({ id, pcm: null });
};
