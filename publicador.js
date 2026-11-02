/* =====================================================================
   GENERADOR DE PUBLICACIONES (Rayas Store · solo administrador)
   Arma la imagen de venta 1080x1350 con el estilo de Rayas (azul, amarillo, fucsia) y
   3 textos para WhatsApp. Todo en el navegador con <canvas>, sin servidor.
   Se abre desde Panel admin → 🖼 Publicaciones (app.js lo carga).
   ===================================================================== */
(function () {
  "use strict";
  if (window.rayasPublicador) return;

  var W = 1080, H = 1350;
  var C = {
    blood: "#ff2d8f", bloodHi: "#ff2d8f", steel: "#ffe08a", steelHi: "#fff4cf",
    steelLo: "#ffc93c", dim: "#9ba7d8", caja: "#0b1430", borde: "#6b5624"
  };

  var st = {
    raiz: null, abierto: false, slot: "juego", copiado: "",
    img: { juego: null, oficial: null, logo: null },
    d: { tipo: "", nombre: "", precio: "", steam: "", stock: "1", entrega: "Entrega inmediata", px: 50, py: 50 }
  };

  /* ---------- utilidades ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v) { var n = parseFloat(String(v || "").replace(",", ".").replace(/[^\d.]/g, "")); return isFinite(n) ? n : null; }
  function sol(v) { var n = num(v); return n == null ? "" : "S/ " + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ""); }
  function stockN() { var n = parseInt(st.d.stock, 10); return isFinite(n) && n > 0 ? n : 1; }
  function slug(s) { return (String(s || "publicacion").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "publicacion"); }
  function cargarImg(src) {
    return new Promise(function (ok, mal) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = mal; i.src = src; });
  }

  /* ---------- fuentes ---------- */
  var fuentesListas = null;
  function fuentes() {
    if (fuentesListas) return fuentesListas;
    var ps = [];
    try { ps.push(document.fonts.load("600 40px Teko")); } catch (e) { /* nada */ }
    try { ps.push(document.fonts.load("700 26px Barlow")); } catch (e) { /* nada */ }
    fuentesListas = Promise.all(ps.map(function (p) { return p.catch(function () {}); }));
    return fuentesListas;
  }
  function osw(px, w) { return ((w || 700) >= 700 ? 600 : 500) + " " + Math.round(px * 1.12) + "px Teko, Impact, 'Arial Narrow', sans-serif"; }

  /* ---------- dibujo ---------- */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // dibuja la imagen cubriendo el rectángulo (como object-fit: cover) con punto de enfoque px/py (0-100)
  function cubrir(ctx, img, x, y, w, h, px, py) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
    var sx = (iw - sw) * (px == null ? 50 : px) / 100, sy = (ih - sh) * (py == null ? 50 : py) / 100;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  function anchoEsp(ctx, txt, sp) { var t = 0; for (var i = 0; i < txt.length; i++) t += ctx.measureText(txt[i]).width; return t + sp * Math.max(0, txt.length - 1); }
  function espaciado(ctx, cx, y, txt, sp) {
    var x = cx - anchoEsp(ctx, txt, sp) / 2; ctx.textAlign = "left";
    for (var i = 0; i < txt.length; i++) { ctx.fillText(txt[i], x, y); x += ctx.measureText(txt[i]).width + sp; }
  }
  function acero(ctx, y0, y1) { var g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, C.steelHi); g.addColorStop(1, C.steelLo); return g; }
  function ajustar(ctx, txt, max, px, w) { while (px > 30) { ctx.font = osw(px, w); if (ctx.measureText(txt).width <= max) break; px -= 2; } return px; }

  function dibujar(cv) {
    var ctx = cv.getContext("2d"), d = st.d, juego = st.img.juego, ofi = st.img.oficial, base = juego || ofi;
    ctx.textBaseline = "middle"; ctx.shadowColor = "transparent";

    // fondo: foto difuminada (se reduce y se vuelve a ampliar: funciona en todos los navegadores)
    ctx.fillStyle = "#050a1c"; ctx.fillRect(0, 0, W, H);
    if (base) {
      var t = document.createElement("canvas"); t.width = 54; t.height = 68;
      var tc = t.getContext("2d"); cubrir(tc, base, 0, 0, 54, 68, 50, 50);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(t, 0, 0, W, H);
      ctx.fillStyle = "rgba(5,10,28,.62)"; ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = "rgba(10,20,60,.45)"; ctx.fillRect(0, 0, W, H);
    var vg = ctx.createRadialGradient(W / 2, H * 0.45, 200, W / 2, H * 0.5, 900);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(5,10,28,.92)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // cabecera: logo + RAYAS STORE
    ctx.font = osw(62, 700);
    var t1 = "RAYAS ", t2 = "STORE", w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width;
    var lx = Math.round((W - (92 + 24 + w1 + w2)) / 2), ly = 52;
    rr(ctx, lx - 3, ly - 3, 98, 98, 16); ctx.fillStyle = "#ffc93c"; ctx.fill();
    if (st.img.logo) { ctx.save(); rr(ctx, lx, ly, 92, 92, 14); ctx.clip(); ctx.drawImage(st.img.logo, lx, ly, 92, 92); ctx.restore(); }
    var tx = lx + 116; ctx.textAlign = "left";
    ctx.fillStyle = acero(ctx, ly + 18, ly + 76); ctx.fillText(t1, tx, ly + 48);
    ctx.fillStyle = C.bloodHi; ctx.fillText(t2, tx + w1, ly + 48);

    // subtítulo y título
    var tipo = (d.tipo || "Item de Dota 2").toUpperCase();
    ctx.font = osw(ajustar(ctx, tipo, 900, 32, 600) , 600); ctx.fillStyle = C.bloodHi;
    var sp = 10; while (sp > 2 && anchoEsp(ctx, tipo, sp) > 920) sp--;
    espaciado(ctx, W / 2, 214, tipo, sp);
    var nom = (d.nombre || "Nombre del item").toUpperCase();
    var fp = ajustar(ctx, nom, 960, 104, 700);
    ctx.font = osw(fp, 700); ctx.textAlign = "center";
    ctx.fillStyle = acero(ctx, 296 - fp * 0.38, 296 + fp * 0.38); ctx.fillText(nom, W / 2, 296);

    // recuadro con la foto principal
    var ix = 60, iy = 400, iw = 960, ih = 630;
    ctx.save(); ctx.shadowColor = "rgba(255,45,143,.6)"; ctx.shadowBlur = 60;
    rr(ctx, ix, iy, iw, ih, 24); ctx.fillStyle = "#0b1430"; ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, ix, iy, iw, ih, 24); ctx.clip();
    if (base) cubrir(ctx, base, ix, iy, iw, ih, d.px, d.py);
    else {
      ctx.fillStyle = "#0f1a3c"; ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = C.dim; ctx.font = osw(40, 500); ctx.textAlign = "center"; ctx.fillText("SUBE LA FOTO IN-GAME", W / 2, iy + ih / 2);
    }
    ctx.restore();
    rr(ctx, ix + 1.5, iy + 1.5, iw - 3, ih - 3, 23); ctx.lineWidth = 3; ctx.strokeStyle = "#ffc93c"; ctx.stroke();
    if (juego) {
      ctx.font = osw(26, 600); var lab = "VISTA IN GAME", lw = ctx.measureText(lab).width;
      rr(ctx, ix + 20, iy + 20, lw + 36, 44, 10); ctx.fillStyle = "#070d24"; ctx.fill();
      ctx.fillStyle = C.steelHi; ctx.textAlign = "left"; ctx.fillText(lab, ix + 38, iy + 43);
    }
    // miniatura oficial (solo si hay foto in-game y foto oficial)
    if (juego && ofi) {
      var mw = 300, mh = 198, mx = ix + iw - mw - 20, my = iy + ih - mh - 20;
      rr(ctx, mx - 4, my - 4, mw + 8, mh + 8, 16); ctx.fillStyle = C.steel; ctx.fill();
      ctx.save(); rr(ctx, mx, my, mw, mh, 13); ctx.clip(); cubrir(ctx, ofi, mx, my, mw, mh, 50, 50); ctx.restore();
    }

    // precios
    var py = 1062, hayS = num(d.steam) != null, pw = hayS ? 540 : 960, pcx = 60 + pw / 2;
    rr(ctx, 61, py + 1, pw - 2, 148, 20); ctx.fillStyle = C.caja; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.borde; ctx.stroke();
    ctx.font = osw(28, 500); ctx.fillStyle = C.steel; espaciado(ctx, pcx, py + 34, "PRECIO", 8);
    var pr = sol(d.precio) || "S/ --"; ctx.font = osw(92, 700); ctx.textAlign = "center";
    ctx.fillStyle = acero(ctx, py + 62, py + 134); ctx.fillText(pr, pcx, py + 100);
    if (hayS) {
      rr(ctx, 631, py + 1, 388, 148, 20); ctx.fillStyle = C.caja; ctx.fill(); ctx.strokeStyle = C.borde; ctx.stroke();
      ctx.font = osw(28, 500); ctx.fillStyle = C.dim; espaciado(ctx, 825, py + 34, "EN STEAM", 8);
      var sv = sol(d.steam); ctx.font = osw(56, 600); ctx.textAlign = "center"; ctx.fillStyle = C.dim; ctx.fillText(sv, 825, py + 98);
      var swd = ctx.measureText(sv).width; ctx.fillStyle = C.bloodHi; ctx.fillRect(825 - swd / 2 - 6, py + 97, swd + 12, 5);
    }

    // pastilla fucsia
    var pill = ((d.entrega || "Entrega inmediata") + " · " + (stockN() === 1 ? "Solo 1" : "Stock: " + stockN())).toUpperCase();
    var pyy = 1234, pW = 760;
    ctx.font = osw(34, 700); var psp = 3;
    while (anchoEsp(ctx, pill, psp) > 900) { if (psp > 0) psp--; else { var fz = parseInt(ctx.font, 10) - 2; ctx.font = osw(fz, 700); } }
    pW = Math.max(760, Math.min(980, anchoEsp(ctx, pill, psp) + 90));
    var pg = ctx.createLinearGradient((W - pW) / 2, 0, (W + pW) / 2, 0); pg.addColorStop(0, "#c2136c"); pg.addColorStop(1, "#ff2d8f");
    rr(ctx, (W - pW) / 2, pyy, pW, 70, 35); ctx.fillStyle = pg; ctx.fill();
    ctx.fillStyle = "#fff"; espaciado(ctx, W / 2, pyy + 37, pill, psp);

    ctx.font = "700 26px Barlow, system-ui, sans-serif"; ctx.fillStyle = C.steelHi; espaciado(ctx, W / 2, 1323, "rayas.trade", 4);
  }

  /* ---------- textos de WhatsApp ---------- */
  function textos() {
    var d = st.d, nom = (d.nombre || "Nombre del item").trim(), tipo = (d.tipo || "").trim(), pr = sol(d.precio) || "S/ --";
    var stl = num(d.steam) != null ? sol(d.steam) : "", n = stockN(), ent = (d.entrega || "Entrega inmediata").trim();
    var firma = "🛒 *Rayas Store* · rayas.trade";
    var stockTxt = n === 1 ? "*ÚLTIMA UNIDAD*: solo 1 en stock" : "Stock limitado: *" + n + " unidades*";
    var a = "🔥 *" + (tipo ? tipo.toUpperCase() + " – " : "") + nom.toUpperCase() + "* 🔥\n\n" +
      "💰 Solo *" + pr + "*" + (stl ? " (en Steam está a " + stl + ")" : "") + "\n" +
      "⚡ " + ent + "\n⚠️ " + stockTxt + "\n\n" +
      "📩 Escríbeme al privado y es tuyo. ¡El primero que pague se lo lleva!\n" + firma;
    var b = "⚔️ *" + nom + "*" + (tipo ? " (" + tipo + ")" : "") + " – *" + pr + "*\n" +
      "⚡ " + ent + " | ⚠️ " + (n === 1 ? "Solo 1 en stock" : n + " en stock") + "\n📩 Escríbeme al DM · *Rayas Store*";
    var c = "✨ *¿Buscas " + (tipo ? tipo.toLowerCase() : "algo nuevo para tu Dota") + "?* ✨\n\n" +
      "Tengo *" + nom + "* a solo *" + pr + "* 💰\n\n" +
      (stl ? "✅ Más barato que en Steam (" + stl + ")\n" : "") + "✅ " + ent + "\n" +
      "⚠️ " + (n === 1 ? "*Solo queda 1* – cuando se va, se fue" : "*Solo " + n + " disponibles*") + "\n\n" +
      "📩 Escríbeme al privado para separarlo 👇\n" + firma;
    return [["Urgencia", a], ["Corto y directo", b], ["Más vendedor", c]];
  }

  /* ---------- interfaz ---------- */
  var CSS = "" +
    "#rayasPub{position:fixed;inset:0;z-index:2147483000;background:rgba(5,10,28,.84);backdrop-filter:blur(6px);overflow:auto;-webkit-overflow-scrolling:touch;font-family:Barlow,system-ui,sans-serif;color:#eef1ff}" +
    "#rayasPub[hidden]{display:none}" +
    "#rayasPub .pb-box{max-width:1180px;margin:0 auto;padding:0 16px 40px}" +
    "#rayasPub .pb-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;margin:0 -16px 16px;background:linear-gradient(180deg,#0f1a3c,#0b1430);border-bottom:1px solid #1e2c5c}" +
    "#rayasPub h2{margin:0;font:600 22px/1.1 Teko,Impact,sans-serif;letter-spacing:.04em;text-transform:uppercase}#rayasPub h2 b{color:#ffc93c;font-weight:600}" +
    "#rayasPub .pb-grid{display:grid;gap:18px}@media(min-width:900px){#rayasPub .pb-grid{grid-template-columns:minmax(0,1fr) minmax(0,440px);align-items:start}#rayasPub .pb-prev{position:sticky;top:78px}}" +
    "#rayasPub .pb-grp{display:grid;gap:12px;padding:16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}" +
    "#rayasPub .pb-grp h3{margin:0;font:600 18px/1.15 Teko,Impact,sans-serif;letter-spacing:.05em;text-transform:uppercase;color:#ffc93c}" +
    "#rayasPub label{display:grid;gap:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffe08a}" +
    "#rayasPub input[type=text],#rayasPub input[type=number]{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid #2a3a70;background:#070d24;color:#eef1ff;font:500 16px Barlow,system-ui,sans-serif;text-transform:none;letter-spacing:0}" +
    "#rayasPub input:focus{outline:2px solid #ff2d8f;outline-offset:1px}" +
    "#rayasPub input[type=range]{width:100%;accent-color:#ff2d8f}" +
    "#rayasPub .pb-2{display:grid;gap:12px;grid-template-columns:1fr 1fr}" +
    "#rayasPub .pb-hint{margin:0;font-size:13px;line-height:1.5;color:#9ba7d8}" +
    "#rayasPub .pb-fotos{display:grid;gap:12px;grid-template-columns:1fr 1fr}" +
    "#rayasPub .pb-foto{position:relative;display:grid;place-items:center;aspect-ratio:3/2;border-radius:14px;border:2px dashed #2a3a70;background:#070d24 center/cover no-repeat;cursor:pointer;overflow:hidden;text-align:center;padding:8px;font-size:12px;color:#9ba7d8}" +
    "#rayasPub .pb-foto.sel{border-color:#ff2d8f;border-style:solid}#rayasPub .pb-foto.lleno span{background:rgba(0,0,0,.65);padding:4px 8px;border-radius:8px;color:#eef1ff}" +
    "#rayasPub .pb-foto input{position:absolute;inset:0;opacity:0;cursor:pointer}" +
    "#rayasPub .pb-x{position:absolute;top:6px;right:6px;z-index:1;width:28px;height:28px;border-radius:50%;border:0;background:#000c;color:#fff;cursor:pointer;font-size:14px}" +
    "#rayasPub canvas{display:block;width:100%;height:auto;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.6)}" +
    "#rayasPub .pb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 18px;border:0;border-radius:999px;cursor:pointer;font:800 12.5px Barlow,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#eef1ff;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px #2a3a70}" +
    "#rayasPub .pb-btn.rojo{background:linear-gradient(180deg,#ffe08a,#ffc93c);color:#1d1600;box-shadow:0 4px 16px rgba(255,201,60,.3)}#rayasPub .pb-btn:hover{filter:brightness(1.12)}" +
    "#rayasPub .pb-acc{display:grid;gap:10px;grid-template-columns:1fr 1fr;margin-top:12px}" +
    "#rayasPub .pb-txt{display:grid;gap:8px;padding:12px;border-radius:14px;background:#070d24;border:1px solid #1e2c5c}" +
    "#rayasPub .pb-txt-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font:600 15px Teko,sans-serif;letter-spacing:.05em;text-transform:uppercase;color:#ffe08a}" +
    "#rayasPub pre{margin:0;white-space:pre-wrap;word-break:break-word;font:14px/1.5 Barlow,system-ui,sans-serif;color:#dfe4ff}" +
    "#rayasPub .pb-ok{color:#6fd08c}" +
    "@media(max-width:520px){#rayasPub .pb-2{grid-template-columns:1fr}#rayasPub .pb-foto{font-size:11px}}";

  function campo(id, et, tipo, ph) {
    return '<label for="pb-' + id + '">' + et + '<input id="pb-' + id + '" data-k="' + id + '" type="' + (tipo || "text") + '"' +
      (tipo === "number" ? ' inputmode="decimal" min="0" step="any"' : "") + ' placeholder="' + esc(ph || "") + '" value="' + esc(st.d[id]) + '"></label>';
  }
  function cajaFoto(k, titulo, ayuda) {
    var im = st.img[k];
    return '<div class="pb-foto' + (st.slot === k ? " sel" : "") + (im ? " lleno" : "") + '" data-slot="' + k + '"' + (im ? ' style="background-image:url(' + im.src + ')"' : "") + '>' +
      (im ? '<button type="button" class="pb-x" data-pb="quitar" data-slot="' + k + '" aria-label="Quitar foto">✕</button>' : "") +
      '<span>' + (im ? titulo : "<b>" + titulo + "</b><br>" + ayuda) + '</span>' +
      '<input type="file" accept="image/*" data-slot="' + k + '" aria-label="' + esc(titulo) + '"></div>';
  }
  function html() {
    return '<div class="pb-box"><div class="pb-head"><h2>Generador de <b>publicaciones</b></h2>' +
      '<button type="button" class="pb-btn" data-pb="cerrar">Cerrar</button></div>' +
      '<div class="pb-grid"><div style="display:grid;gap:18px">' +
      '<div class="pb-grp"><h3>1 · Fotos</h3><div class="pb-fotos">' +
      cajaFoto("juego", "Foto in-game", "Toca para subir o pega con Ctrl+V") +
      cajaFoto("oficial", "Foto oficial (opcional)", "Render de Steam") + '</div>' +
      '<p class="pb-hint">Ctrl+V pega en el recuadro marcado en fucsia. Si solo subes la oficial, se usa como foto principal.</p>' +
      '<div class="pb-2"><label>Encuadre horizontal<input type="range" min="0" max="100" data-k="px" value="' + st.d.px + '"></label>' +
      '<label>Encuadre vertical<input type="range" min="0" max="100" data-k="py" value="' + st.d.py + '"></label></div></div>' +
      '<div class="pb-grp"><h3>2 · Datos</h3>' +
      campo("tipo", "Tipo / rareza", "text", "Courier mítico") + campo("nombre", "Nombre del item", "text", "Strongback the Swift") +
      '<div class="pb-2">' + campo("precio", "Mi precio (S/)", "number", "75") + campo("steam", "Precio en Steam (opcional)", "number", "85") + '</div>' +
      '<div class="pb-2">' + campo("stock", "Stock", "number", "1") + campo("entrega", "Entrega", "text", "Entrega inmediata") + '</div></div>' +
      '<div class="pb-grp"><h3>3 · Texto para WhatsApp</h3><div id="pb-textos" style="display:grid;gap:10px"></div></div>' +
      '</div><div class="pb-prev"><div class="pb-grp"><h3>Vista previa</h3><canvas id="pb-cv" width="' + W + '" height="' + H + '"></canvas>' +
      '<div class="pb-acc"><button type="button" class="pb-btn rojo" data-pb="bajar">⬇ Descargar JPG</button>' +
      '<button type="button" class="pb-btn" data-pb="compartir">📤 Compartir</button></div>' +
      '<p class="pb-hint" id="pb-msg" role="status"></p></div></div></div></div>';
  }
  function pintarTextos() {
    var box = document.getElementById("pb-textos"); if (!box) return;
    box.innerHTML = textos().map(function (t, i) {
      return '<div class="pb-txt"><div class="pb-txt-h">' + t[0] + '<button type="button" class="pb-btn" style="padding:8px 14px" data-pb="copiar" data-i="' + i + '">' +
        (st.copiado === String(i) ? '<span class="pb-ok">✔ Copiado</span>' : "📋 Copiar") + '</button></div><pre>' + esc(t[1]) + '</pre></div>';
    }).join("");
  }
  var pend = 0;
  function refrescar() {
    if (pend) return;
    pend = requestAnimationFrame(function () {
      pend = 0; var cv = document.getElementById("pb-cv"); if (cv) dibujar(cv); pintarTextos();
    });
  }
  function msg(t) { var m = document.getElementById("pb-msg"); if (m) m.textContent = t || ""; }
  function render() { st.raiz.innerHTML = html(); fuentes().then(refrescar); refrescar(); }

  function ponerFoto(k, file) {
    if (!file || !/^image\//.test(file.type)) { msg("Ese archivo no es una imagen."); return; }
    var url = URL.createObjectURL(file);
    cargarImg(url).then(function (im) {
      var viejo = st.img[k]; if (viejo && /^blob:/.test(viejo.src)) URL.revokeObjectURL(viejo.src);
      st.img[k] = im; st.slot = k === "juego" && !st.img.oficial ? "oficial" : st.slot; msg(""); render();
    }).catch(function () { msg("No se pudo leer la imagen."); });
  }
  function lienzoBlob() {
    var cv = document.getElementById("pb-cv");
    return new Promise(function (ok, mal) { dibujar(cv); cv.toBlob(function (b) { b ? ok(b) : mal(new Error("blob")); }, "image/jpeg", 0.92); });
  }
  function nombreArchivo() { return "rayas-" + slug(st.d.nombre) + ".jpg"; }

  function alClic(e) {
    var t = e.target.closest("[data-pb],[data-slot]"); if (!t) return;
    var a = t.getAttribute("data-pb");
    if (!a) { if (t.classList.contains("pb-foto") && st.slot !== t.getAttribute("data-slot")) { st.slot = t.getAttribute("data-slot"); st.raiz.querySelectorAll(".pb-foto").forEach(function (x) { x.classList.toggle("sel", x === t); }); } return; }
    if (a === "cerrar") cerrar();
    else if (a === "quitar") { e.preventDefault(); e.stopPropagation(); var k = t.getAttribute("data-slot"); st.img[k] = null; st.slot = k; render(); }
    else if (a === "copiar") {
      var i = t.getAttribute("data-i"), txt = textos()[i][1];
      var fin = function () { st.copiado = i; pintarTextos(); setTimeout(function () { st.copiado = ""; pintarTextos(); }, 2500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(fin, function () { copiaVieja(txt); fin(); });
      else { copiaVieja(txt); fin(); }
    }
    else if (a === "bajar") {
      lienzoBlob().then(function (b) {
        var u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = nombreArchivo();
        document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
        msg("✔ Imagen descargada.");
      }).catch(function () { msg("No se pudo crear la imagen."); });
    }
    else if (a === "compartir") {
      lienzoBlob().then(function (b) {
        var f = new File([b], nombreArchivo(), { type: "image/jpeg" }), data = { files: [f], text: textos()[0][1] };
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          return navigator.share(data).then(function () { msg("✔ Listo."); }).catch(function (x) { if (x && x.name !== "AbortError") msg("No se pudo compartir."); });
        }
        msg("Tu navegador no deja compartir imágenes. Usa Descargar JPG y súbela a WhatsApp.");
      }).catch(function () { msg("No se pudo crear la imagen."); });
    }
  }
  function copiaVieja(txt) {
    var ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { /* nada */ } ta.remove();
  }
  function alEscribir(e) {
    var k = e.target.getAttribute("data-k"); if (!k) return;
    st.d[k] = e.target.value; refrescar();
  }
  function alCambio(e) {
    var t = e.target; if (t.type === "file" && t.files && t.files[0]) ponerFoto(t.getAttribute("data-slot"), t.files[0]);
  }
  function alPegar(e) {
    if (!st.abierto) return;
    var it = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < it.length; i++) if (it[i].kind === "file" && /^image\//.test(it[i].type)) { e.preventDefault(); ponerFoto(st.slot, it[i].getAsFile()); return; }
  }

  function montar() {
    if (st.raiz) return;
    var s = document.createElement("style"); s.id = "rayasPubCss"; s.textContent = CSS; document.head.appendChild(s);
    var r = document.createElement("div"); r.id = "rayasPub"; r.hidden = true; r.setAttribute("role", "dialog"); r.setAttribute("aria-modal", "true"); r.setAttribute("aria-label", "Generador de publicaciones");
    document.body.appendChild(r); st.raiz = r;
    r.addEventListener("click", alClic); r.addEventListener("input", alEscribir); r.addEventListener("change", alCambio);
    document.addEventListener("paste", alPegar);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && st.abierto) cerrar(); });
    cargarImg("img/logo-v2.webp").then(function (im) { st.img.logo = im; refrescar(); }).catch(function () {});
  }
  function abrir() {
    montar(); st.abierto = true; st.raiz.hidden = false; document.documentElement.style.overflow = "hidden"; render();
  }
  function cerrar() {
    st.abierto = false; if (st.raiz) st.raiz.hidden = true; document.documentElement.style.overflow = "";
  }

  window.rayasPublicador = { abrir: abrir, cerrar: cerrar };
})();
