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
    gate: $("#gate"), studio: $("#studio"), title: $("#title"), pause: $("#pause"), iris: $("#iris"),
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
    ["gate", "studio", "title", "pause"].forEach(function (k) { el[k].classList.toggle("on", k === id || (id === "pause" && k === "title")); });
  }
  function horizonY() {   // where the horizon lands on screen: live shader, or the cover-fitted film
    if (!filmed) return S.horizonY();
    var W = innerWidth, H = innerHeight, va = VARIANT === "port" ? 9 / 16 : 16 / 9;
    return H / 2 + (0.57 - 0.5) * Math.max(H, W / va);
  }
  function placeLogo() {   // the logo's waterline sits exactly on the horizon
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
  var VARIANT = innerWidth / innerHeight < 0.9 ? "port" : "land", MEDIA = "media/";
  var ready = Promise.resolve(false);
  function prepMedia() {
    V.intro.src = MEDIA + "intro-" + VARIANT + ".mp4"; V.bg.src = MEDIA + "ocean-" + VARIANT + ".mp4";
    V.intro.load(); V.bg.load();
    LT.init();   // created suspended; resumed by the key press
    var aud = LT.loadBaked({ intro: MEDIA + "intro.flac", loop: MEDIA + "loop.flac" });
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
  function begin() {
    if (state !== "gate") return;
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
    if (li.dataset.go === "pause") openPause(+(li.dataset.tab || 0)); else LT.ui.tab();
  }

  /* ---- pause ---- */
  function openPause(t) {
    state = "pause"; show("pause"); LT.ui.select(); LT.pause(true);
    var s0 = cueNow();
    play(el.pause, [{ opacity: 0 }, { opacity: 1 }], 280, s0, E.out);
    play(el.ptop, [{ opacity: 0, transform: "translateY(-16px)" }, { opacity: 1, transform: "none" }], 520, s0 + 0.04, E.out);
    play(el.pbody, [{ opacity: 0, transform: "translateY(22px)" }, { opacity: 1, transform: "none" }], 580, s0 + 0.12, E.out);
    tab = t; setTab(t, true, true);
  }
  function closePause() {
    state = "menu"; LT.ui.back(); LT.pause(false);
    var a = play(el.pause, [{ opacity: 1 }, { opacity: 0 }], 200, cueNow(), E.in, "forwards");
    a.finished.then(function () { show("title"); }).catch(function () {});
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
  }

  /* ---- input ---- */
  document.addEventListener("keydown", function (e) {
    var k = e.key;
    if (state === "gate") { if (!e.repeat) begin(); return; }
    if (state === "title") { if (k === "Enter" || k === " ") openMenu(); return; }
    if (state === "menu") {
      if (k === "ArrowDown" || k === "s" || k === "S") { e.preventDefault(); setSel(sel + 1); }
      else if (k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); setSel(sel - 1); }
      else if (k === "Enter" || k === " ") choose();
      return;
    }
    if (state === "pause") {
      if (k === "e" || k === "E" || k === "ArrowRight") setTab(tab + 1);
      else if (k === "q" || k === "Q" || k === "ArrowLeft") setTab(tab - 1);
      else if (k === "Escape" || k === "Backspace") closePause();
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
    V.bg.src = MEDIA + "ocean-" + VARIANT + ".mp4"; V.bg.play().catch(function () {});
    show("title"); placeLogo(); state = "title";
    if (q !== "title") openMenu(true);
    if (q === "pause") openPause(0);
  } else prepMedia();
})();
