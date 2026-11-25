/* Settings: one small store the menus write and the audio and game read.
   Saved in localStorage; everything works without it (private windows). */
(function () {
  "use strict";
  var KEY = "lowtide_settings";
  var DEF = { master: 100, music: 70, sfx: 100, voices: 100, sens: 100, invert: false, fov: 70, shake: true, subtitles: true, pixels: 270 };
  var S = {}, subs = [];
  Object.keys(DEF).forEach(function (k) { S[k] = DEF[k]; });
  try { var saved = JSON.parse(localStorage.getItem(KEY) || "{}"); Object.keys(DEF).forEach(function (k) { if (saved[k] !== undefined) S[k] = saved[k]; }); } catch (e) { /* defaults */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* not kept */ } }
  function tell(k) { subs.forEach(function (f) { try { f(k, S[k], S); } catch (e) { console.warn(e); } }); }
  window.LT_SET = {
    defaults: DEF,
    get: function (k) { return S[k]; },
    all: function () { return S; },
    set: function (k, v) { S[k] = v; save(); tell(k); },
    reset: function () { Object.keys(DEF).forEach(function (k) { S[k] = DEF[k]; }); save(); tell(null); },
    // f(key, value, all) now and on every change
    on: function (f) { subs.push(f); try { f(null, null, S); } catch (e) { console.warn(e); } }
  };
})();
