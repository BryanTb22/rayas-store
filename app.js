(function () {
  "use strict";

  /* ================= Firebase (mismo proyecto que LitleJacob Store) ================= */
  var FB = { apiKey: "AIzaSyDbyLi7IK3ikwUp7A0VzRRqPucqRXPpL3E", projectId: "litlejacob-store" };
  var DOC_URL = "https://firestore.googleapis.com/v1/projects/" + FB.projectId + "/databases/(default)/documents/rayas/estado";
  var SES_KEY = "rayas_admin_ses";
  var ADMIN_UID = "eLEZkdXiG5b0PpxHQCCei8D0Qxy1";
  var BASE = "https://firestore.googleapis.com/v1/projects/" + FB.projectId + "/databases/(default)/documents/";

  /* ================= Pagos (Culqi) =================
     culqiPk = llave PÚBLICA de Culqi (pk_test_… para probar, pk_live_… para cobrar de verdad).
     Mientras esté vacía, la página NO muestra el pago y sigue pidiendo créditos por WhatsApp.
     Los precios de aquí son solo para mostrarlos: el cobro real usa functions/packs.js. */
  var PAGOS = {
    culqiPk: "pk_test_iK8JCBNB6dJmRlUZ",
    // true = el pago solo aparece si la dirección lleva ?pagotest=1 (para probar en la web real sin que lo vean los clientes).
    // Cuando pases a llaves reales (pk_live_…) y todo funcione, ponlo en false.
    soloPrueba: true,
    min: 3, max: 500, minYape: 6,   // monto libre (solo para mostrar; el servidor valida lo mismo en functions/packs.js)
    url: "https://us-central1-" + FB.projectId + ".cloudfunctions.net/cobrar",
    js: "https://checkout.culqi.com/js/v4"
  };
  var PACKS_UI = [
    { id: "p10", soles: 10, base: 10 },
    { id: "p20", soles: 20, base: 20 },
    { id: "p50", soles: 50, base: 50, promo: 55 },
    { id: "p100", soles: 100, base: 100, promo: 110 }
  ];
  function pagosOn() { return !!PAGOS.culqiPk && (!PAGOS.soloPrueba || /[?&]pagotest=1(&|$)/.test(location.search)); }

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

  /* ================= Entrar con Google ================= */
  var GOOGLE_CLIENT_ID = "547624378539-m3dct3sir3r9vbe51hm6q1ojejg1i14q.apps.googleusercontent.com";
  function loginGoogle(cred) {
    return fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=" + encodeURIComponent(FB.apiKey), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postBody: "id_token=" + cred + "&providerId=google.com", requestUri: location.origin, returnIdpCredential: true, returnSecureToken: true })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.idToken) throw new Error((j.error && j.error.message) || "LOGIN_FAILED");
      var s = { id: j.idToken, ref: j.refreshToken, exp: Date.now() + (Number(j.expiresIn) || 3600) * 1000 - 60000, email: j.email, uid: j.localId };
      guardarSesion(s); return s;
    });
  }
  var gsiCarga = null;
  function montarGoogle() {
    var el = document.getElementById("g-btn");
    if (!el || !GOOGLE_CLIENT_ID) return;
    if (!gsiCarga) gsiCarga = new Promise(function (ok, no) {
      var sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true;
      sc.onload = ok; sc.onerror = function () { gsiCarga = null; no(); }; document.head.appendChild(sc);
    });
    gsiCarga.then(function () {
      var el2 = document.getElementById("g-btn"); if (!el2 || !window.google) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: function (resp) {
        cuenta.msg = "Entrando con Google…"; cuenta.msgTipo = ""; render();
        loginGoogle(resp.credential).then(trasEntrar).catch(function (e) {
          cuenta.msg = "No se pudo entrar con Google (" + ((e && e.message) || "error") + ")."; cuenta.msgTipo = "err"; render();
        });
      } });
      window.google.accounts.id.renderButton(el2, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", locale: "es", width: 320 });
    }).catch(function () { /* sin conexión con Google */ });
  }
  function btnGoogle() { return GOOGLE_CLIENT_ID ? '<div id="g-btn" class="gbtn"></div><div class="gsep"><span>o con tu correo</span></div>' : ""; }
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
      creado: f.creado && f.creado.timestampValue || "",
      promoUsada: !!(f.promoUsada && f.promoUsada.booleanValue === true)
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
    titulo: "Gana items de Dota 2",
    subtitulo: "Recarga tus créditos, elige el premio que quieres y entra a la rifa. El ganador sale al azar.",
    logo1: "RAYAS", logo2: "STORE",
    kicker: "Rifas de Dota 2",
    btnVer: "Ver rifas", btnCreditos: "Recargar créditos",
    badge1: "Promo primera recarga", badge2: "Ganador al azar", badge3: "Entrega por Steam",
    rifasKicker: "Premios en juego", rifasT1: "Rifas", rifasT2: "activas", rifasSub: "Cada premio indica cuántos créditos cuesta entrar.",
    vacioT: "Pronto nuevas rifas", vacioS: "Recarga tus créditos y te avisamos cuando abra la próxima.",
    msgCredPerfil: "¡Hola! 👋🔥 Soy *{nombre}* (📧 {correo}).\n\n💎 Quiero recargar créditos para participar en las rifas de *RAYAS STORE* 🎁🏆\n\n¿Me ayudas con mi recarga? 🙏✨",
    msgCredVisita: "¡Hola! 👋🔥 Quiero mis créditos para las rifas de *RAYAS STORE* 💎🎁\n\n¿Me ayudas? 🙏✨",
    btnParticipar: "Participar", btnPronto: "Muy pronto", lblCreditos: "créditos",
    comoKicker: "Paso a paso", comoT1: "Cómo", comoT2: "participar",
    paso1T: "Crea tu cuenta", paso1: "Regístrate con tu correo o con Google y deja tu link de intercambio de Steam.",
    paso2T: "Recarga créditos", paso2: "Recarga desde tu cuenta (S/ 1 = 1 crédito). Tu primera recarga puede traer créditos de regalo.",
    paso3T: "Entra a la rifa", paso3: "Elige el premio y usa tus créditos. Al cierre, el ganador sale al azar.",
    btnCreditos2: "Recargar mis créditos",
    ganKicker: "Salón de la fama", ganT: "Ganadores", ganVacioT: "Aún no hay ganadores", ganVacioS: "Cuando cierre la primera rifa, el ganador aparecerá aquí.",
    reglasKicker: "Juego limpio", reglasT: "Reglas",
    pie: "No afiliado a Valve. Dota 2 es una marca de Valve Corporation.",
    reglas: [
      "Los créditos se compran en esta página (S/ 1 = 1 crédito) y solo sirven para participar en las rifas.",
      "Los créditos usados en una rifa no se devuelven. Si hay un error en tu recarga, escríbenos por WhatsApp.",
      "Los pagos se procesan con Culqi (tarjeta; Yape / QR desde S/ 6). Esta página no guarda los datos de tu tarjeta.",
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
    var fo = st.fotos && typeof st.fotos === "object" ? st.fotos : {};
    st.fotos = {}; ["logo", "hero", "lava", "sombra"].forEach(function (k) { st.fotos[k] = /^fs:img-[\w\-]+$/.test(String(fo[k] || "")) ? fo[k] : ""; });
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
    var base = p ? String(T.msgCredPerfil).replace(/\{nombre\}/g, p.nombre).replace(/\{correo\}/g, p.email) : String(T.msgCredVisita);
    if (montoWsp > 0 && p) base += "\n\n💰 Quiero recargar *S/ " + montoWsp + "* (" + creditosPara(montoWsp) + " créditos).";
    return base;
  }
  function creditoHref() {
    var a = contactos();
    return a.length > 1 ? "#elegir" : (a.length === 1 ? waLinkA(a[0].numero, msgCred(cuenta.perfil)) : "");
  }
  var elegirAbierto = false, modal = null, partes = {}, misParts = {};
  var montoWsp = 0;   // monto elegido para pedir por WhatsApp (0 = ninguno)
  // Créditos que recibe por un monto (solo para mostrar; el servidor calcula el real).
  function creditosPara(soles) {
    var pk = PACKS_UI.filter(function (x) { return x.soles === soles; })[0];
    return (pk && pk.promo && cuenta.perfil && !cuenta.perfil.promoUsada) ? pk.promo : soles;
  }
  function cargarParts(tok) {
    var acc = {}, uid = uidSesion();
    function pag(t) {
      return fetch(BASE + "rayas_part?pageSize=300" + (t ? "&pageToken=" + encodeURIComponent(t) : "")).then(function (r) { return r.ok ? r.json() : { documents: [] }; }).then(function (j) {
        (j.documents || []).forEach(function (d) {
          var f = d.fields || {}, pid = f.premio && f.premio.stringValue;
          if (!pid) return;
          (acc[pid] = acc[pid] || []).push({ uid: f.uid && f.uid.stringValue || "", nombre: f.nombre && f.nombre.stringValue || "", costo: Number(f.costo && f.costo.integerValue || 0), cantidad: Math.max(1, Number(f.cantidad && f.cantidad.integerValue || 1)), creado: f.creado && f.creado.timestampValue || "", premioNombre: f.premioNombre && f.premioNombre.stringValue || "" });
        });
        return j.nextPageToken && Object.keys(acc).length < 1000 ? pag(j.nextPageToken) : null;
      });
    }
    return pag("").then(function () {
      partes = acc; misParts = {};
      Object.keys(acc).forEach(function (pid) { acc[pid].forEach(function (x) { if (uid && x.uid === uid) misParts[pid] = (misParts[pid] || 0) + x.cantidad; }); });
      render();
    }).catch(function () { /* sin conteo */ });
  }
  function tomados(pid) { return (partes[pid] || []).reduce(function (a, x) { return a + (x.cantidad || 1); }, 0); }
  function iniciarParticipar(id) {
    var k = buscarPremio(id); if (k < 0) return;
    var p = estado.premios[k], cost = num(p.creditos, 0), info = { id: p.id, nombre: p.nombre, cred: cost };
    if (admin.puede) { modal = { tipo: "error", msg: "Estás con la cuenta de administrador. Para participar entra con una cuenta de usuario." }; render(); return; }
    if (!cuenta.perfil) {
      if (leerSesion()) { modal = { tipo: "error", msg: "Estamos cargando tu cuenta. Intenta de nuevo en un momento." }; cargarPerfil(); }
      else { cuenta.modo = "registro"; cuenta.msg = "Para participar primero crea una cuenta en la página."; cuenta.msgTipo = "err"; }
      render(); return;
    }
    var fp = fase(p);
    if (fp === "oculta") { modal = { tipo: "error", msg: "Esta rifa no está disponible por ahora." }; render(); return; }
    if (fp === "porIniciar" || fp === "proxima") { modal = { tipo: "error", msg: "Esta rifa aún no abre" + (p.inicio ? ": empieza el " + fechaHora(p.inicio) + "." : ".") }; render(); return; }
    if (fp === "vencida" || fp === "cerrada") { modal = { tipo: "error", msg: "Esta rifa ya cerró. Espera el resultado. 🍀" }; render(); return; }
    var mio = misParts[id] || 0, cupos = num(p.cupos, 0), tope = num(p.maxPorUsuario, 0);
    var libres = cupos > 0 ? cupos - Math.max(num(p.participantes, 0), tomados(id)) : 100;
    var permitidos = tope > 0 ? tope - mio : 100;
    var puedePagar = cost > 0 ? Math.floor(cuenta.perfil.creditos / cost) : 100;
    if (libres <= 0) { modal = { tipo: "error", msg: "Ya no quedan cupos en esta rifa." }; render(); return; }
    if (permitidos <= 0) { modal = { tipo: "error", msg: "Ya tienes el máximo de cupos permitido en esta rifa (" + tope + ")." }; render(); return; }
    if (puedePagar < 1) { modal = { tipo: "sinSaldo", p: info }; render(); return; }
    modal = { tipo: "confirmar", p: info, qty: 1, max: Math.max(1, Math.min(100, libres, permitidos, puedePagar)), mio: mio, tope: tope }; render();
  }
  function confirmarPart() {
    var m = modal; if (!m || !m.p || !cuenta.perfil) return;
    var p = m.p, qty = m.qty || 1, total = qty * p.cred, uid = uidSesion(), base = "projects/" + FB.projectId + "/databases/(default)/documents/";
    var ex = (partes[p.id] || []).filter(function (x) { return x.uid === uid; })[0];
    modal = { tipo: "cargando" }; render();
    var nombre = base + "rayas_part/" + p.id + "_" + uid, w1;
    if (ex) {
      w1 = { update: { name: nombre, fields: { cantidad: { integerValue: String(ex.cantidad + qty) }, costo: { integerValue: String((ex.costo || 0) + total) } } },
        updateMask: { fieldPaths: ["cantidad", "costo"] }, currentDocument: { exists: true } };
    } else {
      w1 = { update: { name: nombre, fields: { uid: { stringValue: uid }, nombre: { stringValue: cuenta.perfil.nombre }, premio: { stringValue: p.id }, premioNombre: { stringValue: p.nombre }, costo: { integerValue: String(total) }, cantidad: { integerValue: String(qty) }, creado: { timestampValue: new Date().toISOString() } } }, currentDocument: { exists: false } };
    }
    var body = { writes: [w1, { transform: { document: base + "rayas_users/" + uid, fieldTransforms: [{ fieldPath: "creditos", increment: { integerValue: String(-total) } }] } }] };
    token().then(function (tk) {
      return fetch(BASE.replace(/documents\/$/, "documents:commit"), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify(body) });
    }).then(function (r) {
      if (r.status === 409) throw new Error("Tu participación cambió. Refresca la página e intenta de nuevo.");
      if (!r.ok) throw new Error("No se pudo registrar tu participación (" + r.status + "). Si sigue pasando, avisa al encargado.");
      cuenta.perfil.creditos -= total; misParts[p.id] = (misParts[p.id] || 0) + qty;
      if (ex) { ex.cantidad += qty; ex.costo = (ex.costo || 0) + total; }
      else (partes[p.id] = partes[p.id] || []).push({ uid: uid, nombre: cuenta.perfil.nombre, costo: total, cantidad: qty, creado: new Date().toISOString(), premioNombre: p.nombre });
      modal = { tipo: "ok", p: p, qty: qty, mio: misParts[p.id] }; render();
    }).catch(function (e) { modal = { tipo: "error", msg: (e && e.message) || "No se pudo participar." }; render(); });
  }
  /* ---- Recarga de créditos con Culqi ---- */
  var culqiCarga = null;
  function cargarCulqi() {
    if (window.Culqi) return Promise.resolve();
    if (!culqiCarga) culqiCarga = new Promise(function (ok, no) {
      var sc = document.createElement("script"); sc.src = PAGOS.js; sc.async = true;
      sc.onload = ok; sc.onerror = function () { culqiCarga = null; no(new Error("No se pudo cargar el pago. Revisa tu conexión e intenta de nuevo.")); };
      document.head.appendChild(sc);
    });
    return culqiCarga;
  }
  function abrirRecarga() {
    if (admin.puede) { modal = { tipo: "error", msg: "Estás con la cuenta de administrador. Entra con una cuenta de usuario para recargar." }; render(); return; }
    if (!cuenta.perfil) {
      if (leerSesion()) { modal = { tipo: "error", msg: "Estamos cargando tu cuenta. Intenta de nuevo en un momento." }; cargarPerfil(); }
      else { cuenta.modo = "registro"; cuenta.msg = "Para recargar primero crea una cuenta en la página."; cuenta.msgTipo = "err"; }
      render(); return;
    }
    modal = { tipo: "recarga" }; render();
  }
  function iniciarPago(soles) {
    soles = Number(soles);
    if (!cuenta.perfil || !(soles >= PAGOS.min && soles <= PAGOS.max) || Math.floor(soles) !== soles) return;
    modal = { tipo: "cargando" }; render();
    cargarCulqi().then(function () {
      var C = window.Culqi;
      window.culqi = function () {   // Culqi llama a esta función cuando termina el pago en su ventana
        if (C.token && C.token.id) { var tid = C.token.id; try { C.close(); } catch (e) { /* ya cerrada */ } cobrarToken(soles, tid); }
        else { modal = { tipo: "error", msg: (C.error && (C.error.user_message || C.error.merchant_message)) || "No se pudo procesar el pago." }; render(); }
      };
      C.publicKey = PAGOS.culqiPk;
      C.settings({ title: "Rayas Store", currency: "PEN", description: "Recarga de créditos", amount: soles * 100 });
      C.options({ lang: "es", installments: false, paymentMethods: { tarjeta: true, yape: true, billetera: false, bancaMovil: false, agente: false, cuotealo: false } });
      modal = null; render(); C.open();
    }).catch(function (e) { modal = { tipo: "error", msg: (e && e.message) || "No se pudo abrir el pago." }; render(); });
  }
  function cobrarToken(soles, tokenId) {
    modal = { tipo: "cargando" }; render();
    token().then(function (tk) {
      return fetch(PAGOS.url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ soles: soles, tokenId: tokenId }) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (x) {
      if (!x.ok || !x.j.ok) throw new Error(x.j.error || "No se pudo confirmar el pago. Si te cobraron, escríbenos por WhatsApp con tu correo; no pagues otra vez.");
      cuenta.perfil.creditos = Number(x.j.saldo) || (cuenta.perfil.creditos + Number(x.j.creditos || 0));
      if (x.j.promo) cuenta.perfil.promoUsada = true;
      modal = { tipo: "recargaOk", creditos: x.j.creditos, promo: !!x.j.promo }; render();
    }).catch(function (e) { modal = { tipo: "error", msg: (e && e.message) || "No se pudo completar el pago." }; render(); });
  }
  // Botón "recargar": abre el pago si está activo, si no cae al WhatsApp de siempre.
  function btnRecargar(cls, key, href) {
    if (vivo() || !pagosOn()) return href || vivo() ? lnk(cls, href, key, true) : "";
    return '<button class="' + cls + '" type="button" data-a="recargar">' + esc(estado.textos[key]) + '</button>';
  }

  function modalAviso() {
    var m = modal, c = cuenta.perfil, h = "", btns = "";
    var cerrar = '<button class="btn btn-ghost btn-sm" type="button" data-a="cerrarModal">Cerrar</button>';
    if (m.tipo === "sinSaldo") {
      var rl = creditoHref();
      h = '<h3>Créditos insuficientes 😕</h3><p class="hint">La rifa de <b>' + esc(m.p.nombre) + '</b> cuesta <b>' + m.p.cred + '</b> créditos y tú tienes <b>' + (c ? c.creditos : 0) + '</b>. Recarga créditos para poder participar.</p>';
      btns = (pagosOn() ? '<button class="btn btn-fuchsia" type="button" data-a="recargar">💳 Recargar créditos</button>' : '') +
        (rl ? '<a class="btn btn-yellow" href="' + esc(rl) + '"' + (rl === "#elegir" ? ' data-a="elegir"' : ' target="_blank" rel="noopener"') + '>💎 ' + (pagosOn() ? 'Pedir por WhatsApp' : 'Recargar créditos') + '</a>' : '') + cerrar;
    } else if (m.tipo === "recarga") {
      var primera = !!(c && !c.promoUsada), sel = m.sel || 0, cred = sel ? creditosPara(sel) : 0;
      h = '<h3>Recargar créditos 💎</h3>' +
        (primera ? '<div class="promo-banner"><b>🎁 PROMO PRIMERA RECARGA</b><span>S/ 50 → <b>55</b> créditos · S/ 100 → <b>110</b> créditos</span></div>' : '') +
        '<p class="hint"><b>1.</b> Elige cuánto quieres recargar (S/ 1 = 1 crédito)</p>' +
        '<div class="packs">' + PACKS_UI.map(function (pk) {
          var extra = primera && pk.promo ? pk.promo : 0;
          return '<button class="btn ' + (extra ? 'btn-fuchsia' : 'btn-yellow') + ' pack' + (sel === pk.soles ? ' sel' : '') + '" type="button" data-a="monto" data-s="' + pk.soles + '" aria-pressed="' + (sel === pk.soles) + '">' +
            (extra ? '<i class="tag">🎁 +' + (extra - pk.base) + ' GRATIS</i>' : '') +
            '<b>S/ ' + pk.soles + '</b><span>' + (extra || pk.base) + ' créditos</span></button>';
        }).join("") + '</div>' +
        '<div class="otro"><label for="monto-otro">Otro monto (S/ ' + PAGOS.min + ' a S/ ' + PAGOS.max + ')</label>' +
        '<div class="otrorow"><input id="monto-otro" type="number" inputmode="numeric" min="' + PAGOS.min + '" max="' + PAGOS.max + '" step="1" placeholder="Ej. 30" value="' + esc(m.otro || "") + '">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-a="montoOtro">Usar</button></div></div>' +
        (m.err ? '<p class="hint" style="color:var(--danger)" role="alert">' + esc(m.err) + '</p>' : '') +
        (sel ? '<p class="resumen">Pagas <b>S/ ' + sel + '</b> y recibes <b>' + cred + ' créditos</b>' + (cred > sel ? ' 🎁' : '') + '</p>' +
          '<p class="hint"><b>2.</b> Elige cómo quieres pagar</p>' : '');
      btns = (sel ? '<button class="btn btn-fuchsia" type="button" data-a="pagarCulqi">💳 Pagar con tarjeta · al instante</button>' +
        '<button class="btn btn-yellow" type="button" data-a="recargaWsp">💬 Pagar por WhatsApp</button>' : '') +
        '<p class="hint" style="font-size:.78rem;opacity:.85">Tarjeta: pago seguro con Culqi desde S/ ' + PAGOS.min + ', tus créditos se suman solos. <b>Yape / QR: desde S/ ' + PAGOS.minYape + '</b> (si no te aparece en el pago, usa tarjeta o WhatsApp).</p>' +
        '<p class="hint" style="font-size:.78rem;opacity:.85">¿Montos menores a S/ ' + PAGOS.minYape + ' con Yape, o prefieres pagar con una persona? Elige <b>Pagar por WhatsApp</b> y te atiende el encargado, que carga tus créditos él mismo. Los créditos usados en una rifa no se devuelven.</p>' + cerrar;
    } else if (m.tipo === "recargaOk") {
      h = '<h3>¡Recarga lista! 🎉</h3><p class="hint">Se sumaron <b>' + m.creditos + '</b> créditos' + (m.promo ? ' (incluye tu regalo de primera recarga 🎁)' : '') + '. Ahora tienes <b>' + (c ? c.creditos : 0) + '</b>.</p>';
      btns = '<button class="btn btn-yellow" type="button" data-a="cerrarModal">Ver rifas</button>';
    } else if (m.tipo === "confirmar") {
      var tot = m.qty * m.p.cred;
      h = '<h3>¿Entrar a la rifa? 🎟️</h3><p class="hint">Rifa: <b>' + esc(m.p.nombre) + '</b> · ' + m.p.cred + ' créditos por cupo.' + (m.mio ? ' Ya tienes <b>' + m.mio + '</b> ' + (m.mio === 1 ? 'cupo' : 'cupos') + '.' : '') + '</p>' +
        '<div class="qty" role="group" aria-label="Cantidad de cupos"><button type="button" data-a="qtyMenos"' + (m.qty <= 1 ? ' disabled' : '') + ' aria-label="Menos">−</button><span><b>' + m.qty + '</b><small>' + (m.qty === 1 ? 'cupo' : 'cupos') + '</small></span><button type="button" data-a="qtyMas"' + (m.qty >= m.max ? ' disabled' : '') + ' aria-label="Más">+</button></div>' +
        '<p class="hint">Total: <b>' + tot + '</b> créditos. Te quedarán <b>' + (c.creditos - tot) + '</b>.' + (m.max < 100 ? ' Máximo ahora: ' + m.max + '.' : '') + ' Más cupos = más chances de ganar 🍀</p>';
      btns = '<button class="btn btn-yellow" type="button" data-a="confirmarPart">✔ Confirmar ' + m.qty + (m.qty === 1 ? ' cupo' : ' cupos') + '</button><button class="btn btn-ghost btn-sm" type="button" data-a="cerrarModal">Cancelar</button>';
    } else if (m.tipo === "cargando") {
      h = '<h3>Procesando…</h3><p class="hint">Un momento por favor.</p>';
    } else if (m.tipo === "ok") {
      h = '<h3>¡Ya estás participando! 🎉</h3><p class="hint">Tomaste <b>' + m.qty + '</b> ' + (m.qty === 1 ? 'cupo' : 'cupos') + ' en la rifa de <b>' + esc(m.p.nombre) + '</b> (en total tienes <b>' + m.mio + '</b>). Te quedan <b>' + (c ? c.creditos : 0) + '</b> créditos. ¡Mucha suerte! 🍀🏆</p>';
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

  /* ================= Ruleta ================= */
  var ruleta = null, RCOL = [["#d94a3a", "#9c1f1b", "#5a0d0d"], ["#38b07e", "#1d7a54", "#0b3d2a"], ["#e8b93d", "#a8741a", "#5e3d08"], ["#9a63d6", "#5f3399", "#2c1450"], ["#3d94e0", "#1f5f9f", "#0d2c52"], ["#ec5fa0", "#a52a68", "#521232"]];
  function ruletaSegs(lista) {
    var tot = 0; lista.forEach(function (x) { tot += (x.cantidad || x.c || 1); });
    var acc = 0;
    return lista.map(function (x, i) {
      var c = x.cantidad || x.c || 1, a0 = acc / tot * 360; acc += c;
      return { uid: x.uid || "", n: String(x.nombre || x.n || "?").slice(0, 24), c: c, a0: a0, a1: acc / tot * 360, col: RCOL[i % RCOL.length] };
    });
  }
  function abrirRuleta(pid) {
    var k = buscarPremio(pid), lp = k >= 0 ? (partes[estado.premios[k].id] || []) : [];
    if (!lp.length) return;
    var segs = ruletaSegs(lp), tot = 0; segs.forEach(function (g) { tot += g.c; });
    var r = Math.random() * tot, w = 0, ac = 0;
    for (var i = 0; i < segs.length; i++) { ac += segs[i].c; if (r < ac) { w = i; break; } }
    var g = segs[w], off = (Math.random() * 0.7 - 0.35) * (g.a1 - g.a0), th = (g.a0 + g.a1) / 2 + off;
    var rot = 360 * 6 + ((360 - th) % 360 + 360) % 360;
    ruleta = { modo: "sorteo", pid: pid, segs: segs, w: w, rot: rot, dur: 7000, fin: false, run: false };
    render();
  }
  function abrirRepeticion(pid) {
    var k = buscarPremio(pid); if (k < 0) return;
    var rp = estado.premios[k].replay; if (!rp || !rp.segs || !rp.segs.length) return;
    ruleta = { modo: "replay", pid: pid, segs: ruletaSegs(rp.segs), w: rp.w, rot: rp.rot, dur: rp.dur || 7000, fin: false, run: false, fecha: rp.fecha };
    render();
  }
  var rLogo = null;
  function ruletaDibujar(rotDeg, t) {
    var cv = document.getElementById("ruleta-cv"); if (!cv || !ruleta) return;
    if (!rLogo) { rLogo = new Image(); rLogo.src = "img/logo.webp"; rLogo.onload = function () { ruletaDibujar(ruleta && ruleta.fin ? ruleta.rot : (ruleta ? ruleta.rotAct || 0 : 0), 0); }; }
    var ctx = cv.getContext("2d"), W = cv.width, cx = W / 2, R = W / 2 - 34, rim = R + 22, i, PI = Math.PI;
    t = t || 0; ruleta.rotAct = rotDeg;
    ctx.clearRect(0, 0, W, W);
    // aro exterior metálico dorado
    var gr = ctx.createLinearGradient(0, 0, W, W);
    gr.addColorStop(0, "#fff0b0"); gr.addColorStop(.35, "#c9921f"); gr.addColorStop(.6, "#6b4710"); gr.addColorStop(1, "#e8b93d");
    ctx.beginPath(); ctx.arc(cx, cx, rim + 10, 0, 2 * PI); ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cx, rim - 2, 0, 2 * PI); ctx.fillStyle = "#0a0f26"; ctx.fill();
    // luces del aro
    var N = 28;
    for (i = 0; i < N; i++) {
      var a = i / N * 2 * PI, on = ruleta.fin ? (Math.floor(t / 250) + i) % 2 === 0 : (ruleta.run ? (Math.floor(t / 90) + i) % 2 === 0 : i % 2 === 0);
      var bx = cx + Math.cos(a) * (rim + 4), by = cx + Math.sin(a) * (rim + 4);
      ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, 2 * PI);
      ctx.fillStyle = on ? "#fff3b8" : "#7a5a18"; ctx.shadowColor = on ? "#ffc93c" : "transparent"; ctx.shadowBlur = on ? 12 : 0; ctx.fill(); ctx.shadowBlur = 0;
    }
    // ruleta
    ctx.save(); ctx.translate(cx, cx); ctx.rotate((rotDeg - 90) * PI / 180);
    ruleta.segs.forEach(function (g, k) {
      var a0 = g.a0 * PI / 180, a1 = g.a1 * PI / 180, base = RCOL[k % RCOL.length];
      var rg = ctx.createRadialGradient(0, 0, R * .12, 0, 0, R);
      rg.addColorStop(0, base[0]); rg.addColorStop(.75, base[1]); rg.addColorStop(1, base[2]);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath();
      ctx.fillStyle = rg; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = "#f2c45a"; ctx.stroke();
      // texto
      ctx.save(); ctx.rotate((a0 + a1) / 2); ctx.textAlign = "right"; ctx.textBaseline = "middle";
      var fs = Math.max(12, Math.min(22, (a1 - a0) * R * 0.55));
      ctx.font = "700 " + fs + "px Cinzel, serif";
      ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 4; ctx.fillStyle = "#fff6d6";
      ctx.fillText(g.n, R - 20, 0); ctx.shadowBlur = 0; ctx.restore();
    });
    // brillo ganador
    if (ruleta.fin) {
      var gw = ruleta.segs[ruleta.w], pul = .5 + .5 * Math.sin(t / 220);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, gw.a0 * PI / 180, gw.a1 * PI / 180); ctx.closePath();
      ctx.fillStyle = "rgba(255,230,140," + (0.12 + 0.18 * pul) + ")"; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(255,240,170," + (0.7 + 0.3 * pul) + ")"; ctx.shadowColor = "#ffc93c"; ctx.shadowBlur = 18; ctx.stroke(); ctx.shadowBlur = 0;
    }
    // anillo interior
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 2 * PI); ctx.lineWidth = 5; ctx.strokeStyle = "#c9921f"; ctx.stroke();
    ctx.restore();
    // centro con logo
    ctx.beginPath(); ctx.arc(cx, cx, 50, 0, 2 * PI); ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cx, 43, 0, 2 * PI); ctx.fillStyle = "#0a0f26"; ctx.fill();
    if (rLogo && rLogo.complete && rLogo.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cx, 40, 0, 2 * PI); ctx.clip(); ctx.drawImage(rLogo, cx - 40, cx - 40, 80, 80); ctx.restore(); }
  }
  function ruletaBrillo() {
    var rt = ruleta, t0 = Date.now(); if (rt.brillo) return; rt.brillo = true;
    function f() { if (ruleta !== rt || !rt.fin || !document.getElementById("ruleta-cv")) return; ruletaDibujar(rt.rot, Date.now() - t0); requestAnimationFrame(f); }
    requestAnimationFrame(f);
  }
  function ruletaGirar() {
    if (!ruleta || ruleta.run) return;
    ruleta.run = true; ruleta.fin = false; var t0 = Date.now(), rt = ruleta;
    var btn = document.getElementById("ruleta-go"); if (btn) btn.disabled = true;
    function paso() {
      if (ruleta !== rt) return;
      var x = Math.min(1, (Date.now() - t0) / rt.dur), e = 1 - Math.pow(1 - x, 4);
      var ang = rt.rot * e; ruletaDibujar(ang, Date.now() - t0);
      var puntoA = (((-ang) % 360) + 360) % 360, idx = 0; rt.segs.forEach(function (g, q) { if (puntoA >= g.a0 && puntoA < g.a1) idx = q; });
      if (rt.ult !== undefined && rt.ult !== idx) { var pin = document.querySelector(".rpin"); if (pin) { pin.classList.remove("tick"); void pin.offsetWidth; pin.classList.add("tick"); } }
      rt.ult = idx;
      if (x < 1) { requestAnimationFrame(paso); return; }
      rt.run = false; rt.fin = true; ruletaFin();
    }
    requestAnimationFrame(paso);
  }
  function ruletaFin() {
    var rt = ruleta, g = rt.segs[rt.w];
    if (rt.modo === "sorteo") {
      var k = buscarPremio(rt.pid);
      if (k >= 0) {
        var p = estado.premios[k];
        p.ganador = g.n; p.ganadorUid = g.uid; p.resultado = new Date().toISOString(); p.estado = "cerrada";
        p.replay = { segs: rt.segs.map(function (y) { return { n: y.n, c: y.c }; }), w: rt.w, rot: rt.rot, dur: rt.dur, fecha: p.resultado };
        marcarSucio();
      }
    }
    render();
  }
  function modalRuleta() {
    var rt = ruleta, g = rt.segs[rt.w], p = estado.premios[buscarPremio(rt.pid)] || {};
    return '<div class="scrim scrim-top"></div><div class="elegir ruleta" role="dialog" aria-label="Ruleta"><h3>' + (rt.modo === "replay" ? '🎬 Repetición del sorteo' : '🎲 Sorteo') + ' · ' + esc(p.nombre || "") + '</h3>' +
      '<div class="rwrap"><div class="rpin"></div><canvas id="ruleta-cv" width="440" height="440"></canvas></div>' +
      (rt.fin ? '<div class="rwin">🏆 ¡Ganador: <b>' + esc(g.n) + '</b>!</div>' + (rt.modo === "replay" && rt.fecha ? '<p class="hint">Sorteo realizado: ' + esc(fechaHora(rt.fecha)) + '</p>' : '') : '<p class="hint">' + rt.segs.length + ' participante' + (rt.segs.length === 1 ? '' : 's') + '. Más cupos = más espacio en la ruleta.</p>') +
      '<div class="rbtns">' +
      (!rt.fin && !rt.run ? '<button class="btn btn-yellow" id="ruleta-go" type="button" data-a="ruletaGirar">' + (rt.modo === "replay" ? '▶ Ver repetición' : '🎰 ¡Girar!') + '</button>' : '') +
      (rt.fin && rt.modo === "sorteo" ? '<button class="btn btn-fuchsia" type="button" data-a="ruletaGuardar">Guardar y publicar resultado</button>' : '') +
      (rt.fin && rt.modo === "replay" ? '<button class="btn btn-ghost" type="button" data-a="ruletaOtra">↻ Ver otra vez</button>' : '') +
      (!rt.run ? '<button class="btn btn-ghost btn-sm" type="button" data-a="ruletaCerrar">Cerrar</button>' : '') + '</div></div>';
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
    if (p.estado === "oculta") return "oculta";
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
  function cargarFs(id) {
    if (IMG_CACHE[id]) return Promise.resolve(IMG_CACHE[id]);
    if (!IMG_PEND[id]) IMG_PEND[id] = fetch(DOC_URL.replace(/estado$/, id)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var u = d && d.fields && d.fields.data && d.fields.data.stringValue;
      if (u && /^data:image\/(webp|jpeg|png);base64,/.test(u)) IMG_CACHE[id] = u;
      return IMG_CACHE[id];
    }).catch(function () { return null; });
    return IMG_PEND[id];
  }
  var FOTO_VARS = { hero: "--art-hero", lava: "--art-lava", sombra: "--art-sombra" };
  function aplicarFotos() {
    var F = estado.fotos || {}, root = document.documentElement.style;
    Object.keys(FOTO_VARS).forEach(function (k) {
      if (!esFs(F[k])) { root.removeProperty(FOTO_VARS[k]); return; }
      cargarFs(F[k].slice(3)).then(function (u) { if (u && esFs(estado.fotos[k])) root.setProperty(FOTO_VARS[k], 'url("' + u + '")'); });
    });
    var logos = document.querySelectorAll(".hero-logo, .logo-img");
    if (esFs(F.logo)) cargarFs(F.logo.slice(3)).then(function (u) { if (u) for (var i = 0; i < logos.length; i++) logos[i].src = u; });
    else for (var i = 0; i < logos.length; i++) if (logos[i].getAttribute("src") !== "img/logo.webp") logos[i].src = "img/logo.webp";
  }
  var FOTO_TXT = { logo: "Cambiar logo", hero: "Cambiar fondo de portada", lava: "Cambiar fondo (Cómo participar)", sombra: "Cambiar fondo (Ganadores)" };
  function fotoBtn(k) {
    if (!vivo()) return "";
    var st = admin.fotoSt && admin.fotoSt.k === k ? admin.fotoSt.txt : "";
    return '<div class="fotobtns fb-' + k + '"><button type="button" class="imgbtn" data-a="foto" data-k="' + k + '">📷 ' + esc(st || FOTO_TXT[k]) + '</button>' +
      (estado.fotos[k] ? '<button type="button" class="imgbtn" data-a="fotoQuitar" data-k="' + k + '">↺ Original</button>' : '') + '</div>';
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
  var ESTADOS = ["activa", "proxima", "cerrada", "oculta"];
  var LISTA_RAREZAS = ["", "ARCANO", "INMORTAL", "LEGENDARIO", "MÍTICO", "RARO", "POCO COMÚN", "COMÚN"];

  /* ================= Vista pública ================= */
  function tarjeta(p) {
    var img = imgTag(p.img, p.nombre, ' loading="lazy"');
    var est = p.estado === "proxima" ? "proxima" : (p.estado === "cerrada" ? "cerrada" : (p.estado === "oculta" ? "oculta" : "activa"));
    var estTxt = est === "activa" ? "Abierta" : (est === "proxima" ? "Próximamente" : (est === "oculta" ? "Deshabilitada" : "Cerrada"));
    var cupos = num(p.cupos, 0), part = Math.max(num(p.participantes, 0), tomados(p.id)), cred = num(p.creditos, 0);
    var partTxt = cupos > 0 ? (part + " / " + cupos + " cupos") : (part + (part === 1 ? " cupo tomado" : " cupos tomados"));
    var lleno = cupos > 0 && part >= cupos;
    var mio0 = misParts[p.id] || 0, tope0 = num(p.maxPorUsuario, 0), topeOk = tope0 > 0 && mio0 >= tope0;
    var fz = vivo() ? est : fase(p);
    if (fz === "porIniciar") { est = "proxima"; estTxt = "Próximamente"; }
    if (fz === "vencida") estTxt = "Cierre cumplido";
    var boton;
    if (fz === "vencida") {
      boton = '<button class="btn btn-ghost" type="button" disabled>⏳ Esperando resultado</button>';
    } else if (est === "activa") {
      boton = vivo() ? lnk("btn btn-yellow", "", "btnParticipar")
        : (lleno ? '<button class="btn btn-yellow" type="button" disabled>Cupos llenos</button>'
        : (topeOk ? '<button class="btn btn-ghost" type="button" disabled>✔ Tienes ' + mio0 + (mio0 === 1 ? ' cupo (máximo)' : ' cupos (máximo)') + '</button>'
        : (mio0 ? '<button class="btn btn-yellow" type="button" data-a="participar" data-id="' + esc(p.id) + '">✔ Tienes ' + mio0 + (mio0 === 1 ? ' cupo' : ' cupos') + ' · Comprar más</button>'
        : '<button class="btn btn-yellow" type="button" data-a="participar" data-id="' + esc(p.id) + '">' + esc(estado.textos.btnParticipar) + '</button>')));
    } else if (est === "oculta") {
      boton = '<button class="btn btn-ghost" type="button" disabled>🙈 Oculta para el público</button>';
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
      (cupos > 0 ? '<div class="cbar' + (part / cupos >= 0.8 ? ' hot' : '') + '" role="img" aria-label="' + esc(partTxt) + '"><i style="width:' + Math.min(100, Math.round(part / cupos * 100)) + '%"></i></div>' : '') +
      (est === "activa" && p.cierre ? '<div class="timer" data-cierre="' + esc(p.cierre) + '">' + esc(restante(p.cierre)) + '</div>' : '') +
      (est === "activa" && p.cierre ? '<div class="pill fechas">Cierra: ' + esc(fechaHora(p.cierre)) + (+p.cupos > 0 ? ' o al agotar cupos' : '') + '</div>' : '') +
      (est === "activa" && !p.cierre && +p.cupos > 0 ? '<div class="pill fechas">Cierra al agotar cupos</div>' : '') +
      (est === "proxima" && p.inicio && tiempoDe(p.inicio) ? '<div class="pill fechas">Abre: ' + esc(fechaHora(p.inicio)) + '</div>' : '') +
      (est === "proxima" && p.cierre ? '<div class="pill fechas">Cierra: ' + esc(fechaHora(p.cierre)) + '</div>' : '') +
      ((est === "activa" || est === "proxima") && +p.maxPorUsuario > 0 ? '<div class="pill maxp">🎟️ Máx. ' + (+p.maxPorUsuario) + (+p.maxPorUsuario === 1 ? ' cupo' : ' cupos') + ' por persona</div>' : '') +
      boton + (est === "cerrada" && p.replay ? '<button class="btn btn-ghost btn-sm" type="button" data-a="repeticion" data-id="' + id + '" style="margin-top:8px">🎬 Ver repetición</button>' : '') + '</div></div></article>';
  }

  function secTitle(kicker, htmlTitle, sub) {
    return '<div class="sec-title"><div class="kicker">' + kicker + '</div><h2>' + htmlTitle + '</h2>' +
      (sub ? '<p>' + sub + '</p>' : '') + '<div class="orn">◆</div></div>';
  }

  function render() {
    var app = document.getElementById("app");
    if (!app) return;
    var visibles = estado.premios.filter(function (p) { return p.estado !== "cerrada" && (p.estado !== "oculta" || vivo()); });
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

      '<section class="hero gutter" id="inicio">' + fotoBtn("hero") + '<div class="wrap">' +
      '<img class="hero-logo" src="img/logo.webp" alt="Rayas Store" width="132" height="132">' + fotoBtn("logo") +
      tx("div", "kicker", 'class="kicker"') +
      (V ? '<h1' + ed("t:titulo", "Título") + '>' + esc(T.titulo) + '</h1>' : '<h1>' + tituloHtml(T.titulo) + '</h1>') +
      tx("p", "subtitulo") +
      '<div class="actions">' + lnk("btn btn-yellow", "#rifas", "btnVer") +
      btnRecargar("btn btn-fuchsia", "btnCreditos", linkCreditos) +
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

      '<section class="band lava gutter" id="como">' + fotoBtn("lava") + '<div class="wrap">' +
      sec("comoKicker", "comoT1", "comoT2") +
      '<div class="steps">' + [1, 2, 3].map(function (n) {
        return '<div class="step frame"><div class="in"><span class="n">' + n + '</span>' + tx("h3", "paso" + n + "T") + tx("p", "paso" + n) + '</div></div>';
      }).join("") + '</div>' +
      (linkCreditos || V || pagosOn() ? '<div style="text-align:center;margin-top:30px">' + btnRecargar("btn btn-fuchsia", "btnCreditos2", linkCreditos) + '</div>' : '') +
      '</div></section>' +

      '<section class="band sombra gutter" id="ganadores">' + fotoBtn("sombra") + '<div class="wrap">' +
      sec("ganKicker", null, "ganT") +
      (V && cerradas.length ? '<p class="hint" style="text-align:center;margin:-10px 0 18px">Rifas cerradas: escribe el ganador en cada tarjeta.</p><div class="grid">' + cerradas.map(tarjeta).join("") + '</div>' :
       cerradas.length
        ? '<div class="winners">' + cerradas.map(function (p) {
            return '<div class="winner frame gold"><div class="in"><div class="thumb">' + imgTag(p.img, "", ' loading="lazy"') + '</div>' +
              '<div class="who"><b>' + esc(p.ganador || "Por anunciar") + '</b><span>' + esc(p.nombre) + (p.cierre ? ' · ' + esc(fechaCorta(p.cierre)) : '') + '</span></div>' +
              (p.ganador ? '<span class="crown">🏆 GANÓ</span>' : '') + (p.replay ? '<button class="btn btn-ghost btn-sm" type="button" data-a="repeticion" data-id="' + esc(p.id) + '">🎬 Ver repetición</button>' : '') + '</div></div>';
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

    if (ruleta) html += modalRuleta();
    else if (modal) html += modalAviso();
    else if (elegirAbierto && contactos().length > 1) html += modalElegir();
    if (admin.puede && !admin.abierto) html += barraEdicion();
    if (admin.puede && admin.abierto) html += '<div class="scrim" data-a="cerrar"></div>' + panelAdmin();
    if (!admin.puede && cuenta.modo) html += '<div class="scrim" data-a="cerrarCuenta"></div>' + panelCuenta();

    var scrollDrawer = document.querySelector(".drawer-body");
    var top = scrollDrawer ? scrollDrawer.scrollTop : 0;
    app.innerHTML = html;
    montarGoogle();
    if (ruleta) { ruletaDibujar(ruleta.fin ? ruleta.rot : 0, 0); if (ruleta.fin) ruletaBrillo(); }
    document.body.classList.toggle("vivo", vivo());
    hidratarImgs();
    aplicarFotos();
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
        if (p.estado === "oculta") return;
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
      var lineas = '<small>Entraste: ' + esc(x.creado ? fechaHora(x.creado) : "—") + ' · ' + x.cantidad + (x.cantidad === 1 ? ' cupo' : ' cupos') + ' · ' + x.costo + ' créditos</small>';
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
        '<p class="hint">Crea tu cuenta para recibir créditos y participar en las rifas.</p>' + btnGoogle() +
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
          '<div class="grp">' + (pagosOn()
            ? '<p class="hint">Recarga con tarjeta (o Yape / QR desde S/ ' + PAGOS.minYape + ') y los créditos se suman al instante.' + (p.promoUsada ? '' : ' ¡Tu primera recarga trae créditos extra! 🎁') + '</p>' +
              '<button class="btn btn-fuchsia" type="button" data-a="recargar">💳 Recargar créditos</button>' +
              (link ? '<p class="hint">¿Algún problema con tu recarga? Escríbenos.</p><a class="btn btn-ghost btn-sm" href="' + esc(link) + '"' + (link === "#elegir" ? ' data-a="elegir"' : ' target="_blank" rel="noopener"') + '>Escribir por WhatsApp</a>' : '')
            : '<p class="hint">Para recibir créditos, escribe al encargado. Él los carga en tu cuenta.</p>' +
              (link ? '<a class="btn btn-yellow" href="' + esc(link) + '"' + (link === "#elegir" ? ' data-a="elegir"' : ' target="_blank" rel="noopener"') + '>Pedir créditos por WhatsApp</a>' : '')) + '</div>'
        : '<p class="hint">' + (cuenta.msg ? esc(cuenta.msg) : "Cargando tu cuenta…") + '</p>') +
        '<div class="grp"><button class="btn btn-ghost btn-sm" type="button" data-a="salir">Cerrar sesión</button></div></div>';
    } else {
      titulo = "Entrar";
      cuerpo = '<form class="drawer-body form" id="formLogin">' + btnGoogle() +
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
    var nc = admin.nc || {};
    var formNueva = '<div class="grp"><h3>Crear cuenta nueva</h3>' +
      '<div class="field"><label for="nc-nombre">Nombre</label><input id="nc-nombre" maxlength="60" value="' + esc(nc.nombre) + '"></div>' +
      '<div class="field"><label for="nc-email">Correo</label><input id="nc-email" type="email" autocomplete="off" value="' + esc(nc.email) + '"></div>' +
      '<div class="field"><label for="nc-pass">Contraseña (mínimo 6)</label><input id="nc-pass" type="text" autocomplete="off" value="' + esc(nc.pass) + '"></div>' +
      '<div class="field"><label for="nc-wsp">WhatsApp</label><input id="nc-wsp" inputmode="tel" placeholder="+51..." value="' + esc(nc.wsp) + '"></div>' +
      '<div class="field"><label for="nc-trade">Trade link de Steam (opcional)</label><input id="nc-trade" value="' + esc(nc.trade) + '"></div>' +
      '<div class="field"><label for="nc-cred">Créditos iniciales</label><input id="nc-cred" type="number" min="0" step="1" value="' + esc(nc.cred || "0") + '"></div>' +
      '<button class="btn btn-yellow btn-sm" type="button" data-a="crearCuenta">+ Crear cuenta</button> <button class="btn btn-ghost btn-sm" type="button" data-a="crearPrueba">🧪 Crear cuenta de prueba</button>' +
      (admin.ncMsg ? '<p class="hint" style="color:var(--' + (admin.ncOk ? 'ok' : 'danger') + ')">' + esc(admin.ncMsg) + '</p>' : '') +
      '<small class="hint">Pásale al usuario su correo y contraseña. Luego puede cambiarla con "¿Olvidaste tu contraseña?".</small></div>';
    var sub = admin.subU === "crear" ? "crear" : "lista";
    var subtabs = '<div class="subtabs" role="tablist">' +
      '<button class="subtab" type="button" role="tab" data-a="subU" data-s="lista" aria-selected="' + (sub === "lista") + '">👥 Usuarios (' + admin.usuarios.length + ')</button>' +
      '<button class="subtab" type="button" role="tab" data-a="subU" data-s="crear" aria-selected="' + (sub === "crear") + '">➕ Crear cuenta</button></div>';
    if (sub === "crear") return subtabs + formNueva;
    return subtabs + '<div class="grp"><h3>Usuarios (' + admin.usuarios.length + ')</h3>' +
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
          '<button type="button" class="btn btn-yellow btn-sm" data-a="editRapido" data-uid="' + id + '">✎ Editar datos</button>' +
          (u.uid === ADMIN_UID ? '' : (admin.delU === u.uid
            ? '<div class="hint" style="color:var(--danger)">¿Eliminar a <b>' + esc(u.nombre || u.email) + '</b> y sus participaciones? <button class="btn btn-ghost btn-sm" type="button" data-a="delUSi" data-uid="' + id + '">Sí, eliminar</button> <button class="btn btn-ghost btn-sm" type="button" data-a="delUNo">No</button></div>'
            : '<button type="button" class="btn btn-ghost btn-sm" data-a="delU" data-uid="' + id + '">🗑 Eliminar cuenta</button>')) +
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
  function quitarParticipacion(pid, uid, devolver) {
    var base = "projects/" + FB.projectId + "/databases/(default)/documents/", lista = partes[pid] || [], x = lista.filter(function (y) { return y.uid === uid; })[0];
    if (!x) { admin.quitarP = null; render(); return; }
    token().then(function (tk) {
      return fetch(BASE.replace(/documents\/$/, "documents:commit"), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
        body: JSON.stringify({ writes: [{ delete: base + "rayas_part/" + pid + "_" + uid }].concat(devolver ? [
          { transform: { document: base + "rayas_users/" + uid, fieldTransforms: [{ fieldPath: "creditos", increment: { integerValue: String(x.costo || 0) } }] } }
        ] : []) }) });
    }).then(function (r) {
      if (!r.ok) throw new Error("Error " + r.status);
      partes[pid] = lista.filter(function (y) { return y.uid !== uid; });
      var u = usuarioPorUid(uid); if (u && devolver) u.creditos += (x.costo || 0);
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
        rifas.push('<li>' + esc(pr ? pr.nombre : (x.premioNombre || pid)) + ' · ' + x.cantidad + (x.cantidad === 1 ? ' cupo' : ' cupos') + ' · ' + x.costo + ' cr. · ' + esc(x.creado ? fechaHora(x.creado) : "—") +
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
      h += '<div class="frow"><span>Cupos</span><div class="adjq"><button class="iconbtn" type="button" data-a="cantPart" data-d="-1" data-uid="' + id + '" data-id="' + esc(p.id) + '"' + ((ctx.cantidad || 1) <= 1 ? ' disabled' : '') + ' aria-label="Quitar un cupo">−</button><b>' + (ctx.cantidad || 1) + '</b><button class="iconbtn" type="button" data-a="cantPart" data-d="1" data-uid="' + id + '" data-id="' + esc(p.id) + '" aria-label="Sumar un cupo">+</button><small>Ajuste manual: no cobra ni devuelve créditos.</small></div></div>';
      var kq = p.id + "_" + uid, dq = ' data-uid="' + id + '" data-id="' + esc(p.id) + '"';
      h += '<div class="fbtns">' + (admin.quitarP === kq
        ? '<button class="btn btn-ghost btn-sm" type="button" data-a="quitarPartSi"' + dq + ' data-dev="' + (admin.quitarDev ? 1 : 0) + '">Sí, ' + (admin.quitarDev ? 'quitar y devolver ' + (ctx.costo || 0) + ' créditos' : 'solo quitar (sin devolver)') + '</button><button class="btn btn-ghost btn-sm" type="button" data-a="quitarPartNo">No</button>'
        : '<button class="btn btn-ghost btn-sm" type="button" data-a="quitarPart"' + dq + ' data-dev="1">Quitar y devolver créditos</button><button class="btn btn-ghost btn-sm" type="button" data-a="quitarPart"' + dq + ' data-dev="0">Solo quitar</button>') + '</div>';
    }
    return h + '<div class="fbtns"><button class="btn btn-yellow btn-sm" type="button" data-a="editU" data-uid="' + id + '">✎ Editar datos</button></div></div>';
  }
  function listaParticipantes() {
    if (!estado.premios.length) return '';
    if (admin.usuarios === null && !admin.cargandoU) { admin.cargandoU = true; cargarUsuarios(); }
    return estado.premios.map(function (p) {
      var l = partes[p.id] || [], pid = esc(p.id);
      var libres = (admin.usuarios || []).filter(function (u) { return !l.some(function (x) { return x.uid === u.uid; }); });
      return '<div class="grp"><h3>Participantes · ' + esc(p.nombre || "Premio") + ' (' + l.length + (l.length === 1 ? ' persona' : ' personas') + ' · ' + tomados(p.id) + '/' + (num(p.cupos, 0) > 0 ? num(p.cupos, 0) : '∞') + ' cupos)</h3>' +
        (p.ganador ? '<p class="hint">🏆 Ganador: <b>' + esc(p.ganador) + '</b> <button class="btn btn-ghost btn-sm" type="button" data-a="quitarGan" data-id="' + pid + '">Quitar ganador</button></p>' : '') +
        (l.length ? '' : '<p class="hint">Todavía nadie participa en esta rifa.</p>') +
        l.map(function (x) {
          var abierto = admin.fichaU === p.id + "_" + x.uid;
          return '<div class="prow' + (p.ganadorUid === x.uid ? ' win' : '') + '"><button type="button" class="pbtn" data-a="verFicha" data-key="' + esc(p.id + "_" + x.uid) + '">' +
            '<span>' + (p.ganadorUid === x.uid ? '🏆 ' : '') + esc(x.nombre) + ' <em class="xq">×' + x.cantidad + '</em></span><small>' + esc(x.creado ? fechaHora(x.creado) : "") + '</small><i>' + (abierto ? "▴" : "▾") + '</i></button>' +
            (abierto ? detalleUsuario(x.uid, { p: p, costo: x.costo, cantidad: x.cantidad }) : '') + '</div>';
        }).join("") +
        (admin.usuarios && libres.length ? '<div class="addp"><label for="add-u-' + pid + '">Agregar participante</label><div class="addrow"><select id="add-u-' + pid + '">' +
          libres.map(function (u) { return '<option value="' + esc(u.uid) + '">' + esc(u.nombre || u.email) + '</option>'; }).join("") +
          '</select><input id="add-q-' + pid + '" type="number" min="1" max="100" value="1" aria-label="Cupos"><button class="btn btn-ghost btn-sm" type="button" data-a="addPart" data-id="' + pid + '">Agregar</button></div><small class="hint">Se agrega sin descontar créditos.</small>' + (admin.addPid === p.id && admin.addMsg ? '<p class="hint" style="color:' + (admin.addMsgOk ? 'var(--ok)' : 'var(--danger)') + '" role="status">' + esc(admin.addMsg) + '</p>' : '') + '</div>' : '') +
        (l.length ? '<button class="btn btn-ghost btn-sm" type="button" data-a="sortear" data-id="' + pid + '">🎰 Sortear con ruleta</button>' + (p.replay ? ' <button class="btn btn-ghost btn-sm" type="button" data-a="repeticion" data-id="' + pid + '">🎬 Ver repetición</button>' : '') : '') + '</div>';
    }).join("");
  }
  function cuposLibresAdmin(pid) {
    var k = buscarPremio(pid); if (k < 0) return 100;
    var p = estado.premios[k], cupos = num(p.cupos, 0);
    return cupos > 0 ? cupos - Math.max(num(p.participantes, 0), tomados(pid)) : 100;
  }
  function guardarCantidad(pid, uid, nueva) {
    var x = (partes[pid] || []).filter(function (y) { return y.uid === uid; })[0]; if (!x || nueva < 1) return;
    if (nueva > x.cantidad && nueva - x.cantidad > cuposLibresAdmin(pid)) { admin.addPid = pid; admin.addMsg = "No hay suficientes cupos libres (quedan " + Math.max(0, cuposLibresAdmin(pid)) + "). Sube el límite de cupos del premio si quieres más."; admin.addMsgOk = false; render(); return; }
    fsPedir("rayas_part/" + encodeURIComponent(pid + "_" + uid) + "?updateMask.fieldPaths=cantidad&currentDocument.exists=true", {
      method: "PATCH", body: JSON.stringify({ fields: { cantidad: { integerValue: String(nueva) } } })
    }).then(function (r) { if (r.status === 403) throw new Error("falta publicar las reglas nuevas de rayas_part"); if (!r.ok) throw new Error("Error " + r.status); x.cantidad = nueva; render(); })
      .catch(function (e) { admin.addPid = pid; admin.addMsg = "No se guardó: " + e.message; admin.addMsgOk = false; render(); });
  }
  function eliminarUsuario(uid) {
    var base = "projects/" + FB.projectId + "/databases/(default)/documents/", ws = [];
    Object.keys(partes).forEach(function (pid) { (partes[pid] || []).forEach(function (x) { if (x.uid === uid) ws.push({ delete: base + "rayas_part/" + pid + "_" + uid }); }); });
    ws.push({ delete: base + "rayas_users/" + uid });
    admin.uMsg = "Eliminando…"; render();
    token().then(function (tk) {
      return fetch(BASE.replace(/documents\/$/, "documents:commit"), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ writes: ws }) });
    }).then(function (r) {
      if (r.status === 403) throw new Error("Firebase no permite borrar usuarios todavía: falta la regla 'allow delete: if isAdmin();' en rayas_users.");
      if (!r.ok) throw new Error("Error " + r.status);
      admin.delU = null; admin.usuarios = null; admin.uMsg = ""; return cargarParts().catch(function () {});
    }).then(function () { render(); }).catch(function (e) { admin.delU = null; admin.uMsg = e.message; render(); });
  }
  function crearCuentaPrueba() {
    var n = ((admin.usuarios || []).filter(function (u) { return /^Prueba \d+/.test(u.nombre); }).length) + 1, r = Math.random().toString(36).slice(2, 8);
    var d = { nombre: "Prueba " + n, email: "prueba" + n + "." + r + "@prueba.rayas.trade", pass: "Prueba-" + r + "9", wsp: "+51900000000", trade: "", cred: "100" };
    crearCuentaAdmin(d);
  }
  function crearCuentaAdmin(pre) {
    var g = function (i) { var e = document.getElementById(i); return e ? e.value.trim() : ""; };
    var d = pre || { nombre: g("nc-nombre"), email: g("nc-email").toLowerCase(), pass: document.getElementById("nc-pass") ? document.getElementById("nc-pass").value : "", wsp: g("nc-wsp"), trade: g("nc-trade"), cred: g("nc-cred") };
    admin.nc = d; admin.ncOk = false;
    var cred = Math.max(0, Math.floor(Number(d.cred) || 0));
    if (!d.nombre || !d.email || d.pass.length < 6) { admin.ncMsg = "Falta nombre, correo o la contraseña (mínimo 6 caracteres)."; render(); return; }
    if (d.trade && !tradeValido(d.trade)) { admin.ncMsg = "El trade link no es válido."; render(); return; }
    admin.ncMsg = "Creando cuenta…"; admin.ncOk = true; render();
    fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + encodeURIComponent(FB.apiKey), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: d.email, password: d.pass, returnSecureToken: true })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.idToken) throw new Error((j.error && j.error.message) || "SIGNUP_FAILED");
      return fetch(BASE + "rayas_users/" + encodeURIComponent(j.localId) + "?currentDocument.exists=false", {
        method: "PATCH", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + j.idToken },
        body: JSON.stringify({ fields: { nombre: { stringValue: d.nombre }, whatsapp: { stringValue: d.wsp }, email: { stringValue: d.email }, tradelink: { stringValue: d.trade }, creditos: { integerValue: "0" }, creado: { timestampValue: new Date().toISOString() } } })
      }).then(function (r) {
        if (!r.ok) throw new Error("PERFIL_" + r.status);
        if (!cred) return;
        return fsPedir("rayas_users/" + encodeURIComponent(j.localId) + "?updateMask.fieldPaths=creditos&currentDocument.exists=true", { method: "PATCH", body: JSON.stringify({ fields: { creditos: { integerValue: String(cred) } } }) });
      });
    }).then(function () {
      admin.nc = null; admin.ncMsg = pre ? "✔ Cuenta de prueba creada. Correo: " + d.email + " · Contraseña: " + d.pass + " · 100 créditos" : "✔ Cuenta creada: " + d.email; admin.ncOk = true; admin.usuarios = null; render();
    }).catch(function (e) {
      var m = String(e && e.message);
      admin.ncOk = false;
      admin.ncMsg = /EMAIL_EXISTS/.test(m) ? "Ese correo ya tiene cuenta." : (/WEAK_PASSWORD/.test(m) ? "Contraseña muy débil." : (/INVALID_EMAIL/.test(m) ? "Correo no válido." : (/^PERFIL_/.test(m) ? "La cuenta se creó pero falló el perfil (" + m + ")." : "No se pudo crear: " + m)));
      render();
    });
  }
  function agregarParticipante(pid) {
    var sel = document.getElementById("add-u-" + pid), qn = document.getElementById("add-q-" + pid); if (!sel || !qn) return;
    var u = usuarioPorUid(sel.value), q = Math.max(1, Math.min(100, Math.floor(Number(qn.value) || 1))), k = buscarPremio(pid); if (!u || k < 0) return;
    var pr = estado.premios[k], lib = cuposLibresAdmin(pid);
    if (q > lib) { admin.addPid = pid; admin.addMsg = lib <= 0 ? "La rifa ya está llena (" + num(pr.cupos, 0) + " cupos). Sube el límite de cupos del premio para agregar más." : "Solo quedan " + lib + " cupos libres."; admin.addMsgOk = false; render(); return; }
    admin.addPid = pid; admin.addMsg = "Agregando…"; admin.addMsgOk = true; render();
    fsPedir("rayas_part/" + encodeURIComponent(pid + "_" + u.uid) + "?currentDocument.exists=false", {
      method: "PATCH", body: JSON.stringify({ fields: { uid: { stringValue: u.uid }, nombre: { stringValue: u.nombre }, premio: { stringValue: pid }, premioNombre: { stringValue: pr.nombre }, costo: { integerValue: "0" }, cantidad: { integerValue: String(q) }, creado: { timestampValue: new Date().toISOString() } } })
    }).then(function (r) {
      if (r.status === 403) throw new Error("Firebase no lo permite: falta publicar las reglas nuevas de rayas_part (las del mensaje anterior).");
      if (r.status === 409) throw new Error("Ese usuario ya participa en esta rifa. Ajusta sus cupos en su ficha.");
      if (!r.ok) throw new Error("Error " + r.status);
      (partes[pid] = partes[pid] || []).push({ uid: u.uid, nombre: u.nombre, costo: 0, cantidad: q, creado: new Date().toISOString(), premioNombre: pr.nombre });
      admin.addMsg = "✔ " + u.nombre + " agregado con " + q + (q === 1 ? " cupo." : " cupos."); admin.addMsgOk = true; render();
    }).catch(function (e) { admin.addMsg = e.message; admin.addMsgOk = false; render(); });
  }
  function listaPremios() {
    var items = estado.premios.map(function (p, i) {
      var est = p.estado === "proxima" ? "Próximamente" : (p.estado === "cerrada" ? "Cerrada" : (p.estado === "oculta" ? "Deshabilitada (oculta)" : "Abierta"));
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
      '<div class="field"><label for="f-cierre">Fecha y hora de cierre</label><input id="f-cierre" type="datetime-local"' + (p.cierre ? '' : ' disabled') + ' value="' + esc(aLocalInput(p.cierre)) + '"></div>' +
      '</div>' +
      '<label class="chk"><input type="checkbox" id="f-hasta"' + (p.cierre ? '' : ' checked') + '> Sin fecha: cerrar solo cuando se agoten los cupos</label>' +
      '<p class="hint">Inicio: si lo dejas vacío, la rifa empieza cuando publiques. La rifa se abre y se cierra sola en esas horas.</p>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-estado">Estado</label><select id="f-estado">' +
      [['activa', 'Abierta'], ['proxima', 'Próximamente'], ['cerrada', 'Cerrada'], ['oculta', 'Deshabilitada (oculta)']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((p.estado || "activa") === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join("") + '</select></div>' +
      '<div class="field"><label for="f-cupos">Cupos (0 = sin límite)</label><input id="f-cupos" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.cupos, 0) + '"></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-part">Cupos ya vendidos (manual)</label><input id="f-part" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.participantes, 0) + '"></div>' +
      '<div class="field"><label for="f-max">Máx. cupos por persona (0 = sin límite)</label><input id="f-max" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.maxPorUsuario, 0) + '"></div>' +
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
    var hastaEl = document.getElementById("f-hasta");
    if (hastaEl && hastaEl.checked) p.cierre = "";
    else if (v("f-cierre") !== null) { var c = v("f-cierre"); var d = c ? new Date(c) : null; p.cierre = d && isFinite(d.getTime()) ? d.toISOString() : ""; }
    if (v("f-part") !== null) p.participantes = num(v("f-part"), 0);
    if (v("f-max") !== null) p.maxPorUsuario = num(v("f-max"), 0);
    if (v("f-cupos") !== null) { p.cupos = num(v("f-cupos"), 0); var tk = tomados(p.id); if (p.cupos > 0 && p.cupos < tk) { p.cupos = tk; admin.msg = "Ya hay " + tk + " cupos tomados; el límite no puede ser menor."; admin.msgTipo = "err"; } }
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
    estado.premios.forEach(function (p) { if (p.estado !== "cerrada" && p.estado !== "oculta" && !p.inicio) p.inicio = new Date().toISOString(); });
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
      case "editRapido": admin.fichaU = "u_" + t.getAttribute("data-uid"); admin.editU = t.getAttribute("data-uid"); admin.uMsg = ""; render(); break;
      case "cantPart": var xq = (partes[t.getAttribute("data-id")] || []).filter(function (y) { return y.uid === t.getAttribute("data-uid"); })[0]; if (xq) guardarCantidad(t.getAttribute("data-id"), xq.uid, xq.cantidad + Number(t.getAttribute("data-d"))); break;
      case "crearPrueba": crearCuentaPrueba(); break;
      case "subU": admin.subU = t.getAttribute("data-s"); render(); break;
      case "crearCuenta": crearCuentaAdmin(); break;
      case "addPart": agregarParticipante(t.getAttribute("data-id")); break;
      case "editU": admin.editU = t.getAttribute("data-uid"); admin.uMsg = ""; render(); break;
      case "cancelarU": admin.editU = null; admin.uMsg = ""; render(); break;
      case "guardarU": guardarUsuario(t.getAttribute("data-uid")); break;
      case "copiar": var txtc = t.getAttribute("data-txt"), tu = (admin.usuarios || []).filter(function (x) { return x.tradelink === txtc; })[0];
        try { navigator.clipboard.writeText(txtc); } catch (e4) { /* sin portapapeles */ }
        if (tu) tu.copiado = Date.now(); render(); break;
      case "delU": admin.delU = t.getAttribute("data-uid"); render(); break;
      case "delUNo": admin.delU = null; render(); break;
      case "delUSi": eliminarUsuario(t.getAttribute("data-uid")); break;
      case "quitarPart": admin.quitarDev = t.getAttribute("data-dev") === "1"; admin.quitarP = t.getAttribute("data-id") + "_" + t.getAttribute("data-uid"); render(); break;
      case "quitarPartNo": admin.quitarP = null; render(); break;
      case "quitarPartSi": quitarParticipacion(t.getAttribute("data-id"), t.getAttribute("data-uid"), t.getAttribute("data-dev") === "1"); break;
      case "participar": iniciarParticipar(t.getAttribute("data-id")); break;
      case "recargar": abrirRecarga(); break;
      case "monto": if (modal && modal.tipo === "recarga") { modal.sel = Number(t.getAttribute("data-s")); modal.err = ""; render(); } break;
      case "montoOtro":
        if (modal && modal.tipo === "recarga") {
          var inp = document.getElementById("monto-otro"), v = inp ? Number(inp.value) : NaN;
          modal.otro = inp ? inp.value : "";
          if (!isFinite(v) || Math.floor(v) !== v || v < PAGOS.min || v > PAGOS.max) { modal.err = "Escribe un monto entero entre S/ " + PAGOS.min + " y S/ " + PAGOS.max + "."; modal.sel = 0; }
          else { modal.err = ""; modal.sel = v; }
          render();
        } break;
      case "pagarCulqi": if (modal && modal.tipo === "recarga" && modal.sel) iniciarPago(modal.sel); break;
      case "recargaWsp":
        if (modal && modal.tipo === "recarga" && modal.sel) {
          montoWsp = modal.sel; var hw = creditoHref();
          if (hw === "#elegir") { modal = null; elegirAbierto = true; render(); }
          else { montoWsp = 0; if (hw) window.open(hw, "_blank", "noopener"); }
        } break;
      case "confirmarPart": confirmarPart(); break;
      case "qtyMas": if (modal && modal.tipo === "confirmar" && modal.qty < modal.max) { modal.qty++; render(); } break;
      case "qtyMenos": if (modal && modal.tipo === "confirmar" && modal.qty > 1) { modal.qty--; render(); } break;
      case "cerrarModal": modal = null; montoWsp = 0; render(); break;
      case "sortear": abrirRuleta(t.getAttribute("data-id")); break;
      case "ruletaGirar": ruletaGirar(); break;
      case "ruletaOtra": if (ruleta) { ruleta.fin = false; ruleta.run = false; render(); } break;
      case "ruletaCerrar": ruleta = null; render(); break;
      case "ruletaGuardar": ruleta = null; publicar(); break;
      case "repeticion": abrirRepeticion(t.getAttribute("data-id")); break;
      case "olvide": ev.preventDefault(); recuperarClave(); break;
      case "elegir": ev.preventDefault(); modal = null; elegirAbierto = true; render(); break;
      case "cerrarElegir": elegirAbierto = false; montoWsp = 0; render(); break;
      case "editContactos": admin.abierto = true; admin.tab = "pagina"; render(); break;
      case "quitarGan": var kg = buscarPremio(t.getAttribute("data-id")); if (kg >= 0) { estado.premios[kg].ganador = ""; estado.premios[kg].ganadorUid = ""; estado.premios[kg].resultado = ""; delete estado.premios[kg].replay; marcarSucio(); render(); } break;
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
      case "foto": var fk = t.getAttribute("data-k"), inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
        inp.onchange = function () {
          if (!inp.files || !inp.files[0]) return;
          admin.fotoSt = { k: fk, txt: "Subiendo…" }; render();
          subirImagen(inp.files[0], fk === "logo" ? 512 : 1920).then(function (ref) {
            estado.fotos[fk] = ref; admin.fotoSt = null; marcarSucio(); render();
          }).catch(function (e) {
            admin.fotoSt = { k: fk, txt: (e && e.message) || "No se pudo subir" }; render();
            setTimeout(function () { admin.fotoSt = null; render(); }, 4500);
          });
        };
        inp.click(); break;
      case "fotoQuitar": estado.fotos[t.getAttribute("data-k")] = ""; marcarSucio(); render(); break;
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
    if (ev.target.id === "f-hasta") { var fc = document.getElementById("f-cierre"); if (fc) { fc.disabled = ev.target.checked; if (ev.target.checked) fc.value = ""; } return; }
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
      method: "POST", headers: { "Content-Type": "application/json", "X-Firebase-Locale": "es" },
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


  /* ================= Anuncio al entrar ================= */
  (function () {
    var KEY = "promo_rifas_v1";
    try { if (sessionStorage.getItem(KEY)) return; } catch (e) { /* sin almacenamiento */ }
    function cerrar() {
      var el = document.getElementById("promoPop"); if (el) { el.classList.remove("on"); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250); }
      document.removeEventListener("keydown", tecla);
      try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* sin almacenamiento */ }
    }
    function tecla(ev) { if (ev.key === "Escape") cerrar(); }
    function mostrar() {
      if (admin.puede || document.getElementById("promoPop")) return;
      var href = creditoHref();
      var d = document.createElement("div");
      d.id = "promoPop"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Promoción de primera recarga");
      d.innerHTML = '<div class="promo-box"><button type="button" class="promo-x" aria-label="Cerrar">✕</button>' +
        '<img src="img/promo-rifas.jpg" alt="Primera recarga: S/ 50 = 55 créditos, S/ 100 = 110 créditos" width="1080" height="1350">' +
        '<div class="promo-acts">' + (pagosOn() ? '<button type="button" class="btn btn-yellow" id="promoPagar">Recargar ahora</button>'
          : (href ? '<a class="btn btn-yellow" id="promoCta" href="' + esc(href) + '"' + (href === "#elegir" ? '' : ' target="_blank" rel="noopener"') + '>Pedir créditos</a>' : '')) +
        '<button type="button" class="btn btn-ghost" id="promoNo">Ahora no</button></div></div>';
      document.body.appendChild(d);
      requestAnimationFrame(function () { d.classList.add("on"); });
      d.addEventListener("click", function (ev) {
        var t = ev.target;
        if (t === d || t.closest(".promo-x") || t.id === "promoNo") { cerrar(); return; }
        if (t.id === "promoPagar") { cerrar(); abrirRecarga(); return; }
        if (t.id === "promoCta") { cerrar(); if (href === "#elegir") { ev.preventDefault(); elegirAbierto = true; render(); } else cerrar(); }
      });
      document.addEventListener("keydown", tecla);
    }
    setTimeout(mostrar, 900);
  })();
  render();
  cargarRemoto();
  cargarParts();
  revisarHash();
  if (leerSesion() && !admin.puede) cargarPerfil();
})();
