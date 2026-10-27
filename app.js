(function () {
  "use strict";

  /* ================= Firebase (mismo proyecto que LitleJacob Store) ================= */
  var FB = { apiKey: "AIzaSyDbyLi7IK3ikwUp7A0VzRRqPucqRXPpL3E", projectId: "litlejacob-store" };
  var DOC_URL = "https://firestore.googleapis.com/v1/projects/" + FB.projectId + "/databases/(default)/documents/rayas/estado";
  var SES_KEY = "rayas_admin_ses";

  function leerSesion() { try { return JSON.parse(localStorage.getItem(SES_KEY) || "null"); } catch (e) { return null; } }
  function guardarSesion(s) { try { if (s) localStorage.setItem(SES_KEY, JSON.stringify(s)); else localStorage.removeItem(SES_KEY); } catch (e) { /* sin almacenamiento */ } }

  function login(email, pass) {
    return fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(FB.apiKey), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: pass, returnSecureToken: true })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.idToken) throw new Error((j.error && j.error.message) || "LOGIN_FAILED");
      var s = { id: j.idToken, ref: j.refreshToken, exp: Date.now() + (Number(j.expiresIn) || 3600) * 1000 - 60000, email: j.email };
      guardarSesion(s); return s;
    });
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
    reglas: [
      "Los créditos son gratis. No se compran, no se venden y no tienen valor en dinero.",
      "Los créditos se entregan solo al comunicarte con el encargado de la página.",
      "El ganador se elige al azar cuando cierra la rifa y se anuncia en esta página.",
      "El item se entrega por Steam. El ganador debe tener su cuenta lista para recibir regalos.",
      "Si el ganador no responde en 48 horas, se elige a otro participante."
    ]
  };

  function normalizar(st) {
    st = st && typeof st === "object" ? st : {};
    if (typeof st.whatsapp !== "string") st.whatsapp = "";
    if (!Array.isArray(st.premios)) st.premios = [];
    var t = st.textos && typeof st.textos === "object" ? st.textos : {};
    st.textos = {
      titulo: typeof t.titulo === "string" && t.titulo.trim() ? t.titulo : TEXTOS_BASE.titulo,
      subtitulo: typeof t.subtitulo === "string" && t.subtitulo.trim() ? t.subtitulo : TEXTOS_BASE.subtitulo,
      reglas: Array.isArray(t.reglas) && t.reglas.length ? t.reglas.filter(function (x) { return typeof x === "string" && x.trim(); }) : TEXTOS_BASE.reglas.slice()
    };
    return st;
  }

  var publicado = normalizar(null);
  try {
    var raw = document.getElementById("estado");
    if (raw) publicado = normalizar(JSON.parse(raw.textContent || "{}"));
  } catch (e) { /* estado por defecto */ }
  var estado = clone(publicado);
  var sucio = false;

  var admin = { puede: !!leerSesion(), vivo: false, imgEdit: null, login: false, abierto: false, tab: "premios", editando: null, borrar: null, msg: "", msgTipo: "" };

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

  function waLink(texto) {
    var n = soloDigitos(estado.whatsapp);
    return n ? "https://wa.me/" + n + "?text=" + encodeURIComponent(texto) : "";
  }
  function waBonito(n) {
    n = soloDigitos(n);
    if (!n) return "";
    if (n.length === 11 && n.indexOf("51") === 0) return "+51 " + n.slice(2, 5) + " " + n.slice(5, 8) + " " + n.slice(8);
    return "+" + n;
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
  function buscarPremio(id) {
    for (var k = 0; k < estado.premios.length; k++) if (estado.premios[k].id === id) return k;
    return -1;
  }
  var ESTADOS = ["activa", "proxima", "cerrada"];
  var LISTA_RAREZAS = ["", "ARCANO", "INMORTAL", "LEGENDARIO", "MÍTICO", "RARO", "POCO COMÚN", "COMÚN"];

  /* ================= Vista pública ================= */
  function tarjeta(p) {
    var img = safeImg(p.img);
    var est = p.estado === "proxima" ? "proxima" : (p.estado === "cerrada" ? "cerrada" : "activa");
    var estTxt = est === "activa" ? "Abierta" : (est === "proxima" ? "Próximamente" : "Cerrada");
    var cupos = num(p.cupos, 0), part = num(p.participantes, 0), cred = num(p.creditos, 0);
    var partTxt = cupos > 0 ? (part + " / " + cupos + " cupos") : (part + (part === 1 ? " participante" : " participantes"));
    var lleno = cupos > 0 && part >= cupos;
    var link = waLink("Hola, quiero participar en la rifa de " + p.nombre + " (" + cred + " créditos).");
    var boton;
    if (est === "activa") {
      boton = link && !lleno
        ? '<a class="btn btn-yellow" href="' + esc(link) + '" target="_blank" rel="noopener">Participar</a>'
        : '<button class="btn btn-yellow" type="button" disabled>' + (lleno ? "Cupos llenos" : "Participar") + '</button>';
    } else if (est === "proxima") {
      boton = '<button class="btn btn-ghost" type="button" disabled>Muy pronto</button>';
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
      ? '<form class="imgform" data-id="' + id + '"><label for="img-' + id + '">Link de la imagen</label><input id="img-' + id + '" inputmode="url" placeholder="https://…" value="' + esc(p.img) + '"><div><button class="btn btn-yellow btn-sm" type="submit">Usar</button> <button class="btn btn-ghost btn-sm" type="button" data-a="imgCancel">Cancelar</button></div></form>'
      : (V ? '<button type="button" class="imgbtn" data-a="imgEdit" data-id="' + id + '">Cambiar imagen</button>' : '');
    return '<article class="card frame' + (V ? ' editing' : '') + '" style="--r:' + colorRareza(p.rareza) + '"><div class="in">' +
      '<div class="rbar"></div>' + tools +
      (img ? '<div class="pic"><img src="' + esc(img) + '" alt="' + esc(p.nombre) + '" loading="lazy">'
           : '<div class="pic noimg"><span class="q">?</span>') +
      (V ? '<button type="button" class="status ' + est + '" data-a="ciclarEstado" data-id="' + id + '" title="Clic para cambiar el estado">' + estTxt + ' ⟳</button>'
         : '<span class="status ' + est + '">' + estTxt + '</span>') + picInner + '</div>' +
      '<div class="body">' +
      (V ? '<button type="button" class="rarity rbtn" data-a="ciclarRareza" data-id="' + id + '" title="Clic para cambiar la rareza">' + esc(p.rareza || "Sin rareza") + ' ⟳</button>'
         : (p.rareza ? '<div class="rarity">' + esc(p.rareza) + '</div>' : '')) +
      '<h3' + ed("p:" + p.id + ":nombre", "Nombre del premio") + '>' + esc(V ? p.nombre : (p.nombre || "Premio")) + '</h3>' +
      (p.descripcion || V ? '<p class="desc"' + ed("p:" + p.id + ":descripcion", "Descripción (opcional)") + '>' + esc(p.descripcion) + '</p>' : '') +
      '<div class="meta"><span class="cost"><b' + ed("p:" + p.id + ":creditos", "0") + '>' + cred + '</b><small>créditos</small></span><span class="pill">' + partTxt + '</span></div>' +
      (est === "activa" && p.cierre ? '<div class="timer" data-cierre="' + esc(p.cierre) + '">' + esc(restante(p.cierre)) + '</div>' : '') +
      (est === "proxima" && p.cierre ? '<div class="pill">Cierra el ' + esc(fechaCorta(p.cierre)) + '</div>' : '') +
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
    var linkCreditos = waLink("Hola, quiero mis créditos gratis para las rifas de Rayas Store.");
    var wa = waBonito(estado.whatsapp);
    var T = estado.textos;

    var html = '' +
      '<header class="topbar gutter"><div class="wrap">' +
      '<a class="logo" href="#inicio">RAYAS <i>STORE</i></a>' +
      '<nav class="nav"><a class="navlink" href="#rifas">Rifas</a><a class="navlink" href="#como">Cómo participar</a><a class="navlink" href="#ganadores">Ganadores</a><a class="navlink" href="#reglas">Reglas</a>' +
      '<button class="lock" type="button" data-a="admin">' + (admin.puede ? "Panel admin" : "Admin") + '</button>' +
      '</nav></div></header>' +

      '<section class="hero gutter" id="inicio"><div class="wrap">' +
      '<div class="kicker">Rifas de Dota 2</div>' +
      (vivo() ? '<h1' + ed("t:titulo", "Título") + '>' + esc(T.titulo) + '</h1>' : '<h1>' + tituloHtml(T.titulo) + '</h1>') +
      '<p' + ed("t:subtitulo", "Texto debajo del título") + '>' + esc(T.subtitulo) + '</p>' +
      '<div class="actions"><a class="btn btn-yellow" href="#rifas">Ver rifas</a>' +
      (linkCreditos ? '<a class="btn btn-fuchsia" href="' + esc(linkCreditos) + '" target="_blank" rel="noopener">Pedir créditos gratis</a>' : '') +
      '</div>' +
      '<div class="badges"><span class="badge"><b>◆</b>Créditos gratis</span><span class="badge"><b>◆</b>Ganador al azar</span><span class="badge"><b>◆</b>Entrega por Steam</span></div>' +
      '</div></section>' +

      '<section class="section gutter" id="rifas"><div class="wrap">' +
      secTitle("Premios en juego", 'Rifas <span>activas</span>', "Cada premio indica cuántos créditos cuesta entrar.") +
      (visibles.length || vivo()
        ? '<div class="grid">' + visibles.map(tarjeta).join("") +
          (vivo() ? '<button type="button" class="addcard" data-a="nuevoVivo"><span>+</span>Agregar premio</button>' : '') + '</div>'
        : '<div class="empty frame"><div class="in"><strong>Pronto nuevas rifas</strong>Pide tus créditos y te avisamos cuando abra la próxima.</div></div>') +
      '</div></section>' +

      '<section class="band lava gutter" id="como"><div class="wrap">' +
      secTitle("Paso a paso", 'Cómo <span>participar</span>') +
      '<div class="steps">' +
      '<div class="step frame"><div class="in"><span class="n">1</span><h3>Escríbenos</h3><p>Manda un mensaje al encargado por WhatsApp con tu nombre o usuario de Steam.</p></div></div>' +
      '<div class="step frame"><div class="in"><span class="n">2</span><h3>Recibe créditos</h3><p>El encargado te da créditos gratis. No se compran ni tienen valor en dinero.</p></div></div>' +
      '<div class="step frame"><div class="in"><span class="n">3</span><h3>Entra a la rifa</h3><p>Elige el premio y usa tus créditos. Al cierre, el ganador sale al azar.</p></div></div>' +
      '</div>' +
      (linkCreditos ? '<div style="text-align:center;margin-top:30px"><a class="btn btn-fuchsia" href="' + esc(linkCreditos) + '" target="_blank" rel="noopener">Pedir mis créditos</a></div>' : '') +
      '</div></section>' +

      '<section class="band sombra gutter" id="ganadores"><div class="wrap">' +
      secTitle("Salón de la fama", '<span>Ganadores</span>') +
      (vivo() && cerradas.length ? '<p class="hint" style="text-align:center;margin:-10px 0 18px">Rifas cerradas: escribe el ganador en cada tarjeta.</p><div class="grid">' + cerradas.map(tarjeta).join("") + '</div>' :
       cerradas.length
        ? '<div class="winners">' + cerradas.map(function (p) {
            var img = safeImg(p.img);
            return '<div class="winner frame"><div class="in"><div class="thumb">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') + '</div>' +
              '<div class="who"><b>' + esc(p.ganador || "Por anunciar") + '</b><span>' + esc(p.nombre) + (p.cierre ? ' · ' + esc(fechaCorta(p.cierre)) : '') + '</span></div>' +
              (p.ganador ? '<span class="crown">GANÓ</span>' : '') + '</div></div>';
          }).join("") + '</div>'
        : '<div class="empty frame"><div class="in"><strong>Aún no hay ganadores</strong>Cuando cierre la primera rifa, el ganador aparecerá aquí.</div></div>') +
      '</div></section>' +

      '<section class="section gutter" id="reglas"><div class="wrap" style="max-width:820px">' +
      secTitle("Juego limpio", 'Reglas') +
      '<div class="rules frame gold"><div class="in"><ul>' + T.reglas.map(function (r, k) {
        return '<li><span' + ed("r:" + k, "Escribe la regla") + '>' + esc(r) + '</span>' +
          (vivo() ? '<button type="button" class="rdel" data-a="borrarRegla" data-i="' + k + '" title="Quitar regla" aria-label="Quitar regla">✕</button>' : '') + '</li>';
      }).join("") + '</ul>' +
      (vivo() ? '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:16px" data-a="nuevaRegla">+ Agregar regla</button>' : '') +
      '</div></div>' +
      '</div></section>' +

      '<footer class="footer gutter"><div class="wrap">' +
      '<span class="logo">RAYAS <i>STORE</i></span>' +
      (vivo() ? '<span>WhatsApp: <span class="wa"' + ed("w:whatsapp", "51987654321") + '>' + esc(soloDigitos(estado.whatsapp)) + '</span></span>'
              : (wa ? '<span>WhatsApp: <span class="wa">' + esc(wa) + '</span></span>' : '')) +
      '<span>No afiliado a Valve. Dota 2 es una marca de Valve Corporation.</span>' +
      '</div></footer>';

    if (admin.puede && !admin.abierto) html += barraEdicion();
    if (admin.puede && admin.abierto) html += '<div class="scrim" data-a="cerrar"></div>' + panelAdmin();
    if (!admin.puede && admin.login) html += '<div class="scrim" data-a="cerrarLogin"></div>' + panelLogin();

    var scrollDrawer = document.querySelector(".drawer-body");
    var top = scrollDrawer ? scrollDrawer.scrollTop : 0;
    app.innerHTML = html;
    document.body.classList.toggle("vivo", vivo());
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

  function panelLogin() {
    return '<aside class="drawer" role="dialog" aria-label="Acceso de administrador">' +
      '<div class="drawer-head"><h2>Acceso admin</h2><button class="btn btn-ghost btn-sm" type="button" data-a="cerrarLogin">Cerrar</button></div>' +
      '<form class="drawer-body form" id="formLogin">' +
      '<div class="field"><label for="l-email">Correo</label><input id="l-email" type="email" autocomplete="username" required></div>' +
      '<div class="field"><label for="l-pass">Contraseña</label><input id="l-pass" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn btn-yellow" type="submit">Entrar</button>' +
      '<p class="hint" role="status"' + (admin.msgTipo === "err" ? ' style="color:var(--danger)"' : '') + '>' + esc(admin.msg || "Usa la misma cuenta de administrador de LitleJacob Store.") + '</p>' +
      '</form></aside>';
  }

  function panelAdmin() {
    var titulo = admin.editando ? (admin.editando.nuevo ? "Nuevo premio" : "Editar premio") : "Panel admin";
    var cuerpo;
    if (admin.editando) cuerpo = formPremio();
    else cuerpo = '<div class="tabs" role="tablist">' +
      '<button class="tab" role="tab" type="button" data-a="tab" data-t="premios" aria-selected="' + (admin.tab === "premios") + '">Premios</button>' +
      '<button class="tab" role="tab" type="button" data-a="tab" data-t="pagina" aria-selected="' + (admin.tab === "pagina") + '">Textos y WhatsApp</button>' +
      '</div>' + (admin.tab === "pagina" ? tabPagina() : listaPremios());
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

  function listaPremios() {
    var items = estado.premios.map(function (p, i) {
      var img = safeImg(p.img);
      var est = p.estado === "proxima" ? "Próximamente" : (p.estado === "cerrada" ? "Cerrada" : "Abierta");
      return '<div class="aitem"><div class="th">' + (img ? '<img src="' + esc(img) + '" alt="">' : '') + '</div>' +
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
      '<p class="hint">Los cambios se ven al instante en tu pantalla. Los visitantes los ven cuando pulsas "Guardar y publicar".</p></div>' +
      '<div class="grp"><button class="btn btn-ghost btn-sm" type="button" data-a="salir">Cerrar sesión</button></div>';
  }

  function tabPagina() {
    var T = estado.textos;
    return '<div class="grp"><h3>WhatsApp del encargado</h3>' +
      '<div class="field"><label for="f-wa">Número con código de país</label><input id="f-wa" inputmode="numeric" placeholder="51987654321" value="' + esc(estado.whatsapp) + '"></div>' +
      '<p class="hint">Perú: 51 seguido de los 9 dígitos. Todos los botones de la página abren este número.</p></div>' +
      '<div class="grp"><h3>Portada</h3>' +
      '<div class="field"><label for="f-titulo">Título</label><input id="f-titulo" maxlength="70" value="' + esc(T.titulo) + '"></div>' +
      '<p class="hint">Si escribes "Dota 2" en el título, sale en amarillo.</p>' +
      '<div class="field"><label for="f-sub">Texto debajo del título</label><textarea id="f-sub" maxlength="220">' + esc(T.subtitulo) + '</textarea></div></div>' +
      '<div class="grp"><h3>Reglas</h3>' +
      '<div class="field"><label for="f-reglas">Una regla por línea</label><textarea id="f-reglas" style="min-height:170px">' + esc(T.reglas.join("\n")) + '</textarea></div></div>';
  }

  function formPremio() {
    var p = admin.editando.p;
    var img = safeImg(p.img);
    return '<div class="form">' +
      '<div class="field"><label for="f-img">Imagen del premio (link https://…)</label>' +
      '<div class="imgprev"><div class="box" id="prevBox">' + (img ? '<img src="' + esc(img) + '" alt="">' : 'Sin imagen') + '</div>' +
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
      '<div class="field"><label for="f-estado">Estado</label><select id="f-estado">' +
      [['activa', 'Abierta'], ['proxima', 'Próximamente'], ['cerrada', 'Cerrada']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((p.estado || "activa") === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join("") + '</select></div>' +
      '<div class="field"><label for="f-cierre">Fecha de cierre</label><input id="f-cierre" type="datetime-local" value="' + esc(aLocalInput(p.cierre)) + '"></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label for="f-part">Participantes</label><input id="f-part" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.participantes, 0) + '"></div>' +
      '<div class="field"><label for="f-cupos">Cupos (0 = sin límite)</label><input id="f-cupos" type="number" min="0" step="1" inputmode="numeric" value="' + num(p.cupos, 0) + '"></div>' +
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
      if (m === "NO_SESSION") { admin.msg = "Tu sesión venció. Vuelve a entrar."; admin.puede = false; admin.abierto = false; admin.login = true; }
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
        if (admin.puede) admin.abierto = true; else { admin.login = true; admin.msg = ""; admin.msgTipo = ""; }
        render(); break;
      case "cerrar": leerForm(); quitarHash(); admin.abierto = false; admin.editando = null; render(); break;
      case "cerrarLogin": quitarHash(); admin.login = false; admin.msg = ""; admin.msgTipo = ""; render(); break;
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
        if (ed.p.img && !safeImg(ed.p.img)) { if (err) err.textContent = "El link de la imagen debe empezar con https://"; return; }
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
      case "imgEdit": admin.imgEdit = t.getAttribute("data-id"); render(); var ii = document.getElementById("img-" + admin.imgEdit); if (ii) ii.focus(); break;
      case "imgCancel": admin.imgEdit = null; render(); break;
      case "ciclarEstado": var ke = buscarPremio(t.getAttribute("data-id")); if (ke >= 0) { var pe = estado.premios[ke]; pe.estado = ESTADOS[(ESTADOS.indexOf(pe.estado || "activa") + 1) % ESTADOS.length]; marcarSucio(); render(); } break;
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
      case "salir": guardarSesion(null); admin.puede = false; admin.abierto = false; estado = clone(publicado); sucio = false; render(); break;
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
    var t = ev.target;
    if (t.id === "f-wa") { estado.whatsapp = soloDigitos(t.value); marcarSucio(); actualizarPie(); }
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
    if (["f-wa", "f-titulo", "f-sub", "f-reglas"].indexOf(ev.target.id) >= 0) render();
  });

  document.addEventListener("submit", function (ev) {
    if (ev.target.id !== "formLogin") return;
    ev.preventDefault();
    var em = document.getElementById("l-email").value.trim(), pw = document.getElementById("l-pass").value;
    var st = ev.target.querySelector('[role="status"]'); if (st) { st.style.color = ""; st.textContent = "Entrando…"; }
    login(em, pw).then(function () {
      admin.puede = true; admin.login = false; admin.abierto = true; admin.msg = ""; admin.msgTipo = ""; render();
    }).catch(function (e) {
      var m = String(e && e.message || "");
      admin.msg = /INVALID|PASSWORD|EMAIL_NOT_FOUND|CREDENTIAL/.test(m) ? "Correo o contraseña incorrectos." : (/TOO_MANY/.test(m) ? "Demasiados intentos. Espera unos minutos." : "No se pudo entrar (" + m + ").");
      admin.msgTipo = "err"; render();
      var f = document.getElementById("l-email"); if (f) f.value = em;
    });
  });

  document.addEventListener("keydown", function (ev) {
    var e = ev.target.closest && ev.target.closest("[data-edit]");
    if (e && ev.key === "Enter") { ev.preventDefault(); e.blur(); return; }
    if (ev.key !== "Escape") return;
    if (e) { e.blur(); return; }
    if (admin.login) { admin.login = false; quitarHash(); render(); }
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

  setInterval(function () {
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
    if (admin.puede) admin.abierto = true; else admin.login = true;
    render();
  }
  window.addEventListener("hashchange", revisarHash);

  render();
  cargarRemoto();
  revisarHash();
})();
