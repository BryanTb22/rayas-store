"use strict";
/*
 * Libro de Reclamaciones virtual (Código de Protección y Defensa del Consumidor, Ley 29571, y su Reglamento).
 *
 *  registrarReclamo (POST, público) -> valida la hoja, le asigna un número correlativo, la guarda en la colección
 *  "reclamos" (solo del servidor) y manda una copia al consumidor y otra al administrador.
 *
 * Las dos tiendas usan la misma función; la tienda se reconoce por el Origin (igual que los pagos).
 */
const crypto = require("crypto");
const { MARCAS } = require("./emails");
const { enviarCorreo } = require("./correo");

const TIPOS_DOC = ["DNI", "CE", "Pasaporte", "RUC"];
const PREFIJO = { rayas: "RY", litlejacob: "LJ" };
const PLAZO_DIAS_HABILES = 15; // plazo de respuesta que fija el Reglamento del Libro de Reclamaciones

const limpiar = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const limpiarLargo = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Valida y limpia lo que llega del navegador. Devuelve { ok:true, datos } o { ok:false, error }.
function validar(b) {
  b = b || {};
  const d = {
    tipoDoc: limpiar(b.tipoDoc, 12), numDoc: limpiar(b.numDoc, 20).toUpperCase(),
    nombre: limpiar(b.nombre, 100), domicilio: limpiar(b.domicilio, 160),
    telefono: limpiar(b.telefono, 20), email: limpiar(b.email, 120).toLowerCase(),
    menor: b.menor === true, apoderado: limpiar(b.apoderado, 100),
    bienTipo: limpiar(b.bienTipo, 12), bien: limpiar(b.bien, 200), monto: limpiar(b.monto, 20),
    pedidoRef: limpiar(b.pedidoRef, 60),
    tipo: limpiar(b.tipo, 10), detalle: limpiarLargo(b.detalle, 2000), pedido: limpiarLargo(b.pedido, 1000)
  };
  if (TIPOS_DOC.indexOf(d.tipoDoc) < 0) return { ok: false, error: "Elige el tipo de documento." };
  if (d.tipoDoc === "DNI" && !/^\d{8}$/.test(d.numDoc)) return { ok: false, error: "El DNI debe tener 8 números." };
  if (d.tipoDoc === "RUC" && !/^\d{11}$/.test(d.numDoc)) return { ok: false, error: "El RUC debe tener 11 números." };
  if (!/^[A-Z0-9\-]{5,20}$/.test(d.numDoc)) return { ok: false, error: "Revisa el número de documento." };
  if (d.nombre.length < 5 || d.nombre.indexOf(" ") < 0) return { ok: false, error: "Escribe tus nombres y apellidos completos." };
  if (d.domicilio.length < 8) return { ok: false, error: "Escribe tu domicilio." };
  if (!/^[0-9+() \-]{6,20}$/.test(d.telefono)) return { ok: false, error: "Escribe un teléfono válido." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return { ok: false, error: "Escribe un correo válido." };
  if (d.menor && d.apoderado.length < 5) return { ok: false, error: "Si eres menor de edad, escribe el nombre de tu padre, madre o apoderado." };
  if (["producto", "servicio"].indexOf(d.bienTipo) < 0) return { ok: false, error: "Indica si es un producto o un servicio." };
  if (d.bien.length < 3) return { ok: false, error: "Describe el producto o servicio." };
  if (d.monto && !/^\d{1,7}(\.\d{1,2})?$/.test(d.monto)) return { ok: false, error: "El monto reclamado debe ser un número (ej. 25.50)." };
  if (["reclamo", "queja"].indexOf(d.tipo) < 0) return { ok: false, error: "Elige si es un reclamo o una queja." };
  if (d.detalle.length < 15) return { ok: false, error: "Cuéntanos con más detalle qué pasó." };
  if (d.pedido.length < 5) return { ok: false, error: "Indica qué solución pides." };
  return { ok: true, datos: d };
}

// Suma N días hábiles (lunes a viernes; no considera feriados, por eso en el texto va "aproximadamente").
function masDiasHabiles(desde, n) {
  const f = new Date(desde.getTime());
  while (n > 0) { f.setUTCDate(f.getUTCDate() + 1); const w = f.getUTCDay(); if (w !== 0 && w !== 6) n--; }
  return f;
}
const fechaLima = (d) => new Date(d).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "long", timeStyle: "short" });
const soloFechaLima = (d) => new Date(d).toLocaleDateString("es-PE", { timeZone: "America/Lima", dateStyle: "long" });

function filasHtml(m, filas) {
  return filas.map(([k, v]) => '<tr><td style="padding:7px 12px;color:' + m.suave + ';font-size:13px;width:38%;vertical-align:top;border-bottom:1px solid ' + m.borde + '">' + esc(k) +
    '</td><td style="padding:7px 12px;color:' + m.texto + ';font-size:14px;border-bottom:1px solid ' + m.borde + ';white-space:pre-wrap">' + esc(v) + '</td></tr>').join("");
}

// Correo con la hoja completa (sirve de constancia para el consumidor y de aviso para el administrador).
function correoHoja(tienda, r, paraAdmin) {
  const m = MARCAS[tienda] || MARCAS.rayas;
  const filas = [
    ["N° de hoja", r.numero], ["Fecha y hora", fechaLima(r.creado)],
    ["Proveedor", m.nombre + " · " + m.url],
    ["Consumidor", r.nombre], ["Documento", r.tipoDoc + " " + r.numDoc], ["Domicilio", r.domicilio],
    ["Teléfono", r.telefono], ["Correo", r.email]
  ];
  if (r.menor) filas.push(["Menor de edad — apoderado", r.apoderado]);
  filas.push(["Bien contratado", (r.bienTipo === "servicio" ? "Servicio: " : "Producto: ") + r.bien]);
  if (r.monto) filas.push(["Monto reclamado", "S/ " + r.monto]);
  if (r.pedidoRef) filas.push(["N° de pedido / pago", r.pedidoRef]);
  filas.push([r.tipo === "queja" ? "QUEJA" : "RECLAMO", r.detalle], ["Pedido del consumidor", r.pedido]);
  const intro = paraAdmin
    ? "Llegó un nuevo " + r.tipo + " por el Libro de Reclamaciones. Debes responder al consumidor (" + r.email + ") antes del <b>" + soloFechaLima(r.vence) + "</b> (" + PLAZO_DIAS_HABILES + " días hábiles)."
    : "Recibimos tu " + r.tipo + ". Guarda este correo: es tu constancia. Te responderemos a este correo en un plazo máximo de <b>" + PLAZO_DIAS_HABILES + " días hábiles</b> (aprox. hasta el " + soloFechaLima(r.vence) + ").";
  const html = '<div style="background:' + m.fondo + ';padding:24px 12px;font-family:\'Segoe UI\',Roboto,Arial,sans-serif">' +
    '<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:' + m.tarjeta + ';border:1px solid ' + m.borde + ';border-radius:12px;border-collapse:separate;overflow:hidden">' +
    '<tr><td style="padding:0"><div style="height:6px;background:linear-gradient(90deg,' + m.primario + ',' + m.acento + ')"></div></td></tr>' +
    '<tr><td style="padding:22px 24px 8px"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:' + m.acento + ';font-weight:700">Libro de Reclamaciones</div>' +
    '<div style="font-size:24px;font-weight:800;color:' + m.texto + ';margin-top:4px">Hoja N° ' + esc(r.numero) + '</div>' +
    '<p style="color:' + m.texto + ';font-size:15px;line-height:1.55">' + intro + '</p></td></tr>' +
    '<tr><td style="padding:0 12px 18px"><table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid ' + m.borde + '">' + filasHtml(m, filas) + '</table></td></tr>' +
    '<tr><td style="padding:0 24px 22px;color:' + m.suave + ';font-size:12px;line-height:1.5">La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</td></tr>' +
    '</table></div>';
  const texto = (paraAdmin ? "Nuevo " + r.tipo + " en el Libro de Reclamaciones.\n" : "Recibimos tu " + r.tipo + ". Guarda este correo como constancia.\n") +
    filas.map(([k, v]) => k + ": " + v).join("\n") + "\nPlazo de respuesta: " + PLAZO_DIAS_HABILES + " días hábiles (aprox. hasta el " + soloFechaLima(r.vence) + ").";
  return {
    from: m.remitente,
    subject: (paraAdmin ? "[Reclamo nuevo] " : "Constancia de tu " + r.tipo + " · ") + "Hoja N° " + r.numero + " — " + m.nombre,
    html: html, text: texto
  };
}

function crear(ctx) {
  const { admin, db, onRequest, REGION, ORIGENES, RESEND_KEY, ADMIN_UID } = ctx;
  const FV = admin.firestore.FieldValue;
  const tiendaDeOrigen = (req) => (/litlejacob/i.test(String(req.get("Origin") || "")) ? "litlejacob" : "rayas");
  const exportado = {};

  exportado.registrarReclamo = onRequest(
    { region: REGION, cors: ORIGENES, secrets: [RESEND_KEY], maxInstances: 3, timeoutSeconds: 30 },
    async (req, res) => {
      if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
      const b = req.body || {};
      if (b.web) return res.json({ ok: true, numero: "—" }); // campo trampa para robots: no se guarda nada
      const v = validar(b);
      if (!v.ok) return res.status(400).json({ error: v.error });
      if (b.acepta !== true) return res.status(400).json({ error: "Marca la casilla de conformidad para enviar la hoja." });
      const tienda = tiendaDeOrigen(req);
      const d = v.datos;

      // Freno contra abuso: máximo 5 hojas por correo y por dirección IP en 24 horas.
      const ip = crypto.createHash("sha256").update(String(req.get("x-forwarded-for") || req.ip || "")).digest("hex").slice(0, 24);
      const desde = new Date(Date.now() - 24 * 3600 * 1000);
      try {
        // Una sola condición por consulta (no pide índices); lo reciente se filtra aquí.
        const recientes = (q) => q.docs.filter((x) => { const t = x.data().creado; return t && t.toDate && t.toDate() >= desde; }).length;
        const [a, c] = await Promise.all([
          db.collection("reclamos").where("email", "==", d.email).limit(40).get(),
          db.collection("reclamos").where("ip", "==", ip).limit(40).get()
        ]);
        if (recientes(a) >= 5 || recientes(c) >= 5) return res.status(429).json({ error: "Ya enviaste varias hojas hoy. Escríbenos por WhatsApp o inténtalo mañana." });
      } catch (e) { console.error("registrarReclamo limite", e); /* sin índice o con error: se sigue, no se bloquea al cliente */ }

      const ahora = new Date();
      const vence = masDiasHabiles(ahora, PLAZO_DIAS_HABILES);
      let numero;
      try {
        numero = await db.runTransaction(async (tx) => {
          const ref = db.doc("contadores/reclamos_" + tienda);
          const s = await tx.get(ref);
          const n = (s.exists ? Number(s.data().n) || 0 : 0) + 1;
          tx.set(ref, { n: n }, { merge: true });
          return PREFIJO[tienda] + "-" + ahora.getUTCFullYear() + "-" + String(n).padStart(6, "0");
        });
        await db.doc("reclamos/" + numero).create(Object.assign({}, d, { numero: numero, tienda: tienda, ip: ip, estado: "pendiente", creado: ahora, vence: vence }));
      } catch (e) {
        console.error("registrarReclamo", e);
        return res.status(500).json({ error: "No se pudo registrar la hoja. Inténtalo de nuevo en un momento." });
      }

      // Correos: nunca rompen el registro (la hoja ya quedó guardada).
      const r = Object.assign({}, d, { numero: numero, creado: ahora, vence: vence });
      let correoCliente = false;
      try {
        const c = correoHoja(tienda, r, false);
        await enviarCorreo(RESEND_KEY.value(), { from: c.from, to: d.email, subject: c.subject, html: c.html, text: c.text, clave: "reclamo-" + numero + "-cliente" });
        correoCliente = true;
      } catch (e) { console.error("registrarReclamo correo cliente", e); }
      try {
        const a = String((await admin.auth().getUser(ADMIN_UID)).email || "");
        if (a) { const c = correoHoja(tienda, r, true); await enviarCorreo(RESEND_KEY.value(), { from: c.from, to: a, subject: c.subject, html: c.html, text: c.text, clave: "reclamo-" + numero + "-admin" }); }
      } catch (e) { console.error("registrarReclamo correo admin", e); }
      await db.doc("reclamos/" + numero).update({ correoCliente: correoCliente, actualizado: FV.serverTimestamp() }).catch(() => {});

      res.json({ ok: true, numero: numero, creado: ahora.toISOString(), vence: vence.toISOString(), plazo: PLAZO_DIAS_HABILES, correoCliente: correoCliente });
    }
  );
  return exportado;
}

module.exports = { crear, validar, masDiasHabiles, correoHoja, PLAZO_DIAS_HABILES };
