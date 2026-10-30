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
    banner: "https://rayas.trade/img/correo-rayas.jpg",
    degradado: "#ff2d8f", // segundo color de las franjas (con el primario)
    ok: "#3ddc97",
    aviso: "#ffc93c",
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
    banner: "https://litlejacob.trade/img/correo-litlejacob.jpg",
    degradado: "#6a0b10",
    ok: "#3ddc97",
    aviso: "#e0a23a",
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
// Fecha de entrega de un pedido en cooldown ("5 nov 2026, 16:20") y líneas de items con el candado cuando toca.
const fechaCorta = (d) => new Date(d).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const lineaItem = (it) => `${it.qty} × ${it.name}` + (it.cooldownHasta ? ` 🔒 (cooldown hasta ${fechaCorta(it.cooldownHasta)})` : "");

// Tipografías: las web fonts casi no cargan en correo; estas pilas dan el mismo aire condensado de Dota en la mayoría de equipos.
const TITULO = "Oswald,'Barlow Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif";
const CUERPO = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// ---------------------------------------------------------------------------
// Estructura común (tablas + estilos en línea: se ve igual en Gmail, Outlook y celulares).
// o = { titulo, preheader, chip:{texto,color}, intro, stats:[{valor,etiqueta}], filas, boton, pasos, aviso }
// ---------------------------------------------------------------------------
function layout(m, o) {
  const franja = `background:${m.primario};background-image:linear-gradient(90deg,${m.degradado},${m.primario},${m.degradado})`;

  const chip = `<span style="display:inline-block;padding:5px 14px;border:1px solid ${o.chip.color};border-radius:20px;color:${o.chip.color};font-family:${TITULO};font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase">${esc(o.chip.texto)}</span>`;

  const stats = (o.stats || [])
    .map(
      (x, i, a) => `<td width="${Math.floor(100 / a.length)}%" align="center" style="padding:16px 8px;background:${m.fondo};border:1px solid ${m.borde};${i ? "border-left:none;" : ""}">
        <div style="font-family:${TITULO};font-size:36px;line-height:1.1;font-weight:700;color:${m.primario}">${esc(x.valor)}</div>
        <div style="font-family:${CUERPO};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${m.suave};padding-top:6px">${esc(x.etiqueta)}</div>
      </td>`
    )
    .join("");

  const filas = (o.filas || [])
    .map(([k, v], i, arr) => {
      const borde = i === arr.length - 1 ? "none" : `1px solid ${m.borde}`;
      return `<tr>
        <td style="padding:12px 0;color:${m.suave};font-family:${CUERPO};font-size:14px;border-bottom:${borde}">${esc(k)}</td>
        <td align="right" style="padding:12px 0;color:${m.texto};font-family:${CUERPO};font-size:14px;font-weight:600;border-bottom:${borde}">${esc(v)}</td>
      </tr>`;
    })
    .join("");

  const pasos = o.pasos
    ? `<tr><td style="padding:24px 0 0">
        <div style="font-family:${TITULO};font-size:15px;letter-spacing:.16em;text-transform:uppercase;color:${m.primario};padding-bottom:10px">Cómo completar tu pago</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${o.pasos
          .map(
            (t, i) => `<tr>
              <td width="34" valign="top" style="padding:6px 0"><div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:${m.acento};color:#fff;text-align:center;font-family:${TITULO};font-size:14px;font-weight:700">${i + 1}</div></td>
              <td valign="top" style="padding:7px 0;font-family:${CUERPO};font-size:14px;line-height:1.5;color:${m.texto}">${t}</td>
            </tr>`
          )
          .join("")}</table>
      </td></tr>`
    : "";

  const boton = o.boton
    ? `<tr><td align="center" style="padding:28px 0 4px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${m.primario}" style="border-radius:6px;border-bottom:3px solid ${m.acento}">
          <a href="${esc(o.boton.url)}" style="display:inline-block;padding:15px 38px;font-family:${TITULO};font-size:17px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${m.textoPrimario};text-decoration:none">${esc(o.boton.texto)} &rarr;</a>
        </td></tr></table>
      </td></tr>`
    : "";

  const aviso = o.aviso
    ? `<tr><td style="padding:22px 0 0;font-family:${CUERPO};color:${m.suave};font-size:13px;line-height:1.6;border-top:1px solid ${m.borde};margin-top:20px">${o.aviso}</td></tr>`
    : "";

  const wa = m.whatsapp
    .map(
      (w) => `<a href="https://wa.me/${w.numero}" style="display:inline-block;margin:4px 4px;padding:9px 18px;border:1px solid ${m.borde};border-radius:5px;color:${m.texto};background:${m.tarjeta};font-family:${TITULO};font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;text-decoration:none">&#9742; ${esc(w.nombre)}</a>`
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(o.titulo)}</title>
<style>@media only screen and (max-width:620px){.ct{padding:20px 16px !important}.bn{width:100% !important;height:auto !important}}</style>
</head>
<body style="margin:0;padding:0;background:${m.fondo}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${m.fondo}">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${m.fondo}" style="background:${m.fondo}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border:1px solid ${m.borde}">
    <tr><td style="font-size:0;line-height:0;height:5px;${franja}">&nbsp;</td></tr>
    <tr><td style="font-size:0;line-height:0;background:${m.fondo}"><a href="${esc(m.url)}"><img class="bn" src="${esc(m.banner)}" width="598" alt="${esc(m.nombre)}" style="display:block;width:100%;max-width:598px;height:auto;border:0"></a></td></tr>
    <tr><td class="ct" bgcolor="${m.tarjeta}" style="background:${m.tarjeta};padding:30px 34px 28px;font-family:${CUERPO};color:${m.texto}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding-bottom:14px">${chip}</td></tr>
        <tr><td align="center" style="font-family:${TITULO};font-size:30px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;line-height:1.2;color:${m.texto};padding-bottom:12px">${esc(o.titulo)}</td></tr>
        <tr><td align="center" style="font-family:${CUERPO};font-size:15px;line-height:1.65;color:${m.texto};padding-bottom:22px">${o.intro}</td></tr>
        <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stats}</tr></table></td></tr>
        ${o.bloque || ""}
        <tr><td style="padding-top:8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table></td></tr>
        ${boton}
        ${pasos}
        ${aviso}
      </table>
    </td></tr>
    <tr><td align="center" bgcolor="${m.fondo}" style="background:${m.fondo};padding:22px 16px 6px;font-family:${CUERPO};font-size:13px;color:${m.suave}">
      <div style="font-family:${TITULO};font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:${m.suave};padding-bottom:8px">¿Necesitas ayuda? Escríbenos</div>
      ${wa}
    </td></tr>
    <tr><td align="center" bgcolor="${m.fondo}" style="background:${m.fondo};padding:8px 16px 22px;font-family:${CUERPO};font-size:12px;line-height:1.6;color:${m.suave}">
      <a href="${esc(m.url)}" style="color:${m.primario};text-decoration:none;font-weight:600">${esc(m.url.replace("https://", ""))}</a><br>
      ${o.pie ? o.pie : 'Recibes este correo porque hiciste una recarga en ' + esc(m.nombre) + '.'}
    </td></tr>
    <tr><td style="font-size:0;line-height:0;height:5px;${franja}">&nbsp;</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function aTexto(m, titulo, lineas, boton) {
  const wa = m.whatsapp.map((w) => `${w.nombre}: https://wa.me/${w.numero}`).join(" | ");
  return [m.nombre, "", titulo, "", ...lineas, ...(boton ? ["", `${boton.texto}: ${boton.url}`] : []), "", `Ayuda por WhatsApp -> ${wa}`].join("\n");
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
    ["Medio de pago", etiquetaMedio(p.tipo)],
    ["Fecha", fecha(p.pagadoEn)],
  ];
  const stats = [{ valor: "+" + p.creditos, etiqueta: "Créditos acreditados" }];
  if (p.saldo != null) stats.push({ valor: String(p.saldo), etiqueta: "Saldo actual" });

  const boton = { texto: "Ir a las rifas", url: m.urlCreditos };
  const titulo = "¡Pago confirmado!";
  const subject = `✅ Pago confirmado: ${p.creditos} créditos en ${m.nombre}`;

  const html = layout(m, {
    titulo,
    preheader: `Recibimos tu pago de ${soles(p.soles)}. Tus ${p.creditos} créditos ya están en tu cuenta.`,
    chip: { texto: "✓ Pagado", color: m.ok },
    intro: `${saludo}<br>recibimos tu pago y tus créditos ya están disponibles en tu cuenta. Este es tu resumen:`,
    stats,
    filas,
    boton,
    aviso: `Guarda este correo como comprobante. Si no reconoces esta compra, escríbenos por WhatsApp cuanto antes.`,
  });

  const text = aTexto(
    m,
    titulo,
    [p.nombre ? `Hola ${p.nombre},` : "Hola,", "recibimos tu pago y tus créditos ya están disponibles.", "", ...filas.map(([k, v]) => `${k}: ${v}`), `Créditos acreditados: ${p.creditos}`, ...(p.saldo != null ? [`Saldo actual: ${p.saldo} créditos`] : []), "", "Guarda este correo como comprobante."],
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
    ["Código vigente hasta", fecha(p.expiraEn)],
  ];
  const stats = [
    { valor: soles(p.soles), etiqueta: "Monto a pagar" },
    { valor: String(p.creditos), etiqueta: "Créditos que recibirás" },
  ];
  const pasos = [
    "Ten a la mano el <b>código de pago</b> que generaste al recargar.",
    "Págalo en un <b>agente, banco, app bancaria</b> o con <b>QR / billetera</b>.",
    "Tus créditos se suman <b>solos</b> apenas se confirme el pago.",
  ];

  const boton = { texto: "Ir a recargar", url: m.urlCreditos };
  const titulo = "Tienes un pago pendiente";
  const subject = `⏳ Tu pago de ${soles(p.soles)} sigue pendiente: ${m.nombre}`;

  const html = layout(m, {
    titulo,
    preheader: `Tu código de pago por ${soles(p.soles)} sigue vigente. Aún no recibimos el pago.`,
    chip: { texto: "⏳ Pendiente", color: m.aviso },
    intro: `${saludo}<br>generaste un código de pago para recargar créditos, pero todavía no recibimos el pago.`,
    stats,
    filas,
    boton,
    pasos,
    aviso: `¿Perdiste tu código? Entra a recargar y genera uno nuevo. Si ya pagaste, ignora este correo: Culqi nos avisa y tus créditos pueden tardar unos minutos en aparecer. Este es el único recordatorio que te enviaremos por este pedido.`,
  });

  const text = aTexto(
    m,
    titulo,
    [p.nombre ? `Hola ${p.nombre},` : "Hola,", "generaste un código de pago para recargar créditos, pero todavía no recibimos el pago.", "Págalo en un agente, banco, app bancaria o con QR y tus créditos se suman solos.", "Si perdiste tu código, entra a recargar y genera uno nuevo.", "", ...filas.map(([k, v]) => `${k}: ${v}`), `Monto a pagar: ${soles(p.soles)}`, `Créditos que recibirás: ${p.creditos}`, "", "Si ya pagaste, ignora este correo. Es el único recordatorio por este pedido."],
    boton
  );

  return { from: m.remitente, subject, html, text };
}

// ---------------------------------------------------------------------------
// Correo 3 (para el administrador): pedido nuevo de items pagado con saldo.
// p = { code, nombre, steamId, email, whatsapp, tradelink, items:[{name,qty,price}], total, creditos, creadoEn(Date) }
// ---------------------------------------------------------------------------
function pedidoNuevo(tienda, p) {
  const m = marca(tienda);
  const cd = !!p.entrega;   // pedido con items en cooldown: se entrega recién en p.entrega
  const lineas = (p.items || []).map((it) => [lineaItem(it), soles(it.price * it.qty)]);
  const filas = [
    ...lineas,
    ...(cd ? [["Entregar a partir de", fecha(p.entrega)]] : []),
    ["Cliente", p.nombre || "—"],
    ["ID de Steam", p.steamId || "—"],
    ["WhatsApp", p.whatsapp || "—"],
    ["Correo", p.email || "—"],
    ["Trade link", p.tradelink || "—"],
    ["Fecha", fecha(p.creadoEn)],
  ];
  const stats = [
    { valor: soles(p.total), etiqueta: "Total del pedido" },
    { valor: soles(p.creditos), etiqueta: "Saldo descontado" },
  ];
  const titulo = cd ? "Pedido nuevo en cooldown" : "¡Pedido nuevo!";
  const subject = cd
    ? `🔒 Pedido nuevo ${p.code} en cooldown: entregar el ${fechaCorta(p.entrega)} · ${m.nombre}`
    : `🛒 Pedido nuevo ${p.code}: ${p.nombre || "cliente"} (${soles(p.total)}) · ${m.nombre}`;
  const boton = { texto: "Ver pedidos", url: m.url };
  const html = layout(m, {
    titulo,
    preheader: cd ? `${p.nombre || "Un cliente"} compró un item en cooldown. Se entrega el ${fechaCorta(p.entrega)}.` : `${p.nombre || "Un cliente"} compró items por ${soles(p.total)}.`,
    chip: cd ? { texto: "🔒 En cooldown", color: m.aviso } : { texto: "🛒 Pagado con saldo", color: m.ok },
    intro: cd
      ? `Entró un pedido en <b>${esc(m.nombre)}</b> con un item que todavía está en <b>cooldown de Steam</b>. Ya está pagado; <b>no lo envíes aún</b>: te mandaremos otro correo el <b>${esc(fechaCorta(p.entrega))}</b>, cuando ya se pueda entregar.`
      : `Entró un pedido de items en <b>${esc(m.nombre)}</b>. Envíalo y márcalo como entregado en el panel de pedidos.`,
    stats,
    filas,
    boton,
    aviso: `Pedido <b>${esc(p.code)}</b>. Ya se descontó el saldo y el stock.` + (cd ? ` En el panel aparece en la pestaña <b>En cooldown</b> y pasará solo a <b>Por entregar</b> cuando se libere.` : ""),
    pie: `Aviso automático de pedidos de ${esc(m.nombre)}.`,
  });
  const text = aTexto(m, titulo + " " + p.code, [...(cd ? [`Item en cooldown: entregar a partir del ${fecha(p.entrega)}. No lo envíes aún; te avisaremos.`, ""] : []), ...filas.map(([k, v]) => `${k}: ${v}`), `Total: ${soles(p.total)}`], boton);
  return { from: m.remitente, subject, html, text };
}

// ---------------------------------------------------------------------------
// Correo 5 (para el administrador): un pedido en cooldown ya se liberó, hay que entregarlo.
// p = { code, nombre, steamId, email, whatsapp, tradelink, items, total, creditos, creadoEn(Date), entrega(Date) }
// ---------------------------------------------------------------------------
function pedidoLiberado(tienda, p) {
  const m = marca(tienda);
  const filas = [
    ...(p.items || []).map((it) => [`${it.qty} × ${it.name}`, soles(it.price * it.qty)]),
    ["Cliente", p.nombre || "—"],
    ["ID de Steam", p.steamId || "—"],
    ["WhatsApp", p.whatsapp || "—"],
    ["Correo", p.email || "—"],
    ["Trade link", p.tradelink || "—"],
    ["Comprado el", fecha(p.creadoEn)],
    ["Liberado el", fecha(p.entrega)],
  ];
  const stats = [{ valor: soles(p.total), etiqueta: "Total del pedido" }];
  const titulo = "¡Ya puedes entregar este pedido!";
  const subject = `✅ Ya puedes entregar el pedido ${p.code}: ${p.nombre || "cliente"} · ${m.nombre}`;
  const boton = { texto: "Ver pedidos", url: m.url };
  const html = layout(m, {
    titulo,
    preheader: `El cooldown del pedido ${p.code} terminó. Envíaselo a ${p.nombre || "tu cliente"} por Steam.`,
    chip: { texto: "🔓 Cooldown terminado", color: m.ok },
    intro: `El item del pedido <b>${esc(p.code)}</b> en <b>${esc(m.nombre)}</b> ya salió del cooldown de Steam. Envíaselo al cliente y márcalo como <b>entregado</b> en el panel de pedidos. El pedido ya pasó solo a <b>Por entregar</b>.`,
    stats,
    filas,
    boton,
    aviso: `El cliente también recibió un correo avisándole que su item ya se liberó.`,
    pie: `Aviso automático de pedidos de ${esc(m.nombre)}.`,
  });
  const text = aTexto(m, titulo + " " + p.code, [...filas.map(([k, v]) => `${k}: ${v}`), `Total: ${soles(p.total)}`], boton);
  return { from: m.remitente, subject, html, text };
}

// ---------------------------------------------------------------------------
// Correo 6 (para el cliente): su item en cooldown ya se liberó, pronto se lo entregan.
// p = { code, nombre, items, total, creadoEn(Date), entrega(Date) }
// ---------------------------------------------------------------------------
function itemLiberado(tienda, p) {
  const m = marca(tienda);
  const saludo = p.nombre ? `Hola ${esc(p.nombre)},` : "Hola,";
  const filas = [
    ...(p.items || []).map((it) => [`${it.qty} × ${it.name}`, soles(it.price * it.qty)]),
    ["Pedido", p.code],
    ["Comprado el", fecha(p.creadoEn)],
    ["Liberado el", fecha(p.entrega)],
  ];
  const stats = [{ valor: soles(p.total), etiqueta: "Total de tu compra" }];
  const titulo = "¡Tu item ya se liberó!";
  const subject = `🔓 Tu item del pedido ${p.code} ya se liberó: te lo entregamos pronto · ${m.nombre}`;
  const html = layout(m, {
    titulo,
    preheader: `El cooldown de tu pedido ${p.code} terminó. Te escribiremos para entregártelo por Steam.`,
    chip: { texto: "🔓 Listo para entregar", color: m.ok },
    intro: `${saludo}<br>el item que compraste en <b>${esc(m.nombre)}</b> ya salió del cooldown de Steam. En las próximas horas te escribiremos por WhatsApp para <b>entregártelo por Steam</b>.`,
    stats,
    filas,
    boton: { texto: "Ver mis transacciones", url: m.url + (tienda === "litlejacob" ? "/perfil.html#transacciones" : "/#perfil/transacciones") },
    aviso: `Revisa que tu <b>trade link</b> esté en tu cuenta y que tu inventario de Dota 2 sea público. Si no reconoces esta compra, escríbenos por WhatsApp cuanto antes.`,
  });
  const text = aTexto(m, titulo + " " + p.code, [p.nombre ? `Hola ${p.nombre},` : "Hola,", "tu item ya salió del cooldown de Steam. Te escribiremos por WhatsApp para entregártelo.", "", ...filas.map(([k, v]) => `${k}: ${v}`), `Total: ${soles(p.total)}`], { texto: "Ir a la tienda", url: m.url });
  return { from: m.remitente, subject, html, text };
}

// ---------------------------------------------------------------------------
// Correo 4 (para el cliente): comprobante de su compra de items con saldo.
// p = { code, nombre, items:[{name,qty,price}], total, creditos, saldo, creadoEn(Date) }
// ---------------------------------------------------------------------------
function compraCliente(tienda, p) {
  const m = marca(tienda);
  const cd = !!p.entrega;   // compra con items en cooldown: se entrega recién en p.entrega
  const saludo = p.nombre ? `Hola ${esc(p.nombre)},` : "Hola,";
  const filas = [
    ...(p.items || []).map((it) => [lineaItem(it), soles(it.price * it.qty)]),
    ...(cd ? [["Lo recibes a partir del", fecha(p.entrega)]] : []),
    ["Pedido", p.code],
    ["Pagado con saldo", soles(p.creditos)],
    ["Fecha", fecha(p.creadoEn)],
  ];
  const stats = [{ valor: soles(p.total), etiqueta: "Total de tu compra" }];
  if (p.saldo != null) stats.push({ valor: soles(p.saldo), etiqueta: "Tu saldo ahora" });
  const titulo = "¡Compra confirmada!";
  const subject = cd ? `✅ Compra confirmada ${p.code}: lo recibes el ${fechaCorta(p.entrega)} · ${m.nombre}` : `✅ Compra confirmada ${p.code}: ${soles(p.total)} · ${m.nombre}`;
  const html = layout(m, {
    titulo,
    preheader: cd ? `Recibimos tu pedido ${p.code}. Tu item está en cooldown: lo recibes el ${fechaCorta(p.entrega)}.` : `Recibimos tu pedido ${p.code}. Te escribiremos para entregarlo por Steam.`,
    chip: cd ? { texto: "🔒 En cooldown", color: m.aviso } : { texto: "✓ Pagado con saldo", color: m.ok },
    intro: cd
      ? `${saludo}<br>tu compra quedó registrada y pagada. Tu item todavía está en <b>cooldown de Steam</b>, así que te lo entregaremos a partir del <b>${esc(fechaCorta(p.entrega))}</b>. Ese día te avisaremos por correo y te escribiremos por WhatsApp para <b>entregártelo por Steam</b>. Este es tu resumen:`
      : `${saludo}<br>tu compra quedó registrada. Te escribiremos por WhatsApp para <b>entregártela por Steam</b>. Este es tu resumen:`,
    stats,
    filas,
    boton: { texto: "Ir a la tienda", url: m.url },
    aviso: `Guarda este correo como comprobante. Para que podamos entregarte, revisa que tu <b>trade link</b> y tu inventario de Dota 2 (público) estén listos. Si no reconoces esta compra, escríbenos por WhatsApp cuanto antes.`,
  });
  const text = aTexto(m, titulo + " " + p.code, [p.nombre ? `Hola ${p.nombre},` : "Hola,", cd ? `tu compra quedó registrada. Tu item está en cooldown de Steam: lo recibes a partir del ${fecha(p.entrega)}. Ese día te avisaremos.` : "tu compra quedó registrada. Te escribiremos por WhatsApp para entregártela por Steam.", "", ...filas.map(([k, v]) => `${k}: ${v}`), `Total: ${soles(p.total)}`], { texto: "Ir a la tienda", url: m.url });
  return { from: m.remitente, subject, html, text };
}

// ---------------------------------------------------------------------------
// Correo diario (8:00) para el administrador: pedidos de sets que ya le toca entregar hoy, con la foto de cada set.
// p = { fecha:"YYYY-MM-DD", cupo, pedidos:[{ code, cliente, steam, whatsapp, total, nSets, corrido, manual, items:[{name, qty, img(URL completa)}] }] }
// ---------------------------------------------------------------------------
function recordatorioEntregas(tienda, p) {
  const m = marca(tienda);
  const pedidos = p.pedidos || [];
  const totalSets = pedidos.reduce((n, o) => n + (Number(o.nSets) || 0), 0);
  const waLink = (w) => {
    if (!w) return "—";
    if (String(w).startsWith("@")) return esc(w);
    const d = String(w).replace(/\D/g, "");
    return `<a href="https://wa.me/${d}" style="color:${m.primario};text-decoration:underline">+${esc(d)}</a>`;
  };
  const tarjeta = (o) => {
    const items = (o.items || []).map((it) => {
      const foto = it.img
        ? `<img src="${esc(it.img)}" width="120" height="80" alt="" style="display:block;width:120px;height:80px;object-fit:cover;border:1px solid ${m.borde};border-radius:3px">`
        : `<div style="width:120px;height:80px;line-height:80px;text-align:center;background:${m.tarjeta};border:1px solid ${m.borde};border-radius:3px;font-size:28px">🎁</div>`;
      return `<tr>
        <td width="132" valign="middle" style="padding:6px 12px 6px 0">${foto}</td>
        <td valign="middle" style="padding:6px 0;font-family:${CUERPO};font-size:15px;font-weight:700;color:${m.texto}">${it.qty > 1 ? esc(it.qty) + " × " : ""}${esc(it.name)}</td>
      </tr>`;
    }).join("");
    return `<tr><td style="padding:12px 0 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${m.fondo};border:1px solid ${m.borde};border-left:3px solid ${m.acento}">
        <tr><td style="padding:12px 14px 4px;font-family:${CUERPO};font-size:14px;color:${m.texto}">
          <b style="font-size:16px">${esc(o.cliente)}</b> <span style="color:${m.suave}">· ${esc(o.code)}${o.manual ? " · pedido manual" : ""}</span><br>
          <span style="color:${m.suave}">🎮 ID de Steam: <b style="color:${m.texto}">${esc(o.steam || "—")}</b> &nbsp;·&nbsp; 📱 ${waLink(o.whatsapp)}</span>
          ${o.corrido ? `<br><span style="color:${m.aviso}">⏳ Se corrió ${esc(o.corrido)} ${o.corrido === 1 ? "día" : "días"} por el cupo de ${esc(p.cupo)} sets por día.</span>` : ""}
        </td></tr>
        <tr><td style="padding:4px 14px 10px"><table role="presentation" cellpadding="0" cellspacing="0">${items}</table></td></tr>
      </table></td></tr>`;
  };
  const stats = [{ valor: String(pedidos.length), etiqueta: pedidos.length === 1 ? "Pedido" : "Pedidos" }, { valor: totalSets + "/" + p.cupo, etiqueta: "Sets de hoy" }];
  const titulo = "Hoy toca entregar";
  const subject = `🚚 Hoy toca entregar: ${pedidos.length} ${pedidos.length === 1 ? "pedido" : "pedidos"} (${totalSets} ${totalSets === 1 ? "set" : "sets"}) · ${m.nombre}`;
  const boton = { texto: "Abrir pedidos", url: m.url };
  const html = layout(m, {
    titulo,
    preheader: `${pedidos.length} ${pedidos.length === 1 ? "pedido" : "pedidos"} para entregar hoy en ${m.nombre}.`,
    chip: { texto: "🚚 Entregas de hoy", color: m.ok },
    intro: `Ya cumplieron los 30 días de amistad. Estos son los sets que puedes enviar hoy (Steam deja <b>${esc(p.cupo)} sets por día</b>). Cuando entregues uno, márcalo como <b>entregado</b> en el panel de pedidos.`,
    stats,
    bloque: pedidos.length ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${pedidos.map(tarjeta).join("")}</table></td></tr>` : "",
    filas: [],
    boton,
    aviso: `Lo que pase de ${esc(p.cupo)} sets por día se corre automáticamente al día siguiente.`,
    pie: `Recordatorio automático de entregas de ${esc(m.nombre)}.`,
  });
  const lineas = pedidos.flatMap((o) => [`• ${o.cliente} (${o.code}) · Steam ${o.steam || "—"} · WhatsApp ${o.whatsapp || "—"}`, ...(o.items || []).map((it) => `   ${it.qty} × ${it.name}`)]);
  const text = aTexto(m, `${titulo}: ${pedidos.length} pedidos, ${totalSets}/${p.cupo} sets`, lineas, boton);
  return { from: m.remitente, subject, html, text };
}

module.exports = { MARCAS, confirmacion, recordatorio, pedidoNuevo, compraCliente, pedidoLiberado, itemLiberado, recordatorioEntregas };
