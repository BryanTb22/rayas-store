"use strict";
const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { PACKS } = require("./packs");
const culqi = require("./culqi");

admin.initializeApp();
const db = admin.firestore();
const FV = admin.firestore.FieldValue;

const CULQI_SECRET = defineSecret("CULQI_SECRET_KEY");   // sk_test_... / sk_live_...
const WEBHOOK_KEY = defineSecret("CULQI_WEBHOOK_KEY");   // clave inventada por ti, va en la URL del webhook
const REGION = "us-central1";
const ORIGENES = ["https://rayas.trade", "https://www.rayas.trade"];

/* ---------- utilidades ---------- */
async function uidDeLaPeticion(req) {
  const h = String(req.get("Authorization") || "");
  if (!h.startsWith("Bearer ")) return null;
  try { return (await admin.auth().verifyIdToken(h.slice(7))).uid; } catch (e) { return null; }
}
function igual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
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
      promoAplicada: conPromo, acreditado: FV.serverTimestamp()
    });
    return { ya: false, creditos: creditos, saldo: saldo + creditos, promo: conPromo };
  });
}

/* ---------- 1) El cliente paga: recibe un token de Culqi y lo manda aquí ---------- */
exports.cobrar = onRequest(
  { region: REGION, cors: ORIGENES, secrets: [CULQI_SECRET], maxInstances: 5, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const uid = await uidDeLaPeticion(req);
    if (!uid) return res.status(401).json({ error: "Inicia sesión para recargar." });

    const body = req.body || {};
    const pack = PACKS[String(body.packId || "")];
    const tokenId = String(body.tokenId || "");
    if (!pack || !/^[\w-]{8,120}$/.test(tokenId)) return res.status(400).json({ error: "Datos de pago inválidos." });

    const uSnap = await db.doc("rayas_users/" + uid).get();
    if (!uSnap.exists) return res.status(400).json({ error: "Completa tu perfil antes de recargar." });
    const email = String(uSnap.data().email || "");
    if (!email) return res.status(400).json({ error: "Tu cuenta no tiene correo." });

    // Registro del intento ANTES de cobrar: sirve de rastro y de llave contra duplicados.
    const pRef = db.collection("rayas_pagos").doc();
    await pRef.set({
      uid: uid, packId: pack.id, soles: pack.soles, baseCreditos: pack.base,
      promoCreditos: pack.promo || 0, estado: "procesando", creado: FV.serverTimestamp()
    });

    let r;
    try {
      r = await culqi.crearCargo(CULQI_SECRET.value(), {
        montoCentimos: pack.soles * 100, email: email, tokenId: tokenId, pagoId: pRef.id, uid: uid
      });
    } catch (e) {
      // Sin respuesta de Culqi: NO sabemos si cobró. Queda para revisión (y el webhook puede acreditarlo).
      await pRef.update({ estado: "revisar", error: String(e && e.message || e) });
      return res.status(502).json({ error: "No pudimos confirmar el pago. Si te cobraron, los créditos llegarán solos en unos minutos; no pagues otra vez." });
    }

    if (!r.pagado) {
      const msg = (r.cargo && (r.cargo.user_message || r.cargo.merchant_message)) || "El pago no fue aprobado.";
      await pRef.update({ estado: "rechazado", respuestaStatus: r.status, mensaje: String(msg).slice(0, 300) });
      return res.status(402).json({ error: msg });
    }

    try {
      const a = await acreditar(pRef.id, r.cargo.id);
      return res.json({ ok: true, creditos: a.creditos, saldo: a.saldo, promo: !!a.promo });
    } catch (e) {
      // Cobrado pero no acreditado: queda marcado para que el webhook o el admin lo resuelvan.
      await pRef.update({ estado: "cobrado_sin_acreditar", chargeId: r.cargo.id, error: String(e && e.message || e) });
      return res.status(500).json({ error: "Tu pago se recibió pero hubo un problema al sumar los créditos. Escríbenos por WhatsApp con tu correo; no pagues otra vez." });
    }
  }
);

/* ---------- 2) Webhook de Culqi: red de seguridad ----------
 * Solo usa el id del cargo del aviso y le PREGUNTA a Culqi si de verdad está pagado,
 * así que un aviso falso no puede acreditar nada.
 * URL a registrar en el panel de Culqi:
 *   https://us-central1-litlejacob-store.cloudfunctions.net/webhookCulqi?k=TU_CULQI_WEBHOOK_KEY
 */
exports.webhookCulqi = onRequest(
  { region: REGION, secrets: [CULQI_SECRET, WEBHOOK_KEY], maxInstances: 3 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).end();
    if (!igual(req.query.k || "", WEBHOOK_KEY.value())) return res.status(403).end();

    let data = (req.body || {}).data;
    if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { data = null; } }
    const chargeId = data && data.object === "charge" && typeof data.id === "string" ? data.id : "";
    if (!chargeId) return res.status(200).send("ignorado");

    try {
      const g = await culqi.obtenerCargo(CULQI_SECRET.value(), chargeId);
      const pagoId = g.cargo && g.cargo.metadata && g.cargo.metadata.pagoId;
      if (!pagoId) return res.status(200).send("sin pago asociado");
      const pSnap = await db.doc("rayas_pagos/" + pagoId).get();
      if (!pSnap.exists) return res.status(200).send("pago desconocido");
      const p = pSnap.data();
      if (g.cargo.metadata.uid !== p.uid || !culqi.cargoPagado(g.cargo, p.soles * 100)) {
        return res.status(200).send("no pagado");
      }
      await acreditar(pagoId, chargeId);
      return res.status(200).send("ok");
    } catch (e) {
      console.error("webhookCulqi", e);
      return res.status(500).send("error");   // Culqi reintenta
    }
  }
);
