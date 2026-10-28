"use strict";

// ---------------------------------------------------------------------------
// Marcas: colores, dominio, remitente y WhatsApp de cada tienda.
// Los colores salen de las hojas de estilo reales de cada web.
// El remitente debe estar en un dominio verificado en Resend.
// ---------------------------------------------------------------------------
const MARCAS = {
  rayas: {
    id: "rayas",
    nombre: "Rayas Store",
    url: "https://rayas.trade",
    urlCreditos: "https://rayas.trade", // la recarga de créditos está en la página principal
    remitente: "Rayas Store <pedidos@rayas.trade>",
    fondo: "#070d24", // azul marino oscuro
    tarjeta: "#0f1a3c",
    borde: "#24336b",
    texto: "#eef1ff",
    suave: "#9ba7d8",
    primario: "#ffc93c", // amarillo
    textoPrimario: "#1d1600",
    acento: "#ff2d8f", // fucsia
    whatsapp: [
      { nombre: "Rayas", numero: "51900049694" },
      { nombre: "LitleJacob", numero: "51952997030" },
    ],
  },
  litlejacob: {
    id: "litlejacob",
    nombre: "LitleJacob Store",
    url: "https://litlejacob.trade",
    urlCreditos: "https://litlejacob.trade/rifas.html",
    remitente: "LitleJacob Store <pedidos@litlejacob.trade>",
    fondo: "#08080a", // tema "acero y sangre"
    tarjeta: "#131316",
    borde: "#3d3f45",
    texto: "#eef0f3",
    suave: "#8b9097",
    primario: "#c4c8ce", // acero
    textoPrimario: "#0b0b0d",
    acento: "#c8161f", // rojo sangre
    whatsapp: [
      { nombre: "LitleJacob", numero: "51952997030" },
      { nombre: "Rayas", numero: "51900049694" },
    ],
  },
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const soles = (n) => "S/ " + Number(n).toFixed(2);
const fecha = (d) =>
  new Date(d).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" });
// "orden" = código de PagoEfectivo / QR / billetera; lo demás se pagó con la ventana de tarjeta o Yape.
const etiquetaMedio = (tipo) => (tipo === "orden" ? "PagoEfectivo, QR o billetera" : "Tarjeta o Yape");
const codigoPedido = (id) => "#" + String(id).slice(0, 8).toUpperCase();
const marca = (tienda) => MARCAS[tienda] || MARCAS.rayas;

// ---------------------------------------------------------------------------
// Estructura común del correo (tablas + estilos en línea para que se vea bien
// en Gmail, Outlook y celulares).
// ---------------------------------------------------------------------------
function layout(m, o) {
  const filas = (o.filas || [])
    .map(([k, v], i, arr) => {
      const borde = i === arr.length - 1 ? "none" : `1px solid ${m.borde}`;
      return `<tr>
        <td style="padding:11px 0;color:${m.suave};font-size:14px;border-bottom:${borde}">${esc(k)}</td>
        <td align="right" style="padding:11px 0;color:${m.texto};font-size:14px;font-weight:600;border-bottom:${borde}">${esc(v)}</td>
      </tr>`;
    })
    .join("");

  const wa = m.whatsapp
    .map(
      (w) =>
        `<a href="https://wa.me/${w.numero}" style="color:${m.primario};text-decoration:none;font-weight:600">${esc(w.nombre)}</a>`
    )
    .join(" &nbsp;·&nbsp; ");

  const boton = o.boton
    ? `<tr><td align="center" style="padding:26px 0 6px">
        <a href="${esc(o.boton.url)}" style="display:inline-block;background:${m.primario};color:${m.textoPrimario};font-weight:700;font-size:16px;text-decoration:none;padding:14px 30px;border-radius:10px">${esc(o.boton.texto)}</a>
      </td></tr>`
    : "";

  const aviso = o.aviso
    ? `<tr><td style="padding:18px 0 0;color:${m.suave};font-size:13px;line-height:1.55">${o.aviso}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${m.fondo}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${m.fondo}">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${m.fondo}">
<tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td align="center" style="padding:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:${m.primario};letter-spacing:.5px">${esc(m.nombre)}</td></tr>
    <tr><td style="background:${m.tarjeta};border:1px solid ${m.borde};border-top:4px solid ${m.acento};border-radius:14px;padding:28px;font-family:Arial,Helvetica,sans-serif;color:${m.texto}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:22px;font-weight:800;line-height:1.25;padding-bottom:10px">${esc(o.titulo)}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:${m.texto};padding-bottom:18px">${o.intro}</td></tr>
        <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${m.borde}">${filas}</table></td></tr>
        ${boton}
        ${aviso}
      </table>
    </td></tr>
    <tr><td align="center" style="padding:20px 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${m.suave}">
      ¿Necesitas ayuda? Escríbenos por WhatsApp: ${wa}<br>
      <a href="${esc(m.url)}" style="color:${m.suave}">${esc(m.url.replace("https://", ""))}</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function aTexto(m, titulo, lineas, boton) {
  const wa = m.whatsapp.map((w) => `${w.nombre}: https://wa.me/${w.numero}`).join(" | ");
  return [
    m.nombre,
    "",
    titulo,
    "",
    ...lineas,
    ...(boton ? ["", `${boton.texto}: ${boton.url}`] : []),
    "",
    `Ayuda por WhatsApp -> ${wa}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Correo 1: pago confirmado
// p = { id, nombre, soles, creditos, tipo, pagadoEn(Date), saldo }
// ---------------------------------------------------------------------------
function confirmacion(tienda, p) {
  const m = marca(tienda);
  const saludo = p.nombre ? `Hola ${esc(p.nombre)},` : "Hola,";
  const filas = [
    ["Pedido", codigoPedido(p.id)],
    ["Monto pagado", soles(p.soles)],
    ["Créditos acreditados", String(p.creditos)],
    ["Medio de pago", etiquetaMedio(p.tipo)],
    ["Fecha", fecha(p.pagadoEn)],
  ];
  if (p.saldo != null) filas.push(["Saldo actual", `${p.saldo} créditos`]);

  const boton = { texto: "Ir a las rifas", url: m.urlCreditos };
  const titulo = "¡Pago confirmado!";
  const subject = `✅ Pago confirmado: ${p.creditos} créditos en ${m.nombre}`;

  const html = layout(m, {
    titulo,
    preheader: `Recibimos tu pago de ${soles(p.soles)}. Tus ${p.creditos} créditos ya están en tu cuenta.`,
    intro: `${saludo}<br>recibimos tu pago y tus créditos ya están disponibles en tu cuenta. Aquí tienes el resumen:`,
    filas,
    boton,
    aviso: `Guarda este correo como comprobante. Si no reconoces esta compra, escríbenos por WhatsApp cuanto antes.`,
  });

  const text = aTexto(
    m,
    titulo,
    [
      p.nombre ? `Hola ${p.nombre},` : "Hola,",
      "recibimos tu pago y tus créditos ya están disponibles.",
      "",
      ...filas.map(([k, v]) => `${k}: ${v}`),
      "",
      "Guarda este correo como comprobante.",
    ],
    boton
  );

  return { from: m.remitente, subject, html, text };
}

// ---------------------------------------------------------------------------
// Correo 2: código de pago pendiente (PagoEfectivo / QR / billetera). Un solo recordatorio.
// p = { id, nombre, soles, creditos, expiraEn(Date) }
// ---------------------------------------------------------------------------
function recordatorio(tienda, p) {
  const m = marca(tienda);
  const saludo = p.nombre ? `Hola ${esc(p.nombre)},` : "Hola,";
  const filas = [
    ["Pedido", codigoPedido(p.id)],
    ["Monto a pagar", soles(p.soles)],
    ["Créditos que recibirás", String(p.creditos)],
    ["Código vigente hasta", fecha(p.expiraEn)],
  ];

  const extra =
    "Págalo en un agente, banco, app bancaria o con QR y tus créditos se suman solos. Si perdiste tu código, entra a recargar y genera uno nuevo.";

  const boton = { texto: "Ir a recargar", url: m.urlCreditos };
  const titulo = "Tienes un pago pendiente";
  const subject = `⏳ Tu pago de ${soles(p.soles)} sigue pendiente: ${m.nombre}`;

  const html = layout(m, {
    titulo,
    preheader: `Tu código de pago por ${soles(p.soles)} sigue vigente. Aún no recibimos el pago.`,
    intro: `${saludo}<br>generaste un código de pago para recargar créditos, pero todavía no recibimos el pago. ${esc(extra)}`,
    filas,
    boton,
    aviso: `Si ya pagaste, ignora este correo: Culqi nos avisa y tus créditos pueden tardar unos minutos en aparecer. Este es el único recordatorio que te enviaremos por este pedido.`,
  });

  const text = aTexto(
    m,
    titulo,
    [
      p.nombre ? `Hola ${p.nombre},` : "Hola,",
      "generaste un código de pago para recargar créditos, pero todavía no recibimos el pago.",
      extra,
      "",
      ...filas.map(([k, v]) => `${k}: ${v}`),
      "",
      "Si ya pagaste, ignora este correo. Es el único recordatorio por este pedido.",
    ],
    boton
  );

  return { from: m.remitente, subject, html, text };
}

module.exports = { MARCAS, confirmacion, recordatorio };
