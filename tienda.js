/* ===== AJUSTES DE CADA TIENDA =====
   Las dos webs (rayas.trade y litlejacob.trade) usan EL MISMO código. Lo único que cambia entre una y otra
   está aquí: nombre, WhatsApp, logo, claves del navegador y qué secciones tiene cada una.
   La tienda se reconoce por el dominio. Para probar en otra dirección:
     ?tienda=litlejacob  ·  ?tienda=rayas  (se recuerda en este navegador)  ·  ?tienda=auto (volver al dominio)
   Este archivo va PRIMERO en el <head>, antes que todos los demás. */
(function () {
  "use strict";
  var AJUSTES = {
    rayas: {
      id: "rayas",
      nombre: "Rayas Store",
      nombreMayus: "RAYAS STORE",
      logo1: "RAYAS", logo2: "STORE",   // logo en texto de la cabecera
      dominio: "rayas.trade",
      url: "https://rayas.trade",
      wa: "51900049694",
      logo: "img/logo-v2.webp",
      codigo: "RY",                 // prefijo de los pedidos (RY-…)
      clientePrefijo: "r_",         // customers/r_<uid>
      correoPrueba: "prueba.rayas.trade",
      colorTema: "#0a1230",
      estadisticas: "1e5c6386f46a47bda6fc268f6182b9d4",   // Cloudflare Web Analytics (código público, no es secreto)
      // Claves del navegador: se mantienen las de siempre para que nadie pierda su sesión ni su carrito.
      claves: {
        sesion: "rayas_admin_ses",
        carro: "rayas_carro_v1",
        items: "rayas_items_guardados_v2",
        mmCostos: "rayas_mm_costos",
        setsCarro: "rayas_sets_carrito",
        setsCat: "rayas_sets_guardados_v1",
        tema: "rayas_tema",
        temporada: "rayas_temporada"
      },
      // Secciones y opciones que existen solo en una tienda.
      tiene: {
        compro: false,
        rifasPausa: false,
        setsPorCuenta: true,
        setsPromo: false,
        setsLotes: false,
        setsCofres: false
      }
    },
    litlejacob: {
      id: "litlejacob",
      nombre: "LitleJacob Store",
      nombreMayus: "LITLEJACOB STORE",
      logo1: "LITLEJACOB", logo2: "STORE",
      inicioSub: "Sets Caché, compra y venta de items y rifas de Dota 2. Precios en soles y entrega por Steam.",   // frase de la portada (se puede cambiar en el panel)
      dominio: "litlejacob.trade",
      url: "https://litlejacob.trade",
      wa: "51952997030",
      logo: "lj/favicon.png",
      codigo: "LJ",
      clientePrefijo: "",
      correoPrueba: "prueba.litlejacob.trade",
      colorTema: "#0b0505",
      estadisticas: "e08cf8b40ae04fa7abbcdbdf29e6cdea",
      claves: {
        sesion: "lj_rifas_ses",
        carro: "lj_carro_items_v1",
        items: "lj_items_guardados_v2",
        mmCostos: "lj_mm_costos",
        setsCarro: "litlejacob_cart_v1",
        setsCat: "lj_sets_guardados_v1",
        tema: "lj_tema",
        temporada: "lj_temporada"
      },
      tiene: {
        compro: true,
        rifasPausa: true,          // si se apagan las rifas, página "Rifas en pausa"
        setsPorCuenta: false,
        setsPromo: true,
        setsLotes: true,
        setsCofres: true
      }
    }
  };

  function elegir() {
    var porDominio = /litlejacob/i.test(location.hostname) ? "litlejacob" : "rayas";
    var q = (location.search.match(/[?&]tienda=([a-z]+)/) || [])[1];
    try {
      if (q === "auto") localStorage.removeItem("tienda_forzada");
      else if (AJUSTES[q]) localStorage.setItem("tienda_forzada", q);
      var f = localStorage.getItem("tienda_forzada");
      if (AJUSTES[f]) return f;
    } catch (e) { if (AJUSTES[q]) return q; }
    return porDominio;
  }

  var T = AJUSTES[elegir()];
  T.esLJ = T.id === "litlejacob";
  T.esRayas = T.id === "rayas";
  T.otra = AJUSTES[T.esLJ ? "rayas" : "litlejacob"];
  window.TIENDA = T;
  document.documentElement.setAttribute("data-tienda", T.id);

  /* Estadísticas de Cloudflare: cada tienda tiene su propio código (solo en los dominios reales). */
  if (/(^|\.)(rayas|litlejacob)\.trade$/i.test(location.hostname)) document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("script"); b.type = "module"; b.defer = true;
    b.src = "https://static.cloudflareinsights.com/beacon.min.js";
    b.setAttribute("data-cf-beacon", JSON.stringify({ token: T.estadisticas }));
    document.body.appendChild(b);
  });

  /* El index.html trae los datos de Rayas (título, íconos, manifest). En LitleJacob se cambian aquí.
     OJO: WhatsApp y Google no corren JavaScript; para ellos la vista previa de cada dominio se arregla en Cloudflare. */
  if (T.esLJ) document.addEventListener("DOMContentLoaded", function () {
    document.title = document.title.replace(/Rayas Store/g, T.nombre);
    var cambiar = function (sel, attr, val) { var el = document.querySelector(sel); if (el) el.setAttribute(attr, val); };
    cambiar('meta[name="theme-color"]', "content", T.colorTema);
    cambiar('link[rel="manifest"]', "href", "lj/manifest.webmanifest");
    cambiar('link[rel="canonical"]', "href", T.url + "/");
    cambiar('link[rel="apple-touch-icon"]', "href", "lj/apple-touch-icon.png");
    var ic = document.querySelectorAll('link[rel="icon"]');
    for (var i = 0; i < ic.length; i++) ic[i].setAttribute("href", /192/.test(ic[i].getAttribute("sizes") || "") ? "lj/icon-192.png" : "lj/favicon.png");
  });
})();
