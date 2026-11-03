/* =====================================================================
   TEMA HALLOWEEN · "Noche de Diretide" (decoración). Mismo archivo en Rayas Store y LitleJacob Store;
   cada tienda lo configura con window.HW_CONFIG antes de cargarlo.
   - Cinta del evento, cielo con luna y murciélagos, cementerio con calabazas,
     niebla, araña colgando, brasas y fuegos fatuos en el fondo.
   - Solo dibujos genéricos (nada de personajes de Dota).
   - Se apaga con HW.apagar() y se prende con HW.encender().
   ===================================================================== */
(function () {
  "use strict";
  if (window.HW) return;
  var C = Object.assign({ tienda: "Rayas Store", portadas: ".hero", sombrero: "img.hero-logo", franjaDespues: "#inicio.hero", brasas: true }, window.HW_CONFIG || {});
  var raiz = document.documentElement, app = document.getElementById("app") || document.body;
  var reducir = false;
  try { reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* sin matchMedia */ }
  var HEROES = ["Undying", "Necrophos", "Death Prophet", "Muerta", "Spectre", "Night Stalker", "Wraith King", "Visage", "Pugna", "Bane", "Lich", "Abaddon", "Pudge", "Shadow Fiend", "Dark Willow", "Grimstroke"];

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html) e.innerHTML = html;
    return e;
  }

  /* ---------- Piezas fijas ---------- */
  var piezas = [];
  function cinta() {
    var uno = '<span><b>Diretide</b> Edición Halloween en ' + C.tienda + '</span><span><i></i> Rifas, items y sets de Dota 2 con saldo en soles</span>' +
      '<span><b>¡Boo!</b> Entrega por Steam</span><span><i></i> Noche de calabazas en ' + C.tienda + '</span>';
    return el("div", { id: "hwCinta", role: "note", "aria-label": "Edición Halloween: Noche de Diretide en " + C.tienda }, '<div class="hw-cinta-in" aria-hidden="true">' + uno + uno + uno + uno + "</div>");
  }
  function murcis() { return el("div", { id: "hwMurcis", "aria-hidden": "true" }, "<i></i><i></i><i></i>"); }
  function arana() { return el("div", { id: "hwArana", "aria-hidden": "true" }); }

  /* ---------- Escena de la portada (se vuelve a poner cada vez que la página se redibuja) ---------- */
  function cielo() {
    return el("div", { "class": "hw-cielo", "aria-hidden": "true" },
      '<div class="hw-luna"></div><div class="hw-nube n2"></div><div class="hw-nube n1"></div><div class="hw-bandada"><i></i><i></i><i></i><i></i><i></i></div>');
  }
  function suelo() {
    return el("div", { "class": "hw-suelo", "aria-hidden": "true" },
      '<div class="hw-niebla"><i></i><i></i></div><div class="hw-cementerio"></div><div class="hw-calabazas"><span></span><span></span><span></span><span></span></div>');
  }
  function franjaHeroes() {
    var uno = '<span class="t">Esta noche rondan</span>' + HEROES.map(function (h) { return "<span>" + h + "</span>"; }).join("");
    return el("div", { "class": "hw-heroes", "aria-hidden": "true" }, '<div class="hw-heroes-in">' + uno + uno + "</div>");
  }
  function decorar() {
    if (!raiz.classList.contains("hw")) return;
    var heroes = document.querySelectorAll(C.portadas);
    for (var i = 0; i < heroes.length; i++) {
      var h = heroes[i];
      if (!h.querySelector(":scope > .hw-cielo")) { h.insertBefore(cielo(), h.firstChild); h.appendChild(suelo()); }
      var lg = h.querySelector(C.sombrero);
      if (lg && lg.tagName !== "IMG") lg.classList.add("hw-logo");
      else if (lg && !(lg.parentNode && lg.parentNode.classList && lg.parentNode.classList.contains("hw-logo"))) {
        var s = el("span", { "class": "hw-logo" }); lg.parentNode.insertBefore(s, lg); s.appendChild(lg);
      }
    }
    var ini = C.franjaDespues ? document.querySelector(C.franjaDespues) : null;
    if (ini && !(ini.nextElementSibling && ini.nextElementSibling.classList.contains("hw-heroes"))) ini.parentNode.insertBefore(franjaHeroes(), ini.nextSibling);
  }
  function limpiarEscena() {
    var l = document.querySelectorAll(".hw-cielo, .hw-suelo, .hw-heroes");
    for (var i = 0; i < l.length; i++) l[i].parentNode.removeChild(l[i]);
    var g = document.querySelectorAll(".hw-logo");
    for (var j = 0; j < g.length; j++) {
      if (g[j].tagName !== "SPAN") { g[j].classList.remove("hw-logo"); continue; }
      var img = g[j].firstChild; if (img) g[j].parentNode.insertBefore(img, g[j]); g[j].parentNode.removeChild(g[j]);
    }
  }

  /* ---------- Fondo animado: brasas, fuegos fatuos y hojas secas ---------- */
  var cv = null, ctx = null, W = 0, H = 0, ps = [], corriendo = false;
  function nueva(abajo) {
    var r = Math.random(), tipo = C.brasas ? (r < .14 ? "fatuo" : (r < .26 ? "hoja" : "brasa")) : (r < .45 ? "fatuo" : "hoja");
    var p = { tipo: tipo, x: Math.random() * W, y: abajo ? H + 20 : Math.random() * H, t: Math.random() * 6.28, ts: Math.random() * .02 + .006 };
    if (tipo === "brasa") { p.r = Math.random() * 1.9 + .6; p.vy = -(Math.random() * .4 + .12); p.vx = (Math.random() - .5) * .25; p.a = Math.random() * .6 + .25; p.h = Math.random() < .7 ? 18 + Math.random() * 18 : 262 + Math.random() * 18; }
    else if (tipo === "fatuo") { p.r = Math.random() * 3 + 3; p.vy = -(Math.random() * .12 + .03); p.vx = (Math.random() - .5) * .3; p.a = Math.random() * .35 + .2; p.h = 138 + Math.random() * 30; }
    else { p.r = Math.random() * 5 + 5; p.y = abajo ? -20 : p.y; p.vy = Math.random() * .45 + .25; p.vx = (Math.random() - .3) * .5; p.a = Math.random() * .35 + .35; p.h = 16 + Math.random() * 22; p.rot = Math.random() * 6.28; p.vr = (Math.random() - .5) * .03; }
    return p;
  }
  function medir() {
    if (!cv) return;
    W = cv.width = window.innerWidth; H = cv.height = window.innerHeight;
    var n = C.brasas ? Math.min(64, Math.floor(W / (W < 700 ? 16 : 26))) : Math.min(22, Math.floor(W / (W < 700 ? 40 : 70)));
    while (ps.length < n) ps.push(nueva(false));
    ps.length = n;
  }
  function hoja(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = "hsla(" + p.h + ",85%,48%," + p.a + ")";
    ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.quadraticCurveTo(p.r * .9, 0, 0, p.r); ctx.quadraticCurveTo(-p.r * .9, 0, 0, -p.r); ctx.fill();
    ctx.strokeStyle = "hsla(" + p.h + ",70%,28%," + p.a + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(0, p.r + 3); ctx.stroke();
    ctx.restore();
  }
  function cuadro() {
    if (!corriendo) return;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i]; p.t += p.ts;
      p.x += p.vx + Math.sin(p.t) * (p.tipo === "hoja" ? .6 : .14); p.y += p.vy;
      if (p.tipo === "hoja") { p.rot += p.vr + Math.sin(p.t) * .01; if (p.y > H + 20) ps[i] = nueva(true); }
      else if (p.y < -20) { ps[i] = nueva(true); continue; }
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.tipo === "hoja") { hoja(p); continue; }
      var al = p.a * (.55 + .45 * Math.sin(p.t * (p.tipo === "fatuo" ? 1.6 : 3)));
      var halo = p.tipo === "fatuo" ? 4.2 : 3.2;
      ctx.fillStyle = "hsla(" + p.h + ",95%,60%," + (al * .2) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * halo, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "hsla(" + p.h + ",95%," + (p.tipo === "fatuo" ? 72 : 62) + "%," + al + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    requestAnimationFrame(cuadro);
  }
  function fondo() {
    cv = el("canvas", { id: "hwAmbiente", "aria-hidden": "true" }); ctx = cv.getContext("2d");
    var tn = document.getElementById("tnFondo");
    if (tn && tn.parentNode) tn.parentNode.insertBefore(cv, tn.nextSibling); else document.body.insertBefore(cv, document.body.firstChild);
    medir();
    if (!reducir) { corriendo = true; cuadro(); }
    return cv;
  }
  window.addEventListener("resize", medir);
  document.addEventListener("visibilitychange", function () { var vivo = !document.hidden && !reducir && !!cv && raiz.classList.contains("hw"); if (vivo && !corriendo) { corriendo = true; cuadro(); } else if (!vivo) corriendo = false; });

  /* ---------- Prender / apagar ---------- */
  var obs = null;
  function encender() {
    raiz.classList.add("hw");
    if (!piezas.length) {
      var c = cinta(), ap = document.getElementById("app");
      if (ap && ap.parentNode === document.body) document.body.insertBefore(c, ap); else document.body.insertBefore(c, document.body.firstChild);
      var m = murcis(), a = arana(); document.body.appendChild(m); document.body.appendChild(a);
      piezas = [c, m, a, fondo()];
    }
    decorar();
    if (!obs && app && window.MutationObserver) { obs = new MutationObserver(decorar); obs.observe(app, { childList: true, subtree: true }); }
  }
  function apagar() {
    raiz.classList.remove("hw");
    if (obs) { obs.disconnect(); obs = null; }
    corriendo = false;
    piezas.forEach(function (p) { if (p && p.parentNode) p.parentNode.removeChild(p); });
    piezas = []; cv = null; ps = [];
    limpiarEscena();
  }
  window.HW = { encender: encender, apagar: apagar };
  encender();
})();
