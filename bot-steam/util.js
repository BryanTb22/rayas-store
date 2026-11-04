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
  };
}

module.exports = { leerTradelink, normalizar, elegirItems, estadoDeOferta, mensajeOferta, codigoDeMensaje, leerConfig, fechaPeru };
