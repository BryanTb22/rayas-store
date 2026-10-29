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
     Mientras esté vacía, la página NO muestra el pago y sigue pidiendo saldo por WhatsApp.
     Los precios de aquí son solo para mostrarlos: el cobro real usa functions/packs.js. */
  var PAGOS = {
    culqiPk: "pk_test_iK8JCBNB6dJmRlUZ",
    // El pago lo prende/apaga el admin en el panel (Textos y contactos → "Cobrar con Culqi").
    // Con ?pagotest=1 en la dirección se ve siempre, para probar sin prender el interruptor.
    min: 3, max: 500, minYape: 6,   // monto libre (solo para mostrar; el servidor valida lo mismo en functions/packs.js)
    url: "https://us-central1-" + FB.projectId + ".cloudfunctions.net/cobrar",
    urlOrden: "https://us-central1-" + FB.projectId + ".cloudfunctions.net/crearOrden",
    urlParticipar: "https://us-central1-" + FB.projectId + ".cloudfunctions.net/participarRifa",
    urlProbarCorreos: "https://us-central1-" + FB.projectId + ".cloudfunctions.net/probarCorreos",
    urlItemSteam: "https://us-central1-" + FB.projectId + ".cloudfunctions.net/itemSteam",
    urlPreciosSteam: "https://us-central1-" + FB.projectId + ".cloudfunctions.net/preciosSteam",
    urlSteamIniciar: "https://us-central1-" + FB.projectId + ".cloudfunctions.net/steamIniciar",
    js: "https://checkout.culqi.com/js/v4"
  };
  var PACKS_UI = [
    { id: "p10", soles: 10, base: 10 },
    { id: "p20", soles: 20, base: 20 },
    { id: "p50", soles: 50, base: 50, promo: 55 },
    { id: "p100", soles: 100, base: 100, promo: 110 }
  ];
  // Comisión de Culqi a cargo del comprador (misma fórmula que functions/packs.js; el servidor es quien cobra).
  var COM = { pct: 0.0399, fijoUsd: 0.20, tc: 3.85, igv: 0 };
  function totalTarjeta(soles) { var k = 1 + COM.igv; var t = (soles + COM.fijoUsd * COM.tc * k) / (1 - COM.pct * k); return Math.ceil(t * 100 - 1e-9) / 100; }
  function fmtSol(n) { return (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ""); }
  function bajarQr(img) {
    try {
      var src = img && img.getAttribute("src"); if (!src || src.indexOf("data:image/") !== 0) return false;
      var a = document.createElement("a"); a.href = src; a.download = "yape-qr.png"; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove(); return true;
    } catch (e) { return false; }
  }
  function yapeOn() { var y = estado.yape; return !!(y && (y.qr || y.numero)); }
  function recargaOn() { return pagosOn() || yapeOn(); }
  function pagosOn() { return !!PAGOS.culqiPk && (!!(estado.pagos && estado.pagos.culqi) || /[?&]pagotest=1(&|$)/.test(location.search)); }

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
          cuenta.msg = "No se pudo entrar con Google. " + errSimple(e && e.message); cuenta.msgTipo = "err"; render();
        });
      } });
      window.google.accounts.id.renderButton(el2, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", locale: "es", width: 320 });
    }).catch(function () { /* sin conexión con Google */ });
  }
  /* ================= Entrar con Steam (OpenID; lo verifica la función steamCallback del servidor) ================= */
  var STEAM_LOGO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-9.96 9.1l5.35 2.2a2.8 2.8 0 0 1 1.6-.5h.15l2.38-3.45v-.05a3.75 3.75 0 1 1 3.75 3.75h-.09l-3.4 2.43a2.8 2.8 0 0 1-5.55.45L2.3 14.3A10 10 0 1 0 12 2zm-4.9 14.5-1.2-.5a2.1 2.1 0 0 0 4-.75 2.1 2.1 0 0 0-2.8-2l1.24.5a1.55 1.55 0 1 1-1.24 2.75zm8.9-5.1a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5zm0-.95a1.55 1.55 0 1 1 1.55-1.55 1.55 1.55 0 0 1-1.55 1.55z"/></svg>';
  var steamPre = null;   // datos que trae Steam para sugerir en "Completa tu perfil": { sid, nom }
  function btnSteam() { return '<button type="button" class="sbtn" data-a="steamEntrar">' + STEAM_LOGO + '<span>Entrar con Steam</span></button>'; }
  // signInWithCustomToken NO devuelve localId: el uid sale del propio token de sesión.
  function uidDeJwt(t) { try { var p = JSON.parse(atob(String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return p.user_id || p.sub || null; } catch (e) { return null; } }
  function steamIr(vincular) {
    var enviar = function (tk) {
      var h = { "Content-Type": "application/json" }; if (tk) h.Authorization = "Bearer " + tk;
      return fetch(PAGOS.urlSteamIniciar, { method: "POST", headers: h, body: JSON.stringify({ origen: location.origin, ruta: location.pathname }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.url) throw new Error(j.error || "No se pudo conectar con Steam."); return j.url; }); });
    };
    cuenta.msg = "Abriendo Steam…"; cuenta.msgTipo = ""; render();
    (vincular ? token() : Promise.resolve(null)).then(enviar).then(function (url) { location.href = url; }).catch(function (e) {
      cuenta.msg = (e && e.message === "NO_SESSION") ? "Tu sesión venció. Vuelve a entrar." : ((e && e.message) || "No se pudo conectar con Steam. Intenta de nuevo."); cuenta.msgTipo = "err"; render();
    });
  }
  function leerHashSteam() {
    var h = String(location.hash || "").replace(/^#/, ""); if (!/(^|&)(steamtoken|steam|steamerror)=/.test(h)) return null;
    var o = {}; h.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) { try { o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* ignorar */ } } });
    return o;
  }
  // Al volver de Steam: canjea el token por una sesión (misma estructura que el login normal) y limpia la dirección.
  function steamAlCargar() {
    var o = leerHashSteam(); if (!o) return false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* nada */ }
    if (o.steamerror) { cuenta.modo = "login"; cuenta.msg = o.steamerror.slice(0, 160); cuenta.msgTipo = "err"; render(); return true; }
    if (o.steam === "ok") { cuenta.modo = "perfil"; cuenta.irTab = "seg"; cuenta.msg = "✔ Steam vinculado a tu cuenta."; cuenta.msgTipo = "ok"; render(); cargarPerfil().then(function () { cuenta.msg = "✔ Steam vinculado a tu cuenta."; cuenta.msgTipo = "ok"; render(); }); return true; }
    if (!o.steamtoken) return false;
    steamPre = { sid: String(o.sid || "").replace(/\D/g, ""), nom: String(o.nom || "").slice(0, 40), av: imgSteamOk(o.av) ? String(o.av) : "", pa: String(o.pa || "").replace(/[<>\u0000-\u001f]/g, "").slice(0, 60), pu: o.pu === "1" ? true : (o.pu === "0" ? false : null) };
    cuenta.modo = "login"; cuenta.msg = "Entrando con Steam…"; cuenta.msgTipo = ""; render();
    fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + encodeURIComponent(FB.apiKey), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: o.steamtoken, returnSecureToken: true })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.idToken) throw new Error((j.error && j.error.message) || "LOGIN_FAILED");
      guardarSesion({ id: j.idToken, ref: j.refreshToken, exp: Date.now() + (Number(j.expiresIn) || 3600) * 1000 - 60000, email: "", uid: j.localId || uidDeJwt(j.idToken) });
      trasEntrar();
    }).catch(function (e) { cuenta.modo = "login"; cuenta.msg = "No se pudo entrar con Steam. " + errSimple(e && e.message); cuenta.msgTipo = "err"; render(); });
    return true;
  }
  // ID de Steam vinculado: del perfil o, si es una cuenta recién creada con Steam, del token.
  function steamVinculado() {
    var p = cuenta.perfil; if (p && p.steamId) return p.steamId;
    var s = leerSesion(); if (!s || !s.id) return "";
    try { var c = JSON.parse(atob(s.id.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return String(c.steamId || ""); } catch (e) { return ""; }
  }
  function steamVinculoHtml() {
    var v = steamVinculado();
    return '<div class="grp steamlink"><h3>Steam</h3>' + (v
      ? '<p class="hint" style="color:var(--ok)">✔ Steam vinculado (ID ' + esc(v) + '). Ya puedes entrar con el botón «Entrar con Steam».</p>'
      : '<p class="hint">Vincula tu Steam y entra con un clic, sin contraseña. No pierdes tu saldo.</p><button type="button" class="sbtn" data-a="steamVincular">' + STEAM_LOGO + '<span>Vincular mi Steam</span></button>') + '</div>';
  }
  function btnGoogle() { return (GOOGLE_CLIENT_ID ? '<div id="g-btn" class="gbtn"></div>' : "") + btnSteam() + '<div class="gsep"><span>o con tu correo</span></div>'; }
  function crearPerfil(ses, d) {
    var campos = {
      nombre: { stringValue: d.nombre }, whatsapp: { stringValue: d.whatsapp },
      email: { stringValue: d.email }, tradelink: { stringValue: d.tradelink }, steam: { stringValue: d.steam || "" }, creditos: { integerValue: "0" }, creado: { timestampValue: new Date().toISOString() }
    };
    // Las reglas de Firestore solo aceptan estos campos al crear la cuenta. La foto, el país y el enlace de Steam
    // los guarda el servidor (steamCallback) la próxima vez que la persona entre con Steam.
    return fsPedir("rayas_users/" + encodeURIComponent(ses.uid) + "?currentDocument.exists=false", {
      method: "PATCH",
      body: JSON.stringify({ fields: campos })
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
  // ID de Steam = código de amigo. Acepta el código, el SteamID64 o el link del perfil (/profiles/7656…).
  function steamNorm(v) {
    v = String(v || "").trim();
    if (!v) return "";
    var largo = /765611\d{11}/.exec(v);
    if (largo && typeof BigInt === "function") return (BigInt(largo[0]) - BigInt("76561197960265728")).toString();
    var d = v.replace(/[\s.-]/g, "");
    return /^\d{3,11}$/.test(d) ? d : null;
  }
  // Lee el campo de Steam; si está vacío lo saca del trade link (partner=…). null = inválido.
  function leerSteam(idSteam, trade) {
    var el = document.getElementById(idSteam), v = steamNorm(el ? el.value : "");
    if (v === "") { var m = /[?&]partner=(\d{3,11})/.exec(String(trade || "")); v = m ? m[1] : ""; }
    return v;
  }
  function avisoSteam(idSteam, v) {
    var el = document.getElementById(idSteam); if (!el) return;
    el.setCustomValidity(v === null ? "Tu ID de Steam son solo números (ej. 123456789) o el link de tu perfil." : "Escribe tu ID de Steam (código de amigo).");
    el.reportValidity(); el.addEventListener("input", function () { el.setCustomValidity(""); }, { once: true });
  }
  function campoSteam(id, valor) {
    return '<div class="field"><label for="' + id + '">ID de Steam (código de amigo)</label><input id="' + id + '" inputmode="numeric" maxlength="80" placeholder="Ej. 123456789"' + (valor ? ' value="' + esc(valor) + '"' : '') + '>' +
      '<p class="hint">En Steam: <b>Amigos → Añadir un amigo</b> → "Tu código de amigo". Lo usamos para agregarte. También puedes pegar el link de tu perfil.</p></div>';
  }
  function esAdmin() { return uidSesion() === ADMIN_UID; }

  // Firestore REST con la sesión actual.
  function fsPedir(ruta, opts) {
    return token().then(function (tk) {
      opts = opts || {};
      opts.headers = Object.assign({ "Content-Type": "application/json", "Authorization": "Bearer " + tk }, opts.headers || {});
      return fetch(BASE + ruta, opts);
    });
  }
  // Datos de Steam = texto externo: la foto solo si es https de Steam y el enlace solo si es de steamcommunity.com.
  function imgSteamOk(u) { return /^https:\/\/[a-z0-9.-]+\.(steamstatic\.com|akamaihd\.net|steamusercontent\.com|steamcommunity\.com)\/[^\s"'<>]{1,300}$/i.test(String(u || "")); }
  function urlSteamOk(u) { return /^https:\/\/steamcommunity\.com\/[^\s"'<>]{1,200}$/.test(String(u || "")); }
  function avatarUsuario(u, grande) {
    var cls = "uav" + (grande ? " grande" : "");
    if (imgSteamOk(u.steamAvatar)) return '<img class="' + cls + '" src="' + esc(u.steamAvatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
    var n = String(u.nombre || u.email || "?").trim(), h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
    return '<span class="' + cls + ' ini" style="--h:' + h + '" aria-hidden="true">' + esc((n.charAt(0) || "?").toUpperCase()) + '</span>';
  }
  function leerPerfilDoc(d) {
    var f = (d && d.fields) || {};
    var sv = function (k) { return f[k] && f[k].stringValue || ""; };
    return {
      uid: d && d.name ? d.name.split("/").pop() : "",
      nombre: sv("nombre"), steam: sv("steam"), steamId: sv("steamId"), whatsapp: sv("whatsapp"), email: sv("email"), tradelink: sv("tradelink"),
      creditos: f.creditos ? Number(f.creditos.integerValue || f.creditos.doubleValue || 0) : 0,
      creado: f.creado && f.creado.timestampValue || "",
      steamAvatar: sv("steamAvatar"), steamPais: sv("steamPais"), steamPerfilUrl: sv("steamPerfilUrl"),
      steamPublico: f.steamPublico && typeof f.steamPublico.booleanValue === "boolean" ? f.steamPublico.booleanValue : null,
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
    subtitulo: "Recarga tu saldo, elige el premio que quieres y entra a la rifa. El ganador sale al azar.",
    logo1: "RAYAS", logo2: "STORE",
    kicker: "Rifas de Dota 2",
    btnRecargarNav: "Recargar",
    inicioKicker: "Tu tienda de Dota 2", inicioTitulo: "Todo para tus items de Dota 2",
    inicioSub: "Participa en rifas de items de Dota 2 usando tu saldo. El ganador sale al azar y la entrega es por Steam.",
    cardRifasT: "Rifas", cardRifasD: "Gana items de Dota 2 con tu saldo. El ganador sale al azar.", cardRifasBtn: "Ver rifas",
    cardItemsT: "Venta de items", cardItemsD: "Compra y vende items de Dota 2 de forma segura.", cardItemsBtn: "Ver items",
    btnVer: "Ver rifas", btnCreditos: "Recargar saldo",
    badge1: "Promo primera recarga", badge2: "Ganador al azar", badge3: "Entrega por Steam",
    rifasKicker: "Premios en juego", rifasT1: "Rifas", rifasT2: "activas", rifasSub: "Cada premio indica cuántos soles cuesta entrar.",
    vacioT: "Pronto nuevas rifas", vacioS: "Recarga tu saldo y te avisamos cuando abra la próxima.",
    msgCredPerfil: "¡Hola! 👋🔥 Soy *{nombre}* (📧 {correo}).\n\n💎 Quiero recargar saldo para participar en las rifas de *RAYAS STORE* 🎁🏆\n\n¿Me ayudas con mi recarga? 🙏✨",
    msgCredVisita: "¡Hola! 👋🔥 Quiero recargar saldo para las rifas de *RAYAS STORE* 💎🎁\n\n¿Me ayudas? 🙏✨",
    btnParticipar: "Participar", btnPronto: "Muy pronto", lblCreditos: "por ticket",
    comoKicker: "Paso a paso", comoT1: "Cómo", comoT2: "participar",
    paso1T: "Crea tu cuenta", paso1: "Regístrate con tu correo o con Google y deja tu link de intercambio de Steam.",
    paso2T: "Recarga saldo", paso2: "Recarga desde tu cuenta. Tu primera recarga puede traer saldo de regalo.",
    paso3T: "Entra a la rifa", paso3: "Elige el premio y usa tu saldo. Al cierre, el ganador sale al azar.",
    btnCreditos2: "Recargar mi saldo",
    ganKicker: "Salón de la fama", ganT: "Ganadores", ganVacioT: "Aún no hay ganadores", ganVacioS: "Cuando cierre la primera rifa, el ganador aparecerá aquí.",
    reglasKicker: "Juego limpio", reglasT: "Reglas",
    pie: "No afiliado a Valve. Dota 2 es una marca de Valve Corporation.",
    reglas: [
      "El saldo se recarga en esta página (en soles) y sirve para participar en las rifas y pagar items.",
      "El saldo usado en una rifa no se devuelve. Si hay un error en tu recarga, escríbenos por WhatsApp.",
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
    st.pagos = { culqi: !!(st.pagos && st.pagos.culqi) };
    st.secciones = { items: !!(st.secciones && st.secciones.items), rifas: !(st.secciones && st.secciones.rifas === false) };
    var yp = st.yape && typeof st.yape === "object" ? st.yape : {};
    st.yape = { qr: /^fs:img-[\w\-]+$/.test(String(yp.qr || "")) ? yp.qr : "", numero: String(yp.numero || "").replace(/\D+/g, "").slice(0, 12), nombre: typeof yp.nombre === "string" ? yp.nombre.slice(0, 40) : "" };
    (function () { // Todo en soles: limpia textos guardados que aún digan "créditos"
      var lim = function (x) { return typeof x !== "string" ? x : x.replace(/\(S\/ ?1 ?= ?1 cr[eé]ditos?\)/gi, "").replace(/(\d+) cr[eé]ditos?/gi, "$1 soles").replace(/\bTus cr[eé]ditos/g, "Tu saldo").replace(/\btus cr[eé]ditos/g, "tu saldo").replace(/\bLos cr[eé]ditos/g, "El saldo").replace(/\blos cr[eé]ditos/g, "el saldo").replace(/\bcr[eé]ditos?\b/gi, "saldo").replace(/\bcupos\b/g, "tickets").replace(/\bcupo\b/g, "ticket").replace(/\bCupos\b/g, "Tickets").replace(/\bCupo\b/g, "Ticket").replace(/ {2,}/g, " "); };
      if (st.textos && typeof st.textos === "object") Object.keys(st.textos).forEach(function (k) { var v = st.textos[k]; if (typeof v === "string") st.textos[k] = lim(v); else if (Array.isArray(v)) st.textos[k] = v.map(lim); });
    })();
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

  var cuenta = { modo: null, perfil: null, msg: "", msgTipo: "", tab: "info", abiertos: {}, tTipo: "", tBuscar: "" };
  var admin = { puede: esAdmin(), usuarios: null, pedidos: null, uFiltro: "", uMsg: "", vivo: false, imgEdit: null, imgErr: "", subiendo: null, login: false, abierto: false, tab: "premios", editando: null, borrar: null, msg: "", msgTipo: "" };

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
    if (/^https:\/\/[^\s"'<>()]+$/.test(src)) return src.replace(/(steamstatic\.com\/economy\/image\/[^\s"'<>()]+)\/(\d+)fx(\d+)f$/, function (m, a, w) { return Number(w) > 256 ? a + "/256fx256f" : m; });
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
    if (montoWsp > 0 && p) base += "\n\n💰 Quiero recargar *S/ " + montoWsp + "* (" + creditosPara(montoWsp) + " soles de saldo).";
    return base;
  }
  function creditoHref() {
    var a = contactos();
    return a.length > 1 ? "#elegir" : (a.length === 1 ? waLinkA(a[0].numero, msgCred(cuenta.perfil)) : "");
  }
  var elegirAbierto = false, modal = null, partes = {}, misParts = {};
  var montoWsp = 0;   // monto elegido para pedir por WhatsApp (0 = ninguno)
  // Saldo que recibe por un monto (solo para mostrar; el servidor calcula el real).
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
    if (libres <= 0) { modal = { tipo: "error", msg: "Ya no quedan tickets en esta rifa." }; render(); return; }
    if (permitidos <= 0) { modal = { tipo: "error", msg: "Ya tienes el máximo de tickets permitido en esta rifa (" + tope + ")." }; render(); return; }
    if (puedePagar < 1) { modal = { tipo: "sinSaldo", p: info }; render(); return; }
    modal = { tipo: "confirmar", p: info, qty: 1, max: Math.max(1, Math.min(100, libres, permitidos, puedePagar)), mio: mio, tope: tope }; render();
  }
  function confirmarPart() {
    var m = modal; if (!m || !m.p || !cuenta.perfil) return;
    var p = m.p, qty = m.qty || 1, uid = uidSesion();
    var ex = (partes[p.id] || []).filter(function (x) { return x.uid === uid; })[0];
    modal = { tipo: "cargando" }; render();
    token().then(function (tk) {
      return fetch(PAGOS.urlParticipar, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ premio: p.id, cantidad: qty }) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo registrar tu participación. Si sigue pasando, avisa al encargado.");
        return j;
      });
    }).then(function (j) {
      var total = Number(j.gastado) || 0;
      cuenta.perfil.creditos = Number(j.saldo); misParts[p.id] = Number(j.mio) || ((misParts[p.id] || 0) + qty);
      if (ex) { ex.cantidad += qty; ex.costo = (ex.costo || 0) + total; }
      else (partes[p.id] = partes[p.id] || []).push({ uid: uid, nombre: cuenta.perfil.nombre, costo: total, cantidad: qty, creado: new Date().toISOString(), premioNombre: p.nombre });
      modal = { tipo: "ok", p: p, qty: qty, mio: misParts[p.id] }; render();
    }).catch(function (e) { modal = { tipo: "error", msg: errSimple((e && e.message) || "No se pudo participar.") }; render(); });
  }
  /* ---- Recarga de saldo con Culqi ---- */
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
      C.settings({ title: "Rayas Store", currency: "PEN", description: "Recarga de saldo", amount: Math.round(totalTarjeta(soles) * 100) });
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
  // Efectivo / QR / billeteras: el servidor crea una ORDEN en Culqi y la ventana de Culqi muestra el código.
  function iniciarEfectivo(soles) {
    soles = Number(soles);
    if (!cuenta.perfil || !(soles >= PAGOS.minYape && soles <= PAGOS.max) || Math.floor(soles) !== soles) return;
    modal = { tipo: "cargando" }; render();
    token().then(function (tk) {
      return fetch(PAGOS.urlOrden, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ soles: soles }) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.ok) throw new Error(x.j.error || "No se pudo generar el código de pago.");
        return cargarCulqi().then(function () {
          var C = window.Culqi;
          window.culqi = function () { /* en órdenes no hay token: el pago llega por aviso de Culqi */ };
          C.publicKey = PAGOS.culqiPk;
          C.settings({ title: "Rayas Store", currency: "PEN", description: "Recarga de saldo", amount: Math.round(totalTarjeta(soles) * 100), order: x.j.ordenId });
          C.options({ lang: "es", installments: false, paymentMethods: { tarjeta: false, yape: false, billetera: true, bancaMovil: true, agente: true, cuotealo: false } });
          modal = { tipo: "efectivoPend", soles: soles }; render(); C.open();
        });
      }).catch(function (e) { modal = { tipo: "error", msg: (e && e.message) || "No se pudo generar el código de pago." }; render(); });
  }
  // Botón "recargar": abre el pago si está activo, si no cae al WhatsApp de siempre.
  function btnRecargar(cls, key, href) {
    if (vivo() || !recargaOn()) return href || vivo() ? lnk(cls, href, key, true) : "";
    return '<button class="' + cls + '" type="button" data-a="recargar">' + esc(estado.textos[key]) + '</button>';
  }

  // Mensajes de error en lenguaje simple (sin códigos ni jerga técnica)
  function errSimple(m) {
    m = String(m == null ? "" : m).trim();
    if (!m) return "Algo salió mal. Intenta de nuevo en un momento.";
    if (/NO_SESSION|sesi[oó]n venci/i.test(m)) return "Tu sesión venció. Vuelve a entrar a tu cuenta.";
    if (/Failed to fetch|NetworkError|network|timeout|conexi[oó]n/i.test(m) && !/[a-záéíóú]{4,} [a-záéíóú]{3,} [a-záéíóú]{3,}/i.test(m.replace(/Failed to fetch|NetworkError/gi, ""))) return "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.";
    if (/\b(40[13]|permission|PERM|PERMISSION_DENIED)\b/i.test(m)) return "No tienes permiso para hacer esto. Entra de nuevo a tu cuenta e intenta otra vez.";
    if (/\b(404|not found)\b/i.test(m)) return "No encontramos lo que buscabas. Recarga la página e intenta de nuevo.";
    if (/\b(5\d\d)\b|INTERNAL|UNAVAILABLE|HTTP|Error \d+/i.test(m)) return "El servidor tuvo un problema. Intenta de nuevo en unos minutos; si sigue, escríbenos por WhatsApp.";
    if (/INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_LOGIN|INVALID_EMAIL/i.test(m)) return "El correo o la contraseña no son correctos.";
    if (/EMAIL_EXISTS/i.test(m)) return "Ese correo ya tiene una cuenta. Entra con él.";
    if (/WEAK_PASSWORD/i.test(m)) return "La contraseña es muy corta (mínimo 6 caracteres).";
    if (/TOO_MANY_ATTEMPTS/i.test(m)) return "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
    if (/^[A-Z_]{5,}$/.test(m)) return "No se pudo completar. Intenta de nuevo en un momento.";
    return m;
  }
  function pasosHtml(n) {
    return '<ol class="pasos" aria-label="Pasos">' + ["Elegir", "Pagar", "Listo"].map(function (t, i) {
      return '<li class="' + (i + 1 < n ? 'hecho' : (i + 1 === n ? 'on' : '')) + '"' + (i + 1 === n ? ' aria-current="step"' : '') + '><b>' + (i + 1 < n ? '✓' : (i + 1)) + '</b><span>' + t + '</span></li>';
    }).join("") + '</ol>';
  }
  function pasoDe(m) {
    var t = m.tipo;
    if (t === "carrito" || t === "item" || t === "confirmar" || t === "sinSaldo") return 1;
    if (t === "recarga") return m.sel ? 2 : 1;
    if (t === "yape" || t === "efectivoPend" || t === "cargando") return 2;
    if (t === "itemOk" || t === "recargaOk" || t === "ok") return 3;
    return 0;
  }
  function modalAviso() {
    var m = modal, c = cuenta.perfil, h = "", btns = "";
    var cerrar = '<button class="btn btn-ghost btn-sm" type="button" data-a="cerrarModal">Cerrar</button>';
    if (m.tipo === "sinSaldo") {
      var rl = creditoHref();
      h = '<h3>Saldo insuficiente 😕</h3><p class="hint">La rifa de <b>' + esc(m.p.nombre) + '</b> cuesta <b>' + m.p.cred + '</b> soles y tú tienes <b>' + fmtSol(c ? c.creditos : 0) + '</b>. Recarga saldo para poder participar.</p>';
      btns = (recargaOn() ? '<button class="btn btn-fuchsia" type="button" data-a="recargar">💳 Recargar saldo</button>' : '') +
        (rl ? '<a class="btn btn-yellow" href="' + esc(rl) + '"' + (rl === "#elegir" ? ' data-a="elegir"' : ' target="_blank" rel="noopener"') + '>💎 ' + (pagosOn() ? 'Pedir por WhatsApp' : 'Recargar saldo') + '</a>' : '') + cerrar;
    } else if (m.tipo === "recarga") {
      var primera = !!(c && !c.promoUsada), sel = m.sel || 0, cred = sel ? creditosPara(sel) : 0;
      h = '<h3>Recargar saldo 💎</h3>' +
        (primera ? '<div class="promo-banner"><b>🎁 PROMO PRIMERA RECARGA</b><span>S/ 50 → <b>55</b> soles · S/ 100 → <b>110</b> soles</span></div>' : '') +
        '<p class="hint"><b>1.</b> Elige cuánto quieres recargar</p>' +
        '<div class="packs">' + PACKS_UI.map(function (pk) {
          var extra = primera && pk.promo ? pk.promo : 0;
          return '<button class="btn ' + (extra ? 'btn-fuchsia' : 'btn-yellow') + ' pack' + (sel === pk.soles ? ' sel' : '') + '" type="button" data-a="monto" data-s="' + pk.soles + '" aria-pressed="' + (sel === pk.soles) + '">' +
            (extra ? '<i class="tag">🎁 +S/ ' + (extra - pk.base) + ' de regalo</i>' : '') +
            '<b>S/ ' + pk.soles + '</b><span>' + (extra || pk.base) + ' soles</span></button>';
        }).join("") + '</div>' +
        '<div class="otro"><label for="monto-otro">Otro monto (S/ ' + PAGOS.min + ' a S/ ' + PAGOS.max + ')</label>' +
        '<div class="otrorow"><input id="monto-otro" type="number" inputmode="numeric" min="' + PAGOS.min + '" max="' + PAGOS.max + '" step="1" placeholder="Ej. 30" value="' + esc(m.otro || "") + '">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-a="montoOtro">Usar</button></div></div>' +
        (m.err ? '<p class="hint" style="color:var(--danger)" role="alert">' + esc(m.err) + '</p>' : '') +
        (sel ? '<p class="resumen recibes">Recibes <b>S/ ' + cred + '</b> de saldo' + (cred > sel ? ' <em class="regalo">🎁 incluye S/ ' + (cred - sel) + ' de regalo</em>' : '') + '</p>' +
          '<div class="cuentas">' + (pagosOn() ? '<p class="hint">💳 Tarjeta / efectivo / QR: pagas <b>S/ ' + fmtSol(totalTarjeta(sel)) + '</b> (S/ ' + fmtSol(sel) + ' + S/ ' + fmtSol(totalTarjeta(sel) - sel) + ' de comisión de Culqi)</p>' : '') +
          '<p class="hint">💜 Yape / WhatsApp: pagas <b>S/ ' + fmtSol(sel) + '</b>, <b>sin comisión</b></p></div>' +
          '<p class="hint"><b>2.</b> Elige cómo quieres pagar</p>' : '');
      btns = (sel ? (pagosOn() ? '<button class="btn btn-fuchsia" type="button" data-a="pagarCulqi">💳 Pagar con tarjeta · S/ ' + fmtSol(totalTarjeta(sel)) + '</button>' +
        (sel >= PAGOS.minYape ? '<button class="btn btn-yellow" type="button" data-a="pagarEfectivo">💵 Efectivo / QR / billeteras · S/ ' + fmtSol(totalTarjeta(sel)) + '</button>' : '') : '') +
        (yapeOn() ? '<button class="btn btn-fuchsia" type="button" data-a="yape">💜 Pagar con Yape · sin comisión</button>' : '') +
        '<button class="btn btn-yellow" type="button" data-a="recargaWsp">💬 Pagar por WhatsApp · sin comisión</button>' : '') +
        (pagosOn() ? '<p class="hint" style="font-size:.78rem;opacity:.85">Tarjeta: pago seguro con Culqi desde S/ ' + PAGOS.min + ', tu saldo se suman solos. <b>Efectivo (PagoEfectivo), QR y billeteras: desde S/ ' + PAGOS.minYape + '</b>: te damos un código, pagas cuando quieras (hasta 24 h) y tu saldo se suman solos al confirmarse.</p>' : '') +
        '<p class="hint" style="font-size:.78rem;opacity:.85">¿Montos menores a S/ ' + PAGOS.minYape + ' con Yape, o prefieres pagar con una persona? Elige <b>Pagar por WhatsApp</b> y te atiende el encargado, que carga tu saldo él mismo. El saldo usado en una rifa no se devuelve.</p>' + cerrar;
    } else if (m.tipo === "item") {
      var mi = modalItemHtml(m); h = mi.h; btns = mi.btns + cerrar;
    } else if (m.tipo === "carrito") {
      var mc = carroHtml(); h = mc.h; btns = mc.btns;
    } else if (m.tipo === "itemOk") {
      h = '<h3>¡Compra lista! 🎉</h3><p class="hint">Compraste <b>' + esc(m.nombre) + '</b>. Pedido <b>' + esc(m.code) + '</b>. Te quedan <b>' + fmtSol(m.saldo) + '</b> soles. Te escribiremos para entregártelo por Steam; asegúrate de tener tu link de intercambio en tu cuenta.</p>';
      btns = cerrar;
    } else if (m.tipo === "yape") {
      var yp = estado.yape || {};
      h = '<h3>Pagar con Yape 💜</h3><p class="hint">Yapea <b>S/ ' + fmtSol(m.sel) + '</b> (sin comisión) y avísanos por WhatsApp con tu captura. Te cargamos <b>' + creditosPara(m.sel) + ' soles</b> a tu cuenta.</p>' +
        (yp.qr ? '<div class="yapeqr"><img data-fs="' + esc(yp.qr.slice(3)) + '" alt="QR de Yape" width="240" height="240"></div>' : '') +
        (yp.numero || yp.nombre ? '<p class="hint" style="text-align:center">' + (yp.numero ? 'Yape al <b>' + esc(yp.numero) + '</b>' : '') + (yp.nombre ? ' · a nombre de <b>' + esc(yp.nombre) + '</b>' : '') + '</p>' : '') +
        '<p class="hint"><b>1.</b> Escanea el QR o yapea al número. <b>2.</b> Toca el botón de abajo y envía la captura del Yape por WhatsApp. <b>3.</b> Cargamos tu saldo (usa el mismo nombre/correo de tu cuenta).</p>';
      btns = '<button class="btn btn-ghost btn-sm" type="button" data-a="yapeBajar">⬇ Descargar QR</button><button class="btn btn-yellow" type="button" data-a="yapeAvisar">✅ Ya pagué · enviar captura por WhatsApp</button><button class="btn btn-ghost btn-sm" type="button" data-a="volverRecarga">← Cambiar monto</button>' + cerrar;
    } else if (m.tipo === "efectivoPend") {
      h = '<h3>Código de pago listo 💵</h3><p class="hint">Se abrió tu código de pago por <b>S/ ' + m.soles + '</b>. Págalo en un agente, banco, app bancaria o con QR (vale por 24 horas). Cuando Culqi lo confirme, tu saldo se suman solos; puede tardar unos minutos.</p>' +
        '<p class="hint">Tienes <b>' + fmtSol(c ? c.creditos : 0) + '</b> soles ahora.</p>';
      btns = '<button class="btn btn-fuchsia" type="button" data-a="refrescarSaldo">🔄 Ya pagué · actualizar mi saldo</button>' + cerrar;
    } else if (m.tipo === "recargaOk") {
      h = '<h3>¡Recarga lista! 🎉</h3><p class="hint">Se sumaron <b>' + m.creditos + '</b> soles' + (m.promo ? ' (incluye tu regalo de primera recarga 🎁)' : '') + '. Ahora tienes <b>' + (c ? c.creditos : 0) + '</b>.</p>';
      btns = '<button class="btn btn-yellow" type="button" data-a="cerrarModal">Ver rifas</button>';
    } else if (m.tipo === "confirmar") {
      var tot = m.qty * m.p.cred;
      h = '<h3>¿Entrar a la rifa? 🎟️</h3><p class="hint">Rifa: <b>' + esc(m.p.nombre) + '</b> · ' + m.p.cred + ' soles por ticket.' + (m.mio ? ' Ya tienes <b>' + m.mio + '</b> ' + (m.mio === 1 ? 'ticket' : 'tickets') + '.' : '') + '</p>' +
        '<div class="qty" role="group" aria-label="Cantidad de tickets"><button type="button" data-a="qtyMenos"' + (m.qty <= 1 ? ' disabled' : '') + ' aria-label="Menos">−</button><span><b>' + m.qty + '</b><small>' + (m.qty === 1 ? 'ticket' : 'tickets') + '</small></span><button type="button" data-a="qtyMas"' + (m.qty >= m.max ? ' disabled' : '') + ' aria-label="Más">+</button></div>' +
        '<div class="qtot"><div><small>Total</small><b>S/ ' + tot + '</b></div><div><small>Te quedarán</small><b>S/ ' + fmtSol(c.creditos - tot) + '</b></div></div>' +
        '<p class="hint">' + (m.max < 100 ? 'Máximo ahora: ' + m.max + '. ' : '') + 'Más tickets = más chances de ganar 🍀</p>';
      btns = '<button class="btn btn-yellow" type="button" data-a="confirmarPart">✔ Confirmar ' + m.qty + (m.qty === 1 ? ' ticket' : ' tickets') + '</button><button class="btn btn-ghost btn-sm" type="button" data-a="cerrarModal">Cancelar</button>';
    } else if (m.tipo === "cargando") {
      h = '<h3>Procesando…</h3><p class="hint">Un momento por favor.</p>';
    } else if (m.tipo === "ok") {
      h = '<h3>¡Ya estás participando! 🎉</h3><p class="hint">Tomaste <b>' + m.qty + '</b> ' + (m.qty === 1 ? 'ticket' : 'tickets') + ' en la rifa de <b>' + esc(m.p.nombre) + '</b> (en total tienes <b>' + m.mio + '</b>). Te quedan <b>' + (c ? c.creditos : 0) + '</b> soles. ¡Mucha suerte! 🍀🏆</p>';
      btns = cerrar;
    } else {
      h = '<h3>Ups 😕</h3><p class="hint">' + esc(errSimple(m.msg || "No se pudo completar.")) + '</p>';
      btns = cerrar;
    }
    var pasoN = pasoDe(m);
    return '<div class="scrim scrim-top" data-a="' + (m.tipo === "cargando" ? "" : "cerrarModal") + '"></div><div class="elegir" role="dialog" aria-label="Participar">' + (pasoN ? pasosHtml(pasoN) : '') + h + '<div class="mbtns">' + btns + '</div></div>';
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
      rt.run = false; rt.fin = true; ruletaFin(); confeti();
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
  /* Foto del premio ampliada (se cierra con clic o Escape) */
  function abrirZoom(src, alt) {
    var viejo = document.getElementById("rzoom"); if (viejo) viejo.parentNode.removeChild(viejo);
    var d = document.createElement("div"); d.id = "rzoom"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Foto ampliada");
    d.innerHTML = '<button type="button" class="rz-x" aria-label="Cerrar">✕</button><img alt="">';
    var im = d.querySelector("img"); im.src = src; im.alt = alt;
    function cerrar() { document.removeEventListener("keydown", tecla); if (d.parentNode) d.parentNode.removeChild(d); }
    function tecla(ev) { if (ev.key === "Escape") cerrar(); }
    d.addEventListener("click", cerrar); document.addEventListener("keydown", tecla);
    document.body.appendChild(d);
    requestAnimationFrame(function () { d.classList.add("on"); });
  }
  /* Confeti de celebración al salir el ganador */
  function confeti() {
    try { if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) { /* nada */ }
    var old = document.getElementById("rconfeti"); if (old) old.parentNode.removeChild(old);
    var cv = document.createElement("canvas"); cv.id = "rconfeti"; cv.width = window.innerWidth; cv.height = window.innerHeight; document.body.appendChild(cv);
    var ctx = cv.getContext("2d"), cols = ["#ffc93c", "#ffe08a", "#ff2d8f", "#ff8cc4", "#ffffff", "#4b69ff"], N = window.innerWidth < 600 ? 90 : 160, t0 = Date.now(), ps = [];
    for (var i = 0; i < N; i++) ps.push({ x: cv.width / 2 + (Math.random() - .5) * 80, y: cv.height * .42, vx: (Math.random() - .5) * 14, vy: -Math.random() * 13 - 4, w: 5 + Math.random() * 7, h: 3 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[i % cols.length] });
    (function f() {
      var dt = Date.now() - t0; if (dt > 3600 || !cv.parentNode) { if (cv.parentNode) cv.parentNode.removeChild(cv); return; }
      ctx.clearRect(0, 0, cv.width, cv.height); ctx.globalAlpha = dt > 2800 ? Math.max(0, 1 - (dt - 2800) / 800) : 1;
      ps.forEach(function (q) { q.vy += .32; q.vx *= .992; q.x += q.vx; q.y += q.vy; q.r += q.vr; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.fillStyle = q.c; ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); ctx.restore(); });
      requestAnimationFrame(f);
    })();
  }
  function modalRuleta() {
    var rt = ruleta, g = rt.segs[rt.w], p = estado.premios[buscarPremio(rt.pid)] || {};
    return '<div class="scrim scrim-top"></div><div class="elegir ruleta" role="dialog" aria-label="Ruleta"><h3>' + (rt.modo === "replay" ? '🎬 Repetición del sorteo' : '🎲 Sorteo') + ' · ' + esc(p.nombre || "") + '</h3>' +
      '<div class="rwrap"><div class="rpin"></div><canvas id="ruleta-cv" width="440" height="440"></canvas></div>' +
      (rt.fin ? '<div class="rwin">🏆 ¡Ganador: <b>' + esc(g.n) + '</b>!</div>' + (rt.modo === "replay" && rt.fecha ? '<p class="hint">Sorteo realizado: ' + esc(fechaHora(rt.fecha)) + '</p>' : '') : '<p class="hint">' + rt.segs.length + ' participante' + (rt.segs.length === 1 ? '' : 's') + '. Más tickets = más espacio en la ruleta.</p>') +
      '<div class="rbtns">' +
      (!rt.fin && !rt.run ? '<button class="btn btn-yellow" id="ruleta-go" type="button" data-a="ruletaGirar">' + (rt.modo === "replay" ? '▶ Ver repetición' : '🎰 ¡Girar!') + '</button>' : '') +
      (rt.fin && rt.modo === "sorteo" ? '<button class="btn btn-fuchsia" type="button" data-a="ruletaGuardar">Guardar y publicar resultado</button>' : '') +
      (rt.fin && rt.modo === "replay" ? '<button class="btn btn-ghost" type="button" data-a="ruletaOtra">↻ Ver otra vez</button>' : '') +
      (!rt.run ? '<button class="btn btn-ghost btn-sm" type="button" data-a="ruletaCerrar">Cerrar</button>' : '') + '</div></div>';
  }
  function modalElegir() {
    return '<div class="scrim scrim-top" data-a="cerrarElegir"></div>' +
      '<div class="elegir" role="dialog" aria-label="Elegir contacto"><h3>¿Con quién quieres hablar?</h3>' +
      '<p class="hint">Elige a quién escribirle por WhatsApp para pedir tu saldo.</p>' +
      contactos().map(function (c) {
        return '<a class="contacto" href="' + esc(waLinkA(c.numero, elegirMsg || msgCred(cuenta.perfil))) + '" target="_blank" rel="noopener">' + avatar(c) +
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
    return u ? '<img src="' + esc(u) + '" alt="' + esc(alt) + '" decoding="async"' + (extra || '') + '>' : '';
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
  // Editor de foto del item: encuadra a 3:2 (640x427) antes de subir. Devuelve un File listo, o null si cancela.
  function editorFoto(file) {
    return new Promise(function (ok, fail) {
      if (!file || !/^image\//.test(file.type)) return fail(new Error("Elige un archivo de imagen (JPG, PNG o WEBP)."));
      var W = 640, H = 427, url = URL.createObjectURL(file), im = new Image();
      im.onerror = function () { URL.revokeObjectURL(url); fail(new Error("No se pudo leer la imagen.")); };
      im.onload = function () {
        URL.revokeObjectURL(url);
        var st = { modo: "llenar", zoom: 1, ox: 0, oy: 0 };
        var ov = document.createElement("div"); ov.className = "fed-ov";
        ov.innerHTML = '<div class="fed" role="dialog" aria-label="Preparar foto"><h3>Preparar foto</h3>' +
          '<canvas width="' + W + '" height="' + H + '"></canvas>' +
          '<p class="hint">Arrastra la foto para centrar el item. Salen 3:2 · 640×427.</p>' +
          '<div class="fed-row"><button type="button" class="btn btn-ghost btn-sm sel" data-m="llenar">Llenar</button><button type="button" class="btn btn-ghost btn-sm" data-m="completo">Completo</button><label>Zoom <input type="range" min="1" max="3" step="0.01" value="1"></label></div>' +
          '<div class="fed-row"><button type="button" class="btn btn-yellow btn-sm" data-x="ok">Usar esta foto</button><button type="button" class="btn btn-ghost btn-sm" data-x="no">Cancelar</button></div>' +
          (im.naturalWidth < 400 ? '<p class="hint">⚠ La foto es pequeña y puede verse borrosa.</p>' : '') + '</div>';
        document.body.appendChild(ov);
        var cv = ov.querySelector("canvas"), g = cv.getContext("2d"), rg = ov.querySelector("input");
        function dib() {
          g.fillStyle = "#6e6e6e"; g.fillRect(0, 0, W, H);
          var b = st.modo === "llenar" ? Math.max(W / im.naturalWidth, H / im.naturalHeight) : Math.min(W / im.naturalWidth, H / im.naturalHeight);
          var sc = b * st.zoom, w = im.naturalWidth * sc, h = im.naturalHeight * sc;
          g.imageSmoothingQuality = "high"; g.drawImage(im, (W - w) / 2 + st.ox, (H - h) / 2 + st.oy, w, h);
        }
        dib();
        var arr = null;
        cv.addEventListener("pointerdown", function (e) { arr = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; cv.setPointerCapture(e.pointerId); });
        cv.addEventListener("pointermove", function (e) { if (!arr) return; var k = W / cv.getBoundingClientRect().width; st.ox = arr.ox + (e.clientX - arr.x) * k; st.oy = arr.oy + (e.clientY - arr.y) * k; dib(); });
        cv.addEventListener("pointerup", function () { arr = null; });
        rg.addEventListener("input", function () { st.zoom = parseFloat(rg.value); dib(); });
        function cerrar() { ov.remove(); }
        ov.addEventListener("click", function (e) {
          var m = e.target.getAttribute && e.target.getAttribute("data-m"), x = e.target.getAttribute && e.target.getAttribute("data-x");
          if (m) { st.modo = m; st.ox = 0; st.oy = 0; st.zoom = 1; rg.value = "1"; var bs = ov.querySelectorAll("[data-m]"); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("sel", bs[i] === e.target); dib(); }
          else if (x === "no" || e.target === ov) { cerrar(); ok(null); }
          else if (x === "ok") {
            cv.toBlob(function (b) { cerrar(); if (!b) return fail(new Error("No se pudo preparar la foto.")); ok(new File([b], "item.webp", { type: b.type })); }, "image/webp", 0.85);
          }
        });
      };
      im.src = url;
    });
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

  /* ================= Comprar items (catálogo que agrega el admin a mano) ================= */
  var ITEMS_URL = "https://compraritem-seqcayr4iq-uc.a.run.app";
  var ITEM_TIPOS = ["Wearable", "Courier", "Ward", "HUD Skin", "Announcer", "Bundle", "Loading Screen", "Pennant", "Sticker", "Otro"];
  var ITEM_CALIDADES = ["Standard", "Genuine", "Unusual", "Inscribed", "Autographed", "Heroic", "Corrupted", "Frozen", "Cursed", "Infused", "Exalted"];
  var items = { lista: [], cargado: false, cargando: false, err: "" };
  var avisoNuevoItem = false;
  var filtros = { q: "", min: "", max: "", tipo: "", heroe: "", ranura: "", rareza: "", calidad: "", orden: "mayor", pag: 0 };
  var elegirMsg = null;
  function sinTildes(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function fmtPrecio(n) { return "S/ " + (Math.round(Number(n) * 100) / 100).toFixed(2).replace(/\.00$/, ""); }
  function itemDeDoc(d) {
    var f = (d && d.fields) || {};
    function sv(k) { return f[k] && f[k].stringValue || ""; }
    function nv(k) { return f[k] ? Number(f[k].doubleValue !== undefined ? f[k].doubleValue : (f[k].integerValue || 0)) : 0; }
    return { id: d.name.split("/").pop(), nombre: sv("nombre"), img: sv("img"), precio: nv("precio"), stock: f.stock ? nv("stock") : 1,
      tipo: sv("tipo"), heroe: sv("heroe"), ranura: sv("ranura"), rareza: sv("rareza"), calidad: sv("calidad"),
      estilos: nv("estilos"), estOk: sv("estOk"), descripcion: sv("descripcion"), steamUsd: nv("steamUsd"), steamAct: f.steamAct && f.steamAct.timestampValue || "",
      activo: f.activo ? f.activo.booleanValue !== false : true, creado: f.creado && f.creado.timestampValue || "" };
  }
  function itemAFields(it) {
    var s = function (v) { return { stringValue: String(v || "") }; };
    return { fields: { nombre: s(it.nombre), img: s(it.img), precio: { doubleValue: Number(it.precio) }, stock: { integerValue: String(Math.max(0, Math.floor(Number(it.stock) || 0))) },
      tipo: s(it.tipo), heroe: s(it.heroe), ranura: s(it.ranura), rareza: s(it.rareza), calidad: s(it.calidad), estilos: { integerValue: String(Math.max(0, Math.min(8, Math.floor(Number(it.estilos) || 0)))) }, estOk: s(it.estOk), descripcion: s(it.descripcion), activo: { booleanValue: it.activo !== false }, steamUsd: { doubleValue: Number(it.steamUsd) > 0 ? Number(it.steamUsd) : 0 }, steamAct: { timestampValue: it.steamAct || new Date(0).toISOString() },
      creado: { timestampValue: it.creado || new Date().toISOString() } } };
  }
  function cargarItems(forzar) {
    if (items.cargando || (items.cargado && !forzar)) return;
    items.cargando = true; items.err = "";
    var acc = [];
    function pag(t) {
      return fetch(BASE + "rayas_items?pageSize=300" + (t ? "&pageToken=" + encodeURIComponent(t) : ""), { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("No se pudo cargar el catálogo (" + r.status + ").");
        return r.json();
      }).then(function (j) {
        (j.documents || []).forEach(function (d) { acc.push(itemDeDoc(d)); });
        return j.nextPageToken && acc.length < 2000 ? pag(j.nextPageToken) : null;
      });
    }
    pag("").then(function () { items.lista = acc; items.cargado = true; }).catch(function (e) { items.err = e.message || "No se pudo cargar el catálogo."; })
      .then(function () { items.cargando = false; aplicarRutaCatalogo(); render(); });
  }
  function heroeCoincide(h) {
    var f = sinTildes(filtros.heroe).trim(); if (!f) return true;
    var exacto = distintos("heroe", HEROES_DOTA).some(function (x) { return sinTildes(x) === f; });
    var v = sinTildes(h || ""); return exacto ? v === f : v.indexOf(f) >= 0;
  }
  function itemsFiltrados() {
    var q = sinTildes(filtros.q), mn = parseFloat(filtros.min), mx = parseFloat(filtros.max);
    var l = items.lista.filter(function (it) {
      if (!it.activo && !admin.puede) return false;
      if (filtros.tipo && it.tipo !== filtros.tipo) return false;
      if (filtros.heroe && !heroeCoincide(it.heroe)) return false;
      if (filtros.ranura && it.ranura !== filtros.ranura) return false;
      if (filtros.rareza && it.rareza !== filtros.rareza) return false;
      if (filtros.calidad && it.calidad !== filtros.calidad) return false;
      if (isFinite(mn) && it.precio < mn) return false;
      if (isFinite(mx) && it.precio > mx) return false;
      if (q && sinTildes(it.nombre + " " + it.heroe + " " + it.tipo).indexOf(q) < 0) return false;
      return true;
    });
    // Mismo item con distintas versiones (gemas, precio): una sola tarjeta con el precio más bajo, como lis-skins.
    var gr = {}, orden = [];
    l.forEach(function (it) {
      var k = sinTildes(it.nombre), g = gr[k];
      if (!g) { g = gr[k] = { rep: it, tot: 0, precios: {} }; orden.push(k); }
      g.tot += Math.max(0, it.stock); g.precios[it.precio] = 1;
      if (g.rep !== it && ((g.rep.stock <= 0 && it.stock > 0) || ((g.rep.stock > 0) === (it.stock > 0) && it.precio < g.rep.precio))) g.rep = it;
    });
    l = orden.map(function (k) { var g = gr[k]; return Object.assign({}, g.rep, { _tot: g.tot, _desde: Object.keys(g.precios).length > 1 }); });
    l.sort(function (a, b) {
      if (filtros.orden === "menor") return a.precio - b.precio;
      if (filtros.orden === "mayor") return b.precio - a.precio;
      if (filtros.orden === "nombre") return a.nombre.localeCompare(b.nombre);
      return String(b.creado).localeCompare(String(a.creado));
    });
    return l;
  }
  var SLOTS_DOTA = ["Ability 1", "Ability 2", "Ability 3", "Ability 4", "Ancient", "Announcer", "Armor", "Arms", "Back", "Belt", "Body - Head", "Costume", "Courier", "Cursor Pack", "Dire Creeps", "Dire Siege Creeps", "Dire Towers", "Gloves", "HUD Skin", "Head", "Hero Base", "Heroic Effigy", "Legs", "Loading Screen", "Mega-Kill Announcer", "Misc", "Mount", "Multikill Banner", "Music", "N/A", "Neck", "Off-Hand", "Radiant Creeps", "Radiant Siege Creeps", "Radiant Towers", "Shapeshift", "Shoulder", "Summoned Unit", "Tail", "Taunt", "Terrain", "Ultimate", "Versus Screen", "Voice", "Ward", "Weapon", "Weather"];
  var HEROES_DOTA = ["Abaddon", "Alchemist", "Ancient Apparition", "Anti-Mage", "Anti-Mage (Wei)", "Arc Warden", "Axe", "Bane", "Batrider", "Beastmaster", "Bloodseeker", "Bounty Hunter", "Brewmaster", "Bristleback", "Broodmother", "Centaur Warrunner", "Chaos Knight", "Chen", "Clinkz", "Clockwerk", "Crystal Maiden", "Dark Seer", "Dark Willow", "Dawnbreaker", "Dazzle", "Death Prophet", "Disruptor", "Doom", "Dragon Knight", "Drow Ranger", "Earth Spirit", "Earthshaker", "Elder Titan", "Ember Spirit", "Enchantress", "Enigma", "Faceless Void", "Grimstroke", "Gyrocopter", "Hoodwink", "Huskar", "Invoker", "Io", "Jakiro", "Juggernaut", "Keeper of the Light", "Kez", "Kunkka", "Largo", "Legion Commander", "Leshrac", "Lich", "Lifestealer", "Lina", "Lion", "Lone Druid", "Luna", "Lycan", "Magnus", "Marci", "Mars", "Medusa", "Meepo", "Mirana", "Monkey King", "Morphling", "Muerta", "Naga Siren", "Nature's Prophet", "Necrophos", "Night Stalker", "Nyx Assassin", "Ogre Magi", "Omniknight", "Oracle", "Outworld Destroyer", "Pangolier", "Phantom Assassin", "Phantom Lancer", "Phoenix", "Primal Beast", "Puck", "Pudge", "Pugna", "Queen of Pain", "Razor", "Riki", "Ringmaster", "Rubick", "Sand King", "Shadow Demon", "Shadow Fiend", "Shadow Shaman", "Silencer", "Skywrath Mage", "Slardar", "Slark", "Snapfire", "Sniper", "Spectre", "Spirit Breaker", "Storm Spirit", "Sven", "Techies", "Templar Assassin", "Terrorblade", "Tidehunter", "Timbersaw", "Tinker", "Tiny", "Treant Protector", "Troll Warlord", "Tusk", "Underlord", "Undying", "Ursa", "Vengeful Spirit", "Venomancer", "Viper", "Visage", "Void Spirit", "Warlock", "Weaver", "Windranger", "Winter Wyvern", "Witch Doctor", "Wraith King", "Zeus"];
  function distintos(k, base) {
    var set = {}, out = [];
    (base || []).concat(items.lista.map(function (x) { return x[k]; })).forEach(function (v) { if (v && !set[v]) { set[v] = 1; out.push(v); } });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }
  var COLOR_OPCION = { "ARCANO": "#ade55c", "INMORTAL": "#e4ae39", "LEGENDARIO": "#e455f5", "MÍTICO": "#a37dff", "RARO": "#6f8aff", "POCO COMÚN": "#7db3ec", "COMÚN": "#c3d2e3" };
  function opciones(lista, sel, vacio) {
    return '<option value="">' + esc(vacio) + '</option>' + lista.map(function (v) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + (COLOR_OPCION[v] ? ' style="color:' + COLOR_OPCION[v] + ';font-weight:700"' : '') + '>' + esc(v) + '</option>'; }).join("");
  }
  /* Precio de referencia en el Mercado de Steam (US$) pasado a soles con el tipo de cambio de la página (COM.tc). */
  function urlSteam(it) { return "https://steamcommunity.com/market/listings/570/" + encodeURIComponent(it.nombre); }
  function steamSoles(it) { var u = Number(it.steamUsd); return u > 0 ? u * COM.tc : 0; }
  function steamHtml(it, chico) {
    var sol = steamSoles(it);
    return '<div class="isteam' + (chico ? ' grande' : '') + '"><span>' + (sol ? 'Steam: <b>' + fmtPrecio(sol) + '</b>' : 'Mercado de Steam') + '</span>' +
      '<a class="isteam-go" data-a="irSteam" href="' + esc(urlSteam(it)) + '" target="_blank" rel="noopener noreferrer" title="Ver en el Mercado de Steam" aria-label="Ver ' + esc(it.nombre) + ' en el Mercado de Steam">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>';
  }
  function itemCardHtml(it) {
    var agot = it.stock <= 0, col = colorRareza(it.rareza);
    return '<article class="icard' + (agot ? ' agot' : '') + (it.activo ? '' : ' oculto') + '" data-a="itVer" data-id="' + esc(it.id) + '" tabindex="0" role="button" aria-label="Ver ' + esc(it.nombre) + '">' +
      '<div class="ithumb" style="--rar:' + col + '">' + (imgTag(it.img, it.nombre, ' loading="lazy"') || '<span class="sinfoto">Sin foto</span>') +
      (agot ? '<span class="itag agotado">Agotado</span>' : ((it._tot || it.stock) > 1 ? '<span class="itag">x' + (it._tot || it.stock) + '</span>' : '')) + (it.activo ? '' : '<span class="itag oc">Oculto</span>') + '</div>' +
      (admin.puede ? '<div class="itadmb"><button type="button" class="btn btn-ghost btn-sm" data-a="itEditar" data-id="' + esc(it.id) + '" aria-label="Editar">✎</button>' + (admin.itemDel === it.id ? '<button type="button" class="btn btn-sm itdel" data-a="itBorrarSi" data-id="' + esc(it.id) + '">¿Quitar? Sí</button>' : '<button type="button" class="btn btn-ghost btn-sm" data-a="itBorrar" data-id="' + esc(it.id) + '" aria-label="Quitar">🗑</button>') + '</div>' : '') +
      '<div class="ibody"><h4>' + esc(it.nombre) + '</h4>' +
      '<div class="imeta">' + (it.rareza ? '<span style="color:' + col + '">' + esc(it.rareza) + '</span>' : '') + (it.calidad ? '<span>' + esc(it.calidad) + '</span>' : '') + (it.heroe ? '<span>' + esc(it.heroe) + '</span>' : '') + (it.descripcion ? '<span class="gem">💎 ' + (efectoUnusual(it) ? esc(efectoUnusual(it)) : lineasDesc(it).length) + '</span>' : '') + '</div>' +
      '<div class="iprice"><b>' + (it._desde ? '<small class="desde">desde</small> ' : '') + fmtPrecio(it.precio) + '</b><span class="iacts">' + (agot ? '' : '<button type="button" class="icart" data-a="carAdd" data-id="' + esc(it.id) + '" aria-label="Agregar ' + esc(it.nombre) + ' al carrito" title="Agregar al carrito">🛒<span> Al carrito</span></button>') + '<span class="ibuy">' + (agot ? 'Agotado' : 'Comprar') + '</span></span></div>' + steamHtml(it) + '</div></article>';
  }
  function gridItemsHtml() {
    if (items.err) return '<div class="empty frame"><div class="in"><strong>No se pudo cargar</strong><span>' + esc(items.err) + '</span></div></div>';
    if (!items.cargado) return '<div class="igrid sk-grid" aria-busy="true" aria-label="Cargando items">' + new Array(9).join('<article class="icard sk" aria-hidden="true"><div class="ithumb"></div><div class="ibody"><i class="sk-l w80"></i><i class="sk-l w50"></i><i class="sk-l w60 tall"></i></div></article>') + '</div>';
    var l = itemsFiltrados();
    if (!l.length) return '<div class="empty frame"><div class="in"><strong>' + (items.lista.length ? 'Ningún item coincide' : 'Pronto nuevos items') + '</strong><span>' + (items.lista.length ? 'Prueba con otros filtros.' : 'Estamos subiendo el catálogo.') + '</span></div></div>';
    var porPag = 24, total = Math.ceil(l.length / porPag);
    if (filtros.pag >= total) filtros.pag = Math.max(0, total - 1);
    return '<div class="igrid">' + l.slice(filtros.pag * porPag, filtros.pag * porPag + porPag).map(itemCardHtml).join("") + '</div>' + paginadorHtml(total, filtros.pag, "itPag");
  }
  /* Botones de página: « 1 … 4 5 6 … 18 » (la actual resaltada). */
  function paginadorHtml(total, act, accion) {
    if (total <= 1) return "";
    var nums = [], i;
    for (i = 0; i < total; i++) if (i === 0 || i === total - 1 || Math.abs(i - act) <= 1) nums.push(i);
    var h = '<nav class="pager" aria-label="Páginas"><button type="button" class="btn btn-ghost btn-sm" data-a="' + accion + '" data-p="' + (act - 1) + '"' + (act <= 0 ? ' disabled' : '') + ' aria-label="Página anterior">‹</button>';
    nums.forEach(function (n, k) {
      if (k && n - nums[k - 1] > 1) h += '<span class="pdots">…</span>';
      h += '<button type="button" class="btn btn-sm ' + (n === act ? 'btn-yellow' : 'btn-ghost') + '" data-a="' + accion + '" data-p="' + n + '"' + (n === act ? ' aria-current="page"' : '') + '>' + (n + 1) + '</button>';
    });
    return h + '<button type="button" class="btn btn-ghost btn-sm" data-a="' + accion + '" data-p="' + (act + 1) + '"' + (act >= total - 1 ? ' disabled' : '') + ' aria-label="Página siguiente">›</button></nav>';
  }
  var filtAbierto = null;   // null = automático (abierto en pantallas anchas, cerrado en celular)
  function chipsActivos() {
    var l = [];
    if (filtros.tipo) l.push(["tipo", "Tipo", filtros.tipo]);
    if (filtros.heroe) l.push(["heroe", "Héroe", filtros.heroe]);
    if (filtros.ranura) l.push(["ranura", "Ranura", filtros.ranura]);
    if (filtros.rareza) l.push(["rareza", "Rareza", filtros.rareza]);
    if (filtros.calidad) l.push(["calidad", "Calidad", filtros.calidad]);
    if (filtros.min || filtros.max) l.push(["precio", "Precio", filtros.min && filtros.max ? "S/ " + filtros.min + " – S/ " + filtros.max : filtros.min ? "desde S/ " + filtros.min : "hasta S/ " + filtros.max]);
    if (filtros.q) l.push(["q", "Búsqueda", filtros.q]);
    return l;
  }
  function chipsHtml() {
    var l = chipsActivos();
    if (!l.length) return "";
    return l.map(function (c) { return '<button type="button" class="fchip" data-a="itQuitar" data-k="' + c[0] + '" aria-label="Quitar filtro ' + esc(c[1]) + '"><span>' + esc(c[1]) + ': <b>' + esc(c[2]) + '</b></span><i aria-hidden="true">✕</i></button>'; }).join("") +
      (l.length > 1 ? '<button type="button" class="fchip limpiar" data-a="itReset">Quitar todo</button>' : '');
  }
  function pintarItems() {
    var g = document.getElementById("itemsGrid"); if (!g) return;
    var ch = document.getElementById("itemsChips"); if (ch) ch.innerHTML = chipsHtml();
    var fc = document.getElementById("filtCount"); if (fc) { var n = chipsActivos().filter(function (c) { return c[0] !== "q"; }).length; fc.textContent = n ? " (" + n + ")" : ""; }
    g.innerHTML = gridItemsHtml(); hidratarImgs();
    var c = document.getElementById("itemsCuenta"); if (c) c.textContent = items.cargado ? itemsFiltrados().length + " items" : "";
  }
  /* ===== Rutas por niveles, como lis-skins: #comprar/<tipo>/<héroe> ===== */
  function slug(t) { return sinTildes(String(t || "")).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function rutaCatalogo(tipo, heroe) {
    return "#comprar" + (tipo || heroe ? "/" + (tipo ? slug(tipo) : "todos") : "") + (heroe ? "/" + slug(heroe) : "");
  }
  function aplicarRutaCatalogo() {
    var m = String(location.hash || "").match(/^#\/?comprar\/([^\/?]*)(?:\/([^\/?]*))?/);
    if (!m) return false;
    var a = decodeURIComponent(m[1] || ""), b = decodeURIComponent(m[2] || "");
    filtros.tipo = ""; filtros.heroe = "";
    ITEM_TIPOS.forEach(function (t) { if (slug(t) === a) filtros.tipo = t; });
    if (b) distintos("heroe", HEROES_DOTA).forEach(function (h) { if (slug(h) === b) filtros.heroe = h; });
    filtros.pag = 0; return true;
  }
  // Deja la dirección de la barra igual a los filtros (sin recargar ni ensuciar el historial).
  function sincHash() {
    if (vistaActual !== "comprar" || idItemHash()) return;
    var r = rutaCatalogo(filtros.tipo, filtros.heroe);
    if (location.hash !== r) { try { history.replaceState(null, "", location.pathname + location.search + r); } catch (e) { /* sin historial */ } }
  }
  function migaCatalogoHtml(tipo, heroe, nombre) {
    var sep = ' <span>›</span> ', l = '<a href="#inicio">Inicio</a>' + sep + '<a href="#comprar">Comprar items</a>';
    if (tipo) l += sep + (heroe || nombre ? '<a href="' + rutaCatalogo(tipo, "") + '">' + esc(tipo) + '</a>' : '<span>' + esc(tipo) + '</span>');
    if (heroe) l += sep + (nombre ? '<a href="' + rutaCatalogo(tipo, heroe) + '">' + esc(heroe) + '</a>' : '<span>' + esc(heroe) + '</span>');
    if (nombre) l += sep + '<span>' + esc(nombre) + '</span>';
    return '<div class="ipg-crumb">' + l + '</div>';
  }
  function parecidosHtml(it) {
    var l = items.lista.filter(function (x) { return x.id !== it.id && sinTildes(x.nombre) !== sinTildes(it.nombre) && x.stock > 0 && (x.activo || admin.puede); });
    var mismo = l.filter(function (x) { return it.heroe && x.heroe === it.heroe; }), tipo = l.filter(function (x) { return x.tipo === it.tipo && (!it.heroe || x.heroe !== it.heroe); });
    var vistos = {}, out = [];
    mismo.concat(tipo).forEach(function (x) { var k = sinTildes(x.nombre); if (!vistos[k] && out.length < 14) { vistos[k] = 1; out.push(x); } });
    if (!out.length) return '';
    return '<div class="ofr"><div class="ofr-top"><h3>✨ También te puede interesar</h3><div class="rel-flechas"><button type="button" class="rel-f" data-a="relMov" data-d="-1" aria-label="Anterior">←</button><button type="button" class="rel-f" data-a="relMov" data-d="1" aria-label="Siguiente">→</button></div></div><div class="rel-fila">' + out.map(itemCardHtml).join("") + '</div></div>';
  }
  function comprarHtml() {
    if (idItemHash()) return paginaItemHtml(idItemHash());
    var tabs = ['<button type="button" class="itab' + (!filtros.tipo ? ' on' : '') + '" data-a="itTipo" data-v="">Todos</button>'].concat(ITEM_TIPOS.map(function (t) {
      return '<button type="button" class="itab' + (filtros.tipo === t ? ' on' : '') + '" data-a="itTipo" data-v="' + esc(t) + '">' + esc(t) + '</button>';
    })).join("");
    var nFilt = chipsActivos().filter(function (c) { return c[0] !== "q"; }).length;
    var filt = '<aside class="ifilt"><details' + ((filtAbierto === null ? window.innerWidth > 820 : filtAbierto) ? ' open' : '') + '><summary>Filtros<span id="filtCount">' + (nFilt ? ' (' + nFilt + ')' : '') + '</span></summary>' +
      '<div class="ff"><label>Precio (S/)</label><div class="ff2"><input id="fi-min" inputmode="decimal" placeholder="Desde" value="' + esc(filtros.min) + '"><input id="fi-max" inputmode="decimal" placeholder="Hasta" value="' + esc(filtros.max) + '"></div></div>' +
      '<div class="ff"><label for="fi-heroe">Héroe</label><input id="fi-heroe" type="search" list="dl-fheroe" autocomplete="off" placeholder="Escribe o elige un héroe" value="' + esc(filtros.heroe) + '"><datalist id="dl-fheroe">' + distintos("heroe", HEROES_DOTA).map(function (h) { return '<option value="' + esc(h) + '">'; }).join("") + '</datalist></div>' +
      '<div class="ff"><label for="fi-ranura">Ranura</label><select id="fi-ranura">' + opciones(distintos("ranura", SLOTS_DOTA), filtros.ranura, "Todas") + '</select></div>' +
      '<div class="ff"><label for="fi-rareza">Rareza</label><select id="fi-rareza">' + opciones(LISTA_RAREZAS.filter(Boolean), filtros.rareza, "Todas") + '</select></div>' +
      '<div class="ff"><label for="fi-calidad">Calidad</label><select id="fi-calidad">' + opciones(distintos("calidad", ITEM_CALIDADES), filtros.calidad, "Todas") + '</select></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-a="itReset" style="width:100%">Restablecer filtros</button></details></aside>';
    return '<section class="section gutter" id="comprar"><div class="wrap">' + migaCatalogoHtml(filtros.tipo, filtros.heroe, "") +
      '<div class="sec-title"><div class="kicker">Catálogo</div><h2><span class="t1">Comprar</span> <span>items</span></h2><p>Elige tu item y págalo con tu saldo o por WhatsApp.</p><div class="orn">◆</div></div>' +
      (estado.secciones.items ? '' : '<p class="hint" style="text-align:center">🔒 Esta sección está oculta: solo tú (administrador) la ves. Actívala con el interruptor de abajo cuando esté lista.</p>') + switchItems() +
      (admin.puede ? '<div class="itadm frame"><div class="in"><b>Modo administrador</b><button type="button" class="btn btn-yellow btn-sm" data-a="itNuevo">+ Agregar item</button><button type="button" class="btn btn-ghost btn-sm" data-a="stkAbrir">📦 Stock de items</button><button type="button" class="btn btn-ghost btn-sm" data-a="stRefrescar"' + (admin.st && admin.st.corriendo ? ' disabled' : '') + '>' + (admin.st && admin.st.corriendo ? 'Actualizando…' : '↻ Precios de Steam') + '</button><span class="hint">' + esc(admin.st && admin.st.msg || '') + '</span><span class="hint">Pasa por una tarjeta y usa ✎ para editar o 🗑 para quitarla. Los cambios se guardan al instante.</span></div></div>' + importarHtml() : '') +
      '<div class="itabs">' + tabs + '</div>' +
      '<div class="ishop">' + filt + '<div class="imain"><div class="ibar"><input id="fi-q" type="search" placeholder="Buscar items…" value="' + esc(filtros.q) + '" autocomplete="off">' +
      '<select id="fi-orden" aria-label="Ordenar">' + [["nuevo", "Más nuevos"], ["menor", "Precio: menor a mayor"], ["mayor", "Precio: mayor a menor"], ["nombre", "Nombre A-Z"]].map(function (o) { return '<option value="' + o[0] + '"' + (filtros.orden === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join("") + '</select>' +
      '<span class="icount" id="itemsCuenta">' + (items.cargado ? itemsFiltrados().length + ' items' : '') + '</span></div><div class="fchips" id="itemsChips">' + chipsHtml() + '</div>' + (avisoNuevoItem ? '<div class="itaviso" role="status">✔ Item agregado. Mantuve tus filtros, así que quizá no lo veas en la lista. <button type="button" class="fchip limpiar" data-a="itReset">Quitar filtros</button></div>' : '') + '<div id="itemsGrid">' + gridItemsHtml() + '</div></div></div></div></section>';
  }
  document.addEventListener("toggle", function (ev) { var d = ev.target; if (d && d.tagName === "DETAILS" && d.closest && d.closest("#comprar .ifilt")) filtAbierto = d.open; }, true);
  function filtroEvento(el) {
    var id = el.id;
    var mapa = { "fi-q": "q", "fi-min": "min", "fi-max": "max", "fi-heroe": "heroe", "fi-ranura": "ranura", "fi-rareza": "rareza", "fi-calidad": "calidad", "fi-orden": "orden" };
    if (!mapa[id]) return false;
    if (filtros[mapa[id]] === el.value) return true;   // al salir del campo no se vuelve a pintar (si no, el primer clic en una tarjeta se pierde)
    filtros[mapa[id]] = el.value; filtros.pag = 0; pintarItems(); if (id === "fi-heroe") sincHash(); return true;
  }
  function itemPorId(id) { for (var k = 0; k < items.lista.length; k++) if (items.lista[k].id === id) return items.lista[k]; return null; }
  /* ===== Página de un item (#item/<id>) ===== */
  function idItemHash() { var m = String(location.hash || "").match(/^#\/?item\/(.+)$/); if (!m) return null; try { return decodeURIComponent(m[1]); } catch (e) { return null; } }
  function paginaItemHtml(id) {
    var miga = function (tipo, n, heroe) { return migaCatalogoHtml(tipo, heroe, n); };
    var envol = function (h) { return '<section class="section gutter" id="comprar"><div class="wrap">' + h + '</div></section>'; };
    if (!items.cargado && !items.err) return envol(miga("") + '<div class="empty frame"><div class="in"><strong>Cargando item…</strong></div></div>');
    var it = itemPorId(id);
    if (!it || (!it.activo && !admin.puede)) return envol(miga("") + '<div class="empty frame"><div class="in"><strong>Este item no está disponible</strong><span>Puede que ya se haya vendido o que aún no esté publicado.</span><a class="btn btn-yellow btn-sm" href="#comprar" style="margin-top:12px">Ver todos los items</a></div></div>');
    var col = colorRareza(it.rareza), agot = it.stock <= 0, cred = Math.round(it.precio * 100) / 100, sol = steamSoles(it);
    var dto = sol && it.precio > 0 && it.precio < sol ? Math.round((1 - it.precio / sol) * 100) : 0;
    var fila = function (k, v) { return v ? '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>' : ''; };
    var attrs = fila("Héroe", esc(it.heroe)) + fila("Ranura", esc(it.ranura)) + fila("Tipo", esc(it.tipo)) +
      fila("Rareza", it.rareza ? '<i class="ipg-dot" style="background:' + col + '"></i>' + esc(it.rareza) : "") + fila("Calidad", esc(it.calidad)) + fila("Efecto Unusual", esc(efectoUnusual(it))) + fila("Disponibles", agot ? "Agotado" : String(it.stock));
    var btns = agot ? '<button class="btn btn-ghost" type="button" disabled>Agotado</button>'
      : '<button class="btn btn-fuchsia" type="button" data-a="carAdd" data-id="' + esc(it.id) + '">🛒 ' + (carro[it.id] ? '✔ En el carrito (' + carro[it.id] + ') · agregar otro' : 'Al carrito') + '</button>' +
        '<button class="btn btn-yellow" type="button" data-a="carAhora" data-id="' + esc(it.id) + '">⚡ Comprar ahora</button>';
    return envol(miga(it.tipo, it.nombre, it.heroe) + '<h1 class="ipg-t">' + esc(it.nombre) + (it.activo ? '' : ' <small>(oculto)</small>') + '</h1>' +
      '<div class="ipg-grid"><div class="ipg-foto' + (imgTag(it.img, it.nombre) ? ' zoomable' : '') + '" style="--rar:' + col + '"' + (imgTag(it.img, it.nombre) ? ' data-a="zoomImg" role="button" tabindex="0" aria-label="Ampliar foto"' : '') + '>' + (imgTag(it.img, it.nombre) || '<span class="sinfoto">Sin foto</span>') + (imgTag(it.img, it.nombre) ? '<span class="ipg-lupa" aria-hidden="true">⤢</span>' : '') +
      '<span class="ipg-tag' + (agot ? ' off' : '') + '">' + (agot ? 'Agotado' : (it.stock > 1 ? it.stock + ' disponibles' : 'Disponible')) + '</span></div>' +
      '<div class="ipg-info"><dl class="ipg-attrs">' + attrs + '</dl>' + estilosHtml(it) + descripcionHtml(it) +
      '<div class="ipg-precio"><div class="pp-top"><b>' + fmtPrecio(it.precio) + '</b>' + (dto ? '<span class="pp-dto" title="Descuento frente al precio del Mercado de Steam">-' + dto + ' %</span>' : '') + '</div>' +
      steamHtml(it, true) +
      (agot ? '' : (cuenta.perfil ? '<p class="hint">Tienes <b>' + fmtSol(cuenta.perfil.creditos) + '</b> soles.</p>' : '<p class="hint">Para pagar con tu saldo entra a tu cuenta.</p>')) +
      '<div class="pp-btns">' + btns + '</div></div></div></div>' + ofertasHtml(it) + parecidosHtml(it) +
      (agot ? '' : '<div class="ipg-sticky"><div class="ips-p"><small>Precio</small><b>' + fmtPrecio(it.precio) + '</b></div><button class="btn btn-fuchsia" type="button" data-a="carAdd" data-id="' + esc(it.id) + '">🛒 ' + (carro[it.id] ? '✔ En el carrito (' + carro[it.id] + ')' : 'Agregar al carrito') + '</button></div>'));
  }

  /* ===== Admin: panel de stock de items ===== */
  var stk = { q: "", tipo: "", heroe: "", ranura: "", rareza: "", calidad: "", estado: "all", orden: "nombre", pag: 0, msg: "", ed: null }, STK_POR_PAG = 40, STK_TIMERS = {};
  function stkEstado(it) {
    if (it.stock <= 0) return { cls: "st-zero", txt: "Agotado", key: "zero" };
    if (it.stock <= 2) return { cls: "st-low", txt: "Pocas", key: "low" };
    return { cls: "st-ok", txt: "En stock", key: "ok" };
  }
  function stkFiltrados() {
    var q = sinTildes(stk.q);
    var l = items.lista.filter(function (it) {
      if (stk.tipo && it.tipo !== stk.tipo) return false;
      if (stk.heroe && it.heroe !== stk.heroe) return false;
      if (stk.ranura && it.ranura !== stk.ranura) return false;
      if (stk.rareza && it.rareza !== stk.rareza) return false;
      if (stk.calidad && it.calidad !== stk.calidad) return false;
      if (stk.estado === "oculto") { if (it.activo) return false; }
      else if (stk.estado !== "all" && stkEstado(it).key !== stk.estado) return false;
      if (q && sinTildes(it.nombre + " " + it.heroe + " " + it.tipo + " " + it.descripcion).indexOf(q) < 0) return false;
      return true;
    });
    l.sort(function (a, b) {
      if (stk.orden === "stockMenor") return a.stock - b.stock || a.nombre.localeCompare(b.nombre);
      if (stk.orden === "stockMayor") return b.stock - a.stock || a.nombre.localeCompare(b.nombre);
      if (stk.orden === "valor") return b.precio * b.stock - a.precio * a.stock;
      if (stk.orden === "nuevo") return String(b.creado).localeCompare(String(a.creado));
      return a.nombre.localeCompare(b.nombre);
    });
    return l;
  }
  function stkStatsHtml(l) {
    var uni = 0, val = 0, vs = 0, con = 0, zero = 0, low = 0;
    l.forEach(function (it) { var s = Math.max(0, it.stock); uni += s; val += s * (it.precio > 0 ? it.precio : 0); vs += s * steamSoles(it); if (it.stock > 0) con++; else zero++; if (it.stock > 0 && it.stock <= 2) low++; });
    var st = function (b, t, w, sub) { return '<div class="stk-stat' + (w ? ' warn' : '') + '"><b>' + b + '</b><span>' + t + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
    return st(con + "/" + l.length, "Items con stock") + st(uni, "Unidades") + st(fmtPrecio(val), "Valor del stock", false, vs ? "Steam ≈ " + fmtPrecio(vs) : "") + st(low, "Pocas (1-2)", low) + st(zero, "Agotados", zero);
  }
  function stkFilaHtml(it) {
    var e = stkEstado(it), col = colorRareza(it.rareza);
    return '<div class="stk-row" data-id="' + esc(it.id) + '"><div class="stk-thumb" style="--rar:' + col + '">' + (imgTag(it.img, "", ' loading="lazy"') || "") + '</div>' +
      '<div class="stk-info"><div class="stk-name">' + esc(it.nombre) + (it.activo ? '' : ' <em>(oculto)</em>') + '</div><div class="stk-meta"><span style="color:' + col + '">' + esc(it.rareza || "—") + '</span>' + (it.heroe ? ' • ' + esc(it.heroe) : '') + ' • ' + (it.precio > 0 ? fmtPrecio(it.precio) : 'sin precio') + (it.descripcion ? ' • 💎 ' + lineasDesc(it).length : '') + '</div></div>' +
      '<button type="button" class="stk-edbtn' + (stk.ed && stk.ed.id === it.id ? ' on' : '') + '" data-a="stkEd" aria-label="Editar ' + esc(it.nombre) + '" title="Editar todos los detalles">✎</button><span class="stk-status ' + e.cls + '">' + e.txt + '</span>' +
      '<div class="stk-qty"><button type="button" data-a="stkMenos" aria-label="Menos">−</button><input type="number" min="0" step="1" value="' + it.stock + '" id="stk-in-' + esc(it.id) + '" data-stk-in="' + esc(it.id) + '" aria-label="Stock de ' + esc(it.nombre) + '"><button type="button" data-a="stkMas" aria-label="Más">+</button></div></div>' + (stk.ed && stk.ed.id === it.id ? stkEdHtml() : '');
  }
  function stkEdHtml() {
    var F = stk.ed.F, nEst = Number(F.estilos) || 0, g = gemasDe(F);
    var f = function (id, lab, inner) { return '<div class="field"><label for="sk-' + id + '">' + lab + '</label>' + inner + '</div>'; };
    var dl = function (id, k, base) { return '<datalist id="' + id + '">' + distintos(k, base).map(function (v) { return '<option value="' + esc(v) + '">'; }).join("") + '</datalist>'; };
    return '<div class="stk-ed" data-ed="' + esc(stk.ed.id) + '">' +
      '<div class="stk-ed-foto">' + (F.img ? '<div class="yapeqr"><img data-fs="' + esc(F.img.slice(3)) + '" alt="" width="140" style="width:140px;height:auto"></div>' : '') +
      '<label class="btn btn-ghost btn-sm" for="sk-file">' + (stk.ed.subiendo ? 'Subiendo…' : (F.img ? 'Cambiar foto' : 'Subir foto')) + '</label><input id="sk-file" type="file" accept="image/*" hidden>' +
      (F.img ? '<button type="button" class="btn btn-ghost btn-sm" data-a="stkQuitarFoto">Quitar foto</button>' : '') + '</div>' +
      '<div class="stk-ed-grid">' +
      f("nombre", "Nombre", '<input id="sk-nombre" maxlength="90" value="' + esc(F.nombre) + '">') +
      f("precio", "Precio en soles (S/)", '<input id="sk-precio" inputmode="decimal" value="' + esc(F.precio) + '">') +
      f("stock", "Stock", '<input id="sk-stock" inputmode="numeric" value="' + esc(F.stock) + '">') +
      f("tipo", "Tipo", '<select id="sk-tipo">' + opciones(ITEM_TIPOS, F.tipo, "—") + '</select>') +
      f("heroe", "Héroe", '<input id="sk-heroe" list="dl-heroe2" maxlength="40" value="' + esc(F.heroe) + '">' + dl("dl-heroe2", "heroe", HEROES_DOTA)) +
      f("ranura", "Ranura", '<input id="sk-ranura" list="dl-ranura2" maxlength="40" value="' + esc(F.ranura) + '">' + dl("dl-ranura2", "ranura", SLOTS_DOTA)) +
      f("rareza", "Rareza", '<select id="sk-rareza">' + opciones(LISTA_RAREZAS.filter(Boolean), F.rareza, "—") + '</select>') +
      f("calidad", "Calidad", '<input id="sk-calidad" list="dl-calidad2" maxlength="30" value="' + esc(F.calidad) + '">' + dl("dl-calidad2", "calidad", ITEM_CALIDADES)) +
      f("estilos", "Estilos", '<select id="sk-estilos">' + ["0", "2", "3", "4", "5", "6"].map(function (v) { return '<option value="' + v + '"' + (String(F.estilos || 0) === v ? ' selected' : '') + '>' + (v === "0" ? "Sin estilos" : v + " estilos") + '</option>'; }).join("") + '</select>') +
      '</div>' +
      (nEst > 0 ? '<div class="field"><label>Estilos que SÍ tiene</label><div class="estchk">' + (function () { var o = "", ok = estilosOkLista(F); for (var k = 1; k <= nEst; k++) o += '<label class="chk"><input type="checkbox" id="sk-est-' + k + '"' + (ok.indexOf(k) >= 0 ? ' checked' : '') + '> ' + k + '</label>'; return o; })() + '</div></div>' : '') +
      '<div class="field gform"><label>💎 Gemas (cada versión con distinta gema lleva su propio precio)</label><datalist id="dl-gtipo2">' + GEMA_TIPOS.map(function (t) { return '<option value="' + esc(t) + '">'; }).join("") + '</datalist>' +
      (g.length ? g.map(function (x, i) { return '<div class="grow-f"><input id="sk-gt-' + i + '" list="dl-gtipo2" maxlength="30" placeholder="Tipo (Unusual Effect Gem)" value="' + esc(x.t) + '"><input id="sk-gv-' + i + '" maxlength="60" placeholder="Nombre (Candy Caster)" value="' + esc(x.v) + '"><button type="button" class="btn btn-ghost btn-sm" data-a="stkGemaDel" data-i="' + i + '" aria-label="Quitar gema">✕</button></div>'; }).join("") : '<p class="hint">Sin gemas.</p>') +
      '<div class="cav"><button type="button" class="btn btn-ghost btn-sm" data-a="stkGemaMas" data-t="Unusual Effect Gem">+ Efecto Unusual</button><button type="button" class="btn btn-ghost btn-sm" data-a="stkGemaMas" data-t="Prismatic Gem">+ Prismatic</button><button type="button" class="btn btn-ghost btn-sm" data-a="stkGemaMas" data-t="Ethereal Gem">+ Etérea</button><button type="button" class="btn btn-ghost btn-sm" data-a="stkGemaMas" data-t="Kinetic Gem">+ Cinética</button><button type="button" class="btn btn-ghost btn-sm" data-a="stkGemaMas" data-t="">+ Otra gema</button></div></div>' +
      '<label class="chk"><input type="checkbox" id="sk-activo"' + (F.activo ? ' checked' : '') + '> Visible para los clientes</label>' +
      (stk.ed.msg ? '<p class="hint" style="color:var(--danger)">' + esc(stk.ed.msg) + '</p>' : '') +
      '<div class="cav"><button type="button" class="btn btn-yellow btn-sm" data-a="stkEdGuardar">' + (stk.ed.guardando ? 'Guardando…' : '💾 Guardar cambios') + '</button><button type="button" class="btn btn-ghost btn-sm" data-a="stkEdCerrar">Cancelar</button></div></div>';
  }
  function stkEdAbrir(id) {
    if (stk.ed && stk.ed.id === id) { stk.ed = null; pintarStock(); return; }
    var it = itemPorId(id); if (!it) return;
    stk.ed = { id: id, F: Object.assign({}, it, { precio: String(it.precio || ""), stock: String(it.stock), estilos: String(it.estilos || 0) }), msg: "", guardando: false, subiendo: false };
    pintarStock();
    var e = document.querySelector(".stk-ed"); if (e && e.scrollIntoView) e.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function stkFoto(el) {
    var ed = stk.ed; if (!ed) return; var fi = el.files[0]; el.value = "";
    editorFoto(fi).then(function (listo) {
      if (!listo) return;
      ed.subiendo = true; ed.msg = ""; pintarStock();
      return subirImagen(listo, 640).then(function (ref) { ed.F.img = ref; ed.subiendo = false; pintarStock(); });
    }).catch(function (e) { ed.subiendo = false; ed.msg = (e && e.message) || "No se pudo subir la foto."; pintarStock(); });
  }
  function stkEdCampo(el) {
    var ed = stk.ed, F = ed.F, m = { "sk-nombre": "nombre", "sk-precio": "precio", "sk-stock": "stock", "sk-tipo": "tipo", "sk-heroe": "heroe", "sk-ranura": "ranura", "sk-rareza": "rareza", "sk-calidad": "calidad" };
    if (el.id === "sk-activo") { F.activo = el.checked; return; }
    if (el.id === "sk-estilos") {
      F.estilos = el.value; var nn = Number(el.value) || 0, oks = estilosOkLista(F).filter(function (x) { return x <= nn; });
      if (nn > 0 && !oks.length) oks = [1]; F.estOk = oks.join(","); pintarStock(); return;
    }
    if (/^sk-est-\d+$/.test(el.id)) {
      var num = parseInt(el.id.slice(7), 10), cur = estilosOkLista(F), pos = cur.indexOf(num);
      if (el.checked && pos < 0) cur.push(num); else if (!el.checked && pos >= 0) cur.splice(pos, 1);
      cur.sort(function (a, b) { return a - b; }); F.estOk = cur.join(","); return;
    }
    var mg = /^sk-g([tv])-(\d+)$/.exec(el.id);
    if (mg) { var gl = gemasDe(F), gi = parseInt(mg[2], 10); if (gl[gi]) { gl[gi][mg[1]] = el.value; F.descripcion = gemasAString(gl); } return; }
    if (m[el.id]) F[m[el.id]] = el.value;
  }
  function stkEdGuardar() {
    var ed = stk.ed; if (!ed || ed.guardando) return; var F = ed.F;
    var precio = parseFloat(String(F.precio).replace(",", ".")), stock = parseInt(F.stock, 10);
    var fallo = function (t) { ed.msg = t; pintarStock(); };
    if (!String(F.nombre).trim()) return fallo("Escribe el nombre del item.");
    if (!isFinite(precio) || precio <= 0) return fallo("Pon un precio mayor a 0.");
    if (!isFinite(stock) || stock < 0) stock = 0;
    var it = Object.assign({}, F, { id: ed.id, nombre: String(F.nombre).trim(), precio: Math.round(precio * 100) / 100, stock: stock, heroe: String(F.heroe || "").trim(), ranura: String(F.ranura || "").trim(), calidad: String(F.calidad || "").trim(),
      estilos: Number(F.estilos) || 0, estOk: Number(F.estilos) > 0 ? estilosOkLista(F).join(",") : "", descripcion: gemasAString(gemasDe(F).filter(function (g) { return g.v; })).slice(0, 600), activo: F.activo !== false });
    ed.guardando = true; ed.msg = ""; pintarStock();
    fsPedir("rayas_items/" + encodeURIComponent(it.id), { method: "PATCH", body: JSON.stringify(itemAFields(it)) }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Tu sesión no tiene permiso. Vuelve a entrar." : "No se pudo guardar (" + r.status + ").");
      var k = items.lista.findIndex(function (x) { return x.id === it.id; }); if (k >= 0) items.lista[k] = it;
      stk.ed = null; stk.msg = "✔ Item guardado"; pintarStock(); var m = document.getElementById("stkMsg"); if (m) m.textContent = stk.msg;
    }).catch(function (e) { ed.guardando = false; ed.msg = (e && e.message) || "No se pudo guardar."; pintarStock(); });
  }
  function stkPanelHtml() {
    var sel = function (id, lista, val, vacio) { return '<select id="' + id + '">' + opciones(lista, val, vacio) + '</select>'; };
    var op = function (arr, val) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(""); };
    return '<div class="scrim scrim-top" data-a="cerrarModal"></div><div class="elegir stkp" role="dialog" aria-label="Stock de items"><button type="button" class="stk-x" data-a="cerrarModal" aria-label="Cerrar">×</button><h3>📦 Stock de items</h3>' +
      '<div id="stkStats" class="stk-stats"></div>' +
      '<div class="stk-ctl"><input id="stk-q" type="search" placeholder="Buscar item…" value="' + esc(stk.q) + '" autocomplete="off">' +
      sel("stk-tipo", ITEM_TIPOS, stk.tipo, "Todos los tipos") + sel("stk-heroe", distintos("heroe", HEROES_DOTA), stk.heroe, "Todos los héroes") + sel("stk-ranura", distintos("ranura", SLOTS_DOTA), stk.ranura, "Todas las ranuras") +
      sel("stk-rareza", LISTA_RAREZAS.filter(Boolean), stk.rareza, "Todas las rarezas") + sel("stk-calidad", distintos("calidad", ITEM_CALIDADES), stk.calidad, "Todas las calidades") +
      '<select id="stk-estado">' + op([["all", "Todos"], ["ok", "Con stock"], ["low", "Pocas unidades (1-2)"], ["zero", "Agotados (0)"], ["oculto", "Ocultos"]], stk.estado) + '</select>' +
      '<select id="stk-orden">' + op([["nombre", "Nombre A-Z"], ["stockMenor", "Stock: menor a mayor"], ["stockMayor", "Stock: mayor a menor"], ["valor", "Mayor valor"], ["nuevo", "Más nuevos"]], stk.orden) + '</select>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-a="stkReset">Restablecer</button></div>' +
      '<div id="stkList" class="stk-list"></div>' +
      '<div class="stk-pie"><span id="stkMsg" class="hint">' + esc(stk.msg) + '</span><span class="hint">Los cambios se guardan solos. Con 0 el item aparece como AGOTADO. Las estadísticas siguen los filtros.</span><button type="button" class="btn btn-yellow btn-sm" data-a="cerrarModal">Listo</button></div></div>';
  }
  function pintarStock() {
    var lst = document.getElementById("stkList"); if (!lst) return;
    var l = stkFiltrados(), total = Math.ceil(l.length / STK_POR_PAG);
    if (stk.pag >= total) stk.pag = Math.max(0, total - 1);
    document.getElementById("stkStats").innerHTML = stkStatsHtml(l);
    lst.innerHTML = !items.cargado ? '<div class="empty"><strong>Cargando items…</strong></div>' : (l.length
      ? l.slice(stk.pag * STK_POR_PAG, stk.pag * STK_POR_PAG + STK_POR_PAG).map(stkFilaHtml).join("") + paginadorHtml(total, stk.pag, "stkPag")
      : '<div class="empty"><strong>Ningún item con ese filtro</strong></div>');
    hidratarImgs();
  }
  function stkRefrescarFila(it) {
    var row = document.querySelector('.stk-row[data-id="' + (window.CSS && CSS.escape ? CSS.escape(it.id) : it.id) + '"]'); if (!row) return;
    var e = stkEstado(it), b = row.querySelector(".stk-status"); b.className = "stk-status " + e.cls; b.textContent = e.txt;
    var inp = row.querySelector("input"); if (document.activeElement !== inp) inp.value = it.stock;
    document.getElementById("stkStats").innerHTML = stkStatsHtml(stkFiltrados());
  }
  function stkGuardar(it) {
    clearTimeout(STK_TIMERS[it.id]);
    STK_TIMERS[it.id] = setTimeout(function () {
      var m = document.getElementById("stkMsg"); if (m) m.textContent = "Guardando…";
      fsPedir("rayas_items/" + encodeURIComponent(it.id) + "?updateMask.fieldPaths=stock", { method: "PATCH", body: JSON.stringify({ fields: { stock: { integerValue: String(it.stock) } } }) }).then(function (r) {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Tu sesión no tiene permiso. Vuelve a entrar." : "No se pudo guardar (" + r.status + ").");
        stk.msg = "✔ Guardado"; var m2 = document.getElementById("stkMsg"); if (m2) m2.textContent = stk.msg;
      }).catch(function (e) { stk.msg = (e && e.message === "NO_SESSION" ? "Vuelve a iniciar sesión." : e.message) || "No se pudo guardar."; var m2 = document.getElementById("stkMsg"); if (m2) m2.textContent = stk.msg; });
    }, 450);
  }
  function stkCambiar(it, n) {
    n = Math.max(0, Math.min(99999, Math.floor(Number(n) || 0)));
    if (n === it.stock) return;
    it.stock = n; stkRefrescarFila(it); stkGuardar(it);
  }
  function stockEvento(el, tipo) {
    var SK = { "stk-q": "q", "stk-tipo": "tipo", "stk-heroe": "heroe", "stk-ranura": "ranura", "stk-rareza": "rareza", "stk-calidad": "calidad", "stk-estado": "estado", "stk-orden": "orden" };
    if (SK[el.id]) { if (stk[SK[el.id]] === el.value) return true; stk[SK[el.id]] = el.value; stk.pag = 0; pintarStock(); return true; }
    if (el.id && el.id.indexOf("sk-") === 0 && stk.ed) { if (el.type === "file") { if (tipo === "change" && el.files && el.files[0]) stkFoto(el); } else if (tipo === "change" || el.id !== "sk-estilos") stkEdCampo(el); return true; }
    if (el.getAttribute && el.getAttribute("data-stk-in")) { if (tipo === "change") { var it = itemPorId(el.getAttribute("data-stk-in")); if (it) { stkCambiar(it, el.value); el.value = it.stock; } } return true; }
    return false;
  }

  function modalItemHtml(m) {
    var it = itemPorId(m.id); if (!it) return { h: '<h3>Item no encontrado</h3>', btns: '' };
    var cred = Math.round(it.precio * 100) / 100, agot = it.stock <= 0, col = colorRareza(it.rareza);
    var h = '<h3>' + esc(it.nombre) + '</h3>' +
      '<div class="ithumb big" style="--rar:' + col + '">' + (imgTag(it.img, it.nombre) || '<span class="sinfoto">Sin foto</span>') + '</div>' +
      '<p class="hint">' + [it.rareza, it.calidad, it.tipo, it.heroe, it.ranura].filter(Boolean).map(esc).join(' · ') + '</p>' + estilosHtml(it) + descripcionHtml(it) +
      '<p class="resumen">Precio: <b>' + fmtPrecio(it.precio) + '</b></p>' + steamHtml(it, true) +
      (agot ? '<p class="hint" style="color:var(--danger)">Este item está agotado.</p>' : (cuenta.perfil ? '<p class="hint">Tienes <b>' + fmtSol(cuenta.perfil.creditos) + '</b> soles.</p>' : '<p class="hint">Para pagar con tu saldo entra a tu cuenta.</p>'));
    var btns = agot ? '' : ('<button class="btn btn-fuchsia" type="button" data-a="itCred" data-id="' + esc(it.id) + '">💎 Pagar con tu saldo (' + fmtPrecio(cred) + ')</button>' +
      (contactos().length ? '<button class="btn btn-yellow" type="button" data-a="itWsp" data-id="' + esc(it.id) + '">💬 Comprar por WhatsApp</button>' : ''));
    return { h: h, btns: btns };
  }
  function lineasDesc(it) { return String(it.descripcion || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean); }
  var GEMA_TIPOS = ["Unusual Effect Gem", "Prismatic Gem", "Ethereal Gem", "Kinetic Gem", "Inscribed Gem", "Kill Eater", "Rune"];
  function gemasDe(it) {
    return lineasDesc(it).map(function (x) { var k = x.indexOf(":"); return k > 0 && k < 28 ? { t: x.slice(0, k).trim(), v: x.slice(k + 1).trim() } : { t: "", v: x }; });
  }
  function efectoUnusual(it) { var g = gemasDe(it).filter(function (x) { return /unusual/i.test(x.t) && x.v; })[0]; return g ? g.v : ""; }
  function gemaClase(t) { return /unusual/i.test(t) ? "g-un" : /prismatic/i.test(t) ? "g-pr" : /ethereal/i.test(t) ? "g-et" : /kinetic|cin[eé]tic/i.test(t) ? "g-ki" : /inscribed/i.test(t) ? "g-in" : ""; }
  // Previsualización de la gema (solo Etérea, Cinética, Prismática e Inusual): una gema dibujada con el color de su tipo.
  var GEMA_COL = {
    "g-un": ["#f0a0ff", "#9b30ff"], "g-pr": ["#ff6b6b", "#6b8cff"], "g-et": ["#c9f6ff", "#3aa9e6"], "g-ki": ["#ffd27a", "#e8601c"]
  };
  function gemaIconoHtml(t, tam) {
    var c = gemaClase(t); if (!GEMA_COL[c]) return "";
    var id = "gm-" + c, col = GEMA_COL[c], px = tam || 26;
    var stops = c === "g-pr"
      ? '<stop offset="0" stop-color="#ff5f6d"/><stop offset=".3" stop-color="#ffd35f"/><stop offset=".55" stop-color="#5fe39a"/><stop offset=".8" stop-color="#5f9bff"/><stop offset="1" stop-color="#b65fff"/>'
      : '<stop offset="0" stop-color="' + col[0] + '"/><stop offset="1" stop-color="' + col[1] + '"/>';
    return '<svg class="gem-ic ' + c + '" viewBox="0 0 32 32" width="' + px + '" height="' + px + '" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' + stops + '</linearGradient></defs>' +
      '<polygon points="9,4 23,4 29,12 16,29 3,12" fill="url(#' + id + ')" stroke="rgba(255,255,255,.7)" stroke-width="1"/>' +
      '<polyline points="3,12 29,12 M9,4 12,12 16,29 M23,4 20,12 16,29" fill="none" stroke="rgba(255,255,255,.5)" stroke-width=".9"/>' +
      '<polygon points="9,4 12,12 3,12" fill="rgba(255,255,255,.28)"/></svg>';
  }
  // Pastillas de gemas (como lis-skins): el nombre de la gema y, al pasar el mouse, su tipo.
  function gemChipsHtml(it) {
    return gemasDe(it).map(function (g) { var ic = gemaIconoHtml(g.t, 26); return '<span class="gchip ' + gemaClase(g.t) + (ic ? ' gp' : '') + '" title="' + esc((g.v || "") + (g.t ? " · " + g.t : "")) + '">' + ic + esc(g.v || g.t) + '</span>'; }).join("");
  }
  function descripcionHtml(it) {
    var l = gemasDe(it); if (!l.length) return "";
    return '<div class="idesc"><b>💎 Gemas</b>' + l.map(function (g) { return '<div class="grow ' + gemaClase(g.t) + '">' + (gemaIconoHtml(g.t, 30) || '<span class="gdot"></span>') + '<span class="gv">' + esc(g.v || g.t) + '</span>' + (g.t && g.v ? '<span class="gk">' + esc(g.t) + '</span>' : '') + '</div>'; }).join("") + '</div>';
  }
  // Mismo item con distintas gemas: cada uno es su propia oferta con su precio.
  function ofertasDe(it) {
    var k = sinTildes(it.nombre);
    return items.lista.filter(function (x) { return sinTildes(x.nombre) === k && (x.activo || admin.puede); }).sort(function (a, b) { return (a.precio || 0) - (b.precio || 0); });
  }
  var ofe = { min: "", max: "" };
  // Una fila por cada unidad en stock (como lis-skins): si hay 3, salen 3 filas separadas.
  function ofertaFilaHtml(x, curId, mejor) {
    var cur = x.id === curId, ne = Number(x.estilos) || 0, ok = estilosOkLista(x), n = Math.max(1, Math.min(30, x.stock)), agot = x.stock <= 0;
    var est = ne ? [1, 2, 3, 4, 5, 6, 7, 8].slice(0, ne).map(function (k) { return '<span class="est' + (ok.indexOf(k) >= 0 ? '' : ' lock') + '">' + k + '</span>'; }).join("") : '';
    var gem = gemChipsHtml(x), out = "", edit = admin.puede ? '<button type="button" class="btn btn-ghost btn-sm ofr-ed" data-a="itEditar" data-id="' + esc(x.id) + '"' + (x.stock > 1 ? ' data-u="1"' : '') + ' title="Editar esta unidad (gemas, estilos y precio)" aria-label="Editar">✎</button><button type="button" class="btn btn-ghost btn-sm" data-a="itMas1" data-id="' + esc(x.id) + '" title="Sumar una unidad">➕</button>' + (admin.itemDel === x.id ? '<button type="button" class="btn btn-sm itdel" data-a="itQuitarSi" data-id="' + esc(x.id) + '">¿Quitar? Sí</button>' : '<button type="button" class="btn btn-ghost btn-sm" data-a="itQuitar1" data-id="' + esc(x.id) + '" title="Quitar una unidad" aria-label="Quitar">🗑</button>') : '';
    for (var u = 0; u < n; u++) {
      var enCarro = !agot && u < (Number(carro[x.id]) || 0);
 var best = mejor && u === 0;
      out += '<div class="ofr-r' + (cur ? ' cur' : '') + (agot ? ' agot' : '') + (enCarro ? ' enc' : '') + (best ? ' best' : '') + '" data-a="itVer" data-id="' + esc(x.id) + '" role="button" tabindex="0"><span class="ofr-g">' + gem + '</span>' +
        '<span class="ofr-e">' + est + '</span><span class="ofr-p"><b>' + fmtPrecio(x.precio) + '</b>' + (best ? '<em class="ofr-best">Mejor precio</em>' : '') + '</span>' +
        '<span class="ofr-b">' + edit + (agot ? '<span class="ofr-ag">Agotado</span>' : (enCarro
          ? '<button type="button" class="btn btn-ghost btn-sm ofr-in" data-a="carMenos" data-id="' + esc(x.id) + '" title="Quitar del carrito">✔ En el carrito</button>'
          : '<button type="button" class="btn btn-yellow btn-sm" data-a="carAhora" data-id="' + esc(x.id) + '">⚡ Comprar ahora</button>' +
            '<button type="button" class="btn btn-ghost btn-sm ofr-cart" data-a="carAdd" data-id="' + esc(x.id) + '" aria-label="Agregar al carrito" title="Agregar al carrito">🛒</button>')) + '</span></div>';
    }
    return out;
  }
  function ofertasTablaHtml(it) {
    var mn = parseFloat(String(ofe.min).replace(",", ".")), mx = parseFloat(String(ofe.max).replace(",", "."));
    var l = ofertasDe(it).filter(function (x) { return (!isFinite(mn) || x.precio >= mn) && (!isFinite(mx) || x.precio <= mx); });
    return '<div class="ofr-h"><span>Gemas / Runas</span><span>Estilos desbloqueados</span><span>Precio</span><span>Acción</span></div>' +
      (l.length ? (function () { var mj = null; l.forEach(function (x) { if (x.stock > 0 && (mj === null || x.precio < mj.precio)) mj = x; }); return l.map(function (x) { return ofertaFilaHtml(x, it.id, x === mj && l.length > 1); }).join(""); })() : '<div class="ofr-vacio">Ninguna oferta en ese rango de precio.</div>');
  }
  function ofertasHtml(it) {
    var n = ofertasDe(it).reduce(function (a, x) { return a + Math.max(1, Math.min(30, x.stock)); }, 0);
    return '<div class="ofr"><div class="ofr-top"><h3>📚 ' + n + (n === 1 ? ' oferta' : ' ofertas') + ' de este item</h3>' +
      '<div class="ofr-f"><input id="ofe-min" inputmode="decimal" placeholder="Precio desde" value="' + esc(ofe.min) + '" aria-label="Precio desde"><input id="ofe-max" inputmode="decimal" placeholder="Precio hasta" value="' + esc(ofe.max) + '" aria-label="Precio hasta"></div></div>' +
      (admin.puede ? '<div class="ofr-adm"><button type="button" class="btn btn-fuchsia btn-sm" data-a="itVersion" data-id="' + esc(it.id) + '">➕ Agregar otra versión (otra gema / estilos / precio)</button>' + (admin.itemMsg ? '<span class="hint" style="color:var(--danger)">' + esc(admin.itemMsg) + '</span>' : '') + '</div>' : '') +
      '<div class="ofr-t" id="ofrTabla">' + ofertasTablaHtml(it) + '</div></div>';
  }
  function mensajeItem(it) {
    var p = cuenta.perfil;
    return "¡Hola! 👋🔥 Quiero comprar este item de *RAYAS STORE* 🛒\n\n🎮 *" + it.nombre + "*" + (it.calidad ? " (" + it.calidad + ")" : "") + "\n💰 Precio: " + fmtPrecio(it.precio) +
      (p ? "\n\n👤 " + p.nombre + " (📧 " + p.email + ")" : "") + "\n\n¿Sigue disponible? 🙏✨";
  }
  /* ===== Carrito de items ===== */
  var CARRO_KEY = "rayas_carro_v1";
  var carro = (function () { try { var j = JSON.parse(localStorage.getItem(CARRO_KEY) || "{}"); return j && typeof j === "object" && !Array.isArray(j) ? j : {}; } catch (e) { return {}; } })();
  function carroGuardar() { try { localStorage.setItem(CARRO_KEY, JSON.stringify(carro)); } catch (e) { /* sin almacenamiento */ } }
  function carroLineas() {
    var out = [];
    Object.keys(carro).forEach(function (id) {
      var it = itemPorId(id); if (!it || (!it.activo && !admin.puede)) return;
      var q = Math.min(Math.floor(Number(carro[id]) || 0), Math.max(0, it.stock)); if (q > 0) out.push({ it: it, qty: q });
    });
    return out;
  }
  function carroN() {
    if (!items.cargado) return Object.keys(carro).reduce(function (a, k) { return a + (Number(carro[k]) || 0); }, 0);
    return carroLineas().reduce(function (a, l) { return a + l.qty; }, 0);
  }
  function carroTotales() {
    var sol = 0, cred = 0;
    carroLineas().forEach(function (l) { sol += l.it.precio * l.qty; });
    sol = Math.round(sol * 100) / 100;
    // El saldo se descuenta con céntimos exactos.
    return { sol: sol, cred: sol };
  }
  function carroAgregar(id) {
    var it = itemPorId(id); if (!it || it.stock <= 0) return false;
    carro[id] = Math.min(it.stock, (Number(carro[id]) || 0) + 1); carroGuardar(); return true;
  }
  function carroHtml() {
    if (!items.cargado) { cargarItems(); return { h: '<h3>Tu carrito 🛒</h3><p class="hint">Cargando…</p>', btns: '<button class="btn btn-ghost btn-sm" type="button" data-a="cerrarModal">Cerrar</button>' }; }
    var l = carroLineas(), T = carroTotales(), cerrar = '<button class="btn btn-ghost btn-sm" type="button" data-a="cerrarModal">Cerrar</button>';
    if (!l.length) return { h: '<h3>Tu carrito 🛒</h3><p class="hint">Está vacío. Elige items del catálogo y pulsa <b>Al carrito</b>.</p>', btns: cerrar };
    var saldo = cuenta.perfil ? Number(cuenta.perfil.creditos) || 0 : null, falta = saldo === null ? 0 : Math.round((T.cred - saldo) * 100) / 100;
    var h = '<h3>Tu carrito 🛒</h3><div class="carl">' + l.map(function (x) {
      var id = esc(x.it.id);
      return '<div class="carr"><div class="carr-t"><span class="carr-img">' + (x.it.img ? imgTag(x.it.img, "", ' width="56" height="56"') : '<span class="sinfoto">—</span>') + '</span><span class="carr-n"><b>' + esc(x.it.nombre) + '</b><small>' + fmtPrecio(x.it.precio) + ' c/u</small></span></div>' +
        '<div class="carr-q"><button type="button" class="btn btn-ghost btn-sm" data-a="carMenos" data-id="' + id + '" aria-label="Menos">−</button><span>' + x.qty + '</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-a="carMas" data-id="' + id + '" aria-label="Más"' + (x.qty >= x.it.stock ? ' disabled' : '') + '>+</button></div>' +
        '<div class="carr-s"><b>' + fmtPrecio(x.it.precio * x.qty) + '</b><button type="button" class="carr-x" data-a="carQuitar" data-id="' + id + '" aria-label="Quitar">🗑</button></div></div>';
    }).join("") + '</div>' +
      '<div class="cartot"><div class="cartot-r"><span>Subtotal</span><span>' + fmtPrecio(T.sol) + '</span></div>' +
      '<div class="cartot-r tot"><span>Total a pagar con saldo</span><b>' + fmtPrecio(T.cred) + '</b></div>' +
      (saldo !== null ? '<div class="cartot-r"><span>Tu saldo</span><span>' + fmtPrecio(saldo) + '</span></div>' +
        (falta > 0 ? '<p class="cartot-aviso">Te faltan <b>' + fmtPrecio(falta) + '</b>. Recarga saldo o pídelo por WhatsApp.</p>' : '<div class="cartot-r"><span>Te quedarían</span><span>' + fmtPrecio(saldo - T.cred) + '</span></div>') : '<p class="cartot-aviso">Para pagar con tu saldo entra a tu cuenta.</p>') + '</div>';
    var btns = '<button class="btn btn-fuchsia" type="button" data-a="carCred">💎 Pagar con tu saldo (' + fmtPrecio(T.cred) + ')</button>' +
      (contactos().length ? '<button class="btn btn-yellow" type="button" data-a="carWsp">💬 Pedir por WhatsApp</button>' : '') +
      '<button class="btn btn-ghost btn-sm" type="button" data-a="carVaciar">Vaciar</button>' + cerrar;
    return { h: h, btns: btns };
  }
  function mensajeCarro() {
    var p = cuenta.perfil, T = carroTotales();
    return "¡Hola! 👋🔥 Quiero comprar estos items de *RAYAS STORE* 🛒\n\n" + carroLineas().map(function (x) { return "🎮 " + x.qty + "x *" + x.it.nombre + "* — " + fmtPrecio(x.it.precio * x.qty); }).join("\n") +
      "\n\n💰 Total: " + fmtPrecio(T.sol) + (p ? "\n\n👤 " + p.nombre + " (📧 " + p.email + ")" : "") + "\n\n¿Siguen disponibles? 🙏✨";
  }
  function pagarCarro() {
    var l = carroLineas(); if (!l.length) return;
    if (!cuenta.perfil) { modal = null; cuenta.modo = "login"; cuenta.msg = "Entra a tu cuenta para pagar con tu saldo."; cuenta.msgTipo = ""; render(); return; }
    var payload = l.map(function (x) { return { id: x.it.id, qty: x.qty }; }), n = l.reduce(function (a, x) { return a + x.qty; }, 0);
    modal = { tipo: "cargando" }; render();
    token().then(function (tk) {
      return fetch(ITEMS_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ items: payload }) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { modal = { tipo: "error", msg: (x.j && x.j.error) || "No se pudo completar la compra." }; render(); cargarItems(true); return; }
        carro = {}; carroGuardar();
        modal = { tipo: "itemOk", code: x.j.code, nombre: n + (n === 1 ? " item" : " items"), saldo: x.j.saldo }; render();
        cargarPerfil(); cargarItems(true);
      }).catch(function (e) { modal = { tipo: "error", msg: (e && e.message === "NO_SESSION") ? "Tu sesión venció. Vuelve a entrar." : "No se pudo completar la compra. No se descontó saldo." }; render(); });
  }
  function comprarItemCreditos(id) {
    var it = itemPorId(id); if (!it) return;
    if (!cuenta.perfil) { modal = null; cuenta.modo = "login"; cuenta.msg = "Entra a tu cuenta para pagar con tu saldo."; cuenta.msgTipo = ""; render(); return; }
    modal = { tipo: "cargando" }; render();
    token().then(function (tk) {
      return fetch(ITEMS_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ id: id }) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { modal = { tipo: "error", msg: (x.j && x.j.error) || "No se pudo completar la compra." }; render(); cargarItems(true); return; }
        modal = { tipo: "itemOk", code: x.j.code, nombre: it.nombre, saldo: x.j.saldo }; render();
        cargarPerfil(); cargarItems(true);
      }).catch(function (e) { modal = { tipo: "error", msg: (e && e.message === "NO_SESSION") ? "Tu sesión venció. Vuelve a entrar." : "No se pudo completar la compra. No se descontó saldo." }; render(); });
  }
  /* ===== Vender items: el cliente pega su trade link y ve sus items; tú pones los precios de compra ===== */
  var INV_URL = "https://inventario-seqcayr4iq-uc.a.run.app";
  var ven = { link: "", cargando: false, err: "", lista: null, noTrad: 0, sel: {}, precios: [], pCargado: false, pCargando: false, q: "", f: { tipo: "", heroe: "", ranura: "", rareza: "", calidad: "", min: "", max: "", orden: "mayor" } };
  function claveCompra(n) { return sinTildes(n).replace(/\s+/g, " ").trim(); }
  function slugCompra(n) { return claveCompra(n).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || ("x" + Date.now().toString(36)); }
  function cargarPrecios(forzar) {
    if (ven.pCargando || (ven.pCargado && !forzar)) return;
    ven.pCargando = true;
    var acc = [];
    function pag(t) {
      return fetch(BASE + "rayas_compra?pageSize=300" + (t ? "&pageToken=" + encodeURIComponent(t) : ""), { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("precios " + r.status);
        return r.json();
      }).then(function (j) {
        (j.documents || []).forEach(function (d) {
          var f = d.fields || {};
          acc.push({ id: d.name.split("/").pop(), nombre: f.nombre && f.nombre.stringValue || "", precio: f.precio ? Number(f.precio.doubleValue !== undefined ? f.precio.doubleValue : (f.precio.integerValue || 0)) : 0 });
        });
        return j.nextPageToken && acc.length < 3000 ? pag(j.nextPageToken) : null;
      });
    }
    pag("").then(function () { ven.precios = acc; ven.pCargado = true; }).catch(function () { /* sin lista: todo sale a consultar */ ven.pCargado = true; })
      .then(function () { ven.pCargando = false; render(); });
  }
  function precioCompra(nombre) {
    var k = claveCompra(nombre);
    for (var i = 0; i < ven.precios.length; i++) if (claveCompra(ven.precios[i].nombre) === k) return ven.precios[i].precio;
    return null;
  }
  function verInventario() {
    var link = String(ven.link || "").trim();
    if (!/[?&]partner=\d+/.test(link)) { ven.err = "Pega tu trade link completo (debe incluir partner= y token=)."; render(); return; }
    ven.cargando = true; ven.err = ""; ven.lista = null; ven.sel = {}; render();
    fetch(INV_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link: link }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        ven.cargando = false;
        if (!x.ok) { ven.err = (x.j && x.j.error) || "No se pudo leer tu inventario."; }
        else { ven.lista = x.j.items || []; ven.noTrad = x.j.noTradables || 0; }
        render(); hidratarImgs();
      }).catch(function () { ven.cargando = false; ven.err = "No se pudo conectar. Intenta de nuevo."; render(); });
  }
  function ventaTotales() {
    var n = 0, tot = 0, sinP = 0;
    (ven.lista || []).forEach(function (g) {
      var c = ven.sel[g.k] || 0; if (!c) return;
      n += c; var p = precioCompra(g.name); if (p === null) sinP += c; else tot += p * c;
    });
    return { n: n, tot: tot, sinP: sinP };
  }
  function venderCardHtml(g, idx) {
    var p = precioCompra(g.name), c = ven.sel[g.k] || 0;
    return '<article class="icard' + (c ? ' vsel' : '') + '"><div class="ithumb" style="--rar:' + esc(g.color || "#8a8fb0") + '">' + (imgTag(g.icon, g.name, ' loading="lazy"') || '<span class="sinfoto">Sin foto</span>') +
      (g.n > 1 ? '<span class="itag">x' + g.n + '</span>' : '') + '</div>' +
      '<div class="ibody"><h4>' + esc(g.name) + '</h4>' +
      '<div class="iprice"><b>' + (p === null ? 'Consultar' : fmtPrecio(p)) + '</b></div>' +
      '<div class="vstep"><button type="button" class="btn btn-ghost btn-sm" data-a="venMenos" data-i="' + idx + '" aria-label="Quitar uno"' + (c ? '' : ' disabled') + '>−</button>' +
      '<span>' + c + '</span><button type="button" class="btn btn-ghost btn-sm" data-a="venMas" data-i="' + idx + '" aria-label="Agregar uno"' + (c >= g.n ? ' disabled' : '') + '>+</button></div></div></article>';
  }
  function venFiltrados() {
    var f = ven.f, q = sinTildes(ven.q), mn = parseFloat(f.min), mx = parseFloat(f.max);
    var vis = (ven.lista || []).map(function (g, i) { return { g: g, i: i, p: precioCompra(g.name) }; }).filter(function (o) {
      var g = o.g;
      if (q && sinTildes(g.name).indexOf(q) < 0) return false;
      if (f.tipo && g.tipo !== f.tipo) return false;
      if (f.heroe && g.heroe !== f.heroe) return false;
      if (f.ranura && g.ranura !== f.ranura) return false;
      if (f.rareza && g.rareza !== f.rareza) return false;
      if (f.calidad && g.calidad !== f.calidad) return false;
      if (isFinite(mn) && (o.p === null || o.p < mn)) return false;
      if (isFinite(mx) && (o.p === null || o.p > mx)) return false;
      return true;
    });
    vis.sort(function (a, b) {
      if (f.orden === "nombre") return a.g.name.localeCompare(b.g.name);
      var pa = a.p === null ? -1 : a.p, pb = b.p === null ? -1 : b.p;
      return f.orden === "menor" ? pa - pb : pb - pa;
    });
    return vis;
  }
  function venDistintos(k, base) {
    var set = {}, out = [];
    (base || []).concat((ven.lista || []).map(function (x) { return x[k]; })).forEach(function (v) { if (v && !set[v]) { set[v] = 1; out.push(v); } });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }
  function venFiltrosHtml() {
    var f = ven.f;
    var tabs = ['<button type="button" class="itab' + (!f.tipo ? ' on' : '') + '" data-a="venTipo" data-v="">Todos</button>'].concat(ITEM_TIPOS.map(function (t) {
      return '<button type="button" class="itab' + (f.tipo === t ? ' on' : '') + '" data-a="venTipo" data-v="' + esc(t) + '">' + esc(t) + '</button>';
    })).join("");
    var filt = '<aside class="ifilt"><details' + (window.innerWidth > 820 ? ' open' : '') + '><summary>Filtros</summary>' +
      '<div class="ff"><label>Precio (S/)</label><div class="ff2"><input id="vf-min" inputmode="decimal" placeholder="Desde" value="' + esc(f.min) + '"><input id="vf-max" inputmode="decimal" placeholder="Hasta" value="' + esc(f.max) + '"></div></div>' +
      '<div class="ff"><label for="vf-heroe">Héroe</label><select id="vf-heroe">' + opciones(venDistintos("heroe", HEROES_DOTA), f.heroe, "Todos") + '</select></div>' +
      '<div class="ff"><label for="vf-ranura">Ranura</label><select id="vf-ranura">' + opciones(venDistintos("ranura", SLOTS_DOTA), f.ranura, "Todas") + '</select></div>' +
      '<div class="ff"><label for="vf-rareza">Rareza</label><select id="vf-rareza">' + opciones(LISTA_RAREZAS.filter(Boolean), f.rareza, "Todas") + '</select></div>' +
      '<div class="ff"><label for="vf-calidad">Calidad</label><select id="vf-calidad">' + opciones(venDistintos("calidad", ITEM_CALIDADES), f.calidad, "Todas") + '</select></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-a="venReset" style="width:100%">Restablecer filtros</button></details></aside>';
    return { tabs: '<div class="itabs">' + tabs + '</div>', filt: filt };
  }
  function venderHtml() {
    var cuerpo;
    if (ven.cargando) cuerpo = '<div class="empty frame"><div class="in"><strong>Leyendo tu inventario…</strong><span>Puede tardar unos segundos.</span></div></div>';
    else if (ven.lista === null) cuerpo = '<div class="empty frame"><div class="in"><strong>Pega tu trade link para empezar</strong><span>Verás tus items de Dota 2 que se pueden intercambiar y el precio al que te los compramos.</span></div></div>';
    else if (!ven.lista.length) cuerpo = '<div class="empty frame"><div class="in"><strong>No hay items intercambiables</strong><span>Revisa que tu inventario de Dota 2 sea público y tenga items que puedas tradear.</span></div></div>';
    else {
      var vis = venFiltrados(), T = ventaTotales(), F = venFiltrosHtml();
      cuerpo = F.tabs + '<div class="ishop">' + F.filt + '<div class="imain">' +
        '<div class="ibar"><input id="ven-q" type="search" placeholder="Buscar en tu inventario…" value="' + esc(ven.q) + '" autocomplete="off">' +
        '<select id="vf-orden" aria-label="Ordenar">' + [["mayor", "Precio: mayor a menor"], ["menor", "Precio: menor a mayor"], ["nombre", "Nombre A-Z"]].map(function (o) { return '<option value="' + o[0] + '"' + (ven.f.orden === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join("") + '</select>' +
        '<span class="icount">' + vis.length + ' de ' + ven.lista.length + ' tipos de item' + (ven.noTrad ? ' · ' + ven.noTrad + ' no intercambiables' : '') + '</span></div>' +
        (vis.length ? '<div class="igrid">' + vis.map(function (o) { return venderCardHtml(o.g, o.i); }).join("") + '</div>' : '<div class="empty frame"><div class="in"><strong>Ningún item coincide</strong><span>Prueba con otros filtros.</span></div></div>') +
        '</div></div>' +
        '<div class="vbar"><div><b>' + T.n + '</b> item' + (T.n === 1 ? '' : 's') + ' elegido' + (T.n === 1 ? '' : 's') + (T.n ? ' · Total: <b>' + fmtPrecio(T.tot) + '</b>' + (T.sinP ? ' + ' + T.sinP + ' a consultar' : '') : '') + '</div>' +
        '<button class="btn btn-yellow" type="button" data-a="venWsp"' + (T.n && contactos().length ? '' : ' disabled') + '>💬 Vender por WhatsApp</button></div>';
    }
    return '<section class="section gutter" id="vender"><div class="wrap">' +
      '<div class="ipg-crumb"><a href="#inicio">Inicio</a> <span>›</span> <span>Vender items</span></div>' +
      '<div class="sec-title"><div class="kicker">Tus items</div><h2><span class="t1">Vender</span> <span>items</span></h2><p>Pega tu trade link, elige lo que quieres vender y mira cuánto te pagamos.</p><div class="orn">◆</div></div>' +
      (estado.secciones.items ? '' : '<p class="hint" style="text-align:center">🔒 Esta sección está oculta: solo tú (administrador) la ves. Actívala con el interruptor de abajo cuando esté lista.</p>') + switchItems() +
      '<div class="vlink frame"><div class="in"><label for="ven-link">Tu trade link de Steam</label>' +
      '<div class="vrow"><input id="ven-link" type="url" inputmode="url" placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…" value="' + esc(ven.link) + '" autocomplete="off">' +
      '<button class="btn btn-fuchsia" type="button" data-a="venVer"' + (ven.cargando ? ' disabled' : '') + '>Ver mi inventario</button></div>' +
      '<p class="hint">' + TRADE_AYUDA + '</p>' +
      '<p class="hint">Tu inventario de Dota 2 debe estar en <b>Público</b>. Tu trade link lo encuentras en Steam → Inventario → Ofertas de intercambio → "¿Quién puede enviarme ofertas?".' +
      (cuenta.perfil && cuenta.perfil.tradelink && !ven.link ? ' <button type="button" class="btn btn-ghost btn-sm" data-a="venMio">Usar el de mi cuenta</button>' : '') + '</p>' +
      (ven.err ? '<p class="hint" style="color:var(--danger)" role="alert">' + esc(ven.err) + '</p>' : '') + '</div></div>' + cuerpo + '</div></section>';
  }
  function mensajeVenta() {
    var p = cuenta.perfil, T = ventaTotales(), l = [];
    (ven.lista || []).forEach(function (g) {
      var c = ven.sel[g.k] || 0; if (!c) return;
      var pr = precioCompra(g.name);
      l.push("• " + c + "x " + g.name + " — " + (pr === null ? "precio a consultar" : fmtPrecio(pr * c)));
    });
    return "¡Hola! 👋 Quiero *VENDER* estos items a *RAYAS STORE* 💰\n\n" + l.join("\n") + "\n\n🧾 Total: " + fmtPrecio(T.tot) + (T.sinP ? " + " + T.sinP + " a consultar" : "") +
      "\n🔗 Mi trade link: " + String(ven.link).trim() + (p ? "\n\n👤 " + p.nombre + " (📧 " + p.email + ")" : "") + "\n\n¿Me confirmas? 🙏✨";
  }
  function ventaEvento(el) {
    if (el.id === "ofe-min" || el.id === "ofe-max") {
      ofe[el.id === "ofe-min" ? "min" : "max"] = el.value;
      var t = document.getElementById("ofrTabla"), it0 = itemPorId(idItemHash());
      if (t && it0) { t.innerHTML = ofertasTablaHtml(it0); hidratarImgs(); }
      return true;
    }
    if (el.id === "ven-link") { ven.link = el.value; return true; }
    if (el.id === "imp-link") { impEstado().link = el.value; return true; }
    if (el.id.indexOf("imp-rep-") === 0) {
      var Ir = impEstado(); Ir.selR = Ir.selR || {}; Ir.selR[el.id.slice(8)] = el.checked;
      var lr = el.closest && el.closest(".improw"); if (lr) lr.classList.toggle("off", !el.checked);
      var br = document.getElementById("imp-subir"); if (br) { br.textContent = impTextoSubir(Ir); br.disabled = !!Ir.subiendo || !impCuenta(Ir); }
      return true;
    }
    if (el.id.indexOf("imp-sel-") === 0) {
      var Is = impEstado(); Is.sel = Is.sel || {}; Is.sel[el.id.slice(8)] = el.checked;
      var lab = el.closest && el.closest(".impcard"); if (lab) lab.classList.toggle("off", !el.checked);
      var bt = document.getElementById("imp-subir"); if (bt) { bt.textContent = impTextoSubir(Is); bt.disabled = !!Is.subiendo || !impCuenta(Is); }
      return true;
    }
    if (el.id === "ven-q") {
      ven.q = el.value; var pos = el.selectionStart; render();
      var nq = document.getElementById("ven-q"); if (nq) { nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) { /* nada */ } }
      hidratarImgs(); return true;
    }
    var VF = { "vf-min": "min", "vf-max": "max", "vf-heroe": "heroe", "vf-ranura": "ranura", "vf-rareza": "rareza", "vf-calidad": "calidad", "vf-orden": "orden" };
    if (VF[el.id]) {
      var vid = el.id, vpos = el.selectionStart;
      ven.f[VF[vid]] = el.value; render();
      var vn = document.getElementById(vid);
      if (vn && vn.tagName === "INPUT") { vn.focus(); try { vn.setSelectionRange(vpos, vpos); } catch (e) { /* nada */ } }
      hidratarImgs(); return true;
    }
    if (el.id === "cp-nombre" || el.id === "cp-precio" || el.id === "cp-bulk") {
      admin.cp = admin.cp || {}; admin.cp[el.id.slice(3)] = el.value; return true;
    }
    return false;
  }
  /* --- Admin: pestaña Compras (precios a los que compras) --- */
  function tabCompras() {
    if (!ven.pCargado && !ven.pCargando) cargarPrecios();
    var C = admin.cp = admin.cp || {};
    var lista = ven.precios.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
    return '<div class="grp"><h3>Lista de precios de compra</h3>' +
      '<p class="hint">Aquí pones cuánto pagas por cada item. Los items de los clientes que estén en esta lista salen con precio; el resto sale "Consultar". El nombre debe ser igual al de Steam (en inglés), por ejemplo <b>Inscribed Golden Sunscorch Whip</b>.</p>' +
      '<div class="field"><label for="cp-nombre">Nombre del item</label><input id="cp-nombre" maxlength="120" value="' + esc(C.nombre || "") + '"></div>' +
      '<div class="field"><label for="cp-precio">Precio que pagas (S/)</label><input id="cp-precio" inputmode="decimal" value="' + esc(C.precio || "") + '"></div>' +
      '<div class="cav"><button class="btn btn-fuchsia btn-sm" type="button" data-a="cpGuardar">' + (C.edit ? 'Guardar cambios' : 'Agregar a la lista') + '</button>' + (C.edit ? '<button class="btn btn-ghost btn-sm" type="button" data-a="cpCancelar">Cancelar</button>' : '') + '</div>' +
      '<details style="margin-top:12px"><summary>Pegar varios a la vez</summary><p class="hint">Una línea por item: <b>Nombre = precio</b></p>' +
      '<textarea id="cp-bulk" rows="6" style="width:100%">' + esc(C.bulk || "") + '</textarea>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-a="cpBulk">Guardar lista pegada</button></details>' +
      (C.msg ? '<p class="hint" role="status">' + esc(C.msg) + '</p>' : '') + '</div>' +
      '<div class="grp"><h3>' + lista.length + ' en la lista</h3>' + (lista.length ? lista.map(function (r) {
        return '<div class="uitem"><div><b>' + esc(r.nombre) + '</b> — ' + fmtPrecio(r.precio) + '</div><div class="cav">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-a="cpEditar" data-id="' + esc(r.id) + '">Editar</button>' +
          (C.del === r.id ? '<button class="btn btn-fuchsia btn-sm" type="button" data-a="cpBorrarSi" data-id="' + esc(r.id) + '">¿Seguro? Borrar</button>' : '<button class="btn btn-ghost btn-sm" type="button" data-a="cpBorrar" data-id="' + esc(r.id) + '">Borrar</button>') + '</div></div>';
      }).join("") : '<p class="hint">Todavía no hay precios.</p>') + '</div>';
  }
  function guardarPrecio(nombre, precio) {
    nombre = String(nombre || "").trim();
    var p = parseFloat(String(precio).replace(",", "."));
    if (!nombre || !isFinite(p) || p <= 0) return Promise.reject(new Error("Revisa el nombre y el precio."));
    var id = slugCompra(nombre);
    return fsPedir("rayas_compra/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ fields: { nombre: { stringValue: nombre }, precio: { doubleValue: Math.round(p * 100) / 100 } } }) }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Tu sesión no tiene permiso. Vuelve a entrar." : "No se pudo guardar (" + r.status + ").");
      var k = -1; ven.precios.forEach(function (x, i) { if (x.id === id) k = i; });
      var o = { id: id, nombre: nombre, precio: Math.round(p * 100) / 100 };
      if (k >= 0) ven.precios[k] = o; else ven.precios.push(o);
    });
  }
  function accionCompras(a, t) {
    var C = admin.cp = admin.cp || {};
    if (a === "cpGuardar") {
      guardarPrecio(C.nombre, C.precio).then(function () { admin.cp = { msg: "Guardado ✔" }; render(); }).catch(function (e) { C.msg = e.message; render(); });
    } else if (a === "cpBulk") {
      var lineas = String(C.bulk || "").split(/\n+/).map(function (s) { var m = /^(.+?)\s*[=;\t]\s*([\d.,]+)\s*$/.exec(s.trim()); return m ? [m[1], m[2]] : null; }).filter(Boolean);
      if (!lineas.length) { C.msg = "No encontré líneas con el formato Nombre = precio."; render(); return; }
      var ok = 0;
      lineas.reduce(function (pr, l) { return pr.then(function () { return guardarPrecio(l[0], l[1]).then(function () { ok++; }, function () { /* sigue */ }); }); }, Promise.resolve())
        .then(function () { admin.cp = { msg: "Se guardaron " + ok + " de " + lineas.length + " líneas." }; render(); });
    } else if (a === "cpEditar") {
      var r = ven.precios.filter(function (x) { return x.id === t.getAttribute("data-id"); })[0];
      if (r) { admin.cp = { nombre: r.nombre, precio: String(r.precio), edit: true }; render(); }
    } else if (a === "cpCancelar") { admin.cp = {}; render(); }
    else if (a === "cpBorrar") { C.del = t.getAttribute("data-id"); render(); }
    else if (a === "cpBorrarSi") {
      var id = t.getAttribute("data-id");
      fsPedir("rayas_compra/" + encodeURIComponent(id), { method: "DELETE" }).then(function (r2) {
        if (!r2.ok) throw new Error("No se pudo borrar (" + r2.status + ").");
        ven.precios = ven.precios.filter(function (x) { return x.id !== id; }); C.del = null; render();
      }).catch(function (e) { C.msg = e.message; render(); });
    }
  }
  /* --- Admin: pestaña Items --- */
  function nuevoItemForm() { return { id: "", nombre: "", img: "", precio: "", stock: "1", tipo: "Wearable", heroe: "", ranura: "", rareza: "", calidad: "", estilos: "0", estOk: "1", descripcion: "", steamUsd: 0, steamAct: "", activo: true, creado: "", link: "" }; }
  /* Rellena el formulario a partir del link del Mercado de Steam (lo lee la función itemSteam, solo admin). */
  function rellenarDesdeSteam() {
    var F = admin.itemForm; if (!F || admin.steamCargando) return;
    if (!/steamcommunity\.com\/market\/listings\/570\//i.test(F.link || "")) { admin.itemMsg = "Pega un link del Mercado de Steam de Dota 2 (…/market/listings/570/…)."; render(); return; }
    admin.steamCargando = true; admin.itemMsg = ""; admin.steamInfo = ""; render();
    token().then(function (tk) {
      return fetch(PAGOS.urlItemSteam, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ link: F.link.trim() }) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.item) throw new Error(j.error || "No se pudo leer el item (" + r.status + ")."); return j.item; }); })
      .then(function (d) {
        if (d.nombre) F.nombre = d.nombre;
        if (d.tipo) F.tipo = ITEM_TIPOS.indexOf(d.tipo) >= 0 ? d.tipo : "Otro";
        if (d.heroe) F.heroe = d.heroe;
        if (d.ranura) F.ranura = d.ranura;
        if (d.rareza && LISTA_RAREZAS.indexOf(d.rareza) >= 0) F.rareza = d.rareza;
        if (d.calidad) F.calidad = d.calidad;
        if (d.estilos > 1) { F.estilos = String(d.estilos); F.estOk = (d.estOk || "1"); } else { F.estilos = "0"; F.estOk = ""; }
        if (d.precioUsd) { F.steamUsd = d.precioUsd; F.steamAct = new Date().toISOString(); }
        admin.steamInfo = d.precioUsd ? "Precio en Steam: US$ " + d.precioUsd.toFixed(2) + " (≈ " + fmtPrecio(d.precioUsd * COM.tc) + "; se mostrará a los clientes). Pon tú el precio en soles." : "Pon tú el precio en soles.";
        if (d.diag) admin.steamInfo += " [Steam no dio héroe/ranura. Datos: " + d.diag + "]";
        if (!d.imgData) return null;
        return fetch(d.imgData).then(function (x) { return x.blob(); }).then(function (b) { return subirImagen(new File([b], "item.png", { type: b.type || "image/png" }), 640); })
          .then(function (ref) { F.img = ref; }).catch(function () { admin.steamInfo += " (La foto no se pudo guardar: súbela a mano.)"; });
      })
      .then(function () { admin.steamCargando = false; render(); hidratarImgs(); })
      .catch(function (e) { admin.steamCargando = false; admin.itemMsg = (e && e.message === "NO_SESSION") ? "Vuelve a iniciar sesión." : ((e && e.message) || "No se pudo leer el item."); render(); });
  }
  /* Estilos (Style 1, Style 2…): los que el item tiene y cuáles están desbloqueados. Los demás salen en rojo como "Bloqueado". */
  function estilosOkLista(it) { return String(it.estOk || "").split(",").map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x > 0; }); }
  function estilosHtml(it) {
    var n = Math.max(0, Math.min(8, Math.floor(Number(it.estilos) || 0)));
    if (n < 1) return "";
    var ok = estilosOkLista(it), h = '<div class="estilos"><b>Estilos:</b>';
    for (var k = 1; k <= n; k++) h += ok.indexOf(k) >= 0 ? '<span class="est">Estilo ' + k + '</span>' : '<span class="est lock">Estilo ' + k + ' (Bloqueado)</span>';
    return h + '</div>';
  }
  function irAlForm() { var b = document.querySelector(".itm-box"); if (b) b.scrollTop = 0; }
  function gemasFormHtml(F) {
    var l = gemasDe(F);
    return '<div class="field gform"><label>💎 Gemas del item (cada versión con distinta gema lleva su propio precio)</label>' +
      '<datalist id="dl-gtipo">' + GEMA_TIPOS.map(function (t) { return '<option value="' + esc(t) + '">'; }).join("") + '</datalist>' +
      (l.length ? l.map(function (g, i) {
        return '<div class="grow-f"><input id="it-gt-' + i + '" list="dl-gtipo" maxlength="30" placeholder="Tipo (Unusual Effect Gem)" value="' + esc(g.t) + '"><input id="it-gv-' + i + '" maxlength="60" placeholder="Nombre (Candy Caster)" value="' + esc(g.v) + '">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-a="itGemaDel" data-i="' + i + '" aria-label="Quitar gema">✕</button></div>';
      }).join("") : '<p class="hint">Sin gemas.</p>') +
      '<div class="cav"><button type="button" class="btn btn-ghost btn-sm" data-a="itGemaMas" data-t="Unusual Effect Gem">+ Efecto Unusual</button><button type="button" class="btn btn-ghost btn-sm" data-a="itGemaMas" data-t="Prismatic Gem">+ Prismatic</button><button type="button" class="btn btn-ghost btn-sm" data-a="itGemaMas" data-t="Ethereal Gem">+ Etérea</button><button type="button" class="btn btn-ghost btn-sm" data-a="itGemaMas" data-t="Kinetic Gem">+ Cinética</button><button type="button" class="btn btn-ghost btn-sm" data-a="itGemaMas" data-t="">+ Otra gema</button>' +
      (F.id ? '<button type="button" class="btn btn-ghost btn-sm" data-a="itVariante">⧉ Crear otra versión (otra gema)</button>' : '') + '</div></div>';
  }
  function gemasAString(l) { return l.map(function (g) { var t = String(g.t || "").trim(), v = String(g.v || "").trim(); return t ? (t + ":" + (v ? " " + v : "")) : v; }).filter(Boolean).join("\n"); }
  /* ---- Items que ya existen: sumar unidades o crear otra versión sin repetir todo ---- */
  function resumenVersion(x) {
    var g = gemasDe(x).map(function (q) { return q.v || q.t; }).filter(Boolean).join(", "), ne = Number(x.estilos) || 0, ok = estilosOkLista(x);
    return (g ? '💎 ' + esc(g) : 'Sin gemas') + (ne ? ' · Estilos ' + (ok.length ? ok.join(",") : "—") + '/' + ne : '');
  }
  function existentesDe(F) {
    var n = sinTildes(String(F.nombre || "").trim());
    if (n.length < 3 || F.id) return [];
    return items.lista.filter(function (x) { return sinTildes(x.nombre) === n; }).sort(function (a, b) { return (a.precio || 0) - (b.precio || 0); });
  }
  function existentesHtml(F) {
    var l = existentesDe(F); if (!l.length) return "";
    return '<div class="grp dupbox"><h3>⚠ Este item ya existe (' + l.length + (l.length === 1 ? ' versión' : ' versiones') + ')</h3>' +
      '<p class="hint">No hace falta repetir todo. Suma una unidad a una versión que ya tienes, o crea una versión nueva y solo cambia lo que cambia (gema, estilos, precio).</p>' +
      l.map(function (x) {
        return '<div class="itrow"><div class="itrow-t"><span><b>' + resumenVersion(x) + '</b><small>' + fmtPrecio(x.precio) + ' · stock ' + x.stock + (x.activo ? '' : ' · OCULTO') + '</small></span></div>' +
          '<div class="itrow-b"><button type="button" class="btn btn-yellow btn-sm" data-a="itMas1" data-id="' + esc(x.id) + '" title="Sumar una unidad a esta versión">+1 unidad</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-a="itEditar" data-id="' + esc(x.id) + '">✎</button></div></div>';
      }).join("") +
      '<div class="cav"><button type="button" class="btn btn-fuchsia btn-sm" data-a="itVersion" data-id="' + esc(l[0].id) + '">➕ Agregar versión nueva (otra gema / estilos / precio)</button></div></div>';
  }
  function abrirVersion(base) {
    admin.itemForm = Object.assign({}, base, { id: "", desdeId: "", creado: "", precio: "", stock: "1", descripcion: "", estilos: String(base.estilos || 0), estOk: base.estOk || (base.estilos ? "1" : ""), soloCambios: true, activo: true });
    admin.itemMsg = ""; admin.steamInfo = ""; render(); hidratarImgs(); irAlForm();
  }
  function cambiarStock(id, delta) {
    var o = itemPorId(id); if (!o) return;
    var ns = (Number(o.stock) || 0) + delta;
    if (ns < 0) return;
    fsPedir("rayas_items/" + encodeURIComponent(id) + "?updateMask.fieldPaths=stock", { method: "PATCH", body: JSON.stringify({ fields: { stock: { integerValue: String(ns) } } }) }).then(function (r) {
      if (!r.ok) throw new Error("No se pudo cambiar el stock (" + r.status + ").");
      o.stock = ns; admin.itemMsg = ""; render(); hidratarImgs();
    }).catch(function (e) { admin.itemMsg = e.message; render(); });
  }
  // Quita UNA unidad de la oferta; si era la última, borra la oferta.
  function quitarUnidad(id) {
    var o = itemPorId(id); admin.itemDel = null; if (!o) return;
    if ((Number(o.stock) || 0) > 1) cambiarStock(id, -1); else borrarItem(id);
  }
  function estilosFormHtml(F) {
    return '<div class="field"><label for="it-estilos">Estilos (solo si el item los tiene)</label><select id="it-estilos">' + ["0", "2", "3", "4", "5", "6"].map(function (v) { return '<option value="' + v + '"' + (String(F.estilos || 0) === v ? ' selected' : '') + '>' + (v === "0" ? 'Sin estilos' : v + ' estilos') + '</option>'; }).join("") + '</select></div>' +
      ((Number(F.estilos) || 0) > 0 ? '<div class="field"><label>Estilos que SÍ tiene (los demás saldrán "Bloqueado")</label><div class="estchk">' + (function () { var o = "", ok = estilosOkLista(F); for (var k = 1; k <= Number(F.estilos); k++) o += '<label class="chk"><input type="checkbox" id="it-est-' + k + '"' + (ok.indexOf(k) >= 0 ? ' checked' : '') + '> Estilo ' + k + '</label>'; return o; })() + '</div></div>' : '');
  }
  function itemFormHtml() {
    var F = admin.itemForm;
    var form = '';
    if (F && F.soloCambios) form = '<div class="grp" id="itForm"><h3>Nueva versión de «' + esc(F.nombre) + '»</h3>' +
      '<div class="itrow-t">' + (F.img ? imgTag(F.img, "", ' width="56" height="56"') : '') + '<span><b>' + esc(F.nombre) + '</b><small>' + esc([F.tipo, F.heroe, F.ranura, F.rareza].filter(Boolean).join(" · ")) + '</small></span></div>' +
      '<p class="hint">Lo demás se copia del item. Solo pon lo que cambia en esta versión.</p>' +
      '<div class="field"><label for="it-precio">Precio en soles (S/)</label><input id="it-precio" inputmode="decimal" value="' + esc(F.precio) + '"></div>' +
      '<div class="field"><label for="it-stock">Stock (cuántos tienes)</label><input id="it-stock" inputmode="numeric" value="' + esc(F.stock) + '"></div>' +
      gemasFormHtml(F) + estilosFormHtml(F) +
      '<label class="chk"><input type="checkbox" id="it-activo"' + (F.activo ? ' checked' : '') + '> Visible para los clientes</label>' +
      (admin.itemMsg ? '<p class="hint" style="color:var(--danger)">' + esc(admin.itemMsg) + '</p>' : '') +
      '<div class="cav"><button type="button" class="btn btn-yellow btn-sm" data-a="itGuardar">' + (admin.itemGuardando ? 'Guardando…' : '💾 Guardar versión') + '</button><button type="button" class="btn btn-ghost btn-sm" data-a="itCompleto">Cambiar más datos</button><button type="button" class="btn btn-ghost btn-sm" data-a="itCerrarForm">Cancelar</button></div></div>';
    else if (F) form = '<div class="grp" id="itForm"><h3>' + (F.desdeId ? 'Editar esta unidad' : F.id ? 'Editar item' : 'Nuevo item') + '</h3>' +
      '<div class="field"><label for="it-link">Link del Mercado de Steam</label><input id="it-link" inputmode="url" placeholder="https://steamcommunity.com/market/listings/570/…" value="' + esc(F.link || "") + '"></div>' +
      '<div class="cav"><button type="button" class="btn btn-yellow btn-sm" data-a="itSteam">' + (admin.steamCargando ? 'Leyendo Steam…' : '⚡ Rellenar desde Steam') + '</button></div>' +
      (admin.steamInfo ? '<p class="hint">' + esc(admin.steamInfo) + '</p>' : '') +
      (F.img ? '<div class="yapeqr"><img data-fs="' + esc(F.img.slice(3)) + '" alt="" width="140" height="140" style="width:140px;height:auto"></div>' : '') +
      '<div class="cav"><label class="btn btn-ghost btn-sm" for="it-file">' + (admin.subiendo === "item" ? 'Subiendo…' : (F.img ? 'Cambiar foto' : 'Subir foto')) + '</label><input id="it-file" class="itfile" type="file" accept="image/*" hidden>' +
      (F.img ? '<button type="button" class="btn btn-ghost btn-sm" data-a="itQuitarFoto">Quitar foto</button>' : '') + '</div>' +
      '<div class="field"><label for="it-nombre">Nombre</label><input id="it-nombre" maxlength="90" value="' + esc(F.nombre) + '"></div>' + existentesHtml(F) +
      '<div class="field"><label for="it-precio">Precio en soles (S/)</label><input id="it-precio" inputmode="decimal" value="' + esc(F.precio) + '"></div>' +
      '<div class="field"><label for="it-stock">Stock (cuántos tienes)</label><input id="it-stock" inputmode="numeric" value="' + esc(F.stock) + '"></div>' +
      '<div class="field"><label for="it-tipo">Tipo</label><select id="it-tipo">' + opciones(ITEM_TIPOS, F.tipo, "—") + '</select></div>' +
      '<div class="field"><label for="it-heroe">Héroe</label><input id="it-heroe" list="dl-heroe" maxlength="40" value="' + esc(F.heroe) + '"><datalist id="dl-heroe">' + distintos("heroe", HEROES_DOTA).map(function (v) { return '<option value="' + esc(v) + '">'; }).join("") + '</datalist></div>' +
      '<div class="field"><label for="it-ranura">Ranura (Weapon, Head, Back…)</label><input id="it-ranura" list="dl-ranura" maxlength="40" value="' + esc(F.ranura) + '"><datalist id="dl-ranura">' + distintos("ranura", SLOTS_DOTA).map(function (v) { return '<option value="' + esc(v) + '">'; }).join("") + '</datalist></div>' +
      '<div class="field"><label for="it-rareza">Rareza</label><select id="it-rareza">' + opciones(LISTA_RAREZAS.filter(Boolean), F.rareza, "—") + '</select></div>' +
      '<div class="field"><label for="it-calidad">Calidad</label><input id="it-calidad" list="dl-calidad" maxlength="30" value="' + esc(F.calidad) + '"><datalist id="dl-calidad">' + distintos("calidad", ITEM_CALIDADES).map(function (v) { return '<option value="' + esc(v) + '">'; }).join("") + '</datalist></div>' +
      gemasFormHtml(F) +
      estilosFormHtml(F) +
      '<label class="chk"><input type="checkbox" id="it-activo"' + (F.activo ? ' checked' : '') + '> Visible para los clientes</label>' +
      (admin.itemMsg ? '<p class="hint" style="color:var(--danger)">' + esc(admin.itemMsg) + '</p>' : '') +
      '<div class="cav"><button type="button" class="btn btn-yellow btn-sm" data-a="itGuardar">' + (admin.itemGuardando ? 'Guardando…' : '💾 Guardar item') + '</button><button type="button" class="btn btn-ghost btn-sm" data-a="itCerrarForm">Cancelar</button></div></div>';
    return form;
  }
  function tabItems() {
    if (!items.cargado && !items.cargando) cargarItems();
    var form = '';
    var lista = items.lista.slice().sort(function (a, b) { return String(b.creado).localeCompare(String(a.creado)); });
    return '<div class="grp"><h3>Items en venta (' + items.lista.length + ')</h3>' +
      '<button type="button" class="btn btn-yellow btn-sm" data-a="itNuevo">+ Agregar item</button>' +
      '<p class="hint">Los cambios se guardan al instante (no hace falta "Guardar y publicar"). Cuando vendas uno por WhatsApp, baja su stock aquí.</p></div>' + form +
      '<div class="grp">' + (items.err ? '<p class="hint" style="color:var(--danger)">' + esc(items.err) + '</p>' : '') + (!items.cargado ? '<p class="hint">Cargando…</p>' : lista.map(function (it) {
        return '<div class="itrow"><div class="itrow-t">' + (it.img ? imgTag(it.img, "", ' width="44" height="44"') : '<span class="sinfoto">—</span>') + '<span><b>' + esc(it.nombre) + '</b><small>' + fmtPrecio(it.precio) + ' · stock ' + it.stock + (it.activo ? '' : ' · OCULTO') + '</small></span></div>' +
          '<div class="itrow-b"><button type="button" class="btn btn-ghost btn-sm" data-a="itEditar" data-id="' + esc(it.id) + '">✎</button>' +
          (admin.itemDel === it.id ? '<button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger)" data-a="itBorrarSi" data-id="' + esc(it.id) + '">¿Borrar? Sí</button>' : '<button type="button" class="btn btn-ghost btn-sm" data-a="itBorrar" data-id="' + esc(it.id) + '">🗑</button>') + '</div></div>';
      }).join("")) + '</div>';
  }
  function guardarItem() {
    var F = admin.itemForm; if (!F || admin.itemGuardando) return;
    var precio = parseFloat(String(F.precio).replace(",", ".")), stock = parseInt(F.stock, 10);
    if (!F.nombre.trim()) { admin.itemMsg = "Escribe el nombre del item."; render(); return; }
    if (!isFinite(precio) || precio <= 0) { admin.itemMsg = "Pon un precio mayor a 0."; render(); return; }
    if (!isFinite(stock) || stock < 0) stock = 1;
    var it = { id: F.id || ("it-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)), nombre: F.nombre.trim(), img: F.img, precio: Math.round(precio * 100) / 100, stock: stock,
      tipo: F.tipo, heroe: F.heroe.trim(), ranura: F.ranura.trim(), rareza: F.rareza, calidad: F.calidad.trim(), estilos: Number(F.estilos) || 0, estOk: Number(F.estilos) > 0 ? estilosOkLista(F).join(",") : "", descripcion: gemasAString(gemasDe(F).filter(function (g) { return g.v; })).slice(0, 600), steamUsd: Number(F.steamUsd) || 0, steamAct: F.steamAct || "", activo: F.activo, creado: F.creado || new Date().toISOString() };
    admin.itemGuardando = true; admin.itemMsg = ""; render();
    fsPedir("rayas_items/" + encodeURIComponent(it.id), { method: "PATCH", body: JSON.stringify(itemAFields(it)) }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Tu sesión no tiene permiso. Vuelve a entrar." : "No se pudo guardar (" + r.status + ").");
      var k = items.lista.map(function (x) { return x.id; }).indexOf(it.id);
      if (k >= 0) items.lista[k] = it; else { items.lista.unshift(it); avisoNuevoItem = chipsActivos().length > 0; }
      var o = F.desdeId ? itemPorId(F.desdeId) : null;
      if (!o) { admin.itemForm = null; admin.itemGuardando = false; render(); return; }
      // La unidad editada pasó a ser su propio item: se le resta 1 al grupo de donde salió.
      var ns = Math.max(0, (Number(o.stock) || 0) - 1);
      return fsPedir("rayas_items/" + encodeURIComponent(o.id) + "?updateMask.fieldPaths=stock", { method: "PATCH", body: JSON.stringify({ fields: { stock: { integerValue: String(ns) } } }) }).then(function (r2) {
        if (!r2.ok) throw new Error("La unidad se guardó, pero no pude bajar el stock del grupo (" + r2.status + "). Corrígelo a mano.");
        o.stock = ns; admin.itemForm = null; admin.itemGuardando = false; render();
      });
    }).catch(function (e) { admin.itemGuardando = false; admin.itemMsg = e.message || "No se pudo guardar."; render(); });
  }

  /* Admin: trae de Steam el precio (US$) de los items visibles y lo guarda para mostrarlo en soles bajo el precio. */
  function steamRefrescar() {
    var S = admin.st || (admin.st = {}); if (S.corriendo) return;
    var hace = Date.now() - 6 * 3600 * 1000;
    var cola = items.lista.filter(function (it) { return it.activo && (!it.steamAct || Date.parse(it.steamAct) < hace || !(it.steamUsd > 0)); });
    if (!cola.length) { S.msg = "Los precios de Steam están al día."; render(); return; }
    S.corriendo = true; S.msg = "0 de " + cola.length + "…"; render();
    var base = "projects/" + FB.projectId + "/databases/(default)/documents/", url = BASE.replace(/documents\/$/, "documents:commit"), hechos = 0, ok = 0;
    function fin(m) { S.corriendo = false; S.msg = m; render(); }
    function lote(i) {
      if (i >= cola.length) return fin("✔ Listo: " + ok + " precios actualizados.");
      var parte = cola.slice(i, i + 6), ahora = new Date().toISOString();
      return token().then(function (tk) {
        return fetch(PAGOS.urlPreciosSteam, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ nombres: parte.map(function (x) { return x.nombre; }) }) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "Error " + r.status); return j; }); })
          .then(function (j) {
            var w = [];
            parte.forEach(function (it) {
              var u = j.precios && j.precios[it.nombre];
              if (u > 0) { it.steamUsd = u; it.steamAct = ahora; ok++; w.push({ update: { name: base + "rayas_items/" + it.id, fields: { steamUsd: { doubleValue: u }, steamAct: { timestampValue: ahora } } }, updateMask: { fieldPaths: ["steamUsd", "steamAct"] }, currentDocument: { exists: true } }); }
            });
            hechos = i + parte.length;
            var g = w.length ? fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ writes: w }) }) : Promise.resolve({ ok: true });
            return g.then(function (rr) {
              if (!rr.ok) throw new Error("No se pudo guardar (" + rr.status + ").");
              S.msg = hechos + " de " + cola.length + "…"; render();
              if (j.limite) return fin("Steam pidió esperar. Se actualizaron " + ok + " de " + cola.length + "; vuelve a pulsar en unos minutos para seguir.");
              return lote(i + 6);
            });
          });
      }).catch(function (e) { fin((e && e.message === "NO_SESSION" ? "Vuelve a iniciar sesión." : (e && e.message) || "No se pudo actualizar.") + (ok ? " (" + ok + " ya guardados)" : "")); });
    }
    lote(0);
  }
  /* ---- Admin: importar a Comprar los items de un inventario de Steam (por trade link) ---- */
  var IMP_RAREZAS = ["ARCANO", "INMORTAL", "MÍTICO", "LEGENDARIO"];
  function impEstado() { return admin.imp || (admin.imp = { abierto: false, link: "", cargando: false, subiendo: false, err: "", msg: "", lista: null, yaEstaban: 0, total: 0 }); }
  function importarHtml() {
    var I = impEstado();
    if (!I.abierto) return '<div class="itadm frame"><div class="in"><b>Importar desde Steam</b><button type="button" class="btn btn-ghost btn-sm" data-a="impAbrir">⬇ Importar items de mi inventario</button><span class="hint">Sube de una vez tus items intercambiables Arcano, Inmortal, Mítico y Legendario.</span></div></div>';
    var cuenta2 = {}, conGemas = 0;
    (I.lista || []).forEach(function (g) { cuenta2[g.rareza] = (cuenta2[g.rareza] || 0) + 1; if (g.sig) conGemas++; });
    var resumen = I.lista ? IMP_RAREZAS.map(function (r) { return (cuenta2[r] || 0) + " " + r.toLowerCase(); }).join(" · ") : "";
    var notas = [];
    if (I.lista && I.yaEstaban) notas.push(I.yaEstaban + ' ya están en el catálogo con el mismo stock y <b>no se tocan</b>');
    if (I.lista && (I.repo || []).length) notas.push((I.repo || []).length + ' ya están y solo cambia su <b>stock</b> (el precio y la descripción no se modifican)');
    return '<div class="itadm frame"><div class="in" style="display:block"><b>Importar desde Steam</b>' +
      '<div class="vrow" style="margin:10px 0"><input id="imp-link" type="url" inputmode="url" placeholder="Trade link: https://steamcommunity.com/tradeoffer/new/?partner=…&token=…" value="' + esc(I.link) + '" autocomplete="off">' +
      '<button type="button" class="btn btn-yellow btn-sm" data-a="impTraer"' + (I.cargando || I.subiendo ? ' disabled' : '') + '>' + (I.cargando ? 'Leyendo…' : 'Traer items') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-a="impCerrar">Cerrar</button></div>' +
      (I.err ? '<p class="hint" style="color:var(--danger)" role="alert">' + esc(I.err) + '</p>' : '') +
      (I.lista ? '<p class="hint"><b>' + I.lista.length + '</b> items nuevos para subir (' + esc(resumen) + ')' + (conGemas ? ', <b>' + conGemas + '</b> con gemas' : '') + '.' + (notas.length ? '<br>' + notas.join('.<br>') + '.' : '') + '<br>Se suben <b>ocultos y sin precio</b>: pon el precio con ✎ y actívalos para que los vean los clientes.</p>' +
        ((I.diag || []).length ? '<p class="hint" style="color:var(--danger)">No pude leer las gemas de: ' + I.diag.map(function (d) { return esc(d.name) + ' (' + esc(d.lineas.join(' / ')) + ')'; }).join('; ') + '. Mándale esta pantalla a Claude para ajustarlo.</p>' : '') +
        ((I.lista.length || (I.repo || []).length) ? (I.lista.length ? '<p class="hint"><b>Items nuevos</b></p>' + impPrevisualHtml(I) : '') + impRepoHtml(I) + '<div class="impbar"><button type="button" class="btn btn-ghost btn-sm" data-a="impTodos">Marcar todos</button><button type="button" class="btn btn-ghost btn-sm" data-a="impNinguno">Quitar todos</button>' +
          '<button type="button" class="btn btn-yellow btn-sm" id="imp-subir" data-a="impSubir"' + (I.subiendo || !impCuenta(I) ? ' disabled' : '') + '>' + impTextoSubir(I) + '</button></div>' : '') : '') +
      (I.msg ? '<p class="hint" role="status">' + esc(I.msg) + '</p>' : '') + '</div></div>';
  }
  function impCuenta(I) { var n = 0; (I.lista || []).forEach(function (g, k) { if (I.sel && I.sel[k]) n++; }); (I.repo || []).forEach(function (r, k) { if (I.selR && I.selR[k]) n++; }); return n; }
  function impTextoSubir(I) {
    if (I.subiendo) return 'Subiendo…';
    var n = 0, r = 0; (I.lista || []).forEach(function (g, k) { if (I.sel && I.sel[k]) n++; }); (I.repo || []).forEach(function (x, k) { if (I.selR && I.selR[k]) r++; });
    return 'Subir ' + n + ' de ' + (I.lista || []).length + ' nuevos' + ((I.repo || []).length ? ' · reponer ' + r + ' de ' + I.repo.length : '');
  }
  /* Items que ya están en el catálogo: se les actualiza solo el stock. */
  function impRepoHtml(I) {
    var R = I.repo || []; if (!R.length) return '';
    return '<p class="hint"><b>Reponer stock</b> (items que ya tienes en el catálogo)</p><div class="imprepo">' + R.map(function (r, k) {
      var on = !!(I.selR && I.selR[k]), col = colorRareza(r.it.rareza);
      return '<label class="improw' + (on ? '' : ' off') + '"><input type="checkbox" id="imp-rep-' + k + '"' + (on ? ' checked' : '') + '>' +
        '<span class="improw-t">' + (r.it.img ? imgTag(r.it.img, "", ' width="40" height="40" loading="lazy"') : '') + '<span><b style="color:' + col + '">' + esc(r.it.nombre) + '</b>' + (r.it.descripcion ? '<small>💎 ' + lineasDesc(r.it).length + ' gemas/detalles</small>' : '') + '</span></span>' +
        '<span class="improw-s">stock ' + r.de + ' → <b>' + r.a + '</b>' + (r.a < r.de ? ' <small>(baja)</small>' : '') + '</span></label>';
    }).join('') + '</div>';
  }
  /* Vista previa: cada item con su foto, rareza, gemas y una casilla para elegir si se sube. */
  function impPrevisualHtml(I) {
    return '<div class="impgrid">' + I.lista.map(function (g, k) {
      var col = colorRareza(g.rareza), on = !!(I.sel && I.sel[k]), gem = g.gemas || [];
      return '<label class="impcard' + (on ? '' : ' off') + '" style="--rar:' + col + '"><input type="checkbox" id="imp-sel-' + k + '"' + (on ? ' checked' : '') + '>' +
        '<div class="ithumb" style="--rar:' + col + '">' + (imgTag(String(g.icon || "").replace(/\/\d+fx\d+f$/, "/256fx256f"), g.name, ' loading="lazy"') || '<span class="sinfoto">Sin foto</span>') + (g.n > 1 ? '<span class="itag">x' + g.n + '</span>' : '') + '</div>' +
        '<b class="impn">' + esc(g.name) + '</b><span class="impm" style="color:' + col + '">' + esc(g.rareza) + (g.heroe ? ' · ' + esc(g.heroe) : '') + '</span>' +
        (gem.length ? '<span class="impg">💎 ' + gem.slice(0, 3).map(esc).join('<br>') + (gem.length > 3 ? '<br>+' + (gem.length - 3) + ' más' : '') + '</span>' : '') +
        '</label>';
    }).join("") + '</div>';
  }
  function impId(g) { return "inv-" + slugCompra(g.name) + (g.sig ? "-" + g.sig : ""); }
  function impTraer() {
    var I = impEstado(), link = String(I.link || "").trim();
    if (!/[?&]partner=\d+/.test(link)) { I.err = "Pega el trade link completo (debe incluir partner= y token=)."; render(); return; }
    I.cargando = true; I.err = ""; I.msg = ""; I.lista = null; I.repo = []; render();
    fetch(INV_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link: link, detalle: true }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        I.cargando = false;
        if (!x.ok) { I.err = (x.j && x.j.error) || "No se pudo leer el inventario."; render(); return; }
        var porId = {}, porNombre = {};
        items.lista.forEach(function (it) { porId[it.id] = it; if (!porNombre[claveCompra(it.nombre)]) porNombre[claveCompra(it.nombre)] = it; });
        var todos = (x.j.items || []).filter(function (g) { return IMP_RAREZAS.indexOf(g.rareza) >= 0; });
        var nuevos = [], repo = [], ya = 0;
        todos.forEach(function (g) {
          // Mismo item = mismo nombre y mismas gemas. Si ya está, solo se repone su stock; precio, descripción y estado no se tocan.
          var ex = porId[impId(g)] || (!g.sig ? porNombre[claveCompra(g.name)] : null);
          if (!ex) { nuevos.push(g); return; }
          if (Number(ex.stock) === g.n) { ya++; return; }
          repo.push({ it: ex, g: g, de: Number(ex.stock) || 0, a: g.n });
        });
        I.lista = nuevos; I.sel = {}; nuevos.forEach(function (g, k) { I.sel[k] = true; });
        I.repo = repo; I.selR = {}; repo.forEach(function (r, k) { I.selR[k] = r.a > r.de; });   // las bajas de stock vienen sin marcar
        I.yaEstaban = ya; I.total = todos.length; I.diag = x.j.diag || [];
        if (!todos.length) I.msg = "No hay items intercambiables de esas rarezas en este inventario.";
        render();
      }).catch(function () { I.cargando = false; I.err = "No se pudo conectar. Intenta de nuevo."; render(); });
  }
  function impSubir() {
    var I = impEstado(); if (!I.lista || !I.lista.length || I.subiendo) return;
    var elegidos = I.lista.filter(function (g, k) { return I.sel && I.sel[k]; });
    var repos = (I.repo || []).filter(function (r, k) { return I.selR && I.selR[k]; });
    if (!elegidos.length && !repos.length) { I.err = "Marca al menos un item."; render(); return; }
    var base = "projects/" + FB.projectId + "/databases/(default)/documents/", ahora = Date.now(), lote = [], nuevos = [];
    elegidos.forEach(function (g, k) {
      var it = { id: impId(g), nombre: g.name, img: String(g.icon || "").replace(/\/\d+fx\d+f$/, "/256fx256f"), precio: 0, stock: g.n,
        tipo: g.tipo || "Otro", heroe: g.heroe || "", ranura: g.ranura || "", rareza: g.rareza, calidad: g.calidad || "", estilos: 0, estOk: "", descripcion: (g.gemas || []).join("\n"), activo: false,
        creado: new Date(ahora - k).toISOString() };
      nuevos.push(it);
      lote.push({ update: Object.assign({ name: base + "rayas_items/" + it.id }, itemAFields(it)), currentDocument: { exists: false } });
    });
    repos.forEach(function (r) {   // solo el stock: nada más se toca
      lote.push({ update: { name: base + "rayas_items/" + r.it.id, fields: { stock: { integerValue: String(r.a) } } }, updateMask: { fieldPaths: ["stock"] }, currentDocument: { exists: true } });
    });
    I.subiendo = true; I.err = ""; I.msg = ""; render();
    var url = BASE.replace(/documents\/$/, "documents:commit"), hechos = 0;
    function lotes(i) {
      if (i >= lote.length) return Promise.resolve();
      return token().then(function (tk) {
        return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ writes: lote.slice(i, i + 50) }) });
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Tu sesión no tiene permiso. Vuelve a entrar." : r.status === 409 ? "Alguno de esos items cambió. Recarga la página e intenta de nuevo." : "No se pudo subir (" + r.status + ").");
        hechos = Math.min(lote.length, i + 50);
        return lotes(i + 50);
      });
    }
    lotes(0).then(function () {
      repos.forEach(function (r) { r.it.stock = r.a; });
      items.lista = nuevos.concat(items.lista);
      I.subiendo = false; I.lista = []; I.sel = {}; I.repo = []; I.selR = {}; I.msg = "✔ " + (nuevos.length ? "Se subieron " + nuevos.length + " items nuevos (ocultos y sin precio: edítalos con ✎ para ponerles precio y activarlos). " : "") + (repos.length ? "Se repuso el stock de " + repos.length + " items. " : "") + "Nada más de lo que ya tenías se modificó.";
      render(); hidratarImgs();
    }).catch(function (e) {
      I.subiendo = false; I.err = (e && e.message || "No se pudo subir.") + (hechos ? " (ya se subieron " + hechos + ")" : ""); render();
    });
  }
  function borrarItem(id) {
    fsPedir("rayas_items/" + encodeURIComponent(id), { method: "DELETE" }).then(function (r) {
      if (!r.ok) throw new Error("No se pudo borrar (" + r.status + ").");
      items.lista = items.lista.filter(function (x) { return x.id !== id; }); admin.itemDel = null; render();
    }).catch(function (e) { admin.itemMsg = e.message; admin.itemDel = null; render(); });
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
    var partTxt = cupos > 0 ? (part + " / " + cupos + " tickets") : (part + (part === 1 ? " ticket tomado" : " tickets tomados"));
    var lleno = cupos > 0 && part >= cupos;
    var mio0 = misParts[p.id] || 0, tope0 = num(p.maxPorUsuario, 0), topeOk = tope0 > 0 && mio0 >= tope0;
    var fz = vivo() ? est : fase(p);
    if (fz === "porIniciar") { est = "proxima"; estTxt = "Próximamente"; }
    if (fz === "vencida") estTxt = "Cierre cumplido";
    var prog = cupos > 0 ? part / cupos : 0, restMs = p.cierre ? tiempoDe(p.cierre) - Date.now() : 0;
    var urg = est === "activa" && fz !== "vencida" && restMs > 0 && restMs < 86400000;
    var soon = est === "activa" && fz !== "vencida" && !lleno && (urg || (cupos > 0 && prog >= 0.8));
    var boton;
    if (fz === "vencida") {
      boton = '<button class="btn btn-ghost" type="button" disabled>⏳ Esperando resultado</button>';
    } else if (est === "activa") {
      boton = vivo() ? lnk("btn btn-yellow", "", "btnParticipar")
        : (lleno ? '<button class="btn btn-yellow" type="button" disabled>Tickets llenos</button>'
        : (topeOk ? '<button class="btn btn-ghost" type="button" disabled>✔ Tienes ' + mio0 + (mio0 === 1 ? ' ticket (máximo)' : ' tickets (máximo)') + '</button>'
        : (mio0 ? '<button class="btn btn-yellow" type="button" data-a="participar" data-id="' + esc(p.id) + '">✔ Tienes ' + mio0 + (mio0 === 1 ? ' ticket' : ' tickets') + ' · Comprar más</button>'
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
      partTxt = '<span' + ed("p:" + p.id + ":participantes", "0") + '>' + part + '</span>' + (cupos > 0 ? ' / ' + cupos + ' tickets' : ' participantes');
      if (est === "cerrada") boton = '<div class="pill">Ganador: <b style="color:var(--yellow)"' + ed("p:" + p.id + ":ganador", "Escribe el ganador") + '>' + esc(p.ganador) + '</b></div>';
    }
    var tools = V ? '<div class="ctools">' +
      '<button type="button" data-a="mover" data-d="-1" data-id="' + id + '" title="Mover a la izquierda" aria-label="Mover a la izquierda">←</button>' +
      '<button type="button" data-a="mover" data-d="1" data-id="' + id + '" title="Mover a la derecha" aria-label="Mover a la derecha">→</button>' +
      '<button type="button" data-a="editarId" data-id="' + id + '" title="Más opciones (fecha, tickets…)" aria-label="Más opciones">⚙</button>' +
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
      (img ? '<div class="pic' + (V ? '' : ' zoomable" data-a="zoomImg" title="Toca para ampliar') + '">' + img : '<div class="pic noimg"><span class="q">?</span>') +
      (V ? '<button type="button" class="status ' + est + '" data-a="ciclarEstado" data-id="' + id + '" title="Clic para cambiar el estado">' + estTxt + ' ⟳</button>'
         : '<span class="status ' + est + '">' + estTxt + '</span>') + (soon ? '<span class="soon">⏳ Cierra pronto</span>' : (est === "activa" && lleno ? '<span class="soon full">Tickets agotados</span>' : '')) + picInner + '</div>' +
      '<div class="body">' +
      (V ? '<button type="button" class="rarity rbtn" data-a="ciclarRareza" data-id="' + id + '" title="Clic para cambiar la rareza">' + esc(p.rareza || "Sin rareza") + ' ⟳</button>'
         : (p.rareza ? '<div class="rarity">' + esc(p.rareza) + '</div>' : '')) +
      '<h3' + ed("p:" + p.id + ":nombre", "Nombre del premio") + '>' + esc(V ? p.nombre : (p.nombre || "Premio")) + '</h3>' +
      (p.descripcion || V ? '<p class="desc"' + ed("p:" + p.id + ":descripcion", "Descripción (opcional)") + '>' + esc(p.descripcion) + '</p>' : '') +
      '<div class="meta"><span class="cost"><small>S/</small><b' + ed("p:" + p.id + ":creditos", "0") + '>' + cred + '</b><small>por ticket</small></span><span class="pill">' + partTxt + '</span></div>' +
      (cupos > 0 ? '<div class="cbar' + (part >= cupos ? ' full' : (part / cupos >= 0.8 ? ' hot' : '')) + '" role="img" aria-label="' + esc(partTxt) + '"><i style="width:' + Math.min(100, Math.round(part / cupos * 100)) + '%"></i></div>' : '') +
      (est === "activa" && p.cierre ? '<div class="timer' + (urg ? ' urg' : '') + '" data-cierre="' + esc(p.cierre) + '"><span class="tic">⏳</span> <span class="tx">' + esc(restante(p.cierre)) + '</span></div>' : '') +
      (est === "activa" && p.cierre ? '<div class="pill fechas">Cierra: ' + esc(fechaHora(p.cierre)) + (+p.cupos > 0 ? ' o al agotar tickets' : '') + '</div>' : '') +
      (est === "activa" && !p.cierre && +p.cupos > 0 ? '<div class="pill fechas">Cierra al agotar tickets</div>' : '') +
      (est === "proxima" && p.inicio && tiempoDe(p.inicio) ? '<div class="pill fechas">Abre: ' + esc(fechaHora(p.inicio)) + '</div>' : '') +
      (est === "proxima" && p.cierre ? '<div class="pill fechas">Cierra: ' + esc(fechaHora(p.cierre)) + '</div>' : '') +
      ((est === "activa" || est === "proxima") && +p.maxPorUsuario > 0 ? '<div class="pill maxp">🎟️ Máx. ' + (+p.maxPorUsuario) + (+p.maxPorUsuario === 1 ? ' ticket' : ' tickets') + ' por persona</div>' : '') +
      boton + (est === "cerrada" && p.replay ? '<button class="btn btn-ghost btn-sm" type="button" data-a="repeticion" data-id="' + id + '" style="margin-top:8px">🎬 Ver repetición</button>' : '') + '</div></div></article>';
  }

  function secTitle(kicker, htmlTitle, sub) {
    return '<div class="sec-title"><div class="kicker">' + kicker + '</div><h2>' + htmlTitle + '</h2>' +
      (sub ? '<p>' + sub + '</p>' : '') + '<div class="orn">◆</div></div>';
  }

  var VISTA_HASH = { inicio: "inicio", rifas: "rifas", como: "rifas", ganadores: "rifas", reglas: "rifas", comprar: "comprar", vender: "vender", perfil: "perfil", "perfil/transacciones": "perfil", "perfil/seguridad": "perfil" };
  var vistaActual = "inicio";
  function switchItems() {
    if (!admin.puede) return "";
    return '<label class="chk" style="justify-content:center;margin:6px 0 14px"><input type="checkbox" class="c-items2"' + (estado.secciones && estado.secciones.items ? ' checked' : '') + '> Mostrar "Comprar items" y "Vender items" a los clientes (también en LitleJacob Store)</label>';
  }
  function rifasOn() { return !(estado.secciones && estado.secciones.rifas === false); }
  function rifasVisible() { return !!(admin.puede || rifasOn()); }
  function ultimosGanadoresHtml(cerradas) {
    var g = (cerradas || []).filter(function (p) { return String(p.ganador || "").trim(); });
    g.sort(function (a, b) { return String(b.cierre || b.resultado || "").localeCompare(String(a.cierre || a.resultado || "")); });
    g = g.slice(0, 3);
    if (!g.length || !rifasVisible()) return "";
    return '<section class="section gutter" id="ultimos"><div class="wrap"><div class="sec-title"><div class="kicker">Salón de la fama</div><h2><span class="t1">Últimos</span> <span>ganadores</span></h2><div class="orn">◆</div></div>' +
      '<div class="winners ult">' + g.map(function (p) {
        return '<div class="winner frame gold"><div class="in"><div class="thumb">' + imgTag(p.img, "", ' loading="lazy"') + '</div>' +
          '<div class="who"><b>' + esc(p.ganador) + '</b><span>' + esc(p.nombre) + (p.cierre ? ' · ' + esc(fechaCorta(p.cierre)) : '') + '</span></div><span class="crown">🏆 GANÓ</span></div></div>';
      }).join("") + '</div><p class="ult-mas"><a class="btn btn-ghost btn-sm" href="#ganadores">Ver todos los ganadores</a></p></div></section>';
  }
  function itemsVisible() { return !!(admin.puede || (estado.secciones && estado.secciones.items)); }
  function vistaDeHash() {
    var h = String(location.hash || "").replace("#", "");
    if (VISTA_HASH[h]) vistaActual = VISTA_HASH[h];
    if (/^perfil(\/|$)/.test(h)) vistaActual = admin.puede ? "inicio" : "perfil";
    else if (vistaActual === "perfil") vistaActual = "inicio";
    if (/^item\//.test(h) || /^comprar\//.test(h)) vistaActual = "comprar";
    if ((vistaActual === "comprar" || vistaActual === "vender") && !itemsVisible()) vistaActual = "inicio";
    if (vistaActual === "rifas" && !rifasVisible()) vistaActual = itemsVisible() ? "comprar" : "inicio";
    return vistaActual;
  }
  // Menú desplegable de usuario (en Comprar / Vender items): datos de la cuenta, recargar, perfil, transacciones y cerrar sesión.
  function menuUsuarioHtml(vista) {
    var p = cuenta.perfil;
    var boton = '<b>◆ ' + fmtSol(p.creditos) + '</b> soles<span class="nm"> · ' + esc(p.nombre || "Mi cuenta") + '</span>';
    if (vista !== "comprar" && vista !== "vender") return '<button class="lock me" type="button" data-a="miCuenta">' + boton + '</button>';
    return '<span class="udrop"><button class="lock me" type="button" data-a="udropToggle" aria-haspopup="menu" aria-expanded="false">' + boton + '<span class="udrop-fl" aria-hidden="true"> ▾</span></button>' +
      '<div class="udrop-menu" role="menu">' +
      '<div class="udrop-head"><b>' + esc(p.nombre || "Mi cuenta") + '</b><small>' + esc(p.email || "") + '</small><span class="udrop-saldo">Saldo: <b>S/ ' + fmtSol(p.creditos) + '</b></span></div>' +
      (recargaOn() ? '<button type="button" role="menuitem" data-a="recargar"><i>💳</i>Recargar saldo</button>' : '') +
      '<button type="button" role="menuitem" data-a="miCuenta"><i>👤</i>Perfil</button>' +
      '<button type="button" role="menuitem" data-a="misMovs"><i>🧾</i>Transacciones</button>' +
      '<button type="button" role="menuitem" class="udrop-out" data-a="salir"><i>⎋</i>Cerrar sesión</button>' +
      '</div></span>';
  }
  function cerrarMenuUsuario() {
    document.querySelectorAll(".udrop.open").forEach(function (d) { d.classList.remove("open"); var b = d.querySelector("[data-a=udropToggle]"); if (b) b.setAttribute("aria-expanded", "false"); });
  }
  document.addEventListener("click", function (ev) { if (!ev.target.closest(".udrop")) cerrarMenuUsuario(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") cerrarMenuUsuario(); });
  function render() {
    var app = document.getElementById("app");
    if (!app) return;
    var visibles = estado.premios.filter(function (p) { return p.estado !== "cerrada" && (p.estado !== "oculta" || vivo()); });
    var cerradas = estado.premios.filter(function (p) { return p.estado === "cerrada"; });
    var linkCreditos = creditoHref();
    var T = estado.textos;

    var V = vivo();
    var vista = vistaDeHash();
    // El perfil ya no se abre como panel encima: si algo pidió el modo "perfil", se va a la página #perfil.
    if (cuenta.modo === "perfil") { cuenta.modo = null; if (vista !== "perfil" && !admin.puede) { try { history.pushState(null, "", location.pathname + location.search + "#" + PF_RUTA[cuenta.irTab || "info"]); } catch (e) { location.hash = PF_RUTA[cuenta.irTab || "info"]; return; } vista = vistaDeHash(); window.scrollTo(0, 0); } cuenta.irTab = ""; }
    if (vista === "perfil") {
      if (!cuenta.pfPedido && leerSesion()) { cuenta.pfPedido = true; setTimeout(function () { cargarPerfil(); cargarItems(); }, 0); }
      if (pfTabDeHash() === "seg") pfVerPass();
    } else cuenta.pfPedido = false;
    function sec(kk, k1, k2, subk) {
      return '<div class="sec-title">' + tx("div", kk, 'class="kicker"') +
        '<h2>' + (k1 ? tx("span", k1, 'class="t1"') + ' ' : '') + tx("span", k2) + '</h2>' +
        (subk ? tx("p", subk) : '') + '<div class="orn">◆</div></div>';
    }
    var html = '' +
      '<header class="topbar gutter"><div class="wrap">' +
      '<' + (V ? 'span' : 'a href="#inicio"') + ' class="logo"><img class="logo-img" src="img/logo.webp" alt="" width="44" height="44">' + tx("span", "logo1") + ' ' + tx("i", "logo2") + '</' + (V ? 'span' : 'a') + '>' +
      '<nav class="nav"><a class="navlink' + (vista === "inicio" ? ' on' : '') + '" href="#inicio">Inicio</a>' + (rifasVisible() ? '<a class="navlink" href="#como">Cómo participar</a><a class="navlink" href="#ganadores">Ganadores</a><a class="navlink" href="#reglas">Reglas</a>' : '') +
      (admin.puede ? '<button class="lock" type="button" data-a="admin">Panel admin</button><button class="lock" type="button" data-a="salir" title="Cerrar la sesión de administrador">⎋ Cerrar sesión</button>'
        : (cuenta.perfil ? '<button class="lock hot misrifas" type="button" data-a="misRifas">🎟️ Mis rifas</button>' + menuUsuarioHtml(vista)
          : (leerSesion() ? '<button class="lock" type="button" data-a="miCuenta">Mi cuenta</button>'
            : '<button class="lock" type="button" data-a="entrar">Entrar</button><button class="lock hot" type="button" data-a="registro">Crear cuenta</button>'))) +
      '</nav></div></header>' +
      '<div class="svcbar gutter"><div class="wrap">' +
      (itemsVisible() ? '<a class="svc-tab comprar' + (vista === "comprar" ? ' on' : '') + '" href="#comprar"><span>🛒</span>Comprar items' + (estado.secciones.items ? '' : ' 🔒') + '</a><a class="svc-tab vender' + (vista === "vender" ? ' on' : '') + '" href="#vender"><span>💰</span>Vender items' + (estado.secciones.items ? '' : ' 🔒') + '</a>' : '') +
      (itemsVisible() ? '<button type="button" class="svc-tab carrito" data-a="carAbrir"><span>🛒</span>Carrito' + (carroN() ? ' (' + carroN() + ')' : '') + '</button>' : '') +
      (rifasVisible() ? '<a class="svc-tab' + (vista === "rifas" ? ' on' : '') + '" href="#rifas"><span>🎟️</span>Rifas' + (rifasOn() ? '' : ' 🔒') + '</a>' : '') +
      (linkCreditos || V || recargaOn() ? btnRecargar("svc-tab recargar", "btnRecargarNav", linkCreditos) : '') +
      '</div></div>' +

      '@@VISTA@@' +
      '<section class="hero gutter" id="rifas-top">' + fotoBtn("hero") + '<div class="wrap">' +
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
      (linkCreditos || V || recargaOn() ? '<div style="text-align:center;margin-top:30px">' + btnRecargar("btn btn-fuchsia", "btnCreditos2", linkCreditos) + '</div>' : '') +
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

      '@@FIN@@' + '<footer class="footer gutter"><div class="wrap">' +
      '<span class="logo"><img class="logo-img" src="img/logo.webp" alt="" width="36" height="36" loading="lazy">' + esc(T.logo1) + ' <i>' + esc(T.logo2) + '</i></span>' +
      '<nav class="fnav" aria-label="Enlaces rápidos"><a href="#inicio">Inicio</a>' +
        (rifasVisible() ? '<a href="#rifas">Rifas</a><a href="#como">Cómo participar</a><a href="#ganadores">Ganadores</a><a href="#reglas">Reglas</a>' : '') +
        (itemsVisible() ? '<a href="#comprar">Comprar items</a><a href="#vender">Vender items</a>' : '') + '</nav>' +
      (V ? '<button type="button" class="btn btn-ghost btn-sm" data-a="editContactos">✎ Editar contactos de WhatsApp</button>'
         : (contactos().length ? '<span>WhatsApp: ' + contactos().map(function (c) { return esc(c.nombre) + ' <span class="wa">' + esc(waBonito(c.numero)) + '</span>'; }).join(' · ') + '</span>' : '')) +
      tx("span", "pie") +
      '</div></footer>';

    (function () {
      var a = html.split("@@VISTA@@"), b = a[1].split("@@FIN@@");
      var inicioHtml = '<section class="hero gutter" id="inicio">' + fotoBtn("hero") + '<div class="wrap">' +
        '<img class="hero-logo" src="img/logo.webp" alt="Rayas Store" width="132" height="132">' +
        tx("div", "inicioKicker", 'class="kicker"') +
        (V ? '<h1' + ed("t:inicioTitulo", "Título") + '>' + esc(T.inicioTitulo) + '</h1>' : '<h1>' + tituloHtml(T.inicioTitulo) + '</h1>') +
        tx("p", "inicioSub") +
        '<div class="actions">' + (rifasVisible() ? lnk("btn btn-yellow", "#rifas", "cardRifasBtn") : '') + btnRecargar("btn btn-fuchsia", "btnCreditos", linkCreditos) + '</div>' +
        '<ul class="trust" aria-label="Por qué comprar aquí"><li><span class="t-ico">🎮</span><b>Entrega por Steam</b><small>Directo a tu inventario</small></li>' +
        '<li><span class="t-ico">💳</span><b>Pago con Yape / tarjeta</b><small>Rápido y seguro</small></li>' +
        '<li><span class="t-ico">🎲</span><b>Ganador al azar</b><small>Sorteo justo en vivo</small></li></ul>' +
        '</div></section>' +
        '<section class="section gutter" id="secciones"><div class="wrap"><div class="sec-title"><div class="kicker">Nuestras secciones</div><h2><span class="t1">¿Qué</span> <span>buscas?</span></h2><div class="orn">◆</div></div>' +
        '<div class="cards2">' +
        (rifasVisible() ? '<a class="svc frame' + (rifasOn() ? ' gold' : '') + '" href="#rifas"><div class="in">' + (rifasOn() ? '' : '<span class="oculto-tag">🔒 Oculto para clientes</span>') + '<span class="ico">🎟️</span>' + tx("h3", "cardRifasT") + tx("p", "cardRifasD") + '<span class="btn btn-yellow">' + esc(T.cardRifasBtn) + '</span></div></a>' : '') +
        (itemsVisible() ? ['comprar', 'vender'].map(function (v) {
          var c = v === "comprar";
          return '<a class="svc frame' + (estado.secciones.items ? ' gold' : '') + '" href="#' + v + '"><div class="in">' + (estado.secciones.items ? '' : '<span class="oculto-tag">🔒 Oculto para clientes</span>') + '<span class="ico">' + (c ? '🛒' : '💰') + '</span><h3>' + (c ? 'Comprar items' : 'Vender items') + '</h3><p>' + (c ? 'Compra items de Dota 2 de forma segura.' : 'Vende tus items de Dota 2 de forma segura.') + '</p><span class="btn btn-fuchsia">' + (c ? 'Ver items' : 'Vender') + '</span></div></a>';
        }).join("") : '') +
        '</div></div></section>' + ultimosGanadoresHtml(cerradas);
      if (vista === "comprar") cargarItems();
      if (vista === "vender") cargarPrecios();
      var itemsHtml = vista === "comprar" ? comprarHtml() : vista === "vender" ? venderHtml() : '<section class="section gutter" id="' + vista + '"><div class="wrap">' +
        '<div class="sec-title"><div class="kicker">Próximamente</div><h2><span class="t1">' + (vista === "vender" ? 'Vender' : 'Comprar') + '</span> <span>items</span></h2><div class="orn">◆</div></div>' +
        (estado.secciones.items ? '' : '<p class="hint" style="text-align:center">🔒 Esta sección está oculta: solo tú (administrador) la ves. Actívala en Panel admin → Configuraciones principales.</p>') +
        '<div class="empty frame"><div class="in"><strong>Estamos preparando esta sección</strong><span>Muy pronto podrás ' + (vista === "vender" ? 'vender' : 'comprar') + ' items de Dota 2 aquí.</span></div></div>' +
        '</div></section>';
      html = a[0] + (vista === "rifas" ? (rifasOn() ? '' : '<p class="hint oculto-aviso" style="text-align:center;margin:18px auto 0;max-width:760px">🔒 Las rifas están ocultas: solo tú (administrador) las ves. Actívalas en Panel admin → Configuración.</p>') + b[0] : (vista === "comprar" || vista === "vender") ? itemsHtml : vista === "perfil" ? perfilPaginaHtml() : inicioHtml) + b[1];
    })();
    if (ruleta) html += modalRuleta();
    else if (modal && modal.tipo === "stock") html += stkPanelHtml();
    else if (modal) html += modalAviso();
    else if (elegirAbierto && contactos().length > 1) html += modalElegir();
    if (admin.puede && admin.itemForm) html += '<div class="itm-scrim" data-a="itCerrarForm"></div><div class="itm-box" role="dialog" aria-modal="true" aria-label="' + (admin.itemForm.id ? 'Editar item' : 'Nuevo item') + '"><button type="button" class="itm-x" data-a="itCerrarForm" aria-label="Cerrar">✕</button>' + itemFormHtml() + '</div>';
    if (admin.puede && !admin.abierto) html += barraEdicion();
    if (admin.puede && admin.abierto) html += '<div class="scrim" data-a="cerrar"></div>' + panelAdmin();
    if (!admin.puede && cuenta.modo) html += '<div class="scrim" data-a="cerrarCuenta"></div>' + panelCuenta();

    var scrollDrawer = document.querySelector(".drawer-body");
    var top = scrollDrawer ? scrollDrawer.scrollTop : 0;
    var boxPrev = document.querySelector(".itm-box"), boxTop = boxPrev ? boxPrev.scrollTop : 0;
    app.innerHTML = html;
    var boxNew = document.querySelector(".itm-box"); if (boxNew && boxTop) boxNew.scrollTop = boxTop;
    document.body.classList.toggle("itm-open", !!(admin.puede && admin.itemForm));
    montarGoogle();
    if (ruleta) { ruletaDibujar(ruleta.fin ? ruleta.rot : 0, 0); if (ruleta.fin) ruletaBrillo(); }
    document.body.classList.toggle("vivo", vivo());
    if (modal && modal.tipo === "stock") pintarStock();
    hidratarImgs();
    aplicarFotos();
    if (vista === "perfil" && cuenta.tab === "trans") pfFiltrar();
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

  // Historial de movimientos: rifas (participaciones) y compras de items. Las recargas aún no se guardan en un registro que el navegador pueda leer.
  function cargarMovs() {
    var uid = uidSesion(); if (!uid || esAdmin()) return;
    // La consulta lleva la sesión del cliente: sin ella Firestore la rechaza y el historial salía siempre vacío.
    token().then(function (tk) { return fetch(BASE.replace("/documents/", "/documents:runQuery"), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "orders" }], where: { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: uid } } }, limit: 100 } })
    }); }).then(function (r) { return r.ok ? r.json() : []; }).then(function (j) {
      cuenta.compras = (j || []).filter(function (x) { return x.document; }).map(function (x) {
        var f = x.document.fields || {};
        // Detalle de lo comprado: items[{name, qty, price}] del pedido.
        var its = ((f.items && f.items.arrayValue && f.items.arrayValue.values) || []).map(function (v) {
          var g = (v.mapValue && v.mapValue.fields) || {};
          var num = function (k) { return Number(g[k] && (g[k].integerValue || g[k].doubleValue) || 0); };
          return { id: g.id && g.id.stringValue || "", name: g.name && g.name.stringValue || "Item", qty: num("qty") || 1, price: num("price") };
        });
        var nUni = its.reduce(function (a, i) { return a + i.qty; }, 0);
        return { code: f.code && f.code.stringValue || "", n: Number(f.count && f.count.integerValue || 0) || nUni, monto: Number(f.creditos && (f.creditos.integerValue || f.creditos.doubleValue) || 0), t: f.createdAt && f.createdAt.timestampValue || "", items: its, estado: f.status && f.status.stringValue || "", tienda: f.tienda && f.tienda.stringValue || "" };
      }).filter(function (c) { return c.monto > 0; });
      if (vistaActual === "perfil") { render(); pfFiltrar(); }
    }).catch(function () { /* sin historial de compras */ });
  }
  /* ================= Perfil: Información personal · Transacciones · Seguridad ================= */
  var PF_TABS = [["info", "👤", "Información personal"], ["trans", "🔁", "Transacciones"], ["seg", "🔒", "Seguridad"]];
  var PF_EST = { pagado: "Por entregar", entregado: "Entregado", cancelado: "Cancelado" };
  function pfMon(n) { return "S/ " + (Math.round(Number(n) * 100) / 100).toFixed(2); }
  // La foto del item no se guarda en el pedido: se busca en el catálogo por id (o por nombre si el id ya no existe).
  function pfImgItem(it) {
    var l = items.lista || [], b = null;
    if (it.id) b = l.filter(function (x) { return x.id === it.id; })[0];
    if (!b) b = l.filter(function (x) { return sinTildes(x.nombre) === sinTildes(it.name); })[0];
    return b ? b.img : "";
  }
  function pfFilas() {
    var uid = uidSesion(), filas = [];
    Object.keys(partes).forEach(function (pid) {
      (partes[pid] || []).forEach(function (x) {
        if (x.uid !== uid) return;
        var k = buscarPremio(pid); if (k < 0) return;
        var p = estado.premios[k], gan = String(p.ganador || "").trim(), est = "curso", txt = "En curso";
        if (p.estado === "cerrada" && gan) {
          var win = p.ganadorUid ? p.ganadorUid === uid : gan.toLowerCase() === String(cuenta.perfil && cuenta.perfil.nombre || "").trim().toLowerCase();
          est = win ? "entregado" : "cancelado"; txt = win ? "¡Ganaste!" : "No ganaste";
        }
        filas.push({ key: "r_" + pid + "_" + (x.creado || ""), t: x.creado || "", tipo: "rifa", titulo: "Rifa: " + p.nombre, code: "", est: est, estTxt: txt, monto: Number(x.costo) || 0,
          det: [{ nombre: p.nombre, img: p.img, qty: x.cantidad, unit: x.cantidad ? (Number(x.costo) || 0) / x.cantidad : 0, sub: Number(x.costo) || 0, unidad: x.cantidad === 1 ? "ticket" : "tickets", estTxt: txt, est: est }], tienda: "" });
      });
    });
    (cuenta.compras || []).forEach(function (c) {
      filas.push({ key: "c_" + (c.code || c.t), t: c.t, tipo: "compra", titulo: "Compra de items", code: c.code || "", est: c.estado || "pagado", estTxt: PF_EST[c.estado] || c.estado || "Pagado", monto: c.monto,
        det: (c.items || []).map(function (i) { return { nombre: i.name, img: pfImgItem(i), qty: i.qty, unit: i.price, sub: i.price * i.qty, unidad: "", estTxt: PF_EST[c.estado] || "", est: c.estado || "pagado" }; }),
        tienda: c.tienda === "litlejacob" ? "LitleJacob Store" : (c.tienda === "rayas" ? "Rayas Store" : "") });
    });
    filas.sort(function (a, b) { return String(b.t).localeCompare(String(a.t)); });
    return filas;
  }
  function pfTransHtml() {
    var filas = pfFilas(), ab = cuenta.abiertos || {};
    var tipoSel = cuenta.tTipo || "";
    var cab = '<div class="pf-tools"><div class="pf-sec-h"><h2>Transacciones</h2><p>Tus compras de items y tickets de rifas. Toca una fila para ver el detalle.</p></div><div class="pf-filtros">' +
      '<select id="pf-tipo" aria-label="Tipo de transacción"><option value="">Todas</option><option value="compra"' + (tipoSel === "compra" ? " selected" : "") + '>Compras de items</option><option value="rifa"' + (tipoSel === "rifa" ? " selected" : "") + '>Rifas</option></select>' +
      '<input id="pf-buscar" type="search" placeholder="Buscar por ID o nombre del item" autocomplete="off" value="' + esc(cuenta.tBuscar || "") + '"></div></div>';
    if (!filas.length) return cab + '<div class="pf-vacio pf-vacio-t">Todavía no tienes transacciones. Tus compras de items y tus tickets de rifas aparecerán aquí.</div>';
    var tabla = '<div class="pf-tabla" role="table"><div class="pf-th" role="row"><span>Tipo / Fecha</span><span>ID</span><span>Estado</span><span>Sistema de pago</span><span>Importe</span><span class="r">Saldo</span></div>' +
      filas.map(function (f) {
        var abierto = !!ab[f.key], q = sinTildes(f.code + " " + f.titulo + " " + f.det.map(function (d) { return d.nombre; }).join(" "));
        var det = '<div class="pf-det"><div class="pf-dh"><span>Nombre del item</span><span>Cantidad</span><span>Estado</span><span>Precio unitario</span><span class="r">Subtotal</span></div>' +
          (f.det.length ? f.det.map(function (d) {
            return '<div class="pf-dr"><span class="pf-it"><span class="pf-foto">' + (imgTag(d.img, d.nombre, "") || '<i>🎁</i>') + '</span><b>' + esc(d.nombre) + '</b></span>' +
              '<span data-l="Cantidad">' + d.qty + (d.unidad ? " " + d.unidad : "") + '</span>' +
              '<span data-l="Estado"><i class="pf-dot est-' + esc(d.est) + '"></i>' + esc(d.estTxt) + '</span>' +
              '<span data-l="Precio unitario">' + pfMon(d.unit) + '</span><span class="r" data-l="Subtotal"><b>' + pfMon(d.sub) + '</b></span></div>';
          }).join("") : '<div class="pf-dr"><span class="hint">No hay detalle guardado de esta compra.</span></div>') +
          (f.tienda ? '<div class="pf-pie">Comprado en <b>' + esc(f.tienda) + '</b></div>' : '') + '</div>';
        return '<div class="pf-tx' + (abierto ? ' open' : '') + '" data-tipo="' + f.tipo + '" data-q="' + esc(q) + '">' +
          '<button type="button" class="pf-row" data-a="txAbrir" data-k="' + esc(f.key) + '" aria-expanded="' + abierto + '">' +
          '<span class="c-tipo"><b>' + esc(f.titulo) + '<i class="pf-fl" aria-hidden="true">▾</i></b><small>' + (f.t ? esc(fechaHora(f.t)) : "—") + '</small></span>' +
          '<span class="c-id" data-l="ID">' + (esc(f.code) || "—") + '</span>' +
          '<span class="c-est" data-l="Estado"><i class="pf-dot est-' + esc(f.est) + '"></i>' + esc(f.estTxt) + '</span>' +
          '<span class="c-pago" data-l="Sistema de pago">Saldo</span>' +
          '<span class="c-imp" data-l="Importe">' + pfMon(f.monto) + '</span>' +
          '<span class="c-sal neg r" data-l="Saldo">−' + pfMon(f.monto) + '</span></button>' + det + '</div>';
      }).join("") + '<p class="pf-nada" hidden>Ninguna transacción coincide con tu búsqueda.</p></div>';
    return cab + tabla;
  }
  // Filtra las filas sin volver a dibujar la página (así no se pierde el foco al escribir).
  function pfFiltrar() {
    var tipo = cuenta.tTipo || "", q = sinTildes(cuenta.tBuscar || "").trim(), n = 0;
    document.querySelectorAll(".pf-tx").forEach(function (el) {
      var ok = (!tipo || el.getAttribute("data-tipo") === tipo) && (!q || (el.getAttribute("data-q") || "").indexOf(q) >= 0);
      el.hidden = !ok; if (ok) n++;
    });
    var nada = document.querySelector(".pf-nada"); if (nada) nada.hidden = n > 0;
  }
  function pfInfoHtml(p) {
    return '<form class="pf-form" id="formTrade">' +
      '<div class="pf-sec-h"><h2>Información personal</h2><p>Estos datos los usamos para enviarte tus items por Steam.</p></div>' +
      '<div class="pf-grid">' +
      '<div class="field"><label for="p-nombre">Nombre de usuario</label><input id="p-nombre" maxlength="40" required value="' + esc(p.nombre) + '"></div>' +
      '<div class="field"><label for="p-email">Correo</label><input id="p-email" value="' + esc(p.email) + '" disabled></div>' +
      '<div class="field"><label for="p-wa">WhatsApp</label><input id="p-wa" inputmode="tel" maxlength="30" required value="' + esc(p.whatsapp) + '"></div>' +
      campoSteam("p-steam", p.steam) +
      '<div class="field pf-ancho"><label for="p-trade">Link de intercambio de Steam</label><input id="p-trade" inputmode="url" placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…" value="' + esc(p.tradelink) + '">' +
      '<p class="hint">' + TRADE_AYUDA + '</p></div></div>' +
      (p.steam ? '' : '<p class="pf-aviso">Agrega tu ID de Steam para que podamos agregarte y enviarte tus premios.</p>') +
      (p.tradelink ? '' : '<p class="pf-aviso">Sin trade link no podemos enviarte tus items.</p>') +
      '<div class="pf-acciones"><button class="btn btn-yellow" type="submit">Guardar cambios</button><span class="hint" role="status" id="tradeMsg"></span></div></form>';
  }
  function pfSegHtml() {
    var tp = cuenta.tienePass, link = creditoHref(), v = steamVinculado(), abierta = !!cuenta.claveAbierta;
    var clave;
    if (tp === false) {
      clave = '<div class="pf-fila"><div class="pf-fila-tx"><b>Contraseña</b><span>Entras con Steam o Google y aún no tienes contraseña.</span></div>' +
        (cuenta.perfil && cuenta.perfil.email ? '<button class="btn btn-ghost btn-sm" type="button" data-a="pfCrearClave">Crear contraseña</button>' : '') + '</div>';
    } else {
      clave = '<div class="pf-fila' + (abierta ? ' open' : '') + '"><div class="pf-fila-tx"><b>Contraseña</b><span>Cámbiala cuando quieras. Te pediremos la actual.</span></div>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-a="pfClaveToggle" aria-expanded="' + abierta + '">' + (abierta ? 'Cancelar' : 'Cambiar') + '</button>' +
        (abierta ? '<form class="pf-form pf-clave" id="formClave"><div class="pf-grid">' +
          '<div class="field pf-ancho"><label for="k-actual">Contraseña actual</label><input id="k-actual" type="password" autocomplete="current-password" required></div>' +
          '<div class="field"><label for="k-nueva">Nueva (mínimo 6)</label><input id="k-nueva" type="password" minlength="6" autocomplete="new-password" required></div>' +
          '<div class="field"><label for="k-repite">Repite la nueva</label><input id="k-repite" type="password" minlength="6" autocomplete="new-password" required></div></div>' +
          '<div class="pf-acciones"><button class="btn btn-yellow btn-sm" type="submit">Guardar contraseña</button><a href="#" class="hint" data-a="pfCrearClave">¿Olvidaste la actual?</a></div>' +
          '<p class="hint" role="status" id="claveMsg"></p></form>' : '') + '</div>';
    }
    return '<div class="pf-sec-h"><h2>Seguridad</h2><p>Controla cómo entras a tu cuenta.</p></div><div class="pf-lista">' + clave +
      '<div class="pf-fila"><div class="pf-fila-tx"><b>Steam</b><span>' + (v ? '✔ Vinculado (ID ' + esc(v) + '). Puedes entrar con «Entrar con Steam».' : 'Vincúlalo para entrar con un clic, sin contraseña.') + '</span></div>' +
        (v ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-a="steamVincular">Vincular Steam</button>') + '</div>' +
      '<div class="pf-fila"><div class="pf-fila-tx"><b>Sesión</b><span>Cierra tu sesión en este dispositivo.</span></div><button class="btn btn-ghost btn-sm" type="button" data-a="salir">Cerrar sesión</button></div>' +
      '</div>' + (link ? '<p class="hint pf-ayuda">¿Problemas con tu cuenta? <a href="' + esc(link) + '"' + (link === "#elegir" ? ' data-a="elegir"' : ' target="_blank" rel="noopener"') + '>Escríbenos por WhatsApp</a>.</p>' : '');
  }
  var PF_RUTA = { info: "perfil", trans: "perfil/transacciones", seg: "perfil/seguridad" };
  function pfTabDeHash() {
    var h = String(location.hash || "").replace("#", "");
    return h === "perfil/transacciones" ? "trans" : h === "perfil/seguridad" ? "seg" : "info";
  }
  function pfAvatar(p) {
    var a = p && p.steamAvatar && /^https:\/\/(avatars\.(steamstatic|akamai\.steamstatic|cloudflare\.steamstatic)\.com|steamcdn-a\.akamaihd\.net)\//.test(p.steamAvatar) ? p.steamAvatar : "";
    return a ? '<img src="' + esc(a) + '" alt="" width="56" height="56">' : '<span>' + esc(String(p && p.nombre || "?").trim().charAt(0).toUpperCase() || "?") + '</span>';
  }
  // Página de perfil (#perfil, #perfil/transacciones, #perfil/seguridad): ocupa el lugar de la sección, no se superpone.
  function perfilPaginaHtml() {
    var p = cuenta.perfil, tab = pfTabDeHash(), ses = leerSesion();
    cuenta.tab = tab;
    var cuerpo;
    if (!ses) cuerpo = '<div class="pf-card pf-vacio"><b>Entra a tu cuenta para ver tu perfil.</b><div class="pf-acciones" style="justify-content:center"><button class="btn btn-yellow" type="button" data-a="entrar">Entrar</button><button class="btn btn-ghost" type="button" data-a="registro">Crear cuenta</button></div></div>';
    else if (!p) cuerpo = '<div class="pf-card pf-vacio">' + (cuenta.msg && cuenta.msgTipo === "err" ? esc(cuenta.msg) : 'Cargando tu cuenta…') + '</div>';
    else {
      var msg = cuenta.msg ? '<p class="pf-msg ' + (cuenta.msgTipo === "err" ? "err" : "ok") + '" role="status">' + esc(cuenta.msg) + '</p>' : '';
      cuerpo = '<div class="pf-top"><div class="pf-user"><span class="pf-av">' + pfAvatar(p) + '</span><div><h1>' + esc(p.nombre || "Mi cuenta") + '</h1><small>' + esc(p.email || "") + '</small></div></div>' +
        '<div class="pf-saldo"><div><small>Saldo</small><b>S/ ' + (Math.round(p.creditos * 100) / 100).toFixed(2) + '</b></div>' + (recargaOn() ? '<button class="btn btn-fuchsia btn-sm" type="button" data-a="recargar">Recargar</button>' : '') + '</div></div>' +
        '<nav class="pf-nav" aria-label="Secciones del perfil">' + PF_TABS.map(function (t) {
          return '<a href="#' + PF_RUTA[t[0]] + '"' + (tab === t[0] ? ' class="on" aria-current="page"' : '') + '>' + (t[0] === "info" ? 'Información<span class="pf-largo"> personal</span>' : t[2]) + '</a>';
        }).join("") + '</nav>' + msg +
        '<div class="pf-card">' + (tab === "trans" ? pfTransHtml() : tab === "seg" ? pfSegHtml() : pfInfoHtml(p)) + '</div>';
    }
    return '<section class="pf-page gutter" id="perfil"><div class="wrap pf-wrap"><nav class="pf-mig" aria-label="Ruta"><a href="#inicio">Inicio</a><span aria-hidden="true">/</span><span>Mi perfil</span></nav>' + cuerpo + '</div></section>';
  }
  // ¿La cuenta tiene contraseña? Las de Steam o Google pueden no tenerla.
  function pfVerPass() {
    if (cuenta.tienePass !== undefined || cuenta.verPass) return;
    cuenta.verPass = true;
    token().then(function (tk) {
      return fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(FB.apiKey), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: tk }) });
    }).then(function (r) { return r.json(); }).then(function (j) {
      var u = j && j.users && j.users[0]; if (!u) throw new Error("x");
      cuenta.tienePass = (u.providerUserInfo || []).some(function (x) { return x.providerId === "password"; });
      cuenta.emailAuth = u.email || "";
      if (vistaActual === "perfil" && pfTabDeHash() === "seg") render();
    }).catch(function () { cuenta.tienePass = true; }).then(function () { cuenta.verPass = false; });
  }
  function pfCambiarClave(actual, nueva) {
    var s = leerSesion(), em = cuenta.emailAuth || (s && s.email) || (cuenta.perfil && cuenta.perfil.email) || "";
    if (!em) return Promise.reject(new Error("EMAIL_NOT_FOUND"));
    return login(em, actual).then(function (ses) {
      return fetch("https://identitytoolkit.googleapis.com/v1/accounts:update?key=" + encodeURIComponent(FB.apiKey), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: ses.id, password: nueva, returnSecureToken: true })
      });
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.idToken) throw new Error((j.error && j.error.message) || "UPDATE_FAILED");
      guardarSesion({ id: j.idToken, ref: j.refreshToken || (s && s.ref), exp: Date.now() + (Number(j.expiresIn) || 3600) * 1000 - 60000, email: em, uid: uidSesion() || (s && s.uid) });
    });
  }
  function pfEnviarClave() {
    var em = (cuenta.perfil && cuenta.perfil.email) || cuenta.emailAuth || "";
    if (!em) { cuenta.msg = "Tu cuenta no tiene un correo registrado."; cuenta.msgTipo = "err"; render(); return; }
    fetch("https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=" + encodeURIComponent(FB.apiKey), {
      method: "POST", headers: { "Content-Type": "application/json", "X-Firebase-Locale": "es" }, body: JSON.stringify({ requestType: "PASSWORD_RESET", email: em })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message || "ERROR");
      cuenta.msg = "Te enviamos un correo a " + em + " para crear una contraseña nueva. Revisa también spam."; cuenta.msgTipo = "ok";
    }).catch(function (e) { cuenta.msg = "No se pudo enviar el correo (" + (e && e.message) + ")."; cuenta.msgTipo = "err"; }).then(function () { render(); });
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
      var lineas = '<small>Entraste: ' + esc(x.creado ? fechaHora(x.creado) : "—") + ' · ' + x.cantidad + (x.cantidad === 1 ? ' ticket' : ' tickets') + ' · ' + x.costo + ' soles</small>';
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
    var m = cuenta.modo, cuerpo, titulo, cabeza = "";
    var msg = '<p class="hint" role="status"' + (cuenta.msgTipo === "err" ? ' style="color:var(--danger)"' : (cuenta.msgTipo === "ok" ? ' style="color:var(--ok)"' : '')) + '>' + esc(cuenta.msg) + '</p>';
    if (m === "registro") {
      titulo = "Crear cuenta";
      cuerpo = '<form class="drawer-body form" id="formRegistro">' +
        '<p class="hint">Crea tu cuenta para recibir saldo y participar en las rifas.</p>' + btnGoogle() +
        '<div class="field"><label for="r-nombre">Nombre o apodo</label><input id="r-nombre" maxlength="40" required autocomplete="nickname"></div>' +
        campoSteam("r-steam") + '<div class="field"><label for="r-trade">Link de intercambio de Steam (trade link)</label><input id="r-trade" inputmode="url" required placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…">' +
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
        '<p class="hint">' + (ses0.email ? 'Entraste con <b>' + esc(ses0.email) + '</b>, pero aún no tienes perfil en Rayas Store.' : '¡Listo, entraste con Steam!') + ' Completa tu perfil (WhatsApp y trade link) para comprar y participar en las rifas.</p>' +
        '<div class="field"><label for="c-nombre">Nombre o apodo</label><input id="c-nombre" maxlength="40" required autocomplete="nickname"' + (steamPre && steamPre.nom ? ' value="' + esc(steamPre.nom) + '"' : '') + '></div>' +
        campoSteam("c-steam", steamPre && steamPre.sid ? steamPre.sid : "") + '<div class="field"><label for="c-trade">Link de intercambio de Steam (trade link)</label><input id="c-trade" inputmode="url" required placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…">' +
        '<p class="hint">' + TRADE_AYUDA + '</p></div>' +
        '<div class="field"><label for="c-wa">WhatsApp</label><input id="c-wa" inputmode="tel" maxlength="20" placeholder="987 654 321" required></div>' +
        '<button class="btn btn-fuchsia" type="submit">Guardar mi perfil</button>' + msg +
        '<div class="grp"><button class="btn btn-ghost btn-sm" type="button" data-a="salir">Cerrar sesión</button></div></form>';
    } else if (m === "rifas") {
      titulo = "Mis rifas";
      cuerpo = '<div class="drawer-body">' + listaMisRifas() + '</div>';
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
      (cabeza || '<div class="drawer-head"><h2>' + titulo + '</h2><button class="btn btn-ghost btn-sm" type="button" data-a="cerrarCuenta">Cerrar</button></div>') +
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
    u.creditos = Math.max(0, Math.round(Number(valor) * 100) / 100); u.guardando = true; render();
    fsPedir("rayas_users/" + encodeURIComponent(uid) + "?updateMask.fieldPaths=creditos&currentDocument.exists=true", {
      method: "PATCH", body: JSON.stringify({ fields: { creditos: (u.creditos % 1 === 0 ? { integerValue: String(u.creditos) } : { doubleValue: u.creditos }) } })
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
      '<div class="field"><label for="nc-cred">Saldo inicial (S/)</label><input id="nc-cred" type="number" min="0" step="1" value="' + esc(nc.cred || "0") + '"></div>' +
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
        var id = esc(u.uid), ab = admin.uAbierto === u.uid;
        var cab = '<button type="button" class="urow-h" data-a="uAbrir" data-uid="' + id + '" aria-expanded="' + ab + '">' + avatarUsuario(u) + '<b>' + esc(u.nombre || "(sin nombre)") + '</b><span class="usal">S/ ' + esc(u.creditos) + '</span><i>' + (ab ? "▴" : "▾") + '</i></button>';
        if (!ab) return '<div class="urow compact">' + cab + '</div>';
        return '<div class="urow open">' + cab + '<div class="t"><span>WhatsApp: ' + esc(u.whatsapp) + '</span><span>' + esc(u.email) + '</span>' +
          (tradeValido(u.tradelink) ? '<span><a href="' + esc(u.tradelink) + '" target="_blank" rel="noopener">Abrir trade link ↗</a></span>' : '<span style="color:var(--fuchsia)">Sin trade link</span>') + '</div>' +
          '<div class="ucred">' +
          '<button class="iconbtn" type="button" data-a="cred" data-uid="' + id + '" data-d="-1" aria-label="Quitar S/ 1">−</button>' +
          '<input class="credset" data-uid="' + id + '" type="number" min="0" step="0.01" inputmode="decimal" value="' + u.creditos + '" aria-label="Saldo de ' + esc(u.nombre) + '">' +
          '<button class="iconbtn" type="button" data-a="cred" data-uid="' + id + '" data-d="1" aria-label="Sumar S/ 1">+</button>' +
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
      '<p class="hint">El saldo se guarda al instante (no hace falta "Guardar y publicar").</p>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-a="recargarU">Actualizar lista</button></div>';
  }


  /* ---- Pedidos de items (solo admin) ---- */
  var PED_ESTADOS = [["pagado", "💰 Por entregar"], ["entregado", "✅ Entregado"], ["cancelado", "✖ Cancelado"]];
  function leerPedidoDoc(d) {
    var f = d.fields || {}, sv = function (k) { return f[k] && f[k].stringValue || ""; }, nv = function (k) { var x = f[k]; return x ? Number(x.doubleValue !== undefined ? x.doubleValue : x.integerValue || 0) : 0; };
    var its = ((f.items && f.items.arrayValue && f.items.arrayValue.values) || []).map(function (v) {
      var m = (v.mapValue && v.mapValue.fields) || {};
      return { nombre: m.name && m.name.stringValue || "Item", qty: Number(m.qty && (m.qty.integerValue || m.qty.doubleValue) || 1), precio: Number(m.price && (m.price.doubleValue !== undefined ? m.price.doubleValue : m.price.integerValue) || 0) };
    });
    return { id: d.name.split("/").pop(), code: sv("code") || d.name.split("/").pop(), cliente: sv("customerName"), steam: sv("steamId"), email: sv("email"), tradelink: sv("tradelink"),
      whatsapp: sv("phone"), uid: sv("uid"), correoAdmin: !!(f.correoAdmin && f.correoAdmin.booleanValue), correoCliente: !!(f.correoCliente && f.correoCliente.booleanValue), correoError: sv("correoError"), estado: sv("status") || "pagado", tienda: sv("tienda"), total: nv("total"), creditos: nv("creditos"), items: its,
      fecha: f.createdAt && f.createdAt.timestampValue ? new Date(f.createdAt.timestampValue) : null };
  }
  function cargarPedidos() {
    admin.pedMsg = "Cargando…"; admin.pedCargando = true;
    return token().then(function (tk) {
      return fetch(BASE.replace("/documents/", "/documents:runQuery"), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "orders" }], where: { fieldFilter: { field: { fieldPath: "origen" }, op: "EQUAL", value: { stringValue: "items" } } }, limit: 300 } }) });
    }).then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? "Firebase no te deja leer los pedidos." : "Error " + r.status); return r.json(); })
      .then(function (j) {
        admin.pedidos = (j || []).filter(function (x) { return x.document; }).map(function (x) { return leerPedidoDoc(x.document); })
          .filter(function (p) { return p.tienda !== "litlejacob"; })
          .sort(function (a, b) { return (b.fecha || 0) - (a.fecha || 0); });
        admin.pedMsg = ""; admin.pedCargando = false; render();
      }).catch(function (e) { admin.pedidos = []; admin.pedMsg = e.message; admin.pedCargando = false; render(); });
  }
  function cambiarEstadoPedido(id, estado) {
    var p = (admin.pedidos || []).filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var antes = p.estado; p.estado = estado; render();
    fsPedir("orders/" + encodeURIComponent(id) + "?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt", {
      method: "PATCH", body: JSON.stringify({ fields: { status: { stringValue: estado }, updatedAt: { timestampValue: new Date().toISOString() } } })
    }).then(function (r) { if (!r.ok) throw new Error("Error " + r.status); })
      .catch(function (e) { p.estado = antes; admin.pedMsg = "No se guardó: " + e.message; render(); });
  }
  function pedClave(p) { return p.uid || p.steam || (p.cliente || "").toLowerCase(); }
  function historialPedidosHtml(p) {
    var k = pedClave(p), todos = (admin.pedidos || []).filter(function (x) { return pedClave(x) === k; }), vivos = todos.filter(function (x) { return x.estado !== "cancelado"; });
    var gastado = vivos.reduce(function (a, x) { return a + x.total; }, 0);
    return '<div class="hist"><b>📜 Historial de compras de este cliente</b><small class="hint">' + vivos.length + (vivos.length === 1 ? ' compra' : ' compras') + ' · ' + fmtPrecio(gastado) + ' en total</small>' +
      todos.map(function (x) {
        var est = (PED_ESTADOS.filter(function (e) { return e[0] === x.estado; })[0] || [0, x.estado])[1], n = x.items.map(function (i) { return i.qty + ' × ' + i.nombre; }).join(", ");
        return '<div class="histr' + (x.id === p.id ? ' cur' : '') + '"><span>' + esc(x.fecha ? x.fecha.toLocaleDateString("es-PE") : "") + ' · <b>' + esc(x.code) + '</b></span><span>' + esc(n) + '</span><span>' + fmtPrecio(x.total) + ' · ' + esc(est) + '</span></div>';
      }).join("") + '</div>';
  }
  function tabPedidos() {
    if (admin.pedidos === null) { cargarPedidos(); return '<p class="hint">Cargando pedidos…</p>'; }
    var fl = admin.pedFiltro || "pagado", todos = admin.pedidos;
    var cuenta = function (k) { return todos.filter(function (p) { return k === "todos" || p.estado === k; }).length; };
    var chips = [["pagado", "💰 Por entregar"], ["entregado", "✅ Entregados"], ["cancelado", "✖ Cancelados"], ["todos", "Todos"]].map(function (c) {
      return '<button class="subtab" type="button" role="tab" data-a="pedFiltro" data-f="' + c[0] + '" aria-selected="' + (fl === c[0]) + '">' + c[1] + ' (' + cuenta(c[0]) + ')</button>'; }).join("");
    var lista = todos.filter(function (p) { return fl === "todos" || p.estado === fl; });
    return '<div class="subtabs" role="tablist">' + chips + '</div><div class="grp"><h3>Pedidos de items (' + lista.length + ')</h3>' +
      (admin.pedMsg ? '<p class="hint" style="color:var(--danger)">' + esc(admin.pedMsg) + '</p>' : '') +
      '<div class="ulist">' + (lista.length ? lista.map(function (p) {
        var ab = admin.pedAbierto === p.id, n = p.items.reduce(function (a, i) { return a + i.qty; }, 0);
        var cab = '<button type="button" class="urow-h" data-a="pedAbrir" data-id="' + esc(p.id) + '" aria-expanded="' + ab + '"><b>' + esc(p.cliente || "Sin nombre") + ' · ' + n + (n === 1 ? ' item' : ' items') + '</b><span class="usal">' + fmtPrecio(p.total) + '</span><i>' + (ab ? "▴" : "▾") + '</i></button>';
        if (!ab) return '<div class="urow compact">' + cab + '</div>';
        return '<div class="urow open">' + cab + '<div class="t"><span>Pedido <b style="display:inline">' + esc(p.code) + '</b> · ' + (p.fecha ? esc(p.fecha.toLocaleString("es-PE")) : "") + '</span>' +
          p.items.map(function (i) { return '<span>' + i.qty + ' × ' + esc(i.nombre) + ' — ' + fmtPrecio(i.precio * i.qty) + '</span>'; }).join("") +
          '<span>ID de Steam: ' + esc(p.steam || "—") + '</span><span>WhatsApp: ' + esc(p.whatsapp || "—") + '</span><span>' + esc(p.email) + '</span>' +
          (tradeValido(p.tradelink) ? '<span><a href="' + esc(p.tradelink) + '" target="_blank" rel="noopener">Abrir trade link ↗</a></span>' : '<span style="color:var(--fuchsia)">Sin trade link</span>') +
          '<span>Pagado con saldo: ' + fmtPrecio(p.creditos) + '</span>' +
          '<span>✉ Correo a ti: ' + (p.correoAdmin ? '✔ enviado' : '✖ no enviado') + ' · Correo al cliente: ' + (p.correoCliente ? '✔ enviado' : '✖ no enviado') + '</span>' +
          (p.correoError ? '<span style="color:var(--danger)">Motivo: ' + esc(p.correoError) + '</span>' : '') + '</div>' + historialPedidosHtml(p) +
          '<div class="field"><label>Estado</label><select data-a="pedEstado" data-id="' + esc(p.id) + '">' + PED_ESTADOS.map(function (e) { return '<option value="' + e[0] + '"' + (p.estado === e[0] ? ' selected' : '') + '>' + e[1] + '</option>'; }).join("") + '</select></div>' +
          (p.estado === "cancelado" ? '<p class="hint">Cancelar no devuelve el saldo solo: súmalo en Usuarios y saldo.</p>' : '') + '</div>';
      }).join("") : '<p class="hint">No hay pedidos aquí. Cuando alguien compre un item aparecerá y te llegará un correo.</p>') + '</div>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-a="pedRecargar">Actualizar lista</button></div>';
  }

  var TABS_ADMIN = { config: "⚙ Configuración", premios: "Premios", usuarios: "Usuarios y saldo", items: "Items", compras: "Compras", pedidos: "🛒 Pedidos", pagina: "Textos y contactos" };
  function seccionAdmin() { var v = vistaActual; return v === "rifas" ? "rifas" : (v === "comprar" || v === "vender") ? "items" : "inicio"; }
  function tabsDeSeccion(sc) { return sc === "rifas" ? ["config", "premios", "usuarios", "pagina"] : sc === "items" ? ["config", "items", "pedidos", "compras", "usuarios"] : ["config", "usuarios", "pagina"]; }
  function panelAdmin() {
    var sc = seccionAdmin(), lista = tabsDeSeccion(sc);
    if (lista.indexOf(admin.tab) < 0) admin.tab = lista[0];
    var nomSc = sc === "rifas" ? "Rifas" : sc === "items" ? "Compra y venta de items" : "General";
    var titulo = admin.editando ? (admin.editando.nuevo ? "Nuevo premio" : "Editar premio") : "Panel admin · " + nomSc;
    var cuerpo;
    if (admin.editando) cuerpo = formPremio();
    else cuerpo = '<div class="tabs" role="tablist">' +
      lista.map(function (k) { return '<button class="tab" role="tab" type="button" data-a="tab" data-t="' + k + '" aria-selected="' + (admin.tab === k) + '">' + (k === "config" && sc === "inicio" ? "⚙ Configuraciones principales" : TABS_ADMIN[k]) + '</button>'; }).join("") +
      '</div>' + (admin.tab === "config" ? tabConfig(sc) : admin.tab === "pagina" ? tabPagina() : (admin.tab === "usuarios" ? tabUsuarios() : (admin.tab === "items" ? tabItems() : (admin.tab === "compras" ? tabCompras() : admin.tab === "pedidos" ? tabPedidos() : listaPremios()))));
    return '<aside class="drawer" role="dialog" aria-label="Panel de administración">' +
      '<div class="drawer-head"><h2>' + titulo + '</h2><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" type="button" data-a="salir" title="Cerrar la sesión de administrador" style="color:var(--danger,#ff7a7a)">⎋ Cerrar sesión</button><button class="btn btn-ghost btn-sm" type="button" data-a="cerrar">Cerrar panel</button></div></div>' +
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
  // Pedidos de un usuario (solo admin, al abrir su ficha): cantidad, total gastado y última compra.
  function cargarPedidosU(uid) {
    admin.pedU = admin.pedU || {}; admin.pedCarg = admin.pedCarg || {}; if (admin.pedU[uid] !== undefined || admin.pedCarg[uid]) return;
    admin.pedCarg[uid] = true;
    token().then(function (tk) { return fetch(BASE.replace("/documents/", "/documents:runQuery"), { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "orders" }], where: { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: uid } } }, limit: 200 } }) }); })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (j) {
        var n = 0, total = 0, ult = "";
        (j || []).forEach(function (x) { if (!x.document) return; var f = x.document.fields || {}, m = Number(f.creditos && (f.creditos.integerValue || f.creditos.doubleValue) || 0), t = f.createdAt && f.createdAt.timestampValue || ""; if (m > 0) { n++; total += m; if (t > ult) ult = t; } });
        admin.pedU[uid] = { n: n, total: Math.round(total * 100) / 100, ult: ult }; render();
      }).catch(function () { admin.pedU[uid] = null; render(); });
  }
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
        rifas.push('<li>' + esc(pr ? pr.nombre : (x.premioNombre || pid)) + ' · ' + x.cantidad + (x.cantidad === 1 ? ' ticket' : ' tickets') + ' · ' + x.costo + ' soles · ' + esc(x.creado ? fechaHora(x.creado) : "—") +
          (pr && pr.ganadorUid === uid ? ' · <b>🏆 ganador</b>' : '') + '</li>');
      });
    });
    var ped = (admin.pedU || {})[uid], pedHtml = ped === undefined ? "Cargando…" : (ped === null ? "No se pudo leer (revisa permisos)" : ped.n + (ped.n === 1 ? " pedido" : " pedidos") + (ped.n ? " · S/ " + ped.total + " gastados · última compra " + esc(ped.ult ? fechaHora(ped.ult) : "—") : ""));
    var tienePerfilSteam = u.steamId || u.steamAvatar || u.steamPais || u.steamPublico !== null;
    var h = '<div class="ficha"><div class="fhead">' + avatarUsuario(u, true) + '<div class="fnom"><b>' + esc(u.nombre || "(sin nombre)") + '</b>' +
      (u.steamPais ? '<small>📍 ' + esc(u.steamPais) + '</small>' : '') +
      (urlSteamOk(u.steamPerfilUrl) ? '<a href="' + esc(u.steamPerfilUrl) + '" target="_blank" rel="noopener noreferrer">Ver perfil de Steam ↗</a>' : '') + '</div>' +
      '<span class="fcred">◆ ' + fmtSol(u.creditos) + ' soles</span></div>' +
      (u.steamPublico === false ? '<p class="fpriv">🔒 Perfil de Steam privado: no se puede ver su inventario ni verificar la entrega de antemano.</p>' : '') +
      '<div class="frow"><span>Pedidos</span><div>' + pedHtml + '</div></div>' +
      '<div class="frow"><span>WhatsApp</span><div>' + (soloDigitos(u.whatsapp) ? '<a href="https://wa.me/' + esc(waNum(u.whatsapp)) + '" target="_blank" rel="noopener">' + esc(u.whatsapp) + ' ↗</a>' : '—') + '</div></div>' +
      '<div class="frow"><span>Correo</span><div><a href="mailto:' + esc(u.email) + '">' + esc(u.email) + '</a></div></div>' +
      '<div class="frow"><span>Trade link</span><div>' + (tradeValido(u.tradelink)
        ? '<a href="' + esc(u.tradelink) + '" target="_blank" rel="noopener">Abrir en Steam ↗</a> <button class="iconbtn wide" type="button" data-a="copiar" data-txt="' + esc(u.tradelink) + '">' + (u.copiado && Date.now() - u.copiado < 3000 ? "✔ Copiado" : "Copiar") + '</button>'
        : '<span style="color:var(--fuchsia)">Sin trade link</span>') + '</div></div>' +
      (u.steam ? '<div class="frow"><span>ID de Steam</span><div>' + esc(u.steam) + '</div></div>' : '') +
      (u.steamId && u.steamId !== u.steam ? '<div class="frow"><span>SteamID64</span><div>' + esc(u.steamId) + '</div></div>' : '') +
      '<div class="frow"><span>Registro</span><div>' + (u.creado ? esc(fechaHora(u.creado)) : "—") + '</div></div>' +
      '<div class="frow"><span>Rifas</span><div>' + (rifas.length ? '<ul class="frifas">' + rifas.join("") + '</ul>' : "Ninguna todavía") + '</div></div>';
    if (ctx && ctx.p) {
      var p = ctx.p, esGan = p.ganadorUid === uid;
      if (esGan && soloDigitos(u.whatsapp)) {
        var aviso = "¡Felicidades " + u.nombre + "! 🏆 Ganaste la rifa de " + p.nombre + " en RAYAS STORE. Te enviaremos el item por Steam a tu trade link. ¡Gracias por participar! 🎉";
        h += '<div class="fbtns"><a class="btn btn-fuchsia btn-sm" target="_blank" rel="noopener" href="' + esc(waLinkA(waNum(u.whatsapp), aviso)) + '">Avisar al ganador por WhatsApp</a></div>';
      }
      h += '<div class="frow"><span>Tickets</span><div class="adjq"><button class="iconbtn" type="button" data-a="cantPart" data-d="-1" data-uid="' + id + '" data-id="' + esc(p.id) + '"' + ((ctx.cantidad || 1) <= 1 ? ' disabled' : '') + ' aria-label="Quitar un ticket">−</button><b>' + (ctx.cantidad || 1) + '</b><button class="iconbtn" type="button" data-a="cantPart" data-d="1" data-uid="' + id + '" data-id="' + esc(p.id) + '" aria-label="Sumar un ticket">+</button><small>Ajuste manual: no cobra ni devuelve saldo.</small></div></div>';
      var kq = p.id + "_" + uid, dq = ' data-uid="' + id + '" data-id="' + esc(p.id) + '"';
      h += '<div class="fbtns">' + (admin.quitarP === kq
        ? '<button class="btn btn-ghost btn-sm" type="button" data-a="quitarPartSi"' + dq + ' data-dev="' + (admin.quitarDev ? 1 : 0) + '">Sí, ' + (admin.quitarDev ? 'quitar y devolver ' + (ctx.costo || 0) + ' soles' : 'solo quitar (sin devolver)') + '</button><button class="btn btn-ghost btn-sm" type="button" data-a="quitarPartNo">No</button>'
        : '<button class="btn btn-ghost btn-sm" type="button" data-a="quitarPart"' + dq + ' data-dev="1">Quitar y devolver saldo</button><button class="btn btn-ghost btn-sm" type="button" data-a="quitarPart"' + dq + ' data-dev="0">Solo quitar</button>') + '</div>';
    }
    return h + '<div class="fbtns"><button class="btn btn-yellow btn-sm" type="button" data-a="editU" data-uid="' + id + '">✎ Editar datos</button></div></div>';
  }
  function listaParticipantes() {
    if (!estado.premios.length) return '';
    if (admin.usuarios === null && !admin.cargandoU) { admin.cargandoU = true; cargarUsuarios(); }
    return estado.premios.map(function (p) {
      var l = partes[p.id] || [], pid = esc(p.id);
      var libres = (admin.usuarios || []).filter(function (u) { return !l.some(function (x) { return x.uid === u.uid; }); });
      return '<div class="grp"><h3>Participantes · ' + esc(p.nombre || "Premio") + ' (' + l.length + (l.length === 1 ? ' persona' : ' personas') + ' · ' + tomados(p.id) + '/' + (num(p.cupos, 0) > 0 ? num(p.cupos, 0) : '∞') + ' tickets)</h3>' +
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
          '</select><input id="add-q-' + pid + '" type="number" min="1" max="100" value="1" aria-label="Tickets"><button class="btn btn-ghost btn-sm" type="button" data-a="addPart" data-id="' + pid + '">Agregar</button></div><small class="hint">Se agrega sin descontar saldo.</small>' + (admin.addPid === p.id && admin.addMsg ? '<p class="hint" style="color:' + (admin.addMsgOk ? 'var(--ok)' : 'var(--danger)') + '" role="status">' + esc(admin.addMsg) + '</p>' : '') + '</div>' : '') +
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
    if (nueva > x.cantidad && nueva - x.cantidad > cuposLibresAdmin(pid)) { admin.addPid = pid; admin.addMsg = "No hay suficientes tickets libres (quedan " + Math.max(0, cuposLibresAdmin(pid)) + "). Sube el límite de tickets del premio si quieres más."; admin.addMsgOk = false; render(); return; }
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
      admin.nc = null; admin.ncMsg = pre ? "✔ Cuenta de prueba creada. Correo: " + d.email + " · Contraseña: " + d.pass + " · 100 soles" : "✔ Cuenta creada: " + d.email; admin.ncOk = true; admin.usuarios = null; render();
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
    if (q > lib) { admin.addPid = pid; admin.addMsg = lib <= 0 ? "La rifa ya está llena (" + num(pr.cupos, 0) + " tickets). Sube el límite de tickets del premio para agregar más." : "Solo quedan " + lib + " tickets libres."; admin.addMsgOk = false; render(); return; }
    admin.addPid = pid; admin.addMsg = "Agregando…"; admin.addMsgOk = true; render();
    fsPedir("rayas_part/" + encodeURIComponent(pid + "_" + u.uid) + "?currentDocument.exists=false", {
      method: "PATCH", body: JSON.stringify({ fields: { uid: { stringValue: u.uid }, nombre: { stringValue: u.nombre }, premio: { stringValue: pid }, premioNombre: { stringValue: pr.nombre }, costo: { integerValue: "0" }, cantidad: { integerValue: String(q) }, creado: { timestampValue: new Date().toISOString() } } })
    }).then(function (r) {
      if (r.status === 403) throw new Error("Firebase no lo permite: falta publicar las reglas nuevas de rayas_part (las del mensaje anterior).");
      if (r.status === 409) throw new Error("Ese usuario ya participa en esta rifa. Ajusta sus tickets en su ficha.");
      if (!r.ok) throw new Error("Error " + r.status);
      (partes[pid] = partes[pid] || []).push({ uid: u.uid, nombre: u.nombre, costo: 0, cantidad: q, creado: new Date().toISOString(), premioNombre: pr.nombre });
      admin.addMsg = "✔ " + u.nombre + " agregado con " + q + (q === 1 ? " ticket." : " tickets."); admin.addMsgOk = true; render();
    }).catch(function (e) { admin.addMsg = e.message; admin.addMsgOk = false; render(); });
  }
  function listaPremios() {
    var items = estado.premios.map(function (p, i) {
      var est = p.estado === "proxima" ? "Próximamente" : (p.estado === "cerrada" ? "Cerrada" : (p.estado === "oculta" ? "Deshabilitada (oculta)" : "Abierta"));
      return '<div class="aitem"><div class="th">' + imgTag(p.img, "") + '</div>' +
        '<div class="t"><b>' + esc(p.nombre || "Premio") + '</b><span>' + est + ' · ' + num(p.creditos, 0) + ' soles</span></div>' +
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

  function yapeAdminHtml() {
    var y = estado.yape || {};
    return '<div class="grp"><h3>💜 Yape para recargas por WhatsApp</h3>' +
      '<p class="hint">Sube tu QR de Yape. Los clientes que elijan <b>Yape / WhatsApp</b> lo ven al recargar (sin comisión) y te mandan la captura por WhatsApp.</p>' +
      (y.qr ? '<div class="yapeqr"><img data-fs="' + esc(y.qr.slice(3)) + '" alt="QR de Yape" width="160" height="160"></div>' : '<p class="hint">Aún no subes tu QR.</p>') +
      '<div class="cav"><label class="btn btn-ghost btn-sm" for="yape-file">' + (admin.subiendo === "yape" ? "Subiendo…" : (y.qr ? "Cambiar QR" : "Subir mi QR de Yape")) + '</label>' +
      '<input id="yape-file" class="yapefile" type="file" accept="image/*" hidden>' +
      (y.qr ? '<button type="button" class="btn btn-ghost btn-sm" data-a="yapeQuitar">Quitar QR</button>' : '') + '</div>' +
      '<div class="field"><label for="yape-num">Número de Yape (opcional)</label><input id="yape-num" class="y-num" inputmode="tel" maxlength="12" value="' + esc(y.numero || "") + '"></div>' +
      '<div class="field"><label for="yape-nom">A nombre de (opcional)</label><input id="yape-nom" class="y-nom" maxlength="40" value="' + esc(y.nombre || "") + '"></div>' +
      '<p class="hint">Recuerda pulsar <b>Publicar</b> para que los clientes lo vean.</p></div>';
  }
  function swCfg(cls, on, titulo, desc, si, no) {
    return '<label class="cfg-row' + (on ? ' on' : '') + '"><span class="cfg-tx"><b>' + titulo + '</b><small>' + desc + '</small><em>' + (on ? si : no) + '</em></span>' +
      '<input type="checkbox" class="' + cls + '"' + (on ? ' checked' : '') + '><span class="cfg-sw" aria-hidden="true"></span></label>';
  }
  function correosPruebaHtml() {
    return '<div class="grp"><h3>✉️ Correos de pago</h3><p class="hint">Envía a tu correo de administrador 4 correos de ejemplo (pago confirmado y pago pendiente, con el diseño de Rayas y de LitleJacob) para ver cómo les llegan a los clientes. No cobra ni suma nada.</p>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-a="probarCorreos"' + (admin.correoMsg === "Enviando…" ? ' disabled' : '') + '>Enviar correos de prueba</button>' +
      (admin.correoMsg ? '<p class="hint">' + esc(admin.correoMsg) + '</p>' : '') + '</div>';
  }
  function probarCorreos() {
    admin.correoMsg = "Enviando…"; render();
    token().then(function (tk) {
      return fetch(PAGOS.urlProbarCorreos, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk }, body: "{}" });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        admin.correoMsg = x.ok && x.j.ok ? "✔ Enviados " + x.j.enviados + " correos a " + x.j.a + ". Revisa tu bandeja y la carpeta de spam." + (x.j.fallaron ? " Fallaron " + x.j.fallaron + ": " + x.j.error : "") : ((x.j && x.j.error) || "No se pudo enviar.");
        render();
      }).catch(function (e) { admin.correoMsg = (e && e.message === "NO_SESSION") ? "Tu sesión venció. Vuelve a entrar." : "No se pudo conectar. Intenta de nuevo."; render(); });
  }
  function tabConfig(sc) {
    var it = !!(estado.secciones && estado.secciones.items), cq = !!(estado.pagos && estado.pagos.culqi);
    return '<div class="grp cfg"><h3>' + (sc === "rifas" ? 'Configuración de rifas' : sc === "items" ? 'Configuración de compra y venta' : 'Configuraciones principales') + '</h3><p class="hint">Activa o desactiva las secciones de la página. Lo desactivado solo lo ves tú (administrador). Pulsa <b>Guardar y publicar</b> para que lo vean todos. Estas opciones son las mismas en Rayas Store y LitleJacob Store.</p>' +
      (sc === "items" ? "" : swCfg("c-rifas", rifasOn(), "🎟️ Rifas", "Sección de rifas, cómo participar, ganadores y reglas.", "VISIBLE para los clientes", "OCULTA: solo tú la ves")) +
      (sc === "rifas" ? "" : swCfg("c-items", it, "🛒 Compra y venta de items", "Comprar items, Vender items y Carrito.", "VISIBLE para los clientes", "OCULTA: solo tú la ves")) +
      (sc !== "inicio" ? "" : swCfg("c-pagos", cq, "💳 Culqi (tarjeta / Yape)", "Botón de pago en línea para recargar saldo.", "ACTIVO: pueden recargar con tarjeta o Yape", "APAGADO: solo piden saldo por WhatsApp")) +
      (sc !== "inicio" ? "" : correosPruebaHtml()) +
      (sc === "inicio" ? "" : '<p class="hint">Las demás opciones (Culqi, Yape, contactos) están en el panel de <b>Inicio</b>.</p>') +
      '</div>';
  }
  function tabPagina() {
    var T = estado.textos;
    return yapeAdminHtml() +
      (estado.contactos || []).map(function (c, k) {
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
      '<p class="hint">Si los dos están activos, el cliente elige con quién hablar. Si solo hay uno activo, el botón abre directo su WhatsApp. Si ninguno, se ocultan los botones de recarga. Perú: 51 + 9 dígitos.</p>' +
      '<div class="grp"><h3>Mensajes de WhatsApp</h3>' +
      '<div class="field"><label for="f-msg1">Cuando pide saldo con cuenta</label><textarea id="f-msg1" rows="6" maxlength="600">' + esc(T.msgCredPerfil) + '</textarea></div>' +
      '<p class="hint">Usa {nombre} y {correo} para poner los datos del usuario.</p>' +
      '<div class="field"><label for="f-msg2">Cuando pide saldo sin cuenta</label><textarea id="f-msg2" rows="4" maxlength="600">' + esc(T.msgCredVisita) + '</textarea></div>' +
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
      '<div class="field"><label for="f-creditos">Costo (S/)</label><input id="f-creditos" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.creditos, 0) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="f-desc">Descripción (opcional)</label><textarea id="f-desc" maxlength="240">' + esc(p.descripcion) + '</textarea></div>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-inicio">Fecha y hora de inicio</label><input id="f-inicio" type="datetime-local" value="' + esc(aLocalInput(p.inicio)) + '"></div>' +
      '<div class="field"><label for="f-cierre">Fecha y hora de cierre</label><input id="f-cierre" type="datetime-local"' + (p.cierre ? '' : ' disabled') + ' value="' + esc(aLocalInput(p.cierre)) + '"></div>' +
      '</div>' +
      '<label class="chk"><input type="checkbox" id="f-hasta"' + (p.cierre ? '' : ' checked') + '> Sin fecha: cerrar solo cuando se agoten los tickets</label>' +
      '<p class="hint">Inicio: si lo dejas vacío, la rifa empieza cuando publiques. La rifa se abre y se cierra sola en esas horas.</p>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-estado">Estado</label><select id="f-estado">' +
      [['activa', 'Abierta'], ['proxima', 'Próximamente'], ['cerrada', 'Cerrada'], ['oculta', 'Deshabilitada (oculta)']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((p.estado || "activa") === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join("") + '</select></div>' +
      '<div class="field"><label for="f-cupos">Tickets (0 = sin límite)</label><input id="f-cupos" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.cupos, 0) + '"></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-part">Tickets ya vendidos (manual)</label><input id="f-part" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.participantes, 0) + '"></div>' +
      '<div class="field"><label for="f-max">Máx. tickets por persona (0 = sin límite)</label><input id="f-max" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.maxPorUsuario, 0) + '"></div>' +
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
    if (v("f-cupos") !== null) { p.cupos = num(v("f-cupos"), 0); var tk = tomados(p.id); if (p.cupos > 0 && p.cupos < tk) { p.cupos = tk; admin.msg = "Ya hay " + tk + " tickets tomados; el límite no puede ser menor."; admin.msgTipo = "err"; } }
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
      case "steamEntrar": steamIr(false); break;
      case "steamVincular": steamIr(true); break;
      case "entrar": ev.preventDefault(); cuenta.modo = "login"; cuenta.msg = ""; cuenta.msgTipo = ""; render(); break;
      case "registro": ev.preventDefault(); cuenta.modo = "registro"; cuenta.msg = t.getAttribute("data-need") ? "Para participar primero crea una cuenta en la página." : ""; cuenta.msgTipo = t.getAttribute("data-need") ? "err" : ""; render(); break;
      case "misRifas": cuenta.modo = "rifas"; cuenta.msg = ""; render(); cargarParts(); break;
      case "udropToggle": { var dd = t.closest(".udrop"), ab = !dd.classList.contains("open"); cerrarMenuUsuario(); if (ab) { dd.classList.add("open"); t.setAttribute("aria-expanded", "true"); } break; }
      case "misMovs": cuenta.msg = ""; location.hash = PF_RUTA.trans; break;
      case "miCuenta": cuenta.msg = ""; location.hash = PF_RUTA.info; break;
      case "pfClaveToggle": cuenta.claveAbierta = !cuenta.claveAbierta; render(); if (cuenta.claveAbierta) { var ka = document.getElementById("k-actual"); if (ka) ka.focus(); } break;
      case "txAbrir": { var kk = t.getAttribute("data-k"); cuenta.abiertos = cuenta.abiertos || {}; cuenta.abiertos[kk] = !cuenta.abiertos[kk]; render(); pfFiltrar(); break; }
      case "pfCrearClave": ev.preventDefault(); pfEnviarClave(); break;
      case "verFicha": var kf = t.getAttribute("data-key"); admin.fichaU = admin.fichaU === kf ? null : kf; admin.editU = null; admin.uMsg = ""; if (admin.fichaU && /^u_/.test(admin.fichaU)) cargarPedidosU(admin.fichaU.slice(2)); render(); break;
      case "editRapido": admin.fichaU = "u_" + t.getAttribute("data-uid"); admin.editU = t.getAttribute("data-uid"); admin.uMsg = ""; render(); break;
      case "cantPart": var xq = (partes[t.getAttribute("data-id")] || []).filter(function (y) { return y.uid === t.getAttribute("data-uid"); })[0]; if (xq) guardarCantidad(t.getAttribute("data-id"), xq.uid, xq.cantidad + Number(t.getAttribute("data-d"))); break;
      case "relMov": var rf = t.closest(".ofr").querySelector(".rel-fila"); if (rf) rf.scrollBy({ left: Number(t.getAttribute("data-d")) * Math.max(220, rf.clientWidth * 0.8), behavior: "smooth" }); break;
      case "itTipo": filtros.tipo = t.getAttribute("data-v") || ""; filtros.pag = 0; render(); sincHash(); break;
      case "itQuitar": var kq = t.getAttribute("data-k"); if (kq === "precio") { filtros.min = ""; filtros.max = ""; } else if (kq && filtros.hasOwnProperty(kq)) filtros[kq] = ""; filtros.pag = 0; render(); sincHash(); break;
      case "itReset": avisoNuevoItem = false; filtros = { q: "", min: "", max: "", tipo: "", heroe: "", ranura: "", rareza: "", calidad: "", orden: "mayor", pag: 0 }; render(); sincHash(); break;
      case "itPag": filtros.pag = Math.max(0, Number(t.getAttribute("data-p")) || 0); pintarItems(); var gp = document.getElementById("itemsGrid"); if (gp && gp.scrollIntoView) gp.scrollIntoView({ block: "start", behavior: "smooth" }); break;
      case "stRefrescar": steamRefrescar(); break;
      case "irSteam": break; // el enlace se abre solo; no abre la ficha del item
      case "itVer": location.hash = "item/" + encodeURIComponent(t.getAttribute("data-id")); break;
      case "stkEd": var rEd = t.closest(".stk-row"); if (rEd) stkEdAbrir(rEd.getAttribute("data-id")); break;
      case "stkEdCerrar": stk.ed = null; pintarStock(); break;
      case "stkEdGuardar": stkEdGuardar(); break;
      case "stkQuitarFoto": if (stk.ed) { stk.ed.F.img = ""; pintarStock(); } break;
      case "stkGemaMas": if (stk.ed) { var g1 = gemasDe(stk.ed.F); g1.push({ t: t.getAttribute("data-t") || "", v: "" }); stk.ed.F.descripcion = gemasAString(g1); pintarStock(); } break;
      case "stkGemaDel": if (stk.ed) { var g2 = gemasDe(stk.ed.F); g2.splice(parseInt(t.getAttribute("data-i"), 10), 1); stk.ed.F.descripcion = gemasAString(g2); pintarStock(); } break;
      case "stkAbrir": modal = { tipo: "stock" }; stk.msg = ""; stk.ed = null; render(); break;
      case "stkReset": stk = { q: "", tipo: "", heroe: "", ranura: "", rareza: "", calidad: "", estado: "all", orden: "nombre", pag: 0, msg: "" }; render(); break;
      case "stkPag": stk.pag = Math.max(0, Number(t.getAttribute("data-p")) || 0); pintarStock(); var dsk = document.querySelector(".elegir.stkp"); if (dsk) dsk.scrollTop = 0; break;
      case "stkMas": case "stkMenos": var rsk = t.closest(".stk-row"), isk = rsk && itemPorId(rsk.getAttribute("data-id")); if (isk) stkCambiar(isk, isk.stock + (a === "stkMas" ? 1 : -1)); break;
      case "itWsp":
        var iw = itemPorId(t.getAttribute("data-id")), cw = contactos();
        if (iw && cw.length > 1) { modal = null; elegirMsg = mensajeItem(iw); elegirAbierto = true; render(); }
        else if (iw && cw.length === 1) window.open(waLinkA(cw[0].numero, mensajeItem(iw)), "_blank", "noopener");
        break;
      case "venVer": verInventario(); break;
      case "venTipo": ven.f.tipo = t.getAttribute("data-v") || ""; render(); hidratarImgs(); break;
      case "venReset": ven.f = { tipo: "", heroe: "", ranura: "", rareza: "", calidad: "", min: "", max: "", orden: "mayor" }; ven.q = ""; render(); hidratarImgs(); break;
      case "venMio": if (cuenta.perfil) { ven.link = cuenta.perfil.tradelink || ""; render(); } break;
      case "venMas": var gm = ven.lista && ven.lista[Number(t.getAttribute("data-i"))]; if (gm) { ven.sel[gm.k] = Math.min(gm.n, (ven.sel[gm.k] || 0) + 1); render(); hidratarImgs(); } break;
      case "venMenos": var gn = ven.lista && ven.lista[Number(t.getAttribute("data-i"))]; if (gn) { ven.sel[gn.k] = Math.max(0, (ven.sel[gn.k] || 0) - 1); render(); hidratarImgs(); } break;
      case "venWsp":
        var cv = contactos();
        if (cv.length > 1) { modal = null; elegirMsg = mensajeVenta(); elegirAbierto = true; render(); }
        else if (cv.length === 1) window.open(waLinkA(cv[0].numero, mensajeVenta()), "_blank", "noopener");
        break;
      case "cpGuardar": case "cpBulk": case "cpEditar": case "cpCancelar": case "cpBorrar": case "cpBorrarSi": accionCompras(a, t); break;
      case "carAdd": if (carroAgregar(t.getAttribute("data-id"))) render(); break;
      case "carAhora": if (carroAgregar(t.getAttribute("data-id"))) { modal = { tipo: "carrito" }; render(); } break;
      case "carAbrir": cargarItems(); modal = { tipo: "carrito" }; render(); break;
      case "carMas": carroAgregar(t.getAttribute("data-id")); render(); break;
      case "carMenos": var cid = t.getAttribute("data-id"); if ((carro[cid] || 0) > 1) carro[cid]--; else delete carro[cid]; carroGuardar(); render(); break;
      case "carQuitar": delete carro[t.getAttribute("data-id")]; carroGuardar(); render(); break;
      case "carVaciar": carro = {}; carroGuardar(); render(); break;
      case "carCred": pagarCarro(); break;
      case "carWsp":
        var ccw = contactos();
        if (ccw.length > 1) { modal = null; elegirMsg = mensajeCarro(); elegirAbierto = true; render(); }
        else if (ccw.length === 1) window.open(waLinkA(ccw[0].numero, mensajeCarro()), "_blank", "noopener");
        break;
      case "itCred": comprarItemCreditos(t.getAttribute("data-id")); break;
      case "impAbrir": impEstado().abierto = true; render(); break;
      case "impCerrar": impEstado().abierto = false; render(); break;
      case "impTraer": impTraer(); break;
      case "impTodos": case "impNinguno": var Ie = impEstado(); var onT = t.getAttribute("data-a") === "impTodos"; Ie.sel = {}; Ie.selR = {}; (Ie.lista || []).forEach(function (g, k) { Ie.sel[k] = onT; }); (Ie.repo || []).forEach(function (r, k) { Ie.selR[k] = onT; }); render(); hidratarImgs(); break;
      case "impSubir": impSubir(); break;
      case "itNuevo": admin.itemForm = nuevoItemForm(); admin.itemMsg = ""; admin.steamInfo = ""; render(); irAlForm(); break;
      case "itEditar": var ie = itemPorId(t.getAttribute("data-id")); if (ie) { var sep = t.getAttribute("data-u") === "1" && ie.stock > 1; admin.itemForm = Object.assign({}, ie, { precio: String(ie.precio), stock: sep ? "1" : String(ie.stock), estilos: String(ie.estilos || 0), estOk: ie.estOk || (ie.estilos ? "1" : "") }, sep ? { id: "", creado: "", desdeId: ie.id } : {}); admin.itemMsg = sep ? "Estás editando solo esta unidad: se guarda aparte con su propio precio y gemas, y las demás unidades no cambian." : ""; render(); hidratarImgs(); irAlForm(); } break;
      case "itCerrarForm": admin.itemForm = null; admin.itemMsg = ""; render(); break;
      case "itGemaMas": if (admin.itemForm) { var gl2 = gemasDe(admin.itemForm); gl2.push({ t: t.getAttribute("data-t") || "", v: "" }); admin.itemForm.descripcion = gemasAString(gl2); render(); hidratarImgs(); } break;
      case "itGemaDel": if (admin.itemForm) { var gl3 = gemasDe(admin.itemForm); gl3.splice(parseInt(t.getAttribute("data-i"), 10), 1); admin.itemForm.descripcion = gemasAString(gl3); render(); hidratarImgs(); } break;
      case "itVariante": if (admin.itemForm) { var fv = Object.assign({}, admin.itemForm, { id: "", precio: "", stock: "1", descripcion: "", creado: "", steamAct: admin.itemForm.steamAct }); admin.itemForm = fv; admin.itemMsg = "Versión nueva: pon su gema y su precio."; render(); hidratarImgs(); irAlForm(); } break;
      case "itQuitarFoto": if (admin.itemForm) { admin.itemForm.img = ""; render(); } break;
      case "itGuardar": guardarItem(); break;
      case "itSteam": rellenarDesdeSteam(); break;
      case "itMas1": cambiarStock(t.getAttribute("data-id"), 1); break;
      case "itVersion": var ib = itemPorId(t.getAttribute("data-id")); if (ib) abrirVersion(ib); break;
      case "itCompleto": if (admin.itemForm) { admin.itemForm.soloCambios = false; render(); hidratarImgs(); } break;
      case "itQuitar1": admin.itemDel = t.getAttribute("data-id"); render(); break;
      case "itQuitarSi": quitarUnidad(t.getAttribute("data-id")); break;
      case "itBorrar": admin.itemDel = t.getAttribute("data-id"); render(); break;
      case "itBorrarSi": borrarItem(t.getAttribute("data-id")); break;
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
      case "pagarEfectivo": if (modal && modal.tipo === "recarga" && modal.sel) iniciarEfectivo(modal.sel); break;
      case "refrescarSaldo": cargarPerfil().then(function () { render(); }); break;
      case "yape": if (modal && modal.tipo === "recarga" && modal.sel) { modal = { tipo: "yape", sel: modal.sel }; render(); hidratarImgs(); } break;
      case "volverRecarga": if (modal && modal.tipo === "yape") { modal = { tipo: "recarga", sel: modal.sel }; render(); } break;
      case "yapeBajar": bajarQr(document.querySelector(".yapeqr img")); break;
      case "yapeAvisar":
        if (modal && modal.tipo === "yape") {
          montoWsp = modal.sel; var hy = creditoHref();
          if (hy === "#elegir") { modal = null; elegirMsg = null; elegirAbierto = true; render(); }
          else { montoWsp = 0; if (hy) window.open(hy, "_blank", "noopener"); }
        } break;
      case "recargaWsp":
        if (modal && modal.tipo === "recarga" && modal.sel) {
          montoWsp = modal.sel; var hw = creditoHref();
          if (hw === "#elegir") { modal = null; elegirMsg = null; elegirAbierto = true; render(); }
          else { montoWsp = 0; if (hw) window.open(hw, "_blank", "noopener"); }
        } break;
      case "confirmarPart": confirmarPart(); break;
      case "zoomImg": var zim = t.querySelector("img"); if (zim && zim.getAttribute("src")) abrirZoom(zim.getAttribute("src"), zim.getAttribute("alt") || ""); break;
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
      case "elegir": ev.preventDefault(); modal = null; elegirMsg = null; elegirAbierto = true; render(); break;
      case "cerrarElegir": elegirMsg = null; elegirAbierto = false; montoWsp = 0; render(); break;
      case "editContactos": admin.abierto = true; admin.tab = "pagina"; render(); break;
      case "quitarGan": var kg = buscarPremio(t.getAttribute("data-id")); if (kg >= 0) { estado.premios[kg].ganador = ""; estado.premios[kg].ganadorUid = ""; estado.premios[kg].resultado = ""; delete estado.premios[kg].replay; marcarSucio(); render(); } break;
      case "probarCorreos": probarCorreos(); break;
      case "quitarFoto": estado.contactos[i].foto = ""; marcarSucio(); render(); break;
      case "cerrarCuenta": quitarHash(); cuenta.modo = null; render(); break;
      case "cred": var uu = (admin.usuarios || []).filter(function (x) { return x.uid === t.getAttribute("data-uid"); })[0]; if (uu && !uu.guardando) guardarCreditos(uu.uid, uu.creditos + Number(t.getAttribute("data-d"))); break;
      case "pedAbrir": var pid = t.getAttribute("data-id"); admin.pedAbierto = admin.pedAbierto === pid ? null : pid; render(); break;
      case "pedFiltro": admin.pedFiltro = t.getAttribute("data-f"); render(); break;
      case "pedRecargar": admin.pedidos = null; render(); break;
      case "recargarU": admin.usuarios = null; render(); break;
      case "cerrar": leerForm(); quitarHash(); admin.abierto = false; admin.editando = null; render(); break;
      case "tab": admin.tab = t.getAttribute("data-t"); render(); break;
      case "uAbrir": var uu = t.getAttribute("data-uid"); admin.uAbierto = admin.uAbierto === uu ? null : uu; render(); break;
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
      case "yapeQuitar": estado.yape = estado.yape || {}; estado.yape.qr = ""; marcarSucio(); render(); break;
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
      case "salir": guardarSesion(null); admin.puede = false; admin.abierto = false; admin.vivo = false; admin.usuarios = null; admin.pedidos = null; cuenta.perfil = null; cuenta.modo = null; estado = clone(publicado); sucio = false; render(); break;
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
  function formItemEvento(el) {
    var F = admin.itemForm; if (!F || !el.id || el.id.indexOf("it-") !== 0) return false;
    var m = { "it-link": "link", "it-nombre": "nombre", "it-precio": "precio", "it-stock": "stock", "it-tipo": "tipo", "it-heroe": "heroe", "it-ranura": "ranura", "it-desc": "descripcion", "it-rareza": "rareza", "it-calidad": "calidad" };
    if (el.id === "it-activo") { F.activo = el.checked; return true; }
    if (el.id === "it-estilos") {
      F.estilos = el.value;
      var nn = Number(el.value) || 0, oks = estilosOkLista(F).filter(function (x) { return x <= nn; });
      if (nn > 0 && !oks.length) oks = [1];
      F.estOk = oks.join(",");
      render(); return true;
    }
    if (/^it-est-\d+$/.test(el.id)) {
      var num = parseInt(el.id.slice(7), 10), cur = estilosOkLista(F), pos = cur.indexOf(num);
      if (el.checked && pos < 0) cur.push(num); else if (!el.checked && pos >= 0) cur.splice(pos, 1);
      cur.sort(function (a, b) { return a - b; }); F.estOk = cur.join(","); return true;
    }
    var mg = /^it-g([tv])-(\d+)$/.exec(el.id);
    if (mg) { var gl = gemasDe(F), gi = parseInt(mg[2], 10); if (gl[gi]) { gl[gi][mg[1]] = el.value; F.descripcion = gemasAString(gl); } return true; }
    if (m[el.id]) { F[m[el.id]] = el.value; return true; }
    return false;
  }
  document.addEventListener("input", function (ev) {
    if (filtroEvento(ev.target) || stockEvento(ev.target, ev.type) || formItemEvento(ev.target) || ventaEvento(ev.target)) return;
    if (ev.target.closest && ev.target.closest("[data-edit]")) { aplicarEdicion(ev.target.closest("[data-edit]")); return; }
    if (ev.target.id === "pf-buscar") { cuenta.tBuscar = ev.target.value; pfFiltrar(); return; }
    if (ev.target.id === "u-buscar") {
      admin.uFiltro = ev.target.value;
      var pos = ev.target.selectionStart; render();
      var nb = document.getElementById("u-buscar"); if (nb) { nb.focus(); try { nb.setSelectionRange(pos, pos); } catch (e2) { /* nada */ } }
      return;
    }
    var t = ev.target;
    if (t.classList && t.classList.contains("y-num")) { estado.yape = estado.yape || {}; estado.yape.numero = t.value.replace(/\D+/g, "").slice(0, 12); marcarSucio(); actualizarPie(); }
    if (t.classList && t.classList.contains("y-nom")) { estado.yape = estado.yape || {}; estado.yape.nombre = t.value.slice(0, 40); marcarSucio(); actualizarPie(); }
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
    if (ev.target.id === "pf-tipo") { cuenta.tTipo = ev.target.value; pfFiltrar(); return; }
    if (ev.target.id === "it-nombre" && admin.itemForm && !admin.itemForm.id && !admin.itemForm.soloCambios) { admin.itemForm.nombre = ev.target.value; render(); hidratarImgs(); return; }
    if (filtroEvento(ev.target) || stockEvento(ev.target, ev.type) || formItemEvento(ev.target) || ventaEvento(ev.target)) return;
    if (ev.target.id === "sk-file" && ev.target.files && ev.target.files[0]) { stkFoto(ev.target); return; }
    if (ev.target.classList && ev.target.classList.contains("itfile") && ev.target.files && ev.target.files[0]) {
      var fi = ev.target.files[0]; ev.target.value = "";
      editorFoto(fi).then(function (listo) {
        if (!listo) return;
        admin.subiendo = "item"; admin.itemMsg = ""; render();
        return subirImagen(listo, 640).then(function (ref) { if (admin.itemForm) admin.itemForm.img = ref; admin.subiendo = null; render(); hidratarImgs(); });
      }).catch(function (e) { admin.subiendo = null; admin.itemMsg = (e && e.message) || "No se pudo subir la foto."; render(); });
      return;
    }
    if (ev.target.id === "f-hasta") { var fc = document.getElementById("f-cierre"); if (fc) { fc.disabled = ev.target.checked; if (ev.target.checked) fc.value = ""; } return; }
    if (ev.target.getAttribute && ev.target.getAttribute("data-a") === "pedEstado") { cambiarEstadoPedido(ev.target.getAttribute("data-id"), ev.target.value); return; }
    if (ev.target.classList && ev.target.classList.contains("credset")) { guardarCreditos(ev.target.getAttribute("data-uid"), Number(ev.target.value) || 0); return; }
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
    if (tc.classList && tc.classList.contains("yapefile") && tc.files && tc.files[0]) {
      admin.subiendo = "yape"; admin.imgErr = ""; render();
      subirImagen(tc.files[0], 900).then(function (ref) {
        estado.yape = estado.yape || {}; estado.yape.qr = ref; marcarSucio(); admin.subiendo = null; render();
      }).catch(function (e) { admin.subiendo = null; admin.imgErr = (e && e.message) || "No se pudo subir la imagen."; render(); });
      return;
    }
    if (tc.classList && tc.classList.contains("c-rifas")) { estado.secciones = { items: !!estado.secciones.items, rifas: tc.checked }; marcarSucio(); render(); return; }
    if (tc.classList && tc.classList.contains("c-items")) { estado.secciones = { items: tc.checked, rifas: estado.secciones.rifas !== false }; marcarSucio(); render(); return; }
    if (tc.classList && tc.classList.contains("c-items2")) { estado.secciones = { items: tc.checked, rifas: estado.secciones.rifas !== false }; marcarSucio(); publicar(); return; }
    if (tc.classList && tc.classList.contains("c-pagos")) { estado.pagos = { culqi: tc.checked }; marcarSucio(); render(); return; }
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
    cuenta.modo = null; cuenta.pfPedido = false; render(); cargarPerfil();
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
      var stm = leerSteam("p-steam", val);
      if (!stm) { msgEl.style.color = "var(--danger)"; msgEl.textContent = stm === null ? "Tu ID de Steam son solo números (ej. 123456789) o el link de tu perfil." : "Escribe tu ID de Steam (código de amigo)."; return; }
      msgEl.style.color = ""; msgEl.textContent = "Guardando…";
      fsPedir("rayas_users/" + encodeURIComponent(uidSesion()) + "?updateMask.fieldPaths=nombre&updateMask.fieldPaths=whatsapp&updateMask.fieldPaths=tradelink&updateMask.fieldPaths=steam&currentDocument.exists=true", {
        method: "PATCH", body: JSON.stringify({ fields: { nombre: { stringValue: nom }, whatsapp: { stringValue: wa }, tradelink: { stringValue: val }, steam: { stringValue: stm } } })
      }).then(function (r) {
        if (!r.ok) throw new Error("Error " + r.status);
        if (cuenta.perfil) { cuenta.perfil.nombre = nom; cuenta.perfil.whatsapp = wa; cuenta.perfil.tradelink = val; cuenta.perfil.steam = stm; }
        render(); var m2 = document.getElementById("tradeMsg"); if (m2) { m2.style.color = "var(--ok)"; m2.textContent = "✔ Cambios guardados."; }
      }).catch(function (e) { msgEl.style.color = "var(--danger)"; msgEl.textContent = "No se pudo guardar (" + e.message + ")."; });
    } else if (ev.target.id === "formClave") {
      ev.preventDefault();
      var kA = document.getElementById("k-actual").value, kN = document.getElementById("k-nueva").value, kR = document.getElementById("k-repite").value, kM = document.getElementById("claveMsg");
      if (kN.length < 6) { kM.style.color = "var(--danger)"; kM.textContent = "La contraseña nueva debe tener al menos 6 caracteres."; return; }
      if (kN !== kR) { kM.style.color = "var(--danger)"; kM.textContent = "Las dos contraseñas nuevas no coinciden."; return; }
      if (kN === kA) { kM.style.color = "var(--danger)"; kM.textContent = "La contraseña nueva debe ser distinta de la actual."; return; }
      kM.style.color = ""; kM.textContent = "Cambiando…";
      pfCambiarClave(kA, kN).then(function () {
        cuenta.claveAbierta = false; cuenta.msg = "✔ Contraseña cambiada. Úsala la próxima vez que entres."; cuenta.msgTipo = "ok"; render();
      }).catch(function (e) {
        var k3 = document.getElementById("claveMsg"); if (!k3) return; k3.style.color = "var(--danger)";
        k3.textContent = /INVALID_PASSWORD|INVALID_LOGIN|CREDENTIAL/.test(String(e && e.message)) ? "La contraseña actual no es correcta." : errAuth(e && e.message);
      });
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
      dc.steam = leerSteam("c-steam", dc.tradelink);
      if (!dc.steam) { avisoSteam("c-steam", dc.steam); return; }
      var sc = ev.target.querySelector('[role="status"]'); if (sc) { sc.style.color = ""; sc.textContent = "Guardando…"; }
      crearPerfil(ses, dc).then(function () {
        cuenta.perfil = { uid: ses.uid, nombre: dc.nombre, whatsapp: dc.whatsapp, email: dc.email, tradelink: dc.tradelink, steam: dc.steam, creditos: 0 };
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
      datos.steam = leerSteam("r-steam", datos.tradelink);
      if (!datos.steam) { avisoSteam("r-steam", datos.steam); return; }
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
        cuenta.perfil = { uid: uidSesion(), nombre: datos.nombre, whatsapp: datos.whatsapp, email: datos.email, tradelink: datos.tradelink, steam: datos.steam, creditos: 0 };
        cuenta.modo = "perfil"; cuenta.msg = ""; render();
      }).catch(function (e) {
        var m = String(e && e.message || "");
        cuenta.msg = /^PERFIL_/.test(m) ? "Tu usuario se creó, pero no se pudo guardar tu perfil (" + m + "). Avísale al encargado." : (m === "EMAIL_EXISTS_PASS" ? "Ese correo ya tiene una cuenta (quizá de LitleJacob Store) y la contraseña no coincide. Entra con tu contraseña o recupérala con «¿Olvidaste tu contraseña?»." : errAuth(m));
        cuenta.msgTipo = "err";
        if (m === "EMAIL_EXISTS_PASS") { cuenta.modo = "login"; render(); var le = document.getElementById("l-email"); if (le) le.value = datos.email; return; }
        render();
        ["r-nombre", "r-wa", "r-email", "r-trade", "r-steam"].forEach(function (id, i) { var el = document.getElementById(id); if (el) el.value = [datos.nombre, datos.whatsapp, datos.email, datos.tradelink, datos.steam || ""][i]; });
      });
    }
  });

  function cargarPerfil() {
    var uid = uidSesion();
    if (!uid || esAdmin()) return Promise.resolve();
    return fsPedir("rayas_users/" + encodeURIComponent(uid)).then(function (r) {
      if (r.status === 404) { cuenta.modo = "completar"; cuenta.msg = ""; cuenta.msgTipo = ""; render(); return null; }
      if (!r.ok) throw new Error("No se pudo cargar tu cuenta. Revisa tu internet e intenta de nuevo.");
      return r.json();
    }).then(function (d) { if (!d) return; cuenta.perfil = leerPerfilDoc(d); cuenta.msg = ""; render(); cargarParts(); cargarMovs(); })
      .catch(function (e) {
        if (e && e.message === "NO_SESSION") { guardarSesion(null); cuenta.perfil = null; cuenta.modo = null; render(); return; }
        cuenta.msg = errSimple(e && e.message); render();
      });
  }

  document.addEventListener("keydown", function (ev) {
    var e = ev.target.closest && ev.target.closest("[data-edit]");
    if (e && ev.key === "Enter") { ev.preventDefault(); e.blur(); return; }
    if (ev.key !== "Escape") return;
    if (e) { e.blur(); return; }
    if (admin.itemForm && !admin.itemGuardando) { admin.itemForm = null; admin.itemMsg = ""; render(); return; }
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
    for (var k = 0; k < els.length; k++) {
      var tx = els[k].querySelector(".tx") || els[k], ms = tiempoDe(els[k].getAttribute("data-cierre")) - Date.now();
      tx.textContent = restante(els[k].getAttribute("data-cierre")); els[k].classList.toggle("urg", ms > 0 && ms < 86400000);
    }
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
  function irASeccion() {
    var h = String(location.hash || "").replace("#", "");
    if (/^item\//.test(h)) { vistaActual = "comprar"; cargarItems(); render(); hidratarImgs(); window.scrollTo(0, 0); var iq = itemPorId(idItemHash()); document.title = iq ? iq.nombre + " • Rayas Store" : "Rayas Store"; return; }
    if (/^comprar\//.test(h)) { vistaActual = "comprar"; aplicarRutaCatalogo(); cargarItems(); render(); hidratarImgs(); window.scrollTo(0, 0); return; }
    if (h === "comprar" && vistaActual === "comprar") { filtros.tipo = ""; filtros.heroe = ""; filtros.pag = 0; }
    if (!VISTA_HASH[h]) return;
    var antes = vistaActual;
    if (/^perfil/.test(h)) { cuenta.msg = ""; cuenta.msgTipo = ""; cuenta.claveAbierta = false; }
    render();
    if (vistaActual === "perfil") { if (antes !== "perfil") window.scrollTo(0, 0); document.title = "Mi perfil • Rayas Store"; return; }
    if (antes === "perfil") document.title = "Rayas Store";
    var el = (h === "inicio" || h === "rifas" && antes !== vistaActual) ? null : document.getElementById(h);
    if (el) el.scrollIntoView(); else if (antes !== vistaActual || h === "inicio") window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", function () { revisarHash(); irASeccion(); });


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
        '<div class="promo-card" style="--promo-bg:url(img/art-sombra.jpg)"><div class="promo-brand"><img src="img/logo.webp" alt="" width="46" height="46"><span>RAYAS <i>STORE</i></span></div>' +
        '<div class="promo-kick">Promo de bienvenida</div><div class="promo-tit">Primera<br>recarga</div>' +
        '<div class="promo-pk"><div class="promo-p"><small>Recarga</small><b>S/ 50</b><u>▼</u><strong>S/ 55</strong><em>de saldo</em></div><div class="promo-p"><small>Recarga</small><b>S/ 100</b><u>▼</u><strong>S/ 110</strong><em>de saldo</em></div></div>' +
        '<div class="promo-pill">+10% de saldo extra</div><div class="promo-url">rayas.trade</div></div>' +
        '<div class="promo-acts">' + (recargaOn() ? '<button type="button" class="btn btn-yellow" id="promoPagar">Recargar ahora</button>'
          : (href ? '<a class="btn btn-yellow" id="promoCta" href="' + esc(href) + '"' + (href === "#elegir" ? '' : ' target="_blank" rel="noopener"') + '>Pedir saldo</a>' : '')) +
        '<button type="button" class="btn btn-ghost" id="promoNo">Ahora no</button></div></div>';
      document.body.appendChild(d);
      requestAnimationFrame(function () { d.classList.add("on"); });
      d.addEventListener("click", function (ev) {
        var t = ev.target;
        if (t === d || t.closest(".promo-x") || t.id === "promoNo") { cerrar(); return; }
        if (t.id === "promoPagar") { cerrar(); abrirRecarga(); return; }
        if (t.id === "promoCta") { cerrar(); if (href === "#elegir") { ev.preventDefault(); elegirMsg = null; elegirAbierto = true; render(); } else cerrar(); }
      });
      document.addEventListener("keydown", tecla);
    }
    setTimeout(mostrar, 900);
  })();
  aplicarRutaCatalogo();
  render();
  cargarRemoto();
  cargarParts();
  revisarHash();
  (function () { var h = String(location.hash || "").replace("#", ""); var el = (h === "como" || h === "ganadores" || h === "reglas") ? document.getElementById(h) : null; if (el) el.scrollIntoView(); })();
  if (!steamAlCargar() && leerSesion() && !admin.puede) cargarPerfil();
})();
