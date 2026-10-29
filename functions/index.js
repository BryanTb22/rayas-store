"use strict";
const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const rec = require("./recordatorio");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { packPorSoles, MIN_ORDEN, totalConComision } = require("./packs");
const culqi = require("./culqi");
const sets = require("./sets");
const inv = require("./inventario");
const sc = require("./steamcache");
const { enviarCorreo } = require("./correo");
const emails = require("./emails");

admin.initializeApp();
const db = admin.firestore();
const FV = admin.firestore.FieldValue;

const CULQI_SECRET = defineSecret("CULQI_SECRET_KEY");   // sk_test_... / sk_live_...
const WEBHOOK_KEY = defineSecret("CULQI_WEBHOOK_KEY");   // clave inventada por ti, va en la URL del webhook
const RESEND_KEY = defineSecret("RESEND_API_KEY");       // llave de Resend para enviar los correos
const REGION = "us-central1";

// Correos: cuánto esperar para el recordatorio del código de pago pendiente (las órdenes de Culqi duran 24 h).
const RECORDATORIO_MIN_HORAS = 2;    // no antes de 2 h después de generar el código
const RECORDATORIO_MAX_HORAS = 20;   // ni después de 20 h (ya casi vence)
const EXPIRA_HORAS = 25;             // pasadas 25 h la orden ya venció: se marca "expirada"
const ORIGENES = ["https://rayas.trade", "https://www.rayas.trade", "https://litlejacob.trade", "https://www.litlejacob.trade"];

/* ---------- utilidades ---------- */
async function uidDeLaPeticion(req) {
  const h = String(req.get("Authorization") || "");
  if (!h.startsWith("Bearer ")) return null;
  try { return (await admin.auth().verifyIdToken(h.slice(7))).uid; } catch (e) { return null; }
}
const ADMIN_UID = "eLEZkdXiG5b0PpxHQCCei8D0Qxy1";
// Lee el interruptor que el admin publica en rayas/estado (campo json -> pagos.culqi).
async function cobroActivo() {
  try {
    const s = await db.doc("rayas/estado").get();
    const j = s.exists ? JSON.parse(String(s.data().json || "{}")) : {};
    return !!(j.pagos && j.pagos.culqi === true);
  } catch (e) { return false; }
}
function igual(a, b) {
  const x = Buffer.from(String(a).trim()), y = Buffer.from(String(b).trim());
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
// Desde qué web se hizo el pago (para usar el diseño de correo de esa tienda).
function tiendaDeOrigen(req) {
  return /litlejacob/i.test(String(req.get("Origin") || "")) ? "litlejacob" : "rayas";
}
const aFecha = (t) => (t && t.toDate ? t.toDate() : new Date());

// Correo de "pago confirmado". Nunca rompe el pago: si falla, queda marcado y el barrido lo reintenta.
async function correoPagoConfirmado(pagoId, p, u) {
  const c = emails.confirmacion(p.tienda || "rayas", {
    id: pagoId, nombre: u.nombre, soles: p.soles, creditos: p.creditosAcreditados,
    tipo: p.tipo, pagadoEn: aFecha(p.acreditado), saldo: p.saldoTras
  });
  await enviarCorreo(RESEND_KEY.value(), { from: c.from, to: u.email, subject: c.subject, html: c.html, text: c.text, clave: "pago-" + pagoId });
  await db.doc("rayas_pagos/" + pagoId).update({ correoPagoEnviado: true });
}
// Se llama justo después de acreditar. Si el pago ya estaba acreditado (aviso repetido), no hace nada.
async function avisarPagoAcreditado(pagoId, a) {
  if (!a || a.ya) return;
  try {
    const pSnap = await db.doc("rayas_pagos/" + pagoId).get();
    const uSnap = await db.doc("rayas_users/" + pSnap.data().uid).get();
    if (!uSnap.exists || !uSnap.data().email) return;
    await correoPagoConfirmado(pagoId, pSnap.data(), uSnap.data());
  } catch (e) { console.error("correo de pago", pagoId, e); }
}

/*
 * Suma los créditos de un pago, UNA sola vez.
 * Se ejecuta en una transacción: si el webhook y la petición del cliente llegan a la vez,
 * solo uno acredita; el otro ve estado "acreditado" y no hace nada.
 */
async function acreditar(pagoId, chargeId) {
  return db.runTransaction(async (tx) => {
    const pRef = db.doc("rayas_pagos/" + pagoId);
    const p = await tx.get(pRef);
    if (!p.exists) throw new Error("PAGO_NO_EXISTE");
    const d = p.data();
    const uRef = db.doc("rayas_users/" + d.uid);
    const u = await tx.get(uRef);
    if (!u.exists) throw new Error("USUARIO_NO_EXISTE");
    const saldo = Number(u.data().creditos || 0);
    if (d.estado === "acreditado") return { ya: true, creditos: d.creditosAcreditados, saldo: saldo };

    // La promo de primera recarga se decide AQUÍ, no al crear el pago: así dos pagos
    // pendientes no pueden cobrar la promo los dos.
    const conPromo = !!d.promoCreditos && !u.data().promoUsada;
    const creditos = conPromo ? d.promoCreditos : d.baseCreditos;

    const cambiosUsuario = { creditos: FV.increment(creditos) };
    if (conPromo) cambiosUsuario.promoUsada = true;
    tx.update(uRef, cambiosUsuario);
    tx.update(pRef, {
      estado: "acreditado", chargeId: chargeId, creditosAcreditados: creditos,
      promoAplicada: conPromo, acreditado: FV.serverTimestamp(),
      saldoTras: saldo + creditos, correoPagoEnviado: false   // false = falta enviar el correo de confirmación
    });
    return { ya: false, creditos: creditos, saldo: saldo + creditos, promo: conPromo };
  });
}

/* ---------- 1) El cliente paga: recibe un token de Culqi y lo manda aquí ---------- */
exports.cobrar = onRequest(
  { region: REGION, cors: ORIGENES, secrets: [CULQI_SECRET, RESEND_KEY], maxInstances: 5, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const uid = await uidDeLaPeticion(req);
    if (!uid) return res.status(401).json({ error: "Inicia sesión para recargar." });

    // Interruptor del admin (Panel → Textos y contactos → "Cobrar con Culqi"). Apagado = nadie cobra, salvo el admin para probar.
    const esAdmin = uid === ADMIN_UID;
    if (!esAdmin && !(await cobroActivo())) return res.status(403).json({ error: "Los pagos en línea están desactivados por ahora. Pide tu recarga por WhatsApp." });
    // Candado: con llaves de PRUEBA (sk_test_) solo el admin puede "pagar"; así nadie recibe créditos gratis por error.
    if (!esAdmin && String(CULQI_SECRET.value()).trim().startsWith("sk_test")) {
      return res.status(403).json({ error: "Los pagos en línea aún no están habilitados. Pide tu recarga por WhatsApp." });
    }

    const body = req.body || {};
    const pack = packPorSoles(body.soles);
    const tokenId = String(body.tokenId || "");
    if (!pack || !/^[\w-]{8,120}$/.test(tokenId)) return res.status(400).json({ error: "Datos de pago inválidos." });

    const uSnap = await db.doc("rayas_users/" + uid).get();
    if (!uSnap.exists) return res.status(400).json({ error: "Completa tu perfil antes de recargar." });
    const email = String(uSnap.data().email || "");
    if (!email) return res.status(400).json({ error: "Tu cuenta no tiene correo." });

    // Registro del intento ANTES de cobrar: sirve de rastro y de llave contra duplicados.
    const totalCobro = totalConComision(pack.soles);   // incluye la comisión de Culqi (la paga el comprador)
    const pRef = db.collection("rayas_pagos").doc();
    await pRef.set({
      uid: uid, tienda: tiendaDeOrigen(req), packId: pack.id, soles: pack.soles, total: totalCobro, comision: Math.round((totalCobro - pack.soles) * 100) / 100, medio: "tarjeta", baseCreditos: pack.base,
      promoCreditos: pack.promo || 0, estado: "procesando", creado: FV.serverTimestamp()
    });

    let r;
    try {
      r = await culqi.crearCargo(CULQI_SECRET.value(), {
        montoCentimos: Math.round(totalCobro * 100), email: email, tokenId: tokenId, pagoId: pRef.id, uid: uid
      });
    } catch (e) {
      // Sin respuesta de Culqi: NO sabemos si cobró. Queda para revisión (y el webhook puede acreditarlo).
      await pRef.update({ estado: "revisar", error: String(e && e.message || e) });
      return res.status(502).json({ error: "No pudimos confirmar el pago. Si te cobraron, tu saldo llegará solo en unos minutos; no pagues otra vez." });
    }

    if (!r.pagado) {
      const msg = (r.cargo && (r.cargo.user_message || r.cargo.merchant_message)) || "El pago no fue aprobado.";
      await pRef.update({ estado: "rechazado", respuestaStatus: r.status, mensaje: String(msg).slice(0, 300) });
      return res.status(402).json({ error: msg });
    }

    try {
      const a = await acreditar(pRef.id, r.cargo.id);
      await avisarPagoAcreditado(pRef.id, a);   // correo de "pago confirmado" (no rompe el pago si falla)
      return res.json({ ok: true, creditos: a.creditos, saldo: a.saldo, promo: !!a.promo, pagado: totalCobro });
    } catch (e) {
      // Cobrado pero no acreditado: queda marcado para que el webhook o el admin lo resuelvan.
      await pRef.update({ estado: "cobrado_sin_acreditar", chargeId: r.cargo.id, error: String(e && e.message || e) });
      return res.status(500).json({ error: "Tu pago se recibió pero hubo un problema al sumar tu saldo. Escríbenos por WhatsApp con tu correo; no pagues otra vez." });
    }
  }
);

/* ---------- 1b) Comprar sets caché de LitleJacob Store con créditos ----------
 * POST { items: [{ id, qty, name }] } con la sesión del cliente.
 * Descuenta los créditos y crea el pedido (estado "pagado") en una sola transacción.
 */
exports.comprarSets = onRequest(
  { region: REGION, cors: ORIGENES, maxInstances: 5, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const uid = await uidDeLaPeticion(req);
    if (!uid) return res.status(401).json({ error: "Inicia sesión para pagar con tu saldo." });

    const liveSnap = await db.doc("live/catalog").get();
    const live = liveSnap.exists ? (liveSnap.data().sets || {}) : {};
    let q;
    try { q = sets.cotizar((req.body || {}).items, live); }
    catch (e) {
      const m = String(e && e.message || "");
      const msg = /^AGOTADO|^SIN_STOCK/.test(m) ? "Uno de los sets de tu carrito ya no tiene stock. Actualiza la página y revisa tu carrito."
        : /^SIN_PRECIO/.test(m) ? "Uno de los sets no tiene precio disponible. Pídelo por WhatsApp."
        : "Tu carrito no es válido. Actualiza la página e intenta de nuevo.";
      return res.status(400).json({ error: msg });
    }

    const uRef = db.doc("rayas_users/" + uid);
    const code = sets.nuevoCodigo();
    const oRef = db.doc("orders/" + code);
    try {
      const r = await db.runTransaction(async (tx) => {
        const u = await tx.get(uRef);
        if (!u.exists) throw new Error("SIN_PERFIL");
        const d = u.data();
        const saldo = Number(d.creditos || 0);
        if (saldo < q.creditos) { const er = new Error("SIN_CREDITOS"); er.falta = q.creditos - saldo; throw er; }
        const pedido = {
          code: code, customerName: String(d.nombre || "Cliente").slice(0, 60), steamId: String(d.steam || "").slice(0, 20),
          items: q.lineas.map((l) => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })),
          count: q.count, subtotal: q.subtotal, discount: q.discount, total: q.total,
          status: "pagado", createdAt: FV.serverTimestamp(),
          paidWith: "creditos", creditos: q.creditos, uid: uid,
          email: String(d.email || ""), tradelink: String(d.tradelink || "")
        };
        if (d.whatsapp) pedido.phone = String(d.whatsapp).slice(0, 40);
        tx.update(uRef, { creditos: FV.increment(-q.creditos) });
        tx.create(oRef, pedido);
        return { saldo: saldo - q.creditos };
      });
      return res.json({ ok: true, code: code, creditos: q.creditos, total: q.total, saldo: r.saldo });
    } catch (e) {
      if (e && e.message === "SIN_CREDITOS") return res.status(402).json({ error: "No te alcanza el saldo. Te faltan " + e.falta + ".", falta: e.falta });
      if (e && e.message === "SIN_PERFIL") return res.status(400).json({ error: "Completa tu perfil antes de comprar." });
      console.error("comprarSets", e);
      return res.status(500).json({ error: "No se pudo completar la compra. No se descontó saldo; intenta de nuevo." });
    }
  }
);

/* ---------- 1b2) Comprar UN item del catálogo (rayas_items) con créditos ----------
 * 1 crédito = S/ 1. Créditos del item = precio redondeado hacia arriba. Todo en una transacción.
 */
exports.comprarItem = onRequest(
  { region: REGION, cors: ORIGENES, secrets: [RESEND_KEY], maxInstances: 5, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const uid = await uidDeLaPeticion(req);
    if (!uid) return res.status(401).json({ error: "Inicia sesión para pagar con tu saldo." });
    // Acepta { id } (1 unidad) o { items: [{ id, qty }] } (carrito, hasta 20 líneas).
    const body = req.body || {};
    let pedidoLineas = Array.isArray(body.items) ? body.items : [{ id: body.id, qty: 1 }];
    pedidoLineas = pedidoLineas.slice(0, 20).map((l) => ({ id: String((l && l.id) || "").slice(0, 80), qty: Math.floor(Number(l && l.qty) || 0) }));
    const unicos = {};
    for (const l of pedidoLineas) {
      if (!l.id || l.id.indexOf("/") >= 0 || l.qty < 1 || l.qty > 50) return res.status(400).json({ error: "Item no válido." });
      unicos[l.id] = (unicos[l.id] || 0) + l.qty;
    }
    const ids = Object.keys(unicos);
    if (!ids.length) return res.status(400).json({ error: "Tu carrito está vacío." });

    const code = sets.nuevoCodigo();
    const oRef = db.doc("orders/" + code);
    try {
      const r = await db.runTransaction(async (tx) => {
        const uRef2 = db.doc("rayas_users/" + uid);
        const refs = ids.map((i) => db.doc("rayas_items/" + i));
        const snaps = await Promise.all(refs.map((rf) => tx.get(rf)));
        const u = await tx.get(uRef2);
        const lineas = []; let total = 0, creditos = 0, count = 0;
        snaps.forEach((sn, k) => {
          if (!sn.exists || sn.data().activo === false) throw new Error("NO_EXISTE");
          const it = sn.data(), qty = unicos[ids[k]];
          const stock = it.stock === undefined ? 1 : Number(it.stock);
          if (stock < qty) throw new Error("AGOTADO");
          const precio = Number(it.precio);
          if (!(precio > 0)) throw new Error("SIN_PRECIO");
          lineas.push({ ref: refs[k], stock: stock, qty: qty, line: { id: ids[k], name: String(it.nombre || "Item").slice(0, 90), qty: qty, price: precio } });
          total += precio * qty; creditos += Math.ceil(precio) * qty; count += qty;
        });
        total = Math.round(total * 100) / 100;
        if (!u.exists) throw new Error("SIN_PERFIL");
        const d = u.data();
        const saldo = Number(d.creditos || 0);
        if (saldo < creditos) { const er = new Error("SIN_CREDITOS"); er.falta = creditos - saldo; throw er; }
        const pedido = {
          code: code, customerName: String(d.nombre || "Cliente").slice(0, 60), steamId: String(d.steam || "").slice(0, 20),
          items: lineas.map((l) => l.line),
          count: count, subtotal: total, discount: 0, total: total,
          status: "pagado", createdAt: FV.serverTimestamp(),
          paidWith: "creditos", creditos: creditos, uid: uid, origen: "items", tienda: tiendaDeOrigen(req),
          email: String(d.email || ""), tradelink: String(d.tradelink || "")
        };
        if (d.whatsapp) pedido.phone = String(d.whatsapp).slice(0, 40);
        tx.update(uRef2, { creditos: FV.increment(-creditos) });
        lineas.forEach((l) => tx.update(l.ref, { stock: l.stock - l.qty }));
        tx.create(oRef, pedido);
        return { saldo: saldo - creditos, creditos: creditos, count: count, pedido: pedido };
      });
      // Aviso al correo del administrador. Nunca rompe la compra: si falla, el pedido igual queda en el panel.
      try {
        const a = String((await admin.auth().getUser(ADMIN_UID)).email || "");
        if (a) {
          const p = r.pedido;
          const c = emails.pedidoNuevo(p.tienda, { code: code, nombre: p.customerName, steamId: p.steamId, email: p.email, whatsapp: p.phone, tradelink: p.tradelink, items: p.items, total: p.total, creditos: p.creditos, creadoEn: new Date() });
          await enviarCorreo(RESEND_KEY.value(), { from: c.from, to: a, subject: c.subject, html: c.html, text: c.text, clave: "pedido-" + code });
        }
      } catch (e) { console.error("comprarItem correo admin", e); }
      return res.json({ ok: true, code: code, creditos: r.creditos, saldo: r.saldo, count: r.count });
    } catch (e) {
      const m = e && e.message;
      if (m === "SIN_CREDITOS") return res.status(402).json({ error: "No te alcanza el saldo. Te faltan " + e.falta + ".", falta: e.falta });
      if (m === "SIN_PERFIL") return res.status(400).json({ error: "Completa tu perfil antes de comprar." });
      if (m === "AGOTADO" || m === "NO_EXISTE") return res.status(400).json({ error: "Uno de los items ya no está disponible (o no alcanza el stock). Revisa tu carrito." });
      if (m === "SIN_PRECIO") return res.status(400).json({ error: "Este item no tiene precio. Pídelo por WhatsApp." });
      console.error("comprarItem", e);
      return res.status(500).json({ error: "No se pudo completar la compra. No se descontó saldo; intenta de nuevo." });
    }
  }
);

/* Límite de consultas: cuenta intentos por clave (IP o steamId) en una ventana de tiempo, con Firestore. */
async function dentroDelLimite(clave, max, ventanaMs) {
  const id = "inv_" + crypto.createHash("sha256").update(String(clave)).digest("hex").slice(0, 32);
  const ref = db.doc("rayas_limites/" + id);
  try {
    return await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const ahora = Date.now();
      let d = s.exists ? s.data() : null;
      if (!d || ahora - d.desde > ventanaMs) d = { desde: ahora, n: 0 };
      if (d.n >= max) return false;
      tx.set(ref, { desde: d.desde, n: d.n + 1 });
      return true;
    });
  } catch (e) { console.error("limite", e); return true; } // si falla el contador, no bloquea a clientes reales
}
function ipDeLaPeticion(req) {
  const xf = String(req.get("X-Forwarded-For") || "").split(",").map((x) => x.trim()).filter(Boolean);
  return xf.length ? xf[xf.length - 1] : (req.ip || "desconocida");
}

/* ---------- Vender items: inventario de Dota 2 del cliente (por su trade link) ---------- */
exports.inventario = onRequest(
  { region: REGION, cors: ORIGENES, maxInstances: 3, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const sid = inv.steamIdDeTradeLink((req.body || {}).link);
    if (!sid) return res.status(400).json({ error: "Ese no parece un trade link. Debe tener ?partner=…&token=…" });
    // Máximo 12 consultas cada 10 min por conexión y 6 por inventario, para que nadie sature a Steam desde aquí.
    const okIp = await dentroDelLimite("ip:" + ipDeLaPeticion(req), 12, 10 * 60 * 1000);
    const okSid = okIp && await dentroDelLimite("sid:" + sid, 6, 10 * 60 * 1000);
    if (!okIp || !okSid) return res.status(429).json({ error: "Demasiadas consultas seguidas. Espera unos minutos e intenta de nuevo." });
    try {
      const detalle = (req.body || {}).detalle === true;
      // El inventario de un mismo cliente se guarda 10 min: consultas repetidas no vuelven a molestar a Steam.
      const x = await sc.conCache(db, "inv:" + sid + ":" + (detalle ? "d" : "n"), 10 * 60 * 1000, async () => {
        const r = await fetch("https://steamcommunity.com/inventory/" + sid + "/570/2?l=english&count=2000", {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; RayasStore/1.0)", "Accept": "application/json" }
        });
        if (r.status === 403 || r.status === 401) { const e = new Error("priv"); e.http = 403; throw e; }
        if (r.status === 429) { const e = new Error("429"); e.limite = true; throw e; }
        if (r.status === 500) { const e = new Error("nolee"); e.http = 404; throw e; }
        if (!r.ok) { const e = new Error("steam " + r.status); e.http = 502; throw e; }
        const data = await r.json();
        if (!data || !data.assets) return { items: [], noTradables: 0 };
        return detalle ? inv.agruparDetalle(data) : inv.agrupar(data);
      });
      return res.json(Object.assign({ ok: true }, x.valor));
    } catch (e) {
      if (e && e.limite) return res.status(429).json({ error: "Steam está limitando las consultas. Intenta de nuevo en unos minutos." });
      if (e && e.http === 403) return res.status(403).json({ error: "Tu inventario es privado. En Steam: Perfil → Editar perfil → Privacidad → Inventario: Público." });
      if (e && e.http === 404) return res.status(404).json({ error: "No se pudo leer ese inventario. Revisa tu trade link y que tu inventario sea público." });
      console.error("inventario", e);
      return res.status(502).json({ error: "No se pudo consultar Steam. Intenta de nuevo en un momento." });
    }
  }
);

/* ---------- 1c) Pagar en efectivo / QR / billeteras: se crea una ORDEN en Culqi ----------
 * El cliente recibe el código (CIP) o QR en la ventana de Culqi y paga cuando quiera (hasta 24 h).
 * Los créditos se suman cuando Culqi avisa por el webhook (orden "paid"). Aquí no se suma nada.
 */
exports.crearOrden = onRequest(
  { region: REGION, cors: ORIGENES, secrets: [CULQI_SECRET], maxInstances: 5, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const uid = await uidDeLaPeticion(req);
    if (!uid) return res.status(401).json({ error: "Inicia sesión para recargar." });
    const esAdmin = uid === ADMIN_UID;
    if (!esAdmin && !(await cobroActivo())) return res.status(403).json({ error: "Los pagos en línea están desactivados por ahora. Pide tu recarga por WhatsApp." });
    if (!esAdmin && String(CULQI_SECRET.value()).trim().startsWith("sk_test")) {
      return res.status(403).json({ error: "Los pagos en línea aún no están habilitados. Pide tu recarga por WhatsApp." });
    }
    const pack = packPorSoles((req.body || {}).soles);
    if (!pack || pack.soles < MIN_ORDEN) return res.status(400).json({ error: "Para pagar en efectivo o con QR el monto mínimo es S/ " + MIN_ORDEN + "." });

    const uSnap = await db.doc("rayas_users/" + uid).get();
    if (!uSnap.exists) return res.status(400).json({ error: "Completa tu perfil antes de recargar." });
    const u = uSnap.data();
    const email = String(u.email || "");
    if (!email) return res.status(400).json({ error: "Tu cuenta no tiene correo." });
    let tel = String(u.whatsapp || "").replace(/\D+/g, "");
    if (tel.length === 9) tel = "51" + tel;
    if (tel.length < 9) tel = "51999999999";

    const totalCobro = totalConComision(pack.soles);   // incluye la comisión (la paga el comprador)
    const pRef = db.collection("rayas_pagos").doc();
    await pRef.set({
      uid: uid, tienda: tiendaDeOrigen(req), tipo: "orden", medio: "efectivo/qr", packId: pack.id, soles: pack.soles, total: totalCobro, comision: Math.round((totalCobro - pack.soles) * 100) / 100, baseCreditos: pack.base,
      promoCreditos: pack.promo || 0, estado: "procesando", creado: FV.serverTimestamp()
    });
    let r;
    try {
      r = await culqi.crearOrden(CULQI_SECRET.value(), {
        montoCentimos: Math.round(totalCobro * 100), email: email, nombre: u.nombre, telefono: tel, pagoId: pRef.id, uid: uid,
        numero: "REC-" + pRef.id.slice(0, 14), venceUnix: Math.floor(Date.now() / 1000) + 24 * 3600
      });
    } catch (e) {
      await pRef.update({ estado: "error_orden", error: String(e && e.message || e) });
      return res.status(502).json({ error: "No pudimos generar tu código de pago. Intenta de nuevo en un momento." });
    }
    if (!r.creada) {
      const msg = (r.orden && (r.orden.user_message || r.orden.merchant_message)) || "No se pudo generar el pago.";
      await pRef.update({ estado: "error_orden", respuestaStatus: r.status, mensaje: String(msg).slice(0, 300) });
      return res.status(400).json({ error: msg });
    }
    await pRef.update({ estado: "pendiente", ordenId: r.orden.id });
    return res.json({ ok: true, ordenId: r.orden.id, pagoId: pRef.id, soles: pack.soles, total: totalCobro });
  }
);

/* ---------- 2) Webhook de Culqi: red de seguridad ----------
 * Solo usa el id del cargo del aviso y le PREGUNTA a Culqi si de verdad está pagado,
 * así que un aviso falso no puede acreditar nada.
 * URL a registrar en el panel de Culqi:
 *   https://us-central1-litlejacob-store.cloudfunctions.net/webhookCulqi?k=TU_CULQI_WEBHOOK_KEY
 */
exports.webhookCulqi = onRequest(
  { region: REGION, secrets: [CULQI_SECRET, WEBHOOK_KEY, RESEND_KEY], maxInstances: 3 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).end();
    if (!igual(req.query.k || "", WEBHOOK_KEY.value())) return res.status(403).end();

    let data = (req.body || {}).data;
    if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = null; } }
    // Aviso de ORDEN (PagoEfectivo / QR / billeteras): se pregunta a Culqi el estado real y se acredita una sola vez.
    if (data && data.object === "order" && typeof data.id === "string") {
      try {
        const g = await culqi.obtenerOrden(CULQI_SECRET.value(), data.id);
        const pagoId = g.orden && g.orden.metadata && g.orden.metadata.pagoId;
        if (!pagoId) return res.status(200).send("sin pago asociado");
        const pSnap = await db.doc("rayas_pagos/" + pagoId).get();
        if (!pSnap.exists) return res.status(200).send("pago desconocido");
        const p = pSnap.data();
        if (p.ordenId !== data.id || g.orden.metadata.uid !== p.uid || !culqi.ordenPagada(g.orden, Math.round((p.total || p.soles) * 100))) return res.status(200).send("no pagado");
        await avisarPagoAcreditado(pagoId, await acreditar(pagoId, data.id));
        return res.status(200).send("ok");
      } catch (e) {
        console.error("webhookCulqi orden", e);
        return res.status(500).send("error");
      }
    }
    const chargeId = data && data.object === "charge" && typeof data.id === "string" ? data.id : "";
    if (!chargeId) return res.status(200).send("ignorado");

    try {
      const g = await culqi.obtenerCargo(CULQI_SECRET.value(), chargeId);
      const pagoId = g.cargo && g.cargo.metadata && g.cargo.metadata.pagoId;
      if (!pagoId) return res.status(200).send("sin pago asociado");
      const pSnap = await db.doc("rayas_pagos/" + pagoId).get();
      if (!pSnap.exists) return res.status(200).send("pago desconocido");
      const p = pSnap.data();
      if (g.cargo.metadata.uid !== p.uid || !culqi.cargoPagado(g.cargo, Math.round((p.total || p.soles) * 100))) {
        return res.status(200).send("no pagado");
      }
      await avisarPagoAcreditado(pagoId, await acreditar(pagoId, chargeId));
      return res.status(200).send("ok");
    } catch (e) {
      console.error("webhookCulqi", e);
      return res.status(500).send("error");   // Culqi reintenta
    }
  }
);

/* ---------- recordatorio diario de entregas (8:00 a. m. hora de Lima) ---------- */
const RECORDATORIO_URL = defineSecret("RECORDATORIO_URL"); // dirección /exec de tu Apps Script que manda el correo
exports.recordatorioEntregas = onSchedule({ schedule: "0 8 * * *", timeZone: "America/Lima", region: REGION, secrets: [RECORDATORIO_URL] }, async () => {
  const [os, cs] = await Promise.all([db.collection("orders").where("status", "==", "pagado").get(), db.collection("customers").get()]);
  const clientes = {}; cs.forEach((d) => { clientes[d.id] = d.data(); });
  const lista = rec.resumen(rec.pedidosParaEntregar(os.docs.map((d) => d.data()), clientes, rec.hoyLima()));
  if (!lista.length) return;
  const r = await fetch(String(RECORDATORIO_URL.value()).trim(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ recordatorio: true, fecha: rec.hoyLima(), pedidos: lista }) });
  console.log("recordatorio enviado", lista.length, r.status);
});

/* ---- Admin: manda 4 correos de EJEMPLO (confirmación y pendiente, de cada tienda) al correo del administrador. No cobra ni toca saldos. ---- */
exports.probarCorreos = onRequest(
  { region: REGION, cors: ORIGENES, secrets: [RESEND_KEY], maxInstances: 1, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const uid = await uidDeLaPeticion(req);
    if (uid !== ADMIN_UID) return res.status(403).json({ error: "Solo el administrador puede usar esto." });
    let a;
    try { a = String((await admin.auth().getUser(uid)).email || ""); } catch (e) { a = ""; }
    if (!a) return res.status(400).json({ error: "La cuenta de administrador no tiene correo." });
    const ahora = new Date(), venc = new Date(ahora.getTime() + 22 * 3600 * 1000), tanda = String(Date.now());
    let enviados = 0, fallaron = 0, error = "";
    for (const tienda of ["rayas", "litlejacob"]) {
      const lista = [
        ["confirmacion", emails.confirmacion(tienda, { id: "prueba" + tienda, nombre: "Bryan", soles: 10, creditos: 12, tipo: "tarjeta", pagadoEn: ahora, saldo: 15 })],
        ["pendiente", emails.recordatorio(tienda, { id: "prueba" + tienda, nombre: "Bryan", soles: 10, creditos: 12, expiraEn: venc })]
      ];
      for (const [nombre, c] of lista) {
        try {
          await enviarCorreo(RESEND_KEY.value(), { from: c.from, to: a, subject: "[PRUEBA] " + c.subject, html: c.html, text: c.text, clave: "prueba-" + tanda + "-" + tienda + "-" + nombre });
          enviados++;
        } catch (e) { fallaron++; error = String((e && e.message) || e).slice(0, 200); console.error("probarCorreos", tienda, nombre, e); }
      }
    }
    if (!enviados) return res.status(502).json({ error: "No se pudo enviar ningún correo. " + error });
    res.json({ ok: true, a: a, enviados: enviados, fallaron: fallaron, error: error });
  }
);

/* ---- Admin: rellenar un item de "Comprar items" desde su link del Mercado de Steam ---- */
const steam = require("./steam");
exports.itemSteam = onRequest(
  { region: REGION, cors: ORIGENES, maxInstances: 2, timeoutSeconds: 45 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const uid = await uidDeLaPeticion(req);
    if (uid !== ADMIN_UID) return res.status(403).json({ error: "Solo el administrador puede usar esto." });
    const nombre = steam.nombreDesdeLink((req.body || {}).link);
    if (!nombre) return res.status(400).json({ error: "Pega un link del Mercado de Steam de Dota 2 (steamcommunity.com/market/listings/570/…)." });
    try {
      // Un item ya leído se guarda 24 h; "refrescar" lo vuelve a pedir a Steam (salvo que Steam esté en pausa).
      const x = await sc.conCache(db, "item:" + nombre, 24 * 3600 * 1000, () => steam.leerItem(nombre), { forzar: (req.body || {}).refrescar === true });
      res.json({ ok: true, item: x.valor, deCache: x.deCache, viejo: x.viejo });
    } catch (e) {
      res.status(e && e.limite ? 429 : 502).json({ error: (e && e.message) || "No se pudo leer el item de Steam." });
    }
  }
);

/* ---- Admin: precios de referencia del Mercado de Steam (US$) para varios items; el navegador los guarda y los convierte a soles ---- */
exports.preciosSteam = onRequest(
  { region: REGION, cors: ORIGENES, maxInstances: 1, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const uid = await uidDeLaPeticion(req);
    if (uid !== ADMIN_UID) return res.status(403).json({ error: "Solo el administrador puede usar esto." });
    const nombres = ((req.body || {}).nombres || []).filter((n) => typeof n === "string" && n.trim() && n.length <= 150).slice(0, 6);
    const precios = {}; let limite = false, pidio = false;
    for (let i = 0; i < nombres.length; i++) {
      try {
        // Cada precio vale 6 h en caché: solo se consulta a Steam lo que falte, con 2,6 s entre consultas.
        const x = await sc.conCache(db, "precio:" + nombres[i], 6 * 3600 * 1000, async () => {
          if (pidio) await new Promise((r) => setTimeout(r, 2600));
          pidio = true;
          const y = await steam.precioUsd(nombres[i]);
          if (y.limite) { const e = new Error("429"); e.limite = true; throw e; }
          return { usd: y.usd };
        });
        if (x.valor && x.valor.usd) precios[nombres[i]] = x.valor.usd;
      } catch (e) { if (e && e.limite) { limite = true; break; } }
    }
    res.json({ ok: true, precios, limite });
  }
);

/* ---------- Entrar con Steam (OpenID): ver functions/steamlogin.js y STEAM_LOGIN.md ---------- */
Object.assign(exports, require("./steamlogin").crear({ admin, db, onRequest, REGION, ORIGENES, uidDeLaPeticion, ADMIN_UID }));

/* ---------- Libro de Reclamaciones (hoja virtual): ver functions/reclamos.js ---------- */
Object.assign(exports, require("./reclamos").crear({ admin, db, onRequest, REGION, ORIGENES, RESEND_KEY, ADMIN_UID }));

/* ---------- Rifas: participar descontando créditos (todo se calcula aquí, nunca en el navegador) ---------- */
function tiempoRifa(iso) { const t = iso ? new Date(iso).getTime() : 0; return isFinite(t) ? t : 0; }
function faseRifa(p) {
  if (p.estado === "oculta" || p.estado === "cerrada" || p.estado === "proxima") return p.estado;
  const ini = tiempoRifa(p.inicio), fin = tiempoRifa(p.cierre), ahora = Date.now();
  if (ini && ini > ahora) return "porIniciar";
  if (fin && fin <= ahora) return "vencida";
  return "activa";
}
exports.participarRifa = onRequest(
  { region: REGION, cors: ORIGENES, maxInstances: 5, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const uid = await uidDeLaPeticion(req);
    if (!uid) return res.status(401).json({ error: "Inicia sesión para participar." });
    if (uid === ADMIN_UID) return res.status(400).json({ error: "Estás con la cuenta de administrador. Entra con una cuenta de usuario." });
    const body = req.body || {};
    const pid = String(body.premio || "").slice(0, 80);
    const qty = Number(body.cantidad);
    if (!pid || pid.indexOf("/") >= 0) return res.status(400).json({ error: "Rifa no válida." });
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) return res.status(400).json({ error: "Cantidad no válida." });

    let premio;
    try {
      const s = await db.doc("rayas/estado").get();
      const j = s.exists ? JSON.parse(String(s.data().json || "{}")) : {};
      premio = (j.premios || []).filter((x) => x && x.id === pid)[0];
    } catch (e) { return res.status(500).json({ error: "No se pudo leer la rifa. Intenta de nuevo." }); }
    if (!premio) return res.status(400).json({ error: "Esta rifa no existe." });
    const fase = faseRifa(premio);
    if (fase === "oculta") return res.status(400).json({ error: "Esta rifa no está disponible por ahora." });
    if (fase === "porIniciar" || fase === "proxima") return res.status(400).json({ error: "Esta rifa aún no abre." });
    if (fase !== "activa") return res.status(400).json({ error: "Esta rifa ya cerró. Espera el resultado. 🍀" });
    const costoUnit = Math.max(0, Math.floor(Number(premio.creditos) || 0));
    const cupos = Math.max(0, Math.floor(Number(premio.cupos) || 0));
    const tope = Math.max(0, Math.floor(Number(premio.maxPorUsuario) || 0));
    const manual = Math.max(0, Math.floor(Number(premio.participantes) || 0));
    const total = costoUnit * qty;

    const uRef = db.doc("rayas_users/" + uid);
    const pRef = db.doc("rayas_part/" + pid + "_" + uid);
    try {
      const r = await db.runTransaction(async (tx) => {
        const [u, p, todas] = await Promise.all([tx.get(uRef), tx.get(pRef), tx.get(db.collection("rayas_part").where("premio", "==", pid))]);
        if (!u.exists) throw new Error("SIN_PERFIL");
        const d = u.data();
        const saldo = Number(d.creditos || 0);
        if (saldo < total) { const er = new Error("SIN_CREDITOS"); er.falta = total - saldo; throw er; }
        let tomados = 0;
        todas.forEach((x) => { tomados += Math.max(1, Number(x.data().cantidad) || 1); });
        if (cupos > 0 && Math.max(manual, tomados) + qty > cupos) throw new Error("SIN_CUPOS");
        const mio = p.exists ? Math.max(1, Number(p.data().cantidad) || 1) : 0;
        if (tope > 0 && mio + qty > tope) throw new Error("TOPE");
        if (mio + qty > 100) throw new Error("TOPE");
        tx.update(uRef, { creditos: FV.increment(-total) });
        if (p.exists) {
          tx.update(pRef, { cantidad: mio + qty, costo: FV.increment(total) });
        } else {
          tx.create(pRef, {
            uid: uid, nombre: String(d.nombre || "Cliente").slice(0, 60), premio: pid,
            premioNombre: String(premio.nombre || "").slice(0, 90), costo: total, cantidad: qty,
            creado: FV.serverTimestamp()
          });
        }
        return { saldo: saldo - total, mio: mio + qty };
      });
      return res.json({ ok: true, saldo: r.saldo, mio: r.mio, gastado: total });
    } catch (e) {
      const m = e && e.message;
      if (m === "SIN_CREDITOS") return res.status(402).json({ error: "No te alcanza el saldo. Te faltan " + e.falta + ".", falta: e.falta });
      if (m === "SIN_PERFIL") return res.status(400).json({ error: "Completa tu perfil antes de participar." });
      if (m === "SIN_CUPOS") return res.status(409).json({ error: "No quedan suficientes tickets en esta rifa." });
      if (m === "TOPE") return res.status(409).json({ error: "Superas el máximo de tickets permitido por persona en esta rifa." });
      console.error("participarRifa", e);
      return res.status(500).json({ error: "No se pudo registrar tu participación. No se descontó saldo; intenta de nuevo." });
    }
  }
);

/* ---------- 3) Barrido programado (cada 30 minutos): correos ----------
 * a) Recordatorio ÚNICO a quien generó un código de pago (efectivo / QR / billetera) y aún no pagó.
 *    Solo entre RECORDATORIO_MIN_HORAS y RECORDATORIO_MAX_HORAS después de generarlo (el código dura 24 h).
 * b) Marca como "expirado" lo que lleva más de EXPIRA_HORAS pendiente.
 * c) Reintenta los correos de "pago confirmado" que fallaron (correoPagoEnviado === false).
 * Los pagos acreditados ANTES de activar esto no tienen ese campo, así que no se les envía nada.
 */
exports.barridoPagos = onSchedule(
  { region: REGION, schedule: "every 30 minutes", secrets: [RESEND_KEY], timeoutSeconds: 120, maxInstances: 1 },
  async () => {
    const ahora = Date.now();

    // a) y b) pendientes
    const pend = await db.collection("rayas_pagos").where("estado", "==", "pendiente").get();
    for (const doc of pend.docs) {
      const p = doc.data();
      const creado = p.creado && p.creado.toMillis ? p.creado.toMillis() : 0;
      if (!creado) continue;
      const horas = (ahora - creado) / 3600000;
      if (horas >= EXPIRA_HORAS) { await doc.ref.update({ estado: "expirado", expirado: FV.serverTimestamp() }); continue; }
      if (p.recordatorioEnviado || horas < RECORDATORIO_MIN_HORAS || horas > RECORDATORIO_MAX_HORAS) continue;

      // Se reserva el envío en una transacción: si justo se pagó (o ya se envió) no se manda nada.
      const reservado = await db.runTransaction(async (tx) => {
        const s = await tx.get(doc.ref);
        const d = s.data();
        if (d.estado !== "pendiente" || d.recordatorioEnviado) return false;
        tx.update(doc.ref, { recordatorioEnviado: true, recordatorioEn: FV.serverTimestamp() });
        return true;
      });
      if (!reservado) continue;

      try {
        const uSnap = await db.doc("rayas_users/" + p.uid).get();
        const u = uSnap.exists ? uSnap.data() : null;
        if (!u || !u.email) continue;   // sin correo no hay a quién avisar
        const c = emails.recordatorio(p.tienda || "rayas", {
          id: doc.id, nombre: u.nombre, soles: p.soles,
          creditos: p.promoCreditos && !u.promoUsada ? p.promoCreditos : p.baseCreditos,
          expiraEn: new Date(creado + 24 * 3600000)
        });
        await enviarCorreo(RESEND_KEY.value(), { from: c.from, to: u.email, subject: c.subject, html: c.html, text: c.text, clave: "recordatorio-" + doc.id });
      } catch (e) {
        console.error("recordatorio", doc.id, e);
        await doc.ref.update({ recordatorioEnviado: false });   // se reintenta en la próxima pasada
      }
    }

    // c) correos de pago confirmado que fallaron
    const sin = await db.collection("rayas_pagos").where("correoPagoEnviado", "==", false).get();
    for (const doc of sin.docs) {
      const p = doc.data();
      if (p.estado !== "acreditado") continue;
      try {
        const uSnap = await db.doc("rayas_users/" + p.uid).get();
        if (!uSnap.exists || !uSnap.data().email) continue;
        await correoPagoConfirmado(doc.id, p, uSnap.data());
      } catch (e) { console.error("reintento correo de pago", doc.id, e); }
    }
  }
);
