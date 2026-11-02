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
    efecto: texto(it.efecto, 60),
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
    it.efecto ? "Efecto inusual (variante de este item): " + it.efecto : "",
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
    "si el item tiene un efecto inusual (por ejemplo Candy Caster, Smoke, Ethereal Flame), es la variante que lo hace especial: " +
    "nómbralo siempre junto al nombre del item y destácalo como atractivo (los compradores buscan esa variante en específico); " +
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
  const datos = ["Item de Dota 2: " + it.nombre, it.efecto ? "Efecto inusual (variante): " + it.efecto + " — busca videos de ESTA variante, por ejemplo '" + it.nombre + " " + it.efecto + "'" : "", it.heroe ? "Héroe: " + it.heroe : "", it.tipo ? "Tipo: " + it.tipo : "", it.rareza ? "Rareza: " + it.rareza : ""].filter(Boolean).join("\n");
  return {
    system: "Buscas en la web videos de YouTube que muestren cómo se ve un item cosmético de Dota 2 DENTRO DEL JUEGO " +
      "(showcase, preview, in-game, 'Dota 2 <item>'). Usa la búsqueda web. Elige videos de ESE item exacto, no de otros items del mismo héroe. " +
      "Si el item tiene un efecto inusual (couriers y items Unusual tienen variantes: Candy Caster, Smoke, Ethereal Flame, etc.), " +
      "busca videos que muestren ESA variante y evita los de otras variantes del mismo item. " +
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
/* ---------- La IA mira las fotos y se queda con las que muestran el item de cerca ---------- */
const HERR_FOTOS = {
  name: "calificar_fotos",
  description: "Califica cada foto candidata del 0 al 10.",
  input_schema: {
    type: "object",
    properties: {
      fotos: {
        type: "array",
        items: { type: "object", properties: { n: { type: "integer", description: "número de la foto" }, nota: { type: "integer", description: "0 a 10" } }, required: ["n", "nota"] }
      }
    },
    required: ["fotos"]
  }
};
const NOTA_MIN = 6;
function soloBase64(dataUrl) { const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || "")); return m ? { tipo: m[1], b64: m[2] } : null; }
// Ejemplos de lo que al dueño le gustó / no le gustó en publicaciones anteriores (retroalimentación).
function bloquesEjemplos(ej) {
  const out = [];
  const meter = function (lista, titulo) {
    const l = (Array.isArray(lista) ? lista : []).map(soloBase64).filter(function (b) { return b && b.b64.length < 400000; }).slice(0, 3);
    if (!l.length) return;
    out.push({ type: "text", text: titulo });
    l.forEach(function (b) { out.push({ type: "image", source: { type: "base64", media_type: b.tipo, data: b.b64 } }); });
  };
  meter(ej && ej.buenas, "Ejemplos de fotos que al dueño de la tienda SÍ le gustaron para sus publicaciones (este es el estilo que busca):");
  meter(ej && ej.malas, "Ejemplos de fotos que al dueño NO le gustaron (evita este tipo):");
  return out;
}
async function calificarFotos(clave, it, fotos, oficial, f, ejemplos) {
  const contenido = [];
  const ref = soloBase64(oficial);
  if (ref && ref.b64.length < 1500000) {
    contenido.push({ type: "text", text: "Imagen de referencia: así se ve el item." });
    contenido.push({ type: "image", source: { type: "base64", media_type: ref.tipo, data: ref.b64 } });
  }
  bloquesEjemplos(ejemplos).forEach(function (b) { contenido.push(b); });
  fotos.forEach(function (x, i) {
    const b = soloBase64(x.data); if (!b) return;
    contenido.push({ type: "text", text: "Foto " + (i + 1) + ":" });
    contenido.push({ type: "image", source: { type: "base64", media_type: b.tipo, data: b.b64 } });
  });
  contenido.push({ type: "text", text: "Item de Dota 2: " + it.nombre + (it.efecto ? " con efecto inusual " + it.efecto + " (prefiere las fotos donde se vea ese efecto; otra variante del mismo item vale menos)" : "") + (it.heroe ? " (héroe: " + it.heroe + ")" : "") + ". " +
    "Estas fotos son para una publicación de venta. Califica cada foto del 0 al 10 con la herramienta calificar_fotos: " +
    "10 = el héroe o el item se ve GRANDE, de cerca y enfocado, se aprecia bien el item (como un showcase); " +
    "5 = se ve el héroe con el item pero algo chico o tapado; " +
    "0-2 = vista lejana de partida desde arriba con héroes chiquitos, mapa, menús o interfaz, una persona o cara, mucho texto encima, " +
    "otro héroe u otro item distinto, o pantalla negra. Si hay ejemplos de lo que le gustó y no le gustó al dueño, úsalos como guía del estilo. Califica todas las fotos." });
  const r = await f(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODELO, max_tokens: 800, messages: [{ role: "user", content: contenido }],
      tools: [HERR_FOTOS], tool_choice: { type: "tool", name: HERR_FOTOS.name } })
  });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) throw new Error(mensajeError(r.status, j));
  const uso = ((j && j.content) || []).filter(function (c) { return c.type === "tool_use"; })[0];
  const notas = {};
  ((uso && uso.input && uso.input.fotos) || []).forEach(function (x) { const n = parseInt(x && x.n, 10), v = Number(x && x.nota); if (n >= 1 && isFinite(v)) notas[n - 1] = v; });
  return notas;
}
async function buscarFotos(clave, item, fetchFn, oficial, ejemplos) {
  const f = fetchFn || fetch;
  const it = limpiarItem(item);
  if (!it.nombre) throw new Error("Falta el nombre del item.");
  const ids = await buscarVideos(clave, it, f);
  if (!ids.length) throw new Error("No encontré fotos in-game de este item en la web. Súbela tú.");
  // Candidatas: los cuadros de los 3 mejores videos (en paralelo), hasta 9.
  const grupos = await Promise.all(ids.slice(0, 3).map(async function (id) {
    const c = await cuadrosDelVideo(id, f);
    if (c.length) return c;
    const x = await bajarMiniatura(id, f); return x ? [x] : [];
  }));
  let cand = [].concat.apply([], grupos).slice(0, 9);
  if (!cand.length) throw new Error("Encontré videos pero no pude bajar sus fotos. Intenta otra vez.");
  // La IA mira cada foto: quedan solo las que muestran el item de cerca, la mejor primero.
  let notas = null;
  try { notas = await calificarFotos(clave, it, cand, oficial, f, ejemplos); } catch (e) { notas = null; }
  if (!notas || !Object.keys(notas).length) return { fotos: cand.slice(0, 6), aviso: "" };
  cand = cand.map(function (x, i) { return Object.assign({}, x, { nota: notas[i] != null ? notas[i] : 0 }); })
    .sort(function (a, b) { return b.nota - a.nota; });
  const buenas = cand.filter(function (x) { return x.nota >= NOTA_MIN; });
  if (buenas.length) return { fotos: buenas.slice(0, 6), aviso: "" };
  return { fotos: cand.slice(0, 3), aviso: "No encontré fotos donde el item se vea de cerca. Estas son las mejores; si no te gustan, sube una tú." };
}

// Limpia lo que manda el navegador como retroalimentación: fotos chicas (data URL jpeg/png/webp) y datos del item.
function limpiarFeedback(b) {
  b = b || {};
  const img = function (v) { return soloBase64(v) && String(v).length < 400000 ? String(v) : ""; };
  const buena = b.buena && img(b.buena.data) ? { id: texto(b.buena.id, 40), data: img(b.buena.data) } : null;
  const malas = (Array.isArray(b.malas) ? b.malas : []).map(function (x) { return x && img(x.data) ? { id: texto(x.id, 40), data: img(x.data) } : null; }).filter(Boolean).slice(0, 8);
  const previa = b.previa && soloBase64(b.previa) && String(b.previa).length < 950000 ? String(b.previa) : "";
  return { itemId: texto(b.itemId, 60), nombre: texto(b.nombre, 90), heroe: texto(b.heroe, 40), buena: buena, malas: malas, previa: previa };
}
// Elige los ejemplos a mostrar: hasta 3 buenas y 3 malas, primero las del mismo héroe, luego las más recientes.
function elegirEjemplos(docs, heroe) {
  const h = String(heroe || "").toLowerCase();
  const orden = (docs || []).slice().sort(function (a, b) { return ((b.heroe || "").toLowerCase() === h) - ((a.heroe || "").toLowerCase() === h); });
  const buenas = [], malas = [];
  orden.forEach(function (d) {
    if (d.buena && d.buena.data && buenas.length < 3) buenas.push(d.buena.data);
    (d.malas || []).forEach(function (m) { if (m && m.data && malas.length < 3) malas.push(m.data); });
  });
  return { buenas: buenas, malas: malas };
}

// Publicación aprobada: imagen final (data URL jpeg, < 950 KB por el límite de Firestore) y sus textos.
function limpiarPublicacion(b) {
  b = b || {};
  const im = soloBase64(b.imagen) && String(b.imagen).length < 950000 ? String(b.imagen) : "";
  const textos = (Array.isArray(b.textos) ? b.textos : []).map(function (x) { return { titulo: texto(x && x.titulo, 40) || "Texto", texto: texto(x && x.texto, 1200) }; }).filter(function (x) { return x.texto; }).slice(0, 3);
  return { imagen: im, nombre: texto(b.nombre, 90), tipo: texto(b.tipo, 60), precio: numero(b.precio), textos: textos };
}

module.exports = { MODELO, HERRAMIENTA, limpiarItem, armarPedido, leerRespuesta, mensajeError, escribirTextos, idsYoutube, buscarFotos, limpiarFeedback, elegirEjemplos, limpiarPublicacion };
