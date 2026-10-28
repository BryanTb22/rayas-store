"use strict";
/* Caché de respuestas de Steam en Firestore + pausa global cuando Steam dice 429.
 * Así, la misma consulta no sale dos veces a Steam dentro de su vigencia y, si Steam pide esperar,
 * dejamos de molestarlo unos minutos y respondemos con lo último que teníamos guardado. */
const crypto = require("crypto");

const PAUSA_MS = 5 * 60 * 1000;
const idDe = (k) => "s_" + crypto.createHash("sha256").update(String(k)).digest("hex").slice(0, 40);

async function pausaHasta(db) {
  try { const s = await db.doc("steam_cache/_pausa").get(); return s.exists ? Number(s.data().hasta) || 0 : 0; } catch (e) { return 0; }
}
async function pausar(db, ms) {
  try { await db.doc("steam_cache/_pausa").set({ hasta: Date.now() + (ms || PAUSA_MS) }); } catch (e) { /* mejor esfuerzo */ }
}
async function leer(db, clave) {
  try { const s = await db.doc("steam_cache/" + idDe(clave)).get(); return s.exists ? s.data() : null; } catch (e) { return null; }
}
async function guardar(db, clave, valor) {
  try {
    const json = JSON.stringify(valor);
    if (json.length > 900000) return;
    await db.doc("steam_cache/" + idDe(clave)).set({ t: Date.now(), json });
  } catch (e) { /* mejor esfuerzo */ }
}

/* conCache(db, clave, ttlMs, fn, opts)
 *  - fn() hace la consulta real a Steam y devuelve el valor (o lanza Error; si el mensaje trae "429" se activa la pausa).
 *  - opts.forzar: ignora la vigencia (pero respeta la pausa).
 * Devuelve { valor, deCache, viejo } o lanza el error. */
async function conCache(db, clave, ttlMs, fn, opts) {
  const o = opts || {};
  const c = await leer(db, clave);
  const fresco = c && Date.now() - c.t < ttlMs;
  if (fresco && !o.forzar) return { valor: JSON.parse(c.json), deCache: true, viejo: false };
  if (await pausaHasta(db) > Date.now()) {
    if (c) return { valor: JSON.parse(c.json), deCache: true, viejo: true };
    const e = new Error("Steam pidió esperar. Para no saturarlo, el sistema descansa unos minutos: intenta de nuevo en 5 minutos."); e.limite = true; throw e;
  }
  try {
    const valor = await fn();
    await guardar(db, clave, valor);
    return { valor, deCache: false, viejo: false };
  } catch (e) {
    if (e && (e.limite || /\b429\b/.test(String(e.message)))) {
      await pausar(db);
      if (c) return { valor: JSON.parse(c.json), deCache: true, viejo: true };
      e.limite = true;
    }
    throw e;
  }
}

module.exports = { conCache, pausar, pausaHasta };
