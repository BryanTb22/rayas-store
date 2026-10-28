"use strict";
/*
 * Entrar con Steam (OpenID 2.0) para Rayas Store y LitleJacob Store.
 *
 *  1) steamIniciar  (POST)  -> el navegador pide la dirección de Steam a la que debe ir.
 *  2) steamCallback (GET)   -> Steam devuelve al cliente aquí; verificamos CON STEAM que la respuesta es auténtica
 *                              y recién entonces damos un token de Firebase (createCustomToken).
 *
 * REGLA DE ORO: nunca se confía en nada que venga en la dirección (query) sin que Steam lo confirme con
 * "check_authentication" (is_valid:true). El nonce de un solo uso (steam_nonces) amarra la respuesta a QUIEN la pidió.
 *
 * Las colecciones steam_nonces y steam_links son SOLO del servidor (Admin SDK): las reglas de Firestore deben negarlas.
 */
const crypto = require("crypto");

const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const BASE64_STEAM = 76561197960265728n; // SteamID64 - esto = código de amigo
const NONCE_MIN = 10;

/* ---------- funciones puras (se prueban con node, ver steamlogin.test.js) ---------- */
function origenPermitido(origen, lista) { return typeof origen === "string" && lista.indexOf(origen) >= 0; }

// Ruta a la que se vuelve en el sitio (ej. "/" o "/rifas.html"): solo caracteres seguros, sin "//" ni "..".
function rutaSegura(r) {
  r = typeof r === "string" && r ? r : "/";
  return /^\/[A-Za-z0-9._\-\/]{0,79}$/.test(r) && r.indexOf("//") < 0 && r.indexOf("..") < 0 ? r : "/";
}

function nonceNuevo() { return crypto.randomBytes(24).toString("hex"); }
function nonceValido(n) { return typeof n === "string" && /^[a-f0-9]{48}$/.test(n); }
function nonceVencido(doc, ahora) { return !doc || !(Number(doc.exp) > ahora); }

function steamIdDeClaimed(c) {
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(String(c || ""));
  return m ? m[1] : null;
}
function codigoAmigo(id64) { try { return (BigInt(id64) - BASE64_STEAM).toString(); } catch (e) { return ""; } }

function urlDeSteam(returnTo, realm) {
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select"
  });
  return STEAM_OPENID + "?" + p.toString();
}

// Revisa lo que se puede revisar SIN red. Devuelve { steamId } o { error }. La verificación con Steam va aparte.
function revisarRespuesta(q, returnEsperado) {
  q = q || {};
  if (q["openid.mode"] !== "id_res") return { error: "Cancelaste el inicio de sesión con Steam." };
  if (q["openid.op_endpoint"] !== STEAM_OPENID) return { error: "Respuesta de Steam no válida." };
  if (q["openid.return_to"] !== returnEsperado) return { error: "Respuesta de Steam no válida." };
  const firmados = String(q["openid.signed"] || "").split(",");
  if (["claimed_id", "identity", "return_to", "response_nonce", "op_endpoint"].some((k) => firmados.indexOf(k) < 0)) return { error: "Respuesta de Steam no válida." };
  const steamId = steamIdDeClaimed(q["openid.claimed_id"]);
  if (!steamId || q["openid.identity"] !== q["openid.claimed_id"]) return { error: "No pudimos leer tu cuenta de Steam." };
  return { steamId };
}

function cuerpoVerificacion(q) {
  const p = new URLSearchParams();
  Object.keys(q).forEach((k) => { if (k.indexOf("openid.") === 0 && typeof q[k] === "string") p.set(k, q[k]); });
  p.set("openid.mode", "check_authentication");
  return p.toString();
}
function esValidoSteam(texto) { return /(^|\n)is_valid\s*:\s*true\s*(\n|$)/.test(String(texto || "")); }

function nombreDeXml(xml) {
  const m = /<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/.exec(String(xml || ""));
  const n = m ? m[1].replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) : "";
  return n;
}

// Datos públicos del perfil (XML de Steam). Es texto externo: se limpia y se limita. Si no hay nada útil, devuelve {}.
function perfilDeXml(xml, steamId) {
  xml = String(xml || "");
  const tag = (t) => { const m = new RegExp("<" + t + ">(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</" + t + ">").exec(xml); return m ? m[1].trim() : ""; };
  const out = {};
  const av = tag("avatarFull") || tag("avatarMedium");
  if (/^https:\/\/[^\s"'<>]{1,300}$/.test(av)) out.steamAvatar = av;
  const loc = tag("location").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
  if (loc) out.steamPais = loc;
  const priv = tag("privacyState").toLowerCase();
  if (priv) out.steamPublico = priv === "public";
  if (/^\d{17}$/.test(String(steamId || ""))) out.steamPerfilUrl = "https://steamcommunity.com/profiles/" + steamId;
  return out;
}

/* ---------- las funciones de Firebase ---------- */
function crear(ctx) {
  const { admin, db, onRequest, REGION, ORIGENES, uidDeLaPeticion, ADMIN_UID } = ctx;
  const proyecto = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "litlejacob-store";
  const REALM = "https://" + REGION + "-" + proyecto + ".cloudfunctions.net";
  const RETURN = REALM + "/steamCallback";
  const FV = admin.firestore.FieldValue;
  // Perfil público de Steam (apodo y datos de la ficha). Si Steam no responde, devuelve {} y el login sigue igual.
  async function perfilPublico(steamId) {
    try {
      const x = await fetch("https://steamcommunity.com/profiles/" + steamId + "?xml=1", { signal: AbortSignal.timeout(4000) });
      if (!x.ok) return { nombre: "", datos: {} };
      const t = await x.text();
      return { nombre: nombreDeXml(t), datos: perfilDeXml(t, steamId) };
    } catch (e) { return { nombre: "", datos: {} }; }
  }

  const steamIniciar = onRequest({ region: REGION, cors: ORIGENES, maxInstances: 5, timeoutSeconds: 15 }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const b = req.body || {};
    if (!origenPermitido(b.origen, ORIGENES)) return res.status(400).json({ error: "Origen no permitido." });
    const uid = await uidDeLaPeticion(req); // con sesión = vincular; sin sesión = entrar
    if (uid === ADMIN_UID) return res.status(400).json({ error: "El administrador entra con correo o Google." });
    const nonce = nonceNuevo();
    await db.doc("steam_nonces/" + nonce).set({ uid: uid || null, origen: b.origen, ruta: rutaSegura(b.ruta), exp: Date.now() + NONCE_MIN * 60000 });
    res.json({ url: urlDeSteam(RETURN + "?n=" + nonce, REALM) });
  });

  const steamCallback = onRequest({ region: REGION, maxInstances: 5, timeoutSeconds: 30 }, async (req, res) => {
    let destino = null; // se llena apenas sabemos a qué sitio volver
    const volver = (hash) => res.redirect(302, (destino || ORIGENES[0] + "/") + "#" + hash);
    const fallo = (m) => volver("steamerror=" + encodeURIComponent(m));
    try {
      const n = req.query.n;
      if (req.method !== "GET" || !nonceValido(n)) return res.status(400).send("Solicitud no válida.");
      // Un solo uso: se lee y se borra en la misma transacción.
      const ref = db.doc("steam_nonces/" + n);
      const doc = await db.runTransaction(async (tx) => { const s = await tx.get(ref); if (s.exists) tx.delete(ref); return s.exists ? s.data() : null; });
      if (!doc) return res.status(400).send("Este enlace ya se usó o no existe. Vuelve a intentarlo desde la página.");
      if (!origenPermitido(doc.origen, ORIGENES)) return res.status(400).send("Origen no permitido.");
      destino = doc.origen + rutaSegura(doc.ruta);
      if (nonceVencido(doc, Date.now())) return fallo("Se agotó el tiempo. Vuelve a intentarlo.");

      const r = revisarRespuesta(req.query, RETURN + "?n=" + n);
      if (r.error) return fallo(r.error);
      // Confirmación con Steam: sin "is_valid:true" no hay sesión.
      const v = await fetch(STEAM_OPENID, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: cuerpoVerificacion(req.query), signal: AbortSignal.timeout(10000) });
      if (!v.ok || !esValidoSteam(await v.text())) return fallo("Steam no confirmó el inicio de sesión.");
      const steamId = r.steamId;

      const lRef = db.doc("steam_links/" + steamId);
      if (doc.uid) { // ---- vincular a la cuenta con sesión ----
        const ok = await db.runTransaction(async (tx) => {
          const s = await tx.get(lRef);
          if (s.exists && s.data().uid !== doc.uid) return false;
          if (!s.exists) tx.set(lRef, { uid: doc.uid, creado: FV.serverTimestamp() });
          return true;
        });
        if (!ok) return fallo("Esa cuenta de Steam ya está vinculada a otra cuenta.");
        const uRef = db.doc("rayas_users/" + doc.uid), u = await uRef.get();
        if (u.exists) { // el perfil existe: guardamos el ID (y el código de amigo si lo tenía vacío)
          const cambios = Object.assign({ steamId }, (await perfilPublico(steamId)).datos);
          if (!u.data().steam) cambios.steam = codigoAmigo(steamId);
          await uRef.update(cambios);
        }
        return volver("steam=ok");
      }
      // ---- entrar (o crear la cuenta la primera vez) ----
      let uid, nuevo = false;
      await db.runTransaction(async (tx) => {
        const s = await tx.get(lRef);
        if (s.exists) { uid = s.data().uid; return; }
        uid = "steam_" + steamId; nuevo = true;
        tx.set(lRef, { uid, creado: FV.serverTimestamp() });
      });
      if (uid === ADMIN_UID) return fallo("El administrador entra con correo o Google.");
      const pp = await perfilPublico(steamId), nombre = pp.nombre;
      let extra = "";
      if (nuevo) { // la cuenta aún no tiene perfil: los datos viajan al formulario, que los guarda al crearlo
        if (pp.datos.steamAvatar) extra += "&av=" + encodeURIComponent(pp.datos.steamAvatar);
        if (pp.datos.steamPais) extra += "&pa=" + encodeURIComponent(pp.datos.steamPais);
        if (typeof pp.datos.steamPublico === "boolean") extra += "&pu=" + (pp.datos.steamPublico ? "1" : "0");
      } else { // ya tiene perfil: se actualiza aquí (sin tocar nada más)
        try { const uRef = db.doc("rayas_users/" + uid), u = await uRef.get(); if (u.exists && Object.keys(pp.datos).length) await uRef.update(Object.assign({ steamId }, pp.datos)); } catch (e) { /* no rompe el login */ }
      }
      const token = await admin.auth().createCustomToken(uid, { steamId });
      return volver("steamtoken=" + token + "&sid=" + steamId + (nuevo ? "&nuevo=1" : "") + (nombre ? "&nom=" + encodeURIComponent(nombre) : "") + extra);
    } catch (e) {
      console.error("steamCallback", e && e.message);
      return fallo("No se pudo entrar con Steam. Intenta de nuevo.");
    }
  });

  return { steamIniciar, steamCallback };
}

module.exports = { crear, puros: { origenPermitido, rutaSegura, nonceNuevo, nonceValido, nonceVencido, steamIdDeClaimed, codigoAmigo, urlDeSteam, revisarRespuesta, cuerpoVerificacion, esValidoSteam, nombreDeXml, perfilDeXml, STEAM_OPENID } };
