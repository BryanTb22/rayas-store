/* Creación de páginas web: portafolio de LitleJacob Studio Web dentro de las tiendas.
   Mismo archivo en Rayas Store y LitleJacob Store (cada web le pone sus colores con portafolio.css).
   - Rayas: app.js lo pinta en la sección #paginas-web con window.portafolioWeb.html().
   - LitleJacob: este archivo llena solo el bloque #view-web del index (ruta #paginas-web).
   Para agregar o cambiar trabajos y enlaces, editar solo el bloque PF de abajo. */
(function () {
  "use strict";
  var LJ = /litlejacob/i.test(location.hostname) || /[?&]tienda=litlejacob/.test(location.search);
  var TIENDA = LJ ? "LitleJacob Store" : "Rayas Store";
  var STUDIO = "https://studio.litlejacob.trade";

  var PF = {
    wa: "51952997030",
    waTxt: "+51 952 997 030",
    links: [
      { k: "web", t: "Mi web de proyectos", v: "studio.litlejacob.trade", href: STUDIO },
      { k: "wa", t: "WhatsApp", v: "+51 952 997 030", href: "" },
      { k: "fb", t: "Facebook", v: "LitleJacob Studio Web", href: "https://www.facebook.com/profile.php?id=61595819503217" },
      { k: "tt", t: "TikTok", v: "@litlejacob", href: "https://www.tiktok.com/@litlejacob" },
      { k: "ig", t: "Instagram", v: "@litlejacob.studio", href: "https://www.instagram.com/litlejacob.studio" }
    ],
    // Trabajos (la foto va en img/studio/). "yo" = la tienda donde se está viendo.
    trabajos: [
      { id: "marinera", t: "Alis Marinera", tag: "Catálogo · Cliente",
        d: "Catálogo de faldas y trajes de marinera con tallas, galería, guía de medidas y pedidos por WhatsApp.",
        href: "https://bryantb22.github.io/diseno-pagina-web-cliente-marinera/" },
      { id: "maquillajefx", t: "Estudio de maquillaje FX", tag: "Tienda completa",
        d: "Portada en video, portafolio con antes y después, cursos con cupos, membresía, carrito y pago con tarjeta, Yape y Plin.",
        href: STUDIO + "/demo-maquillaje-fx/" },
      { id: "asesor", t: "Asesor de equipos de impresión", tag: "Catálogo",
        d: "Catálogo de impresoras y escáneres, recomendador según cuánto imprimes, tabla comparativa y cotización por WhatsApp.",
        href: STUDIO + "/demo-asesor/" },
      { id: "litlejacob", t: "LitleJacob Store", tag: "Plataforma propia",
        d: "Tienda de Dota 2 con cuentas, saldo recargable por Yape, rifas con ruleta, Sets Caché y panel de administración.",
        href: "https://litlejacob.trade", yo: LJ },
      { id: "rayas", t: "Rayas Store", tag: "Plataforma propia",
        d: "Rifas e items de Dota 2 con cuentas, saldo recargable, pagos con tarjeta, ganadores en vivo y panel de premios.",
        href: "https://rayas.trade", yo: !LJ }
    ],
    servicios: [
      { t: "Páginas web", d: "De presentación, catálogo de productos o tienda completa con panel propio.", svg: '<rect x="3" y="4" width="18" height="14" rx="2"></rect><path d="M3 8h18M8 21h8M12 18v3"></path>' },
      { t: "Mensajes automáticos por WhatsApp", d: "Tu WhatsApp responde solo: saludo, catálogo, precios y horarios.", svg: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"></path><path d="M8.5 10.5h7M8.5 13.5h4.5"></path>' },
      { t: "Publicidad en redes", d: "Anuncios en TikTok, Facebook e Instagram para que más clientes te escriban.", svg: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"></path><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"></path>' }
    ],
    pasos: [
      ["Me escribes", "Me cuentas tu negocio y qué necesitas."],
      ["Me envías tu contenido", "Logo, fotos, precios y textos."],
      ["Revisas en tu celular", "Te muestro avances y ajustamos."],
      ["Publicamos", "En 3 a 5 días. Tiendas, de 1 a 2 semanas."]
    ],
    opinion: { txt: "Quedó tal cual yo quería, con la paleta de colores que le pedí. Muy buena atención: me hizo ver cada parte y cómo iba avanzando. La página se ve estética y fluida.",
      quien: "Valentín Condezo Chura", de: "Rayas Store · venta de intangibles gaming" }
  };

  var IC = {
    web: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"></path>',
    wa: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"></path><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-1.8-1-1 .8a3.6 3.6 0 0 1-2-2l.8-1-1-1.8z"></path>',
    fb: '<path d="M14 21v-8h2.7l.4-3.2H14V7.9c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.1H8V13h2.8v8"></path>',
    tt: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"></path><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"></path>',
    ig: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><path d="M17.2 6.8h.01"></path>',
    fl: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    ok: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>'
  };
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>'; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function wa(msg) { return "https://wa.me/" + PF.wa + "?text=" + encodeURIComponent(msg); }
  var MSG = "Hola, vi en " + TIENDA + " tus trabajos de páginas web. Quiero cotizar una para mi negocio.";

  // Título de sección con el estilo de cada web
  function titulo(kicker, a, b) {
    if (LJ) return '<div class="lj-sec-k">' + kicker + '</div><h2 class="home-block-title gold-gradient-text">' + a + ' ' + b + '</h2>' +
      '<div class="ornamental-divider"><div class="ornamental-dot"></div><div class="ornamental-line-left"></div><div class="ornamental-diamond"></div><div class="ornamental-line-right"></div><div class="ornamental-dot"></div></div>';
    return '<div class="sec-title"><div class="kicker">' + kicker + '</div><h2><span class="t1">' + a + '</span> <span>' + b + '</span></h2><div class="orn">◆</div></div>';
  }
  function tarjeta(p, i) {
    return '<a class="pfw-trab' + (i === 0 ? ' dest' : '') + '" href="' + esc(p.href) + '" target="_blank" rel="noopener">' +
      '<div class="pfw-nav" aria-hidden="true"><i></i><i></i><i></i><span>' + esc(p.href.replace(/^https?:\/\//, "").replace(/\/$/, "")) + '</span></div>' +
      '<div class="pfw-shot"><img src="img/studio/' + p.id + '.webp" alt="Página de inicio de ' + esc(p.t) + '" width="1200" height="750" loading="lazy" decoding="async">' +
      (p.yo ? '<span class="pfw-yo">Estás aquí</span>' : '') + '</div>' +
      '<div class="pfw-meta"><span class="pfw-tag">' + esc(p.tag) + '</span><h3>' + esc(p.t) + '</h3><p>' + esc(p.d) + '</p>' +
      '<span class="pfw-ver">Ver proyecto ' + svg(IC.fl) + '</span></div></a>';
  }
  function enlace(l) {
    var href = l.k === "wa" ? wa(MSG) : l.href;
    return '<a class="pfw-link ' + l.k + '" href="' + esc(href) + '" target="_blank" rel="noopener"><span class="pfw-ic">' + svg(IC[l.k]) + '</span>' +
      '<span class="pfw-lt"><small>' + esc(l.t) + '</small><b>' + esc(l.v) + '</b></span>' + svg(IC.fl) + '</a>';
  }

  function html() {
    var t = PF.trabajos;
    var hero = '<div class="pfw-hero">' +
      '<div class="pfw-hero-txt">' +
        '<span class="pfw-kick">LitleJacob Studio Web</span>' +
        '<h1>Creación de <em>páginas web</em></h1>' +
        '<p>Hice esta tienda y también páginas para otros negocios. Diseño webs rápidas, pensadas para celular y con botón directo a tu WhatsApp, para cualquier rubro.</p>' +
        '<div class="pfw-ctas"><a class="pfw-btn pri" href="' + esc(wa(MSG)) + '" target="_blank" rel="noopener">' + svg(IC.wa) + 'Cotizar por WhatsApp</a>' +
        '<a class="pfw-btn sec" href="#pfw-trabajos">Ver mis trabajos</a></div>' +
        '<ul class="pfw-trust"><li>' + svg(IC.ok) + 'Lista en 3 a 5 días</li><li>' + svg(IC.ok) + 'Hosting gratis</li><li>' + svg(IC.ok) + 'Se ve bien en celular</li><li>' + svg(IC.ok) + 'Trato directo conmigo</li></ul>' +
      '</div>' +
      '<div class="pfw-hero-art" aria-hidden="true">' +
        '<div class="pfw-pc"><div class="pfw-nav"><i></i><i></i><i></i><span>' + (LJ ? 'litlejacob.trade' : 'rayas.trade') + '</span></div><img src="img/studio/' + (LJ ? 'litlejacob' : 'rayas') + '.webp" alt="" width="1200" height="750" decoding="async"></div>' +
        '<div class="pfw-pc b"><div class="pfw-nav"><i></i><i></i><i></i></div><img src="img/studio/marinera.webp" alt="" width="1200" height="750" decoding="async"></div>' +
        '<div class="pfw-pc c"><div class="pfw-nav"><i></i><i></i><i></i></div><img src="img/studio/maquillajefx.webp" alt="" width="1200" height="750" decoding="async"></div>' +
      '</div></div>' +
      '<div class="pfw-stats"><div><b>' + t.length + '</b><span>páginas hechas</span></div><div><b>2</b><span>tiendas propias en línea</span></div><div><b>Yape</b><span>y tarjeta integrados</span></div><div><b>1 a 1</b><span>sin agencia ni intermediarios</span></div></div>';

    var trabajos = '<div class="pfw-sec" id="pfw-trabajos">' + titulo("Portafolio", "Mis", "trabajos") +
      '<p class="pfw-sub">Páginas reales funcionando. Toca cualquiera para verla en vivo.</p>' +
      '<div class="pfw-grid">' + t.map(tarjeta).join("") +
      '<a class="pfw-trab pfw-tuyo" href="' + esc(wa(MSG)) + '" target="_blank" rel="noopener"><span class="pfw-ic">' + svg('<path d="M12 5v14M5 12h14"></path>') + '</span>' +
      '<b>Tu negocio aquí</b><p>Restaurantes, tiendas de ropa, barberías, gimnasios, profesionales, eventos… Cuéntame qué vendes y armamos tu página.</p>' +
      '<span class="pfw-btn pri">' + svg(IC.wa) + 'Cotizar mi web</span></a>' +
      '</div></div>';

    var servicios = '<div class="pfw-sec">' + titulo("Qué hago", "Servicios", "digitales") +
      '<div class="pfw-servs">' + PF.servicios.map(function (s) {
        return '<div class="pfw-serv"><span class="pfw-ic">' + svg(s.svg) + '</span><b>' + esc(s.t) + '</b><p>' + esc(s.d) + '</p></div>';
      }).join("") + '</div></div>';

    var proceso = '<div class="pfw-sec">' + titulo("Así trabajamos", "Cómo", "funciona") +
      '<ol class="pfw-pasos">' + PF.pasos.map(function (p, i) {
        return '<li><span class="pfw-n">' + (i + 1) + '</span><b>' + esc(p[0]) + '</b><p>' + esc(p[1]) + '</p></li>';
      }).join("") + '</ol></div>';

    var opinion = '<figure class="pfw-op"><span class="pfw-q" aria-hidden="true">“</span><blockquote>' + esc(PF.opinion.txt) + '</blockquote>' +
      '<figcaption><b>' + esc(PF.opinion.quien) + '</b><span>' + esc(PF.opinion.de) + '</span></figcaption></figure>';

    var links = '<div class="pfw-sec pfw-cont" id="pfw-links">' + titulo("Contacto", "Mis", "enlaces") +
      '<div class="pfw-links">' + PF.links.map(enlace).join("") + '</div>' +
      '<div class="pfw-final"><div><b>¿Quieres tu página web?</b><span>Escríbeme y te cotizo sin compromiso. Pagos por Yape, Plin, PayPal o Binance.</span></div>' +
      '<a class="pfw-btn pri" href="' + esc(wa(MSG)) + '" target="_blank" rel="noopener">' + svg(IC.wa) + 'Escribir por WhatsApp</a></div></div>';

    return '<div class="pfw ' + (LJ ? 'lj' : 'ry') + '">' + hero + trabajos + opinion + servicios + proceso + links + '</div>';
  }

  function cargarCss() {
    if (document.querySelector('link[href^="portafolio.css"]')) return;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "portafolio.css?v=1"; document.head.appendChild(l);
  }
  // LitleJacob: llena el bloque #view-web del index (la ruta #paginas-web la maneja el index).
  function pegarLJ() {
    if (!LJ) return;
    var v = document.getElementById("view-web");
    if (!v || v.getAttribute("data-pfw")) return;
    v.setAttribute("data-pfw", "1");
    v.innerHTML = '<section id="paginas-web">' + html() + '</section>';
  }
  // "Ver mis trabajos" baja a la lista sin cambiar la sección (el # cambiaría de página).
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('.pfw a[href="#pfw-trabajos"]');
    if (!a) return;
    ev.preventDefault();
    var el = document.getElementById("pfw-trabajos");
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  });

  window.portafolioWeb = { html: html, datos: PF };
  cargarCss();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pegarLJ); else pegarLJ();
  setTimeout(pegarLJ, 800);
})();
