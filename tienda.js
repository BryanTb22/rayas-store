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
      dominio: "rayas.trade",
      url: "https://rayas.trade",
      wa: "51900049694",
      logo: "img/logo-v2.webp",
      codigo: "RY",                 // prefijo de los pedidos (RY-…)
      clientePrefijo: "r_",         // customers/r_<uid>
      correoPrueba: "prueba.rayas.trade",
      colorTema: "#0a1230",
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
      dominio: "litlejacob.trade",
      url: "https://litlejacob.trade",
      wa: "51952997030",
      logo: "favicon.png",
      codigo: "LJ",
      clientePrefijo: "",
      correoPrueba: "prueba.litlejacob.trade",
      colorTema: "#0b0505",
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
})();
