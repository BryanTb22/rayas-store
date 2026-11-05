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

const VERSION = "1.1.0";
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
