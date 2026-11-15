/* Creación de páginas web: portafolio de LitleJacob Studio Web dentro de las tiendas.
   Mismo archivo en Rayas Store y LitleJacob Store (cada web le pone sus colores con portafolio.css).
   - Rayas: app.js lo pinta en la sección #paginas-web con window.portafolioWeb.html().
   - LitleJacob: este archivo llena solo el bloque #view-web del index (ruta #paginas-web).
   Para agregar o cambiar trabajos y enlaces, editar solo el bloque PF de abajo. */
(function () {
  "use strict";
  var LJ = window.TIENDA ? !!window.TIENDA.esLJ : (/litlejacob/i.test(location.hostname) || /[?&]tienda=litlejacob/.test(location.search));   // tienda.js
  var TIENDA = LJ ? "LitleJacob Store" : "Rayas Store";
  var STUDIO = "https://studio.litlejacob.trade";

  var PF = {
    wa: "51952997030",
    waTxt: "+51 952 997 030",
    links: [
      { k: "web", t: "Mi web de proyectos", v: "studio.litlejacob.trade", href: STUDIO },
      { k: "wa", t: "WhatsApp", v: "+51 952 997 030", href: "" },
      { k: "fb", t: "Facebook", v: "LitleJacob Studio Web", href: "https://www.facebook.com/profile.php?id=61596612929082" },
      { k: "tt", t: "TikTok", v: "@litlejacob", href: "https://www.tiktok.com/@litlejacob" },
      { k: "ig", t: "Instagram", v: "@litlejacob.studio", href: "https://www.instagram.com/litlejacob.studio" }
    ],
    // Trabajos (la foto va en img/studio/). "yo" = la tienda donde se está viendo.
    trabajos: [
      { id: "ropa", ver: 2, t: "Tienda de ropa", real: false, tag: "Tienda completa",
        d: "Tienda online de moda con catálogo por categorías, filtros por talla y precio, buscador, favoritos y carrito con pago con tarjeta o por WhatsApp.",
        chips: ["Catálogo", "Filtros", "Carrito", "Cupones", "WhatsApp"], href: STUDIO + "/demo-ropa/" },
      { id: "marinera", t: "Alis Marinera", real: true, tag: "Catálogo",
        d: "Catálogo de faldas y trajes de marinera con tallas, galería, guía de medidas y pedidos por WhatsApp.",
        chips: ["Catálogo", "Tallas", "Galería", "WhatsApp"], href: "https://bryantb22.github.io/diseno-pagina-web-cliente-marinera/" },
      { id: "maquillajefx", ver: 2, t: "Estudio de maquillaje FX", real: false, tag: "Tienda completa",
        d: "Portada en video, portafolio con antes y después, cursos con temario y cupos, membresía y pago con tarjeta, Yape y Plin.",
        chips: ["Video", "Cursos", "Membresía", "Yape y Plin"], href: STUDIO + "/demo-maquillaje-fx/", vid: "maquillaje" },
      { id: "asesor", ver: 2, t: "Asesor de equipos de impresión", real: false, tag: "Catálogo",
        d: "Catálogo de impresoras y escáneres, recomendador según cuánto imprimes, tabla comparativa y cotización rápida por WhatsApp.",
        chips: ["Catálogo", "Recomendador", "Comparador", "WhatsApp"], href: STUDIO + "/demo-asesor/" },
      { id: "litlejacob", t: "LitleJacob Store", real: true, tag: "Plataforma propia",
        d: "Tienda con cuentas de usuario, saldo recargable por Yape, rifas con ruleta, catálogo y panel de administración.",
        chips: ["Cuentas", "Saldo con Yape", "Rifas", "Panel"], href: "https://litlejacob.trade", yo: LJ },
      { id: "rayas", t: "Rayas Store", real: true, tag: "Plataforma propia",
        d: "Plataforma de rifas con cuentas, saldo recargable, pagos con tarjeta, ganadores y panel de premios.",
        chips: ["Cuentas", "Pago con tarjeta", "Rifas", "Panel"], href: "https://rayas.trade", yo: !LJ }
    ],
    // Rubros (como la web del studio): para que cada visitante se vea reflejado
    rubros: [
      ["Restaurantes", "Carta digital y pedidos por WhatsApp."], ["Tiendas de ropa", "Catálogo con tallas, colores y carrito."],
      ["Barberías y salones", "Servicios, precios y reservas."], ["Gimnasios", "Planes, horarios y clases."],
      ["Profesionales", "Abogados, doctores, contadores: confianza y contacto."], ["Tecnología", "Catálogo, comparador y cotizaciones."],
      ["Emprendimientos", "Vende desde Instagram con una web propia."], ["Eventos", "Galería, paquetes y fechas disponibles."]
    ],
    // Garantías (sin precios: la regla de las tiendas)
    garantias: ["Con RUC: emito boleta", "2 rondas de cambios incluidas", "Hosting gratis, sin mensualidad", "50% al empezar y 50% al entregar", "Dominio propio opcional", "Pensada primero para celular"],
    faq: [
      ["¿Tengo que pagar una mensualidad?", "No. El hosting es gratis, así que pagas tu web una sola vez. El mantenimiento mensual es opcional, por si quieres que yo actualice tus productos y precios."],
      ["¿Necesito un dominio propio (.com o .pe)?", "No es obligatorio: tu web funciona con un link gratuito desde el primer día. Si quieres un dominio propio, lo compras aparte y yo lo conecto."],
      ["¿Puedo editar mi web yo mismo?", "Con la tienda completa tienes un panel para cambiar productos, precios y fotos sin tocar código. En las demás me escribes y lo actualizo."],
      ["¿Cuánto demora?", "Una web de presentación o catálogo está lista en 3 a 5 días; una tienda completa, de 1 a 2 semanas. El plazo empieza cuando me envías logo, fotos y precios."],
      ["¿Qué pasa si quiero cambios después?", "Incluye 2 rondas de cambios. Después de la entrega puedes tomar el mantenimiento mensual o pedirme un cambio puntual."],
      ["¿Cómo se paga?", "50% de adelanto para empezar y 50% al entregar. Por Yape, Plin, PayPal o Binance."],
      ["¿Se verá bien en celular?", "Sí. Todas las webs se diseñan primero para celular, que es desde donde entra la mayoría de tus clientes."]
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
    opinion: { txt: "Me gustó demasiado: quedó tal cual yo quería, con la paleta de colores que le pedí. Muy buena atención, me hizo ver cada parte y cómo iba avanzando el proyecto. La página se ve estética y fluida. Ya lo recomendé a otra emprendedora.",
      quien: "Valentín Condezo Chura", de: "Rayas Store · venta de intangibles gaming por internet", web: "https://rayas.trade" }
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
      '<div class="pfw-shot">' + videoHtml(p) +
      (p.yo ? '<span class="pfw-yo">Estás aquí</span>' : '') + '</div>' +
      '<div class="pfw-meta"><div class="pfw-tags"><span class="pfw-tipo' + (p.real ? ' real' : '') + '">' + (p.real ? 'Proyecto real' : 'Diseño de ejemplo') + '</span><span class="pfw-tag">' + esc(p.tag) + '</span></div>' +
      '<h3>' + esc(p.t) + '</h3><p>' + esc(p.d) + '</p>' +
      (p.chips ? '<ul class="pfw-chips">' + p.chips.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join("") + '</ul>' : '') +
      '<span class="pfw-ver">' + (p.yo ? 'Estás viéndola' : 'Abrir y probar') + ' ' + svg(IC.fl) + '</span></div></a>';
  }
  // Recorrido en video de cada web (los mismos de studio.litlejacob.trade, en img/studio/casos/). Solo se reproduce cuando se ve en pantalla.
  function videoHtml(p) {
    var v = "img/studio/casos/" + (p.vid || p.id) + "-pc", q = p.ver ? "?v=" + p.ver : ""; // ver: subirlo cuando se regraba el video
    return '<video class="pfw-vid" muted loop playsinline preload="none" poster="' + v + '.webp' + q + '" width="1200" height="750" aria-label="Recorrido por ' + esc(p.t) + '">' +
      '<source src="' + v + '.webm' + q + '" type="video/webm"><source src="' + v + '.mp4' + q + '" type="video/mp4"></video>';
  }
  var quieto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var obsVid = !quieto && "IntersectionObserver" in window ? new IntersectionObserver(function (ents) {
    ents.forEach(function (e) { var v = e.target; if (e.isIntersecting) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () { /* el navegador no dejó: queda la imagen */ }); } else v.pause(); });
  }, { threshold: 0.35 }) : null;
  function vigilarVideos() { if (obsVid) document.querySelectorAll("video.pfw-vid:not([data-obs])").forEach(function (v) { v.setAttribute("data-obs", "1"); obsVid.observe(v); }); }
  if (obsVid && "MutationObserver" in window) new MutationObserver(function () { vigilarVideos(); }).observe(document.documentElement, { childList: true, subtree: true });
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
        '<ul class="pfw-trust"><li>' + svg(IC.ok) + 'Lista en 3 a 5 días</li><li>' + svg(IC.ok) + 'Hosting gratis, sin mensualidad</li><li>' + svg(IC.ok) + 'Se ve bien en celular</li><li>' + svg(IC.ok) + 'Trato directo conmigo</li></ul>' +
      '</div>' +
      '<div class="pfw-hero-art" aria-hidden="true">' +
        '<div class="pfw-pc"><div class="pfw-nav"><i></i><i></i><i></i><span>' + (LJ ? 'litlejacob.trade' : 'rayas.trade') + '</span></div><img src="img/studio/' + (LJ ? 'litlejacob' : 'rayas') + '.webp" alt="" width="1200" height="750" decoding="async"></div>' +
        '<div class="pfw-pc b"><div class="pfw-nav"><i></i><i></i><i></i></div><img src="img/studio/ropa.webp" alt="" width="1200" height="750" decoding="async"></div>' +
        '<div class="pfw-pc c"><div class="pfw-nav"><i></i><i></i><i></i></div><img src="img/studio/maquillajefx.webp" alt="" width="1200" height="750" decoding="async"></div>' +
      '</div></div>' +
      '<div class="pfw-stats"><div><b>' + t.length + '</b><span>páginas y demos</span></div><div><b>2</b><span>tiendas propias en línea</span></div><div><b>Yape</b><span>y tarjeta integrados</span></div><div><b>1 a 1</b><span>sin agencia ni intermediarios</span></div></div>';

    var trabajos = '<div class="pfw-sec" id="pfw-trabajos">' + titulo("Portafolio", "Mis", "trabajos") +
      '<p class="pfw-sub">Webs reales de clientes y diseños de ejemplo. Ábrelos y pruébalos en tu celular.</p>' +
      '<div class="pfw-grid">' + t.map(tarjeta).join("") +
      '<a class="pfw-trab pfw-tuyo" href="' + esc(wa(MSG)) + '" target="_blank" rel="noopener"><span class="pfw-ic">' + svg('<path d="M12 5v14M5 12h14"></path>') + '</span>' +
      '<b>Tu negocio aquí</b><p>Restaurantes, tiendas de ropa, barberías, gimnasios, profesionales, eventos… Cuéntame qué vendes y armamos tu página.</p>' +
      '<span class="pfw-btn pri">' + svg(IC.wa) + 'Cotizar mi web</span></a>' +
      '</div></div>';

    var servicios = '<div class="pfw-sec">' + titulo("Qué hago", "Servicios", "digitales") +
      '<div class="pfw-servs">' + PF.servicios.map(function (s) {
        return '<div class="pfw-serv"><span class="pfw-ic">' + svg(s.svg) + '</span><b>' + esc(s.t) + '</b><p>' + esc(s.d) + '</p></div>';
      }).join("") + '</div></div>';

    var rubros = '<div class="pfw-sec">' + titulo("Para tu negocio", "¿Qué", "vendes?") +
      '<p class="pfw-sub">Hago webs para cualquier rubro. Toca el tuyo y cotiza por WhatsApp.</p>' +
      '<div class="pfw-rubros">' + PF.rubros.map(function (r) {
        return '<a class="pfw-rubro" href="' + esc(wa("Hola, vi en " + TIENDA + " tus trabajos de páginas web. Tengo un negocio de " + r[0].toLowerCase() + " y quiero cotizar mi web.")) + '" target="_blank" rel="noopener"><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></a>';
      }).join("") + '</div>' +
      '<ul class="pfw-gar">' + PF.garantias.map(function (g) { return '<li>' + svg(IC.ok) + esc(g) + '</li>'; }).join("") + '</ul></div>';

    var faq = '<div class="pfw-sec">' + titulo("Dudas", "Preguntas", "frecuentes") +
      '<p class="pfw-sub">Si tienes otra duda, escríbeme por WhatsApp.</p>' +
      '<div class="pfw-faq">' + PF.faq.map(function (f) { return '<details><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>'; }).join("") + '</div></div>';

    var proceso = '<div class="pfw-sec">' + titulo("Así trabajamos", "Cómo", "funciona") + '<p class="pfw-sub">Todo por WhatsApp, sin reuniones largas.</p>' +
      '<ol class="pfw-pasos">' + PF.pasos.map(function (p, i) {
        return '<li><span class="pfw-n">' + (i + 1) + '</span><b>' + esc(p[0]) + '</b><p>' + esc(p[1]) + '</p></li>';
      }).join("") + '</ol></div>';

    var opinion = '<figure class="pfw-op"><span class="pfw-q" aria-hidden="true">“</span><blockquote>' + esc(PF.opinion.txt) + '</blockquote>' +
      '<figcaption><b>' + esc(PF.opinion.quien) + '</b><span>' + esc(PF.opinion.de) + '</span>' +
      (PF.opinion.web && LJ ? '<a class="pfw-opweb" href="' + esc(PF.opinion.web) + '" target="_blank" rel="noopener">Ver su web: rayas.trade ' + svg(IC.fl) + '</a>' : '') + '</figcaption></figure>';

    var links = '<div class="pfw-sec pfw-cont" id="pfw-links">' + titulo("Contacto", "Mis", "enlaces") +
      '<div class="pfw-links">' + PF.links.map(enlace).join("") + '</div>' +
      '<div class="pfw-final"><div><b>¿Quieres tu página web?</b><span>Escríbeme y te cotizo sin compromiso. Pagos por Yape, Plin, PayPal o Binance.</span></div>' +
      '<a class="pfw-btn pri" href="' + esc(wa(MSG)) + '" target="_blank" rel="noopener">' + svg(IC.wa) + 'Escribir por WhatsApp</a></div></div>';

    return '<div class="pfw ' + (LJ ? 'lj' : 'ry') + '">' + hero + trabajos + opinion + rubros + servicios + proceso + faq + links + '</div>';
  }

  function cargarCss() {
    if (document.querySelector('link[href^="portafolio.css"]')) return;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "portafolio.css?v=3"; document.head.appendChild(l);
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
