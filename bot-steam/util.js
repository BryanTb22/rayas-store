/* =====================================================================
   Funciones puras del bot de Steam (sin red ni Steam): se pueden probar
   con `npm test` sin tener cuentas ni credenciales.
   ===================================================================== */
"use strict";

const BASE_STEAMID = 76561197960265728n;

// Lee un trade link de Steam y devuelve { partner, token, steamId64 } o null si no es válido.
function leerTradelink(url) {
  const m = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=(\d+)&token=([\w-]+)$/.exec(String(url || "").trim());
  if (!m) return null;
  const partner = Number(m[1]);
  if (!Number.isSafeInteger(partner) || partner <= 0) return null;
  return { partner, token: m[2], steamId64: (BASE_STEAMID + BigInt(partner)).toString() };
}

// Normaliza nombres de items para compararlos (mayúsculas, espacios, tildes y comillas raras).
function normalizar(nombre) {
  return String(nombre || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim().toLowerCase();
}

// Elige del inventario del bot las unidades exactas para un pedido.
// inventario: [{ assetid, market_hash_name, name, tradable }]
// pedido:     [{ name, qty }]
// reservados: Set de assetid que ya están en otras ofertas activas.
// Devuelve { elegidos: [item...], faltan: [{ name, faltan }] }.
function elegirItems(inventario, pedido, reservados) {
  const usados = new Set(reservados || []);
  const elegidos = [], faltan = [];
  for (const linea of pedido || []) {
    const objetivo = normalizar(linea.name);
    const qty = Math.max(1, Number(linea.qty) || 1);
    let conseguidos = 0;
    for (const it of inventario || []) {
      if (conseguidos >= qty) break;
      const id = String(it.assetid);
      if (usados.has(id) || it.tradable === false) continue;
      if (normalizar(it.market_hash_name) === objetivo || normalizar(it.name) === objetivo) {
        usados.add(id); elegidos.push(it); conseguidos++;
      }
    }
    if (conseguidos < qty) faltan.push({ name: linea.name, faltan: qty - conseguidos });
  }
  return { elegidos, faltan };
}

// Traduce el estado de una oferta de Steam (número) a lo que ve el panel admin.
// E = TradeOfferManager.ETradeOfferState
function estadoDeOferta(estado, E, escrowEnds) {
  switch (estado) {
    case E.Accepted: return { estado: "aceptada", motivo: "El cliente aceptó la oferta.", entregado: true };
    case E.InEscrow: return { estado: "retenida", motivo: "Steam retuvo el intercambio" + (escrowEnds ? " hasta el " + fechaPeru(escrowEnds) : "") + "." };
    case E.Declined: return { estado: "fallida", motivo: "El cliente rechazó la oferta." };
    case E.Countered: return { estado: "fallida", motivo: "El cliente hizo una contraoferta (se ignoró)." };
    case E.Expired: return { estado: "fallida", motivo: "La oferta venció sin respuesta." };
    case E.Canceled: return { estado: "fallida", motivo: "La oferta se canceló." };
    case E.CanceledBySecondFactor: return { estado: "fallida", motivo: "Se canceló en la confirmación de Steam Guard." };
    case E.InvalidItems: return { estado: "fallida", motivo: "Algún item ya no está disponible." };
    case E.Active: return { estado: "enviada", motivo: "Esperando que el cliente acepte." };
    case E.CreatedNeedsConfirmation: return { estado: "enviando", motivo: "Falta la confirmación de Steam Guard." };
    default: return null;
  }
}

function fechaPeru(fecha) {
  try { return new Date(fecha).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }
  catch (e) { return String(fecha); }
}

// Texto que lleva cada oferta (sirve también para reconocerla si el bot se reinicia).
function mensajeOferta(code, tienda) {
  const nombre = tienda === "litlejacob" ? "LitleJacob Store" : "Rayas Store";
  return "Pedido " + code + " · " + nombre + " · ¡Gracias por tu compra!";
}
function codigoDeMensaje(msg) {
  const m = /^Pedido (\S+) · /.exec(String(msg || ""));
  return m ? m[1] : "";
}

// Lee la configuración del archivo .env ya cargado en process.env.
function leerConfig(env) {
  const faltan = ["STEAM_USUARIO", "STEAM_CLAVE", "MAFILE", "FIREBASE_CREDENCIALES"].filter((k) => !env[k]);
  if (faltan.length) throw new Error("Falta en el archivo .env: " + faltan.join(", "));
  return {
    usuario: env.STEAM_USUARIO,
    clave: env.STEAM_CLAVE,
    mafile: env.MAFILE,
    credenciales: env.FIREBASE_CREDENCIALES,
    vencerHoras: Math.max(1, Number(env.VENCER_OFERTA_HORAS) || 48),
    // Lista de precios de compra del panel del bot LIS (mismo servidor). Vacío = no sincroniza.
    preciosUrl: env.PRECIOS_COMPRA_URL === undefined ? "http://127.0.0.1:8787/api/precios-compra" : String(env.PRECIOS_COMPRA_URL),
  };
}

/* ---------- Vender skins (el cliente le vende items a la tienda) ---------- */
// Código de la venta en el mensaje del trade: "V-ABC12" (igual que functions/ventas.js).
function codigoVenta(msg) {
  const m = /\bV\s*-\s*([A-Z0-9]{5})\b/i.exec(String(msg || ""));
  return m ? "V-" + m[1].toUpperCase() : "";
}
// ¿El trade trae exactamente los items de la venta? recibidos: [{ market_hash_name, appid }] · lineas: [{ name, qty }]
function comparaRecibidos(recibidos, lineas) {
  const falta = new Map(), sobra = [];
  for (const l of lineas || []) falta.set(normalizar(l.name), (falta.get(normalizar(l.name)) || 0) + Number(l.qty || 0));
  for (const it of recibidos || []) {
    const k = normalizar(it.market_hash_name || it.name);
    if (Number(it.appid) !== 570 || !falta.get(k)) { sobra.push(it.market_hash_name || it.name || "?"); continue; }
    falta.set(k, falta.get(k) - 1);
  }
  const faltan = [];
  falta.forEach((n, k) => { if (n > 0) faltan.push(n + " × " + k); });
  return { ok: !faltan.length && !sobra.length, faltan, sobra };
}
// Revisa una oferta recibida contra su venta. Devuelve "" si está bien o el motivo del rechazo.
// venta: { estado, steamId, vence (ms), items } · oferta: { partnerId, darCount, recibidos } · ahora (ms)
function revisarVenta(venta, oferta, ahora) {
  if (!venta) return "No existe una venta con ese código.";
  if (venta.estado !== "esperando") return "La venta ya no está esperando (" + venta.estado + ").";
  if (venta.vence && ahora > venta.vence) return "La venta venció (los precios duran poco). Crea una nueva en la web.";
  if (String(oferta.partnerId) !== String(venta.steamId)) return "El trade viene de otra cuenta de Steam (no la del trade link de la venta).";
  if (oferta.darCount > 0) return "El trade le pide items al bot; en una venta el bot no entrega nada.";
  const c = comparaRecibidos(oferta.recibidos, venta.items);
  if (!c.ok) return "Los items no coinciden con la venta" + (c.faltan.length ? ". Faltan: " + c.faltan.join(", ") : "") + (c.sobra.length ? ". Sobran: " + c.sobra.slice(0, 5).join(", ") : "") + ".";
  return "";
}
// Achica la lista de /api/precios-compra para guardarla en un solo documento de Firestore.
function preciosLivianos(r) {
  const items = ((r && r.items) || []).filter((i) => i && i.n && Number(i.pen) > 0).map((i) => ({ n: String(i.n), pen: Number(i.pen) }));
  return { ts: (r && r.ts) || "", tc: (r && r.tc) || null, provisional: !!(r && r.provisional), items };
}

// Agrupa el inventario por nombre para mostrarlo en el panel: [{ nombre, cantidad, icono, color, rareza }]
function agruparInventario(items) {
  const m = new Map();
  for (const it of items || []) {
    const nombre = it.market_hash_name || it.name || "Item";
    const g = m.get(nombre) || { nombre, cantidad: 0, icono: "", color: "", rareza: "" };
    g.cantidad++;
    if (!g.icono && it.icon_url) g.icono = "https://community.akamai.steamstatic.com/economy/image/" + it.icon_url + "/96fx96f";
    if (!g.color && it.name_color) g.color = "#" + String(it.name_color).replace(/[^0-9a-f]/gi, "").slice(0, 6);
    if (!g.rareza) { const t = (it.tags || []).find((x) => /rarity/i.test(x.category || "")); if (t) g.rareza = t.name || t.localized_tag_name || ""; }
    m.set(nombre, g);
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

module.exports = { agruparInventario, leerTradelink, normalizar, elegirItems, estadoDeOferta, mensajeOferta, codigoDeMensaje, leerConfig, fechaPeru, codigoVenta, comparaRecibidos, revisarVenta, preciosLivianos };
