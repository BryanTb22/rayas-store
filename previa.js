/* Previsualización en el juego: fotos de cómo se ve un item dentro de Dota 2.
   - Cada versión del item (documento de rayas_items) puede tener el campo "previas": lista de fotos "fs:img-…" (hasta 6).
   - Si tiene fotos, al lado de la gema sale un ojito. Al tocarlo se abre este visor.
   - Las fotos solo se bajan al abrir el visor (y quedan guardadas en el navegador gracias a fotos.js).
   Archivo igual en Rayas y LitleJacob. */
(function () {
  "use strict";
  if (window.previa) return;
  var MAX = 6;
  var DOC = "https://firestore.googleapis.com/v1/projects/litlejacob-store/databases/(default)/documents/rayas/";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var valida = function (r) { return /^fs:img-[\w\-]+$/.test(String(r || "")); };
  var OJO = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4" fill="currentColor"/></svg>';

  // Lista limpia de fotos de un item (o de una lista).
  function lista(x) {
    var l = Array.isArray(x) ? x : (x && x.previas) || [];
    return l.filter(valida).slice(0, MAX);
  }
  // Lee el campo "previas" de un documento de Firestore.
  function deCampo(f) {
    var v = f && f.arrayValue && f.arrayValue.values;
    return Array.isArray(v) ? lista(v.map(function (o) { return o && o.stringValue; })) : [];
  }
  // Campo "previas" para guardar en Firestore (null = no guardar el campo: sin previsualización).
  function aCampo(l) {
    l = lista(l);
    return l.length ? { arrayValue: { values: l.map(function (r) { return { stringValue: r }; }) } } : null;
  }
  // Botón con el ojito. modo "chip" = redondito (tabla de ofertas); "pill" = con texto (recuadro de arriba).
  function ojo(it, modo) {
    var l = lista(it); if (!l.length) return "";
    var t = (it && it.nombre) || "";
    return '<button type="button" class="pv-ojo' + (modo === "pill" ? " pv-pill" : "") + '" data-pv="' + esc(l.join("|")) + '" data-pv-t="' + esc(t) + '" title="Ver cómo se ve en el juego" aria-label="Ver cómo se ve en el juego (' + l.length + (l.length === 1 ? ' foto' : ' fotos') + ')">' +
      OJO + (modo === "pill" ? '<span>Ver en el juego</span>' : '') + (l.length > 1 ? '<i>' + l.length + '</i>' : '') + '</button>';
  }

  /* ---- Fotos: con fotos.js salen guardadas del navegador; sin él, se piden a Firestore ---- */
  var MEM = {};
  function foto(ref) {
    var id = String(ref).slice(3);
    if (window.fotoFs) return window.fotoFs(id);
    if (!MEM[id]) MEM[id] = fetch(DOC + id).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var u = d && d.fields && d.fields.data && d.fields.data.stringValue;
      return u && /^data:image\/(webp|jpeg|png);base64,/.test(u) ? u : null;
    }).catch(function () { delete MEM[id]; return null; });
    return MEM[id];
  }

  /* ---- Visor ---- */
  var V = null;
  function abrir(refs, titulo, desde) {
    refs = lista(refs); if (!refs.length) return;
    cerrar();
    var ov = document.createElement("div");
    ov.className = "pv-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Cómo se ve en el juego");
    var varias = refs.length > 1;
    ov.innerHTML = '<div class="pv-box">' +
      '<div class="pv-top"><div class="pv-tit"><small>' + OJO + ' Vista en el juego</small><b>' + esc(titulo || "") + '</b></div>' +
      (varias ? '<span class="pv-num"></span>' : '') + '<button type="button" class="pv-x" aria-label="Cerrar">✕</button></div>' +
      '<div class="pv-esc">' +
      (varias ? '<button type="button" class="pv-fl pv-ant" aria-label="Foto anterior">‹</button>' : '') +
      '<div class="pv-img"><span class="pv-carga" aria-hidden="true"></span><img alt="" draggable="false"></div>' +
      (varias ? '<button type="button" class="pv-fl pv-sig" aria-label="Foto siguiente">›</button>' : '') + '</div>' +
      (varias ? '<div class="pv-dots">' + refs.map(function (_, i) { return '<button type="button" data-i="' + i + '" aria-label="Foto ' + (i + 1) + '"></button>'; }).join("") + '</div>' : '') +
      '</div>';
    var antes = document.activeElement, raiz = document.documentElement, ovAntes = raiz.style.overflow;
    V = { ov: ov, refs: refs, i: 0, titulo: titulo || "", antes: antes, ovAntes: ovAntes };
    document.body.appendChild(ov);
    raiz.style.overflow = "hidden";
    var img = ov.querySelector(".pv-img img"), caja = ov.querySelector(".pv-img");
    function ir(n) {
      if (!V) return;
      var k = (n + refs.length) % refs.length; V.i = k;
      var num = ov.querySelector(".pv-num"); if (num) num.textContent = (k + 1) + " / " + refs.length;
      var ds = ov.querySelectorAll(".pv-dots button"); for (var j = 0; j < ds.length; j++) ds[j].classList.toggle("on", j === k);
      caja.classList.add("cargando"); caja.classList.remove("error");
      img.alt = (V.titulo ? V.titulo + " — " : "") + "en el juego (" + (k + 1) + " de " + refs.length + ")";
      foto(refs[k]).then(function (u) {
        if (!V || V.i !== k) return;
        if (!u) { caja.classList.remove("cargando"); caja.classList.add("error"); img.removeAttribute("src"); return; }
        img.onload = function () { if (V && V.i === k) caja.classList.remove("cargando"); };
        img.src = u;
        if (img.complete && img.naturalWidth) caja.classList.remove("cargando");
      });
      // Deja lista la siguiente y la anterior para pasar sin esperar.
      if (refs.length > 1) { foto(refs[(k + 1) % refs.length]); foto(refs[(k - 1 + refs.length) % refs.length]); }
    }
    V.ir = ir;
    ov.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest(".pv-x")) return cerrar();
      if (t.closest(".pv-ant")) return ir(V.i - 1);
      if (t.closest(".pv-sig")) return ir(V.i + 1);
      var d = t.closest(".pv-dots button"); if (d) return ir(Number(d.getAttribute("data-i")));
      // Tocar afuera de la foto (fondo oscuro) cierra.
      if (V && V.desliz) { V.desliz = false; return; }
      if (t === ov || t.classList.contains("pv-box") || t.classList.contains("pv-esc") || t.classList.contains("pv-img")) cerrar();
    });
    // Deslizar con el dedo (o arrastrar con el mouse) para pasar de foto.
    var ini = null;
    var esc_ = ov.querySelector(".pv-esc");
    esc_.addEventListener("pointerdown", function (e) { if (e.target.closest(".pv-fl")) return; ini = { x: e.clientX, y: e.clientY }; });
    esc_.addEventListener("pointerup", function (e) {
      if (!ini || refs.length < 2) { ini = null; return; }
      var dx = e.clientX - ini.x, dy = e.clientY - ini.y; ini = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) { V.desliz = true; ir(V.i + (dx < 0 ? 1 : -1)); setTimeout(function () { if (V) V.desliz = false; }, 350); }
    });
    esc_.addEventListener("pointercancel", function () { ini = null; });
    window.addEventListener("keydown", tecla, true);
    ir(Math.max(0, Math.min(refs.length - 1, Number(desde) || 0)));
    requestAnimationFrame(function () { ov.classList.add("on"); var x = ov.querySelector(".pv-x"); if (x) x.focus(); });
  }
  function tecla(e) {
    if (!V) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cerrar(); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); e.stopImmediatePropagation(); V.ir(V.i + 1); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); e.stopImmediatePropagation(); V.ir(V.i - 1); return; }
    // El foco no se escapa del visor con Tab.
    if (e.key === "Tab") {
      var f = V.ov.querySelectorAll("button"); if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      else if (!V.ov.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
    }
  }
  function cerrar() {
    if (!V) return;
    var v = V; V = null;
    window.removeEventListener("keydown", tecla, true);
    document.documentElement.style.overflow = v.ovAntes || "";
    if (v.ov.parentNode) v.ov.parentNode.removeChild(v.ov);
    try { if (v.antes && v.antes.focus && document.contains(v.antes)) v.antes.focus({ preventScroll: true }); } catch (e) { /* nada */ }
  }
  // El ojito funciona en cualquier parte de la página: se atiende antes que el clic de la fila (que abre la versión).
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-pv]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    abrir(String(b.getAttribute("data-pv") || "").split("|"), b.getAttribute("data-pv-t") || "", 0);
  }, true);
  // Enter / espacio sobre el ojito no deben activar la fila que lo contiene.
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target && e.target.closest && e.target.closest("[data-pv]")) e.stopPropagation();
  }, true);

  /* ---- Admin: prepara la foto para subir (sin recortar, máximo 1280 px, WEBP liviano) ---- */
  function comprimir(file) {
    return new Promise(function (ok, fail) {
      if (!file || !/^image\//.test(file.type)) return fail(new Error("Elige un archivo de imagen (JPG, PNG o WEBP)."));
      var url = URL.createObjectURL(file), im = new Image();
      im.onerror = function () { URL.revokeObjectURL(url); fail(new Error("No se pudo leer la imagen.")); };
      im.onload = function () {
        URL.revokeObjectURL(url);
        var w = im.naturalWidth, h = im.naturalHeight, sc = Math.min(1, 1280 / Math.max(w, h));
        var cv = document.createElement("canvas"); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
        var g = cv.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(im, 0, 0, cv.width, cv.height);
        // WEBP si el navegador lo sabe hacer; si no (iPhone viejo), JPG.
        var tipo = cv.toDataURL("image/webp", 0.8).indexOf("data:image/webp") === 0 ? "image/webp" : "image/jpeg";
        var q = 0.8, data = cv.toDataURL(tipo, q);
        while (data.length > 400000 && q > 0.35) { q -= 0.1; data = cv.toDataURL(tipo, q); }
        if (data.length > 900000) return fail(new Error("La foto es demasiado pesada. Prueba con otra."));
        ok(data);
      };
      im.src = url;
    });
  }

  window.previa = { MAX: MAX, lista: lista, deCampo: deCampo, aCampo: aCampo, ojo: ojo, abrir: abrir, cerrar: cerrar, comprimir: comprimir, valida: valida };
})();
