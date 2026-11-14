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
  var TD = window.TIENDA || { id: "rayas", nombre: "Rayas Store", nombreMayus: "RAYAS STORE", dominio: "rayas.trade", codigo: "RY", clientePrefijo: "r_", claves: { setsCarro: "rayas_sets_carrito", setsCat: "rayas_sets_guardados_v1" } }; // ajustes de la tienda (tienda.js)
  var DOC = "live/rayasSets";   // ETAPA 4 de "una sola web": LitleJacob tendrá su propio documento
  var URL_COMPRAR = "https://us-central1-litlejacob-store.cloudfunctions.net/comprarSets";
  var LJ_WEB = "https://litlejacob.trade/";
  var RAREZAS = ["MÍTICO", "INMORTAL", "ARCANO"];
  var DTO = [], DTO_MAX = 25;   // Rayas NO tiene promo por cantidad (functions/sets.js: sinDescuento para tienda rayas)
  var CAP = 8, ESPERA = 30, PREF = TD.clientePrefijo;                                // igual que functions/recordatorio.js
  var CARRO_KEY = TD.claves.setsCarro, CAT_KEY = TD.claves.setsCat;
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
  function nuevoCodigo(manual) { return TD.codigo + "-" + (manual ? "M" : "") + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).toUpperCase().slice(2, 4); }
  function colorRar(r) { return R() && R().colorRareza ? R().colorRareza(r) : "#8847ff"; }
  function foto(src, extra) { var h = src && R() ? R().imgTag(src, "", extra || ' loading="lazy"') : ""; return h || '<span class="sc-sinfoto" aria-hidden="true">🎁</span>'; }

  /* ---------------- catálogo ---------------- */
  var cat = { sets: [], cuentas: [], visible: false, cargado: false, cargando: false, err: "" };
  (function () { var g = leerLS(CAT_KEY); if (g && Array.isArray(g.sets)) { cat.sets = g.sets; cat.cuentas = Array.isArray(g.cuentas) ? g.cuentas : []; cat.visible = !!g.visible; cat.cargado = true; cat.deCache = true; } })();
  // Reparto del stock por cuenta de Steam: porCuenta = { "<id de cuenta>": unidades }. Si un set lo tiene, su stock = la suma.
  function normPc(pc) {
    if (!pc || typeof pc !== "object" || Array.isArray(pc)) return null;
    var o = {}, hay = false;
    Object.keys(pc).forEach(function (k) { var n = Number(pc[k]); if (/^c[a-z0-9]{1,20}$/.test(k) && pc[k] !== "" && pc[k] !== null && isFinite(n)) { o[k] = Math.floor(n); hay = true; } });
    return hay ? o : null;
  }
  function sumaPc(pc) { return Object.keys(pc).reduce(function (t, k) { return t + pc[k]; }, 0); }
  function normSet(x) {
    var p = x.price === null || x.price === undefined || x.price === "" || isNaN(Number(x.price)) ? null : r2(Number(x.price));
    var st = x.stock === null || x.stock === undefined || x.stock === "" || isNaN(Number(x.stock)) ? null : Math.floor(Number(x.stock));
    var pc = normPc(x.porCuenta);
    if (pc) st = sumaPc(pc);
    var s = { id: Math.floor(Number(x.id)) || 0, name: String(x.name || "Set").slice(0, 80), price: p, stock: st, soldOut: !!x.soldOut || (st !== null && st <= 0),
      img: String(x.img || "").slice(0, 300), rarity: RAREZAS.indexOf(x.rarity) >= 0 ? x.rarity : "MÍTICO", hero: String(x.hero || "").slice(0, 40), styles: Math.max(0, Math.floor(Number(x.styles) || 0)) };
    if (pc) s.porCuenta = pc;
    return s;
  }
  // Cuentas de Steam desde donde se regalan los sets: { id, nick, perfil (enlace), desc (texto llamativo para el cliente) }
  function perfilOk(v) {
    v = String(v || "").trim(); if (!v) return "";
    var m = /^765611\d{11}$/.exec(v); if (m) return "https://steamcommunity.com/profiles/" + v;
    if (!/^https?:\/\//i.test(v) && /^steamcommunity\.com\//i.test(v)) v = "https://" + v;
    var u = /^https?:\/\/(?:www\.)?steamcommunity\.com\/(id|profiles)\/([A-Za-z0-9_-]{2,64})\/?$/i.exec(v.split(/[?#]/)[0]);
    return u ? "https://steamcommunity.com/" + u[1].toLowerCase() + "/" + u[2] + "/" : null;
  }
  function normCuenta(c) {
    return { id: /^c[a-z0-9]{1,20}$/.test(c && c.id) ? c.id : "c" + Date.now().toString(36), nick: String((c && c.nick) || "Cuenta").trim().slice(0, 40) || "Cuenta",
      perfil: perfilOk(c && c.perfil) || "", desc: String((c && c.desc) || "").trim().slice(0, 160) };
  }
  var FRASES = [
    "🔥 Los sets más buscados salen directo desde {nick}",
    "⚡ Entrega rápida desde la cuenta de {nick}: agrégala y listo",
    "🎁 El cofre de {nick}: sets nuevos y a buen precio",
    "👑 Colección premium de {nick}, lista para tu héroe",
    "💎 {nick} trae los sets más top del momento",
    "🛡 Sets garantizados desde {nick}, entrega por Steam"
  ];
  function descDe(c) { return c.desc || FRASES[0].replace("{nick}", c.nick); }
  function cuentaPorId(id) { return cat.cuentas.filter(function (c) { return c.id === id; })[0] || null; }
  function tieneCuentas(s) { return !!(s && s.porCuenta && Object.keys(s.porCuenta).length); }
  function enCuenta(s, cid) { return s && s.porCuenta && s.porCuenta[cid] !== undefined ? s.porCuenta[cid] : null; }
  // Suma o resta unidades a un set. Si está repartido por cuentas: se resta de la cuenta con más unidades
  // y se suma primero a la que esté en negativo (si no, a la primera). El total queda como la suma.
  function ajustarSet(s, delta) {
    if (!s || !delta) return;
    if (!tieneCuentas(s)) { s.stock = (s.stock === null ? 0 : s.stock) + delta; return; }
    var pc = s.porCuenta, ks = Object.keys(pc), paso = delta > 0 ? 1 : -1;
    for (var i = 0; i < Math.abs(delta); i++) {
      var k = ks[0];
      if (paso < 0) ks.forEach(function (x) { if (pc[x] > pc[k]) k = x; });
      else { var neg = ks.filter(function (x) { return pc[x] < 0; }); if (neg.length) k = neg[0]; }
      pc[k] += paso;
    }
    s.stock = sumaPc(pc);
  }
  // Chips "Nick: n" de cada cuenta (panel admin). Con donde = true se pueden tocar para ver esa cuenta en Stock.
  function chipsCta(s, tocar) {
    if (!tieneCuentas(s)) return "";
    return '<span class="sc-cchips">' + cat.cuentas.filter(function (c) { return enCuenta(s, c.id) !== null; }).map(function (c) {
      var n = s.porCuenta[c.id];
      return (tocar ? '<button type="button" data-s="stCta" data-v="' + esc(c.id) + '"' : '<span') + ' class="sc-cchip' + (n > 0 ? '' : ' cero') + '">🎮 ' + esc(c.nick) + ': <b>' + n + '</b>' + (tocar ? '</button>' : '</span>');
    }).join("") + '</span>';
  }
  function dondeHay(s) {
    if (!tieneCuentas(s)) return "";
    var l = Object.keys(s.porCuenta).filter(function (k) { return s.porCuenta[k] > 0 && cuentaPorId(k); }).sort(function (a, b) { return s.porCuenta[b] - s.porCuenta[a]; });
    return l.length ? l.map(function (k) { return cuentaPorId(k).nick + " (" + s.porCuenta[k] + ")"; }).join(" · ") : "sin unidades en las cuentas";
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
      var antes = JSON.stringify([cat.sets, cat.visible, cat.cuentas]);
      cat.sets = (Array.isArray(j.sets) ? j.sets : []).map(normSet).filter(function (s) { return s.id > 0; });
      cat.cuentas = (Array.isArray(j.cuentas) ? j.cuentas : []).map(normCuenta);
      cat.visible = j.visible === true; cat.cargado = true; cat.deCache = false; cat.err = "";
      if (!R().admin()) guardarLS(CAT_KEY, { sets: cat.sets, cuentas: cat.cuentas, visible: cat.visible });
      return antes !== JSON.stringify([cat.sets, cat.visible, cat.cuentas]);
    }).catch(function (e) { cat.err = errTxt(e); cat.cargado = true; cat.deCache = false; return true; })
      .then(function (cambio) {
        cat.cargando = false;
        if (cambio === false) return;
        limpiarCarro(); R().render(); pintarCli();
        if (adm.tab) pintarAdmin();
      });
  }
  function jsonCat() { return { sets: cat.sets.map(normSet), cuentas: cat.cuentas.map(normCuenta), visible: cat.visible, actualizado: new Date().toISOString() }; }
  function guardarCat(msg) {
    var j = jsonCat();
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
    if (!DTO.length) return "Toca para ver tu carrito y pagar";
    if (!t.sig) return "¡Tienes el descuento máximo de " + t.alcanzado.pct + "%!";
    return "Agrega " + nSets(t.sig.min - t.n) + " más y obtén " + t.sig.pct + "% de descuento" + (t.alcanzado ? " (ahora tienes " + t.alcanzado.pct + "%)" : "");
  }
  function agregar(id) {
    var s = setPorId(id); if (!disponible(s)) return;
    var c = carro.filter(function (x) { return x.id === s.id; })[0];
    if (c) { if (s.stock !== null && c.qty >= s.stock) { aviso("Solo hay " + s.stock + (s.stock === 1 ? " unidad" : " unidades") + " de \"" + s.name + "\"."); return; } c.qty = Math.min(20, c.qty + 1); }
    else carro.push({ id: s.id, qty: 1 });
    guardarCarro(); pintarCli(); aviso("\"" + s.name + "\" agregado al carrito.");
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
  var cli = { q: "", rar: "", cuenta: "" };
  var cliEl = document.createElement("div"); cliEl.className = "sc-cli";
  function filtrados() {
    var q = sinTildes(cli.q).trim();
    return ordenados(cat.sets).filter(function (s) {
      return (!cli.rar || s.rarity === cli.rar) && (!q || sinTildes(s.name + " " + s.hero).indexOf(q) >= 0);
    });
  }
  function tarjetaHtml(s, nCta) {
    var ok = disponible(s), col = colorRar(s.rarity), dentro = enCarro(s.id), adminVe = R().admin();
    var quedan = typeof nCta === "number" ? nCta : s.stock;
    return '<article class="icard sc-card' + (ok ? '' : ' agot') + (dentro ? ' sc-in' : '') + '">' +
      '<div class="ithumb" style="--rar:' + col + '">' + foto(s.img) +
      (ok ? (quedan !== null && quedan <= 3 ? '<span class="itag">Quedan ' + quedan + '</span>' : '') : '<span class="itag agotado">Agotado</span>') +
      '</div>' +
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
      '<div class="itadm frame"><div class="in"><b>Modo administrador</b><button type="button" class="btn btn-yellow btn-sm" data-s="admAbrir" data-t="setsCat">🎁 Catálogo de sets</button><button type="button" class="btn btn-ghost btn-sm" data-s="admAbrir" data-t="setsStk">📦 Stock</button><button type="button" class="btn btn-ghost btn-sm" data-s="admAbrir" data-t="setsPed">📋 Pedidos y clientes</button></div></div>';
    if (!adminVe && cat.cargado && !cat.err && !cat.visible) {
      cliEl.innerHTML = h + '<div class="empty frame"><div class="in"><strong>Muy pronto</strong><span>Estamos preparando los sets caché. Vuelve en unos días.</span></div></div>';
      return;
    }
    h += '<div class="sc-info sc-info1">' +
      '<div class="sc-entrega"><b>🚚 Entrega por Steam</b><span>⚡ Si ya somos amigos, la entrega es inmediata. ⏳ Si aún no, se cumplen 30 días de amistad antes de la entrega.</span></div></div>';
    h += '<div class="sc-bar"><input type="search" class="sc-q" placeholder="Buscar set o héroe…" autocomplete="off" value="' + esc(cli.q) + '">' +
      '<div class="sc-rars" role="group" aria-label="Rareza">' + [""].concat(RAREZAS).map(function (r) {
        return '<button type="button" class="itab' + (cli.rar === r ? ' on' : '') + '" data-s="rar" data-v="' + esc(r) + '">' + (r ? esc(r.charAt(0) + r.slice(1).toLowerCase()) : 'Todos') + '</button>'; }).join("") + '</div>' +
      '<span class="icount sc-count"></span></div>';
    var cs = conCuentas() ? cuentasConSets() : [];
    if (cs.length > 1 || (cs.length && cli.cuenta)) h += '<div class="sc-ctas-nav" role="group" aria-label="Cuentas de Steam"><span>🎮 Cuentas:</span><button type="button" class="itab' + (cli.cuenta ? '' : ' on') + '" data-s="cta" data-v="">Todas</button>' +
      cs.map(function (c) { return '<button type="button" class="itab' + (cli.cuenta === c.id ? ' on' : '') + '" data-s="cta" data-v="' + esc(c.id) + '">' + esc(c.nick) + '</button>'; }).join("") + '</div>';
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
    var l = filtrados(), vacio = '<div class="empty frame"><div class="in"><strong>' + (cat.sets.length ? 'Ningún set coincide' : 'Pronto nuevos sets') + '</strong><span>' + (cat.sets.length ? 'Prueba con otra búsqueda.' : 'Estamos subiendo el catálogo.') + '</span></div></div>';
    if (cli.cuenta && !cuentaPorId(cli.cuenta)) cli.cuenta = "";
    if (!conCuentas()) {
      if (cnt) cnt.textContent = nSets(l.length);
      box.innerHTML = l.length ? '<div class="igrid sc-grid">' + l.map(function (s) { return tarjetaHtml(s); }).join("") + '</div>' : vacio;
      R().hidratar(); return;
    }
    var grid = function (lista, cid) { return '<div class="igrid sc-grid">' + lista.map(function (s) { return tarjetaHtml(s, cid ? enCuenta(s, cid) : undefined); }).join("") + '</div>'; };
    var deCuenta = function (cid) { return l.filter(function (s) { return disponible(s) && enCuenta(s, cid) > 0; }); };
    if (cli.cuenta) {   // el cliente entró a una cuenta: descripción, enlace al perfil de Steam y sus sets
      var c = cuentaPorId(cli.cuenta), ls = deCuenta(c.id);
      if (cnt) cnt.textContent = nSets(ls.length);
      box.innerHTML = cabCuenta(c, ls.length, true) + (ls.length ? grid(ls, c.id) : '<div class="empty frame"><div class="in"><strong>' + (l.length ? 'Ningún set coincide en esta cuenta' : 'Esta cuenta no tiene sets ahora') + '</strong><span>Mira las otras cuentas.</span></div></div>');
      R().hidratar(); return;
    }
    var h = "", vistos = {};
    cat.cuentas.forEach(function (c) {
      var ls = deCuenta(c.id); if (!ls.length) return;
      ls.forEach(function (s) { vistos[s.id] = 1; });
      h += '<section class="sc-grupo">' + cabCuenta(c, ls.length, false) + grid(ls, c.id) + '</section>';
    });
    var otros = l.filter(function (s) { return disponible(s) && !vistos[s.id]; }), agot = l.filter(function (s) { return !disponible(s); });
    otros.forEach(function (s) { vistos[s.id] = 1; });
    if (otros.length) h += '<section class="sc-grupo"><h3 class="sc-gtit">🎁 Más sets</h3>' + grid(otros) + '</section>';
    if (agot.length) h += '<section class="sc-grupo"><h3 class="sc-gtit">Agotados</h3>' + grid(agot) + '</section>';
    if (cnt) cnt.textContent = nSets(Object.keys(vistos).length + agot.length);
    box.innerHTML = h || vacio;
    R().hidratar();
  }
  // ¿Se muestran los sets divididos por cuenta? Solo si hay cuentas y algún set repartido.
  function conCuentas() { return cat.cuentas.length > 0 && cat.sets.some(tieneCuentas); }
  function cuentasConSets() { return cat.cuentas.filter(function (c) { return cat.sets.some(function (s) { return disponible(s) && enCuenta(s, c.id) > 0; }); }); }
  function cabCuenta(c, n, dentro) {
    var ini = String(c.nick || "?").trim().charAt(0).toUpperCase() || "?";
    return '<div class="sc-cta' + (dentro ? ' dentro' : '') + '"' + (dentro ? '' : ' data-s="cta" data-v="' + esc(c.id) + '" role="button" tabindex="0" aria-label="Ver la cuenta ' + esc(c.nick) + '"') + '>' +
      '<span class="sc-cta-av" aria-hidden="true">' + esc(ini) + '</span>' +
      '<span class="sc-cta-tx"><small>Cuenta de Steam · ' + nSets(n) + '</small><b>' + esc(c.nick) + '</b><em>' + esc(descDe(c)) + '</em></span>' +
      '<span class="sc-cta-ac">' + (dentro
        ? (c.perfil ? '<a class="btn btn-yellow btn-sm" href="' + esc(c.perfil) + '" target="_blank" rel="noopener noreferrer">🎮 Ver perfil de Steam ↗</a>' : '') + '<button type="button" class="btn btn-ghost btn-sm" data-s="cta" data-v="">← Todas las cuentas</button>'
        : '<span class="sc-cta-ver">Ver cuenta →</span>') + '</span></div>' +
      (dentro && c.perfil ? '<p class="sc-cta-nota">Agrega esta cuenta en Steam para recibir tus sets más rápido.</p>' : '');
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
          return '<div class="carr"><div class="carr-t"><span class="carr-img">' + foto(s.img, ' width="56" height="56"') + '</span><span class="carr-n"><b>' + esc(s.name) + '</b><small>' + esc(mon(s.price)) + ' c/u</small></span></div>' +
            '<div class="carr-q"><button type="button" class="btn btn-ghost btn-sm" data-s="menos" data-id="' + s.id + '" aria-label="Menos">−</button><span>' + l.qty + '</span>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-s="mas" data-id="' + s.id + '" aria-label="Más"' + (s.stock !== null && l.qty >= s.stock ? ' disabled' : '') + '>+</button></div>' +
            '<div class="carr-s"><b>' + esc(mon(s.price * l.qty)) + '</b><button type="button" class="carr-x" data-s="quitarCarro" data-id="' + s.id + '" aria-label="Quitar">🗑</button></div></div>';
        }).join("") + '</div>';
        h += '<div class="cartot"><div class="cartot-r"><span>Subtotal (' + nSets(t.n) + ')</span><span>' + mon(t.sub) + '</span></div>' +
          (t.nivel ? '<div class="cartot-r sc-dto"><span>Descuento ' + t.nivel.pct + '% (sets de hasta S/ ' + DTO_MAX + ')</span><span>−' + mon(t.dto) + '</span></div>' : '') +
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
    return "¡Hola! 👋 Quiero comprar estos *Sets Caché* de *" + TD.nombreMayus + "* 🎁\n\n" +
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
        body: JSON.stringify({ tienda: TD.id, items: t.ls.map(function (l) { return { id: l.s.id, qty: l.qty, name: l.s.name }; }) }) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.ok) { abrirMod({ tipo: "error", msg: (x.j && x.j.error) || "No se pudo completar la compra.", volver: true }); cargarCat(true); return; }
        carro = []; guardarCarro(); pintarCli();
        var p = R().perfil();
        abrirMod({ tipo: "ok", code: x.j.code, pago: x.j.creditos, saldo: x.j.saldo,
          msg: "Hola " + TD.nombre + ", pagué con mi saldo el pedido " + x.j.code + " (" + nSets(t.n) + ": " + nombres + "). Mi Steam: " + ((p && p.steam) || "—") + ". ¡Gracias!" });
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
    if (adm.tab === "setsStk") return pintarStock();
    var msg = adm.msg ? '<p class="sc-msg ' + esc(adm.msgTipo) + '" role="status">' + esc(adm.msg) + '</p>' : '';
    if (!cat.cargado || cat.deCache) { admEl.innerHTML = '<p class="hint">Cargando catálogo…</p>'; cargarCat(true); return; }
    var agot = cat.sets.filter(function (s) { return !disponible(s); }).length, stock = cat.sets.reduce(function (a, s) { return a + (s.stock || 0); }, 0);
    var h = '<div class="grp"><label class="cfg-row' + (cat.visible ? ' on' : '') + '"><span class="cfg-tx"><b>🎁 Sets Caché</b><small>Sección de sets en el menú de ' + esc(TD.nombre) + '.</small><em>' + (cat.visible ? 'VISIBLE para los clientes' : 'OCULTA: solo tú la ves') + '</em></span><input type="checkbox" class="sc-vis"' + (cat.visible ? ' checked' : '') + '><span class="cfg-sw" aria-hidden="true"></span></label>' + msg + '</div>';
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
        '<span class="sc-anm"><b>' + esc(s.name) + '</b><small><i style="color:' + colorRar(s.rarity) + '">' + esc(s.rarity) + '</i>' + (s.hero ? ' · ' + esc(nombreHeroe(s.hero)) : '') + ' · ' + (s.price === null ? 'sin precio' : esc(mon(s.price))) + (ok ? '' : ' · <em class="sc-ag">Agotado</em>') + '</small>' + chipsCta(s) + '</span>' +
        (tieneCuentas(s) ? '<span class="sc-ast" title="Stock total (suma de las cuentas)"><b>' + s.stock + '</b><small>total</small></span>'
          : '<span class="sc-ast" title="Stock"><button type="button" class="btn btn-ghost btn-sm" data-s="admStock" data-id="' + s.id + '" data-d="-1" aria-label="Quitar una unidad">−</button><b>' + (s.stock === null ? '∞' : s.stock) + '</b><button type="button" class="btn btn-ghost btn-sm" data-s="admStock" data-id="' + s.id + '" data-d="1" aria-label="Sumar una unidad">+</button></span>') +
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
      '<div class="field"><label for="sc-f-stock">' + (tieneCuentas(s) ? 'Stock total (suma de las cuentas)' : 'Stock (vacío = sin límite)') + '</label><input id="sc-f-stock" data-f="stock" type="number" step="1" inputmode="numeric" value="' + esc(s.stockTxt !== undefined ? s.stockTxt : s.stock === null ? '' : s.stock) + '"' + (tieneCuentas(s) ? ' readonly' : '') + '></div></div>' +
      (cat.cuentas.length ? '<div class="sc-fcta"><b>🎮 Stock por cuenta de Steam</b><small>¿Cuántos tienes en cada cuenta? Vacío = no está en esa cuenta. Si llenas alguna, el stock total es la suma.</small><div class="sc-fcta-l">' +
        cat.cuentas.map(function (c) { var v = s.pcTxt ? s.pcTxt[c.id] : enCuenta(s, c.id); return '<label class="field"><span>' + esc(c.nick) + '</span><input type="number" step="1" inputmode="numeric" data-fc="' + esc(c.id) + '" value="' + (v === null || v === undefined ? '' : esc(v)) + '" placeholder="—"></label>'; }).join("") + '</div></div>' : '') +
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
      if (cat.cuentas.length) { f.s.pcTxt = {}; admEl.querySelectorAll("[data-fc]").forEach(function (el) { f.s.pcTxt[el.getAttribute("data-fc")] = el.value.trim(); }); }
    }
    return f;
  }
  function guardarForm() {
    var f = leerForm(), s = f.s, err = admEl.querySelector(".sc-ferr");
    var precio = Number(String(s.priceTxt).replace(",", "."));
    if (!s.name) { err.textContent = "Escribe el nombre del set."; return; }
    if (s.priceTxt === "" || !isFinite(precio) || precio <= 0) { err.textContent = "Pon un precio mayor a 0."; return; }
    var stock = s.stockTxt === "" ? null : Math.floor(Number(s.stockTxt));
    if (stock !== null && !isFinite(stock)) { err.textContent = "El stock es un número o vacío."; return; }
    var pc = {}, malPc = false;
    if (s.pcTxt) Object.keys(s.pcTxt).forEach(function (k) { var v = s.pcTxt[k]; if (v === "") return; var n = Math.floor(Number(v)); if (!isFinite(n)) malPc = true; else pc[k] = n; });
    if (malPc) { err.textContent = "El stock de cada cuenta es un número o vacío."; return; }
    var nuevo = normSet({ id: s.id, name: s.name, price: precio, stock: stock, porCuenta: pc, soldOut: s.soldOutMarca, img: s.img, rarity: s.rarity, hero: s.hero, styles: s.styles });
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
    var antes = { stock: s.stock, soldOut: s.soldOut, pc: s.porCuenta ? Object.assign({}, s.porCuenta) : null };
    if (tieneCuentas(s)) ajustarSet(s, d);
    else if (s.stock === null) { if (d < 0) return; s.stock = 1; } else s.stock = s.stock + d;
    s.soldOut = s.stock <= 0 ? true : (d > 0 ? false : s.soldOut);
    guardarCat("✔ Stock de \"" + s.name + "\": " + s.stock + ".").catch(function () { s.stock = antes.stock; s.soldOut = antes.soldOut; if (antes.pc) s.porCuenta = antes.pc; pintarAdmin(); });
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

  /* =====================================================================
     PEDIDOS Y CLIENTES de Sets Caché de Rayas (igual que el panel de LitleJacob, con datos propios de Rayas:
     pedidos con tienda "rayas", fichas customers/r_<clave>, cupo propio de 8 sets por día)
     ===================================================================== */
  var P = adm.ped;
  Object.assign(P, { sub: "orders", orden: "recent", cuentas: [], edit: null, editPed: null, comprando: null, creando: false });
  function cargarPed() {
    if (P.cargando) return;
    P.cargando = true; P.err = ""; pintarAdmin();
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
    // Cuentas de la web (las mismas de Rifas / LitleJacob): solo para marcar "✅ cuenta" en Clientes. Si falla, no importa.
    var cuentas = [], accU = function (tok) {
      return R().fsPedir("rayas_users?pageSize=300" + (tok ? "&pageToken=" + encodeURIComponent(tok) : "")).then(function (r) { if (!r.ok) throw new Error("u" + r.status); return r.json(); })
        .then(function (j) { (j.documents || []).forEach(function (d) { cuentas.push(docObj(d)); }); return j.nextPageToken ? accU(j.nextPageToken) : null; });
    };
    var us = accU("").catch(function () { cuentas = []; });
    Promise.all([ped, acc(""), us]).then(function (r) {
      P.orders = r[0]; P.fichas = fichas; P.cuentas = cuentas; P.cargado = true;
    }).catch(function (e) { P.err = errTxt(e); }).then(function () { P.cargando = false; pintarAdmin(); });
  }
  function setsDe(o) { return Math.max(1, Number(o.count) || (o.items || []).reduce(function (n, it) { return n + (Number(it.qty) || 1); }, 0)); }
  function desdeDe(clave) { var c = P.fichas[clave]; return c && isoOk(c.friendSince) ? c.friendSince : ""; }
  function esVenta(o) { return o.status === "pagado" || o.status === "entregado"; }
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
  function elPlan() { return planCache || (planCache = plan()); }
  function planDe(o) { return elPlan().slots[o._id] || null; }
  function entregarHoy(o) { if (o.status !== "pagado") return false; var p = planDe(o); return !!p && p.day <= hoyIso(); }
  function porConfirmar(o) { return !o.stockApplied && o.status !== "cancelado" && rastreados(o).length > 0; }
  function estTxt(k) { return (ESTADOS.filter(function (e) { return e[0] === k; })[0] || ESTADOS[0])[1]; }
  function telDe(o) { if (o.phone) return o.phone; var c = P.fichas[claveCli(o.steamId, o.customerName)]; return (c && c.phone) || ""; }
  function nombreBonito(n) { return String(n || "").trim().toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  function msgEntrega(o) {
    return ["✅ *¡PEDIDO ENTREGADO!* ✅", "", "Hola *" + (nombreBonito(o.customerName).split(" ")[0] || "") + "* ⚔️",
      "Tu pedido *" + (o.code || o._id) + "* de *" + TD.nombre + "* ya está en tu inventario de Dota 2 ✨", "", "*Sets entregados:*",
      (o.items || []).map(function (it) { return "⚡ " + (it.qty > 1 ? it.qty + " × " : "") + it.name; }).join("\n"), "",
      "➡️ Abre Dota 2, revisa tu inventario y equípalo.", "⭐ Si te gustó la atención, recomiéndanos con tus amigos.", "❤️ ¡Gracias por tu compra! Cualquier duda, escríbeme por aquí.", "", "— *" + TD.nombre + "* · " + TD.dominio].join("\n");
  }
  // Lista de clientes: los de los pedidos + las fichas de Rayas + las cuentas de la web
  function clientes() {
    var m = {};
    P.orders.forEach(function (o) {
      var k = claveCli(o.steamId, o.customerName), c = m[k] || (m[k] = { key: k, name: o.customerName || "", steamId: o.steamId || "", phone: "", orders: 0, spent: 0, last: null });
      c.orders += 1;
      if (esVenta(o)) c.spent += Number(o.total) || 0;
      if (!c.last || (o.createdAt && o.createdAt > c.last)) { c.last = o.createdAt || c.last; c.name = o.customerName || c.name; if (o.phone) c.phone = o.phone; }
      if (!c.phone && o.phone) c.phone = o.phone;
    });
    Object.keys(P.fichas).forEach(function (k) {
      var f = P.fichas[k], c = m[k] || (m[k] = { key: k, name: f.name || "", steamId: f.steamId || "", phone: "", orders: 0, spent: 0, last: null });
      if (f.phone) c.phone = f.phone; if (!c.name) c.name = f.name || "";
    });
    (P.cuentas || []).forEach(function (a) {
      var st = normSteam(a.steam || "") || "", k = claveCli(st, a.nombre);
      var c = m[k] || (m[k] = { key: k, name: a.nombre || "", steamId: st, phone: "", orders: 0, spent: 0, last: null });
      c.account = { email: a.email || "", tradelink: a.tradelink || "", creditos: Number(a.creditos) || 0 };
      if (!c.phone && a.whatsapp) c.phone = normTel(a.whatsapp) || a.whatsapp;
      if (!c.name) c.name = a.nombre || "";
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function cliPorClave(k) { return clientes().filter(function (c) { return c.key === k; })[0] || null; }
  function pedidosDe(k) { return P.orders.filter(function (o) { return claveCli(o.steamId, o.customerName) === k; }); }
  function fotoItem(it) { var s = setPorId(it.id); return (s && s.img) || it.img || ""; }

  /* ---- piezas de la interfaz ---- */
  function steamHtml(id) { var u = perfilSteam(id); return '🎮 ' + (id ? '<b>' + esc(id) + '</b>' : 'sin ID de Steam') + (u ? ' <a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">Perfil de Steam ↗</a>' : ''); }
  function telHtml(t) { return '📱 ' + (t ? '<a href="' + esc(waEnlace(t)) + '" target="_blank" rel="noopener noreferrer">' + esc(fmtTel(t)) + '</a>' : 'sin WhatsApp'); }
  function amistadHtml(clave) {
    var since = desdeDe(clave), txt = "Sin fecha de amistad", cls = "none";
    if (since) {
      var listo = new Date(since + "T00:00:00"); listo.setDate(listo.getDate() + ESPERA);
      var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      var faltan = Math.round((listo - hoy) / 86400000);
      if (faltan <= 0) { txt = "✓ Entrega inmediata"; cls = "ok"; } else { txt = "Entrega desde " + listo.toLocaleDateString("es-PE") + ", faltan " + faltan + (faltan === 1 ? " día" : " días"); cls = "wait"; }
    }
    return '<div class="sc-fr" data-key="' + esc(clave) + '"><div class="sc-fr-top"><b>🤝 Amigos desde</b><span class="sc-frb ' + cls + '">' + esc(txt) + '</span></div>' +
      '<div class="sc-fr-c"><input type="date" class="sc-frd" value="' + esc(since) + '" aria-label="Fecha de amistad">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="frMover" data-d="-1">−1 día</button><button type="button" class="btn btn-ghost btn-sm" data-s="frMover" data-d="1">+1 día</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="frHoy">Hoy</button><button type="button" class="btn btn-ghost btn-sm" data-s="frMes">📅 Hace 1 mes</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="frBorrar"' + (since ? '' : ' disabled') + '>Borrar</button></div></div>';
  }
  function lineaPlan(o) {
    if (o.status !== "pagado") return "";
    var p = planDe(o), pl = elPlan();
    if (!p) return '<div class="sc-plan wait">📅 Sin fecha de amistad: pon desde cuándo son amigos para programar la entrega.</div>';
    if (p.day <= pl.hoy) return '<div class="sc-plan ok">🚚 <b>Entregar hoy</b> · cupo de hoy ' + (pl.cnt[pl.hoy] || 0) + '/' + CAP + ' sets' + (p.corrido ? ' (por cupo se había corrido ' + p.corrido + (p.corrido === 1 ? ' día)' : ' días)') : '') + '</div>';
    return '<div class="sc-plan wait">📅 Entrega programada: <b>' + esc(fmtDia(p.day)) + '</b>' + (p.corrido ? ' · día ' + (ESPERA + p.corrido) + ': se corrió ' + p.corrido + (p.corrido === 1 ? ' día' : ' días') + ' porque ese día ya hay ' + CAP + ' sets por entregar' : ' · día ' + ESPERA + ' de amistad') + '</div>';
  }

  /* ---- selector de sets con buscador (compra a mano, nuevo cliente, pedido manual y editar pedido) ---- */
  function pickHtml(titulo, estadoDef, items, fecha) {
    var hoy = hoyIso();
    return '<div class="sc-pick" data-items="' + esc(JSON.stringify(items || [])) + '">' +
      '<label class="sc-lbl">' + esc(titulo) + '</label>' +
      '<div class="sc-row"><div class="sc-pick-q"><input type="search" data-p="q" placeholder="🔎 Escribe para buscar un set…" autocomplete="off"><div class="sc-pick-res" hidden></div></div><button type="button" class="btn btn-ghost btn-sm" data-s="pkAgregar">➕ Agregar</button></div>' +
      '<ul class="sc-pick-l"></ul>' +
      '<div class="sc-f2"><div class="field"><label>Fecha de compra</label><input type="date" data-p="fecha" value="' + esc(fecha || hoy) + '" max="' + hoy + '"></div>' +
      (estadoDef ? '<div class="field"><label>Estado</label><select data-p="estado">' + ESTADOS.map(function (e) { return '<option value="' + e[0] + '"' + (e[0] === estadoDef ? ' selected' : '') + '>' + e[1] + '</option>'; }).join("") + '</select></div>' : '') + '</div>' +
      '<div class="sc-pick-tot"></div></div>';
  }
  function pkItems(box) { try { return JSON.parse(box.getAttribute("data-items") || "[]"); } catch (e) { return []; } }
  function pkCoinciden(q) {
    var n = sinTildes(String(q || "").trim()), todos = cat.sets.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "es"); });
    if (!n) return todos;
    var ini = [], tiene = [];
    todos.forEach(function (s) { var t = sinTildes(s.name); if (t.indexOf(n) === 0) ini.push(s); else if (t.indexOf(n) >= 0 || String(s.id) === q.trim()) tiene.push(s); });
    return ini.concat(tiene);
  }
  function pkResultados(box) {
    var inp = box.querySelector('[data-p="q"]'), res = box.querySelector(".sc-pick-res"), m = pkCoinciden(inp.value).slice(0, 40);
    var hi = Math.min(Number(box.getAttribute("data-hi") || 0), Math.max(m.length - 1, 0)); box.setAttribute("data-hi", hi);
    res.innerHTML = m.length ? m.map(function (s, i) { return '<button type="button" class="sc-pick-o' + (i === hi ? ' hi' : '') + '" data-s="pkElegir" data-id="' + s.id + '"><span>' + esc(s.name) + '</span><b>' + (s.price === null ? '—' : esc(mon(s.price))) + '</b></button>'; }).join("")
      : '<div class="sc-pick-no">No hay sets con “' + esc(inp.value.trim()) + '”</div>';
    res.hidden = false;
    var cur = res.querySelector(".hi"); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }
  function pkCerrar(box) { var r = box.querySelector(".sc-pick-res"); if (r) r.hidden = true; }
  function pkPintar(box) {
    var items = pkItems(box);
    box.querySelector(".sc-pick-l").innerHTML = items.map(function (it, i) {
      var s = setPorId(it.id);
      return '<li><span>' + (it.qty > 1 ? '<b>' + it.qty + ' ×</b> ' : '') + esc(s ? s.name : it.id) + '</span><span class="sc-pick-b"><button type="button" class="btn btn-ghost btn-sm" data-s="pkMenos" data-i="' + i + '" aria-label="Uno menos">−</button><button type="button" class="btn btn-ghost btn-sm" data-s="pkMas" data-i="' + i + '" aria-label="Uno más">+</button><button type="button" class="btn btn-ghost btn-sm" data-s="pkQuitar" data-i="' + i + '" aria-label="Quitar">✕</button></span></li>';
    }).join("");
    var tot = items.reduce(function (t, it) { var s = setPorId(it.id); return t + (s ? Number(s.price) || 0 : 0) * it.qty; }, 0);
    box.querySelector(".sc-pick-tot").textContent = items.length ? nSets(items.reduce(function (n, it) { return n + it.qty; }, 0)) + " · Total " + mon(tot) : "";
  }
  function pkAccion(box, a, v) {
    var items = pkItems(box);
    if (a === "pkAgregar" || a === "pkElegir") {
      var inp = box.querySelector('[data-p="q"]'), id = a === "pkElegir" ? Number(v) : 0;
      if (!id) { var m = pkCoinciden(inp.value); if (!inp.value.trim() || !m.length) { inp.focus(); pkResultados(box); return; } id = (m[Number(box.getAttribute("data-hi") || 0)] || m[0]).id; }
      inp.value = ""; box.setAttribute("data-hi", 0); pkCerrar(box);
      var ya = items.filter(function (it) { return Number(it.id) === Number(id); })[0];
      if (ya) ya.qty += 1; else items.push({ id: Number(id), qty: 1 });
    } else if (a === "pkMas") items[v].qty += 1;
    else if (a === "pkMenos") { items[v].qty -= 1; if (items[v].qty <= 0) items.splice(v, 1); }
    else if (a === "pkQuitar") items.splice(v, 1);
    box.setAttribute("data-items", JSON.stringify(items));
    pkPintar(box);
    var man = box.closest(".sc-man"); if (man) manVista(man);
  }
  function pkLineas(box) {
    return pkItems(box).map(function (it) { var s = setPorId(it.id); return { id: String(it.id), name: s ? String(s.name).slice(0, 80) : String(it.id), qty: it.qty, price: s ? Number(s.price) || 0 : 0, img: s && s.img ? String(s.img).slice(0, 300) : "" }; });
  }
  function pv(box, k) { var el = box.querySelector('[data-p="' + k + '"]'); return el ? el.value : ""; }
  function fv(box, k) { var el = box.querySelector('[data-f="' + k + '"]'); return el ? el.value : ""; }

  /* ---- tarjetas ---- */
  function tarjetaPed(o) {
    var ab = !!P.abiertos[o._id] || P.tel === o._id || P.editPed === o._id, n = setsDe(o), clave = claveCli(o.steamId, o.customerName), tel = telDe(o);
    var notas = [nSets(n)];
    if (o.discount) notas.push("Dscto. −" + mon(o.discount));
    if (o.stockApplied) notas.push("stock descontado"); else if (porConfirmar(o)) notas.push("⚠ stock sin descontar");
    if (o.paidWith === "creditos") notas.push("💎 pagado con S/ " + (Number(o.creditos) || 0));
    if (o.paymentMethod) notas.push("Pago: " + o.paymentMethod);
    if (o.manual) notas.push("pedido manual");
    var cab = '<button type="button" class="sc-orow" data-s="pAbrir" aria-expanded="' + ab + '"><span class="sc-ocode">' + esc(o.code || o._id) + '</span><span class="sc-owho">' + esc(o.customerName || "Sin nombre") + '</span>' +
      '<span class="sc-osub">' + (o.items || []).slice(0, 3).map(function (it) { return '<span class="sc-oth">' + foto(fotoItem(it)) + '</span>'; }).join("") + esc(fmtFecha(o.createdAt)) + ' · ' + nSets(n) +
      (porConfirmar(o) ? ' <i class="sc-flag">⚠ por confirmar</i>' : '') + (entregarHoy(o) ? ' <i class="sc-flag ok">🚚 entregar hoy</i>' : '') + '</span>' +
      '<span class="sc-obadge st-' + esc(o.status || "pendiente") + '">' + esc(estTxt(o.status)) + '</span><b class="sc-oamt">' + esc(mon(o.total)) + '</b><span class="sc-ochev" aria-hidden="true">▾</span></button>';
    if (!ab) return '<article class="sc-ocard" data-id="' + esc(o._id) + '">' + cab + '</article>';
    if (P.editPed === o._id) return '<article class="sc-ocard open" data-id="' + esc(o._id) + '">' + cab + '<div class="sc-obody">' + editPedHtml(o) + '</div></article>';
    var telH = P.tel === o._id
      ? '<div class="sc-tel"><input class="sc-telin" type="text" maxlength="40" autocapitalize="off" placeholder="WhatsApp: número o @usuario" value="' + esc(fmtTel(o.phone)) + '"><button type="button" class="btn btn-yellow btn-sm" data-s="telGuardar">Guardar y avisar</button><button type="button" class="btn btn-ghost btn-sm" data-s="telCancelar">Cancelar</button></div>'
      : '<div>📱 ' + (tel ? '<a href="' + esc(waEnlace(tel)) + '" target="_blank" rel="noopener noreferrer">' + esc(fmtTel(tel)) + '</a>' : 'sin WhatsApp · <button type="button" class="sc-link" data-s="telEditar">Agregar número</button>') + '</div>';
    return '<article class="sc-ocard open" data-id="' + esc(o._id) + '">' + cab + '<div class="sc-obody">' +
      '<div class="sc-ocli"><div>👤 <b>' + esc(o.customerName || "Sin nombre") + '</b>' + (o.email ? ' · ✉ ' + esc(o.email) : '') + '</div><div>' + steamHtml(o.steamId) + '</div>' + telH + '</div>' +
      '<ul class="sc-oitems">' + (o.items || []).map(function (it) { var dh = dondeHay(setPorId(it.id)); return '<li><span class="sc-oth">' + foto(fotoItem(it)) + '</span><span>' + (it.qty > 1 ? '<b>' + it.qty + ' ×</b> ' : '') + esc(it.name) + (dh ? '<small class="sc-odonde">🎮 ' + esc(dh) + '</small>' : '') + '</span><b>' + esc(mon((Number(it.price) || 0) * (Number(it.qty) || 1))) + '</b></li>'; }).join("") + '</ul>' +
      '<div class="sc-otot"><span>' + esc(notas.join(" · ")) + '</span><b>' + esc(mon(o.total)) + '</b></div>' + lineaPlan(o) + amistadHtml(clave) +
      '<div class="sc-oacts"><label>Estado <select class="sc-est">' + ESTADOS.map(function (e) { return '<option value="' + e[0] + '"' + ((o.status || "pendiente") === e[0] ? ' selected' : '') + '>' + e[1] + '</option>'; }).join("") + '</select></label>' +
      (porConfirmar(o) ? '<button type="button" class="btn btn-yellow btn-sm" data-s="pReservar">✅ Confirmar reserva · descontar stock</button>' : '') +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="pEditar">✏️ Editar pedido</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="pAvisar">📲 Avisar entrega</button><button type="button" class="btn btn-ghost btn-sm sc-del-o" data-s="pBorrar">🗑 Eliminar</button></div></div></article>';
  }
  function editPedHtml(o) {
    var items = (o.items || []).map(function (it) { return { id: Number(it.id), qty: Number(it.qty) || 1 }; });
    var fecha = o.createdAt instanceof Date && !isNaN(o.createdAt) ? isoDe(o.createdAt) : hoyIso();
    return '<div class="sc-form sc-oe"><b class="sc-oe-t">✏️ Editar pedido ' + esc(o.code || o._id) + '</b>' +
      '<div class="sc-f3"><div class="field"><label>Nombre de Dota 2 *</label><input data-f="name" maxlength="60" value="' + esc(o.customerName || "") + '"></div>' +
      '<div class="field"><label>ID de amigo de Steam</label><input data-f="steam" inputmode="numeric" maxlength="80" value="' + esc(o.steamId || "") + '" placeholder="Ej. 123456789"></div>' +
      '<div class="field"><label>WhatsApp (número o @usuario)</label><input data-f="phone" maxlength="40" autocapitalize="off" value="' + esc(o.phone ? fmtTel(o.phone) : "") + '" placeholder="Ej. 987 654 321 o @usuario"></div></div>' +
      pickHtml("Sets del pedido *", "", items, fecha) +
      '<div class="sc-row"><div class="field"><label>Total cobrado (S/) *</label><input data-f="total" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(String(Number(o.total) || 0)) + '"></div><button type="button" class="btn btn-ghost btn-sm" data-s="oeRecalc">🔄 Recalcular con los sets</button></div>' +
      '<p class="hint">Si cambias nombre o ID de Steam, se conserva su fecha de amistad. El estado se cambia con el selector de siempre, al cerrar el editor.</p><p class="sc-ferr" role="alert"></p>' +
      '<div class="sc-acts"><button type="button" class="btn btn-ghost btn-sm" data-s="oeCancelar">Cancelar</button><button type="button" class="btn btn-yellow btn-sm" data-s="oeGuardar">💾 Guardar cambios</button></div></div>';
  }
  function tarjetaCli(c) {
    var ab = !!P.abiertos["c:" + c.key] || P.edit === c.key || P.comprando === c.key;
    var cab = '<button type="button" class="sc-orow sc-crow" data-s="cAbrir" aria-expanded="' + ab + '"><span class="sc-owho">' + esc(c.name || "Sin nombre") + '</span>' +
      '<span class="sc-osub">' + (c.account ? '✅ cuenta · ' : '') + c.orders + (c.orders === 1 ? ' pedido' : ' pedidos') + ' · ' + (c.last ? esc(c.last.toLocaleDateString("es-PE")) : '—') + '</span>' +
      '<b class="sc-oamt">' + esc(mon(c.spent)) + '</b><span class="sc-ochev" aria-hidden="true">▾</span></button>';
    if (!ab) return '<article class="sc-ocard sc-ccard" data-key="' + esc(c.key) + '">' + cab + '</article>';
    var pie;
    if (P.edit === c.key) pie = '<div class="sc-form"><div class="sc-f3"><div class="field"><label>Nombre de Dota 2</label><input data-f="name" maxlength="60" value="' + esc(c.name || "") + '"></div>' +
      '<div class="field"><label>ID de amigo de Steam</label><input data-f="steam" inputmode="numeric" maxlength="80" value="' + esc(c.steamId || "") + '" placeholder="Ej. 123456789"></div>' +
      '<div class="field"><label>WhatsApp (número o @usuario)</label><input data-f="phone" maxlength="40" autocapitalize="off" value="' + esc(fmtTel(c.phone || "")) + '" placeholder="Ej. 987 654 321"></div></div>' +
      '<p class="hint">Se corregirá en ' + (c.orders === 1 ? 'su pedido' : 'sus ' + c.orders + ' pedidos') + '. La fecha de amistad se conserva.</p><p class="sc-ferr" role="alert"></p>' +
      '<div class="sc-acts"><button type="button" class="btn btn-ghost btn-sm" data-s="cCancelar">Cancelar</button><button type="button" class="btn btn-yellow btn-sm" data-s="cGuardar">💾 Guardar</button></div></div>';
    else if (P.comprando === c.key) pie = '<div class="sc-form">' + pickHtml("¿Qué llevó?", "entregado") + '<p class="sc-ferr" role="alert"></p>' +
      '<div class="sc-acts"><button type="button" class="btn btn-ghost btn-sm" data-s="cCompraCancelar">Cancelar</button><button type="button" class="btn btn-yellow btn-sm" data-s="cCompraGuardar">💾 Guardar compra</button></div></div>';
    else pie = '<div class="sc-oacts"><button type="button" class="btn btn-yellow btn-sm" data-s="cComprar">🛒 Agregar compra</button><button type="button" class="btn btn-ghost btn-sm" data-s="cEditar">✏️ Editar</button><button type="button" class="btn btn-ghost btn-sm sc-del-o" data-s="cBorrar">🗑 Eliminar</button></div>';
    return '<article class="sc-ocard sc-ccard open" data-key="' + esc(c.key) + '">' + cab + '<div class="sc-obody"><div class="sc-ocli">' +
      '<div>' + steamHtml(c.steamId) + '</div>' +
      (c.account ? '<div class="sc-cacc">✅ <b>Cuenta registrada</b> · ' + esc(c.account.email) + ' · S/ ' + esc(String(c.account.creditos)) + (c.account.tradelink ? ' · <a href="' + esc(c.account.tradelink) + '" target="_blank" rel="noopener noreferrer">Trade link</a>' : ' · sin trade link') + '</div>' : '') +
      '<div>' + telHtml(c.phone) + '</div></div>' +
      '<div class="sc-stats sc-cst"><div><b>' + c.orders + '</b><span>' + (c.orders === 1 ? 'Pedido' : 'Pedidos') + '</span></div><div><b>' + esc(mon(c.spent)) + '</b><span>Gastado</span></div><div><b>' + (c.last ? esc(c.last.toLocaleDateString("es-PE")) : '—') + '</b><span>Último pedido</span></div></div>' +
      amistadHtml(c.key) + pie + '</div></article>';
  }
  function nuevoCliHtml() {
    if (!P.creando) return '<div class="sc-acts"><button type="button" class="btn btn-yellow btn-sm" data-s="cNuevo">➕ Nuevo cliente</button></div>';
    return '<div class="sc-man sc-cnuevo"><h3>➕ Nuevo cliente</h3>' +
      '<div class="sc-f3"><div class="field"><label>Nombre de Dota 2</label><input data-f="name" maxlength="60" placeholder="Ej. noname"></div>' +
      '<div class="field"><label>ID de amigo de Steam</label><input data-f="steam" inputmode="numeric" maxlength="80" placeholder="Ej. 123456789 (o enlace del perfil)"></div>' +
      '<div class="field"><label>WhatsApp (número o @usuario)</label><input data-f="phone" maxlength="40" autocapitalize="off" placeholder="Ej. 987 654 321 o @usuario"></div></div>' +
      '<div class="field"><label>Amigos desde (opcional)</label><div class="sc-row"><input type="date" data-f="since"><button type="button" class="btn btn-ghost btn-sm" data-s="ncMes">📅 Hace 1 mes</button></div></div>' +
      pickHtml("¿Qué llevó? (opcional)", "entregado") + '<p class="sc-ferr" role="alert"></p>' +
      '<div class="sc-acts"><button type="button" class="btn btn-ghost btn-sm" data-s="cNuevoCancelar">Cancelar</button><button type="button" class="btn btn-yellow btn-sm" data-s="cNuevoGuardar">💾 Crear cliente</button></div></div>';
  }

  /* ---- pedido manual ---- */
  function manHtml() {
    var cl = clientes().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "es"); });
    return '<div class="sc-man" data-modo="nuevo"><h3>➕ Agregar pedido manual</h3>' +
      '<div class="subtabs" role="group" aria-label="Tipo de cliente"><button type="button" class="subtab" data-s="manModo" data-m="nuevo" aria-selected="true">👤 Cliente no registrado</button><button type="button" class="subtab" data-s="manModo" data-m="existente" aria-selected="false">📇 Cliente existente</button></div>' +
      '<p class="hint sc-mn">Para quien compró fuera de la web. Se guarda su ficha (WhatsApp o @ e ID de Steam) y esta compra: queda el registro y te llega el recordatorio por correo cuando cumpla su tiempo de amistad.</p>' +
      '<div class="field sc-mn"><label>ID de amigo de Steam *</label><input data-f="steam" inputmode="numeric" maxlength="80" placeholder="Ej. 123456789 (o enlace del perfil)"></div>' +
      '<div class="field sc-mn"><label>WhatsApp (número o @usuario) *</label><input data-f="phone" maxlength="40" autocapitalize="off" placeholder="Ej. 987 654 321 o @usuario"></div>' +
      '<div class="field sc-mn"><label>Nombre de Dota 2 (opcional)</label><input data-f="name" maxlength="60" placeholder="Ej. noname"></div>' +
      '<div class="field sc-me"><label>Cliente *</label><select data-f="cli"><option value="">Elige un cliente…</option>' + cl.map(function (c) { return '<option value="' + esc(c.key) + '">' + esc(c.name || "Sin nombre") + (c.steamId ? " · ID " + esc(c.steamId) : "") + (c.phone ? " · " + esc(fmtTel(c.phone)) : "") + '</option>'; }).join("") + '</select><div class="sc-man-info hint"></div></div>' +
      '<div class="field"><label>Amigos desde (el día que lo agregaste) *</label><div class="sc-row"><input type="date" data-f="since" value="' + hoyIso() + '"><button type="button" class="btn btn-ghost btn-sm" data-s="manHoy">Hoy</button><button type="button" class="btn btn-ghost btn-sm" data-s="manMes">📅 Hace 1 mes</button></div></div>' +
      '<div class="sc-plan sc-manprev"></div>' +
      pickHtml("¿Qué llevó? *", "pagado") + '<p class="sc-ferr" role="alert"></p>' +
      '<div class="sc-acts"><button type="button" class="btn btn-ghost btn-sm" data-s="manCerrar">Cancelar</button><button type="button" class="btn btn-yellow btn-sm" data-s="manGuardar">💾 Crear pedido</button></div></div>';
  }
  function manAbrir() { var t = document.createElement("div"); t.innerHTML = manHtml(); manEl = t.firstElementChild; pkPintar(manEl.querySelector(".sc-pick")); pintarPed(); manVista(manEl); var i = manEl.querySelector('[data-f="steam"]'); if (i) i.focus(); }
  function manCerrar() { manEl = null; pintarPed(); }
  function manModo(m) {
    manEl.setAttribute("data-modo", m);
    manEl.querySelectorAll('[data-s="manModo"]').forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-m") === m)); });
    if (m === "existente") manCliente(); else manVista(manEl);
  }
  function manCliente() {
    var c = cliPorClave(fv(manEl, "cli"));
    manEl.querySelector(".sc-man-info").innerHTML = c ? steamHtml(c.steamId) + '<br>📱 ' + (c.phone ? esc(fmtTel(c.phone)) : 'sin WhatsApp') : '';
    manEl.querySelector('[data-f="since"]').value = (c && desdeDe(c.key)) || hoyIso();
    manVista(manEl);
  }
  function manVista(card) {
    var box = card.querySelector(".sc-manprev"); if (!box) return;
    var since = fv(card, "since"), estado = pv(card, "estado");
    if (!isoOk(since)) { box.className = "sc-plan sc-manprev"; box.textContent = ""; return; }
    if (estado !== "pagado") { box.className = "sc-plan sc-manprev"; box.textContent = "ℹ️ La entrega solo se programa (y te llega el recordatorio) cuando el estado es “Pagado”."; return; }
    var n = pkItems(card.querySelector(".sc-pick")).reduce(function (a, it) { return a + it.qty; }, 0) || 1;
    var pl = plan({ id: "__nuevo", base: isoMas(since, ESPERA), n: n }), p = pl.slots.__nuevo, hoyEs = p.day <= pl.hoy;
    box.className = "sc-plan sc-manprev " + (hoyEs ? "ok" : "wait");
    box.innerHTML = hoyEs ? "🚚 Le toca entregar <b>hoy</b> (cupo de hoy " + (pl.cnt[pl.hoy] || 0) + "/" + CAP + " sets contando este pedido)."
      : "📅 Entrega: <b>" + esc(fmtDia(p.day)) + "</b> · día " + (ESPERA + p.corrido) + (p.corrido ? ": se corre " + p.corrido + (p.corrido === 1 ? " día" : " días") + " porque ese día ya hay " + CAP + " sets por entregar" : " de amistad") + ". Te llegará el recordatorio a tu correo ese día.";
  }

  /* ---- dibujo del panel de pedidos ---- */
  function pintarPed() {
    if (adm.tab !== "setsPed") return;
    if (!P.cargado && !P.cargando && !P.err) { cargarPed(); return; }
    if (!cat.cargado || cat.deCache) cargarCat(true);
    planCache = null;
    if (P.cargando && !P.cargado) { admEl.innerHTML = '<p class="hint">Cargando…</p>'; return; }
    if (P.err) { admEl.innerHTML = '<p class="sc-msg err">' + esc(P.err) + '</p><button type="button" class="btn btn-ghost btn-sm" data-s="pRecargar">↻ Intentar de nuevo</button>'; return; }
    var esPed = P.sub === "orders";
    var h = '<div class="sc-ptabs"><div class="subtabs" role="tablist">' +
      '<button type="button" class="subtab" role="tab" data-s="pSub" data-v="orders" aria-selected="' + esPed + '">Pedidos</button>' +
      '<button type="button" class="subtab" role="tab" data-s="pSub" data-v="customers" aria-selected="' + !esPed + '">Clientes</button></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="pRecargar">↻ Actualizar</button></div>' +
      '<div class="sc-stats sc-pstats"></div><div class="subtabs sc-chips" role="group" aria-label="Filtrar por estado"' + (esPed ? '' : ' hidden') + '></div>' +
      '<div class="sc-pbar"><input type="search" class="sc-pq" placeholder="' + (esPed ? 'Buscar por código, nombre o ID de Steam…' : 'Buscar por nombre o ID de Steam…') + '" value="' + esc(P.q) + '" autocomplete="off">' +
      '<select class="sc-psort" aria-label="Ordenar"><option value="recent"' + (P.orden === "recent" ? ' selected' : '') + '>Más recientes</option><option value="amount"' + (P.orden === "amount" ? ' selected' : '') + '>' + (esPed ? 'Mayor monto' : 'Mayor gasto') + '</option></select></div>' +
      (adm.msg ? '<p class="sc-msg ' + esc(adm.msgTipo) + '" role="status">' + esc(adm.msg) + '</p>' : '') + '<div class="sc-olist"></div>';
    admEl.innerHTML = h;
    pintarListaPed();
  }
  function pintarListaPed() {
    var list = admEl.querySelector(".sc-olist"); if (!list) return;
    planCache = null;
    var O = P.orders, ahora = new Date(), cl = clientes(), q = sinTildes(P.q).trim(), esPed = P.sub === "orders";
    var ventasMes = O.filter(function (o) { return esVenta(o) && o.createdAt && o.createdAt.getMonth() === ahora.getMonth() && o.createdAt.getFullYear() === ahora.getFullYear(); }).reduce(function (a, o) { return a + (Number(o.total) || 0); }, 0);
    admEl.querySelector(".sc-pstats").innerHTML = '<div class="warn"><b>' + O.filter(function (o) { return o.status === "pendiente"; }).length + '</b><span>Pendientes</span></div>' +
      '<div class="warn"><b>' + O.filter(porConfirmar).length + '</b><span>Por confirmar</span></div><div class="warn"><b>' + O.filter(entregarHoy).length + '</b><span>Entregar hoy</span></div>' +
      '<div><b>' + O.filter(function (o) { return o.createdAt && o.createdAt.toDateString() === ahora.toDateString(); }).length + '</b><span>Pedidos hoy</span></div>' +
      '<div class="ok"><b>' + esc(mon(ventasMes)) + '</b><span>Ventas del mes</span></div><div><b>' + cl.length + '</b><span>Clientes</span></div>';
    if (!esPed) {
      var filas = cl.filter(function (c) { return !q || sinTildes(c.name + " " + c.steamId).indexOf(q) >= 0; })
        .sort(function (a, b) { return P.orden === "amount" ? b.spent - a.spent : (b.last || 0) - (a.last || 0); });
      list.innerHTML = nuevoCliHtml() + (filas.length ? filas.map(tarjetaCli).join("") : '<p class="hint">' + (cl.length ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes. Crea uno o aparecerán cuando lleguen pedidos.') + '</p>');
      list.querySelectorAll(".sc-pick").forEach(pkPintar);
      R().hidratar(); return;
    }
    var cuenta = function (k) { return k === "all" ? O.length : k === "entregar" ? O.filter(entregarHoy).length : k === "confirmar" ? O.filter(porConfirmar).length : O.filter(function (o) { return (o.status || "pendiente") === k; }).length; };
    admEl.querySelector(".sc-chips").innerHTML = [["all", "Todos"], ["entregar", "🚚 Entregar hoy"], ["confirmar", "📌 Por confirmar"], ["pendiente", "Pendientes"], ["pagado", "Pagados"], ["entregado", "Entregados"], ["cancelado", "Cancelados"]].map(function (c) {
      return '<button type="button" class="subtab" data-s="pFiltro" data-f="' + c[0] + '" aria-pressed="' + (P.filtro === c[0]) + '" aria-selected="' + (P.filtro === c[0]) + '">' + c[1] + ' <span class="sc-chn">' + cuenta(c[0]) + '</span></button>'; }).join("");
    var l = O.filter(function (o) {
      var f = P.filtro;
      return (f === "all" || (f === "entregar" ? entregarHoy(o) : f === "confirmar" ? porConfirmar(o) : (o.status || "pendiente") === f)) &&
        (!q || sinTildes((o.code || o._id) + " " + o.customerName + " " + o.steamId).indexOf(q) >= 0);
    }).sort(function (a, b) { return P.orden === "amount" ? (Number(b.total) || 0) - (Number(a.total) || 0) : (b.createdAt || 0) - (a.createdAt || 0); });
    var pl = elPlan(), hoyN = pl.cnt[pl.hoy] || 0;
    var barra = '<div class="sc-cupo' + (hoyN >= CAP ? ' full' : '') + '"><span>🚚 Cupo de entregas de hoy: <b>' + hoyN + '/' + CAP + ' sets</b><small>Steam deja mandar ' + CAP + ' sets por día: lo que pase de ' + CAP + ' se corre al día siguiente (día ' + (ESPERA + 1) + ').</small></span>' +
      '<span class="sc-acts"><button type="button" class="btn btn-yellow btn-sm" data-s="manAbrir"' + (manEl ? ' disabled' : '') + '>➕ Agregar pedido manual</button></span></div>';
    list.innerHTML = barra + (l.length ? l.map(tarjetaPed).join("") : '<p class="hint">' + (O.length ? 'No hay pedidos con ese filtro.' : 'Aún no hay pedidos de sets en Rayas. Aparecerán aquí cuando alguien compre con su saldo, o agrega uno manual.') + '</p>');
    // El formulario manual se conserva entre redibujados (buscar, filtrar) para no perder lo escrito
    if (manEl) list.firstElementChild.after(manEl);
    list.querySelectorAll(".sc-ocard .sc-pick").forEach(pkPintar);
    R().hidratar();
  }

  /* ---- acciones de pedidos ---- */
  function pedPorId(id) { return P.orders.filter(function (o) { return o._id === id; })[0] || null; }
  function rastreados(o) { return (o.items || []).filter(function (it) { var s = setPorId(it.id); return s && s.stock !== null; }); }
  // Descuenta del catálogo las unidades del pedido (el stock solo baja cuando tú lo confirmas, igual que en LitleJacob).
  // Puede quedar en negativo: son sets que ya vendiste y aún debes sacar.
  function descontar(o, signo) {
    rastreados(o).forEach(function (it) { var s = setPorId(it.id); ajustarSet(s, -signo * (Number(it.qty) || 1)); s.soldOut = s.stock <= 0; });
  }
  function patchPedido(o, cambios) { return fsPatch("orders/" + encodeURIComponent(o._id), cambios).then(function () { Object.assign(o, cambios); }); }
  function ok(m) { adm.msg = m; adm.msgTipo = "ok"; }
  function mal(e) { adm.msg = errTxt(e); adm.msgTipo = "err"; }
  function setEstado(o, nuevo, sel) {
    var cambios = { status: nuevo, updatedAt: new Date() }, stockCambio = false;
    if ((nuevo === "pagado" || nuevo === "entregado") && !o.stockApplied && rastreados(o).length &&
      window.confirm("¿Descontar del stock los sets de este pedido (" + rastreados(o).map(function (it) { return it.name; }).join(", ") + ")?")) { cambios.stockApplied = true; stockCambio = true; }
    var entrega = nuevo === "entregado" && o.status !== "entregado";
    if (entrega) cambios.entregadoDia = hoyIso();   // ocupa cupo de hoy (8 por día)
    if (entrega && telDe(o)) window.open(waEnlace(telDe(o), msgEntrega(Object.assign({}, o, cambios))), "_blank", "noopener");
    patchPedido(o, cambios).then(function () {
      ok("Pedido " + (o.code || o._id) + ": " + estTxt(nuevo) + (entrega && !telDe(o) ? ". Agrega su WhatsApp para avisarle." : "."));
      if (entrega && !telDe(o)) P.tel = o._id;
      if (stockCambio) { descontar(o, 1); return guardarCat(adm.msg + " Stock descontado."); }
    }).catch(function (e) { if (sel) sel.value = o.status; mal(e); }).then(pintarPed);
  }
  function reservar(o) {
    var ls = rastreados(o); if (!ls.length) return;
    if (!window.confirm("¿Confirmar el pedido " + (o.code || o._id) + " y descontar del stock? " + ls.map(function (it) { return (it.qty || 1) + " × " + it.name + " (quedan " + setPorId(it.id).stock + ")"; }).join(", "))) return;
    patchPedido(o, { stockApplied: true, updatedAt: new Date() }).then(function () { descontar(o, 1); return guardarCat("✔ Stock descontado (" + (o.code || o._id) + ")."); })
      .catch(mal).then(pintarPed);
  }
  function borrarPed(o) {
    if (!window.confirm("¿Eliminar el pedido " + (o.code || o._id) + " de " + (o.customerName || "este cliente") + "? No se puede deshacer.")) return;
    var devolver = o.stockApplied && rastreados(o).length && window.confirm("Este pedido ya descontó stock. ¿Devolver esas unidades al stock?");
    fsBorrar("orders/" + encodeURIComponent(o._id)).then(function () {
      P.orders = P.orders.filter(function (x) { return x !== o; });
      ok("Pedido " + (o.code || o._id) + " eliminado" + (devolver ? " y stock devuelto." : "."));
      if (devolver) { descontar(o, -1); return guardarCat(adm.msg); }
    }).catch(mal).then(pintarPed);
  }
  function guardarFicha(clave, cambios) {
    var cur = P.fichas[clave] || {};
    var datos = Object.assign({ name: cur.name || "", steamId: cur.steamId || "", phone: cur.phone || "", friendSince: cur.friendSince || "" }, cambios, { updatedAt: new Date() });
    return fsPatch("customers/" + encodeURIComponent(PREF + clave), datos).then(function () { P.fichas[clave] = Object.assign({}, cur, datos); });
  }
  function fichaBase(clave) {
    var c = cliPorClave(clave);
    return c ? { name: c.name || "", steamId: c.steamId || "", phone: c.phone || "" } : {};
  }
  function cambiarAmistad(clave, iso) {
    if (iso && !isoOk(iso)) return;
    guardarFicha(clave, Object.assign(fichaBase(clave), { friendSince: iso || "" })).then(function () { ok(iso ? "✔ Fecha de amistad guardada." : "Fecha de amistad borrada."); })
      .catch(mal).then(pintarPed);
  }
  var frTimer = {};
  function moverAmistad(fr, d) {
    var clave = fr.getAttribute("data-key"), inp = fr.querySelector(".sc-frd");
    var base = isoOk(inp.value) ? inp.value : hoyIso(), nuevo = isoMas(base, d);
    inp.value = nuevo;
    clearTimeout(frTimer[clave]);   // guardado diferido: puedes tocar varias veces seguidas
    frTimer[clave] = setTimeout(function () { cambiarAmistad(clave, nuevo); }, 700);
  }
  function guardarTel(o) {
    var inp = admEl.querySelector(".sc-telin"), t = normTel(inp && inp.value);
    if (t === null || !t) { adm.msg = "Revisa el WhatsApp: un número (ej. 987 654 321) o un @usuario."; adm.msgTipo = "err"; pintarPed(); return; }
    var clave = claveCli(o.steamId, o.customerName), win = window.open("about:blank", "_blank");
    patchPedido(o, { phone: t, updatedAt: new Date() }).then(function () { return guardarFicha(clave, Object.assign(fichaBase(clave), { phone: t })); })
      .then(function () { P.tel = null; ok("✔ WhatsApp guardado."); var u = waEnlace(t, msgEntrega(o)); if (win) win.location.href = u; else window.open(u, "_blank", "noopener"); })
      .catch(function (e) { if (win) win.close(); mal(e); }).then(pintarPed);
  }
  // Crea un pedido con lo elegido en el selector (compra a mano, nuevo cliente, pedido manual)
  function guardarCompra(box, cli, extra) {
    var lineas = pkLineas(box);
    if (!lineas.length) return Promise.resolve(null);
    var estado = pv(box, "estado") || "pagado", fecha = pv(box, "fecha");
    var cuando = fecha && fecha !== hoyIso() && isoOk(fecha) ? new Date(fecha + "T12:00:00") : new Date();
    var sub = r2(lineas.reduce(function (t, l) { return t + l.price * l.qty; }, 0));
    var code = nuevoCodigo(true);
    var pedido = { code: code, customerName: cli.name, steamId: cli.steamId || "", phone: cli.phone || "", items: lineas, count: lineas.reduce(function (n, l) { return n + l.qty; }, 0),
      subtotal: sub, discount: 0, total: sub, status: estado, createdAt: cuando, tienda: TD.id };
    if (estado === "entregado") pedido.entregadoDia = isoDe(cuando);
    if (extra) Object.assign(pedido, extra);
    var conStock = esVenta(pedido) && rastreados(pedido).length && window.confirm("¿Descontar del stock los sets de esta compra (" + rastreados(pedido).map(function (it) { return it.name; }).join(", ") + ")?");
    if (conStock) pedido.stockApplied = true;
    return fsPatch("orders/" + encodeURIComponent(code), pedido).then(function () {
      pedido._id = code; P.orders.unshift(pedido);
      if (conStock) { descontar(pedido, 1); return guardarCat().then(function () { return pedido; }); }
      return pedido;
    });
  }
  function ocupado(card, si) { card.classList.toggle("sc-busy", si); card.querySelectorAll("button").forEach(function (b) { b.disabled = si; }); }
  function manGuardar() {
    var card = manEl, err = card.querySelector(".sc-ferr"); err.textContent = "";
    var existente = card.getAttribute("data-modo") === "existente", since = fv(card, "since"), nombre, steam, tel, c = null;
    if (existente) {
      c = cliPorClave(fv(card, "cli"));
      if (!c) { err.textContent = "Elige el cliente."; return; }
      nombre = c.name || ""; steam = c.steamId || ""; tel = c.phone || "";
    } else {
      steam = normSteam(fv(card, "steam")); tel = normTel(fv(card, "phone")); nombre = fv(card, "name").trim().replace(/\s+/g, " ").slice(0, 60);
      if (steam === null) { err.textContent = "El ID de amigo de Steam son solo números (ej. 123456789)."; return; }
      if (!steam) { err.textContent = "Escribe el ID de amigo de Steam del cliente."; return; }
      if (tel === null) { err.textContent = "Revisa el WhatsApp: un número (ej. 987 654 321) o un @usuario (ej. @tuusuario)."; return; }
      if (!tel) { err.textContent = "Escribe su número de WhatsApp o su @usuario."; return; }
      if (!nombre) nombre = "Cliente " + steam;
    }
    if (!isoOk(since)) { err.textContent = "Pon desde cuándo son amigos (fecha de amistad)."; return; }
    var box = card.querySelector(".sc-pick");
    if (!pkItems(box).length) { err.textContent = "Agrega al menos un set."; return; }
    var clave = claveCli(steam, nombre);
    if (!existente && cliPorClave(clave)) { err.textContent = "Ya existe un cliente con ese ID de Steam. Cámbialo a “Cliente existente”."; return; }
    var prev = desdeDe(clave);
    if (existente && prev && prev !== since && !window.confirm("Cambiarás la fecha de amistad de " + nombre + " (de " + prev + " a " + since + "). Afecta también sus otros pedidos. ¿Continuar?")) return;
    ocupado(card, true);
    guardarFicha(clave, { name: nombre, steamId: steam, phone: tel || "", friendSince: since })
      .then(function () { return guardarCompra(box, { name: nombre, steamId: steam, phone: tel }, { origen: "manual", manual: true, clienteRegistrado: !!(c && c.account) }); })
      .then(function (o) {
        manEl = null; planCache = null; var p = planDe(o);
        ok("Pedido " + o.code + " creado para " + nombre + "." + (o.status !== "pagado" || !p ? "" : p.day <= hoyIso() ? " Hoy le toca entregarlo." : " Entrega: " + fmtDia(p.day) + (p.corrido ? " (día " + (ESPERA + p.corrido) + ", por el cupo de " + CAP + " por día)" : "") + ". Te llegará el recordatorio por correo."));
        pintarPed();
      }).catch(function (e) { ocupado(card, false); err.textContent = errTxt(e); });
  }
  function oeGuardar(o, card) {
    var err = card.querySelector(".sc-ferr"); err.textContent = "";
    var nombre = fv(card, "name").trim().replace(/\s+/g, " ").slice(0, 60), steam = normSteam(fv(card, "steam")), tel = normTel(fv(card, "phone"));
    var total = Number(String(fv(card, "total")).replace(",", ".")), box = card.querySelector(".sc-pick"), fecha = pv(box, "fecha");
    if (!nombre) { err.textContent = "Escribe el nombre de Dota 2 del cliente."; return; }
    if (steam === null) { err.textContent = "El ID de amigo de Steam son solo números (ej. 123456789)."; return; }
    if (tel === null) { err.textContent = "Revisa el WhatsApp: un número (ej. 987 654 321) o un @usuario (ej. @tuusuario)."; return; }
    var viejas = o.items || [];
    // conserva el precio original de los sets que ya estaban (por descuentos)
    var lineas = pkLineas(box).map(function (l) { var era = viejas.filter(function (v) { return String(v.id) === l.id; })[0]; if (era) { l.price = Number(era.price) || 0; if (!l.img) l.img = era.img || ""; if (!setPorId(l.id)) l.name = era.name; } return l; });
    if (!lineas.length) { err.textContent = "El pedido debe tener al menos un set."; return; }
    if (!isFinite(total) || total < 0 || fv(card, "total") === "") { err.textContent = "Revisa el total."; return; }
    if (!isoOk(fecha)) { err.textContent = "Revisa la fecha de compra."; return; }
    var sub = r2(lineas.reduce(function (t, l) { return t + l.price * l.qty; }, 0));
    var creado = o.createdAt instanceof Date && isoDe(o.createdAt) === fecha ? o.createdAt : new Date(fecha + "T12:00:00");
    // Si el pedido ya descontó stock, ofrecer ajustarlo con la diferencia
    var delta = {};
    if (o.stockApplied) {
      viejas.forEach(function (l) { delta[String(l.id)] = (delta[String(l.id)] || 0) + (Number(l.qty) || 1); });
      lineas.forEach(function (l) { delta[l.id] = (delta[l.id] || 0) - l.qty; });
      Object.keys(delta).forEach(function (id) { var s = setPorId(id); if (!delta[id] || !s || s.stock === null) delete delta[id]; });
    }
    var ajustar = Object.keys(delta).length && window.confirm("Este pedido ya descontó stock. ¿Ajustar el stock con el cambio? " + Object.keys(delta).map(function (id) { return setPorId(id).name + ": " + (delta[id] > 0 ? "+" : "−") + Math.abs(delta[id]); }).join(", "));
    var campos2 = { customerName: nombre, steamId: steam || "", phone: tel || "", items: lineas, count: lineas.reduce(function (n, l) { return n + l.qty; }, 0),
      subtotal: sub, discount: Math.max(0, r2(sub - total)), total: r2(total), createdAt: creado, updatedAt: new Date() };
    var claveV = claveCli(o.steamId, o.customerName), claveN = claveCli(campos2.steamId, nombre), fv0 = P.fichas[claveV];
    ocupado(card, true);
    patchPedido(o, campos2).then(function () {
      // nuevo nombre / ID de Steam: lleva la fecha de amistad a la ficha nueva (si no existe)
      if (claveN !== claveV && !P.fichas[claveN] && fv0 && fv0.friendSince) return guardarFicha(claveN, { name: nombre, steamId: campos2.steamId, phone: campos2.phone || fv0.phone || "", friendSince: fv0.friendSince });
    }).then(function () {
      P.editPed = null;
      ok("Pedido " + (o.code || o._id) + " actualizado" + (ajustar ? " y stock ajustado." : "."));
      if (ajustar) { Object.keys(delta).forEach(function (id) { var s = setPorId(id); ajustarSet(s, delta[id]); s.soldOut = s.stock <= 0; }); return guardarCat(adm.msg); }
    }).then(pintarPed).catch(function (e) { ocupado(card, false); err.textContent = errTxt(e); });
  }

  /* ---- acciones de clientes ---- */
  function cliGuardar(clave, card) {
    var err = card.querySelector(".sc-ferr"); err.textContent = "";
    var nombre = fv(card, "name").trim().replace(/\s+/g, " ").slice(0, 60), steam = normSteam(fv(card, "steam")), tel = normTel(fv(card, "phone"));
    if (!nombre) { err.textContent = "Escribe el nombre de Dota 2 del cliente."; return; }
    if (steam === null) { err.textContent = "El ID de amigo de Steam son solo números (ej. 123456789)."; return; }
    if (tel === null) { err.textContent = "Revisa el WhatsApp: un número (ej. 987 654 321) o un @usuario (ej. @tuusuario)."; return; }
    var claveN = claveCli(steam, nombre), peds = pedidosDe(clave), vieja = P.fichas[clave];
    var otro = claveN !== clave ? (P.fichas[claveN] || cliPorClave(claveN)) : null;
    if (otro && !window.confirm("Ya existe un cliente con ese " + (steam ? "ID de Steam" : "nombre") + " (" + (otro.name || claveN) + "). ¿Unir ambos clientes en uno solo?")) return;
    ocupado(card, true);
    var ahora = new Date(), cadena = Promise.resolve();
    peds.forEach(function (o) {
      if (o.customerName === nombre && (o.steamId || "") === steam) return;
      cadena = cadena.then(function () { return patchPedido(o, { customerName: nombre, steamId: steam, updatedAt: ahora }); });
    });
    cadena.then(function () {
      var dest = P.fichas[claveN];
      return guardarFicha(claveN, { name: nombre, steamId: steam, phone: tel || (dest && dest.phone) || (vieja && vieja.phone) || "", friendSince: (dest && dest.friendSince) || (vieja && vieja.friendSince) || "" });
    }).then(function () {
      if (claveN !== clave && vieja) return fsBorrar("customers/" + encodeURIComponent(PREF + clave)).then(function () { delete P.fichas[clave]; });
    }).then(function () { P.edit = null; ok(otro ? "Clientes unidos: " + nombre + "." : "Cliente actualizado: " + nombre + "."); pintarPed(); })
      .catch(function (e) { mal(e); P.edit = null; P.cargado = false; cargarPed(); });
  }
  function cliBorrar(clave, card) {
    var c = cliPorClave(clave) || { name: "" }, peds = pedidosDe(clave), quien = c.name || "este cliente";
    if (!window.confirm(peds.length ? "¿Eliminar a " + quien + " y " + (peds.length === 1 ? "su pedido" : "sus " + peds.length + " pedidos") + " (" + peds.map(function (o) { return o.code || o._id; }).join(", ") + ")? No se puede deshacer."
      : "¿Eliminar a " + quien + "? Se borrará su fecha de amistad. No se puede deshacer.")) return;
    var vuelta = {};
    peds.filter(function (o) { return o.stockApplied; }).forEach(function (o) { rastreados(o).forEach(function (it) { var s = setPorId(it.id); vuelta[s.id] = (vuelta[s.id] || 0) + (Number(it.qty) || 1); }); });
    var devolver = Object.keys(vuelta).length && window.confirm("Algunos pedidos ya descontaron stock. ¿Devolver estas unidades? " + Object.keys(vuelta).map(function (id) { return vuelta[id] + " × " + setPorId(id).name; }).join(", "));
    if (card) ocupado(card, true);
    var cadena = Promise.resolve();
    peds.forEach(function (o) { cadena = cadena.then(function () { return fsBorrar("orders/" + encodeURIComponent(o._id)).then(function () { P.orders = P.orders.filter(function (x) { return x !== o; }); }); }); });
    cadena.then(function () { if (P.fichas[clave]) return fsBorrar("customers/" + encodeURIComponent(PREF + clave)).then(function () { delete P.fichas[clave]; }); })
      .then(function () {
        ok(quien + " eliminado" + (peds.length ? " con " + (peds.length === 1 ? "su pedido" : "sus " + peds.length + " pedidos") : "") + (devolver ? " y stock devuelto." : "."));
        if (devolver) { Object.keys(vuelta).forEach(function (id) { var s = setPorId(id); ajustarSet(s, vuelta[id]); if (s.stock > 0) s.soldOut = false; }); return guardarCat(adm.msg); }
      }).catch(function (e) { mal(e); P.cargado = false; cargarPed(); }).then(pintarPed);
  }
  function cliCompra(clave, card) {
    var c = cliPorClave(clave), err = card.querySelector(".sc-ferr"), box = card.querySelector(".sc-pick");
    if (!pkItems(box).length) { err.textContent = "Agrega al menos un set."; return; }
    ocupado(card, true);
    guardarCompra(box, { name: c.name, steamId: c.steamId, phone: c.phone }).then(function (o) { P.comprando = null; ok("Compra registrada (" + o.code + ") para " + c.name + "."); pintarPed(); })
      .catch(function (e) { ocupado(card, false); err.textContent = errTxt(e); });
  }
  function cliCrear(card) {
    var err = card.querySelector(".sc-ferr"); err.textContent = "";
    var nombre = fv(card, "name").trim().replace(/\s+/g, " ").slice(0, 60), steam = normSteam(fv(card, "steam")), tel = normTel(fv(card, "phone")), since = fv(card, "since");
    if (!nombre) { err.textContent = "Escribe el nombre de Dota 2 del cliente."; return; }
    if (steam === null) { err.textContent = "El ID de amigo de Steam son solo números (ej. 123456789)."; return; }
    if (tel === null) { err.textContent = "Revisa el WhatsApp: un número (ej. 987 654 321) o un @usuario (ej. @tuusuario)."; return; }
    if (since && !isoOk(since)) { err.textContent = "Revisa la fecha de amistad."; return; }
    var clave = claveCli(steam, nombre);
    if (cliPorClave(clave)) { err.textContent = "Ya existe un cliente con ese " + (steam ? "ID de Steam" : "nombre") + ". Búscalo en la lista y edítalo."; return; }
    ocupado(card, true);
    guardarFicha(clave, { name: nombre, steamId: steam || "", phone: tel || "", friendSince: since || "" })
      .then(function () { return guardarCompra(card.querySelector(".sc-pick"), { name: nombre, steamId: steam || "", phone: tel || "" }); })
      .then(function (o) { P.creando = false; ok("Cliente creado: " + nombre + "." + (o ? " Compra registrada (" + o.code + ")." : "")); pintarPed(); })
      .catch(function (e) { ocupado(card, false); err.textContent = errTxt(e); });
  }

  /* =====================================================================
     STOCK DE SETS (igual que "📦 Stock de sets" de LitleJacob): inventario y últimos vendidos
     ===================================================================== */
  var S = { sub: "inv", q: "", rar: "", filtro: "all", dias: "30", cta: "", ctaForm: null, ctaBorrar: "" };
  var previo = {};   // stock que tenía un set antes de repartirlo por cuentas (por si vacías todas sus cuentas)
  function ctaSel() { return S.cta && S.cta !== "sin" && cuentaPorId(S.cta) ? S.cta : ""; }
  // Lo que se ve y se edita en cada fila: el stock de la cuenta elegida o el total
  function valDe(s) { var c = ctaSel(); return c ? enCuenta(s, c) : s.stock; }
  function stEstado(s, v) {
    if (v === undefined) v = valDe(s);
    if (v === null) return ctaSel() ? { cls: "none", txt: "No está aquí", key: "none" } : { cls: "none", txt: "Sin registrar", key: "none" };
    if (v < 0) return { cls: "zero", txt: "Debes " + Math.abs(v), key: "zero" };
    if (v === 0) return { cls: "zero", txt: "Agotado", key: "zero" };
    if (v <= 2) return { cls: "low", txt: "Pocas", key: "low" };
    return { cls: "ok", txt: "En stock", key: "ok" };
  }
  function stBase() { return S.cta === "sin" ? cat.sets.filter(function (s) { return !tieneCuentas(s); }) : cat.sets; }
  function stStatsHtml() {
    var base = stBase(), reg = base.filter(function (s) { return valDe(s) !== null; });
    // unidades y valor: solo lo que sí tienes (los negativos son sets que aún debes)
    var uni = reg.reduce(function (n, s) { return n + Math.max(0, valDe(s)); }, 0), val = reg.reduce(function (t, s) { return t + (s.price !== null ? s.price * Math.max(0, valDe(s)) : 0); }, 0);
    var cero = reg.filter(function (s) { return valDe(s) <= 0; }).length, poco = reg.filter(function (s) { var v = valDe(s); return v > 0 && v <= 2; }).length;
    return '<div><b>' + reg.length + '/' + base.length + '</b><span>' + (ctaSel() ? 'Sets en esta cuenta' : 'Sets registrados') + '</span></div><div><b>' + uni + '</b><span>Unidades</span></div><div><b>' + esc(mon(val)) + '</b><span>Valor del stock</span></div>' +
      '<div class="' + (poco ? 'warn' : '') + '"><b>' + poco + '</b><span>Pocas (1-2)</span></div><div class="' + (cero ? 'warn' : '') + '"><b>' + cero + '</b><span>Agotados</span></div>';
  }
  function stFilaHtml(s) {
    var c = ctaSel(), v = valDe(s), e = stEstado(s, v), fijo = !c && tieneCuentas(s);
    return '<div class="sc-srow' + (fijo ? ' fijo' : '') + '" data-id="' + s.id + '"' + (c ? ' data-c="' + esc(c) + '"' : '') + '><span class="sc-ath">' + foto(s.img) + '</span>' +
      '<span class="sc-anm"><b>' + esc(s.name) + '</b><small><i style="color:' + colorRar(s.rarity) + '">' + esc(s.rarity) + '</i> · ' + (s.price === null ? 'sin precio' : esc(mon(s.price))) +
      (c && s.stock !== null ? ' · <span class="sc-stot">total ' + s.stock + '</span>' : '') + '</small>' + (c ? '' : chipsCta(s, true)) + '</span>' +
      '<span class="sc-sst ' + e.cls + '">' + esc(e.txt) + '</span>' +
      (fijo ? '<span class="sc-sqty sc-sfijo" title="Es la suma de sus cuentas. Elige una cuenta arriba para cambiarlo."><b>' + s.stock + '</b><small>total</small></span>'
        : '<span class="sc-sqty"><button type="button" class="btn btn-ghost btn-sm" data-s="stMenos" aria-label="Menos">−</button><input type="number" step="1" inputmode="numeric" value="' + (v === null ? '' : v) + '" placeholder="—" aria-label="Stock de ' + esc(s.name) + (c ? ' en ' + esc(cuentaPorId(c).nick) : '') + '"><button type="button" class="btn btn-ghost btn-sm" data-s="stMas" aria-label="Más">+</button></span>') + '</div>';
  }
  function stListaHtml() {
    var q = sinTildes(S.q).trim(), c = ctaSel();
    var l = ordenados(stBase()).filter(function (s) { return (!q || sinTildes(s.name + " " + s.hero).indexOf(q) >= 0) && (!S.rar || s.rarity === S.rar) && (S.filtro === "all" || stEstado(s).key === S.filtro); });
    if (c) l.sort(function (a, b) { return (enCuenta(a, c) === null ? 1 : 0) - (enCuenta(b, c) === null ? 1 : 0); });   // los de esta cuenta primero
    return l.length ? l.map(stFilaHtml).join("") : '<p class="hint">No hay sets con ese filtro.</p>';
  }
  function pintarStock() {
    if (!cat.cargado || cat.deCache) { admEl.innerHTML = '<p class="hint">Cargando catálogo…</p>'; cargarCat(true); return; }
    if (S.cta && S.cta !== "sin" && !cuentaPorId(S.cta)) S.cta = "";
    var sub = S.sub, tab = function (v, txt) { return '<button type="button" class="subtab" role="tab" data-s="stSub" data-v="' + v + '" aria-selected="' + (sub === v) + '">' + txt + '</button>'; };
    var h = '<div class="subtabs" role="tablist">' + tab("inv", "📦 Inventario") + tab("ctas", "🎮 Cuentas de Steam") + tab("sold", "🧾 Últimos vendidos") + '</div>';
    if (sub === "sold") { admEl.innerHTML = h + '<div class="sc-sold">' + vendidosHtml() + '</div>'; R().hidratar(); return; }
    if (sub === "ctas") { admEl.innerHTML = h + ctasHtml(); if (S.ctaForm) ctaPrevia(); R().hidratar(); return; }
    var c = ctaSel();
    if (cat.cuentas.length) h += '<div class="sc-sctas" role="group" aria-label="Cuenta de Steam"><span>🎮 Ver stock de:</span>' +
      [["", "Todas (total)"]].concat(cat.cuentas.map(function (x) { return [x.id, x.nick]; }), [["sin", "Sin cuenta"]]).map(function (o) {
        return '<button type="button" class="itab' + (S.cta === o[0] ? ' on' : '') + '" data-s="stCta" data-v="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join("") + '</div>';
    else h += '<p class="sc-msg">💡 ¿Tienes los sets repartidos en varias cuentas de Steam? Agrégalas en <b>🎮 Cuentas de Steam</b> y aquí podrás llevar el stock de cada una.</p>';
    if (c) { var cc = cuentaPorId(c); h += '<div class="sc-sctainfo"><b>🎮 ' + esc(cc.nick) + '</b><small>Escribe cuántos tienes de cada set en esta cuenta. Vacío = no está en esta cuenta. El total de cada set es la suma de sus cuentas.</small>' + (cc.perfil ? '<a href="' + esc(cc.perfil) + '" target="_blank" rel="noopener noreferrer">Perfil de Steam ↗</a>' : '') + '</div>'; }
    h += '<div class="sc-stats sc-sstats">' + stStatsHtml() + '</div>' +
      '<div class="sc-pbar sc-sbar"><input type="search" class="sc-sq" placeholder="Buscar set…" value="' + esc(S.q) + '" autocomplete="off">' +
      '<select class="sc-srar" aria-label="Rareza"><option value="">Todas las rarezas</option>' + RAREZAS.map(function (r) { return '<option' + (S.rar === r ? ' selected' : '') + '>' + r + '</option>'; }).join("") + '</select>' +
      '<select class="sc-sfil" aria-label="Filtrar"><option value="all">Todos</option><option value="ok">Con stock</option><option value="low">Pocas unidades (1-2)</option><option value="zero">Agotados (0)</option><option value="none">' + (c ? 'No están en esta cuenta' : 'Sin registrar') + '</option></select></div>' +
      '<p class="sc-msg sc-smsg ' + esc(adm.msgTipo) + '" role="status">' + esc(adm.msg) + '</p>' +
      '<div class="sc-slist">' + stListaHtml() + '</div>' +
      '<p class="hint">Se guarda y se publica solo. Con 0 o menos unidades el set aparece como AGOTADO (puedes poner números negativos: son sets que ya vendiste y aún debes sacar). Vacío = sin registrar (sin límite).' +
      (cat.cuentas.length ? ' Los sets repartidos en cuentas muestran su total: para cambiarlo elige la cuenta arriba. Al confirmar un pedido, el stock se descuenta de la cuenta que tiene más unidades de ese set.' : '') + '</p>';
    admEl.innerHTML = h;
    admEl.querySelector(".sc-sfil").value = S.filtro;
    R().hidratar();
  }
  var stTimer = null, stAntes = null;
  function stPoner(s, val) {
    if (!stAntes) stAntes = JSON.stringify(cat.sets);
    var prev = s.stock;
    s.stock = val;
    stAplicar(s, prev);
  }
  // Cambia el stock de un set en una cuenta (vacío = el set no está en esa cuenta)
  function stPonerCta(s, cid, val) {
    if (!stAntes) stAntes = JSON.stringify(cat.sets);
    var prev = s.stock;
    if (!tieneCuentas(s)) { if (val === null) return; previo[s.id] = s.stock; s.porCuenta = {}; }
    if (val === null) delete s.porCuenta[cid]; else s.porCuenta[cid] = val;
    if (!Object.keys(s.porCuenta).length) { delete s.porCuenta; s.stock = previo[s.id] !== undefined ? previo[s.id] : 0; }
    else s.stock = sumaPc(s.porCuenta);
    stAplicar(s, prev);
  }
  function stAplicar(s, prev) {
    var val = s.stock;
    if (val !== null && val <= 0) s.soldOut = true;
    else if (val !== null && val > 0 && prev !== null && prev <= 0 && s.soldOut && s.price !== null) s.soldOut = false;
    else if (val === null && prev !== null && prev <= 0 && s.soldOut) s.soldOut = false;
    var fila = admEl.querySelector('.sc-srow[data-id="' + s.id + '"]');
    if (fila) {
      var v = valDe(s), e = stEstado(s, v), b = fila.querySelector(".sc-sst"); b.className = "sc-sst " + e.cls; b.textContent = e.txt;
      var inp = fila.querySelector("input"); if (inp && document.activeElement !== inp) inp.value = v === null ? "" : v;
      var tt = fila.querySelector(".sc-stot"); if (tt) tt.textContent = "total " + s.stock;
    }
    var st = admEl.querySelector(".sc-sstats"); if (st) st.innerHTML = stStatsHtml();
    var m = admEl.querySelector(".sc-smsg"); if (m) { m.className = "sc-msg sc-smsg"; m.textContent = "Guardando…"; }
    clearTimeout(stTimer);
    stTimer = setTimeout(stGuardar, 800);
  }
  // Guardado del stock sin redibujar el panel (para no perder lo que estás escribiendo)
  function stGuardar() {
    var copia = stAntes; stAntes = null;
    var j = jsonCat();
    var aviso = function (cls, txt) { adm.msg = txt; adm.msgTipo = cls; var mm = admEl.querySelector(".sc-smsg"); if (mm) { mm.className = "sc-msg sc-smsg " + cls; mm.textContent = txt; } };
    fsPatch(DOC, { json: JSON.stringify(j), updatedAt: new Date() }).then(function () { aviso("ok", "✔ Stock guardado. Los clientes ya lo ven."); pintarCli(); })
      .catch(function (e) { try { cat.sets = JSON.parse(copia); } catch (x) { /* nada */ } aviso("err", errTxt(e)); if (adm.tab === "setsStk") pintarStock(); });
  }

  /* ---- Cuentas de Steam (nick, enlace al perfil y frase llamativa que ve el cliente) ---- */
  function unidadesCta(cid) { var n = 0, k = 0; cat.sets.forEach(function (s) { var v = enCuenta(s, cid); if (v !== null) { k++; n += Math.max(0, v); } }); return { sets: k, uni: n }; }
  function ctasHtml() {
    var msg = adm.msg ? '<p class="sc-msg ' + esc(adm.msgTipo) + '" role="status">' + esc(adm.msg) + '</p>' : '';
    var h = '<div class="sc-ctas">' + msg +
      '<p class="hint">Cada cuenta sale en <b>Sets Caché</b> como un grupo con su nick y su frase. Cuando el cliente entra a la cuenta, ve el botón a su <b>perfil de Steam</b>. Las cuentas sin sets disponibles no se muestran.</p>';
    if (S.ctaForm) return h + ctaFormHtml() + '</div>';
    h += '<div class="sc-acts"><button type="button" class="btn btn-yellow btn-sm" data-s="ctaNueva">+ Agregar cuenta</button></div>';
    if (!cat.cuentas.length) return h + '<p class="hint">Aún no hay cuentas. Agrega la primera con su nick de Steam y el enlace de su perfil.</p></div>';
    h += cat.cuentas.map(function (c, i) {
      var u = unidadesCta(c.id);
      return '<div class="sc-ctarow"><span class="sc-cta-av" aria-hidden="true">' + esc(String(c.nick).charAt(0).toUpperCase()) + '</span>' +
        '<span class="sc-anm"><b>' + esc(c.nick) + '</b><small>' + esc(descDe(c)) + '</small><small>' + nSets(u.sets) + ' · ' + u.uni + (u.uni === 1 ? ' unidad' : ' unidades') +
        (c.perfil ? ' · <a href="' + esc(c.perfil) + '" target="_blank" rel="noopener noreferrer">Perfil de Steam ↗</a>' : ' · <em class="sc-ag">sin enlace de perfil</em>') + '</small></span>' +
        '<span class="sc-abt">' + (i > 0 ? '<button type="button" class="btn btn-ghost btn-sm" data-s="ctaSubir" data-v="' + esc(c.id) + '" aria-label="Subir">▲</button>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" data-s="stCtaVer" data-v="' + esc(c.id) + '">📦 Stock</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-s="ctaEditar" data-v="' + esc(c.id) + '">✎</button>' +
        (S.ctaBorrar === c.id ? '<button type="button" class="btn btn-sm sc-del" data-s="ctaBorrarSi" data-v="' + esc(c.id) + '">¿Quitar? Sí</button>' : '<button type="button" class="btn btn-ghost btn-sm" data-s="ctaBorrar" data-v="' + esc(c.id) + '" aria-label="Quitar">🗑</button>') + '</span></div>';
    }).join("");
    return h + '</div>';
  }
  function ctaFormHtml() {
    var f = S.ctaForm;
    return '<div class="grp sc-form sc-ctaform"><h3>' + (f.nueva ? 'Nueva cuenta de Steam' : 'Editar cuenta') + '</h3>' +
      '<div class="field"><label for="sc-c-nick">Nick de Steam *</label><input id="sc-c-nick" data-cf="nick" maxlength="40" value="' + esc(f.nick) + '" placeholder="Ej. ' + esc(TD.nombreMayus) + ' #1"></div>' +
      '<div class="field"><label for="sc-c-perfil">Enlace del perfil de Steam</label><input id="sc-c-perfil" data-cf="perfil" maxlength="200" inputmode="url" value="' + esc(f.perfil) + '" placeholder="https://steamcommunity.com/id/…"><small class="hint">En Steam: tu perfil → clic derecho en la página → Copiar dirección (URL).</small></div>' +
      '<div class="field"><label for="sc-c-desc">Frase llamativa (la ven los clientes)</label><input id="sc-c-desc" data-cf="desc" maxlength="160" value="' + esc(f.desc) + '" placeholder="' + esc(FRASES[0].replace("{nick}", f.nick || "esta cuenta")) + '"></div>' +
      '<div class="sc-acts"><button type="button" class="btn btn-ghost btn-sm" data-s="ctaSugerir">✨ Sugerir otra frase</button></div>' +
      '<div class="sc-ctaprev"><small>Así lo verá el cliente:</small><div class="sc-cta-box"></div></div>' +
      '<p class="sc-ferr" role="alert"></p>' +
      '<div class="sc-acts"><button type="button" class="btn btn-fuchsia btn-sm" data-s="ctaGuardar">💾 Guardar cuenta</button><button type="button" class="btn btn-ghost btn-sm" data-s="ctaCancelar">Cancelar</button></div></div>';
  }
  function ctaLeer() {
    var f = S.ctaForm; if (!f) return f;
    ["nick", "perfil", "desc"].forEach(function (k) { var el = admEl.querySelector('[data-cf="' + k + '"]'); if (el) f[k] = el.value; });
    return f;
  }
  function ctaPrevia() {
    var f = ctaLeer(), box = admEl.querySelector(".sc-cta-box"); if (!f || !box) return;
    var c = normCuenta({ id: f.id || "cx", nick: f.nick.trim() || "Tu cuenta", perfil: perfilOk(f.perfil) || "", desc: f.desc });
    box.innerHTML = cabCuenta(c, unidadesCta(c.id).sets || 3, true);
    box.querySelectorAll("[data-s]").forEach(function (el) { el.removeAttribute("data-s"); });
  }
  function ctaGuardar() {
    var f = ctaLeer(), err = admEl.querySelector(".sc-ctaform .sc-ferr");
    var nick = String(f.nick || "").trim().replace(/\s+/g, " "), perfil = perfilOk(f.perfil);
    if (!nick) { err.textContent = "Escribe el nick de la cuenta."; return; }
    if (perfil === null) { err.textContent = "Pega el enlace del perfil de Steam (empieza con https://steamcommunity.com/id/… o /profiles/…)."; return; }
    if (cat.cuentas.some(function (c) { return c.id !== f.id && sinTildes(c.nick) === sinTildes(nick); })) { err.textContent = "Ya tienes una cuenta con ese nick."; return; }
    var c = normCuenta({ id: f.id || ("c" + Date.now().toString(36)), nick: nick, perfil: perfil, desc: f.desc });
    var antes = cat.cuentas.slice();
    if (f.nueva) cat.cuentas.push(c); else cat.cuentas = cat.cuentas.map(function (x) { return x.id === c.id ? c : x; });
    S.ctaForm = null;
    guardarCat("✔ Cuenta \"" + c.nick + "\" guardada." + (f.nueva ? " Ahora ve a 📦 Inventario, elige la cuenta y pon cuántos sets tiene." : "")).catch(function () { cat.cuentas = antes; S.ctaForm = f; pintarAdmin(); });
  }
  function ctaBorrar(cid) {
    var c = cuentaPorId(cid); if (!c) return;
    var u = unidadesCta(cid);
    if (u.uni && !window.confirm("La cuenta " + c.nick + " tiene " + u.uni + (u.uni === 1 ? " unidad" : " unidades") + " en " + nSets(u.sets) + ". Si la quitas, esas unidades se restan del stock. ¿Continuar?")) { S.ctaBorrar = ""; pintarAdmin(); return; }
    var copia = JSON.stringify([cat.sets, cat.cuentas]);
    cat.cuentas = cat.cuentas.filter(function (x) { return x.id !== cid; });
    cat.sets.forEach(function (s) {
      if (enCuenta(s, cid) === null) return;
      var prev = s.stock; delete s.porCuenta[cid];
      if (!Object.keys(s.porCuenta).length) { delete s.porCuenta; s.stock = 0; } else s.stock = sumaPc(s.porCuenta);
      if (s.stock <= 0) s.soldOut = true; else if (prev <= 0 && s.price !== null) s.soldOut = false;
    });
    S.ctaBorrar = ""; if (S.cta === cid) S.cta = "";
    guardarCat("Cuenta \"" + c.nick + "\" quitada.").catch(function () { var r = JSON.parse(copia); cat.sets = r[0]; cat.cuentas = r[1]; pintarAdmin(); });
  }
  function vendidosHtml() {
    if (!P.cargado) { if (!P.cargando && !P.err) cargarPed(); return P.err ? '<p class="sc-msg err">' + esc(P.err) + '</p>' : '<p class="hint">Cargando ventas…</p>'; }
    var lim = S.dias === "all" ? 0 : Date.now() - Number(S.dias) * 864e5, items = [];
    P.orders.filter(esVenta).forEach(function (o) {
      var t = o.createdAt instanceof Date ? o.createdAt.getTime() : 0; if (lim && t < lim) return;
      (o.items || []).forEach(function (it) { items.push({ id: Number(it.id), name: it.name, img: it.img, qty: Number(it.qty) || 1, price: Number(it.price) || 0, when: o.createdAt, who: o.customerName || "", status: o.status, code: o.code || o._id }); });
    });
    items.sort(function (a, b) { return (b.when ? b.when.getTime() : 0) - (a.when ? a.when.getTime() : 0); });
    var uni = items.reduce(function (n, it) { return n + it.qty; }, 0), tot = items.reduce(function (n, it) { return n + it.qty * it.price; }, 0), cods = {};
    items.forEach(function (it) { cods[it.code] = 1; });
    var top = {};
    items.forEach(function (it) { var k = it.id || it.name; (top[k] = top[k] || { id: it.id, name: it.name, img: it.img, qty: 0 }).qty += it.qty; });
    var tops = Object.keys(top).map(function (k) { return top[k]; }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);
    var queda = function (id) { var s = setPorId(id); return !s ? "ya no está en el catálogo" : s.stock === null ? "stock sin registrar" : s.stock <= 0 ? "agotado" : "quedan " + s.stock; };
    var fot = function (it) { return foto(fotoItem(it)); };
    return '<div class="sc-pbar"><select class="sc-sdias">' + [["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["90", "Últimos 3 meses"], ["all", "Todo"]].map(function (d) { return '<option value="' + d[0] + '"' + (S.dias === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join("") + '</select>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-s="stRecargar">↻ Actualizar</button></div>' +
      '<div class="sc-stats sc-s3"><div><b>' + uni + '</b><span>' + (uni === 1 ? 'set vendido' : 'sets vendidos') + '</span></div><div class="ok"><b>' + esc(mon(tot)) + '</b><span>en ventas</span></div><div><b>' + Object.keys(cods).length + '</b><span>pedidos</span></div></div>' +
      (tops.length ? '<h3 class="sc-sh">🔥 Más vendidos</h3><div class="sc-stop">' + tops.map(function (t) { return '<div class="sc-stopi"><span class="sc-ath">' + fot(t) + '</span><b>' + esc(t.name) + '</b><small>× ' + t.qty + ' · ' + esc(queda(t.id)) + '</small></div>'; }).join("") + '</div>' : '') +
      '<h3 class="sc-sh">🧾 Últimos vendidos</h3>' +
      (items.length ? '<div class="sc-svl">' + items.slice(0, 80).map(function (it) {
        return '<div class="sc-svr"><span class="sc-ath">' + fot(it) + '</span><span class="sc-anm"><b>' + esc(it.name) + (it.qty > 1 ? ' × ' + it.qty : '') + '</b><small>' + esc(it.who || "Cliente") + ' · ' + (it.when ? esc(it.when.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) + " " + it.when.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })) : '') + ' · ' + esc(queda(it.id)) + '</small></span>' +
          '<span class="sc-svp"><b>' + esc(mon(it.price * it.qty)) + '</b><i class="sc-obadge st-' + (it.status === "entregado" ? 'entregado' : 'pagado') + '">' + (it.status === "entregado" ? 'Entregado' : 'Pagado') + '</i></span></div>';
      }).join("") + '</div>' : '<p class="hint">No hay ventas en este periodo. Las ventas salen de los pedidos marcados como <b>Pagado</b> o <b>Entregado</b>.</p>') +
      '<p class="hint">¿Vendiste algo por fuera de la web? Regístralo en <b>Pedidos y clientes → Clientes → 🛒 Agregar compra</b> y aparecerá aquí (también descuenta el stock).</p>';
  }

  /* =====================================================================
     EVENTOS (atributo data-s, para no chocar con los de app.js)
     ===================================================================== */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-s]"); if (!t || !R()) return;
    var a = t.getAttribute("data-s"), id = t.getAttribute("data-id");
    var card = t.closest(".sc-ocard"), o = card && card.getAttribute("data-id") ? pedPorId(card.getAttribute("data-id")) : null;
    var ckey = card ? card.getAttribute("data-key") : "";
    var fr = t.closest(".sc-fr"), clave = fr ? fr.getAttribute("data-key") : "";
    var pk = t.closest(".sc-pick");
    switch (a) {
      case "agregar": agregar(id); break;
      case "quitar": quitar(id); break;
      case "rar": cli.rar = t.getAttribute("data-v") || ""; pintarCli(); break;
      case "cta": cli.cuenta = t.getAttribute("data-v") || ""; pintarCli(); var tope = cliEl.querySelector(".sc-ctas-nav") || cliEl.querySelector(".sc-grid-box"); if (tope && tope.getBoundingClientRect().top < 0) tope.scrollIntoView({ block: "start", behavior: "smooth" }); break;
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
      // stock
      case "stSub": S.sub = t.getAttribute("data-v"); adm.msg = ""; pintarStock(); break;
      case "stMenos": case "stMas":
        var fs = t.closest(".sc-srow"), ss = fs && setPorId(fs.getAttribute("data-id")); if (!ss) break;
        var fc = fs.getAttribute("data-c");
        if (fc) { var vc = enCuenta(ss, fc); stPonerCta(ss, fc, (vc === null ? 0 : vc) + (a === "stMas" ? 1 : -1)); }
        else if (!tieneCuentas(ss)) stPoner(ss, (ss.stock === null ? 0 : ss.stock) + (a === "stMas" ? 1 : -1));
        break;
      case "stCta": case "stCtaVer": S.cta = t.getAttribute("data-v") || ""; S.sub = "inv"; S.filtro = "all"; adm.msg = ""; pintarStock(); break;
      case "ctaNueva": S.ctaForm = { nueva: true, nick: "", perfil: "", desc: "" }; adm.msg = ""; pintarStock(); var cn = admEl.querySelector('[data-cf="nick"]'); if (cn) cn.focus(); break;
      case "ctaEditar": var ce = cuentaPorId(t.getAttribute("data-v")); if (ce) { S.ctaForm = { nueva: false, id: ce.id, nick: ce.nick, perfil: ce.perfil, desc: ce.desc }; adm.msg = ""; pintarStock(); } break;
      case "ctaCancelar": S.ctaForm = null; pintarStock(); break;
      case "ctaGuardar": ctaGuardar(); break;
      case "ctaSugerir":
        var cf = ctaLeer(), di = admEl.querySelector('[data-cf="desc"]'), nk = String(cf.nick || "").trim() || "esta cuenta";
        cf.fr = ((cf.fr === undefined ? -1 : cf.fr) + 1) % FRASES.length; if (di) di.value = FRASES[cf.fr].replace("{nick}", nk); ctaPrevia(); break;
      case "ctaBorrar": S.ctaBorrar = t.getAttribute("data-v"); pintarStock(); break;
      case "ctaBorrarSi": ctaBorrar(t.getAttribute("data-v")); break;
      case "ctaSubir":
        var ci = cat.cuentas.map(function (x) { return x.id; }).indexOf(t.getAttribute("data-v"));
        if (ci > 0) { var cop = cat.cuentas.slice(); cat.cuentas.splice(ci - 1, 0, cat.cuentas.splice(ci, 1)[0]); guardarCat("✔ Orden de las cuentas guardado (así salen en la página).").catch(function () { cat.cuentas = cop; pintarAdmin(); }); }
        break;
      case "stRecargar": P.cargado = false; P.err = ""; cargarPed(); break;
      // pedidos
      case "pRecargar": P.cargado = false; P.err = ""; adm.msg = ""; cargarPed(); cargarCat(true); break;
      case "pSub": P.sub = t.getAttribute("data-v"); P.q = ""; adm.msg = ""; pintarPed(); break;
      case "pFiltro": P.filtro = t.getAttribute("data-f"); pintarListaPed(); break;
      case "pAbrir": if (o) { P.abiertos[o._id] = !P.abiertos[o._id]; if (P.tel === o._id) P.tel = null; if (P.editPed === o._id) P.editPed = null; pintarListaPed(); } break;
      case "pReservar": if (o) reservar(o); break;
      case "pEditar": if (o) { P.editPed = o._id; P.tel = null; pintarListaPed(); } break;
      case "oeCancelar": P.editPed = null; pintarListaPed(); break;
      case "oeGuardar": if (o) oeGuardar(o, card); break;
      case "oeRecalc":
        if (o) { var vj = o.items || [], tr = pkLineas(card.querySelector(".sc-pick")).reduce(function (tt, l) { var era = vj.filter(function (v) { return String(v.id) === l.id; })[0]; return tt + (era ? Number(era.price) || 0 : l.price) * l.qty; }, 0); card.querySelector('[data-f="total"]').value = r2(tr); }
        break;
      case "pAvisar": if (o) { var tl = telDe(o); if (tl) window.open(waEnlace(tl, msgEntrega(o)), "_blank", "noopener"); else { P.tel = o._id; pintarListaPed(); var ti0 = admEl.querySelector(".sc-telin"); if (ti0) ti0.focus(); } } break;
      case "pBorrar": if (o) borrarPed(o); break;
      case "telEditar": if (o) { P.tel = o._id; pintarListaPed(); var ti = admEl.querySelector(".sc-telin"); if (ti) ti.focus(); } break;
      case "telCancelar": P.tel = null; pintarListaPed(); break;
      case "telGuardar": if (o) guardarTel(o); break;
      case "frHoy": cambiarAmistad(clave, hoyIso()); break;
      case "frMes": cambiarAmistad(clave, isoMas(hoyIso(), -ESPERA)); break;
      case "frMover": if (fr) moverAmistad(fr, Number(t.getAttribute("data-d"))); break;
      case "frBorrar": if (window.confirm("¿Borrar la fecha de amistad de este cliente?")) cambiarAmistad(clave, ""); break;
      // clientes
      case "cAbrir": if (ckey) { P.abiertos["c:" + ckey] = !P.abiertos["c:" + ckey]; if (!P.abiertos["c:" + ckey]) { if (P.edit === ckey) P.edit = null; if (P.comprando === ckey) P.comprando = null; } pintarListaPed(); } break;
      case "cEditar": P.edit = ckey; P.comprando = null; pintarListaPed(); break;
      case "cCancelar": P.edit = null; pintarListaPed(); break;
      case "cGuardar": cliGuardar(ckey, card); break;
      case "cBorrar": cliBorrar(ckey, card); break;
      case "cComprar": P.comprando = ckey; P.edit = null; pintarListaPed(); break;
      case "cCompraCancelar": P.comprando = null; pintarListaPed(); break;
      case "cCompraGuardar": cliCompra(ckey, card); break;
      case "cNuevo": P.creando = true; pintarListaPed(); var nn = admEl.querySelector('.sc-cnuevo [data-f="name"]'); if (nn) nn.focus(); break;
      case "cNuevoCancelar": P.creando = false; pintarListaPed(); break;
      case "cNuevoGuardar": cliCrear(t.closest(".sc-cnuevo")); break;
      case "ncMes": t.closest(".sc-cnuevo").querySelector('[data-f="since"]').value = isoMas(hoyIso(), -ESPERA); break;
      // selector de sets
      case "pkAgregar": case "pkElegir": case "pkMas": case "pkMenos": case "pkQuitar":
        if (pk) pkAccion(pk, a, a === "pkElegir" ? id : a === "pkAgregar" ? null : Number(t.getAttribute("data-i"))); break;
      // pedido manual
      case "manAbrir": manAbrir(); break;
      case "manCerrar": manCerrar(); break;
      case "manModo": if (manEl) manModo(t.getAttribute("data-m")); break;
      case "manHoy": manEl.querySelector('[data-f="since"]').value = hoyIso(); manVista(manEl); break;
      case "manMes": manEl.querySelector('[data-f="since"]').value = isoMas(hoyIso(), -ESPERA); manVista(manEl); break;
      case "manGuardar": manGuardar(); break;
    }
  });
  // cierra la lista del buscador de sets al tocar fuera
  document.addEventListener("click", function (ev) {
    document.querySelectorAll(".sc-pick-res:not([hidden])").forEach(function (r) { if (!r.parentNode.contains(ev.target)) r.hidden = true; });
  });
  document.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el.classList.contains("sc-q")) { cli.q = el.value; pintarGrid(); }
    else if (el.classList.contains("sc-aq")) { adm.q = el.value; var b = admEl.querySelector(".sc-alist"); if (b) { b.innerHTML = listaAdmHtml(); R().hidratar(); } }
    else if (el.classList.contains("sc-pq")) { P.q = el.value; pintarListaPed(); var nq = admEl.querySelector(".sc-pq"); if (nq && document.activeElement !== nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } }
    else if (el.classList.contains("sc-sq")) { S.q = el.value; var sl = admEl.querySelector(".sc-slist"); if (sl) { sl.innerHTML = stListaHtml(); R().hidratar(); } }
    else if (el.getAttribute("data-p") === "q") { var pb = el.closest(".sc-pick"); pb.setAttribute("data-hi", 0); pkResultados(pb); }
    else if (el.closest && el.closest(".sc-srow") && el.tagName === "INPUT") {
      var fila = el.closest(".sc-srow"), s = setPorId(fila.getAttribute("data-id")), v = el.value.trim(), n = parseInt(v, 10), c = fila.getAttribute("data-c");
      if (s && c) stPonerCta(s, c, v === "" || isNaN(n) ? null : n);
      else if (s && !tieneCuentas(s)) stPoner(s, v === "" || isNaN(n) ? null : n);
    }
    else if (el.hasAttribute && el.hasAttribute("data-cf")) ctaPrevia();
    else if (el.hasAttribute && el.hasAttribute("data-fc")) {   // editor del set: el total es la suma de las cuentas
      var tot = 0, hay = false, sf = admEl.querySelector('[data-f="stock"]');
      admEl.querySelectorAll("[data-fc]").forEach(function (x) { var nn = parseInt(x.value, 10); if (x.value.trim() !== "" && !isNaN(nn)) { hay = true; tot += nn; } });
      if (sf) { if (hay) { sf.value = tot; sf.readOnly = true; } else sf.readOnly = false; }
    }
  });
  document.addEventListener("focusin", function (ev) { var el = ev.target; if (el.getAttribute && el.getAttribute("data-p") === "q") pkResultados(el.closest(".sc-pick")); });
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.classList.contains("sc-vis")) {
      var antes = cat.visible; cat.visible = el.checked;
      guardarCat(cat.visible ? "✔ Sets Caché visible para los clientes." : "Sets Caché oculta: solo tú la ves.").then(function () { R().render(); }).catch(function () { cat.visible = antes; pintarAdmin(); });
    } else if (el.classList.contains("sc-ffile")) { if (el.files && el.files[0]) subirFoto(el.files[0]); el.value = ""; }
    else if (el.classList.contains("sc-est")) { var c = el.closest(".sc-ocard"), o = c && pedPorId(c.getAttribute("data-id")); if (o && el.value !== o.status) setEstado(o, el.value, el); }
    else if (el.classList.contains("sc-frd")) { var fr = el.closest(".sc-fr"); if (fr) cambiarAmistad(fr.getAttribute("data-key"), el.value); }
    else if (el.classList.contains("sc-psort")) { P.orden = el.value; pintarListaPed(); }
    else if (el.classList.contains("sc-srar")) { S.rar = el.value; pintarStock(); }
    else if (el.classList.contains("sc-sfil")) { S.filtro = el.value; pintarStock(); }
    else if (el.classList.contains("sc-sdias")) { S.dias = el.value; pintarStock(); }
    else if (manEl && manEl.contains(el)) { if (el.getAttribute("data-f") === "cli") manCliente(); else manVista(manEl); }
  });
  document.addEventListener("keydown", function (ev) {
    var el = ev.target;
    if (el && el.getAttribute && el.getAttribute("data-p") === "q") {
      var pb = el.closest(".sc-pick"), res = pb.querySelector(".sc-pick-res"), n = res.querySelectorAll(".sc-pick-o").length, hi = Number(pb.getAttribute("data-hi") || 0);
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); if (n) { pb.setAttribute("data-hi", (hi + (ev.key === "ArrowDown" ? 1 : n - 1)) % n); pkResultados(pb); } return; }
      if (ev.key === "Enter") { ev.preventDefault(); pkAccion(pb, "pkAgregar"); return; }
      if (ev.key === "Escape") { pkCerrar(pb); return; }
    }
    if ((ev.key === "Enter" || ev.key === " ") && el && el.classList && el.classList.contains("sc-cta") && el.getAttribute("data-s") === "cta") { ev.preventDefault(); el.click(); return; }
    if (ev.key === "Escape" && mod && mod.tipo !== "cargando") cerrarMod();
  });

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
    _probar: { totales: totales, plan: plan, cat: cat, P: P, ajustarSet: ajustarSet, perfilOk: perfilOk }
  };
})();
