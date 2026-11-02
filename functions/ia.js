"use strict";
/* =====================================================================
   Textos de venta con Claude (API de Anthropic) para el generador de
   publicaciones del panel admin. La clave vive en el secreto
   ANTHROPIC_API_KEY de Firebase; la web nunca la ve.
   ===================================================================== */

const MODELO = "claude-haiku-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const TIENDAS = {
  rayas: { nombre: "Rayas Store", web: "rayas.trade" },
  litlejacob: { nombre: "LitleJacob Store", web: "litlejacob.trade" }
};

function texto(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, max || 120); }
function numero(v) { const n = Number(v); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; }

// Deja solo los datos que sirven y con largo máximo (lo que manda el navegador no es de confianza).
function limpiarItem(it) {
  it = it || {};
  return {
    nombre: texto(it.nombre, 90),
    tipo: texto(it.tipo, 60),
    rareza: texto(it.rareza, 40),
    heroe: texto(it.heroe, 40),
    gemas: texto(it.gemas, 300),
    estilos: texto(it.estilos, 60),
    precio: numero(it.precio),
    steam: numero(it.steam),
    stock: Math.max(1, Math.min(999, parseInt(it.stock, 10) || 1)),
    entrega: texto(it.entrega, 60) || "Entrega inmediata"
  };
}

function armarPedido(tienda, it) {
  const t = TIENDAS[tienda] || TIENDAS.rayas;
  const datos = [
    "Tienda: " + t.nombre + " (" + t.web + ")",
    "Item: " + (it.nombre || "(sin nombre)"),
    it.tipo ? "Tipo: " + it.tipo : "",
    it.rareza ? "Rareza: " + it.rareza : "",
    it.heroe ? "Héroe: " + it.heroe : "",
    it.gemas ? "Gemas / runas: " + it.gemas : "",
    it.estilos ? "Estilos desbloqueados: " + it.estilos : "",
    "Precio de la tienda: " + (it.precio != null ? "S/ " + it.precio : "(sin precio)"),
    it.steam != null ? "Precio aproximado en el Mercado de Steam: S/ " + it.steam : "",
    "Unidades disponibles: " + it.stock,
    "Entrega: " + it.entrega
  ].filter(Boolean).join("\n");
  const system = "Eres el vendedor de " + t.nombre + ", una tienda peruana de items de Dota 2. " +
    "Escribes publicaciones cortas para grupos y estados de WhatsApp, en español de Perú, cercano y con energía, " +
    "con *negritas* de WhatsApp y algunos emojis (sin exagerar). Reglas: " +
    "usa solo los datos que te dan y nunca inventes precios, descuentos, gemas ni plazos; " +
    "los precios siempre en soles con el formato S/ 75 (nunca 'créditos'); " +
    "si el precio de Steam es mayor que el de la tienda puedes decir que sale más barato que en Steam, si no, no lo menciones; " +
    "si queda 1 unidad, recalca que es la última; " +
    "termina cada texto invitando a escribir al privado y con la firma 🛒 *" + t.nombre + "* · " + t.web + ". " +
    "Responde SOLO con JSON válido, sin nada más: " +
    '{"textos":[{"titulo":"Urgencia","texto":"..."},{"titulo":"Corto y directo","texto":"..."},{"titulo":"Más vendedor","texto":"..."}]}. ' +
    "Cada texto de máximo 600 caracteres; el 'Corto y directo' de máximo 3 líneas.";
  return { system: system, user: "Escribe las 3 publicaciones para este item:\n" + datos };
}

// Saca la lista de textos de la respuesta de Claude (aguanta texto o ``` alrededor del JSON).
function leerRespuesta(txt) {
  const s = String(txt || ""), a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("La IA no devolvió textos.");
  const j = JSON.parse(s.slice(a, b + 1));
  const l = (j && Array.isArray(j.textos) ? j.textos : []).map(function (x) {
    return { titulo: texto(x && x.titulo, 40) || "Texto", texto: texto(x && x.texto, 1200) };
  }).filter(function (x) { return x.texto; }).slice(0, 3);
  if (!l.length) throw new Error("La IA no devolvió textos.");
  return l;
}

function mensajeError(status, cuerpo) {
  const m = String((cuerpo && cuerpo.error && cuerpo.error.message) || "");
  if (status === 401) return "La clave de la API de Claude no es válida. Revisa el secreto ANTHROPIC_API_KEY.";
  if (status === 400 && /credit|balance/i.test(m)) return "Se acabó el crédito de la API de Claude. Recarga en console.anthropic.com.";
  if (status === 429) return "Demasiados pedidos seguidos. Espera un minuto y vuelve a intentar.";
  if (status === 529 || status >= 500) return "La IA está ocupada en este momento. Intenta de nuevo en un rato.";
  return "La IA no pudo escribir los textos (" + status + ").";
}

async function escribirTextos(clave, tienda, item, fetchFn) {
  const f = fetchFn || fetch;
  const it = limpiarItem(item);
  if (!it.nombre) throw new Error("Falta el nombre del item.");
  const p = armarPedido(tienda, it);
  const r = await f(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODELO, max_tokens: 1200, system: p.system, messages: [{ role: "user", content: p.user }] })
  });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) throw new Error(mensajeError(r.status, j));
  const txt = ((j && j.content) || []).filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join("");
  return leerRespuesta(txt);
}

module.exports = { MODELO, limpiarItem, armarPedido, leerRespuesta, mensajeError, escribirTextos };
