"use strict";
/*
 * Compra de sets caché de LitleJacob Store pagando con CRÉDITOS (1 crédito = S/ 1).
 * Los precios NO vienen del navegador: se leen de live/catalog (lo actualiza el panel admin
 * de la tienda cada vez que cambia precio o stock). El descuento se calcula aquí, igual que en la web:
 *   3+ sets = 10 %, 6+ sets = 15 %; todos los sets cuentan para llegar, pero el % solo se aplica a sets de hasta S/ 25.
 * El costo en créditos es el total redondeado hacia arriba (créditos enteros).
 */
const DISCOUNT_TIERS = [{ min: 6, pct: 15 }, { min: 3, pct: 10 }];
const DISCOUNT_MAX_PRICE = 25;
const MAX_ITEMS = 80;

function round2(n) { return Math.round(n * 100) / 100; }

// items: [{ id, qty, name }] del navegador; live: { "<id>": { price, stock, soldOut } }
function cotizar(items, live) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS) throw new Error("CARRITO_INVALIDO");
  const vistos = new Set();
  const lineas = items.map((it) => {
    const id = String(it && it.id || "");
    const qty = Number(it && it.qty);
    if (!/^\d{1,9}$/.test(id) || vistos.has(id) || !Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error("CARRITO_INVALIDO");
    vistos.add(id);
    const l = live && live[id];
    if (!l || l.price === null || l.price === undefined || !isFinite(Number(l.price)) || Number(l.price) <= 0) throw new Error("SIN_PRECIO:" + id);
    if (l.soldOut) throw new Error("AGOTADO:" + id);
    if (l.stock !== null && l.stock !== undefined && Number(l.stock) < qty) throw new Error("SIN_STOCK:" + id);
    return { id, qty, price: Number(l.price), name: String(it.name || "Set").slice(0, 80) };
  });
  const count = lineas.reduce((n, l) => n + l.qty, 0);
  const subtotal = round2(lineas.reduce((t, l) => t + l.price * l.qty, 0));
  const elegible = round2(lineas.filter((l) => l.price <= DISCOUNT_MAX_PRICE).reduce((t, l) => t + l.price * l.qty, 0));
  const tier = DISCOUNT_TIERS.find((t) => count >= t.min) || null;
  const discount = tier ? round2(elegible * tier.pct / 100) : 0;
  const total = round2(subtotal - discount);
  return { lineas, count, subtotal, discount, total, creditos: Math.ceil(total - 1e-9) };
}

function nuevoCodigo() {
  const t = Date.now().toString(36).toUpperCase().slice(-5);
  const r = Math.random().toString(36).toUpperCase().slice(2, 4);
  return "LJ-" + t + r;
}

module.exports = { cotizar, nuevoCodigo, DISCOUNT_TIERS, DISCOUNT_MAX_PRICE };
