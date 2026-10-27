"use strict";
/*
 * Adaptador de Culqi. TODO lo específico de Culqi vive en este archivo.
 *
 * VERIFICAR contra https://docs.culqi.com antes de pasar a producción:
 *   - POST /v2/charges (campos: amount en céntimos, currency_code, email, source_id, metadata)
 *   - GET  /v2/charges/{id}
 *   - Que un cargo exitoso tenga outcome.type === "venta_exitosa"
 * Esto se escribió sin poder abrir la documentación oficial: probar primero con las llaves de PRUEBA (sk_test_).
 */
const API = "https://api.culqi.com/v2";

async function llamar(secretKey, metodo, ruta, cuerpo) {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { Authorization: "Bearer " + String(secretKey).trim(), "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(25000)
  });
  let json = null;
  try { json = await r.json(); } catch (e) { /* respuesta sin JSON */ }
  return { status: r.status, json };
}

// Un cargo cuenta como pagado solo si Culqi lo dice y coincide monto y moneda.
function cargoPagado(c, montoCentimos) {
  return !!c && c.object === "charge" &&
    c.outcome && c.outcome.type === "venta_exitosa" &&
    c.currency_code === "PEN" && Number(c.amount) === montoCentimos;
}

async function crearCargo(secretKey, { montoCentimos, email, tokenId, pagoId, uid }) {
  const { status, json } = await llamar(secretKey, "POST", "/charges", {
    amount: montoCentimos,
    currency_code: "PEN",
    email: email,
    source_id: tokenId,
    description: "Recarga de creditos Rayas Store",
    metadata: { pagoId: pagoId, uid: uid }
  });
  return { status, cargo: json, pagado: status < 300 && cargoPagado(json, montoCentimos) };
}

async function obtenerCargo(secretKey, chargeId) {
  const { status, json } = await llamar(secretKey, "GET", "/charges/" + encodeURIComponent(chargeId));
  return { status, cargo: json };
}

/*
 * ÓRDENES (PagoEfectivo, QR, billeteras): el cliente paga después y Culqi avisa por webhook.
 * VERIFICAR con las llaves de PRUEBA: POST /v2/orders (campos: amount, currency_code, description,
 * order_number, client_details{first_name,last_name,email,phone_number}, expiration_date en segundos unix, metadata),
 * GET /v2/orders/{id} y que una orden pagada tenga state === "paid".
 */
function ordenPagada(o, montoCentimos) {
  return !!o && o.object === "order" && o.state === "paid" && o.currency_code === "PEN" && Number(o.amount) === montoCentimos;
}
async function crearOrden(secretKey, { montoCentimos, email, nombre, telefono, pagoId, uid, numero, venceUnix }) {
  const partes = String(nombre || "Cliente").trim().split(/\s+/);
  const { status, json } = await llamar(secretKey, "POST", "/orders", {
    amount: montoCentimos,
    currency_code: "PEN",
    description: "Recarga de creditos LitleJacob/Rayas Store",
    order_number: numero,
    client_details: { first_name: partes[0] || "Cliente", last_name: partes.slice(1).join(" ") || "Cliente", email: email, phone_number: telefono },
    expiration_date: venceUnix,
    metadata: { pagoId: pagoId, uid: uid }
  });
  return { status, orden: json, creada: status < 300 && !!json && json.object === "order" && typeof json.id === "string" };
}
async function obtenerOrden(secretKey, ordenId) {
  const { status, json } = await llamar(secretKey, "GET", "/orders/" + encodeURIComponent(ordenId));
  return { status, orden: json };
}

module.exports = { crearCargo, obtenerCargo, cargoPagado, crearOrden, obtenerOrden, ordenPagada };
