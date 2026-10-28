"use strict";
/* Trae desde TU computadora el precio del Mercado de Steam (US$) de los items de tu catálogo.
   Uso: doble clic en precios-steam.bat. Genera precios-steam.txt (y lo copia al portapapeles).
   Luego, en la página (modo admin → Comprar items) pulsa "📋 Pegar precios de Steam" y pega la lista. */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PROYECTO = "litlejacob-store";
const BASE = "https://firestore.googleapis.com/v1/projects/" + PROYECTO + "/databases/(default)/documents/";
const ESPERA_MS = 3500;          // pausa entre consultas (≈17 por minuto)
const ESPERA_LIMITE_MS = 90000;  // si Steam pide esperar (429)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function parsePrecio(p) {
  if (!p || !p.success) return null;
  const v = parseFloat(String(p.lowest_price || p.median_price || "").replace(/[^0-9.]/g, ""));
  return isFinite(v) && v > 0 ? v : null;
}

async function catalogo() {
  const out = []; let tk = "";
  do {
    const r = await fetch(BASE + "rayas_items?pageSize=300" + (tk ? "&pageToken=" + encodeURIComponent(tk) : ""));
    if (!r.ok) throw new Error("No se pudo leer el catálogo (" + r.status + ").");
    const j = await r.json();
    (j.documents || []).forEach((d) => {
      const f = d.fields || {};
      out.push({ nombre: (f.nombre && f.nombre.stringValue) || "", activo: f.activo ? f.activo.booleanValue !== false : true,
        usd: f.steamUsd ? Number(f.steamUsd.doubleValue !== undefined ? f.steamUsd.doubleValue : f.steamUsd.integerValue || 0) : 0,
        act: (f.steamAct && f.steamAct.timestampValue) || "" });
    });
    tk = j.nextPageToken || "";
  } while (tk && out.length < 3000);
  return out;
}

async function precio(nombre) {
  const url = "https://steamcommunity.com/market/priceoverview/?appid=570&currency=1&market_hash_name=" + encodeURIComponent(nombre);
  for (let k = 0; k < 3; k++) {
    let r;
    try { r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } }); } catch (e) { await dormir(5000); continue; }
    if (r.status === 429) { console.log("   Steam pidió esperar. Pausa de " + ESPERA_LIMITE_MS / 1000 + " s…"); await dormir(ESPERA_LIMITE_MS); continue; }
    if (!r.ok) return { usd: null, estado: "HTTP " + r.status };
    return { usd: parsePrecio(await r.json().catch(() => null)), estado: "ok" };
  }
  return { usd: null, estado: "limite" };
}

async function principal() {
  const args = process.argv.slice(2), todos = args.includes("--todos"), forzar = args.includes("--forzar");
  console.log("Leyendo tu catálogo…");
  let lista = (await catalogo()).filter((x) => x.nombre && (todos || x.activo));
  const hace = Date.now() - 12 * 3600 * 1000;
  const total = lista.length;
  if (!forzar) lista = lista.filter((x) => !(x.usd > 0) || !x.act || Date.parse(x.act) < hace);
  const unicos = Array.from(new Set(lista.map((x) => x.nombre)));
  console.log(total + " items" + (todos ? "" : " visibles") + "; " + unicos.length + " necesitan precio nuevo" + (forzar ? "" : " (los de las últimas 12 h se saltan; usa --forzar para todos)") + ".\n");
  if (!unicos.length) { console.log("Todo está al día."); return; }
  const salida = path.join(__dirname, "precios-steam.txt"), lineas = [], fallos = [];
  for (let i = 0; i < unicos.length; i++) {
    const n = unicos[i], r = await precio(n);
    if (r.usd) { lineas.push(n + " = " + r.usd.toFixed(2)); console.log("[" + (i + 1) + "/" + unicos.length + "] " + n + " → US$ " + r.usd.toFixed(2)); }
    else { fallos.push(n); console.log("[" + (i + 1) + "/" + unicos.length + "] " + n + " → sin precio (" + r.estado + ")"); }
    fs.writeFileSync(salida, lineas.join("\r\n") + "\r\n", "utf8");   // se va guardando por si cierras antes
    if (i < unicos.length - 1) await dormir(ESPERA_MS);
  }
  const texto = lineas.join("\n");
  if (process.platform === "win32" && texto) { try { spawnSync("clip", { input: texto, encoding: "utf8" }); } catch (e) { /* no pasa nada */ } }
  console.log("\nListo: " + lineas.length + " precios guardados en " + salida + (texto && process.platform === "win32" ? " (y copiados al portapapeles)" : "") + ".");
  if (fallos.length) console.log("Sin precio en Steam (" + fallos.length + "): " + fallos.join(", "));
  console.log("\nSiguiente paso: en la página → modo admin → Comprar items → '📋 Pegar precios de Steam' → pega con Ctrl+V → Guardar.");
}

module.exports = { parsePrecio };
if (require.main === module) principal().catch((e) => { console.error("\nError: " + (e && e.message || e)); process.exitCode = 1; });
