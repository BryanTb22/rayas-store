/* Servicios digitales (LitleJacob Studio Web): páginas web, mensajes automáticos por WhatsApp
   y publicidad en redes sociales. Mismo archivo en Rayas Store y LitleJacob Store.
   - Rayas: app.js pinta la sección en el Inicio con window.serviciosDig.html().
   - LitleJacob: este archivo la agrega solo debajo de "¿Qué buscas?" (así "Publicar" no la copia al index.html).
   Para cambiar textos o el WhatsApp, editar solo el bloque SERV de abajo. */
(function () {
  "use strict";
  var LJ = /litlejacob/i.test(location.hostname) || /[?&]tienda=litlejacob/.test(location.search);
  var TIENDA = LJ ? "LitleJacob Store" : "Rayas Store";

  var SERV = {
    wa: "51952997030",                      // WhatsApp de LitleJacob Studio Web
    waTxt: "+51 952 997 030",
    web: "https://studio.litlejacob.trade",  // página de proyectos web (portafolio)
    webTxt: "studio.litlejacob.trade",
    tiktok: "https://www.tiktok.com/@litlejacob",
    tiktokTxt: "@litlejacob",
    items: [
      { ico: "🌐", svg: '<rect x="3" y="4" width="18" height="14" rx="2"></rect><path d="M3 8h18M8 21h8M12 18v3"></path>',
        t: "Páginas web para tu negocio",
        d: "Hago tu página: de presentación, catálogo de productos o tienda completa con panel propio. Hosting gratis el primer año.",
        b: "Quiero mi página",
        msg: "Hola, vi en " + TIENDA + " que hacen páginas web. Quiero información para mi negocio." },
      { ico: "💬", svg: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"></path><path d="M8.5 10.5h7M8.5 13.5h4.5"></path>',
        t: "Mensajes automáticos por WhatsApp",
        d: "Tu WhatsApp responde solo: saludo, catálogo, precios y horarios, a cualquier hora. Desde respuestas simples hasta un asistente con IA.",
        b: "Quiero respuestas automáticas",
        msg: "Hola, vi en " + TIENDA + " que configuran mensajes automáticos por WhatsApp. Quiero información." },
      { ico: "📣", svg: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"></path><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"></path>',
        t: "Publicidad en tus redes sociales",
        d: "Armo y manejo tus anuncios en TikTok, Facebook e Instagram para que más clientes te encuentren y te escriban.",
        b: "Quiero más clientes",
        msg: "Hola, vi en " + TIENDA + " que hacen publicidad en redes sociales. Quiero información." }
    ]
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function wa(msg) { return "https://wa.me/" + SERV.wa + "?text=" + encodeURIComponent(msg); }
  var SUB = "Además de la tienda, ayudamos a emprendedores y negocios a vender más por internet. Escríbenos y te contamos sin compromiso.";
  var IC = {
    web: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"></path></svg>',
    tt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"></path><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"></path></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"></path><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-1.8-1-1 .8a3.6 3.6 0 0 1-2-2l.8-1-1-1.8z"></path></svg>'
  };
  function chip(href, ico, k, v) { return '<a class="svd-chip" href="' + esc(href) + '" target="_blank" rel="noopener"><span class="svd-ic">' + ico + '</span><span><small>' + k + '</small><b>' + esc(v) + '</b></span></a>'; }
  var PIE = '<div class="svd-contacto" aria-label="Contacto de LitleJacob Studio Web">' +
    '<a class="svd-chip svd-port" href="#paginas-web"><span class="svd-ic">' + IC.web + '</span><span><small>Creación de páginas web</small><b>Ver mis trabajos →</b></span></a>' +
    chip(SERV.web, IC.web, "Mis proyectos web", SERV.webTxt) +
    chip(SERV.tiktok, IC.tt, "TikTok", SERV.tiktokTxt) +
    chip(wa("Hola, vi en " + TIENDA + " sus servicios digitales. Quiero información."), IC.wa, "WhatsApp", SERV.waTxt) +
    '</div><p class="svd-pie">LitleJacob Studio Web · mira páginas que ya hice, videos en TikTok y escríbeme sin compromiso.</p>';

  /* Rayas: mismas clases que "¿Qué buscas?" (toma los colores de la web y de la temporada) */
  function htmlRayas() {
    return '<section class="section gutter svd" id="servicios-digitales"><div class="wrap">' +
      '<div class="sec-title"><div class="kicker">También hacemos</div><h2><span class="t1">Servicios</span> <span>digitales</span></h2><div class="orn">◆</div></div>' +
      '<p class="svd-sub">' + SUB + '</p>' +
      '<div class="cards2 svd-cards">' + SERV.items.map(function (s, i) {
        return '<a class="svc frame gold" href="' + esc(wa(s.msg)) + '" target="_blank" rel="noopener"><div class="in">' +
          '<span class="ico">' + s.ico + '</span><h3>' + esc(s.t) + '</h3><p>' + esc(s.d) + '</p>' +
          '<span class="btn ' + (i === 1 ? 'btn-fuchsia' : 'btn-yellow') + '">' + esc(s.b) + '</span></div></a>';
      }).join("") + '</div>' + PIE + '</div></section>';
  }

  /* LitleJacob: mismas clases que "¿Qué buscas?" de su Inicio */
  function htmlLJ() {
    return '<div class="lj-sec-k">También hacemos</div>' +
      '<h2 class="home-block-title gold-gradient-text">Servicios digitales</h2>' +
      '<div class="ornamental-divider"><div class="ornamental-dot"></div><div class="ornamental-line-left"></div><div class="ornamental-diamond"></div><div class="ornamental-line-right"></div><div class="ornamental-dot"></div></div>' +
      '<p class="svd-sub">' + SUB + '</p>' +
      '<div class="lj-cards3 svd-cards">' + SERV.items.map(function (s, i) {
        return '<a class="lj-card3" href="' + esc(wa(s.msg)) + '" target="_blank" rel="noopener">' +
          '<span class="lj-card3-ico"><svg viewBox="0 0 24 24" aria-hidden="true">' + s.svg + '</svg></span>' +
          '<b>' + esc(s.t) + '</b><span>' + esc(s.d) + '</span><em class="lj-h2-btn ' + (i === 1 ? 'rojo' : 'plata') + '">' + esc(s.b) + '</em></a>';
      }).join("") + '</div>' + PIE;
  }

  function cargarCss() {
    if (document.querySelector('link[href^="servicios.css"]')) return;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "servicios.css?v=3"; document.head.appendChild(l);
  }

  function pegarLJ() {
    if (!LJ || document.getElementById("servicios-digitales")) return;
    var ancla = document.querySelector(".lj-busca"); if (!ancla) return;
    var s = document.createElement("section"); s.className = "home-block svd"; s.id = "servicios-digitales";
    s.innerHTML = htmlLJ();
    ancla.insertAdjacentElement("afterend", s);
  }

  window.serviciosDig = { html: htmlRayas, datos: SERV, wa: wa };
  cargarCss();
  function run() { pegarLJ(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  setTimeout(run, 800); setTimeout(run, 2500);
})();
