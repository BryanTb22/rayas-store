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
  function bajar(id) {
    return fetch(DOC + id).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var u = d && d.fields && d.fields.data && d.fields.data.stringValue;
      if (!u || !VALIDA.test(u)) return null;
      if (!guarda) return u;
      try { var b = aBlob(u); guardar(id, b); return URL.createObjectURL(b); } catch (e) { return u; }
    });
  }
  // Devuelve una promesa con la dirección de la foto (o null si no existe). Pide cada foto una sola vez.
  window.fotoFs = function (id) {
    id = String(id || "");
    if (!/^img-[\w\-]+$/.test(id)) return Promise.resolve(null);
    if (MEM[id]) return Promise.resolve(MEM[id]);
    if (!PEND[id]) PEND[id] = leerGuardada(id).then(function (b) { return b ? URL.createObjectURL(b) : bajar(id); })
      .then(function (u) { if (u) MEM[id] = u; return u || null; })
      .catch(function () { return null; });
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
})();
