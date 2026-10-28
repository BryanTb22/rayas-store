"use strict";
/*
 * Envío de correos con Resend (https://resend.com).
 * El remitente de cada tienda (pedidos@rayas.trade / pedidos@litlejacob.trade) debe estar en un
 * dominio verificado en Resend; si no, Resend rechaza el envío.
 * Si el envío falla, el pago NO se pierde: los créditos ya se sumaron y el barrido programado reintenta.
 */
async function enviarCorreo(apiKey, { from, to, subject, html, text, clave }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + String(apiKey).trim(),
      "Content-Type": "application/json",
      "Idempotency-Key": clave // evita correos duplicados si se reintenta
    },
    body: JSON.stringify({ from: from, to: [to], subject: subject, html: html, text: text }),
    signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()).slice(0, 300));
}

module.exports = { enviarCorreo };
