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

module.exports = { PACKS, MIN_SOLES, MAX_SOLES, packPorSoles };
