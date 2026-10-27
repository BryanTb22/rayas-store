(function () {
  "use strict";

  /* ---------- Firebase (mismo proyecto que LitleJacob Store) ---------- */
  var FB = {
    apiKey: "AIzaSyDbyLi7IK3ikwUp7A0VzRRqPucqRXPpL3E",
    projectId: "litlejacob-store"
  };
  var DOC_URL = "https://firestore.googleapis.com/v1/projects/" + FB.projectId + "/databases/(default)/documents/rayas/estado";
  var SES_KEY = "rayas_admin_ses";

  function leerSesion() {
    try { return JSON.parse(localStorage.getItem(SES_KEY) || "null"); } catch (e) { return null; }
  }
  function guardarSesion(s) {
    try { if (s) localStorage.setItem(SES_KEY, JSON.stringify(s)); else localStorage.removeItem(SES_KEY); } catch (e) { /* sin almacenamiento */ }
  }
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

  /* ---------- Estado ---------- */
  var publicado = { whatsapp: "", premios: [] };
  try {
    var raw = document.getElementById("estado");
    if (raw) publicado = JSON.parse(raw.textContent || "{}");
  } catch (e) { /* estado vacío */ }
  if (!Array.isArray(publicado.premios)) publicado.premios = [];
  if (typeof publicado.whatsapp !== "string") publicado.whatsapp = "";

  var estado = clone(publicado);
  var sucio = false;

  var admin = { puede: false, login: false, assets: null, abierto: false, editando: null, galeria: null, verGaleria: false, filtro: "", borrar: null, msg: "", msgTipo: "" };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function num(v, def) { var n = Number(v); return isFinite(n) && n >= 0 ? Math.floor(n) : def; }
  function soloDigitos(s) { return String(s || "").replace(/\D+/g, ""); }
  function safeImg(src) {
    src = String(src || "");
    if (/^img\/[\w.\-]+$/.test(src)) return src;
    if (/^\/_blob\/[\w\-]+$/.test(src)) return src;
    if (/^https:\/\/[^\s"'<>]+$/.test(src)) return src;
    return "";
  }

  /* ---------- Rareza (colores de Dota 2) ---------- */
  var RAREZAS = {
    "ARCANO": "#ade55c", "INMORTAL": "#e4ae39", "LEGENDARIO": "#d32ce6", "MÍTICO": "#8847ff",
    "RARO": "#4b69ff", "POCO COMÚN": "#5e98d9", "COMÚN": "#b0c3d9"
  };
  function colorRareza(r) { return RAREZAS[String(r || "").toUpperCase()] || "var(--muted)"; }

  /* ---------- WhatsApp ---------- */
  function waLink(texto) {
    var n = soloDigitos(estado.whatsapp);
    if (!n) return "";
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(texto);
  }
  function waBonito(n) {
    n = soloDigitos(n);
    if (!n) return "";
    if (n.length === 11 && n.indexOf("51") === 0) return "+51 " + n.slice(2, 5) + " " + n.slice(5, 8) + " " + n.slice(8);
    return "+" + n;
  }

  /* ---------- Tiempo ---------- */
  function restante(iso) {
    if (!iso) return "";
    var fin = new Date(iso).getTime();
    if (!isFinite(fin)) return "";
    var ms = fin - Date.now();
    if (ms <= 0) return "Tiempo cumplido";
    var d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
    if (d > 0) return "Cierra en " + d + " d " + h + " h";
    if (h > 0) return "Cierra en " + h + " h " + m + " min";
    return "Cierra en " + Math.max(1, m) + " min";
  }
  function fechaCorta(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return "";
    try { return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return d.toDateString(); }
  }
  function aLocalInput(iso) {
    var d = new Date(iso);
    if (!iso || !isFinite(d.getTime())) return "";
    var p = function (x) { return String(x).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ---------- Render público ---------- */
  function tarjeta(p) {
    var img = safeImg(p.img);
    var est = p.estado === "proxima" ? "proxima" : (p.estado === "cerrada" ? "cerrada" : "activa");
    var estTxt = est === "activa" ? "Abierta" : (est === "proxima" ? "Próximamente" : "Cerrada");
    var cupos = num(p.cupos, 0), part = num(p.participantes, 0);
    var partTxt = cupos > 0 ? (part + " / " + cupos + " participantes") : (part + (part === 1 ? " participante" : " participantes"));
    var cred = num(p.creditos, 0);
    var link = waLink("Hola, quiero participar en la rifa de " + p.nombre + " (" + cred + " créditos).");
    var lleno = cupos > 0 && part >= cupos;
    var boton;
    if (est === "activa") {
      boton = link && !lleno
        ? '<a class="btn btn-yellow" href="' + esc(link) + '" target="_blank" rel="noopener">Participar por WhatsApp</a>'
        : '<button class="btn btn-yellow" type="button" disabled>' + (lleno ? "Cupos llenos" : "Participar") + '</button>';
    } else if (est === "proxima") {
      boton = '<button class="btn btn-ghost" type="button" disabled>Muy pronto</button>';
    } else {
      boton = p.ganador ? '<div class="pill">Ganador: <b style="color:var(--yellow)">' + esc(p.ganador) + '</b></div>' : '<div class="pill">Sorteo realizado</div>';
    }
    return '<article class="card">' +
      '<div class="pic">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(p.nombre) + '" loading="lazy">' : '<div class="noimg">Sin imagen</div>') +
      '<span class="status ' + est + '">' + estTxt + '</span></div>' +
      '<div class="body">' +
      (p.rareza ? '<div class="rarity" style="color:' + colorRareza(p.rareza) + '">' + esc(p.rareza) + '</div>' : '') +
      '<h3>' + esc(p.nombre || "Premio") + '</h3>' +
      (p.descripcion ? '<p class="desc">' + esc(p.descripcion) + '</p>' : '') +
      '<div class="meta"><span class="cost">' + cred + ' <small>créditos</small></span>' +
      '<span class="pill">' + partTxt + '</span></div>' +
      (est === "activa" && p.cierre ? '<div class="timer" data-cierre="' + esc(p.cierre) + '">' + esc(restante(p.cierre)) + '</div>' : '') +
      (est === "proxima" && p.cierre ? '<div class="pill">Cierra el ' + esc(fechaCorta(p.cierre)) + '</div>' : '') +
      boton +
      '</div></article>';
  }

  function render() {
    var app = document.getElementById("app");
    if (!app) return;
    var visibles = estado.premios.filter(function (p) { return p.estado !== "cerrada"; });
    var cerradas = estado.premios.filter(function (p) { return p.estado === "cerrada"; });
    var linkCreditos = waLink("Hola, quiero mis créditos gratis para las rifas de Rayas Store.");
    var wa = waBonito(estado.whatsapp);

    var html = '' +
      '<header class="topbar gutter"><div class="wrap">' +
      '<a class="logo" href="#inicio"><b>RAYAS</b> <i>STORE</i></a>' +
      '<nav class="nav"><a class="navlink" href="#rifas">Rifas</a><a class="navlink" href="#como">Cómo participar</a><a class="navlink" href="#ganadores">Ganadores</a>' +
      (linkCreditos ? '<a class="btn btn-fuchsia btn-sm" href="' + esc(linkCreditos) + '" target="_blank" rel="noopener">Pedir créditos</a>' : '') +
      '</nav></div></header>' +

      '<section class="hero gutter" id="inicio"><div class="wrap">' +
      '<span class="kicker">Rifas de Dota 2</span>' +
      '<h1>Gana items de <em>Dota 2</em> gratis</h1>' +
      '<p>Pide tus créditos gratis al encargado, elige el premio que quieres y entra a la rifa. Sin pagar nada.</p>' +
      '<div class="actions">' +
      '<a class="btn btn-yellow" href="#rifas">Ver rifas</a>' +
      (linkCreditos ? '<a class="btn btn-fuchsia" href="' + esc(linkCreditos) + '" target="_blank" rel="noopener">Pedir créditos gratis</a>' : '') +
      '</div>' +
      '<div class="chips"><span class="chip">Créditos 100% gratis</span><span class="chip">Ganador al azar</span><span class="chip">Entrega por Steam</span></div>' +
      '</div></section>' +

      '<section class="section gutter" id="rifas"><div class="wrap">' +
      '<div class="section-head"><h2>Rifas <span>activas</span></h2><p>Cada premio indica cuántos créditos cuesta entrar.</p></div>' +
      (visibles.length
        ? '<div class="grid">' + visibles.map(tarjeta).join("") + '</div>'
        : '<div class="empty"><strong>Pronto nuevas rifas</strong>Escríbenos para pedir tus créditos y te avisamos cuando abra la próxima.</div>') +
      '</div></section>' +

      '<section class="section gutter" id="como"><div class="wrap">' +
      '<div class="section-head"><h2>Cómo <span>participar</span></h2></div>' +
      '<div class="steps">' +
      '<div class="step"><span class="n">1</span><h3>Escríbenos</h3><p>Manda un mensaje al encargado por WhatsApp con tu nombre o usuario de Steam.</p></div>' +
      '<div class="step"><span class="n">2</span><h3>Recibe tus créditos</h3><p>El encargado te da créditos gratis. Los créditos no se compran ni tienen valor en dinero.</p></div>' +
      '<div class="step"><span class="n">3</span><h3>Entra a la rifa</h3><p>Elige el premio y usa tus créditos. Cuando cierra, el ganador se elige al azar.</p></div>' +
      '</div></div></section>' +

      '<section class="section gutter" id="ganadores"><div class="wrap">' +
      '<div class="section-head"><h2>Ganadores</h2></div>' +
      (cerradas.length
        ? '<div class="winners">' + cerradas.map(function (p) {
            var img = safeImg(p.img);
            return '<div class="winner">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<img alt="">') +
              '<div class="who"><b>' + esc(p.ganador || "Por anunciar") + '</b><span>' + esc(p.nombre) + (p.cierre ? ' · ' + esc(fechaCorta(p.cierre)) : '') + '</span></div>' +
              (p.ganador ? '<span class="crown">GANÓ</span>' : '') + '</div>';
          }).join("") + '</div>'
        : '<div class="empty"><strong>Aún no hay ganadores</strong>Cuando cierre la primera rifa, el ganador aparecerá aquí.</div>') +
      '</div></section>' +

      '<section class="section gutter" id="reglas"><div class="wrap">' +
      '<div class="section-head"><h2>Reglas</h2></div>' +
      '<div class="rules"><ul>' +
      '<li>Los créditos son gratis. No se compran, no se venden y no tienen valor en dinero.</li>' +
      '<li>Los créditos se entregan solo al comunicarte con el encargado de la página.</li>' +
      '<li>El ganador se elige al azar cuando cierra la rifa y se anuncia en esta página.</li>' +
      '<li>El item se entrega por Steam. El ganador debe tener su cuenta lista para recibir regalos.</li>' +
      '<li>Si el ganador no responde en 48 horas, se elige a otro participante.</li>' +
      '</ul></div></div></section>' +

      '<footer class="footer gutter"><div class="wrap">' +
      '<span>RAYAS STORE · Rifas de Dota 2</span>' +
      (wa ? '<span>WhatsApp: <span class="wa">' + esc(wa) + '</span></span>' : '') +
      '<span>No afiliado a Valve. Dota 2 es una marca de Valve Corporation.</span>' +
      '<a href="#admin" style="color:var(--muted)">Acceso admin</a>' +
      '</div></footer>';

    if (sucio) html += '<div class="draftbar gutter"><div class="wrap">Vista previa con cambios sin publicar · Solo tú la ves</div></div>';
    if (admin.puede) html += '<button class="btn btn-yellow admin-fab" type="button" id="abrirAdmin">Administrar rifas</button>';
    if (admin.puede && admin.abierto) html += panelAdmin();
    if (!admin.puede && admin.login) html += panelLogin();

    app.innerHTML = html;
  }

  /* ---------- Panel de administración ---------- */
  function panelAdmin() {
    var cuerpo = admin.editando ? formPremio() : listaPremios();
    return '<aside class="drawer" role="dialog" aria-label="Administrar rifas">' +
      '<div class="drawer-head"><h2>' + (admin.editando ? (admin.editando.nuevo ? "Nuevo premio" : "Editar premio") : "Administrar") + '</h2>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-a="cerrar">Cerrar</button></div>' +
      '<div class="drawer-body">' + cuerpo + '</div>' +
      (admin.editando ? '' :
        '<div class="drawer-foot">' +
        '<button class="btn btn-fuchsia" type="button" data-a="publicar"' + (sucio ? '' : ' disabled') + '>Guardar y publicar</button>' +
        '<div class="msg ' + admin.msgTipo + '" role="status">' + esc(admin.msg || (sucio ? "Tienes cambios sin publicar." : "Todo está publicado.")) + '</div>' +
        '</div>') +
      '</aside>';
  }

  function panelLogin() {
    return '<aside class="drawer" role="dialog" aria-label="Acceso de administrador">' +
      '<div class="drawer-head"><h2>Acceso admin</h2><button class="btn btn-ghost btn-sm" type="button" data-a="cerrarLogin">Cerrar</button></div>' +
      '<form class="drawer-body form" id="formLogin">' +
      '<div class="field"><label for="l-email">Correo</label><input id="l-email" type="email" autocomplete="username" required></div>' +
      '<div class="field"><label for="l-pass">Contraseña</label><input id="l-pass" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn btn-yellow" type="submit">Entrar</button>' +
      '<p class="hint" role="status" style="' + (admin.msgTipo === "err" ? 'color:var(--danger)' : '') + '">' + esc(admin.msg || "Usa la misma cuenta de administrador de LitleJacob Store.") + '</p>' +
      '</form></aside>';
  }

  function listaPremios() {
    var items = estado.premios.map(function (p, i) {
      var img = safeImg(p.img);
      var est = p.estado === "proxima" ? "Próximamente" : (p.estado === "cerrada" ? "Cerrada" : "Abierta");
      var borrando = admin.borrar === p.id;
      return '<div class="aitem">' + (img ? '<img src="' + esc(img) + '" alt="">' : '<img alt="">') +
        '<div class="t"><b>' + esc(p.nombre || "Premio") + '</b><span>' + est + ' · ' + num(p.creditos, 0) + ' créditos</span></div>' +
        '<div class="acts">' +
        '<button class="iconbtn" type="button" title="Subir" aria-label="Subir" data-a="subir" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="iconbtn" type="button" title="Bajar" aria-label="Bajar" data-a="bajar" data-i="' + i + '"' + (i === estado.premios.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="iconbtn" type="button" title="Editar" aria-label="Editar" data-a="editar" data-i="' + i + '">✎</button>' +
        (borrando
          ? '<button class="iconbtn confirm" type="button" data-a="borrarSi" data-i="' + i + '">¿Borrar?</button>'
          : '<button class="iconbtn del" type="button" title="Borrar" aria-label="Borrar" data-a="borrar" data-i="' + i + '">✕</button>') +
        '</div></div>';
    }).join("");
    return '' +
      '<div class="grp"><h3>WhatsApp del encargado</h3>' +
      '<div class="field"><label for="f-wa">Número con código de país</label>' +
      '<input id="f-wa" inputmode="numeric" placeholder="51987654321" value="' + esc(estado.whatsapp) + '"></div>' +
      '<p class="hint">Ejemplo para Perú: 51 seguido de los 9 dígitos. Los botones de la página abren este WhatsApp.</p></div>' +
      '<div class="grp"><h3>Premios</h3>' +
      (items ? '<div class="alist">' + items + '</div>' : '<p class="hint">Todavía no hay premios. Agrega el primero.</p>') +
      '<div style="margin-top:12px"><button class="btn btn-yellow" type="button" data-a="nuevo">+ Agregar premio</button></div>' +
      '<p class="hint">Los cambios se ven aquí al instante, pero los visitantes solo los ven cuando pulsas "Guardar y publicar".</p></div>' +
      '<div class="grp"><button class="btn btn-ghost btn-sm" type="button" data-a="salir">Cerrar sesión</button></div>';
  }

  function formPremio() {
    var p = admin.editando.p;
    var img = safeImg(p.img);
    var galeria = '';
    if (admin.verGaleria) {
      var g = admin.galeria;
      if (!g) galeria = '<p class="hint">Cargando imágenes…</p>';
      else {
        var f = admin.filtro.trim().toLowerCase();
        var lista = g.filter(function (x) { return !f || (x.n + " " + x.r).toLowerCase().indexOf(f) >= 0; });
        galeria = '<div class="field"><label for="f-buscar">Buscar set</label><input id="f-buscar" placeholder="Ej: Legión, Arcano…" value="' + esc(admin.filtro) + '"></div>' +
          '<div class="gallery" id="galeria">' + galeriaItems(lista, p.img) + '</div>';
      }
    }
    return '<div class="form">' +
      '<div class="field"><label>Imagen</label><div class="imgpick">' +
      (img ? '<img src="' + esc(img) + '" alt="">' : '<div class="ph">Sin imagen</div>') +
      '<div class="b"><button class="btn btn-ghost btn-sm" type="button" data-a="galeria">' + (admin.verGaleria ? "Ocultar galería" : "Elegir de mis sets") + '</button>' +

      '</div></div>' + (admin.subiendo ? '<p class="hint">Subiendo imagen…</p>' : '') + '</div>' +
      galeria +
      '<div class="field"><label for="f-imgurl">O pega el link de una imagen (https://…)</label><input id="f-imgurl" inputmode="url" placeholder="https://…" value="' + esc(/^https:/.test(p.img || "") ? p.img : "") + '"></div>' +
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
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-yellow" type="button" data-a="listo">Listo</button>' +
      '<button class="btn btn-ghost" type="button" data-a="cancelar">Cancelar</button></div>' +
      '</div>';
  }

  function galeriaItems(lista, actual) {
    if (!lista.length) return '<p class="hint">No hay sets con ese nombre.</p>';
    return lista.map(function (x) {
      return '<button type="button" data-a="pick" data-img="' + esc(x.i) + '" data-n="' + esc(x.n) + '" data-r="' + esc(x.r) + '"' + (x.i === actual ? ' class="sel"' : '') + '>' +
        '<img src="' + esc(x.i) + '" alt="" loading="lazy"><span>' + esc(x.n) + '</span></button>';
    }).join("");
  }

  // Lee los campos del formulario al objeto en edición (sin re-renderizar).
  function leerForm() {
    if (!admin.editando) return;
    var p = admin.editando.p;
    var v = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
    if (v("f-imgurl") !== null) { var u = v("f-imgurl").trim(); if (u && safeImg(u)) p.img = u; else if (!u && /^https:/.test(p.img || "")) p.img = ""; }
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

  function cargarGaleria() {
    if (admin.galeria) return;
    fetch("galeria.json").then(function (r) { return r.json(); }).then(function (g) {
      admin.galeria = Array.isArray(g) ? g : [];
      render();
    }).catch(function () { admin.galeria = []; render(); });
  }

  function publicar() {
    admin.msg = "Publicando…"; admin.msgTipo = ""; render();
    var copia = clone(estado);
    token().then(function (tk) {
      return fetch(DOC_URL + "?updateMask.fieldPaths=json&updateMask.fieldPaths=actualizado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
        body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(copia) }, actualizado: { timestampValue: new Date().toISOString() } } })
      });
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) { var e = new Error("PERM"); e.status = r.status; throw e; }
      if (!r.ok) { var e2 = new Error("HTTP " + r.status); throw e2; }
      publicado = copia; sucio = false;
      admin.msg = "Publicado. Ya lo ven todos los visitantes."; admin.msgTipo = "ok"; render();
    }).catch(function (e) {
      if (e && e.message === "NO_SESSION") { admin.msg = "Tu sesión venció. Vuelve a entrar con tu correo y contraseña."; admin.puede = false; admin.login = true; }
      else if (e && e.message === "PERM") { admin.msg = "Esta cuenta no tiene permiso para guardar las rifas."; }
      else { admin.msg = "No se pudo publicar (" + ((e && e.message) || "error") + "). Revisa tu internet e intenta de nuevo."; }
      admin.msgTipo = "err"; render();
    });
  }

  /* ---------- Eventos ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-a], #abrirAdmin");
    if (!t) return;
    if (t.id === "abrirAdmin") { admin.abierto = true; render(); return; }
    var a = t.getAttribute("data-a");
    var i = Number(t.getAttribute("data-i"));
    switch (a) {
      case "cerrar": leerForm(); if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search); admin.abierto = false; admin.editando = null; admin.verGaleria = false; render(); break;
      case "nuevo":
        admin.editando = { nuevo: true, p: { id: "p" + Date.now().toString(36), nombre: "", rareza: "", img: "", descripcion: "", creditos: 10, estado: "activa", cierre: "", participantes: 0, cupos: 0, ganador: "" } };
        admin.verGaleria = true; cargarGaleria(); render(); break;
      case "editar":
        admin.editando = { nuevo: false, i: i, p: clone(estado.premios[i]) }; admin.verGaleria = false; render(); break;
      case "subir": if (i > 0) { var s = estado.premios.splice(i, 1)[0]; estado.premios.splice(i - 1, 0, s); marcarSucio(); render(); } break;
      case "bajar": if (i < estado.premios.length - 1) { var b = estado.premios.splice(i, 1)[0]; estado.premios.splice(i + 1, 0, b); marcarSucio(); render(); } break;
      case "borrar": admin.borrar = estado.premios[i] && estado.premios[i].id; render(); break;
      case "borrarSi": estado.premios.splice(i, 1); admin.borrar = null; marcarSucio(); render(); break;
      case "galeria": leerForm(); admin.verGaleria = !admin.verGaleria; if (admin.verGaleria) cargarGaleria(); render(); break;
      case "pick":
        leerForm();
        var p = admin.editando.p;
        p.img = t.getAttribute("data-img");
        if (!p.nombre) p.nombre = t.getAttribute("data-n");
        if (!p.rareza) p.rareza = t.getAttribute("data-r");
        admin.verGaleria = false; render(); break;
      case "listo":
        leerForm();
        var ed = admin.editando;
        if (!ed.p.nombre) { var fn = document.getElementById("f-nombre"); if (fn) { fn.focus(); fn.placeholder = "Escribe el nombre del premio"; } return; }
        if (ed.nuevo) estado.premios.unshift(ed.p); else estado.premios[ed.i] = ed.p;
        admin.editando = null; admin.verGaleria = false; marcarSucio(); render(); break;
      case "cancelar": admin.editando = null; admin.verGaleria = false; render(); break;
      case "publicar": publicar(); break;
      case "cerrarLogin": admin.login = false; admin.msg = ""; admin.msgTipo = ""; if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search); render(); break;
      case "salir": guardarSesion(null); admin.puede = false; admin.abierto = false; estado = clone(publicado); sucio = false; render(); break;
    }
  });

  document.addEventListener("submit", function (ev) {
    if (ev.target.id !== "formLogin") return;
    ev.preventDefault();
    var em = document.getElementById("l-email").value.trim(), pw = document.getElementById("l-pass").value;
    admin.msg = "Entrando…"; admin.msgTipo = "";
    var st = ev.target.querySelector('[role="status"]'); if (st) st.textContent = admin.msg;
    login(em, pw).then(function () {
      admin.puede = true; admin.login = false; admin.abierto = true; admin.msg = ""; render();
    }).catch(function (e) {
      var m = String(e && e.message || "");
      admin.msg = /INVALID|PASSWORD|EMAIL_NOT_FOUND|CREDENTIAL/.test(m) ? "Correo o contraseña incorrectos." : (/TOO_MANY/.test(m) ? "Demasiados intentos. Espera unos minutos." : "No se pudo entrar (" + m + ").");
      admin.msgTipo = "err"; render();
      var f = document.getElementById("l-email"); if (f) f.value = em;
    });
  });

  document.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t.id === "f-wa") { estado.whatsapp = soloDigitos(t.value); marcarSucio(); actualizarPie(); }
    if (t.id === "f-buscar") {
      admin.filtro = t.value;
      var box = document.getElementById("galeria");
      if (box && admin.galeria) {
        var f = admin.filtro.trim().toLowerCase();
        box.innerHTML = galeriaItems(admin.galeria.filter(function (x) { return !f || (x.n + " " + x.r).toLowerCase().indexOf(f) >= 0; }), admin.editando && admin.editando.p.img);
      }
    }
  });
  // Al salir del campo de WhatsApp, refresca la vista previa completa.
  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.id === "f-wa") { render(); var el = document.getElementById("f-wa"); if (el) el.blur(); }
  });

  function actualizarPie() {
    var foot = document.querySelector(".drawer-foot");
    if (!foot) return;
    var btn = foot.querySelector('[data-a="publicar"]');
    if (btn) btn.disabled = !sucio;
    var msg = foot.querySelector(".msg");
    if (msg) { msg.className = "msg"; msg.textContent = sucio ? "Tienes cambios sin publicar." : "Todo está publicado."; }
  }

  window.addEventListener("beforeunload", function (ev) {
    if (sucio && admin.puede) { ev.preventDefault(); ev.returnValue = ""; }
  });

  /* ---------- Contadores ---------- */
  setInterval(function () {
    var els = document.querySelectorAll(".timer[data-cierre]");
    for (var k = 0; k < els.length; k++) els[k].textContent = restante(els[k].getAttribute("data-cierre"));
  }, 30000);

  /* ---------- Inicio ---------- */
  function cargarRemoto() {
    return fetch(DOC_URL, { cache: "no-store" }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (d) {
      var txt = d && d.fields && d.fields.json && d.fields.json.stringValue;
      if (!txt) return;
      var st = JSON.parse(txt);
      if (!Array.isArray(st.premios)) st.premios = [];
      if (typeof st.whatsapp !== "string") st.whatsapp = "";
      publicado = st;
      if (!sucio) { estado = clone(st); render(); }
    }).catch(function () { /* se queda con los datos incluidos en la página */ });
  }

  function revisarHash() {
    if (location.hash === "#admin") {
      if (admin.puede) { admin.abierto = true; } else { admin.login = true; }
      render();
    }
  }
  window.addEventListener("hashchange", revisarHash);

  if (leerSesion()) admin.puede = true;
  render();
  cargarRemoto();
  revisarHash();
})();
