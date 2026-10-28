/* Tema nuevo de Rayas Store: fondo con luces y partículas (brasas amarillas y fucsias).
   Solo se carga si el tema nuevo está activo (ver el cargador en index.html). */
(function () {
  "use strict";
  if (document.getElementById("tnParticulas")) return;
  var fondo = document.createElement("div"); fondo.id = "tnFondo"; fondo.setAttribute("aria-hidden", "true"); fondo.innerHTML = "<i></i><i></i><i></i>";
  var cv = document.createElement("canvas"); cv.id = "tnParticulas"; cv.setAttribute("aria-hidden", "true");
  document.body.insertBefore(cv, document.body.firstChild); document.body.insertBefore(fondo, cv);
  var ctx = cv.getContext("2d"), W = 0, H = 0, ps = [], vivo = true, reducir = false;
  try { reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* sin matchMedia */ }
  function nueva(abajo) {
    var f = Math.random() > .35;   // amarillo dorado o fucsia
    return { x: Math.random() * W, y: abajo ? H + 10 : Math.random() * H, r: Math.random() * 2.1 + .6, vy: -(Math.random() * .42 + .1), vx: (Math.random() - .5) * .28,
      a: Math.random() * .6 + .2, t: Math.random() * 6.28, ts: Math.random() * .03 + .008, h: f ? 44 + Math.random() * 8 : 328 + Math.random() * 14 };
  }
  function medir() {
    W = cv.width = window.innerWidth; H = cv.height = window.innerHeight;
    var n = Math.min(70, Math.floor(W / (W < 700 ? 18 : 22)));
    while (ps.length < n) ps.push(nueva(false));
    ps.length = n;
  }
  window.addEventListener("resize", medir); medir();
  document.addEventListener("visibilitychange", function () { vivo = !document.hidden; if (vivo) cuadro(); });
  function cuadro() {
    if (!vivo || reducir) return;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i]; p.y += p.vy; p.x += p.vx + Math.sin(p.t) * .12; p.t += p.ts;
      if (p.y < -10) ps[i] = nueva(true); else if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      var al = p.a * (.55 + .45 * Math.sin(p.t * 3));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fillStyle = "hsla(" + p.h + ",95%,62%," + al + ")"; ctx.shadowBlur = 10; ctx.shadowColor = "hsla(" + p.h + ",95%,55%,.85)"; ctx.fill();
    }
    requestAnimationFrame(cuadro);
  }
  if (!reducir) cuadro();
})();
