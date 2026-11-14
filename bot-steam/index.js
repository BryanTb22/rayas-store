/* =====================================================================
   BOT DE STEAM — Rayas Store + LitleJacob Store
   - Inicia sesión en la cuenta del bot con su maFile (Steam Guard sin celular).
   - Escucha en Firestore los pedidos de items que el admin APROBÓ en el panel
     (orders.bot.estado == "aprobado") y le envía la oferta al trade link del cliente.
   - Confirma la oferta con el autenticador y va guardando el estado en el pedido:
       aprobado → enviando → enviada → aceptada (y el pedido pasa a "entregado")
                                     ↘ fallida / retenida / cancelada
   - Nunca envía nada que el admin no haya aprobado (modo prueba).
   - Cada minuto deja un "latido" en bot_estado/steam para que el panel sepa si está en línea.
   - v1.2: recibe las ventas de "Vender skins" (trade con código V-XXXXX) y paga en saldo; sube la lista de precios de compra.
   - v1.1: publica su inventario (bot_estado/inventario), un registro de lo que hace (bot_log)
     y obedece comandos del panel (bot_estado/comando): pausar, reanudar, inventario, reconectar.
   ===================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const SteamUser = require("steam-user");
const SteamCommunity = require("steamcommunity");
const TradeOfferManager = require("steam-tradeoffer-manager");
const SteamTotp = require("steam-totp");
const admin = require("firebase-admin");
const u = require("./util");

const VERSION = "1.2.0";
const E = TradeOfferManager.ETradeOfferState;
const cfg = u.leerConfig(process.env);
const mafile = JSON.parse(fs.readFileSync(path.resolve(__dirname, cfg.mafile), "utf8"));
if (!mafile.shared_secret || !mafile.identity_secret) throw new Error("El maFile no tiene shared_secret / identity_secret.");

/* ---------- Firebase (con la cuenta de servicio, solo en el servidor) ---------- */
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, cfg.credenciales))) });
const db = admin.firestore();
const AHORA = () => admin.firestore.FieldValue.serverTimestamp();

/* ---------- Steam ---------- */
const client = new SteamUser({ autoRelogin: true });
const community = new SteamCommunity();
const POLL_FILE = path.join(__dirname, "poll.json");
const manager = new TradeOfferManager({
  steam: client,
  community,
  language: "es",
  pollInterval: 30000,
  cancelTime: cfg.vencerHoras * 3600 * 1000, // ofertas sin respuesta se cancelan solas
  pollData: leerJson(POLL_FILE),
});

let listo = false;            // sesión web lista para tradear
let ultimoInventario = null;  // cantidad de items tradeables (para el latido)
let esperaSteam = "";         // aviso si Steam aún retiene los trades del bot
const cola = [];              // pedidos por procesar (de a uno)
const enCola = new Set();
let trabajando = false;
let pausado = false;          // el admin pausó los envíos desde el panel
const cuenta = { limitada: null, puedeInvitar: null, bloqueada: false, saldo: null, moneda: null };
let resumenOfertas = [];      // ofertas activas para mostrar en el panel
let ultimoComando = "";

function log(...a) { console.log(new Date().toISOString(), ...a); }
// Registro visible en el panel (colección bot_log). tipo: info | ok | error | aviso
function registrar(tipo, texto, extra) {
  log("[" + tipo + "]", texto);
  db.collection("bot_log").add(Object.assign({ t: AHORA(), tipo, texto: String(texto).slice(0, 400) }, extra || {})).catch((e) => log("No se pudo guardar el registro:", e.message));
}
function leerJson(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return undefined; } }
function p(fn) { return new Promise((ok, mal) => fn((err, ...r) => (err ? mal(err) : ok(r.length > 1 ? r : r[0])))); }
// getInventoryContents responde (err, inventario, monedas): nos quedamos solo con el inventario.
async function leerInventario() { const r = await p((cb) => manager.getInventoryContents(570, 2, true, cb)); return Array.isArray(r && r[0]) ? r[0] : (r || []); }

manager.on("pollData", (d) => { try { fs.writeFileSync(POLL_FILE, JSON.stringify(d)); } catch (e) { log("No se pudo guardar poll.json", e.message); } });

function iniciarSesion() {
  log("Iniciando sesión en Steam como", cfg.usuario);
  client.logOn({ accountName: cfg.usuario, password: cfg.clave, twoFactorCode: SteamTotp.generateAuthCode(mafile.shared_secret) });
}
client.on("steamGuard", (dominio, callback) => { callback(SteamTotp.generateAuthCode(mafile.shared_secret)); });
client.on("loggedOn", () => { registrar("ok", "Conectado a Steam (" + cfg.usuario + ")."); client.setPersona(SteamUser.EPersonaState.Online); });
client.on("accountLimitations", (limitada, baneada, bloqueada, puedeInvitar) => {
  cuenta.limitada = !!limitada; cuenta.bloqueada = !!bloqueada; cuenta.puedeInvitar = !!puedeInvitar;
  if (limitada) registrar("aviso", "Steam marca la cuenta como LIMITADA: falta gastar el equivalente a US$5.");
});
client.on("wallet", (tiene, moneda, saldo) => { cuenta.moneda = moneda; cuenta.saldo = typeof saldo === "number" ? saldo : null; });
// Errores graves (contraseña mala, sesión abierta en otro lado…): reintento cada 10 min para no bloquear la cuenta.
client.on("error", (e) => { listo = false; registrar("error", "Error de Steam: " + e.message + " — reintento en 10 minutos."); setTimeout(iniciarSesion, 10 * 60000); });
client.on("disconnected", (eres, msg) => { listo = false; registrar("aviso", "Desconectado de Steam: " + (msg || eres)); });
client.on("webSession", async (sessionID, cookies) => {
  try {
    await p((cb) => manager.setCookies(cookies, cb));
    community.setCookies(cookies);
    listo = true;
    registrar("ok", "Sesión web lista: el bot puede tradear.");
    await revisarInterrumpidos();
    publicarInventario();
    despertar();
    revisarVentasPendientes();
  } catch (e) { log("No se pudo preparar la sesión web:", e.message); }
});
community.on("sessionExpired", () => { listo = false; log("Sesión web vencida, renovando…"); client.webLogOn(); });

/* ---------- utilidades de Firestore ---------- */
function guardarBot(ref, datos, extra) {
  const campos = { "bot.actualizado": AHORA() };
  for (const k of Object.keys(datos)) campos["bot." + k] = datos[k];
  return ref.update(Object.assign(campos, extra || {}));
}

/* ---------- ofertas activas (para no usar dos veces la misma unidad) ---------- */
async function ofertasActivas() {
  const [enviadas] = await p((cb) => manager.getOffers(TradeOfferManager.EOfferFilter.ActiveOnly, cb));
  return enviadas || [];
}
async function reservados() {
  const set = new Set();
  for (const o of await ofertasActivas()) for (const it of o.itemsToGive || []) set.add(String(it.assetid));
  return set;
}

/* ---------- enviar un pedido aprobado ---------- */
async function enviarPedido(ref) {
  // 1) Lo tomamos con una transacción para no enviarlo dos veces.
  const tomado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() || {};
    if (!d.bot || d.bot.estado !== "aprobado") return null;
    if (d.origen !== "items") { tx.update(ref, { "bot.estado": "fallida", "bot.motivo": "Solo se envían pedidos de items.", "bot.actualizado": AHORA() }); return null; }
    if (d.status !== "pagado") { tx.update(ref, { "bot.estado": "fallida", "bot.motivo": "El pedido no está en «Por entregar».", "bot.actualizado": AHORA() }); return null; }
    tx.update(ref, { "bot.estado": "enviando", "bot.motivo": "", "bot.tomadoEn": AHORA(), "bot.actualizado": AHORA() });
    return d;
  });
  if (!tomado) return;
  const code = tomado.code || ref.id;
  registrar("info", "Preparando la oferta del pedido " + code + ".", { code });

  const fallar = (motivo) => { registrar("error", "Pedido " + code + ": " + motivo, { code }); return guardarBot(ref, { estado: "fallida", motivo }); };

  const trade = u.leerTradelink(tomado.tradelink);
  if (!trade) return fallar("El cliente no tiene un trade link válido.");

  // 2) Buscar los items en el inventario del bot.
  let inventario;
  try { inventario = await leerInventario(); }
  catch (e) { return guardarBot(ref, { estado: "aprobado", motivo: "No se pudo leer el inventario del bot (" + e.message + "). Se reintentará." }); }
  ultimoInventario = inventario.length;
  const pedido = (tomado.items || []).map((i) => ({ name: i.name, qty: i.qty }));
  const { elegidos, faltan } = u.elegirItems(inventario, pedido, await reservados());
  if (faltan.length) return fallar("Al bot le falta en su inventario: " + faltan.map((f) => f.faltan + " × " + f.name).join(", ") + ".");

  // 3) Armar la oferta y revisar retenciones antes de enviarla.
  const oferta = manager.createOffer(tomado.tradelink);
  oferta.addMyItems(elegidos);
  oferta.setMessage(u.mensajeOferta(code, tomado.tienda));
  try {
    const [yo, ellos] = await p((cb) => oferta.getUserDetails(cb));
    if (yo && yo.escrowDays > 0) {
      esperaSteam = "Steam aún retiene los trades del bot (" + yo.escrowDays + " días). Pasa cuando el autenticador cumpla 7 días.";
      return guardarBot(ref, { estado: "aprobado", motivo: esperaSteam + " El pedido sigue en cola." });
    }
    esperaSteam = "";
    if (ellos && ellos.escrowDays > 0) return fallar("El cliente no tiene Steam Guard móvil: Steam retendría el item " + ellos.escrowDays + " días. Pídele que lo active.");
  } catch (e) {
    return fallar("Steam no dejó preparar la oferta (" + e.message + "). Revisa que el trade link del cliente esté vigente y su inventario sea público.");
  }

  // 4) Enviar y confirmar con el autenticador.
  let estadoEnvio;
  try { estadoEnvio = await p((cb) => oferta.send(cb)); }
  catch (e) { return fallar("Steam rechazó la oferta: " + e.message); }
  // Si el admin pidió cancelar mientras se enviaba, se cancela la oferta en vez de confirmarla.
  const cancelado = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() || {};
    const pidio = d.bot && d.bot.estado === "cancelar";
    tx.update(ref, { "bot.estado": pidio ? "cancelar" : "enviando", "bot.ofertaId": String(oferta.id), "bot.assetids": elegidos.map((i) => String(i.assetid)), "bot.motivo": pidio ? "Cancelando…" : "Confirmando con Steam Guard…", "bot.actualizado": AHORA() });
    return pidio;
  });
  if (cancelado) { try { await p((cb) => oferta.cancel(cb)); } catch (e) { /* ya no estaba activa */ } return guardarBot(ref, { estado: "cancelada", motivo: "Oferta cancelada desde el panel." }); }
  if (estadoEnvio === "pending") {
    try { await p((cb) => community.acceptConfirmationForObject(mafile.identity_secret, oferta.id, cb)); }
    catch (e) { return guardarBot(ref, { estado: "enviando", motivo: "La oferta " + oferta.id + " quedó sin confirmar (" + e.message + "). Se reintentará al reiniciar el bot." }); }
  }
  // Solo pasa a «enviada» si nadie la canceló ni Steam ya la resolvió (aceptada al toque, etc.).
  const yaResuelta = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() || {};
    if (d.bot && d.bot.estado !== "enviando") return d.bot.estado;
    tx.update(ref, { "bot.estado": "enviada", "bot.motivo": "Esperando que el cliente acepte.", "bot.enviadaEn": AHORA(), "bot.actualizado": AHORA() });
    return "";
  });
  registrar("ok", "Pedido " + code + ": oferta #" + oferta.id + (yaResuelta ? " (" + yaResuelta + ")" : " enviada al cliente."), { code, ofertaId: String(oferta.id) });
}

/* ---------- cancelar una oferta pedida desde el panel ---------- */
async function cancelarPedido(ref) {
  const d = (await ref.get()).data() || {};
  if (!d.bot || d.bot.estado !== "cancelar") return;
  if (!d.bot.ofertaId) return guardarBot(ref, { estado: "cancelada", motivo: "Cancelado desde el panel antes de enviarse." });
  try {
    const of = await p((cb) => manager.getOffer(d.bot.ofertaId, cb));
    if (of.state === E.Active || of.state === E.CreatedNeedsConfirmation) await p((cb) => of.cancel(cb));
    await guardarBot(ref, { estado: "cancelada", motivo: "Oferta cancelada desde el panel." });
    registrar("info", "Pedido " + (d.code || ref.id) + ": oferta cancelada desde el panel.", { code: d.code || ref.id });
  } catch (e) { await guardarBot(ref, { estado: "enviada", motivo: "No se pudo cancelar la oferta: " + e.message }); }
}

/* ---------- cambios de estado de las ofertas enviadas ---------- */
manager.on("sentOfferChanged", async (oferta, antes) => {
  try {
    const q = await db.collection("orders").where("bot.ofertaId", "==", String(oferta.id)).limit(1).get();
    if (q.empty) return;
    const ref = q.docs[0].ref, d = q.docs[0].data();
    const r = u.estadoDeOferta(oferta.state, E, oferta.escrowEnds);
    const pidioCancelar = d.bot && (d.bot.estado === "cancelada" || d.bot.estado === "cancelar");
    if (!r || (pidioCancelar && !r.entregado)) return;
    registrar(r.entregado ? "ok" : r.estado === "fallida" ? "error" : "info", "Pedido " + (d.code || ref.id) + ": " + r.motivo, { code: d.code || ref.id, ofertaId: String(oferta.id) });
    if (r.entregado) publicarInventario();
    const extra = r.entregado ? { status: "entregado", updatedAt: AHORA(), entregadoPorBot: true } : {};
    await guardarBot(ref, { estado: r.estado, motivo: r.motivo }, extra);
  } catch (e) { log("Error al actualizar oferta", oferta.id, e.message); }
});

/* ---------- si el bot se apagó en medio de un envío ---------- */
async function revisarInterrumpidos() {
  const q = await db.collection("orders").where("bot.estado", "==", "enviando").get();
  if (q.empty) return;
  const activas = await ofertasActivas();
  for (const doc of q.docs) {
    const d = doc.data(), code = d.code || doc.id;
    const of = activas.find((o) => (d.bot.ofertaId && String(o.id) === String(d.bot.ofertaId)) || u.codigoDeMensaje(o.message) === code);
    if (of && of.state === E.CreatedNeedsConfirmation) {
      try { await p((cb) => community.acceptConfirmationForObject(mafile.identity_secret, of.id, cb)); await guardarBot(doc.ref, { estado: "enviada", ofertaId: String(of.id), motivo: "Esperando que el cliente acepte." }); }
      catch (e) { await guardarBot(doc.ref, { motivo: "Falta confirmar la oferta " + of.id + ": " + e.message }); }
    } else if (of) {
      await guardarBot(doc.ref, { estado: "enviada", ofertaId: String(of.id), motivo: "Esperando que el cliente acepte." });
    } else {
      await guardarBot(doc.ref, { estado: "fallida", motivo: "El bot se reinició durante el envío y no hay oferta activa. Vuelve a aprobarlo." });
    }
  }
}

/* =====================================================================
   VENDER SKINS: el cliente le vende items a la tienda.
   La web crea la venta (colección ventas, estado "esperando", con código V-XXXXX y precios congelados).
   El cliente manda el trade al bot con el código en el mensaje. El bot lo acepta SOLO si:
   el código existe y no venció, viene de la misma cuenta de Steam, trae exactamente esos items
   y el bot no entrega nada. Al completarse el trade, suma el saldo una sola vez (transacción).
   Ofertas sin código (o que piden items al bot) no se tocan: quedan para que las veas tú.
   ===================================================================== */
const ventasEnCurso = new Set();
async function procesarVenta(oferta) {
  const code = u.codigoVenta(oferta.message);
  if (!code || pausado || !listo || ventasEnCurso.has(String(oferta.id))) return;
  if (oferta.state !== E.Active) return;
  ventasEnCurso.add(String(oferta.id));
  const ref = db.doc("ventas/" + code);
  try {
    const snap = await ref.get();
    const v = snap.exists ? snap.data() : null;
    const datos = v ? { estado: v.estado, steamId: v.steamId, vence: v.vence && v.vence.toMillis ? v.vence.toMillis() : 0, items: v.items } : null;
    const recibidos = (oferta.itemsToReceive || []).map((i) => ({ market_hash_name: i.market_hash_name || i.name, appid: i.appid }));
    let motivo = u.revisarVenta(datos, { partnerId: oferta.partner.getSteamID64(), darCount: (oferta.itemsToGive || []).length, recibidos }, Date.now());
    if (!motivo) {
      try {
        const [, ellos] = await p((cb) => oferta.getUserDetails(cb));
        if (ellos && ellos.escrowDays > 0) motivo = "Tu cuenta no tiene Steam Guard móvil: Steam retendría el trade " + ellos.escrowDays + " días. Actívalo y vuelve a enviarlo.";
      } catch (e) { motivo = "Steam no dejó revisar el trade (" + e.message + "). Vuelve a enviarlo en unos minutos."; }
    }
    if (motivo) {
      try { await p((cb) => oferta.decline(cb)); } catch (e) { /* ya no estaba activa */ }
      registrar("aviso", "Venta " + code + ": trade #" + oferta.id + " rechazado. " + motivo, { code, ofertaId: String(oferta.id) });
      if (v && v.estado === "esperando") {
        const vencida = /venció/.test(motivo);
        await ref.update({ motivo: "Rechazamos tu trade: " + motivo, actualizada: AHORA(), ...(vencida ? { estado: "vencida" } : {}) }).catch(() => {});
      }
      return;
    }
    // Se toma la venta (esperando → aceptando) para que nunca se acepte dos veces.
    const tomada = await db.runTransaction(async (tx) => {
      const d = (await tx.get(ref)).data() || {};
      if (d.estado !== "esperando") return false;
      tx.update(ref, { estado: "aceptando", ofertaId: String(oferta.id), motivo: "Aceptando tu trade…", actualizada: AHORA() });
      return true;
    });
    if (!tomada) return;
    let st;
    try { st = await p((cb) => oferta.accept(true, cb)); }
    catch (e) {
      await ref.update({ estado: "esperando", motivo: "No se pudo aceptar tu trade (" + e.message + "). Vuelve a enviarlo.", actualizada: AHORA() }).catch(() => {});
      return registrar("error", "Venta " + code + ": no se pudo aceptar el trade #" + oferta.id + ": " + e.message, { code });
    }
    registrar("info", "Venta " + code + ": trade #" + oferta.id + " aceptado (" + st + "). Esperando que Steam lo complete.", { code, ofertaId: String(oferta.id) });
    try { await p((cb) => oferta.update(cb)); } catch (e) { /* lo avisará receivedOfferChanged */ }
    await resultadoVenta(oferta);
  } catch (e) { log("Error con la venta", code, e.message); }
  finally { ventasEnCurso.delete(String(oferta.id)); }
}
// Cuando Steam termina el trade: paga (una sola vez) o deja la venta como fallida.
async function resultadoVenta(oferta) {
  const code = u.codigoVenta(oferta.message);
  if (!code) return;
  const ref = db.doc("ventas/" + code);
  if (oferta.state === E.Accepted) {
    const r = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref), v = s.data() || {};
      if (v.estado !== "aceptando" || v.ofertaId !== String(oferta.id)) return null;
      const uRef = db.doc("rayas_users/" + v.uid), us = await tx.get(uRef);
      if (!us.exists) { tx.update(ref, { estado: "fallida", motivo: "La cuenta del cliente ya no existe: revisar a mano.", actualizada: AHORA() }); return { sinCuenta: true, v }; }
      const saldo = Math.round((Number(us.data().creditos || 0) + Number(v.total)) * 100) / 100;
      tx.update(uRef, { creditos: saldo });
      tx.update(ref, { estado: "pagada", pagada: AHORA(), saldoTras: saldo, motivo: "", actualizada: AHORA() });
      return { v, saldo };
    });
    if (!r) return;
    if (r.sinCuenta) return registrar("error", "Venta " + code + ": se recibieron los items pero la cuenta del cliente no existe. Págalo a mano.", { code });
    registrar("ok", "Venta " + code + ": recibidos " + r.v.count + " items de " + r.v.nombre + ". Se le sumaron S/ " + Number(r.v.total).toFixed(2) + " (saldo: S/ " + r.saldo.toFixed(2) + ").", { code });
    publicarInventario();
  } else if ([E.Declined, E.Canceled, E.InvalidItems, E.Expired, E.Countered, E.InEscrow].includes(oferta.state)) {
    const r = u.estadoDeOferta(oferta.state, E, oferta.escrowEnds);
    const ok = await db.runTransaction(async (tx) => {
      const v = (await tx.get(ref)).data() || {};
      if (v.estado !== "aceptando" || v.ofertaId !== String(oferta.id)) return false;
      // Retenido por Steam: no se paga hasta revisarlo (no debería pasar: se revisa Steam Guard antes de aceptar).
      tx.update(ref, { estado: oferta.state === E.InEscrow ? "retenida" : "fallida", motivo: "El trade no se completó: " + ((r && r.motivo) || "estado " + oferta.state), actualizada: AHORA() });
      return true;
    });
    if (ok) registrar("error", "Venta " + code + ": el trade #" + oferta.id + " no se completó (" + ((r && r.estado) || oferta.state) + ").", { code });
  }
}
manager.on("newOffer", (oferta) => { procesarVenta(oferta).catch((e) => log("newOffer", e.message)); });
manager.on("receivedOfferChanged", (oferta) => { resultadoVenta(oferta).catch((e) => log("receivedOfferChanged", e.message)); });
// Al arrancar, al reanudar y cada 5 min: revisa trades de venta que hayan llegado mientras estaba pausado o apagado.
async function revisarVentasPendientes() {
  if (!listo || pausado) return;
  try {
    const r = await p((cb) => manager.getOffers(TradeOfferManager.EOfferFilter.ActiveOnly, cb));
    for (const o of (r && r[1]) || []) await procesarVenta(o);
  } catch (e) { log("No se pudieron revisar los trades recibidos:", e.message); }
  // Ventas que se están aceptando: por si se perdió el aviso de Steam.
  try {
    const q = await db.collection("ventas").where("estado", "==", "aceptando").get();
    for (const d of q.docs) {
      const id = d.data().ofertaId; if (!id) continue;
      try { await resultadoVenta(await p((cb) => manager.getOffer(id, cb))); } catch (e) { /* se reintenta */ }
    }
  } catch (e) { /* nada */ }
  // Ventas que vencieron sin trade.
  try {
    const q = await db.collection("ventas").where("estado", "==", "esperando").get();
    const b = db.batch(); let n = 0;
    q.docs.forEach((d) => { const ve = d.data().vence; if (ve && ve.toMillis && ve.toMillis() < Date.now() - 5 * 60000) { b.update(d.ref, { estado: "vencida", motivo: "No llegó el trade a tiempo.", actualizada: AHORA() }); n++; } });
    if (n) await b.commit();
  } catch (e) { /* nada */ }
}
setInterval(revisarVentasPendientes, 5 * 60 * 1000);

/* Lista de precios de compra (motor del bot LIS en este mismo servidor) → live/preciosCompra, cada hora. */
async function sincronizarPrecios() {
  if (!cfg.preciosUrl) return;
  try {
    const r = await fetch(cfg.preciosUrl, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const lista = u.preciosLivianos(await r.json());
    if (!lista.items.length) throw new Error("la lista vino vacía");
    const json = JSON.stringify(lista);
    if (json.length > 900000) throw new Error("la lista es muy grande (" + json.length + " bytes)");
    await db.doc("live/preciosCompra").set({ json, total: lista.items.length, actualizado: AHORA() });
    log("Precios de compra sincronizados:", lista.items.length, "items.");
  } catch (e) { registrar("aviso", "No se pudo actualizar la lista de precios de compra: " + e.message); }
}
setInterval(sincronizarPrecios, 60 * 60 * 1000);
setTimeout(sincronizarPrecios, 20000);

/* ---------- cola ---------- */
function encolar(doc) { if (!enCola.has(doc.id)) { enCola.add(doc.id); cola.push(doc.ref); despertar(); } }
async function despertar() {
  if (trabajando || !listo || pausado) return;
  trabajando = true;
  try {
    while (cola.length && listo && !pausado) {
      const ref = cola.shift();
      try {
        const d = (await ref.get()).data() || {};
        const est = d.bot && d.bot.estado;
        if (est === "aprobado") await enviarPedido(ref);
        else if (est === "cancelar") await cancelarPedido(ref);
      } catch (e) { log("Error procesando", ref.id, e.message); }
      finally { enCola.delete(ref.id); }
      // Si mientras lo procesaba el admin pidió cancelar, se atiende enseguida.
      try { const d2 = (await ref.get()).data() || {}; if (d2.bot && d2.bot.estado === "cancelar") encolar({ id: ref.id, ref }); } catch (e) { /* nada */ }
      await new Promise((r) => setTimeout(r, 3000)); // pausa corta entre ofertas
    }
  } finally { trabajando = false; }
}

db.collection("orders").where("bot.estado", "in", ["aprobado", "cancelar"]).onSnapshot(
  (snap) => snap.docs.forEach(encolar),
  (e) => { log("Error escuchando Firestore:", e.message); process.exit(1); } // systemd lo reinicia
);
// Los pedidos que quedaron en cola esperando a Steam se reintentan cada 10 minutos.
setInterval(async () => {
  try { (await db.collection("orders").where("bot.estado", "==", "aprobado").get()).docs.forEach(encolar); } catch (e) { /* nada */ }
}, 10 * 60 * 1000);

/* ---------- inventario para el panel ---------- */
let publicando = false;
async function publicarInventario() {
  if (!listo || publicando) return;
  publicando = true;
  try {
    const inv = await leerInventario();
    ultimoInventario = inv.length;
    const grupos = u.agruparInventario(inv);
    await db.doc("bot_estado/inventario").set({ items: grupos.slice(0, 400), total: inv.length, tipos: grupos.length, actualizado: AHORA() });
  } catch (e) { registrar("error", "No se pudo leer el inventario del bot: " + e.message); }
  finally { publicando = false; }
}
setInterval(publicarInventario, 15 * 60 * 1000);

/* ---------- ofertas activas para el panel ---------- */
async function leerResumenOfertas() {
  if (!listo) return;
  try {
    resumenOfertas = (await ofertasActivas()).slice(0, 30).map((o) => ({
      id: String(o.id), code: u.codigoDeMensaje(o.message), estado: TradeOfferManager.ETradeOfferState[o.state] || String(o.state),
      da: (o.itemsToGive || []).length, recibe: (o.itemsToReceive || []).length,
      items: (o.itemsToGive || []).concat(o.itemsToReceive || []).slice(0, 6).map((i) => i.market_hash_name || i.name || "").join(", "),
      creada: o.created ? new Date(o.created).toISOString() : "",
    }));
  } catch (e) { /* se reintenta en el próximo latido */ }
}

/* ---------- comandos desde el panel (bot_estado/comando) ---------- */
async function ejecutarComando(accion) {
  let resultado = "";
  if (accion === "pausar") { pausado = true; resultado = "Envíos pausados."; }
  else if (accion === "reanudar") {
    pausado = false; resultado = "Envíos reanudados.";
    try { (await db.collection("orders").where("bot.estado", "in", ["aprobado", "cancelar"]).get()).docs.forEach(encolar); } catch (e) { /* nada */ }
    despertar();
    revisarVentasPendientes();
  }
  else if (accion === "inventario") { await publicarInventario(); await leerResumenOfertas(); resultado = "Inventario actualizado."; }
  else if (accion === "reconectar") {
    listo = false; resultado = "Reconectando con Steam…";
    try { client.logOff(); } catch (e) { /* nada */ }
    setTimeout(iniciarSesion, 5000);
  }
  else return "Comando desconocido: " + accion;
  registrar("info", "Panel: " + resultado);
  await latido();
  return resultado;
}
db.doc("bot_estado/comando").onSnapshot(async (snap) => {
  const d = snap.data() || {};
  const id = String(d.id || "");
  if (!d.accion || !id || id === ultimoComando) return;
  ultimoComando = id;
  const resultado = await ejecutarComando(String(d.accion)).catch((e) => "Error: " + e.message);
  snap.ref.set({ accion: "", hecho: AHORA(), resultado }, { merge: true }).catch(() => {});
}, (e) => log("No se pudo escuchar comandos:", e.message));

/* ---------- latido para el panel admin ---------- */
let vueltas = 0;
async function latido() {
  try {
    if (listo && ultimoInventario === null) publicarInventario();
    if (vueltas++ % 2 === 0) await leerResumenOfertas();
    await db.doc("bot_estado/steam").set({
      enLinea: listo, ultimaVez: AHORA(), cuenta: cfg.usuario, version: VERSION,
      steamId: client.steamID ? client.steamID.getSteamID64() : "",
      items: ultimoInventario === null ? -1 : ultimoInventario, aviso: esperaSteam,
      pausado, limitada: cuenta.limitada, puedeInvitar: cuenta.puedeInvitar, bloqueada: cuenta.bloqueada,
      saldo: cuenta.saldo, moneda: cuenta.moneda, ofertas: resumenOfertas, cola: cola.length,
    }, { merge: true });
  } catch (e) { log("No se pudo guardar el latido:", e.message); }
}
setInterval(latido, 60000);

// El registro guarda solo los últimos 7 días.
setInterval(async () => {
  try {
    const viejos = await db.collection("bot_log").where("t", "<", new Date(Date.now() - 7 * 864e5)).limit(300).get();
    const b = db.batch(); viejos.docs.forEach((x) => b.delete(x.ref)); if (!viejos.empty) await b.commit();
  } catch (e) { /* nada */ }
}, 60 * 60 * 1000);

process.on("SIGTERM", async () => { listo = false; await latido(); client.logOff(); process.exit(0); });
process.on("unhandledRejection", (e) => log("Promesa sin manejar:", e && e.message));

log("Bot de Steam v" + VERSION + " arrancando…");
// Recupera la pausa si el admin la dejó puesta antes de reiniciar.
db.doc("bot_estado/steam").get().then((s) => { pausado = !!(s.exists && s.data().pausado); if (pausado) log("Envíos en pausa (puesta desde el panel)."); })
  .catch(() => {}).finally(() => { iniciarSesion(); latido(); });
