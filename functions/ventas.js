"use strict";
/* =====================================================================
   Vender skins: funciones puras (sin Firestore ni red), para poder probarlas.
   - El cliente elige items de su inventario → se arma la venta con los precios del momento
     (lista automática del motor de lis-bot en live/preciosCompra + lista manual rayas_compra, que gana).
   - La venta queda "esperando" con un código; el bot de Steam la paga al recibir el trade con ese código.
   ===================================================================== */
const crypto = require("crypto");

const CONFIG_DEFECTO = {
  activo: false,        // false = solo el admin y los "permitidos" pueden vender (piloto)
  permitidos: [],       // uids que pueden vender durante el piloto
  topeVenta: 50,        // S/ máximo por venta
  topeDia: 150,         // S/ máximo por cliente por día (ventas pagadas + esperando)
  minutos: 30,          // cuánto se mantienen los precios
  botTradelink: "",     // trade link del bot (para el botón "Abrir intercambio con el bot")
};

// Sin letras que se confunden (0/O, 1/I/L).
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function nuevoCodigoVenta() {
  const b = crypto.randomBytes(5);
  let s = "";
  for (let i = 0; i < 5; i++) s += ALFABETO[b[i] % ALFABETO.length];
  return "V-" + s;
}
// Busca el código en el mensaje del trade ("v-abc12", "Código: V-ABC12"…).
function codigoDeMensaje(msg) {
  const m = /\bV\s*-\s*([A-Z0-9]{5})\b/i.exec(String(msg || ""));
  return m ? "V-" + m[1].toUpperCase() : "";
}

function claveNombre(n) {
  return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

// auto: { items: [{ n, pen }] } (lista del motor) · manual: [{ nombre, precio }] (rayas_compra). Manual gana.
function mapaPrecios(auto, manual) {
  const m = new Map();
  ((auto && auto.items) || []).forEach((i) => { const p = Number(i.pen); if (i.n && p > 0) m.set(claveNombre(i.n), Math.floor(p * 100) / 100); });
  (manual || []).forEach((i) => { const p = Number(i.precio); if (i.nombre && p > 0) m.set(claveNombre(i.nombre), Math.round(p * 100) / 100); });
  return m;
}

function leerConfig(raw) {
  const c = Object.assign({}, CONFIG_DEFECTO, raw || {});
  c.activo = c.activo === true;
  c.permitidos = Array.isArray(c.permitidos) ? c.permitidos.map(String) : [];
  c.topeVenta = Number(c.topeVenta) > 0 ? Number(c.topeVenta) : CONFIG_DEFECTO.topeVenta;
  c.topeDia = Number(c.topeDia) > 0 ? Number(c.topeDia) : CONFIG_DEFECTO.topeDia;
  c.minutos = Math.min(120, Math.max(5, Number(c.minutos) || CONFIG_DEFECTO.minutos));
  c.botTradelink = String(c.botTradelink || "");
  return c;
}
// permitidos: correos (o uids) de las cuentas del piloto.
function puedeVender(cfg, uid, esAdmin, email) {
  const e = String(email || "").trim().toLowerCase();
  return !!esAdmin || cfg.activo || cfg.permitidos.some((p) => p === String(uid) || (e && p.toLowerCase() === e));
}

/* Arma la venta. pedido: [{ name, qty }] · inventario: [{ k, name, n }] (agrupar() de inventario.js) · precios: Map.
   Devuelve { lineas: [{ name, qty, price }], total, count } o lanza Error con code. */
function armarVenta(pedido, inventario, precios) {
  const err = (code, extra) => { const e = new Error(code); e.code = code; Object.assign(e, extra || {}); return e; };
  const tengo = new Map();
  (inventario || []).forEach((g) => { const k = claveNombre(g.k || g.name); tengo.set(k, { name: g.k || g.name, n: (tengo.get(k) ? tengo.get(k).n : 0) + Number(g.n || 0) }); });
  const juntos = new Map();
  (Array.isArray(pedido) ? pedido : []).slice(0, 60).forEach((l) => {
    const qty = Math.floor(Number(l && l.qty) || 0), k = claveNombre(l && l.name);
    if (!k || qty < 1 || qty > 50) throw err("ITEM_MALO");
    juntos.set(k, (juntos.get(k) || 0) + qty);
  });
  if (!juntos.size) throw err("VACIO");
  const lineas = []; let total = 0, count = 0;
  juntos.forEach((qty, k) => {
    const inv = tengo.get(k);
    if (!inv || inv.n < qty) throw err("NO_TIENES", { item: inv ? inv.name : k });
    const price = precios.get(k);
    if (!(price > 0)) throw err("SIN_PRECIO", { item: inv.name });
    lineas.push({ name: inv.name, qty, price });
    total += price * qty; count += qty;
  });
  total = Math.round(total * 100) / 100;
  return { lineas, total, count };
}

/* El trade que llegó trae exactamente los items de la venta (por nombre y cantidad)? recibidos: [{ market_hash_name, appid }] */
function comparaRecibidos(recibidos, lineas) {
  const falta = new Map(), sobra = [];
  (lineas || []).forEach((l) => falta.set(claveNombre(l.name), (falta.get(claveNombre(l.name)) || 0) + Number(l.qty || 0)));
  (recibidos || []).forEach((it) => {
    const k = claveNombre(it.market_hash_name || it.name);
    if (Number(it.appid) !== 570 || !falta.get(k)) { sobra.push(it.market_hash_name || it.name || "?"); return; }
    falta.set(k, falta.get(k) - 1);
  });
  const faltan = [];
  falta.forEach((n, k) => { if (n > 0) faltan.push(k); });
  return { ok: !faltan.length && !sobra.length, faltan, sobra };
}

module.exports = { CONFIG_DEFECTO, nuevoCodigoVenta, codigoDeMensaje, claveNombre, mapaPrecios, leerConfig, puedeVender, armarVenta, comparaRecibidos };
