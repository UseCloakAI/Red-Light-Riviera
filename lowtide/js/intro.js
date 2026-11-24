/* Intro sequence + menu controller. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var timers = [], started = false, state = "gate", sel = 0, tab = 0;
  var scenes = ["gate", "studio", "presents", "title", "pause"];
  var items = Array.prototype.slice.call(document.querySelectorAll(".main-menu li"));
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".p-tabs button"));
  var panels = Array.prototype.slice.call(document.querySelectorAll(".p-panel"));
  var skip = $("#skip");

  function show(id) { scenes.forEach(function (s) { $("#" + s).classList.toggle("on", s === id); }); state = id; }
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clear() { timers.forEach(clearTimeout); timers = []; }

  function begin() {
    if (started) return; started = true;
    LT.init(); skip.hidden = false;
    show("studio");
    at(60, function () { $("#studio").classList.add("play"); });
    [160, 280, 400, 520].forEach(function (t) { at(t, LT.sfx.slam); });
    at(800, function () { LT.sfx.whoosh(0.8); });
    at(1700, LT.sfx.thump);
    at(2650, LT.sfx.blink); at(2870, LT.sfx.blink);
    at(4700, function () { show("presents"); LT.sfx.whoosh(1.6); });
    at(7400, toTitle);
  }

  function toTitle() {
    clear(); skip.hidden = true;
    show("title"); LT.sfx.hit(); LT.music.start();
  }

  function openMenu() {
    $("#title").classList.add("menu"); state = "menu"; LT.sfx.select(); setSel(0, true);
  }
  function setSel(i, quiet) {
    sel = (i + items.length) % items.length;
    items.forEach(function (li, k) { li.classList.toggle("sel", k === sel); });
    if (!quiet) LT.sfx.move();
  }
  function choose() {
    var li = items[sel]; LT.sfx.select();
    if (li.dataset.go === "pause") { show("pause"); state = "pause"; setTab(+(li.dataset.tab || 0), true); LT.music.duck(0.25); }
  }
  function setTab(i, quiet) {
    tab = (i + tabs.length) % tabs.length;
    tabs.forEach(function (b, k) { b.classList.toggle("sel", k === tab); });
    panels.forEach(function (p, k) { p.classList.toggle("on", k === tab); });
    if (!quiet) LT.sfx.move();
  }
  function back() {
    if (state === "pause") { show("title"); state = "menu"; LT.sfx.back(); LT.music.duck(0.55); }
  }

  document.addEventListener("keydown", function (e) {
    var k = e.key;
    if (state === "gate") return begin();
    if (state === "studio" || state === "presents") { if (k === "Escape" || k === "Enter") toTitle(); return; }
    if (state === "title") { if (k === "Enter" || k === " ") openMenu(); return; }
    if (state === "menu") {
      if (k === "ArrowDown" || k === "s") setSel(sel + 1);
      else if (k === "ArrowUp" || k === "w") setSel(sel - 1);
      else if (k === "Enter") choose();
      return;
    }
    if (state === "pause") {
      if (k === "e" || k === "ArrowRight") setTab(tab + 1);
      else if (k === "q" || k === "ArrowLeft") setTab(tab - 1);
      else if (k === "Escape" || k === "Backspace") back();
    }
  });

  $("#start").addEventListener("click", begin);
  $("#gate").addEventListener("click", begin);
  skip.addEventListener("click", toTitle);
  $("#title").addEventListener("click", function (e) { if (state === "title") openMenu(); });
  items.forEach(function (li, k) {
    li.addEventListener("mouseenter", function () { if (state === "menu" && sel !== k) setSel(k); });
    li.addEventListener("click", function (e) { e.stopPropagation(); if (state === "menu") { setSel(k, true); choose(); } });
  });
  tabs.forEach(function (b, k) { b.addEventListener("click", function () { setTab(k); }); });

  // deep link for QA: ?scene=menu|pause
  var q = new URLSearchParams(location.search).get("scene");
  if (q) { started = true; show("title"); if (q !== "title") { $("#title").classList.add("menu"); state = "menu"; setSel(0, true); }
    if (q === "pause") { show("pause"); state = "pause"; setTab(0, true); } }
})();
