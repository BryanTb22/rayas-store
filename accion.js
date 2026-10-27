/* Página propia para los enlaces del correo (restablecer contraseña, verificar correo). */
(function () {
  "use strict";
  var API = "AIzaSyDbyLi7IK3ikwUp7A0VzRRqPucqRXPpL3E";
  var q = new URLSearchParams(location.search), modo = q.get("mode"), codigo = q.get("oobCode"), cont = q.get("continueUrl");
  var caja = document.getElementById("caja");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function destino() {
    try {
      var u = new URL(cont);
      if (u.protocol === "https:" && /(^|\.)(rayas|litlejacob)\.trade$/.test(u.hostname)) return u.href;
    } catch (e) { /* sin destino */ }
    return "/";
  }
  function llamar(ruta, cuerpo) {
    return fetch("https://identitytoolkit.googleapis.com/v1/" + ruta + "?key=" + encodeURIComponent(API), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message || "ERROR");
      return j;
    });
  }
  function msgError(m) {
    m = String(m || "");
    if (/EXPIRED_OOB_CODE/.test(m)) return "Este enlace ya venció. Pide uno nuevo desde «¿Olvidaste tu contraseña?».";
    if (/INVALID_OOB_CODE/.test(m)) return "Este enlace no es válido o ya fue usado. Pide uno nuevo desde «¿Olvidaste tu contraseña?».";
    if (/WEAK_PASSWORD/.test(m)) return "La contraseña debe tener al menos 6 caracteres.";
    if (/USER_DISABLED/.test(m)) return "Esta cuenta está deshabilitada. Escribe al encargado.";
    return "Algo salió mal (" + m + "). Intenta de nuevo.";
  }
  function pantalla(ico, malo, kicker, titulo, texto, extra) {
    caja.innerHTML = '<div class="acc-ico' + (malo ? ' bad' : '') + '" aria-hidden="true">' + ico + '</div>' +
      '<div class="acc-kicker">' + kicker + '</div><h1>' + titulo + '</h1><div class="acc-div"></div>' + (texto ? '<p>' + texto + '</p>' : '') + (extra || '');
  }
  function irInicio() { return '<a class="btn btn-yellow" href="' + esc(destino()) + '">Ir a Rayas Store</a>'; }

  function reset() {
    llamar("accounts:resetPassword", { oobCode: codigo }).then(function (j) {
      var email = j.email || "";
      caja.innerHTML = '<div class="acc-kicker">Tu cuenta</div><h1>Nueva <em>contraseña</em></h1><div class="acc-div"></div>' +
        '<p>Crea una contraseña nueva para <b>' + esc(email) + '</b>.</p>' +
        '<form id="f" novalidate>' +
        '<div class="field"><label for="p1">Contraseña nueva</label><div class="pw"><input id="p1" type="password" autocomplete="new-password" minlength="6" required><button type="button" data-ver="p1">Ver</button></div></div>' +
        '<div class="meter" aria-hidden="true"><i id="mt"></i></div>' +
        '<div class="field"><label for="p2">Repite la contraseña</label><div class="pw"><input id="p2" type="password" autocomplete="new-password" minlength="6" required><button type="button" data-ver="p2">Ver</button></div></div>' +
        '<div class="acc-msg" id="msg" role="status"></div>' +
        '<button class="btn btn-fuchsia" type="submit">Guardar contraseña</button></form>';
      var p1 = document.getElementById("p1"), p2 = document.getElementById("p2"), mt = document.getElementById("mt"), msg = document.getElementById("msg");
      caja.addEventListener("click", function (ev) {
        var id = ev.target.getAttribute && ev.target.getAttribute("data-ver"); if (!id) return;
        var inp = document.getElementById(id), ver = inp.type === "password"; inp.type = ver ? "text" : "password"; ev.target.textContent = ver ? "Ocultar" : "Ver";
      });
      p1.addEventListener("input", function () {
        var v = p1.value, n = (v.length >= 6) + (v.length >= 10) + (/[A-Z]/.test(v) && /[a-z]/.test(v)) + (/\d/.test(v)) + (/[^A-Za-z0-9]/.test(v));
        mt.style.width = Math.min(100, n * 20) + "%"; mt.style.background = n <= 1 ? "var(--danger)" : (n <= 3 ? "var(--yellow)" : "var(--ok)");
      });
      document.getElementById("f").addEventListener("submit", function (ev) {
        ev.preventDefault(); msg.className = "acc-msg";
        if (p1.value.length < 6) { msg.textContent = "Debe tener al menos 6 caracteres."; return; }
        if (p1.value !== p2.value) { msg.textContent = "Las contraseñas no coinciden."; return; }
        msg.textContent = "Guardando…"; msg.style.color = "var(--muted)";
        llamar("accounts:resetPassword", { oobCode: codigo, newPassword: p1.value }).then(function () {
          pantalla("🏆", false, "¡Listo!", "Contraseña <em>actualizada</em>", "Ya puedes entrar con tu contraseña nueva y seguir participando en las rifas.", irInicio());
        }).catch(function (e) { msg.style.color = ""; msg.textContent = msgError(e.message); });
      });
    }).catch(function (e) {
      pantalla("⚔️", true, "Enlace no disponible", "Este enlace <em>no sirve</em>", esc(msgError(e.message)), irInicio());
    });
  }
  function verificar() {
    llamar("accounts:update", { oobCode: codigo }).then(function (j) {
      pantalla("✅", false, "¡Listo!", "Correo <em>verificado</em>", j.email ? "Verificamos <b>" + esc(j.email) + "</b>. Ya puedes seguir en Rayas Store." : "Tu correo quedó verificado.", irInicio());
    }).catch(function (e) { pantalla("⚔️", true, "Enlace no disponible", "Este enlace <em>no sirve</em>", esc(msgError(e.message)), irInicio()); });
  }

  if (!codigo) pantalla("🧭", true, "Falta algo", "Enlace <em>incompleto</em>", "Abre el enlace directamente desde el correo que te enviamos.", irInicio());
  else if (modo === "resetPassword") reset();
  else if (modo === "verifyEmail") verificar();
  else pantalla("🧭", true, "Acción no disponible", "No podemos <em>abrir esto</em>", "Esta acción no está disponible aquí. Vuelve a la tienda.", irInicio());
})();
