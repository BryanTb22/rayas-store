/* Fotos subidas (documentos rayas/img-… de Firestore).
   Antes se bajaban en cada visita y se metían como texto gigante (base64) dentro de la página.
   Ahora:
   - La primera vez se bajan igual y se guardan en el navegador (Cache Storage).
   - Las siguientes visitas salen de ahí, sin internet.
   - En la página se usa un enlace corto (blob:) en vez del texto gigante, así cada clic arma la página mucho más rápido.
   Cada foto subida tiene un id nuevo (img-…), así que lo guardado nunca queda viejo.
   Si el navegador no permite guardar, todo funciona como antes. Archivo igual en Rayas y LitleJacob. */
(function () {
  "use strict";
  if (window.fotoFs) return;
  var DOC = "https://firestore.googleapis.com/v1/projects/litlejacob-store/databases/(default)/documents/rayas/";
  var CAJA = "fotos-fs-v1";
  var MEM = {}, PEND = {};
  var guarda = false;
  try { guarda = !!(window.caches && window.isSecureContext && window.URL && URL.createObjectURL && window.Blob && window.atob); } catch (e) { guarda = false; }
  var VALIDA = /^data:image\/(webp|jpeg|png);base64,/;
  var clave = function (id) { return location.origin + "/__fotos-fs/" + id; };

  function aBlob(dataUrl) {
    var coma = dataUrl.indexOf(","), tipo = dataUrl.slice(5, dataUrl.indexOf(";")), bin = atob(dataUrl.slice(coma + 1));
    var n = bin.length, u8 = new Uint8Array(n);
    for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: tipo });
  }
  function leerGuardada(id) {
    if (!guarda) return Promise.resolve(null);
    return caches.open(CAJA).then(function (c) { return c.match(clave(id)); })
      .then(function (r) { return r ? r.blob() : null; })
      .then(function (b) { return b && b.size > 0 && /^image\//.test(b.type) ? b : null; })
      .catch(function () { return null; });
  }
  function guardar(id, blob) {
    if (!guarda) return;
    try {
      caches.open(CAJA).then(function (c) { return c.put(clave(id), new Response(blob, { headers: { "Content-Type": blob.type } })); }).catch(function () { /* sin espacio: no pasa nada */ });
    } catch (e) { /* nada */ }
  }
  var espera = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
  // Baja la foto de Firestore. Si falla por un corte o porque Firestore está ocupado, reintenta (hasta 3 veces).
  function bajar(id, intento) {
    intento = intento || 0;
    return fetch(DOC + id).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (d) {
      var u = d && d.fields && d.fields.data && d.fields.data.stringValue;
      if (!u || !VALIDA.test(u)) return null;
      if (!guarda) return u;
      try { var b = aBlob(u); guardar(id, b); return URL.createObjectURL(b); } catch (e) { return u; }
    }).catch(function () {
      if (intento >= 3) return null;
      return espera([1200, 3000, 7000][intento]).then(function () { return bajar(id, intento + 1); });
    });
  }
  // Devuelve una promesa con la dirección de la foto (o null si no existe). Pide cada foto una sola vez.
  window.fotoFs = function (id) {
    id = String(id || "");
    if (!/^img-[\w\-]+$/.test(id)) return Promise.resolve(null);
    if (MEM[id]) return Promise.resolve(MEM[id]);
    if (!PEND[id]) PEND[id] = leerGuardada(id).then(function (b) { return b ? URL.createObjectURL(b) : bajar(id); })
      .then(function (u) { if (u) MEM[id] = u; else delete PEND[id]; return u || null; })   // si no salió, se puede volver a pedir
      .catch(function () { delete PEND[id]; return null; });
    return PEND[id];
  };
  // La dirección si ya está lista (para dibujarla de frente sin esperar).
  window.fotoFsYa = function (id) { return MEM[String(id || "")] || ""; };
  // Llama a fn cuando la foto esté por aparecer en pantalla (o al toque si ya está guardada o el navegador es viejo).
  // Así no se bajan las fotos de más abajo hasta que el cliente se acerque a ellas.
  var VER = null, ESPERA = typeof Map === "function" ? new Map() : null;
  try {
    if (window.IntersectionObserver && ESPERA) VER = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (!e.isIntersecting) return;
        VER.unobserve(e.target);
        var fn = ESPERA.get(e.target); ESPERA.delete(e.target);
        if (fn) fn();
      });
    }, { rootMargin: "800px 0px" });
  } catch (e) { VER = null; }
  function limpiar() {   // suelta las fotos que ya no están en la página (la página se redibuja seguido)
    ESPERA.forEach(function (fn, el) { if (!el.isConnected) { VER.unobserve(el); ESPERA.delete(el); } });
  }
  // Respaldo: algunos navegadores (pestaña en segundo plano, navegadores dentro de otras apps) no avisan
  // cuando algo aparece en pantalla. Cada tanto se revisa a mano qué fotos ya están cerca de la pantalla.
  var REVISA = null;
  function revisar() {
    REVISA = null;
    var alto = window.innerHeight || 800;
    ESPERA.forEach(function (fn, el) {
      if (!el.isConnected) { VER.unobserve(el); ESPERA.delete(el); return; }
      var r = el.getBoundingClientRect();
      if ((r.width || r.height) && r.bottom > -800 && r.top < alto + 800) { VER.unobserve(el); ESPERA.delete(el); fn(); }
    });
    if (ESPERA.size) REVISA = setTimeout(revisar, 1500);
  }
  window.fotoFsVer = function (el, id, fn) {
    if (!VER || MEM[id] || !el || !el.isConnected) { fn(); return; }
    if (ESPERA.size > 200) limpiar();
    ESPERA.set(el, fn); VER.observe(el);
    if (!REVISA) REVISA = setTimeout(revisar, 700);
  };
  // Red de seguridad: cada pocos segundos busca fotos que están en pantalla y quedaron vacías o rotas
  // (por un fallo de red o una foto guardada dañada) y las vuelve a poner. Antes quedaban en blanco hasta recargar.
  var NUEVA = {}, ROTAS = {};   // dirección vieja (rota) → dirección nueva
  function ponerFoto(id, u) {
    var t = document.querySelectorAll('img[data-fs="' + id + '"]');
    for (var i = 0; i < t.length; i++) if (t[i].getAttribute("src") !== u) t[i].src = u;
  }
  function arreglarRota(el) {
    var id = el.getAttribute("data-fs"), viejo = el.getAttribute("src") || "";
    if (!id) return;
    if (NUEVA[viejo]) { el.src = NUEVA[viejo]; return; }
    if (ROTAS[id]) return;   // ya se está arreglando (o ya se intentó)
    ROTAS[id] = 1;
    delete MEM[id]; delete PEND[id];
    var listo = function () { bajar(id).then(function (u) { if (!u) return; MEM[id] = u; if (viejo) NUEVA[viejo] = u; ponerFoto(id, u); }); };
    if (guarda) caches.open(CAJA).then(function (c) { return c.delete(clave(id)); }).then(listo, listo); else listo();
  }
  document.addEventListener("error", function (e) {
    var el = e.target;
    if (el && el.tagName === "IMG" && el.hasAttribute("data-fs") && el.getAttribute("src")) arreglarRota(el);
  }, true);
  function barrer() {
    if (document.hidden) return;
    var alto = window.innerHeight || 800, t = document.querySelectorAll("img[data-fs]");
    for (var i = 0; i < t.length; i++) (function (el) {
      var src = el.getAttribute("src");
      if (src && !(el.complete && el.naturalWidth === 0)) return;   // tiene foto y cargó bien
      if (el.complete === false && src) return;                       // todavía cargando
      var r = el.getBoundingClientRect();
      if (!(r.width || r.height) || r.bottom < -400 || r.top > alto + 400) return;
      var id = el.getAttribute("data-fs");
      if (src) { arreglarRota(el); return; }
      if (MEM[id]) { el.src = MEM[id]; return; }
      if (ESPERA && ESPERA.has(el)) return;                             // ya está en la fila normal
      window.fotoFs(id).then(function (u) { if (u) ponerFoto(id, u); });
    })(t[i]);
  }
  setInterval(barrer, 2500);
  // Mientras una foto no está, no se muestra su texto alternativo (salía cortado encima del fondo).
  try {
    var st = document.createElement("style");
    st.textContent = "img[data-fs]:not([src]){color:transparent;font-size:0}";
    (document.head || document.documentElement).appendChild(st);
  } catch (e) { /* nada */ }
})();
