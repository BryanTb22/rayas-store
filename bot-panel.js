/* =====================================================================
   Panel del Bot de Steam (Rayas Store + LitleJacob Store)
   Se usa desde el Panel admin de las dos webs: BotPanel.html({ token, projectId, repintar, acento })
   Lee (Firestore REST):
     bot_estado/steam       latido: en línea, cuenta, saldo, ofertas activas, pausa…
     bot_estado/inventario  inventario agrupado del bot
     bot_estado/comando     último comando y su resultado
     bot_log                registro de lo que hace el bot
     orders (bot.estado)    envíos en curso
     rayas_items            catálogo (para marcar qué está publicado)
   Escribe solo bot_estado/comando (pausar, reanudar, inventario, reconectar).
   ===================================================================== */
(function () {
  "use strict";
  if (window.BotPanel) return;

  var cfg = null, cargando = false, timer = null;
  var st = { steam: null, inv: null, cmd: null, log: [], envios: [], catalogo: null, error: "", busca: "", verInv: "todos", ultima: 0, enviando: "" };
  var MONEDA = { 1: "US$", 26: "S/", 3: "€", 7: "R$", 34: "ARS$", 25: "CLP$", 27: "COP$", 19: "MX$" };
  var EST = { aprobado: "⏳ En cola", enviando: "📤 Enviando", enviada: "📨 Oferta enviada", aceptada: "✅ Aceptada", fallida: "✖ Falló", retenida: "⏸ Retenida", cancelar: "🚫 Cancelando", cancelada: "🚫 Cancelada" };
  var LOG_ICO = { ok: "✅", error: "⚠️", aviso: "🔔", info: "•" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim().toLowerCase(); }
  function hace(ms) {
    if (!ms) return "nunca";
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return "hace " + Math.max(s, 1) + " s"; if (s < 3600) return "hace " + Math.round(s / 60) + " min";
    if (s < 86400) return "hace " + Math.round(s / 3600) + " h"; return "hace " + Math.round(s / 86400) + " d";
  }
  function hora(ms) { try { return new Date(ms).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  function imgOk(u) { return /^https:\/\/[a-z0-9.-]+\.(steamstatic\.com|akamaihd\.net|steamcommunity\.com)\/[^\s"'<>]{1,400}$/i.test(String(u || "")); }
  function colorOk(c) { return /^#[0-9a-f]{3,6}$/i.test(String(c || "")) ? c : ""; }

  /* ---------- Firestore REST ---------- */
  function val(v) {
    if (!v) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("booleanValue" in v) return v.booleanValue;
    if ("timestampValue" in v) return new Date(v.timestampValue).getTime();
    if ("nullValue" in v) return null;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(val);
    if ("mapValue" in v) return campos(v.mapValue.fields);
    return null;
  }
  function campos(f) { var o = {}; for (var k in (f || {})) o[k] = val(f[k]); return o; }
  function base() { return "https://firestore.googleapis.com/v1/projects/" + cfg.projectId + "/databases/(default)/documents"; }
  function pedir(url, opts) {
    return cfg.token().then(function (tk) {
      opts = opts || {}; opts.headers = { "Content-Type": "application/json", "Authorization": "Bearer " + tk };
      return fetch(url, opts);
    });
  }
  function leerDoc(ruta) {
    return pedir(base() + "/" + ruta).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(r.status === 403 ? "Firebase no deja leer " + ruta + " (revisa las reglas)." : "Error " + r.status);
      return r.json().then(function (j) { return campos(j.fields); });
    });
  }
  function consulta(q) {
    return pedir(base() + ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: q }) }).then(function (r) {
      if (!r.ok) throw new Error("Error " + r.status);
      return r.json();
    }).then(function (j) { return (j || []).filter(function (x) { return x.document; }).map(function (x) { var o = campos(x.document.fields); o._id = x.document.name.split("/").pop(); return o; }); });
  }

  function cargar(forzarCatalogo) {
    if (cargando || !cfg) return; cargando = true;
    var tareas = [
      leerDoc("bot_estado/steam").then(function (d) { st.steam = d; }),
      leerDoc("bot_estado/inventario").then(function (d) { st.inv = d; }),
      leerDoc("bot_estado/comando").then(function (d) { st.cmd = d; }),
      consulta({ from: [{ collectionId: "bot_log" }], orderBy: [{ field: { fieldPath: "t" }, direction: "DESCENDING" }], limit: 40 }).then(function (d) { st.log = d; }).catch(function () { st.log = []; }),
      consulta({ from: [{ collectionId: "orders" }], where: { fieldFilter: { field: { fieldPath: "bot.estado" }, op: "IN", value: { arrayValue: { values: ["aprobado", "enviando", "enviada", "cancelar", "retenida", "fallida"].map(function (s) { return { stringValue: s }; }) } } } }, limit: 60 })
        .then(function (d) { st.envios = d.sort(function (a, b) { return ((b.bot && b.bot.actualizado) || 0) - ((a.bot && a.bot.actualizado) || 0); }); }).catch(function () { st.envios = []; })
    ];
    if (!st.catalogo || forzarCatalogo) tareas.push(pedir(base() + "/rayas_items?pageSize=300").then(function (r) { return r.ok ? r.json() : { documents: [] }; }).then(function (j) {
      var m = {}; (j.documents || []).forEach(function (d) { var f = campos(d.fields); if (f.nombre) m[norm(f.nombre)] = { stock: Number(f.stock) || 0, activo: f.activo !== false, precio: f.precio }; });
      st.catalogo = m;
    }).catch(function () { st.catalogo = st.catalogo || {}; }));
    Promise.all(tareas).then(function () { st.error = ""; }).catch(function (e) { st.error = e.message; })
      .then(function () { cargando = false; st.ultima = Date.now(); repintar(); programar(); });
  }
  function programar() {
    clearTimeout(timer);
    timer = setTimeout(function () { if (document.getElementById("bp-root")) cargar(); }, 20000);
  }
  function repintar() { if (cfg && cfg.repintar && document.getElementById("bp-root")) cfg.repintar(); }

  function comando(accion) {
    st.enviando = accion; repintar();
    pedir(base() + "/bot_estado/comando", { method: "PATCH", body: JSON.stringify({ fields: { accion: { stringValue: accion }, id: { stringValue: String(Date.now()) }, pedidoEn: { timestampValue: new Date().toISOString() } } }) })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Firebase no deja enviar comandos (revisa las reglas)." : "Error " + r.status); })
      .then(function () { setTimeout(function () { st.enviando = ""; cargar(); }, 4000); })
      .catch(function (e) { st.enviando = ""; st.error = e.message; repintar(); });
  }

  /* ---------- vista ---------- */
  function estadoBot() {
    var s = st.steam;
    if (!s) return { clase: "off", txt: "Nunca se ha conectado", det: "Todavía no hay señales del bot." };
    var vivo = s.enLinea && Date.now() - (s.ultimaVez || 0) < 3 * 60000;
    if (!vivo) return { clase: "off", txt: "Apagado o sin conexión", det: "Última señal " + hace(s.ultimaVez) + "." };
    if (s.pausado) return { clase: "pausa", txt: "En línea · envíos en pausa", det: "Última señal " + hace(s.ultimaVez) + "." };
    return { clase: "on", txt: "En línea", det: "Última señal " + hace(s.ultimaVez) + "." };
  }
  function cabecera() {
    var s = st.steam || {}, e = estadoBot();
    var mon = MONEDA[s.moneda] || "", saldo = typeof s.saldo === "number" ? (mon ? mon + " " : "") + s.saldo.toFixed(2) : "—";
    var perfil = /^\d{17}$/.test(String(s.steamId || "")) ? "https://steamcommunity.com/profiles/" + s.steamId : "";
    var chips = [
      '<span class="bp-chip">👤 ' + esc(s.cuenta || "—") + '</span>',
      s.limitada === true ? '<span class="bp-chip mal" title="Steam pide gastar el equivalente a US$5 para quitar la limitación">⚠ Cuenta limitada</span>' : s.limitada === false ? '<span class="bp-chip bien">✔ Cuenta sin límites</span>' : '',
      '<span class="bp-chip">💰 Cartera: ' + esc(saldo) + '</span>',
      s.version ? '<span class="bp-chip">v' + esc(s.version) + '</span>' : ''
    ].join("");
    var pausado = !!s.pausado, ocupado = st.enviando;
    var bt = function (acc, txt, extra) { return '<button type="button" class="bp-btn' + (extra || "") + '" data-bp="cmd" data-acc="' + acc + '"' + (ocupado ? " disabled" : "") + '>' + (ocupado === acc ? "⏳ " : "") + txt + '</button>'; };
    return '<div class="bp-card bp-head">' +
      '<div class="bp-estado ' + e.clase + '"><span class="bp-dot"></span><div><b>🤖 Bot de Steam: ' + esc(e.txt) + '</b><small>' + esc(e.det) + '</small></div></div>' +
      '<div class="bp-chips">' + chips + '</div>' +
      (s.aviso ? '<p class="bp-aviso">⏳ ' + esc(s.aviso) + '</p>' : '') +
      (st.error ? '<p class="bp-aviso mal">' + esc(st.error) + '</p>' : '') +
      '<div class="bp-acts">' +
        (pausado ? bt("reanudar", "▶ Reanudar envíos", " fuerte") : bt("pausar", "⏸ Pausar envíos")) +
        bt("inventario", "🔄 Actualizar inventario") + bt("reconectar", "🔌 Reconectar con Steam") +
        '<button type="button" class="bp-btn ghost" data-bp="recargar">↻ Refrescar</button>' +
        (perfil ? '<a class="bp-btn ghost" href="' + esc(perfil) + '/inventory/#570" target="_blank" rel="noopener">Ver en Steam ↗</a>' : '') +
      '</div>' +
      (st.cmd && st.cmd.resultado ? '<p class="bp-sub">Último comando: ' + esc(st.cmd.resultado) + (st.cmd.hecho ? ' · ' + esc(hace(st.cmd.hecho)) : '') + '</p>' : '') +
      '<p class="bp-sub">Pausar solo detiene los envíos nuevos; lo aprobado queda en cola y sale al reanudar.</p>' +
      '</div>';
  }
  function numeros() {
    var s = st.steam || {}, inv = st.inv || {};
    var cola = st.envios.filter(function (p) { return p.bot && (p.bot.estado === "aprobado" || p.bot.estado === "enviando"); }).length;
    var esperando = st.envios.filter(function (p) { return p.bot && p.bot.estado === "enviada"; }).length;
    var fallidas = st.envios.filter(function (p) { return p.bot && p.bot.estado === "fallida" && p.status === "pagado"; }).length;
    var box = function (n, t, cl) { return '<div class="bp-num' + (cl || "") + '"><b>' + n + '</b><span>' + t + '</span></div>'; };
    return '<div class="bp-nums">' + box(typeof inv.total === "number" ? inv.total : (s.items >= 0 ? s.items : "—"), "items en el bot") +
      box(cola, "en cola") + box(esperando, "esperando al cliente") + box((s.ofertas || []).length, "ofertas activas en Steam") +
      box(fallidas, "fallidas por revisar", fallidas ? " mal" : "") + '</div>';
  }
  function envios() {
    var l = st.envios;
    return '<div class="bp-card"><h3>📦 Envíos del bot</h3>' + (l.length ? '<div class="bp-lista">' + l.map(function (p) {
      var b = p.bot || {}, tienda = p.tienda === "litlejacob" ? "LitleJacob" : p.tienda === "rayas" ? "Rayas" : "";
      var items = (p.items || []).map(function (i) { return (i.qty > 1 ? i.qty + "× " : "") + i.name; }).join(", ");
      return '<div class="bp-fila"><div class="bp-fila-a"><b>' + esc(p.code || p._id) + '</b> · ' + esc(p.customerName || "Cliente") + (tienda ? ' <span class="bp-tag">' + tienda + '</span>' : '') +
        '<small>' + esc(items) + '</small>' + (b.motivo ? '<small class="bp-mot">' + esc(b.motivo) + '</small>' : '') + '</div>' +
        '<div class="bp-fila-b"><span class="bp-est e-' + esc(b.estado) + '">' + esc(EST[b.estado] || b.estado) + '</span>' + (b.actualizado ? '<small>' + esc(hace(b.actualizado)) + '</small>' : '') + '</div></div>';
    }).join("") + '</div>' : '<p class="bp-sub">No hay envíos en curso. Se aprueban desde <b>Pedidos</b> con el botón 🤖 Enviar con el bot.</p>') + '</div>';
  }
  function ofertas() {
    var o = (st.steam && st.steam.ofertas) || [];
    if (!o.length) return "";
    return '<div class="bp-card"><h3>📨 Ofertas abiertas en Steam</h3><div class="bp-lista">' + o.map(function (x) {
      return '<div class="bp-fila"><div class="bp-fila-a"><b>#' + esc(x.id) + '</b>' + (x.code ? ' · pedido ' + esc(x.code) : ' · <span class="bp-tag">manual</span>') +
        '<small>' + esc(x.items || "") + '</small></div><div class="bp-fila-b"><span class="bp-est">' + (x.da ? "da " + x.da : "") + (x.da && x.recibe ? " · " : "") + (x.recibe ? "recibe " + x.recibe : "") + '</span>' +
        (x.creada ? '<small>' + esc(hace(new Date(x.creada).getTime())) + '</small>' : '') + '</div></div>';
    }).join("") + '</div></div>';
  }
  function inventario() {
    var inv = st.inv, items = (inv && inv.items) || [], cat = st.catalogo || {};
    var conCat = function (g) { return cat[norm(g.nombre)]; };
    var nPub = items.filter(conCat).length, nNo = items.length - nPub;
    var filtro = st.verInv, q = norm(st.busca);
    var lista = items.filter(function (g) {
      if (filtro === "pub" && !conCat(g)) return false;
      if (filtro === "nopub" && conCat(g)) return false;
      return !q || norm(g.nombre).indexOf(q) >= 0;
    });
    var chip = function (k, t) { return '<button type="button" class="bp-filtro" data-bp="verInv" data-v="' + k + '" aria-pressed="' + (filtro === k) + '">' + t + '</button>'; };
    return '<div class="bp-card"><h3>🎒 Inventario del bot</h3>' +
      (inv ? '<p class="bp-sub">' + (inv.total || 0) + ' items tradeables (' + items.length + ' distintos) · actualizado ' + esc(hace(inv.actualizado)) + '</p>' : '<p class="bp-sub">El bot todavía no publicó su inventario. Toca 🔄 Actualizar inventario.</p>') +
      (items.length ? '<div class="bp-invbar"><input type="search" id="bp-busca" class="bp-input" placeholder="Buscar item…" value="' + esc(st.busca) + '" autocomplete="off">' +
        '<div class="bp-filtros">' + chip("todos", "Todos (" + items.length + ")") + chip("pub", "En catálogo (" + nPub + ")") + chip("nopub", "Sin publicar (" + nNo + ")") + '</div></div>' +
        '<div class="bp-grid">' + lista.map(function (g) {
          var c = conCat(g), color = colorOk(g.color);
          return '<div class="bp-item" data-n="' + esc(norm(g.nombre)) + '">' +
            (imgOk(g.icono) ? '<img src="' + esc(g.icono) + '" alt="" loading="lazy">' : '<div class="bp-noimg">🎁</div>') +
            '<div class="bp-item-t"><b' + (color ? ' style="color:' + color + '"' : '') + '>' + esc(g.nombre) + '</b>' +
            '<small>×' + g.cantidad + (g.rareza ? ' · ' + esc(g.rareza) : '') + '</small>' +
            (c ? '<span class="bp-tag ok">En catálogo · stock ' + c.stock + (c.activo ? '' : ' · oculto') + '</span>' : '<span class="bp-tag no">Sin publicar</span>') + '</div></div>';
        }).join("") + (lista.length ? '' : '<p class="bp-sub">Nada coincide con la búsqueda.</p>') + '</div>' : '') +
      '<p class="bp-sub">Para darle stock al bot: desde tu cuenta principal mándale una oferta a <b>' + esc((st.steam && st.steam.cuenta) || "la cuenta del bot") + '</b>, acéptala entrando al bot en el navegador y confírmala en Steam Desktop Authenticator. El nombre del item en el catálogo debe ser igual al de Steam.</p>' +
      '</div>';
  }
  function registro() {
    var l = st.log;
    return '<div class="bp-card"><h3>📝 Lo que hizo el bot</h3>' + (l.length ? '<ul class="bp-log">' + l.map(function (x) {
      return '<li class="t-' + esc(x.tipo) + '"><span>' + (LOG_ICO[x.tipo] || "•") + '</span><div>' + esc(x.texto) + '<small>' + esc(hora(x.t)) + '</small></div></li>';
    }).join("") + '</ul>' : '<p class="bp-sub">Sin registros todavía.</p>') + '</div>';
  }

  var CSS = '.bp{--bpA:var(--bp-acento,#e0313b);display:grid;gap:14px;font-size:14px}' +
    '.bp-card{border:1px solid rgba(127,127,127,.25);border-radius:14px;padding:14px 16px;background:rgba(127,127,127,.06)}' +
    '.bp-card h3{margin:0 0 10px;font-size:15px;letter-spacing:.02em}' +
    '.bp-estado{display:flex;gap:12px;align-items:center}.bp-estado b{display:block;font-size:16px}.bp-estado small{opacity:.75}' +
    '.bp-dot{width:14px;height:14px;border-radius:50%;flex:none;background:#8a8a8a;box-shadow:0 0 0 4px rgba(138,138,138,.2)}' +
    '.bp-estado.on .bp-dot{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.22)}.bp-estado.pausa .bp-dot{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.22)}.bp-estado.off .bp-dot{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.2)}' +
    '.bp-chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}.bp-chip,.bp-tag{display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;border:1px solid rgba(127,127,127,.3)}' +
    '.bp-chip.mal,.bp-tag.no{border-color:rgba(239,68,68,.5);color:#f87171}.bp-chip.bien,.bp-tag.ok{border-color:rgba(34,197,94,.5);color:#4ade80}' +
    '.bp-aviso{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:rgba(245,158,11,.12);font-size:13px}.bp-aviso.mal{background:rgba(239,68,68,.14)}' +
    '.bp-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.bp-btn{font:inherit;font-size:13px;font-weight:600;padding:8px 12px;border-radius:10px;border:1px solid var(--bpA);background:transparent;color:inherit;cursor:pointer;text-decoration:none}' +
    '.bp-btn.fuerte{background:var(--bpA);color:#fff}.bp-btn.ghost{border-color:rgba(127,127,127,.35)}.bp-btn:disabled{opacity:.5;cursor:wait}.bp-btn:hover:not(:disabled){filter:brightness(1.15)}' +
    '.bp-sub{margin:8px 0 0;font-size:12.5px;opacity:.72}' +
    '.bp-nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}.bp-num{border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:10px;text-align:center}.bp-num b{display:block;font-size:22px}.bp-num span{font-size:12px;opacity:.75}.bp-num.mal b{color:#f87171}' +
    '.bp-lista{display:grid;gap:6px}.bp-fila{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border-radius:10px;background:rgba(127,127,127,.07)}.bp-fila small{display:block;opacity:.72;font-size:12px;margin-top:2px}.bp-fila .bp-mot{opacity:.9}.bp-fila-b{text-align:right;flex:none}' +
    '.bp-est{font-size:12px;font-weight:600;white-space:nowrap}.bp-est.e-fallida{color:#f87171}.bp-est.e-aceptada{color:#4ade80}.bp-est.e-enviada{color:#60a5fa}' +
    '.bp-invbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.bp-input{flex:1 1 180px;font:inherit;padding:8px 10px;border-radius:10px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit}' +
    '.bp-filtros{display:flex;gap:6px;flex-wrap:wrap}.bp-filtro{font:inherit;font-size:12px;padding:5px 10px;border-radius:999px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer}.bp-filtro[aria-pressed="true"]{background:var(--bpA);border-color:var(--bpA);color:#fff}' +
    '.bp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.bp-item{display:flex;gap:8px;padding:8px;border-radius:10px;background:rgba(127,127,127,.07);align-items:flex-start}' +
    '.bp-item img,.bp-noimg{width:48px;height:48px;border-radius:8px;object-fit:contain;flex:none;background:rgba(0,0,0,.25);display:grid;place-items:center}.bp-item-t{min-width:0}.bp-item-t b{display:block;font-size:12.5px;line-height:1.25;word-break:break-word}.bp-item-t small{display:block;font-size:11.5px;opacity:.75;margin:2px 0 4px}.bp-item .bp-tag{font-size:10.5px;padding:2px 7px}' +
    '.bp-log{list-style:none;margin:0;padding:0;display:grid;gap:6px;max-height:340px;overflow:auto}.bp-log li{display:flex;gap:8px;font-size:13px}.bp-log small{display:block;opacity:.6;font-size:11.5px}.bp-log .t-error{color:#fca5a5}' +
    '@media(max-width:520px){.bp-fila{flex-direction:column}.bp-fila-b{text-align:left}}';
  function estilos() {
    if (document.getElementById("bp-css")) return;
    var s = document.createElement("style"); s.id = "bp-css"; s.textContent = CSS; document.head.appendChild(s);
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-bp]"); if (!t || !document.getElementById("bp-root")) return;
    var a = t.getAttribute("data-bp");
    if (a === "cmd") {
      var acc = t.getAttribute("data-acc");
      if (acc === "reconectar" && !confirmar("¿Reconectar el bot con Steam? Tarda unos segundos y no afecta a las ofertas ya enviadas.")) return;
      comando(acc);
    } else if (a === "recargar") { cargar(true); }
    else if (a === "verInv") { st.verInv = t.getAttribute("data-v"); repintar(); }
  });
  function confirmar(m) { try { return window.confirm(m); } catch (e) { return true; } }
  document.addEventListener("input", function (ev) {
    if (ev.target && ev.target.id === "bp-busca") {
      st.busca = ev.target.value; var q = norm(st.busca);
      var cards = document.querySelectorAll("#bp-root .bp-item");
      for (var i = 0; i < cards.length; i++) cards[i].style.display = !q || cards[i].getAttribute("data-n").indexOf(q) >= 0 ? "" : "none";
    }
  });

  window.BotPanel = {
    html: function (c) {
      cfg = c; estilos();
      if (!st.ultima && !cargando) setTimeout(cargar, 0);
      else if (Date.now() - st.ultima > 20000) setTimeout(cargar, 0);
      if (!st.ultima) return '<div class="bp" id="bp-root"' + (c.acento ? ' style="--bp-acento:' + esc(c.acento) + '"' : '') + '><div class="bp-card">🤖 Cargando el estado del bot…</div></div>';
      return '<div class="bp" id="bp-root"' + (c.acento ? ' style="--bp-acento:' + esc(c.acento) + '"' : '') + '>' + cabecera() + numeros() + envios() + ofertas() + inventario() + registro() + '</div>';
    },
    recargar: function () { cargar(true); }
  };
})();
