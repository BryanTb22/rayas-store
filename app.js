(function () {
  "use strict";

  /* ================= Firebase (mismo proyecto que LitleJacob Store) ================= */
  var FB = { apiKey: "AIzaSyDbyLi7IK3ikwUp7A0VzRRqPucqRXPpL3E", projectId: "litlejacob-store" };
  var DOC_URL = "https://firestore.googleapis.com/v1/projects/" + FB.projectId + "/databases/(default)/documents/rayas/estado";
  var SES_KEY = "rayas_admin_ses";
  var ADMIN_UID = "eLEZkdXiG5b0PpxHQCCei8D0Qxy1";
  var BASE = "https://firestore.googleapis.com/v1/projects/" + FB.projectId + "/databases/(default)/documents/";

  function leerSesion() { try { return JSON.parse(localStorage.getItem(SES_KEY) || "null"); } catch (e) { return null; } }
  function guardarSesion(s) { try { if (s) localStorage.setItem(SES_KEY, JSON.stringify(s)); else localStorage.removeItem(SES_KEY); } catch (e) { /* sin almacenamiento */ } }

  function login(email, pass) {
    return fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(FB.apiKey), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: pass, returnSecureToken: true })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.idToken) throw new Error((j.error && j.error.message) || "LOGIN_FAILED");
      var s = { id: j.idToken, ref: j.refreshToken, exp: Date.now() + (Number(j.expiresIn) || 3600) * 1000 - 60000, email: j.email, uid: j.localId };
      guardarSesion(s); return s;
    });
  }
  function registrar(email, pass) {
    return fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + encodeURIComponent(FB.apiKey), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: pass, returnSecureToken: true })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.idToken) throw new Error((j.error && j.error.message) || "SIGNUP_FAILED");
      var s = { id: j.idToken, ref: j.refreshToken, exp: Date.now() + (Number(j.expiresIn) || 3600) * 1000 - 60000, email: j.email, uid: j.localId };
      guardarSesion(s); return s;
    });
  }
  function crearPerfil(ses, d) {
    return fsPedir("rayas_users/" + encodeURIComponent(ses.uid) + "?currentDocument.exists=false", {
      method: "PATCH",
      body: JSON.stringify({ fields: {
        nombre: { stringValue: d.nombre }, whatsapp: { stringValue: d.whatsapp },
        email: { stringValue: d.email }, tradelink: { stringValue: d.tradelink }, creditos: { integerValue: "0" }, creado: { timestampValue: new Date().toISOString() }
      } })
    }).then(function (r) { if (!r.ok) throw new Error("PERFIL_" + r.status); });
  }
  function uidSesion() {
    var s = leerSesion();
    if (!s) return null;
    if (s.uid) return s.uid;
    try { var p = JSON.parse(atob(s.id.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return p.user_id || p.sub || null; } catch (e) { return null; }
  }
  // Link de intercambio de Steam: https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc
  function tradeValido(u) { return /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[\w-]+$/.test(String(u || "").trim()); }
  var TRADE_AYUDA = '<a href="https://steamcommunity.com/my/tradeoffers/privacy#trade_offer_access_url" target="_blank" rel="noopener">¿Dónde encuentro mi link?</a>';
  function esAdmin() { return uidSesion() === ADMIN_UID; }

  // Firestore REST con la sesión actual.
  function fsPedir(ruta, opts) {
    return token().then(function (tk) {
      opts = opts || {};
      opts.headers = Object.assign({ "Content-Type": "application/json", "Authorization": "Bearer " + tk }, opts.headers || {});
      return fetch(BASE + ruta, opts);
    });
  }
  function leerPerfilDoc(d) {
    var f = (d && d.fields) || {};
    var sv = function (k) { return f[k] && f[k].stringValue || ""; };
    return {
      uid: d && d.name ? d.name.split("/").pop() : "",
      nombre: sv("nombre"), steam: sv("steam"), whatsapp: sv("whatsapp"), email: sv("email"), tradelink: sv("tradelink"),
      creditos: f.creditos ? Number(f.creditos.integerValue || f.creditos.doubleValue || 0) : 0,
      creado: f.creado && f.creado.timestampValue || ""
    };
  }
  function token() {
    var s = leerSesion();
    if (!s) return Promise.reject(new Error("NO_SESSION"));
    if (s.exp > Date.now()) return Promise.resolve(s.id);
    return fetch("https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(FB.apiKey), {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(s.ref)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.id_token) { guardarSesion(null); throw new Error("NO_SESSION"); }
      s.id = j.id_token; s.ref = j.refresh_token || s.ref; s.exp = Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60000;
      guardarSesion(s); return s.id;
    });
  }

  /* ================= Estado ================= */
  var TEXTOS_BASE = {
    titulo: "Gana items de Dota 2 gratis",
    subtitulo: "Pide tus créditos gratis al encargado, elige el premio que quieres y entra a la rifa. Sin pagar nada.",
    logo1: "RAYAS", logo2: "STORE",
    kicker: "Rifas de Dota 2",
    btnVer: "Ver rifas", btnCreditos: "Pedir créditos gratis",
    badge1: "Créditos gratis", badge2: "Ganador al azar", badge3: "Entrega por Steam",
    rifasKicker: "Premios en juego", rifasT1: "Rifas", rifasT2: "activas", rifasSub: "Cada premio indica cuántos créditos cuesta entrar.",
    vacioT: "Pronto nuevas rifas", vacioS: "Pide tus créditos y te avisamos cuando abra la próxima.",
    msgCredPerfil: "¡Hola! 👋🔥 Soy *{nombre}* (📧 {correo}).\n\n💎 Quiero recargar créditos para participar en las rifas de *RAYAS STORE* 🎁🏆\n\n¿Me ayudas con mi recarga? 🙏✨",
    msgCredVisita: "¡Hola! 👋🔥 Quiero mis créditos para las rifas de *RAYAS STORE* 💎🎁\n\n¿Me ayudas? 🙏✨",
    btnParticipar: "Participar", btnPronto: "Muy pronto", lblCreditos: "créditos",
    comoKicker: "Paso a paso", comoT1: "Cómo", comoT2: "participar",
    paso1T: "Escríbenos", paso1: "Manda un mensaje al encargado por WhatsApp con tu nombre o usuario de Steam.",
    paso2T: "Recibe créditos", paso2: "El encargado te da créditos gratis. No se compran ni tienen valor en dinero.",
    paso3T: "Entra a la rifa", paso3: "Elige el premio y usa tus créditos. Al cierre, el ganador sale al azar.",
    btnCreditos2: "Pedir mis créditos",
    ganKicker: "Salón de la fama", ganT: "Ganadores", ganVacioT: "Aún no hay ganadores", ganVacioS: "Cuando cierre la primera rifa, el ganador aparecerá aquí.",
    reglasKicker: "Juego limpio", reglasT: "Reglas",
    pie: "No afiliado a Valve. Dota 2 es una marca de Valve Corporation.",
    reglas: [
      "Los créditos son gratis. No se compran, no se venden y no tienen valor en dinero.",
      "Los créditos se entregan solo al comunicarte con el encargado de la página.",
      "El ganador se elige al azar cuando cierra la rifa y se anuncia en esta página.",
      "El item se entrega por Steam. El ganador debe tener su cuenta lista para recibir regalos.",
      "Si el ganador no responde en 48 horas, se elige a otro participante."
    ]
  };

  var CONTACTOS_BASE = [
    { id: "lj", nombre: "LitleJacob", numero: "51952997030", activo: true, foto: "" },
    { id: "ra", nombre: "Rayas", numero: "51900049694", activo: true, foto: "" }
  ];
  function normalizar(st) {
    st = st && typeof st === "object" ? st : {};
    if (typeof st.whatsapp !== "string") st.whatsapp = "";
    if (!Array.isArray(st.contactos) || !st.contactos.length) st.contactos = JSON.parse(JSON.stringify(CONTACTOS_BASE));
    st.contactos = st.contactos.slice(0, 2).map(function (c, i) {
      c = c && typeof c === "object" ? c : {};
      return { id: String(c.id || ("c" + i)), nombre: typeof c.nombre === "string" ? c.nombre : "", numero: String(c.numero || "").replace(/\D+/g, ""), activo: c.activo !== false, foto: typeof c.foto === "string" ? c.foto : "" };
    });
    if (!Array.isArray(st.premios)) st.premios = [];
    var t = st.textos && typeof st.textos === "object" ? st.textos : {};
    var nt = {};
    Object.keys(TEXTOS_BASE).forEach(function (k) {
      if (k === "reglas") return;
      nt[k] = typeof t[k] === "string" && t[k].trim() ? t[k] : TEXTOS_BASE[k];
    });
    nt.reglas = Array.isArray(t.reglas) && t.reglas.length ? t.reglas.filter(function (x) { return typeof x === "string" && x.trim(); }) : TEXTOS_BASE.reglas.slice();
    st.textos = nt;
    return st;
  }

  var publicado = normalizar(null);
  try {
    var raw = document.getElementById("estado");
    if (raw) publicado = normalizar(JSON.parse(raw.textContent || "{}"));
  } catch (e) { /* estado por defecto */ }
  var estado = clone(publicado);
  var sucio = false;

  var cuenta = { modo: null, perfil: null, msg: "", msgTipo: "" };
  var admin = { puede: esAdmin(), usuarios: null, uFiltro: "", uMsg: "", vivo: false, imgEdit: null, imgErr: "", subiendo: null, login: false, abierto: false, tab: "premios", editando: null, borrar: null, msg: "", msgTipo: "" };

  /* ================= Utilidades ================= */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function num(v, def) { var n = Number(v); return isFinite(n) && n >= 0 ? Math.floor(n) : def; }
  function soloDigitos(s) { return String(s || "").replace(/\D+/g, ""); }
  function safeImg(src) {
    src = String(src || "").trim();
    if (/^img\/[\w.\-]+$/.test(src)) return src;
    if (/^https:\/\/[^\s"'<>()]+$/.test(src)) return src;
    return "";
  }
  var RAREZAS = { "ARCANO": "#ade55c", "INMORTAL": "#e4ae39", "LEGENDARIO": "#d32ce6", "MÍTICO": "#8847ff", "RARO": "#4b69ff", "POCO COMÚN": "#5e98d9", "COMÚN": "#b0c3d9" };
  function colorRareza(r) { return RAREZAS[String(r || "").toUpperCase()] || "#ff2d8f"; }

  function contactos() { return (estado.contactos || []).filter(function (c) { return c.activo && soloDigitos(c.numero); }); }
  var MOVIL = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  /* La app de WhatsApp para Windows daña los emojis que vienen en el enlace, así que en PC se envía sin emojis. */
  function sinEmojis(t) {
    return String(t).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\( +/g, "(").replace(/[ \t]+/g, " ").replace(/^ +| +$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  function waLinkA(n, texto) {
    return "https://wa.me/" + soloDigitos(n) + "?text=" + encodeURIComponent(MOVIL ? texto : sinEmojis(texto));
  }
  function waLink(texto) { var c = contactos()[0]; return c ? waLinkA(c.numero, texto) : ""; }
  function msgCred(p) {
    var T = estado.textos;
    return p ? String(T.msgCredPerfil).replace(/\{nombre\}/g, p.nombre).replace(/\{correo\}/g, p.email) : String(T.msgCredVisita);
  }
  function creditoHref() {
    var a = contactos();
    return a.length > 1 ? "#elegir" : (a.length === 1 ? waLinkA(a[0].numero, msgCred(cuenta.perfil)) : "");
  }
  var elegirAbierto = false, modal = null, partes = {}, misParts = {};
  function cargarParts(tok) {
    var acc = {}, uid = uidSesion();
    function pag(t) {
      return fetch(BASE + "rayas_part?pageSize=300" + (t ? "&pageToken=" + encodeURIComponent(t) : "")).then(function (r) { return r.ok ? r.json() : { documents: [] }; }).then(function (j) {
        (j.documents || []).forEach(function (d) {
          var f = d.fields || {}, pid = f.premio && f.premio.stringValue;
          if (!pid) return;
          (acc[pid] = acc[pid] || []).push({ uid: f.uid && f.uid.stringValue || "", nombre: f.nombre && f.nombre.stringValue || "", costo: Number(f.costo && f.costo.integerValue || 0), creado: f.creado && f.creado.timestampValue || "", premioNombre: f.premioNombre && f.premioNombre.stringValue || "" });
        });
        return j.nextPageToken && Object.keys(acc).length < 1000 ? pag(j.nextPageToken) : null;
      });
    }
    return pag("").then(function () {
      partes = acc; misParts = {};
      Object.keys(acc).forEach(function (pid) { if (uid && acc[pid].some(function (x) { return x.uid === uid; })) misParts[pid] = true; });
      render();
    }).catch(function () { /* sin conteo */ });
  }
  function iniciarParticipar(id) {
    var k = buscarPremio(id); if (k < 0) return;
    var p = estado.premios[k], cost = num(p.creditos, 0), info = { id: p.id, nombre: p.nombre, cred: cost };
    if (admin.puede) { modal = { tipo: "error", msg: "Estás con la cuenta de administrador. Para participar entra con una cuenta de usuario." }; render(); return; }
    if (!cuenta.perfil) {
      if (leerSesion()) { modal = { tipo: "error", msg: "Estamos cargando tu cuenta. Intenta de nuevo en un momento." }; cargarPerfil(); }
      else { cuenta.modo = "registro"; cuenta.msg = "Para participar primero crea una cuenta en la página."; cuenta.msgTipo = "err"; }
      render(); return;
    }
    if (misParts[id]) { modal = { tipo: "error", msg: "Ya estás participando en esta rifa. 🍀" }; render(); return; }
    var fp = fase(p);
    if (fp === "porIniciar" || fp === "proxima") { modal = { tipo: "error", msg: "Esta rifa aún no abre" + (p.inicio ? ": empieza el " + fechaHora(p.inicio) + "." : ".") }; render(); return; }
    if (fp === "vencida" || fp === "cerrada") { modal = { tipo: "error", msg: "Esta rifa ya cerró. Espera el resultado. 🍀" }; render(); return; }
    modal = { tipo: cuenta.perfil.creditos < cost ? "sinSaldo" : "confirmar", p: info }; render();
  }
  function confirmarPart() {
    var m = modal; if (!m || !m.p || !cuenta.perfil) return;
    var p = m.p, uid = uidSesion(), base = "projects/" + FB.projectId + "/databases/(default)/documents/";
    modal = { tipo: "cargando" }; render();
    var body = { writes: [
      { update: { name: base + "rayas_part/" + p.id + "_" + uid, fields: { uid: { stringValue: uid }, nombre: { stringValue: cuenta.perfil.nombre }, premio: { stringValue: p.id }, premioNombre: { stringValue: p.nombre }, costo: { integerValue: String(p.cred) }, creado: { timestampValue: new Date().toISOString() } } }, currentDocument: { exists: false } },
      { transform: { document: base + "rayas_users/" + uid, fieldTransforms: [{ fieldPath: "creditos", increment: { integerValue: String(-p.cred) } }] } }
    ] };
    token().then(function (tk) {
      return fetch(BASE.replace(/documents\/$/, "documents:commit"), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify(body) });
    }).then(function (r) {
      if (r.status === 409) throw new Error("Ya estás participando en esta rifa.");
      if (!r.ok) throw new Error("No se pudo registrar tu participación (" + r.status + "). Si sigue pasando, avisa al encargado.");
      cuenta.perfil.creditos -= p.cred; misParts[p.id] = true;
      (partes[p.id] = partes[p.id] || []).push({ uid: uid, nombre: cuenta.perfil.nombre, costo: p.cred, creado: new Date().toISOString(), premioNombre: p.nombre });
      modal = { tipo: "ok", p: p }; render();
    }).catch(function (e) { modal = { tipo: "error", msg: (e && e.message) || "No se pudo participar." }; render(); });
  }
  function modalAviso() {
    var m = modal, c = cuenta.perfil, h = "", btns = "";
    var cerrar = '<button class="btn btn-ghost btn-sm" type="button" data-a="cerrarModal">Cerrar</button>';
    if (m.tipo === "sinSaldo") {
      var rl = creditoHref();
      h = '<h3>Créditos insuficientes 😕</h3><p class="hint">La rifa de <b>' + esc(m.p.nombre) + '</b> cuesta <b>' + m.p.cred + '</b> créditos y tú tienes <b>' + (c ? c.creditos : 0) + '</b>. Recarga créditos para poder participar.</p>';
      btns = (rl ? '<a class="btn btn-yellow" href="' + esc(rl) + '"' + (rl === "#elegir" ? ' data-a="elegir"' : ' target="_blank" rel="noopener"') + '>💎 Recargar créditos</a>' : '') + cerrar;
    } else if (m.tipo === "confirmar") {
      h = '<h3>¿Entrar a la rifa? 🎟️</h3><p class="hint">Vas a usar <b>' + m.p.cred + '</b> créditos para participar por <b>' + esc(m.p.nombre) + '</b>. Te quedarán <b>' + (c.creditos - m.p.cred) + '</b>.</p>';
      btns = '<button class="btn btn-yellow" type="button" data-a="confirmarPart">✔ Confirmar</button><button class="btn btn-ghost btn-sm" type="button" data-a="cerrarModal">Cancelar</button>';
    } else if (m.tipo === "cargando") {
      h = '<h3>Procesando…</h3><p class="hint">Un momento por favor.</p>';
    } else if (m.tipo === "ok") {
      h = '<h3>¡Ya estás participando! 🎉</h3><p class="hint">Entraste a la rifa de <b>' + esc(m.p.nombre) + '</b>. Te quedan <b>' + (c ? c.creditos : 0) + '</b> créditos. ¡Mucha suerte! 🍀🏆</p>';
      btns = cerrar;
    } else {
      h = '<h3>Ups 😕</h3><p class="hint">' + esc(m.msg || "No se pudo completar.") + '</p>';
      btns = cerrar;
    }
    return '<div class="scrim scrim-top" data-a="' + (m.tipo === "cargando" ? "" : "cerrarModal") + '"></div><div class="elegir" role="dialog" aria-label="Participar">' + h + '<div class="mbtns">' + btns + '</div></div>';
  }
  function avatar(c) {
    var im = imgTag(c.foto, c.nombre, "");
    return '<span class="avatar">' + (im || esc((c.nombre || "?").charAt(0).toUpperCase())) + '</span>';
  }
  function modalElegir() {
    return '<div class="scrim scrim-top" data-a="cerrarElegir"></div>' +
      '<div class="elegir" role="dialog" aria-label="Elegir contacto"><h3>¿Con quién quieres hablar?</h3>' +
      '<p class="hint">Elige a quién escribirle por WhatsApp para pedir tus créditos.</p>' +
      contactos().map(function (c) {
        return '<a class="contacto" href="' + esc(waLinkA(c.numero, msgCred(cuenta.perfil))) + '" target="_blank" rel="noopener">' + avatar(c) +
          '<span class="cinfo"><b>' + esc(c.nombre) + '</b><small>' + esc(waBonito(c.numero)) + '</small></span><span class="go">Escribir ›</span></a>';
      }).join("") +
      '<button class="btn btn-ghost btn-sm" type="button" data-a="cerrarElegir">Cerrar</button></div>';
  }
  function waBonito(n) {
    n = soloDigitos(n);
    if (!n) return "";
    if (n.length === 11 && n.indexOf("51") === 0) return "+51 " + n.slice(2, 5) + " " + n.slice(5, 8) + " " + n.slice(8);
    return "+" + n;
  }
  function tiempoDe(iso) { var t = iso ? new Date(iso).getTime() : 0; return isFinite(t) ? t : 0; }
  /* Estado real de una rifa abierta según su fecha de inicio y de cierre. */
  function fase(p) {
    if (p.estado === "cerrada") return "cerrada";
    if (p.estado === "proxima") return "proxima";
    var ini = tiempoDe(p.inicio), fin = tiempoDe(p.cierre), ahora = Date.now();
    if (ini && ini > ahora) return "porIniciar";
    if (fin && fin <= ahora) return "vencida";
    return "activa";
  }
  function restante(iso) {
    if (!iso) return "";
    var fin = new Date(iso).getTime();
    if (!isFinite(fin)) return "";
    var ms = fin - Date.now();
    if (ms <= 0) return "Tiempo cumplido";
    var d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
    if (d > 0) return "Cierra en " + d + "d " + h + "h";
    if (h > 0) return "Cierra en " + h + "h " + m + "m";
    return "Cierra en " + Math.max(1, m) + " min";
  }
  function fechaCorta(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return "";
    try { return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return d.toDateString(); }
  }
  function fechaHora(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return "";
    try { return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return d.toString(); }
  }
  function aLocalInput(iso) {
    var d = new Date(iso);
    if (!iso || !isFinite(d.getTime())) return "";
    var p = function (x) { return String(x).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  // Resalta "Dota 2" en amarillo dentro del título.
  function tituloHtml(t) {
    var e = esc(t);
    return e.replace(/(dota\s*2)/i, "<em>$1</em>");
  }

  /* ================= Edición en vivo ================= */
  function vivo() { return admin.puede && admin.vivo; }
  // Atributos para un texto editable directamente sobre la página.
  function ed(key, ph) {
    if (!vivo()) return "";
    return ' contenteditable="plaintext-only" spellcheck="false" data-edit="' + esc(key) + '" data-ph="' + esc(ph || "Escribe aquí") + '"';
  }
  // Texto de la página: editable en modo edición.
  function tx(tag, key, attrs) {
    var v = estado.textos[key] || "";
    return '<' + tag + (attrs ? ' ' + attrs : '') + ed("t:" + key, TEXTOS_BASE[key]) + '>' + esc(v) + '</' + tag + '>';
  }
  // Botón-enlace: en modo edición se vuelve texto editable (sin navegar).
  function lnk(cls, href, key, ext) {
    if (vivo()) return '<span class="' + cls + '"' + ed("t:" + key, TEXTOS_BASE[key]) + '>' + esc(estado.textos[key]) + '</span>';
    return '<a class="' + cls + '" href="' + esc(href) + '"' + (href === "#elegir" ? ' data-a="elegir"' : (ext ? ' target="_blank" rel="noopener"' : '')) + '>' + esc(estado.textos[key]) + '</a>';
  }

  /* ---- Imágenes subidas (guardadas en Firestore como documentos rayas/img-…) ---- */
  var IMG_CACHE = {}, IMG_PEND = {};
  function esFs(src) { return /^fs:img-[\w\-]+$/.test(String(src || "")); }
  function imgTag(src, alt, extra) {
    if (esFs(src)) {
      var id = src.slice(3);
      return '<img data-fs="' + esc(id) + '"' + (IMG_CACHE[id] ? ' src="' + IMG_CACHE[id] + '"' : '') + ' alt="' + esc(alt) + '"' + (extra || '') + '>';
    }
    var u = safeImg(src);
    return u ? '<img src="' + esc(u) + '" alt="' + esc(alt) + '"' + (extra || '') + '>' : '';
  }
  function hidratarImgs() {
    var els = document.querySelectorAll("img[data-fs]:not([src])");
    for (var k = 0; k < els.length; k++) (function (el) {
      var id = el.getAttribute("data-fs");
      if (IMG_CACHE[id]) { el.src = IMG_CACHE[id]; return; }
      if (!IMG_PEND[id]) IMG_PEND[id] = fetch(DOC_URL.replace(/estado$/, id)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var u = d && d.fields && d.fields.data && d.fields.data.stringValue;
        if (u && /^data:image\/(webp|jpeg|png);base64,/.test(u)) IMG_CACHE[id] = u;
        return IMG_CACHE[id];
      }).catch(function () { return null; });
      IMG_PEND[id].then(function (u) { if (u) { var all = document.querySelectorAll('img[data-fs="' + id + '"]'); for (var j = 0; j < all.length; j++) all[j].src = u; } });
    })(els[k]);
  }
  // Achica la foto en el navegador y la guarda como documento en Firestore.
  function subirImagen(file, maxPx) {
    return new Promise(function (ok, fail) {
      if (!file || !/^image\//.test(file.type)) return fail(new Error("Elige un archivo de imagen (JPG, PNG o WEBP)."));
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(url);
        var max = maxPx || 720, w = im.naturalWidth, h = im.naturalHeight, sc = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement("canvas"); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
        cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
        var q = 0.85, data = cv.toDataURL("image/webp", q);
        if (data.indexOf("data:image/webp") !== 0) data = cv.toDataURL("image/png");
        while (data.length > 650000 && q > 0.3) { q -= 0.15; data = cv.toDataURL("image/webp", q); }
        if (data.length > 900000) return fail(new Error("La imagen es demasiado pesada. Prueba con una más pequeña."));
        ok(data);
      };
      im.onerror = function () { URL.revokeObjectURL(url); fail(new Error("No se pudo leer la imagen.")); };
      im.src = url;
    }).then(function (data) {
      var id = "img-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      return token().then(function (tk) {
        return fetch(DOC_URL.replace(/estado$/, id), {
          method: "PATCH", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
          body: JSON.stringify({ fields: { data: { stringValue: data } } })
        });
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Tu sesión no tiene permiso. Vuelve a entrar." : "No se pudo subir (" + r.status + ").");
        IMG_CACHE[id] = data;
        return "fs:" + id;
      });
    });
  }

  function buscarPremio(id) {
    for (var k = 0; k < estado.premios.length; k++) if (estado.premios[k].id === id) return k;
    return -1;
  }
  var ESTADOS = ["activa", "proxima", "cerrada"];
  var LISTA_RAREZAS = ["", "ARCANO", "INMORTAL", "LEGENDARIO", "MÍTICO", "RARO", "POCO COMÚN", "COMÚN"];

  /* ================= Vista pública ================= */
  function tarjeta(p) {
    var img = imgTag(p.img, p.nombre, ' loading="lazy"');
    var est = p.estado === "proxima" ? "proxima" : (p.estado === "cerrada" ? "cerrada" : "activa");
    var estTxt = est === "activa" ? "Abierta" : (est === "proxima" ? "Próximamente" : "Cerrada");
    var cupos = num(p.cupos, 0), part = Math.max(num(p.participantes, 0), (partes[p.id] || []).length), cred = num(p.creditos, 0);
    var partTxt = cupos > 0 ? (part + " / " + cupos + " cupos") : (part + (part === 1 ? " participante" : " participantes"));
    var lleno = cupos > 0 && part >= cupos;
    var fz = vivo() ? est : fase(p);
    if (fz === "porIniciar") { est = "proxima"; estTxt = "Próximamente"; }
    if (fz === "vencida") estTxt = "Cierre cumplido";
    var boton;
    if (fz === "vencida") {
      boton = '<button class="btn btn-ghost" type="button" disabled>⏳ Esperando resultado</button>';
    } else if (est === "activa") {
      boton = vivo() ? lnk("btn btn-yellow", "", "btnParticipar")
        : (lleno ? '<button class="btn btn-yellow" type="button" disabled>Cupos llenos</button>'
        : (misParts[p.id] ? '<button class="btn btn-ghost" type="button" disabled>✔ Ya estás participando</button>'
        : '<button class="btn btn-yellow" type="button" data-a="participar" data-id="' + esc(p.id) + '">' + esc(estado.textos.btnParticipar) + '</button>'));
    } else if (est === "proxima") {
      boton = vivo() ? lnk("btn btn-ghost", "", "btnPronto") : '<button class="btn btn-ghost" type="button" disabled>' + (fz === "porIniciar" ? "Abre pronto" : esc(estado.textos.btnPronto)) + '</button>';
    } else {
      boton = '<div class="pill">' + (p.ganador ? 'Ganador: <b style="color:var(--yellow)">' + esc(p.ganador) + '</b>' : 'Sorteo realizado') + '</div>';
    }
    var V = vivo(), id = esc(p.id);
    if (V) {
      partTxt = '<span' + ed("p:" + p.id + ":participantes", "0") + '>' + part + '</span>' + (cupos > 0 ? ' / ' + cupos + ' cupos' : ' participantes');
      if (est === "cerrada") boton = '<div class="pill">Ganador: <b style="color:var(--yellow)"' + ed("p:" + p.id + ":ganador", "Escribe el ganador") + '>' + esc(p.ganador) + '</b></div>';
    }
    var tools = V ? '<div class="ctools">' +
      '<button type="button" data-a="mover" data-d="-1" data-id="' + id + '" title="Mover a la izquierda" aria-label="Mover a la izquierda">←</button>' +
      '<button type="button" data-a="mover" data-d="1" data-id="' + id + '" title="Mover a la derecha" aria-label="Mover a la derecha">→</button>' +
      '<button type="button" data-a="editarId" data-id="' + id + '" title="Más opciones (fecha, cupos…)" aria-label="Más opciones">⚙</button>' +
      (admin.borrar === p.id ? '<button type="button" class="danger wide" data-a="borrarId" data-id="' + id + '">¿Borrar?</button>'
                             : '<button type="button" class="danger" data-a="pedirBorrar" data-id="' + id + '" title="Borrar" aria-label="Borrar">✕</button>') +
      '</div>' : '';
    var picInner = admin.imgEdit === p.id && V
      ? '<form class="imgform" data-id="' + id + '">' +
        '<label class="btn btn-fuchsia btn-sm upl" for="up-' + id + '">' + (admin.subiendo === p.id ? 'Subiendo…' : 'Subir desde mi PC') + '</label>' +
        '<input id="up-' + id + '" class="upfile" data-id="' + id + '" type="file" accept="image/*" hidden>' +
        '<label for="img-' + id + '">o pega un link</label><input id="img-' + id + '" inputmode="url" placeholder="https://…" value="' + esc(esFs(p.img) ? "" : p.img) + '">' +
        '<div class="imgacts"><button class="btn btn-yellow btn-sm" type="submit">Usar link</button><button class="btn btn-ghost btn-sm" type="button" data-a="imgCancel">Cerrar</button></div>' +
        (admin.imgErr ? '<p class="imgerr">' + esc(admin.imgErr) + '</p>' : '') + '</form>'
      : (V ? '<button type="button" class="imgbtn" data-a="imgEdit" data-id="' + id + '">Cambiar imagen</button>' : '');
    return '<article class="card frame' + (V ? ' editing' : '') + '" style="--r:' + colorRareza(p.rareza) + '"><div class="in">' +
      '<div class="rbar"></div>' + tools +
      (img ? '<div class="pic">' + img : '<div class="pic noimg"><span class="q">?</span>') +
      (V ? '<button type="button" class="status ' + est + '" data-a="ciclarEstado" data-id="' + id + '" title="Clic para cambiar el estado">' + estTxt + ' ⟳</button>'
         : '<span class="status ' + est + '">' + estTxt + '</span>') + picInner + '</div>' +
      '<div class="body">' +
      (V ? '<button type="button" class="rarity rbtn" data-a="ciclarRareza" data-id="' + id + '" title="Clic para cambiar la rareza">' + esc(p.rareza || "Sin rareza") + ' ⟳</button>'
         : (p.rareza ? '<div class="rarity">' + esc(p.rareza) + '</div>' : '')) +
      '<h3' + ed("p:" + p.id + ":nombre", "Nombre del premio") + '>' + esc(V ? p.nombre : (p.nombre || "Premio")) + '</h3>' +
      (p.descripcion || V ? '<p class="desc"' + ed("p:" + p.id + ":descripcion", "Descripción (opcional)") + '>' + esc(p.descripcion) + '</p>' : '') +
      '<div class="meta"><span class="cost"><b' + ed("p:" + p.id + ":creditos", "0") + '>' + cred + '</b><small' + ed("t:lblCreditos", "créditos") + '>' + esc(estado.textos.lblCreditos) + '</small></span><span class="pill">' + partTxt + '</span></div>' +
      (est === "activa" && p.cierre ? '<div class="timer" data-cierre="' + esc(p.cierre) + '">' + esc(restante(p.cierre)) + '</div>' : '') +
      (est === "activa" && p.cierre ? '<div class="pill fechas">Cierra: ' + esc(fechaHora(p.cierre)) + '</div>' : '') +
      (est === "proxima" && p.inicio && tiempoDe(p.inicio) ? '<div class="pill fechas">Abre: ' + esc(fechaHora(p.inicio)) + '</div>' : '') +
      (est === "proxima" && p.cierre ? '<div class="pill fechas">Cierra: ' + esc(fechaHora(p.cierre)) + '</div>' : '') +
      boton + '</div></div></article>';
  }

  function secTitle(kicker, htmlTitle, sub) {
    return '<div class="sec-title"><div class="kicker">' + kicker + '</div><h2>' + htmlTitle + '</h2>' +
      (sub ? '<p>' + sub + '</p>' : '') + '<div class="orn">◆</div></div>';
  }

  function render() {
    var app = document.getElementById("app");
    if (!app) return;
    var visibles = estado.premios.filter(function (p) { return p.estado !== "cerrada"; });
    var cerradas = estado.premios.filter(function (p) { return p.estado === "cerrada"; });
    var linkCreditos = creditoHref();
    var T = estado.textos;

    var V = vivo();
    function sec(kk, k1, k2, subk) {
      return '<div class="sec-title">' + tx("div", kk, 'class="kicker"') +
        '<h2>' + (k1 ? tx("span", k1, 'class="t1"') + ' ' : '') + tx("span", k2) + '</h2>' +
        (subk ? tx("p", subk) : '') + '<div class="orn">◆</div></div>';
    }
    var html = '' +
      '<header class="topbar gutter"><div class="wrap">' +
      '<' + (V ? 'span' : 'a href="#inicio"') + ' class="logo"><img class="logo-img" src="img/logo.webp" alt="" width="44" height="44">' + tx("span", "logo1") + ' ' + tx("i", "logo2") + '</' + (V ? 'span' : 'a') + '>' +
      '<nav class="nav"><a class="navlink" href="#rifas">Rifas</a><a class="navlink" href="#como">Cómo participar</a><a class="navlink" href="#ganadores">Ganadores</a><a class="navlink" href="#reglas">Reglas</a>' +
      (admin.puede ? '<button class="lock" type="button" data-a="admin">Panel admin</button>'
        : (cuenta.perfil ? '<button class="lock hot misrifas" type="button" data-a="misRifas">🎟️ Mis rifas</button><button class="lock me" type="button" data-a="miCuenta"><b>◆ ' + cuenta.perfil.creditos + '</b> créditos<span class="nm"> · ' + esc(cuenta.perfil.nombre || "Mi cuenta") + '</span></button>'
          : (leerSesion() ? '<button class="lock" type="button" data-a="miCuenta">Mi cuenta</button>'
            : '<button class="lock" type="button" data-a="entrar">Entrar</button><button class="lock hot" type="button" data-a="registro">Crear cuenta</button>'))) +
      '</nav></div></header>' +

      '<section class="hero gutter" id="inicio"><div class="wrap">' +
      '<img class="hero-logo" src="img/logo.webp" alt="Rayas Store" width="132" height="132">' +
      tx("div", "kicker", 'class="kicker"') +
      (V ? '<h1' + ed("t:titulo", "Título") + '>' + esc(T.titulo) + '</h1>' : '<h1>' + tituloHtml(T.titulo) + '</h1>') +
      tx("p", "subtitulo") +
      '<div class="actions">' + lnk("btn btn-yellow", "#rifas", "btnVer") +
      (linkCreditos || V ? lnk("btn btn-fuchsia", linkCreditos, "btnCreditos", true) : '') +
      '</div>' +
      '<div class="badges">' + ["badge1", "badge2", "badge3"].map(function (k) { return '<span class="badge"><b>◆</b>' + tx("span", k) + '</span>'; }).join("") + '</div>' +
      '</div></section>' +

      '<section class="section gutter" id="rifas"><div class="wrap">' +
      sec("rifasKicker", "rifasT1", "rifasT2", "rifasSub") +
      (visibles.length || V
        ? '<div class="grid">' + visibles.map(tarjeta).join("") +
          (V ? '<button type="button" class="addcard" data-a="nuevoVivo"><span>+</span>Agregar premio</button>' : '') + '</div>'
        : '<div class="empty frame"><div class="in">' + tx("strong", "vacioT") + tx("span", "vacioS") + '</div></div>') +
      '</div></section>' +

      '<section class="band lava gutter" id="como"><div class="wrap">' +
      sec("comoKicker", "comoT1", "comoT2") +
      '<div class="steps">' + [1, 2, 3].map(function (n) {
        return '<div class="step frame"><div class="in"><span class="n">' + n + '</span>' + tx("h3", "paso" + n + "T") + tx("p", "paso" + n) + '</div></div>';
      }).join("") + '</div>' +
      (linkCreditos || V ? '<div style="text-align:center;margin-top:30px">' + lnk("btn btn-fuchsia", linkCreditos, "btnCreditos2", true) + '</div>' : '') +
      '</div></section>' +

      '<section class="band sombra gutter" id="ganadores"><div class="wrap">' +
      sec("ganKicker", null, "ganT") +
      (V && cerradas.length ? '<p class="hint" style="text-align:center;margin:-10px 0 18px">Rifas cerradas: escribe el ganador en cada tarjeta.</p><div class="grid">' + cerradas.map(tarjeta).join("") + '</div>' :
       cerradas.length
        ? '<div class="winners">' + cerradas.map(function (p) {
            return '<div class="winner frame"><div class="in"><div class="thumb">' + imgTag(p.img, "", ' loading="lazy"') + '</div>' +
              '<div class="who"><b>' + esc(p.ganador || "Por anunciar") + '</b><span>' + esc(p.nombre) + (p.cierre ? ' · ' + esc(fechaCorta(p.cierre)) : '') + '</span></div>' +
              (p.ganador ? '<span class="crown">GANÓ</span>' : '') + '</div></div>';
          }).join("") + '</div>'
        : '<div class="empty frame"><div class="in">' + tx("strong", "ganVacioT") + tx("span", "ganVacioS") + '</div></div>') +
      '</div></section>' +

      '<section class="section gutter" id="reglas"><div class="wrap" style="max-width:820px">' +
      sec("reglasKicker", null, "reglasT") +
      '<div class="rules frame gold"><div class="in"><ul>' + T.reglas.map(function (r, k) {
        return '<li><span' + ed("r:" + k, "Escribe la regla") + '>' + esc(r) + '</span>' +
          (V ? '<button type="button" class="rdel" data-a="borrarRegla" data-i="' + k + '" title="Quitar regla" aria-label="Quitar regla">✕</button>' : '') + '</li>';
      }).join("") + '</ul>' +
      (V ? '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:16px" data-a="nuevaRegla">+ Agregar regla</button>' : '') +
      '</div></div>' +
      '</div></section>' +

      '<footer class="footer gutter"><div class="wrap">' +
      '<span class="logo"><img class="logo-img" src="img/logo.webp" alt="" width="36" height="36" loading="lazy">' + esc(T.logo1) + ' <i>' + esc(T.logo2) + '</i></span>' +
      (V ? '<button type="button" class="btn btn-ghost btn-sm" data-a="editContactos">✎ Editar contactos de WhatsApp</button>'
         : (contactos().length ? '<span>WhatsApp: ' + contactos().map(function (c) { return esc(c.nombre) + ' <span class="wa">' + esc(waBonito(c.numero)) + '</span>'; }).join(' · ') + '</span>' : '')) +
      tx("span", "pie") +
      '</div></footer>';

    if (modal) html += modalAviso();
    else if (elegirAbierto && contactos().length > 1) html += modalElegir();
    if (admin.puede && !admin.abierto) html += barraEdicion();
    if (admin.puede && admin.abierto) html += '<div class="scrim" data-a="cerrar"></div>' + panelAdmin();
    if (!admin.puede && cuenta.modo) html += '<div class="scrim" data-a="cerrarCuenta"></div>' + panelCuenta();

    var scrollDrawer = document.querySelector(".drawer-body");
    var top = scrollDrawer ? scrollDrawer.scrollTop : 0;
    app.innerHTML = html;
    document.body.classList.toggle("vivo", vivo());
    hidratarImgs();
    var nd = document.querySelector(".drawer-body");
    if (nd && top) nd.scrollTop = top;
  }

  /* ================= Panel de administración ================= */
  function barraEdicion() {
    var estadoTxt = admin.msg ? esc(admin.msg) : (sucio ? "Cambios sin publicar · solo tú los ves" : "Todo publicado");
    return '<div class="editbar gutter" role="region" aria-label="Edición de la página"><div class="wrap">' +
      '<button type="button" class="btn ' + (admin.vivo ? 'btn-yellow' : 'btn-ghost') + ' btn-sm" data-a="toggleVivo" aria-pressed="' + admin.vivo + '">' + (admin.vivo ? '✔ Editando' : '✎ Editar página') + '</button>' +
      '<span class="estado ' + (admin.msgTipo || (sucio ? 'pend' : '')) + '" role="status">' + estadoTxt + '</span>' +
      '<span class="sp"></span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-a="admin">Más opciones</button>' +
      '<button type="button" class="btn btn-fuchsia btn-sm" data-a="publicar"' + (sucio ? '' : ' disabled') + '>Guardar y publicar</button>' +
      '</div></div>';
  }

  function listaMisRifas() {
    var uid = uidSesion(), yo = cuenta.perfil, g = { gano: [], curso: [], perdio: [] };
    Object.keys(partes).forEach(function (pid) {
      (partes[pid] || []).forEach(function (x) {
        if (x.uid !== uid) return;
        var k = buscarPremio(pid); if (k < 0) return;
        var p = estado.premios[k], gan = String(p.ganador || "").trim(), grupo;
        if (p.estado !== "cerrada" || !gan) grupo = "curso";
        else {
          var win = p.ganadorUid ? p.ganadorUid === uid : gan.toLowerCase() === String(yo && yo.nombre || "").trim().toLowerCase();
          grupo = win ? "gano" : "perdio";
        }
        g[grupo].push({ p: p, x: x });
      });
    });
    var total = g.gano.length + g.curso.length + g.perdio.length;
    if (!total) return '<p class="hint">Aún no participas en ninguna rifa. ¡Elige una y entra! 🍀</p><button class="btn btn-yellow" type="button" data-a="cerrarCuenta">Ver rifas</button>';
    function item(grupo, it) {
      var p = it.p, x = it.x, f = p.resultado || p.cierre, fr = f ? fechaHora(f) : "";
      var tag = grupo === "gano" ? "🏆 ¡Ganaste!" : (grupo === "perdio" ? "No ganaste" : (p.estado === "cerrada" ? "⏳ Resultado pendiente" : "⏳ En curso"));
      var lineas = '<small>Entraste: ' + esc(x.creado ? fechaHora(x.creado) : "—") + ' · ' + x.costo + ' créditos</small>';
      if (grupo === "curso") lineas += '<small>' + (p.cierre ? 'Cierra: ' + esc(fechaHora(p.cierre)) : 'Aún sin fecha de cierre') + '</small>';
      else lineas += '<small>Resultado: ' + (fr ? esc(fr) : 'sin fecha registrada') + '</small>' +
        '<small>Ganador: <b>' + esc(p.ganador) + '</b></small>' +
        (grupo === "gano" ? '<small class="win">El encargado te enviará el item a tu trade link de Steam.</small>' : '');
      return '<div class="mr mr-' + grupo + '"><div class="mrimg">' + (imgTag(p.img, "", "") || '') + '</div><div class="mrb"><b>' + esc(p.nombre) + '</b><span class="mrtag">' + tag + '</span>' + lineas + '</div></div>';
    }
    function bloque(grupo, titulo) {
      return g[grupo].length ? '<div class="grp"><h3>' + titulo + ' (' + g[grupo].length + ')</h3>' + g[grupo].map(function (it) { return item(grupo, it); }).join("") + '</div>' : '';
    }
    return '<div class="mrsum"><span class="s-gano"><b>' + g.gano.length + '</b>Ganadas</span><span class="s-curso"><b>' + g.curso.length + '</b>En curso</span><span class="s-perdio"><b>' + g.perdio.length + '</b>No ganadas</span></div>' +
      bloque("gano", "🏆 Ganadas") + bloque("curso", "⏳ En curso") + bloque("perdio", "No ganadas");
  }
  function panelCuenta() {
    var m = cuenta.modo, cuerpo, titulo;
    var msg = '<p class="hint" role="status"' + (cuenta.msgTipo === "err" ? ' style="color:var(--danger)"' : (cuenta.msgTipo === "ok" ? ' style="color:var(--ok)"' : '')) + '>' + esc(cuenta.msg) + '</p>';
    if (m === "registro") {
      titulo = "Crear cuenta";
      cuerpo = '<form class="drawer-body form" id="formRegistro">' +
        '<p class="hint">Crea tu cuenta para recibir créditos y participar en las rifas.</p>' +
        '<div class="field"><label for="r-nombre">Nombre o apodo</label><input id="r-nombre" maxlength="40" required autocomplete="nickname"></div>' +
        '<div class="field"><label for="r-trade">Link de intercambio de Steam (trade link)</label><input id="r-trade" inputmode="url" required placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…">' +
        '<p class="hint">Ahí te enviamos el item si ganas. ' + TRADE_AYUDA + '</p></div>' +
        '<div class="field"><label for="r-wa">WhatsApp</label><input id="r-wa" inputmode="tel" maxlength="20" placeholder="987 654 321" required></div>' +
        '<div class="field"><label for="r-email">Correo</label><input id="r-email" type="email" autocomplete="email" required></div>' +
        '<div class="field"><label for="r-pass">Contraseña (mínimo 6)</label><input id="r-pass" type="password" minlength="6" autocomplete="new-password" required></div>' +
        '<button class="btn btn-fuchsia" type="submit">Crear mi cuenta</button>' + msg +
        '<p class="hint">¿Ya tienes cuenta? <a href="#" data-a="entrar">Entra aquí</a></p></form>';
    } else if (m === "completar") {
      titulo = "Completa tu perfil";
      var ses0 = leerSesion() || {};
      cuerpo = '<form class="drawer-body form" id="formCompletar">' +
        '<p class="hint">Entraste con <b>' + esc(ses0.email || "") + '</b>, pero aún no tienes perfil en Rayas Store. Complétalo para participar en las rifas.</p>' +
        '<div class="field"><label for="c-nombre">Nombre o apodo</label><input id="c-nombre" maxlength="40" required autocomplete="nickname"></div>' +
        '<div class="field"><label for="c-trade">Link de intercambio de Steam (trade link)</label><input id="c-trade" inputmode="url" required placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…">' +
        '<p class="hint">' + TRADE_AYUDA + '</p></div>' +
        '<div class="field"><label for="c-wa">WhatsApp</label><input id="c-wa" inputmode="tel" maxlength="20" placeholder="987 654 321" required></div>' +
        '<button class="btn btn-fuchsia" type="submit">Guardar mi perfil</button>' + msg +
        '<div class="grp"><button class="btn btn-ghost btn-sm" type="button" data-a="salir">Cerrar sesión</button></div></form>';
    } else if (m === "rifas") {
      titulo = "Mis rifas";
      cuerpo = '<div class="drawer-body">' + listaMisRifas() + '</div>';
    } else if (m === "perfil") {
      var p = cuenta.perfil;
      titulo = "Mi cuenta";
      var link = creditoHref();
      cuerpo = '<div class="drawer-body">' + (p
        ? '<div class="saldo frame gold"><div class="in"><small>Tus créditos</small><b>' + p.creditos + '</b></div></div>' +
          '<form class="grp" id="formTrade"><h3>Mis datos</h3>' +
          '<div class="field"><label for="p-nombre">Nombre o apodo</label><input id="p-nombre" maxlength="40" required value="' + esc(p.nombre) + '"></div>' +
          '<div class="field"><label for="p-wa">WhatsApp</label><input id="p-wa" inputmode="tel" maxlength="30" required value="' + esc(p.whatsapp) + '"></div>' +
          '<div class="field"><label for="p-email">Correo</label><input id="p-email" value="' + esc(p.email) + '" disabled></div>' +
          '<div class="field"><label for="p-trade">Link de intercambio de Steam</label><input id="p-trade" inputmode="url" placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…" value="' + esc(p.tradelink) + '"></div>' +
          (p.tradelink ? '' : '<p class="hint" style="color:var(--fuchsia)">Sin trade link no podemos enviarte el item si ganas.</p>') +
          '<p class="hint">' + TRADE_AYUDA + '</p>' +
          '<div><button class="btn btn-yellow btn-sm" type="submit">Guardar cambios</button></div>' +
          '<p class="hint" role="status" id="tradeMsg"></p></form>' +
          '<div class="grp"><p class="hint">Para recibir créditos, escribe al encargado. Él los carga en tu cuenta.</p>' +
          (link ? '<a class="btn btn-yellow" href="' + esc(link) + '"' + (link === "#elegir" ? ' data-a="elegir"' : ' target="_blank" rel="noopener"') + '>Pedir créditos por WhatsApp</a>' : '') + '</div>'
        : '<p class="hint">' + (cuenta.msg ? esc(cuenta.msg) : "Cargando tu cuenta…") + '</p>') +
        '<div class="grp"><button class="btn btn-ghost btn-sm" type="button" data-a="salir">Cerrar sesión</button></div></div>';
    } else {
      titulo = "Entrar";
      cuerpo = '<form class="drawer-body form" id="formLogin">' +
        '<div class="field"><label for="l-email">Correo</label><input id="l-email" type="email" autocomplete="username" required></div>' +
        '<div class="field"><label for="l-pass">Contraseña</label><input id="l-pass" type="password" autocomplete="current-password" required></div>' +
        '<button class="btn btn-yellow" type="submit">Entrar</button>' + msg +
        '<p class="hint"><a href="#" data-a="olvide">¿Olvidaste tu contraseña?</a></p>' +
        '<p class="hint">¿No tienes cuenta? <a href="#" data-a="registro">Créala aquí</a></p></form>';
    }
    return '<aside class="drawer" role="dialog" aria-label="' + titulo + '">' +
      '<div class="drawer-head"><h2>' + titulo + '</h2><button class="btn btn-ghost btn-sm" type="button" data-a="cerrarCuenta">Cerrar</button></div>' +
      cuerpo + '</aside>';
  }

  /* ---- Usuarios (solo admin) ---- */
  function cargarUsuarios() {
    admin.uMsg = "Cargando…";
    return fsPedir("rayas_users?pageSize=300").then(function (r) {
      if (!r.ok) throw new Error(r.status === 403 ? "Falta agregar la regla de cuentas en Firebase." : "Error " + r.status);
      return r.json();
    }).then(function (j) {
      admin.usuarios = (j.documents || []).map(leerPerfilDoc).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
      admin.uMsg = ""; render();
    }).catch(function (e) { admin.usuarios = []; admin.uMsg = e.message; render(); });
  }
  function guardarCreditos(uid, valor) {
    var u = (admin.usuarios || []).filter(function (x) { return x.uid === uid; })[0];
    if (!u) return;
    var antes = u.creditos;
    u.creditos = Math.max(0, Math.floor(valor)); u.guardando = true; render();
    fsPedir("rayas_users/" + encodeURIComponent(uid) + "?updateMask.fieldPaths=creditos&currentDocument.exists=true", {
      method: "PATCH", body: JSON.stringify({ fields: { creditos: { integerValue: String(u.creditos) } } })
    }).then(function (r) {
      if (!r.ok) throw new Error("Error " + r.status);
      u.guardando = false; u.ok = Date.now(); render();
    }).catch(function (e) { u.creditos = antes; u.guardando = false; admin.uMsg = "No se guardó: " + e.message; render(); });
  }
  function tabUsuarios() {
    if (admin.usuarios === null) { cargarUsuarios(); return '<p class="hint">Cargando usuarios…</p>'; }
    var f = admin.uFiltro.trim().toLowerCase();
    var lista = admin.usuarios.filter(function (u) { return !f || (u.nombre + " " + u.email + " " + u.whatsapp + " " + u.tradelink).toLowerCase().indexOf(f) >= 0; });
    return '<div class="grp"><h3>Usuarios (' + admin.usuarios.length + ')</h3>' +
      '<div class="field"><label for="u-buscar">Buscar</label><input id="u-buscar" placeholder="Nombre, Steam, correo o WhatsApp" value="' + esc(admin.uFiltro) + '"></div>' +
      (admin.uMsg ? '<p class="hint" style="color:var(--danger)">' + esc(admin.uMsg) + '</p>' : '') +
      '<div class="ulist">' + (lista.length ? lista.map(function (u) {
        var id = esc(u.uid);
        return '<div class="urow"><div class="t"><b>' + esc(u.nombre || "(sin nombre)") + '</b><span>WhatsApp: ' + esc(u.whatsapp) + '</span><span>' + esc(u.email) + '</span>' +
          (tradeValido(u.tradelink) ? '<span><a href="' + esc(u.tradelink) + '" target="_blank" rel="noopener">Abrir trade link ↗</a></span>' : '<span style="color:var(--fuchsia)">Sin trade link</span>') + '</div>' +
          '<div class="ucred">' +
          '<button class="iconbtn" type="button" data-a="cred" data-uid="' + id + '" data-d="-1" aria-label="Quitar 1 crédito">−</button>' +
          '<input class="credset" data-uid="' + id + '" type="number" min="0" step="1" inputmode="numeric" value="' + u.creditos + '" aria-label="Créditos de ' + esc(u.nombre) + '">' +
          '<button class="iconbtn" type="button" data-a="cred" data-uid="' + id + '" data-d="1" aria-label="Sumar 1 crédito">+</button>' +
          '<button class="iconbtn wide" type="button" data-a="cred" data-uid="' + id + '" data-d="5">+5</button>' +
          '<button class="iconbtn wide" type="button" data-a="cred" data-uid="' + id + '" data-d="10">+10</button>' +
          '<span class="usave">' + (u.guardando ? "Guardando…" : (u.ok && Date.now() - u.ok < 4000 ? "✔ Guardado" : "")) + '</span>' +
          '</div>' +
          '<button type="button" class="pbtn" data-a="verFicha" data-key="u_' + id + '"><span>' + (admin.fichaU === "u_" + u.uid ? "Ocultar ficha" : "Ver ficha completa") + '</span><i>' + (admin.fichaU === "u_" + u.uid ? "▴" : "▾") + '</i></button>' +
          (admin.fichaU === "u_" + u.uid ? detalleUsuario(u.uid) : '') + '</div>';
      }).join("") : '<p class="hint">' + (f ? "Nadie coincide con la búsqueda." : "Todavía nadie se ha registrado.") + '</p>') + '</div>' +
      '<p class="hint">Los créditos se guardan al instante (no hace falta "Guardar y publicar").</p>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-a="recargarU">Actualizar lista</button></div>';
  }

  function panelAdmin() {
    var titulo = admin.editando ? (admin.editando.nuevo ? "Nuevo premio" : "Editar premio") : "Panel admin";
    var cuerpo;
    if (admin.editando) cuerpo = formPremio();
    else cuerpo = '<div class="tabs" role="tablist">' +
      '<button class="tab" role="tab" type="button" data-a="tab" data-t="premios" aria-selected="' + (admin.tab === "premios") + '">Premios</button>' +
      '<button class="tab" role="tab" type="button" data-a="tab" data-t="usuarios" aria-selected="' + (admin.tab === "usuarios") + '">Usuarios y créditos</button>' +
      '<button class="tab" role="tab" type="button" data-a="tab" data-t="pagina" aria-selected="' + (admin.tab === "pagina") + '">Textos y contactos</button>' +
      '</div>' + (admin.tab === "pagina" ? tabPagina() : (admin.tab === "usuarios" ? tabUsuarios() : listaPremios()));
    return '<aside class="drawer" role="dialog" aria-label="Panel de administración">' +
      '<div class="drawer-head"><h2>' + titulo + '</h2><button class="btn btn-ghost btn-sm" type="button" data-a="cerrar">Cerrar</button></div>' +
      '<div class="drawer-body">' + cuerpo + '</div>' +
      (admin.editando ? '' :
        '<div class="drawer-foot">' +
        '<button class="btn btn-fuchsia" type="button" data-a="publicar"' + (sucio ? '' : ' disabled') + '>Guardar y publicar</button>' +
        '<div class="msg ' + admin.msgTipo + '" role="status">' + esc(admin.msg || (sucio ? "Tienes cambios sin publicar." : "Todo está publicado.")) + '</div>' +
        '</div>') +
      '</aside>';
  }

  function guardarUsuario(uid) {
    var u = usuarioPorUid(uid); if (!u) return;
    var nom = document.getElementById("eu-nombre").value.trim(), wa = document.getElementById("eu-wa").value.trim(), tl = document.getElementById("eu-trade").value.trim();
    if (!nom) { admin.uMsg = "El nombre no puede quedar vacío."; render(); return; }
    if (tl && !tradeValido(tl)) { admin.uMsg = "Ese trade link no parece válido."; render(); return; }
    admin.uMsg = "Guardando…"; render();
    fsPedir("rayas_users/" + encodeURIComponent(uid) + "?updateMask.fieldPaths=nombre&updateMask.fieldPaths=whatsapp&updateMask.fieldPaths=tradelink&currentDocument.exists=true", {
      method: "PATCH", body: JSON.stringify({ fields: { nombre: { stringValue: nom }, whatsapp: { stringValue: wa }, tradelink: { stringValue: tl } } })
    }).then(function (r) {
      if (!r.ok) throw new Error("Error " + r.status);
      u.nombre = nom; u.whatsapp = wa; u.tradelink = tl; admin.editU = null; admin.uMsg = ""; render();
    }).catch(function (e) { admin.uMsg = "No se guardó: " + e.message; render(); });
  }
  function quitarParticipacion(pid, uid) {
    var base = "projects/" + FB.projectId + "/databases/(default)/documents/", lista = partes[pid] || [], x = lista.filter(function (y) { return y.uid === uid; })[0];
    if (!x) { admin.quitarP = null; render(); return; }
    token().then(function (tk) {
      return fetch(BASE.replace(/documents\/$/, "documents:commit"), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
        body: JSON.stringify({ writes: [
          { delete: base + "rayas_part/" + pid + "_" + uid },
          { transform: { document: base + "rayas_users/" + uid, fieldTransforms: [{ fieldPath: "creditos", increment: { integerValue: String(x.costo || 0) } }] } }
        ] }) });
    }).then(function (r) {
      if (!r.ok) throw new Error("Error " + r.status);
      partes[pid] = lista.filter(function (y) { return y.uid !== uid; });
      var u = usuarioPorUid(uid); if (u) u.creditos += (x.costo || 0);
      admin.quitarP = null; admin.fichaU = null; render();
    }).catch(function (e) { admin.quitarP = null; admin.uMsg = "No se pudo quitar: " + e.message; render(); });
  }
  function waNum(n) { n = soloDigitos(n); return n.length === 9 ? "51" + n : n; }
  function usuarioPorUid(uid) { return (admin.usuarios || []).filter(function (x) { return x.uid === uid; })[0]; }
  function detalleUsuario(uid, ctx) {
    var u = usuarioPorUid(uid), id = esc(uid);
    if (!u) return '<div class="ficha"><p class="hint">' + (admin.usuarios === null ? "Cargando datos…" : "No se encontró el perfil de este usuario.") + '</p></div>';
    if (admin.editU === uid) {
      return '<div class="ficha"><h4>Editar datos de ' + esc(u.nombre) + '</h4>' +
        '<div class="field"><label for="eu-nombre">Nombre</label><input id="eu-nombre" maxlength="40" value="' + esc(u.nombre) + '"></div>' +
        '<div class="field"><label for="eu-wa">WhatsApp</label><input id="eu-wa" inputmode="tel" value="' + esc(u.whatsapp) + '"></div>' +
        '<div class="field"><label for="eu-trade">Trade link de Steam</label><input id="eu-trade" inputmode="url" value="' + esc(u.tradelink) + '"></div>' +
        (admin.uMsg ? '<p class="hint" style="color:var(--danger)">' + esc(admin.uMsg) + '</p>' : '') +
        '<div class="fbtns"><button class="btn btn-yellow btn-sm" type="button" data-a="guardarU" data-uid="' + id + '">Guardar</button><button class="btn btn-ghost btn-sm" type="button" data-a="cancelarU">Cancelar</button></div></div>';
    }
    var rifas = [];
    Object.keys(partes).forEach(function (pid) {
      (partes[pid] || []).forEach(function (x) {
        if (x.uid !== uid) return;
        var k = buscarPremio(pid), pr = k >= 0 ? estado.premios[k] : null;
        rifas.push('<li>' + esc(pr ? pr.nombre : (x.premioNombre || pid)) + ' · ' + x.costo + ' cr. · ' + esc(x.creado ? fechaHora(x.creado) : "—") +
          (pr && pr.ganadorUid === uid ? ' · <b>🏆 ganador</b>' : '') + '</li>');
      });
    });
    var h = '<div class="ficha"><div class="fhead"><b>' + esc(u.nombre || "(sin nombre)") + '</b><span class="fcred">◆ ' + u.creditos + ' créditos</span></div>' +
      '<div class="frow"><span>WhatsApp</span><div>' + (soloDigitos(u.whatsapp) ? '<a href="https://wa.me/' + esc(waNum(u.whatsapp)) + '" target="_blank" rel="noopener">' + esc(u.whatsapp) + ' ↗</a>' : '—') + '</div></div>' +
      '<div class="frow"><span>Correo</span><div><a href="mailto:' + esc(u.email) + '">' + esc(u.email) + '</a></div></div>' +
      '<div class="frow"><span>Trade link</span><div>' + (tradeValido(u.tradelink)
        ? '<a href="' + esc(u.tradelink) + '" target="_blank" rel="noopener">Abrir en Steam ↗</a> <button class="iconbtn wide" type="button" data-a="copiar" data-txt="' + esc(u.tradelink) + '">' + (u.copiado && Date.now() - u.copiado < 3000 ? "✔ Copiado" : "Copiar") + '</button>'
        : '<span style="color:var(--fuchsia)">Sin trade link</span>') + '</div></div>' +
      (u.steam ? '<div class="frow"><span>Steam</span><div>' + esc(u.steam) + '</div></div>' : '') +
      '<div class="frow"><span>Registro</span><div>' + (u.creado ? esc(fechaHora(u.creado)) : "—") + '</div></div>' +
      '<div class="frow"><span>Rifas</span><div>' + (rifas.length ? '<ul class="frifas">' + rifas.join("") + '</ul>' : "Ninguna todavía") + '</div></div>';
    if (ctx && ctx.p) {
      var p = ctx.p, esGan = p.ganadorUid === uid;
      if (esGan && soloDigitos(u.whatsapp)) {
        var aviso = "¡Felicidades " + u.nombre + "! 🏆 Ganaste la rifa de " + p.nombre + " en RAYAS STORE. Te enviaremos el item por Steam a tu trade link. ¡Gracias por participar! 🎉";
        h += '<div class="fbtns"><a class="btn btn-fuchsia btn-sm" target="_blank" rel="noopener" href="' + esc(waLinkA(waNum(u.whatsapp), aviso)) + '">Avisar al ganador por WhatsApp</a></div>';
      }
      h += '<div class="fbtns">' + (admin.quitarP === p.id + "_" + uid
        ? '<button class="btn btn-ghost btn-sm" type="button" data-a="quitarPartSi" data-uid="' + id + '" data-id="' + esc(p.id) + '">Sí, quitar y devolver ' + (ctx.costo || 0) + ' créditos</button><button class="btn btn-ghost btn-sm" type="button" data-a="quitarPartNo">No</button>'
        : '<button class="btn btn-ghost btn-sm" type="button" data-a="quitarPart" data-uid="' + id + '" data-id="' + esc(p.id) + '">Quitar de esta rifa (devuelve créditos)</button>') + '</div>';
    }
    return h + '<div class="fbtns"><button class="btn btn-yellow btn-sm" type="button" data-a="editU" data-uid="' + id + '">✎ Editar datos</button></div></div>';
  }
  function listaParticipantes() {
    var conPart = estado.premios.filter(function (p) { return (partes[p.id] || []).length; });
    if (!conPart.length) return '';
    if (admin.usuarios === null && !admin.cargandoU) { admin.cargandoU = true; cargarUsuarios(); }
    return conPart.map(function (p) {
      var l = partes[p.id];
      return '<div class="grp"><h3>Participantes · ' + esc(p.nombre) + ' (' + l.length + ')</h3>' +
        (p.ganador ? '<p class="hint">🏆 Ganador: <b>' + esc(p.ganador) + '</b></p>' : '') +
        l.map(function (x) {
          var abierto = admin.fichaU === p.id + "_" + x.uid;
          return '<div class="prow' + (p.ganadorUid === x.uid ? ' win' : '') + '"><button type="button" class="pbtn" data-a="verFicha" data-key="' + esc(p.id + "_" + x.uid) + '">' +
            '<span>' + (p.ganadorUid === x.uid ? '🏆 ' : '') + esc(x.nombre) + '</span><small>' + esc(x.creado ? fechaHora(x.creado) : "") + '</small><i>' + (abierto ? "▴" : "▾") + '</i></button>' +
            (abierto ? detalleUsuario(x.uid, { p: p, costo: x.costo }) : '') + '</div>';
        }).join("") +
        '<button class="btn btn-ghost btn-sm" type="button" data-a="sortear" data-id="' + esc(p.id) + '">🎲 Sortear ganador</button></div>';
    }).join("");
  }
  function listaPremios() {
    var items = estado.premios.map(function (p, i) {
      var est = p.estado === "proxima" ? "Próximamente" : (p.estado === "cerrada" ? "Cerrada" : "Abierta");
      return '<div class="aitem"><div class="th">' + imgTag(p.img, "") + '</div>' +
        '<div class="t"><b>' + esc(p.nombre || "Premio") + '</b><span>' + est + ' · ' + num(p.creditos, 0) + ' créditos</span></div>' +
        '<div class="acts">' +
        '<button class="iconbtn" type="button" aria-label="Subir" title="Subir" data-a="subir" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="iconbtn" type="button" aria-label="Bajar" title="Bajar" data-a="bajar" data-i="' + i + '"' + (i === estado.premios.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="iconbtn" type="button" aria-label="Editar" title="Editar" data-a="editar" data-i="' + i + '">✎</button>' +
        (admin.borrar === p.id
          ? '<button class="iconbtn confirm" type="button" data-a="borrarSi" data-i="' + i + '">¿Borrar?</button>'
          : '<button class="iconbtn del" type="button" aria-label="Borrar" title="Borrar" data-a="borrar" data-i="' + i + '">✕</button>') +
        '</div></div>';
    }).join("");
    return '<div class="grp"><h3>Premios</h3>' +
      (items ? '<div class="alist">' + items + '</div>' : '<p class="hint">Todavía no hay premios. Agrega el primero.</p>') +
      '<div><button class="btn btn-yellow" type="button" data-a="nuevo">+ Agregar premio</button></div>' +
      listaParticipantes() +
      '<p class="hint">Los cambios se ven al instante en tu pantalla. Los visitantes los ven cuando pulsas "Guardar y publicar".</p></div>' +
      '<div class="grp"><button class="btn btn-ghost btn-sm" type="button" data-a="salir">Cerrar sesión</button></div>';
  }

  function tabPagina() {
    var T = estado.textos;
    return (estado.contactos || []).map(function (c, k) {
      return '<div class="grp contacto-ed"><h3>Contacto ' + (k + 1) + ' · ' + esc(c.nombre || "sin nombre") + '</h3>' +
        '<div class="cav">' + avatar(c) +
        '<label class="btn btn-ghost btn-sm" for="cf-' + k + '">' + (admin.subiendo === "c" + k ? "Subiendo…" : "Subir foto") + '</label>' +
        '<input id="cf-' + k + '" class="cfile" data-i="' + k + '" type="file" accept="image/*" hidden>' +
        (c.foto ? '<button type="button" class="btn btn-ghost btn-sm" data-a="quitarFoto" data-i="' + k + '">Quitar foto</button>' : '') + '</div>' +
        '<div class="field"><label for="cn-' + k + '">Nombre</label><input id="cn-' + k + '" class="c-nombre" data-i="' + k + '" maxlength="30" value="' + esc(c.nombre) + '"></div>' +
        '<div class="field"><label for="cw-' + k + '">Número con código de país</label><input id="cw-' + k + '" class="c-num" data-i="' + k + '" inputmode="numeric" placeholder="51987654321" value="' + esc(c.numero) + '"></div>' +
        '<label class="chk"><input type="checkbox" class="c-activo" data-i="' + k + '"' + (c.activo ? ' checked' : '') + '> Activo (recibe mensajes de clientes)</label></div>';
    }).join("") +
      (admin.imgErr ? '<p class="hint" style="color:var(--danger)">' + esc(admin.imgErr) + '</p>' : '') +
      '<p class="hint">Si los dos están activos, el cliente elige con quién hablar. Si solo hay uno activo, el botón abre directo su WhatsApp. Si ninguno, se ocultan los botones de créditos. Perú: 51 + 9 dígitos.</p>' +
      '<div class="grp"><h3>Mensajes de WhatsApp</h3>' +
      '<div class="field"><label for="f-msg1">Cuando pide créditos con cuenta</label><textarea id="f-msg1" rows="6" maxlength="600">' + esc(T.msgCredPerfil) + '</textarea></div>' +
      '<p class="hint">Usa {nombre} y {correo} para poner los datos del usuario.</p>' +
      '<div class="field"><label for="f-msg2">Cuando pide créditos sin cuenta</label><textarea id="f-msg2" rows="4" maxlength="600">' + esc(T.msgCredVisita) + '</textarea></div>' +
      '<p class="hint">Puedes usar emojis. En celular se envían tal cual; en PC se quitan solos al enviar, porque WhatsApp para Windows los daña.</p></div>' +
      '<div class="grp"><h3>Portada</h3>' +
      '<div class="field"><label for="f-titulo">Título</label><input id="f-titulo" maxlength="70" value="' + esc(T.titulo) + '"></div>' +
      '<p class="hint">Si escribes "Dota 2" en el título, sale en amarillo.</p>' +
      '<div class="field"><label for="f-sub">Texto debajo del título</label><textarea id="f-sub" maxlength="220">' + esc(T.subtitulo) + '</textarea></div></div>' +
      '<div class="grp"><h3>Reglas</h3>' +
      '<div class="field"><label for="f-reglas">Una regla por línea</label><textarea id="f-reglas" style="min-height:170px">' + esc(T.reglas.join("\n")) + '</textarea></div></div>';
  }

  function formPremio() {
    var p = admin.editando.p;
    var img = imgTag(p.img, "");
    return '<div class="form">' +
      '<div class="field"><label for="f-img">Imagen del premio (link https://…)</label>' +
      '<div class="imgprev"><div class="box" id="prevBox">' + (img || 'Sin imagen') + '</div>' +
      '<p class="hint">Copia la imagen del item (clic derecho → Copiar dirección de imagen), por ejemplo desde el Mercado de Steam o la tienda de Dota 2, y pégala aquí.</p></div>' +
      '<input id="f-img" inputmode="url" placeholder="https://…" value="' + esc(p.img) + '"></div>' +
      '<div class="field"><label for="f-nombre">Nombre del premio</label><input id="f-nombre" maxlength="80" value="' + esc(p.nombre) + '"></div>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-rareza">Rareza</label><select id="f-rareza">' +
      ['', 'ARCANO', 'INMORTAL', 'LEGENDARIO', 'MÍTICO', 'RARO', 'POCO COMÚN', 'COMÚN'].map(function (r) {
        return '<option value="' + esc(r) + '"' + (String(p.rareza || "").toUpperCase() === r ? ' selected' : '') + '>' + (r || "Sin rareza") + '</option>';
      }).join("") + '</select></div>' +
      '<div class="field"><label for="f-creditos">Costo en créditos</label><input id="f-creditos" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.creditos, 0) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="f-desc">Descripción (opcional)</label><textarea id="f-desc" maxlength="240">' + esc(p.descripcion) + '</textarea></div>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-inicio">Fecha y hora de inicio</label><input id="f-inicio" type="datetime-local" value="' + esc(aLocalInput(p.inicio)) + '"></div>' +
      '<div class="field"><label for="f-cierre">Fecha y hora de cierre</label><input id="f-cierre" type="datetime-local" value="' + esc(aLocalInput(p.cierre)) + '"></div>' +
      '</div>' +
      '<p class="hint">Inicio: si lo dejas vacío, la rifa empieza cuando publiques. La rifa se abre y se cierra sola en esas horas.</p>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-estado">Estado</label><select id="f-estado">' +
      [['activa', 'Abierta'], ['proxima', 'Próximamente'], ['cerrada', 'Cerrada']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((p.estado || "activa") === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join("") + '</select></div>' +
      '<div class="field"><label for="f-cupos">Cupos (0 = sin límite)</label><input id="f-cupos" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.cupos, 0) + '"></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-part">Participantes</label><input id="f-part" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.participantes, 0) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="f-ganador">Ganador (al cerrar)</label><input id="f-ganador" maxlength="60" placeholder="Nombre o usuario de Steam" value="' + esc(p.ganador) + '"></div>' +
      '<p class="hint" id="formErr" style="color:var(--danger)"></p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-yellow" type="button" data-a="listo">Listo</button>' +
      '<button class="btn btn-ghost" type="button" data-a="cancelar">Cancelar</button></div>' +
      '</div>';
  }

  function leerForm() {
    if (!admin.editando) return;
    var p = admin.editando.p;
    var v = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
    if (v("f-img") !== null) p.img = v("f-img").trim();
    if (v("f-nombre") !== null) p.nombre = v("f-nombre").trim();
    if (v("f-rareza") !== null) p.rareza = v("f-rareza");
    if (v("f-creditos") !== null) p.creditos = num(v("f-creditos"), 0);
    if (v("f-desc") !== null) p.descripcion = v("f-desc").trim();
    if (v("f-estado") !== null) p.estado = v("f-estado");
    if (v("f-inicio") !== null) { var ci = v("f-inicio"); var di = ci ? new Date(ci) : null; p.inicio = di && isFinite(di.getTime()) ? di.toISOString() : ""; }
    if (v("f-cierre") !== null) { var c = v("f-cierre"); var d = c ? new Date(c) : null; p.cierre = d && isFinite(d.getTime()) ? d.toISOString() : ""; }
    if (v("f-part") !== null) p.participantes = num(v("f-part"), 0);
    if (v("f-cupos") !== null) p.cupos = num(v("f-cupos"), 0);
    if (v("f-ganador") !== null) p.ganador = v("f-ganador").trim();
  }

  function marcarSucio() {
    sucio = JSON.stringify(estado) !== JSON.stringify(publicado);
    admin.msg = ""; admin.msgTipo = "";
  }

  function actualizarPie() {
    var foot = document.querySelector(".drawer-foot") || document.createElement("div");
    var btn = foot.querySelector('[data-a="publicar"]');
    if (btn) btn.disabled = !sucio;
    var msg = foot.querySelector(".msg");
    if (msg) { msg.className = "msg"; msg.textContent = sucio ? "Tienes cambios sin publicar." : "Todo está publicado."; }
    var eb = document.querySelector(".editbar");
    if (eb) {
      var pb = eb.querySelector('[data-a="publicar"]'); if (pb) pb.disabled = !sucio;
      var es = eb.querySelector(".estado"); if (es) { es.className = "estado" + (sucio ? " pend" : ""); es.textContent = sucio ? "Cambios sin publicar · solo tú los ves" : "Todo publicado"; }
    }
  }

  function publicar() {
    admin.msg = "Publicando…"; admin.msgTipo = ""; render();
    estado.textos.reglas = estado.textos.reglas.filter(function (x) { return x && x.trim(); });
    estado.premios.forEach(function (p) { if (p.estado !== "cerrada" && !p.inicio) p.inicio = new Date().toISOString(); });
    var copia = clone(estado);
    token().then(function (tk) {
      return fetch(DOC_URL + "?updateMask.fieldPaths=json&updateMask.fieldPaths=actualizado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
        body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(copia) }, actualizado: { timestampValue: new Date().toISOString() } } })
      });
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error("PERM");
      if (!r.ok) throw new Error("HTTP " + r.status);
      publicado = copia; sucio = false;
      admin.msg = "Publicado. Ya lo ven todos los visitantes."; admin.msgTipo = "ok"; render();
    }).catch(function (e) {
      var m = e && e.message;
      if (m === "NO_SESSION") { admin.msg = "Tu sesión venció. Vuelve a entrar."; admin.puede = false; admin.abierto = false; cuenta.modo = "login"; }
      else if (m === "PERM") { admin.msg = "Esta cuenta no tiene permiso para guardar las rifas."; }
      else { admin.msg = "No se pudo publicar (" + (m || "error") + "). Revisa tu internet e intenta de nuevo."; }
      admin.msgTipo = "err"; render();
    });
  }

  function quitarHash() { if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search); }

  /* ================= Eventos ================= */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-a]");
    if (!t) return;
    var a = t.getAttribute("data-a");
    var i = Number(t.getAttribute("data-i"));
    switch (a) {
      case "admin":
        if (admin.puede) admin.abierto = true; else { cuenta.modo = "login"; cuenta.msg = ""; cuenta.msgTipo = ""; }
        render(); break;
      case "entrar": ev.preventDefault(); cuenta.modo = "login"; cuenta.msg = ""; cuenta.msgTipo = ""; render(); break;
      case "registro": ev.preventDefault(); cuenta.modo = "registro"; cuenta.msg = t.getAttribute("data-need") ? "Para participar primero crea una cuenta en la página." : ""; cuenta.msgTipo = t.getAttribute("data-need") ? "err" : ""; render(); break;
      case "misRifas": cuenta.modo = "rifas"; cuenta.msg = ""; render(); cargarParts(); break;
      case "miCuenta": cuenta.modo = "perfil"; cuenta.msg = ""; render(); cargarPerfil(); break;
      case "verFicha": var kf = t.getAttribute("data-key"); admin.fichaU = admin.fichaU === kf ? null : kf; admin.editU = null; admin.uMsg = ""; render(); break;
      case "editU": admin.editU = t.getAttribute("data-uid"); admin.uMsg = ""; render(); break;
      case "cancelarU": admin.editU = null; admin.uMsg = ""; render(); break;
      case "guardarU": guardarUsuario(t.getAttribute("data-uid")); break;
      case "copiar": var txtc = t.getAttribute("data-txt"), tu = (admin.usuarios || []).filter(function (x) { return x.tradelink === txtc; })[0];
        try { navigator.clipboard.writeText(txtc); } catch (e4) { /* sin portapapeles */ }
        if (tu) tu.copiado = Date.now(); render(); break;
      case "quitarPart": admin.quitarP = t.getAttribute("data-id") + "_" + t.getAttribute("data-uid"); render(); break;
      case "quitarPartNo": admin.quitarP = null; render(); break;
      case "quitarPartSi": quitarParticipacion(t.getAttribute("data-id"), t.getAttribute("data-uid")); break;
      case "participar": iniciarParticipar(t.getAttribute("data-id")); break;
      case "confirmarPart": confirmarPart(); break;
      case "cerrarModal": modal = null; render(); break;
      case "sortear": var ks = buscarPremio(t.getAttribute("data-id")); var lp = ks >= 0 ? (partes[estado.premios[ks].id] || []) : []; if (lp.length) { var gw = lp[Math.floor(Math.random() * lp.length)]; estado.premios[ks].ganador = gw.nombre; estado.premios[ks].ganadorUid = gw.uid; estado.premios[ks].resultado = new Date().toISOString(); estado.premios[ks].estado = "cerrada"; marcarSucio(); render(); } break;
      case "olvide": ev.preventDefault(); recuperarClave(); break;
      case "elegir": ev.preventDefault(); modal = null; elegirAbierto = true; render(); break;
      case "cerrarElegir": elegirAbierto = false; render(); break;
      case "editContactos": admin.abierto = true; admin.tab = "pagina"; render(); break;
      case "quitarFoto": estado.contactos[i].foto = ""; marcarSucio(); render(); break;
      case "cerrarCuenta": quitarHash(); cuenta.modo = null; render(); break;
      case "cred": var uu = (admin.usuarios || []).filter(function (x) { return x.uid === t.getAttribute("data-uid"); })[0]; if (uu && !uu.guardando) guardarCreditos(uu.uid, uu.creditos + Number(t.getAttribute("data-d"))); break;
      case "recargarU": admin.usuarios = null; render(); break;
      case "cerrar": leerForm(); quitarHash(); admin.abierto = false; admin.editando = null; render(); break;
      case "tab": admin.tab = t.getAttribute("data-t"); render(); break;
      case "nuevo":
        admin.editando = { nuevo: true, p: { id: "p" + Date.now().toString(36), nombre: "", rareza: "", img: "", descripcion: "", creditos: 10, estado: "activa", cierre: "", participantes: 0, cupos: 0, ganador: "" } };
        render(); var fi = document.getElementById("f-img"); if (fi) fi.focus(); break;
      case "editar": admin.editando = { nuevo: false, i: i, p: clone(estado.premios[i]) }; render(); break;
      case "subir": if (i > 0) { estado.premios.splice(i - 1, 0, estado.premios.splice(i, 1)[0]); marcarSucio(); render(); } break;
      case "bajar": if (i < estado.premios.length - 1) { estado.premios.splice(i + 1, 0, estado.premios.splice(i, 1)[0]); marcarSucio(); render(); } break;
      case "borrar": admin.borrar = estado.premios[i] && estado.premios[i].id; render(); break;
      case "borrarSi": estado.premios.splice(i, 1); admin.borrar = null; marcarSucio(); render(); break;
      case "listo":
        leerForm();
        var ed = admin.editando, err = document.getElementById("formErr");
        if (!ed.p.nombre) { if (err) err.textContent = "Escribe el nombre del premio."; var fn = document.getElementById("f-nombre"); if (fn) fn.focus(); return; }
        if (ed.p.img && !safeImg(ed.p.img) && !esFs(ed.p.img)) { if (err) err.textContent = "El link de la imagen debe empezar con https://"; return; }
        if (ed.nuevo) estado.premios.unshift(ed.p); else estado.premios[ed.i] = ed.p;
        admin.editando = null; marcarSucio(); render(); break;
      case "cancelar": admin.editando = null; render(); break;
      case "publicar": publicar(); break;
      case "toggleVivo": admin.vivo = !admin.vivo; admin.imgEdit = null; admin.borrar = null; admin.msg = ""; admin.msgTipo = ""; render(); break;
      case "nuevoVivo":
        var np = { id: "p" + Date.now().toString(36), nombre: "", rareza: "", img: "", descripcion: "", creditos: 10, estado: "activa", cierre: "", participantes: 0, cupos: 0, ganador: "" };
        estado.premios.push(np); admin.imgEdit = np.id; marcarSucio(); render();
        var h = document.querySelector('[data-edit="p:' + np.id + ':nombre"]'); if (h) { h.scrollIntoView({ block: "center" }); h.focus(); }
        break;
      case "imgEdit": admin.imgErr = ""; admin.imgEdit = t.getAttribute("data-id"); render(); var ii = document.getElementById("img-" + admin.imgEdit); if (ii) ii.focus(); break;
      case "imgCancel": admin.imgEdit = null; admin.imgErr = ""; render(); break;
      case "ciclarEstado": var ke = buscarPremio(t.getAttribute("data-id")); if (ke >= 0) { var pe = estado.premios[ke]; pe.estado = ESTADOS[(ESTADOS.indexOf(pe.estado || "activa") + 1) % ESTADOS.length]; if (pe.estado === "cerrada" && !pe.resultado) pe.resultado = new Date().toISOString(); marcarSucio(); render(); } break;
      case "ciclarRareza": var kr = buscarPremio(t.getAttribute("data-id")); if (kr >= 0) { var pr = estado.premios[kr]; pr.rareza = LISTA_RAREZAS[(LISTA_RAREZAS.indexOf(String(pr.rareza || "").toUpperCase()) + 1) % LISTA_RAREZAS.length]; marcarSucio(); render(); } break;
      case "mover":
        var km = buscarPremio(t.getAttribute("data-id")), d = Number(t.getAttribute("data-d")), est0 = km >= 0 ? (estado.premios[km].estado === "cerrada") : false;
        // Busca el vecino visible en la misma sección (abiertas o cerradas).
        var j = km + d;
        while (j >= 0 && j < estado.premios.length && (estado.premios[j].estado === "cerrada") !== est0) j += d;
        if (km >= 0 && j >= 0 && j < estado.premios.length) { var tmp = estado.premios[km]; estado.premios[km] = estado.premios[j]; estado.premios[j] = tmp; marcarSucio(); render(); }
        break;
      case "editarId": var kk = buscarPremio(t.getAttribute("data-id")); if (kk >= 0) { admin.editando = { nuevo: false, i: kk, p: clone(estado.premios[kk]) }; admin.abierto = true; render(); } break;
      case "pedirBorrar": admin.borrar = t.getAttribute("data-id"); render(); break;
      case "borrarId": var kb = buscarPremio(t.getAttribute("data-id")); if (kb >= 0) { estado.premios.splice(kb, 1); admin.borrar = null; marcarSucio(); render(); } break;
      case "nuevaRegla": estado.textos.reglas.push(""); marcarSucio(); render(); var lr = document.querySelector('[data-edit="r:' + (estado.textos.reglas.length - 1) + '"]'); if (lr) lr.focus(); break;
      case "borrarRegla": estado.textos.reglas.splice(i, 1); marcarSucio(); render(); break;
      case "salir": guardarSesion(null); admin.puede = false; admin.abierto = false; admin.vivo = false; admin.usuarios = null; cuenta.perfil = null; cuenta.modo = null; estado = clone(publicado); sucio = false; render(); break;
    }
  });

  function aplicarEdicion(el) {
    var key = el.getAttribute("data-edit") || "", val = el.textContent.replace(/\s+/g, " ").trim();
    var parts = key.split(":");
    if (parts[0] === "t") estado.textos[parts[1]] = val;
    else if (parts[0] === "r") estado.textos.reglas[Number(parts[1])] = val;
    else if (parts[0] === "w") estado.whatsapp = soloDigitos(val);
    else if (parts[0] === "p") {
      var k = buscarPremio(parts[1]);
      if (k < 0) return;
      var campo = parts[2];
      if (campo === "creditos" || campo === "participantes") estado.premios[k][campo] = num(soloDigitos(val), 0);
      else estado.premios[k][campo] = val;
    }
    marcarSucio(); actualizarPie();
  }
  document.addEventListener("input", function (ev) {
    if (ev.target.closest && ev.target.closest("[data-edit]")) { aplicarEdicion(ev.target.closest("[data-edit]")); return; }
    if (ev.target.id === "u-buscar") {
      admin.uFiltro = ev.target.value;
      var pos = ev.target.selectionStart; render();
      var nb = document.getElementById("u-buscar"); if (nb) { nb.focus(); try { nb.setSelectionRange(pos, pos); } catch (e2) { /* nada */ } }
      return;
    }
    var t = ev.target;
    if (t.classList && t.classList.contains("c-nombre")) { estado.contactos[Number(t.getAttribute("data-i"))].nombre = t.value; marcarSucio(); actualizarPie(); }
    else if (t.classList && t.classList.contains("c-num")) { estado.contactos[Number(t.getAttribute("data-i"))].numero = soloDigitos(t.value); marcarSucio(); actualizarPie(); }
    else if (t.id === "f-msg1") { estado.textos.msgCredPerfil = t.value; marcarSucio(); actualizarPie(); }
    else if (t.id === "f-msg2") { estado.textos.msgCredVisita = t.value; marcarSucio(); actualizarPie(); }
    else if (t.id === "f-titulo") { estado.textos.titulo = t.value; marcarSucio(); actualizarPie(); }
    else if (t.id === "f-sub") { estado.textos.subtitulo = t.value; marcarSucio(); actualizarPie(); }
    else if (t.id === "f-reglas") { estado.textos.reglas = t.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean); marcarSucio(); actualizarPie(); }
    else if (t.id === "f-img") {
      var box = document.getElementById("prevBox"), u = safeImg(t.value);
      if (box) { box.textContent = ""; if (u) { var im = document.createElement("img"); im.src = u; im.alt = ""; box.appendChild(im); } else box.textContent = t.value.trim() ? "Link no válido" : "Sin imagen"; }
    }
  });
  // Al salir de un campo de texto de la página, refresca la vista previa.
  document.addEventListener("change", function (ev) {
    if (ev.target.classList && ev.target.classList.contains("credset")) { guardarCreditos(ev.target.getAttribute("data-uid"), num(ev.target.value, 0)); return; }
    if (ev.target.classList && ev.target.classList.contains("upfile") && ev.target.files && ev.target.files[0]) {
      var pid = ev.target.getAttribute("data-id");
      admin.subiendo = pid; admin.imgErr = ""; render();
      subirImagen(ev.target.files[0]).then(function (ref) {
        var k = buscarPremio(pid);
        if (k >= 0) { estado.premios[k].img = ref; marcarSucio(); }
        admin.subiendo = null; admin.imgEdit = null; render();
      }).catch(function (e) {
        admin.subiendo = null; admin.imgErr = (e && e.message) || "No se pudo subir la imagen."; render();
      });
      return;
    }
    var tc = ev.target;
    if (tc.classList && tc.classList.contains("c-activo")) { estado.contactos[Number(tc.getAttribute("data-i"))].activo = tc.checked; marcarSucio(); render(); return; }
    if (tc.classList && (tc.classList.contains("c-nombre") || tc.classList.contains("c-num"))) { render(); return; }
    if (tc.classList && tc.classList.contains("cfile") && tc.files && tc.files[0]) {
      var ci = Number(tc.getAttribute("data-i"));
      admin.subiendo = "c" + ci; admin.imgErr = ""; render();
      subirImagen(tc.files[0], 360).then(function (ref) {
        estado.contactos[ci].foto = ref; marcarSucio(); admin.subiendo = null; render();
      }).catch(function (e) { admin.subiendo = null; admin.imgErr = (e && e.message) || "No se pudo subir la imagen."; render(); });
      return;
    }
    if (["f-titulo", "f-sub", "f-reglas"].indexOf(ev.target.id) >= 0) render();
  });

  function errAuth(m) {
    m = String(m || "");
    if (/EMAIL_EXISTS/.test(m)) return "Ese correo ya tiene cuenta. Entra con tu contraseña.";
    if (/WEAK_PASSWORD/.test(m)) return "La contraseña debe tener al menos 6 caracteres.";
    if (/INVALID_EMAIL/.test(m)) return "Ese correo no es válido.";
    if (/INVALID|PASSWORD|EMAIL_NOT_FOUND|CREDENTIAL/.test(m)) return "Correo o contraseña incorrectos.";
    if (/TOO_MANY/.test(m)) return "Demasiados intentos. Espera unos minutos.";
    if (/OPERATION_NOT_ALLOWED|ADMIN_ONLY/.test(m)) return "El registro está desactivado en Firebase.";
    return "No se pudo (" + m + ").";
  }
  function recuperarClave() {
    var em = (document.getElementById("l-email") || {}).value || "";
    em = em.trim();
    if (!em) { cuenta.msg = "Escribe tu correo arriba y vuelve a pulsar «¿Olvidaste tu contraseña?»."; cuenta.msgTipo = "err"; render(); return; }
    fetch("https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=" + encodeURIComponent(FB.apiKey), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email: em })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message || "ERROR");
      cuenta.msg = "Te enviamos un correo a " + em + " para crear una contraseña nueva. Revisa también spam."; cuenta.msgTipo = "ok";
    }).catch(function (e) {
      cuenta.msg = /EMAIL_NOT_FOUND/.test(e.message) ? "Ese correo no tiene cuenta. Créala primero." : "No se pudo enviar el correo (" + e.message + ").";
      cuenta.msgTipo = "err";
    }).then(function () { render(); var f = document.getElementById("l-email"); if (f) f.value = em; });
  }
  function trasEntrar() {
    admin.puede = esAdmin();
    cuenta.msg = ""; cuenta.msgTipo = "";
    if (admin.puede) { cuenta.modo = null; admin.abierto = true; render(); return; }
    cuenta.modo = "perfil"; render(); cargarPerfil();
  }
  document.addEventListener("submit", function (ev) {
    if (ev.target.id === "formLogin") {
      ev.preventDefault();
      var em = document.getElementById("l-email").value.trim(), pw = document.getElementById("l-pass").value;
      var st = ev.target.querySelector('[role="status"]'); if (st) { st.style.color = ""; st.textContent = "Entrando…"; }
      login(em, pw).then(trasEntrar).catch(function (e) {
        cuenta.msg = errAuth(e && e.message); cuenta.msgTipo = "err"; render();
        var f = document.getElementById("l-email"); if (f) f.value = em;
      });
    } else if (ev.target.id === "formTrade") {
      ev.preventDefault();
      var inp = document.getElementById("p-trade"), msgEl = document.getElementById("tradeMsg"), val = inp.value.trim();
      var nom = document.getElementById("p-nombre").value.trim(), wa = document.getElementById("p-wa").value.trim();
      if (!nom || !wa) { msgEl.style.color = "var(--danger)"; msgEl.textContent = "Nombre y WhatsApp no pueden quedar vacíos."; return; }
      if (!tradeValido(val)) { msgEl.style.color = "var(--danger)"; msgEl.textContent = "Ese link no parece un trade link de Steam. Cópialo completo."; return; }
      msgEl.style.color = ""; msgEl.textContent = "Guardando…";
      fsPedir("rayas_users/" + encodeURIComponent(uidSesion()) + "?updateMask.fieldPaths=nombre&updateMask.fieldPaths=whatsapp&updateMask.fieldPaths=tradelink&currentDocument.exists=true", {
        method: "PATCH", body: JSON.stringify({ fields: { nombre: { stringValue: nom }, whatsapp: { stringValue: wa }, tradelink: { stringValue: val } } })
      }).then(function (r) {
        if (!r.ok) throw new Error("Error " + r.status);
        if (cuenta.perfil) { cuenta.perfil.nombre = nom; cuenta.perfil.whatsapp = wa; cuenta.perfil.tradelink = val; }
        render(); var m2 = document.getElementById("tradeMsg"); if (m2) { m2.style.color = "var(--ok)"; m2.textContent = "✔ Cambios guardados."; }
      }).catch(function (e) { msgEl.style.color = "var(--danger)"; msgEl.textContent = "No se pudo guardar (" + e.message + ")."; });
    } else if (ev.target.id === "formCompletar") {
      ev.preventDefault();
      var ses = leerSesion(), vc = function (id) { return document.getElementById(id).value.trim(); };
      var dc = { nombre: vc("c-nombre"), whatsapp: vc("c-wa"), email: ses && ses.email || "", tradelink: vc("c-trade") };
      if (!tradeValido(dc.tradelink)) {
        var tc = document.getElementById("c-trade");
        tc.setCustomValidity("Pega tu trade link completo: https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"); tc.reportValidity();
        tc.addEventListener("input", function () { tc.setCustomValidity(""); }, { once: true });
        return;
      }
      var sc = ev.target.querySelector('[role="status"]'); if (sc) { sc.style.color = ""; sc.textContent = "Guardando…"; }
      crearPerfil(ses, dc).then(function () {
        cuenta.perfil = { uid: ses.uid, nombre: dc.nombre, whatsapp: dc.whatsapp, email: dc.email, tradelink: dc.tradelink, creditos: 0 };
        cuenta.modo = "perfil"; cuenta.msg = ""; render(); cargarParts();
      }).catch(function (e) { cuenta.msg = "No se pudo guardar tu perfil (" + (e && e.message) + "). Avísale al encargado."; cuenta.msgTipo = "err"; render(); });
    } else if (ev.target.id === "formRegistro") {
      ev.preventDefault();
      var v = function (id) { return document.getElementById(id).value.trim(); };
      var datos = { nombre: v("r-nombre"), whatsapp: v("r-wa"), email: v("r-email"), tradelink: v("r-trade") }, pass = document.getElementById("r-pass").value;
      if (!tradeValido(datos.tradelink)) {
        var ti = document.getElementById("r-trade");
        ti.setCustomValidity("Pega tu trade link completo: https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"); ti.reportValidity();
        ti.addEventListener("input", function () { ti.setCustomValidity(""); }, { once: true });
        return;
      }
      var st2 = ev.target.querySelector('[role="status"]'); if (st2) { st2.style.color = ""; st2.textContent = "Creando tu cuenta…"; }
      function entrarConPerfil(ses) {
        /* El correo ya existía (p. ej. cliente de LitleJacob o registro a medias): si la contraseña coincide, solo completamos el perfil. */
        return fsPedir("rayas_users/" + encodeURIComponent(ses.uid)).then(function (r) {
          if (r.status === 404) return crearPerfil(ses, datos);
          if (!r.ok) throw new Error("PERFIL_" + r.status);
          return "EXISTE";
        });
      }
      registrar(datos.email, pass).then(function (ses) { return crearPerfil(ses, datos); }, function (e) {
        if (!/EMAIL_EXISTS/.test(String(e && e.message))) throw e;
        return login(datos.email, pass).then(entrarConPerfil, function () { throw new Error("EMAIL_EXISTS_PASS"); });
      }).then(function (res) {
        if (res === "EXISTE") { cuenta.modo = "perfil"; cuenta.msg = ""; render(); cargarPerfil(); return; }
        cuenta.perfil = { uid: uidSesion(), nombre: datos.nombre, whatsapp: datos.whatsapp, email: datos.email, tradelink: datos.tradelink, creditos: 0 };
        cuenta.modo = "perfil"; cuenta.msg = ""; render();
      }).catch(function (e) {
        var m = String(e && e.message || "");
        cuenta.msg = /^PERFIL_/.test(m) ? "Tu usuario se creó, pero no se pudo guardar tu perfil (" + m + "). Avísale al encargado." : (m === "EMAIL_EXISTS_PASS" ? "Ese correo ya tiene una cuenta (quizá de LitleJacob Store) y la contraseña no coincide. Entra con tu contraseña o recupérala con «¿Olvidaste tu contraseña?»." : errAuth(m));
        cuenta.msgTipo = "err";
        if (m === "EMAIL_EXISTS_PASS") { cuenta.modo = "login"; render(); var le = document.getElementById("l-email"); if (le) le.value = datos.email; return; }
        render();
        ["r-nombre", "r-wa", "r-email", "r-trade"].forEach(function (id, i) { var el = document.getElementById(id); if (el) el.value = [datos.nombre, datos.whatsapp, datos.email, datos.tradelink][i]; });
      });
    }
  });

  function cargarPerfil() {
    var uid = uidSesion();
    if (!uid || esAdmin()) return Promise.resolve();
    return fsPedir("rayas_users/" + encodeURIComponent(uid)).then(function (r) {
      if (r.status === 404) { cuenta.modo = "completar"; cuenta.msg = ""; cuenta.msgTipo = ""; render(); return null; }
      if (!r.ok) throw new Error("No se pudo cargar tu cuenta (" + r.status + ").");
      return r.json();
    }).then(function (d) { if (!d) return; cuenta.perfil = leerPerfilDoc(d); cuenta.msg = ""; render(); cargarParts(); })
      .catch(function (e) {
        if (e && e.message === "NO_SESSION") { guardarSesion(null); cuenta.perfil = null; cuenta.modo = null; render(); return; }
        cuenta.msg = e.message; render();
      });
  }

  document.addEventListener("keydown", function (ev) {
    var e = ev.target.closest && ev.target.closest("[data-edit]");
    if (e && ev.key === "Enter") { ev.preventDefault(); e.blur(); return; }
    if (ev.key !== "Escape") return;
    if (e) { e.blur(); return; }
    if (modal && modal.tipo !== "cargando") { modal = null; render(); }
    else if (elegirAbierto) { elegirAbierto = false; render(); }
    else if (cuenta.modo) { cuenta.modo = null; quitarHash(); render(); }
    else if (admin.abierto && !admin.editando) { admin.abierto = false; quitarHash(); render(); }
  });

  document.addEventListener("paste", function (ev) {
    var e = ev.target.closest && ev.target.closest("[data-edit]");
    if (!e) return;
    ev.preventDefault();
    var txt = (ev.clipboardData && ev.clipboardData.getData("text/plain")) || "";
    document.execCommand("insertText", false, txt.replace(/\s+/g, " "));
  });
  // Al terminar de editar un texto, vuelve a dibujar la página (si no pasaste a otro texto editable).
  document.addEventListener("focusout", function (ev) {
    if (!(ev.target.closest && ev.target.closest("[data-edit]"))) return;
    setTimeout(function () {
      var a = document.activeElement;
      if (a && a.closest && (a.closest("[data-edit]") || a.closest(".imgform"))) return;
      render();
    }, 0);
  });
  document.addEventListener("submit", function (ev) {
    if (!ev.target.classList || !ev.target.classList.contains("imgform")) return;
    ev.preventDefault();
    var k = buscarPremio(ev.target.getAttribute("data-id"));
    var inp = ev.target.querySelector("input");
    var u = inp ? inp.value.trim() : "";
    if (u && !safeImg(u)) { inp.setCustomValidity("El link debe empezar con https://"); inp.reportValidity(); inp.setCustomValidity(""); return; }
    if (k >= 0) { estado.premios[k].img = u; marcarSucio(); }
    admin.imgEdit = null; render();
  });

  window.addEventListener("beforeunload", function (ev) {
    if (sucio && admin.puede) { ev.preventDefault(); ev.returnValue = ""; }
  });

  var sigFases = "";
  function firmaFases() { return estado.premios.map(function (p) { return p.id + fase(p); }).join("|"); }
  setInterval(function () {
    var sf = firmaFases();
    if (sigFases && sf !== sigFases && !modal && !vivo()) { sigFases = sf; render(); return; }
    sigFases = sf;
    var els = document.querySelectorAll(".timer[data-cierre]");
    for (var k = 0; k < els.length; k++) els[k].textContent = restante(els[k].getAttribute("data-cierre"));
  }, 30000);

  /* ================= Inicio ================= */
  function cargarRemoto() {
    return fetch(DOC_URL, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var txt = d && d.fields && d.fields.json && d.fields.json.stringValue;
      if (!txt) return;
      publicado = normalizar(JSON.parse(txt));
      if (!sucio) { estado = clone(publicado); render(); }
    }).catch(function () { /* se queda con los datos incluidos en la página */ });
  }
  function revisarHash() {
    if (location.hash !== "#admin") return;
    if (admin.puede) admin.abierto = true; else cuenta.modo = "login";
    render();
  }
  window.addEventListener("hashchange", revisarHash);

  render();
  cargarRemoto();
  cargarParts();
  revisarHash();
  if (leerSesion() && !admin.puede) cargarPerfil();
})();
