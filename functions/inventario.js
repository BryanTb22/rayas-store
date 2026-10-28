"use strict";
/* Lee el inventario público de Dota 2 (appid 570, contexto 2) a partir de un trade link. */
const crypto = require("crypto");
const BASE64 = BigInt("76561197960265728");

function steamIdDeTradeLink(link) {
  const m = /[?&]partner=(\d{1,12})/.exec(String(link || ""));
  if (!m) return null;
  const n = BigInt(m[1]);
  if (n <= 0n) return null;
  return String(n + BASE64);
}

const TIPOS = ["Wearable", "Courier", "Ward", "HUD Skin", "Announcer", "Bundle", "Loading Screen", "Pennant", "Sticker"];
const RAREZAS = { immortal: "INMORTAL", arcana: "ARCANO", legendary: "LEGENDARIO", mythical: "MÍTICO", rare: "RARO", uncommon: "POCO COMÚN", common: "COMÚN" };

/* Tipo, héroe, ranura, rareza y calidad que Steam trae en las etiquetas (tags) de cada item. */
function etiquetas(d) {
  const out = { tipo: "", heroe: "", ranura: "", rareza: "", calidad: "" };
  (d.tags || []).forEach((t) => {
    const cat = String(t.category || "").toLowerCase();
    const v = String(t.localized_tag_name || t.name || "").trim();
    if (!v) return;
    if (cat === "type") out.tipo = TIPOS.filter((x) => x.toLowerCase() === v.toLowerCase())[0] || "Otro";
    else if (cat === "hero") out.heroe = v;
    else if (cat === "slot") out.ranura = v;
    else if (cat === "rarity") out.rareza = RAREZAS[v.toLowerCase()] || "";
    else if (cat === "quality") out.calidad = v;
  });
  return out;
}

/* Agrupa por market_hash_name; solo cuenta los intercambiables. */
function agrupar(data) {
  const desc = {};
  (data.descriptions || []).forEach((d) => { desc[d.classid + "_" + d.instanceid] = d; });
  const grupos = {};
  let noTradables = 0;
  (data.assets || []).forEach((a) => {
    const d = desc[a.classid + "_" + a.instanceid];
    if (!d) return;
    if (!d.tradable) { noTradables += Number(a.amount || 1); return; }
    const k = d.market_hash_name || d.name;
    if (!k) return;
    const g = grupos[k] || (grupos[k] = Object.assign({
      k: k, name: d.market_name || d.name || k, n: 0,
      icon: d.icon_url ? "https://community.cloudflare.steamstatic.com/economy/image/" + d.icon_url + "/128fx128f" : "",
      color: /^[0-9a-fA-F]{6}$/.test(d.name_color || "") ? "#" + d.name_color : ""
    }, etiquetas(d)));
    g.n += Number(a.amount || 1);
  });
  return { items: Object.keys(grupos).map((k) => grupos[k]).sort((x, y) => x.name.localeCompare(y.name)), noTradables: noTradables };
}


/* ---- Gemas (Prismatic, Ethereal, Inscribed, Unusual Effect…) que Steam muestra en la descripción de cada item ---- */
function limpiarHtml(h) {
  return String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
const RE_TIPO_GEMA = /^((?:[A-Za-z]+\s+){0,2}Gem)$/i;           // "Prismatic Gem", "Ethereal Gem", "Unusual Effect Gem", "Inscribed Gem"
const RE_NOMBRE_TIPO = /^(.{2,60}?)\s*(?:[:\-–—]|\()\s*((?:[A-Za-z]+\s+){0,2}Gem)\)?$/i;  // "Champion's Green - Prismatic Gem" / "(Prismatic Gem)"
function lineasDe(d) {
  const out = [];
  (d.descriptions || []).forEach((x) => limpiarHtml(x && x.value).split("\n").forEach((l) => { l = l.replace(/\s+/g, " ").trim(); if (l) out.push(l); }));
  return out;
}
/* Devuelve { gemas: ["Prismatic Gem: Champion's Green", …], sinLeer: [líneas con "Gem" que no pude emparejar] } */
function gemasDe(d) {
  const L = lineasDe(d), gemas = [], sinLeer = [], usado = {};
  L.forEach((l, i) => {
    if (usado[i]) return;
    if (RE_TIPO_GEMA.test(l) && i > 0 && !RE_TIPO_GEMA.test(L[i - 1])) { gemas.push(l + ": " + L[i - 1]); usado[i - 1] = usado[i] = 1; return; }
    const m = RE_NOMBRE_TIPO.exec(l);
    if (m) { gemas.push(m[2] + ": " + m[1]); usado[i] = 1; return; }
    if (/\bGem\b/i.test(l) && !RE_TIPO_GEMA.test(l)) sinLeer.push(l);
  });
  L.forEach((l, i) => { if (!usado[i] && RE_TIPO_GEMA.test(l)) sinLeer.push(l); });
  return { gemas, sinLeer };
}

/* Para importar al catálogo: cada item con gemas distintas es único (stock 1+); los iguales se agrupan. */
function agruparDetalle(data) {
  const desc = {};
  (data.descriptions || []).forEach((d) => { desc[d.classid + "_" + d.instanceid] = d; });
  const grupos = {}, diag = [];
  let noTradables = 0;
  (data.assets || []).forEach((a) => {
    const d = desc[a.classid + "_" + a.instanceid];
    if (!d) return;
    if (!d.tradable) { noTradables += Number(a.amount || 1); return; }
    const nombre = d.market_hash_name || d.name;
    if (!nombre) return;
    const g0 = gemasDe(d);
    if (g0.sinLeer.length && diag.length < 3) diag.push({ name: nombre, lineas: g0.sinLeer.slice(0, 4) });
    const sig = g0.gemas.length ? crypto.createHash("sha1").update(g0.gemas.slice().sort().join("|")).digest("hex").slice(0, 8) : "";
    const k = nombre + "#" + sig;
    const g = grupos[k] || (grupos[k] = Object.assign({
      k, name: d.market_name || d.name || nombre, n: 0, sig, gemas: g0.gemas,
      icon: d.icon_url ? "https://community.cloudflare.steamstatic.com/economy/image/" + d.icon_url + "/128fx128f" : "",
      color: /^[0-9a-fA-F]{6}$/.test(d.name_color || "") ? "#" + d.name_color : ""
    }, etiquetas(d)));
    g.n += Number(a.amount || 1);
  });
  return { items: Object.keys(grupos).map((k) => grupos[k]).sort((x, y) => x.name.localeCompare(y.name)), noTradables, diag };
}

module.exports = { steamIdDeTradeLink, agrupar, agruparDetalle, etiquetas, gemasDe };
