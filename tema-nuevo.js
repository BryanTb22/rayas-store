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

/* ---------- Íconos de línea en vez de emojis (mismo trazo, tamaño y color en todos los sistemas) ---------- */
(function () {
  var P = {
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    box: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    spark: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    left: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    ext: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    hour: '<path d="M5 22h14M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    pad: '<path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="5"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/>',
    dice: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>'
  };
  var M = { "🛒": "cart", "💰": "wallet", "🎟️": "ticket", "🎟": "ticket", "🔒": "lock", "✎": "pencil", "🗑": "trash", "📦": "box", "↻": "refresh", "🔄": "refresh", "↺": "refresh", "⚡": "zap", "✨": "spark", "🍀": "spark", "🎉": "spark",
    "💎": "gem", "🏆": "trophy", "🎁": "gift", "✔": "check", "✅": "check", "✕": "x", "→": "right", "←": "left", "↑": "up", "↓": "down", "↗": "ext", "⬇": "download", "💾": "save", "📷": "camera", "👤": "user", "👥": "users",
    "💬": "chat", "⏳": "hour", "🔗": "link", "⚙": "gear", "📚": "layers", "💳": "card", "💵": "cash", "🧾": "receipt", "📧": "mail", "⚠": "alert", "➕": "plus", "🎮": "pad", "🔥": "flame", "💜": "heart", "🎬": "film",
    "🎰": "dice", "🎲": "dice", "😕": "help", "🙈": "help" };
  var claves = Object.keys(M).sort(function (a, b) { return b.length - a.length; });
  var RE = new RegExp("(" + claves.join("|") + ")\\uFE0F?", "g");
  function svg(n) { return '<span class="tn-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + P[n] + "</svg></span>"; }
  var NO = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, TITLE: 1 };
  function pasar(raiz) {
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, null), lista = [], n;
    while ((n = w.nextNode())) { if (n.nodeValue && !NO[n.parentNode.nodeName] && (RE.lastIndex = 0, RE.test(n.nodeValue) || /\((\d+)\)\s*$/.test(n.nodeValue) && n.parentNode.closest && n.parentNode.closest(".svc-tab.carrito"))) lista.push(n); }
    lista.forEach(function (t) {
      var esCarro = t.parentNode.closest && t.parentNode.closest(".svc-tab.carrito"), html = t.nodeValue.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      RE.lastIndex = 0; html = html.replace(RE, function (m, e) { return svg(M[e]); });
      if (esCarro) html = html.replace(/\((\d+)\)\s*$/, '<span class="tn-badge">$1</span>');
      var tmp = document.createElement("span"); tmp.innerHTML = html;
      var f = document.createDocumentFragment(); while (tmp.firstChild) f.appendChild(tmp.firstChild);
      t.parentNode.replaceChild(f, t);
    });
  }
  var app = document.getElementById("app"), pend = false;
  function agendar() { if (pend) return; pend = true; requestAnimationFrame(function () { pend = false; try { pasar(document.body); } catch (e) { /* sin íconos, queda el emoji */ } }); }
  if (window.MutationObserver) new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
  agendar();
})();
