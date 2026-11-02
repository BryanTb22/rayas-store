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
    it.steam != null && it.precio != null && it.steam > it.precio ? "Precio aproximado en el Mercado de Steam: S/ " + it.steam + " (más caro que en la tienda)" : "",
    "Unidades disponibles: " + it.stock,
    "Entrega: " + it.entrega
  ].filter(Boolean).join("\n");
  const system = "Eres el vendedor de " + t.nombre + ", una tienda peruana de items de Dota 2. " +
    "Escribes publicaciones cortas para grupos y estados de WhatsApp, en español de Perú, cercano y con energía, " +
    "con *negritas* de WhatsApp y algunos emojis (sin exagerar). Reglas: " +
    "usa solo los datos que te dan y nunca inventes precios, descuentos, gemas ni plazos; " +
    "los precios siempre en soles con el formato S/ 75 (nunca 'créditos'); " +
    "solo si te dan el precio de Steam (y es más caro) puedes decir que sale más barato que en Steam; si no te lo dan, NO menciones Steam ni compares precios; " +
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
// Cómo se ve cada efecto inusual en el juego (partículas alrededor del item/courier). Sirve para buscar y para calificar.
const EFECTOS = {
  "candy caster": "caramelos y dulces de colores girando alrededor",
  snowdrift: "copos de nieve y ventisca blanca-celeste alrededor",
  smoke: "humo gris/negro saliendo del item", smoky: "humo gris/negro saliendo del item",
  "ethereal flame": "llamas etéreas azul-verdosas", "ethereal": "aura etérea brillante",
  rave: "luces de colores parpadeando como discoteca", "ravenblight": "cuervos y plumas negras volando alrededor",
  "burning": "fuego y brasas", "frostivus": "nieve y hielo", "champion's aura": "aura dorada de campeón",
  "sunfire": "fuego anaranjado solar", "bubbles": "burbujas flotando", "lightning": "rayos y chispas eléctricas",
  "felicity's blessing": "estrellas y brillos dorados", "orbital decay": "esferas orbitando",
  "piercing beams": "rayos de luz que atraviesan", "crystal rift": "cristales flotantes", "resonant energy": "ondas de energía"
};
function descEfecto(ef) {
  const k = String(ef || "").toLowerCase().trim(); if (!k) return "";
  const hit = Object.keys(EFECTOS).filter(function (x) { return k.indexOf(x) >= 0 || x.indexOf(k) >= 0; })[0];
  return hit ? EFECTOS[hit] : "partículas o aura especial visible alrededor del item (es la variante '" + ef + "')";
}
function pedidoFotos(it, intento) {
  const datos = ["Item de Dota 2: " + it.nombre,
    it.efecto ? "Efecto inusual (variante): " + it.efecto + " (se ve como: " + descEfecto(it.efecto) + "). Busca SOLO videos de esta variante, con búsquedas como '" + it.nombre + " " + it.efecto + "', 'unusual " + it.efecto + " " + it.nombre + " dota 2', '" + it.efecto + " effect " + it.nombre + "'." : "",
    intento > 1 && it.efecto ? "Los videos de la búsqueda anterior NO mostraban el efecto " + it.efecto + ". Usa otras palabras (por ejemplo 'unusual " + it.efecto + " " + (it.heroe || it.tipo || "") + " showcase', '" + it.efecto + " gem " + it.nombre + "') y NO repitas videos." : "",
    it.heroe ? "Héroe: " + it.heroe : "", it.tipo ? "Tipo: " + it.tipo : "", it.rareza ? "Rareza: " + it.rareza : ""].filter(Boolean).join("\n");
  return {
    system: "Buscas en la web videos de YouTube que muestren cómo se ve un item cosmético de Dota 2 DENTRO DEL JUEGO " +
      "(showcase, preview, in-game, 'Dota 2 <item>'). Usa la búsqueda web. Elige videos de ESE item exacto, no de otros items del mismo héroe. " +
      "Si el item tiene un efecto inusual (couriers y items Unusual tienen variantes: Candy Caster, Smoke, Ethereal Flame, etc.), " +
      "busca videos que muestren ESA variante y evita los de otras variantes del mismo item. " +
      "Responde al final solo con las URLs de YouTube de los 3 mejores videos, una por línea, el mejor primero.",
    user: datos
  };
}
/* ---------- Búsqueda directa en YouTube (sin depender de la búsqueda web de Claude) ---------- */
// Nombre limpio para buscar: sin "Unusual/Inscribed/Genuine…" al inicio ni " - Arms/Weapon/Head" al final.
function nombreBusqueda(it) {
  return String(it.nombre || "").replace(/^(unusual|inusual|genuine|exalted|corrupted|cursed|frozen|heroic|elder|inscribed|autographed|auspicious|infused|legacy)\s+/i, "")
    .replace(/\s+-\s+[\w' ]{2,20}$/, "").replace(/\s+style$/i, "").trim() || String(it.nombre || "");
}
function consultasYoutube(it, intento) {
  const n = nombreBusqueda(it), e = String(it.efecto || "").trim(), h = String(it.heroe || "").trim();
  if (e) {
    return intento > 1
      ? ["unusual " + e + " " + n + " dota 2", e + " " + n + " showcase", "dota 2 " + n + " " + e + " effect", "unusual " + e + " " + (h || "courier") + " dota 2"]
      : [n + " " + e + " dota 2", "unusual " + e + " " + n, n + " " + e + " in game"];
  }
  return intento > 1
    ? ["dota 2 " + n + " showcase", n + " " + (h || "") + " dota 2 preview", n + " dota 2 gameplay"]
    : [n + " dota 2 in game", "dota 2 " + n + (h ? " " + h : ""), n + " dota 2 preview"];
}
// Lee los videos (id + título) de la página de resultados de YouTube.
function videosDeHtml(html) {
  const out = [], re = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,3000}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(String(html || ""))) && out.length < 25) {
    if (!out.some(function (x) { return x.id === m[1]; })) out.push({ id: m[1], titulo: m[2].replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/\\\\/g, "\\").slice(0, 120) });
  }
  return out;
}
async function videosYoutube(consulta, f) {
  try {
    const r = await f("https://www.youtube.com/results?search_query=" + encodeURIComponent(consulta) + "&hl=en&gl=US",
      { headers: { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "cookie": "CONSENT=YES+1; SOCS=CAI" } });
    if (!r.ok) return [];
    return videosDeHtml(await r.text());
  } catch (e) { return []; }
}
// Claude elige, por el título, hasta 4 videos que sean de ESE item (y de ESA variante si tiene efecto).
const HERR_VIDEOS = { name: "elegir_videos", description: "Elige los videos que muestran el item exacto.", input_schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] } };
async function elegirVideos(clave, it, lista, f) {
  if (lista.length <= 4) return lista.map(function (v) { return v.id; });
  const txt = "Item de Dota 2: " + it.nombre + (it.efecto ? " — variante con efecto inusual '" + it.efecto + "' (" + descEfecto(it.efecto) + ")" : "") + (it.heroe ? " (héroe: " + it.heroe + ")" : "") +
    ".\nVideos de YouTube encontrados (id · título):\n" + lista.map(function (v) { return v.id + " · " + v.titulo; }).join("\n") +
    "\n\nElige con la herramienta elegir_videos los ids de hasta 4 videos que muy probablemente muestren ESTE item dentro del juego" +
    (it.efecto ? " y ESTA variante/efecto (si el título menciona otra variante u otro efecto, descártalo)" : "") +
    ", el más seguro primero. Prefiere videos dedicados a este item (showcase/preview). Las recopilaciones del mismo cofre o del mismo efecto ('all unusual items', 'todos los inusuales') sirven como segunda opción si incluyen este item. Descarta videos de otros items o héroes, de precios/trading, de parches/noticias y de otros juegos. Si ninguno sirve, devuelve una lista vacía.";
  try {
    const r = await f(API_URL, {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODELO, max_tokens: 300, messages: [{ role: "user", content: txt }], tools: [HERR_VIDEOS], tool_choice: { type: "tool", name: HERR_VIDEOS.name } })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(mensajeError(r.status, j));
    const uso = ((j && j.content) || []).filter(function (c) { return c.type === "tool_use"; })[0];
    const ids = ((uso && uso.input && uso.input.ids) || []).map(String).filter(function (id) { return lista.some(function (v) { return v.id === id; }); });
    return ids.slice(0, 4);
  } catch (e) { return lista.slice(0, 4).map(function (v) { return v.id; }); }
}
// Busca en YouTube con varias consultas; si YouTube no responde, usa la búsqueda web de Claude como respaldo.
async function buscarVideos(clave, it, f, intento) {
  const listas = await Promise.all(consultasYoutube(it, intento || 1).map(function (q) { return videosYoutube(q, f); }));
  const vistos = {}, lista = [];
  listas.forEach(function (l) { l.slice(0, 8).forEach(function (v) { if (!vistos[v.id]) { vistos[v.id] = true; lista.push(v); } }); });
  if (lista.length) return elegirVideos(clave, it, lista, f);
  return buscarVideosWeb(clave, it, f, intento);
}
async function buscarVideosWeb(clave, it, f, intento) {
  const p = pedidoFotos(it, intento || 1);
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
    (it.efecto ? "IMPORTANTE: el item es la variante con efecto inusual '" + it.efecto + "' (se ve como: " + descEfecto(it.efecto) + "). " +
      "Lo que vende es ESE efecto, así que es obligatorio que se vea en la foto: si no se aprecian esas partículas/aura, la foto vale 0-3 aunque el item se vea de cerca (sería otra variante o sin efecto). " +
      "Para 8-10 el efecto debe verse claramente. La imagen de referencia es el render oficial y NO muestra el efecto; úsala solo para reconocer el item. " : "") +
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
  // Con efecto inusual se buscan hasta 2 rondas: si en la primera ninguna foto muestra el efecto, se busca con otras palabras.
  const rondas = it.efecto ? 2 : 1, vistos = {};
  let todas = [], sinNotas = false;
  for (let ronda = 1; ronda <= rondas; ronda++) {
    const ids = (await buscarVideos(clave, it, f, ronda)).filter(function (id) { return !vistos[id]; });
    if (!ids.length) { if (ronda === 1) throw new Error("No encontré fotos in-game de este item en la web. Súbela tú."); break; }
    ids.forEach(function (id) { vistos[id] = true; });
    // Candidatas: los cuadros de los 4 mejores videos (en paralelo), hasta 12.
    const grupos = await Promise.all(ids.slice(0, 4).map(async function (id) {
      const c = await cuadrosDelVideo(id, f);
      if (c.length) return c;
      const x = await bajarMiniatura(id, f); return x ? [x] : [];
    }));
    let cand = [].concat.apply([], grupos).slice(0, 12);
    if (!cand.length) { if (ronda === 1 && rondas === 1) throw new Error("Encontré videos pero no pude bajar sus fotos. Intenta otra vez."); continue; }
    // La IA mira cada foto: quedan solo las que muestran el item de cerca (y con su efecto), la mejor primero.
    let notas = null;
    try { notas = await calificarFotos(clave, it, cand, oficial, f, ejemplos); } catch (e) { notas = null; }
    if (!notas || !Object.keys(notas).length) { sinNotas = true; todas = todas.concat(cand); break; }
    todas = todas.concat(cand.map(function (x, i) { return Object.assign({}, x, { nota: notas[i] != null ? notas[i] : 0 }); }));
    if (todas.some(function (x) { return x.nota >= NOTA_MIN; })) break;
  }
  if (!todas.length) throw new Error("Encontré videos pero no pude bajar sus fotos. Intenta otra vez.");
  if (sinNotas) return { fotos: todas.slice(0, 6), aviso: "" };
  todas.sort(function (a, b) { return b.nota - a.nota; });
  const buenas = todas.filter(function (x) { return x.nota >= NOTA_MIN; });
  if (buenas.length) return { fotos: buenas.slice(0, 6), aviso: "" };
  return { fotos: todas.slice(0, 3), aviso: it.efecto
    ? "No encontré fotos donde se vea el efecto " + it.efecto + " de este item (busqué 2 veces). Estas son las mejores que hallé, pero NO muestran el efecto: mejor sube tú una captura del juego con el efecto."
    : "No encontré fotos donde el item se vea de cerca. Estas son las mejores; si no te gustan, sube una tú." };
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

module.exports = { MODELO, HERRAMIENTA, limpiarItem, armarPedido, leerRespuesta, mensajeError, escribirTextos, idsYoutube, buscarFotos, limpiarFeedback, elegirEjemplos, limpiarPublicacion, descEfecto, nombreBusqueda, consultasYoutube, videosDeHtml };
