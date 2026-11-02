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
    "Entrega exactamente 3 textos con la herramienta guardar_textos, con estos títulos y en este orden: " +
    "'Urgencia', 'Corto y directo' y 'Más vendedor'. Cada texto de máximo 600 caracteres; el 'Corto y directo' de máximo 3 líneas.";
  return { system: system, user: "Escribe las 3 publicaciones para este item:\n" + datos };
}

// La IA entrega los textos con una herramienta (tool use): así el JSON siempre llega bien armado.
const HERRAMIENTA = {
  name: "guardar_textos",
  description: "Guarda las 3 publicaciones de venta para WhatsApp.",
  input_schema: {
    type: "object",
    properties: {
      textos: {
        type: "array", minItems: 3, maxItems: 3,
        items: { type: "object", properties: { titulo: { type: "string" }, texto: { type: "string" } }, required: ["titulo", "texto"] }
      }
    },
    required: ["textos"]
  }
};
// Saca la lista de textos: de la herramienta (objeto) o, por si acaso, de un texto con JSON.
function leerRespuesta(dato) {
  let j = dato;
  if (typeof dato !== "object" || dato === null) {
    const s = String(dato || ""), a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("La IA no devolvió textos.");
    try { j = JSON.parse(s.slice(a, b + 1)); } catch (e) { throw new Error("La IA devolvió los textos mal armados. Toca ✨ otra vez."); }
  }
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
  if (status === 400 && /web.?search/i.test(m)) return "La búsqueda web de la IA está desactivada en tu cuenta de Claude Console. Actívala ahí y vuelve a intentar.";
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
    body: JSON.stringify({ model: MODELO, max_tokens: 1500, system: p.system, messages: [{ role: "user", content: p.user }],
      tools: [HERRAMIENTA], tool_choice: { type: "tool", name: HERRAMIENTA.name } })
  });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) throw new Error(mensajeError(r.status, j));
  const bloques = (j && j.content) || [];
  const uso = bloques.filter(function (c) { return c.type === "tool_use" && c.name === HERRAMIENTA.name; })[0];
  if (uso) return leerRespuesta(uso.input);
  return leerRespuesta(bloques.filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join(""));
}

/* ---------- Foto in-game desde la web ----------
   Claude busca en la web (herramienta web_search) videos de YouTube que muestran el item dentro del juego,
   y el servidor baja la miniatura del video (i.ytimg.com) para usarla como foto in-game. */
const YT_RE = /(?:youtube\.com\/(?:watch\?(?:[^#\s"'<>]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/g;
function idsYoutube(txt) {
  const s = String(txt || ""), out = []; let m; YT_RE.lastIndex = 0;
  while ((m = YT_RE.exec(s))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}
function pedidoFotos(it) {
  const datos = ["Item de Dota 2: " + it.nombre, it.heroe ? "Héroe: " + it.heroe : "", it.tipo ? "Tipo: " + it.tipo : "", it.rareza ? "Rareza: " + it.rareza : ""].filter(Boolean).join("\n");
  return {
    system: "Buscas en la web videos de YouTube que muestren cómo se ve un item cosmético de Dota 2 DENTRO DEL JUEGO " +
      "(showcase, preview, in-game, 'Dota 2 <item>'). Usa la búsqueda web. Elige videos de ESE item exacto, no de otros items del mismo héroe. " +
      "Responde al final solo con las URLs de YouTube de los 3 mejores videos, una por línea, el mejor primero.",
    user: datos
  };
}
async function buscarVideos(clave, it, f) {
  const p = pedidoFotos(it);
  let mensajes = [{ role: "user", content: p.user }], todo = "";
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const r = await f(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODELO, max_tokens: 1024, system: p.system, messages: mensajes,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] })
    });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok) throw new Error(mensajeError(r.status, j));
    const bloques = (j && j.content) || [];
    // Primero lo que Claude eligió (texto); después todo lo que encontró la búsqueda.
    const elegidos = bloques.filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join("\n");
    const hallados = bloques.filter(function (c) { return c.type === "web_search_tool_result"; }).map(function (c) {
      return (Array.isArray(c.content) ? c.content : []).map(function (x) { return x && x.url; }).join("\n");
    }).join("\n");
    todo = elegidos + "\n" + todo + "\n" + hallados;
    if (j.stop_reason !== "pause_turn") break;
    mensajes = mensajes.concat([{ role: "assistant", content: bloques }]);
  }
  return idsYoutube(todo).slice(0, 8);
}
async function bajarJpg(url, f) {
  try {
    const r = await f(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length < 4000 ? null : buf;   // la imagen gris de "no existe" pesa ~1 KB
  } catch (e) { return null; }
}
// Fotos sacadas de DENTRO del video (YouTube guarda 3 cuadros: al 25 %, 50 % y 75 %). No son la portada,
// así que no traen letras ni caras: son el juego. Se prueba la mejor calidad que exista.
async function cuadrosDelVideo(id, f) {
  const out = [];
  for (const n of [2, 1, 3]) {
    for (const q of ["maxres", "sd", "hq"]) {
      const buf = await bajarJpg("https://i.ytimg.com/vi/" + id + "/" + q + n + ".jpg", f);
      if (buf) { out.push({ id: id + "-" + n, video: "https://www.youtube.com/watch?v=" + id, data: "data:image/jpeg;base64," + buf.toString("base64") }); break; }
    }
  }
  return out;
}
// Portada del video: solo si el video no tiene cuadros.
async function bajarMiniatura(id, f) {
  for (const q of ["maxresdefault", "sddefault", "hqdefault"]) {
    const buf = await bajarJpg("https://i.ytimg.com/vi/" + id + "/" + q + ".jpg", f);
    if (buf) return { id: id, video: "https://www.youtube.com/watch?v=" + id, data: "data:image/jpeg;base64," + buf.toString("base64"), portada: true };
  }
  return null;
}
async function buscarFotos(clave, item, fetchFn) {
  const f = fetchFn || fetch;
  const it = limpiarItem(item);
  if (!it.nombre) throw new Error("Falta el nombre del item.");
  const ids = await buscarVideos(clave, it, f);
  if (!ids.length) throw new Error("No encontré fotos in-game de este item en la web. Súbela tú.");
  // Hasta 6 fotos: los cuadros de los 2-3 mejores videos (el mejor video primero).
  const fotos = [];
  for (const id of ids) {
    if (fotos.length >= 6) break;
    let c = await cuadrosDelVideo(id, f);
    if (!c.length) { const x = await bajarMiniatura(id, f); c = x ? [x] : []; }
    c.slice(0, 6 - fotos.length).forEach(function (x) { fotos.push(x); });
  }
  if (!fotos.length) throw new Error("Encontré videos pero no pude bajar sus fotos. Intenta otra vez.");
  return fotos;
}

module.exports = { MODELO, HERRAMIENTA, limpiarItem, armarPedido, leerRespuesta, mensajeError, escribirTextos, idsYoutube, buscarFotos };
