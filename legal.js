/* Información legal de la tienda: pie de página en todas las páginas + páginas de
   Términos y Condiciones, Cambios y Devoluciones y Libro de Reclamaciones (integrado, sin enlaces externos).
   Mismo archivo en Rayas Store y LitleJacob Store: la tienda se reconoce por el dominio.
   Los datos del negocio se editan SOLO en el bloque DATOS de abajo. */
(function () {
  "use strict";
  var T = /litlejacob/i.test(location.hostname) || /[?&]tienda=litlejacob/.test(location.search) ? "litlejacob" : "rayas";
  document.documentElement.setAttribute("data-t", T);

  /* ===== DATOS DEL NEGOCIO (los que pide Culqi / INDECOPI) ===== */
  var DATOS = {
    rayas: {
      nombre: "Rayas Store", n1: "Rayas", n2: "Store", url: "https://rayas.trade", logo: "img/logo.webp",
      rubro: "Tienda virtual de items de Dota 2: compra y venta de items con entrega por Steam, y rifas de items.",
      ofrece: ["Compra de items de Dota 2 (entrega por Steam, con precio en soles)", "Venta de items de Dota 2 (te los compramos)", "Rifas de items de Dota 2 con tickets pagados con tu saldo"],
      razonSocial: "TIRAPO BUSTILLOS BRYAN DARWIN", ruc: "10712504761", direccion: "Mz A1 Lte 20, Jardines de Shangrila, Puente Piedra, Lima", correo: "pedidos@rayas.trade",
      telefonos: [{ t: "+51 900 049 694", n: "51900049694" }],
      redes: [{ n: "WhatsApp", u: "https://wa.me/51900049694" }]
    },
    litlejacob: {
      nombre: "LitleJacob Store", n1: "LitleJacob", n2: "Store", url: "https://litlejacob.trade", logo: "apple-touch-icon.png",
      rubro: "Tienda virtual de Dota 2: Sets Caché, compra y venta de items con entrega por Steam, y rifas de items.",
      ofrece: ["Sets Caché de Dota 2 (reserva y entrega por Steam)", "Compra y venta de items de Dota 2 (entrega por Steam, con precio en soles)", "Rifas de items de Dota 2 con tickets pagados con tu saldo"],
      razonSocial: "TIRAPO BUSTILLOS BRYAN DARWIN", ruc: "10712504761", direccion: "Mz A1 Lte 20, Jardines de Shangrila, Puente Piedra, Lima", correo: "pedidos@litlejacob.trade",
      telefonos: [{ t: "+51 952 997 030", n: "51952997030" }],
      redes: [{ n: "WhatsApp", u: "https://wa.me/51952997030" }]
    }
  };
  var D = DATOS[T];
  var URL_RECLAMO = "https://us-central1-litlejacob-store.cloudfunctions.net/registrarReclamo";
  var VIGENCIA = "28 de octubre de 2026";
  var PLAZO = 15;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function dato(v) { return v ? esc(v) : '<span class="lg-pend">(por completar)</span>'; }
  function cargarCss() {
    if (document.querySelector('link[href^="legal.css"]')) return;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "legal.css?v=3"; document.head.appendChild(l);
  }
  function tel() { return D.telefonos.map(function (p) { return '<a href="tel:+' + esc(p.n) + '">' + esc(p.t) + '</a>'; }).join(" · "); }
  function correoHtml() { return D.correo ? '<a href="mailto:' + esc(D.correo) + '">' + esc(D.correo) + '</a>' : '<span class="lg-pend">(por completar)</span>'; }
  var LIBRO_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 8h6M9 12h6"/></svg>';

  /* ===== pie de página ===== */
  function pie() {
    var f = document.createElement("footer"); f.className = "lg-foot"; f.id = "legalPie"; f.setAttribute("aria-label", "Información de la tienda");
    f.innerHTML =
      '<div class="lg-foot-in">' +
        '<div><div class="lg-brand">' + esc(D.n1) + ' <i>' + esc(D.n2) + '</i></div><p>' + esc(D.rubro) + '</p>' +
          '<div class="lg-rs">' + D.redes.map(function (r) { return '<a href="' + esc(r.u) + '" target="_blank" rel="noopener">' + esc(r.n) + '</a>'; }).join("") + '</div></div>' +
        '<div><h4>Contacto</h4><p>📞 ' + tel() + '</p><p>📧 ' + correoHtml() + '</p><p>🏠 ' + dato(D.direccion) + '</p></div>' +
        '<div><h4>Información legal</h4><ul><li><a href="terminos.html">Términos y Condiciones</a></li><li><a href="devoluciones.html">Política de cambios y devoluciones</a></li>' +
          '<li><a class="lg-libro" href="reclamaciones.html">' + LIBRO_SVG + ' Libro de Reclamaciones</a></li></ul></div>' +
      '</div>' +
      '<div class="lg-foot-b"><span>© ' + new Date().getFullYear() + ' ' + esc(D.nombre) + (D.ruc ? ' · RUC ' + esc(D.ruc) : '') + '</span><span>Pagos seguros con Culqi · Dota 2 y Steam son marcas de Valve Corporation; esta tienda no está afiliada a Valve.</span></div>';
    document.body.appendChild(f);
  }

  /* ===== cabecera de las páginas legales ===== */
  function cabecera(actual) {
    var l = [["terminos", "Términos y Condiciones"], ["devoluciones", "Cambios y devoluciones"], ["reclamaciones", "Libro de Reclamaciones"]];
    return '<header class="lg-top"><div class="lg-top-in"><a class="lg-logo" href="./"><img src="' + esc(D.logo) + '" alt="" width="34" height="34">' + esc(D.n1) + ' <i>' + esc(D.n2) + '</i></a>' +
      '<nav aria-label="Información legal">' + l.map(function (x) { return '<a href="' + x[0] + '.html"' + (x[0] === actual ? ' class="on" aria-current="page"' : '') + '>' + x[1] + '</a>'; }).join("") + '<a href="./">← Volver a la tienda</a></nav></div></header>';
  }
  function proveedor() {
    return '<div class="lg-card"><dl class="lg-datos"><dt>Razón social</dt><dd>' + dato(D.razonSocial) + '</dd><dt>Nombre comercial</dt><dd>' + esc(D.nombre) + ' (' + esc(D.url.replace("https://", "")) + ')</dd><dt>RUC</dt><dd>' + dato(D.ruc) + '</dd>' +
      '<dt>Domicilio</dt><dd>' + dato(D.direccion) + '</dd><dt>Teléfono / WhatsApp</dt><dd>' + tel() + '</dd><dt>Correo</dt><dd>' + correoHtml() + '</dd></dl></div>';
  }

  /* ===== Términos y Condiciones ===== */
  function terminos() {
    var litle = T === "litlejacob";
    return '<h1>Términos y <span>Condiciones</span></h1><p class="lg-sub">Vigentes desde el ' + VIGENCIA + '. Al crear una cuenta, recargar saldo o comprar en ' + esc(D.nombre) + ' aceptas estos términos.</p>' +
      '<h2>1. Quiénes somos</h2>' + proveedor() +
      '<h2>2. Qué ofrecemos</h2><ul>' + D.ofrece.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join("") + '</ul>' +
      '<p>Todos los productos son <b>digitales</b> (items del juego Dota 2) y se entregan por Steam. No enviamos productos físicos.</p>' +
      '<h2>3. Tu cuenta</h2><ul><li>Debes ser mayor de edad, o contar con la autorización de tu padre, madre o apoderado.</li><li>Los datos que nos das (nombre, WhatsApp, ID de Steam y enlace de intercambio) deben ser verdaderos y tuyos. Eres responsable de tu contraseña y de lo que se haga con tu cuenta.</li>' +
      '<li>Puedes entrar con correo, con Google o con Steam. Podemos suspender cuentas que incumplan estos términos o intenten defraudar.</li></ul>' +
      '<h2>4. Precios y medios de pago</h2><ul><li>Los precios se muestran en <b>soles (S/)</b>.</li><li>Pagas con tarjeta, Yape, PagoEfectivo, QR o billeteras digitales mediante la pasarela de pagos <b>Culqi</b>, o por Yape / WhatsApp con el encargado de la tienda.</li>' +
      '<li>En los pagos con Culqi, la comisión de la pasarela la asume quien compra y se muestra antes de pagar. En los pagos por Yape / WhatsApp no hay comisión.</li><li>Los datos de tu tarjeta se escriben únicamente en la ventana segura de Culqi; la tienda nunca los ve ni los guarda.</li></ul>' +
      '<h2>5. Saldo de tu cuenta</h2><p>Al pagar una recarga, el monto se acredita como <b>saldo en soles</b> dentro de tu cuenta. Con ese saldo compras items y participas en rifas. El saldo no genera intereses, no es transferible a otras cuentas y no es dinero electrónico. Las condiciones de devolución están en la <a href="devoluciones.html">Política de cambios y devoluciones</a>.</p>' +
      '<h2>6. Entrega</h2><ul><li>Los items se entregan por <b>oferta de intercambio de Steam</b> al enlace de intercambio que registraste en tu cuenta. Es tu responsabilidad que sea correcto y que tu inventario esté público y sin restricciones de intercambio.</li>' +
      '<li>Te avisamos por WhatsApp cuando enviamos la oferta; debes aceptarla desde tu cuenta de Steam.</li>' +
      (litle ? '<li><b>Sets Caché:</b> se reservan al confirmarse tu pedido y se entregan cuando tu cuenta de Steam cumple los 30 días de amistad con la nuestra, requisito de Steam para intercambiar.</li>' : '') +
      '<li>Los tiempos pueden variar por restricciones o mantenimiento de Steam, que no controlamos.</li></ul>' +
      '<h2>7. Rifas</h2><p>Cada ticket tiene el precio indicado en la rifa y se paga con tu saldo. El ganador se elige al azar entre los tickets vendidos cuando la rifa cierra, y el premio se entrega por Steam. Cada rifa muestra su premio, el precio del ticket, la cantidad de tickets y el máximo por persona. Una vez comprado, el ticket no se devuelve, salvo que la rifa sea cancelada (ver devoluciones).</p>' +
      '<h2>8. Cambios y devoluciones</h2><p>Consulta la <a href="devoluciones.html">Política de cambios y devoluciones</a>.</p>' +
      '<h2>9. Libro de Reclamaciones</h2><p>Contamos con un <a href="reclamaciones.html">Libro de Reclamaciones virtual</a> dentro de este sitio, conforme al Código de Protección y Defensa del Consumidor (Ley 29571) y su Reglamento. Respondemos en un máximo de ' + PLAZO + ' días hábiles.</p>' +
      '<h2>10. Marcas y propiedad intelectual</h2><p>Dota 2, Steam y sus logotipos son marcas de Valve Corporation. ' + esc(D.nombre) + ' es una tienda independiente y no está afiliada a Valve. Los diseños, textos e imágenes propios de este sitio no pueden copiarse sin permiso.</p>' +
      '<h2>11. Responsabilidad</h2><p>Hacemos lo posible por que el servicio funcione sin interrupciones, pero no respondemos por fallas de Steam, de tu conexión o de terceros, ni por sanciones que Valve aplique a tu cuenta de juego. Nuestra responsabilidad frente a ti se limita al monto que pagaste por el producto o servicio reclamado.</p>' +
      '<h2>12. Datos personales</h2><p>Usamos tus datos (nombre, correo, WhatsApp, ID y enlace de intercambio de Steam, y los datos públicos de tu perfil de Steam) únicamente para crear tu cuenta, procesar pagos, entregar tus compras, atender reclamos y avisarte de tus pedidos. Para ello los procesan proveedores como Google Firebase (almacenamiento), Culqi (pagos), Resend (correos) y Steam (inicio de sesión). No vendemos tus datos. Según la Ley 29733 puedes pedir acceso, rectificación o eliminación de tus datos escribiendo a ' + (D.correo ? esc(D.correo) : 'nuestro correo de contacto') + ' o por WhatsApp.</p>' +
      '<h2>13. Cambios y ley aplicable</h2><p>Podemos actualizar estos términos; la versión vigente es la publicada aquí. Se rigen por las leyes de la República del Perú.</p>';
  }

  /* ===== Política de cambios y devoluciones ===== */
  function devoluciones() {
    return '<h1>Política de cambios y <span>devoluciones</span></h1><p class="lg-sub">Vigente desde el ' + VIGENCIA + '. Nuestros productos son digitales (items de Dota 2 entregados por Steam), por eso las reglas son distintas a las de un producto físico.</p>' +
      '<h2>Cuándo sí devolvemos o cambiamos</h2>' +
      '<table class="lg-tabla"><thead><tr><th>Situación</th><th>Qué hacemos</th></tr></thead><tbody>' +
      '<tr><td>Pagaste y el item <b>no te llegó</b>, o llegó <b>uno distinto</b> al que compraste</td><td>Te lo enviamos correcto, o te devolvemos el 100 % del pago.</td></tr>' +
      '<tr><td>Se te cobró <b>dos veces</b> o por un monto errado</td><td>Te devolvemos lo cobrado de más.</td></tr>' +
      '<tr><td>La <b>rifa fue cancelada</b> antes del sorteo</td><td>Te devolvemos a tu saldo el costo de tus tickets.</td></tr>' +
      '<tr><td>Un item quedó <b>agotado</b> después de tu pago y no podemos entregarlo</td><td>Te ofrecemos otro equivalente o te devolvemos el 100 %.</td></tr>' +
      '</tbody></table>' +
      '<h2>Cuándo no aplica</h2><ul><li>Items que ya <b>se entregaron correctamente</b> por Steam y tu cuenta aceptó la oferta: al ser contenido digital entregado, no admiten cambio ni devolución, salvo error nuestro.</li>' +
      '<li>Tickets de rifas ya comprados en rifas que siguen en curso o ya se sortearon.</li><li>Entrega que no se logra por datos incorrectos que registraste (enlace de intercambio equivocado, inventario privado). En ese caso corregimos el dato y volvemos a enviar.</li></ul>' +
      '<h2>Cómo pedirlo</h2><ol><li>Escríbenos por WhatsApp (' + tel() + ') o al correo ' + correoHtml() + ' dentro de los <b>7 días calendario</b> siguientes a tu compra o pago.</li>' +
      '<li>Indica tu nombre, el item o rifa, la fecha y el monto pagado (si tienes el correo de confirmación, adjúntalo).</li>' +
      '<li>Revisamos tu caso y te respondemos en un máximo de <b>2 días hábiles</b>.</li></ol>' +
      '<h2>Cómo te devolvemos el dinero</h2><ul><li><b>A tu saldo</b> en la tienda: inmediato una vez aprobado.</li>' +
      '<li><b>Al medio de pago original</b> (tarjeta, Yape u otro), si lo prefieres: lo solicitamos a la pasarela y puede tardar hasta <b>15 días hábiles</b> en reflejarse según tu banco.</li></ul>' +
      '<h2>¿No estás de acuerdo con la respuesta?</h2><p>Puedes presentar un reclamo en nuestro <a href="reclamaciones.html">Libro de Reclamaciones</a>. Si no quedas conforme, puedes acudir al INDECOPI.</p>' +
      '<p><a class="lg-btn sec" href="terminos.html">Ver Términos y Condiciones</a></p>';
  }

  /* ===== Libro de Reclamaciones ===== */
  function reclamaciones() {
    return '<h1>Libro de <span>Reclamaciones</span></h1><p class="lg-sub">Hoja de reclamación virtual conforme al Código de Protección y Defensa del Consumidor (Ley 29571) y su Reglamento. Responderemos en un máximo de <b>' + PLAZO + ' días hábiles</b> al correo que indiques.</p>' +
      '<div id="lgEstado"></div>' +
      '<form class="lg-form" id="lgForm" novalidate autocomplete="on">' +
      '<fieldset><legend>1. Identificación del proveedor</legend>' + proveedor().replace('class="lg-card"', 'style="margin:6px 0 0;border:0;padding:0;background:none"') + '</fieldset>' +
      '<fieldset><legend>2. Identificación del consumidor</legend><div class="lg-g">' +
        '<div class="full"><label for="nombre">Nombres y apellidos *</label><input id="nombre" name="nombre" maxlength="100" autocomplete="name" required></div>' +
        '<div><label for="tipoDoc">Tipo de documento *</label><select id="tipoDoc" name="tipoDoc"><option>DNI</option><option value="CE">Carné de extranjería</option><option>Pasaporte</option><option>RUC</option></select></div>' +
        '<div><label for="numDoc">N° de documento *</label><input id="numDoc" name="numDoc" maxlength="20" inputmode="numeric" required></div>' +
        '<div class="full"><label for="domicilio">Domicilio *</label><input id="domicilio" name="domicilio" maxlength="160" autocomplete="street-address" required></div>' +
        '<div><label for="telefono">Teléfono / celular *</label><input id="telefono" name="telefono" maxlength="20" inputmode="tel" autocomplete="tel" required></div>' +
        '<div><label for="email">Correo electrónico *</label><input id="email" name="email" type="email" maxlength="120" autocomplete="email" required></div>' +
        '<div class="full"><label class="lg-chk"><input type="checkbox" id="menor" name="menor"> <span>Soy menor de edad (debe completar su padre, madre o apoderado)</span></label></div>' +
        '<div class="full" id="boxApoderado" hidden><label for="apoderado">Nombre del padre, madre o apoderado *</label><input id="apoderado" name="apoderado" maxlength="100"></div>' +
      '</div></fieldset>' +
      '<fieldset><legend>3. Identificación del bien contratado</legend><div class="lg-g">' +
        '<div class="full"><div class="lg-radio"><label><input type="radio" name="bienTipo" value="producto" checked> Producto</label><label><input type="radio" name="bienTipo" value="servicio"> Servicio</label></div></div>' +
        '<div class="full"><label for="bien">Descripción (item, rifa, recarga…) *</label><input id="bien" name="bien" maxlength="200" required></div>' +
        '<div><label for="monto">Monto reclamado (S/)</label><input id="monto" name="monto" maxlength="10" inputmode="decimal" placeholder="Ej. 25.50"></div>' +
        '<div><label for="pedidoRef">N° de pedido o pago (si lo tienes)</label><input id="pedidoRef" name="pedidoRef" maxlength="60"></div>' +
      '</div></fieldset>' +
      '<fieldset><legend>4. Detalle del reclamo o queja</legend><div class="lg-g">' +
        '<div class="full"><div class="lg-radio"><label><input type="radio" name="tipo" value="reclamo" checked> <span><b>Reclamo</b> — disconformidad con el producto o servicio</span></label></div><div class="lg-radio" style="margin-top:6px"><label><input type="radio" name="tipo" value="queja"> <span><b>Queja</b> — disconformidad con la atención al público</span></label></div></div>' +
        '<div class="full"><label for="detalle">Detalle *</label><textarea id="detalle" name="detalle" maxlength="2000" required></textarea></div>' +
        '<div class="full"><label for="pedido">Pedido del consumidor (qué solución esperas) *</label><textarea id="pedido" name="pedido" maxlength="1000" style="min-height:80px" required></textarea></div>' +
      '</div></fieldset>' +
      '<div class="lg-trampa" aria-hidden="true"><label>No llenar<input name="web" tabindex="-1" autocomplete="off"></label></div>' +
      '<label class="lg-chk"><input type="checkbox" id="acepta" name="acepta"> <span>Declaro que los datos son ciertos. La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI. El proveedor debe dar respuesta en un plazo no mayor a ' + PLAZO + ' días hábiles.</span></label>' +
      '<div id="lgError"></div><p style="margin-top:18px"><button class="lg-btn" type="submit" id="lgEnviar">Enviar hoja de reclamación</button></p></form>';
  }
  function fechaCorta(iso) { try { return new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "long", timeStyle: "short" }); } catch (e) { return iso; } }
  function iniciarReclamo() {
    var f = document.getElementById("lgForm"); if (!f) return;
    var menor = f.elements.menor, box = document.getElementById("boxApoderado");
    menor.addEventListener("change", function () { box.hidden = !menor.checked; });
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var err = document.getElementById("lgError"), btn = document.getElementById("lgEnviar");
      var el = f.elements, d = {
        tipoDoc: el.tipoDoc.value, numDoc: el.numDoc.value, nombre: el.nombre.value, domicilio: el.domicilio.value, telefono: el.telefono.value, email: el.email.value,
        menor: menor.checked, apoderado: el.apoderado.value, bienTipo: f.querySelector('input[name="bienTipo"]:checked').value, bien: el.bien.value, monto: el.monto.value.replace(",", "."),
        pedidoRef: el.pedidoRef.value, tipo: f.querySelector('input[name="tipo"]:checked').value, detalle: el.detalle.value, pedido: el.pedido.value, acepta: el.acepta.checked, web: el.web.value
      };
      function falla(m) { err.innerHTML = '<div class="lg-msg" role="alert">' + esc(m) + '</div>'; btn.disabled = false; btn.textContent = "Enviar hoja de reclamación"; }
      if (!f.checkValidity()) { f.reportValidity(); return; }
      if (!d.acepta) return falla("Marca la casilla de conformidad para enviar la hoja.");
      err.innerHTML = ""; btn.disabled = true; btn.textContent = "Enviando…";
      fetch(URL_RECLAMO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo enviar la hoja."); return j; }); })
        .then(function (j) {
          var filas = [["Tipo", d.tipo === "queja" ? "Queja" : "Reclamo"], ["Consumidor", d.nombre], ["Documento", d.tipoDoc + " " + d.numDoc], ["Domicilio", d.domicilio], ["Teléfono", d.telefono], ["Correo", d.email]];
          if (d.menor) filas.push(["Apoderado", d.apoderado]);
          filas.push(["Bien contratado", (d.bienTipo === "servicio" ? "Servicio: " : "Producto: ") + d.bien]);
          if (d.monto) filas.push(["Monto reclamado", "S/ " + d.monto]);
          if (d.pedidoRef) filas.push(["N° de pedido / pago", d.pedidoRef]);
          filas.push(["Detalle", d.detalle], ["Pedido del consumidor", d.pedido]);
          document.getElementById("lgEstado").innerHTML = '<div class="lg-msg lg-ok" role="status"><b>✔ Tu hoja fue registrada.</b><br>N° de hoja: <b>' + esc(j.numero) + '</b> · ' + esc(fechaCorta(j.creado)) + '<br>' +
            (j.correoCliente ? 'Te enviamos una copia a <b>' + esc(d.email) + '</b>.' : 'No pudimos enviar la copia por correo: guarda o imprime esta página como constancia.') +
            ' Te responderemos en un máximo de ' + esc(j.plazo || PLAZO) + ' días hábiles (aprox. hasta el ' + esc(fechaCorta(j.vence).split(",")[0]) + ').</div>' +
            '<div class="lg-card"><dl class="lg-datos">' + filas.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd style="white-space:pre-wrap">' + esc(x[1]) + '</dd>'; }).join("") + '</dl></div>' +
            '<p class="lg-noprint"><button class="lg-btn" type="button" onclick="window.print()">Imprimir constancia</button> <a class="lg-btn sec" href="./">Volver a la tienda</a></p>';
          f.hidden = true; window.scrollTo(0, 0);
        }).catch(function (e) { falla((e && e.message && e.message !== "Failed to fetch") ? e.message : "No pudimos enviar la hoja ahora. Inténtalo de nuevo, o escríbenos por WhatsApp."); });
    });
  }

  /* ===== arranque ===== */
  cargarCss();
  function listo() {
    var pag = document.body.getAttribute("data-pagina");
    if (!pag) { pie(); return; }
    var cuerpo = pag === "terminos" ? terminos() : pag === "devoluciones" ? devoluciones() : reclamaciones();
    document.title = ({ terminos: "Términos y Condiciones", devoluciones: "Cambios y devoluciones", reclamaciones: "Libro de Reclamaciones" })[pag] + " · " + D.nombre;
    document.body.classList.add("lg-page");
    document.body.innerHTML = cabecera(pag) + '<main class="lg-main">' + cuerpo + '</main>';
    pie();
    if (pag === "reclamaciones") iniciarReclamo();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", listo); else listo();
})();
