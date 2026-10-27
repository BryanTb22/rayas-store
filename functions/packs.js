"use strict";
/*
 * Paquetes de recarga. ESTA es la única fuente de verdad de precios y créditos:
 * el navegador solo manda el id del paquete, nunca el monto.
 *
 *  soles  = lo que paga el cliente (S/)
 *  base   = créditos normales que recibe
 *  promo  = créditos si es su PRIMERA recarga (opcional, una sola vez por cuenta)
 *
 * Suposición: 1 crédito = S/ 1 (S/ 50 -> 50, y con promo 55; S/ 100 -> 100, con promo 110).
 */
const PACKS = {
  p10: { id: "p10", soles: 10, base: 10 },
  p20: { id: "p20", soles: 20, base: 20 },
  p50: { id: "p50", soles: 50, base: 50, promo: 55 },
  p100: { id: "p100", soles: 100, base: 100, promo: 110 }
};

module.exports = { PACKS };
