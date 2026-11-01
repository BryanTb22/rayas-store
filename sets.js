/* =====================================================================
   SETS CACHÉ de Rayas Store
   - Catálogo propio de Rayas en Firestore: live/rayasSets (campo json = { sets: [...], visible, actualizado }).
   - Los clientes ven todos los sets juntos, ordenados por precio (de menor a mayor), sin dividir por cofres.
   - Pagan con su saldo (función comprarSets, tienda "rayas") o lo piden por WhatsApp.
   - Panel admin: catálogo (agregar, editar, stock, foto) y pedidos de sets de Rayas (cupo propio de 8 sets por día,
     fecha de amistad propia en customers/r_<clave>, pedidos manuales). Misma regla que LitleJacob.
   Usa window.RY (lo publica app.js) para la sesión, Firestore, fotos, saldo y WhatsApp.
   ===================================================================== */
(function () {
  "use strict";
  function R() { return window.RY; }
  var DOC = "live/rayasSets";
  var URL_COMPRAR = "https://us-central1-litlejacob-store.cloudfunctions.net/comprarSets";
  var LJ_WEB = "https://litlejacob.trade/";
  var RAREZAS = ["MÍTICO", "INMORTAL", "ARCANO"];
  var DTO = [{ min: 6, pct: 15 }, { min: 3, pct: 10 }], DTO_MAX = 25;   // igual que functions/sets.js
  var CAP = 8, ESPERA = 30, PREF = "r_";                                // igual que functions/recordatorio.js
  var CARRO_KEY = "rayas_sets_carrito", CAT_KEY = "rayas_sets_guardados_v1";
  var ESTADOS = [["pendiente", "⏳ Pendiente"], ["pagado", "💰 Pagado"], ["entregado", "✅ Entregado"], ["cancelado", "✖ Cancelado"]];

  /* ---------------- utilidades ---------------- */
  function esc(t) { return R() ? R().esc(t) : String(t == null ? "" : t); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function mon(n) { n = r2(Number(n) || 0); return "S/ " + (Number.isInteger(n) ? n : n.toFixed(2)); }
  function sinTildes(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function nSets(n) { return n + (n === 1 ? " set" : " sets"); }
  function isoDe(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function hoyIso() { return isoDe(new Date()); }
  function isoMas(iso, n) { var d = iso ? new Date(iso + "T12:00:00") : new Date(); d.setDate(d.getDate() + n); return isoDe(d); }
  function isoOk(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(iso || "") && Number(iso.slice(0, 4)) >= 2000 && !isNaN(new Date(iso + "T12:00:00")); }
  function isoDias(iso) { var p = iso.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000; }
  function fmtDia(iso) { return new Date(iso + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "2-digit" }); }
  function fmtFecha(d) { return d instanceof Date && !isNaN(d) ? d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; }
  function guardarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  function leerLS(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function errTxt(e) {
    var m = String((e && e.message) || e || "");
    if (m === "NO_SESSION") return "Tu sesión venció. Vuelve a entrar.";
    if (/401|403|PERMISSION/i.test(m)) return "Tu sesión no tiene permiso. Vuelve a entrar como administrador.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No hay conexión. Intenta de nuevo.";
    return m || "Algo salió mal. Intenta de nuevo.";
  }
  // Firestore REST: convertir valores
  function aFs(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(aFs) } };
    if (typeof v === "object") { var f = {}; Object.keys(v).forEach(function (k) { if (v[k] !== undefined) f[k] = aFs(v[k]); }); return { mapValue: { fields: f } }; }
    return { stringValue: String(v) };
  }
  function campos(o) { var f = {}; Object.keys(o).forEach(function (k) { if (o[k] !== undefined) f[k] = aFs(o[k]); }); return f; }
  function deFs(v) {
    if (!v) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("booleanValue" in v) return v.booleanValue;
    if ("timestampValue" in v) return new Date(v.timestampValue);
    if ("nullValue" in v) return null;
    if ("arrayValue" in v) return ((v.arrayValue && v.arrayValue.values) || []).map(deFs);
    if ("mapValue" in v) { var o = {}, f = (v.mapValue && v.mapValue.fields) || {}; Object.keys(f).forEach(function (k) { o[k] = deFs(f[k]); }); return o; }
    return null;
  }
  function docObj(d) { var o = {}, f = (d && d.fields) || {}; Object.keys(f).forEach(function (k) { o[k] = deFs(f[k]); }); o._id = d && d.name ? decodeURIComponent(d.name.split("/").pop()) : ""; return o; }
  function mascara(keys) { return keys.map(function (k) { return "updateMask.fieldPaths=" + encodeURIComponent(k); }).join("&"); }
  function fsPatch(ruta, obj) {
    return R().fsPedir(ruta + "?" + mascara(Object.keys(obj)), { method: "PATCH", body: JSON.stringify({ fields: campos(obj) }) })
      .then(function (r) { if (!r.ok) throw new Error("No se guardó (error " + r.status + ")."); return r.json(); });
  }
  function fsBorrar(ruta) { return R().fsPedir(ruta, { method: "DELETE" }).then(function (r) { if (!r.ok) throw new Error("No se borró (error " + r.status + ")."); }); }
  function normSteam(v) {
    v = String(v || "").trim(); if (!v) return "";
    var largo = /765611\d{11}/.exec(v);
    if (largo && typeof BigInt === "function") return (BigInt(largo[0]) - BigInt("76561197960265728")).toString();
    var d = v.replace(/[\s.-]/g, "");
    return /^\d{3,11}$/.test(d) ? d : null;
  }
  function normTel(v) {
    v = String(v || "").trim(); if (!v) return "";
    if (v.charAt(0) === "@" || /[a-z_]/i.test(v)) { var u = v.replace(/^@+/, "").toLowerCase(); return /^[a-z][a-z0-9._]{2,34}$/.test(u) && !/\.\./.test(u) && !/\.$/.test(u) ? "@" + u : null; }
    var d = v.replace(/[^\d+]/g, ""), mas = d.charAt(0) === "+"; d = d.replace(/\+/g, "");
    if (/^9\d{8}$/.test(d)) return "51" + d;
    if (/^519\d{8}$/.test(d)) return d;
    if (mas || d.length >= 10) return /^\d{8,15}$/.test(d) ? d : null;
    return null;
  }
  function esUsuarioWa(t) { return String(t || "").charAt(0) === "@"; }
  function fmtTel(t) { if (!t) return ""; if (esUsuarioWa(t)) return t; var m = /^51(9\d{2})(\d{3})(\d{3})$/.exec(t); return m ? "+51 " + m[1] + " " + m[2] + " " + m[3] : "+" + t; }
  function waEnlace(tel, texto) { return "https://api.whatsapp.com/send" + (esUsuarioWa(tel) ? (texto ? "?text=" + encodeURIComponent(texto) : "") : "?phone=" + tel + (texto ? "&text=" + encodeURIComponent(texto) : "")); }
  function perfilSteam(id) { return /^\d{1,11}$/.test(id || "") && typeof BigInt === "function" ? "https://steamcommunity.com/profiles/" + (BigInt("76561197960265728") + BigInt(id)).toString() : ""; }
  function claveCli(steam, nombre) { return steam ? "s" + steam : "n-" + (sinTildes(nombre || "cliente").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cliente"); }
  function nuevoCodigo(manual) { return "RY-" + (manual ? "M" : "") + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).toUpperCase().slice(2, 4); }
  function colorRar(r) { return R() && R().colorRareza ? R().colorRareza(r) : "#8847ff"; }
  function foto(src, extra) { var h = src && R() ? R().imgTag(src, "", extra || ' loading="lazy"') : ""; return h || '<span class="sc-sinfoto" aria-hidden="true">🎁</span>'; }

  /* ---------------- catálogo ---------------- */
  var cat = { sets: [], visible: false, cargado: false, cargando: false, err: "" };
  (function () { var g = leerLS(CAT_KEY); if (g && Array.isArray(g.sets)) { cat.sets = g.sets; cat.visible = !!g.visible; cat.cargado = true; cat.deCache = true; } })();
  function normSet(x) {
    var p = x.price === null || x.price === undefined || x.price === "" || isNaN(Number(x.price)) ? null : r2(Number(x.price));
    var st = x.stock === null || x.stock === undefined || x.stock === "" || isNaN(Number(x.stock)) ? null : Math.max(0, Math.floor(Number(x.stock)));
    return { id: Math.floor(Number(x.id)) || 0, name: String(x.name || "Set").slice(0, 80), price: p, stock: st, soldOut: !!x.soldOut || st === 0,
      img: String(x.img || "").slice(0, 300), rarity: RAREZAS.indexOf(x.rarity) >= 0 ? x.rarity : "MÍTICO", hero: String(x.hero || "").slice(0, 40), styles: Math.max(0, Math.floor(Number(x.styles) || 0)) };
  }
  function cargarCat(forzar) {
    if (cat.cargando || (cat.cargado && !cat.deCache && !forzar)) return Promise.resolve();
    cat.cargando = true;
    return fetch(R().BASE + DOC, { cache: "no-store" }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("No se pudo cargar el catálogo (" + r.status + ").");
      return r.json();
    }).then(function (d) {
      var j = {}; try { j = d && d.fields && d.fields.json ? JSON.parse(d.fields.json.stringValue) : {}; } catch (e) { j = {}; }
      var antes = JSON.stringify([cat.sets, cat.visible]);
      cat.sets = (Array.isArray(j.sets) ? j.sets : []).map(normSet).filter(function (s) { return s.id > 0; });
      cat.visible = j.visible === true; cat.cargado = true; cat.deCache = false; cat.err = "";
      if (!R().admin()) guardarLS(CAT_KEY, { sets: cat.sets, visible: cat.visible });
      return antes !== JSON.stringify([cat.sets, cat.visible]);
    }).catch(function (e) { cat.err = errTxt(e); cat.cargado = true; cat.deCache = false; return true; })
      .then(function (cambio) {
        cat.cargando = false;
        if (cambio === false) return;
        limpiarCarro(); R().render(); pintarCli();
        if (adm.tab) pintarAdmin();
      });
  }
  function guardarCat(msg) {
    var j = { sets: cat.sets.map(normSet), visible: cat.visible, actualizado: new Date().toISOString() };
    adm.msg = "Guardando…"; adm.msgTipo = ""; pintarAdmin();
    return fsPatch(DOC, { json: JSON.stringify(j), updatedAt: new Date() }).then(function () {
      adm.msg = msg || "✔ Guardado. Los clientes ya lo ven."; adm.msgTipo = "ok"; pintarAdmin(); pintarCli();
    }).catch(function (e) { adm.msg = errTxt(e); adm.msgTipo = "err"; pintarAdmin(); throw e; });
  }
  function setPorId(id) { id = Number(id); for (var i = 0; i < cat.sets.length; i++) if (cat.sets[i].id === id) return cat.sets[i]; return null; }
  function disponible(s) { return s && !s.soldOut && s.price !== null && (s.stock === null || s.stock > 0); }
  function ordenados(lista) {
    return lista.slice().sort(function (a, b) {
      var da = disponible(a) ? 0 : 1, db = disponible(b) ? 0 : 1; if (da !== db) return da - db;   // los agotados al final
      var pa = a.price === null ? 1e9 : a.price, pb = b.price === null ? 1e9 : b.price;
      return pa - pb || a.name.localeCompare(b.name, "es");
    });
  }
  function nombreHeroe(h) { return String(h || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

  /* ---------------- carrito ---------------- */
  var carro = (function () { var c = leerLS(CARRO_KEY); return Array.isArray(c) ? c.filter(function (x) { return x && x.id && x.qty > 0; }) : []; })();
  function guardarCarro() { guardarLS(CARRO_KEY, carro); }
  function limpiarCarro() {
    if (!cat.cargado || cat.err) return;
    carro = carro.filter(function (c) { return disponible(setPorId(c.id)); }).map(function (c) { var s = setPorId(c.id); return { id: c.id, qty: s.stock === null ? Math.min(20, c.qty) : Math.min(c.qty, s.stock, 20) }; }).filter(function (c) { return c.qty > 0; });
    guardarCarro();
  }
  function enCarro(id) { return carro.some(function (c) { return c.id === Number(id); }); }
  function lineas() { return carro.map(function (c) { return { s: setPorId(c.id), qty: c.qty }; }).filter(function (l) { return disponible(l.s); }); }
  function totales() {
    var ls = lineas(), n = 0, sub = 0, eleg = 0, fuera = 0;
    ls.forEach(function (l) { n += l.qty; sub += l.s.price * l.qty; if (l.s.price <= DTO_MAX) eleg += l.s.price * l.qty; else fuera += l.qty; });
    var nivel = DTO.filter(function (d) { return n >= d.min; })[0] || null;
    var dto = nivel ? r2(eleg * nivel.pct / 100) : 0, tot = r2(sub - dto);
    var sig = DTO.slice().reverse().filter(function (d) { return n < d.min; })[0] || null;
    return { ls: ls, n: n, sub: r2(sub), dto: dto, tot: tot, nivel: dto > 0 ? nivel : null, alcanzado: nivel, sig: sig, fuera: fuera, costo: Math.ceil(tot - 1e-9) };
  }
  function msgNivel(t) {
    if (!t.sig) return "¡Tienes el descuento máximo de " + t.alcanzado.pct + "%!";
    return "Agrega " + nSets(t.sig.min - t.n) + " más y obtén " + t.sig.pct + "% de descuento" + (t.alcanzado ? " (ahora tienes " + t.alcanzado.pct + "%)" : "");
  }
  function agregar(id) {
    var s = setPorId(id); if (!disponible(s)) return;
    var c = carro.filter(function (x) { return x.id === s.id; })[0];
    if (c) { if (s.stock !== null && c.qty >= s.stock) { aviso("Solo hay " + s.stock + (s.stock === 1 ? " unidad" : " unidades") + " de \"" + s.name + "\"."); return; } c.qty = Math.min(20, c.qty + 1); }
    else carro.push({ id: s.id, qty: 1 });
    guardarCarro(); pintarCli(); aviso("\"" + s.name + "\" agregado. " + msgNivel(totales()));
  }
  function quitar(id) { carro = carro.filter(function (c) { return c.id !== Number(id); }); guardarCarro(); pintarCli(); }
  function cambiarQty(id, d) {
    var c = carro.filter(function (x) { return x.id === Number(id); })[0], s = setPorId(id); if (!c || !s) return;
    var q = c.qty + d; if (q < 1) return quitar(id);
    if (s.stock !== null && q > s.stock) { aviso("No hay más unidades de \"" + s.name + "\"."); return; }
    c.qty = Math.min(20, q); guardarCarro(); pintarCli();
  }

  /* ---------------- aviso corto (abajo de la pantalla) ---------------- */
  var avisoEl = null, avisoT = 0;
  function aviso(txt) {
    if (!avisoEl) { avisoEl = document.createElement("div"); avisoEl.className = "sc-toast"; avisoEl.setAttribute("role", "status"); document.body.appendChild(avisoEl); }
    avisoEl.textContent = txt; avisoEl.classList.add("on"); clearTimeout(avisoT);
    avisoT = setTimeout(function () { avisoEl.classList.remove("on"); }, 3200);
  }

  /* =====================================================================
     VISTA DEL CLIENTE (#sets)
     ===================================================================== */
  var cli = { q: "", rar: "" };
  var cliEl = document.createElement("div"); cliEl.className = "sc-cli";
  function filtrados() {
    var q = sinTildes(cli.q).trim();
    return ordenados(cat.sets).filter(function (s) {
      return (!cli.rar || s.rarity === cli.rar) && (!q || sinTildes(s.name + " " + s.hero).indexOf(q) >= 0);
    });
  }
  function tarjetaHtml(s) {
    var ok = disponible(s), col = colorRar(s.rarity), dentro = enCarro(s.id), adminVe = R().admin();
    return '<article class="icard sc-card' + (ok ? '' : ' agot') + (dentro ? ' sc-in' : '') + '">' +
      '<div class="ithumb" style="--rar:' + col + '">' + foto(s.img) +
      (ok ? (s.stock !== null && s.stock <= 3 ? '<span class="itag">Quedan ' + s.stock + '</span>' : '') : '<span class="itag agotado">Agotado</span>') +
      (s.price !== null && s.price <= DTO_MAX ? '' : '<span class="itag sc-nodto" title="No recibe el descuento por cantidad">Sin dscto.</span>') + '</div>' +
      '<div class="ibody"><h4>' + esc(s.name) + '</h4>' +
      '<div class="imeta"><span style="color:' + col + '">' + esc(s.rarity) + '</span>' + (s.hero ? '<span>' + esc(nombreHeroe(s.hero)) + '</span>' : '') + (s.styles > 1 ? '<span>🎨 ' + s.styles + ' estilos</span>' : '') + '</div>' +
      '<div class="iprice"><b>' + (s.price === null ? 'Consultar' : esc(mon(s.price))) + '</b><span class="iacts">' +
      (adminVe ? '<button type="button" class="btn btn-ghost btn-sm" data-s="admEditar" data-id="' + s.id + '">✎ Editar</button>'
        : ok ? '<button type="button" class="sc-add' + (dentro ? ' on' : '') + '" data-s="' + (dentro ? 'quitar' : 'agregar') + '" data-id="' + s.id + '">' + (dentro ? '✓ En carrito' : '🛒 Agregar') + '</button>' : '<span class="ibuy">Agotado</span>') +
      '</span></div></div></article>';
  }
  function pintarCli() {
    if (!R()) return;
    var adminVe = R().admin(), t = totales();
    var h = '<div class="sec-title"><div class="kicker">Cofres de Dota 2</div><h2><span class="t1">Sets</span> <span>Caché</span></h2>' +
      '<p>Todos los sets ordenados por precio. Págalos con tu saldo o pídelos por WhatsApp.</p><div class="orn">◆</div></div>';
    if (adminVe) h += (cat.visible ? '' : '<p class="hint" style="text-align:center">🔒 Esta sección está oculta: solo tú (administrador) la ves. Actívala en Panel admin → 🎁 Catálogo de sets.</p>') +
      '<div class="itadm frame"><div class="in"><b>Modo administrador</b><button type="button" class="btn btn-yellow btn-sm" data-s="admAbrir" data-t="setsCat">🎁 Catálogo de sets</button><button type="button" class="btn btn-ghost btn-sm" data-s="admAbrir" data-t="setsPed">🚚 Pedidos de sets</button></div></div>';
    if (!adminVe && cat.cargado && !cat.err && !cat.visible) {
      cliEl.innerHTML = h + '<div class="empty frame"><div class="in"><strong>Muy pronto</strong><span>Estamos preparando los sets caché. Vuelve en unos días.</span></div></div>';
      return;
    }
    h += '<div class="sc-info"><div class="sc-promo"><b>🎁 Más sets, más descuento</b><span>3 sets = <b>10%</b> · 6 sets = <b>15%</b> <small>(en sets de hasta S/ ' + DTO_MAX + ')</small></span></div>' +
      '<div class="sc-entrega"><b>🚚 Entrega por Steam</b><span>⚡ Si ya somos amigos, la entrega es inmediata. ⏳ Si aún no, se cumplen 30 días de amistad antes de la entrega.</span></div></div>';
    h += '<div class="sc-bar"><input type="search" class="sc-q" placeholder="Buscar set o héroe…" autocomplete="off" value="' + esc(cli.q) + '">' +
      '<div class="sc-rars" role="group" aria-label="Rareza">' + [""].concat(RAREZAS).map(function (r) {
        return '<button type="button" class="itab' + (cli.rar === r ? ' on' : '') + '" data-s="rar" data-v="' + esc(r) + '">' + (r ? esc(r.charAt(0) + r.slice(1).toLowerCase()) : 'Todos') + '</button>'; }).join("") + '</div>' +
      '<span class="icount sc-count"></span></div>';
    h += '<div class="sc-grid-box"></div>';
    if (t.n && !adminVe) h += '<div class="sc-cbar" role="region" aria-label="Carrito de sets"><button type="button" class="sc-cbar-in" data-s="carro"><span class="sc-cbar-n">' + t.n + '</span><span class="sc-cbar-tx"><b>' + nSets(t.n) + ' en tu carrito</b><small>' + esc(t.nivel ? t.nivel.pct + "% de descuento aplicado" + (t.sig ? " · " + (t.sig.min - t.n) + " más para " + t.sig.pct + "%" : "") : msgNivel(t)) + '</small></span><b class="sc-cbar-tot">' + mon(t.tot) + '</b><span class="btn btn-fuchsia btn-sm">Ver carrito</span></button></div>';
    cliEl.innerHTML = h;
    cliEl.classList.toggle("sc-con-barra", !!(t.n && !adminVe));
    pintarGrid();
  }
  function pintarGrid() {
    var box = cliEl.querySelector(".sc-grid-box"); if (!box) return;
    var cnt = cliEl.querySelector(".sc-count");
    if (!cat.cargado) { box.innerHTML = '<div class="igrid sk-grid" aria-busy="true">' + new Array(9).join('<article class="icard sk" aria-hidden="true"><div class="ithumb"></div><div class="ibody"><i class="sk-l w80"></i><i class="sk-l w50"></i><i class="sk-l w60 tall"></i></div></article>') + '</div>'; return; }
    if (cat.err && !cat.sets.length) { box.innerHTML = '<div class="empty frame"><div class="in"><strong>No se pudo cargar</strong><span>' + esc(cat.err) + '</span></div></div>'; return; }
    var l = filtrados();
    if (cnt) cnt.textContent = l.length + (l.length === 1 ? " set" : " sets");
    box.innerHTML = l.length ? '<div class="igrid sc-grid">' + l.map(tarjetaHtml).join("") + '</div>'
      : '<div class="empty frame"><div class="in"><strong>' + (cat.sets.length ? 'Ningún set coincide' : 'Pronto nuevos sets') + '</strong><span>' + (cat.sets.length ? 'Prueba con otra búsqueda.' : 'Estamos subiendo el catálogo.') + '</span></div></div>';
    R().hidratar();
  }

  /* ---------------- ventana (carrito, pago) ---------------- */
  var mod = null, modEl = null;
  function abrirMod(m) { mod = m; if (avisoEl) avisoEl.classList.remove("on"); pintarMod(); }
  function cerrarMod() { mod = null; pintarMod(); }
  function pintarMod() {
    if (!modEl) { modEl = document.createElement("div"); modEl.className = "sc-mod"; document.body.appendChild(modEl); }
    if (!mod) { modEl.innerHTML = ""; document.body.classList.remove("sc-mod-on"); return; }
    document.body.classList.add("sc-mod-on");
    var h = "", b = "", cerrar = '<button class="btn btn-ghost btn-sm" type="button" data-s="cerrarMod">Cerrar</button>';
    if (mod.tipo === "carro") {
      var t = totales(), p = R().perfil(), saldo = p ? Number(p.creditos) || 0 : null;
      h = '<h3>Tu carrito de sets 🎁</h3>';
      if (!t.n) { h += '<p class="hint">Está vacío. Toca <b>🛒 Agregar</b> en los sets que quieras.</p>'; b = cerrar; }
      else {
        h += '<div class="carl">' + t.ls.map(function (l) {
          var s = l.s;
          return '<div class="carr"><div class="carr-t"><span class="carr-img">' + foto(s.img, ' width="56" height="56"') + '</span><span class="carr-n"><b>' + esc(s.name) + '</b><small>' + esc(mon(s.price)) + ' c/u' + (s.price > DTO_MAX ? ' · sin descuento' : '') + '</small></span></div>' +
            '<div class="carr-q"><button type="button" class="btn btn-ghost btn-sm" data-s="menos" data-id="' + s.id + '" aria-label="Menos">−</button><span>' + l.qty + '</span>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-s="mas" data-id="' + s.id + '" aria-label="Más"' + (s.stock !== null && l.qty >= s.stock ? ' disabled' : '') + '>+</button></div>' +
            '<div class="carr-s"><b>' + esc(mon(s.price * l.qty)) + '</b><button type="button" class="carr-x" data-s="quitarCarro" data-id="' + s.id + '" aria-label="Quitar">🗑</button></div></div>';
        }).join("") + '</div>';
        var pct = Math.min(100, t.n / DTO[0].min * 100);
        h += '<div class="sc-prog"><div class="sc-prog-msg">🎁 ' + esc(msgNivel(t)) + '</div><div class="sc-prog-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="sc-prog-m"><span>0</span>' + DTO.slice().reverse().map(function (d) { return '<span class="' + (t.n >= d.min ? 'on' : '') + '">' + d.min + ' sets = ' + d.pct + '%</span>'; }).join("") + '</div></div>';
        h += '<div class="cartot"><div class="cartot-r"><span>Subtotal (' + nSets(t.n) + ')</span><span>' + mon(t.sub) + '</span></div>' +
          (t.nivel ? '<div class="cartot-r sc-dto"><span>Descuento ' + t.nivel.pct + '% (sets de hasta S/ ' + DTO_MAX + ')</span><span>−' + mon(t.dto) + '</span></div>' : '') +
          (t.fuera ? '<p class="hint sc-nota">* ' + nSets(t.fuera) + ' de más de S/ ' + DTO_MAX + (t.fuera === 1 ? ' cuenta' : ' cuentan') + ' para la promoción, pero no ' + (t.fuera === 1 ? 'recibe' : 'reciben') + ' descuento.</p>' : '') +
          '<div class="cartot-r tot"><span>Total</span><b>' + mon(t.tot) + '</b></div>' +
          (t.costo !== t.tot ? '<div class="cartot-r"><span>Pagando con tu saldo (redondeado)</span><span>' + mon(t.costo) + '</span></div>' : '') +
          (saldo !== null ? '<div class="cartot-r"><span>Tu saldo</span><span>' + mon(saldo) + '</span></div>' +
            (saldo < t.costo ? '<p class="cartot-aviso">Te faltan <b>' + mon(t.costo - saldo) + '</b>. Recarga saldo o pídelo por WhatsApp.</p>' : '<div class="cartot-r"><span>Te quedarían</span><span>' + mon(saldo - t.costo) + '</span></div>')
            : '<p class="cartot-aviso">Para pagar con tu saldo entra a tu cuenta.</p>') + '</div>';
        b = '<button class="btn btn-fuchsia" type="button" data-s="pagar">💎 Pagar con tu saldo (' + mon(t.costo) + ')</button>' +
          (saldo !== null && saldo < t.costo && R().recargaOn() ? '<button class="btn btn-yellow" type="button" data-s="recargar">💳 Recargar saldo</button>' : '') +
          (R().hayWhatsapp() ? '<button class="btn btn-yellow" type="button" data-s="wsp">💬 Pedir por WhatsApp</button>' : '') +
          '<button class="btn btn-ghost btn-sm" type="button" data-s="vaciar">Vaciar</button>' + cerrar;
      }
    } else if (mod.tipo === "confirmar") {
      var p2 = R().perfil();
      h = '<h3>¿Pagar con tu saldo? 💎</h3><p class="hint">Pagarás <b>' + mon(mod.t.costo) + '</b> por ' + nSets(mod.t.n) + '. Te quedarán <b>' + mon((Number(p2 && p2.creditos) || 0) - mod.t.costo) + '</b>.</p>' +
        (p2 && !p2.steam ? '<p class="cartot-aviso">⚠ Tu cuenta no tiene ID de Steam. Agrégalo en tu perfil para que podamos enviarte los sets.</p>' : '');
      b = '<button class="btn btn-fuchsia" type="button" data-s="pagarSi">✔ Sí, pagar ' + mon(mod.t.costo) + '</button><button class="btn btn-ghost btn-sm" type="button" data-s="carro">Volver</button>';
    } else if (mod.tipo === "cargando") {
      h = '<h3>Procesando…</h3><p class="hint">Un momento por favor.</p>';
    } else if (mod.tipo === "ok") {
      h = '<h3>¡Compra lista! 🎉</h3><p class="hint">Pedido <b>' + esc(mod.code) + '</b>. Pagaste <b>' + mon(mod.pago) + '</b> y te quedan <b>' + mon(mod.saldo) + '</b>.</p>' +
        '<p class="hint">Te agregaremos en Steam y te enviaremos tus sets. Si aún no somos amigos, la entrega es a los 30 días de amistad. Puedes ver tu pedido en <b>Perfil → Transacciones</b>.</p>';
      b = (R().hayWhatsapp() ? '<button class="btn btn-yellow" type="button" data-s="wspOk">💬 Avisar por WhatsApp</button>' : '') + cerrar;
    } else {
      h = '<h3>Ups 😕</h3><p class="hint">' + esc(mod.msg || "No se pudo completar.") + '</p>';
      b = (mod.volver ? '<button class="btn btn-yellow" type="button" data-s="carro">Volver al carrito</button>' : '') + cerrar;
    }
    modEl.innerHTML = '<div class="scrim scrim-top"' + (mod.tipo === "cargando" ? '' : ' data-s="cerrarMod"') + '></div><div class="elegir sc-elegir" role="dialog" aria-modal="true" aria-label="Carrito de sets">' + h + '<div class="mbtns">' + b + '</div></div>';
    R().hidratar();
  }
  function mensajeWsp(t) {
    var p = R().perfil();
    return "¡Hola! 👋 Quiero comprar estos *Sets Caché* de *RAYAS STORE* 🎁\n\n" +
      t.ls.map(function (l, i) { return (i + 1) + ". " + l.s.name + " (" + l.s.rarity + ") — " + (l.qty > 1 ? l.qty + " x " + mon(l.s.price) + " = " : "") + mon(l.s.price * l.qty); }).join("\n") +
      "\n\n" + (t.nivel ? "Subtotal: " + mon(t.sub) + "\nDescuento " + t.nivel.pct + "%: −" + mon(t.dto) + "\n" : "") + "💰 Total: " + mon(t.tot) +
      (p ? "\n\n👤 " + (p.nombre || "") + (p.steam ? " · Steam " + p.steam : "") : "") + "\n\n¿Siguen disponibles? 🙏";
  }
  function pagar() {
    var t = totales(); if (!t.n) return;
    if (!R().sesion() || !R().perfil()) { cerrarMod(); R().entrar("Entra a tu cuenta para pagar los sets con tu saldo."); return; }
    var saldo = Number(R().perfil().creditos) || 0;
    if (saldo < t.costo) { abrirMod({ tipo: "error", msg: "Te faltan " + mon(t.costo - saldo) + ". Recarga saldo o pide los sets por WhatsApp.", volver: true }); return; }
    abrirMod({ tipo: "confirmar", t: t });
  }
  function pagarSi() {
    var t = mod && mod.t; if (!t) return;
    var nombres = t.ls.map(function (l) { return (l.qty > 1 ? l.qty + " x " : "") + l.s.name; }).join(", ");
    abrirMod({ tipo: "cargando" });
    R().token().then(function (tk) {
      return fetch(URL_COMPRAR, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
        body: JSON.stringify({ tienda: "rayas", items: t.ls.map(function (l) { return { id: l.s.id, qty: l.qty, name: l.s.name }; }) }) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.ok) { abrirMod({ tipo: "error", msg: (x.j && x.j.error) || "No se pudo completar la compra.", volver: true }); cargarCat(true); return; }
        carro = []; guardarCarro(); pintarCli();
        var p = R().perfil();
        abrirMod({ tipo: "ok", code: x.j.code, pago: x.j.creditos, saldo: x.j.saldo,
          msg: "Hola Rayas Store, pagué con mi saldo el pedido " + x.j.code + " (" + nSets(t.n) + ": " + nombres + "). Mi Steam: " + ((p && p.steam) || "—") + ". ¡Gracias!" });
        R().recargarPerfil();
      }).catch(function (e) { abrirMod({ tipo: "error", msg: e && e.message === "NO_SESSION" ? "Tu sesión venció. Vuelve a entrar." : "No se pudo completar la compra. No se descontó saldo; intenta de nuevo.", volver: true }); });
  }

  /* =====================================================================
     PANEL ADMIN
     ===================================================================== */
  var adm = { tab: "", msg: "", msgTipo: "", form: null, borrar: null, q: "",
    ped: { cargado: false, cargando: false, err: "", orders: [], fichas: {}, filtro: "all", q: "", abiertos: {}, tel: null } };
  var admEl = document.createElement("div"); admEl.className = "sc-adm";
  var manEl = null;   // formulario de pedido manual (se conserva al redibujar)

  function pintarAdmin() {
    if (!R() || !R().admin()) return;
    if (adm.tab === "setsPed") return pintarPed();
    var msg = adm.msg ? '<p class="sc-msg ' + esc(adm.msgTipo) + '" role="status">' + esc(adm.msg) + '</p>' : '';
    if (!cat.cargado || cat.deCache) { admEl.innerHTML = '<p class="hint">Cargando catálogo…</p>'; cargarCat(true); return; }
    var agot = cat.sets.filter(function (s) { return !disponible(s); }).length, stock = cat.sets.reduce(function (a, s) { return a + (s.stock || 0); }, 0);
    var h = '<div class="grp"><label class="cfg-row' + (cat.visible ? ' on' : '') + '"><span class="cfg-tx"><b>🎁 Sets Caché</b><small>Sección de sets en el menú de Rayas Store.</small><em>' + (cat.visible ? 'VISIBLE para los clientes' : 'OCULTA: solo tú la ves') + '</em></span><input type="checkbox" class="sc-vis"' + (cat.visible ? ' checked' : '') + '><span class="cfg-sw" aria-hidden="true"></span></label>' + msg + '</div>';
    if (adm.form) return (admEl.innerHTML = h + formHtml(), void R().hidratar());
    h += '<div class="sc-stats"><div><b>' + cat.sets.length + '</b><span>Sets</span></div><div><b>' + (cat.sets.length - agot) + '</b><span>Disponibles</span></div><div><b>' + agot + '</b><span>Agotados</span></div><div><b>' + stock + '</b><span>Unidades</span></div></div>';
    h += '<div class="sc-acts"><button type="button" class="btn btn-yellow btn-sm" data-s="admNuevo">+ Agregar set</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="admImportar">📥 Copiar sets de LitleJacob</button></div>' +
      '<input type="search" class="sc-aq" placeholder="Buscar set…" value="' + esc(adm.q) + '" autocomplete="off">';
    h += '<div class="sc-alist">' + listaAdmHtml() + '</div>';
    admEl.innerHTML = h; R().hidratar();
  }
  function listaAdmHtml() {
    var q = sinTildes(adm.q).trim();
    var l = ordenados(cat.sets).filter(function (s) { return !q || sinTildes(s.name + " " + s.hero).indexOf(q) >= 0; });
    if (!l.length) return '<p class="hint">' + (cat.sets.length ? 'Ningún set coincide.' : 'Aún no hay sets. Pulsa <b>+ Agregar set</b> o copia los de LitleJacob para empezar.') + '</p>';
    return l.map(function (s) {
      var ok = disponible(s);
      return '<div class="sc-arow' + (ok ? '' : ' agot') + '"><span class="sc-ath">' + foto(s.img) + '</span>' +
        '<span class="sc-anm"><b>' + esc(s.name) + '</b><small><i style="color:' + colorRar(s.rarity) + '">' + esc(s.rarity) + '</i>' + (s.hero ? ' · ' + esc(nombreHeroe(s.hero)) : '') + ' · ' + (s.price === null ? 'sin precio' : esc(mon(s.price))) + (ok ? '' : ' · <em class="sc-ag">Agotado</em>') + '</small></span>' +
        '<span class="sc-ast" title="Stock"><button type="button" class="btn btn-ghost btn-sm" data-s="admStock" data-id="' + s.id + '" data-d="-1" aria-label="Quitar una unidad">−</button><b>' + (s.stock === null ? '∞' : s.stock) + '</b><button type="button" class="btn btn-ghost btn-sm" data-s="admStock" data-id="' + s.id + '" data-d="1" aria-label="Sumar una unidad">+</button></span>' +
        '<span class="sc-abt"><button type="button" class="btn btn-ghost btn-sm" data-s="admEditar" data-id="' + s.id + '">✎</button>' +
        (adm.borrar === s.id ? '<button type="button" class="btn btn-sm sc-del" data-s="admBorrarSi" data-id="' + s.id + '">¿Quitar? Sí</button>' : '<button type="button" class="btn btn-ghost btn-sm" data-s="admBorrar" data-id="' + s.id + '" aria-label="Quitar">🗑</button>') + '</span></div>';
    }).join("");
  }
  function formHtml() {
    var f = adm.form, s = f.s;
    return '<div class="grp sc-form"><h3>' + (f.nuevo ? 'Nuevo set' : 'Editar set') + '</h3>' +
      '<div class="sc-ffoto"><div class="sc-fprev">' + foto(s.img) + '</div><div class="sc-fbtns"><label class="btn btn-ghost btn-sm sc-file">📷 ' + (s.img ? 'Cambiar foto' : 'Subir foto') + '<input type="file" accept="image/*" class="sc-ffile" hidden></label>' +
      (s.img ? '<button type="button" class="btn btn-ghost btn-sm" data-s="fQuitarFoto">Quitar foto</button>' : '') + '<small class="hint sc-fst"></small></div></div>' +
      '<div class="field"><label for="sc-f-name">Nombre del set *</label><input id="sc-f-name" data-f="name" maxlength="80" value="' + esc(s.name) + '"></div>' +
      '<div class="sc-f2"><div class="field"><label for="sc-f-price">Precio (S/) *</label><input id="sc-f-price" data-f="price" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(s.priceTxt !== undefined ? s.priceTxt : s.price === null ? '' : s.price) + '"></div>' +
      '<div class="field"><label for="sc-f-stock">Stock (vacío = sin límite)</label><input id="sc-f-stock" data-f="stock" type="number" min="0" step="1" inputmode="numeric" value="' + esc(s.stockTxt !== undefined ? s.stockTxt : s.stock === null ? '' : s.stock) + '"></div></div>' +
      '<div class="sc-f2"><div class="field"><label for="sc-f-rar">Rareza</label><select id="sc-f-rar" data-f="rarity">' + RAREZAS.map(function (r) { return '<option' + (s.rarity === r ? ' selected' : '') + '>' + r + '</option>'; }).join("") + '</select></div>' +
      '<div class="field"><label for="sc-f-styles">Estilos</label><input id="sc-f-styles" data-f="styles" type="number" min="0" max="20" step="1" inputmode="numeric" value="' + (s.styles || '') + '"></div></div>' +
      '<div class="field"><label for="sc-f-hero">Héroe (opcional)</label><input id="sc-f-hero" data-f="hero" maxlength="40" value="' + esc(nombreHeroe(s.hero)) + '"></div>' +
      '<label class="chk"><input type="checkbox" data-f="soldOut"' + ((s.soldOutMarca !== undefined ? s.soldOutMarca : s.soldOut && s.stock !== 0) ? ' checked' : '') + '> Marcar como agotado</label>' +
      '<p class="sc-ferr" role="alert"></p>' +
      '<div class="sc-acts"><button type="button" class="btn btn-fuchsia btn-sm" data-s="fGuardar">💾 Guardar set</button><button type="button" class="btn btn-ghost btn-sm" data-s="fCancelar">Cancelar</button></div></div>';
  }
  function leerForm() {
    var f = adm.form, g = function (k) { var el = admEl.querySelector('[data-f="' + k + '"]'); return el ? (el.type === "checkbox" ? el.checked : el.value) : undefined; };
    if (g("name") !== undefined) {
      f.s.name = String(g("name")).trim().replace(/\s+/g, " ").slice(0, 80);
      f.s.priceTxt = g("price"); f.s.stockTxt = g("stock");
      f.s.rarity = g("rarity"); f.s.styles = Math.max(0, Math.floor(Number(g("styles")) || 0));
      f.s.hero = String(g("hero")).trim().slice(0, 40); f.s.soldOutMarca = !!g("soldOut");
    }
    return f;
  }
  function guardarForm() {
    var f = leerForm(), s = f.s, err = admEl.querySelector(".sc-ferr");
    var precio = Number(String(s.priceTxt).replace(",", "."));
    if (!s.name) { err.textContent = "Escribe el nombre del set."; return; }
    if (s.priceTxt === "" || !isFinite(precio) || precio <= 0) { err.textContent = "Pon un precio mayor a 0."; return; }
    var stock = s.stockTxt === "" ? null : Math.floor(Number(s.stockTxt));
    if (stock !== null && (!isFinite(stock) || stock < 0)) { err.textContent = "El stock es un número (0 o más) o vacío."; return; }
    var nuevo = normSet({ id: s.id, name: s.name, price: precio, stock: stock, soldOut: s.soldOutMarca, img: s.img, rarity: s.rarity, hero: s.hero, styles: s.styles });
    var antes = cat.sets.slice();
    if (f.nuevo) cat.sets.push(nuevo); else cat.sets = cat.sets.map(function (x) { return x.id === nuevo.id ? nuevo : x; });
    adm.form = null;
    guardarCat("✔ Set \"" + nuevo.name + "\" guardado.").catch(function () { cat.sets = antes; adm.form = f; pintarAdmin(); });
  }
  function nuevoId() { return cat.sets.reduce(function (m, s) { return Math.max(m, s.id); }, 0) + 1; }
  function subirFoto(file) {
    var st = admEl.querySelector(".sc-fst");
    R().editorFoto(file).then(function (lista) {
      if (!lista) return null;
      if (st) st.textContent = "Subiendo foto…";
      return R().subirImagen(lista, 640);
    }).then(function (ref) {
      if (!ref) { if (st) st.textContent = ""; return; }
      leerForm(); adm.form.s.img = ref; pintarAdmin();
    }).catch(function (e) { if (st) st.textContent = errTxt(e); });
  }
  function cambiarStock(id, d) {
    var s = setPorId(id); if (!s) return;
    var antes = { stock: s.stock, soldOut: s.soldOut };
    if (s.stock === null) { if (d < 0) return; s.stock = 1; } else s.stock = Math.max(0, s.stock + d);
    s.soldOut = s.stock === 0 ? true : (d > 0 ? false : s.soldOut);
    guardarCat("✔ Stock de \"" + s.name + "\": " + s.stock + ".").catch(function () { s.stock = antes.stock; s.soldOut = antes.soldOut; pintarAdmin(); });
  }
  // Copia el catálogo publicado en litlejacob.trade (nombres, precios, stock, rareza y foto) como punto de partida.
  function importarLJ() {
    adm.msg = "Leyendo el catálogo de LitleJacob…"; adm.msgTipo = ""; pintarAdmin();
    fetch(LJ_WEB, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("No se pudo abrir litlejacob.trade (" + r.status + ")."); return r.text(); }).then(function (txt) {
      var m = /<script id="catalogData" type="application\/json">([\s\S]*?)<\/script>/.exec(txt);
      var d = m ? JSON.parse(m[1]) : null, l = d && Array.isArray(d.sets) ? d.sets : [];
      if (!l.length) throw new Error("No encontré sets en LitleJacob.");
      var ya = {}; cat.sets.forEach(function (s) { ya[sinTildes(s.name)] = true; });
      var nuevos = l.filter(function (x) { return x && x.name && !ya[sinTildes(x.name)]; });
      if (!nuevos.length) { adm.msg = "Ya tienes todos los sets de LitleJacob."; adm.msgTipo = "ok"; pintarAdmin(); return; }
      if (!window.confirm("Se agregarán " + nuevos.length + " sets copiados de LitleJacob (con su nombre, foto, rareza, precio y stock). Los que ya tienes no se tocan. Después revisa precios y stock de Rayas. ¿Continuar?")) { adm.msg = ""; pintarAdmin(); return; }
      var id = nuevoId();
      nuevos.forEach(function (x) {
        var img = String(x.img || "");
        if (/^img\//.test(img)) img = LJ_WEB + img; else if (!/^https:\/\//.test(img)) img = "";
        cat.sets.push(normSet({ id: id++, name: x.name, price: x.price, stock: x.stock === undefined || x.stock === null ? null : Math.max(0, Number(x.stock) || 0), soldOut: x.soldOut, img: img, rarity: x.rarity, hero: x.hero, styles: x.styles }));
      });
      return guardarCat("✔ Se copiaron " + nuevos.length + " sets de LitleJacob. Revisa precios y stock.");
    }).catch(function (e) { adm.msg = errTxt(e); adm.msgTipo = "err"; pintarAdmin(); });
  }

  /* ---------------- pedidos de sets de Rayas ---------------- */
  var P = adm.ped;
  function cargarPed() {
    if (P.cargando) return;
    P.cargando = true; P.err = ""; pintarPed();
    var url = R().BASE.replace("/documents/", "/documents:runQuery");
    var ped = R().token().then(function (tk) {
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "orders" }], where: { fieldFilter: { field: { fieldPath: "tienda" }, op: "EQUAL", value: { stringValue: "rayas" } } }, limit: 1000 } }) });
    }).then(function (r) { if (!r.ok) throw new Error("No se pudieron leer los pedidos (" + r.status + ")."); return r.json(); })
      .then(function (j) { return (j || []).filter(function (x) { return x.document; }).map(function (x) { return docObj(x.document); }).filter(function (o) { return o.origen !== "items"; }); });
    var fichas = {}, acc = function (tok) {
      return R().fsPedir("customers?pageSize=300" + (tok ? "&pageToken=" + encodeURIComponent(tok) : "")).then(function (r) { if (!r.ok) throw new Error("No se pudieron leer los clientes (" + r.status + ")."); return r.json(); })
        .then(function (j) { (j.documents || []).forEach(function (d) { var o = docObj(d); if (o._id.indexOf(PREF) === 0) fichas[o._id.slice(PREF.length)] = o; }); return j.nextPageToken ? acc(j.nextPageToken) : null; });
    };
    Promise.all([ped, acc("")]).then(function (r) {
      P.orders = r[0]; P.fichas = fichas; P.cargado = true;
    }).catch(function (e) { P.err = errTxt(e); }).then(function () { P.cargando = false; pintarPed(); });
  }
  function setsDe(o) { return Math.max(1, Number(o.count) || (o.items || []).reduce(function (n, it) { return n + (Number(it.qty) || 1); }, 0)); }
  function desdeDe(clave) { var c = P.fichas[clave]; return c && isoOk(c.friendSince) ? c.friendSince : ""; }
  // Cupo de 8 sets por día: misma regla que LitleJacob y que el correo de las 8:00 (functions/recordatorio.js).
  function plan(extra) {
    var hoy = hoyIso(), cnt = {}, pend = [];
    P.orders.forEach(function (o) {
      if (o.status === "entregado") { if (o.entregadoDia && o.entregadoDia >= hoy) cnt[o.entregadoDia] = (cnt[o.entregadoDia] || 0) + setsDe(o); return; }
      if (o.status !== "pagado") return;
      var since = desdeDe(claveCli(o.steamId, o.customerName));
      if (since) pend.push({ id: o._id, base: isoMas(since, ESPERA), t: o.createdAt ? +o.createdAt : 0, n: setsDe(o) });
    });
    if (extra) pend.push({ id: extra.id, base: extra.base, t: Date.now(), n: Math.max(1, extra.n || 1) });
    pend.sort(function (a, b) { return a.base < b.base ? -1 : a.base > b.base ? 1 : a.t - b.t; });
    var slots = {};
    pend.forEach(function (p) {
      var desde = p.base < hoy ? hoy : p.base, d = desde;
      while ((cnt[d] || 0) > 0 && (cnt[d] || 0) + p.n > CAP) d = isoMas(d, 1);
      cnt[d] = (cnt[d] || 0) + p.n;
      slots[p.id] = { day: d, corrido: isoDias(d) - isoDias(desde) };
    });
    return { slots: slots, cnt: cnt, hoy: hoy };
  }
  var planCache = null;
  function planDe(o) { return (planCache || (planCache = plan())).slots[o._id] || null; }
  function entregarHoy(o) { if (o.status !== "pagado") return false; var p = planDe(o); return !!p && p.day <= hoyIso(); }
  function porConfirmar(o) { return !o.stockApplied && o.status !== "cancelado" && (o.items || []).some(function (it) { var s = setPorId(it.id); return s && s.stock !== null; }); }
  function estTxt(k) { return (ESTADOS.filter(function (e) { return e[0] === k; })[0] || ESTADOS[0])[1]; }
  function telDe(o) { if (o.phone) return o.phone; var c = P.fichas[claveCli(o.steamId, o.customerName)]; return (c && c.phone) || ""; }
  function nombreBonito(n) { return String(n || "").trim().toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  function msgEntrega(o) {
    return ["✅ *¡PEDIDO ENTREGADO!* ✅", "", "Hola *" + (nombreBonito(o.customerName).split(" ")[0] || "") + "* ⚔️",
      "Tu pedido *" + (o.code || o._id) + "* de *Rayas Store* ya está en tu inventario de Dota 2 ✨", "", "*Sets entregados:*",
      (o.items || []).map(function (it) { return "⚡ " + (it.qty > 1 ? it.qty + " × " : "") + it.name; }).join("\n"), "",
      "➡️ Abre Dota 2, revisa tu inventario y equípalo.", "⭐ Si te gustó la atención, recomiéndanos con tus amigos.", "❤️ ¡Gracias por tu compra! Cualquier duda, escríbeme por aquí.", "", "— *Rayas Store* · rayas.trade"].join("\n");
  }
  function clientes() {
    var m = {};
    P.orders.forEach(function (o) {
      var k = claveCli(o.steamId, o.customerName), c = m[k] || (m[k] = { key: k, name: o.customerName || "", steamId: o.steamId || "", phone: "" });
      if (o.phone && !c.phone) c.phone = o.phone;
    });
    Object.keys(P.fichas).forEach(function (k) { var f = P.fichas[k], c = m[k] || (m[k] = { key: k, name: f.name || "", steamId: f.steamId || "", phone: "" }); if (f.phone) c.phone = f.phone; if (!c.name) c.name = f.name || ""; });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "es"); });
  }
  function amistadHtml(clave) {
    var since = desdeDe(clave), txt = "Sin fecha de amistad", cls = "none";
    if (since) {
      var listo = new Date(since + "T00:00:00"); listo.setDate(listo.getDate() + ESPERA);
      var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      var faltan = Math.round((listo - hoy) / 86400000);
      if (faltan <= 0) { txt = "✓ Entrega inmediata"; cls = "ok"; } else { txt = "Entrega desde " + listo.toLocaleDateString("es-PE") + ", faltan " + faltan + (faltan === 1 ? " día" : " días"); cls = "wait"; }
    }
    return '<div class="sc-fr" data-key="' + esc(clave) + '"><div class="sc-fr-top"><b>🤝 Amigos desde</b><span class="sc-frb ' + cls + '">' + esc(txt) + '</span></div>' +
      '<div class="sc-fr-c"><input type="date" class="sc-frd" value="' + esc(since) + '" aria-label="Fecha de amistad"><button type="button" class="btn btn-ghost btn-sm" data-s="frHoy">Hoy</button><button type="button" class="btn btn-ghost btn-sm" data-s="frMes">📅 Hace 1 mes</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="frBorrar"' + (since ? '' : ' disabled') + '>Borrar</button></div></div>';
  }
  function lineaPlan(o) {
    if (o.status !== "pagado") return "";
    var p = planDe(o), pl = planCache;
    if (!p) return '<div class="sc-plan wait">📅 Sin fecha de amistad: pon desde cuándo son amigos para programar la entrega.</div>';
    if (p.day <= pl.hoy) return '<div class="sc-plan ok">🚚 <b>Entregar hoy</b> · cupo de hoy ' + (pl.cnt[pl.hoy] || 0) + '/' + CAP + ' sets' + (p.corrido ? ' (por cupo se había corrido ' + p.corrido + (p.corrido === 1 ? ' día)' : ' días)') : '') + '</div>';
    return '<div class="sc-plan wait">📅 Entrega programada: <b>' + esc(fmtDia(p.day)) + '</b>' + (p.corrido ? ' · día ' + (ESPERA + p.corrido) + ': se corrió ' + p.corrido + (p.corrido === 1 ? ' día' : ' días') + ' porque ese día ya hay ' + CAP + ' sets por entregar' : ' · día ' + ESPERA + ' de amistad') + '</div>';
  }
  function fotoItem(it) { var s = setPorId(it.id); return (s && s.img) || it.img || ""; }
  function tarjetaPed(o) {
    var ab = !!P.abiertos[o._id] || P.tel === o._id, n = setsDe(o), clave = claveCli(o.steamId, o.customerName), tel = telDe(o);
    var notas = [nSets(n)];
    if (o.discount) notas.push("Dscto. −" + mon(o.discount));
    if (o.stockApplied) notas.push("stock descontado"); else if (porConfirmar(o)) notas.push("⚠ stock sin descontar");
    if (o.paidWith === "creditos") notas.push("💎 pagado con saldo (S/ " + (Number(o.creditos) || 0) + ")");
    if (o.manual) notas.push("pedido manual");
    var cab = '<button type="button" class="sc-orow" data-s="pAbrir" aria-expanded="' + ab + '"><span class="sc-ocode">' + esc(o.code || o._id) + '</span><span class="sc-owho">' + esc(o.customerName || "Sin nombre") + '</span>' +
      '<span class="sc-osub">' + (o.items || []).slice(0, 3).map(function (it) { return '<span class="sc-oth">' + foto(fotoItem(it)) + '</span>'; }).join("") + esc(fmtFecha(o.createdAt)) + ' · ' + nSets(n) +
      (porConfirmar(o) ? ' <i class="sc-flag">⚠ por confirmar</i>' : '') + (entregarHoy(o) ? ' <i class="sc-flag ok">🚚 entregar hoy</i>' : '') + '</span>' +
      '<span class="sc-obadge st-' + esc(o.status || "pendiente") + '">' + esc(estTxt(o.status)) + '</span><b class="sc-oamt">' + esc(mon(o.total)) + '</b><span class="sc-ochev" aria-hidden="true">▾</span></button>';
    if (!ab) return '<article class="sc-ocard" data-id="' + esc(o._id) + '">' + cab + '</article>';
    var telH = P.tel === o._id
      ? '<div class="sc-tel"><input class="sc-telin" type="text" maxlength="40" autocapitalize="off" placeholder="WhatsApp: número o @usuario" value="' + esc(fmtTel(o.phone)) + '"><button type="button" class="btn btn-yellow btn-sm" data-s="telGuardar">Guardar</button><button type="button" class="btn btn-ghost btn-sm" data-s="telCancelar">Cancelar</button></div>'
      : '<div>📱 ' + (tel ? '<a href="' + esc(waEnlace(tel)) + '" target="_blank" rel="noopener noreferrer">' + esc(fmtTel(tel)) + '</a>' : 'sin WhatsApp · <button type="button" class="sc-link" data-s="telEditar">Agregar número</button>') + '</div>';
    var url = perfilSteam(o.steamId);
    return '<article class="sc-ocard open" data-id="' + esc(o._id) + '">' + cab + '<div class="sc-obody">' +
      '<div class="sc-ocli"><div>👤 <b>' + esc(o.customerName || "Sin nombre") + '</b>' + (o.email ? ' · ✉ ' + esc(o.email) : '') + '</div><div>🎮 ' + (o.steamId ? '<b>' + esc(o.steamId) + '</b>' : 'sin ID de Steam') + (url ? ' <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Perfil de Steam ↗</a>' : '') + '</div>' + telH + '</div>' +
      '<ul class="sc-oitems">' + (o.items || []).map(function (it) { return '<li><span class="sc-oth">' + foto(fotoItem(it)) + '</span><span>' + (it.qty > 1 ? '<b>' + it.qty + ' ×</b> ' : '') + esc(it.name) + '</span><b>' + esc(mon((Number(it.price) || 0) * (it.qty || 1))) + '</b></li>'; }).join("") + '</ul>' +
      '<div class="sc-otot"><span>' + esc(notas.join(" · ")) + '</span><b>' + esc(mon(o.total)) + '</b></div>' + lineaPlan(o) + amistadHtml(clave) +
      '<div class="sc-oacts"><label>Estado <select class="sc-est">' + ESTADOS.map(function (e) { return '<option value="' + e[0] + '"' + ((o.status || "pendiente") === e[0] ? ' selected' : '') + '>' + e[1] + '</option>'; }).join("") + '</select></label>' +
      (porConfirmar(o) ? '<button type="button" class="btn btn-yellow btn-sm" data-s="pReservar">✅ Confirmar · descontar stock</button>' : '') +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="pAvisar">📲 Avisar entrega</button><button type="button" class="btn btn-ghost btn-sm sc-del-o" data-s="pBorrar">🗑 Eliminar</button></div></div></article>';
  }
  function pintarPed() {
    if (adm.tab !== "setsPed") return;
    if (!P.cargado && !P.cargando && !P.err) { cargarPed(); return; }
    if (!cat.cargado || cat.deCache) cargarCat(true);
    planCache = null;
    if (P.cargando && !P.cargado) { admEl.innerHTML = '<p class="hint">Cargando pedidos…</p>'; return; }
    if (P.err) { admEl.innerHTML = '<p class="sc-msg err">' + esc(P.err) + '</p><button type="button" class="btn btn-ghost btn-sm" data-s="pRecargar">↻ Intentar de nuevo</button>'; return; }
    var pl = planCache || (planCache = plan()), hoyN = pl.cnt[pl.hoy] || 0, ahora = new Date(), O = P.orders;
    var ventasMes = O.filter(function (o) { return (o.status === "pagado" || o.status === "entregado") && o.createdAt && o.createdAt.getMonth() === ahora.getMonth() && o.createdAt.getFullYear() === ahora.getFullYear(); }).reduce(function (a, o) { return a + (Number(o.total) || 0); }, 0);
    var h = '<div class="sc-stats"><div class="warn"><b>' + O.filter(entregarHoy).length + '</b><span>Entregar hoy</span></div><div class="warn"><b>' + O.filter(porConfirmar).length + '</b><span>Por confirmar</span></div>' +
      '<div><b>' + O.filter(function (o) { return o.createdAt && o.createdAt.toDateString() === ahora.toDateString(); }).length + '</b><span>Pedidos hoy</span></div><div class="ok"><b>' + esc(mon(ventasMes)) + '</b><span>Ventas del mes</span></div></div>';
    h += '<div class="sc-cupo' + (hoyN >= CAP ? ' full' : '') + '"><span>🚚 Cupo de entregas de hoy (Rayas): <b>' + hoyN + '/' + CAP + ' sets</b><small>Steam deja mandar ' + CAP + ' sets por día: lo que pase de ' + CAP + ' se corre al día siguiente (día ' + (ESPERA + 1) + '). Este cupo es solo de Rayas Store.</small></span>' +
      '<span class="sc-acts"><button type="button" class="btn btn-yellow btn-sm" data-s="manAbrir"' + (manEl ? ' disabled' : '') + '>➕ Agregar pedido manual</button><button type="button" class="btn btn-ghost btn-sm" data-s="pRecargar">↻ Actualizar</button></span></div>';
    h += '<div class="sc-man-slot"></div>';
    h += '<div class="subtabs sc-chips" role="tablist"></div><input type="search" class="sc-pq" placeholder="Buscar por código, nombre o ID de Steam…" value="' + esc(P.q) + '" autocomplete="off">' +
      (adm.msg ? '<p class="sc-msg ' + esc(adm.msgTipo) + '" role="status">' + esc(adm.msg) + '</p>' : '') + '<div class="sc-olist"></div>';
    admEl.innerHTML = h;
    if (manEl) admEl.querySelector(".sc-man-slot").appendChild(manEl);
    pintarListaPed();
  }
  function pintarListaPed() {
    var O = P.orders, q = sinTildes(P.q).trim();
    var cuenta = function (k) { return k === "all" ? O.length : k === "entregar" ? O.filter(entregarHoy).length : k === "confirmar" ? O.filter(porConfirmar).length : O.filter(function (o) { return (o.status || "pendiente") === k; }).length; };
    var chips = admEl.querySelector(".sc-chips"), list = admEl.querySelector(".sc-olist"); if (!chips || !list) return;
    chips.innerHTML = [["all", "Todos"], ["entregar", "🚚 Entregar hoy"], ["confirmar", "📌 Por confirmar"], ["pagado", "Pagados"], ["entregado", "Entregados"], ["pendiente", "Pendientes"], ["cancelado", "Cancelados"]].map(function (c) {
      return '<button type="button" class="subtab" role="tab" data-s="pFiltro" data-f="' + c[0] + '" aria-selected="' + (P.filtro === c[0]) + '">' + c[1] + ' (' + cuenta(c[0]) + ')</button>'; }).join("");
    var l = O.filter(function (o) {
      var f = P.filtro;
      return (f === "all" || (f === "entregar" ? entregarHoy(o) : f === "confirmar" ? porConfirmar(o) : (o.status || "pendiente") === f)) &&
        (!q || sinTildes((o.code || o._id) + " " + o.customerName + " " + o.steamId).indexOf(q) >= 0);
    }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    list.innerHTML = l.length ? l.map(tarjetaPed).join("") : '<p class="hint">' + (O.length ? 'No hay pedidos con ese filtro.' : 'Aún no hay pedidos de sets en Rayas. Aparecerán aquí cuando alguien compre con su saldo, o agrega uno manual.') + '</p>';
    R().hidratar();
  }
  function pedPorId(id) { return P.orders.filter(function (o) { return o._id === id; })[0] || null; }
  function rastreados(o) { return (o.items || []).filter(function (it) { var s = setPorId(it.id); return s && s.stock !== null; }); }
  // Descuenta del catálogo las unidades del pedido (el stock solo baja cuando tú lo confirmas, igual que en LitleJacob).
  function descontar(o, signo) {
    rastreados(o).forEach(function (it) { var s = setPorId(it.id); s.stock = Math.max(0, s.stock - signo * (it.qty || 1)); s.soldOut = s.stock <= 0; });
  }
  function patchPedido(o, cambios) { return fsPatch("orders/" + encodeURIComponent(o._id), cambios).then(function () { Object.assign(o, cambios); }); }
  function setEstado(o, nuevo, sel) {
    var cambios = { status: nuevo, updatedAt: new Date() }, stockCambio = false;
    if ((nuevo === "pagado" || nuevo === "entregado") && !o.stockApplied && rastreados(o).length &&
      window.confirm("¿Descontar del stock los sets de este pedido (" + rastreados(o).map(function (it) { return it.name; }).join(", ") + ")?")) { cambios.stockApplied = true; stockCambio = true; }
    var entrega = nuevo === "entregado" && o.status !== "entregado";
    if (entrega) cambios.entregadoDia = hoyIso();   // ocupa cupo de hoy (8 por día)
    if (entrega && telDe(o)) window.open(waEnlace(telDe(o), msgEntrega(Object.assign({}, o, cambios))), "_blank", "noopener");
    patchPedido(o, cambios).then(function () {
      adm.msg = "Pedido " + (o.code || o._id) + ": " + estTxt(nuevo) + (entrega && !telDe(o) ? ". Agrega su WhatsApp para avisarle." : "."); adm.msgTipo = "ok";
      if (entrega && !telDe(o)) P.tel = o._id;
      if (stockCambio) { descontar(o, 1); return guardarCat(adm.msg + " Stock descontado."); }
    }).catch(function (e) { if (sel) sel.value = o.status; adm.msg = errTxt(e); adm.msgTipo = "err"; }).then(pintarPed);
  }
  function reservar(o) {
    var ls = rastreados(o); if (!ls.length) return;
    if (!window.confirm("¿Confirmar el pedido " + (o.code || o._id) + " y descontar del stock? " + ls.map(function (it) { return (it.qty || 1) + " × " + it.name + " (quedan " + setPorId(it.id).stock + ")"; }).join(", "))) return;
    patchPedido(o, { stockApplied: true, updatedAt: new Date() }).then(function () { descontar(o, 1); return guardarCat("✔ Stock descontado (" + (o.code || o._id) + ")."); })
      .catch(function (e) { adm.msg = errTxt(e); adm.msgTipo = "err"; }).then(pintarPed);
  }
  function borrarPed(o) {
    if (!window.confirm("¿Eliminar el pedido " + (o.code || o._id) + " de " + (o.customerName || "este cliente") + "? No se puede deshacer.")) return;
    var devolver = o.stockApplied && rastreados(o).length && window.confirm("Este pedido ya descontó stock. ¿Devolver esas unidades al stock?");
    fsBorrar("orders/" + encodeURIComponent(o._id)).then(function () {
      P.orders = P.orders.filter(function (x) { return x !== o; });
      adm.msg = "Pedido " + (o.code || o._id) + " eliminado" + (devolver ? " y stock devuelto." : "."); adm.msgTipo = "ok";
      if (devolver) { descontar(o, -1); return guardarCat(adm.msg); }
    }).catch(function (e) { adm.msg = errTxt(e); adm.msgTipo = "err"; }).then(pintarPed);
  }
  function guardarFicha(clave, cambios) {
    var cur = P.fichas[clave] || {};
    var datos = Object.assign({ name: cur.name || "", steamId: cur.steamId || "", phone: cur.phone || "" }, cambios, { updatedAt: new Date() });
    return fsPatch("customers/" + encodeURIComponent(PREF + clave), datos).then(function () { P.fichas[clave] = Object.assign({}, cur, datos); });
  }
  function fichaBase(clave) {
    var o = P.orders.filter(function (x) { return claveCli(x.steamId, x.customerName) === clave; })[0];
    return o ? { name: o.customerName || "", steamId: o.steamId || "", phone: telDe(o) } : {};
  }
  function cambiarAmistad(clave, iso) {
    if (iso && !isoOk(iso)) return;
    guardarFicha(clave, Object.assign(fichaBase(clave), { friendSince: iso || "" })).then(function () { adm.msg = iso ? "✔ Fecha de amistad guardada." : "Fecha de amistad borrada."; adm.msgTipo = "ok"; })
      .catch(function (e) { adm.msg = errTxt(e); adm.msgTipo = "err"; }).then(pintarPed);
  }
  function guardarTel(o) {
    var inp = admEl.querySelector(".sc-telin"), t = normTel(inp && inp.value);
    if (t === null || !t) { adm.msg = "Revisa el WhatsApp: un número (ej. 987 654 321) o un @usuario."; adm.msgTipo = "err"; pintarPed(); return; }
    var clave = claveCli(o.steamId, o.customerName);
    patchPedido(o, { phone: t, updatedAt: new Date() }).then(function () { return guardarFicha(clave, Object.assign(fichaBase(clave), { phone: t, friendSince: desdeDe(clave) })); })
      .then(function () { P.tel = null; adm.msg = "✔ WhatsApp guardado."; adm.msgTipo = "ok"; if (o.status === "entregado") window.open(waEnlace(t, msgEntrega(o)), "_blank", "noopener"); })
      .catch(function (e) { adm.msg = errTxt(e); adm.msgTipo = "err"; }).then(pintarPed);
  }

  /* ---------------- pedido manual ---------------- */
  var man = null;   // { modo, lineas: [{id, qty}] }
  function manHtml() {
    var cl = clientes(), sets = ordenados(cat.sets).filter(function (s) { return s.price !== null; });
    return '<div class="grp sc-man"><h3>➕ Pedido manual</h3>' +
      '<div class="subtabs" role="group"><button type="button" class="subtab" data-s="manModo" data-m="nuevo" aria-selected="' + (man.modo === "nuevo") + '">👤 Cliente no registrado</button><button type="button" class="subtab" data-s="manModo" data-m="existente" aria-selected="' + (man.modo === "existente") + '">📇 Cliente existente</button></div>' +
      (man.modo === "nuevo"
        ? '<p class="hint">Para quien compró fuera de la web. Se guarda su ficha (WhatsApp e ID de Steam) y esta compra, y te llega el recordatorio por correo cuando cumpla su tiempo de amistad.</p>' +
          '<div class="field"><label>ID de amigo de Steam *</label><input data-m="steam" inputmode="numeric" maxlength="80" placeholder="Ej. 123456789 (o enlace del perfil)"></div>' +
          '<div class="field"><label>WhatsApp (número o @usuario) *</label><input data-m="phone" maxlength="40" autocapitalize="off" placeholder="Ej. 987 654 321 o @usuario"></div>' +
          '<div class="field"><label>Nombre de Dota 2 (opcional)</label><input data-m="name" maxlength="60"></div>'
        : '<div class="field"><label>Cliente *</label><select data-m="cli"><option value="">Elige un cliente…</option>' + cl.map(function (c) { return '<option value="' + esc(c.key) + '">' + esc(c.name || "Sin nombre") + (c.steamId ? " · ID " + esc(c.steamId) : "") + (c.phone ? " · " + esc(fmtTel(c.phone)) : "") + '</option>'; }).join("") + '</select></div>') +
      '<div class="field"><label>Amigos desde (el día que lo agregaste) *</label><div class="sc-row"><input type="date" data-m="since" value="' + hoyIso() + '"><button type="button" class="btn btn-ghost btn-sm" data-s="manHoy">Hoy</button><button type="button" class="btn btn-ghost btn-sm" data-s="manMes">📅 Hace 1 mes</button></div></div>' +
      '<div class="field"><label>¿Qué llevó? *</label><div class="sc-row"><select data-m="set"><option value="">Elige un set…</option>' + sets.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + ' · ' + esc(mon(s.price)) + (disponible(s) ? '' : ' (agotado)') + '</option>'; }).join("") + '</select><input type="number" data-m="qty" min="1" max="20" value="1" aria-label="Cantidad" style="width:70px"><button type="button" class="btn btn-ghost btn-sm" data-s="manAgregar">Agregar</button></div><div class="sc-manl"></div></div>' +
      '<div class="sc-f2"><div class="field"><label>Estado</label><select data-m="estado"><option value="pagado">💰 Pagado</option><option value="entregado">✅ Entregado</option><option value="pendiente">⏳ Pendiente</option></select></div>' +
      '<div class="field"><label>Total cobrado (S/) *</label><input type="number" data-m="total" min="0" step="0.01" inputmode="decimal"></div></div>' +
      '<div class="sc-plan sc-manprev"></div><p class="sc-ferr" role="alert"></p>' +
      '<div class="sc-acts"><button type="button" class="btn btn-fuchsia btn-sm" data-s="manGuardar">💾 Crear pedido</button><button type="button" class="btn btn-ghost btn-sm" data-s="manCerrar">Cancelar</button></div></div>';
  }
  function manAbrir() { man = { modo: "nuevo", lineas: [], totalTocado: false }; manEl = document.createElement("div"); manEl.innerHTML = manHtml(); pintarPed(); manRefrescar(); }
  function manCerrar() { man = null; manEl = null; pintarPed(); }
  function mv(k) { var el = manEl && manEl.querySelector('[data-m="' + k + '"]'); return el ? el.value : ""; }
  function manTotales() {
    var n = 0, sub = 0, eleg = 0;
    man.lineas.forEach(function (l) { var s = setPorId(l.id); if (!s) return; n += l.qty; sub += s.price * l.qty; if (s.price <= DTO_MAX) eleg += s.price * l.qty; });
    var nivel = DTO.filter(function (d) { return n >= d.min; })[0], dto = nivel ? r2(eleg * nivel.pct / 100) : 0;
    return { n: n, sub: r2(sub), dto: dto, tot: r2(sub - dto) };
  }
  function manRefrescar() {
    if (!manEl) return;
    var t = manTotales();
    manEl.querySelector(".sc-manl").innerHTML = man.lineas.map(function (l) { var s = setPorId(l.id); return s ? '<div class="sc-manr"><span>' + l.qty + ' × ' + esc(s.name) + '</span><b>' + esc(mon(s.price * l.qty)) + '</b><button type="button" class="carr-x" data-s="manQuitar" data-id="' + s.id + '" aria-label="Quitar">🗑</button></div>' : ''; }).join("") +
      (t.n ? '<small class="hint">' + nSets(t.n) + ' · subtotal ' + mon(t.sub) + (t.dto ? ' · dscto. −' + mon(t.dto) : '') + '</small>' : '');
    var tot = manEl.querySelector('[data-m="total"]'); if (tot && !man.totalTocado) tot.value = t.n ? t.tot : "";
    if (man.modo === "existente") { var k = mv("cli"), d = manEl.querySelector('[data-m="since"]'); if (k && man.cliPrevio !== k) { man.cliPrevio = k; d.value = desdeDe(k) || hoyIso(); } }
    var box = manEl.querySelector(".sc-manprev"), since = mv("since");
    if (!isoOk(since)) { box.className = "sc-plan sc-manprev"; box.textContent = ""; return; }
    if (mv("estado") !== "pagado") { box.className = "sc-plan sc-manprev"; box.textContent = "ℹ️ La entrega solo se programa (y te llega el recordatorio) cuando el estado es “Pagado”."; return; }
    planCache = null;
    var pl = plan({ id: "__nuevo", base: isoMas(since, ESPERA), n: t.n || 1 }), p = pl.slots.__nuevo, hoyEs = p.day <= pl.hoy;
    box.className = "sc-plan sc-manprev " + (hoyEs ? "ok" : "wait");
    box.innerHTML = hoyEs ? "🚚 Le toca entregar <b>hoy</b> (cupo de hoy " + (pl.cnt[pl.hoy] || 0) + "/" + CAP + " sets contando este pedido)."
      : "📅 Entrega: <b>" + esc(fmtDia(p.day)) + "</b> · día " + (ESPERA + p.corrido) + (p.corrido ? ": se corre " + p.corrido + (p.corrido === 1 ? " día" : " días") + " porque ese día ya hay " + CAP + " sets por entregar" : " de amistad") + ". Te llegará el recordatorio a tu correo ese día.";
    planCache = null;
  }
  function manGuardar() {
    var err = manEl.querySelector(".sc-ferr"); err.textContent = "";
    var nombre, steam, tel, since = mv("since");
    if (man.modo === "existente") {
      var c = clientes().filter(function (x) { return x.key === mv("cli"); })[0];
      if (!c) { err.textContent = "Elige el cliente."; return; }
      nombre = c.name || ""; steam = c.steamId || ""; tel = c.phone || "";
    } else {
      steam = normSteam(mv("steam")); tel = normTel(mv("phone")); nombre = mv("name").trim().replace(/\s+/g, " ").slice(0, 60);
      if (steam === null) { err.textContent = "El ID de amigo de Steam son solo números (ej. 123456789)."; return; }
      if (!steam) { err.textContent = "Escribe el ID de amigo de Steam del cliente."; return; }
      if (tel === null) { err.textContent = "Revisa el WhatsApp: un número (ej. 987 654 321) o un @usuario (ej. @tuusuario)."; return; }
      if (!tel) { err.textContent = "Escribe su número de WhatsApp o su @usuario."; return; }
      if (!nombre) nombre = "Cliente " + steam;
      if (clientes().some(function (x) { return x.key === claveCli(steam, nombre); })) { err.textContent = "Ya existe un cliente con ese ID de Steam. Cámbialo a “Cliente existente”."; return; }
    }
    if (!isoOk(since)) { err.textContent = "Pon desde cuándo son amigos (fecha de amistad)."; return; }
    if (!man.lineas.length) { err.textContent = "Agrega al menos un set."; return; }
    var total = Number(String(mv("total")).replace(",", "."));
    if (!isFinite(total) || total < 0 || mv("total") === "") { err.textContent = "Escribe el total cobrado."; return; }
    var clave = claveCli(steam, nombre), prev = desdeDe(clave);
    if (prev && prev !== since && !window.confirm("Cambiarás la fecha de amistad de " + nombre + " (de " + prev + " a " + since + "). Afecta también sus otros pedidos. ¿Continuar?")) return;
    var t = manTotales(), estado = mv("estado"), code = nuevoCodigo(true);
    var pedido = { code: code, customerName: nombre, steamId: steam, phone: tel || "",
      items: man.lineas.map(function (l) { var s = setPorId(l.id); return { id: String(s.id), name: s.name, qty: l.qty, price: s.price, img: s.img || "" }; }),
      count: t.n, subtotal: t.sub, discount: r2(Math.max(0, t.sub - total)), total: r2(total), status: estado, createdAt: new Date(),
      origen: "manual", manual: true, clienteRegistrado: false, tienda: "rayas" };
    if (estado === "entregado") pedido.entregadoDia = hoyIso();
    var conStock = estado !== "pendiente" && pedido.items.some(function (it) { var s = setPorId(it.id); return s && s.stock !== null; }) && window.confirm("¿Descontar del stock los sets de este pedido?");
    if (conStock) pedido.stockApplied = true;
    manEl.querySelector('[data-s="manGuardar"]').disabled = true;
    guardarFicha(clave, { name: nombre, steamId: steam, phone: tel || "", friendSince: since })
      .then(function () { return fsPatch("orders/" + encodeURIComponent(code), pedido); })
      .then(function () {
        pedido._id = code; P.orders.unshift(pedido); man = null; manEl = null;
        planCache = null; var p = planDe(pedido);
        adm.msg = "✔ Pedido " + code + " creado para " + nombre + "." + (estado !== "pagado" || !p ? "" : p.day <= hoyIso() ? " Hoy le toca entregarlo." : " Entrega: " + fmtDia(p.day) + ".");
        adm.msgTipo = "ok";
        if (conStock) { descontar(pedido, 1); return guardarCat(adm.msg + " Stock descontado."); }
      }).catch(function (e) { err.textContent = errTxt(e); var b = manEl && manEl.querySelector('[data-s="manGuardar"]'); if (b) b.disabled = false; })
      .then(function () { if (!manEl) pintarPed(); });
  }

  /* =====================================================================
     EVENTOS (atributo data-s, para no chocar con los de app.js)
     ===================================================================== */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-s]"); if (!t || !R()) return;
    var a = t.getAttribute("data-s"), id = t.getAttribute("data-id");
    var card = t.closest(".sc-ocard"), o = card ? pedPorId(card.getAttribute("data-id")) : null;
    var fr = t.closest(".sc-fr"), clave = fr ? fr.getAttribute("data-key") : "";
    switch (a) {
      case "agregar": agregar(id); break;
      case "quitar": quitar(id); break;
      case "rar": cli.rar = t.getAttribute("data-v") || ""; pintarCli(); break;
      case "carro": abrirMod({ tipo: "carro" }); break;
      case "cerrarMod": cerrarMod(); break;
      case "menos": cambiarQty(id, -1); pintarMod(); break;
      case "mas": cambiarQty(id, 1); pintarMod(); break;
      case "quitarCarro": quitar(id); pintarMod(); break;
      case "vaciar": carro = []; guardarCarro(); pintarCli(); pintarMod(); break;
      case "pagar": pagar(); break;
      case "pagarSi": pagarSi(); break;
      case "recargar": cerrarMod(); R().recargar(); break;
      case "wsp": var tw = totales(); if (tw.n) { cerrarMod(); R().waPedir(mensajeWsp(tw)); } break;
      case "wspOk": var mo = mod && mod.msg; cerrarMod(); if (mo) R().waPedir(mo); break;
      case "admAbrir": R().abrirAdmin(t.getAttribute("data-t")); break;
      case "admNuevo": adm.form = { nuevo: true, s: normSet({ id: nuevoId(), name: "", price: null, stock: 1, rarity: "MÍTICO" }) }; adm.form.s.name = ""; adm.msg = ""; pintarAdmin(); break;
      case "admEditar":
        var se = setPorId(id); if (!se) break;
        if (!admEl.isConnected || adm.tab !== "setsCat") { adm.tab = ""; R().abrirAdmin("setsCat"); adm.tab = "setsCat"; }
        adm.form = { nuevo: false, s: Object.assign({}, se) }; adm.msg = ""; pintarAdmin(); break;
      case "fCancelar": adm.form = null; pintarAdmin(); break;
      case "fGuardar": guardarForm(); break;
      case "fQuitarFoto": leerForm(); adm.form.s.img = ""; pintarAdmin(); break;
      case "admBorrar": adm.borrar = Number(id); pintarAdmin(); break;
      case "admBorrarSi":
        var sb = setPorId(id), antes = cat.sets.slice(); if (!sb) break;
        cat.sets = cat.sets.filter(function (x) { return x.id !== sb.id; }); adm.borrar = null;
        guardarCat("Set \"" + sb.name + "\" quitado.").catch(function () { cat.sets = antes; pintarAdmin(); }); break;
      case "admStock": cambiarStock(id, Number(t.getAttribute("data-d"))); break;
      case "admImportar": importarLJ(); break;
      case "pRecargar": P.cargado = false; P.err = ""; adm.msg = ""; cargarPed(); cargarCat(true); break;
      case "pFiltro": P.filtro = t.getAttribute("data-f"); pintarListaPed(); break;
      case "pAbrir": if (o) { P.abiertos[o._id] = !P.abiertos[o._id]; if (P.tel === o._id) P.tel = null; pintarListaPed(); } break;
      case "pReservar": if (o) reservar(o); break;
      case "pAvisar": if (o) { var tl = telDe(o); if (tl) window.open(waEnlace(tl, msgEntrega(o)), "_blank", "noopener"); else { P.tel = o._id; pintarListaPed(); } } break;
      case "pBorrar": if (o) borrarPed(o); break;
      case "telEditar": if (o) { P.tel = o._id; pintarListaPed(); var ti = admEl.querySelector(".sc-telin"); if (ti) ti.focus(); } break;
      case "telCancelar": P.tel = null; pintarListaPed(); break;
      case "telGuardar": if (o) guardarTel(o); break;
      case "frHoy": cambiarAmistad(clave, hoyIso()); break;
      case "frMes": cambiarAmistad(clave, isoMas(hoyIso(), -ESPERA)); break;
      case "frBorrar": if (window.confirm("¿Borrar la fecha de amistad de este cliente?")) cambiarAmistad(clave, ""); break;
      case "manAbrir": manAbrir(); break;
      case "manCerrar": manCerrar(); break;
      case "manModo": man.modo = t.getAttribute("data-m"); man.cliPrevio = null; manEl.innerHTML = manHtml(); manRefrescar(); break;
      case "manHoy": manEl.querySelector('[data-m="since"]').value = hoyIso(); manRefrescar(); break;
      case "manMes": manEl.querySelector('[data-m="since"]').value = isoMas(hoyIso(), -ESPERA); manRefrescar(); break;
      case "manAgregar":
        var sid = Number(mv("set")), q = Math.max(1, Math.min(20, Math.floor(Number(mv("qty")) || 1)));
        if (!setPorId(sid)) break;
        var ya = man.lineas.filter(function (l) { return l.id === sid; })[0]; if (ya) ya.qty = Math.min(20, ya.qty + q); else man.lineas.push({ id: sid, qty: q });
        manRefrescar(); break;
      case "manQuitar": man.lineas = man.lineas.filter(function (l) { return l.id !== Number(id); }); manRefrescar(); break;
      case "manGuardar": manGuardar(); break;
    }
  });
  document.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el.classList.contains("sc-q")) { cli.q = el.value; pintarGrid(); }
    else if (el.classList.contains("sc-aq")) { adm.q = el.value; var b = admEl.querySelector(".sc-alist"); if (b) { b.innerHTML = listaAdmHtml(); R().hidratar(); } }
    else if (el.classList.contains("sc-pq")) { P.q = el.value; pintarListaPed(); }
    else if (manEl && manEl.contains(el)) { if (el.getAttribute("data-m") === "total") man.totalTocado = true; manRefrescar(); }
  });
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.classList.contains("sc-vis")) {
      var antes = cat.visible; cat.visible = el.checked;
      guardarCat(cat.visible ? "✔ Sets Caché visible para los clientes." : "Sets Caché oculta: solo tú la ves.").then(function () { R().render(); }).catch(function () { cat.visible = antes; pintarAdmin(); });
    } else if (el.classList.contains("sc-ffile")) { if (el.files && el.files[0]) subirFoto(el.files[0]); el.value = ""; }
    else if (el.classList.contains("sc-est")) { var c = el.closest(".sc-ocard"), o = c && pedPorId(c.getAttribute("data-id")); if (o && el.value !== o.status) setEstado(o, el.value, el); }
    else if (el.classList.contains("sc-frd")) { var fr = el.closest(".sc-fr"); if (fr) cambiarAmistad(fr.getAttribute("data-key"), el.value); }
    else if (manEl && manEl.contains(el)) manRefrescar();
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && mod && mod.tipo !== "cargando") cerrarMod(); });

  /* =====================================================================
     Lo que llama app.js
     ===================================================================== */
  var vistaAntes = "", cliFirma = "";
  window.setsCache = {
    visible: function () { return cat.visible; },
    // Se llama después de cada dibujo de la página: pone de vuelta la sección y el panel (sin perder lo escrito).
    montar: function (vista) {
      if (!R()) return;
      if (!cat.cargado || cat.deCache) cargarCat(R().admin());
      var slot = document.getElementById("setsSlot");
      if (slot) {
        var firma = R().admin() + "|" + cat.visible;
        if (vistaAntes !== "sets" || !cliEl.innerHTML || firma !== cliFirma) { cliFirma = firma; pintarCli(); }
        slot.replaceWith(cliEl);
        if (!R().admin() && cat.cargado && !carro.length) limpiarCarro();
      }
      vistaAntes = vista;
      var as = document.getElementById("setsAdminSlot");
      if (as) {
        var tab = as.getAttribute("data-t");
        if (tab !== adm.tab || !admEl.innerHTML) { if (tab !== adm.tab) { adm.msg = ""; adm.form = null; } adm.tab = tab; as.replaceWith(admEl); pintarAdmin(); }
        else as.replaceWith(admEl);
      }
      R().hidratar();
    },
    _probar: { totales: totales, plan: plan, cat: cat, P: P }
  };
})();
