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
  var C = Object.assign({ tienda: "Rayas Store", portadas: ".hero", sombrero: "img.hero-logo", franjaDespues: "#inicio.hero", brasas: true,
    marcos: "", terror: "", bandas: "" /* la banda de noche va antes de este elemento */, profundo: false, nieblaFija: false, fatuo: [138, 95, 72], hoja: [16, 38],
    calabazas: true, iconoCinta: true, figuras: null /* { "selector de portada": ["treant", "necro"] } → img/hw-<nombre>.webp (arte oficial ya recortado) */, colgante: "" /* imagen que cuelga de un hilo arriba a la derecha */,
    vitrina: "" /* selector del JSON del catálogo (#catalogData): arma la vitrina "Especial Diretide" con el cofre de Halloween que ya tiene la web */, vitrinaDespues: "", vitrinaEnlace: "#sets-cache", diretide: /terror|diretide|halloween/i }, window.HW_CONFIG || {});
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
    var ic = C.iconoCinta ? "<i></i>" : "<i class=\"d\">◆</i>";
    var uno = '<span><b>Diretide</b> Edición Halloween en ' + C.tienda + '</span><span>' + ic + ' Rifas, items y sets de Dota 2 con saldo en soles</span>' +
      '<span><b>¡Boo!</b> Entrega por Steam</span><span>' + ic + ' Noche de Diretide en ' + C.tienda + '</span>';
    return el("div", { id: "hwCinta", role: "note", "aria-label": "Edición Halloween: Noche de Diretide en " + C.tienda }, '<div class="hw-cinta-in" aria-hidden="true">' + uno + uno + uno + uno + "</div>");
  }
  function murcis() { return el("div", { id: "hwMurcis", "aria-hidden": "true" }, "<i></i><i></i><i></i>"); }
  function arana() {
    var a = el("div", { id: "hwArana", "aria-hidden": "true" });
    if (C.colgante) { a.className = "con-figura"; var im = el("img", { src: C.colgante, alt: "", loading: "lazy", decoding: "async" }); a.appendChild(im); }
    return a;
  }
  // Figuras de héroes (arte oficial de los sets, ya recortado) para una portada
  function figuras(h) {
    if (!C.figuras) return;
    var lista = null;
    Object.keys(C.figuras).forEach(function (k) { if (!lista) { try { if (h.matches(k)) lista = C.figuras[k]; } catch (e) { /* selector raro */ } } });
    if (!lista) return;
    var suelo = h.querySelector(":scope > .hw-suelo"); if (!suelo || suelo.querySelector(".hw-fig")) return;
    lista.forEach(function (n) {
      var im = el("img", { "class": "hw-fig " + n, src: "img/hw-" + n + ".webp", alt: "", loading: "lazy", decoding: "async" });
      im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
      suelo.appendChild(im);
    });
  }

  /* ---------- Escena de la portada (se vuelve a poner cada vez que la página se redibuja) ---------- */
  function cielo() {
    return el("div", { "class": "hw-cielo", "aria-hidden": "true" },
      '<div class="hw-luna"></div><div class="hw-nube n2"></div><div class="hw-nube n1"></div><div class="hw-bandada"><i></i><i></i><i></i><i></i><i></i></div>');
  }
  function suelo() {
    return el("div", { "class": "hw-suelo", "aria-hidden": "true" },
      (C.profundo ? '<div class="hw-cementerio lejos"></div>' : '') + '<div class="hw-niebla"><i></i><i></i></div><div class="hw-cementerio"></div>' +
      (C.profundo ? '<div class="hw-ojos"><i></i><i></i><i></i></div>' : '') + (C.calabazas ? '<div class="hw-calabazas"><span></span><span></span><span></span><span></span></div>' : ''));
  }
  /* ---------- Cofre de Halloween que ya tiene la web (Sets Caché): vitrina y marcas ---------- */
  var cofreHW = null;
  function catalogo() {
    if (cofreHW !== null || !C.vitrina) return cofreHW;
    cofreHW = false;
    var s = document.querySelector(C.vitrina); if (!s) return cofreHW;
    try {
      var d = JSON.parse(s.textContent || "{}");
      var cof = (d.cofres || []).filter(function (c) { return C.diretide.test(c.name || ""); })[0];
      if (!cof) return cofreHW;
      var sets = (d.sets || []).filter(function (x) { return x.cofre === cof.id && !x.soldOut && x.img; });
      cofreHW = { cofre: cof, sets: sets, total: (d.sets || []).filter(function (x) { return x.cofre === cof.id; }).length };
    } catch (e) { /* catálogo raro: sin vitrina */ }
    return cofreHW;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function soles(n) { n = +n || 0; return "S/ " + (n % 1 ? n.toFixed(2) : n); }
  function vitrina() {
    var k = catalogo(); if (!k || !k.sets.length) return null;
    var tarjetas = k.sets.slice(0, 14).map(function (x) {
      return '<a class="hw-vit-set" href="' + esc(C.vitrinaEnlace) + '"><img src="' + esc(x.img) + '" alt="" loading="lazy" decoding="async"><b>' + esc(x.name) + '</b><i>' + soles(x.price) + '</i></a>';
    }).join("");
    var v = el("section", { "class": "hw-vitrina", "aria-label": "Especial Diretide: " + k.cofre.name },
      '<a class="hw-vit-cofre" href="' + esc(C.vitrinaEnlace) + '"><img src="' + esc(k.cofre.img) + '" alt="" loading="lazy" decoding="async"><span><small>Especial Diretide</small><b>' + esc(k.cofre.name) + '</b><em>' + k.total + ' sets de terror en Sets Caché →</em></span></a>' +
      '<div class="hw-vit-pista" aria-hidden="true"><div class="hw-vit-in">' + tarjetas + (k.sets.length > 4 ? tarjetas : "") + '</div></div>');
    return v;
  }
  function marcarCofre() {
    var k = catalogo(); if (!k) return;
    var n = (k.cofre.name || "").trim().toLowerCase();
    var tiles = document.querySelectorAll(".cofre-tile");
    for (var i = 0; i < tiles.length; i++) { var nm = tiles[i].querySelector(".cofre-name"); if (nm && nm.textContent.trim().toLowerCase() === n) tiles[i].classList.add("hw-diretide"); }
    var secs = document.querySelectorAll(".cofre-section");
    for (var j = 0; j < secs.length; j++) { var tt = secs[j].querySelector(".cofre-header-title"); if (tt && tt.textContent.trim().toLowerCase() === n) secs[j].classList.add("hw-diretide"); }
  }
  function franjaHeroes() {
    var uno = '<span class="t">Esta noche rondan</span>' + HEROES.map(function (h) { return "<span>" + h + "</span>"; }).join("");
    return el("div", { "class": "hw-heroes", "aria-hidden": "true" }, '<div class="hw-heroes-in">' + uno + uno + "</div>");
  }
  // Última palabra del título en letra de terror (solo si el título termina en texto simple y no se está editando).
  function palabraTerror(h) {
    if (h.querySelector(".hw-t") || h.isContentEditable || h.closest("[contenteditable]")) return;
    var n = h.lastChild;
    while (n && n.nodeType === 3 && !/\S/.test(n.nodeValue)) n = n.previousSibling;
    if (!n || n.nodeType !== 3) return;
    var m = /^([\s\S]*?)(\S+)(\s*)$/.exec(n.nodeValue);
    if (!m || !m[1].trim() && !n.previousSibling) return;     // un título de una sola palabra se queda igual
    var s = el("span", { "class": "hw-t" }); s.textContent = m[2];
    var antes = document.createTextNode(m[1]);
    h.insertBefore(antes, n); h.insertBefore(s, n); if (m[3]) h.insertBefore(document.createTextNode(m[3]), n); h.removeChild(n);
  }
  function decorar() {
    if (!raiz.classList.contains("hw")) return;
    var heroes = document.querySelectorAll(C.portadas);
    for (var i = 0; i < heroes.length; i++) {
      var h = heroes[i];
      if (!h.querySelector(":scope > .hw-cielo")) { h.insertBefore(cielo(), h.firstChild); h.appendChild(suelo()); }
      figuras(h);
      var lg = C.sombrero ? h.querySelector(C.sombrero) : null;
      if (lg && lg.tagName !== "IMG") lg.classList.add("hw-logo");
      else if (lg && !(lg.parentNode && lg.parentNode.classList && lg.parentNode.classList.contains("hw-logo"))) {
        var s = el("span", { "class": "hw-logo" }); lg.parentNode.insertBefore(s, lg); s.appendChild(lg);
      }
    }
    if (C.marcos) {
      var ms = document.querySelectorAll(C.marcos), nuevos = [], fijos = [];
      for (var k = 0; k < ms.length; k++) if (!ms[k].querySelector(":scope > .hw-marco")) nuevos.push(ms[k]);
      for (k = 0; k < nuevos.length; k++) fijos.push(getComputedStyle(nuevos[k]).position === "static");   // primero se mide todo…
      for (k = 0; k < nuevos.length; k++) {                                                               // …y luego se dibuja
        nuevos[k].classList.add("hw-m");
        if (fijos[k]) nuevos[k].classList.add("hw-mr");   // solo si no tenía posición propia
        nuevos[k].appendChild(el("span", { "class": "hw-marco", "aria-hidden": "true" }));
      }
    }
    if (C.terror && !(document.body && document.body.classList.contains("is-admin"))) {
      var ts = document.querySelectorAll(C.terror);
      for (var q = 0; q < ts.length; q++) palabraTerror(ts[q]);
    }
    if (C.bandas) {
      var bs = document.querySelectorAll(C.bandas);
      for (var b = 0; b < bs.length; b++) {
        var prev = bs[b].previousElementSibling;
        if (prev && prev.classList.contains("hw-banda")) continue;
        var banda = el("div", { "class": "hw-banda", "aria-hidden": "true" }); banda.appendChild(cielo()); banda.appendChild(suelo()); bs[b].parentNode.insertBefore(banda, bs[b]); figuras(banda);
      }
    }
    var ini = C.franjaDespues ? document.querySelector(C.franjaDespues) : null;
    if (ini && !(ini.nextElementSibling && ini.nextElementSibling.classList.contains("hw-heroes"))) ini.parentNode.insertBefore(franjaHeroes(), ini.nextSibling);
    var vd = C.vitrinaDespues ? document.querySelector(C.vitrinaDespues) : null;
    if (vd && !(vd.nextElementSibling && vd.nextElementSibling.classList.contains("hw-vitrina"))) { var vit = vitrina(); if (vit) vd.parentNode.insertBefore(vit, vd.nextSibling); }
    marcarCofre();
  }
  function limpiarEscena() {
    var mm = document.querySelectorAll(".hw-m");
    for (var x = 0; x < mm.length; x++) mm[x].classList.remove("hw-m", "hw-mr");
    var tt = document.querySelectorAll(".hw-t");
    for (var y = 0; y < tt.length; y++) { var pa = tt[y].parentNode; pa.replaceChild(document.createTextNode(tt[y].textContent), tt[y]); pa.normalize(); }
    var dd = document.querySelectorAll(".hw-diretide");
    for (var z = 0; z < dd.length; z++) dd[z].classList.remove("hw-diretide");
    var l = document.querySelectorAll(".hw-cielo, .hw-suelo, .hw-heroes, .hw-marco, .hw-banda, .hw-vitrina");
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
    else if (tipo === "fatuo") { p.r = Math.random() * 3 + 3; p.vy = -(Math.random() * .12 + .03); p.vx = (Math.random() - .5) * .3; p.a = Math.random() * .35 + .2; p.h = C.fatuo[0] + Math.random() * 30; p.s = C.fatuo[1]; p.l = C.fatuo[2]; }
    else { p.r = Math.random() * 5 + 5; p.y = abajo ? -20 : p.y; p.vy = Math.random() * .45 + .25; p.vx = (Math.random() - .3) * .5; p.a = Math.random() * .35 + .35; p.h = C.hoja[0] + Math.random() * (C.hoja[1] - C.hoja[0]); p.rot = Math.random() * 6.28; p.vr = (Math.random() - .5) * .03; }
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
      var sat = p.tipo === "fatuo" ? p.s : 95, luz = p.tipo === "fatuo" ? p.l : 62;
      ctx.fillStyle = "hsla(" + p.h + "," + sat + "%,60%," + (al * .2) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * halo, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "hsla(" + p.h + "," + sat + "%," + luz + "%," + al + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
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
      if (C.nieblaFija) { var nf = el("div", { id: "hwNieblaFija", "aria-hidden": "true" }, "<i></i><i></i>"); document.body.appendChild(nf); piezas.push(nf); }
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
