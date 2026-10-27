"use strict";
/*
 * Montos de recarga. ESTA es la única fuente de verdad de precios y créditos:
 * el navegador solo manda cuántos soles quiere pagar; los créditos los calcula el servidor.
 *
 *  1 crédito = S/ 1.
 *  Los montos de la lista tienen promo de PRIMERA recarga (una sola vez por cuenta):
 *    S/ 50 -> 55 créditos, S/ 100 -> 110 créditos.
 *  Cualquier otro monto entero entre MIN_SOLES y MAX_SOLES se acepta sin promo.
 */
const MIN_SOLES = 3;
const MAX_SOLES = 500;
const MIN_ORDEN = 6;   // mínimo de Culqi para QR / PagoEfectivo / billeteras (órdenes)

const PACKS = {
  10: { soles: 10, base: 10 },
  20: { soles: 20, base: 20 },
  50: { soles: 50, base: 50, promo: 55 },
  100: { soles: 100, base: 100, promo: 110 }
};

function packPorSoles(valor) {
  const s = Number(valor);
  if (!Number.isInteger(s) || s < MIN_SOLES || s > MAX_SOLES) return null;
  const p = PACKS[s];
  return p ? { id: "p" + s, soles: p.soles, base: p.base, promo: p.promo || 0 } : { id: "custom", soles: s, base: s, promo: 0 };
}

/*
 * COMISIÓN DE CULQI A CARGO DEL COMPRADOR.
 * Al pagar con tarjeta / efectivo / QR el comprador paga un poco más, para que a ti te lleguen
 * los soles completos de los créditos. Por WhatsApp / Yape directo NO hay comisión.
 * Fórmula (la de la calculadora de Culqi): comisión = monto × pct + US$ fijoUsd × tipo de cambio.
 *   total a cobrar = (soles + fijo) / (1 − pct), redondeado hacia arriba al céntimo.
 * Si Culqi te cobra IGV sobre la comisión, pon igv = 0.18. REVISA estos 4 números con tus primeras
 * ventas reales en CulqiPanel (Ventas → detalle) y ajústalos aquí Y en rifas.js / app.js / recarga.js.
 */
const COM = { pct: 0.0399, fijoUsd: 0.20, tc: 3.85, igv: 0 };
function totalConComision(soles) {
  const k = 1 + COM.igv;
  const t = (soles + COM.fijoUsd * COM.tc * k) / (1 - COM.pct * k);
  return Math.ceil(t * 100 - 1e-9) / 100;
}

module.exports = { PACKS, MIN_SOLES, MAX_SOLES, MIN_ORDEN, COM, totalConComision, packPorSoles };
