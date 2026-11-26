/* Lowtide intro: Cloak Studios slate, match cut, title, menus.
   Live, the slate and the opening ocean play as a pre-rendered film with a
   baked soundtrack (cheap on any device); the logo, menus and UI stay live.
   The same choreography below renders that film: ?render=intro|ocean puts
   the page on a virtual clock that tools/render-intro.js steps frame by frame.
   Every visual beat sits on the cue sheet (cues.js). */
(function () {
  "use strict";
  var C = window.LT_CUE, S = window.LTScene;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var E = {
    out: "cubic-bezier(.16,1,.3,1)",     // entrances: fast, long soft landing
    in: "cubic-bezier(.7,0,.84,0)",       // exits: leave with intent
    io: "cubic-bezier(.65,0,.35,1)",      // moves across the screen
    fall: "cubic-bezier(.55,0,1,.45)",    // gravity
    lift: "cubic-bezier(.2,.8,.3,1)"
  };

  var el = {
    gate: $("#gate"), film: $("#film"), studio: $("#studio"), creator: $("#creator"), loading: $("#loading"), game: $("#game"), title: $("#title"), pause: $("#pause"), iris: $("#iris"),
    grid: $("#studio .grid"), orb: $("#studio .orb"), shadow: $("#studio .orb-shadow"),
    railL: $("#studio .side.l .rail"), railR: $("#studio .side.r .rail"), lids: $("#studio .lids"), look: $("#studio .look"), sub: $("#studio .studio-sub"),
    sea: $("#sea"), wrap: $(".logo-wrap"), lt: $(".lt"), below: $(".lt-below"), refl: $(".lt-refl"), line: $(".lt-line"), tag: $(".lt-tag"),
    credit: $(".credit"), press: $(".press"), barT: $(".bar.t"), barB: $(".bar.b"), scrim: $(".scrim"),
    gateBtn: $("#start"), flash: $("#flash"), selBar: $(".sel-bar"), foot: $("#title .hud-foot"), ptop: $(".p-top"), pbody: $(".p-body"), ink: $(".p-ink")
  };
  var items = $$(".main-menu li"), tabs = $$(".p-tabs button"), panels = $$(".p-panel");
  var layers = [$$(".lt-above span"), $$(".lt-below span"), $$(".lt-refl span")];

  var RENDER = new URLSearchParams(location.search).get("render"), VCLOCK = null, pending = [];
  function clock() { return VCLOCK === null ? performance.now() : VCLOCK; }
  var T0 = clock(), live = [], timers = [], state = "gate", sel = 0, tab = 0, IR = {}, logoAnim = null, filmed = false;

  /* ---- timeline helpers: all times are seconds on the cue sheet ---- */
  function cueNow() { return (clock() - T0) / 1000; }
  function wait(s) { return Math.max(0, T0 + s * 1000 - clock()); }
  function play(node, frames, ms, s, easing, fill) {
    var a = node.animate(frames, { duration: RM ? 1 : ms, delay: wait(s === undefined ? cueNow() : s), easing: easing || "linear", fill: fill || "both" });
    a.__born = cueNow(); if (RENDER) a.pause();
    live.push(a); return a;
  }
  function track(node, keys, fill) {   // keyframes placed at absolute cue times
    var t0 = keys[0].t, t1 = keys[keys.length - 1].t;
    return play(node, keys.map(function (k) {
      var o = { offset: (k.t - t0) / (t1 - t0) }; for (var p in k) if (p !== "t") o[p] = k[p]; return o;
    }), (t1 - t0) * 1000, t0, "linear", fill);
  }
  function cue(s, fn) { if (RENDER) pending.push({ s: s, fn: fn }); else timers.push(setTimeout(fn, wait(s))); }
  function clearAll(finish) {
    live.forEach(function (a) { try { finish ? a.finish() : a.cancel(); } catch (e) { a.cancel(); } });
    live = []; timers.forEach(clearTimeout); timers = [];
  }
  function show(id) {
    ["gate", "film", "studio", "title", "creator", "loading", "game", "pause"].forEach(function (k) { el[k].classList.toggle("on", k === id || (id === "pause" && k === base)); });
  }
  function horizonY() {   // where the horizon lands on screen: live shader, or the cover-fitted film
    if (!filmed) return S.horizonY();
    var W = innerWidth, H = innerHeight, va = 16 / 9;
    return H / 2 + (0.57 - 0.5) * Math.max(H, W / va);
  }
  function fitBars() {   // live bars match the ones baked into the cover-fitted film
    if (!filmed) return;
    var W = innerWidth, H = innerHeight, dispH = Math.max(H, W * 9 / 16);
    el.title.style.setProperty("--bar", Math.max(0, 0.11 * dispH - (dispH - H) / 2) + "px");
  }
  function placeLogo() {   // the logo's waterline sits exactly on the horizon
    fitBars();
    el.wrap.style.top = (horizonY() - (el.lt.offsetTop + el.line.offsetTop + 1)) + "px";
  }

  /* ---- 1 · Cloak Studios ---- */
  function slate() {
    var c = C, apex = c.impact + 0.31;
    play(el.grid, [{ opacity: 0 }, { opacity: 1 }], 1200, c.grid, E.out);

    // falls asleep-eyed, stretched by speed; squash, one smaller bounce, settle
    track(el.orb, [
      { t: c.fall, transform: "translateY(-115vh) scale(.92,1.12)", easing: E.fall },
      { t: c.impact, transform: "translateY(0) scale(.9,1.15)", easing: "ease-out" },
      { t: c.impact + 0.06, transform: "translateY(0) scale(1.28,.74)", easing: E.lift },
      { t: apex - 0.08, transform: "translateY(-21%) scale(.97,1.04)", easing: "cubic-bezier(.33,0,.67,1)" },
      { t: apex, transform: "translateY(-23%) scale(1,1)", easing: "cubic-bezier(.5,0,1,.6)" },
      { t: c.rebound, transform: "translateY(0) scale(.98,1.03)", easing: "ease-out" },
      { t: c.rebound + 0.05, transform: "translateY(0) scale(1.1,.9)", easing: E.out },
      { t: c.rebound + 0.18, transform: "translateY(0) scale(.97,1.03)", easing: "ease-in-out" },
      { t: c.rebound + 0.32, transform: "translateY(0) scale(1,1)" }
    ]);
    track(el.shadow, [
      { t: c.fall, transform: "scaleX(.2)", opacity: 0, easing: "ease-in" },
      { t: c.impact, transform: "scaleX(1)", opacity: 0.16, easing: E.lift },
      { t: c.impact + 0.06, transform: "scaleX(1.3)", opacity: 0.2, easing: "ease-out" },
      { t: apex, transform: "scaleX(.78)", opacity: 0.08, easing: "ease-in" },
      { t: c.rebound + 0.05, transform: "scaleX(1.12)", opacity: 0.17, easing: E.out },
      { t: c.rebound + 0.32, transform: "scaleX(1)", opacity: 0.14 }
    ]);

    // the landing pushes the wordmark out from behind the orb; outer letters trail
    play(el.railL, [{ transform: "translateX(102%)" }, { transform: "translateX(0)" }], 1050, c.unfurl, E.out);
    play(el.railR, [{ transform: "translateX(-102%)" }, { transform: "translateX(0)" }], 1050, c.unfurl, E.out);
    var bl = $$("b", el.railL), br = $$("b", el.railR);
    [[bl[0], 30, 1250], [bl[1], 10, 1150], [br[0], -10, 1150], [br[1], -30, 1250]].forEach(function (x) {
      play(x[0], [{ transform: "translateX(" + x[1] + "%)" }, { transform: "none" }], x[2], c.unfurl + 0.02, E.out);
    });

    // wakes up, looks around, blinks
    play(el.lids, [{ transform: "scaleY(.12)" }, { transform: "scaleY(1.12)", offset: 0.6 }, { transform: "scaleY(1)" }], 240, c.eyesOpen, E.out);
    play(el.look, [{ transform: "translate(0,0)" }, { transform: "translate(-2.4px,.4px)" }], 140, c.lookL, E.out);
    play(el.look, [{ transform: "translate(-2.4px,.4px)" }, { transform: "translate(2.4px,.4px)" }], 190, c.lookR, E.io, "forwards");
    play(el.look, [{ transform: "translate(2.4px,.4px)" }, { transform: "translate(0,0)" }], 150, c.lookC, E.out, "forwards");
    blink(c.blink1, 200); blink(c.blink2, 160);
    play(el.sub, [{ opacity: 0, letterSpacing: "1.15em", paddingLeft: "1.15em" }, { opacity: 0.9, letterSpacing: ".62em", paddingLeft: ".62em" }], 1300, c.studios, E.out);

    // exit: eyes shut, wind up, the orb swells over the whole frame
    play(el.lids, [{ transform: "scaleY(1)" }, { transform: "scaleY(.12)" }], 90, c.eyesClose, E.in, "forwards");
    play(el.orb, [{ transform: "scale(1,1)" }, { transform: "scale(1.07,.9)" }], 140, c.windup, E.out, "forwards");
    play(el.railL, [{ transform: "translateX(0)" }, { transform: "translateX(-6%)" }], 560, c.iris, E.in, "forwards");
    play(el.railR, [{ transform: "translateX(0)" }, { transform: "translateX(6%)" }], 560, c.iris, E.in, "forwards");
    play(el.sub, [{ opacity: 0.9 }, { opacity: 0 }], 260, c.iris, E.in, "forwards");
    cue(c.iris, irisOut);
  }
  function blink(s, ms) {
    play(el.lids, [{ transform: "scaleY(1)" }, { transform: "scaleY(.1)", offset: 0.35 }, { transform: "scaleY(.1)", offset: 0.5 }, { transform: "scaleY(1)" }], ms, s, "ease-in-out", "forwards");
  }
  function irisOut() {
    var r = el.orb.parentNode.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    IR.x = r.left + r.width / 2; IR.y = r.top + r.height / 2; IR.d = r.width * 0.92;
    IR.D = 2 * Math.hypot(Math.max(IR.x, W - IR.x), Math.max(IR.y, H - IR.y)) + 80;
    var st = el.iris.style;
    st.left = IR.x + "px"; st.top = IR.y + "px"; st.width = st.height = IR.d + "px";
    st.borderWidth = (r.width * 3.6 / 40) + "px"; st.display = "block";
    el.orb.style.visibility = "hidden";
    play(el.iris, [{ width: IR.d + "px", height: IR.d + "px" }, { width: IR.D + "px", height: IR.D + "px" }], (C.cover - C.iris) * 1000, C.iris, "cubic-bezier(.7,0,.25,1)", "forwards");
    S.start(); S.exposure(0.5, 0);
  }

  /* ---- match cut: the orb becomes the sun ---- */
  function matchCut() {
    show("title"); placeLogo();
    S.exposure(1, 2600);
    var s = S.sunRect();
    play(el.iris, [
      { left: IR.x + "px", top: IR.y + "px", width: IR.D + "px", height: IR.D + "px", backgroundColor: "#D44D2A", borderColor: "rgba(10,10,10,1)", opacity: 1 },
      { borderColor: "rgba(10,10,10,0)", offset: 0.08 },
      { opacity: 1, offset: 0.6 },
      { left: s.x + "px", top: s.y + "px", width: s.r * 2 + "px", height: s.r * 2 + "px", backgroundColor: "#FFD6A2", borderColor: "rgba(10,10,10,0)", opacity: 0 }
    ], (C.sunLand - C.cover) * 1000, C.cover, E.out, "forwards");
    cue(C.sunLand + 0.05, function () { el.iris.style.display = "none"; });
  }

  /* ---- 2 · Lowtide ---- */
  function titleSeq() {
    play(el.barT, [{ transform: "translateY(-100%)" }, { transform: "translateY(0)" }], 900, C.bars, E.out);
    play(el.barB, [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], 900, C.bars, E.out);
    play(el.credit, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 0.86, transform: "none" }], 1000, C.credit, E.out);
    play(el.credit, [{ opacity: 0.86 }, { opacity: 0 }], 700, C.creditOut, E.in, "forwards");
    logoRise(C.hit, 1300);
    play(el.sea, [{ transform: "scale(1.045)" }, { transform: "scale(1)" }], 1500, C.hit, E.out, "forwards");
    cue(C.hit, function () { S.flash(); state = "title"; });
    tagIn(C.tagline, 1600);
    pressIn(C.press);
  }
  // letters rise out of the water with a little buoyant overshoot; the
  // submerged and reflected copies move with them
  function logoRise(s, ms) {
    for (var i = 0; i < layers[0].length; i++) layers.forEach(function (g) {
      play(g[i], [{ transform: "translateY(96%)" }, { transform: "translateY(-3.5%)", offset: 0.7 }, { transform: "translateY(0)" }], ms, s + i * 0.05, E.out);
    });
    play(el.line, [{ transform: "scaleX(0)", opacity: 0 }, { transform: "scaleX(1)", opacity: 1 }], ms * 0.9, s - 0.04, E.out);
    play(el.below, [{ opacity: 0 }, { opacity: 1 }], ms * 0.5, s, E.out);   // nothing shows under the water before the rise
  }
  function tagIn(s, ms) {
    var ls = getComputedStyle(el.tag).letterSpacing;
    play(el.tag, [{ opacity: 0, letterSpacing: "calc(" + ls + " + .5em)", paddingLeft: "calc(" + ls + " + .5em)" }, { opacity: 0.82, letterSpacing: ls, paddingLeft: ls }], ms, s, E.out);
  }
  function pressIn(s) {
    var a = play(el.press, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], 800, s, E.out);
    a.finished.then(function () { a.cancel(); el.press.classList.add("breathe"); }).catch(function () {});
  }

  /* ---- gate → intro ---- */
  function beginLive() {   // fallback when the film can't load: run the whole intro live
    state = "intro";
    var ctx = LT.init(), lead = 0.15, lat = ctx.outputLatency || ctx.baseLatency || 0.01;
    T0 = clock() + (lead + lat) * 1000;
    if (RM) return reduced(ctx.currentTime + lead);
    LT.cue.intro(ctx.currentTime + lead);
    show("studio");
    slate(); titleSeq();
    cue(C.cover, matchCut);
  }
  function reduced(Ta) {
    show("studio"); LT.sfx.sting(Ta);
    cue(2.6, function () { LT.cue.skip(); toTitle(); });
  }
  function toTitle() {
    show("title"); placeLogo(); S.start(); S.exposure(1, 0); state = "title";
  }


  /* ---- the film: pre-rendered slate + opening ocean, baked soundtrack ---- */
  var V = { film: $("#film"), intro: $("#introVid"), bg: $("#bgv") }, FILM = { T: 0, armed: false, ok: false };
  var MEDIA = "media/";   // desktop only: one 1920x1080 film
  var ready = Promise.resolve(false);
  function prepMedia() {
    V.intro.src = MEDIA + "intro.mp4"; V.bg.src = MEDIA + "ocean.mp4";
    V.intro.load(); V.bg.load();
    LT.init();   // created suspended; resumed by the key press
    var aud = LT.loadBaked({ intro: MEDIA + "intro.flac", loop: MEDIA + "theme.mp3?v=dev" });
    // the loading screen's song and art: fetched behind the intro, never holding it up
    aud.then(function () { preloadSlides(); return LT.loadBaked({ song: MEDIA + "loading.mp3?v=dev" }); })
      .then(function () { if (LT.song.wanted) LT.song.play(1); }).catch(function (e) { console.warn("Lowtide: loading song", e); });
    var vid = new Promise(function (res, rej) {
      if (V.intro.readyState >= 3) return res();
      V.intro.addEventListener("canplaythrough", res, { once: true });
      V.intro.addEventListener("error", rej, { once: true });
    });
    var timeout = new Promise(function (res, rej) { setTimeout(function () { rej(new Error("media timeout")); }, 15000); });
    ready = Promise.race([Promise.all([aud, vid]), timeout]).then(function () { return true; }, function (e) { console.warn("Lowtide film unavailable, running live:", e); return false; });
    el.gateBtn.textContent = "Loading";
    ready.then(function () { el.gateBtn.textContent = "Press any key"; });
  }
  // Lowtide is a desktop experience: keyboard, a wide screen, a real pointer
  function desktop() { return innerWidth >= 900 && !(matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches); }
  /* full screen on the first key (it needs a key or click to be allowed). In Chrome the keyboard is
     locked too, so Esc reaches the game (the pause menu) instead of leaving full screen: holding Esc still leaves */
  function fullscreen() {
    var d = document.documentElement;
    if (document.fullscreenElement || !d.requestFullscreen) return;
    var p = d.requestFullscreen({ navigationUI: "hide" });
    if (p && p.then) p.then(function () { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(["Escape"]).catch(function () {}); }).catch(function () {});
  }
  function begin() {
    if (state !== "gate") return;
    fullscreen();
    state = "loading";
    LT.init();   // resume audio inside the gesture
    ready.then(function (ok) {
      if (!ok) return beginLive();
      FILM.ok = true;
      if (RM) { LT.startTitle(); return toTitleFromFilm(); }
      playFilm();
    });
  }
  function lat() { var c = LT.ctx; return c.outputLatency || c.baseLatency || 0.01; }
  function playFilm() {
    state = "intro"; show("film");
    var v = V.intro; v.currentTime = 0;
    v.addEventListener("playing", function go() {
      v.removeEventListener("playing", go);
      var n = LT.ctx.currentTime, L = lat();
      FILM.T = n - v.currentTime - L;              // audio-clock time of film frame 0
      LT.playIntro(n, v.currentTime + L);          // buffer time p is heard when the film shows p
      requestAnimationFrame(filmTick);
      T0 = clock();
    });
    var p = v.play(); if (p && p.catch) p.catch(function () { beginLive(); });
  }
  // keep the picture slaved to the audio clock; arm the drop just ahead of time
  function filmTick() {
    if (state !== "intro") return;
    var v = V.intro, want = LT.ctx.currentTime - lat() - FILM.T;
    if (!FILM.armed && want >= C.hit - 0.3) { FILM.armed = true; LT.startTitle(FILM.T + C.hit + lat()); }
    if (want >= C.hit - 0.008 || v.ended) return toTitleFromFilm();
    var d = want - v.currentTime;
    if (Math.abs(d) > 0.12) v.currentTime = want; else v.playbackRate = 1 + Math.max(-0.05, Math.min(0.05, d));
    requestAnimationFrame(filmTick);
  }
  // the drop: the cut to the live title is hidden under a flash and a camera punch
  function toTitleFromFilm() {
    state = "title-in"; clearAll(false);
    filmed = true; el.title.classList.add("filmed");
    V.bg.currentTime = 0; var p = V.bg.play(); if (p && p.catch) p.catch(function () {});
    T0 = clock();
    show("title"); placeLogo();
    V.intro.pause();
    play(el.flash, [{ opacity: 0.55 }, { opacity: 0 }], 900, 0, E.out, "forwards");
    play(V.bg, [{ transform: "scale(1.045)" }, { transform: "scale(1)" }], 1500, 0, E.out, "forwards");
    logoRise(0, 1300); tagIn(1.3, 1600); pressIn(2.6);
    cue(0.05, function () { state = "title"; });
  }

  /* ---- Story Mode: load the city on demand ---- */
  var GAME = null, base = "title";
  var TIPS = [
    "Hold Shift to sprint. Let go before the corner, not after.",
    "The causeway patrol changes at midnight. So do the rules.",
    "Port Salt runs on containers and nobody asks what's in them.",
    "Tideline Avenue looks best from the pier. Most things do.",
    "Press Esc for the map. Marlowe Keys is smaller than it acts."
  ];
  /* ---- the loading screen: the cast, pre-rendered in two layers (tools/loading) ---- */
  var LD = [
    { id: "hollis", name: "Hollis Vane", role: "Former Marlowe bar pilot", line: "I'm not a criminal. I'm between licenses." },
    { id: "dez", name: "Dez Ruelas", role: "Ruelas Bait & Ice, Tideline Pier", line: "Take this. It's for showing people." },
    { id: "ashby", name: "Calvin and June Ashby", role: "Ashby Tidewater", line: "Port Salt gave this city its name. We're going to give it a future." },
    { id: "odette", name: "Det. Odette Pruitt", role: "Marine Recovery, Marlowe Keys Public Safety", line: "Bring me something that floats." },
    { id: "docks", name: "Bernie Szabo and Wade Purcell", role: "Longshore Hall · Purcell Salvage & Tow", line: "I lift what comes. I don't read labels." },
    { id: "seagrape", name: "Rafi Castellan and Lionel Pike", role: "Ashby Tidewater · The Seagrape Motor Inn", line: "I'll be honest with you, which I don't usually do." },
    { id: "showdown", name: "Hollis Vane", role: "Port Salt", line: "I say yes. It's a problem." }
  ];
  var ldImg = {}, SHOW = { t: 0, i: -1, order: [] };
  function preloadSlides() {
    LD.forEach(function (s) {
      [["bg", ".jpg"], ["fg", ".webp"]].forEach(function (l) { var im = new Image(); im.alt = ""; im.decoding = "async"; im.src = MEDIA + "loading/" + s.id + "-" + l[0] + l[1] + "?v=dev"; ldImg[s.id + l[0]] = im; });
    });
  }
  function slideStart() {
    var rest = LD.map(function (_, i) { return i; }).slice(1);
    for (var i = rest.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, x = rest[i]; rest[i] = rest[j]; rest[j] = x; }
    SHOW.order = [0].concat(rest); SHOW.i = -1; $(".ld-slides").innerHTML = "";
    nextSlide(); SHOW.t = setInterval(nextSlide, 7000);
  }
  function nextSlide() {
    SHOW.i = (SHOW.i + 1) % SHOW.order.length;
    var s = LD[SHOW.order[SHOW.i]], box = $(".ld-slides"), d = document.createElement("div"), dir = SHOW.i % 2 ? 1 : -1;
    d.className = "ld-slide";
    var bg = ldImg[s.id + "bg"].cloneNode(), fg = ldImg[s.id + "fg"].cloneNode(); d.appendChild(bg); d.appendChild(fg); box.appendChild(d);
    if (!RM) {   // parallax: the cast drifts further than the city behind them
      bg.animate([{ transform: "translateX(" + (-1.1 * dir) + "%) scale(1.02)" }, { transform: "translateX(" + (1.1 * dir) + "%) scale(1.05)" }], { duration: 9000, easing: "linear", fill: "both" });
      fg.animate([{ transform: "translateX(" + (-2.8 * dir) + "%) scale(1.03)" }, { transform: "translateX(" + (2.8 * dir) + "%) scale(1.08)" }], { duration: 9000, easing: "linear", fill: "both" });
    }
    d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: RM ? 300 : 1100, easing: "ease-out", fill: "forwards" });
    var old = box.children.length > 1 ? box.children[0] : null; if (old) setTimeout(function () { old.remove(); }, 1300);
    var cap = $(".ld-cap");
    $(".ld-name").textContent = s.name; $(".ld-role").textContent = s.role; $(".ld-line").textContent = s.line;
    cap.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 700, delay: 250, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" });
  }
  function slideStop() { clearInterval(SHOW.t); }

  /* ---- the character creator ---- */
  var character = null;
  function savedChar() { try { var s = localStorage.getItem("lowtide_character"); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function openCreatorScene(thenGame) {
    state = "creator"; LT.ui.select(); LT.bed(0.45, 0.6);
    show("creator"); play(el.creator, [{ opacity: 0 }, { opacity: 1 }], 500, cueNow(), E.out);
    import(new URL("game/creator.js?v=dev", document.baseURI).href).then(function (m) {
      return m.openCreator({ root: el.creator, sfx: function (k) { if (LT.ui[k]) LT.ui[k](); } });
    }).then(function (p) {
      LT.bed(1, 0.6);
      if (p) character = p;
      if (p && thenGame) { state = "title"; return startGame(true); }
      show("title"); state = "menu"; setSel(sel, true);
    }).catch(function (e) {
      console.error(e); $(".cc-rows").innerHTML = '<p class="cc-wait">The creator did not load. Press Esc.</p>';
      var back = function (ev) { if (ev.key === "Escape") { removeEventListener("keydown", back); show("title"); state = "menu"; } };
      addEventListener("keydown", back);
    });
  }
  function startGame(fromCreator) {
    if (GAME) { base = "game"; show("game"); state = "game"; GAME.resume(); clickToPlay(true); return; }
    character = character || savedChar();
    if (!character && !fromCreator) return openCreatorScene(true);   // first time: make Hollis yours
    state = "loading-game"; LT.ui.select(); LT.bed(0, 0.5); LT.song.play(1.2);
    if (!ldImg.hollisbg) preloadSlides();
    slideStart();
    var tip = $(".ld-tip"), bar = $(".ld-bar i"), k = 0;
    tip.textContent = TIPS[(Math.random() * TIPS.length) | 0];
    var tipT = setInterval(function () { tip.textContent = TIPS[(++k + (Math.random() * 3 | 0)) % TIPS.length]; }, 4200);
    play(el.loading, [{ opacity: 0 }, { opacity: 1 }], 600, cueNow(), E.out);
    show("loading");
    // the screen stays up 15 to 25 s whatever the real load takes; the bar follows the slower of the two
    var t0 = performance.now(), hold = 15000 + Math.random() * 10000, real = 0;
    var barT = setInterval(function () { bar.style.transform = "scaleX(" + Math.min(real, (performance.now() - t0) / hold) + ")"; }, 200);
    import(new URL("game/main.js?v=dev", document.baseURI).href).then(function (m) {
      return m.start({
        mount: $("#gl"), hud: $("#game .hud"),
        progress: function (p) { real = p; },
        sfx: LT.sfx, onLock: onLock, character: character
      });
    }).then(function (g) {
      GAME = g;
      real = 1;
      return new Promise(function (r) { setTimeout(r, Math.max(0, hold - (performance.now() - t0))); });
    }).then(function () {
      clearInterval(tipT); clearInterval(barT); slideStop(); LT.song.stop(2.4);
      base = "game"; state = "game"; V.bg.pause();
      show("game"); play(el.game, [{ opacity: 0 }, { opacity: 1 }], 900, cueNow(), E.out);
      LT.amb.start(LT.now(), 0.3);
      clickToPlay(true);
    }).catch(function (e) {
      clearInterval(tipT); clearInterval(barT); slideStop(); console.error(e);
      tip.textContent = "Marlowe Keys didn't load. Refresh to try again.";
    });
  }
  function clickToPlay(on) { $(".clickplay").classList.toggle("on", on); }
  function onLock(locked) {
    if (locked) { clickToPlay(false); return; }
    if (state === "game") openPause(0);   // Esc releases the mouse: that's the pause button
  }
  $(".clickplay").addEventListener("click", function (e) { e.stopPropagation(); fullscreen(); if (GAME) GAME.lock(); });
  $("#gl").addEventListener("click", function () { if (GAME && state === "game") GAME.lock(); });

  /* ---- main menu ---- */
  function menuLogo(ms) {
    if (logoAnim) logoAnim.cancel();
    var r = el.lt.getBoundingClientRect(), g = Math.min(56, Math.max(16, innerWidth * 0.04));
    var sc = Math.min(300, innerWidth * 0.42) / r.width;
    logoAnim = el.lt.animate([{ transform: "none" }, { transform: "translate(" + (g - r.left) + "px," + (38 - r.top) + "px) scale(" + sc + ")" }],
      { duration: RM ? 1 : ms, easing: E.io, fill: "forwards" });
  }
  function openMenu(instant) {
    if (state !== "title") return;
    state = "menu";
    clearAll(true);
    el.press.classList.remove("breathe");
    var k = instant ? 0.001 : 1, s0 = cueNow();
    if (!instant) { LT.ui.select(); LT.sfx.whoosh(LT.now(), 0.7, -0.5, 0.3); }
    el.title.classList.add("menu");
    play(el.barT, [{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], 650 * k, s0, E.io, "forwards");
    play(el.barB, [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], 650 * k, s0, E.io, "forwards");
    play(el.tag, [{ opacity: 0.82 }, { opacity: 0 }], 240 * k, s0, E.in, "forwards");
    play(el.below, [{ opacity: 1 }, { opacity: 0 }], 360 * k, s0, E.in, "forwards");
    play(el.refl, [{ opacity: 0.36 }, { opacity: 0 }], 360 * k, s0, E.in, "forwards");
    menuLogo(820 * k);
    play(el.scrim, [{ opacity: 0 }, { opacity: 1 }], 700 * k, s0 + 0.1 * k, E.out, "forwards");
    items.forEach(function (li, i) {
      play(li, [{ opacity: 0, transform: "translateX(-32px)" }, { opacity: 1, transform: "none" }], 640 * k, s0 + (0.3 + i * 0.06) * k, E.out);
    });
    play(el.foot, [{ opacity: 0 }, { opacity: 1 }], 600 * k, s0 + 0.55 * k, E.out);
    play(el.selBar, [{ opacity: 0 }, { opacity: 1 }], 300 * k, s0 + 0.55 * k, E.out);
    setSel(0, true);
  }
  function setSel(i, quiet) {
    sel = (i + items.length) % items.length;
    items.forEach(function (li, k) { li.classList.toggle("sel", k === sel); });
    var li = items[sel], h = li.offsetHeight;
    el.selBar.style.transform = "translateY(" + (li.offsetTop + h * 0.22) + "px) scaleY(" + (h * 0.56) + ")";
    if (!quiet) LT.ui.move();
  }
  function choose() {
    var li = items[sel];
    play(li.firstElementChild, [{ transform: "translateX(18px) scale(1)" }, { transform: "translateX(18px) scale(.965)", offset: 0.35 }, { transform: "translateX(18px) scale(1)" }], 240, cueNow(), E.out, "none");
    if (li.dataset.go === "game") startGame();
    else if (li.dataset.go === "creator") openCreatorScene(false);
    else if (li.dataset.go === "pause") openPause(+(li.dataset.tab || 0)); else LT.ui.tab();
  }

  /* ---- pause ---- */
  var pauseT = 0;
  function openPause(t) {
    if (state === "pause") { setTab(t); return; }
    if (base === "game" && GAME && GAME.traveling) return;
    state = "pause"; show("pause"); LT.ui.select(); LT.pause(true);
    el.pause.classList.toggle("ingame", base === "game");
    if (base === "game") GAME.pause();
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    var s0 = cueNow();
    play(el.pause, [{ opacity: 0 }, { opacity: 1 }], 280, s0, E.out);
    play(el.ptop, [{ opacity: 0, transform: "translateY(-16px)" }, { opacity: 1, transform: "none" }], 520, s0 + 0.04, E.out);
    play(el.pbody, [{ opacity: 0, transform: "translateY(22px)" }, { opacity: 1, transform: "none" }], 580, s0 + 0.12, E.out);
    MV.pick = null; MV.hover = null; MV.zoom = 1; MV.cx = MV.cz = null;
    tab = t; refresh(); setTab(t, true, true);
    clearInterval(pauseT); pauseT = setInterval(function () { if (state === "pause") { header(); if (tab === 0) ftInfo(); } }, 500);
  }
  // after: what happens once the menu is gone (default: back to the game, click to play)
  function closePause(after) {
    var toGame = base === "game";
    clearInterval(pauseT);
    state = toGame ? "game" : "menu"; if (!after) LT.ui.back(); LT.pause(false);
    var a = play(el.pause, [{ opacity: 1 }, { opacity: 0 }], 200, cueNow(), E.in, "forwards");
    a.finished.then(function () { show(base); if (toGame) { if (after) after(); else { GAME.resume(); clickToPlay(true); } } }).catch(function () {});
  }
  function setTab(i, quiet, instant) {
    var dir = i === tab ? 0 : (i > tab ? 1 : -1);
    tab = (i + tabs.length) % tabs.length;
    tabs.forEach(function (b, k) { b.classList.toggle("sel", k === tab); });
    panels.forEach(function (p, k) { p.classList.toggle("on", k === tab); });
    var b = tabs[tab];
    if (instant) el.ink.style.transition = "none";
    el.ink.style.transform = "translateX(" + b.offsetLeft + "px) scaleX(" + b.offsetWidth + ")";
    if (instant) { void el.ink.offsetWidth; el.ink.style.transition = ""; }
    if (dir) play(panels[tab], [{ opacity: 0, transform: "translateX(" + dir * 28 + "px)" }, { opacity: 1, transform: "none" }], 360, cueNow(), E.out, "none");
    if (!quiet) LT.ui.tab();
    refresh();
  }
  function ingame() { return base === "game" && GAME; }
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function header() {
    if (!ingame()) return; var h = GAME.header();
    $(".p-area").textContent = h.area; $(".p-clock").textContent = h.clock; $(".p-cash").textContent = h.cash;
  }
  function refresh() {
    header();
    if (tab === 0) mapDraw();
    else if (tab === 1) renderBrief();
    else if (tab === 2) renderStats();
    else if (tab === 3) renderSettings();
    else if (tab === 4) renderGame();
  }

  /* map + fast travel: click to set a point (it snaps to the nearest street if you pick a roof), wheel to zoom, drag to pan */
  var MV = { zoom: 1, cx: null, cz: null, pick: null, hover: null, T: null }, drag = null, pmap = $(".pmap");
  var ft = { where: $(".ft-where"), note: $(".ft-note"), go: $(".ft-go"), cool: $(".ft-cool") };
  function mapDraw() { if (!ingame()) return; MV.T = GAME.drawMap(pmap.getContext("2d"), pmap.width, pmap.height, MV); ftInfo(); }
  function ftInfo() {
    if (!ingame()) return;
    var p = MV.pick, why = GAME.travelBlock();
    ft.where.textContent = p ? (p.ok ? p.name : "Can't land there") : "Pick a spot";
    ft.note.textContent = p ? (p.ok ? (p.snapped ? "The nearest street to your pick" : p.kind) + ", " + Math.round(p.dist) + " m from you." : p.reason) : "Click a street or open ground on the map. Never inside a building.";
    ft.go.disabled = !(p && p.ok) || !!why;
    ft.cool.textContent = why || "Fast travel ready"; ft.cool.classList.toggle("wait", !!why);
  }
  function evPos(e) { var r = pmap.getBoundingClientRect(); return [(e.clientX - r.left) * pmap.width / r.width, (e.clientY - r.top) * pmap.height / r.height]; }
  pmap.addEventListener("mousedown", function (e) { if (!MV.T) return; var p = evPos(e); drag = { x: p[0], y: p[1], cx: MV.T.cx, cz: MV.T.cz, moved: false }; });
  addEventListener("mousemove", function (e) {
    if (state !== "pause" || tab !== 0 || !MV.T) return;
    var p = evPos(e);
    if (drag) {
      if (Math.abs(p[0] - drag.x) + Math.abs(p[1] - drag.y) > 6) { drag.moved = true; pmap.classList.add("drag"); }
      if (drag.moved) { MV.cx = drag.cx - (p[0] - drag.x) / MV.T.scale; MV.cz = drag.cz - (p[1] - drag.y) / MV.T.scale; }
    }
    MV.hover = e.target === pmap ? MV.T.toWorld(p[0], p[1]) : null; mapDraw();
  });
  addEventListener("mouseup", function (e) {
    if (!drag) return; var d = drag; drag = null; pmap.classList.remove("drag");
    if (d.moved || e.target !== pmap || state !== "pause" || !ingame()) return;
    var p = evPos(e), w = MV.T.toWorld(p[0], p[1]);
    MV.pick = GAME.travelCheck(w.x, w.z); if (MV.pick.ok) LT.ui.move(); else LT.sfx.dry && LT.sfx.dry(); mapDraw();
  });
  pmap.addEventListener("dblclick", function () { travelGo(); });
  pmap.addEventListener("wheel", function (e) {
    if (!MV.T) return; e.preventDefault();
    var p = evPos(e), w = MV.T.toWorld(p[0], p[1]), z = Math.max(1, Math.min(6, MV.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))), sc = MV.T.base * z;
    MV.cx = w.x - (p[0] - pmap.width / 2) / sc; MV.cz = w.z - (p[1] - pmap.height / 2) / sc; MV.zoom = z; mapDraw();
  }, { passive: false });
  ft.go.addEventListener("click", function () { travelGo(); });
  function travelGo() {
    if (!ingame() || ft.go.disabled) { LT.ui.back(); return; }
    var spot = MV.pick; MV.pick = null; LT.ui.select();
    closePause(function () { if (!GAME.fastTravel(spot, function () { clickToPlay(true); })) { GAME.resume(); clickToPlay(true); } });
  }

  /* brief: everything said around you and every tip, newest first */
  function renderBrief() {
    var ol = $(".brief .log"), L = ingame() ? GAME.brief() : [];
    ol.innerHTML = L.length ? L.map(function (b) { return '<li class="' + b.kind + '"><time>' + esc(b.at) + "</time><span>" + esc(b.text) + "</span></li>"; }).join("")
      : '<li class="empty">' + (ingame() ? "Nothing yet. What people say and the tips you get land here." : "Start Story Mode and what people say lands here.") + "</li>";
  }
  function renderStats() {
    var box = $(".stats"), L = ingame() ? GAME.stats() : [];
    box.innerHTML = L.length ? L.map(function (r) { return "<div><b>" + esc(r[1]) + "</b><span>" + esc(r[0]) + "</span></div>"; }).join("") : '<div class="wide"><span>Start Story Mode to keep stats.</span></div>';
  }

  /* settings: everything here is live and saved */
  var SROWS = [
    { k: "master", label: "Master volume", min: 0, max: 100, step: 10, bar: true },
    { k: "music", label: "Music", min: 0, max: 100, step: 10, bar: true },
    { k: "sfx", label: "Sound effects", min: 0, max: 100, step: 10, bar: true },
    { k: "voices", label: "Voices", min: 0, max: 100, step: 10, bar: true },
    { k: "sens", label: "Mouse sensitivity", min: 20, max: 300, step: 10, fmt: function (v) { return (v / 100).toFixed(1) + "x"; } },
    { k: "invert", label: "Invert look", bool: true },
    { k: "fov", label: "Field of view", min: 55, max: 95, step: 5, fmt: function (v) { return v + "°"; } },
    { k: "shake", label: "Camera shake", bool: true },
    { k: "subtitles", label: "Subtitles", bool: true },
    { k: "quality", label: "Graphics quality", choice: [["auto", "Auto"], ["high", "High"], ["low", "Low"]], note: "Auto switches to low if the game runs slow" },
    { k: "ps1", label: "PS1 look", bool: true, note: "Off: sharp and smooth. The wobble changes on the next load" },
    { k: "pixels", label: "Resolution", choice: [[200, "Crunchy, 200 lines"], [270, "Classic, 270 lines"], [360, "Sharp, 360 lines"], [480, "Clean, 480 lines"]], note: "Takes effect the next time the island loads" },
    { act: "tips", label: "Show tips again" },
    { act: "reset", label: "Restore defaults" }
  ], ssel = 0;
  function sval(r) {
    var v = LT_SET.get(r.k);
    if (r.bool) return v ? "On" : "Off";
    if (r.choice) { for (var i = 0; i < r.choice.length; i++) if (r.choice[i][0] === v) return r.choice[i][1]; return String(v); }
    if (r.bar) return '<span class="bar"><i style="width:' + v + '%"></i></span> ' + v;
    return r.fmt ? r.fmt(v) : String(v);
  }
  function renderSettings() {
    var ul = $(".settings");
    ul.innerHTML = SROWS.map(function (r, i) {
      var right = r.act ? "" : '<span class="sv"><button data-d="-1" aria-label="Less">‹</button><em>' + sval(r) + '</em><button data-d="1" aria-label="More">›</button></span>';
      return '<li data-i="' + i + '" class="' + (i === ssel ? "sel" : "") + (r.act ? " act" : "") + '"><div>' + r.label + (r.note ? "<small>" + r.note + "</small>" : "") + "</div>" + right + "</li>";
    }).join("");
    var cur = ul.querySelector("li.sel"); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }
  function sChange(i, d) {
    var r = SROWS[i]; if (!r) return;
    if (r.act === "tips") { try { localStorage.removeItem("lowtide_tips"); } catch (e) { /* */ } LT.ui.select(); r.label = "Tips will show again"; renderSettings(); return; }
    if (r.act === "reset") { LT_SET.reset(); LT.ui.select(); renderSettings(); return; }
    var v = LT_SET.get(r.k);
    if (r.bool) v = !v;
    else if (r.choice) { var k = 0; r.choice.forEach(function (c, j) { if (c[0] === v) k = j; }); v = r.choice[(k + (d || 1) + r.choice.length) % r.choice.length][0]; }
    else v = Math.max(r.min, Math.min(r.max, v + (d || 1) * r.step));
    LT_SET.set(r.k, v); LT.ui.move(); renderSettings();
  }
  $(".settings").addEventListener("click", function (e) {
    var li = e.target.closest("li"); if (!li) return; ssel = +li.dataset.i;
    var b = e.target.closest("button"); var r = SROWS[ssel];
    if (b) sChange(ssel, +b.dataset.d); else if (r.bool || r.act || r.choice) sChange(ssel, 1); else renderSettings();
  });
  function settingsKey(k) {
    if (k === "ArrowDown" || k === "s" || k === "S") { ssel = (ssel + 1) % SROWS.length; LT.ui.move(); renderSettings(); }
    else if (k === "ArrowUp" || k === "w" || k === "W") { ssel = (ssel - 1 + SROWS.length) % SROWS.length; LT.ui.move(); renderSettings(); }
    else if (k === "ArrowRight" || k === "d" || k === "D") sChange(ssel, 1);
    else if (k === "ArrowLeft" || k === "a" || k === "A") sChange(ssel, -1);
    else if (k === "Enter" || k === " ") sChange(ssel, 1);
  }

  /* game: resume, the map, back to the title */
  var gsel = 0;
  function gacts() {
    return ingame() ? [
      { label: "Resume", sub: "Back to Marlowe Keys", go: function () { closePause(); } },
      { label: "Map and fast travel", sub: GAME.travelBlock() || "Ready", go: function () { setTab(0); } },
      { label: "Quit to title", sub: "Unsaved progress on the island is lost", go: function () { location.href = location.pathname + "?scene=menu"; } }
    ] : [{ label: "Back", sub: "To the main menu", go: function () { closePause(); } }];
  }
  function renderGame() {
    var A = gacts(); gsel = Math.min(gsel, A.length - 1);
    $(".g-acts").innerHTML = A.map(function (a, i) { return '<li data-i="' + i + '" class="' + (i === gsel ? "sel" : "") + '">' + a.label + "<small>" + esc(a.sub) + "</small></li>"; }).join("");
  }
  $(".g-acts").addEventListener("click", function (e) { var li = e.target.closest("li"); if (!li) return; gsel = +li.dataset.i; LT.ui.select(); gacts()[gsel].go(); });
  function gameKey(k) {
    var A = gacts();
    if (k === "ArrowDown" || k === "s" || k === "S") { gsel = (gsel + 1) % A.length; LT.ui.move(); renderGame(); }
    else if (k === "ArrowUp" || k === "w" || k === "W") { gsel = (gsel - 1 + A.length) % A.length; LT.ui.move(); renderGame(); }
    else if (k === "Enter" || k === " ") { LT.ui.select(); A[gsel].go(); }
  }

  /* ---- input ---- */
  document.addEventListener("keydown", function (e) {
    var k = e.key;
    if (state !== "gate" && !document.fullscreenElement && !fullscreen.tried) { fullscreen.tried = true; fullscreen(); }
    if (state === "gate") { if (!e.repeat) begin(); return; }
    if (state === "title") { if (k === "Enter" || k === " ") openMenu(); return; }
    if (state === "menu") {
      if (k === "ArrowDown" || k === "s" || k === "S") { e.preventDefault(); setSel(sel + 1); }
      else if (k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); setSel(sel - 1); }
      else if (k === "Enter" || k === " ") choose();
      return;
    }
    if (state === "game") {
      if (k === "Escape") openPause(0);
      else if ((k === "m" || k === "M") && !e.repeat && GAME && !GAME.traveling) openPause(0);   // the map
      return;
    }
    if (state === "creator" || state === "loading-game") return;
    if (state === "pause") {
      if (k === "e" || k === "E") setTab(tab + 1);
      else if (k === "q" || k === "Q") setTab(tab - 1);
      else if (k === "Escape" || k === "Backspace") closePause();
      else if (tab === 3) { e.preventDefault(); settingsKey(k); }
      else if (tab === 4 && k !== "ArrowRight" && k !== "ArrowLeft") { e.preventDefault(); gameKey(k); }
      else if (tab === 0 && k === "Enter") travelGo();
      else if (tab === 0 && (k === "m" || k === "M") && !e.repeat) closePause();
      else if (k === "ArrowRight") setTab(tab + 1);
      else if (k === "ArrowLeft") setTab(tab - 1);
    }
  });
  el.gate.addEventListener("click", begin);
  el.title.addEventListener("click", function () { if (state === "title") openMenu(); });
  items.forEach(function (li, k) {
    li.addEventListener("mouseenter", function () { if (state === "menu" && sel !== k) setSel(k); });
    li.addEventListener("click", function (e) { e.stopPropagation(); if (state === "menu") { setSel(k, true); choose(); } });
  });
  tabs.forEach(function (b, k) { b.addEventListener("click", function () { if (k !== tab) setTab(k); }); });
  function relayout() {
    placeLogo();
    if (state === "menu" || state === "pause") { menuLogo(1); setSel(sel, true); }
  }
  addEventListener("resize", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  // Render mode: tools/render-intro.js drives this frame by frame.
  if (RENDER) {
    document.documentElement.classList.add("render", "render-" + RENDER);
    VCLOCK = 0; T0 = 0; S.manual(clock, 0.03);
    window.__render = {
      ready: (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
        if (RENDER === "intro") { show("studio"); slate(); titleSeq(); cue(C.cover, matchCut); return { seconds: C.hit }; }
        show("title"); placeLogo(); S.start(); S.exposure(1, 0); return { seconds: 12 };
      }),
      frame: function (t) {
        for (;;) {   // fire cues in order, each at its own exact time
          pending.sort(function (a, b) { return a.s - b.s; });
          if (!pending.length || pending[0].s > t + 1e-6) break;
          var c = pending.shift(); VCLOCK = c.s * 1000; c.fn();
        }
        VCLOCK = t * 1000;
        document.getAnimations().forEach(function (a) {
          if (a.__born === undefined) { a.pause(); a.currentTime = t * 1000; }
          else a.currentTime = Math.max(0, (t - a.__born) * 1000);
        });
        S.renderAt();
      }
    };
    return;
  }

  // QA deep links: ?scene=title | menu | pause (no audio until a key is pressed)
  var q = new URLSearchParams(location.search).get("scene");
  if (q) {
    filmed = true; el.title.classList.add("filmed");
    V.bg.src = MEDIA + "ocean.mp4"; V.bg.play().catch(function () {});
    show("title"); placeLogo(); state = "title";
    if (q !== "title") openMenu(true);
    if (q === "pause") openPause(0);
  } else if (!desktop()) {
    state = "blocked"; el.gate.classList.add("mobile");
    el.gateBtn.textContent = "Desktop only";
  } else prepMedia();
})();
