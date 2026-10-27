"use strict";
// Lee un item del Mercado de la Comunidad de Steam (Dota 2, appid 570) y devuelve los datos para el formulario de "Comprar items".
// Steam no permite consultarlo desde el navegador (CORS), por eso lo hace una función del servidor.
const HEROES = require("./heroes");
const UA = "Mozilla/5.0 (compatible; RayasStore/1.0)";
const TIPOS = ["Wearable", "Courier", "Ward", "HUD Skin", "Announcer", "Bundle", "Loading Screen", "Pennant", "Sticker"];
const RAREZAS = { immortal: "INMORTAL", arcana: "ARCANO", legendary: "LEGENDARIO", mythical: "MÍTICO", rare: "RARO", uncommon: "POCO COMÚN", common: "COMÚN" };

function nombreDesdeLink(link) {
  const m = String(link || "").trim().match(/^https?:\/\/(?:www\.)?steamcommunity\.com\/market\/listings\/570\/([^?#\s]+)/i);
  if (!m) return null;
  try { const n = decodeURIComponent(m[1]).trim(); return n && n.length <= 150 ? n : null; } catch (e) { return null; }
}

// "Styles: Style 1 Style 2 (Locked) Style 3 (Locked)" -> { n: 3, ok: [1] }
function parseEstilos(txt) {
  const m = String(txt || "").match(/Styles?\s*:\s*((?:Style\s*\d+\s*(?:\(\s*Locked\s*\))?\s*)+)/i);
  if (!m) return null;
  let n = 0; const ok = []; const re = /Style\s*(\d+)\s*(\(\s*Locked\s*\))?/gi; let x;
  while ((x = re.exec(m[1]))) { const k = parseInt(x[1], 10); if (k > n) n = k; if (!x[2]) ok.push(k); }
  return n > 1 && n <= 8 ? { n, ok } : null;
}

function limpiaTag(s) { return String(s || "").replace(/^(Rarity|Quality|Type|Slot|Hero)_/i, "").replace(/_/g, " ").trim(); }

function tipoDe(t) {
  const x = String(t || "").toLowerCase();
  for (const k of TIPOS) if (x.indexOf(k.toLowerCase()) >= 0) return k;
  if (/hud/.test(x)) return "HUD Skin";
  if (/loading/.test(x)) return "Loading Screen";
  return x ? "Otro" : "";
}

// asset: objeto de Steam con name, type, icon_url, tags[], descriptions[]
function interpretar(asset, heroes) {
  const a = asset || {};
  const out = { nombre: String(a.market_name || a.name || "").trim(), icon: a.icon_url_large || a.icon_url || "", tipo: "", heroe: "", ranura: "", rareza: "", calidad: "" };
  const tags = Array.isArray(a.tags) ? a.tags : [];
  for (const t of tags) {
    const cat = String(t.category || t.category_name || "").toLowerCase();
    const val = limpiaTag(t.localized_tag_name || t.name || t.internal_name);
    if (!val) continue;
    if (cat === "hero") out.heroe = val;
    else if (cat === "slot") out.ranura = val;
    else if (cat === "type") out.tipo = tipoDe(val) || out.tipo;
    else if (cat === "rarity") out.rareza = RAREZAS[val.toLowerCase()] || out.rareza;
    else if (cat === "quality") out.calidad = val;
  }
  const descs = Array.isArray(a.descriptions) ? a.descriptions : [];
  const texto = descs.map((d) => String(d.value || "").replace(/<[^>]*>/g, " ")).join(" \n ");
  if (!out.heroe) {
    const m = texto.match(/Used By:\s*([^\n]+)/i);
    if (m) out.heroe = m[1].trim().slice(0, 40);
  }
  if (!out.heroe && heroes) {
    const base = " " + (a.type || "") + " " + texto + " ";
    const h = heroes.find((n) => base.indexOf(" " + n + " ") >= 0 || base.indexOf(n + ",") >= 0);
    if (h) out.heroe = h;
  }
  const est = parseEstilos(texto);
  if (est) { out.estilos = est.n; out.estOk = est.ok.join(","); }
  const tipoTxt = String(a.type || "");
  if (!out.tipo) out.tipo = tipoDe(tipoTxt) || (tipoTxt ? "Otro" : "");
  if (!out.rareza) { const w = tipoTxt.split(/\s+/)[0].toLowerCase(); if (RAREZAS[w]) out.rareza = RAREZAS[w]; }
  if (!out.calidad) { const q = out.nombre.match(/^(Exalted|Heroic|Corrupted|Frozen|Cursed|Infused|Genuine|Unusual|Inscribed|Autographed)\b/i); if (q) out.calidad = q[1]; }
  if (!out.calidad) out.calidad = "Standard";
  return out;
}

async function pedir(url, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 15000);
  try { return await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, signal: c.signal }); } finally { clearTimeout(t); }
}

// Página del listado: trae g_rgAssets con las etiquetas (héroe, ranura, rareza…).
function assetDeHtml(html) {
  const i = html.indexOf("g_rgAssets");
  if (i < 0) return null;
  const ini = html.indexOf("{", i);
  if (ini < 0) return null;
  let prof = 0, enStr = false, esc = false, fin = -1;
  for (let k = ini; k < html.length; k++) {
    const ch = html[k];
    if (enStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') enStr = false; continue; }
    if (ch === '"') enStr = true; else if (ch === "{") prof++; else if (ch === "}") { prof--; if (prof === 0) { fin = k; break; } }
  }
  if (fin < 0) return null;
  let j; try { j = JSON.parse(html.slice(ini, fin + 1)); } catch (e) { return null; }
  const app = j["570"]; if (!app) return null;
  for (const ctx of Object.keys(app)) for (const id of Object.keys(app[ctx] || {})) return app[ctx][id];
  return null;
}

// Página nueva de Steam: muestra "Quality: Exalted  Rarity: Arcana  Type: Wearable  Slot: Weapon  Hero: …" como texto.
function etiquetasDeTexto(html) {
  const txt = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
  const out = {};
  const re = /\b(Quality|Rarity|Type|Slot|Hero|Used By)\s*:\s*([A-Za-z][A-Za-z' .\-]{0,38}?)(?=\s+(?:Quality|Rarity|Type|Slot|Hero|Used By)\s*:|\s{2,}|[,.;]\s|$|\s+(?:Compare|Description|Sold|Steam|Buy|Market|Sell)\b)/g;
  let m;
  while ((m = re.exec(txt))) { const k = m[1].toLowerCase().replace("used by", "hero"); if (!out[k]) out[k] = m[2].trim(); }
  // El héroe va al final de las etiquetas y no hay un separador claro: se reconoce por la lista de héroes.
  const hm = txt.match(/\b(?:Hero|Used By)\s*:\s*(.{1,80})/i);
  if (hm) {
    const resto = hm[1].toLowerCase();
    const h = HEROES.filter((n) => resto.indexOf(n.toLowerCase()) === 0).sort((a, b) => b.length - a.length)[0];
    if (h) out.hero = h;
  }
  const es = parseEstilos(txt);
  if (es) { out.estilos = es.n; out.estOk = es.ok.join(","); }
  const i = txt.search(/\bQuality\s*:/);
  out._trozo = i >= 0 ? txt.slice(i, i + 220) : "";
  return out;
}

async function leerItem(nombre, heroes) {
  const enc = encodeURIComponent(nombre);
  let asset = null, precioUsd = null, etiq = {};
  try {
    const r = await pedir("https://steamcommunity.com/market/listings/570/" + enc);
    if (r.ok) { const html = await r.text(); asset = assetDeHtml(html); etiq = etiquetasDeTexto(html); }
  } catch (e) { /* se intenta el otro camino */ }
  if (!asset) {
    const r = await pedir("https://steamcommunity.com/market/search/render/?query=" + enc + "&appid=570&norender=1&count=10");
    if (!r.ok) throw new Error("Steam no respondió (" + r.status + "). Intenta de nuevo en un minuto.");
    const j = await r.json();
    const f = (j.results || []).find((x) => x.hash_name === nombre) || null;
    if (!f) throw new Error("No encontré ese item en el Mercado de Steam. Revisa el link.");
    asset = Object.assign({}, f.asset_description || {}, { name: (f.asset_description || {}).name || f.name });
    if (typeof f.sell_price === "number") precioUsd = f.sell_price / 100;
  }
  const datos = interpretar(asset, heroes);
  if (!datos.nombre) datos.nombre = nombre;
  // Lo que Steam muestra como texto en la página completa lo que falte.
  if (!datos.heroe && etiq.hero) datos.heroe = etiq.hero;
  if (!datos.ranura && etiq.slot) datos.ranura = etiq.slot;
  if ((!datos.tipo || datos.tipo === "Otro") && etiq.type) datos.tipo = tipoDe(etiq.type) || datos.tipo;
  if (!datos.rareza && etiq.rarity) datos.rareza = RAREZAS[etiq.rarity.toLowerCase()] || "";
  if ((!datos.calidad || datos.calidad === "Standard") && etiq.quality) datos.calidad = etiq.quality;
  if (!datos.estilos && etiq.estilos) { datos.estilos = etiq.estilos; datos.estOk = etiq.estOk; }
  datos.diag = (!datos.heroe || !datos.ranura) ? (etiq._trozo || "sin etiquetas en la página") : "";
  if (precioUsd === null) {
    try {
      const r = await pedir("https://steamcommunity.com/market/priceoverview/?appid=570&currency=1&market_hash_name=" + enc, 8000);
      if (r.ok) { const p = await r.json(); const v = String(p.lowest_price || p.median_price || "").replace(/[^0-9.]/g, ""); if (v) precioUsd = parseFloat(v); }
    } catch (e) { /* el precio es opcional */ }
  }
  datos.precioUsd = precioUsd;
  datos.imgData = null;
  if (datos.icon) {
    try {
      const r = await pedir("https://community.cloudflare.steamstatic.com/economy/image/" + datos.icon + "/360fx360f", 10000);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 600000) datos.imgData = "data:" + (r.headers.get("content-type") || "image/png") + ";base64," + buf.toString("base64");
      }
    } catch (e) { /* la foto es opcional */ }
  }
  delete datos.icon;
  return datos;
}

module.exports = { parseEstilos, etiquetasDeTexto, nombreDesdeLink, interpretar, assetDeHtml, leerItem };
